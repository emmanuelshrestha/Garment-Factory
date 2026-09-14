/**
 * Runtime configuration. Environment variables override the defaults so the
 * factory machine and the test suite can point at different databases without
 * either one editing code.
 */

import { join, resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');

export const config = {
  projectRoot,
  databasePath: process.env.GARMENT_DB_PATH ?? process.env.GARMENT_DB ?? join(projectRoot, 'data', 'garment.db'),
  backupDir: process.env.GARMENT_BACKUP_DIR ?? join(projectRoot, 'data', 'backups'),
  port: Number(process.env.GARMENT_PORT ?? 4000),
  host: process.env.GARMENT_HOST ?? '127.0.0.1',
  webDistDir: process.env.GARMENT_WEB_DIST_DIR ?? process.env.GARMENT_WEB_DIST ?? join(projectRoot, 'web', 'dist'),
  webConsoleDir: process.env.GARMENT_CONSOLE_DIR ?? join(projectRoot, 'console'),
  sessionTtlHours: Number(process.env.GARMENT_SESSION_TTL_HOURS ?? 12),
  cookieSecure: process.env.GARMENT_COOKIE_SECURE === '1',
  requireStrongPassword: process.env.GARMENT_REQUIRE_STRONG_PASSWORD === '1',
  authRequired: process.env.GARMENT_AUTH_REQUIRED !== '0',
  baseDomain: process.env.GARMENT_BASE_DOMAIN ?? '',
};