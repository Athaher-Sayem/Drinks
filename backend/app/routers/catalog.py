from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import exists, func, or_, select
from sqlalchemy.orm import selectinload

from .. import schemas as s
from ..database import Db
from ..models import Category, Order, Product, Store, Variant
from ..security import Admin, Csrf, Staff
from ..services.carts import get_store

router = APIRouter(tags=["Catalog"])
Offset = Annotated[int, Query(ge=0)]
Limit = Annotated[int, Query(ge=1, le=100)]


def paginate(db, statement, offset, limit):
    total = db.scalar(select(func.count()).select_from(statement.order_by(None).subquery()))
    return {
        "items": list(db.scalars(statement.offset(offset).limit(limit))),
        "total": total,
        "offset": offset,
        "limit": limit,
    }


@router.get("/store", response_model=s.StoreOut)
def store_settings(db: Db):
    return get_store(db)


@router.patch("/admin/store", response_model=s.StoreOut)
def update_store(payload: s.StoreUpdate, user: Admin, csrf: Csrf, db: Db):
    store = db.scalar(select(Store).where(Store.id == 1).with_for_update())
    if store is None:
        raise HTTPException(503, "Store has not been initialized.")
    changes = payload.model_dump(exclude_unset=True)
    if changes.get("currency", store.currency) != store.currency and db.scalar(
        select(
            exists().where(
                Variant.id > 0,
            )
        )
    ):
        raise HTTPException(
            409, "Currency cannot change after prices exist; migrate prices explicitly."
        )
    for key, value in changes.items():
        setattr(store, key, value)
    db.commit()
    return store


@router.get("/categories", response_model=s.Page[s.CategoryOut])
def categories(db: Db, offset: Offset = 0, limit: Limit = 20):
    return paginate(
        db,
        select(Category).where(Category.active).order_by(Category.name, Category.id),
        offset,
        limit,
    )


@router.get("/products", response_model=s.Page[s.ProductOut])
def products(
    db: Db,
    offset: Offset = 0,
    limit: Limit = 20,
    search: Annotated[str | None, Query(max_length=100)] = None,
    category: Annotated[str | None, Query(max_length=120)] = None,
    min_price: Annotated[Decimal | None, Query(ge=0, allow_inf_nan=False)] = None,
    max_price: Annotated[Decimal | None, Query(ge=0, allow_inf_nan=False)] = None,
    featured: bool | None = None,
):
    statement = select(Product).join(Category).where(Product.active, Category.active)
    if search:
        statement = statement.where(
            or_(Product.name.ilike(f"%{search}%"), Product.description.ilike(f"%{search}%"))
        )
    if category:
        statement = statement.where(Category.slug == category)
    if featured is not None:
        statement = statement.where(Product.featured == featured)
    price_conditions = [Variant.product_id == Product.id, Variant.active]
    if min_price is not None:
        price_conditions.append(Variant.price >= min_price)
    if max_price is not None:
        price_conditions.append(Variant.price <= max_price)
    statement = statement.where(exists().where(*price_conditions))
    statement = statement.options(selectinload(Product.variants.and_(Variant.active)))
    return paginate(db, statement.order_by(Product.name, Product.id), offset, limit)


@router.get("/products/{slug}", response_model=s.ProductOut)
def product_detail(slug: str, db: Db):
    product = db.scalar(
        select(Product)
        .join(Category)
        .where(
            Product.slug == slug,
            Product.active,
            Category.active,
        )
        .options(selectinload(Product.variants.and_(Variant.active)))
    )
    if product is None:
        raise HTTPException(404, "Product not found.")
    return product


@router.post("/admin/categories", response_model=s.CategoryOut, status_code=201)
def create_category(payload: s.CategoryCreate, user: Staff, csrf: Csrf, db: Db):
    category = Category(**payload.model_dump())
    db.add(category)
    db.commit()
    return category


@router.get("/admin/categories", response_model=s.Page[s.CategoryOut])
def admin_categories(user: Staff, db: Db, offset: Offset = 0, limit: Limit = 20):
    return paginate(db, select(Category).order_by(Category.name, Category.id), offset, limit)


@router.get("/admin/overview", response_model=s.AdminOverview)
def admin_overview(user: Staff, db: Db):
    def count(model, *conditions):
        return db.scalar(select(func.count()).select_from(model).where(*conditions))

    return {
        "products": count(Product),
        "active_products": count(Product, Product.active),
        "categories": count(Category),
        "pending_orders": count(Order, Order.status == "pending"),
        "open_orders": count(Order, Order.status.not_in(["completed", "cancelled"])),
        "low_stock_variants": db.scalar(
            select(func.count())
            .select_from(Variant)
            .join(Product)
            .join(Category)
            .where(Variant.active, Product.active, Category.active, Variant.stock <= 5)
        ),
    }


@router.put("/admin/categories/{category_id}", response_model=s.CategoryOut)
def update_category(category_id: int, payload: s.CategoryCreate, user: Staff, csrf: Csrf, db: Db):
    category = db.get(Category, category_id)
    if category is None:
        raise HTTPException(404, "Category not found.")
    for key, value in payload.model_dump().items():
        setattr(category, key, value)
    db.commit()
    return category


@router.get("/admin/products", response_model=s.Page[s.AdminProductOut])
def admin_products(
    user: Staff,
    db: Db,
    offset: Offset = 0,
    limit: Limit = 20,
    search: Annotated[str | None, Query(max_length=100)] = None,
    category_id: Annotated[int | None, Query(gt=0)] = None,
    active: bool | None = None,
    low_stock: bool = False,
):
    statement = select(Product).options(selectinload(Product.variants))
    if search:
        statement = statement.where(
            or_(Product.name.ilike(f"%{search}%"), Product.slug.ilike(f"%{search}%"))
        )
    if category_id is not None:
        statement = statement.where(Product.category_id == category_id)
    if active is not None:
        statement = statement.where(Product.active == active)
    if low_stock:
        statement = statement.join(Category).where(
            Product.active,
            Category.active,
            exists().where(Variant.product_id == Product.id, Variant.active, Variant.stock <= 5),
        )
    return paginate(
        db,
        statement.order_by(Product.id),
        offset,
        limit,
    )


@router.post("/admin/products", response_model=s.AdminProductOut, status_code=201)
def create_product(payload: s.ProductCreate, user: Staff, csrf: Csrf, db: Db):
    if db.get(Category, payload.category_id) is None:
        raise HTTPException(422, "Category does not exist.")
    product = Product(**payload.model_dump())
    db.add(product)
    db.commit()
    return product


@router.patch("/admin/products/{product_id}", response_model=s.AdminProductOut)
def update_product(product_id: int, payload: s.ProductUpdate, user: Staff, csrf: Csrf, db: Db):
    product = db.get(Product, product_id)
    if product is None:
        raise HTTPException(404, "Product not found.")
    if payload.category_id is not None and db.get(Category, payload.category_id) is None:
        raise HTTPException(422, "Category does not exist.")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(product, key, value)
    db.commit()
    return product


@router.post("/admin/variants", response_model=s.AdminVariantOut, status_code=201)
def create_variant(payload: s.VariantCreate, user: Staff, csrf: Csrf, db: Db):
    if db.get(Product, payload.product_id) is None:
        raise HTTPException(422, "Product does not exist.")
    data = payload.model_dump()
    data["stock"] = data.pop("initial_stock")
    variant = Variant(**data)
    db.add(variant)
    db.commit()
    return variant


@router.patch("/admin/variants/{variant_id}", response_model=s.AdminVariantOut)
def update_variant(variant_id: int, payload: s.VariantUpdate, user: Staff, csrf: Csrf, db: Db):
    variant = db.scalar(select(Variant).where(Variant.id == variant_id).with_for_update())
    if variant is None:
        raise HTTPException(404, "Variant not found.")
    if variant.version != payload.expected_version:
        raise HTTPException(409, "Variant changed; reload it before updating.")
    for key, value in payload.model_dump(exclude_unset=True, exclude={"expected_version"}).items():
        setattr(variant, key, value)
    db.commit()
    return variant
