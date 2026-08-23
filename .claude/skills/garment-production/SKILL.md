---
name: garment-production
description: Production stages for the garment factory — cutting, sewing, finishing, QC, packing, rework. DO NOT USE until the owner explicitly starts the production slice (Slice 2).
---

# Garment Production Skill

**Do not implement this skill until the production slice is explicitly
started.** Production is Slice 2 (DECISIONS.md D008).

Production stages:

1. Cutting
2. Sewing
3. Finishing
4. QC
5. Packing

Physical business rule:

Cutting creates cut pieces.

Sewing converts cut pieces into sewn garments.

Finishing/QC determines whether garments are accepted or require rework.

Packing acceptance creates finished stock.

Rejected garments may:

- return to sewing
- be rejected/scrapped

Production may originate from:

- customer order shortage
- stock replenishment

## Boundary with inventory

Cutting and sewing produce **no** stock movement. Only packing acceptance
creates a `production_receipt` movement (D003). Scrapped garments never
entered finished stock, so scrapping them is not a stock decrease.
