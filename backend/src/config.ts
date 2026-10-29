/**
 * Runtime configuration. Environment variables override the defaults so the
 * factory machine and the test suite can point at different databases without
 * either one editing code.
 *
 * Precedence per setting: canonical name (HOST/PORT/DATABASE_PATH/SESSION_SECRET)
 * first, then the legacy GARMENT_* name it replaces. Legacy names stay honoured
 * so existing Dockerfiles, systemd units and scripts keep working unchanged.
 */

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

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

const isProduction = process.env.NODE_ENV === 'production';

/** First defined, non-blank environment value from the candidate names. */
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
    throw new Error(`${names[0]} must be an integer, got ${JSON.stringify(raw)}`);
  }
  return parsed;
}

/**
 * SESSION_SECRET.
 *
 * In production the operator MUST supply it: a random per-boot value would
 * silently invalidate every session on restart and hide a misconfigured
 * deployment. Outside production a random value is generated so dev runs and
 * the test suite need no setup.
 */
function resolveSessionSecret(): string {
  const provided = env('SESSION_SECRET', 'GARMENT_SESSION_SECRET');
  if (provided !== undefined) {
    if (provided.length < 32) {
      throw new Error('SESSION_SECRET must be at least 32 characters long');
    }
    return provided;
  }
  if (isProduction) {
    throw new Error(
      'SESSION_SECRET is required when NODE_ENV=production; set it to a random string of at least 32 characters.',
    );
  }
  return randomBytes(48).toString('hex');
}

export const config = {
  projectRoot,
  backendRoot,
  isProduction,

  // HOST defaults to 0.0.0.0 so a factory LAN deployment works out of the box;
  // set HOST=127.0.0.1 for a single-machine install.
  host: env('HOST', 'GARMENT_HOST') ?? '0.0.0.0',
  port: envInt(4000, 'PORT', 'GARMENT_PORT'),

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

  /**
   * Authentication may be switched off for local development only. In
   * production the flag is ignored outright, so GARMENT_AUTH_REQUIRED=0 (or
   * GARMENT_REQUIRE_AUTH=0) can never open the API on a factory LAN.
   */
  authRequired:
    isProduction || env('GARMENT_REQUIRE_AUTH', 'GARMENT_AUTH_REQUIRED') === '1',

  baseDomain: process.env.GARMENT_BASE_DOMAIN ?? '',
};
