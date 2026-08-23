/**
 * Price resolution (D009).
 *
 * Order: variant override → product default → error. Never zero, never a
 * guess. A product that has not been priced yet must fail loudly at the point
 * of sale rather than quietly invoice at nothing.
 */

import { BusinessRuleError } from './errors.ts';
import { assertCurrency, assertNonNegativeMinor, type Currency } from './money.ts';

export type PriceSource = 'variant' | 'product';

export type ResolvedPrice = {
  priceMinor: number;
  currency: Currency;
  source: PriceSource;
};

export type PriceInputs = {
  variantPriceMinor: number | null;
  productDefaultPriceMinor: number | null;
  productCurrency: string;
  /** For the error message only. */
  sku?: string;
};

export function resolvePrice(inputs: PriceInputs): ResolvedPrice {
  const currency = assertCurrency(inputs.productCurrency);

  if (inputs.variantPriceMinor !== null && inputs.variantPriceMinor !== undefined) {
    return {
      priceMinor: assertNonNegativeMinor(inputs.variantPriceMinor, 'variantPriceMinor'),
      currency,
      source: 'variant',
    };
  }

  if (inputs.productDefaultPriceMinor !== null && inputs.productDefaultPriceMinor !== undefined) {
    return {
      priceMinor: assertNonNegativeMinor(inputs.productDefaultPriceMinor, 'defaultPriceMinor'),
      currency,
      source: 'product',
    };
  }

  throw new BusinessRuleError(
    'price_not_set',
    `no price is set for ${inputs.sku ?? 'this variant'}; set a product default or a variant price before selling it`,
    { sku: inputs.sku },
  );
}
