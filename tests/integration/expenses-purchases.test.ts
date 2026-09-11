import test from 'node:test';
import assert from 'node:assert/strict';
import { readOnly, transaction } from '../../src/db/sqlite.ts';
import { createExpense, getExpense, listExpenses } from '../../src/services/expenses.ts';
import { createPurchase, getPurchase, listPurchases } from '../../src/services/purchases.ts';
import { ValidationError } from '../../src/domain/errors.ts';
import { createTestDb, type TestDb } from '../helpers/testDb.ts';

function withDb<T>(fn: (t: TestDb) => T): T {
  const t = createTestDb();
  try {
    return fn(t);
  } finally {
    t.cleanup();
  }
}

test('expenses service', async (suite) => {
  await suite.test('creates and retrieves an expense with sequential document numbers', () => {
    withDb((t) => {
      const expense = transaction(t.db, (tx) =>
        createExpense(tx, {
          category: 'utilities',
          payee: 'Nepal Electricity Authority',
          amountMinor: 1500000,
          currency: 'NPR',
          method: 'bank_transfer',
          expenseDate: '2026-08-24',
          note: 'Factory electricity bill',
          userId: 1,
        }),
      );

      assert.equal(expense.expenseNo, 'EXP-2026-00001');
      assert.equal(expense.category, 'utilities');
      assert.equal(expense.amountMinor, 1500000);
      assert.equal(expense.method, 'bank_transfer');

      const retrieved = readOnly(t.db, (tx) => getExpense(tx, expense.id));
      assert.deepEqual(retrieved, expense);

      const list = readOnly(t.db, (tx) => listExpenses(tx));
      assert.equal(list.length, 1);
    });
  });

  await suite.test('rejects negative or zero expense amount', () => {
    withDb((t) => {
      assert.throws(
        () =>
          transaction(t.db, (tx) =>
            createExpense(tx, {
              category: 'supplies',
              amountMinor: 0,
              method: 'cash',
              userId: 1,
            }),
          ),
        ValidationError,
      );
    });
  });
});

test('purchases service', async (suite) => {
  await suite.test('creates raw material purchase without touching stock movements', () => {
    withDb((t) => {
      const purchase = transaction(t.db, (tx) =>
        createPurchase(tx, {
          supplierName: 'ABC Textiles',
          description: '100m Water-resistant nylon fabric',
          amountMinor: 4500000,
          currency: 'NPR',
          purchaseDate: '2026-08-24',
          userId: 1,
        }),
      );

      assert.equal(purchase.purchaseNo, 'PUR-2026-00001');
      assert.equal(purchase.supplierName, 'ABC Textiles');

      // Verify no stock movement was written
      const stockMovementCount = t.db
        .prepare('SELECT COUNT(*) as count FROM stock_movements')
        .get() as { count: number };
      assert.equal(stockMovementCount.count, 0);

      const list = readOnly(t.db, (tx) => listPurchases(tx));
      assert.equal(list.length, 1);
    });
  });
});
