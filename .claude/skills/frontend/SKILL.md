---
name: frontend
description: Use when developing or modifying the React user interface, Vite configuration, Tailwind styling, TanStack Query data fetching, matrix pivot entry grids, or invoice print layouts.
---

# Frontend Skill

Use when working on the `web/` application or user interface components.

## Technology Stack

- **React 19** with TypeScript
- **Vite** build tooling and dev server (proxies `/api` to Node backend)
- **Tailwind CSS** for clean, compact utility styling
- **TanStack React Query** for server state management, caching, and mutation tracking
- **Print CSS** for A4/A5 commercial bills and packing slips

## Core UX & Design Principles

1. **Factory-First Efficiency (Garment UX)**:
   - Operators work fast and enter large matrix orders (Colour × Size).
   - Never force the user to open 50 separate product forms or line items.
   - Use tabular numbers (`font-variant-numeric: tabular-nums`) for currency and quantity alignment.
   - Distinct, accessible status indicators for stock availability (Green: Available, Amber: Warning/Within 25% min, Red: Out of stock / Under min).

2. **No Business Logic in React Components**:
   - The frontend is a presentation and input layer.
   - Price calculation, stock reservation rules, allocation planning, and receivable balances are computed by the backend API.
   - Display server-provided figures faithfully.

3. **Matrix Pivot Entry Grid**:
   - Display products with rows = Colours and columns = Sizes (ordered by `sort_order`: S, M, L, XL, 2XL).
   - Cells display on-hand and available quantities, with inline quantity inputs for order creation.
   - Immediate feedback on shortages before order confirmation.

4. **Printed Documents**:
   - Invoices and packing lists must render cleanly on paper (A4 / A5).
   - Hide UI chrome, navigation buttons, and form inputs during `@media print`.
   - Explicit company header, customer details, itemized table, total in words/figures, and AD date format (`24 Aug 2026`).

5. **Type Sharing**:
   - `web/src/api.ts` provides strongly-typed fetch functions matching backend route contracts.
