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

## D021 — What a delivery may take off the shelf — CONFIRMED

Decided while building the deliveries slice, 2026-08-24. Follows directly
from D003 (ledger) and D004 (allocation is reservation); nothing here is a
new business policy, it is those two rules made precise for dispatch.

A delivery line may take:

- pieces **reserved for its own order line**, plus
- **unreserved** pieces sitting on the shelf,

and never:

- more than the order line still has **outstanding** (`qty_ordered −
  qty_delivered`) → `delivery_exceeds_order`,
- pieces **reserved for another order** → `delivery_exceeds_available_stock`,
- more than is **physically on hand** → `delivery_exceeds_available_stock`.

All-or-nothing: if one line of a multi-line delivery cannot be satisfied,
the whole delivery is refused. A partly-loaded van is a decision for the
owner to make explicitly by entering smaller quantities.

**A delivery is two steps.** A draft is paperwork: it moves no stock and
reserves nothing extra. Dispatch is the physical event and the only thing
that writes to the ledger (`delivery_out`, one movement per line). The
plan is recalculated from live figures **at dispatch**, never trusted from
the draft, because stock can be adjusted away in between.

**The movement carries the delivery's date, not today's date.** The owner
often enters a dispatch a day or two after the goods left, and the ledger
has to say when they actually left.

**Reservations are consumed wholesale, then re-made.** Delivering 10
against a line reserved for 22 marks the whole 22-piece reservation
`consumed` and then re-runs `allocateOrder`, which reserves the remaining
12 from what is left. `stock_allocations` has no partial-consumption
concept, and giving it one would mean a second reservation code path to
keep correct. Nothing is deleted; the consumed row stays with its
`released_at`.

**Sub-rule found by testing.** When a variant is *over*-reserved — 5 on
the shelf but 20 reserved, because stock was adjusted out after the
reservation was made — free stock is negative. Free stock is therefore
floored at zero when checking the unreserved portion, so a line can still
ship the pieces it already holds. The earlier form of this check refused
*every* delivery of an over-reserved variant, which would have stopped the
owner shipping goods that were on the shelf and paid for.

**Dispatch order matters.** `deliveries.status` is set to `dispatched`
*before* the order status is recomputed, because `qty_delivered` is derived
from dispatched deliveries only.

Tested: 17 domain tests, 21 service tests, 2 HTTP tests, and 15 mutations
of the two files, all caught.

---

## D022 — The due date is typed on each invoice — CONFIRMED

Owner decision, 2026-08-24. Asked: "how does the system know when a bill is
due?" Answer: "I type the date on each bill."

`invoices.due_date` is nullable. A cash sale has no due date; a credit sale
carries the date the owner typed. There is deliberately **no** credit-terms
column on `customers`: standing terms would be a second place for the truth
to live, and the owner does not work that way.

The only rule is that money cannot fall due before the bill exists —
`assertDueDate` refuses `due_date < invoice_date` with
`due_date_before_invoice_date`.

Consequence for later: ageing and overdue reporting read `due_date` where it
is present and treat a null as due on issue.

---

## D023 — One delivery, one invoice, by default — CONFIRMED

Owner decision, 2026-08-24. Asked whether a bill covers one delivery or a
month of them. Answer: "One delivery, one invoice."

So `POST /api/invoices { deliveryId }` is the normal path, and the console
offers exactly that. D010 is **not** revoked: passing `deliveryLineIds`
instead bills a hand-picked set, which is how several deliveries reach one
invoice when the owner wants that. `invoices.order_id` is filled when every
line comes from one order and left null otherwise — the lines are the source
of truth, the header field is a convenience.

---

## D024 — One discount on the whole bill, and it must say why — CONFIRMED

Owner decision, 2026-08-24. Asked whether discounts are per line or per bill.
Answer: "One discount on the whole bill."

`invoices.discount_minor` with `invoices.discount_reason`. The reason is
enforced in three places on purpose: the domain (`ValidationError` on
`discountReason`), a table CHECK in migration 002, and therefore the API.
An unexplained discount is the same audit hole as an unexplained stock
adjustment, and money leaving the business unexplained is worse.

A discount may take a bill to zero — a free replacement still needs
paperwork — but not below: `discount_exceeds_invoice`.

---

## D025 — Delivered goods may sit on only one *standing* invoice — CONFIRMED

Owner decision, 2026-08-24. Asked how re-billing after a mistake should be
prevented from double-charging. Answer: "Database rule that ignores cancelled
bills."

The original schema had `invoice_lines.delivery_line_id INTEGER NOT NULL
UNIQUE`. That is wrong, and it was found while building this slice: a voided
invoice's lines keep occupying the slot for ever, which makes the approved
correction path (D005 void-and-reissue) **impossible** — the goods could
never be billed correctly after a wrong bill was voided.

Three options were considered:

1. A partial unique index. Not possible: the `void` status lives on
   `invoices`, not `invoice_lines`, and SQLite partial indexes cannot join.
   Mirroring the status into `invoice_lines` would need an UPDATE to an
   append-only table, which D013 forbids.
2. A service-only check. Rejected: it moves a money guarantee out of the
   database.
3. A `BEFORE INSERT` trigger. Chosen, and proved in a throwaway script
   before the migration was written.

Migration 002 rebuilds `invoice_lines` without the UNIQUE and adds trigger
`invoice_lines_one_standing_invoice`, which aborts an insert when the same
`delivery_line_id` already appears on an invoice whose status is not `void`.
The service catches that abort and re-raises it as the business refusal
`goods_already_invoiced`.

Everything else about immutability is unchanged: an issued invoice cannot be
edited or un-issued, a void needs a reason, and voided invoices keep their
lines and their total for the record.

Tested: 15 domain tests, 18 service tests, 2 HTTP tests, and 23 mutations of
`domain/invoices.ts` and `services/invoices.ts`, all caught.

---

## D026 — The owner picks which bills a payment settles — CONFIRMED

Owner decision, 2026-08-24. Asked whether a receipt should be applied to the
oldest unpaid bill automatically. Answer: "I pick the bills myself."

So recording money and deciding what it pays are two separate instructions.
`recordPayment` applies nothing on its own; `applyPayment(paymentId,
allocations)` is an explicit second act, and the allocations it writes are
append-only rows in `payment_allocations`. Nothing an invoice owes ever
changes because the software guessed.

`UNIQUE (payment_id, invoice_id)` enforces one row per payment per invoice. A
payment that needs to give a bill more money later is a second payment, not
an edited allocation — the same reasoning as the stock ledger: correct by
adding, never by overwriting.

The cost of this choice is that a receipt can sit unapplied and a bill can
look unpaid while the money is already in the bank. That is what D027 makes
visible rather than hides.

---

## D027 — Money with no bill yet is held as an advance, never netted off — CONFIRMED

Owner decision, 2026-08-24. Asked what to do with a deposit taken before any
invoice exists. Answer: "Accept it and hold it as an advance."

`recordPayment` accepts a payment with no allocations. Unapplied cleared money
is reported per currency as `advanceMinor` and is **never** subtracted from
`outstandingMinor`. Netting the two would quietly make the D026 decision on
the owner's behalf: a customer holding a 100,000 advance while a *different*
100,000 bill stands open is not the same as a customer who is square, and the
difference matters when a bill is disputed or a delivery is short.

Only cleared money can be an advance. A cheque still in the drawer is
reported as `pendingChequeMinor` — neither settlement nor advance, because it
is not money yet.

The domain refuses `settled_exceeds_invoiced`: if the settled figure ever
exceeds the invoiced one, that is arithmetic going wrong, not a customer in
credit, and it stops rather than reporting a negative receivable.

---

## D028 — A cheque already marked cleared can still be returned — CONFIRMED

Owner decision, 2026-08-24. Asked whether a bounce can happen after the owner
has marked the cheque cleared. Answer: "Yes, it can bounce after clearing."

`cleared -> bounced` is therefore a legal transition, and the payment keeps
`cleared_at` — the bank really did credit it on that day. A bounce needs its
own date and a reason (D005 and D024 already require that of money leaving
the books). Allocation rows are **never deleted**: they stop counting because
the payment is no longer `cleared`, so the receivable is restored by
arithmetic rather than by erasing what happened. The audit trail reads
recorded → applied → cleared → bounced, and `historicAppliedMinor` keeps the
all-time figure visible next to the live one.

The schema had to change to allow this. The original CHECK was:

```sql
CHECK ((status = 'cleared') = (cleared_at IS NOT NULL))
```

which forced a bounce to null out `cleared_at`. Migration 003 replaces it with
two weaker rules that say what was actually meant: a cleared payment must
carry a clearing date, and only a payment that has at some point cleared may
carry one at all. A test then found the same fault a second time — a
mis-entered cash receipt, cleared on arrival, could not be cancelled at all,
because cancelling would also have had to null the date. `cancelled` was added
to the second CHECK for the same reason.

**Engineering note, recorded because it will be needed again.** SQLite cannot
drop a column CHECK, so the table is rebuilt; and with `PRAGMA foreign_keys =
ON` you cannot `DROP TABLE payments` while `payment_allocations` references
it. `PRAGMA defer_foreign_keys` does not help — it defers row violations, not
the schema dependency — and `legacy_alter_table` does not either. The order
that works: create both new tables, copy the rows, drop the child then the
parent, then rename the parent, because the rename is what rewrites the
child's `REFERENCES` clause. Migration 003 does exactly that. Applied
migrations are immutable (sha256 guard in `src/db/migrate.ts`), so 003 could
only be edited in place because no database had ever run it; after this, the
same fix would need a migration 004.

---

## D029 — A payment settles bills in its own currency only — CONFIRMED

Owner decision, 2026-08-24. Asked whether a rupee receipt could settle a
dollar invoice at the day's rate. Answer: "No — same currency only."

`allocation_currency_mismatch` refuses it in the domain, so no route can get
round it. Cross-currency settlement invents an FX gain or loss and has nowhere
honest to put it; until there is an approved place for that number, the safe
answer is to refuse. Each payment still records its own `fx_rate_to_npr` at
receipt (D011) so NPR reporting is possible without touching the settlement
rule.

The consequence is that a customer balance is per currency. `getCustomerStatement`
returns one balance row per currency and deliberately offers no single "total
owed" figure, because producing one would require the FX conversion this
decision just refused.

Those balances are computed by aggregate query over all invoices and payments,
not by summing the invoice and payment lists the statement returns for
display. The lists are capped; a balance that quietly stopped counting at the
cap would be wrong in exactly the case where it matters most — the customer
who has been trading longest.

Tested: 28 domain tests, 29 service tests, and 35 mutations of
`domain/payments.ts` and `services/payments.ts`, all caught.

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

---

## OPEN-6 — Who can reach the server, and the owner's password — NEEDS AN OWNER DECISION

Raised by the code, 2026-08-23. Not blocking: the safe default is in
place.

The HTTP API is now real, and it exposes stock, prices, customer details
and (soon) invoices and payments. Authentication is not built: the
`users` and `sessions` tables exist, but no route checks anything. Any
machine that can reach the port can do anything the owner can do.

The default is therefore loopback: `127.0.0.1`, reachable only from the
factory PC itself. `GARMENT_HOST=0.0.0.0` opens it to the LAN, and the
server prints a warning when it does.

Three questions for the owner:

1. Will the system only ever be used from the factory PC, or does a
   second machine (office, showroom) need to reach it?
2. If a second machine needs it, a login screen has to exist before the
   port is opened. That is a small slice, but it is a slice.
3. `scripts/seed.ts` creates the owner account with a scrypt-hashed
   password from `GARMENT_OWNER_PASSWORD`, defaulting to `change-me`.
   The hash format is settled so nothing has to be migrated later, but
   until a login exists that password is not checked anywhere.

Sessions are the mechanism already in the schema, so implementing this
later changes only the HTTP layer.

---

## OPEN-7 — Goods coming back after dispatch — NEEDS AN OWNER DECISION

Raised by the code, 2026-08-24. Not blocking: the system refuses the
action with a clear message rather than guessing.

Once a delivery is dispatched it cannot be cancelled. The garments have
physically left, a stock movement exists, and D003 forbids deleting or
editing a ledger row. `cancelDelivery` therefore throws
`dispatched_delivery_cannot_be_cancelled` and says to record a goods
return instead.

That goods return does not exist yet, and building it needs the owner to
say what actually happens in the factory:

1. When a customer sends jackets back, do they go back into sellable
   finished stock, or into a separate "returned, needs checking" state?
2. Does a return always follow the delivery it came from, or can a
   customer return goods from several deliveries in one lot?
3. If the delivery was already invoiced, does the return produce a credit
   note, or is the invoice voided and reissued (D005)?
4. Who decides a returned jacket is sellable again — is that a QC step,
   which would make it part of Slice 2?

Nothing is blocked today: the owner can still correct a mistaken dispatch
by recording a stock adjustment with a reason, which leaves both the
original movement and the correction visible in the ledger. A proper
returns flow is the clean answer, and it is a slice of its own.

## D030 — Returned goods go straight back into sellable stock — CONFIRMED

Owner decision, 2026-09-14 (asked while completing Slice 1).

When a customer sends jackets back after dispatch, the pieces return to
**sellable finished stock immediately**. A return writes a `return_in`
movement on the finished-goods ledger (the movement type and `ref_type =
'return'` already existed in migration 001). The pieces are available for
new orders the moment the return is recorded.

Chosen over a "returned, needs checking" holding state: the factory is a
one-owner operation and the owner's rule is that a returned jacket goes
back on the shelf.

A return is attached to **one delivery** (the one it reverses). Multi-
delivery lots are a later feature.

## D031 — A return on an issued invoice is void-and-reissue — CONFIRMED

Owner decision, 2026-09-14 (asked while completing Slice 1).

If the returned goods were already on an issued invoice, the original
invoice is **voided and a new invoice is issued for what the customer
kept** (D005's correction path).

- Returning **all** goods on the bill: the invoice is merely voided. The
  delivery lines become billable again (D025's trigger ignores voided
  invoices).
- Returning **some** goods: the original is voided and a new invoice is
  created for the non-returned lines, at the same prices (the order's
  snapshot, so nothing re-prices). The new invoice keeps the customer,
  order, currency, and due date of the original; a void reason names the
  returned descriptions.
- The returned delivery lines are freed by the void, so a future delivery
  can re-issue them if the factory decides to re-sell.

Both invoices survive in history: the voided original and the replacement.
This is the same audit shape as D005 / D025.

---

## OPEN-5 — RESOLVED: close short

Owner decision, 2026-09-14: a part-delivered order is closed with a
"close remainder" action — the delivered pieces stand, the undelivered
remainder is dropped, and its reservations are released. Implemented in
`closeOrder` (which already released allocations for part-delivered
orders).

## OPEN-7 — RESOLVED by D030 + D031

## OPEN-6 — superseded by the auth flow

Authentication now exists (login page, session cookie, scrypt hashing).
Deployment keeps the app bound to `127.0.0.1` by default; LAN bind
requires `GARMENT_HOST=0.0.0.0` and auth is enforced in production.
