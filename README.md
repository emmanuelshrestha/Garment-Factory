# Garment Factory OS

**A production-grade operating system for a jacket factory — not a CRUD demo.**

Orders, finished-stock ledgers, colour × size matrices, deliveries, immutable invoices, cheque-aware payments, and customer statements. Built so that money and stock cannot silently go wrong.

[Quick start](#quick-start) · [Screenshots](#interface--workflows) · [Architecture](#architecture) · [Business rules](#the-rules-that-make-this-real) · [Documentation](#documentation)

<p align="center">
  <img src="docs/assets/social-preview.png" alt="Garment Factory OS — operations briefing, stock matrix, and cheque-aware receivables" width="100%" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-22_LTS_%7C_24-339933?logo=nodedotjs&logoColor=white" alt="Node.js 22 LTS | 24" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/SQLite-STRICT_+_WAL-003B57?logo=sqlite&logoColor=white" alt="SQLite STRICT WAL" />
  <img src="https://img.shields.io/badge/backend_deps-0-black" alt="Zero backend dependencies" />
  <img src="https://img.shields.io/badge/tests-node:test-0A3069" alt="node:test" />
  <img src="https://img.shields.io/badge/UI-React_19_+_Vite_+_Tailwind-61DAFB?logo=react&logoColor=black" alt="React 19" />
</p>

---

## Why this exists

Most “ERP” side projects are forms over tables. This one is a **ledger**.

A real jacket factory cannot treat stock as a cached integer, money as a float, or an issued invoice as an editable row. This system was designed against those failure modes for a manufacturing business that sells in **NPR / INR / USD**, maintains finished garments in a colour × size matrix, and still clears physical cheques.

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

## Interface & Workflows

| Operations Briefing | Colour × Size Stock Matrix |
|:---:|:---:|
| ![Dashboard](docs/assets/01-dashboard.png) | ![Stock matrix](docs/assets/03-stock-matrix.png) |

| Order Entry Matrix | Delivery & Dispatch |
|:---:|:---:|
| ![Order entry](docs/assets/04-order-entry.png) | ![Delivery](docs/assets/06-delivery-dispatch.png) |

| Issued Invoice (Print View) | Cheque Drawer & PDC Management |
|:---:|:---:|
| ![Invoice](docs/assets/07-invoice-print.png) | ![Payments](docs/assets/08-payments-cheques.png) |

---

## What it does

| Module | What the factory actually uses |
|---|---|
| **Dashboard** | Morning operations briefing: active orders, shortage pieces, red/amber stock, packing lists, pending cheques in drawer, receivables by currency. |
| **Catalogue** | Products, colours, sizes, variants, customers. Product default price with optional size overrides (e.g., XL priced higher than S). |
| **Stock matrix** | Colour × size grid of *finished* garments. On-hand balance is computed as `SUM(qty_delta)` from an append-only ledger. Red/amber/green inventory bands per variant. |
| **Orders** | Draft → Confirm. Confirmation **reserves** stock without moving it. Shortages are surfaced as explicit manufacturing signals. |
| **Deliveries** | Draft packing list, then dispatch. Dispatch consumes active reservations and writes `delivery_out`. Partial deliveries automatically re-reserve remaining items. |
| **Invoices** | Bill dispatched items. Optional discounts require a mandatory reason. Issued invoices are strictly immutable. |
| **Payments** | Cash, bank transfer, and post-dated cheques (PDC). Pending cheques do **not** reduce receivables until deposited and cleared. Bounces restore balance with full audit history. |
| **Statements** | Real-time ledger per customer, per currency. Unallocated cleared funds are tracked as **advances**, never silently netted off across currencies. |
| **Returns (चलन फिर्ता)** | Record inward returned goods. Restocks finished items via append-only `return_in`. Supports void-and-reissue billing adjustments. |
| **Cutting stock** | Separate raw-materials ledger tracking cutting tables. Transfers to finished stock require explicit verification. |
| **Expenses & purchases** | Company overheads and fabric purchases tracked separately from finished goods inventory. |
| **Employee earnings** | Piece-rate production logs per tailor with monthly and yearly payout schedules. |

---

## The rules that make this real

These are enforced business invariants, verified by automated tests. Full documentation: [`docs/BUSINESS-RULES.md`](docs/BUSINESS-RULES.md) and [`DECISIONS.md`](DECISIONS.md).

| # | Rule | Consequence |
|---|---|---|
| D003 | **Stock means packed finished garments** | Cutting and sewing write nothing to finished stock. |
| D004 | **Allocation is a reservation, not a movement** | `available = on_hand − active_allocations`. Confirming an order never empties the shelf. |
| D005 | **Issued invoices are immutable** | Corrections require void-and-reissue with an explicit mandatory reason. |
| D007 | **Money is integer minor units** | Zero float rounding issues. Calculations are stored in paisa/cents via integer math. |
| D009 | **Variant price override** | `Jacket A / XL = 850`, `S = 800` without creating duplicate catalogue records. |
| D011 | **Foreign orders priced in order currency** | Cross-border orders are stored natively in target currencies (INR/USD), never auto-converted. |
| D013 | **Append-only ledgers** | `stock_movements`, `invoice_lines`, `payment_allocations`, and `audit_log` are insert-only. |
| D014 | **SQLite `STRICT` tables** | The database engine rejects loose typings, strings in integer fields, or malformed data. |
| D018 | **One rounding rule** | Round half away from zero, once per line. Totals are direct sums, never re-rounded. |
| D019 | **Low-stock warning bands** | Red when at/below minimum threshold; amber within 25% above minimum. |
| D021 | **Dispatch is the physical event** | A draft delivery is paperwork. Physical stock availability is re-verified at dispatch. |
| D026–D029 | **Cheques and currency isolation** | Pending cheques do not equal cleared cash. Bounces restore invoices. Currencies never cross-settle. |

```text
available   = on_hand − active_allocations
on_hand     = SUM(stock_movements.qty_delta)             -- never a cached column
outstanding = issued invoices − cleared allocations       -- isolated per currency
```

---

## Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│  React 19 SPA (Vite, Tailwind CSS, TanStack Query)          │
│  Colour × size matrices · print stylesheets · CSV export    │
└──────────────────────────────┬──────────────────────────────┘
                               │ JSON / HTTP  (cookie session)
┌──────────────────────────────▼──────────────────────────────┐
│  node:http  +  typed router  (~80 endpoints, no framework)  │
└──────────────────────────────┬──────────────────────────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        ▼                      ▼                      ▼
┌───────────────┐      ┌─────────────────┐    ┌─────────────────┐
│  domain/      │      │  services/      │    │  db/            │
│  pure TS      │      │  own the tx     │    │  node:sqlite    │
│  no I/O       │      │  BEGIN IMMEDIATE│    │  STRICT, WAL, FK│
│  money, FX,   │      │  single stock   │    │  numbered .sql  │
│  state machine│      │  writer         │    │  migrations     │
└───────────────┘      └─────────────────┘    └─────────────────┘
```

**Zero backend dependencies.** Node 22+ built-ins only (`node:sqlite`, `node:http`, `node:crypto`, `node:test`). TypeScript runs with native type stripping (`--experimental-strip-types`) with no compile step on the server.

The **Frontend** builds into static assets via Vite, served directly by the Node backend HTTP process. Production runs as **one process, one port, and one SQLite file**.

---

## Quick start

**Requires [Node.js 22.6+](https://nodejs.org/) or Node.js 24+.**

```bash
# 1. Run migrations
npm run migrate

# 2. Seed owner account + demo garments, variants, and stock
npm run seed:demo

# 3. Build the UI
cd frontend
npm install
npm run build
cd ..

# 4. Start the server
npm start
```

Open [http://localhost:4000](http://localhost:4000).

Default owner login (from seed):

| Field | Value |
|---|---|
| Username | `owner` |
| Password | `change-me` (or `$GARMENT_OWNER_PASSWORD` if configured prior to seeding) |

---

## Project structure

```text
backend/
  src/
    domain/          Pure domain rules: money math, FX, stock invariant checks
    services/        Use-cases and transactional services (BEGIN IMMEDIATE ... COMMIT)
    db/              sqlite.ts, migrate.ts, numbered STRICT SQL migrations
    http/            Router, server configuration, resource controllers
  scripts/           Database seeders, hot backups, and ledger verification scripts
  tests/
    unit/            Pure domain tests (zero I/O)
    integration/     API and database integration tests against isolated SQLite files
frontend/
  src/components/    Dashboard, colour × size matrix, orders, deliveries, billing
  src/styles/        Tailwind styling and print stylesheets (A4 delivery and invoice slips)
  dist/              Compiled production SPA bundle
docs/                Architecture specs, operational decision records, and assets
data/                SQLite databases and automated hot backups
```

---

## Documentation

| Document | What it covers |
|---|---|
| **[docs/SCREENSHOTS.md](docs/SCREENSHOTS.md)** | Frame setup, resolution standards, and capture guide |
| **[docs/API.md](docs/API.md)** | Full HTTP JSON endpoints and schema contracts |
| **[docs/BUSINESS-RULES.md](docs/BUSINESS-RULES.md)** | Formal business rules and ledger calculation logic |
| **[docs/WORKFLOWS.md](docs/WORKFLOWS.md)** | Lifecycle walkthroughs: Order → Dispatch → Invoice → Payment |
| **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** | Software design, system layers, and operational invariants |
| **[docs/DATABASE.md](docs/DATABASE.md)** | SQLite schema definitions, STRICT mode rules, and ledger schemas |
| **[docs/RUNBOOK.md](docs/RUNBOOK.md)** | Process management, automated backups, and database recovery |
| **[DECISIONS.md](DECISIONS.md)** | Architectural Decision Records (ADRs) |
| **[DEPLOY.md](DEPLOY.md)** | Production environment setup, cPanel, and bare-metal deployment |

---

## Tests & Verification

Run the full automated test suite using Node's native test runner:

```bash
npm test
```

Verify physical ledger consistency and recalculate all balances against transactions:

```bash
npm run verify-ledger
```

Trigger an online hot backup without stopping the server (via SQLite `VACUUM INTO`):

```bash
npm run backup
```

---

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `GARMENT_HOST` | `127.0.0.1` | Bind address. Use `0.0.0.0` for local network access (requires auth). |
| `GARMENT_PORT` | `4000` | HTTP port. Automatically adapts to host sockets if set. |
| `GARMENT_DB_PATH` | `data/garment.db` | Path to active SQLite database file. |
| `GARMENT_WEB_DIST_DIR` | `frontend/dist` | Directory containing compiled frontend assets. |
| `GARMENT_OWNER_PASSWORD` | `change-me` | Initial password applied during database seed. |
| `GARMENT_REQUIRE_AUTH` | `false` (dev) / `true` (prod) | Enforce cookie-based session verification. |
| `GARMENT_BACKUP_DIR` | `data/backups` | Target directory for database backups. |

---

## What this is not (yet)

| Deferred | Why |
|---|---|
| Automated bundle barcode scanning (cut → sew → finish → pack) | Sales, inventory, and wage tracking are Slice 1; floor barcode scanning is Slice 2. |
| Raw material automated debiting | Fabric roll purchases are recorded in expenses; they do not auto-convert to jackets without cutting room slips. |
| Multi-warehouse routing | Tailored for a single physical factory floor (Decision D002). |
| Multi-tenant SaaS billing | Architecture isolates each factory via dedicated databases; automated subscription billing is deferred. |
| Cancelling part-delivered orders | Refused with explicit error until an operational return-or-keep policy is specified. |

---

## License

See [LICENSE](LICENSE). Published as a reference architecture and production portfolio piece.