# Garment Factory Management System — Database Schema & Storage Reference

## 1. Storage Configuration & PRAGMAs

The database is managed exclusively via `src/db/sqlite.ts` utilizing `node:sqlite`.

- **Engine**: SQLite 3.51.3 (Node 22 LTS).
- **Table Mode**: `STRICT` on all tables (D014), enforcing native type checking for INT, TEXT, BLOB, REAL, ANY.
- **Journal Mode**: `WAL` (Write-Ahead Logging) for concurrent reads and crash resilience.
- **Foreign Keys**: `PRAGMA foreign_keys = ON;` executed on every connection.
- **Busy Timeout**: `PRAGMA busy_timeout = 5000;` (5 seconds).

---

## 2. Migration System

Migrations are stored in `src/db/migrations/` as numbered SQL files and tracked in the `schema_migrations` table:

```sql
CREATE TABLE schema_migrations (
  name TEXT PRIMARY KEY,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL
);
```

- Each migration file runs inside a dedicated transaction.
- Migrations check SHA-256 checksums to guarantee applied files have not been tampered with.

### Existing Migrations:
1. `001_init.sql`: Core schema (users, catalogue, stock ledger, orders, deliveries, invoices, payments, audit log, document sequences).
2. `002_invoice_due_date_and_reissue.sql`: Adds `due_date`, discount reason constraints, and replaces the hard `delivery_line_id` UNIQUE index with `invoice_lines_one_standing_invoice` trigger for void-and-reissue support.
3. `003_payment_lifecycle.sql`: Rebuilds `payments` table with updated CHECK constraints allowing `cleared -> bounced` and `cleared -> cancelled` transitions.

---

## 3. Core Tables Summary

### 3.1 Catalogue & Master Data
- `users`: Operator accounts with scrypt password hashes and role definitions.
- `sessions`: Ephemeral authenticated sessions.
- `customers`: Customer master records (`code`, `name`, `default_currency`, `is_active`).
- `products`: Product headers (`code`, `name`, `default_price_minor`, `default_currency`).
- `colours`: Colour lookup (`name`).
- `sizes`: Size lookup (`name`, `sort_order` to maintain matrix column sorting S/M/L/XL/2XL).
- `product_variants`: Variant definitions (`product_id`, `colour_id`, `size_id`, `price_minor`, `min_stock_qty`).
- `price_history`: Append-only audit of pricing modifications.

### 3.2 Inventory & Stock Ledgers
- `stock_movements`: **Append-only source of truth** for finished stock.
  - `movement_type`: `opening_balance`, `production_receipt`, `delivery_out`, `return_in`, `adjustment_in`, `adjustment_out`.
  - `qty_delta`: Positive (inbound) or negative (outbound). `CHECK(qty_delta <> 0)`.
- `stock_allocations`: Active and consumed order reservations (`qty`, `status` ∈ `active`, `released`, `consumed`).
- `stock_adjustments`: Stock adjustment headers requiring non-empty `note`.
- `stock_adjustment_lines`: Itemized lines linked to adjustment movements.

### 3.3 Sales & Delivery Cycle
- `orders`: Order header (`order_no`, `customer_id`, `order_date`, `status`, `currency`, `fx_rate_to_npr`).
- `order_lines`: Itemized order lines with snapshotted `unit_price_minor`.
- `deliveries`: Delivery headers (`delivery_no`, `order_id`, `delivered_at`, `status` ∈ `draft`, `dispatched`, `cancelled`).
- `delivery_lines`: Dispatched items linked to order lines and stock movements.
- `cutting_stock_movements`: Ledger for cutting stock (`variant_id`, `qty_delta`, `movement_type` ∈ `add`, `transfer_to_finished`, `adjustment_in`, `adjustment_out`).

### 3.4 Invoicing & Billing
- `invoices`: Invoice headers (`invoice_no`, `customer_id`, `invoice_date`, `due_date`, `subtotal_minor`, `discount_minor`, `discount_reason`, `total_minor`, `status` ∈ `draft`, `issued`, `void`).
- `invoice_lines`: Billed delivery lines with snapshot descriptions and rates.
- Trigger `invoice_lines_one_standing_invoice`: Prevents the same `delivery_line_id` from being assigned to more than one active (non-void) invoice.

### 3.5 Payments & Settlement
- `payments`: Payment receipts (`payment_no`, `customer_id`, `received_at`, `method` ∈ `cash`, `bank_transfer`, `cheque`, `amount_minor`, `status` ∈ `pending`, `cleared`, `bounced`, `cancelled`, `cheque_no`, `cheque_date`, `cleared_at`, `bounce_reason`).
- `payment_allocations`: Mapping of cleared payments to specific invoices (`payment_id`, `invoice_id`, `amount_minor`).

### 3.6 System & Auditing
- `audit_log`: Append-only event stream (`at`, `user_id`, `action`, `entity_type`, `entity_id`, `detail_json`).
- `document_sequences`: Sequence tracker per document type and calendar year (`doc_type`, `doc_year`, `last_number`).
- `system_settings`: Key-value configuration store (e.g. amber low-stock threshold percentage).
