import time
import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
    CheckConstraint,
    ForeignKey,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base, UTCDateTime


def identifier():
    return str(uuid.uuid4())


def now():
    return datetime.now(UTC)


class Store(Base):
    __tablename__ = "store"
    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    name: Mapped[str] = mapped_column(String(120), default="Your Store")
    description: Mapped[str] = mapped_column(String(1000), default="")
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    country: Mapped[str] = mapped_column(String(2), default="US")
    timezone: Mapped[str] = mapped_column(String(64), default="America/New_York")
    contact_email: Mapped[str] = mapped_column(String(254), default="")
    tax_rate: Mapped[Decimal | None] = mapped_column(Numeric(6, 5), nullable=True)
    pickup_enabled: Mapped[bool] = mapped_column(default=True)
    shipping_enabled: Mapped[bool] = mapped_column(default=False)
    shipping_fee: Mapped[Decimal] = mapped_column(Numeric(8, 2), default=Decimal("0"))
    delivery_postal_codes: Mapped[list] = mapped_column(JSON, default=list)
    delivery_fee: Mapped[Decimal] = mapped_column(Numeric(8, 2), default=Decimal("0"))
    tax_fulfillment_fee: Mapped[bool] = mapped_column(default=False)
    __table_args__ = (
        CheckConstraint("id = 1", name="singleton"),
        CheckConstraint("tax_rate IS NULL OR (tax_rate >= 0 AND tax_rate <= 1)", name="tax_range"),
        CheckConstraint("shipping_fee >= 0 AND delivery_fee >= 0", name="fees_nonnegative"),
    )


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(10), default="customer")
    active: Mapped[bool] = mapped_column(default=True)
    __table_args__ = (CheckConstraint("role IN ('customer','staff','admin')", name="role_values"),)


class Category(Base):
    __tablename__ = "categories"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    slug: Mapped[str] = mapped_column(String(120), unique=True)
    description: Mapped[str] = mapped_column(String(1000), default="")
    active: Mapped[bool] = mapped_column(default=True)


class Product(Base):
    __tablename__ = "products"
    id: Mapped[int] = mapped_column(primary_key=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    slug: Mapped[str] = mapped_column(String(140), unique=True)
    description: Mapped[str] = mapped_column(String(5000), default="")
    image_urls: Mapped[list] = mapped_column(JSON, default=list)
    attributes: Mapped[dict] = mapped_column(JSON, default=dict)
    featured: Mapped[bool] = mapped_column(default=False)
    active: Mapped[bool] = mapped_column(default=True)
    category: Mapped[Category] = relationship()
    variants: Mapped[list["Variant"]] = relationship(
        back_populates="product", order_by="Variant.id"
    )


class Variant(Base):
    __tablename__ = "variants"
    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    sku: Mapped[str] = mapped_column(String(80), unique=True)
    price: Mapped[Decimal] = mapped_column(Numeric(8, 2))
    stock: Mapped[int] = mapped_column(default=0)
    options: Mapped[dict] = mapped_column(JSON, default=dict)
    active: Mapped[bool] = mapped_column(default=True)
    version: Mapped[int] = mapped_column(default=1, nullable=False)
    product: Mapped[Product] = relationship(back_populates="variants")
    __mapper_args__ = {"version_id_col": version}
    __table_args__ = (CheckConstraint("price >= 0 AND stock >= 0", name="nonnegative"),)

    @property
    def in_stock(self):
        return self.active and self.stock > 0


class Cart(Base):
    __tablename__ = "carts"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=identifier)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), unique=True, nullable=True)
    items: Mapped[list["CartItem"]] = relationship(
        cascade="all, delete-orphan", order_by="CartItem.id"
    )


class CartItem(Base):
    __tablename__ = "cart_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    cart_id: Mapped[str] = mapped_column(ForeignKey("carts.id"), index=True)
    variant_id: Mapped[int] = mapped_column(ForeignKey("variants.id"))
    quantity: Mapped[int] = mapped_column()
    variant: Mapped[Variant] = relationship()
    __table_args__ = (
        UniqueConstraint("cart_id", "variant_id"),
        CheckConstraint("quantity BETWEEN 1 AND 99", name="quantity_range"),
    )


class BrowserSession(Base):
    __tablename__ = "browser_sessions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=identifier)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    csrf_token: Mapped[str] = mapped_column(String(64))
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    cart_id: Mapped[str] = mapped_column(ForeignKey("carts.id"))
    expires_at: Mapped[int] = mapped_column(
        default=lambda: int(time.time()) + 86400 * 14, index=True
    )
    user: Mapped[User | None] = relationship()


class Order(Base):
    __tablename__ = "orders"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=identifier)
    cart_id: Mapped[str] = mapped_column(ForeignKey("carts.id"))
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    idempotency_key: Mapped[str] = mapped_column(String(36))
    checkout_scope: Mapped[str] = mapped_column(String(36))
    request_hash: Mapped[str] = mapped_column(String(64))
    customer_name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(254))
    phone: Mapped[str] = mapped_column(String(20))
    fulfillment: Mapped[str] = mapped_column(String(12))
    address: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    notes: Mapped[str] = mapped_column(String(500), default="")
    status: Mapped[str] = mapped_column(String(12), default="pending")
    currency: Mapped[str] = mapped_column(String(3))
    subtotal: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    tax: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    tax_rate: Mapped[Decimal] = mapped_column(Numeric(6, 5))
    fulfillment_fee: Mapped[Decimal] = mapped_column(Numeric(8, 2))
    total: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=now)
    items: Mapped[list["OrderItem"]] = relationship(order_by="OrderItem.id")
    events: Mapped[list["OrderEvent"]] = relationship(order_by="OrderEvent.id")
    __table_args__ = (
        UniqueConstraint("checkout_scope", "idempotency_key"),
        CheckConstraint(
            "subtotal >= 0 AND tax >= 0 AND fulfillment_fee >= 0 AND total >= 0",
            name="amounts_nonnegative",
        ),
        CheckConstraint(
            "status IN ('pending','confirmed','processing','ready','dispatched',"
            "'completed','cancelled')",
            name="status_values",
        ),
        CheckConstraint(
            "fulfillment IN ('pickup','shipping','delivery')", name="fulfillment_values"
        ),
    )


class OrderItem(Base):
    __tablename__ = "order_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id"), index=True)
    variant_id: Mapped[int] = mapped_column(ForeignKey("variants.id"))
    product_name: Mapped[str] = mapped_column(String(120))
    variant_name: Mapped[str] = mapped_column(String(100))
    sku: Mapped[str] = mapped_column(String(80))
    options: Mapped[dict] = mapped_column(JSON)
    quantity: Mapped[int] = mapped_column()
    unit_price: Mapped[Decimal] = mapped_column(Numeric(8, 2))
    line_total: Mapped[Decimal] = mapped_column(Numeric(14, 2))


class OrderEvent(Base):
    __tablename__ = "order_events"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id"), index=True)
    status: Mapped[str] = mapped_column(String(12))
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=now)


class InventoryAdjustment(Base):
    __tablename__ = "inventory_adjustments"
    id: Mapped[int] = mapped_column(primary_key=True)
    variant_id: Mapped[int] = mapped_column(ForeignKey("variants.id"))
    actor_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    idempotency_key: Mapped[str] = mapped_column(String(36))
    request_hash: Mapped[str] = mapped_column(String(64))
    delta: Mapped[int] = mapped_column()
    reason: Mapped[str] = mapped_column(String(250))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=now)
    __table_args__ = (UniqueConstraint("variant_id", "idempotency_key"),)


class RateLimit(Base):
    __tablename__ = "rate_limits"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    bucket: Mapped[int] = mapped_column(primary_key=True)
    count: Mapped[int] = mapped_column(default=1)
