import hashlib
import hmac
import secrets
import time
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, Response
from pwdlib import PasswordHash
from sqlalchemy import select

from .database import Db
from .models import BrowserSession, Cart, RateLimit, User

password_hash = PasswordHash.recommended()
DUMMY_HASH = password_hash.hash(secrets.token_urlsafe(32))


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def limit(request, scope, maximum=120):
    """Database-backed windows shared by workers; never trust forwarded client IP headers."""
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    from sqlalchemy.dialects.sqlite import insert as sqlite_insert

    ip = request.client.host if request.client else "unknown"
    key = hmac.new(
        request.app.state.settings.secret_key.encode(), f"{scope}:{ip}".encode(), hashlib.sha256
    ).hexdigest()
    bucket = int(time.time()) // 60
    with request.app.state.session_factory.begin() as db:
        insert = pg_insert if db.bind.dialect.name == "postgresql" else sqlite_insert
        statement = insert(RateLimit).values(key=key, bucket=bucket, count=1)
        statement = statement.on_conflict_do_update(
            index_elements=[RateLimit.key, RateLimit.bucket],
            set_={"count": RateLimit.count + 1},
        ).returning(RateLimit.count)
        count = db.scalar(statement)
    if count > maximum:
        raise HTTPException(429, "Too many requests. Retry shortly.", headers={"Retry-After": "60"})


def find_session(request, db):
    token = request.cookies.get(request.app.state.settings.cookie_name)
    if not token or len(token) > 128:
        return None
    session = db.scalar(
        select(BrowserSession).where(
            BrowserSession.token_hash == digest(token),
            BrowserSession.expires_at > int(time.time()),
        )
    )
    if session and session.user_id and (session.user is None or not session.user.active):
        return None
    return session


def set_cookie(response, settings, token):
    response.set_cookie(
        settings.cookie_name,
        token,
        httponly=True,
        samesite="lax",
        secure=settings.environment == "production",
        max_age=settings.session_days * 86400,
        path="/",
    )


def rotate_session(session, response, settings):
    token = secrets.token_urlsafe(32)
    session.token_hash = digest(token)
    session.csrf_token = secrets.token_urlsafe(32)
    session.expires_at = int(time.time()) + settings.session_days * 86400
    set_cookie(response, settings, token)


def ensure_session(request: Request, response: Response, db: Db):
    session = find_session(request, db)
    if session:
        return session
    cart = Cart()
    db.add(cart)
    db.flush()
    session = BrowserSession(cart_id=cart.id, token_hash="", csrf_token="")
    rotate_session(session, response, request.app.state.settings)
    db.add(session)
    db.commit()
    return session


def csrf_session(request: Request, db: Db, x_csrf_token: Annotated[str | None, Header()] = None):
    limit(request, "writes")
    session = find_session(request, db)
    if (
        session is None
        or not x_csrf_token
        or len(x_csrf_token) > 128
        or not x_csrf_token.isascii()
        or not hmac.compare_digest(session.csrf_token, x_csrf_token)
    ):
        raise HTTPException(403, "Initialize GET /api/v1/session and supply its X-CSRF-Token.")
    origin = request.headers.get("origin")
    own_origin = str(request.base_url).rstrip("/")
    if origin and origin not in [own_origin, *request.app.state.settings.allowed_origins]:
        raise HTTPException(403, "Untrusted request origin.")
    return session


def current_user(request: Request, db: Db):
    session = find_session(request, db)
    if session is None or session.user_id is None:
        raise HTTPException(401, "Authentication required.")
    return session.user


def staff_user(user: Annotated[User, Depends(current_user)]):
    if user.role not in {"staff", "admin"}:
        raise HTTPException(403, "Staff access required.")
    return user


def admin_user(user: Annotated[User, Depends(staff_user)]):
    if user.role != "admin":
        raise HTTPException(403, "Store owner access required.")
    return user


Browser = Annotated[BrowserSession, Depends(ensure_session)]
Csrf = Annotated[BrowserSession, Depends(csrf_session)]
Customer = Annotated[User, Depends(current_user)]
Staff = Annotated[User, Depends(staff_user)]
Admin = Annotated[User, Depends(admin_user)]
