# Garment Business Management System — MVP Plan

Status: **awaiting approval — no application code written yet**
Date: 2026-08-23

**Your confirmed decisions:** factory LAN web app · owner-only single login · no Excel/paper-bill reference files needed · stack chosen on technical merit · **hybrid build model** (tested backend core + React UI) · **SQLite** single file · printed bill shows **both Bikram Sambat and AD dates**.

---

## 0. Build-environment constraint (why the stack is split)

My sandbox **cannot install any package** — both `npmjs.org` and PyPI return `403 Forbidden` by policy. `dotnet`, `go`, and `rustc` are absent and uninstallable. This restricts what *I* can compile and test; it does not restrict what your factory deploys.

Your instruction was clear: don't degrade the product to suit my sandbox. So the build is split by risk:

| Layer | Dependencies | Who verifies |
|---|---|---|
| **Backend + all business logic** | zero — Node 22 built-ins only | **I write and run every test myself** before you see it |
| **Frontend** | React 19 + Vite + Tailwind (you `npm install`) | You run it; errors are immediately visible on screen |

The money, stock, invoice, and payment rules — where a silent bug costs real money — are fully tested by me. The UI, where a bug is obvious the moment you look at a screen, gets the modern toolchain.

What I verified working here before recommending it:

| Capability | Built-in | Result |
|---|---|---|
| TypeScript without a build step | native type stripping | `.ts` ran directly |
| Database | `node:sqlite` | WAL on, FK enforced, CHECK enforced |
| Transactions | `BEGIN IMMEDIATE` / `ROLLBACK` | rollback correctly discarded writes |
| Hot backup | `VACUUM INTO` | valid copy while DB open |
| Password hashing | `node:crypto` `scryptSync` | 64-byte key derived |
| Tests | `node:test` | ran `.ts` test files |
| HTTP server | `node:http` | served and fetched |

---

## 1. Recommended technology stack

### Backend — zero dependencies

- **Node 22 LTS**, pinned via `.nvmrc`
- **TypeScript**, run directly by Node's type stripping — no `tsc`, no bundler
- **SQLite** via `node:sqlite`, WAL mode, `foreign_keys=ON`, single file
- **Migrations:** numbered `.sql` files, applied by a small runner, tracked in `schema_migrations`
- **HTTP:** `node:http` + a small typed router serving a **JSON API**
- **Auth:** `scrypt` hash, session row in DB, httpOnly cookie
- **Tests:** `node:test` + `node:assert/strict`

### Frontend — you install these

```
react react-dom react-router-dom
@tanstack/react-query
typescript vite @vitejs/plugin-react
tailwindcss @tailwindcss/vite
vitest            # optional, for the few frontend tests
```

You need **Node 22 LTS installed on the machine you build on**. `npm install` pulls the rest. `npm run build` emits static files into `web/dist`, which the Node backend then serves — so **the factory PC runs only Node at runtime**, no npm, no Vite, no build tooling in production.

### Alternatives considered and rejected

| Option | Why rejected |
|---|---|
| PostgreSQL | One factory, one writer, low concurrency. SQLite is more reliable *here* because backup is copying one file. Migration path stays open. |
| Fastify | Its value is plugins, hooks, and schema compilation we don't need for ~40 JSON routes. A ~150-line typed router is testable by me today. |
| Prisma / Drizzle ORM | Not installable in my sandbox, and for an accounting system explicit SQL is an advantage — you can read exactly what runs. |
| .NET + Blazor | Technically excellent for money (`decimal` type), but absent here and uninstallable, so I could not compile a single line. Writing an ERP blind is the real quality risk. |
| Python + FastAPI | PyPI is blocked too; no web framework or ORM is preinstalled. |
| Electron desktop app | Cannot serve other machines on the LAN. |

### Honest limitations

1. **`node:sqlite` is experimental** — prints a warning, API could shift in a future Node major. *Mitigation:* pin Node 22 LTS; every SQLite call lives in one file (`db/sqlite.ts`), so swapping to `better-sqlite3` is a one-file change you could make with one `npm install`.
2. **Type stripping does not type-check.** Annotations help your editor; nothing fails a build. *Mitigation:* tests carry correctness. The frontend *does* get real type-checking via `tsc` from its `npm install`.
3. **Money in JavaScript** — floats are unusable for currency. Handled by storing and computing everything in **integer minor units** (see §3).

---

## 2. High-level architecture

```
web/            React 19 SPA — Vite, TanStack Query, Tailwind, print stylesheet
   ↕ JSON over HTTP (cookie session)
http/           typed router, hand-written validators, error → HTTP mapping
   ↓
services/       use-cases. Owns the DB transaction. One function = one business operation.
   ↓
domain/         pure TypeScript: money, FX, BS dates, availability, balances, state machines
   ↓
db/             schema, migrations, prepared statements, transaction helper
```

Structural rules that make the business rules hold by construction, not by discipline:

- **`domain/` is pure** — no DB, no IO. Every rule is unit-testable in milliseconds.
- **`services/` is the only layer that opens transactions.** Every multi-table write runs inside `BEGIN IMMEDIATE … COMMIT`, rolled back on any error.
- **One writer for stock.** A single function `recordStockMovement(tx, …)` is the only code that inserts into `stock_movements`. Nothing else may touch stock.
- **No cached stock column in MVP.** On-hand is `SUM(qty_delta)` over the ledger, read through one function `getStockOnHand()`. At ~2,400 variants that is fast for years, and because every caller goes through that one function, a cache table can be added later without touching callers.
- **Append-only where it matters, precisely defined.** `stock_movements`, `invoice_lines`, `payment_allocations`, `price_history`, and `audit_log` are **strictly insert-only** — never updated, never deleted. Corrections are new opposing records. Document *status* columns (`orders.status`, `invoices.status`, `payments.status`, `stock_allocations.status`) do change, because a cheque clearing or an invoice being voided is a legitimate state transition — every such transition is written to `audit_log` with the old and new value. Cancellations set `voided_at` + `void_reason` rather than removing rows. Products, variants, and customers are **deactivated, never deleted**, since they are referenced by history.
- **Dev:** Vite dev server proxies `/api` to Node. **Production:** Node serves `web/dist` plus `/api` from one process, one port.

---

## 3. Database / domain model

### Money

Every amount is stored as **`INTEGER` minor units** (paisa/cents). No float ever touches money.

Each financial document carries `..._minor INTEGER`, `currency TEXT`, and `fx_rate_to_npr INTEGER` (rate × 1,000,000, captured **at document time**). NPR reporting always uses the rate stored on the document, never today's rate.

**Every table is declared `STRICT`** (D014). Node 22 bundles SQLite 3.51.3, and I verified in this environment that a `STRICT` table rejects both a string and a float written into an `INTEGER` money column. "Never use floating point for money" therefore stops being a code convention and becomes a storage guarantee.

**One rounding rule** (D018): round half away from zero, to the nearest paisa, applied **once per line**. A document total is the sum of already-rounded line amounts and is never re-rounded. It applies to line-amount calculation and to NPR reporting conversion. Any other rounding anywhere in the system is a bug.

### Dates

`occurred_at` / `*_date` columns store **AD dates as ISO-8601 text** (canonical, sortable). **Bikram Sambat is derived** by a pure function in `domain/bs-date.ts` using a month-length lookup table, and rendered on screens and the printed bill alongside the AD date. No BS value is stored, so there is one source of truth and no possibility of the two drifting apart.

*This table must be validated against dates you trust — see assumption 3 and DECISIONS.md OPEN-2.*

### Tables

**Identity & catalogue**

- `users` — username, password_hash, password_salt, display_name, role, is_active. Seeded with one owner. Present from day one so `created_by` is meaningful and roles can be added later without a migration.
- `sessions` — user_id, expires_at
- `customers` — code, name, phone, address, default_currency, notes, is_active
- `products` — code, name, category, default_price_minor, default_currency, is_active
- `colours` — name
- `sizes` — name, **sort_order** ← drives S/M/L/XL/2XL column order in the matrix
- `product_variants` — product_id, colour_id, size_id, sku, price_minor (nullable override, D009), `min_stock_qty INTEGER NOT NULL DEFAULT 0` (D012), is_active, **UNIQUE(product_id, colour_id, size_id)**
- `price_history` — append-only: product_id, variant_id?, price_minor, currency, effective_from, created_by, note

The Colour × Size matrix is a **presentation-layer pivot** over `product_variants`. The database stores one row per variant and never a grid.

**Stock**

- `stock_movements` — **the source of truth.** variant_id, `qty_delta INTEGER NOT NULL CHECK(qty_delta <> 0)`, movement_type, ref_type, ref_id, occurred_at, created_at, created_by, reason. Append-only.
  `movement_type ∈ {opening_balance, production_receipt, delivery_out, return_in, adjustment_in, adjustment_out}`
- `stock_adjustments` — adjusted_at, reason_code, `note NOT NULL`, created_by
- `stock_adjustment_lines` — adjustment_id, variant_id, qty_delta, movement_id
- `stock_allocations` — order_line_id, variant_id, `qty CHECK(qty > 0)`, status ∈ {active, released, consumed}, created_by, released_at

Low stock is reported from `min_stock_qty` in two bands (D019): **red** when `on_hand <= min_stock_qty`, **amber** when `min_stock_qty < on_hand <= min_stock_qty * 1.25`. The 25% figure is one system-wide setting, not a per-variant column, and the comparison uses integer arithmetic so no float enters a stock calculation.

**Allocation is a reservation, not a stock change.** Confirming an order writes `stock_allocations` and **no** stock movement — the garments are still physically in the factory. Only delivery moves stock. This is the most important modelling decision in the system.

**Sales cycle**

- `orders` — order_no, customer_id, order_date, required_date, currency, fx_rate_to_npr, status ∈ {draft, confirmed, partially_delivered, delivered, closed, cancelled}, notes
- `order_lines` — order_id, variant_id, `qty_ordered CHECK(> 0)`, **`unit_price_minor` snapshotted at order time**, note
- `deliveries` — delivery_no, order_id, customer_id, delivered_at, status ∈ {draft, dispatched, cancelled}
- `delivery_lines` — delivery_id, order_line_id, variant_id, `qty CHECK(> 0)`, movement_id
- `invoices` — invoice_no, customer_id, order_id?, invoice_date, currency, fx_rate_to_npr, subtotal_minor, discount_minor, total_minor, status ∈ {draft, issued, void}, voided_at, void_reason
- `invoice_lines` — invoice_id, **`delivery_line_id UNIQUE`**, variant_id, `description_snapshot`, qty, `unit_price_minor`, line_total_minor

That `UNIQUE` on `delivery_line_id` makes double-invoicing the same delivered goods **impossible at the database level**, not merely discouraged by code.

**Money in**

- `payments` — payment_no, customer_id, received_at, method ∈ {cash, bank_transfer, cheque}, amount_minor, currency, fx_rate_to_npr, **status ∈ {pending, cleared, bounced, cancelled}**, cheque_no, cheque_date, cleared_at, bounce_reason, note
- `payment_allocations` — payment_id, invoice_id, `amount_minor CHECK(> 0)`, UNIQUE(payment_id, invoice_id)

Cash and bank transfers are created `cleared`. Cheques are created `pending` and become `cleared` only by an explicit clearing action.

**Other ledgers**

- `expenses` — expense_no, expense_date, category, payee, amount_minor, currency, fx_rate_to_npr, method, note
- `purchases` — purchase_no, supplier_name, purchase_date, description, amount_minor, currency, fx_rate_to_npr, note. **No stock effect** — raw-material inventory is out of scope.
- `audit_log` — at, user_id, action, entity_type, entity_id, detail_json
- `document_sequences` — doc_type, bs_fiscal_year, last_number, **UNIQUE(doc_type, bs_fiscal_year)** (D017)

**Document numbering** (D017): `ORD-2082-00001`, `DEL-`, `INV-`, `PAY-`, five digits, resetting to `00001` each **Shrawan 1** independently per document type. The sequence is incremented **inside the same transaction** that creates the document, so a rollback cannot burn a number and two documents cannot share one. `order_no`, `delivery_no`, `invoice_no`, `payment_no`, `expense_no`, and `purchase_no` each carry a `UNIQUE` constraint. Because the number embeds the BS fiscal year, numbering depends on the BS conversion table being correct — see OPEN-2.

**Deferred to slice 2** (named so the schema has room; not designed yet): `production_orders`, `production_stage_events`, `cut_records`, `sew_records`, `finish_records`, `pack_records`, `rework_records`.

---

## 4. Core business rules as enforceable invariants

Each becomes a named test. Bracketed numbers cite your 20 critical business rules; a `P` prefix cites the project-instruction rules (P21 movement ledger, P22 auditable adjustments).

**Stock**

1. Stock identity is Product + Colour + Size — one `product_variants` row. [1]
2. On-hand is only ever `SUM(stock_movements.qty_delta)`. No column stores a quantity. [P21]
3. Cutting and sewing write **no** stock movement. [2, 3]
4. Finished stock rises only on packing acceptance, opening balance, or an authorised adjustment. [4]
5. `available = on_hand − SUM(active allocations)`. Ordered-but-unallocated qty is never available.
6. On-hand may never go negative — the service rejects the transaction.
7. Every movement records variant, qty, type, reference, timestamp, user, and reason where applicable. [17]
8. An adjustment requires a non-empty note and writes both the adjustment record and its movement in one transaction. [17, P22]

**Orders, delivery, invoicing**

9. Confirming an order allocates available stock and reports shortage per variant. It is not a sale. [6]
10. Orders may be delivered in parts; one order may have many deliveries. [7, 8]
11. Delivery consumes allocation and emits `delivery_out` movements in one transaction. [8]
12. Delivered qty per order line may never exceed ordered qty.
13. Invoices are built only from delivery lines. Undelivered qty cannot be invoiced. [9]
14. A delivery line may appear on at most one non-void invoice — DB-enforced. [10]
15. One order may have many invoices. [10]
16. `order_lines.unit_price_minor` and `invoice_lines.unit_price_minor` are snapshots. Changing a product price never alters an existing order or issued invoice. [14, 15, 16]
17. An issued invoice is never updated. Mistakes are voided with a reason and reissued.

**Money**

18. Customer outstanding (NPR) = Σ issued non-void invoice totals − Σ **cleared** payment allocations. [12]
19. Pending cheques are a **separate reported figure** and never reduce outstanding balance until cleared. [13]
20. Payments may be partial; allocations across invoices may not exceed the payment amount, and allocations to one invoice may not exceed its total. [11]
21. A bounced cheque returns the balance to outstanding and is retained in history, never deleted.
22. All amounts are integer minor units with an explicit currency and a document-time FX rate.
23. No tax calculation anywhere in the MVP.

**Process**

24. Rework moves garments finishing → sewing with no finished-stock effect. [18, slice 2]
25. One location: the factory. No warehouse dimension on any table. [19]
26. The owner is the only actor; `created_by` recorded on every mutation. [20]
27. Production may originate from an order shortage **or** stock replenishment — `production_orders.origin` distinguishes them. [5, slice 2]

---

## 5. First vertical slice — implementation plan

Scope: **Customer → Product/Variant → Order → Stock Check → Allocation → Delivery → Invoice → Payment.** No production.

Every step follows the same order: migration → pure domain function + unit test → service in a transaction + integration test → JSON route → React screen → run that step's tests.

| # | Step | Ships |
|---|---|---|
| 0 | Skeleton: migration runner, `db/sqlite.ts`, transaction helper, test harness, owner login, Vite + Tailwind shell | app boots, owner logs in |
| 1 | `domain/money.ts` + `domain/fx.ts` | integer-minor arithmetic, formatting, NPR conversion — tested before anything uses it |
| 2 | `domain/bs-date.ts` | BS ↔ AD conversion, unit-tested against reference dates |
| 3 | Customers | list, create, edit, deactivate |
| 4 | Products, colours, sizes, variants | product form + bulk variant generation from selected colours × sizes |
| 5 | Stock ledger | opening balances, adjustments with mandatory reason, **Colour × Size matrix inventory screen**, per-variant movement history |
| 6 | Orders | draft/confirm, price snapshot with per-line override, live availability + shortage panel |
| 7 | Allocation | allocate on confirm, release on cancel, `available` respected everywhere |
| 8 | Deliveries | partial delivery against an order, consumes allocation, emits movements |
| 9 | Invoices | build from selected delivery lines, immutable once issued, **printable bill with BS + AD dates** |
| 10 | Payments | cash/bank/cheque, allocate to invoices, clear or bounce a cheque, customer statement + receivables |
| 11 | Dashboard + basic reports | low stock, outstanding receivables, pending cheques, deliveries due |

Steps 5, 8, 9, and 10 are where the money is. I will not move past any of them until its tests pass.

Expenses and purchases are simple independent ledgers, added after step 11. **Production is slice 2**, planned separately once this core is proven.

---

## 6. Proposed directory structure

```
Garment Factory/
├─ PLAN.md
├─ .nvmrc                        # 22
├─ package.json                  # backend scripts only, "dependencies": {}
├─ data/
│  ├─ garment.db                 # gitignored
│  └─ backups/
├─ docs/
│  ├─ ARCHITECTURE.md
│  └─ RUNBOOK.md                 # start, stop, backup, restore drill
├─ src/                          # backend — zero dependencies
│  ├─ main.ts                    # migrate, then listen
│  ├─ db/
│  │  ├─ sqlite.ts               # the ONLY file importing node:sqlite
│  │  ├─ migrate.ts
│  │  └─ migrations/001_init.sql …
│  ├─ domain/                    # pure, no IO
│  │  ├─ money.ts  fx.ts  bs-date.ts  stock.ts
│  │  ├─ order.ts  invoice.ts  payment.ts
│  ├─ services/                  # transactions live here
│  │  ├─ stock.ts  allocation.ts  orders.ts  deliveries.ts
│  │  ├─ invoices.ts  payments.ts  customers.ts  products.ts
│  └─ http/
│     ├─ server.ts  router.ts  validate.ts  auth.ts  errors.ts
│     └─ routes/…
├─ web/                          # React SPA — the only node_modules
│  ├─ package.json  vite.config.ts  tsconfig.json
│  ├─ index.html
│  └─ src/
│     ├─ main.tsx  api.ts        # typed fetch client
│     ├─ pages/…
│     ├─ components/InventoryMatrix.tsx …
│     └─ styles/{app.css, print.css}
├─ tests/
│  ├─ unit/  integration/  helpers/testDb.ts
└─ scripts/
   ├─ seed.ts  backup.ts  verify-ledger.ts
```

Backend and frontend types are kept in step by a hand-written `web/src/api.ts` mirroring the route contracts — no code generation, no shared build.

---

## 7. Testing strategy

Backend: `node --test`, run by me on every change. No mocks for the database — the rules under test *are* transactional.

- **Unit (`domain/`)** — money and FX arithmetic, BS date conversion, availability, order/invoice state machines, balance and allocation math. Fast, no DB.
- **Integration (`services/`)** — fresh temp SQLite file per test, real migrations, real transactions.
- **The tests that must exist before I call any step done:**
  - partial delivery leaves the order `partially_delivered` with correct remaining qty
  - a delivery line cannot be invoiced twice
  - changing a product price leaves existing orders and issued invoices untouched
  - a pending cheque does not reduce outstanding balance; clearing it does
  - a bounced cheque restores the balance and keeps history
  - stock cannot be driven negative
  - a failed mid-operation write rolls back completely — no orphan stock movement
  - allocation excludes already-allocated stock from availability
  - BS ↔ AD conversion matches every reference date
- **Ledger reconciliation** — `scripts/verify-ledger.ts` recomputes on-hand for every variant from `stock_movements` and asserts it matches every query path. Runs as a test and can be run against live data.
- **Frontend** — business logic lives in the backend, so the UI needs little testing. Vitest is available if you want it; I cannot run it, so I will not pretend to have verified it.
- **Seed data** — ~8 products, realistic jacket colours, S–2XL, opening stock, two customers, and one worked example spanning order → partial delivery → invoice → part payment by cheque.

---

## 8. Security and data safety

- **Auth** — scrypt with a high cost parameter + per-user random salt; session row in DB; httpOnly, SameSite=Strict cookie; passwords never logged.
- **LAN exposure, stated plainly** — binding to the LAN means traffic is unencrypted HTTP and anyone on that network can reach the login page. Acceptable only on a trusted factory network. If guest Wi-Fi shares that network, we should add a self-signed TLS certificate. **Your call — flagged, not assumed.**
- **SQL injection** — bound parameters only; no string-built SQL.
- **Validation** — hand-written typed validators at the HTTP boundary; services independently validate business preconditions. Never trust the client.
- **No destructive endpoints** — no DELETE route exists for stock, orders, deliveries, invoices, or payments. Void-with-reason only.
- **Atomicity** — every operation touching more than one table runs in `BEGIN IMMEDIATE … COMMIT`.
- **Backups** — `scripts/backup.ts` runs `VACUUM INTO data/backups/garment-YYYY-MM-DD-HHmm.db`, safe while the app is running. Retain 30 daily + 12 monthly, scheduled via Windows Task Scheduler. **A backup is not a backup until a restore has been rehearsed**, so `RUNBOOK.md` will contain a restore drill.
- **Off-machine copy** — the single largest risk to this business is the factory PC dying. Backups must also land off that machine. See assumption 9.
- **Audit trail** — `created_at` (UTC ISO-8601) and `created_by` on every row; `audit_log` for adjustments, voids, and cheque status changes.

---

## 9. Assumptions requiring your confirmation

I have deliberately not decided these.

**Resolved 2026-08-23** — items 5, 7, 14, and 18 are now answered and recorded in `DECISIONS.md` as D009, D010, D011, and D012; items 4 and 15 as D017 and D018, and item 18's amber band as D019. They are left in place below, marked, so the reasoning trail stays intact.

1. **`node:sqlite` experimental status** — acceptable, given Node 22 is pinned and all SQLite use is isolated to one swappable file?
2. **Frontend build step** — you (or whoever builds) run `npm install` and `npm run build` once per release; the factory PC then runs only Node. Acceptable?
3. **BS conversion accuracy** — I will hand-write the BS month-length table and unit-test it. To validate it I need a few reference pairs you trust. **Please confirm what today, 2026-08-23 AD, is in BS**, plus one or two dates from your existing bills.
4. ~~Document numbering~~ — **RESOLVED, D017:** `ORD-2082-00001` / `DEL-` / `INV-` / `PAY-`, five digits, resetting each Shrawan 1 per document type, issued from `document_sequences` inside the document's transaction.
5. ~~Pricing granularity~~ — **RESOLVED, D009:** product default price plus optional per-variant override. Resolution order: variant override → product default → error.
6. **Discounts** — invoice-level discount amount only, or per-line discounts too?
7. ~~Invoice ↔ delivery~~ — **RESOLVED, D010:** one invoice may combine lines from several deliveries to the same customer.
8. **Opening stock load** — how should ~50 products' current stock be entered: a Colour × Size matrix screen, or a CSV import?
9. **Backup destination** off the factory PC — USB drive, network share, or nothing for now?
10. **Corrections** — void-and-reissue for bad invoices, with credit notes left out of the MVP. Acceptable?
11. **Units** — everything counted in pieces?
12. **Bill layout** — since you're not sharing the paper bill, I'll design a clean A5/A4 bill with your company header, customer, item lines (product/colour/size/qty/rate/amount), totals, and both BS and AD dates. You can mark it up once you see it printed.

The following came out of a review pass over this plan, where I caught myself about to decide business questions on your behalf:

13. **"Credit" as a payment mode** — you listed credit among payment methods. In this model credit is simply an issued invoice with nothing allocated against it; no `payments` row exists. Correct, or do you want explicit credit terms (due in N days) per customer?
14. ~~Foreign-currency orders~~ — **RESOLVED, D011:** the negotiated price is entered directly in the order currency. No NPR → INR derivation. FX rate is captured for reporting only and never produces the sale price.
15. ~~Rounding rule~~ — **RESOLVED, D018:** round half away from zero to the nearest paisa, applied once per line; totals are sums of rounded lines and are never re-rounded.
16. **Customer returns** — the ledger includes a `return_in` movement type but I have not designed a returns workflow. Do customers return delivered garments? If so, does a return also reduce what they owe, or only put stock back?
17. **Cancelling an order after partial delivery** — I propose: release remaining allocations, leave delivered and invoiced history untouched, mark the order `cancelled` with the undelivered balance abandoned. Confirm.
18. ~~Low-stock alerting~~ — **RESOLVED, D012 + D019:** threshold per variant via `product_variants.min_stock_qty`; red at or below the minimum, amber within 25% above it.
19. **Draft states** — do you want to prepare a delivery before dispatching it, or is a delivery always recorded after the goods have left? Same question for orders: is a draft stage useful, or is every order confirmed as soon as it's entered?
20. **Codes** — do you already use product and customer codes, or should the system generate them?

---

## Not being built (per your scope discipline)

Raw-material inventory, fabric consumption, BOM, material requirements planning, worker attendance, productivity, payroll, worker management, multiple warehouses, advanced QC, tax engine, advanced accounting, and any mobile application. The schema leaves room; no code, tables, or UI will hint at them.

**Production (cutting, sewing, finishing, packing, rework) is slice 2**, planned separately once the order/inventory core is proven — as you instructed.

---

*Stopping here for approval. No application code will be written until you confirm the stack and answer §9. Items **3, 4, 5, 7, 14, 15, and 18** change the database schema, so they block step 0; the rest can be answered as we reach the relevant slice.*
