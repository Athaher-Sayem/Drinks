"""Loopback-only disposable browser-test API. Never uses the configured store database."""

import sys
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import uvicorn  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.cli import seed_demo  # noqa: E402
from app.config import Settings  # noqa: E402
from app.database import Base  # noqa: E402
from app.main import create_app  # noqa: E402
from app.models import User  # noqa: E402
from app.security import password_hash  # noqa: E402


def main():
    with TemporaryDirectory(prefix="store-admin-e2e-") as directory:
        settings = Settings(
            _env_file=None,
            environment="development",
            database_url=f"sqlite:///{Path(directory) / 'e2e.db'}",
            secret_key="disposable-browser-fixture-only-" * 3,
            allowed_origins=["http://127.0.0.1:5175"],
            cookie_name="store_admin_e2e",
        )
        app = create_app(settings)
        Base.metadata.create_all(app.state.engine)
        with app.state.session_factory() as db:
            seed_demo(db, settings)
            for role, name in [
                ("admin", "Test Owner"),
                ("staff", "Test Staff"),
                ("customer", "Test Shopper"),
            ]:
                db.add(
                    User(
                        name=name,
                        email=f"{role}@e2e.example.com",
                        role=role,
                        password_hash=password_hash.hash("E2e-only-passphrase-493!"),
                    )
                )
            db.commit()
        with TestClient(app) as client:
            token = client.get("/api/v1/session").json()["csrf_token"]
            client.headers["X-CSRF-Token"] = token
            client.put("/api/v1/cart/items/1", json={"quantity": 1})
            response = client.post(
                "/api/v1/orders",
                headers={"Idempotency-Key": str(uuid4())},
                json={
                    "customer_name": "Fixture Guest",
                    "email": "guest@e2e.example.com",
                    "phone": "+12025550142",
                    "fulfillment": "pickup",
                },
            )
            assert response.status_code == 201
        uvicorn.run(app, host="127.0.0.1", port=8002, access_log=False, proxy_headers=False)
        app.state.engine.dispose()


if __name__ == "__main__":
    main()
