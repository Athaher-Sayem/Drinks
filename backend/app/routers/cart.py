from fastapi import APIRouter, Response

from .. import schemas as s
from ..database import Db
from ..security import Browser, Csrf
from ..services.carts import cart_output, remove_item, set_item

router = APIRouter(tags=["Cart"])


@router.get("/cart", response_model=s.CartOut)
def cart(session: Browser, db: Db):
    return cart_output(db, session.cart_id)


@router.put("/cart/items/{variant_id}", response_model=s.CartOut)
def update_cart(variant_id: int, payload: s.Quantity, session: Csrf, db: Db):
    set_item(db, session.cart_id, variant_id, payload.quantity)
    db.commit()
    return cart_output(db, session.cart_id)


@router.delete("/cart/items/{variant_id}", status_code=204)
def delete_cart_item(variant_id: int, session: Csrf, db: Db):
    remove_item(db, session.cart_id, variant_id)
    db.commit()
    return Response(status_code=204)
