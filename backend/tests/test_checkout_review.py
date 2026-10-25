from decimal import Decimal
from uuid import uuid4

import pytest

from app.models import Variant


@pytest.mark.parametrize("change", ["quantity", "price"])
def test_checkout_rejects_changes_to_reviewed_quote(guest, product, checkout, db, change):
    variant = product.variants[0]
    guest.put(f"/api/v1/cart/items/{variant.id}", json={"quantity": 1})
    quote = guest.post("/api/v1/checkout/quote", json=checkout).json()
    assert "quote_token" in quote
    if change == "quantity":
        guest.put(f"/api/v1/cart/items/{variant.id}", json={"quantity": 2})
    else:
        db.get(Variant, variant.id).price = Decimal("15.00")
        db.commit()
    response = guest.post(
        "/api/v1/orders",
        json={**checkout, "quote_token": quote["quote_token"]},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert response.status_code == 409
    assert "review" in response.json()["detail"].lower()
    assert guest.get("/api/v1/cart").json()["item_count"] > 0


def test_reviewed_checkout_replays_before_checking_empty_cart(guest, product, checkout):
    guest.put(f"/api/v1/cart/items/{product.variants[0].id}", json={"quantity": 1})
    quote = guest.post("/api/v1/checkout/quote", json=checkout).json()
    assert "quote_token" in quote
    payload = {**checkout, "quote_token": quote["quote_token"]}
    headers = {"Idempotency-Key": str(uuid4())}
    first = guest.post("/api/v1/orders", json=payload, headers=headers)
    assert first.status_code == 201
    replay = guest.post("/api/v1/orders", json=payload, headers=headers)
    assert replay.status_code == 200
    assert replay.json()["id"] == first.json()["id"]
