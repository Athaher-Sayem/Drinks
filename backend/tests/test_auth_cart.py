import pytest
from fastapi.testclient import TestClient

from tests.conftest import csrf, make_user


def test_csrf_required_even_for_guest_writes(client, product):
    assert (
        client.post(
            "/api/v1/auth/login", json={"email": "a@example.com", "password": "x"}
        ).status_code
        == 403
    )
    client.get("/api/v1/session")
    assert client.put("/api/v1/cart/items/1", json={"quantity": 1}).status_code == 403
    csrf(client)
    assert client.put("/api/v1/cart/items/1", json={"quantity": 1}).status_code == 200
    assert (
        client.put(
            "/api/v1/cart/items/1",
            json={"quantity": 1},
            headers={"Origin": "https://untrusted.example"},
        ).status_code
        == 403
    )


def test_non_ascii_csrf_header_is_rejected_safely(guest, product):
    result = guest.put(
        "/api/v1/cart/items/1", json={"quantity": 1}, headers={b"X-CSRF-Token": b"\xe9"}
    )
    assert result.status_code == 403


def test_registration_profile_logout_and_cookie_rotation(guest):
    old_cookie = guest.cookies.get("store_session")
    payload = {"email": "Alex@Example.com", "password": "My-long-password-2026!", "name": "Alex"}
    result = guest.post("/api/v1/auth/register", json=payload)
    assert result.status_code == 201
    assert result.json()["role"] == "customer"
    assert "password" not in str(result.json())
    assert guest.post("/api/v1/auth/register", json=payload).status_code == 409
    assert (
        guest.post(
            "/api/v1/auth/login",
            json={
                "email": payload["email"],
                "password": payload["password"],
            },
        ).status_code
        == 200
    )
    assert guest.cookies.get("store_session") != old_cookie
    # Login rotates CSRF; stale token must not authorize further writes.
    assert guest.patch("/api/v1/auth/me", json={"name": "Changed"}).status_code == 403
    csrf(guest)
    assert guest.get("/api/v1/auth/me").json()["email"] == "alex@example.com"
    assert guest.patch("/api/v1/auth/me", json={"name": "Changed"}).status_code == 200
    assert (
        guest.patch("/api/v1/auth/me", json={"name": "Changed", "role": "admin"}).status_code == 422
    )
    assert guest.post("/api/v1/auth/logout").status_code == 204
    assert guest.get("/api/v1/auth/me").status_code == 401


def test_login_errors_do_not_reveal_account_existence(guest):
    for email in ["missing@example.com", "another@example.com"]:
        result = guest.post("/api/v1/auth/login", json={"email": email, "password": "wrong"})
        assert result.status_code == 401
        assert result.json()["detail"] == "Invalid email or password."


def test_auth_rate_limit_is_shared_database_state(guest):
    for _ in range(10):
        assert (
            guest.post(
                "/api/v1/auth/login",
                json={
                    "email": "missing@example.com",
                    "password": "wrong",
                },
            ).status_code
            == 401
        )
    result = guest.post(
        "/api/v1/auth/login", json={"email": "missing@example.com", "password": "wrong"}
    )
    assert result.status_code == 429
    assert result.headers["retry-after"] == "60"


@pytest.mark.parametrize(
    "payload",
    [
        {"email": "bad", "password": "My-long-password-2026!", "name": "Alex"},
        {"email": "a@example.com", "password": "tiny", "name": "Alex"},
        {"email": "a@example.com", "password": "123456789012", "name": "Alex"},
        {
            "email": "a@example.com",
            "password": "My-long-password-2026!",
            "name": "Alex",
            "role": "admin",
        },
    ],
)
def test_invalid_registration_and_mass_assignment_rejected(guest, payload):
    result = guest.post("/api/v1/auth/register", json=payload)
    assert result.status_code == 422
    assert payload["password"] not in result.text


def test_cart_quantity_persistence_isolation_removal_and_reprice(guest, product, db, application):
    from app.models import Variant

    assert guest.get("/api/v1/cart").json()["subtotal"] == "0.00"
    for _ in range(2):
        result = guest.put("/api/v1/cart/items/1", json={"quantity": 2})
        assert result.json()["subtotal"] == "25.00"
        assert result.json()["item_count"] == 2
    with TestClient(application) as another:
        assert another.get("/api/v1/cart").json()["items"] == []
    variant = db.get(Variant, 1)
    variant.price = "15.00"
    db.commit()
    assert guest.get("/api/v1/cart").json()["subtotal"] == "30.00"
    assert guest.delete("/api/v1/cart/items/1").status_code == 204
    assert guest.get("/api/v1/cart").json()["items"] == []


@pytest.mark.parametrize("quantity", [0, -1, 100, True, "2", 1.5])
def test_invalid_quantities(guest, product, quantity):
    assert guest.put("/api/v1/cart/items/1", json={"quantity": quantity}).status_code == 422


def test_insufficient_stock_and_inactive_products(guest, product, db):
    assert guest.put("/api/v1/cart/items/1", json={"quantity": 11}).status_code == 409
    product.active = False
    db.commit()
    assert guest.put("/api/v1/cart/items/1", json={"quantity": 1}).status_code == 404


def test_cart_survives_login_across_sessions_and_logout_isolates(guest, product, db, application):
    make_user(db, "customer@example.com")
    guest.put("/api/v1/cart/items/1", json={"quantity": 2})
    assert (
        guest.post(
            "/api/v1/auth/login",
            json={
                "email": "customer@example.com",
                "password": "A-strong-password-493!",
            },
        ).status_code
        == 200
    )
    csrf(guest)
    assert guest.get("/api/v1/cart").json()["item_count"] == 2
    with TestClient(application) as another:
        csrf(another)
        another.put("/api/v1/cart/items/1", json={"quantity": 1})
        assert (
            another.post(
                "/api/v1/auth/login",
                json={
                    "email": "customer@example.com",
                    "password": "A-strong-password-493!",
                },
            ).status_code
            == 200
        )
        assert another.get("/api/v1/cart").json()["item_count"] == 3
    guest.post("/api/v1/auth/logout")
    assert guest.get("/api/v1/cart").json()["items"] == []


def test_cart_merge_capacity_is_transactionally_enforced(guest, db):
    from app.models import BrowserSession, Cart, CartItem, Category, Product, Variant

    user = make_user(db, "full@example.com")
    category = Category(name="Bulk", slug="bulk")
    db.add(category)
    db.flush()
    product = Product(name="Bulk", slug="bulk", category_id=category.id)
    account_cart = Cart(user_id=user.id)
    db.add_all([product, account_cart])
    db.flush()
    for index in range(101):
        variant = Variant(
            product_id=product.id, name=str(index), sku=f"BULK-{index}", price="1.00", stock=5
        )
        db.add(variant)
        db.flush()
        if index < 100:
            db.add(CartItem(cart_id=account_cart.id, variant_id=variant.id, quantity=1))
    db.commit()
    assert guest.put("/api/v1/cart/items/101", json={"quantity": 1}).status_code == 200
    result = guest.post(
        "/api/v1/auth/login",
        json={
            "email": user.email,
            "password": "A-strong-password-493!",
        },
    )
    assert result.status_code == 409
    db.expire_all()
    assert len(db.get(Cart, account_cart.id).items) == 100
    assert guest.get("/api/v1/cart").json()["item_count"] == 1
    assert all(session.user_id is None for session in db.query(BrowserSession).all())
