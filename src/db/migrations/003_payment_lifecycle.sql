-- ---------------------------------------------------------------------------
-- Payments: owner decisions of 2026-08-24 (D028, and the reason-columns that
-- D005 and D024 already imply for money leaving the books).
--
-- One change of substance: a cheque the owner has already marked cleared can
-- be returned by the bank a week later, and the payment row must keep the date
-- it was cleared. The original CHECK made that impossible:
--
--     CHECK ((status = 'cleared') = (cleared_at IS NOT NULL))
--
-- Under that rule a bounce had to null out `cleared_at`, which is editing
-- financial history to satisfy a constraint. It is replaced by two weaker
-- rules that say what was actually meant: a cleared payment must carry a
-- clearing date, and only a payment that has at some point cleared may carry
-- one at all.
--
-- While the table is being rebuilt anyway, three dates and one reason are
-- added so that every status a payment can reach says when it happened and,
-- where money is being taken back off the books, why.
--
-- SQLite cannot drop a column constraint, so `payments` is rebuilt.
-- `payment_allocations` references it, so it is rebuilt too, in the only order
-- that keeps foreign keys enforced throughout: build both new tables, drop the
-- child then the parent, then rename the parent so SQLite rewrites the child's
-- reference to it. Rows are copied, ids preserved. There are none today, and a
-- migration that silently drops receipts is not one worth writing.
-- ---------------------------------------------------------------------------

CREATE TABLE payments_new (
  id             INTEGER PRIMARY KEY,
  payment_no     TEXT NOT NULL UNIQUE,
  customer_id    INTEGER NOT NULL REFERENCES customers(id),
  -- The day the money arrived, typed by the owner, like `delivered_at`. Not a
  -- timestamp: a receipt entered on Tuesday for cash taken on Monday has to
  -- say Monday.
  received_at    TEXT NOT NULL
                   CHECK (received_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
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
  cleared_at     TEXT
                   CHECK (cleared_at IS NULL OR cleared_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  bounced_at     TEXT
                   CHECK (bounced_at IS NULL OR bounced_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  bounce_reason  TEXT,
  cancelled_at   TEXT
                   CHECK (cancelled_at IS NULL OR cancelled_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  cancel_reason  TEXT,
  note           TEXT,
  created_at     TEXT NOT NULL,
  created_by     INTEGER NOT NULL REFERENCES users(id),
  -- Cheque details belong to cheques and nothing else.
  CHECK (
    (method = 'cheque' AND cheque_no IS NOT NULL AND cheque_date IS NOT NULL)
    OR
    (method <> 'cheque' AND cheque_no IS NULL AND cheque_date IS NULL)
  ),
  -- Only a cheque can be waiting, and only a cheque can come back.
  CHECK (method = 'cheque' OR status IN ('cleared', 'cancelled')),
  -- D028. A cleared payment must say when it cleared; a bounced or cancelled
  -- one keeps the date it was cleared, because that is what happened. Nulling
  -- `cleared_at` to satisfy a constraint would be editing financial history.
  CHECK (status <> 'cleared' OR cleared_at IS NOT NULL),
  CHECK (cleared_at IS NULL OR status IN ('cleared', 'bounced', 'cancelled')),
  -- A bounce is a dated event with a reason. Money coming back off the books
  -- unexplained is the same audit hole as an unexplained stock adjustment.
  CHECK (
    (status = 'bounced' AND bounced_at IS NOT NULL
       AND length(trim(coalesce(bounce_reason, ''))) > 0)
    OR
    (status <> 'bounced' AND bounced_at IS NULL AND bounce_reason IS NULL)
  ),
  -- Cancelling a receipt takes money off the books too, so it is dated and
  -- explained on the same terms as voiding an invoice (D005).
  CHECK (
    (status = 'cancelled' AND cancelled_at IS NOT NULL
       AND length(trim(coalesce(cancel_reason, ''))) > 0)
    OR
    (status <> 'cancelled' AND cancelled_at IS NULL AND cancel_reason IS NULL)
  )
) STRICT;

INSERT INTO payments_new
  (id, payment_no, customer_id, received_at, method, amount_minor, currency,
   fx_rate_to_npr, status, cheque_no, cheque_date, cleared_at, bounce_reason,
   note, created_at, created_by)
SELECT
   id, payment_no, customer_id, received_at, method, amount_minor, currency,
   fx_rate_to_npr, status, cheque_no, cheque_date, cleared_at, bounce_reason,
   note, created_at, created_by
  FROM payments;

-- Unchanged in shape. Rebuilt only so that the reference below can be
-- rewritten to the new parent table.
CREATE TABLE payment_allocations_new (
  id           INTEGER PRIMARY KEY,
  payment_id   INTEGER NOT NULL REFERENCES payments_new(id),
  invoice_id   INTEGER NOT NULL REFERENCES invoices(id),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  created_at   TEXT NOT NULL,
  created_by   INTEGER NOT NULL REFERENCES users(id),
  -- One row per payment per invoice. A payment that needs to give an invoice
  -- more money later is a second payment, not an edited allocation.
  UNIQUE (payment_id, invoice_id)
) STRICT;

INSERT INTO payment_allocations_new
  (id, payment_id, invoice_id, amount_minor, created_at, created_by)
SELECT
   id, payment_id, invoice_id, amount_minor, created_at, created_by
  FROM payment_allocations;

DROP TABLE payment_allocations;
DROP TABLE payments;

-- This rename is what repoints payment_allocations_new at the real table.
ALTER TABLE payments_new RENAME TO payments;
ALTER TABLE payment_allocations_new RENAME TO payment_allocations;

CREATE INDEX idx_payments_customer ON payments(customer_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payment_allocations_invoice ON payment_allocations(invoice_id);
CREATE INDEX idx_payment_allocations_payment ON payment_allocations(payment_id);
