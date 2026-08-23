import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePrice } from '../../src/domain/pricing.ts';
import { BusinessRuleError, ValidationError } from '../../src/domain/errors.ts';

test('D009: a variant override wins over the product default', () => {
  assert.deepEqual(
    resolvePrice({ variantPriceMinor: 95000, productDefaultPriceMinor: 80000, productCurrency: 'NPR' }),
    { priceMinor: 95000, currency: 'NPR', source: 'variant' },
  );
});

test('D009: the product default is used when there is no override', () => {
  assert.deepEqual(
    resolvePrice({ variantPriceMinor: null, productDefaultPriceMinor: 80000, productCurrency: 'NPR' }),
    { priceMinor: 80000, currency: 'NPR', source: 'product' },
  );
});

test('D009: an unpriced product errors rather than selling at zero', () => {
  assert.throws(
    () =>
      resolvePrice({
        variantPriceMinor: null,
        productDefaultPriceMinor: null,
        productCurrency: 'NPR',
        sku: 'JKT-A-BLACK-L',
      }),
    (error: unknown) => {
      assert.ok(error instanceof BusinessRuleError);
      assert.equal(error.rule, 'price_not_set');
      assert.match(error.message, /JKT-A-BLACK-L/);
      return true;
    },
  );
});

test('a zero override is a real price and is honoured, unlike a missing one', () => {
  // A free sample line is legitimate; "no price set" is not the same thing.
  assert.deepEqual(
    resolvePrice({ variantPriceMinor: 0, productDefaultPriceMinor: 80000, productCurrency: 'NPR' }),
    { priceMinor: 0, currency: 'NPR', source: 'variant' },
  );
});

test('price resolution rejects a float or a bad currency', () => {
  assert.throws(
    () => resolvePrice({ variantPriceMinor: 950.5, productDefaultPriceMinor: null, productCurrency: 'NPR' }),
    ValidationError,
  );
  assert.throws(
    () => resolvePrice({ variantPriceMinor: 95000, productDefaultPriceMinor: null, productCurrency: 'EUR' }),
    ValidationError,
  );
  assert.throws(
    () => resolvePrice({ variantPriceMinor: -1, productDefaultPriceMinor: null, productCurrency: 'NPR' }),
    ValidationError,
  );
});

test('the currency comes from the product, never guessed', () => {
  assert.equal(
    resolvePrice({ variantPriceMinor: null, productDefaultPriceMinor: 1200, productCurrency: 'USD' }).currency,
    'USD',
  );
  assert.equal(
    resolvePrice({ variantPriceMinor: null, productDefaultPriceMinor: 1200, productCurrency: 'INR' }).currency,
    'INR',
  );
});
