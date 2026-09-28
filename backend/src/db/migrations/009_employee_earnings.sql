-- ---------------------------------------------------------------------------
-- Employee Earnings Module
-- ---------------------------------------------------------------------------

CREATE TABLE employees (
  id            INTEGER PRIMARY KEY,
  tailor_number TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at    TEXT NOT NULL
) STRICT;

CREATE TABLE employee_earnings (
  id            INTEGER PRIMARY KEY,
  employee_id   INTEGER NOT NULL REFERENCES employees(id),
  fiscal_year   INTEGER NOT NULL,
  month         TEXT NOT NULL, -- e.g., 'Baisakh', 'Jestha', ...
  quantity      INTEGER NOT NULL DEFAULT 0,
  total_earned  INTEGER NOT NULL DEFAULT 0, -- NPR minor units
  advance       INTEGER NOT NULL DEFAULT 0, -- NPR minor units
  others        INTEGER NOT NULL DEFAULT 0, -- NPR minor units (can be negative)
  opening_due   INTEGER NOT NULL DEFAULT 0, -- NPR minor units
  closing_due   INTEGER NOT NULL DEFAULT 0, -- NPR minor units
  note          TEXT,
  created_at    TEXT NOT NULL
) STRICT;

CREATE INDEX idx_employee_earnings_employee ON employee_earnings(employee_id);
CREATE INDEX idx_employee_earnings_year_month ON employee_earnings(fiscal_year, month);
