#!/bin/bash
# Mutation test the invoice money and immutability rules.
#
# Each mutation breaks one rule on purpose. A mutation that survives means no
# test is actually checking that rule, however green the suite looks.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DOM=src/domain/invoices.ts
SVC=src/services/invoices.ts
cp $DOM /tmp/inv-dom.orig
cp $SVC /tmp/inv-svc.orig
restore() { cp /tmp/inv-dom.orig $DOM; cp /tmp/inv-svc.orig $SVC; }
trap restore EXIT

run() {
  local name="$1"
  local out
  out=$(node --test tests/unit/invoices.test.ts tests/integration/invoices.test.ts 2>&1 | grep -E '^# (pass|fail)' | tr '\n' ' ')
  if echo "$out" | grep -q '# fail 0'; then
    echo "  SURVIVED  $name   ($out)"
  else
    echo "  caught    $name   ($out)"
  fi
  restore
}

echo "Mutating the invoice rules:"

# ------------------------------------------------------------------- the money

# 1. Bill the wrong number of pieces.
perl -0pi -e 's/lineTotalMinor: lineTotalMinor\(unitPriceMinor, qty\),/lineTotalMinor: lineTotalMinor(unitPriceMinor, qty + 1),/' $DOM
run "domain: charge for one piece more than was delivered"

# 2. Add the discount instead of subtracting it.
perl -0pi -e 's/    totalMinor: subtotalMinor - discountMinor,/    totalMinor: subtotalMinor + discountMinor,/' $DOM
run "domain: add the discount to the bill"

# 3. Ignore the discount entirely.
perl -0pi -e 's/    totalMinor: subtotalMinor - discountMinor,/    totalMinor: subtotalMinor,/' $DOM
run "domain: silently drop the discount"

# 4. Let a discount exceed the bill, turning a sale into a debt.
perl -0pi -e 's/  if \(discountMinor > subtotalMinor\) \{/  if (false) {/' $DOM
run "domain: allow a discount larger than the invoice"

# 5. Accept an unexplained discount (D024).
perl -0pi -e "s/  if \(discountMinor > 0 && \(discount\.reason \?\? ''\)\.trim\(\)\.length === 0\) \{/  if (false) {/" $DOM
run "domain: allow a discount with no reason"

# 6. Bill the same delivered goods twice on one invoice.
perl -0pi -e 's/    if \(seen\.has\(request\.deliveryLineId\)\) \{/    if (false) {/' $DOM
run "domain: allow the same delivered line twice on one invoice"

# 7. Accept an empty invoice.
perl -0pi -e 's/  if \(requests\.length === 0\) \{/  if (false) {/' $DOM
run "domain: allow an invoice with no lines"

# 8. Money falling due before the bill exists (D022).
perl -0pi -e "s/  if \(parseDate\(dueDate, 'dueDate'\) < parseDate\(invoiceDate, 'invoiceDate'\)\) \{/  if (false) {/" $DOM
run "domain: allow a due date before the invoice date"

# ------------------------------------------------------------ immutability

# 9. Un-issue an invoice: editing an issued bill with extra steps (D005).
perl -0pi -e "s/  issued: \['void'\],/  issued: ['void', 'draft'],/" $DOM
run "domain: allow an issued invoice back to draft"

# 10. Issue the same invoice twice.
perl -0pi -e "s/  draft: \['issued', 'void'\],\n  issued: \['void'\],/  draft: ['issued', 'void'],\n  issued: ['void', 'issued'],/" $DOM
run "domain: allow an invoice to be issued twice"

# 11. Resurrect a voided invoice.
perl -0pi -e "s/  void: \[\],/  void: ['draft', 'issued'],/" $DOM
run "domain: allow a void invoice to come back"

# 12. Void without saying why.
perl -0pi -e "s/  if \(typeof reason !== 'string' \|\| reason\.trim\(\)\.length === 0\) \{/  if (false) {/" $SVC
run "service: void an invoice with no reason"

# ------------------------------------------------------------- what is billed

# 13. Bill goods that are still in the factory.
perl -0pi -e "s/        WHERE d\.status = 'dispatched'/        WHERE d.status IN ('dispatched', 'draft')/" $SVC
run "service: treat undispatched goods as billable"

# 14. Same again on the explicit-lines path.
perl -0pi -e "s/    if \(row\.delivery_status !== 'dispatched'\) \{/    if (false) {/" $SVC
run "service: bill a named line from an undispatched delivery"

# 15. Let a voided invoice keep blocking, killing void-and-reissue.
perl -0pi -e "s/                 WHERE il\.delivery_line_id = dl\.id AND i\.status <> 'void'/                 WHERE il.delivery_line_id = dl.id/" $SVC
run "service: a voided invoice still blocks re-billing"

# 16. Bill by today's price list instead of the order's snapshot (D005).
perl -0pi -e 's/dl\.qty, ol\.unit_price_minor/dl.qty, coalesce(v.price_minor, p.default_price_minor) AS unit_price_minor/g' $SVC
run "service: charge today's price list, not the order's price"

# 17. Bill ordered quantity rather than delivered quantity.
perl -0pi -e 's/dl\.qty, ol\.unit_price_minor/ol.qty_ordered AS qty, ol.unit_price_minor/g' $SVC
run "service: bill what was ordered, not what was delivered"

# 18. Mix two customers onto one bill.
perl -0pi -e 's/    if \(line\.customerId !== first\.customerId\) \{/    if (false) {/' $SVC
run "service: put two customers on one invoice"

# 19. Mix two currencies onto one bill.
perl -0pi -e 's/    if \(line\.currency !== first\.currency\) \{/    if (false) {/' $SVC
run "service: put two currencies on one invoice"

# 20. Number the invoice by today's year rather than its own date (D017).
perl -0pi -e "s/nextDocumentNumber\(tx, 'INV', documentYear\(invoiceDate\)\)/nextDocumentNumber(tx, 'INV', documentYear(today()))/" $SVC
run "service: number the invoice by the wrong year"

# 21. Freeze nothing: store a live description instead of a snapshot.
perl -0pi -e 's/        line\.descriptionSnapshot,/        String(line.variantId),/' $SVC
run "service: store no readable description snapshot"

# --------------------------------------------------------------- audit trail

# 22. Stop recording who issued the invoice (D013).
perl -0pi -e "s/    action: 'invoice_issued',/    action: 'nothing_happened',/" $SVC
run "service: mislabel the issue audit row"

# 23. Stop recording the void reason.
perl -0pi -e 's/    detail: \{ from: before\.status, to: .void., invoiceNo: before\.invoiceNo, reason: reason\.trim\(\) \},/    detail: undefined,/' $SVC
run "service: void without an audit detail"
