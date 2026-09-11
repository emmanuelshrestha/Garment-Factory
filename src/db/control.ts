/**
 * Control plane database management for multi-tenant SaaS (Model C1).
 * Manages tenant registry in a separate control database (`data/control.db`).
 */

import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { openDatabase, closeDatabase, transaction, type Db } from './sqlite.ts';
import { config } from '../config.ts';
import { nowTimestamp } from '../domain/dates.ts';

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
      db_path     TEXT NOT NULL,
      plan        TEXT NOT NULL DEFAULT 'basic',
      is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
      created_at  TEXT NOT NULL
    ) STRICT;
  `);

  return db;
}

export function getTenantBySlug(controlDb: Db, slug: string): TenantRecord | null {
  const row = controlDb.prepare(
    'SELECT id, slug, name, db_path, plan, is_active, created_at FROM tenants WHERE slug = ?'
  ).get(slug) as {
    id: number;
    slug: string;
    name: string;
    db_path: string;
    plan: string;
    is_active: number;
    created_at: string;
  } | undefined;

  if (!row) return null;

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    dbPath: row.db_path,
    plan: row.plan,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
  };
}

export function createTenant(
  controlDb: Db,
  slug: string,
  name: string,
  plan = 'basic'
): TenantRecord {
  const dbPath = join(dirname(config.databasePath), 'tenants', slug, 'garment.db');
  const createdAt = nowTimestamp();

  const info = controlDb.prepare(
    `INSERT INTO tenants (slug, name, db_path, plan, is_active, created_at)
     VALUES (?, ?, ?, ?, 1, ?)`
  ).run(slug, name, dbPath, plan, createdAt);

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
