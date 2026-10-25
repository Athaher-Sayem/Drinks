# Store administration

Open **http://127.0.0.1:5173/admin** while the storefront and API are running. The storefront account
dialog also links to the workspace when a staff member or owner is signed in. The admin bundle is
loaded separately; public storefront visitors do not download its application code/styles.

## Owner access

There is no public privileged registration and no default production password. If the store has no
owner yet, create one from `backend/` with its virtual environment active:

```powershell
python -m app.cli create-admin --email owner@example.com --name "Store owner"
```

The CLI securely prompts for a password. Use that email/password on `/admin`. Customer registration
never grants staff access. Staff can manage catalog, inventory, and orders; store settings are
owner-only, enforced by the backend as well as the UI. Password recovery and staff-user provisioning
UI are not included.

## Daily work

- **Overview:** actual catalog records, open/pending orders, and active variants with at most five
  units in stock. These are operational counts, not revenue or payment analytics.
- **Categories:** create/edit names, slugs, descriptions, and active status. Inactive categories stay
  visible here for recovery; their products disappear from the public catalog.
- **Products:** search/filter/page through active and inactive records. Edit descriptions, categories,
  feature/active flags, attributes, and up to ten complete photo URLs. Publish only images you have
  permission to use. File uploads/storage are not part of this panel.
- **Variants:** create SKU/name/options/price/opening stock; edit name/options/price/active state.
  Existing SKUs are immutable in this UI. Metadata writes require the current variant version.
- **Inventory:** signed quantity adjustments require a reason, UUID idempotency key and expected
  version. A successful retry is returned without applying stock twice. On stale-version rejection,
  close/reopen the editor to load the current stock before submitting a new adjustment.
- **Orders:** filter/page through orders, view private contact/address/notes, lines, snapshot totals
  and status timeline. Only valid pickup/shipping transitions are offered; the server revalidates them.
  Cancellation restores order stock only once; dispatched/completed orders cannot be cancelled.
- **Store settings:** owner-only name/contact/country/timezone/currency, fixed tax and fulfillment.
  Currency cannot change once prices exist. Blank contact/tax fields preserve existing values.
  Shipping is a flat fee within the configured country, and local delivery uses an explicit postal list.

## Failed or uncertain requests

Private admin reads are cleared on detected authentication/authorization loss and on sign-out.
Access is also checked on focus/visibility and every 30 seconds while visible. Login/logout signals
invalidate other same-origin tabs; unchanged access checks preserve open editor drafts.
Login/logout responses are reconciled with `/session`; passwords/session bearer cookies are never
stored in localStorage. Cookies remain HttpOnly and all writes use CSRF protection.

Inventory requests persist only an opaque key, payload fingerprint, quantity change, and expected
version in localStorage—not the reason text or customer data. Web Locks serialize writes across tabs.
After a timeout, retry the exact same quantity/version/reason. A reload preserves the original key
and version. Do not clear browser storage or submit a different adjustment while it is unresolved.
When the API proves a stale-version adjustment was not applied (after checking the key under the
variant lock), its guard is retired so you can reload stock and explicitly submit a fresh adjustment.
If the original reason/session cannot be recovered, ask the operator to reconcile inventory history
before making a new adjustment. HTTP errors do not automatically trigger write retries.

Use separate databases, secrets, cookie names and hostnames for different stores. A Git branch alone
does not separate data. As with the storefront, production requires HTTPS, appropriate security
headers, a same-origin `/api` reverse proxy, PostgreSQL, backups, and edge rate limiting.

## Verification

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:admin
```

`test:admin` starts its own loopback-only FastAPI server on **8002**, Vite on **5175**, and a fresh
temporary SQLite database. It never uses `backend/.env`'s database. The synthetic fixture accounts
and fixed test-only passwords in the test files are not production credentials. On Windows it uses
`backend/.venv/Scripts/python.exe`; override `STORE_E2E_PYTHON` if your environment differs. CI uses
the setup-python executable. Install Chromium with `npx playwright install chromium` first.
