# Garment Factory Management System — Business Rules Reference

This document codifies the operational business rules established for the Garment Factory Management System, citing the corresponding decisions in `DECISIONS.md`.

---

## 1. Product Catalogue, Variants & Pricing

1. **Stock Identity (Rule 1, D009)**:
   - A distinct stock-keeping unit is identified uniquely by `(product_id, colour_id, size_id)`.
   - The system supports single-tier Colour × Size matrices.

2. **Hierarchical Pricing (D009)**:
   - A product has a default price (`products.default_price_minor`).
   - An individual variant may optionally specify a price override (`product_variants.price_minor`), allowing larger sizes (e.g. 2XL) to cost more.
   - Price resolution order: Variant override → Product default → Error (unpriced).
   - Order lines snapshot the resolved price at confirmation time. Subsequent price changes never alter existing orders or invoices.

3. **Master Data Deactivation (D013)**:
   - Products, variants, and customers are deactivated (`is_active = 0`), never deleted, preserving historical references.

---

## 2. Inventory & Stock Movements

1. **Finished Stock Definition (Rule 2, 3, 4, D003)**:
   - Stock strictly represents **finished, accepted, packed garments**.
   - Raw material arrival, cutting, sewing, and finishing/rework write NO finished stock movements.
   - Finished stock increases ONLY via `opening_balance`, `production_receipt` (accepted packing), `return_in`, or authorized `adjustment_in`.

2. **Append-Only Stock Ledger (Rule 2, D003, D013)**:
   - `stock_movements` is strictly append-only.
   - On-hand stock is calculated dynamically: `on_hand = SUM(qty_delta)`.
   - Stock may never be driven negative; transactions causing negative stock are rejected.

3. **Reservations vs. Movements (Rule 5, D004, D021)**:
   - Order confirmation creates **stock reservations** in `stock_allocations`, NOT stock movements.
   - Physical on-hand stock remains unchanged during order reservation.
   - Available stock: `available = on_hand - SUM(active_allocations)`.
   - Delivery consumes the reservation and writes an outward movement (`delivery_out`).

4. **Low Stock Alerting Bands (D012, D019)**:
   - Each variant specifies a minimum stock threshold (`min_stock_qty`).
   - **Red Band**: `on_hand <= min_stock_qty` (Critical / Out of Stock).
   - **Amber Band**: `min_stock_qty < on_hand <= min_stock_qty * 1.25` (Low stock warning, 25% threshold).
   - Band calculations use integer arithmetic.

5. **Audited Stock Adjustments (Rule 8, D013)**:
   - Any manual stock adjustment requires an explicit non-empty reason and creates linked `stock_adjustments` and `stock_movements` records atomically.

---

## 3. Orders & Deliveries

1. **Order Lifecyle (D004, D005)**:
   - Order statuses: `draft` → `confirmed` → `partially_delivered` → `delivered` → `closed` (or `cancelled`).
   - Confirmation freezes prices, evaluates live availability, allocates available stock, and records shortage quantities per variant.

2. **Delivery Mechanics (D021)**:
   - Deliveries are two-stage: **Draft** (planning paperwork, moves no stock) and **Dispatch** (physical shipment).
   - At dispatch:
     - The dispatch plan is re-evaluated against live stock.
     - Outward stock movements (`delivery_out`) are generated with the actual delivery date.
     - Allocated reservations are consumed and re-allocated for any remaining unfulfilled order quantities.
   - A delivery line cannot exceed the remaining undelivered quantity on the order.
   - Dispatched deliveries cannot be cancelled (D021, OPEN-7).

---

## 4. Invoicing & Billing

1. **Delivery-Based Invoicing (Rule 13, D010, D023, D025)**:
   - Invoices are generated only from dispatched delivery lines.
   - Default workflow: One invoice per delivery (D023). Multiple deliveries for the same customer may be combined on a single invoice (D010).
   - A delivery line may appear on at most one non-void invoice, enforced by database triggers (D025).

2. **Immutable Invoices (Rule 17, D005, D025)**:
   - Once issued, an invoice cannot be modified.
   - Corrections require voiding the invoice with a mandatory reason (`void_reason`) and re-issuing a new invoice. Voided invoice goods are immediately eligible for re-billing.

3. **Discounts (D024)**:
   - Discounts apply at the invoice level (`discount_minor`).
   - Every discount MUST include an explanatory reason (`discount_reason`).
   - A discount cannot exceed the invoice subtotal.

---

## 5. Payments, Cheques & Receivables

1. **Customer Balance Calculation (Rule 18, 19, D026, D027, D029)**:
   - Customer Outstanding = `Σ (Issued non-void Invoice Totals) - Σ (Cleared Payment Allocations applied to those invoices)`.
   - Balances are maintained strictly per-currency. Cross-currency settlements are prohibited (D029).

2. **Payment Allocation Separation (D026, D027)**:
   - Recording a payment and allocating it to specific invoices are distinct operations.
   - Unallocated cleared payments are tracked as **Customer Advances** (`advanceMinor`) and are never automatically netted against open invoices without explicit owner instruction.

3. **Cheque Lifecycle (Rule 19, 21, D028)**:
   - Cheques are recorded with status `pending` and do NOT reduce receivables.
   - Clearing a cheque transitions its status to `cleared` and satisfies allocated invoice receivables.
   - If a cleared cheque subsequently bounces (`bounced`), the system restores the open receivable balance while preserving full historical payment records and logging the bounce reason.
