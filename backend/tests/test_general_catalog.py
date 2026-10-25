import sys
from pathlib import Path

import pytest
from sqlalchemy import func, select

from app.models import Category, Product, Store, User, Variant

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from demo.import_catalog import import_catalog, load_catalog  # noqa: E402


def test_general_catalog_has_100_unique_products_with_verifiable_licensed_photos():
    catalog = load_catalog()
    assert len(catalog["products"]) == 100
    assert len({p["slug"] for p in catalog["products"]}) == 100
    assert len(catalog["categories"]) == 10
    for product in catalog["products"]:
        assert product["image"]["license_url"].startswith("https://creativecommons.org/")
        assert product["image"]["author"]


def test_import_refuses_an_unmarked_existing_store(db):
    with pytest.raises(ValueError, match="existing store"):
        import_catalog(db, load_catalog(), "http://127.0.0.1:5173")


def test_import_is_repeatable_and_never_resets_stock(tmp_path):
    from sqlalchemy.orm import Session

    from app.database import Base, make_engine

    engine = make_engine(f"sqlite:///{tmp_path / 'catalog_demo.db'}")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        catalog = load_catalog()
        assert import_catalog(db, catalog, "http://127.0.0.1:5173") == 100
        variant = db.scalar(select(Variant).order_by(Variant.id))
        variant.stock = 7
        db.commit()
        assert import_catalog(db, catalog, "http://127.0.0.1:5173") == 0
        assert variant.stock == 7
        assert db.scalar(select(func.count()).select_from(Product)) == 100
    engine.dispose()


@pytest.fixture
def empty_demo_db(tmp_path):
    from sqlalchemy.orm import Session

    from app.database import Base, make_engine

    engine = make_engine(f"sqlite:///{tmp_path / 'safety_demo.db'}")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        yield db
    engine.dispose()


@pytest.mark.parametrize("existing", ["user", "category", "editable-marker"])
def test_first_import_requires_every_application_table_to_be_empty(empty_demo_db, existing):
    db = empty_demo_db
    if existing == "user":
        db.add(User(name="Existing owner", email="existing@example.com", password_hash="unused"))
    elif existing == "category":
        db.add(Category(name="Existing category", slug="existing-category"))
    else:
        db.add(Store(id=1, description="[general-store-demo:v1] Editable, not proof of ownership"))
    db.commit()
    with pytest.raises(ValueError, match="existing|empty"):
        import_catalog(db, load_catalog(), "http://127.0.0.1:5176")
    db.rollback()
    assert db.scalar(select(func.count()).select_from(Product)) == 0


def test_demo_identity_survives_normal_admin_edits_and_restart(empty_demo_db):
    db = empty_demo_db
    catalog = load_catalog()
    assert import_catalog(db, catalog, "http://127.0.0.1:5176") == 100
    db.get(Store, 1).description = "Owner's new store description"
    product = db.scalar(select(Product).order_by(Product.id))
    product.slug = "renamed-by-owner"
    product.attributes = {"material": "edited"}
    product.active = False
    variant = product.variants[0]
    variant.stock = 7
    variant.price = "19.50"
    db.add(Product(name="Added by owner", slug="owner-added", category_id=product.category_id))
    db.commit()
    db.expire_all()
    assert import_catalog(db, catalog, "http://127.0.0.1:5176") == 0
    assert db.get(Store, 1).description == "Owner's new store description"
    assert product.slug == "renamed-by-owner"
    assert product.attributes == {"material": "edited"}
    assert not product.active
    assert variant.stock == 7
    assert str(variant.price) == "19.50"
    assert db.scalar(select(func.count()).select_from(Product)) == 101
