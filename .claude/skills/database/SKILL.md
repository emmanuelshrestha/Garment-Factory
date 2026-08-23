---
name: database
description: Use when modifying schema, migrations, SQL queries, or persistence in the garment factory system. Covers foreign keys, parameterized SQL, transactions, and append-only ledger protection.
---

# Database Skill

Use when modifying schema, migrations, queries, or persistence.

Rules:

- Foreign keys ON.
- Use parameterized SQL.
- Never construct SQL with user input.
- Prefer explicit SQL over ORM abstractions.
- Every schema change is a migration.
- Never modify historical financial records destructively.
- Never delete stock ledger records.
- Test constraints at the database level where possible.

For any multi-table mutation:

```
BEGIN IMMEDIATE
-> perform all writes
-> validate
-> COMMIT
```

On any failure:

```
ROLLBACK
```

Before changing schema, inspect existing migrations and DATABASE.md.

## Environment facts (verified 2026-08-23)

- Node 22 bundles **SQLite 3.51.3** via `node:sqlite`.
- `PRAGMA foreign_keys` is **per connection** — set it every time a
  connection opens, not once in a migration.
- `STRICT` tables are available and reject both strings and floats in
  INTEGER columns. See DECISIONS.md D014.
- `VACUUM INTO` works while the database is open — this is the backup
  mechanism.
- All SQLite access belongs in `db/sqlite.ts` and nowhere else (D006).
