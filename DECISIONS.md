# Architecture & Business Decisions

Each decision records what was decided and who decided it.
**CONFIRMED** = decided by the owner. **PROPOSED** = recommended by the
engineer, not yet approved, must not be built on until confirmed.

---

## D001 — New system rather than Excel migration — CONFIRMED

The application starts with clean master data and opening stock.
Existing Excel files are reference material only.

Date: 2026-08-23

---

## D002 — Single factory location — CONFIRMED

MVP supports one factory location.
No warehouse/location dimension is required.

---

## D003 — Finished stock ledger — CONFIRMED

Finished stock is calculated from `stock_movements`.
Cutting and sewing do not affect finished stock.
Packing acceptance creates `production_receipt`.

---

## D004 — Allocation is reservation — CONFIRMED

Order confirmation reserves stock but does not remove physical stock.
Delivery consumes the reservation and creates `delivery_out`.

---

## D005 — Immutable financial history — CONFIRMED

Issued invoices cannot be edited.
Corrections use void-and-reissue.

---

## D006 — SQLite — CONFIRMED

SQLite is the MVP database.
Database access is isolated behind `db/sqlite.ts`.

---

## D007 — Money — CONFIRMED

All money uses integer minor units.
Floating point is prohibited for financial calculations.

---

## D008 — Production is Slice 2 — CONFIRMED

Production workflow is deliberately deferred until the sales/inventory
core is proven.

---

## D009 — Pricing: product default with optional variant override — CONFIRMED

Owner decision, 2026-08-23.

A product carries a default price. An individual variant may override it,
so larger sizes can cost more without duplicating prices:

```
Jacket A   S=800  M=800  L=800  XL=850  2XL=900
```

Schema consequence: `products.default_price_minor` plus nullable
`product_variants.price_minor`. Resolution order is variant override →
product default → error if neither is set.

Order lines still snapshot the resolved price at order time (D005), so a
later price change cannot alter an existing order or invoice.

---

## D010 — One invoice may span multiple deliveries — CONFIRMED

Owner decision, 2026-08-23.

Natural for a customer who orders 500 pieces and receives them across
several shipments.

Schema consequence: `invoice_lines.delivery_line_id` is UNIQUE and the
invoice header does not require a single `delivery_id`. Invoicing
validates that every selected delivery line belongs to the same customer
and is not already on a non-void invoice.

---

## D011 — Foreign-currency orders are priced in the order currency — CONFIRMED

Owner decision, 2026-08-23.

If an Indian customer buys at ₹850, the order line stores 85000 minor
units with currency INR. The system does **not** derive that figure by
converting an NPR price.

The FX rate is captured on the document for NPR reporting only; it never
participates in producing the sale price.

---

## D012 — Low stock uses a per-variant threshold — CONFIRMED

Owner decision, 2026-08-23.

Each variant carries its own minimum, because the right minimum differs
per colour and size:

```
Jacket A / Black / L = minimum 20
Jacket A / Red   / L = minimum 10
```

Dashboard reports two states: below minimum (red) and approaching
minimum (amber).

Schema consequence: `product_variants.min_stock_qty INTEGER NOT NULL
DEFAULT 0`. The amber band rule is D019.

---

## D013 — Append-only scope, precisely defined — CONFIRMED (clarification)

Strictly insert-only, never updated or deleted:
`stock_movements`, `invoice_lines`, `payment_allocations`,
`price_history`, `audit_log`.

Document status columns (`orders.status`, `invoices.status`,
`payments.status`, `stock_allocations.status`) do legitimately transition
— a cheque clearing or an invoice being voided is a real event. Every
transition writes an `audit_log` row with old and new value.

Products, variants, and customers are deactivated, never deleted, because
history references them.

---

## D014 — SQLite STRICT tables — CONFIRMED

Node 22's bundled SQLite is **3.51.3**, which supports `STRICT` tables.

Verified in this environment: a `STRICT` table **rejects both a string and
a float** written into an `INTEGER` money column, at the database level.

This turns "never use floating point for money" (D007) from a code
convention into a storage guarantee. Recommended for every table.

Cost: `STRICT` permits only INT/INTEGER/REAL/TEXT/BLOB/ANY column types,
which the schema already uses. No practical downside found.

Approved by owner 2026-08-23. Every table is declared `STRICT`.

---

## D015 — Money ceiling and BigInt — PROPOSED (informational)

Money is read into JavaScript `number`. The safe integer ceiling is
9,007,199,254,740,991 minor units — about 90 trillion NPR. Every realistic
amount is far below this.

Verified: reading a value above that ceiling throws `RangeError` rather
than silently losing precision, which is the safe failure mode. If a
column could ever exceed it, `node:sqlite`'s BigInt read option must be
enabled for that query.

No action needed now; recorded so the limit is known rather than
discovered.

---

## D016 — Bikram Sambat is derived, not stored — SUPERSEDED by D020

Original proposal: store the AD date as canonical ISO-8601 text and derive
Bikram Sambat with a pure function using a month-length table.

Superseded 2026-08-23 when the owner chose AD only. No BS conversion
exists in the system. Kept for the record.


---

## D017 — Document numbering — CONFIRMED (amended 2026-08-23)

Owner decision, 2026-08-23.

Format: prefix, four-digit year, five-digit sequence.

```
ORD-2026-00001
DEL-2026-00001
INV-2026-00001
PAY-2026-00001
```

**Amendment, same day:** the year was originally the Bikram Sambat fiscal
year, resetting each Shrawan 1. When the owner chose AD-only dates (D020)
there was no BS year left to embed, so the owner chose the **AD calendar
year, resetting 1 January**, independently per document type.

The year comes from the **document's own date**, not from today, so
back-dating a document files it under the correct year.

Consequences:

- A `document_sequences` table keyed by `(doc_type, doc_year)` holds the
  last issued number. Incrementing it happens **inside the same
  transaction** that creates the document, so a rollback cannot burn a
  number and two documents cannot share one.
- Five digits is a hard limit of 99,999 documents of one type per year.
  Exceeding it throws rather than silently widening the format, because a
  wider number would sort differently from the existing ones.
- UNIQUE constraint on the document number column of every document table.

---

## D018 — Money rounding — CONFIRMED

Owner decision, 2026-08-23.

**Round half away from zero, to the nearest paisa, applied once per
line.** The document total is the sum of already-rounded line amounts and
is never re-rounded.

This is the only rounding rule in the system. Any other rounding is a bug.
It applies to line amount calculation and to NPR reporting conversion.
Tested with exact-half cases in both directions.

---

## D019 — Amber low-stock band — CONFIRMED

Owner decision, 2026-08-23.

A variant is **red** when on-hand is at or below `min_stock_qty`, and
**amber** when on-hand is above the minimum but within **25%** above it.

```
red   : on_hand <= min_stock_qty
amber : min_stock_qty < on_hand <= min_stock_qty * 1.25
```

The 25% figure is a single system-wide setting, not a per-variant column,
so it can be tuned in one place once the owner sees it in practice.
Comparison uses integer arithmetic to avoid a float creeping into a stock
calculation.

---

## D020 — AD is the only calendar — CONFIRMED

Owner decision, 2026-08-23: "you can keep the date as AD."

Dates are stored as `'YYYY-MM-DD'` text and timestamps as ISO-8601 UTC.
There is no Bikram Sambat conversion anywhere in the system — not stored,
not derived, not displayed. Screens and the printed bill show AD only,
formatted `23 Aug 2026` so the day and month can never be misread.

Consequences:

- `domain/bs-date.ts` and its calendar table were deleted, not disabled.
- D016 is superseded and D017's year is the AD calendar year.
- OPEN-2 is resolved: no reference dates are needed.
- Text rather than a numeric epoch, because text sorts correctly in SQL,
  reads correctly in a database browser, and cannot be silently
  reinterpreted in another timezone.

---

## Open decisions blocking Step 0

None. All four are resolved.

- ~~OPEN-1~~ resolved by D017.
- ~~OPEN-2~~ resolved by D020 — AD only, so no Bikram Sambat reference
  dates are needed.
- ~~OPEN-3~~ resolved by D018.
- ~~OPEN-4~~ resolved by D019.

Non-blocking, needed later: credit terms, customer returns, draft
order/delivery states, product and customer codes. See PLAN.md §9.

---

## OPEN-5 — Cancelling a part-delivered order — NEEDS AN OWNER DECISION

Raised by the code, 2026-08-23. Not blocking: the system currently
refuses the action with a clear message rather than guessing.

An order for 500 jackets has had 200 delivered and invoiced. The customer
then cancels the remaining 300. Three things could happen to the order:

1. The remaining 300 are dropped and the order is marked closed at 200.
   The invoice for 200 stands. Reservations for the 300 are released.
2. The whole order is cancelled and the 200 already delivered become a
   credit note or a return.
3. The order stays open indefinitely until the customer confirms.

Until the owner chooses, `cancelOrder` throws
`cannot_cancel_part_delivered_order` and says "deliver or close the
remainder instead". Option 1 looks most likely for this business, but
option 1 needs a "close short" action that does not exist yet, and
inventing it would be inventing a business rule.

Nothing is blocked: a part-delivered order can still be delivered in
full, and a draft or confirmed order cancels normally.
