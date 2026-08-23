# Current Work

## Phase

Phase 0 — Architecture / Infrastructure

## Current task

One blocking decision remains: Bikram Sambat reference dates (DECISIONS.md
OPEN-2). Everything else needed for Step 0 is now confirmed.

## Status

BLOCKED on OPEN-2 — and on the owner's instruction to proceed

## Completed

- Environment inspected and validated (Node 22.23.2, SQLite 3.51.3, git 2.34.1, Claude Code 2.1.237)
- PLAN.md — stack, architecture, schema, invariants, slice plan, testing, data safety
- CLAUDE.md — project rules
- DECISIONS.md — D001-D019; 17 confirmed, 2 proposed
- .claude/skills/ — business-domain, database, accounting, inventory, testing, garment-production, garment-ux
- Confirmed this session: pricing with variant override (D009), one invoice across
  multiple deliveries (D010), order priced in order currency (D011), per-variant
  low-stock threshold (D012), STRICT tables (D014), document numbering
  ORD-2082-00001 resetting Shrawan 1 (D017), half-up rounding per line (D018),
  amber band at 25% above minimum (D019)

## Next (once unblocked, in this order)

1. `git init` + `.gitignore` — version control before any code exists
2. Project skeleton: `package.json`, `.nvmrc`, directory structure
3. Test harness: `node:test` runner + temp-database helper
4. `db/sqlite.ts` — connection, WAL, foreign keys, busy_timeout
5. Migration runner + `001_init.sql` (all tables STRICT per D014)
6. Transaction helper (`BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK`) with rollback test
7. `domain/money.ts` + `domain/fx.ts` — half-up rounding per D018, tested first
8. `domain/bs-date.ts` — validated against owner-supplied reference dates (OPEN-2)
9. `domain/doc-number.ts` + `document_sequences` — per D017, depends on step 8

Steps 1-7 could begin without OPEN-2. Steps 8 and 9 cannot.

## Blocked

- **OPEN-2** Bikram Sambat reference dates. Needed to validate the conversion
  table. Blocks both the printed bill and document numbering, since D017
  embeds the BS year and resets on Shrawan 1.

## Do not work on

- Production (cutting, sewing, finishing, QC, packing, rework)
- Payroll
- Raw materials
- Tax
- Advanced accounting
- Multi-warehouse
- Worker management
- Mobile application
