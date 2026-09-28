/**
 * Runtime configuration. Environment variables override the defaults so the
 * factory machine and the test suite can point at different databases without
 * either one editing code.
 */

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const backendRoot = resolve(import.meta.dirname, '..');
const projectRoot = resolve(backendRoot, '..');

const defaultWebDistDir = existsSync(join(projectRoot, 'frontend', 'dist'))
  ? join(projectRoot, 'frontend', 'dist')
  : join(projectRoot, 'web', 'dist');

const defaultConsoleDir = existsSync(join(backendRoot, 'console'))
  ? join(backendRoot, 'console')
  : join(projectRoot, 'console');

const defaultDataDir = existsSync(join(backendRoot, 'data'))
  ? join(backendRoot, 'data')
  : join(projectRoot, 'data');

export const config = {
  projectRoot,
  backendRoot,
  databasePath: process.env.GARMENT_DB_PATH ?? process.env.GARMENT_DB ?? join(defaultDataDir, 'garment.db'),
  backupDir: process.env.GARMENT_BACKUP_DIR ?? join(defaultDataDir, 'backups'),
  port: Number(process.env.GARMENT_PORT ?? 4000),
  host: process.env.GARMENT_HOST ?? '127.0.0.1',
  webDistDir: process.env.GARMENT_WEB_DIST_DIR ?? process.env.GARMENT_WEB_DIST ?? defaultWebDistDir,
  webConsoleDir: process.env.GARMENT_CONSOLE_DIR ?? defaultConsoleDir,
  sessionTtlHours: Number(process.env.GARMENT_SESSION_TTL_HOURS ?? 12),
  cookieSecure: process.env.GARMENT_COOKIE_SECURE === '1',
  requireStrongPassword: process.env.GARMENT_REQUIRE_STRONG_PASSWORD === '1',
  authRequired: process.env.GARMENT_AUTH_REQUIRED !== '0',
  baseDomain: process.env.GARMENT_BASE_DOMAIN ?? '',
};