# Reusable Store

A FastAPI commerce backend for **one independent store per deployment and database**.
Use the same code for a drink shop, clothing store, home-goods shop, or other physical-goods catalog.
Products, categories, attributes, variants, branding, currency, taxes, and fulfillment are configurable.
Payments are intentionally not implemented.

## Start here

See [`backend/README.md`](backend/README.md) for installation, API usage, tests, and deployment.
See [`frontend/README.md`](frontend/README.md) for the connected storefront and browser checks.

- API: FastAPI, Pydantic, SQLAlchemy, Alembic, PostgreSQL in production.
- Storefront: React, TypeScript, Vite; **http://127.0.0.1:5173** during development.
- Local development: SQLite; no database server is required for a first run.
- Documentation: `/docs`, `/redoc`, `/openapi.json`.
- Existing `Index.html`, `utility.js`, `styles.css`, and `showcase-design/` are unchanged prototypes.
  They are **not connected to the new API yet**.
- The unfinished Django attempt is preserved locally in ignored `django-backend-archive/`.
  It is not part of the active API, deployment, tests, or supported implementation.

## Current scope

The backend provides the catalog, accounts, session carts, payment-free orders, inventory controls,
and protected management APIs. This is not a multi-tenant marketplace, subscriptions engine,
digital-download fulfillment system, alcohol-compliance service, or US-wide tax determination engine.

The connected storefront lives in `frontend/`: Space Grotesk + DM Sans, pale lavender, navy text,
indigo accents, an interactive catalog hero, product discovery, bag, accounts, order lookup, and
payment-free checkout. Customer data remains in the reusable API, separate from the visual design.
Staff and owners have a connected `/admin` workspace for catalog, inventory, orders, and owner-only
store settings. See [`frontend/ADMIN.md`](frontend/ADMIN.md) for secure owner bootstrap and operations.
