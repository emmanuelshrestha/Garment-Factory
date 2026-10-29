/**
 * Entry point: open the database, apply migrations, start the server.
 *
 * Migrations run at startup deliberately. A single-user factory machine has no
 * deploy pipeline to run them from, and a server that starts against an
 * out-of-date schema would fail in confusing ways later instead of loudly now.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Socket } from 'node:net';
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
      const mode = staticDir === config.webDistDir ? 'React UI (frontend/dist)' : 'console (console/index.html)';
      console.log(`ui:       http://localhost:${config.port}/ [${mode}]`);
    }
    if (config.host === '0.0.0.0') {
      console.warn('WARNING: bound to all interfaces with no authentication. See OPEN-6 in DECISIONS.md.');
    }
  });

  // Track live sockets so shutdown can drain them instead of leaving a
  // keep-alive connection holding the process open.
  const sockets = new Set<Socket>();
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });

  let shuttingDown = false;

  /**
   * Graceful shutdown.
   *
   * Order matters: stop accepting new connections, let in-flight requests
   * finish, then close the database. `db.close()` is what checkpoints the WAL
   * back into the main file; exiting without it can leave a large -wal file and
   * loses the chance to fold it in cleanly.
   */
  const shutdown = (signal: string) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    console.log(`\n${signal} received, draining connections.`);

    let closed = false;
    const finish = (reason: string) => {
      if (closed) {
        return;
      }
      closed = true;
      try {
        closeDatabase(db);
        console.log(`database closed (${reason}), WAL checkpointed.`);
      } catch (error) {
        console.error('failed to close database during shutdown:', error);
      }
      process.exit(0);
    };

    server.close(() => finish('all connections drained'));

    // Destroy idle keep-alive sockets immediately; active ones get the grace
    // period below to finish their response.
    for (const socket of sockets) {
      if (!socket.destroyed) {
        socket.end();
      }
    }

    setTimeout(() => {
      for (const socket of sockets) {
        socket.destroy();
      }
      finish('grace period elapsed');
    }, 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
