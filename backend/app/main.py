from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import DatabaseError, IntegrityError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.orm.exc import StaleDataError
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .config import Settings
from .database import Db, make_engine
from .middleware import BodyLimitMiddleware
from .routers import auth, cart, catalog, orders


def create_app(settings: Settings | None = None):
    settings = settings or Settings()
    engine = make_engine(settings.database_url)

    @asynccontextmanager
    async def lifespan(app):
        yield
        engine.dispose()

    app = FastAPI(
        title="Reusable Store API",
        version="1.0.0",
        lifespan=lifespan,
        description="One independent store per deployment. Payments are not enabled.",
    )
    app.state.settings = settings
    app.state.engine = engine
    app.state.session_factory = sessionmaker(engine, expire_on_commit=False)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_hosts)
    app.add_middleware(BodyLimitMiddleware, max_bytes=settings.max_body_bytes)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Content-Type", "X-CSRF-Token", "Idempotency-Key"],
    )

    @app.middleware("http")
    async def private_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        return response

    @app.exception_handler(IntegrityError)
    async def constraint_error(request, exc):
        return JSONResponse(
            status_code=409, content={"detail": "A unique or data constraint conflicts."}
        )

    @app.exception_handler(StaleDataError)
    async def stale_update(request, exc):
        return JSONResponse(status_code=409, content={"detail": "Data changed; reload and retry."})

    @app.exception_handler(DatabaseError)
    async def database_unavailable(request, exc):
        # Never return SQL, connection strings, or SQLAlchemy's bound request parameters.
        return JSONResponse(status_code=503, content={"detail": "Database service unavailable."})

    @app.exception_handler(RequestValidationError)
    async def invalid_request(request, exc):
        # Pydantic errors may contain the submitted password or lookup token in 'input'.
        return JSONResponse(
            status_code=422,
            content={
                "detail": [
                    {"loc": error["loc"], "msg": error["msg"], "type": error["type"]}
                    for error in exc.errors()
                ]
            },
        )

    @app.get("/api/v1/health", tags=["Operations"])
    def health(db: Db) -> dict[str, str | bool]:
        try:
            db.execute(text("SELECT 1"))
        except DatabaseError:
            return JSONResponse(status_code=503, content={"status": "unavailable"})
        return {"status": "ok", "payments_enabled": False}

    for router in [auth.router, catalog.router, cart.router, orders.router]:
        app.include_router(router, prefix="/api/v1")
    return app
