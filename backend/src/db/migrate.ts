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
import { readFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Db, transaction } from './sqlite.ts';

// Standard ESM directory resolution that avoids TypeScript type errors
const currentDir = dirname(fileURLToPath(import.meta.url));

function resolveMigrationsDir(): string {
  const candidates = [
    join(currentDir, 'migrations'),
    join(process.cwd(), 'src', 'db', 'migrations'),
    join(process.cwd(), 'backend', 'src', 'db', 'migrations'),
    join(process.cwd(), 'migrations'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return join(currentDir, 'migrations');
}

const MIGRATIONS_DIR = resolveMigrationsDir();

export type MigrationResult = {
  applied: string[];
  alreadyApplied: string[];
};

export function migrate(db: Db, options: { verbose?: boolean } = {}): MigrationResult {
  ensureMigrationsTable(db);

  if (!existsSync(MIGRATIONS_DIR)) {
    throw new Error(`Migrations directory does not exist: ${MIGRATIONS_DIR}`);
  }

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

if (process.argv[1]?.includes('migrate')) {
  void (async () => {
    const { config } = await import('../config.ts');
    const { openDatabase, closeDatabase } = await import('./sqlite.ts');

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
  })();
}