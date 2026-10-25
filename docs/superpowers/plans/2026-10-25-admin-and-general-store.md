# Admin and General Store Implementation Plan

> **For agentic workers:** Execute inline using executing-plans, with test-first changes and a final independent review.

**Goal:** Deliver a reusable staff/owner admin panel, checkpoint it, then branch a separate 100-product general-store demo.
**Architecture:** Keep FastAPI authoritative for permissions, validation, inventory and order transitions. Lazy-load a React `/admin` entry sharing the existing cookie/CSRF client; keep demo imports and database separate from the reusable base.
**Tech Stack:** Existing FastAPI/SQLAlchemy/Pydantic and React/TypeScript/Vite/TanStack Query/Zod.
**Spec:** User-approved scope in this conversation: admin first; checkpoint; branch; exactly 100 mixed products with permitted matching photos; no payments.

## Global Constraints
- Retain lavender `#f4f3fb`, navy `#242440`, indigo `#5145cd`, white `#ffffff`, line `#deddea`.
- Space Grotesk headings and DM Sans body; left-aligned operational UI, quiet navigation and readable tables.
- Staff manage catalog/inventory/orders. Only owners manage store settings. No public admin registration.
- No default production credentials, secrets in source, customer data in URLs/storage, or automatic unsafe retries.
- Inventory adjustments preserve idempotency after uncertain results; stale versions require reload.
- Preserve original prototypes, user data, and uncommitted work; do not push.
- Keep demo content outside the reusable checkpoint; use a separate database.

## Review Focus
- Expired sessions or changed roles must clear private admin data and prevent mutations.
- Inactive categories/products must remain editable and recoverable by staff.
- A lost stock-adjustment response must not increment inventory twice after reload or in another tab.
- Invalid order transitions and stale inventory versions must show actionable errors.
- The catalog importer must not duplicate entries, reset existing stock, or alter a real store.

## Tasks
### 1. Staff read contracts
- [ ] Write and run failing backend tests for protected category listing, product filters, and accurate overview counts.
- [ ] Add `GET /admin/categories`, product search/category/active/low-stock filters, and `GET /admin/overview`.
- [ ] Run backend tests and lint.

### 2. Admin application
- [ ] Add failing unit tests for field parsing, transitions and durable inventory retry identity.
- [ ] Add isolated browser fixture server and failing admin browser scenarios.
- [ ] Implement `frontend/src/admin/` auth/shell, overview, catalog editor, variant editor, inventory, orders and owner settings.
- [ ] Add lazy `/admin` routing, responsive styles, loading/error/empty states and keyboard support.
- [ ] Run units/build/browser tests, inspect screenshots, fix defects and review.

### 3. Reusable checkpoint
- [ ] Document bootstrap and admin operations; extend CI to isolated admin checks.
- [ ] Verify storefront regressions and backend coverage/audits; inspect staged files for secrets/artifacts.
- [ ] Commit reusable backend/storefront/admin work on `feature/reusable-fastapi-store`.
- [ ] Create `demo/general-store` from that tested commit.

### 4. Separate 100-product demo
- [ ] Research permitted photo sources, recording source URLs and license/attribution metadata.
- [ ] Test and implement a guarded repeatable import on an isolated demo database; exactly 100 active unique products across mixed categories.
- [ ] Verify image delivery, catalog counts, filters and pagination; document reuse, review, and commit demo-only files.

## Execution record
- Starting branch: `feature/reusable-fastapi-store`, HEAD `235976c`; all earlier API/storefront additions are still uncommitted and must be preserved.
- User explicitly requested continuous implementation. No further plan approval pause is needed.
- Design: a sidebar workspace and one main work surface, not decorative analytics cards; dashboard numbers are real operational counts, never invented revenue.
- Tasks 1–2 implemented: staff read contracts, lazy admin workspace, catalog/variant editing, durable inventory retries, orders, and owner settings. Isolated admin browser suite: 8 passed; frontend units: 23 passed; build passed.
- Independent review fixed two findings with failing regressions first: revoked/cross-tab authentication now revalidates on signals/focus/visibility/30s polling; stale inventory retries are retired only on an explicit server proof after key lookup under lock.
- Photo input deliberately uses authorized remote URLs, not a new upload/storage service. Existing prototypes, customer databases, and production credentials are untouched.
