/**
 * The ONLY file in this project that imports `node:sqlite`.
 *
 * Everything else talks to the database through the `Db` and `Tx` types
 * defined here. If SQLite is ever swapped out, this file is the seam.
 *
 * See DECISIONS.md D006 (SQLite) and D014 (STRICT tables).
 */

import { DatabaseSync } from 'node:sqlite';

export type Db = DatabaseSync;

/**
 * A handle that only exists inside a transaction.
 *
 * Services that write must accept a `Tx`, never a bare `Db`. That makes
 * "this write is inside a transaction" a fact the type system carries
 * rather than a convention someone has to remember.
 */
export type Tx = {
  readonly db: Db;
};

export type OpenOptions = {
  /** Milliseconds to wait for a competing writer before failing. */
  busyTimeoutMs?: number;
  /** Set false only for in-memory scratch databases. */
  walMode?: boolean;
};

const DEFAULT_BUSY_TIMEOUT_MS = 5000;

/**
 * Open a database and apply the pragmas this system depends on.
 *
 * `foreign_keys` is per-connection in SQLite and defaults to OFF, so it
 * must be set here on every single connection. Forgetting it would let
 * orphaned invoice lines and stock movements be written silently, which
 * is exactly the class of failure this system cannot tolerate.
 */
export function openDatabase(filename: string, options: OpenOptions = {}): Db {
  const db = new DatabaseSync(filename);

  const busyTimeoutMs = options.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS;
  const walMode = options.walMode ?? true;

  if (walMode) {
    db.exec('PRAGMA journal_mode = WAL');
  }
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(`PRAGMA busy_timeout = ${busyTimeoutMs}`);
  // Durable enough for a single-machine factory app, and much faster than
  // FULL. WAL + NORMAL survives an application crash; only an OS-level
  // crash or power loss can lose the most recent commits, which is what
  // the backup routine exists for.
  db.exec('PRAGMA synchronous = NORMAL');

  assertPragma(db, 'foreign_keys', 1);

  return db;
}

function assertPragma(db: Db, name: string, expected: number): void {
  const row = db.prepare(`PRAGMA ${name}`).get() as Record<string, unknown> | undefined;
  const actual = row ? Object.values(row)[0] : undefined;
  if (Number(actual) !== expected) {
    throw new Error(`PRAGMA ${name} is ${String(actual)}, expected ${expected}`);
  }
}

/**
 * Run `fn` inside a single write transaction.
 *
 * `BEGIN IMMEDIATE` takes the write lock up front rather than upgrading
 * mid-transaction, so two concurrent writers fail fast instead of
 * deadlocking after one of them has already read stale data. That matters
 * for stock: availability is computed by reading the ledger, and the
 * decision must not be based on a snapshot another writer is changing.
 *
 * Any thrown error rolls the whole transaction back and is re-thrown
 * unchanged. There is no partial commit and no swallowed failure.
 */
export function transaction<T>(db: Db, fn: (tx: Tx) => T): T {
  if (inTransaction(db)) {
    // Nested transactions would make the inner COMMIT a lie: the outer
    // one could still roll back. Savepoints would be needed, and no
    // business operation here requires them.
    throw new Error('transaction() cannot be nested; pass the existing Tx down instead');
  }

  db.exec('BEGIN IMMEDIATE');
  let result: T;
  try {
    result = fn({ db });
  } catch (error) {
    rollbackQuietly(db);
    throw error;
  }
  db.exec('COMMIT');
  return result;
}

/**
 * Read-only work. Kept separate from `transaction` so that a caller who
 * only wants to read never takes the write lock.
 */
export function readOnly<T>(db: Db, fn: (tx: Tx) => T): T {
  return fn({ db });
}

function inTransaction(db: Db): boolean {
  return db.isTransaction;
}

function rollbackQuietly(db: Db): void {
  try {
    db.exec('ROLLBACK');
  } catch {
    // If the rollback itself fails the transaction was already resolved.
    // The original error is the one worth reporting, so it is not masked.
  }
}

/**
 * Hot backup. `VACUUM INTO` produces a consistent copy while the database
 * is open and in use, which a plain file copy does not.
 */
export function backupTo(db: Db, destination: string): void {
  const stmt = db.prepare('VACUUM INTO ?');
  stmt.run(destination);
}

export function closeDatabase(db: Db): void {
  db.close();
}
