# Garment Factory Management System - Project Summary

**Status:** COMPLETE AND PRODUCTION-READY  
**Date:** 2026-09-11  
**All Tests:** ✅ 300/300 passing

---

## What Was Built

A complete garment factory management system for jacket manufacturing, covering the full sales and inventory workflow from customer orders through delivery, invoicing, and payment collection.

### Core Capabilities

**Sales & Orders:**
- Customer management with search and deactivation controls
- Product catalogue with variants (Product × Colour × Size)
- Flexible pricing (product default + optional variant override)
- Order lifecycle: draft → confirm (reserve stock) → deliver → close
- Multi-currency support (NPR, INR, USD) with FX rate capture
- Shortage tracking and production demand signaling

**Inventory:**
- Append-only stock movement ledger (no cached quantities)
- Stock allocations (reservations) separate from physical movements
- Opening balances, adjustments, and full audit trail
- Low-stock alerts with configurable red/amber/green bands
- Cutting stock tracking (separate from finished goods)

**Deliveries:**
- Draft deliveries (packing lists) before dispatch
- Dispatch consumes allocations and creates outward movements
- Partial deliveries with automatic re-reservation
- Stock guards prevent over-shipment and negative inventory

**Invoicing:**
- Bill dispatched goods with price frozen at order time
- Multi-delivery invoices (one customer, one currency)
- Discounts with mandatory reasons
- Immutable issued invoices (void-and-reissue for corrections)
- Due date tracking

**Payments:**
- Cash, bank transfer, and cheque support
- Cheque lifecycle: pending → cleared/bounced
- Payment allocation across multiple invoices
- Customer advances (money before bills)
- Currency-separated statement and balance tracking
- Post-dated cheque filtering

**Reporting:**
- Live dashboard with KPIs (orders, shortages, inventory bands)
- Customer statements and receivables
- Expense and purchase tracking
- Full audit log for all financial transitions

**Additional Features:**
- Employee management with monthly/yearly earnings tracking
- Document numbering: gapless sequential numbers per year per type (ORD, DEL, INV, PAY, EXP, PUR, CUT, MAT)
- Authentication with session management
- Full HTTP JSON API

---

## Architecture

### Technology Stack

**Backend (Zero Dependencies):**
- Node.js 22 LTS with native TypeScript support
- SQLite 3 with WAL mode, foreign keys enforced
- `node:sqlite`, `node:http`, `node:crypto`, `node:test`
- Explicit SQL, no ORM
- 8 database migrations

**Frontend:**
- React 19
- Vite build system
- Tailwind CSS
- TanStack Query for data fetching
- React Router

### Design Principles

**Correctness by Construction:**
- Domain layer is pure TypeScript (no I/O, fully unit testable)
- Services own all transactions (BEGIN IMMEDIATE ... COMMIT)
- Single writer for stock movements (one function, no scattered writes)
- Append-only ledgers for stock, invoices, payments, price history
- Integer minor units for all money (no floating point)
- Immutable financial documents (void-and-reissue, never edit)

**Testability:**
- 300 integration and unit tests
- Every business rule has a test
- Domain logic tested without database
- Service transactions verified for rollback behavior
- HTTP layer tested end-to-end

**Auditability:**
- Every financial state transition logged with user and timestamp
- Stock movements traceable to source document
- Price history preserved forever
- Voided documents retained with void reason

---

## Project Structure

```
src/
├── config.ts              # Environment configuration
├── main.ts                # Application entry point
├── domain/                # Pure business logic (no I/O)
│   ├── money.ts           # Integer minor units, currency validation
│   ├── fx.ts              # Foreign exchange calculations
│   ├── pricing.ts         # Product/variant price resolution
│   ├── stock.ts           # Availability, band calculation
│   ├── orders.ts          # Order status machine, allocation planning
│   ├── deliveries.ts      # Delivery planning and guards
│   ├── invoices.ts        # Invoice calculation, status transitions
│   ├── payments.ts        # Payment lifecycle, allocation rules
│   ├── documentNumber.ts  # Sequential numbering format
│   ├── dates.ts           # Date parsing and arithmetic
│   └── errors.ts          # Domain error types
├── services/              # Use cases (own transactions)
│   ├── catalogue.ts       # Products, colours, sizes, variants, prices
│   ├── customers.ts       # Customer CRUD and search
│   ├── stock.ts           # Stock movements, adjustments, summaries
│   ├── orders.ts          # Order lifecycle operations
│   ├── deliveries.ts      # Delivery creation and dispatch
│   ├── invoices.ts        # Invoice creation, issuing, void-and-reissue
│   ├── payments.ts        # Payment recording and allocation
│   ├── expenses.ts        # Expense tracking
│   ├── purchases.ts       # Raw material purchase tracking
│   ├── dashboard.ts       # KPI aggregation
│   ├── cuttingStock.ts    # Cutting stock movements
│   ├── employees.ts       # Employee management
│   ├── employeeEarnings.ts # Earnings tracking
│   ├── audit.ts           # Audit log
│   ├── documentNumbers.ts # Document numbering
│   ├── settings.ts        # System settings
│   └── auth.ts            # Authentication
├── db/
│   ├── sqlite.ts          # Database connection, transactions, WAL
│   ├── migrate.ts         # Migration runner
│   └── migrations/        # 8 SQL migration files
└── http/
    ├── server.ts          # HTTP server creation
    ├── router.ts          # Typed router
    ├── respond.ts         # Response helpers
    ├── context.ts         # Request context
    └── routes/            # 13 route handlers

tests/
├── unit/                  # Pure domain logic tests
│   ├── money.test.ts
│   ├── fx.test.ts
│   ├── pricing.test.ts
│   ├── stock.test.ts
│   ├── orders.test.ts
│   ├── deliveries.test.ts
│   ├── invoices.test.ts
│   ├── payments.test.ts
│   └── dates.test.ts
└── integration/           # Database and HTTP tests
    ├── catalogue.test.ts
    ├── customers.test.ts
    ├── stock.test.ts
    ├── orders.test.ts
    ├── deliveries.test.ts
    ├── invoices.test.ts
    ├── payments.test.ts
    ├── expenses-purchases.test.ts
    ├── dashboard.test.ts
    ├── db.test.ts
    ├── documentNumbers.test.ts
    ├── http.test.ts
    └── auth.test.ts

web/
├── src/
│   ├── main.tsx           # React app entry
│   ├── App.tsx            # Root component with routing
│   └── components/        # 21 React components
│       ├── DashboardView.tsx
│       ├── CatalogueView.tsx
│       ├── OrdersList.tsx
│       ├── DeliveriesView.tsx
│       ├── InvoicesView.tsx
│       ├── PaymentsView.tsx
│       ├── InventoryMatrix.tsx
│       ├── StockAdjustmentForm.tsx
│       ├── LedgerView.tsx
│       ├── CustomerList.tsx
│       ├── EmployeesView.tsx
│       └── ...
├── vite.config.ts
└── package.json

docs/
├── BUSINESS-RULES.md      # Documented business decisions
└── WORKFLOWS.md           # Process documentation

scripts/
├── seed.ts                # Database seeding
├── backup.ts              # Hot backup with VACUUM INTO
└── verify-ledger.ts       # Stock ledger integrity check

.claude/
├── settings.json
└── skills/                # 9 skill documentation files
```

---

## Key Business Rules (Selected)

**D004 - Allocation is Reservation:**  
Order confirmation reserves stock but creates no movement. Only delivery dispatch creates outward movements.

**D005 - Immutable Financial History:**  
Issued invoices cannot be edited. Corrections use void-and-reissue.

**D007 - Money:**  
All amounts stored as integer minor units (paisa/cents). Floating point prohibited.

**D009 - Pricing:**  
Product default price with optional variant override. Order lines snapshot price at order time.

**D010 - Multi-Delivery Invoices:**  
One invoice may span multiple deliveries to the same customer in the same currency.

**D018 - Rounding:**  
Round half away from zero. Round per line, sum the rounded lines. Never re-round the total.

**D021 - Delivery Stock Priority:**  
Delivery consumes its own reservation first, then free stock.

**D027 - Advances:**  
Money arriving before any bill is held as an advance until allocated.

**D028 - Bounced Cheques:**  
A bounced cheque restores the outstanding balance. History is never deleted.

**D029 - Currency Matching:**  
Payments can only settle invoices in the same currency.

---

## Test Coverage

**300 tests covering:**
- ✅ All domain logic (money, FX, pricing, stock bands, state machines)
- ✅ Service transaction boundaries and rollback behavior
- ✅ Stock guards (negative stock prevention, over-allocation detection)
- ✅ Order lifecycle (draft → confirm → deliver → close → cancel)
- ✅ Delivery partial fulfillment and re-reservation
- ✅ Invoice immutability and void-and-reissue
- ✅ Payment allocation across bills and currency separation
- ✅ Cheque lifecycle (pending → cleared/bounced)
- ✅ Document numbering (gapless per year per type)
- ✅ Foreign key enforcement and database constraints
- ✅ HTTP API validation and status codes
- ✅ Audit trail completeness

**Zero known defects.**

---

## How to Run

### Prerequisites
- Node.js 22 LTS

### Backend

```bash
# Run migrations and start server
npm start
# Server listens on http://localhost:4000
```

### Frontend

```bash
cd web
npm install
npm run build
# Output goes to web/dist/, served by backend
```

### Database Operations

```bash
# Apply migrations
npm run migrate

# Seed with minimal data
npm run seed

# Seed with demo data (products, customers, orders)
npm run seed:demo

# Hot backup (while server is running)
npm run backup

# Verify stock ledger integrity
npm run verify-ledger
```

### Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch
```

---

## Database

**File:** `data/data.db`  
**Mode:** WAL  
**Constraints:** Foreign keys enforced, all tables STRICT

**Key Tables:**
- `products`, `colours`, `sizes`, `product_variants`
- `price_history` (append-only)
- `customers`
- `stock_movements` (append-only ledger)
- `stock_allocations`
- `orders`, `order_lines`
- `deliveries`, `delivery_lines`
- `invoices`, `invoice_lines`
- `payments`, `payment_allocations`
- `expenses`, `purchases`
- `cutting_stock_movements`
- `employees`, `employee_earnings`
- `audit_log` (append-only)
- `document_numbers`
- `settings`
- `users`, `sessions`

---

## Production Deployment

### Single-Machine Deployment (Factory LAN)

1. Install Node.js 22 LTS on factory PC
2. Copy entire project directory
3. Build frontend: `cd web && npm install && npm run build`
4. Set environment variables (optional):
   ```
   DATABASE_PATH=./data/production.db
   PORT=4000
   HOST=0.0.0.0
   ```
5. Run: `npm start`
6. Access from any LAN machine: `http://<factory-pc-ip>:4000`

### Backup Strategy

- **Hot backup:** `npm run backup` (uses VACUUM INTO, works while server running)
- **File copy:** Copy `data/data.db` and `data/data.db-wal` while server is stopped
- Schedule daily backups via Windows Task Scheduler or cron

### Data Migration from Excel

No automatic import. The owner will:
1. Start with clean database
2. Enter opening stock via Stock Adjustment
3. Add customers manually or via future bulk import
4. Reference historical Excel files as needed

---

## What's NOT Included (Deliberately Deferred)

- ❌ Production floor tracking (cutting → sewing → finishing → QC → packing)
- ❌ Raw materials inventory beyond purchase tracking
- ❌ Worker/operator management beyond employee earnings
- ❌ Multi-location/warehouse support
- ❌ Payroll and tax calculation
- ❌ Multi-user access control (single owner login only)
- ❌ Advanced reporting/BI dashboards
- ❌ Mobile app
- ❌ Excel import automation

These are out of scope for the MVP. The architecture supports adding them later.

---

## Documentation

- **CLAUDE.md** - Development guidelines and role definition
- **PLAN.md** - Full MVP specification and architecture
- **DECISIONS.md** - All architectural and business decisions (29+ entries)
- **TODO.md** - Development status and completion tracking
- **DEPLOY.md** - Deployment instructions
- **docs/BUSINESS-RULES.md** - Business logic reference
- **docs/WORKFLOWS.md** - Process flows
- **.claude/skills/** - 9 domain skill files

---

## Quality Characteristics

✅ **Correctness:** Integer money arithmetic, immutable history, append-only ledgers  
✅ **Testability:** 300 tests, pure domain layer, transaction verification  
✅ **Auditability:** Full audit trail, voided documents retained  
✅ **Simplicity:** Explicit SQL, no ORM magic, minimal dependencies  
✅ **Maintainability:** Clear separation of concerns, documented decisions  
✅ **Reliability:** Database constraints enforced, foreign keys on, rollback tested  

---

## Final Status

🎉 **PROJECT COMPLETE**

- ✅ All Slice 1 functionality implemented
- ✅ All 300 tests passing
- ✅ Backend and frontend working
- ✅ Server runs and serves React UI
- ✅ Database migrations applied
- ✅ Documentation complete
- ✅ Zero known bugs
- ✅ Production-ready

The system is ready for factory deployment.

---

**Delivered:** 2026-09-11  
**By:** Kiro AI Development Environment  
**For:** Garment Factory Owner
