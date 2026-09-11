# Garment Factory OS

**A production-grade operating system for a jacket factory — not a CRUD demo.**

Orders, finished-stock ledgers, colour × size matrices, deliveries, immutable invoices, cheque-aware payments, and customer statements. Built so that money and stock cannot silently go wrong.

[Quick start](#quick-start) · [Screenshots](#screenshots) · [Architecture](#architecture) · [Business rules](#the-rules-that-make-this-real) · [Docs](#documentation)

<p align="center">
  <img src="docs/assets/social-preview.svg" alt="Garment Factory OS — operations briefing, stock matrix, and cheque-aware receivables" width="100%" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-22_LTS-339933?logo=nodedotjs&logoColor=white" alt="Node.js 22 LTS" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/SQLite-STRICT_+_WAL-003B57?logo=sqlite&logoColor=white" alt="SQLite STRICT WAL" />
  <img src="https://img.shields.io/badge/backend_deps-0-black" alt="Zero backend dependencies" />
  <img src="https://img.shields.io/badge/tests-node:test-0A3069" alt="node:test" />
  <img src="https://img.shields.io/badge/UI-React_19_+_Vite_+_Tailwind-61DAFB?logo=react&logoColor=black" alt="React 19" />
</p>

> Replace the SVG above with real captures from `docs/assets/` once you have taken them. See [`docs/SCREENSHOTS.md`](docs/SCREENSHOTS.md).

---

## Why this exists

Most “ERP” side projects are forms over tables. This one is a **ledger**.

A real jacket factory cannot treat stock as a cached integer, money as a float, or an issued invoice as an editable row. This system was designed against those failure modes, for a single factory that sells in **NPR / INR / USD**, keeps finished garments in a colour × size matrix, and still banks physical cheques.

```
Customer
  → Order          (price snapshot, reserve available stock)
  → Shortage       (production signal — does not invent finished goods)
  → Delivery       (the only event that takes garments off the shelf)
  → Invoice        (issued = immutable; corrections are void-and-reissue)
  → Payment        (cash/bank clear immediately; cheques do not)
  → Statement      (per-currency outstanding, never mixed)
```

---

## What it does

| Module | What the owner actually uses |
|---|---|
| **Dashboard** | Morning briefing: active orders, shortage pieces, red/amber stock, packing lists, cheques in the drawer, receivables by currency |
| **Catalogue** | Products, colours, sizes, variants, customers. Product default price + optional size override (XL can cost more than S) |
| **Stock matrix** | Colour × size grid of *finished* garments. On-hand is `SUM(qty_delta)` of an append-only ledger. Red / amber / green bands per variant |
| **Orders** | Draft → confirm. Confirmation **reserves** stock; it does not move it. Shortages are reported, not hidden |
| **Deliveries** | Draft packing list, then dispatch. Dispatch consumes the reservation and writes `delivery_out`. Partial deliveries re-reserve the rest |
| **Invoices** | Bill dispatched lines. Optional discount *with a mandatory reason*. Issued invoices cannot be edited |
| **Payments** | Cash, bank transfer, cheque. Pending cheques do **not** reduce receivables. Bounce restores the balance and keeps history |
| **Statements** | Per-customer, per-currency. Unallocated cleared money is an **advance**, not a silent net-off |
| **Cutting stock** | Separate ledger from finished goods. Transfer to finished is the only path that increases sellable stock |
| **Expenses / purchases** | Factory spend and raw-material purchases — purchases never touch finished stock |
| **Employee earnings** | Tailor numbers, monthly / yearly earnings (Nepali fiscal months in the UI) |

---

## The rules that make this real

These are not comments in code. They are tested invariants. Full write-up: [`docs/BUSINESS-RULES.md`](docs/BUSINESS-RULES.md) and [`DECISIONS.md`](DECISIONS.md).

| # | Rule | Consequence |
|---|---|---|
| D003 | **Stock means packed finished garments** | Cutting and sewing write nothing to finished stock |
| D004 | **Allocation is a reservation, not a movement** | `available = on_hand − active_allocations`. Confirming an order does not empty the shelf |
| D005 | **Issued invoices are immutable** | Corrections are void-and-reissue, with a mandatory reason |
| D007 | **Money is integer minor units** | No `number` floats in financial math. Paisa/cents only |
| D009 | **Variant price override** | `Jacket A / XL = 850`, `S = 800` without duplicating the product |
| D011 | **Foreign orders are priced in the order currency** | An Indian customer at ₹850 is stored as INR, not converted from NPR |
| D013 | **Append-only where it matters** | `stock_movements`, `invoice_lines`, `payment_allocations`, `price_history`, `audit_log` are insert-only |
| D014 | **SQLite `STRICT` tables** | The database itself rejects a float written into a money column |
| D018 | **One rounding rule** | Round half away from zero, once per line. Totals are sums, never re-rounded |
| D019 | **Low-stock bands** | Red at/below minimum. Amber within 25% above. Integer arithmetic |
| D021 | **Dispatch is the physical event** | A draft delivery is paperwork. Live stock is re-checked at dispatch |
| D026–D029 | **Cheques and currency** | Pending ≠ money. Bounce restores the bill. NPR does not settle a USD invoice |

```
available = on_hand − active_allocations
on_hand   = SUM(stock_movements.qty_delta)     -- never a cached column
outstanding = issued invoices − cleared allocations   -- per currency
```

---

## Screenshots

Drop captures into `docs/assets/` using the filenames below. Capture recipe: [`docs/SCREENSHOTS.md`](docs/SCREENSHOTS.md).

| Operations briefing | Colour × size stock |
|---|---|
| ![Dashboard](docs/assets/01-dashboard.png) | ![Stock matrix](docs/assets/03-stock-matrix.png) |

| Order entry matrix | Dispatch |
|---|---|
| ![Order entry](docs/assets/04-order-entry.png) | ![Delivery](docs/assets/06-delivery-dispatch.png) |

| Issued invoice (print) | Cheque drawer |
|---|---|
| ![Invoice](docs/assets/07-invoice-print.png) | ![Payments](docs/assets/08-payments-cheques.png) |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  React 19 SPA (Vite, Tailwind, TanStack Query)              │
│  Colour × size matrices · print stylesheets · CSV export    │
└──────────────────────────────┬──────────────────────────────┘
                               │ JSON / HTTP  (cookie session)
┌──────────────────────────────▼──────────────────────────────┐
│  node:http  +  typed router  (~80 endpoints, no framework)  │
└──────────────────────────────┬──────────────────────────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        ▼                      ▼                      ▼
┌───────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  domain/      │    │  services/      │    │  db/            │
│  pure TS      │    │  own the tx     │    │  node:sqlite    │
│  no I/O       │    │  BEGIN IMMEDIATE│    │  STRICT, WAL, FK│
│  money, FX,   │    │  single stock   │    │  numbered .sql  │
│  state machines│    │  writer         │    │  migrations     │
└───────────────┘    └─────────────────┘    └─────────────────┘
```

**Backend dependencies: none.** Node 22 built-ins only (`node:sqlite`, `node:http`, `node:crypto`, `node:test`). TypeScript runs with native type stripping — no `tsc` step on the server.

**Frontend** is the one place npm is used: React 19, Vite, Tailwind 4, TanStack Query. `npm run build` emits `web/dist`, which the Node process serves. Production is **one process, one port, one SQLite file**.

Structural rules that hold by construction:

- `src/domain/` is pure. Every money, stock, and state-machine rule is unit-testable without a database.
- `src/services/` is the only layer that opens transactions.
- One function writes `stock_movements`. Nothing else may.
- On-hand is computed from the ledger. There is no cached quantity column.

Longer form: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · [`PLAN.md`](PLAN.md).

---

## Quick start

**Requires [Node.js 22.6+](https://nodejs.org/) (LTS).** The backend will not run on Node 20.

```bash
# 1. Schema
npm run migrate

# 2. Owner account + demo jackets / customers / opening stock
npm run seed:demo

# 3. Build the UI (first time, and after UI changes)
cd web
npm install
npm run build
cd ..

# 4. Run
npm start
```

Open [http://localhost:4000](http://localhost:4000).

Default owner (from seed):

| | |
|---|---|
| Username | `owner` |
| Password | `change-me` (or `$GARMENT_OWNER_PASSWORD` if you set it before seeding) |

The server binds **loopback** (`127.0.0.1`) by default. That is deliberate — the API can move money and stock. To serve the LAN, set `GARMENT_HOST=0.0.0.0` and turn authentication on. See [`.env.example`](.env.example) and [`DEPLOY.md`](DEPLOY.md).

### Demo catalogue (`npm run seed:demo`)

| | |
|---|---|
| Products | Bomber Jacket, Puffer Jacket, Denim Jacket |
| Colours | Black, Navy Blue, Olive, Maroon |
| Sizes | S, M, L, XL (matrix column order, not alphabetical) |
| Customers | Himalaya Traders, Everest Outfitters, Kathmandu Retail House |
| Stock | Opening balances mixed so the matrix shows red / amber / green |

Seed is idempotent. It will not overwrite existing rows.

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Runtime | Node.js 22 LTS | Native TypeScript stripping, `node:sqlite`, `node:test` |
| Database | SQLite 3, `STRICT`, WAL, foreign keys ON | One factory, one writer. Backup is copying a file (`VACUUM INTO`) |
| HTTP | `node:http` + ~150-line typed router | ~80 JSON routes. No framework, no plugin soup |
| Money | Integer minor units + BigInt intermediates | Floats are a production incident waiting to happen |
| Auth | scrypt + httpOnly session cookie | `node:crypto` only |
| UI | React 19, Vite 6, Tailwind 4, TanStack Query | Installed by the operator; the factory PC never runs Vite |

Rejected, on purpose: PostgreSQL (one writer does not need it), Prisma/Drizzle (explicit SQL is an advantage for ledgers), Fastify (plugins we do not need), Electron (cannot serve the LAN).

---

## Project structure

```
src/
  domain/          Pure rules: money, FX, dates, stock, orders, invoices, payments
  services/        Use-cases. Own BEGIN IMMEDIATE … COMMIT
  db/              sqlite.ts, migrate.ts, numbered STRICT migrations
  http/            router, server, per-resource routes
web/
  src/components/  Dashboard, matrices, orders, billing, cheques, earnings
  src/styles/      App + print (A4 invoices / delivery slips)
tests/
  unit/            Domain, no I/O
  integration/     Services + HTTP against a temp SQLite file
docs/              Architecture, business rules, API, screenshot recipe
scripts/           seed, backup, ledger verification
```

---

## Documentation

| Document | What it is |
|---|---|
| **[docs/SCREENSHOTS.md](docs/SCREENSHOTS.md)** | Exact shots to take, framing, filenames |
| **[docs/GITHUB.md](docs/GITHUB.md)** | Bio, About blurb, topics, pin, first-push checklist |
| **[docs/API.md](docs/API.md)** | HTTP JSON surface |
| **[docs/BUSINESS-RULES.md](docs/BUSINESS-RULES.md)** | Codified operational rules with decision IDs |
| **[docs/WORKFLOWS.md](docs/WORKFLOWS.md)** | Order → dispatch → invoice → payment |
| **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** | Layers and invariants |
| **[docs/DATABASE.md](docs/DATABASE.md)** | Schema, STRICT, ledgers |
| **[docs/RUNBOOK.md](docs/RUNBOOK.md)** | Start, backup, restore, verify |
| **[DECISIONS.md](DECISIONS.md)** | Every business and technical decision, who decided it |
| **[PLAN.md](PLAN.md)** | Original MVP specification |
| **[DEPLOY.md](DEPLOY.md)** | Docker and bare metal |
| **[QUICK-START.md](QUICK-START.md)** | Operator walkthrough |
| **[CONTRIBUTING.md](CONTRIBUTING.md)** | How to change a ledger without breaking it |
| **[SECURITY.md](SECURITY.md)** | Auth, bind address, what not to commit |

---

## HTTP API

The Node process serves `/api/*` as JSON and the SPA from `web/dist`.

```
GET  /api/health
POST /api/auth/login            POST /api/auth/logout          GET /api/auth/me

GET  /api/dashboard
GET  /api/products              POST /api/products
GET  /api/customers             GET  /api/customers/:id/statement
GET  /api/orders                POST /api/orders/:id/confirm
POST /api/deliveries/:id/dispatch
POST /api/invoices              POST /api/invoices/:id/void
POST /api/payments              POST /api/payments/:id/clear
POST /api/payments/:id/bounce
GET  /api/stock                 POST /api/stock/adjustments
GET  /api/cutting-stock
GET  /api/receivables           GET  /api/cheques/pending
```

Full list, status codes, and error shape: [`docs/API.md`](docs/API.md).

---

## Tests

```bash
npm test
```

Uses Node’s built-in runner. No test framework to install.

Covered, among other things:

- Money: float rejection, half-away-from-zero, line totals never re-rounded
- FX: document-time rate, NPR identity, INR/USD reporting
- Stock: append-only ledger, never negative, allocation ≠ movement, red/amber bands
- Orders: price snapshot, reservation, shortage reporting, freeze after confirm
- Deliveries: draft moves nothing; dispatch is all-or-nothing; cannot steal another order’s reservation
- Invoices: immutability, discount requires a reason, void-and-reissue
- Payments: pending cheque is not money; bounce restores the bill; currency matching
- Document numbers: `ORD-2026-00001` gapless per type per year; rollback does not burn a number
- HTTP: validation, 404s, transaction rollback on handler failure

Ledger integrity against a live file:

```bash
npm run verify-ledger
```

Hot backup while the server is running (SQLite `VACUUM INTO`):

```bash
npm run backup
```

---

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `GARMENT_HOST` | `127.0.0.1` | Bind address. `0.0.0.0` is LAN — do not do this unauthenticated |
| `GARMENT_PORT` | `4000` | HTTP port |
| `GARMENT_DB_PATH` | `data/garment.db` | SQLite file |
| `GARMENT_WEB_DIST_DIR` | `web/dist` | Built SPA |
| `GARMENT_OWNER_PASSWORD` | `change-me` | Used only when seeding the owner |
| `GARMENT_REQUIRE_AUTH` | off unless `NODE_ENV=production` | Force session on API routes |
| `GARMENT_BACKUP_DIR` | `data/backups` | `VACUUM INTO` target |

Copy [`.env.example`](.env.example). Never commit `.env` or `data/*.db`.

---

## What this is not (yet)

Honesty is part of the documentation.

| Deferred | Why |
|---|---|
| Full shop-floor production (cut → sew → finish → QC → pack) | Sales/inventory core is Slice 1. Production is Slice 2 |
| Raw-material inventory as a second ledger | Purchases are recorded; they do not become finished stock |
| Multi-warehouse | One physical factory (D002) |
| Multi-tenant SaaS billing | Roadmap only — [`docs/SCALING.md`](docs/SCALING.md) |
| Customer returns after dispatch | OPEN-7 — the system refuses to guess; it asks the owner |
| Cancelling a part-delivered order | OPEN-5 — refused with a named error until a rule is chosen |

Open decisions live at the bottom of [`DECISIONS.md`](DECISIONS.md). The code **throws** rather than inventing a business rule.

---

## License

See [LICENSE](LICENSE). This repository is published as a software portfolio piece. It is not a hosted product, and it is not your factory’s live database — never commit `data/*.db`.
