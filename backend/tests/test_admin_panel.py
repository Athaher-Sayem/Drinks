from decimal import Decimal
from uuid import uuid4

from app.models import Category, Variant
from tests.conftest import csrf, make_user


def test_staff_reads_include_inactive_categories_and_require_permission(guest, db, product):
    assert guest.get("/api/v1/admin/categories").status_code == 401
    make_user(db, "shopper@example.com")
    guest.post(
        "/api/v1/auth/login",
        json={"email": "shopper@example.com", "password": "A-strong-password-493!"},
    )
    csrf(guest)
    assert guest.get("/api/v1/admin/categories").status_code == 403
    guest.post("/api/v1/auth/logout")
    csrf(guest)
    make_user(db, "staff@example.com", "staff")
    guest.post(
        "/api/v1/auth/login",
        json={"email": "staff@example.com", "password": "A-strong-password-493!"},
    )
    csrf(guest)
    db.add(Category(name="Hidden", slug="hidden", active=False))
    db.commit()
    categories = guest.get("/api/v1/admin/categories").json()
    assert categories["total"] == 2
    assert any(not item["active"] for item in categories["items"])
    assert guest.patch("/api/v1/admin/store", json={"name": "Unauthorized"}).status_code == 403


def test_admin_product_filters_and_pagination(admin, db, product):
    assert admin.get("/api/v1/admin/products?search=missing").json()["total"] == 0
    assert admin.get("/api/v1/admin/products?search=canvas").json()["total"] == 1
    assert admin.get("/api/v1/admin/products?active=false").json()["total"] == 0
    assert admin.get("/api/v1/admin/products?category_id=9999").json()["total"] == 0
    assert admin.get("/api/v1/admin/products?low_stock=true").json()["total"] == 0
    variant = db.get(Variant, product.variants[0].id)
    variant.stock = 3
    variant.price = Decimal("12.50")
    db.commit()
    assert admin.get("/api/v1/admin/products?low_stock=true&limit=1").json()["total"] == 1


def test_overview_counts_are_real_and_protected(admin, db, product):
    response = admin.get("/api/v1/admin/overview")
    assert response.status_code == 200
    assert response.json() == {
        "products": 1,
        "active_products": 1,
        "categories": 1,
        "pending_orders": 0,
        "open_orders": 0,
        "low_stock_variants": 0,
    }
    product.active = False
    product.variants[0].stock = 0
    db.commit()
    result = admin.get("/api/v1/admin/overview").json()
    assert result["active_products"] == 0
    assert result["low_stock_variants"] == 0


def test_inventory_stale_version_proves_the_original_key_was_not_applied(admin, product):
    url = f"/api/v1/admin/variants/{product.variants[0].id}/inventory-adjustments"
    body = {"delta": 1, "expected_version": 1, "reason": "Shipment"}
    first_key = str(uuid4())
    first = admin.post(url, headers={"Idempotency-Key": first_key}, json=body)
    assert first.status_code == 201
    stale = admin.post(url, headers={"Idempotency-Key": str(uuid4())}, json=body)
    assert stale.status_code == 409
    assert stale.headers.get("X-Inventory-Outcome") == "not-applied-stale-version"
    replay = admin.post(url, headers={"Idempotency-Key": first_key}, json=body)
    assert replay.status_code == 200
    assert "X-Inventory-Outcome" not in replay.headers
