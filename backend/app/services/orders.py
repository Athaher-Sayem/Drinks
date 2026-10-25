import hashlib
import hmac
import json
import re
from decimal import ROUND_HALF_UP, Decimal

from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.orm import selectinload

from ..models import CartItem, InventoryAdjustment, Order, OrderEvent, OrderItem, Variant
from .carts import available, cart_items, get_store, lock_cart

CENT = Decimal("0.01")


def request_hash(data):
    return hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()


def guest_token(order, settings):
    return hmac.new(
        settings.secret_key.encode(), f"guest-order:{order.id}".encode(), hashlib.sha256
    ).hexdigest()


def load_order(db, order_id):
    return db.scalar(
        select(Order)
        .where(Order.id == str(order_id))
        .options(selectinload(Order.items), selectinload(Order.events))
    )


def authorized_order(db, session, order_id, settings, token=""):
    order = load_order(db, order_id)
    if order:
        user = session.user
        if user and (user.role in {"staff", "admin"} or order.user_id == user.id):
            return order
        if (
            order.user_id is None
            and token
            and token.isascii()
            and hmac.compare_digest(guest_token(order, settings), token)
        ):
            return order
    raise HTTPException(404, "Order not found.")


def quote_cart(db, cart_id, payload, *, lock=False):
    store = get_store(db)
    if store.tax_rate is None:
        raise HTTPException(
            503, "The owner must configure the store tax rate before accepting orders."
        )
    if payload.fulfillment == "pickup":
        if not store.pickup_enabled:
            raise HTTPException(409, "Pickup is not enabled.")
        fee = Decimal("0.00")
    else:
        address = payload.address
        if address.country != store.country:
            raise HTTPException(
                422, "This store fulfills orders only within its configured country."
            )
        if address.country == "US" and not re.fullmatch(
            r"[0-9]{5}(?:-[0-9]{4})?", address.postal_code
        ):
            raise HTTPException(422, "Enter a valid US ZIP code.")
        if payload.fulfillment == "shipping":
            if not store.shipping_enabled:
                raise HTTPException(409, "Shipping is not enabled.")
            fee = store.shipping_fee
        else:
            if address.postal_code not in store.delivery_postal_codes:
                raise HTTPException(409, "Local delivery is not available for this postal code.")
            fee = store.delivery_fee
    items = cart_items(db, cart_id)
    if not items:
        raise HTTPException(409, "Your cart is empty.")
    statement = select(Variant).where(Variant.id.in_([item.variant_id for item in items]))
    statement = statement.order_by(Variant.id).execution_options(populate_existing=True)
    if lock:
        statement = statement.with_for_update()
    variants = {variant.id: variant for variant in db.scalars(statement)}
    subtotal = Decimal("0.00")
    for item in items:
        variant = variants[item.variant_id]
        if not available(variant) or variant.stock < item.quantity:
            raise HTTPException(409, "A cart item is unavailable or has insufficient inventory.")
        subtotal += variant.price * item.quantity
    taxable = subtotal + (fee if store.tax_fulfillment_fee else Decimal("0"))
    tax = (taxable * store.tax_rate).quantize(CENT, rounding=ROUND_HALF_UP)
    return (
        items,
        variants,
        {
            "subtotal": subtotal,
            "tax": tax,
            "tax_rate": store.tax_rate,
            "fulfillment_fee": fee,
            "total": subtotal + tax + fee,
            "currency": store.currency,
        },
    )


def place_order(db, session, payload, key):
    cart = lock_cart(db, session.cart_id)
    data = payload.model_dump(mode="json", exclude={"quote_token"})
    hashed = request_hash(data)
    existing = db.scalar(
        select(Order).where(
            Order.checkout_scope == session.id,
            Order.idempotency_key == str(key),
        )
    )
    if existing:
        if existing.request_hash != hashed:
            raise HTTPException(409, "Idempotency key was already used for a different request.")
        return existing, False
    items, variants, amounts = quote_cart(db, cart.id, payload, lock=True)
    if payload.quote_token is not None and not hmac.compare_digest(
        payload.quote_token, quote_token(cart.id, payload, items, variants, amounts)
    ):
        raise HTTPException(409, "Your bag or prices changed. Please review your order again.")
    order = Order(
        cart_id=cart.id,
        user_id=session.user_id,
        idempotency_key=str(key),
        checkout_scope=session.id,
        request_hash=hashed,
        **data,
        **amounts,
        items=[],
        events=[],
    )
    db.add(order)
    db.flush()
    for item in items:
        variant = variants[item.variant_id]
        order.items.append(
            OrderItem(
                variant_id=variant.id,
                product_name=variant.product.name,
                variant_name=variant.name,
                sku=variant.sku,
                options=variant.options,
                quantity=item.quantity,
                unit_price=variant.price,
                line_total=variant.price * item.quantity,
            )
        )
        variant.stock -= (
            item.quantity
        )  # ORM version counter also changes on every inventory mutation.
    order.events.append(OrderEvent(status="pending", actor_id=session.user_id))
    db.execute(delete(CartItem).where(CartItem.cart_id == cart.id))
    db.flush()
    return order, True


def quote_token(cart_id, payload, items, variants, amounts):
    """An equality guard for reviewed contents, not an authorization credential."""
    return request_hash(
        {
            "cart_id": cart_id,
            "fulfillment": payload.fulfillment,
            "amounts": {key: str(value) for key, value in amounts.items()},
            "items": [
                {
                    "id": item.variant_id,
                    "quantity": item.quantity,
                    "price": str(variants[item.variant_id].price),
                    "name": variants[item.variant_id].name,
                    "product": variants[item.variant_id].product.name,
                    "sku": variants[item.variant_id].sku,
                    "options": variants[item.variant_id].options,
                }
                for item in sorted(items, key=lambda item: item.variant_id)
            ],
        }
    )


TRANSITIONS = {
    "pending": {"confirmed", "cancelled"},
    "confirmed": {"processing", "cancelled"},
    "processing": {"ready", "dispatched", "cancelled"},
    "ready": {"completed", "cancelled"},
    "dispatched": {"completed"},
}


def transition(db, order, status, actor, *, customer_cancel=False):
    order = db.scalar(
        select(Order)
        .where(Order.id == order.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if order.status == status:
        return order
    if customer_cancel and order.status != "pending":
        raise HTTPException(409, "Customers can cancel only pending orders.")
    if status not in TRANSITIONS.get(order.status, set()):
        raise HTTPException(409, "This order status transition is not allowed.")
    if status == "ready" and order.fulfillment != "pickup":
        raise HTTPException(409, "Ready status is only for pickup orders.")
    if status == "dispatched" and order.fulfillment == "pickup":
        raise HTTPException(409, "Pickup orders cannot be dispatched.")
    if status == "cancelled":
        quantities = {item.variant_id: item.quantity for item in order.items}
        variants = db.scalars(
            select(Variant)
            .where(Variant.id.in_(quantities))
            .order_by(Variant.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        for variant in variants:
            variant.stock += quantities[variant.id]
    order.status = status
    order.events.append(OrderEvent(status=status, actor_id=actor.id if actor else None))
    db.flush()
    return order


def adjust_inventory(db, variant_id, actor, payload, key):
    variant = db.scalar(select(Variant).where(Variant.id == variant_id).with_for_update())
    if variant is None:
        raise HTTPException(404, "Variant not found.")
    hashed = request_hash(payload.model_dump())
    existing = db.scalar(
        select(InventoryAdjustment).where(
            InventoryAdjustment.variant_id == variant_id,
            InventoryAdjustment.idempotency_key == str(key),
        )
    )
    if existing:
        if existing.request_hash != hashed:
            raise HTTPException(409, "Idempotency key was already used for a different request.")
        return existing, variant, False
    if variant.version != payload.expected_version:
        # Versions increase monotonically. After the key lookup, this proves the old
        # request did not apply and can no longer apply, even if it arrives late.
        raise HTTPException(
            409,
            "Inventory changed; this adjustment was not applied. Close and reopen to reload stock.",
            headers={"X-Inventory-Outcome": "not-applied-stale-version"},
        )
    if not 0 <= variant.stock + payload.delta <= 2_000_000_000:
        raise HTTPException(409, "Inventory adjustment would exceed allowed stock bounds.")
    variant.stock += payload.delta
    adjustment = InventoryAdjustment(
        variant_id=variant_id,
        actor_id=actor.id,
        idempotency_key=str(key),
        request_hash=hashed,
        delta=payload.delta,
        reason=payload.reason,
    )
    db.add(adjustment)
    db.flush()
    return adjustment, variant, True
