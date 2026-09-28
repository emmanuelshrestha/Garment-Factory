#!/usr/bin/env node
/**
 * Control plane management: create factories and admin users.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { randomBytes, scryptSync } from 'node:crypto';
import { openDatabase, closeDatabase } from '../src/db/sqlite.ts';
import { getControlDbPath } from '../src/db/control.ts';
import { mkdirSync } from 'node:fs';

function getConfig() {
  const env = readFileSync('.env', 'utf-8');
  const lines = env.split('\n').filter(l => l.trim() && !l.startsWith('#'));
  const config = {};
  lines.forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length) {
      config[key.trim()] = valueParts.join('=').trim();
    }
  });
  return config;
}

function migrateControlDb(controlDb) {
  controlDb.exec(`
    CREATE TABLE IF NOT EXISTS control_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      email TEXT,
      full_name TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_login_at TEXT
    ) STRICT
  `);

  controlDb.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      db_path TEXT NOT NULL,
      plan TEXT NOT NULL DEFAULT 'free',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) STRICT
  `);
}

function scryptHash(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return salt.toString('hex') + ':' + hash.toString('hex');
}

async function createTenant(slug, name, plan = 'free') {
  const config = getConfig();
  const dataDir = config.GARMENT_DB_PATH ? dirname(config.GARMENT_DB_PATH) : './data';
  const tenantsDir = join(dataDir, 'tenants');
  mkdirSync(tenantsDir, { recursive: true });
  const dbPath = join(tenantsDir, slug + '.db');
  
  const controlDb = openDatabase(getControlDbPath());
  try {
    migrateControlDb(controlDb);
    const stmt = controlDb.prepare(
      'INSERT INTO tenants (slug, name, db_path, plan) VALUES (?, ?, ?, ?)'
    );
    stmt.run(slug, name, dbPath, plan);
    console.log('Created tenant: ' + slug);
  } finally {
    closeDatabase(controlDb);
  }
}

async function createAdmin(username, password, fullName, email) {
  const controlDb = openDatabase(getControlDbPath());
  try {
    migrateControlDb(controlDb);
    const hash = scryptHash(password);
    const stmt = controlDb.prepare(
      'INSERT INTO control_users (username, password_hash, full_name, email) VALUES (?, ?, ?, ?)'
    );
    stmt.run(username, hash, fullName, email || '');
    console.log('Created admin: ' + username);
  } finally {
    closeDatabase(controlDb);
  }
}

async function listTenants() {
  const controlDb = openDatabase(getControlDbPath());
  try {
    migrateControlDb(controlDb);
    const rows = controlDb.prepare('SELECT slug, name, plan, is_active FROM tenants').all();
    console.log('\nTenants:');
    rows.forEach(row => {
      console.log(row.slug + ' - ' + row.name + ' (' + row.plan + ')');
    });
  } finally {
    closeDatabase(controlDb);
  }
}

const args = process.argv.slice(2);
const command = args[0];

if (command === 'create-tenant') {
  createTenant(args[1], args[2], args[3] || 'free');
} else if (command === 'create-admin') {
  createAdmin(args[1], args[2], args[3], args[4]);
} else if (command === 'list-tenants') {
  listTenants();
} else {
  console.log('Usage:');
  console.log('  node scripts/manage-tenants.ts create-tenant <slug> <name>');
  console.log('  node scripts/manage-tenants.ts create-admin <username> <password> <fullName> [email]');
  console.log('  node scripts/manage-tenants.ts list-tenants');
}

