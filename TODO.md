# Current Work

## Phase

Phase 2 — Building slice 1 (Sales), backend first

## Current task

Invoices — built from delivered quantities, immutable once issued.

## Status

Unblocked. All four Step-0 decisions are resolved (D017–D020).

Working agreement on pace, 2026-08-23: full rigour and mutation testing on
money, stock, invoices and payments; thin fast coverage on everything else
(codes, names, list filters). A visible screen comes before deliveries and
invoices so progress can be seen rather than read about.

Three questions are waiting on the owner and none blocks work: OPEN-5
(cancelling a part-delivered order), OPEN-6 (who can reach the server, and
the owner's password) and OPEN-7 (goods coming back after dispatch).

## Completed

- Environment inspected and validated (Node 22.23.2, SQLite 3.51.3, git 2.34.1)
- PLAN.md, CLAUDE.md, DECISIONS.md (D001–D020), seven `.claude/skills/`
- `git init`, `.gitignore`, `.nvmrc`, `package.json` (zero dependencies)
- `src/config.ts` — env-overridable paths so tests and the factory PC differ
- `src/db/sqlite.ts` — the only importer of `node:sqlite`; WAL, foreign keys,
  busy_timeout, `BEGIN IMMEDIATE` transactions that refuse to nest, `VACUUM INTO`
- `src/db/migrate.ts` — ordered migrations, one transaction each, refuses to run
  if an applied migration's checksum changed
- `src/db/migrations/001_init.sql` — 26 tables, all STRICT (D014)
- `src/domain/errors.ts`, `money.ts` (D015, D018), `fx.ts` (D011)
- `src/domain/dates.ts` — AD only (D020)
- `src/domain/documentNumber.ts` + `src/services/documentNumbers.ts` (D017)
- `src/domain/stock.ts` + `src/services/stock.ts` — the single writer of stock
  movements; append-only ledger, never negative, no cached quantity column,
  D019 bands, adjustments with a mandatory reason
- `src/services/settings.ts`
- `src/domain/pricing.ts` + `src/services/catalogue.ts` — D009 resolution,
  idempotent variant grid, price changes append to history and never rewrite it
- `src/services/customers.ts` — parameterised search, never deleted
- `src/domain/orders.ts` + `src/services/orders.ts` — price snapshot frozen at
  confirmation (D005), reservation without stock movement (D004), partial
  reservation with a reported shortage, top-up when stock arrives, release on
  cancel, shortage roll-up per variant
- `tests/helpers/testDb.ts` — real SQLite file, real migrations, per test
- 148 tests passing. The orders allocation and price-snapshot rules were
  mutation-tested: four deliberate breakages, all caught (one test was
  strengthened because it initially missed a repricing-at-confirmation bug)
- `src/http/` — router, JSON I/O with a 1 MB cap, errors mapped by type;
  routes for catalogue, customers, stock and orders; no business logic
- `src/main.ts` — migrates on startup, loopback by default (OPEN-6)
- `scripts/seed.ts` — owner account, `--demo` sample catalogue and stock
- `console/index.html` — interim operator console: stock matrix with bands,
  customers, take an order, confirm it, see the shortage. Not the approved
  React UI; it exists so the flow can be used now
- `scripts/smoke.sh` — drives the whole flow against a running server
- `src/domain/deliveries.ts` + `src/services/deliveries.ts` — D021: draft moves
  nothing, dispatch writes the only outward movements, re-planned from live
  figures at dispatch, reservation consumed then re-made, movement carries the
  delivery's date; delivery routes and console controls on top
- 195 tests passing. The delivery rules were mutation-tested: 15 deliberate
  breakages, all caught. One real bug was found this way — an over-reserved
  variant refused every delivery (D021 sub-rule)

## Next (in this order)

1. Invoices — built from delivery lines, immutable once issued,
   void-and-reissue
2. Payments — cash/bank/cheque, pending cheques do not reduce receivables,
   bounce restores the balance
3. Customer balances
4. `audit_log` is not written by any service, which contradicts D013 ("every
   transition writes an `audit_log` row with old and new value"). The table
   exists and the status transitions are already guarded; what is missing is
   the row. Best done once, in the services, before invoices add more
   transitions
5. The React `web/` UI as approved, once the owner has installed its
   dependencies
6. `scripts/backup.ts` and `scripts/verify-ledger.ts` (referenced by
   package.json, not written yet)

## Blocked

Nothing.

OPEN-5 is recorded but does not block: cancelling an order that has already
been part-delivered is refused with a clear message until the owner decides
what should happen to the undelivered remainder.

OPEN-7 is recorded but does not block: a dispatched delivery cannot be
cancelled, because the goods have gone and the ledger row stands. A stock
adjustment with a reason corrects a mistaken dispatch today; a proper
returns flow needs the owner's answers first.

## Do not work on

- Production (cutting, sewing, finishing, QC, packing, rework) — slice 2
- Payroll
- Raw materials
- Tax
- Advanced accounting
- Multi-warehouse
- Worker management
- Mobile application
