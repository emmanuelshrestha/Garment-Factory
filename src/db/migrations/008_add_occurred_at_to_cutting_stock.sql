-- Add occurred_at to cutting_stock_movements.
-- Since it is a STRICT table, we must rebuild it.

CREATE TABLE cutting_stock_movements_new (
  id            INTEGER PRIMARY KEY,
  variant_id    INTEGER NOT NULL REFERENCES product_variants(id),
  qty_delta     INTEGER NOT NULL CHECK (qty_delta <> 0),
  movement_type TEXT NOT NULL CHECK (movement_type IN (
                  'add',
                  'transfer_to_finished',
                  'adjustment_in',
                  'adjustment_out'
                )),
  occurred_at   TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  created_by    INTEGER NOT NULL REFERENCES users(id),
  note          TEXT
) STRICT;

INSERT INTO cutting_stock_movements_new (id, variant_id, qty_delta, movement_type, occurred_at, created_at, created_by, note)
SELECT id, variant_id, qty_delta, movement_type, created_at, created_at, created_by, note
FROM cutting_stock_movements;

DROP TABLE cutting_stock_movements;
ALTER TABLE cutting_stock_movements_new RENAME TO cutting_stock_movements;
CREATE INDEX idx_cutting_movements_variant ON cutting_stock_movements(variant_id);
