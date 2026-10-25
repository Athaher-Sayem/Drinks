# Store backend

## Quick start — Windows PowerShell

From `backend/` with Python 3.11 or newer:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt
python -m app.cli init-env
python -m alembic upgrade head
python -m app.cli seed-demo
python -m app.cli create-admin --email owner@example.com --name "Store owner"
python -m uvicorn app.main:create_app --factory --reload --no-access-log
```

On macOS/Linux use `python3 -m venv .venv` and `source .venv/bin/activate`.
If you prefer not to activate, invoke `.venv\Scripts\python.exe` directly on Windows.

Open **http://127.0.0.1:8000/docs**. The owner password is securely prompted, never defaulted.
`init-env` generates a persistent random secret and refuses to overwrite an existing `.env`.
`seed-demo` adds clearly labeled tote, mug, and soda products and never resets existing stock/prices.
Its 0% tax rate is for a **local demonstration only**, not a tax-exemption determination.

For a real empty store use `python -m app.cli init-store --name "Your Store"` instead of `seed-demo`.
Configure tax through the owner settings API before accepting orders; unconfigured tax blocks checkout.

## Reuse for a different store

Deploy this `backend/` again with a **different database, secret, hostname, and cookie name**.
Initialize its owner and store settings, then add its own categories/products/variants.
No drink names, ingredients, country-specific phone formats, or preparation workflows are hardcoded
into catalog models. Optional attributes can describe material, ingredients, allergens, dimensions,
or other short product facts. Variant options can describe size, color, volume, etc.

Supported store currencies currently have two decimal places: USD, GBP, EUR, CAD, AUD, NZD, BDT, INR.
There is one currency per deployment, no exchange-rate conversion, and currency cannot be changed
after variant prices exist without an explicit migration. Order prices/currency/options are snapshots.

## Authentication and CSRF

1. `GET /api/v1/session` sets an opaque HttpOnly session cookie and returns `csrf_token`.
2. Send cookies (`credentials: "include"`) and `X-CSRF-Token` on **every write**, including guest cart,
   registration, login, quote, checkout, and lookup. Public catalog reads need no session.
3. Login with email/password. Login rotates the cookie and CSRF token: call `/session` again afterward.
4. Logout revokes the server-side session. Expired/disabled accounts cannot reuse an old session.

Passwords use Argon2. Only hashes of session bearer cookies are stored. There are no localStorage
JWTs or default admin passwords. Exact CORS origins and CSRF-origin checks protect browser writes.
The CSRF/session token response, order receipts, and all API responses use `Cache-Control: no-store`.
Keep guest order lookup tokens private and out of URLs, analytics, logs, and public links.

Example browser client (run from an allowed frontend origin):

```javascript
const api = "http://127.0.0.1:8000/api/v1";
const session = await fetch(`${api}/session`, { credentials: "include" }).then(r => r.json());
const headers = { "Content-Type": "application/json", "X-CSRF-Token": session.csrf_token };
await fetch(`${api}/cart/items/1`, {
  method: "PUT", credentials: "include", headers, body: JSON.stringify({ quantity: 2 })
});
// Generate ONCE per checkout intent. Reuse this UUID and payload after timeouts/retries.
const checkoutKey = crypto.randomUUID();
const response = await fetch(`${api}/orders`, {
  method: "POST", credentials: "include", headers: { ...headers, "Idempotency-Key": checkoutKey },
  body: JSON.stringify({ customer_name: "Alex", email: "alex@example.com",
                         phone: "+12025550142", fulfillment: "pickup" })
});
const receipt = await response.json();
```

Use the same hostname for frontend/backend development (both `localhost` or both `127.0.0.1`),
since mixing them can prevent SameSite cookies from being sent. Production expects a same-site
frontend/API behind HTTPS; arbitrary cross-site cookie deployments are not configured.
Swagger UI documents the CSRF header and idempotency headers; initialize the session first and
paste its CSRF token into unsafe requests. Interactive docs are not a staff dashboard.

## Endpoints

All commerce routes are under `/api/v1` with no trailing slash:

- `GET /health`, `/store`, `/categories`, `/products`, `/products/{slug}`.
- Catalog query parameters: `search`, `category`, `featured`, `min_price`, `max_price`, `offset`, `limit`.
- `GET /session`; `POST /auth/register`, `/auth/login`, `/auth/logout`.
- `GET/PATCH /auth/me`.
- `GET /cart`; `PUT/DELETE /cart/items/{variant_id}`. PUT sets an absolute quantity, not an increment.
- `POST /checkout/quote`; `POST /orders` with a UUID `Idempotency-Key` header.
- `GET /orders`, `/orders/{uuid}` for a customer's own order history.
- `POST /orders/lookup` with `order_id` and `lookup_token` for secure guest lookup.
- `POST /orders/{uuid}/cancel` (guest callers supply `lookup_token`; customers can cancel pending orders).
- `PATCH /admin/store` — owner only.
- `POST /admin/categories`; `PUT /admin/categories/{id}` — staff/owner.
- `GET/POST /admin/products`; `PATCH /admin/products/{id}` — staff/owner.
- `GET /admin/categories` — all active/inactive category records; `GET /admin/overview` — operational counts.
- Staff product listing supports `search`, `category_id`, `active`, and `low_stock` (active variants ≤5).
- `POST /admin/variants`; `PATCH /admin/variants/{id}` — staff/owner.
- `POST /admin/variants/{id}/inventory-adjustments` — staff/owner, idempotency key required.
- `GET /admin/orders`, `/admin/orders/{uuid}`; `PATCH /admin/orders/{uuid}/status` — staff/owner.

List responses contain `items`, `total`, `offset`, and `limit` (maximum 100).
Public variants expose availability, not exact stock. Staff product responses include stock/version.
Use deactivation rather than hard deletion, preserving cart/order references.
Validation returns 422, missing authentication 401, denied access/CSRF 403, inaccessible records 404,
stale versions/idempotency/stock conflicts 409, rate limiting 429, unconfigured store services 503.
Unknown input fields and client-supplied totals, roles, owner IDs, and order statuses are rejected.

## Inventory and order rules

- Carts have at most 100 distinct variants, each with quantity 1–99. Login merges obey the same limit;
  overflow rejects the login transaction without discarding either cart. Merged quantities are capped
  to current stock/99 and inactive or out-of-stock guest items are omitted.
- Carts do not reserve stock. Totals are recalculated from database prices on every quote/checkout.
- Quotes return a cart snapshot and `quote_token`. Echo that token in checkout to reject changes
  to reviewed quantities, product/variant details, prices, or totals with 409 and require fresh review.
  Existing idempotent orders replay before the quote guard, even if the cart is now empty. The token
  is an equality fingerprint, not an authorization credential. It is optional for older API clients;
  the connected storefront always sends it. Never use a token from a different reviewed cart.
- PostgreSQL row locks serialize cart checkout and inventory mutations; a DB unique constraint backs
  checkout idempotency. A successful replay returns 200, first creation 201, changed payload 409.
  Keys are scoped to an immutable browser-session identity (not its rotating cookie or mutable cart),
  survive login/cart merging, and are retained with orders. Do not reuse a key for a new checkout intent.
  A different browser session cannot replay an old session's key; use order history/guest lookup instead.
- Metadata PATCH requires `expected_version`. Stock cannot be set through metadata PATCH.
  Inventory adjustments use `{delta, expected_version, reason}` and their own idempotency key.
  Checkout/cancellation increments the variant version, preventing stale staff stock overwrites.
- Orders progress `pending → confirmed → processing → ready → completed` for pickup, or
  `pending → confirmed → processing → dispatched → completed` for shipping/local delivery.
  Staff can cancel before dispatch/completion; customers can cancel only pending orders.
  Repeated cancellation restores stock only once. Status events record the acting account.
- **No payment fields or endpoints exist.** Completing an order never implies payment was collected.

## Tax and fulfillment limitations

Pickup defaults on. Shipping defaults off. Local delivery requires explicit postal codes.
Shipping is a configured flat fee within the store's configured country, not a carrier integration.
Phone numbers use E.164. US shipping/delivery addresses require ZIP formatting.

The tax calculation is one configured rate, rounded half-up to cents, on merchandise and optionally
the fulfillment fee. This is **not US state/local destination-tax determination**, tax advice, product
exemption handling, or cross-border compliance. Before public launch, determine the applicable
jurisdiction/product rules and integrate a tax service if a single fixed rate is insufficient.
Regulated goods such as alcohol require a separate compliance implementation before sale.

## Verification

```powershell
python -m ruff check .
python -m ruff format --check .
python -m alembic check
python -m pytest --cov --cov-report=term-missing
python -m pip_audit -r requirements.txt
```

The PostgreSQL race tests need an isolated test database whose name ends in `_test`:

```powershell
$env:STORE_TEST_DATABASE_URL = "postgresql+psycopg://user:password@localhost:5432/store_test"
python -m pytest tests/test_postgres.py -q
```

Each race test creates/removes only its own randomly named schema. Tests exercise last-unit oversell,
concurrent checkout retries, and repeated cancellation. They are explicitly skipped without PostgreSQL;
passing SQLite tests do **not** prove PostgreSQL lock behavior. GitHub Actions supplies PostgreSQL 17.
The migration test checks upgrade, metadata consistency, and downgrade only on a disposable local DB.

## Deployment and operations

1. Provision a separate PostgreSQL database and strong persistent secret for each store.
2. Set `STORE_ENVIRONMENT=production`, `STORE_DATABASE_URL=postgresql+psycopg://...`,
   `STORE_SECRET_KEY`, JSON `STORE_ALLOWED_HOSTS`, and HTTPS `STORE_ALLOWED_ORIGINS`.
   Use database TLS for hosted connections; never use development/test database credentials.
3. Back up the DB, then run `alembic upgrade head` once as a release job, not in every web worker.
4. Initialize store and owner with the CLI. Configure correct tax and fulfillment via owner endpoints.
5. Run `uvicorn app.main:create_app --factory --host 0.0.0.0 --port 8000 --no-access-log --no-proxy-headers`
   behind a trusted HTTPS reverse proxy. The API serves no frontend or Django Admin.
6. Monitor `/api/v1/health`, 5xx rates, conflicts, and disk/database capacity. Configure proxy request
   timeouts/connection limits and rate limits. The API bounds write bodies to 1 MiB and stores write,
   login, and guest lookup rate counters in the database; unauthenticated reads also need edge limiting.
7. Run `python -m app.cli cleanup` daily for expired sessions and rate windows. Guest cart retention,
   customer-data deletion policy, backup retention and a tested restore process are operator decisions.

`Dockerfile` provides a non-root API image; build from `backend/`. Docker is optional for local work.
The image expects migrations/bootstrap as separate jobs and does not contain `.env` or local databases.
Keep proxy access logs free of sensitive query strings; do not log request bodies or cookies.
Do not enable proxy-header trust without restricting allowed proxy IPs; IP throttling otherwise becomes
spoofable. The default does not trust forwarded IPs, so a reverse proxy also needs per-client edge limits.

Rollback means redeploying the previous compatible image and restoring a verified backup if needed.
Never downgrade a populated production database merely to roll back application code. Keep old versions
compatible with additive migrations. There is no live Django data migration: the archive was an unfinished
local prototype, and the new API/database is independent.

The customer storefront is in [`../frontend/`](../frontend/README.md), with its own build and tests.
The staff/owner workspace is at `/admin`; see [`../frontend/ADMIN.md`](../frontend/ADMIN.md).
Not included yet: staff-user provisioning UI, password recovery/email verification, transactional notifications,
saved address book, file-upload storage, carrier tracking integration, discounts, reviews, subscriptions,
and payments. Add these as separate tested slices rather than coupling them to the catalog core.
