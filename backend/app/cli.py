"""Operator-only bootstrap and maintenance commands; no default administrator credentials."""

import argparse
import getpass
import os
import secrets
import time
from decimal import Decimal
from pathlib import Path

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .config import Settings
from .database import make_engine
from .models import BrowserSession, Category, Product, RateLimit, Store, User, Variant
from .schemas import Register
from .security import password_hash


def init_env():
    path = Path(__file__).resolve().parents[1] / ".env"
    with path.open("x", encoding="utf-8") as file:
        file.write(f"STORE_SECRET_KEY={secrets.token_hex(32)}\n")
        file.write("STORE_ENVIRONMENT=development\nSTORE_DATABASE_URL=sqlite:///./store.db\n")
    print("Created backend/.env with a new secret. Existing files are never overwritten.")


def seed_demo(db, settings):
    if settings.environment != "development":
        raise ValueError("Demo data is allowed only in development.")
    store = db.get(Store, 1)
    if store is None:
        db.add(Store(id=1, name="Sample Store", tax_rate=Decimal("0")))
    samples = [
        (
            "Canvas Tote",
            "canvas-tote",
            "Accessories",
            "accessories",
            "12.50",
            {"material": "cotton"},
            {"color": "natural"},
        ),
        (
            "Stoneware Mug",
            "stoneware-mug",
            "Home",
            "home",
            "18.00",
            {"material": "ceramic"},
            {"color": "cream"},
        ),
        (
            "Citrus Soda",
            "citrus-soda",
            "Drinks",
            "drinks",
            "5.50",
            {"ingredients": "Citrus, soda"},
            {"volume": "12 oz"},
        ),
    ]
    for name, slug, cat_name, cat_slug, price, attributes, options in samples:
        category = db.scalar(select(Category).where(Category.slug == cat_slug))
        if category is None:
            category = Category(name=cat_name, slug=cat_slug)
            db.add(category)
            db.flush()
        product = db.scalar(select(Product).where(Product.slug == slug))
        if product is None:
            product = Product(
                name=name,
                slug=slug,
                category_id=category.id,
                attributes=attributes,
                description="Illustrative demo product; replace before launch.",
                featured=True,
            )
            db.add(product)
            db.flush()
        sku = f"DEMO-{slug.upper()}"
        if db.scalar(select(Variant).where(Variant.sku == sku)) is None:
            db.add(
                Variant(
                    product_id=product.id,
                    name="Default",
                    sku=sku,
                    price=Decimal(price),
                    stock=25,
                    options=options,
                )
            )
    db.commit()
    print("Demo catalog ready. Existing products, prices, stock, and settings were preserved.")


def main():
    parser = argparse.ArgumentParser(description="Reusable Store API operator commands")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser(
        "init-env", help="Create a local .env with a random secret; never overwrite."
    )
    store = commands.add_parser("init-store", help="Initialize one empty store after migrations.")
    store.add_argument("--name", required=True)
    admin = commands.add_parser("create-admin", help="Create owner; password is prompted securely.")
    admin.add_argument("--email", required=True)
    admin.add_argument("--name", default="Store owner")
    commands.add_parser("seed-demo", help="Development-only, repeatable generic sample catalog.")
    commands.add_parser("cleanup", help="Remove expired sessions and old rate-limit windows.")
    args = parser.parse_args()
    try:
        if args.command == "init-env":
            init_env()
            return
        settings = Settings()
        engine = make_engine(settings.database_url)
        try:
            with Session(engine) as db:
                if args.command == "init-store":
                    if db.get(Store, 1):
                        raise ValueError(
                            "Store already exists; use the owner settings API to change it."
                        )
                    if not args.name.strip() or len(args.name) > 120:
                        raise ValueError("Store name must be 1–120 characters.")
                    db.add(Store(id=1, name=args.name.strip()))
                    db.commit()
                    print(
                        "Store initialized. Configure tax and fulfillment before accepting orders."
                    )
                elif args.command == "create-admin":
                    password = os.environ.get("STORE_BOOTSTRAP_PASSWORD")
                    if password is None:
                        password = getpass.getpass("Owner password (12+ characters): ")
                        if password != getpass.getpass("Confirm password: "):
                            raise ValueError("Passwords do not match.")
                    data = Register(email=args.email, name=args.name, password=password)
                    if db.scalar(select(User).where(User.email == data.email)):
                        raise ValueError("Email already exists; no role or password was changed.")
                    db.add(
                        User(
                            email=data.email,
                            name=data.name,
                            role="admin",
                            password_hash=password_hash.hash(data.password),
                        )
                    )
                    db.commit()
                    print("Owner account created.")
                elif args.command == "seed-demo":
                    seed_demo(db, settings)
                elif args.command == "cleanup":
                    db.execute(
                        delete(BrowserSession).where(BrowserSession.expires_at < int(time.time()))
                    )
                    db.execute(
                        delete(RateLimit).where(RateLimit.bucket < int(time.time()) // 60 - 60)
                    )
                    db.commit()
                    print("Expired sessions and old rate-limit windows removed. Orders preserved.")
        finally:
            engine.dispose()
    except (ValueError, FileExistsError) as exc:
        parser.exit(1, f"{exc}\n")


if __name__ == "__main__":
    main()
