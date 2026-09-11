/**
 * Entry point: open the database, apply migrations, start the server.
 *
 * Migrations run at startup deliberately. A single-user factory machine has no
 * deploy pipeline to run them from, and a server that starts against an
 * out-of-date schema would fail in confusing ways later instead of loudly now.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from './config.ts';
import { closeDatabase, openDatabase } from './db/sqlite.ts';
import { migrate } from './db/migrate.ts';
import { resolveOwnerUserId } from './http/context.ts';
import { createApiServer } from './http/server.ts';

function main(): void {
  mkdirSync(dirname(config.databasePath), { recursive: true });

  const db = openDatabase(config.databasePath);
  const result = migrate(db);
  if (result.applied.length > 0) {
    console.log(`applied migrations: ${result.applied.join(', ')}`);
  }

  const app = { db, currentUserId: resolveOwnerUserId(db) };
  const staticDir = existsSync(config.webDistDir)
    ? config.webDistDir
    : existsSync(config.webConsoleDir)
    ? config.webConsoleDir
    : undefined;
  const server = createApiServer(app, { staticDir });

  server.listen(config.port, config.host, () => {
    const shown = config.host === '0.0.0.0' ? 'all interfaces' : config.host;
    console.log(`garment server listening on ${shown}:${config.port}`);
    console.log(`database: ${config.databasePath}`);
    if (staticDir) {
      const mode = staticDir === config.webDistDir ? 'React UI (web/dist)' : 'console (console/index.html)';
      console.log(`ui:       http://localhost:${config.port}/ [${mode}]`);
    }
    if (config.host === '0.0.0.0') {
      console.warn('WARNING: bound to all interfaces with no authentication. See OPEN-6 in DECISIONS.md.');
    }
  });

  const shutdown = (signal: string) => {
    console.log(`\n${signal} received, closing.`);
    server.close(() => {
      closeDatabase(db);
      process.exit(0);
    });
    // A stuck keep-alive socket must not keep the database open forever.
    setTimeout(() => {
      closeDatabase(db);
      process.exit(0);
    }, 3000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
