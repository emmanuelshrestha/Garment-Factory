/**
 * Tenant database connections.
 *
 * One SQLite file per factory, opened on first use and cached for the
 * process lifetime. A request that cannot name a registered, active
 * factory never reaches a ledger.
 *
 * `src/db/tenants.ts` used to auto-create a file from any slug. That is
 * gone: factories are provisioned by command, not by the first HTTP hit.
 */

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { closeDatabase, openDatabase, type Db } from './sqlite.ts';
import { migrate } from './migrate.ts';
import { getTenantBySlug, openControlDb } from './control.ts';

const tenantCache = new Map<string, Db>();

export class TenantNotFoundError extends Error {
  readonly slug: string;
  constructor(slug: string) {
    super(`Tenant '${slug}' was not found or is inactive.`);
    this.name = 'TenantNotFoundError';
    this.slug = slug;
  }
}

export function getTenantDb(slug: string): Db {
  const cached = tenantCache.get(slug);
  if (cached) {
    return cached;
  }

  const controlDb = openControlDb();
  try {
    const tenant = getTenantBySlug(controlDb, slug);
    if (!tenant || !tenant.isActive) {
      throw new TenantNotFoundError(slug);
    }

    mkdirSync(dirname(tenant.dbPath), { recursive: true });
    const db = openDatabase(tenant.dbPath);
    migrate(db);
    tenantCache.set(slug, db);
    return db;
  } finally {
    closeDatabase(controlDb);
  }
}

export function closeAllTenantDbs(): void {
  for (const db of tenantCache.values()) {
    closeDatabase(db);
  }
  tenantCache.clear();
}
