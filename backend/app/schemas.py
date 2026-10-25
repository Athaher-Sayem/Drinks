from datetime import datetime
from decimal import Decimal
from typing import Annotated, Generic, Literal, TypeVar
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    HttpUrl,
    StringConstraints,
    TypeAdapter,
    field_validator,
    model_validator,
)

Money = Annotated[Decimal, Field(ge=0, max_digits=8, decimal_places=2, allow_inf_nan=False)]
Amount = Annotated[Decimal, Field(max_digits=14, decimal_places=2)]
Slug = Annotated[
    str, StringConstraints(min_length=1, max_length=120, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
]
Label = Annotated[str, StringConstraints(min_length=1, max_length=120, strip_whitespace=True)]
Attributes = Annotated[
    dict[Annotated[str, Field(min_length=1, max_length=64)], Annotated[str, Field(max_length=250)]],
    Field(max_length=20),
]
Email = Annotated[EmailStr, Field(max_length=254)]
Status = Literal[
    "pending", "confirmed", "processing", "ready", "dispatched", "completed", "cancelled"
]
Fulfillment = Literal["pickup", "shipping", "delivery"]


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Output(BaseModel):
    model_config = ConfigDict(from_attributes=True)


T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    offset: int
    limit: int


class CategoryCreate(Input):
    name: Label
    slug: Slug
    description: str = Field(default="", max_length=1000)
    active: bool = True


class CategoryOut(CategoryCreate, Output):
    id: int


class ProductCreate(Input):
    category_id: int = Field(gt=0)
    name: Label
    slug: Slug
    description: str = Field(default="", max_length=5000)
    image_urls: list[str] = Field(default_factory=list, max_length=10)
    attributes: Attributes = Field(default_factory=dict)
    featured: bool = False
    active: bool = True

    @field_validator("image_urls")
    @classmethod
    def valid_images(cls, values):
        adapter = TypeAdapter(HttpUrl)
        return [str(adapter.validate_python(value)) for value in values]


class ProductUpdate(Input):
    category_id: int | None = Field(default=None, gt=0)
    slug: Slug | None = None
    name: Label | None = None
    description: str | None = Field(default=None, max_length=5000)
    image_urls: list[str] | None = Field(default=None, max_length=10)
    attributes: Attributes | None = None
    featured: bool | None = None
    active: bool | None = None

    @field_validator("image_urls")
    @classmethod
    def valid_images(cls, values):
        if values is None:
            return values
        adapter = TypeAdapter(HttpUrl)
        return [str(adapter.validate_python(value)) for value in values]

    @model_validator(mode="after")
    def no_explicit_null(self):
        if any(getattr(self, field) is None for field in self.model_fields_set):
            raise ValueError("Omit unchanged fields; explicit null is not allowed.")
        return self


class VariantCreate(Input):
    product_id: int = Field(gt=0)
    name: Annotated[str, Field(min_length=1, max_length=100)]
    sku: str = Field(min_length=1, max_length=80)
    price: Money
    initial_stock: Annotated[int, Field(strict=True, ge=0, le=2_000_000_000)] = 0
    options: Attributes = Field(default_factory=dict)
    active: bool = True


class VariantUpdate(Input):
    expected_version: Annotated[int, Field(strict=True, ge=1)]
    name: str | None = Field(default=None, min_length=1, max_length=100)
    price: Money | None = None
    options: Attributes | None = None
    active: bool | None = None

    @model_validator(mode="after")
    def no_explicit_null(self):
        if any(getattr(self, field) is None for field in self.model_fields_set):
            raise ValueError("Omit unchanged fields; explicit null is not allowed.")
        return self


class VariantOut(Output):
    id: int
    name: str
    sku: str
    price: Decimal
    options: dict[str, str]
    in_stock: bool


class AdminVariantOut(VariantOut):
    product_id: int
    stock: int
    active: bool
    version: int


class ProductOut(Output):
    id: int
    category_id: int
    name: str
    slug: str
    description: str
    image_urls: list[str]
    attributes: dict[str, str]
    featured: bool
    variants: list[VariantOut]


class AdminProductOut(ProductOut):
    active: bool
    variants: list[AdminVariantOut]


class StoreUpdate(Input):
    name: Label | None = None
    description: str | None = Field(default=None, max_length=1000)
    currency: Literal["USD", "GBP", "EUR", "CAD", "AUD", "NZD", "BDT", "INR"] | None = None
    country: str | None = Field(default=None, pattern=r"^[A-Z]{2}$")
    timezone: str | None = Field(default=None, max_length=64)
    contact_email: Email | None = None
    tax_rate: (
        Annotated[Decimal, Field(ge=0, le=1, decimal_places=5, allow_inf_nan=False)] | None
    ) = None
    pickup_enabled: bool | None = None
    shipping_enabled: bool | None = None
    shipping_fee: Money | None = None
    delivery_postal_codes: list[Annotated[str, Field(min_length=1, max_length=20)]] | None = Field(
        default=None,
        max_length=1000,
    )
    delivery_fee: Money | None = None
    tax_fulfillment_fee: bool | None = None

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, value):
        if value is not None:
            try:
                ZoneInfo(value)
            except ZoneInfoNotFoundError as exc:
                raise ValueError("Unknown timezone.") from exc
        return value

    @model_validator(mode="after")
    def no_explicit_null(self):
        if any(getattr(self, field) is None for field in self.model_fields_set):
            raise ValueError("Omit unchanged fields; explicit null is not allowed.")
        return self


class AdminOverview(BaseModel):
    products: int
    active_products: int
    categories: int
    pending_orders: int
    open_orders: int
    low_stock_variants: int


class StoreOut(Output):
    name: str
    description: str
    currency: str
    country: str
    timezone: str
    contact_email: str
    tax_rate: Decimal | None
    pickup_enabled: bool
    shipping_enabled: bool
    shipping_fee: Decimal
    delivery_postal_codes: list[str]
    delivery_fee: Decimal
    tax_fulfillment_fee: bool


class Register(Input):
    email: Email
    password: str = Field(min_length=12, max_length=128)
    name: Label

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value):
        return value.lower()

    @field_validator("password")
    @classmethod
    def password_quality(cls, value):
        if value.isdigit() or value.lower() in {"password1234", "password123!", "qwerty123456"}:
            raise ValueError("Choose a stronger password.")
        return value


class Login(Input):
    email: Email
    password: str = Field(min_length=1, max_length=128)


class UserOut(Output):
    id: int
    email: str
    name: str
    role: str


class ProfileUpdate(Input):
    name: Label


class SessionOut(BaseModel):
    csrf_token: str
    user: UserOut | None


class Quantity(Input):
    quantity: Annotated[int, Field(strict=True, ge=1, le=99)]


class InventoryChange(Input):
    delta: Annotated[int, Field(strict=True, ge=-2_000_000_000, le=2_000_000_000)]
    expected_version: Annotated[int, Field(strict=True, ge=1)]
    reason: str = Field(min_length=1, max_length=250)

    @field_validator("delta")
    @classmethod
    def nonzero(cls, value):
        if value == 0:
            raise ValueError("Inventory delta must not be zero.")
        return value


class Address(Input):
    line1: str = Field(min_length=1, max_length=200)
    line2: str = Field(default="", max_length=200)
    city: str = Field(min_length=1, max_length=100)
    region: str = Field(min_length=1, max_length=100)
    postal_code: str = Field(min_length=1, max_length=20)
    country: str = Field(default="US", pattern=r"^[A-Z]{2}$")


class Checkout(Input):
    customer_name: Label
    email: Email
    phone: str = Field(pattern=r"^\+[1-9][0-9]{6,14}$")
    fulfillment: Fulfillment = "pickup"
    address: Address | None = None
    notes: str = Field(default="", max_length=500)
    quote_token: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")

    @model_validator(mode="after")
    def delivery_address(self):
        if self.fulfillment != "pickup" and self.address is None:
            raise ValueError("An address is required for shipping or delivery.")
        return self


class CartLine(BaseModel):
    variant_id: int
    product_name: str
    product_slug: str
    variant_name: str
    options: dict[str, str]
    quantity: int
    unit_price: Decimal
    line_total: Decimal
    available: bool


class CartOut(BaseModel):
    items: list[CartLine]
    item_count: int
    subtotal: Amount
    currency: str


class Quote(BaseModel):
    subtotal: Amount
    tax: Amount
    tax_rate: Decimal
    fulfillment_fee: Amount
    total: Amount
    currency: str


class ReviewedQuote(Quote):
    quote_token: str
    cart: CartOut


class OrderLine(Output):
    product_name: str
    variant_name: str
    sku: str
    options: dict[str, str]
    quantity: int
    unit_price: Decimal
    line_total: Decimal


class OrderEventOut(Output):
    status: str
    created_at: datetime


class OrderOut(Quote, Output):
    id: str
    customer_name: str
    email: str
    phone: str
    fulfillment: Fulfillment
    address: Address | None
    notes: str
    status: Status
    created_at: datetime
    items: list[OrderLine]
    events: list[OrderEventOut]


class Receipt(OrderOut):
    lookup_token: str | None


class Lookup(Input):
    order_id: str = Field(pattern=r"^[0-9a-fA-F-]{36}$")
    lookup_token: str = Field(min_length=1, max_length=128)


class Cancel(Input):
    lookup_token: str = Field(default="", max_length=128)


class StatusUpdate(Input):
    status: Status


class InventoryResult(BaseModel):
    adjustment_id: int
    variant: AdminVariantOut
