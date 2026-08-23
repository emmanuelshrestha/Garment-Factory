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
  /** Bind to all interfaces so other machines on the factory LAN can reach it. */
  host: process.env.GARMENT_HOST ?? '0.0.0.0',
};
