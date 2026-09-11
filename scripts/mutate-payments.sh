#!/bin/bash
# Mutation test the payment money rules.
#
# Each mutation breaks one rule on purpose. A mutation that SURVIVES means no
# test is actually checking that rule, however green the suite looks. For
# payments the rules being probed are the ones that decide what a customer
# owes, so a survivor here is a defect in the test suite, not a curiosity.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DOM=src/domain/payments.ts
SVC=src/services/payments.ts
cp $DOM /tmp/pay-dom.orig
cp $SVC /tmp/pay-svc.orig
restore() { cp /tmp/pay-dom.orig $DOM; cp /tmp/pay-svc.orig $SVC; }
trap restore EXIT

run() {
  local name="$1"
  local out
  out=$(node --test tests/unit/payments.test.ts tests/integration/payments.test.ts 2>&1 | grep -E '^# (pass|fail)' | tr '\n' ' ')
  if echo "$out" | grep -q '# fail 0'; then
    echo "  SURVIVED  $name   ($out)"
  else
    echo "  caught    $name   ($out)"
  fi
  restore
}

echo "Mutating the payment rules:"

# ------------------------------------------- what counts as money (the rule)

# 1. A cheque in the drawer starts settling bills.
perl -0pi -e "s/            WHERE pa\.invoice_id = i\.id AND pp\.status = 'cleared'\)/            WHERE pa.invoice_id = i.id AND pp.status IN ('cleared', 'pending'))/" $SVC
run "service: a pending cheque reduces what is owed"

# 2. A bounced cheque keeps on paying.
perl -0pi -e "s/            WHERE pa\.invoice_id = i\.id AND pp\.status = 'cleared'\)/            WHERE pa.invoice_id = i.id AND pp.status <> 'draft')/" $SVC
run "service: a bounced or cancelled payment still settles"

# 3. Money applied to a voided bill stays swallowed by it.
perl -0pi -e "s/            WHERE pa\.payment_id = p\.id AND ii\.status <> 'void'\)/            WHERE pa.payment_id = p.id)/" $SVC
run "service: money applied to a voided invoice never comes back"

# 4. A pending cheque stops reserving the bill, so two promises can exceed it.
perl -0pi -e "s/              WHERE pa\.invoice_id = \? AND p\.status IN \('pending', 'cleared'\)/              WHERE pa.invoice_id = ? AND p.status = 'cleared'/" $SVC
run "service: a pending cheque does not reserve the invoice"

# 5. Cash arrives as a promise instead of money.
perl -0pi -e "s/  return method === 'cheque' \? 'pending' : 'cleared';/  return 'pending';/" $DOM
run "domain: cash is not money on arrival"

# 6. A cheque is treated as money the moment it is taken.
perl -0pi -e "s/  return method === 'cheque' \? 'pending' : 'cleared';/  return 'cleared';/" $DOM
run "domain: a cheque is money on arrival"

# 7. The one-line statement of the rule stops being true.
perl -0pi -e "s/  return status === 'cleared';/  return status === 'cleared' || status === 'pending';/" $DOM
run "domain: settlesReceivables counts pending cheques"

# 8. A pending cheque is dated as though the bank had already paid it.
perl -0pi -e "s/      status === 'cleared' \? receivedAt : null,/      receivedAt,/" $SVC
run "service: stamp a clearing date on a cheque the bank has not seen"

# 9. A pending cheque becomes spendable advance.
perl -0pi -e "s/    unappliedMinor: status === 'cleared' \? amountMinor - appliedMinor : 0,/    unappliedMinor: amountMinor - appliedMinor,/" $SVC
run "service: a pending cheque counts as an advance"

# 10. A voided bill is still owed.
perl -0pi -e "s/        WHERE i\.customer_id = \? AND i\.status = 'issued'/        WHERE i.customer_id = ? AND i.status <> 'draft'/" $SVC
run "service: a voided invoice is still owed in the balance"

# 11. A draft bill is owed.
perl -0pi -e "s/  const clauses: string\[\] = \[\`i\.status = 'issued'\`\];/  const clauses: string[] = [\`i.status IN ('issued', 'draft')\`];/" $SVC
run "service: a draft invoice appears as a receivable"

# 12. A pending cheque counts as an advance in the statement.
perl -0pi -e "s/              COALESCE\(SUM\(CASE WHEN p\.status = 'cleared'/              COALESCE(SUM(CASE WHEN p.status IN ('cleared', 'pending')/" $SVC
run "service: statement treats a pending cheque as an advance"

# 13. A bounced cheque stays in the pending-cheque figure.
perl -0pi -e "s/              COALESCE\(SUM\(CASE WHEN p\.status = 'pending'/              COALESCE(SUM(CASE WHEN p.status IN ('pending', 'bounced')/" $SVC
run "service: a bounced cheque is still reported as pending"

# ------------------------------------------------------------- the arithmetic

# 14. Overpay a bill, driving a balance negative.
perl -0pi -e "s/    if \(amountMinor > outstandingMinor\) \{/    if (false) {/" $DOM
run "domain: allow a bill to be paid more than it owes"

# 15. Give away money the payment does not hold.
perl -0pi -e "s/  if \(appliedMinor > availableMinor\) \{/  if (false) {/" $DOM
run "domain: allow a payment to apply more than it holds"

# 16. Net the advance off the balance, making the owner's choice invisibly.
perl -0pi -e "s/    outstandingMinor: invoicedMinor - settledMinor,/    outstandingMinor: invoicedMinor - settledMinor - advanceMinor,/" $DOM
run "domain: net an unapplied advance off the balance"

# 17. Stop noticing an impossible balance.
perl -0pi -e "s/  if \(settledMinor > invoicedMinor\) \{/  if (false) {/" $DOM
run "domain: silently accept settled greater than invoiced"

# 18. Apply the same bill twice in one instruction.
perl -0pi -e "s/    if \(seen\.has\(request\.invoiceId\)\) \{/    if (false) {/" $DOM
run "domain: allow one invoice twice in one allocation"

# 19. Rupees settle a dollar bill (D029).
perl -0pi -e "s/    if \(request\.invoiceCurrency !== payment\.currency\) \{/    if (false) {/" $DOM
run "domain: allow a payment to settle a bill in another currency"

# 20. Pay a voided bill.
perl -0pi -e "s/    if \(request\.invoiceStatus === 'void'\) \{/    if (false) {/" $DOM
run "domain: allow payment against a voided invoice"

# 21. Pay a bill the customer has never been given.
perl -0pi -e "s/    if \(request\.invoiceStatus !== 'issued'\) \{/    if (false) {/" $DOM
run "domain: allow payment against a draft invoice"

# 22. Pay someone else's bill.
perl -0pi -e "s/    if \(Number\(invoice\.customer_id\) !== payment\.customerId\) \{/    if (false) {/" $SVC
run "service: allow a payment to settle another customer's invoice"

# 23. Quietly top up an allocation that already exists.
perl -0pi -e "s/    if \(Number\(invoice\.this_payment_minor\) > 0\) \{/    if (false) {/" $SVC
run "service: allow a second allocation from one payment to one invoice"

# --------------------------------------------------------------- lifecycle

# 24. Resurrect a bounced cheque.
perl -0pi -e "s/  bounced: \[\],/  bounced: ['cleared'],/" $DOM
run "domain: allow a bounced cheque to clear"

# 25. Take away D028: a cleared cheque can no longer be returned.
perl -0pi -e "s/  cleared: \['bounced', 'cancelled'\],/  cleared: ['cancelled'],/" $DOM
run "domain: refuse to let a cleared cheque bounce"

# 26. Resurrect a cancelled receipt.
perl -0pi -e "s/  cancelled: \[\],/  cancelled: ['cleared'],/" $DOM
run "domain: allow a cancelled payment to clear"

# 27. Cash can pass through a bank clearing.
perl -0pi -e "s/  if \(method !== 'cheque'\) \{/  if (false) {/" $DOM
run "domain: allow cash to clear or bounce"

# 28. A cheque clears before it was written.
perl -0pi -e "s/  if \(chequeDate !== null && parseDate\(clearedOn, 'clearedOn'\) < parseDate\(chequeDate, 'chequeDate'\)\) \{/  if (false) {/" $DOM
run "domain: allow a cheque to clear before its own date"

# 29. Money leaves the books unexplained.
perl -0pi -e "s/  if \(typeof value !== 'string' \|\| value\.trim\(\)\.length === 0\) \{/  if (false) {/" $DOM
run "domain: accept a blank bounce or cancellation reason"

# 30. Apply a receipt that is not money at all.
perl -0pi -e "s/  if \(payment\.status === 'bounced' \|\| payment\.status === 'cancelled'\) \{/  if (false) {/" $SVC
run "service: allow a bounced or cancelled payment to be applied"

# ------------------------------------------------- history that must survive

# 31. Delete the allocations on a bounce instead of letting them stop counting.
perl -0pi -e "s/  tx\.db\n    \.prepare\(\`UPDATE payments SET status = 'bounced'/  tx.db.prepare('DELETE FROM payment_allocations WHERE payment_id = ?').run(paymentId);\n  tx.db\n    .prepare(\`UPDATE payments SET status = 'bounced'/" $SVC
run "service: delete the allocation rows when a cheque bounces"

# 32. Rewrite the day the bank credited the cheque.
perl -0pi -e "s/UPDATE payments SET status = 'bounced', bounced_at = \?, bounce_reason = \? WHERE id = \?/UPDATE payments SET status = 'bounced', bounced_at = ?, bounce_reason = ?, cleared_at = NULL WHERE id = ?/" $SVC
run "service: erase the clearing date on a bounce"

# 33. Number the receipt by today's year rather than the day money arrived.
perl -0pi -e "s/nextDocumentNumber\(tx, 'PAY', documentYear\(receivedAt\)\)/nextDocumentNumber(tx, 'PAY', documentYear(today()))/" $SVC
run "service: number the payment by the wrong year"

# 34. Stop recording that a cheque came back (D013).
perl -0pi -e "s/    action: 'payment_bounced',/    action: 'nothing_happened',/" $SVC
run "service: mislabel the bounce audit row"

# 35. Stop recording that a receipt was cancelled.
perl -0pi -e "s/    action: 'payment_cancelled',/    action: 'nothing_happened',/" $SVC
run "service: mislabel the cancellation audit row"
