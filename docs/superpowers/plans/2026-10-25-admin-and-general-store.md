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
- [x] Write and run failing backend tests for protected category listing, product filters, and accurate overview counts.
- [x] Add `GET /admin/categories`, product search/category/active/low-stock filters, and `GET /admin/overview`.
- [x] Run backend tests and lint.

### 2. Admin application
- [x] Add failing unit tests for field parsing, transitions and durable inventory retry identity.
- [x] Add isolated browser fixture server and failing admin browser scenarios.
- [x] Implement `frontend/src/admin/` auth/shell, overview, catalog editor, variant editor, inventory, orders and owner settings.
- [x] Add lazy `/admin` routing, responsive styles, loading/error/empty states and keyboard support.
- [x] Run units/build/browser tests, inspect screenshots, fix defects and review.

### 3. Reusable checkpoint
- [x] Document bootstrap and admin operations; extend CI to isolated admin checks.
- [x] Verify storefront regressions and backend coverage/audits; inspect staged files for secrets/artifacts.
- [x] Commit reusable backend/storefront/admin work on `feature/reusable-fastapi-store`.
- [x] Create `demo/general-store` from that tested commit.

### 4. Separate 100-product demo
- [x] Research permitted photo sources, recording source URLs and license/attribution metadata.
- [x] Test and implement a guarded repeatable import on an isolated demo database; exactly 100 active unique products across mixed categories.
- [x] Verify image delivery, catalog counts, filters and pagination; document reuse, review, and commit demo-only files.

## Execution record
- Starting branch: `feature/reusable-fastapi-store`, HEAD `235976c`; all earlier API/storefront additions are still uncommitted and must be preserved.
- User explicitly requested continuous implementation. No further plan approval pause is needed.
- Design: a sidebar workspace and one main work surface, not decorative analytics cards; dashboard numbers are real operational counts, never invented revenue.
- Tasks 1–2 implemented: staff read contracts, lazy admin workspace, catalog/variant editing, durable inventory retries, orders, and owner settings. Isolated admin browser suite: 8 passed; frontend units: 23 passed; build passed.
- Independent review fixed two findings with failing regressions first: revoked/cross-tab authentication now revalidates on signals/focus/visibility/30s polling; stale inventory retries are retired only on an explicit server proof after key lookup under lock.
- Photo input deliberately uses authorized remote URLs, not a new upload/storage service. Existing prototypes, customer databases, and production credentials are untouched.
- Task 3 checkpoint: `e7dc132` on `feature/reusable-fastapi-store`; `demo/general-store` branched from it. No push.
- Task 4: 100 distinct sample products, 10 categories with 10 each, one variant each; 100 manually reviewed local content-hashed WebP images. Pinned Commons source/author/CC0-or-BY-or-BY-SA license/hash/change notices, product credits and public escaped credits page. No supplier availability or endorsement claims.
- Final demo review fixed two HIGH findings with four failing regressions first: populated application tables without a Store row are rejected; private `demo_catalog_state` identity allows normal description/slug/attribute edits and added products to survive restart without stock resets. `test_general_catalog.py`: 7 passed. The MEDIUM CI path finding was already fixed; both workflows now cover demo changes.
- Verification: frontend units 23 passed; isolated admin 8 passed; production storefront 14 passed; production demo 3 passed (all 100 photos, 9 pages, filters/credits/a11y and 320–1440px). Build, Ruff, dependency audits passed. Backend 64 passed, 3 PostgreSQL-only skipped, 94.57% application coverage. PostgreSQL tests require CI's disposable database.
- Test harness correction: scope the guest name assertion to the order dialog; parallel Playwright runs use separate ignored output directories to prevent artifact-cleanup races. Demo screenshots explicitly load lazy photos before capture; desktop/mobile output inspected.
- Preserved the earlier agent-created 100-product/zero-order local fixture as ignored `demo/.local/general-store-demo-before-identity.db` before initializing the finalized private-identity database. No original store data was changed.
- Live verification: demo API on loopback 8004 and Vite on loopback 5176; proxied catalog reports 100 products/10 categories, `/admin` responds 200, and the privately loaded local owner credentials successfully sign in, read the protected overview and sign out without being displayed.
- Self-evaluation (4.2/5): accuracy 4 (local SQLite and browser proof; PostgreSQL concurrency still awaits CI); completeness 4 (all requested demo/admin capabilities; photos are representative rather than supplier-exact, explicitly labeled); clarity 4 (separate runtime/reuse/license instructions, though long); actionability 5 (running URLs and ignored credential location verified); conciseness 4 (final handoff can stay short; detailed evidence lives here). Highest-value follow-ups: run PostgreSQL CI and replace representative media with exact supplier-approved photos before a real launch. The expected user assessment is a working reusable demo, not a production-ready merchandise offer.
