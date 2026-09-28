import test from 'node:test';
import assert from 'node:assert/strict';
import { readOnly, transaction } from '../../src/db/sqlite.ts';
import {
  createColour,
  createProduct,
  deleteProduct,
  deleteVariant,
  generateVariants,
  getProduct,
  listColours,
  listPriceHistory,
  listProducts,
  listSizes,
  listVariants,
  resolveVariantPrice,
  setProductPrice,
  updateProduct,
} from '../../src/services/catalogue.ts';
import {
  createCustomer,
  getCustomer,
  getCustomerByCode,
  updateCustomer,
} from '../../src/services/customers.ts';
import {
  getStockOnHand,
  getStockSummary,
  listStockSummaries,
  recordOpeningBalance,
} from '../../src/services/stock.ts';
import {
  confirmOrder,
  createOrder,
  getOrder,
} from '../../src/services/orders.ts';
import {
  createDelivery,
  dispatchDelivery,
} from '../../src/services/deliveries.ts';
import {
  getInvoice,
  invoiceDelivery,
  issueInvoice,
} from '../../src/services/invoices.ts';
import {
  getCustomerStatement,
  recordPayment,
} from '../../src/services/payments.ts';
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

/** 10 realistic demo products across standard garment manufacturing categories */
export const DEMO_10_PRODUCTS = [
  { code: 'JKT-BOMBER', name: 'Classic Bomber Jacket', category: 'Jackets', defaultPriceMinor: 285000 },
  { code: 'JKT-PUFFER', name: 'Winter Puffer Jacket', category: 'Jackets', defaultPriceMinor: 420000 },
  { code: 'JKT-DENIM', name: 'Vintage Denim Jacket', category: 'Jackets', defaultPriceMinor: 320000 },
  { code: 'HD-FLEECE', name: 'Heavyweight Fleece Hoodie', category: 'Hoodies', defaultPriceMinor: 220000 },
  { code: 'TS-POLO', name: 'Pique Cotton Polo Shirt', category: 'Shirts', defaultPriceMinor: 145000 },
  { code: 'TR-FORMAL', name: 'Slim Fit Formal Trouser', category: 'Trousers', defaultPriceMinor: 185000 },
  { code: 'CRG-CARGO', name: 'Tactical Cargo Pants', category: 'Pants', defaultPriceMinor: 240000 },
  { code: 'SWT-CREW', name: 'Premium Cotton Crewneck', category: 'Sweaters', defaultPriceMinor: 195000 },
  { code: 'WND-SHELL', name: 'Waterproof Windbreaker', category: 'Outerwear', defaultPriceMinor: 265000 },
  { code: 'TRK-SPORT', name: 'Athletic Track Pants', category: 'Sportswear', defaultPriceMinor: 160000 },
] as const;

export const DEMO_CUSTOMER = {
  code: 'CUST-DEMO',
  name: 'Kathmandu Outfitters & Apparel',
  phone: '+977 9801234567',
  address: 'New Road, Kathmandu, Nepal',
  defaultCurrency: 'NPR' as const,
  notes: 'Premier wholesale retail chain with 4 outlets in Bagmati province.',
};

export const DEMO_COLOURS = ['Black', 'Navy Blue', 'Olive', 'Maroon', 'Heather Grey'];

test('TDD: Seed and verify 10 demo products with full attributes and price history', () => {
  withDb((t) => {
    // 1. Create the 10 products
    const productIds = transaction(t.db, (tx) => {
      return DEMO_10_PRODUCTS.map((p) => {
        return createProduct(tx, {
          code: p.code,
          name: p.name,
          category: p.category,
          defaultPriceMinor: p.defaultPriceMinor,
          defaultCurrency: 'NPR',
          userId: t.userId,
        });
      });
    });

    assert.equal(productIds.length, 10, 'All 10 products should be created');

    // 2. Read and verify all 10 products
    readOnly(t.db, (tx) => {
      const all = listProducts(tx);
      assert.equal(all.length, 10, 'There should be exactly 10 products listed');

      DEMO_10_PRODUCTS.forEach((expected, i) => {
        const prod = getProduct(tx, productIds[i]!);
        assert.equal(prod.code, expected.code);
        assert.equal(prod.name, expected.name);
        assert.equal(prod.category, expected.category);
        assert.equal(prod.defaultPriceMinor, expected.defaultPriceMinor);
        assert.equal(prod.defaultCurrency, 'NPR');
        assert.equal(prod.isActive, true);

        // Price history initial entry
        const history = listPriceHistory(tx, prod.id);
        assert.equal(history.length, 1);
        assert.equal(history[0]!.priceMinor, expected.defaultPriceMinor);
        assert.equal(history[0]!.note, 'Initial price');
      });
    });
  });
});

test('TDD: Generate variant matrices across all 10 demo products and verify SKUs and pricing', () => {
  withDb((t) => {
    transaction(t.db, (tx) => {
      // Create colours
      const colourIds = DEMO_COLOURS.map((c) => createColour(tx, c));
      const sizes = listSizes(tx).filter((s) => ['M', 'L', 'XL'].includes(s.name));

      for (const p of DEMO_10_PRODUCTS) {
        const productId = createProduct(tx, {
          code: p.code,
          name: p.name,
          category: p.category,
          defaultPriceMinor: p.defaultPriceMinor,
          userId: t.userId,
        });

        // 5 colours x 3 sizes = 15 variants per product
        const result = generateVariants(tx, {
          productId,
          colourIds,
          sizeIds: sizes.map((s) => s.id),
          minStockQty: 10,
          userId: t.userId,
        });

        assert.equal(result.created.length, 15, `Product ${p.code} should have 15 variants created`);

        // Check variant SKUs and inherited default price
        const variants = listVariants(tx, productId);
        assert.equal(variants.length, 15);
        for (const v of variants) {
          assert.match(v.sku, new RegExp(`^${p.code}-[A-Z]+-[A-Z0-9]+$`));
          const resolved = resolveVariantPrice(tx, v.id);
          assert.equal(resolved.priceMinor, p.defaultPriceMinor);
          assert.equal(resolved.source, 'product');
        }
      }
    });

    readOnly(t.db, (tx) => {
      const allProducts = listProducts(tx);
      assert.equal(allProducts.length, 10);
      const totalVariants = allProducts.reduce((sum, p) => sum + listVariants(tx, p.id).length, 0);
      assert.equal(totalVariants, 150, '10 products x 15 variants each = 150 total variants');
    });
  });
});

test('TDD: Demo customer lifecycle — create, retrieve, update, and initial ledger state', () => {
  withDb((t) => {
    // 1. Create demo customer
    const customerId = transaction(t.db, (tx) => {
      return createCustomer(tx, {
        code: DEMO_CUSTOMER.code,
        name: DEMO_CUSTOMER.name,
        phone: DEMO_CUSTOMER.phone,
        address: DEMO_CUSTOMER.address,
        defaultCurrency: DEMO_CUSTOMER.defaultCurrency,
        notes: DEMO_CUSTOMER.notes,
        userId: t.userId,
      });
    });

    // 2. Fetch by code and by id
    readOnly(t.db, (tx) => {
      const fetched = getCustomer(tx, customerId);
      assert.equal(fetched.code, 'CUST-DEMO');
      assert.equal(fetched.name, 'Kathmandu Outfitters & Apparel');
      assert.equal(fetched.defaultCurrency, 'NPR');
      assert.equal(fetched.phone, '+977 9801234567');

      const byCode = getCustomerByCode(tx, 'CUST-DEMO');
      assert.ok(byCode);
      assert.equal(byCode.id, customerId);

      // Statement should be clean with 0 balances
      const statement = getCustomerStatement(tx, customerId);
      assert.equal(statement.invoices.length, 0);
      assert.equal(statement.payments.length, 0);
      assert.equal(statement.balances.length, 0);
    });

    // 3. Update customer details
    transaction(t.db, (tx) => {
      updateCustomer(tx, customerId, {
        address: 'Durbar Marg, Kathmandu, Nepal',
        phone: '+977 9809999999',
      });
    });

    readOnly(t.db, (tx) => {
      const updated = getCustomer(tx, customerId);
      assert.equal(updated.address, 'Durbar Marg, Kathmandu, Nepal');
      assert.equal(updated.phone, '+977 9809999999');
    });
  });
});

test('TDD: Full business flow — Demo customer orders across demo products, stock allocation, delivery, invoice, and payment', () => {
  withDb((t) => {
    // Step 1: Set up Demo Customer & Catalogue
    const { customerId, variantMap } = transaction(t.db, (tx) => {
      const custId = createCustomer(tx, {
        code: DEMO_CUSTOMER.code,
        name: DEMO_CUSTOMER.name,
        phone: DEMO_CUSTOMER.phone,
        address: DEMO_CUSTOMER.address,
        defaultCurrency: 'NPR',
        userId: t.userId,
      });

      const black = createColour(tx, 'Black');
      const navy = createColour(tx, 'Navy');
      const sizeL = listSizes(tx).find((s) => s.name === 'L')!.id;
      const sizeM = listSizes(tx).find((s) => s.name === 'M')!.id;

      const vMap: Record<string, number> = {};

      for (const p of DEMO_10_PRODUCTS) {
        const pId = createProduct(tx, {
          code: p.code,
          name: p.name,
          category: p.category,
          defaultPriceMinor: p.defaultPriceMinor,
          userId: t.userId,
        });

        const gen = generateVariants(tx, {
          productId: pId,
          colourIds: [black, navy],
          sizeIds: [sizeM, sizeL],
          minStockQty: 10,
          userId: t.userId,
        });

        // Store first variant ID for this product
        vMap[p.code] = gen.created[0]!;
      }

      return { customerId: custId, variantMap: vMap };
    });

    // Step 2: Seed stock opening balance for 4 products
    const bomberVariant = variantMap['JKT-BOMBER']!;
    const hoodieVariant = variantMap['HD-FLEECE']!;
    const poloVariant = variantMap['TS-POLO']!;
    const cargoVariant = variantMap['CRG-CARGO']!;

    transaction(t.db, (tx) => {
      recordOpeningBalance(tx, { variantId: bomberVariant, qty: 50, userId: t.userId });
      recordOpeningBalance(tx, { variantId: hoodieVariant, qty: 30, userId: t.userId });
      recordOpeningBalance(tx, { variantId: poloVariant, qty: 100, userId: t.userId });
      // Cargo left with 0 stock to test shortage calculation
    });

    // Step 3: Demo customer places an order across these 4 products
    const orderId = transaction(t.db, (tx) => {
      return createOrder(tx, {
        customerId,
        orderDate: '2026-09-26',
        requiredDate: '2026-10-05',
        currency: 'NPR',
        notes: 'Initial autumn stock order for flagship store',
        lines: [
          { variantId: bomberVariant, qtyOrdered: 20, unitPriceMinor: 285000 },
          { variantId: hoodieVariant, qtyOrdered: 15, unitPriceMinor: 220000 },
          { variantId: poloVariant, qtyOrdered: 40, unitPriceMinor: 145000 },
          { variantId: cargoVariant, qtyOrdered: 10, unitPriceMinor: 240000 },
        ],
        userId: t.userId,
      });
    });

    readOnly(t.db, (tx) => {
      const order = getOrder(tx, orderId);
      assert.equal(order.status, 'draft');
      assert.equal(order.lines.length, 4);
      // Total = (20 * 2850) + (15 * 2200) + (40 * 1450) + (10 * 2400) = 57,000 + 33,000 + 58,000 + 24,000 = 172,000 NPR
      assert.equal(order.totalMinor, 17200000);
    });

    // Step 4: Confirm order and allocate stock
    const allocation = transaction(t.db, (tx) => {
      return confirmOrder(tx, orderId, t.userId);
    });

    assert.equal(allocation.status, 'confirmed');
    // Cargo had 0 on hand, so 10 pieces shortage
    assert.equal(allocation.totalShortageQty, 10, 'Cargo pants should have a shortage of 10');

    // Step 5: Deliver available lines (20 Bombers, 15 Hoodies, 40 Polos)
    const deliveryId = transaction(t.db, (tx) => {
      const order = getOrder(tx, orderId);
      const deliveryLines = order.lines
        .filter((line) => line.variantId !== cargoVariant)
        .map((line) => ({
          orderLineId: line.id,
          qty: line.qtyOrdered,
        }));

      const d = createDelivery(tx, {
        orderId,
        deliveredAt: '2026-09-27',
        lines: deliveryLines,
        userId: t.userId,
      });

      dispatchDelivery(tx, d.id, t.userId);
      return d.id;
    });

    // Verify inventory deducted
    readOnly(t.db, (tx) => {
      assert.equal(getStockOnHand(tx, bomberVariant), 30, '50 on hand - 20 delivered = 30 left');
      assert.equal(getStockOnHand(tx, hoodieVariant), 15, '30 on hand - 15 delivered = 15 left');
      assert.equal(getStockOnHand(tx, poloVariant), 60, '100 on hand - 40 delivered = 60 left');
    });

    // Step 6: Generate and issue invoice for delivered items
    const invoiceId = transaction(t.db, (tx) => {
      const inv = invoiceDelivery(tx, deliveryId, {
        invoiceDate: '2026-09-27',
        dueDate: '2026-10-27',
        userId: t.userId,
      });
      issueInvoice(tx, inv.id, t.userId);
      return inv.id;
    });

    readOnly(t.db, (tx) => {
      const invoice = getInvoice(tx, invoiceId);
      assert.equal(invoice.status, 'issued');
      // Invoiced total = 172,000 - 24,000 (undelivered cargo) = 148,000 NPR (14,800,000 minor)
      assert.equal(invoice.totalMinor, 14800000);

      // Customer statement reflects debt
      const statement = getCustomerStatement(tx, customerId);
      const nprBal = statement.balances.find((b) => b.currency === 'NPR')!;
      assert.equal(nprBal.invoicedMinor, 14800000);
      assert.equal(nprBal.outstandingMinor, 14800000);
      assert.equal(nprBal.settledMinor, 0);
    });

    // Step 7: Customer pays invoice in full via bank transfer
    transaction(t.db, (tx) => {
      recordPayment(tx, {
        customerId,
        amountMinor: 14800000,
        currency: 'NPR',
        receivedAt: '2026-09-28',
        method: 'bank_transfer',
        note: 'Full settlement of autumn dispatch invoice',
        allocations: [{ invoiceId, amountMinor: 14800000 }],
        userId: t.userId,
      });
    });

    // Step 8: Verify invoice is settled and customer owes zero
    readOnly(t.db, (tx) => {
      const invoice = getInvoice(tx, invoiceId);
      assert.equal(invoice.status, 'issued');

      const statement = getCustomerStatement(tx, customerId);
      assert.equal(statement.payments.length, 1);
      const nprBal = statement.balances.find((b) => b.currency === 'NPR')!;
      assert.equal(nprBal.outstandingMinor, 0, 'Customer outstanding balance should now be 0');
      assert.equal(nprBal.settledMinor, 14800000);
    });
  });
});

test('TDD: Catalogue CRUD rules on demo dataset — price updates, price history audit, and safe deletion guards', () => {
  withDb((t) => {
    // 1. Create demo product and customer
    const { productId, variantId } = transaction(t.db, (tx) => {
      const pId = createProduct(tx, {
        code: 'WND-SHELL',
        name: 'Waterproof Windbreaker',
        category: 'Outerwear',
        defaultPriceMinor: 265000,
        userId: t.userId,
      });
      const olive = createColour(tx, 'Olive');
      const sizeM = listSizes(tx).find((s) => s.name === 'M')!.id;
      const gen = generateVariants(tx, {
        productId: pId,
        colourIds: [olive],
        sizeIds: [sizeM],
        userId: t.userId,
      });
      return { productId: pId, variantId: gen.created[0]! };
    });

    // 2. Update price and verify append-only price history
    transaction(t.db, (tx) => {
      updateProduct(tx, productId, {
        defaultPriceMinor: 290000,
        name: 'Technical Waterproof Windbreaker Pro',
        userId: t.userId,
      });
    });

    readOnly(t.db, (tx) => {
      const p = getProduct(tx, productId);
      assert.equal(p.name, 'Technical Waterproof Windbreaker Pro');
      assert.equal(p.defaultPriceMinor, 290000);

      const history = listPriceHistory(tx, productId);
      assert.equal(history.length, 2);
      assert.equal(history[0]!.priceMinor, 265000);
      assert.equal(history[1]!.priceMinor, 290000);
    });

    // 3. Stock movement prevents deletion
    transaction(t.db, (tx) => {
      recordOpeningBalance(tx, { variantId, qty: 5, userId: t.userId });
    });

    assert.throws(
      () => transaction(t.db, (tx) => deleteProduct(tx, productId)),
      (err: any) => err instanceof ValidationError && err.message.includes('stock movements'),
    );

    assert.throws(
      () => transaction(t.db, (tx) => deleteVariant(tx, variantId)),
      (err: any) => err instanceof ValidationError && err.message.includes('stock movements'),
    );
  });
});
