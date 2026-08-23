---
name: accounting
description: Use whenever modifying invoices, payments, receivables, currencies, pricing, FX, or expenses in the garment factory system. Enforces integer minor units, document-time FX, and immutable financial history.
---

# Accounting Skill

Use whenever modifying invoices, payments, receivables, currencies,
pricing, FX, or expenses.

Rules:

- Money is integer minor units.
- Never use JS floating point.
- Currency must always be explicit.
- FX rate is captured at document time.
- Historical documents are immutable.
- Pending cheques do not reduce outstanding.
- Cleared payments reduce outstanding.
- Bounced cheques preserve history and restore outstanding.
- Never silently round money.

Every accounting feature requires tests covering:

- normal case
- partial payment
- invalid over-allocation
- historical immutability
- failure/rollback

## Project-specific rules

- Order and invoice lines **snapshot** the resolved unit price. A later
  price change must never reach an existing document (D005, D009).
- Price resolution order: variant override -> product default -> error (D009).
- A foreign-currency order stores the negotiated price **directly in the
  order currency**. Never derive it by converting an NPR price (D011).
- Receivables formula: sum of issued non-void invoice totals minus sum of
  **cleared** payment allocations. Pending cheques are reported separately.
- One invoice may draw lines from several deliveries (D010).
  `invoice_lines.delivery_line_id` is UNIQUE, so a delivered piece cannot
  be invoiced twice.
- Rounding: **round half away from zero, to the nearest paisa, applied
  once per line** (D018). Totals are the sum of already-rounded lines and
  are never re-rounded. This is the only rounding rule in the system; any
  other rounding is a bug.
- Document numbers come from `document_sequences` via the shared
  next-document-number function, incremented **inside the same transaction**
  that creates the document (D017). Never format a number by hand and never
  reserve one outside a transaction.
