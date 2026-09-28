# Screenshot recipe

This is the capture list that makes the GitHub landing page look like a real product, not a README with badges. Take them **after** `npm run seed:demo` plus a short scripted walkthrough so every screen has numbers, colours, and a story.

Output folder: `docs/assets/`
Format: **PNG**, sRGB
Window: **1440 × 900** (or 1680 × 1050), 100% zoom, browser chrome **hidden** (F11, or a dedicated profile with bookmarks bar off)
Theme: the app is light content + slate sidebar. Do not invert it.
Cursor: hidden. No personal desktop, no other tabs, no “localhost” in a shot you will also use as the social preview if you can crop it out.

Name files **exactly** as below. The README references these paths.

---

## Before you click

1. Seed demo data (`npm run seed:demo`) so the matrix is not a wall of zeros.
2. Walk this 8-minute story **once**, then capture. Empty screenshots kill repos.

Scripted story (do this in order):

1. Confirm a demo order that creates a visible shortage on one colour/size.
2. Dispatch a partial delivery from another confirmed order.
3. Issue an invoice with a small discount and a real reason (`"wholesale 10 pcs"`).
4. Record a **cheque** (pending) against that invoice — receivables must **not** drop.
5. Record a **cash** payment against a different invoice — receivables **do** drop.
6. Adjust one variant down so the matrix shows a red cell.
7. Add a cutting-stock quantity and transfer a few pieces to finished.
8. Add one expense and one employee earning line.

Now the dashboard, matrix, cheque drawer, and statements all have something true to show.

---

## The 12 shots

### 01 — `01-dashboard.png`  (hero #1)

**Screen:** Dashboard.
**Must show:**
- Title “Today's Factory Operations Briefing”
- Four KPI cards: Active Orders, Stock Alerts (red/amber badges), Deliveries, Cheques in Drawer
- Outstanding receivables with at least one currency
- Recent audit stream on the right if it has rows

**Do not show:** a loading pulse, an error banner, a half-empty first-run.

**Crop:** full content area including the slate sidebar (“Garment Factory OS”). The sidebar is part of the brand.

---

### 02 — `02-catalogue.png`

**Screen:** Catalogue → Products (or Variants & Stock Mins if the grid is richer).
**Must show:** Bomber / Puffer / Denim, default prices in NPR, at least one variant override if you set XL higher.
**Why:** proves this is a garment SKU system, not a generic item list.

---

### 03 — `03-stock-matrix.png`  (hero #2)

**Screen:** Stock Matrix, one product selected.
**Must show:**
- Colour rows × size columns (S M L XL in that order, never alphabetical)
- At least one **red** cell, one **amber**, one healthy
- On-hand numbers, not dashes everywhere

**This is the signature screenshot.** If you only take three, take 01, 03, and 07.

---

### 04 — `04-order-entry.png`

**Screen:** Orders → Create, with a product matrix open.
**Must show:** customer selected, quantity cells filled for a few colour/size pairs, live available stock hints if the UI shows them, currency matching the customer.

---

### 05 — `05-orders-list.png`

**Screen:** Orders list.
**Must show:** document numbers (`ORD-2026-00001`), statuses (`confirmed` / `partially_delivered` / `draft`), a shortage badge on at least one row.

---

### 06 — `06-delivery-dispatch.png`

**Screen:** Deliveries, either the list with a dispatched row expanded or the dispatch modal mid-flow.
**Must show:** `DEL-2026-…`, draft vs dispatched, quantities that are a subset of the order (partial delivery is more interesting than a full one).

---

### 07 — `07-invoice-print.png`  (hero #3)

**Screen:** Invoice print / preview (the print stylesheet).
**Must show:**
- `INV-YYYY-NNNNN`
- Customer name
- Frozen line descriptions (`Bomber Jacket / Black / L`)
- Currency, totals, optional discount + reason
- AD date formatted like `23 Aug 2026`

Print preview (Chrome → Print → Save as PDF → screenshot the page, or the in-app print view) looks more “product” than the edit form.

---

### 08 — `08-payments-cheques.png`

**Screen:** Payments → Cheques (or Receipts with a pending cheque visible).
**Must show:** a **pending** cheque with amount, cheque number, date. Caption-worthy because pending money is the whole point of D028.

---

### 09 — `09-customer-statement.png`

**Screen:** Payments → Statements, one customer selected.
**Must show:** invoices, receipts, outstanding **per currency**. If you have NPR and INR on the same customer, that shot is gold — it proves D029.

---

### 10 — `10-cutting-stock.png`

**Screen:** Cutting Stock matrix.
**Must show:** a colour × size grid that is *not* the finished-goods matrix, plus the add / transfer action if a modal looks clean.

Caption later: “Cutting does not increase finished stock. Transfer does.”

---

### 11 — `11-expenses.png`

**Screen:** Expenses / purchases ledger.
**Must show:** at least one expense and one purchase row, document numbers, payee/supplier.

---

### 12 — `12-employee-earnings.png`

**Screen:** Employee Earnings, monthly view.
**Must show:** Nepali month labels (Baisakh…Chaitra), at least one tailor, amounts in NPR.

---

## Social preview (the image GitHub shows in Slack, Twitter, the repo card)

**File:** `docs/assets/social-preview.png`
**Size:** **1280 × 640 px** exactly (GitHub’s Open Graph).
**Content:** a designed card, not a raw screenshot.

Two ways:

1. **Use the SVG already in this repo** (`docs/assets/social-preview.svg`). Open it in a browser at 1280×640 and screenshot, or export PNG from Figma/Inkscape.
2. **Compose three real UI crops** (dashboard KPIs + stock matrix + invoice header) on a slate-900 canvas with the title:

   ```
   GARMENT FACTORY OS
   Ledgers for jackets. Not forms for tables.
   Node 22 · SQLite STRICT · 0 backend deps
   ```

Upload this PNG in GitHub: **Settings → General → Social preview**.
The README `<img>` can keep the SVG; the *repository* social preview must be a PNG.

---

## Optional but high-leverage extras

| File | What |
|---|---|
| `docs/assets/architecture.png` | Export the mermaid / ASCII diagram as a clean PNG if you want it in posts |
| `docs/assets/gif-order-to-invoice.gif` | 12–18s silent GIF: confirm order → dispatch → issue invoice. Keep under 5 MB |
| `docs/assets/favicon.png` | The blue “G” mark from the sidebar, 512×512, for the repo avatar |

A GIF of the happy path outperforms five extra stills.

---

## Caption copy (paste under images in the README or in a blog)

**Dashboard**
> Morning briefing. Shortages, red-band SKUs, packing lists, and cheques that have not cleared — on one screen, from live ledgers.

**Stock matrix**
> Finished garments only. Colour × size. On-hand is the sum of an append-only movement ledger. Red means at or below the variant’s own minimum.

**Order entry**
> Confirming an order reserves stock. It does not take it off the shelf. Delivery is the physical event.

**Invoice**
> Issued means immutable. The line description is frozen at bill time, so renaming a product later cannot rewrite history.

**Cheques**
> A cheque in the drawer is a promise. Receivables do not move until the bank clears it. A bounce restores the bill and keeps the row.

---

## What not to photograph

- Empty states (“No outstanding bills on file”) as the hero
- Browser developer tools, Windows taskbar, wallpaper
- Real customer phones, real cheque numbers from production, real passwords
- The SQLite file, `.env`, or a terminal dump of `GARMENT_OWNER_PASSWORD`
- Test failure red (unless you are writing a testing blog post)
- The interim `console/index.html` — the React UI is the product

---

## Capture checklist

- [ ] Window 1440×900, 100% zoom, no bookmarks bar
- [ ] Demo data + scripted story run once
- [ ] 01 dashboard has numbers in every KPI
- [ ] 03 matrix has red, amber, and green
- [ ] 07 invoice shows a real `INV-` number and frozen descriptions
- [ ] 08 shows a *pending* cheque, not only cash
- [ ] 09 statement is per-currency
- [ ] PNG files named exactly as in this document
- [ ] `social-preview.png` is 1280×640 and uploaded in repo Settings
- [ ] No live factory data
