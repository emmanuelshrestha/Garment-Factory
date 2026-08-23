---
name: garment-ux
description: Use when building or changing any screen in the garment factory system. This is not a generic ERP — screens must be matrix-first and let the owner see and act in one view.
---

# Garment UX Skill

This system is not a generic ERP. It is shaped around how the owner
actually works. Optimize for a factory owner who wants to see and act in
one screen, not navigate a menu tree.

Never make the owner open 50 products one at a time.

## Inventory: matrix-first

```
+----------------------------------------------------------+
| INVENTORY                                                |
|                                                          |
| Product: [ Jacket 101 v ]   Colour: [ Black v ]          |
|                                                          |
|             S     M     L    XL   2XL                    |
| Black      12    34    28    16     8                    |
| Navy        4    22    31     9     3                    |
| Red         0    15    20     7     2                    |
|                                                          |
| Available  16    71    79    32    13                    |
|                                                          |
| ! Low stock: Red S                                       |
+----------------------------------------------------------+
```

Colour down the rows, size across the columns, in `sizes.sort_order`.

## Order entry: matrix-first with inline availability

```
CUSTOMER
[ Sandeep Jee ]

ORDER

Product        Colour       S     M     L    XL   2XL
-------------------------------------------------------
Jacket 101     Black        10   20    30    15    5
Jacket 102     Navy          5   10    20    10    2

Availability
-------------------------------------------------------
Jacket 101 Black             ok   ok   ok   ok   ok
Jacket 102 Navy              ok   ok   warn ok   warn

[Confirm Order]
```

Shortage must be visible **before** confirming, not discovered after.

## Rules

- The matrix is a presentation-layer pivot over `product_variants`. The
  database stores one row per variant and never a grid.
- No business logic in React components. Availability, shortage, and
  totals are computed by the backend and rendered by the UI.
- AD is the only calendar (D020). Display dates as `23 Aug 2026` so the
  day and month cannot be misread; never `23/08/2026`.
- Money is displayed with an explicit currency; never guess the currency.
- The printed bill has its own print stylesheet and must fit the paper the
  owner already uses.
