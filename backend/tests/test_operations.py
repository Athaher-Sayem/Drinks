import subprocess
import sys
from pathlib import Path

import pytest
from pydantic import ValidationError
from sqlalchemy import create_engine, inspect


def test_production_requires_secure_explicit_settings():
    from app.config import Settings

    for changes in [
        {},
        {"database_url": "postgresql+psycopg://u:p@localhost/store"},
        {
            "database_url": "postgresql+psycopg://u:p@localhost/store",
            "secret_key": "s" * 64,
            "allowed_hosts": ["*"],
        },
        {
            "database_url": "postgresql+psycopg://u:p@localhost/store",
            "secret_key": "s" * 64,
            "allowed_hosts": ["api.example.com"],
            "allowed_origins": ["http://example.com"],
        },
    ]:
        with pytest.raises(ValidationError):
            Settings(environment="production", _env_file=None, **changes)
    settings = Settings(
        environment="production",
        _env_file=None,
        database_url="postgresql+psycopg://u:p@localhost/store",
        secret_key="s" * 64,
        allowed_hosts=["api.example.com"],
        allowed_origins=["https://example.com"],
    )
    assert settings.environment == "production"


def test_separate_deployments_keep_settings_and_data_isolated(client, product, tmp_path):
    from fastapi.testclient import TestClient

    from app.config import Settings
    from app.database import Base
    from app.main import create_app
    from app.models import Store

    app = create_app(Settings(database_url=f"sqlite:///{tmp_path / 'other.db'}"))
    Base.metadata.create_all(app.state.engine)
    with app.state.session_factory.begin() as db:
        db.add(Store(id=1, name="Independent Clothing Store", currency="GBP"))
    with TestClient(app) as other:
        assert other.get("/api/v1/store").json()["name"] == "Independent Clothing Store"
        assert other.get("/api/v1/products").json()["total"] == 0
    assert client.get("/api/v1/store").json()["name"] == "Test Store"
    assert client.get("/api/v1/products").json()["total"] == 1


def test_alembic_migration_upgrade_check_and_local_empty_database_downgrade(tmp_path, monkeypatch):
    # This is a fresh, isolated test database. Never downgrade a live store database.
    path = tmp_path / "migrations.db"
    monkeypatch.setenv("STORE_DATABASE_URL", f"sqlite:///{path}")
    backend = Path(__file__).resolve().parents[1]
    for args in [("upgrade", "head"), ("check",)]:
        result = subprocess.run(
            [sys.executable, "-m", "alembic", *args], cwd=backend, capture_output=True, text=True
        )
        assert result.returncode == 0, result.stdout + result.stderr
    engine = create_engine(f"sqlite:///{path}")
    assert "orders" in inspect(engine).get_table_names()
    engine.dispose()
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "downgrade", "base"],
        cwd=backend,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    engine = create_engine(f"sqlite:///{path}")
    assert "orders" not in inspect(engine).get_table_names()
    engine.dispose()


def test_body_limit_including_streamed_body(client):
    body = b"x" * (1_048_576 + 1)
    assert client.post("/api/v1/auth/login", content=body).status_code == 413
    assert (
        client.post("/api/v1/auth/login", content=iter([body[:500000], body[500000:]])).status_code
        == 413
    )


def test_private_cache_headers_and_cors(client):
    result = client.get("/api/v1/session", headers={"Origin": "http://testserver"})
    assert result.headers["cache-control"] == "no-store"
    assert result.headers["access-control-allow-origin"] == "http://testserver"
    result = client.get("/api/v1/session", headers={"Origin": "https://other.example"})
    assert "access-control-allow-origin" not in result.headers


def test_store_settings_boundaries(admin):
    for body in [
        {"tax_rate": "NaN"},
        {"tax_rate": "1.01"},
        {"timezone": "Not/AZone"},
        {"name": None},
        {"currency": "JPY"},
        {"delivery_fee": "-1.00"},
    ]:
        assert admin.patch("/api/v1/admin/store", json=body).status_code == 422
