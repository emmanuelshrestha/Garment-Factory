/**
 * Add a new user to an existing tenant.
 */
import { parseArgs } from 'node:util';
import { openDatabase, closeDatabase } from '../src/db/sqlite.ts';
import { randomBytes, scryptSync } from 'node:crypto';
import { nowTimestamp } from '../src/domain/dates.ts';
import { join } from 'node:path';

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return { hash: scryptSync(password, salt, 64).toString('hex'), salt };
}

function main() {
  const { values } = parseArgs({
    options: {
      tenant: { type: 'string' }, username: { type: 'string' },
      name: { type: 'string' }, password: { type: 'string' },
      admin: { type: 'boolean' }, help: { type: 'boolean' },
    },
  });

  if (values.help || !values.tenant || !values.username || !values.name || !values.password) {
    console.error('Usage: ...');
    process.exit(1);
  }

  const tenantSlug = values.tenant.trim().toLowerCase();
  const username = values.username.trim().toLowerCase();
  const dbPath = join(process.cwd(), 'data', 'tenants', tenantSlug, 'garment.db');

  try {
    const db = openDatabase(dbPath);
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      console.error('User already exists');
      process.exit(1);
    }
    const { hash, salt } = hashPassword(values.password);
    db.prepare('INSERT INTO users (username, password_hash, password_salt, display_name, role, is_active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)')
      .run(username, hash, salt, values.name.trim(), values.admin ? 'owner' : 'staff', nowTimestamp());
    console.log('User created: ' + username);
    closeDatabase(db);
  } catch (error) {
    console.error('Error: ' + error.message);
    process.exit(1);
  }
}

main();
