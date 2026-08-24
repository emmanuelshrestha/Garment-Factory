-- ---------------------------------------------------------------------------
-- Invoicing: owner decisions of 2026-08-24 (D022, D024, D025).
--
-- Three changes, all to invoicing, none touching stock or existing history:
--
--   D022  a due date typed on the invoice itself, not derived from standing
--         credit terms per customer
--   D024  one discount on the whole bill, and it must say why
--   D025  delivered goods may sit on only one *standing* invoice; a voided
--         invoice must stop blocking, or void-and-reissue (D005) would be
--         impossible
-- ---------------------------------------------------------------------------

-- D022. Nullable: a cash sale has no due date, and the owner types the date
-- when there is one. Same GLOB shape as every other date column.
ALTER TABLE invoices ADD COLUMN due_date TEXT
  CHECK (due_date IS NULL OR due_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]');

-- D024. A discount with no explanation is an audit hole, exactly as an
-- unexplained stock adjustment is. Enforced here rather than only in code.
ALTER TABLE invoices ADD COLUMN discount_reason TEXT
  CHECK (discount_minor = 0 OR length(trim(coalesce(discount_reason, ''))) > 0);

-- ---------------------------------------------------------------------------
-- D025. `invoice_lines.delivery_line_id` was declared UNIQUE outright, which
-- locked delivered goods to one invoice for ever — including an invoice that
-- had been voided. That made the approved correction path (void the wrong
-- invoice, issue a right one for the same goods) impossible.
--
-- SQLite cannot drop a column constraint, so the table is rebuilt. Rows are
-- copied rather than discarded: there are none today, and a migration that
-- silently drops financial lines is not one worth writing.
-- ---------------------------------------------------------------------------

CREATE TABLE invoice_lines_new (
  id                   INTEGER PRIMARY KEY,
  invoice_id           INTEGER NOT NULL REFERENCES invoices(id),
  -- No longer UNIQUE: see the trigger below, which says the same thing but
  -- ignores voided invoices.
  delivery_line_id     INTEGER NOT NULL REFERENCES delivery_lines(id),
  variant_id           INTEGER NOT NULL REFERENCES product_variants(id),
  -- Frozen text: "Bomber Jacket / Black / L". Renaming a product later must
  -- not change what an issued invoice says.
  description_snapshot TEXT NOT NULL,
  qty                  INTEGER NOT NULL CHECK (qty > 0),
  unit_price_minor     INTEGER NOT NULL CHECK (unit_price_minor >= 0),
  line_total_minor     INTEGER NOT NULL CHECK (line_total_minor >= 0)
) STRICT;

INSERT INTO invoice_lines_new
  (id, invoice_id, delivery_line_id, variant_id, description_snapshot, qty,
   unit_price_minor, line_total_minor)
SELECT
   id, invoice_id, delivery_line_id, variant_id, description_snapshot, qty,
   unit_price_minor, line_total_minor
  FROM invoice_lines;

DROP TABLE invoice_lines;

ALTER TABLE invoice_lines_new RENAME TO invoice_lines;

CREATE INDEX idx_invoice_lines_invoice ON invoice_lines(invoice_id);
CREATE INDEX idx_invoice_lines_delivery_line ON invoice_lines(delivery_line_id);

-- The guarantee stays in the database, not merely in the service: delivered
-- goods may appear on only one invoice that is still standing. A voided
-- invoice keeps its lines for the record and stops blocking.
CREATE TRIGGER invoice_lines_one_standing_invoice
BEFORE INSERT ON invoice_lines
BEGIN
  SELECT RAISE(ABORT, 'delivery line is already on a standing invoice')
   WHERE EXISTS (
     SELECT 1
       FROM invoice_lines existing
       JOIN invoices inv ON inv.id = existing.invoice_id
      WHERE existing.delivery_line_id = NEW.delivery_line_id
        AND inv.status <> 'void'
   );
END;
