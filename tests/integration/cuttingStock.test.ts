import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { transaction } from '../../src/db/sqlite.ts';
import { createTestDb, seedVariant } from '../helpers/testDb.ts';
import { addCuttingStock, transferToFinishedStock, getCuttingStockOnHand } from '../../src/services/cuttingStock.ts';
import { ValidationError } from '../../src/domain/errors.ts';

describe('Cutting Stock lifecycle', () => {
  it('adds and transfers cutting stock', () => {
    const t = createTestDb();
    
    // Seed variant
    const { variantId } = seedVariant(t);

    // 1. Add stock
    transaction(t.db, (tx) => addCuttingStock(tx, variantId, 100, t.userId));
    const onHand1 = transaction(t.db, (tx) => getCuttingStockOnHand(tx, variantId));
    assert.strictEqual(onHand1, 100);

    // 2. Transfer stock
    transaction(t.db, (tx) => transferToFinishedStock(tx, variantId, 60, t.userId));
    const onHand2 = transaction(t.db, (tx) => getCuttingStockOnHand(tx, variantId));
    assert.strictEqual(onHand2, 40);

    // 3. Fails on insufficient stock
    assert.throws(() => {
        transaction(t.db, (tx) => transferToFinishedStock(tx, variantId, 50, t.userId));
    }, ValidationError);
    
    t.cleanup();
  });
});
