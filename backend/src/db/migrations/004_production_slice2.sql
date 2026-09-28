-- ---------------------------------------------------------------------------
-- Production Slice 2 (2026-08-27)
--
-- Decisions recorded in DECISIONS.md D030–D034:
--   D030  CUT-2026-00001 document numbering for cutting jobs
--   D031  Rework tracked per batch, not per individual piece
--   D032  QC recorded by owner login (single user for now)
--   D033  Scrap is counted; raw material inventory added in this slice
--   D034  Raw material stock is an append-only movements ledger (same
--         pattern as finished stock)
--
-- Production flow:
--   raw_material_stock_in (manual receipt)
--   → cutting_job  (status: draft → in_progress → cut)
--   → production_batch  (status: cutting → sewing → finishing → qc → packing → packed)
--   → qc_inspection  (per-batch, pass/rework/scrap counts, defect detail)
--   → packed batch triggers production_receipt → stock_movements (finished)
--   → raw_material deduction for scrap
--
-- Every table is STRICT (D014).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Add CUT and MAT to the document sequences check.
-- SQLite cannot ALTER a CHECK constraint, so the table is rebuilt.
-- Only the CHECK list changes; all data is preserved.
-- ---------------------------------------------------------------------------

CREATE TABLE document_sequences_new (
  id          INTEGER PRIMARY KEY,
  doc_type    TEXT NOT NULL CHECK (doc_type IN ('ORD','DEL','INV','PAY','EXP','PUR','ADJ','CUT','MAT')),
  doc_year    INTEGER NOT NULL CHECK (doc_year BETWEEN 2000 AND 2200),
  last_number INTEGER NOT NULL DEFAULT 0 CHECK (last_number >= 0),
  UNIQUE (doc_type, doc_year)
) STRICT;

INSERT INTO document_sequences_new (id, doc_type, doc_year, last_number)
  SELECT id, doc_type, doc_year, last_number FROM document_sequences;

DROP TABLE document_sequences;
ALTER TABLE document_sequences_new RENAME TO document_sequences;

-- ---------------------------------------------------------------------------
-- Raw materials
-- ---------------------------------------------------------------------------

-- Master list of raw materials (fabric rolls, thread, trims, buttons, etc.)
-- Unit is a free-text label: "metres", "rolls", "pieces", "kg" etc.
CREATE TABLE raw_materials (
  id           INTEGER PRIMARY KEY,
  code         TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  unit         TEXT NOT NULL CHECK (length(trim(unit)) > 0),
  category     TEXT NOT NULL CHECK (category IN ('fabric','thread','trim','button','lining','other')),
  -- Reorder alert: system flags stock below this level.
  reorder_qty  INTEGER NOT NULL DEFAULT 0 CHECK (reorder_qty >= 0),
  is_active    INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at   TEXT NOT NULL,
  created_by   INTEGER NOT NULL REFERENCES users(id)
) STRICT;

-- Append-only ledger for raw materials (same pattern as stock_movements).
-- on_hand = SUM(qty_delta). No cached quantity.
CREATE TABLE raw_material_movements (
  id            INTEGER PRIMARY KEY,
  material_id   INTEGER NOT NULL REFERENCES raw_materials(id),
  qty_delta     INTEGER NOT NULL CHECK (qty_delta <> 0),
  movement_type TEXT NOT NULL CHECK (movement_type IN (
                  'stock_in',
                  'scrap_out',
                  'adjustment_in',
                  'adjustment_out'
                )),
  -- Points back at the business event that caused it.
  ref_type      TEXT NOT NULL CHECK (ref_type IN ('receipt','scrap','adjustment')),
  ref_id        INTEGER,
  occurred_at   TEXT NOT NULL
                  CHECK (occurred_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  note          TEXT,
  created_at    TEXT NOT NULL,
  created_by    INTEGER NOT NULL REFERENCES users(id),
  -- Sign and type must agree.
  CHECK (
    (movement_type IN ('stock_in','adjustment_in') AND qty_delta > 0)
    OR
    (movement_type IN ('scrap_out','adjustment_out') AND qty_delta < 0)
  )
) STRICT;

CREATE INDEX idx_raw_movements_material ON raw_material_movements(material_id);
CREATE INDEX idx_raw_movements_ref ON raw_material_movements(ref_type, ref_id);

-- Receipts of raw materials from suppliers (money side tracked as a purchase,
-- stock side tracked via raw_material_movements).
-- The MAT document number links physical arrival to the purchase record.
CREATE TABLE raw_material_receipts (
  id            INTEGER PRIMARY KEY,
  receipt_no    TEXT NOT NULL UNIQUE,
  material_id   INTEGER NOT NULL REFERENCES raw_materials(id),
  received_at   TEXT NOT NULL
                  CHECK (received_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  qty           INTEGER NOT NULL CHECK (qty > 0),
  supplier_name TEXT NOT NULL,
  note          TEXT,
  -- The movement row this receipt created.
  movement_id   INTEGER NOT NULL UNIQUE REFERENCES raw_material_movements(id),
  created_at    TEXT NOT NULL,
  created_by    INTEGER NOT NULL REFERENCES users(id)
) STRICT;

CREATE INDEX idx_raw_receipts_material ON raw_material_receipts(material_id);

-- ---------------------------------------------------------------------------
-- Cutting jobs (D030)
-- ---------------------------------------------------------------------------

-- A cutting job is the instruction to cut fabric for a specific variant and
-- quantity. One job = one variant. Multiple jobs may share an order shortfall.
CREATE TABLE cutting_jobs (
  id           INTEGER PRIMARY KEY,
  job_no       TEXT NOT NULL UNIQUE,   -- CUT-2026-00001
  variant_id   INTEGER NOT NULL REFERENCES product_variants(id),
  -- Optional link to the order shortage that triggered this job.
  order_id     INTEGER REFERENCES orders(id),
  qty_planned  INTEGER NOT NULL CHECK (qty_planned > 0),
  -- How many pieces were actually cut (set when status → cut).
  qty_cut      INTEGER CHECK (qty_cut IS NULL OR qty_cut >= 0),
  cut_date     TEXT NOT NULL
                 CHECK (cut_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  status       TEXT NOT NULL CHECK (status IN ('draft','in_progress','cut','cancelled')),
  note         TEXT,
  created_at   TEXT NOT NULL,
  created_by   INTEGER NOT NULL REFERENCES users(id)
) STRICT;

CREATE INDEX idx_cutting_jobs_variant ON cutting_jobs(variant_id);
CREATE INDEX idx_cutting_jobs_order ON cutting_jobs(order_id);
CREATE INDEX idx_cutting_jobs_status ON cutting_jobs(status);

-- ---------------------------------------------------------------------------
-- Production batches
-- ---------------------------------------------------------------------------

-- A production batch tracks one group of pieces through the factory.
-- It is born from a cutting job; it dies when it is packed (and the pieces
-- enter finished stock) or when it is scrapped entirely.
CREATE TABLE production_batches (
  id              INTEGER PRIMARY KEY,
  cutting_job_id  INTEGER NOT NULL REFERENCES cutting_jobs(id),
  variant_id      INTEGER NOT NULL REFERENCES product_variants(id),
  qty             INTEGER NOT NULL CHECK (qty > 0),
  status          TEXT NOT NULL CHECK (status IN (
                    'cutting','sewing','finishing','qc','packing','packed','scrapped'
                  )),
  -- Dates for each stage, set as the batch moves through.
  sewing_started_at   TEXT,
  finishing_started_at TEXT,
  qc_started_at       TEXT,
  packing_started_at  TEXT,
  packed_at           TEXT,
  -- The stock_movements row created when this batch was packed.
  stock_movement_id   INTEGER UNIQUE REFERENCES stock_movements(id),
  created_at          TEXT NOT NULL,
  created_by          INTEGER NOT NULL REFERENCES users(id)
) STRICT;

CREATE INDEX idx_batches_cutting_job ON production_batches(cutting_job_id);
CREATE INDEX idx_batches_variant ON production_batches(variant_id);
CREATE INDEX idx_batches_status ON production_batches(status);

-- ---------------------------------------------------------------------------
-- QC inspections (D031, D032)
-- ---------------------------------------------------------------------------

-- One QC inspection row per production batch QC event (D031: per batch).
-- A batch may be re-inspected after rework — each inspection is a new row.
CREATE TABLE qc_inspections (
  id              INTEGER PRIMARY KEY,
  batch_id        INTEGER NOT NULL REFERENCES production_batches(id),
  inspected_at    TEXT NOT NULL
                    CHECK (inspected_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  qty_inspected   INTEGER NOT NULL CHECK (qty_inspected > 0),
  qty_pass        INTEGER NOT NULL CHECK (qty_pass >= 0),
  -- Rework: defective but salvageable (D031: tracked per batch as a count).
  qty_rework      INTEGER NOT NULL CHECK (qty_rework >= 0),
  -- Scrap: beyond recovery. Deducts raw material stock (D033).
  qty_scrap       INTEGER NOT NULL CHECK (qty_scrap >= 0),
  -- Defect breakdown (JSON array of {defectCode, qty}). Stored as text
  -- because the set of defect codes grows over time without a schema change.
  defect_detail   TEXT,
  outcome         TEXT NOT NULL CHECK (outcome IN ('pass','rework','scrap','partial')),
  note            TEXT,
  created_at      TEXT NOT NULL,
  created_by      INTEGER NOT NULL REFERENCES users(id),
  -- Totals must add up.
  CHECK (qty_pass + qty_rework + qty_scrap = qty_inspected),
  -- outcome interpretation:
  --   pass    = all inspected pieces passed (qty_rework=0, qty_scrap=0)
  --   rework  = some pieces need rework (qty_rework > 0)
  --   scrap   = some pieces are unrecoverable (qty_scrap > 0)
  --   partial = mixed pass/rework/scrap
  CHECK (
    (outcome = 'pass'    AND qty_pass = qty_inspected AND qty_rework = 0 AND qty_scrap = 0)
    OR
    (outcome = 'rework'  AND qty_rework > 0 AND qty_scrap = 0)
    OR
    (outcome = 'scrap'   AND qty_scrap > 0 AND qty_rework = 0)
    OR
    (outcome = 'partial' AND qty_rework > 0 AND qty_scrap > 0)
  )
) STRICT;

CREATE INDEX idx_qc_batch ON qc_inspections(batch_id);

-- When scrap is recorded, this table links the QC inspection to the raw
-- material deduction it caused. One row per material deducted per inspection.
CREATE TABLE qc_scrap_deductions (
  id              INTEGER PRIMARY KEY,
  inspection_id   INTEGER NOT NULL REFERENCES qc_inspections(id),
  material_id     INTEGER NOT NULL REFERENCES raw_materials(id),
  qty_deducted    INTEGER NOT NULL CHECK (qty_deducted > 0),
  -- The raw_material_movements row created by this deduction.
  movement_id     INTEGER NOT NULL UNIQUE REFERENCES raw_material_movements(id),
  UNIQUE (inspection_id, material_id)
) STRICT;

CREATE INDEX idx_scrap_deductions_inspection ON qc_scrap_deductions(inspection_id);
