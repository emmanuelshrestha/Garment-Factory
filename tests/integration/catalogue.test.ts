import test from 'node:test';
import assert from 'node:assert/strict';
import { readOnly, transaction } from '../../src/db/sqlite.ts';
import {
  buildSku,
  createColour,
  createProduct,
  generateVariants,
  getProduct,
  getVariant,
  listColours,
  listPriceHistory,
  listProducts,
  listSizes,
  listVariants,
  resolveVariantPrice,
  setProductPrice,
  setVariantActive,
  setVariantMinStock,
  setVariantPrice,
  updateProduct,
} from '../../src/services/catalogue.ts';
import {
  createCustomer,
  deactivateCustomer,
  getCustomer,
  listCustomers,
  reactivateCustomer,
  updateCustomer,
} from '../../src/services/customers.ts';
import { BusinessRuleError, NotFoundError, ValidationError } from '../../src/domain/errors.ts';
import { addDays, today } from '../../src/domain/dates.ts';
import { createTestDb, type TestDb } from '../helpers/testDb.ts';

function withDb<T>(fn: (t: TestDb) => T): T {
  const t = createTestDb();
  try {
    return fn(t);
  } finally {
    t.cleanup();
  }
}

test('the six seeded sizes are ordered for the matrix, not alphabetically', () => {
  withDb((t) => {
    const sizes = readOnly(t.db, (tx) => listSizes(tx));
    assert.deepEqual(
      sizes.map((s) => s.name),
      ['S', 'M', 'L', 'XL', '2XL', '3XL'],
    );
  });
});

test('a product plus colours and sizes generates the full variant grid', () => {
  withDb((t) => {
    const result = transaction(t.db, (tx) => {
      const productId = createProduct(tx, {
        code: 'jkt-a',
        name: 'Padded Jacket',
        defaultPriceMinor: 80000,
        userId: t.userId,
      });
      const black = createColour(tx, 'Black');
      const navy = createColour(tx, 'Navy Blue');
      const sizes = listSizes(tx).filter((s) => ['S', 'M', 'L'].includes(s.name));
      const generated = generateVariants(tx, {
        productId,
        colourIds: [black, navy],
        sizeIds: sizes.map((s) => s.id),
        minStockQty: 10,
        userId: t.userId,
      });
      return { productId, generated };
    });

    assert.equal(result.generated.created.length, 6, '2 colours x 3 sizes');
    assert.equal(result.generated.skipped, 0);

    readOnly(t.db, (tx) => {
      // The code was normalised to upper case on the way in.
      assert.equal(getProduct(tx, result.productId).code, 'JKT-A');
      const variants = listVariants(tx, result.productId);
      assert.equal(variants.length, 6);
      assert.deepEqual(
        variants.map((v) => v.sku),
        [
          'JKT-A-BLACK-S',
          'JKT-A-BLACK-M',
          'JKT-A-BLACK-L',
          'JKT-A-NAVYBLUE-S',
          'JKT-A-NAVYBLUE-M',
          'JKT-A-NAVYBLUE-L',
        ],
      );
      // Sizes come back in matrix order within a colour, not alphabetically.
      assert.deepEqual(
        variants.filter((v) => v.colour === 'Black').map((v) => v.size),
        ['S', 'M', 'L'],
      );
      assert.equal(variants[0]?.minStockQty, 10);
    });
  });
});

test('generating variants twice adds only what is missing', () => {
  withDb((t) => {
    transaction(t.db, (tx) => {
      const productId = createProduct(tx, { code: 'JKT-B', name: 'Bomber', userId: t.userId });
      const black = createColour(tx, 'Black');
      const red = createColour(tx, 'Red');
      const sizeIds = listSizes(tx)
        .filter((s) => ['S', 'M'].includes(s.name))
        .map((s) => s.id);

      const first = generateVariants(tx, { productId, colourIds: [black], sizeIds, userId: t.userId });
      assert.equal(first.created.length, 2);

      // Same colour again plus a new one: only the new combinations appear.
      const second = generateVariants(tx, {
        productId,
        colourIds: [black, red],
        sizeIds,
        userId: t.userId,
      });
      assert.equal(second.created.length, 2);
      assert.equal(second.skipped, 2);
      assert.equal(listVariants(tx, productId).length, 4);
    });
  });
});

test('duplicate ids in one request do not create duplicate variants', () => {
  withDb((t) => {
    transaction(t.db, (tx) => {
      const productId = createProduct(tx, { code: 'JKT-C', name: 'Gilet', userId: t.userId });
      const black = createColour(tx, 'Black');
      const sizeId = listSizes(tx)[0]!.id;
      const result = generateVariants(tx, {
        productId,
        colourIds: [black, black],
        sizeIds: [sizeId, sizeId],
        userId: t.userId,
      });
      assert.equal(result.created.length, 1);
    });
  });
});

test('a product code is unique and validated', () => {
  withDb((t) => {
    transaction(t.db, (tx) => {
      createProduct(tx, { code: 'JKT-A', name: 'First', userId: t.userId });
      assert.throws(
        () => createProduct(tx, { code: 'jkt-a', name: 'Second', userId: t.userId }),
        ValidationError,
      );
      assert.throws(() => createProduct(tx, { code: '', name: 'No code', userId: t.userId }), ValidationError);
      assert.throws(
        () => createProduct(tx, { code: 'JKT/A', name: 'Bad char', userId: t.userId }),
        ValidationError,
      );
      assert.throws(() => createProduct(tx, { code: 'JKT-D', name: '  ', userId: t.userId }), ValidationError);
      assert.throws(
        () => createProduct(tx, { code: 'JKT-E', name: 'Float price', defaultPriceMinor: 800.5, userId: t.userId }),
        ValidationError,
      );
    });
  });
});

test('D009: the variant override wins, and clearing it falls back to the product', () => {
  withDb((t) => {
    const variantId = transaction(t.db, (tx) => {
      const productId = createProduct(tx, {
        code: 'JKT-A',
        name: 'Padded Jacket',
        defaultPriceMinor: 80000,
        userId: t.userId,
      });
      const colourId = createColour(tx, 'Black');
      const sizeId = listSizes(tx).find((s) => s.name === 'L')!.id;
      return generateVariants(tx, { productId, colourIds: [colourId], sizeIds: [sizeId], userId: t.userId })
        .created[0]!;
    });

    readOnly(t.db, (tx) => {
      assert.deepEqual(resolveVariantPrice(tx, variantId), {
        priceMinor: 80000,
        currency: 'NPR',
        source: 'product',
      });
    });

    transaction(t.db, (tx) => setVariantPrice(tx, { variantId, priceMinor: 95000, userId: t.userId }));
    readOnly(t.db, (tx) => {
      assert.deepEqual(resolveVariantPrice(tx, variantId), {
        priceMinor: 95000,
        currency: 'NPR',
        source: 'variant',
      });
    });

    transaction(t.db, (tx) => setVariantPrice(tx, { variantId, priceMinor: null, userId: t.userId }));
    readOnly(t.db, (tx) => {
      assert.equal(resolveVariantPrice(tx, variantId).source, 'product');
    });
  });
});

test('an unpriced product refuses to produce a price', () => {
  withDb((t) => {
    const variantId = transaction(t.db, (tx) => {
      const productId = createProduct(tx, { code: 'JKT-X', name: 'Unpriced', userId: t.userId });
      const colourId = createColour(tx, 'Black');
      const sizeId = listSizes(tx)[0]!.id;
      return generateVariants(tx, { productId, colourIds: [colourId], sizeIds: [sizeId], userId: t.userId })
        .created[0]!;
    });
    assert.throws(() => readOnly(t.db, (tx) => resolveVariantPrice(tx, variantId)), BusinessRuleError);
  });
});

test('changing a price appends history and never rewrites it', () => {
  withDb((t) => {
    // Dates are derived from today so the test does not rot as the calendar
    // moves; createProduct records its initial price effective today.
    const day0 = today();
    const later = addDays(day0, 10);
    const muchLater = addDays(day0, 40);
    const backDated = addDays(day0, -8);

    const productId = transaction(t.db, (tx) =>
      createProduct(tx, {
        code: 'JKT-A',
        name: 'Padded Jacket',
        defaultPriceMinor: 80000,
        userId: t.userId,
      }),
    );

    transaction(t.db, (tx) =>
      setProductPrice(tx, {
        productId,
        priceMinor: 90000,
        effectiveFrom: later,
        note: 'Fabric cost rise',
        userId: t.userId,
      }),
    );
    transaction(t.db, (tx) =>
      setProductPrice(tx, { productId, priceMinor: 92500, effectiveFrom: muchLater, userId: t.userId }),
    );

    readOnly(t.db, (tx) => {
      const history = listPriceHistory(tx, productId);
      assert.deepEqual(
        history.map((h) => h.priceMinor),
        [80000, 90000, 92500],
        'every price the product has ever had is still there',
      );
      assert.equal(getProduct(tx, productId).defaultPriceMinor, 92500, 'current price is the latest set');
      assert.equal(history[1]?.note, 'Fabric cost rise');
    });

    // A back-dated correction is appended too, and takes its place in the
    // effective-date order without disturbing the rows already written.
    transaction(t.db, (tx) =>
      setProductPrice(tx, {
        productId,
        priceMinor: 85000,
        effectiveFrom: backDated,
        note: 'Back-dated correction',
        userId: t.userId,
      }),
    );
    readOnly(t.db, (tx) => {
      assert.deepEqual(
        listPriceHistory(tx, productId).map((h) => [h.effectiveFrom, h.priceMinor]),
        [
          [backDated, 85000],
          [day0, 80000],
          [later, 90000],
          [muchLater, 92500],
        ],
        'history reads in effective-date order and nothing was overwritten',
      );
      assert.equal(
        getProduct(tx, productId).defaultPriceMinor,
        85000,
        'the current price is whatever was set last; back-dating records history, it does not reorder intent',
      );
    });
  });
});

test('deactivating a product or variant hides it without deleting it', () => {
  withDb((t) => {
    const ids = transaction(t.db, (tx) => {
      const productId = createProduct(tx, { code: 'JKT-A', name: 'Padded', userId: t.userId });
      const colourId = createColour(tx, 'Black');
      const sizeId = listSizes(tx)[0]!.id;
      const variantId = generateVariants(tx, {
        productId,
        colourIds: [colourId],
        sizeIds: [sizeId],
        userId: t.userId,
      }).created[0]!;
      return { productId, variantId };
    });

    transaction(t.db, (tx) => {
      updateProduct(tx, ids.productId, { isActive: false, name: 'Padded Jacket (retired)' });
      setVariantActive(tx, ids.variantId, false);
      setVariantMinStock(tx, ids.variantId, 15);
    });

    readOnly(t.db, (tx) => {
      assert.equal(listProducts(tx, true).length, 0);
      assert.equal(listProducts(tx).length, 1, 'still there, just inactive');
      assert.equal(getProduct(tx, ids.productId).name, 'Padded Jacket (retired)');
      assert.equal(listVariants(tx, ids.productId, true).length, 0);
      assert.equal(getVariant(tx, ids.variantId).minStockQty, 15);
    });
  });
});

test('unknown ids are reported as not found, not silently ignored', () => {
  withDb((t) => {
    transaction(t.db, (tx) => {
      assert.throws(() => getProduct(tx, 999), NotFoundError);
      assert.throws(() => getVariant(tx, 999), NotFoundError);
      assert.throws(() => setVariantMinStock(tx, 999, 5), NotFoundError);
      const productId = createProduct(tx, { code: 'JKT-A', name: 'Padded', userId: t.userId });
      assert.throws(
        () => generateVariants(tx, { productId, colourIds: [999], sizeIds: [1], userId: t.userId }),
        NotFoundError,
      );
    });
  });
});

test('a colour cannot be added twice under a different case', () => {
  withDb((t) => {
    transaction(t.db, (tx) => {
      createColour(tx, 'Black');
      assert.throws(() => createColour(tx, '  Black  '), ValidationError);
      assert.equal(listColours(tx).length, 1);
    });
  });
});

test('SKUs are readable and safe for a barcode or a filename', () => {
  assert.equal(buildSku('JKT-A', 'Navy Blue', '2XL'), 'JKT-A-NAVYBLUE-2XL');
  assert.equal(buildSku('jkt-a', 'off-white', 'l'), 'JKT-A-OFFWHITE-L');
});

test('a customer is created, found, updated, and never duplicated', () => {
  withDb((t) => {
    const id = transaction(t.db, (tx) =>
      createCustomer(tx, {
        code: 'ktm-01',
        name: 'Kathmandu Traders',
        phone: '01-4441234',
        defaultCurrency: 'NPR',
        userId: t.userId,
      }),
    );

    readOnly(t.db, (tx) => {
      const customer = getCustomer(tx, id);
      assert.equal(customer.code, 'KTM-01');
      assert.equal(customer.name, 'Kathmandu Traders');
      assert.equal(customer.defaultCurrency, 'NPR');
      assert.equal(customer.isActive, true);
    });

    transaction(t.db, (tx) => {
      assert.throws(
        () => createCustomer(tx, { code: 'KTM-01', name: 'Someone else', userId: t.userId }),
        ValidationError,
      );
      updateCustomer(tx, id, { name: 'Kathmandu Traders Pvt Ltd', defaultCurrency: 'INR', phone: '' });
    });

    readOnly(t.db, (tx) => {
      const customer = getCustomer(tx, id);
      assert.equal(customer.name, 'Kathmandu Traders Pvt Ltd');
      assert.equal(customer.defaultCurrency, 'INR');
      assert.equal(customer.phone, null, 'a blank phone is stored as null, not an empty string');
    });
  });
});

test('customer search is parameterised and matches name, code or phone', () => {
  withDb((t) => {
    transaction(t.db, (tx) => {
      createCustomer(tx, { code: 'KTM-01', name: 'Kathmandu Traders', phone: '9800000001', userId: t.userId });
      createCustomer(tx, { code: 'PKR-01', name: 'Pokhara Garments', phone: '9800000002', userId: t.userId });
    });
    readOnly(t.db, (tx) => {
      assert.equal(listCustomers(tx, { search: 'pokhara' }).length, 1);
      assert.equal(listCustomers(tx, { search: 'KTM' }).length, 1);
      assert.equal(listCustomers(tx, { search: '98000000' }).length, 2);
      // A SQL metacharacter is data, not syntax.
      assert.equal(listCustomers(tx, { search: "'; DROP TABLE customers; --" }).length, 0);
      assert.equal(listCustomers(tx).length, 2, 'the table is still there');
    });
  });
});

test('a customer with open orders cannot be deactivated', () => {
  withDb((t) => {
    const customerId = transaction(t.db, (tx) =>
      createCustomer(tx, { code: 'KTM-01', name: 'Kathmandu Traders', userId: t.userId }),
    );
    t.db
      .prepare(
        `INSERT INTO orders (order_no, customer_id, order_date, currency, fx_rate_to_npr, status, created_at, created_by)
         VALUES ('ORD-2026-00001', ?, '2026-08-23', 'NPR', 1000000, 'confirmed', ?, ?)`,
      )
      .run(customerId, new Date().toISOString(), t.userId);

    assert.throws(
      () => transaction(t.db, (tx) => deactivateCustomer(tx, customerId)),
      (error: unknown) => {
        assert.ok(error instanceof BusinessRuleError);
        assert.equal(error.rule, 'customer_has_open_orders');
        return true;
      },
    );

    // Once the order is delivered and closed, deactivating is allowed and the
    // customer is hidden rather than deleted.
    t.db.prepare("UPDATE orders SET status = 'closed' WHERE customer_id = ?").run(customerId);
    transaction(t.db, (tx) => deactivateCustomer(tx, customerId));
    readOnly(t.db, (tx) => {
      assert.equal(listCustomers(tx, { activeOnly: true }).length, 0);
      assert.equal(getCustomer(tx, customerId).isActive, false);
    });

    transaction(t.db, (tx) => reactivateCustomer(tx, customerId));
    readOnly(t.db, (tx) => assert.equal(getCustomer(tx, customerId).isActive, true));
  });
});

test('customer validation refuses nonsense rather than storing it', () => {
  withDb((t) => {
    transaction(t.db, (tx) => {
      assert.throws(() => createCustomer(tx, { code: '', name: 'No code', userId: t.userId }), ValidationError);
      assert.throws(() => createCustomer(tx, { code: 'C-1', name: '   ', userId: t.userId }), ValidationError);
      assert.throws(
        () =>
          createCustomer(tx, {
            code: 'C-2',
            name: 'Bad currency',
            defaultCurrency: 'EUR' as 'NPR',
            userId: t.userId,
          }),
        ValidationError,
      );
      assert.throws(() => getCustomer(tx, 999), NotFoundError);
    });
  });
});
