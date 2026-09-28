-- 001_init.sql — slice 1 schema: catalogue, stock ledger, sales cycle, money in.
--
-- Every table is STRICT (DECISIONS.md D014). Node 22 bundles SQLite 3.51.3,
-- so a string or a float written into an INTEGER money column is rejected by
-- the database itself rather than by a code review.
--
-- Conventions
--   money      INTEGER minor units (paisa/cents). Never REAL. See D007.
--   fx rate    INTEGER, actual rate x 1,000,000. NPR is exactly 1000000.
--   *_date     TEXT 'YYYY-MM-DD' (AD). AD is the only calendar in the system.
--   *_at       TEXT ISO-8601 UTC 'YYYY-MM-DDTHH:MM:SS.sssZ'
--   booleans   INTEGER 0 or 1, CHECK constrained
--
-- Production tables are deliberately absent. Production is slice 2 (D008).

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------

CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('owner', 'staff')),
  is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at    TEXT NOT NULL
) STRICT;

CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
) STRICT;

CREATE INDEX idx_sessions_user ON sessions(user_id);

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------

CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

-- ---------------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------------

CREATE TABLE customers (
  id               INTEGER PRIMARY KEY,
  code             TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  phone            TEXT,
  address          TEXT,
  default_currency TEXT NOT NULL DEFAULT 'NPR'
                     CHECK (default_currency IN ('NPR', 'INR', 'USD')),
  notes            TEXT,
  is_active        INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at       TEXT NOT NULL,
  created_by       INTEGER NOT NULL REFERENCES users(id)
) STRICT;

CREATE TABLE products (
  id                  INTEGER PRIMARY KEY,
  code                TEXT NOT NULL UNIQUE,
  name                TEXT NOT NULL,
  category            TEXT,
  -- Default price. A variant may override it (D009). Nullable so a product
  -- can exist before it is priced; resolution then errors rather than
  -- silently selling at zero.
  default_price_minor INTEGER CHECK (default_price_minor IS NULL OR default_price_minor >= 0),
  default_currency    TEXT NOT NULL DEFAULT 'NPR'
                        CHECK (default_currency IN ('NPR', 'INR', 'USD')),
  is_active           INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at          TEXT NOT NULL,
  created_by          INTEGER NOT NULL REFERENCES users(id)
) STRICT;

CREATE TABLE colours (
  id        INTEGER PRIMARY KEY,
  name      TEXT NOT NULL UNIQUE,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
) STRICT;

CREATE TABLE sizes (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  -- Drives S / M / L / XL / 2XL column order in the matrix UI.
  sort_order INTEGER NOT NULL,
  is_active  INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
) STRICT;

CREATE TABLE product_variants (
  id            INTEGER PRIMARY KEY,
  product_id    INTEGER NOT NULL REFERENCES products(id),
  colour_id     INTEGER NOT NULL REFERENCES colours(id),
  size_id       INTEGER NOT NULL REFERENCES sizes(id),
  sku           TEXT NOT NULL UNIQUE,
  -- Optional override of products.default_price_minor (D009).
  price_minor   INTEGER CHECK (price_minor IS NULL OR price_minor >= 0),
  -- Per-variant low-stock threshold (D012). Bands are red at or below this
  -- value, amber within settings.low_stock_amber_percent above it (D019).
  min_stock_qty INTEGER NOT NULL DEFAULT 0 CHECK (min_stock_qty >= 0),
  is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at    TEXT NOT NULL,
  UNIQUE (product_id, colour_id, size_id)
) STRICT;

CREATE INDEX idx_variants_product ON product_variants(product_id);

-- Append-only. Never updated, never deleted.
CREATE TABLE price_history (
  id             INTEGER PRIMARY KEY,
  product_id     INTEGER NOT NULL REFERENCES products(id),
  variant_id     INTEGER REFERENCES product_variants(id),
  price_minor    INTEGER NOT NULL CHECK (price_minor >= 0),
  currency       TEXT NOT NULL CHECK (currency IN ('NPR', 'INR', 'USD')),
  effective_from TEXT NOT NULL
                   CHECK (effective_from GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  created_at     TEXT NOT NULL,
  created_by     INTEGER NOT NULL REFERENCES users(id),
  note           TEXT
) STRICT;

CREATE INDEX idx_price_history_product ON price_history(product_id, effective_from);

-- ---------------------------------------------------------------------------
-- Document numbering (D017)
-- ---------------------------------------------------------------------------

-- ORD-2026-00001 etc. The sequence resets to 1 each 1 January, independently
-- per document type. Incremented inside the same transaction that creates the
-- document, so a rollback cannot burn a number and two documents cannot share
-- one.
CREATE TABLE document_sequences (
  id          INTEGER PRIMARY KEY,
  doc_type    TEXT NOT NULL CHECK (doc_type IN ('ORD', 'DEL', 'INV', 'PAY', 'EXP', 'PUR', 'ADJ')),
  doc_year    INTEGER NOT NULL CHECK (doc_year BETWEEN 2000 AND 2200),
  last_number INTEGER NOT NULL DEFAULT 0 CHECK (last_number >= 0),
  UNIQUE (doc_type, doc_year)
) STRICT;

-- ---------------------------------------------------------------------------
-- Stock — the ledger is the source of truth
-- ---------------------------------------------------------------------------

-- Append-only. There is no cached quantity column anywhere in this schema:
-- on_hand is always SUM(qty_delta). A zero delta is meaningless and is
-- rejected outright.
CREATE TABLE stock_movements (
  id            INTEGER PRIMARY KEY,
  variant_id    INTEGER NOT NULL REFERENCES product_variants(id),
  qty_delta     INTEGER NOT NULL CHECK (qty_delta <> 0),
  movement_type TEXT NOT NULL CHECK (movement_type IN (
                  'opening_balance',
                  'production_receipt',
                  'delivery_out',
                  'return_in',
                  'adjustment_in',
                  'adjustment_out'
                )),
  -- Every movement points back at the business event that caused it.
  ref_type      TEXT NOT NULL CHECK (ref_type IN ('opening', 'delivery', 'adjustment', 'production', 'return')),
  ref_id        INTEGER,
  occurred_at   TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  created_by    INTEGER NOT NULL REFERENCES users(id),
  reason        TEXT,
  -- Sign and movement type must agree, so an "adjustment_in" can never
  -- secretly remove stock.
  CHECK (
    (movement_type IN ('opening_balance', 'production_receipt', 'return_in', 'adjustment_in') AND qty_delta > 0)
    OR
    (movement_type IN ('delivery_out', 'adjustment_out') AND qty_delta < 0)
  )
) STRICT;

CREATE INDEX idx_movements_variant ON stock_movements(variant_id);
CREATE INDEX idx_movements_ref ON stock_movements(ref_type, ref_id);

CREATE TABLE stock_adjustments (
  id          INTEGER PRIMARY KEY,
  adjustment_no TEXT NOT NULL UNIQUE,
  adjusted_at TEXT NOT NULL,
  reason_code TEXT NOT NULL CHECK (reason_code IN (
                'stock_count', 'damage', 'loss', 'found', 'correction'
              )),
  -- A free-text explanation is mandatory: "every stock change must have a
  -- traceable reason" is not satisfied by a reason code alone.
  note        TEXT NOT NULL CHECK (length(trim(note)) > 0),
  created_at  TEXT NOT NULL,
  created_by  INTEGER NOT NULL REFERENCES users(id)
) STRICT;

CREATE TABLE stock_adjustment_lines (
  id            INTEGER PRIMARY KEY,
  adjustment_id INTEGER NOT NULL REFERENCES stock_adjustments(id),
  variant_id    INTEGER NOT NULL REFERENCES product_variants(id),
  qty_delta     INTEGER NOT NULL CHECK (qty_delta <> 0),
  movement_id   INTEGER NOT NULL UNIQUE REFERENCES stock_movements(id)
) STRICT;

CREATE INDEX idx_adjustment_lines_adjustment ON stock_adjustment_lines(adjustment_id);

-- ---------------------------------------------------------------------------
-- Sales cycle
-- ---------------------------------------------------------------------------

CREATE TABLE orders (
  id             INTEGER PRIMARY KEY,
  order_no       TEXT NOT NULL UNIQUE,
  customer_id    INTEGER NOT NULL REFERENCES customers(id),
  order_date     TEXT NOT NULL
                   CHECK (order_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  required_date  TEXT
                   CHECK (required_date IS NULL OR required_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  currency       TEXT NOT NULL CHECK (currency IN ('NPR', 'INR', 'USD')),
  -- Captured at document time and never refreshed. Reporting uses this rate,
  -- never today's.
  fx_rate_to_npr INTEGER NOT NULL CHECK (fx_rate_to_npr > 0),
  status         TEXT NOT NULL CHECK (status IN (
                   'draft', 'confirmed', 'partially_delivered', 'delivered', 'closed', 'cancelled'
                 )),
  notes          TEXT,
  created_at     TEXT NOT NULL,
  created_by     INTEGER NOT NULL REFERENCES users(id)
) STRICT;

CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(status);

CREATE TABLE order_lines (
  id               INTEGER PRIMARY KEY,
  order_id         INTEGER NOT NULL REFERENCES orders(id),
  variant_id       INTEGER NOT NULL REFERENCES product_variants(id),
  qty_ordered      INTEGER NOT NULL CHECK (qty_ordered > 0),
  -- Snapshotted at order time (D005/D009). A later price change cannot reach
  -- back into this row.
  unit_price_minor INTEGER NOT NULL CHECK (unit_price_minor >= 0),
  note             TEXT,
  UNIQUE (order_id, variant_id)
) STRICT;

CREATE INDEX idx_order_lines_order ON order_lines(order_id);

-- A reservation, NOT a stock movement (D004). Confirming an order writes rows
-- here and touches stock_movements not at all — the garments are still
-- physically in the factory.
CREATE TABLE stock_allocations (
  id            INTEGER PRIMARY KEY,
  order_line_id INTEGER NOT NULL REFERENCES order_lines(id),
  variant_id    INTEGER NOT NULL REFERENCES product_variants(id),
  qty           INTEGER NOT NULL CHECK (qty > 0),
  status        TEXT NOT NULL CHECK (status IN ('active', 'released', 'consumed')),
  created_at    TEXT NOT NULL,
  created_by    INTEGER NOT NULL REFERENCES users(id),
  released_at   TEXT
) STRICT;

CREATE INDEX idx_allocations_variant_status ON stock_allocations(variant_id, status);
CREATE INDEX idx_allocations_order_line ON stock_allocations(order_line_id);

CREATE TABLE deliveries (
  id           INTEGER PRIMARY KEY,
  delivery_no  TEXT NOT NULL UNIQUE,
  order_id     INTEGER NOT NULL REFERENCES orders(id),
  customer_id  INTEGER NOT NULL REFERENCES customers(id),
  delivered_at TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('draft', 'dispatched', 'cancelled')),
  notes        TEXT,
  created_at   TEXT NOT NULL,
  created_by   INTEGER NOT NULL REFERENCES users(id)
) STRICT;

CREATE INDEX idx_deliveries_order ON deliveries(order_id);

CREATE TABLE delivery_lines (
  id            INTEGER PRIMARY KEY,
  delivery_id   INTEGER NOT NULL REFERENCES deliveries(id),
  order_line_id INTEGER NOT NULL REFERENCES order_lines(id),
  variant_id    INTEGER NOT NULL REFERENCES product_variants(id),
  qty           INTEGER NOT NULL CHECK (qty > 0),
  -- NULL while the delivery is a draft; set when dispatched. One movement per
  -- delivery line, enforced by UNIQUE.
  movement_id   INTEGER UNIQUE REFERENCES stock_movements(id),
  UNIQUE (delivery_id, order_line_id)
) STRICT;

CREATE INDEX idx_delivery_lines_delivery ON delivery_lines(delivery_id);
CREATE INDEX idx_delivery_lines_order_line ON delivery_lines(order_line_id);

CREATE TABLE invoices (
  id              INTEGER PRIMARY KEY,
  invoice_no      TEXT NOT NULL UNIQUE,
  customer_id     INTEGER NOT NULL REFERENCES customers(id),
  -- Nullable: one invoice may span several deliveries of one order (D010),
  -- and is kept for convenience rather than as the source of its lines.
  order_id        INTEGER REFERENCES orders(id),
  invoice_date    TEXT NOT NULL
                    CHECK (invoice_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  currency        TEXT NOT NULL CHECK (currency IN ('NPR', 'INR', 'USD')),
  fx_rate_to_npr  INTEGER NOT NULL CHECK (fx_rate_to_npr > 0),
  subtotal_minor  INTEGER NOT NULL CHECK (subtotal_minor >= 0),
  discount_minor  INTEGER NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
  total_minor     INTEGER NOT NULL CHECK (total_minor >= 0),
  status          TEXT NOT NULL CHECK (status IN ('draft', 'issued', 'void')),
  voided_at       TEXT,
  void_reason     TEXT,
  created_at      TEXT NOT NULL,
  created_by      INTEGER NOT NULL REFERENCES users(id),
  CHECK (total_minor = subtotal_minor - discount_minor),
  CHECK (discount_minor <= subtotal_minor),
  -- A void invoice must say why. Corrections are void-and-reissue (D005),
  -- and an unexplained void is an audit hole.
  CHECK (
    (status = 'void' AND voided_at IS NOT NULL AND length(trim(coalesce(void_reason, ''))) > 0)
    OR
    (status <> 'void' AND voided_at IS NULL AND void_reason IS NULL)
  )
) STRICT;

CREATE INDEX idx_invoices_customer ON invoices(customer_id);
CREATE INDEX idx_invoices_status ON invoices(status);

-- Append-only. Issued invoices are immutable (D005).
CREATE TABLE invoice_lines (
  id                   INTEGER PRIMARY KEY,
  invoice_id           INTEGER NOT NULL REFERENCES invoices(id),
  -- UNIQUE makes double-invoicing the same delivered goods impossible at the
  -- database level, not merely discouraged by code.
  delivery_line_id     INTEGER NOT NULL UNIQUE REFERENCES delivery_lines(id),
  variant_id           INTEGER NOT NULL REFERENCES product_variants(id),
  -- Frozen text: "Jacket A / Black / L". Renaming a product later must not
  -- change what an issued invoice says.
  description_snapshot TEXT NOT NULL,
  qty                  INTEGER NOT NULL CHECK (qty > 0),
  unit_price_minor     INTEGER NOT NULL CHECK (unit_price_minor >= 0),
  line_total_minor     INTEGER NOT NULL CHECK (line_total_minor >= 0)
) STRICT;

CREATE INDEX idx_invoice_lines_invoice ON invoice_lines(invoice_id);

-- ---------------------------------------------------------------------------
-- Money in
-- ---------------------------------------------------------------------------

CREATE TABLE payments (
  id             INTEGER PRIMARY KEY,
  payment_no     TEXT NOT NULL UNIQUE,
  customer_id    INTEGER NOT NULL REFERENCES customers(id),
  received_at    TEXT NOT NULL,
  method         TEXT NOT NULL CHECK (method IN ('cash', 'bank_transfer', 'cheque')),
  amount_minor   INTEGER NOT NULL CHECK (amount_minor > 0),
  currency       TEXT NOT NULL CHECK (currency IN ('NPR', 'INR', 'USD')),
  fx_rate_to_npr INTEGER NOT NULL CHECK (fx_rate_to_npr > 0),
  -- Cash and bank transfer are created 'cleared'. Cheques are created
  -- 'pending' and only an explicit clearing action moves them.
  status         TEXT NOT NULL CHECK (status IN ('pending', 'cleared', 'bounced', 'cancelled')),
  cheque_no      TEXT,
  cheque_date    TEXT
                   CHECK (cheque_date IS NULL OR cheque_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  cleared_at     TEXT,
  bounce_reason  TEXT,
  note           TEXT,
  created_at     TEXT NOT NULL,
  created_by     INTEGER NOT NULL REFERENCES users(id),
  -- Cheque details belong to cheques and nothing else.
  CHECK (
    (method = 'cheque' AND cheque_no IS NOT NULL AND cheque_date IS NOT NULL)
    OR
    (method <> 'cheque' AND cheque_no IS NULL AND cheque_date IS NULL)
  ),
  CHECK (method = 'cheque' OR status IN ('cleared', 'cancelled')),
  CHECK ((status = 'cleared') = (cleared_at IS NOT NULL)),
  CHECK ((status = 'bounced') = (bounce_reason IS NOT NULL))
) STRICT;

CREATE INDEX idx_payments_customer ON payments(customer_id);
CREATE INDEX idx_payments_status ON payments(status);

-- Append-only. A payment is applied to invoices here; unallocated remainder
-- is a customer advance.
CREATE TABLE payment_allocations (
  id           INTEGER PRIMARY KEY,
  payment_id   INTEGER NOT NULL REFERENCES payments(id),
  invoice_id   INTEGER NOT NULL REFERENCES invoices(id),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  created_at   TEXT NOT NULL,
  created_by   INTEGER NOT NULL REFERENCES users(id),
  UNIQUE (payment_id, invoice_id)
) STRICT;

CREATE INDEX idx_payment_allocations_invoice ON payment_allocations(invoice_id);

-- ---------------------------------------------------------------------------
-- Money out — recorded for the books only. No stock effect.
-- ---------------------------------------------------------------------------

CREATE TABLE expenses (
  id             INTEGER PRIMARY KEY,
  expense_no     TEXT NOT NULL UNIQUE,
  expense_date   TEXT NOT NULL
                   CHECK (expense_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  category       TEXT NOT NULL,
  payee          TEXT,
  amount_minor   INTEGER NOT NULL CHECK (amount_minor > 0),
  currency       TEXT NOT NULL CHECK (currency IN ('NPR', 'INR', 'USD')),
  fx_rate_to_npr INTEGER NOT NULL CHECK (fx_rate_to_npr > 0),
  method         TEXT NOT NULL CHECK (method IN ('cash', 'bank_transfer', 'cheque')),
  note           TEXT,
  created_at     TEXT NOT NULL,
  created_by     INTEGER NOT NULL REFERENCES users(id)
) STRICT;

-- Raw-material inventory is out of scope, so a purchase records money spent
-- and nothing more. It must not touch stock_movements.
CREATE TABLE purchases (
  id             INTEGER PRIMARY KEY,
  purchase_no    TEXT NOT NULL UNIQUE,
  supplier_name  TEXT NOT NULL,
  purchase_date  TEXT NOT NULL
                   CHECK (purchase_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  description    TEXT NOT NULL,
  amount_minor   INTEGER NOT NULL CHECK (amount_minor > 0),
  currency       TEXT NOT NULL CHECK (currency IN ('NPR', 'INR', 'USD')),
  fx_rate_to_npr INTEGER NOT NULL CHECK (fx_rate_to_npr > 0),
  note           TEXT,
  created_at     TEXT NOT NULL,
  created_by     INTEGER NOT NULL REFERENCES users(id)
) STRICT;

-- ---------------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------------

-- Append-only. Every status transition on a document writes a row here with
-- the old and the new value (D013).
CREATE TABLE audit_log (
  id          INTEGER PRIMARY KEY,
  at          TEXT NOT NULL,
  user_id     INTEGER REFERENCES users(id),
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   INTEGER,
  detail_json TEXT
) STRICT;

CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_at ON audit_log(at);

-- ---------------------------------------------------------------------------
-- Seed: system settings only. No business data.
-- ---------------------------------------------------------------------------

INSERT INTO settings (key, value, updated_at) VALUES
  ('low_stock_amber_percent', '25', '2026-08-23T00:00:00.000Z'),
  ('company_name',            '',   '2026-08-23T00:00:00.000Z'),
  ('company_address',         '',   '2026-08-23T00:00:00.000Z'),
  ('company_phone',           '',   '2026-08-23T00:00:00.000Z'),
  ('base_currency',           'NPR', '2026-08-23T00:00:00.000Z');

INSERT INTO sizes (name, sort_order) VALUES
  ('S', 10), ('M', 20), ('L', 30), ('XL', 40), ('2XL', 50), ('3XL', 60);
