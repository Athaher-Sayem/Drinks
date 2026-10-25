"""Guarded, offline import into an explicitly separate development SQLite database."""

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from sqlalchemy import JSON, Column, Integer, MetaData, String, Table, inspect, select  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.database import Base, make_engine  # noqa: E402
from app.models import Category, Product, Store, Variant  # noqa: E402
from app.schemas import CategoryCreate, ProductCreate, VariantCreate  # noqa: E402

CATALOG_ID = "general-store-demo-v1"
MARKER = "[general-store-demo:v1]"
ASSETS = ROOT / "frontend/public/demo-photos"
# Demo-only metadata is intentionally outside the reusable application schema and admin API.
DEMO_STATE = Table(
    "demo_catalog_state",
    MetaData(),
    Column("id", Integer, primary_key=True),
    Column("catalog_id", String(80), nullable=False),
    Column("product_ids", JSON, nullable=False),
)


def load_catalog(path=None):
    path = Path(path) if path else ROOT / "demo/catalog.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("catalog_id") != CATALOG_ID or len(data.get("products", [])) != 100:
        raise ValueError("Expected the pinned 100-product demo catalog.")
    categories = {c["slug"] for c in data["categories"]}
    if len(categories) != 10 or len({p["slug"] for p in data["products"]}) != 100:
        raise ValueError("The catalog must contain 10 categories and 100 unique products.")
    if len({p["sku"] for p in data["products"]}) != 100:
        raise ValueError("Demo SKUs must be unique.")
    for category in data["categories"]:
        CategoryCreate.model_validate(category)
    for product in data["products"]:
        if product["category"] not in categories:
            raise ValueError("Unknown product category.")
        photo = product["image"]
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*\.webp", photo["file"]):
            raise ValueError("Unsafe photo filename.")
        if not re.fullmatch(r"(?:CC0|CC BY(?:-SA)? [234]\.[05])", photo["license"]):
            raise ValueError("Photo license is not in the reviewed reusable set.")
        if (
            not photo["license_url"].startswith("https://creativecommons.org/")
            or not photo["author"]
        ):
            raise ValueError("Photo licensing/credit is incomplete.")
        if not photo["source_url"].startswith("https://commons.wikimedia.org/wiki/File:"):
            raise ValueError("Photo provenance must point to its Commons file page.")
        if hashlib.sha256((ASSETS / photo["file"]).read_bytes()).hexdigest() != photo["sha256"]:
            raise ValueError("Photo content differs from the reviewed manifest.")
        ProductCreate.model_validate(
            {
                "name": product["name"],
                "slug": product["slug"],
                "description": product["description"],
                "category_id": 1,
            }
        )
        VariantCreate.model_validate(
            {
                "product_id": 1,
                "name": "Standard",
                "sku": product["sku"],
                "price": product["price"],
                "initial_stock": product["initial_stock"],
            }
        )
    return data


def import_catalog(db, catalog, asset_origin):
    parsed = urlsplit(asset_origin)
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.netloc
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
        or parsed.path not in {"", "/"}
    ):
        raise ValueError("Asset origin must be http(s) without credentials, path, or query.")
    if db.get_bind().dialect.name != "sqlite":
        raise ValueError("The demo importer is limited to a separate local SQLite database.")
    connection = db.connection()
    if inspect(connection).has_table(DEMO_STATE.name):
        state = db.execute(select(DEMO_STATE).where(DEMO_STATE.c.id == 1)).mappings().first()
        if state:
            if state["catalog_id"] != CATALOG_ID:
                raise ValueError("Database belongs to a different demonstration catalog.")
            # This snapshot was already imported. All subsequent operator edits are authoritative,
            # including slug/attributes/description changes and newly created products.
            return 0
    for table in Base.metadata.sorted_tables:
        if db.execute(select(table).limit(1)).first() is not None:
            raise ValueError("Refusing an existing store: every application table must be empty.")
    DEMO_STATE.create(connection, checkfirst=True)
    db.add(
        Store(
            id=1,
            name="Everyday Market",
            tax_rate=0,
            description=(
                f"{MARKER} Demonstration catalog. Prices, stock and photos "
                "are examples, not supplier offers."
            ),
        )
    )
    db.flush()
    category_ids = {}
    for item in catalog["categories"]:
        category = db.scalar(select(Category).where(Category.slug == item["slug"]))
        if not category:
            category = Category(**CategoryCreate.model_validate(item).model_dump())
            db.add(category)
            db.flush()
        category_ids[item["slug"]] = category.id
    created = 0
    product_ids = []
    for index, item in enumerate(catalog["products"]):
        photo = item["image"]
        payload = ProductCreate(
            name=item["name"],
            slug=item["slug"],
            category_id=category_ids[item["category"]],
            description=item["description"],
            image_urls=[f"{asset_origin.rstrip('/')}/demo-photos/{photo['file']}"],
            featured=index % 10 == 0,
            attributes={
                "catalog": "Demonstration product",
                "collection": item["category"].replace("-", " "),
                "photo_credit": photo["author"],
                "photo_license": photo["license"],
                "photo_source": photo["source_url"],
                "photo_license_url": photo["license_url"],
                "_demo_catalog": CATALOG_ID,
            },
        )
        product = Product(**payload.model_dump())
        db.add(product)
        db.flush()
        product_ids.append(product.id)
        variant = VariantCreate(
            product_id=product.id,
            name="Standard",
            sku=item["sku"],
            price=item["price"],
            initial_stock=item["initial_stock"],
        )
        values = variant.model_dump()
        values["stock"] = values.pop("initial_stock")
        db.add(Variant(**values))
        created += 1
    db.execute(DEMO_STATE.insert().values(id=1, catalog_id=CATALOG_ID, product_ids=product_ids))
    db.commit()
    return created


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, default=ROOT / "demo/.local/general-store-demo.db")
    parser.add_argument("--asset-origin", default="http://127.0.0.1:5176")
    parser.add_argument("--confirm-demo", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    catalog = load_catalog()
    if args.dry_run:
        print("Verified 100 products, 10 categories, licenses and hashes. No database changed.")
        return
    if not args.confirm_demo:
        parser.error("--confirm-demo is required; never import into a real store.")
    path = args.database.resolve()
    if not (path.name.endswith("_demo.db") or path.name == "general-store-demo.db"):
        parser.error("Use a separate database named *_demo.db or general-store-demo.db.")
    path.parent.mkdir(parents=True, exist_ok=True)
    url = f"sqlite:///{path.as_posix()}"
    if not path.exists():
        env = {**os.environ, "STORE_ENVIRONMENT": "development", "STORE_DATABASE_URL": url}
        subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", "head"],
            cwd=ROOT / "backend",
            env=env,
            check=True,
        )
    engine = make_engine(url)
    try:
        with Session(engine) as db:
            count = import_catalog(db, catalog, args.asset_origin)
        print(f"Created {count} products in {path}. Existing demo stock and edits were preserved.")
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
