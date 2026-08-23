# Current Work

## Phase

Phase 2 — Building slice 1 (Sales), backend first

## Current task

`services/stock.ts` — the single writer of stock movements, and the only
source of on-hand and available quantities.

## Status

Unblocked. All four open decisions are resolved (D017-D020) and the owner
has said to start building rather than polishing documents.

## Completed

- Environment inspected and validated (Node 22.23.2, SQLite 3.51.3, git 2.34.1)
- PLAN.md, CLAUDE.md, DECISIONS.md (D001-D020), seven `.claude/skills/`
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
- `tests/helpers/testDb.ts` — real SQLite file, real migrations, per test
- 60 tests passing: money, fx, dates, database integrity, document numbering

## Next (in this order)

1. `services/stock.ts` — `getOnHand`, `getAvailable` (= on-hand − active
   allocations), `recordMovement`, `adjustStock` with mandatory reason.
   Never negative, never a cached quantity column (D019 bands for display).
2. Products, colours, sizes, variants — including bulk variant generation
3. Customers
4. Orders — price snapshot with per-line override, shortage panel
5. Allocation — reserve on confirm, release on cancel
6. Deliveries — partial, consumes allocation, emits the only outward movements
7. Invoices — built from delivery lines, immutable once issued
8. Payments — cash/bank/cheque, pending cheques tracked separately
9. `http/` server + JSON routes, then the React `web/` UI

## Blocked

Nothing.

## Do not work on

- Production (cutting, sewing, finishing, QC, packing, rework) — slice 2
- Payroll
- Raw materials
- Tax
- Advanced accounting
- Multi-warehouse
- Worker management
- Mobile application
