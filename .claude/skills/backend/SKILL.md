---
name: backend
description: Use when building, modifying, or debugging backend domain logic, services, database queries, transactions, and HTTP endpoints in the Garment Factory system.
---

# Backend Skill

Use when working on the Node.js TypeScript backend.

## Architectural Boundaries

1. **Zero External Dependencies**:
   - The backend runs on Node 22 LTS with native TypeScript type stripping.
   - Use built-in modules only: `node:sqlite`, `node:http`, `node:crypto`, `node:test`, `node:assert/strict`, `node:fs`, `node:path`.
   - Never import external packages on the backend without explicit owner approval.

2. **Strict Layering**:
   - `domain/`: Pure TypeScript functions. No database, no HTTP, no filesystem, no network I/O. Deterministic, fast, unit-tested.
   - `services/`: Business operations. The ONLY layer that opens transactions. Every multi-table write runs inside `BEGIN IMMEDIATE ... COMMIT`, rolling back on any error.
   - `db/`: Database access isolated to `src/db/sqlite.ts`. Raw parameterised SQL only. No ORM.
   - `http/`: Typed routing, request parsing, input validation, and HTTP status mapping. Never contain business logic.

3. **Transaction Discipline**:
   ```typescript
   // Multi-table write in services/
   export function recordOperation(db: Database, params: Params): Result {
     return transaction(db, (tx) => {
       // 1. Validate preconditions
       // 2. Perform writes
       // 3. Record audit log
       // 4. Return result
     });
   }
   ```

4. **Money & Numbers**:
   - All monetary amounts stored and computed as integer minor units (paisa / cents).
   - Never use JavaScript floating point arithmetic for money.
   - Use `roundHalfAwayFromZero` from `domain/money.ts` once per line.

5. **Stock Ledger Guarantee**:
   - `src/services/stock.ts` (`recordStockMovement`) is the single writer to `stock_movements`.
   - Never update or delete `stock_movements`.
   - On-hand stock is always `SUM(qty_delta)`.

6. **Error Handling**:
   - Throw structured domain errors: `ValidationError`, `NotFoundError`, `BusinessRuleError`, `ConflictError`.
   - The HTTP layer maps these to appropriate status codes (400, 404, 422, 409) with JSON payloads.
