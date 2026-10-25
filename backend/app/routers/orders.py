from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from .. import schemas as s
from ..database import Db
from ..models import Order
from ..security import Csrf, Customer, Staff, limit
from ..services.carts import cart_output, lock_cart
from ..services.orders import (
    adjust_inventory,
    authorized_order,
    guest_token,
    load_order,
    place_order,
    quote_cart,
    quote_token,
    transition,
)
from .catalog import Limit, Offset, paginate

router = APIRouter(tags=["Orders"])
IdempotencyKey = Annotated[UUID, Header(alias="Idempotency-Key")]


@router.post("/checkout/quote", response_model=s.ReviewedQuote)
def quote(payload: s.Checkout, session: Csrf, db: Db):
    lock_cart(db, session.cart_id)
    items, variants, amounts = quote_cart(db, session.cart_id, payload, lock=True)
    return {
        **amounts,
        "quote_token": quote_token(session.cart_id, payload, items, variants, amounts),
        "cart": cart_output(db, session.cart_id),
    }


@router.post(
    "/orders",
    response_model=s.Receipt,
    status_code=201,
    responses={200: {"model": s.Receipt}},
    description="Reuse one UUID Idempotency-Key for retries of the same checkout intent.",
)
def checkout(
    payload: s.Checkout,
    key: IdempotencyKey,
    request: Request,
    response: Response,
    session: Csrf,
    db: Db,
):
    order, created = place_order(db, session, payload, key)
    db.commit()
    response.status_code = 201 if created else 200
    data = s.OrderOut.model_validate(order).model_dump()
    data["lookup_token"] = (
        guest_token(order, request.app.state.settings) if order.user_id is None else None
    )
    return data


@router.get("/orders", response_model=s.Page[s.OrderOut])
def order_history(user: Customer, db: Db, offset: Offset = 0, limit: Limit = 20):
    statement = (
        select(Order)
        .where(Order.user_id == user.id)
        .options(
            selectinload(Order.items),
            selectinload(Order.events),
        )
        .order_by(Order.created_at.desc(), Order.id)
    )
    return paginate(db, statement, offset, limit)


@router.get("/orders/{order_id}", response_model=s.OrderOut)
def order_detail(order_id: UUID, user: Customer, db: Db):
    order = load_order(db, order_id)
    if order is None or order.user_id != user.id:
        raise HTTPException(404, "Order not found.")
    return order


@router.post("/orders/lookup", response_model=s.OrderOut)
def lookup(payload: s.Lookup, request: Request, session: Csrf, db: Db):
    limit(request, "lookup", 10)
    return authorized_order(
        db, session, payload.order_id, request.app.state.settings, payload.lookup_token
    )


@router.post("/orders/{order_id}/cancel", response_model=s.OrderOut)
def cancel(order_id: UUID, payload: s.Cancel, request: Request, session: Csrf, db: Db):
    order = authorized_order(
        db, session, order_id, request.app.state.settings, payload.lookup_token
    )
    user = session.user
    staff = user and user.role in {"staff", "admin"}
    order = transition(db, order, "cancelled", user, customer_cancel=not staff)
    db.commit()
    return order


@router.get("/admin/orders", response_model=s.Page[s.OrderOut])
def all_orders(
    user: Staff, db: Db, offset: Offset = 0, limit: Limit = 20, status: s.Status | None = None
):
    statement = select(Order).options(selectinload(Order.items), selectinload(Order.events))
    if status:
        statement = statement.where(Order.status == status)
    return paginate(db, statement.order_by(Order.created_at.desc(), Order.id), offset, limit)


@router.get("/admin/orders/{order_id}", response_model=s.OrderOut)
def admin_order_detail(order_id: UUID, user: Staff, db: Db):
    order = load_order(db, order_id)
    if order is None:
        raise HTTPException(404, "Order not found.")
    return order


@router.patch("/admin/orders/{order_id}/status", response_model=s.OrderOut)
def update_status(
    order_id: UUID, payload: s.StatusUpdate, user: Staff, session: Csrf, request: Request, db: Db
):
    order = authorized_order(db, session, order_id, request.app.state.settings)
    order = transition(db, order, payload.status, user)
    db.commit()
    return order


@router.post(
    "/admin/variants/{variant_id}/inventory-adjustments",
    response_model=s.InventoryResult,
    status_code=201,
    responses={200: {"model": s.InventoryResult}},
)
def inventory_adjustment(
    variant_id: int,
    payload: s.InventoryChange,
    key: IdempotencyKey,
    user: Staff,
    session: Csrf,
    response: Response,
    db: Db,
):
    adjustment, variant, created = adjust_inventory(db, variant_id, user, payload, key)
    db.commit()
    response.status_code = 201 if created else 200
    return {"adjustment_id": adjustment.id, "variant": variant}
