# Garment Factory Management System

## Role

You are the lead software engineer building a production-grade garment
factory management system for a real business.

This is NOT a demo, toy ERP, prototype, or generic CRUD application.

Money, stock, invoices, payments, and historical records must be treated
as business-critical data.

Prefer correctness, explicit business rules, auditability, and simplicity
over clever abstractions.

---

## Business

The company manufactures jacket-related garments.

Approximately 50 products exist, each with variants based primarily on:

- Product
- Colour
- Size

The factory currently has one physical location.
The owner is currently the only system user.

Currency:

- NPR
- INR
- occasionally USD

The system is a new start. Existing Excel files are historical/reference
material and are NOT automatically imported into the MVP.

---

## Core workflow

Sales:

```
Customer
→ Order
→ Stock check
→ Reserve available finished goods
→ If shortage exists, production is required
→ Delivery
→ Invoice
→ Payment
→ Customer balance
```

Production will be implemented in a later slice:

```
Cutting → Sewing → Finishing → QC → Packing → Finished stock
```

---

## Critical stock rule

Stock means FINISHED GARMENTS.

Cutting does NOT increase finished stock.
Sewing does NOT increase finished stock.
Only accepted packed garments increase finished stock.

Finished stock is represented by an append-only stock movement ledger.
Never introduce a cached stock quantity unless explicitly approved.

Available stock:

```
available = on_hand - active_allocations
```

An order allocation is a reservation, NOT a stock movement.
Delivery consumes the allocation and creates the stock movement.

Never allow stock to become negative.

---

## Critical financial rules

Never use floating point for money.
Store money as integer minor units.

Every financial document stores:

- amount
- currency
- FX rate at document time

Historical documents must never change because a product price changes later.
Issued invoices are immutable.
Corrections happen through void-and-reissue.

Pending cheques do not reduce receivables.
Cleared payments reduce receivables.
Bounced cheques restore the outstanding balance while preserving history.

---

## Architecture rules

Backend:

- Node.js
- TypeScript
- SQLite
- explicit SQL
- no ORM
- JSON HTTP API

Frontend:

- React
- Vite
- Tailwind
- TanStack Query

Domain layer:

- pure TypeScript
- no database
- no HTTP
- no filesystem
- highly testable

Services:

- own transactions
- enforce business rules

Database:

- foreign keys ON
- WAL
- migrations
- append-only ledgers where specified

---

## Development rules

NEVER:

- invent business rules without asking
- silently change the approved architecture
- delete historical financial or stock records
- use floating point for money
- put business logic in React components
- bypass services to write stock
- modify issued invoices
- modify historical prices
- build production features before their underlying business rule is clear
- create unnecessary abstractions
- add dependencies without a reason

ALWAYS:

- inspect existing code before changing it
- read the relevant skill before working in that area
- write tests for business rules
- prefer small vertical slices
- run relevant tests after changes
- explain failures instead of hiding them
- update documentation when a business rule changes
- record important architectural decisions in DECISIONS.md

---

## Before coding

For any task larger than approximately one file:

1. Inspect relevant files.
2. Identify the smallest correct implementation.
3. State the implementation plan in 3-7 bullets.
4. Wait for approval if the task changes business rules or schema.
5. Otherwise implement.
6. Test.
7. Report only what changed and test results.

Never spend a large context window explaining code that could simply be
inspected or tested.

---

## Token efficiency

Do not repeatedly restate the entire project specification.
Read only the documentation relevant to the current task.

Prefer:

1. inspect
2. plan
3. implement
4. test
5. verify
6. summarize

Do not generate large amounts of commentary.
Do not rewrite files unnecessarily.

Before creating a new abstraction, check whether an existing abstraction
already solves the problem.

---

## Definition of done

A feature is NOT complete merely because the UI works.

A feature is complete when:

- business rules are explicit
- domain logic is tested
- database constraints are correct
- service transaction behavior is tested
- API validation exists
- UI works
- relevant tests pass
- documentation is updated
- no known integrity issue remains

For financial or stock functionality, assume correctness is more important
than speed of implementation.

---

## Current development phase

We are currently in:

**PHASE 0 — project setup and architecture validation.**

Do NOT implement production, payroll, raw-material inventory, advanced
accounting, tax engine, mobile applications, multi-warehouse support,
worker management, or other deferred features unless explicitly requested.

Do not start coding the application until the owner has approved the
remaining blocking business decisions.

---

## Build-environment constraint (read before proposing dependencies)

The Claude build sandbox **cannot install packages** — npmjs.org and PyPI
both return 403. This does not restrict what the factory deploys; it
restricts what Claude can compile and test.

Consequence, agreed with the owner:

- **Backend uses Node 22 built-ins only** (`node:sqlite`, `node:http`,
  `node:test`, `node:crypto`). Zero dependencies. Claude writes AND runs
  every money/stock/invoice test before the owner sees it.
- **Frontend uses React + Vite + Tailwind + TanStack Query**, installed by
  the owner. Claude cannot run it; UI defects surface on screen.

If a backend dependency ever becomes genuinely necessary, say so and name
it. Do not quietly substitute a weaker tool to fit the sandbox.

---

## Session start

```
Read CLAUDE.md and TODO.md.
Continue the current task.
Do not re-explain the entire project.
```
