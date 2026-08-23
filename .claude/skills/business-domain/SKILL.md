---
name: business-domain
description: Use this skill whenever changing business rules in the garment factory system — before writing or altering any rule about stock, orders, deliveries, invoices, payments, or production.
---

# Business Domain Skill

Use this skill whenever changing business rules.

Before coding:

1. Identify the business operation.
2. Identify the physical-world event being represented.
3. Identify which records should change.
4. Identify which records must NOT change.
5. Identify accounting/stock consequences.
6. Identify failure cases.
7. Write or update tests for the rule.

Never infer a business rule from generic ERP conventions when the owner
has not explicitly defined it.

When ambiguity exists, stop and ask the owner.

## Recording the outcome

If the answer establishes a new rule, add it to DECISIONS.md marked
CONFIRMED with the date. If you are proposing rather than reporting a
decision, mark it PROPOSED and do not build on it.
