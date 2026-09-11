import test from 'node:test';
import assert from 'node:assert/strict';
import { readOnly, transaction } from '../../src/db/sqlite.ts';
import { getDashboardSummary } from '../../src/services/dashboard.ts';
import { createCustomer } from '../../src/services/customers.ts';
import { createOrder, confirmOrder } from '../../src/services/orders.ts';
import { recordStockMovement } from '../../src/services/stock.ts';
import { createTestDb, seedVariant, type TestDb } from '../helpers/testDb.ts';

function withDb<T>(fn: (t: TestDb) => T): T {
  const t = createTestDb();
  try {
    return fn(t);
  } finally {
    t.cleanup();
  }
}

test('dashboard service', async (suite) => {
  await suite.test('aggregates active orders, shortages, and inventory bands', () => {
    withDb((t) => {
      const seeded = seedVariant(t, { productCode: 'JKT-DASH', size: 'L', minStockQty: 20 });
      const customerId = transaction(t.db, (tx) =>
        createCustomer(tx, { code: 'CUST-DASH', name: 'Dash Customer', defaultCurrency: 'NPR', userId: 1 }),
      );

      // Stock 10 pieces (which is < minStockQty 20 -> Red band)
      transaction(t.db, (tx) =>
        recordStockMovement(tx, {
          variantId: seeded.variantId,
          qty: 10,
          movementType: 'opening_balance',
          userId: 1,
        }),
      );

      // Create & confirm order for 15 pieces -> 10 allocated, 5 shortage
      const orderId = transaction(t.db, (tx) =>
        createOrder(tx, {
          customerId,
          orderDate: '2026-08-24',
          currency: 'NPR',
          lines: [{ variantId: seeded.variantId, qtyOrdered: 15 }],
          userId: 1,
        }),
      );
      transaction(t.db, (tx) => confirmOrder(tx, orderId, 1));

      const dash = readOnly(t.db, (tx) => getDashboardSummary(tx));

      assert.equal(dash.orders.confirmedCount, 1);
      assert.equal(dash.orders.shortagePiecesCount, 5);
      assert.equal(dash.orders.shortageVariantsCount, 1);
      assert.equal(dash.inventory.redCount, 1);
      assert.ok(dash.recentAudit.length > 0);
    });
  });
});
