import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { config } from '../config.ts';
import { openDatabase, type Db, closeDatabase } from './sqlite.ts';
import { migrate } from './migrate.ts';

const tenantConnections = new Map<string, Db>();

export function getTenantDb(slug: string): Db {
  if (tenantConnections.has(slug)) {
    return tenantConnections.get(slug)!;
  }

  const tenantDir = join(config.projectRoot, 'data', 'tenants', slug);
  mkdirSync(tenantDir, { recursive: true });
  const dbPath = join(tenantDir, 'garment.db');
  
  const db = openDatabase(dbPath);
  migrate(db);
  
  tenantConnections.set(slug, db);
  return db;
}

export function closeAllTenantConnections(): void {
  for (const db of tenantConnections.values()) {
    closeDatabase(db);
  }
  tenantConnections.clear();
}
