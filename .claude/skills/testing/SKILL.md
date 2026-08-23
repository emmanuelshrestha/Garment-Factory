---
name: testing
description: Use when writing or changing tests in the garment factory system. Defines the required test cases per business operation and forbids mocking the database for transactional rules.
---

# Testing Skill

Do not treat tests as an afterthought.

For every business operation:

1. test valid operation
2. test invalid operation
3. test boundary condition
4. test rollback
5. test historical integrity
6. test concurrent/conflicting operation where relevant

For database behavior use real temporary SQLite databases.

Do not mock the database when testing transactional business rules.

A passing UI is never sufficient evidence that a financial or inventory
feature works.

## How tests run in this project

- Backend: `node --test`. No test framework is installed and none is
  needed — `node:test` and `node:assert/strict` are built in.
- Integration tests create a fresh temp SQLite file per test, apply real
  migrations, and use real transactions.
- `scripts/verify-ledger.ts` recomputes on-hand for every variant from
  `stock_movements` and asserts it matches every query path. It runs as a
  test and can also be run against live data.
- The frontend cannot be executed in the build sandbox. Never claim a UI
  change is verified. Say plainly what was tested and what was not.
