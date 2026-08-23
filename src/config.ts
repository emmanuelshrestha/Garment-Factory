/**
 * Runtime configuration. Environment variables override the defaults so the
 * factory machine and the test suite can point at different databases without
 * either one editing code.
 */

import { join, resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');

export const config = {
  projectRoot,
  databasePath: process.env.GARMENT_DB ?? join(projectRoot, 'data', 'garment.db'),
  backupDir: process.env.GARMENT_BACKUP_DIR ?? join(projectRoot, 'data', 'backups'),
  port: Number(process.env.GARMENT_PORT ?? 4000),
  /**
   * Loopback by default. There is no authentication yet, so binding to every
   * interface would put stock, prices and customer balances on the factory LAN
   * for anyone who can reach the machine. Set GARMENT_HOST=0.0.0.0 to open it
   * up deliberately once logins exist — see OPEN-6 in DECISIONS.md.
   */
  host: process.env.GARMENT_HOST ?? '127.0.0.1',
  /** The interim single-page console served by the same process. */
  webConsoleDir: process.env.GARMENT_CONSOLE_DIR ?? join(projectRoot, 'console'),
};
