# Garment Factory Management System — Operational Workflows

## 1. Sales & Order Lifecycle

```
Customer Places Order
         │
         ▼
Create Draft Order (POST /api/orders)
  • Select Customer & Currency
  • Enter Matrix Quantities (Product, Colour, Size)
  • Snapshot Unit Prices & Defaults
         │
         ▼
Confirm Order (POST /api/orders/:id/confirm)
  • Computes live stock availability: available = on_hand - active_allocations
  • Reserves available finished stock in stock_allocations
  • Calculates any shortage per variant (triggers production need)
  • Freezes final order pricing & assigns ORD-YYYY-NNNNN
```

---

## 2. Dispatch & Delivery Lifecycle

```
Prepare Delivery (POST /api/deliveries)
  • Choose Order & specify line quantities to dispatch
  • Created in 'draft' status (moves no physical stock)
         │
         ▼
Dispatch Delivery (POST /api/deliveries/:id/dispatch)
  • Validates stock availability on the factory floor
  • Consumes active reservations for the order
  • Emits 'delivery_out' stock movements to stock_movements
  • Assigns DEL-YYYY-NNNNN document number
  • Updates order status (partially_delivered / delivered)
```

---

## 3. Invoicing & Billing Lifecycle

```
Generate Invoice (POST /api/invoices)
  • Select dispatched delivery (or specific delivery lines)
  • Copies snapshot product descriptions & prices
  • Applies optional invoice discount with mandatory explanation
  • Issues invoice (INV-YYYY-NNNNN)
         │
         ▼
Mistake Identified?
  ├── YES: Void Invoice (POST /api/invoices/:id/void)
  │        • Provide mandatory void reason
  │        • Status becomes 'void'
  │        • Goods immediately released for re-invoicing (D025)
  │
  └── NO: Invoice stands as active receivable
```

---

## 4. Payment Receipt & Settlement

```
Receive Money (POST /api/payments)
  • Record amount, currency, method, and date
  • Cash / Bank Transfer -> Born 'cleared'
  • Cheque -> Born 'pending' (PAY-YYYY-NNNNN)
         │
         ▼
Allocate to Invoices (POST /api/payments/:id/apply)
  • Owner explicitly selects which invoices to pay (D026)
  • Excess money remains as unallocated Customer Advance (D027)
         │
         ▼
Cheque Outcome (if Method == 'cheque')
  ├── Bank Cleared: POST /api/payments/:id/clear
  │   • Transitions to 'cleared'
  │   • Reduces customer outstanding receivables
  │
  └── Cheque Bounced: POST /api/payments/:id/bounce
      • Transitions to 'bounced' (with bounce reason)
      • Outstanding receivables are restored automatically
      • Audit & historical payment record is preserved
```

---

## 5. Production Workflow (Slice 2 Roadmap)

```
Order Shortage / Stock Replenishment
                 │
                 ▼
          Cutting Department
     (Emits cut piece records)
                 │
                 ▼
          Sewing Department
    (Assembles garment pieces)
                 │
                 ▼
       Finishing & QC Check
    ├── Pass: Packing Department
    │           │
    │           ▼
    │   Production Receipt Movement
    │   (Increases Finished Stock)
    │
    └── Reject: Rework / Scrap
```
