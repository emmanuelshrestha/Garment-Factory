# HTTP API

Base URL: `http://localhost:4000`

All successful bodies are JSON. Mutations that own a ledger run inside `BEGIN IMMEDIATE … COMMIT` on the server; a thrown business error rolls the whole request back.

Authentication: `POST /api/auth/login` sets an httpOnly cookie `garment_session`. When `GARMENT_REQUIRE_AUTH=1` or `NODE_ENV=production`, every `/api/*` route except `/api/health` and `/api/auth/*` returns `401` without a valid session.

---

## Error shape

```json
{
  "error": "validation_error",
  "message": "currency must be one of NPR, INR, USD, got \"EUR\"",
  "field": "currency"
}
```

| `error` | Typical HTTP |
|---|---|
| `validation_error` | 400 |
| `not_found` | 404 |
| `unauthenticated` | 401 |
| `business_rule` (and named codes such as `cannot_cancel_part_delivered_order`) | 409 / 422 depending on the route |
| `unprocessable` / domain codes | 400–409 |

Named business codes are stable and safe to key UI on (`delivery_exceeds_available_stock`, `dispatched_delivery_cannot_be_cancelled`, …).

Money in JSON is **integer minor units** (paisa / cents). `285000` with `currency: "NPR"` is NPR 2,850.00. Never send a float.

Dates are `YYYY-MM-DD` (AD). Timestamps are ISO-8601 UTC.

---

## Health & auth

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/health` | `{ ok, time }` — no auth |
| `POST` | `/api/auth/login` | `{ username, password }` → `{ user }`, Set-Cookie |
| `POST` | `/api/auth/logout` | Clears cookie |
| `GET` | `/api/auth/me` | `{ user }` or `{ user: null }` |

---

## Dashboard

| Method | Path |
|---|---|
| `GET` | `/api/dashboard` |

Returns the morning briefing: order counts and shortage pieces, inventory red/amber totals, draft vs dispatched deliveries, pending cheques (count + NPR amount), receivables by currency, recent audit rows.

---

## Catalogue

| Method | Path | Body / query |
|---|---|---|
| `GET` | `/api/colours` | `activeOnly` |
| `POST` | `/api/colours` | `{ name }` |
| `GET` | `/api/sizes` | `activeOnly` — ordered by `sort_order` (S→3XL), not alphabetically |
| `POST` | `/api/sizes` | `{ name, sortOrder? }` |
| `GET` | `/api/products` | |
| `POST` | `/api/products` | `{ code, name, category?, defaultPriceMinor, defaultCurrency? }` |
| `GET` | `/api/products/:id` | |
| `PATCH` | `/api/products/:id` | fields to update |
| `POST` | `/api/products/:id/price` | append-only `price_history` |
| `POST` | `/api/products/:id/variants` | generate the colour × size grid |
| `GET` | `/api/variants` | |
| `GET` | `/api/variants/:id/price` | resolved price (override → product default) |
| `PATCH` | `/api/variants/:id` | override price, `minStockQty`, `isActive` |

A SKU is `(product, colour, size)`. The matrix you see in the UI is a pivot over `product_variants`, not a database grid.

---

## Customers

| Method | Path |
|---|---|
| `GET` | `/api/customers` |
| `POST` | `/api/customers` |
| `GET` | `/api/customers/:id` |
| `PUT` / `PATCH` | `/api/customers/:id` |
| `POST` | `/api/customers/:id/deactivate` |
| `POST` | `/api/customers/:id/reactivate` |
| `GET` | `/api/customers/:id/statement` |

Customers are deactivated, never deleted. A customer with open orders cannot be deactivated.

Statement is **per currency**: issued invoices, cleared allocations, pending cheques, advances. NPR is not summed with INR.

---

## Orders

| Method | Path | What it does |
|---|---|---|
| `GET` | `/api/orders` | filters: `customerId`, `status`, `openOnly`, `fromDate`, `toDate`, `limit` |
| `POST` | `/api/orders` | create **draft**; snapshots unit prices |
| `GET` | `/api/orders/:id` | |
| `POST` | `/api/orders/:id/lines` | add lines (draft only) |
| `PATCH` | `/api/orders/:id/lines/:lineId` | edit qty/price (draft only) |
| `DELETE` | `/api/orders/:id/lines/:lineId` | |
| `POST` | `/api/orders/:id/confirm` | freeze prices, allocate available stock, report shortage, assign `ORD-YYYY-NNNNN` |
| `POST` | `/api/orders/:id/allocate` | re-run allocation (e.g. after stock arrives) |
| `POST` | `/api/orders/:id/cancel` | draft/confirmed only; releases reservations. Part-delivered is **refused** (OPEN-5) |
| `POST` | `/api/orders/:id/close` | |
| `GET` | `/api/shortages` | variants that confirmed orders cannot cover |

Confirm writes `stock_allocations` and **zero** `stock_movements`.

---

## Deliveries

| Method | Path | What it does |
|---|---|---|
| `GET` | `/api/deliveries` | |
| `POST` | `/api/deliveries` | create **draft** packing list — moves no stock |
| `GET` | `/api/deliveries/:id` | |
| `POST` | `/api/deliveries/:id/dispatch` | live stock check, `delivery_out` movements, consume + re-allocate, `DEL-YYYY-NNNNN` |
| `POST` | `/api/deliveries/:id/cancel` | draft only. Dispatched is **refused** (OPEN-7) |

A line may take: its own reservation + unreserved on-hand. It may not take another order’s reservation, more than the order still expects, or more than exists. One bad line refuses the whole dispatch.

---

## Invoices

| Method | Path |
|---|---|
| `GET` | `/api/billable` | dispatched lines not yet on a non-void invoice |
| `GET` | `/api/invoices` |
| `POST` | `/api/invoices` | from selected delivery lines; optional `discountMinor` + **required** `discountReason` |
| `GET` | `/api/invoices/:id` |
| `POST` | `/api/invoices/:id/issue` | `INV-YYYY-NNNNN`; after this the row is frozen |
| `POST` | `/api/invoices/:id/void` | `{ reason }` mandatory. Goods become billable again |

One delivery line appears on at most one non-void invoice (enforced by a trigger).

---

## Payments & receivables

| Method | Path | What it does |
|---|---|---|
| `GET` | `/api/payments` | filters include `method`, `status`, customer |
| `POST` | `/api/payments` | cash/bank born `cleared`; cheque born `pending` |
| `GET` | `/api/payments/:id` | |
| `POST` | `/api/payments/:id/apply` | allocate to specific invoices. Excess = customer advance |
| `POST` | `/api/payments/:id/clear` | cheque → cleared; now it reduces receivables |
| `POST` | `/api/payments/:id/bounce` | `{ reason }` — restores outstanding, keeps the row |
| `POST` | `/api/payments/:id/cancel` | `{ reason }` |
| `GET` | `/api/cheques/pending` | drawer; post-dated listed apart |
| `GET` | `/api/receivables` | outstanding issued invoices |

A pending cheque **does not** reduce what the customer owes. Cross-currency apply is refused.

---

## Finished stock

| Method | Path |
|---|---|
| `GET` | `/api/stock` | colour × size summaries, bands |
| `GET` | `/api/stock/low` | red + amber, worst first |
| `GET` | `/api/stock/:variantId` | |
| `PUT` | `/api/stock/:variantId` | (settings such as min qty — see route) |
| `POST` | `/api/stock/opening-balance` | once per variant |
| `POST` | `/api/stock/adjustments` | `{ reasonCode, note, lines[] }` — note required |

There is no `PATCH` of on-hand. On-hand is the ledger.

---

## Cutting stock

Separate ledger. Transfer is what creates finished `production_receipt`.

| Method | Path |
|---|---|
| `GET` | `/api/cutting-stock` |
| `POST` | `/api/cutting-stock/add` |
| `POST` | `/api/cutting-stock/transfer-to-finished` |
| `POST` | `/api/cutting-stock/adjust` |

---

## Expenses, purchases, employees

| Method | Path |
|---|---|
| `GET` / `POST` | `/api/expenses` |
| `GET` | `/api/expenses/:id` |
| `GET` / `POST` | `/api/purchases` |
| `GET` | `/api/purchases/:id` |
| `GET` / `POST` | `/api/employees` |
| `PATCH` | `/api/employees/:id/toggle` |
| `GET` | `/api/earnings/monthly` |
| `POST` | `/api/earnings` |
| `GET` | `/api/earnings/employee/:id` |

Purchases do **not** write `stock_movements`. Finished stock only increases via opening balance, production receipt (including cutting transfer), return, or authorised adjustment-in.

---

## Document numbers

Assigned inside the same transaction as the document, so a rollback cannot burn a number.

```
ORD-2026-00001
DEL-2026-00001
INV-2026-00001
PAY-2026-00001
```

Year is the **document’s own AD date**, not today. Sequence resets 1 January, independently per type. Five digits is a hard ceiling (99,999 / type / year); exceeding it throws rather than widening the format.
