/**
 * Migration runner.
 *
 * Migrations are plain `.sql` files applied in filename order, each inside
 * one transaction. An already-applied migration is checksummed: if its file
 * has changed since it ran, the runner refuses to continue rather than
 * leaving the live database and the source tree quietly disagreeing about
 * what the schema is.
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { type Db, transaction } from './sqlite.ts';

const MIGRATIONS_DIR = join(import.meta.dirname, 'migrations');

export type MigrationResult = {
  applied: string[];
  alreadyApplied: string[];
};

export function migrate(db: Db, options: { verbose?: boolean } = {}): MigrationResult {
  ensureMigrationsTable(db);

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    throw new Error(`No migrations found in ${MIGRATIONS_DIR}`);
  }

  const recorded = new Map<string, string>();
  const rows = db.prepare('SELECT filename, checksum FROM schema_migrations').all() as Array<{
    filename: string;
    checksum: string;
  }>;
  for (const row of rows) {
    recorded.set(row.filename, row.checksum);
  }

  const applied: string[] = [];
  const alreadyApplied: string[] = [];

  for (const filename of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, filename), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const previous = recorded.get(filename);

    if (previous !== undefined) {
      if (previous !== checksum) {
        throw new Error(
          `Migration ${filename} has changed since it was applied.\n` +
            `  applied checksum: ${previous}\n` +
            `  current checksum: ${checksum}\n` +
            'Applied migrations are immutable. Add a new migration instead of editing this one.',
        );
      }
      alreadyApplied.push(filename);
      continue;
    }

    transaction(db, (tx) => {
      tx.db.exec(sql);
      tx.db
        .prepare('INSERT INTO schema_migrations (filename, checksum, applied_at) VALUES (?, ?, ?)')
        .run(filename, checksum, new Date().toISOString());
    });

    applied.push(filename);
    if (options.verbose) {
      console.log(`applied ${filename}`);
    }
  }

  return { applied, alreadyApplied };
}

function ensureMigrationsTable(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      checksum   TEXT NOT NULL,
      applied_at TEXT NOT NULL
    ) STRICT
  `);
}

// --- CLI: `npm run migrate` -------------------------------------------------

if (process.argv[1] === import.meta.filename) {
  const { config } = await import('../config.ts');
  const { openDatabase, closeDatabase } = await import('./sqlite.ts');
  const { mkdirSync } = await import('node:fs');
  const { dirname } = await import('node:path');

  mkdirSync(dirname(config.databasePath), { recursive: true });
  const db = openDatabase(config.databasePath);
  try {
    const result = migrate(db, { verbose: true });
    if (result.applied.length === 0) {
      console.log(`up to date (${result.alreadyApplied.length} migration(s) already applied)`);
    } else {
      console.log(`applied ${result.applied.length} migration(s)`);
    }
  } finally {
    closeDatabase(db);
  }
}
