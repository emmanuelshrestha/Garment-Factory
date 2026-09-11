# Garment Factory Management System — Architecture Specification

## 1. System Overview

The Garment Factory Management System is a lightweight, production-grade operating system designed for an apparel manufacturing business. It governs the end-to-end commercial lifecycle: product catalogue, Colour × Size variant matrices, finished stock ledgers, customer orders, stock reservations, partial deliveries, immutable billing, multi-method payment settlement (cash, bank, cheques), and customer statements.

```
┌─────────────────────────────────────────────────────────────┐
│                    User Interface Layer                     │
│  • React 19 SPA (Vite + Tailwind CSS + TanStack Query)      │
│  • Interim Operator Console (console/index.html)            │
│  • Print Stylesheets for A4/A5 Invoices & Delivery Slips    │
└──────────────────────────────┬──────────────────────────────┘
                               │ JSON over HTTP (Loopback/LAN)
┌──────────────────────────────▼──────────────────────────────┐
│                    HTTP & API Layer (src/http)              │
│  • Node.js native http server (node:http)                   │
│  • Zero-dependency typed router & route matchers            │
│  • Request body parser with 1 MB payload limits             │
│  • Input validators & structured error mappers              │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                 Services Layer (src/services)               │
│  • Transaction ownership: BEGIN IMMEDIATE ... COMMIT        │
│  • Business use cases (Catalogue, Orders, Invoices, etc.)   │
│  • Single stock movement writer                             │
│  • Audit trail logging (audit_log)                          │
└──────────────┬───────────────────────────────┬──────────────┘
               │                               │
┌──────────────▼──────────────┐ ┌──────────────▼──────────────┐
│   Domain Layer (src/domain) │ │    Database Layer (src/db)  │
│  • Pure TypeScript logic    │ │  • SQLite via node:sqlite   │
│  • No DB, no HTTP, no I/O   │ │  • STRICT tables only       │
│  • Money (integer minor)    │ │  • WAL mode & Foreign Keys  │
│  • Date arithmetic (AD)     │ │  • Versioned SQL migrations │
│  • State machines & bands   │ │  • Vacuum into hot backups  │
└─────────────────────────────┘ └─────────────────────────────┘
```

---

## 2. Core Architectural Invariants

### 2.1 Pure Domain Layer (`src/domain/`)
- Contains pure business logic and mathematical rules.
- Free of any side-effects, database connections, HTTP dependencies, or filesystem access.
- Sub-millisecond unit test execution.

### 2.2 Transaction Ownership in Services (`src/services/`)
- Every operation modifying more than one table or requiring transactional integrity runs inside a `BEGIN IMMEDIATE ... COMMIT` block via `transaction(db, callback)`.
- If any validation or business invariant fails, the transaction automatically performs a `ROLLBACK`.
- Transactions refuse to nest, preventing accidental double-transaction states.

### 2.3 Single Writer for Finished Stock
- All finished stock additions, deductions, and adjustments MUST pass through `recordStockMovement` in `src/services/stock.ts`.
- Direct insertion into `stock_movements` from other services is strictly prohibited.
- `stock_movements` is append-only: rows are never updated or deleted.
- Physical on-hand stock is calculated dynamically as `SUM(qty_delta)`. No cached on-hand column exists in the MVP.

### 2.4 Money Representation & Precision
- Money is strictly stored as integer minor units (paisa / cents). Floating point is forbidden in all financial math.
- Rounding rule: **Round half away from zero, applied once per line**. Document totals are sums of rounded lines and are never re-rounded.
- Every financial document records its explicit currency (`NPR`, `INR`, `USD`) and document-time exchange rate (`fx_rate_to_npr`).

### 2.5 Document Immutability & Numbering
- Issued invoices and dispatched deliveries are immutable. Revisions use void-and-reissue.
- Sequential document numbering format: `PREFIX-YYYY-NNNNN` (e.g. `ORD-2026-00001`, `INV-2026-00001`), resetting on 1 January of the document's calendar year.
- Number generation occurs within the document creation transaction to ensure gapless, conflict-free sequences.

---

## 3. Technology Stack

- **Runtime**: Node.js 22 LTS (utilizing native TypeScript type stripping).
- **Architecture & Scaling Roadmap**: Detailed plan for transitioning from single-factory to multi-tenant cloud SaaS is documented in [SCALING.md](SCALING.md).
- **Backend Dependencies**: `0` (Zero external packages; uses `node:sqlite`, `node:http`, `node:crypto`, `node:test`, `node:assert/strict`).
- **Database**: SQLite 3.51.3 embedded with `STRICT` tables, `PRAGMA foreign_keys = ON`, `PRAGMA journal_mode = WAL`, and `PRAGMA busy_timeout = 5000`.
- **Frontend**: React 19, Vite, Tailwind CSS, TanStack React Query.
