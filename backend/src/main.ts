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

  const onListening = () => {
    console.log(`garment server listening on: ${config.port}`);
    console.log(`database: ${config.databasePath}`);
    if (staticDir) {
      console.log(`serving UI from: ${staticDir}`);
    }
  };

  // cPanel Passenger Socket vs Standard TCP Port binding
  if (typeof config.port === 'string' && isNaN(Number(config.port))) {
    server.listen(config.port, onListening);
  } else {
    server.listen(Number(config.port), config.host, onListening);
  }

  const sockets = new Set<Socket>();
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });

  let shuttingDown = false;

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