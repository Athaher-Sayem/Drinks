from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session


@pytest.fixture
def application(tmp_path):
    from app.config import Settings
    from app.database import Base
    from app.main import create_app

    settings = Settings(
        database_url=f"sqlite:///{tmp_path / 'test.db'}",
        secret_key="test-only-key-" * 5,
        allowed_origins=["http://testserver"],
    )
    app = create_app(settings)
    Base.metadata.create_all(app.state.engine)
    with app.state.session_factory() as db:
        from app.models import Store

        db.add(Store(id=1, name="Test Store", tax_rate=Decimal("0")))
        db.commit()
    yield app
    app.state.engine.dispose()


@pytest.fixture
def client(application):
    with TestClient(application) as client:
        yield client


@pytest.fixture
def db(application):
    with application.state.session_factory() as db:
        yield db


def csrf(client):
    token = client.get("/api/v1/session").json()["csrf_token"]
    client.headers["X-CSRF-Token"] = token
    return client


@pytest.fixture
def guest(client):
    return csrf(client)


def make_user(db: Session, email, role="customer"):
    from app.models import User
    from app.security import password_hash

    user = User(
        email=email,
        name="Test Customer",
        role=role,
        password_hash=password_hash.hash("A-strong-password-493!"),
    )
    db.add(user)
    db.commit()
    return user


@pytest.fixture
def customer(guest, db):
    make_user(db, "customer@example.com")
    result = guest.post(
        "/api/v1/auth/login",
        json={
            "email": "customer@example.com",
            "password": "A-strong-password-493!",
        },
    )
    assert result.status_code == 200, result.text
    return csrf(guest)


@pytest.fixture
def admin(guest, db):
    make_user(db, "owner@example.com", role="admin")
    result = guest.post(
        "/api/v1/auth/login",
        json={
            "email": "owner@example.com",
            "password": "A-strong-password-493!",
        },
    )
    assert result.status_code == 200, result.text
    return csrf(guest)


@pytest.fixture
def product(db):
    from app.models import Category, Product, Variant

    category = Category(name="Everyday", slug="everyday")
    db.add(category)
    db.flush()
    product = Product(
        name="Canvas Tote",
        slug="canvas-tote",
        category_id=category.id,
        attributes={"material": "cotton"},
    )
    db.add(product)
    db.flush()
    db.add(
        Variant(
            product_id=product.id,
            name="Natural",
            sku="TOTE-NAT",
            price=Decimal("12.50"),
            stock=10,
            options={"color": "natural"},
        )
    )
    db.commit()
    return product


@pytest.fixture
def checkout():
    return {
        "customer_name": "Alex",
        "email": "alex@example.com",
        "phone": "+12025550142",
        "fulfillment": "pickup",
    }
