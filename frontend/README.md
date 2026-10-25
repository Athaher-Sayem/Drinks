# Connected storefront

React + TypeScript + Vite, with self-hosted Space Grotesk and DM Sans. The lavender/navy/indigo
landing page has a live catalog explorer, category filters, server-side search and pagination,
product details, a persistent session bag, accounts, guest order lookup, and payment-free checkout.
The original root HTML/CSS/JS prototypes are not used or modified.

The staff/owner workspace is at **`/admin`**. See [`ADMIN.md`](ADMIN.md) for bootstrap, permissions,
catalog/inventory/order workflows, and isolated browser tests.

## Run locally

Use Node.js **24 LTS** (the build also runs on supported newer Node releases).
First start and seed the API using [`../backend/README.md`](../backend/README.md).
Then, in a separate terminal from `frontend/`:

```powershell
npm.cmd ci
npm.cmd run dev
```

Open **http://127.0.0.1:5173**. On Linux/macOS use `npm` instead of `npm.cmd`.
The dev server proxies `/api` to `http://127.0.0.1:8000`, preserving Host for same-origin cookie/CSRF
checks. No API keys, customer information, or backend secret belong in a `VITE_*` variable.
Copy `.env.example` to `.env` only if you need overrides; the app works without it.

Store name, country, currency, categories, products, tax, and fulfillment come from the API.
`VITE_STOREFRONT_NAME` optionally changes only the displayed brand name. Generic illustrated artwork
is used when a product has no usable photo. The hero shows actual category counts, not sales metrics;
catalogs over 100 products display an explicitly labeled snapshot while the collection is paginated.

## Verification

```powershell
npm.cmd test
npm.cmd run build
npm.cmd audit
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

Browser tests need a **disposable, seeded demo API** on port 8000. They create test accounts/orders,
modify test bags, and cancel successful test orders. Never run them against a real store.
Unit tests do not require the API. Browser tests include lost checkout responses, denied retries,
cross-tab recovery, stale quotes, accounts, failure/empty states, axe accessibility checks, focus,
and overflow at 320, 390, 768, 1024, and 1440px.

To exercise the production bundle locally after building:

```powershell
$env:STOREFRONT_TEST_PREVIEW = "1"
npm.cmd run test:e2e
```

This starts Vite preview on port 4173. CI uses this mode automatically.
`node scripts/inspect.mjs` captures five full-page screenshots in ignored `artifacts/` while the dev
server is running. Generated Playwright traces/screenshots are ignored; they can contain test
contact information and private order keys, so treat them as sensitive and use synthetic data only.

## Checkout safety and privacy

- Cookies are HttpOnly; CSRF tokens stay in memory. Session initialization is single-flighted.
- Checkout reviews a server-generated cart snapshot and `quote_token`. The API rejects changes to
  reviewed contents/prices/totals instead of silently ordering a different bag. A rejection requires
  a fresh review; successful idempotent replay is checked before the current bag.
- Before submitting, the browser persists only an opaque UUID, a SHA-256 payload fingerprint, and
  the opaque quote fingerprint in **localStorage**. Customer names, contact details, addresses,
  passwords, and guest lookup keys are not stored there. Web Locks serialize checkout across tabs.
- After an uncertain result, the same key is retained even if a later retry receives a 4xx. Bag
  edits are blocked while unresolved. Re-entering the exact original details can recover
  the receipt even after reload/tab closure and even if the successful attempt emptied the bag.
- Don’t clear browser data or change browsers to retry an uncertain order. Lost/expired session
  cookies, changed customer details, or unavailable storage can require contacting the store.
  Signing out remains available for privacy, but keeps the unresolved guard and may prevent replay
  in the old session. Authentication responses are reconciled with the server, even after timeouts.
  Checkout requires a secure context (HTTPS or localhost), working localStorage, and Web Locks.
- Guest receipts include a private lookup key. Explicitly download the receipt before closing it;
  the key is kept only in memory, not in a URL or browser storage. Signed-in orders are in the account.
- No payment is requested, charged, or implied by an order status.

## Production deployment

Run `npm ci && npm run build` in CI and deploy `dist/` as static files. Vite preview is only for
verification, not a production server. Serve the storefront over HTTPS and route `/api/` on that
same origin to the independently deployed FastAPI service, preserving the path and appropriate Host.
Configure API allowed hosts/origins for the deployed site. Use a separate API/database/secret/cookie
and domain per store. Rebuild if a public `VITE_*` setting changes.

Serve hashed `assets/` with long immutable caching; serve `index.html` with revalidation. Never
cache `/api` responses. Configure TLS, security headers, trusted image hosts, edge rate limiting,
and a restore-tested PostgreSQL backup before launch. For rollback, redeploy the previous static
bundle and a compatible API; do not clear pending checkout keys as part of deployment.

Staff-user provisioning UI, password recovery/email verification, transactional email, advanced tax/compliance,
and payments remain out of scope. Automated axe checks do not replace a manual screen-reader audit.
