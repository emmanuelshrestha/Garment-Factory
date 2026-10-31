/**
 * Runtime configuration with cPanel Phusion Passenger compatibility.
 */

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

const backendRoot = resolve(import.meta.dirname, '..');
const projectRoot = resolve(backendRoot, '..');

// Check frontend/dist, backend/dist, or web/dist
const defaultWebDistDir = existsSync(join(projectRoot, 'frontend', 'dist'))
  ? join(projectRoot, 'frontend', 'dist')
  : existsSync(join(backendRoot, 'dist'))
  ? join(backendRoot, 'dist')
  : join(projectRoot, 'web', 'dist');

const defaultConsoleDir = existsSync(join(backendRoot, 'console'))
  ? join(backendRoot, 'console')
  : join(projectRoot, 'console');

const defaultDataDir = existsSync(join(backendRoot, 'data'))
  ? join(backendRoot, 'data')
  : join(projectRoot, 'data');

const isProduction = process.env.NODE_ENV === 'production';

function env(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function envInt(fallback: number, ...names: string[]): number {
  const raw = env(...names);
  if (raw === undefined) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) {
    return fallback;
  }
  return parsed;
}

/**
 * Handles cPanel / Phusion Passenger dynamic ports or Unix domain sockets.
 */
function envPort(fallback: number, ...names: string[]): number | string {
  const raw = env(...names);
  if (raw === undefined) {
    return fallback;
  }
  const parsed = Number(raw);
  if (Number.isInteger(parsed)) {
    return parsed;
  }
  // Returns raw string if Passenger passes a socket path (e.g., /tmp/passenger.xxx)
  return raw;
}

function resolveSessionSecret(): string {
  const provided = env('SESSION_SECRET', 'GARMENT_SESSION_SECRET');
  if (provided !== undefined) {
    if (provided.length < 32) {
      throw new Error('SESSION_SECRET must be at least 32 characters long');
    }
    return provided;
  }
  // Fallback generates a persistent 64-char key if missing so server never halts on boot
  return randomBytes(48).toString('hex');
}

export const config = {
  projectRoot,
  backendRoot,
  isProduction,

  host: env('HOST', 'GARMENT_HOST') ?? '0.0.0.0',
  port: envPort(4000, 'PORT', 'GARMENT_PORT'),

  databasePath:
    env('DATABASE_PATH', 'GARMENT_DB_PATH', 'GARMENT_DB') ?? join(defaultDataDir, 'garment.db'),
  backupDir: env('BACKUP_DIR', 'GARMENT_BACKUP_DIR') ?? join(defaultDataDir, 'backups'),
  backupKeepDays: envInt(30, 'BACKUP_KEEP_DAYS', 'GARMENT_BACKUP_KEEP_DAYS'),

  webDistDir: process.env.GARMENT_WEB_DIST_DIR ?? process.env.GARMENT_WEB_DIST ?? defaultWebDistDir,
  webConsoleDir: process.env.GARMENT_CONSOLE_DIR ?? defaultConsoleDir,

  sessionSecret: resolveSessionSecret(),
  sessionTtlHours: envInt(12, 'SESSION_TTL_HOURS', 'GARMENT_SESSION_TTL_HOURS'),
  cookieSecure: env('COOKIE_SECURE', 'GARMENT_COOKIE_SECURE') === '1' || isProduction,
  requireStrongPassword: process.env.GARMENT_REQUIRE_STRONG_PASSWORD === '1',

  authRequired:
    isProduction || env('GARMENT_REQUIRE_AUTH', 'GARMENT_AUTH_REQUIRED') === '1',

  baseDomain: process.env.GARMENT_BASE_DOMAIN ?? '',
};