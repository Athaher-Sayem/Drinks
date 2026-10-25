import uuid
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from tests.conftest import csrf, make_user


def add(client, quantity=2):
    result = client.put("/api/v1/cart/items/1", json={"quantity": quantity})
    assert result.status_code == 200, result.text


def order(client, data, key=None):
    return client.post(
        "/api/v1/orders", json=data, headers={"Idempotency-Key": str(key or uuid.uuid4())}
    )


def test_guest_checkout_snapshot_stock_totals_and_secure_lookup(guest, product, db, checkout):
    from app.models import Store, Variant

    db.get(Store, 1).tax_rate = Decimal("0.0825")
    db.commit()
    add(guest)
    quote = guest.post("/api/v1/checkout/quote", json=checkout)
    assert quote.status_code == 200
    assert quote.json()["total"] == "27.06"
    result = order(guest, checkout)
    assert result.status_code == 201, result.text
    receipt = result.json()
    assert receipt["status"] == "pending"
    assert receipt["total"] == "27.06"
    assert not any("payment" in key for key in receipt)
    assert receipt["lookup_token"]
    db.expire_all()
    assert db.get(Variant, 1).stock == 8
    assert guest.get("/api/v1/cart").json()["items"] == []
    product.name = "Renamed"
    variant = db.get(Variant, 1)
    variant.price = Decimal("99")
    db.commit()
    lookup = {"order_id": receipt["id"], "lookup_token": receipt["lookup_token"]}
    result = guest.post("/api/v1/orders/lookup", json=lookup)
    assert result.status_code == 200
    assert result.json()["items"][0]["product_name"] == "Canvas Tote"
    assert result.json()["items"][0]["unit_price"] == "12.50"
    assert "lookup_token" not in result.json()
    lookup["lookup_token"] = "wrong"
    assert guest.post("/api/v1/orders/lookup", json=lookup).status_code == 404


def test_retries_and_conflicting_idempotency_key(guest, product, db, checkout):
    from app.models import Order, Variant

    add(guest)
    key = uuid.uuid4()
    first = order(guest, checkout, key)
    second = order(guest, checkout, key)
    assert first.status_code == 201
    assert second.status_code == 200
    assert first.json() == second.json()
    assert db.scalar(select(func.count()).select_from(Order)) == 1
    assert db.get(Variant, 1).stock == 8
    assert order(guest, {**checkout, "notes": "Changed"}, key).status_code == 409


def test_checkout_retry_survives_login_merging_into_existing_account_cart(
    guest,
    product,
    db,
    checkout,
):
    from app.models import Cart, CartItem, Order, Variant

    user = make_user(db, "returning@example.com")
    saved_cart = Cart(user_id=user.id)
    db.add(saved_cart)
    db.flush()
    db.add(CartItem(cart_id=saved_cart.id, variant_id=1, quantity=3))
    db.commit()
    add(guest, 1)
    key = uuid.uuid4()
    first = order(guest, checkout, key)
    assert first.status_code == 201
    assert (
        guest.post(
            "/api/v1/auth/login",
            json={
                "email": user.email,
                "password": "A-strong-password-493!",
            },
        ).status_code
        == 200
    )
    csrf(guest)
    retried = order(guest, checkout, key)
    assert retried.status_code == 200
    assert retried.json()["id"] == first.json()["id"]
    assert guest.get("/api/v1/cart").json()["item_count"] == 3
    db.expire_all()
    assert db.get(Variant, 1).stock == 9
    assert db.scalar(select(func.count()).select_from(Order)) == 1


@pytest.mark.parametrize(
    "extra",
    [{"total": "0.01"}, {"user_id": 5}, {"status": "completed"}, {"payment_method": "card"}],
)
def test_checkout_rejects_mass_assignment(guest, product, checkout, extra):
    add(guest)
    assert order(guest, {**checkout, **extra}).status_code == 422


def test_checkout_requires_idempotency_and_nonempty_cart(guest, checkout):
    assert guest.post("/api/v1/orders", json=checkout).status_code == 422
    assert order(guest, checkout).status_code == 409


def test_stock_recheck_and_transaction_rollback(guest, product, db, checkout):
    from app.models import Order, Variant

    add(guest)
    db.get(Variant, 1).stock = 1
    db.commit()
    assert order(guest, checkout).status_code == 409
    assert db.scalar(select(func.count()).select_from(Order)) == 0
    assert guest.get("/api/v1/cart").json()["item_count"] == 2
    assert db.get(Variant, 1).stock == 1


def test_unconfigured_tax_blocks_checkout(guest, product, db, checkout):
    from app.models import Store

    db.get(Store, 1).tax_rate = None
    db.commit()
    add(guest)
    assert order(guest, checkout).status_code == 503


def test_email_length_rejected_before_database_write(guest, product, checkout):
    add(guest)
    checkout["email"] = "a" * 64 + "@" + "b" * 63 + "." + "c" * 63 + "." + "d" * 60 + ".com"
    assert order(guest, checkout).status_code == 422


def test_customer_history_is_private(customer, product, checkout, application, db):
    add(customer)
    receipt = order(customer, checkout).json()
    assert receipt["lookup_token"] is None
    assert customer.get("/api/v1/orders").json()["total"] == 1
    with TestClient(application) as another:
        assert another.get("/api/v1/orders").status_code == 401
        csrf(another)
        make_user(db, "other@example.com")
        another.post(
            "/api/v1/auth/login",
            json={
                "email": "other@example.com",
                "password": "A-strong-password-493!",
            },
        )
        assert another.get("/api/v1/orders").json()["total"] == 0
        assert another.get(f"/api/v1/orders/{receipt['id']}").status_code == 404
    assert (
        customer.patch(
            f"/api/v1/admin/orders/{receipt['id']}/status", json={"status": "completed"}
        ).status_code
        == 403
    )


def test_guest_cancellation_restores_inventory_once(guest, product, checkout, db):
    from app.models import OrderEvent, Variant

    add(guest)
    receipt = order(guest, checkout).json()
    url = f"/api/v1/orders/{receipt['id']}/cancel"
    assert guest.post(url, json={"lookup_token": "bad"}).status_code == 404
    for _ in range(2):
        assert guest.post(url, json={"lookup_token": receipt["lookup_token"]}).status_code == 200
    db.expire_all()
    assert db.get(Variant, 1).stock == 10
    assert db.scalar(select(func.count()).select_from(OrderEvent)) == 2


def test_staff_order_transitions_and_pickup_rules(admin, product, checkout):
    add(admin)
    receipt = order(admin, checkout).json()
    url = f"/api/v1/admin/orders/{receipt['id']}/status"
    assert admin.patch(url, json={"status": "completed"}).status_code == 409
    assert admin.patch(url, json={"status": "confirmed"}).status_code == 200
    assert admin.patch(url, json={"status": "processing"}).status_code == 200
    assert admin.patch(url, json={"status": "dispatched"}).status_code == 409
    assert admin.patch(url, json={"status": "ready"}).status_code == 200
    assert admin.patch(url, json={"status": "completed"}).status_code == 200
    assert admin.patch(url, json={"status": "cancelled"}).status_code == 409
    assert admin.get("/api/v1/admin/orders").json()["total"] == 1


def test_shipping_and_delivery_require_store_configuration(guest, product, db, checkout):
    from app.models import Store

    add(guest)
    checkout.update(
        fulfillment="shipping",
        address={
            "line1": "123 Main St",
            "city": "New York",
            "region": "NY",
            "postal_code": "10001",
        },
    )
    assert order(guest, checkout).status_code == 409
    store = db.get(Store, 1)
    store.shipping_enabled = True
    store.shipping_fee = Decimal("3.50")
    db.commit()
    result = order(guest, checkout)
    assert result.status_code == 201
    assert result.json()["fulfillment_fee"] == "3.50"
    assert result.json()["total"] == "28.50"
    add(guest, 1)
    checkout["fulfillment"] = "delivery"
    assert order(guest, checkout).status_code == 409
    store.delivery_postal_codes = ["10001"]
    store.delivery_fee = Decimal("2")
    db.commit()
    assert order(guest, checkout).json()["total"] == "14.50"


def test_inventory_adjustment_is_versioned_idempotent_and_audited(admin, product, db):
    from app.models import InventoryAdjustment, Variant

    url = "/api/v1/admin/variants/1/inventory-adjustments"
    key = str(uuid.uuid4())
    body = {"delta": -3, "expected_version": 1, "reason": "Damaged units"}
    for _ in range(2):
        response = admin.post(url, json=body, headers={"Idempotency-Key": key})
        assert response.status_code in (200, 201), response.text
    db.expire_all()
    assert db.get(Variant, 1).stock == 7
    assert db.scalar(select(func.count()).select_from(InventoryAdjustment)) == 1
    assert (
        admin.post(url, json={**body, "delta": -2}, headers={"Idempotency-Key": key}).status_code
        == 409
    )
    assert (
        admin.post(
            url,
            json={"delta": -99, "expected_version": 2, "reason": "Invalid"},
            headers={"Idempotency-Key": str(uuid.uuid4())},
        ).status_code
        == 409
    )


def test_stale_staff_edit_cannot_overwrite_checkout_inventory(admin, product, checkout, db):
    from app.models import Variant

    add(admin)
    assert order(admin, checkout).status_code == 201
    assert (
        admin.patch(
            "/api/v1/admin/variants/1",
            json={
                "expected_version": 1,
                "name": "Stale edit",
            },
        ).status_code
        == 409
    )
    assert (
        admin.patch(
            "/api/v1/admin/variants/1",
            json={
                "expected_version": 2,
                "name": "Updated label",
            },
        ).status_code
        == 200
    )
    db.expire_all()
    assert db.get(Variant, 1).stock == 8
    assert (
        admin.patch(
            "/api/v1/admin/variants/1",
            json={
                "expected_version": 3,
                "stock": 999,
            },
        ).status_code
        == 422
    )


def test_currency_cannot_reinterpret_existing_prices(admin, product):
    assert admin.patch("/api/v1/admin/store", json={"currency": "EUR"}).status_code == 409


def test_non_ascii_lookup_token_is_a_safe_not_found_response(guest, product, checkout):
    add(guest, 1)
    receipt = order(guest, checkout).json()
    result = guest.post(
        "/api/v1/orders/lookup",
        json={
            "order_id": receipt["id"],
            "lookup_token": "é",
        },
    )
    assert result.status_code == 404
