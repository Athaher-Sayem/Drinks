# 100-product general-store example

This branch, **`demo/general-store`**, starts from reusable backend/storefront/admin checkpoint
**`e7dc132`** on `feature/reusable-fastapi-store`. Keep that base branch for stores without fixtures.
The original prototypes and existing store database are unchanged. See the root
[feature overview](../README.md) for the available storefront and admin capabilities.

The pinned catalog contains **100 products, 10 categories, and 10 products per category**: Kitchen,
Tableware, Home, Stationery, Garden, Accessories, Sports, Technology, Personal Care, and Pantry.
Each has one standard variant, an illustrative USD price, opening stock of 25, and a local photo.
These are sample merchandise records, not supplier offers. There are no online payments.

## Run locally (Windows)

Install the backend and frontend dependencies as described in their READMEs first. From the repo root:

```powershell
backend\.venv\Scripts\python.exe demo/serve.py
```

In another terminal:

```powershell
Set-Location frontend
$env:STORE_API_TARGET = 'http://127.0.0.1:8004'
npm.cmd run dev -- --host 127.0.0.1 --port 5176 --strictPort
```

- Storefront: **http://127.0.0.1:5176**
- Admin: **http://127.0.0.1:5176/admin**
- API docs: **http://127.0.0.1:8004/docs**
- Photo credits: **http://127.0.0.1:5176/photo-credits.html**

`serve.py` binds only to loopback, imports into **`demo/.local/general-store-demo.db`**, and creates
a random local owner password and session secret in **`demo/.local/access.json`**. Open that ignored
file privately to sign in. Never commit, share, or publish it. On Windows, file protection relies on
your user-profile ACLs; `chmod` is not a substitute for Windows ACL configuration.
This demo uses its own `general_store_demo` cookie, not the original store's cookie.

The existing API/frontend on 8000/5173 may remain running. A branch alone does not isolate data;
these separate database, secret, cookie name, and ports do. Both apps are same-origin proxied.

## Repeatable offline import

```powershell
backend\.venv\Scripts\python.exe demo/import_catalog.py --dry-run
backend\.venv\Scripts\python.exe demo/import_catalog.py --confirm-demo
```

Import requires no network or Pillow. New databases are initialized with the existing Alembic
migrations. Only SQLite files named `*_demo.db` or `general-store-demo.db` are accepted by the CLI.
First import requires **every application table to be empty**; populated unmarked databases and
non-SQLite targets are rejected, even if a description contains the demo marker. A private
`demo_catalog_state` table records successful initialization and imported product IDs, independently
of editable store/product fields. Subsequent imports are no-ops: stock, prices, visibility, slugs,
attributes, descriptions, and newly added products all survive a restart. Use a new named demo
database for a fresh copy, not your real database. Do not manually edit the private state table.

`--database <path>` selects another explicitly named demo database; `--asset-origin <origin>` sets
the frontend origin for newly imported photo URLs (default `http://127.0.0.1:5176`). Changing the
origin on an existing import does not rewrite edited records. Choose it before the first import.
Only a **fresh** import guarantees 100 active products; subsequent edits intentionally remain intact.

## Photo provenance and licenses

`catalog.json` pins the individual Wikimedia Commons file page, creator, original/download URLs,
license name and URL, modification notice, and SHA-256 for every image. The app serves the 100
content-hashed WebP files in `frontend/public/demo-photos/`; browsing does not hotlink Commons.
The public credits page and product detail credits provide source and license links.

Only **CC0, CC BY, and CC BY-SA** records with creator information and no reported restrictions were
selected. CC BY-SA images and their resized/converted versions retain their original image license;
the application code is not relicensed by those image licenses. Changes are resizing, orientation
normalization, and WebP conversion. No content edits or AI-generated replacements were made.

Sources were collected online and manually reviewed in contact sheets. They are representative:
some show multiple items, older designs, or visible brands. They do not establish the material,
specifications, availability, or authenticity of merchandise, and creators/brands do not endorse the
store. Before commercial use, replace them with exact supplier-approved product photos and review
source pages for trademarks, personality/property rights, or metadata errors. Commons metadata is
not a legal warranty. See [Commons reuse guidance](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia).

To deliberately refresh the snapshot (requires network and manual review):

```powershell
backend\.venv\Scripts\python.exe -m pip install -r demo/requirements.txt
backend\.venv\Scripts\python.exe demo/collect_photos.py
backend\.venv\Scripts\python.exe demo/review_photos.py
backend\.venv\Scripts\python.exe demo/build_credits.py
backend\.venv\Scripts\python.exe demo/import_catalog.py --dry-run
```

`products.json` defines the names/searches/prices. `photo-selections.json` records curated candidate
overrides. Inspect all four ignored `demo/.cache/review-*.jpg` sheets after any change; search results
are not reliable product matches. Cached API responses are working data, not shipped evidence.
Retain only referenced generated assets when preparing a new snapshot, regenerate credits, and use
a fresh demo database; existing imports deliberately keep their prior URLs. Do not remove assets
still referenced by a deployed store. Image filenames change when their bytes change.

## Verification and production limits

```powershell
backend\.venv\Scripts\python.exe -m pytest -c backend/pyproject.toml backend/tests/test_general_catalog.py
Set-Location frontend
npm.cmd test
npm.cmd run build
$env:STOREFRONT_TEST_PREVIEW = '1'
npm.cmd run test:demo
```

The browser suite verifies all 100 photos, nine catalog pages without duplicate/missing products,
category counts, filters, credits, accessibility, and 320–1440px layouts. It starts the local demo if
not already running; it only reads the catalog and does not exercise paid checkout or change stock.
Admin and storefront regression suites remain available as `test:admin` and `test:e2e`.

For a real store, start from the reusable checkpoint and provision a separate production PostgreSQL
database, HTTPS host, secret, owner, tax configuration and approved catalog. The loopback SQLite
runner, sample zero tax, sample prices/stock, and representative photos are **not production setup**.
