/**
 * Provision a new factory: control row, own SQLite file, owner login.
 *
 *   node scripts/create-tenant.ts --slug acme --name "Acme Garments" \
 *     --password "a-long-random-password" [--username owner] [--demo]
 *
 * This is the only way a factory appears on the platform. There is no
 * self-signup: the platform owner runs this by hand.
 */

import { parseArgs } from 'node:util';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { migrate } from '../src/db/migrate.ts';
import { openDatabase, closeDatabase, transaction } from '../src/db/sqlite.ts';
import { createTenant, openControlDb } from '../src/db/control.ts';
import { closeAllTenantDbs } from '../src/db/tenantManager.ts';
import { ensureOwner } from './seedLib.ts';

function parseCli() {
  const { values } = parseArgs({
    options: {
      slug: { type: 'string' },
      name: { type: 'string' },
      password: { type: 'string' },
      username: { type: 'string' },
      plan: { type: 'string' },
      demo: { type: 'boolean' },
      help: { type: 'boolean' },
    },
  });
  return values;
}

function main(): void {
  const values = parseCli();
  if (values.help || !values.slug || !values.name || !values.password) {
    console.error(`Usage: node scripts/create-tenant.ts --slug <slug> --name "Factory Name" --password "<owner-password>" [--username owner] [--plan basic] [--demo]`);
    process.exitCode = values.help ? 0 : 1;
    return;
  }

  const slug = values.slug.trim().toLowerCase();
  const name = values.name.trim();
  const password = values.password;
  const username = (values.username ?? 'owner').trim();
  const plan = values.plan ?? 'basic';

  const controlDb = openControlDb();
  try {
    const tenant = transaction(controlDb, () =>
      createTenant(controlDb, slug, name, plan),
    );

    mkdirSync(dirname(tenant.dbPath), { recursive: true });
    const tenantDb = openDatabase(tenant.dbPath);
    try {
      migrate(tenantDb);
      transaction(tenantDb, (tx) => {
        ensureOwner(tx, { username, password, displayName: 'Owner' });
      });
      console.log(`created factory '${slug}' (${tenant.name})`);
      console.log(`  db:       ${tenant.dbPath}`);
      console.log(`  owner:    ${username}`);
      console.log(`  plan:     ${plan}`);
    } finally {
      closeDatabase(tenantDb);
    }
  } catch (error) {
    closeAllTenantDbs();
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(error);
    }
    process.exitCode = 1;
  } finally {
    closeDatabase(controlDb);
  }
}

main();
