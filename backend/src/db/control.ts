/**
 * Control plane: the registry of factories.
 *
 * Each factory is a row here and a SQLite file of its own. This database
 * holds no money, no stock, and no sessions — those live in the tenant file.
 * The control plane is how the process finds a factory from its slug.
 */

import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { openDatabase, closeDatabase, type Db } from './sqlite.ts';
import { config } from '../config.ts';
import { nowTimestamp } from '../domain/dates.ts';
import { assertTenantSlug } from '../domain/tenants.ts';
import { ValidationError } from '../domain/errors.ts';

export type TenantRecord = {
  id: number;
  slug: string;
  name: string;
  dbPath: string;
  plan: string;
  isActive: boolean;
  createdAt: string;
};

export function getControlDbPath(): string {
  return process.env.GARMENT_CONTROL_DB ?? join(dirname(config.databasePath), 'control.db');
}

export function openControlDb(): Db {
  const path = getControlDbPath();
  mkdirSync(dirname(path), { recursive: true });
  const db = openDatabase(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id          INTEGER PRIMARY KEY,
      slug        TEXT NOT NULL UNIQUE,
      name        TEXT NOT NULL,
      db_path     TEXT NOT NULL UNIQUE,
      plan        TEXT NOT NULL DEFAULT 'basic',
      is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
      created_at  TEXT NOT NULL
    ) STRICT;
  `);
  return db;
}

function mapRow(row: {
  id: number;
  slug: string;
  name: string;
  db_path: string;
  plan: string;
  is_active: number;
  created_at: string;
}): TenantRecord {
  return {
    id: Number(row.id),
    slug: row.slug,
    name: row.name,
    dbPath: row.db_path,
    plan: row.plan,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
  };
}

export function getTenantBySlug(controlDb: Db, slug: string): TenantRecord | null {
  const row = controlDb
    .prepare(
      'SELECT id, slug, name, db_path, plan, is_active, created_at FROM tenants WHERE slug = ?',
    )
    .get(slug) as
    | {
        id: number;
        slug: string;
        name: string;
        db_path: string;
        plan: string;
        is_active: number;
        created_at: string;
      }
    | undefined;
  return row ? mapRow(row) : null;
}

export function listTenants(controlDb: Db): TenantRecord[] {
  const rows = controlDb
    .prepare(
      'SELECT id, slug, name, db_path, plan, is_active, created_at FROM tenants ORDER BY slug',
    )
    .all() as Array<{
    id: number;
    slug: string;
    name: string;
    db_path: string;
    plan: string;
    is_active: number;
    created_at: string;
  }>;
  return rows.map(mapRow);
}

export function tenantDbPathForSlug(slug: string): string {
  return join(dirname(config.databasePath), 'tenants', slug, 'garment.db');
}

export function createTenant(
  controlDb: Db,
  slugInput: string,
  nameInput: string,
  plan = 'basic',
): TenantRecord {
  const slug = assertTenantSlug(slugInput);
  const name = typeof nameInput === 'string' ? nameInput.trim() : '';
  if (name.length === 0) {
    throw new ValidationError('factory name is required', 'name');
  }
  if (getTenantBySlug(controlDb, slug)) {
    throw new ValidationError(`factory '${slug}' already exists`, 'slug');
  }

  const dbPath = tenantDbPathForSlug(slug);
  const createdAt = nowTimestamp();
  const info = controlDb
    .prepare(
      `INSERT INTO tenants (slug, name, db_path, plan, is_active, created_at)
       VALUES (?, ?, ?, ?, 1, ?)`,
    )
    .run(slug, name, dbPath, plan, createdAt);

  return {
    id: Number(info.lastInsertRowid),
    slug,
    name,
    dbPath,
    plan,
    isActive: true,
    createdAt,
  };
}

export function setTenantActive(controlDb: Db, slugInput: string, isActive: boolean): TenantRecord {
  const slug = assertTenantSlug(slugInput);
  const existing = getTenantBySlug(controlDb, slug);
  if (!existing) {
    throw new ValidationError(`factory '${slug}' was not found`, 'slug');
  }
  controlDb.prepare('UPDATE tenants SET is_active = ? WHERE slug = ?').run(isActive ? 1 : 0, slug);
  return { ...existing, isActive };
}

export { closeDatabase };
