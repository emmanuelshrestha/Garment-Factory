/**
 * Tenant database connection manager (Model C1).
 * Caches tenant database connections, ensures tenant DB directories and migrations exist.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { openDatabase, closeDatabase, type Db } from './sqlite.ts';
import { migrate } from './migrate.ts';
import { openControlDb, getTenantBySlug } from './control.ts';

const tenantCache = new Map<string, Db>();

export function getTenantDb(slug: string): Db {
  if (tenantCache.has(slug)) {
    return tenantCache.get(slug)!;
  }

  const controlDb = openControlDb();
  try {
    const tenant = getTenantBySlug(controlDb, slug);
    if (!tenant || !tenant.isActive) {
      throw new Error(`Tenant '${slug}' not found or inactive`);
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
  for (const [slug, db] of tenantCache.entries()) {
    closeDatabase(db);
  }
  tenantCache.clear();
}
