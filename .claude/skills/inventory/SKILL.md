---
name: inventory
description: Use whenever modifying stock, allocation, delivery, stock adjustments, or inventory reporting in the garment factory system. Defines stock identity, the movement ledger as source of truth, and availability.
---

# Inventory Skill

Use whenever modifying stock, allocation, delivery, adjustments, or
inventory reporting.

Stock identity:

```
Product + Colour + Size
```

Source of truth:

```
stock_movements
```

on_hand:

```
SUM(stock_movements.qty_delta)
```

available:

```
on_hand - active allocations
```

Rules:

- Allocation does not change physical stock.
- Delivery decreases physical stock.
- Packing acceptance increases physical stock.
- Cutting does not change finished stock.
- Sewing does not change finished stock.
- Stock may never become negative.
- Adjustments require a reason.
- Stock movements are append-only.

Any change to stock behavior requires integration tests.

## Project-specific rules

- Never introduce a cached stock quantity column without explicit owner
  approval. On-hand is read only through `getStockOnHand()`, so a cache can
  be added later in one place if it is ever approved.
- Only `services/stock.ts` may insert into `stock_movements`, via a single
  `recordStockMovement(tx, ...)` function. No other code path writes stock.
- Every movement records variant, qty_delta, movement_type, reference
  transaction, occurred_at, created_by, and a reason where applicable.
- Low stock uses a per-variant threshold, `product_variants.min_stock_qty`
  (D012). Red is `on_hand <= min_stock_qty`; amber is
  `min_stock_qty < on_hand <= min_stock_qty * 1.25` (D019). The 25% is one
  system-wide setting. Use integer arithmetic — no float in a stock
  comparison.
- Do not implement raw-material inventory. It is out of scope.
