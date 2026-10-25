from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.orm import joinedload

from ..models import Cart, CartItem, Store, Variant

MAX_ITEMS = 100


def get_store(db):
    store = db.get(Store, 1)
    if store is None:
        raise HTTPException(503, "Store has not been initialized.")
    return store


def lock_cart(db, cart_id):
    return db.scalar(
        select(Cart)
        .where(Cart.id == cart_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )


def cart_items(db, cart_id):
    return list(
        db.scalars(
            select(CartItem)
            .where(CartItem.cart_id == cart_id)
            .options(joinedload(CartItem.variant).joinedload(Variant.product))
            .order_by(CartItem.id)
        )
    )


def available(variant):
    return variant.active and variant.product.active and variant.product.category.active


def cart_output(db, cart_id):
    items = cart_items(db, cart_id)
    return {
        "items": [
            {
                "variant_id": item.variant_id,
                "product_name": item.variant.product.name,
                "product_slug": item.variant.product.slug,
                "variant_name": item.variant.name,
                "options": item.variant.options,
                "quantity": item.quantity,
                "unit_price": item.variant.price,
                "line_total": item.quantity * item.variant.price,
                "available": available(item.variant) and item.variant.stock >= item.quantity,
            }
            for item in items
        ],
        "item_count": sum(item.quantity for item in items),
        "subtotal": sum((item.quantity * item.variant.price for item in items), Decimal("0.00")),
        "currency": get_store(db).currency,
    }


def set_item(db, cart_id, variant_id, quantity):
    lock_cart(db, cart_id)
    variant = db.get(Variant, variant_id)
    if not variant or not available(variant):
        raise HTTPException(404, "Product variant not found.")
    if quantity > variant.stock:
        raise HTTPException(409, "Requested quantity exceeds available inventory.")
    items = cart_items(db, cart_id)
    existing = next((item for item in items if item.variant_id == variant_id), None)
    if existing:
        existing.quantity = quantity
    elif len(items) >= MAX_ITEMS:
        raise HTTPException(409, "A cart may contain at most 100 different variants.")
    else:
        db.add(CartItem(cart_id=cart_id, variant_id=variant_id, quantity=quantity))
    db.flush()


def remove_item(db, cart_id, variant_id):
    lock_cart(db, cart_id)
    db.execute(
        delete(CartItem).where(CartItem.cart_id == cart_id, CartItem.variant_id == variant_id)
    )


def merge_account_cart(db, session, user):
    account_cart = db.scalar(select(Cart).where(Cart.user_id == user.id))
    if account_cart is None:
        # Claim the guest cart instead of discarding its checkout idempotency history.
        cart = lock_cart(db, session.cart_id)
        cart.user_id = user.id
        db.flush()
        return cart.id
    if account_cart.id == session.cart_id:
        return account_cart.id
    list(
        db.scalars(
            select(Cart)
            .where(Cart.id.in_([account_cart.id, session.cart_id]))
            .order_by(Cart.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    )
    guest_items = cart_items(db, session.cart_id)
    existing = {item.variant_id: item for item in cart_items(db, account_cart.id)}
    valid_guest = [item for item in guest_items if available(item.variant) and item.variant.stock]
    if len(set(existing) | {item.variant_id for item in valid_guest}) > MAX_ITEMS:
        raise HTTPException(
            409, "Combined cart exceeds 100 variants; reduce your cart before login."
        )
    for item in valid_guest:
        previous = existing.get(item.variant_id)
        quantity = min(
            99, item.variant.stock, item.quantity + (previous.quantity if previous else 0)
        )
        if previous:
            previous.quantity = quantity
        else:
            db.add(CartItem(cart_id=account_cart.id, variant_id=item.variant_id, quantity=quantity))
    db.execute(delete(CartItem).where(CartItem.cart_id == session.cart_id))
    db.flush()
    return account_cart.id
