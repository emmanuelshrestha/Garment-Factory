import test from 'node:test';
import assert from 'node:assert/strict';
import { readOnly, transaction } from '../../src/db/sqlite.ts';
import {
  buildSku,
  createColour,
  createProduct,
  createSize,
  deleteColour,
  deleteProduct,
  deleteSize,
  deleteVariant,
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
  updateColour,
  updateProduct,
  updateSize,
} from '../../src/services/catalogue.ts';
import {
  createCustomer,
  deactivateCustomer,
  getCustomer,
  listCustomers,
  reactivateCustomer,
  updateCustomer,
} from '../../src/services/customers.ts';
import { getStockOnHand, recordOpeningBalance } from '../../src/services/stock.ts';
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

test('generated variants store minStockQty and can receive opening stock', () => {
  withDb((t) => {
    // Create a product, a colour, and a size
    const productId = transaction(t.db, (tx) =>
      createProduct(tx, {
        code: 'JKT-M', name: 'Min Stock Jacket',
        defaultPriceMinor: 100000, defaultCurrency: 'NPR',
        userId: t.userId,
      }),
    );

    const colourId = transaction(t.db, (tx) =>
      createColour(tx, 'Navy'),
    );

    // Use the already-seeded size 'M' from migrations
    const sizes = readOnly(t.db, (tx) => listSizes(tx));
    const sizeM = sizes.find((s) => s.name === 'M');
    assert.ok(sizeM, 'size M should be seeded by migration');
    const sizeId = sizeM.id;

    // Generate with minStockQty = 20
    const result = transaction(t.db, (tx) =>
      generateVariants(tx, {
        productId,
        colourIds: [colourId],
        sizeIds: [sizeId],
        minStockQty: 20,
        userId: t.userId,
      }),
    );

    assert.equal(result.created.length, 1, 'one variant created');

    // Verify minStockQty is persisted
    readOnly(t.db, (tx) => {
      const variants = listVariants(tx, productId);
      assert.equal(variants.length, 1);
      assert.equal(variants[0].minStockQty, 20, 'minStockQty stored correctly');
    });

    // Record opening balance (simulates what the route handler does for openingStockQty)
    transaction(t.db, (tx) =>
      recordOpeningBalance(tx, {
        variantId: result.created[0],
        qty: 50,
        userId: t.userId,
      }),
    );

    // Verify stock is now 50
    readOnly(t.db, (tx) => {
      const onHand = getStockOnHand(tx, result.created[0]);
      assert.equal(onHand, 50, 'opening stock creates actual on-hand inventory');
    });
  });
});

test('colour CRUD: can update and delete an unused colour, but blocks deletion if used by variant', () => {
  withDb((t) => {
    // 1. Create colour
    const colourId = transaction(t.db, (tx) => createColour(tx, 'Lime'));
    readOnly(t.db, (tx) => {
      const colours = listColours(tx);
      const c = colours.find((x) => x.id === colourId);
      assert.ok(c);
      assert.equal(c.name, 'Lime');
    });

    // 2. Update colour
    transaction(t.db, (tx) => updateColour(tx, colourId, 'Lime Green'));
    readOnly(t.db, (tx) => {
      const colours = listColours(tx);
      const c = colours.find((x) => x.id === colourId);
      assert.ok(c);
      assert.equal(c.name, 'Lime Green');
    });

    // 3. Delete unused colour
    transaction(t.db, (tx) => deleteColour(tx, colourId));
    readOnly(t.db, (tx) => {
      const colours = listColours(tx);
      assert.equal(colours.find((x) => x.id === colourId), undefined);
    });

    // 4. Block deletion when used by variant
    const black = transaction(t.db, (tx) => {
      const cId = createColour(tx, 'Carbon Black');
      const pId = createProduct(tx, { code: 'CRB-01', name: 'Carbon Jacket', userId: t.userId });
      const sizeId = listSizes(tx)[0].id;
      generateVariants(tx, {
        productId: pId,
        colourIds: [cId],
        sizeIds: [sizeId],
        userId: t.userId,
      });
      return cId;
    });

    assert.throws(
      () => transaction(t.db, (tx) => deleteColour(tx, black)),
      (err: any) => err instanceof ValidationError && err.message.includes('used by existing product variants'),
    );
  });
});

test('size CRUD: can update and delete an unused size, but blocks deletion if used by variant', () => {
  withDb((t) => {
    // 1. Create custom size
    const sizeId = transaction(t.db, (tx) => createSize(tx, '4XL', 10));
    readOnly(t.db, (tx) => {
      const s = listSizes(tx).find((x) => x.id === sizeId);
      assert.ok(s);
      assert.equal(s.name, '4XL');
      assert.equal(s.sortOrder, 10);
    });

    // 2. Update size
    transaction(t.db, (tx) => updateSize(tx, sizeId, { name: '5XL', sortOrder: 12 }));
    readOnly(t.db, (tx) => {
      const s = listSizes(tx).find((x) => x.id === sizeId);
      assert.ok(s);
      assert.equal(s.name, '5XL');
      assert.equal(s.sortOrder, 12);
    });

    // 3. Delete unused size
    transaction(t.db, (tx) => deleteSize(tx, sizeId));
    readOnly(t.db, (tx) => {
      assert.equal(listSizes(tx).find((x) => x.id === sizeId), undefined);
    });

    // 4. Block deletion when used by variant
    const inUseSizeId = transaction(t.db, (tx) => {
      const sId = createSize(tx, 'CustomSize', 99);
      const cId = createColour(tx, 'Teal');
      const pId = createProduct(tx, { code: 'CS-01', name: 'Custom Shirt', userId: t.userId });
      generateVariants(tx, {
        productId: pId,
        colourIds: [cId],
        sizeIds: [sId],
        userId: t.userId,
      });
      return sId;
    });

    assert.throws(
      () => transaction(t.db, (tx) => deleteSize(tx, inUseSizeId)),
      (err: any) => err instanceof ValidationError && err.message.includes('used by existing product variants'),
    );
  });
});

test('product and variant CRUD: update attributes, delete variant, and delete unused product', () => {
  withDb((t) => {
    const { productId, variant1Id, variant2Id } = transaction(t.db, (tx) => {
      const pId = createProduct(tx, {
        code: 'SWT-01',
        name: 'Cotton Sweater',
        category: 'Knitwear',
        defaultPriceMinor: 150000,
        defaultCurrency: 'NPR',
        userId: t.userId,
      });
      const red = createColour(tx, 'Red');
      const blue = createColour(tx, 'Blue');
      const sizeM = listSizes(tx).find((s) => s.name === 'M')!.id;
      const res = generateVariants(tx, {
        productId: pId,
        colourIds: [red, blue],
        sizeIds: [sizeM],
        userId: t.userId,
      });
      return { productId: pId, variant1Id: res.created[0], variant2Id: res.created[1] };
    });

    // 1. Update product code, name, category, and price
    transaction(t.db, (tx) =>
      updateProduct(tx, productId, {
        code: 'SWT-02',
        name: 'Wool Sweater',
        category: 'Winterwear',
        defaultPriceMinor: 180000,
        userId: t.userId,
      }),
    );

    readOnly(t.db, (tx) => {
      const p = getProduct(tx, productId);
      assert.equal(p.code, 'SWT-02');
      assert.equal(p.name, 'Wool Sweater');
      assert.equal(p.category, 'Winterwear');
      assert.equal(p.defaultPriceMinor, 180000);

      // Verify price history was appended
      const history = listPriceHistory(tx, productId);
      assert.equal(history.length, 2); // initial price + update
    });

    // 2. Delete one unused variant
    transaction(t.db, (tx) => deleteVariant(tx, variant1Id));
    readOnly(t.db, (tx) => {
      const variants = listVariants(tx, productId);
      assert.equal(variants.length, 1);
      assert.equal(variants[0].id, variant2Id);
    });

    // 3. Block variant deletion if it has stock movements
    transaction(t.db, (tx) =>
      recordOpeningBalance(tx, {
        variantId: variant2Id,
        qty: 10,
        userId: t.userId,
      }),
    );

    assert.throws(
      () => transaction(t.db, (tx) => deleteVariant(tx, variant2Id)),
      (err: any) => err instanceof ValidationError && err.message.includes('stock movements'),
    );

    // 4. Block product deletion if it has variants with stock movements
    assert.throws(
      () => transaction(t.db, (tx) => deleteProduct(tx, productId)),
      (err: any) => err instanceof ValidationError && err.message.includes('stock movements'),
    );

    // 5. Delete an unused product (with variants that have NO movements)
    const emptyProductId = transaction(t.db, (tx) => {
      const pId = createProduct(tx, { code: 'TMP-01', name: 'Temporary Item', userId: t.userId });
      const red = listColours(tx)[0].id;
      const sizeS = listSizes(tx)[0].id;
      generateVariants(tx, { productId: pId, colourIds: [red], sizeIds: [sizeS], userId: t.userId });
      return pId;
    });

    transaction(t.db, (tx) => deleteProduct(tx, emptyProductId));
    readOnly(t.db, (tx) => {
      assert.equal(listProducts(tx).find((p) => p.id === emptyProductId), undefined);
      assert.equal(listVariants(tx, emptyProductId).length, 0);
    });
  });
});

test('product image feature: max 4 images and automatic display image derivation', () => {
  withDb((t) => {
    // 1. Create product with 3 images; displayImage automatically defaults to first image
    const p1Id = transaction(t.db, (tx) =>
      createProduct(tx, {
        code: 'IMG-01',
        name: 'Image Test Product',
        images: ['https://example.com/img1.jpg', 'https://example.com/img2.jpg', 'https://example.com/img3.jpg'],
        userId: t.userId,
      }),
    );

    readOnly(t.db, (tx) => {
      const p = getProduct(tx, p1Id);
      assert.equal(p.images.length, 3);
      assert.equal(p.displayImage, 'https://example.com/img1.jpg');
    });

    // 2. Create product with >4 images: capped at max 4
    const p2Id = transaction(t.db, (tx) =>
      createProduct(tx, {
        code: 'IMG-02',
        name: 'Image Cap Test',
        images: [
          'https://example.com/1.jpg',
          'https://example.com/2.jpg',
          'https://example.com/3.jpg',
          'https://example.com/4.jpg',
          'https://example.com/5.jpg',
        ],
        displayImage: 'https://example.com/3.jpg',
        userId: t.userId,
      }),
    );

    readOnly(t.db, (tx) => {
      const p = getProduct(tx, p2Id);
      assert.equal(p.images.length, 4);
      assert.deepEqual(p.images, [
        'https://example.com/1.jpg',
        'https://example.com/2.jpg',
        'https://example.com/3.jpg',
        'https://example.com/4.jpg',
      ]);
      assert.equal(p.displayImage, 'https://example.com/3.jpg');
    });

    // 3. Update images: when display image is removed, it automatically falls back to the new first image
    transaction(t.db, (tx) => {
      updateProduct(tx, p2Id, {
        images: ['https://example.com/new1.jpg', 'https://example.com/new2.jpg'],
        userId: t.userId,
      });
    });

    readOnly(t.db, (tx) => {
      const p = getProduct(tx, p2Id);
      assert.equal(p.images.length, 2);
      assert.equal(p.displayImage, 'https://example.com/new1.jpg');
    });

    // 4. Update display image explicitly
    transaction(t.db, (tx) => {
      updateProduct(tx, p2Id, {
        displayImage: 'https://example.com/new2.jpg',
        userId: t.userId,
      });
    });

    readOnly(t.db, (tx) => {
      const p = getProduct(tx, p2Id);
      assert.equal(p.displayImage, 'https://example.com/new2.jpg');
    });

    // 5. Remove all images resets displayImage to null
    transaction(t.db, (tx) => {
      updateProduct(tx, p2Id, {
        images: [],
        userId: t.userId,
      });
    });

    readOnly(t.db, (tx) => {
      const p = getProduct(tx, p2Id);
      assert.equal(p.images.length, 0);
      assert.equal(p.displayImage, null);
    });
  });
});

