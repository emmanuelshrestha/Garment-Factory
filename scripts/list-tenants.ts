/** List factories registered on the platform. */
import { listTenants, openControlDb, closeDatabase } from '../src/db/control.ts';

function main(): void {
  const controlDb = openControlDb();
  try {
    const tenants = listTenants(controlDb);
    if (tenants.length === 0) {
      console.log('no factories yet — use scripts/create-tenant.ts');
      return;
    }
    console.log(`${tenants.length} factory(s):`);
    for (const t of tenants) {
      console.log(`  ${t.slug.padEnd(24)} ${t.name.padEnd(32)} ${t.isActive ? 'active' : 'inactive'}`);
    }
  } finally {
    closeDatabase(controlDb);
  }
}

main();
