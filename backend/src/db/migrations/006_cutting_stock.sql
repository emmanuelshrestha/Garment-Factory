-- ---------------------------------------------------------------------------
-- Cutting Stock (Simplified Production)
-- ---------------------------------------------------------------------------

CREATE TABLE cutting_stock_movements (
  id            INTEGER PRIMARY KEY,
  variant_id    INTEGER NOT NULL REFERENCES product_variants(id),
  qty_delta     INTEGER NOT NULL CHECK (qty_delta <> 0),
  -- 'add': added to cutting
  -- 'transfer_to_finished': moved to finished goods
  -- 'adjustment_in', 'adjustment_out': stock count corrections
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

CREATE INDEX idx_cutting_movements_variant ON cutting_stock_movements(variant_id);
