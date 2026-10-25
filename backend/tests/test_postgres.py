"""PostgreSQL-only race tests. Every run owns an isolated randomly named schema."""

import os
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker
from sqlalchemy.schema import CreateSchema, DropSchema

pytestmark = [
    pytest.mark.postgres,
    pytest.mark.skipif(
        not os.environ.get("STORE_TEST_DATABASE_URL"),
        reason="PostgreSQL test URL not configured.",
    ),
]


@pytest.fixture
def pg_factory():
    from app.database import Base
    from app.models import Cart, CartItem, Category, Product, Store, Variant

    url = make_url(os.environ["STORE_TEST_DATABASE_URL"])
    if not url.database or not url.database.endswith("_test"):
        pytest.fail("STORE_TEST_DATABASE_URL must name a disposable database ending in '_test'.")
    schema = "store_test_" + uuid.uuid4().hex
    owner_engine = create_engine(url)
    with owner_engine.begin() as db:
        db.execute(CreateSchema(schema))
    engine = create_engine(url.update_query_dict({"options": f"-csearch_path={schema}"}))
    factory = sessionmaker(engine, expire_on_commit=False)
    try:
        Base.metadata.create_all(engine)
        with factory.begin() as db:
            db.add(Store(id=1, name="Concurrency Store", tax_rate=Decimal("0")))
            category = Category(name="Goods", slug="goods")
            db.add(category)
            db.flush()
            product = Product(name="Item", slug="item", category_id=category.id)
            db.add(product)
            db.flush()
            variant = Variant(
                product_id=product.id, name="Default", sku="TEST", price="5.00", stock=1
            )
            carts = [Cart(), Cart()]
            db.add_all([variant, *carts])
            db.flush()
            for cart in carts:
                db.add(CartItem(cart_id=cart.id, variant_id=variant.id, quantity=1))
            ids = [cart.id for cart in carts]
        yield factory, ids
    finally:
        engine.dispose()
        with owner_engine.begin() as db:
            # Only the random schema created by this fixture is ever dropped.
            db.execute(DropSchema(schema, cascade=True))
        owner_engine.dispose()


def together(functions):
    barrier = threading.Barrier(len(functions))

    def run(fn):
        barrier.wait(timeout=10)
        return fn()

    with ThreadPoolExecutor(max_workers=len(functions)) as executor:
        futures = [executor.submit(run, fn) for fn in functions]
        return [future.result(timeout=30) for future in futures]


def checkout_data():
    from app.schemas import Checkout

    return Checkout(customer_name="Test", email="test@example.com", phone="+12025550142")


def test_two_carts_cannot_sell_the_last_unit_twice(pg_factory):
    from app.models import Order, Variant
    from app.services.orders import place_order

    factory, carts = pg_factory

    def buy(cart_id):
        with factory() as db:
            try:
                place_order(
                    db,
                    SimpleNamespace(id=cart_id, cart_id=cart_id, user_id=None),
                    checkout_data(),
                    uuid.uuid4(),
                )
                db.commit()
                return "created"
            except HTTPException as exc:
                db.rollback()
                assert exc.status_code == 409
                return "out-of-stock"

    assert sorted(together([lambda: buy(carts[0]), lambda: buy(carts[1])])) == [
        "created",
        "out-of-stock",
    ]
    with factory() as db:
        assert len(list(db.scalars(select(Order)))) == 1
        assert db.get(Variant, 1).stock == 0


def test_parallel_retries_create_one_order(pg_factory):
    from app.models import Order, Variant
    from app.services.orders import place_order

    factory, carts = pg_factory
    key = uuid.uuid4()

    def buy():
        with factory() as db:
            order, _ = place_order(
                db,
                SimpleNamespace(id=carts[0], cart_id=carts[0], user_id=None),
                checkout_data(),
                key,
            )
            db.commit()
            return order.id

    results = together([buy, buy])
    assert results[0] == results[1]
    with factory() as db:
        assert len(list(db.scalars(select(Order)))) == 1
        assert db.get(Variant, 1).stock == 0


def test_parallel_cancellations_restore_stock_once(pg_factory):
    from app.models import Order, Variant
    from app.services.orders import place_order, transition

    factory, carts = pg_factory
    with factory() as db:
        order, _ = place_order(
            db,
            SimpleNamespace(id=carts[0], cart_id=carts[0], user_id=None),
            checkout_data(),
            uuid.uuid4(),
        )
        db.commit()
        order_id = order.id

    def cancel():
        with factory() as db:
            transition(db, db.get(Order, order_id), "cancelled", None)
            db.commit()

    together([cancel, cancel])
    with factory() as db:
        assert db.get(Variant, 1).stock == 1
        assert len(db.get(Order, order_id).events) == 2
