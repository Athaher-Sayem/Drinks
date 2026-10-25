# Reusable Store

A reusable, payment-free commerce application with a connected **customer storefront**, a
**staff/owner admin panel**, and a **FastAPI backend**. Use the same application for drinks,
clothing, home goods, or another physical-goods store, with a separate deployment and database
for each business.

**No online payment is requested or collected. An order status is not proof of payment.**

## Start here

- [Customer storefront features](#customer-storefront-features)
- [Admin panel features](#admin-panel-features)
- [Backend and security features](#backend-and-security-features)
- [100-product general-store demo](#100-product-general-store-demo)
- [Run locally](#run-locally)
- [Testing and verification](#testing-and-verification)
- [Limitations and production readiness](#limitations-and-production-readiness)

### Branches

- **`feature/reusable-fastapi-store`**: reusable API, storefront, and admin implementation.
  The original reusable checkpoint is `e7dc132`, without the 100-product general-store fixtures.
- **`demo/general-store`**: extends that checkpoint with the isolated 100-product catalog,
  local credited photos, demo runner, and demo-specific browser tests. This README describes
  the application on that branch; demo-only features are identified below.
- **`main`**: the earlier static prototypes; it is not the connected application's branch.

Choose the branch you want before following its setup instructions. Switching branches does not
isolate databases: each store still needs its own database, secret, cookie name, and hostname.

## Customer storefront features

### Design and navigation

- Responsive desktop, tablet, and mobile layouts with pale lavender, navy, and indigo styling.
- Self-hosted **Space Grotesk** headings and **DM Sans** body text.
- Split landing-page hero, collection section, store-approach section, and shopping instructions.
- Interactive catalog visualization with real category counts, category selection, reset,
  and a product preview that opens its details. Catalogs larger than 100 products show a labeled
  snapshot rather than presenting partial counts as the full catalog.
- Store name and currency read from the API; an optional frontend variable can override the
  displayed brand name. The footer includes the configured contact-email link when available.
- Keyboard-accessible dialogs with focus management, Escape-to-close where appropriate,
  focus restoration, labeled controls, loading states, empty states, and actionable error messages.

### Product discovery

- Browse live products from the backend, not a hardcoded frontend catalog.
- Server-side product search and category filters, including an **All goods** reset.
- Paginated collection with **12 products per page**, result counts, and Previous/Next controls.
- Product cards with category, name, short attributes, starting price, photo, and availability.
- Product detail dialogs with description, attributes, variant options, current price, and stock
  availability. Exact stock counts are reserved for staff responses.
- Variant selection before adding products with multiple options to the bag.
- Disabled purchasing for unavailable products and variants.
- Illustrative fallback artwork when a usable product photograph is unavailable.
- On the demo branch, product-detail photo credits and links to source, license, and full attribution.

### Shopping bag and checkout

- Server-backed session bag that survives page reloads while the session remains valid.
- Add products, increase/decrease quantities, remove items, and review line totals and subtotal.
- Guest shopping and signed-in shopping, with server-side guest/account cart merging at login.
- Availability and quantity validation; carts do not reserve inventory before checkout.
- Checkout with customer name, email, E.164 phone number, and optional order notes.
- **Store pickup**, **domestic flat-fee shipping**, or **local delivery to configured postal codes**,
  depending on the owner's settings. Address fields appear for shipping/delivery.
- Server-generated review of items, tax, fulfillment fees, and final total before submission.
- A reviewed-cart fingerprint prevents silently ordering changed quantities, details, or prices.
- Order confirmation with reference, items, status, and amount breakdown.
- Duplicate-order protection using idempotency keys. Uncertain submissions can be recovered after
  a lost response, reload, or tab closure by retrying the same original details in the same session.
- Cross-tab checkout serialization and a guard against bag edits while an order attempt is unresolved.

### Accounts and order tracking

- Customer registration, email/password sign-in, and sign-out.
- Signed-in account dialog with recent order history and individual order summaries.
- Guest order lookup using the order reference and a private lookup key, without putting that key
  in the URL or browser storage.
- Downloadable guest order-details text file containing the reference and private lookup key.
  Save it before closing the receipt; the application does not email it automatically.
- Customer/guest cancellation of **pending** orders; stock is restored only once.
- Staff and owner accounts also receive a link to the admin workspace from their account dialog.

## Admin panel features

Open **`/admin`** on the storefront's origin. The admin application is lazy-loaded separately
from the public storefront. Permissions are enforced by the API, not only by hidden buttons.

### Access and roles

- **Customers:** shop and view their own orders; no admin access.
- **Staff:** manage categories, products, variants, inventory, and orders.
- **Owners** (the API's `admin` role): all staff capabilities plus store settings.
- Staff/owner sign-in and sign-out, with no public privileged-account registration.
- Owner accounts created through a secure CLI password prompt, not a default production password.
- Access revalidation on focus, visibility changes, same-origin login/logout signals, and every
  30 seconds while visible. Detected expired/revoked access clears private admin caches and editors.
- Responsive workspace navigation, page headings, dialogs, feedback, and scrollable data tables.

### Overview

- Total product records and active-product count.
- Open-order count and orders awaiting confirmation.
- Stock-alert count for active variants in active products/categories with **five or fewer units**.
- Shortcuts to products, orders, and inventory, with operational reminders.
- Counts reflect backend data; the panel does not invent revenue or payment analytics.

### Categories

- List active and inactive categories.
- Create and edit category name, slug, description, and active state.
- Reactivate hidden categories instead of losing their records.
- Inactive categories hide their products from the public catalog.

### Products and variants

- Search product names/slugs, filter by category and active state, and paginate results.
- Create and edit product name, slug, category, description, active state, and featured flag.
- Store up to **10 HTTP(S) photo URLs** per product; the current storefront displays the first image.
- Edit flexible product attributes as `key=value` pairs with duplicate/format validation.
- Deactivate products while preserving records referenced by orders.
- Create variants with name, unique SKU, price, opening stock, options, and active state.
- Edit existing variant names, prices, options, and active state using version-checked writes.
  Existing SKUs are read-only in the admin UI.
- A product needs an active variant to appear in the public collection.

### Inventory

- View per-variant SKU, stock on hand, and record version within paginated product results.
- Search product names/slugs, filter category/visibility, and show only low-stock variants.
- Add or remove stock through a signed whole-number adjustment with a required reason.
- Version checks reject stale adjustments instead of overwriting newer inventory.
- Idempotency keys prevent a retried adjustment from being applied twice.
- Durable retry recovery across reloads/tabs without storing the reason text in localStorage.
- Explicit stale-version proof can retire a definitely unapplied intent; uncertain requests remain
  guarded until recovered or reconciled. Stock is not silently reset by a product metadata edit.

### Orders

- Paginated order list with status filter, reference, date, customer, fulfillment, and total.
- Order details with private customer contact/address, notes, item/SKU snapshots, quantities,
  tax, fulfillment fees, currency, total, and status-event timeline.
- Fulfillment-compatible status transitions:
  - Pickup: `pending → confirmed → processing → ready → completed`.
  - Shipping/local delivery: `pending → confirmed → processing → dispatched → completed`.
- Staff cancellation before dispatch/completion, with one-time inventory restoration.
- Server validation of status transitions and recording of the acting account in status events.

### Owner-only store settings

- Store name, description, contact email, country code, and timezone.
- One currency per store: **USD, GBP, EUR, CAD, AUD, NZD, BDT, or INR**.
  Currency cannot change after variant prices exist without an explicit migration.
- Fixed tax rate and whether fulfillment fees are taxable. Unconfigured tax blocks checkout;
  demo zero tax is not a legal tax determination.
- Enable/disable pickup and domestic shipping; configure the flat shipping fee.
- Configure local-delivery fee and eligible postal codes; an empty postal list disables delivery.
- Blank contact-email/tax inputs preserve existing values in the current settings form.

For detailed workflows and recovery guidance, see [the admin guide](frontend/ADMIN.md).

## Backend and security features

- **FastAPI**, **Pydantic**, **SQLAlchemy**, and **Alembic** with SQLite for local development
  and PostgreSQL for production.
- Generic category/product/variant models, flexible attributes/options, catalog pagination,
  search, category/featured filters, and API-only minimum/maximum price filters.
- Account/session APIs, including API-level profile updates, server-side carts, quotes,
  payment-free orders, private guest lookup, and protected staff/owner endpoints.
- Snapshot order pricing/currency/details, inventory mutation records, order status events,
  transactional checkout, and PostgreSQL row locking for concurrent stock operations.
- Argon2 password hashing, opaque HttpOnly session cookies, hashed session tokens at rest,
  CSRF protection for writes, explicit allowed origins/hosts, and role-based authorization.
- Request validation, bounded write bodies, database-backed write/login/lookup rate limits,
  and `Cache-Control: no-store` API responses. Public reads also need production edge rate limiting.
- Browser localStorage holds opaque checkout/inventory retry metadata, not customer contact details,
  passwords, session bearer cookies, or guest lookup keys. CSRF tokens stay in memory.
- CLI commands for local secret initialization, empty-store initialization, owner creation,
  small sample seeding, and expired-session/rate-window cleanup.
- Interactive API documentation at **`/docs`**, **`/redoc`**, and **`/openapi.json`**.
- Non-root backend Docker image and GitHub Actions backend/frontend verification workflows.

See [backend setup, endpoint reference, and deployment](backend/README.md) and
[frontend architecture and checkout safety](frontend/README.md).

## 100-product general-store demo

**Available on `demo/general-store`, separate from the reusable checkpoint.**

- Exactly **100 initial products**, **10 categories**, and **10 products per category**:
  Kitchen, Tableware, Home, Stationery, Garden, Accessories, Sports, Technology, Personal Care,
  and Pantry. Each starts with one Standard variant and sample USD pricing/stock.
- **100 local, content-hashed WebP images** with pinned Commons source, creator, license,
  modification notice, and SHA-256 metadata. No Commons hotlinking is needed while browsing.
- CC0/CC BY/CC BY-SA image attribution on product details and **`/photo-credits.html`**.
- A visible demonstration banner; prices, stock, and photography are examples, not supplier offers.
- Guarded offline import: first import requires empty application tables in a separately named
  SQLite demo database. Private import identity makes later imports no-ops, preserving normal
  admin edits, added products, prices, visibility, and stock across restarts.
- Separate loopback API on **8004**, storefront on **5176**, database, random secret/owner password,
  and session-cookie name. The original development store on 8000/5173 is not overwritten.
- Optional photo collection, manual-review contact sheets, and credits-page generation utilities.

Read [the demo guide](demo/README.md) for import options, photo reuse conditions, and runtime details.
Representative photos are not evidence of exact materials, specifications, or brand endorsement.

## Run locally

Requirements: **Python 3.11+**, **Node.js 24 LTS**, and npm. Commands below use Windows PowerShell;
on macOS/Linux use `python3`, the virtual environment's `bin/python`, and `npm` instead of `npm.cmd`.

### Option A: 100-product demo

On `demo/general-store`, from the repository root, install dependencies once:

```powershell
py -3.11 -m venv backend/.venv
backend\.venv\Scripts\python.exe -m pip install -r backend/requirements-dev.txt
npm.cmd ci --prefix frontend
```

Start the demo API:

```powershell
backend\.venv\Scripts\python.exe demo/serve.py
```

In a second terminal:

```powershell
Set-Location frontend
$env:STORE_API_TARGET = 'http://127.0.0.1:8004'
npm.cmd run dev -- --host 127.0.0.1 --port 5176 --strictPort
```

Open the [storefront](http://127.0.0.1:5176), [admin panel](http://127.0.0.1:5176/admin),
[API docs](http://127.0.0.1:8004/docs), or [photo credits](http://127.0.0.1:5176/photo-credits.html).
The runner creates the demo owner's credentials in **`demo/.local/access.json`**. Read that file
privately to sign in; it is ignored by Git and must never be published. Pillow and internet access
are needed only to regenerate photos, not to run the pinned demo.

### Option B: reusable development store

Follow [backend quick start](backend/README.md#quick-start--windows-powershell), then
[frontend quick start](frontend/README.md#run-locally).

- API: **http://127.0.0.1:8000**.
- Storefront: **http://127.0.0.1:5173**.
- Admin: **http://127.0.0.1:5173/admin**.
- Use `seed-demo` only for the small development sample. For a real empty store, use
  `python -m app.cli init-store --name "Your Store"` instead, then configure tax/fulfillment.
- From `backend/` with its virtual environment active, create an owner with:

```powershell
python -m app.cli create-admin --email owner@example.com --name "Store owner"
```

The CLI securely prompts for the password. Public customer registration never grants staff access.
Use the same hostname consistently; mixing `localhost` and `127.0.0.1` can break cookie behavior.

## Testing and verification

From `frontend/`:

```powershell
npm.cmd test
npm.cmd run build
npm.cmd audit
npx.cmd playwright install chromium
npm.cmd run test:admin
npm.cmd run test:e2e
npm.cmd run test:demo
```

- `test:admin` starts an isolated temporary API/database on **8002** and frontend on **5175**.
- `test:e2e` requires a **disposable seeded API on 8000**; it creates test accounts/orders and
  changes carts. Never point it at a real customer store.
- `test:demo` is demo-branch-only and checks all 100 images, all nine collection pages,
  category counts, filters, credits, automated accessibility, and responsive layouts.
- Set `$env:STOREFRONT_TEST_PREVIEW = '1'` after building to exercise the production storefront/demo
  bundle, with no conflicting Vite server already running on the suite's port.
- Run browser suites sequentially with their defaults. If running concurrently, give each a
  different `--output=artifacts/<suite-name>` directory to avoid shared Playwright artifact cleanup.

From `backend/` with its virtual environment active:

```powershell
python -m ruff check .
python -m ruff format --check .
python -m pytest --cov --cov-report=term-missing
python -m pip_audit -r requirements.txt
```

On the demo branch, also check its Python utilities from `backend/`:

```powershell
python -m ruff check --config pyproject.toml ../demo
python -m ruff format --check --config pyproject.toml ../demo
```

Latest local implementation verification: **64 backend tests passed**, **3 PostgreSQL-only tests
skipped**, **94.57% backend application coverage**, **23 frontend unit tests passed**, and browser
suites of **8 admin + 14 storefront + 3 demo tests passed**. Build, lint, and dependency audits passed.
These are local results, not a claim that remote CI has already passed. PostgreSQL concurrency tests
need a disposable PostgreSQL database; GitHub Actions provisions PostgreSQL 17.
Automated accessibility checks do not replace manual keyboard/screen-reader review.

## Limitations and production readiness

Not currently implemented:

- Online payments, refunds, invoices, subscriptions, or payment reconciliation.
- Public staff registration, staff-user management UI, password recovery, or email verification.
- Transactional email/SMS, saved address book, customer profile-editing UI, or automatic receipt email.
- Product reviews, wishlists, discount/coupon workflows, or an image-upload/media-storage service.
- Carrier labels/tracking, calculated shipping rates, advanced US destination tax, or regulated-goods
  compliance such as alcohol age verification/licensing.
- Multi-tenant marketplaces, shared cross-store databases, digital downloads, or currency conversion.

Before public launch, provision a separate production PostgreSQL database and persistent secret,
serve HTTPS, reverse-proxy `/api` on the storefront's origin, configure allowed hosts/origins,
run migrations, set correct tax/fulfillment, replace sample content, and establish monitoring,
edge rate limits, security headers, and restore-tested backups. Checkout/inventory recovery needs
a secure context, working browser storage, and Web Locks. Vite preview and the loopback SQLite
demo runner are not production servers.

Follow individual photo licenses and verify non-copyright restrictions before commercial reuse.
Sample zero tax, prices, stock, and representative photos are **not production configuration**.

## Repository guide

- [`frontend/`](frontend/): connected storefront, admin application, unit tests, and browser tests.
- [`frontend/ADMIN.md`](frontend/ADMIN.md): owner bootstrap, permissions, and administration guide.
- [`backend/`](backend/): FastAPI app, migrations, CLI, tests, and deployment instructions.
- [`demo/`](demo/): demo-branch catalog manifest, importer, local runner, and photo-source utilities.
- [Implementation record](docs/superpowers/plans/2026-10-25-admin-and-general-store.md): scope,
  decisions, review fixes, and verification evidence.
- Existing `Index.html`, root `utility.js`/`styles.css`, and `showcase-design/` are preserved static
  prototypes, not entry points to the connected application.
- The unfinished Django attempt remains a local ignored archive, not part of this implementation.

Local databases, `.env` files, generated owner credentials, dependency directories, build output,
and browser-test artifacts are excluded from Git. Do not publish them.
