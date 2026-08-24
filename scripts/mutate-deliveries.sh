#!/bin/bash
# Mutation test the delivery stock and status rules.
#
# Each mutation breaks one rule on purpose. A mutation that survives means no
# test is actually checking that rule, however green the suite looks.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DOM=src/domain/deliveries.ts
SVC=src/services/deliveries.ts
cp $DOM /tmp/dom.orig
cp $SVC /tmp/svc.orig
restore() { cp /tmp/dom.orig $DOM; cp /tmp/svc.orig $SVC; }
trap restore EXIT

run() {
  local name="$1"
  local out
  out=$(node --test tests/unit/deliveries.test.ts tests/integration/deliveries.test.ts 2>&1 | grep -E '^# (pass|fail)' | tr '\n' ' ')
  if echo "$out" | grep -q '# fail 0'; then
    echo "  SURVIVED  $name   ($out)"
  else
    echo "  caught    $name   ($out)"
  fi
  restore
}

echo "Mutating the delivery rules:"

# 1. The shelf guard: let a delivery ship pieces that do not exist.
perl -0pi -e 's/if \(qty > request\.onHand\) \{/if (false) {/' $DOM
run "domain: drop the 'never more than is on the shelf' guard"

# 2. Reinstate the old bug: an over-reserved variant refuses every delivery.
perl -0pi -e 's/if \(fromFreeStock > Math\.max\(0, freeStock\)\) \{/if (fromFreeStock > freeStock) {/' $DOM
run "domain: unclamp free stock, so over-reserved variants freeze"

# 3. Let a delivery dip into another order's reservation.
perl -0pi -e 's/if \(fromFreeStock > Math\.max\(0, freeStock\)\) \{/if (false) {/' $DOM
run "domain: drop the 'not reserved elsewhere' guard"

# 4. Over-deliver: ignore what the order still expects.
perl -0pi -e 's/if \(qty > outstanding\) \{/if (false) {/' $DOM
run "domain: drop the 'never more than ordered' guard"

# 5. Write the movement as an adjustment instead of a delivery.
perl -0pi -e "s/movementType: 'delivery_out',/movementType: 'adjustment_out',/" $SVC
run "service: mislabel the outward movement"

# 6. Move stock but do not record which line moved it.
perl -0pi -e 's/    setMovement\.run\(movementId, Number\(row\.id\)\);/    void movementId;/' $SVC
run "service: leave delivery_lines.movement_id unset"

# 7. Ship the goods but keep the reservation.
perl -0pi -e 's/  consumeAllocations\(tx, plans\);/  \/\/ mutated/' $SVC
run "service: never consume the reservation"

# 8. Forget to re-reserve the remainder after a partial delivery.
perl -0pi -e "s/const allocation = nextStatus === 'partially_delivered' \? allocateOrder\(tx, order\.id, userId\) : null;/const allocation = null;/" $SVC
run "service: do not re-reserve the remainder"

# 9. Leave the order where it was.
perl -0pi -e "s/  tx\.db\.prepare\('UPDATE orders SET status = \? WHERE id = \?'\)\.run\(nextStatus, order\.id\);/  \/\/ mutated/" $SVC
run "service: never advance the order status"

# 10. Call every delivery a full one.
perl -0pi -e 's/const nextStatus = fulfilmentStatus\(delivered\.lines\);/const nextStatus = "delivered" as const;/' $SVC
run "service: claim the order is delivered regardless"

# 11. Date the stock movement today rather than on the delivery date.
perl -0pi -e 's/      occurredAt: header\.delivered_at,/      occurredAt: today(),/' $SVC
run "service: date the movement wrong"

# 12. Dispatch a draft twice.
perl -0pi -e "s/  if \(header\.status !== 'draft'\) \{/  if (false) {/" $SVC
run "service: allow a delivery to be dispatched twice"

# 13. Trust the draft instead of re-checking live stock at dispatch.
perl -0pi -e 's/  const plans = planFromOrder\(\n    tx,\n    order,\n    lineRows\.map\(\(row\) => \(\{ orderLineId: Number\(row\.order_line_id\), qty: Number\(row\.qty\) \}\)\),\n  \);/  const plans = lineRows.map((row) => ({ orderLineId: Number(row.order_line_id), variantId: Number(row.variant_id), qty: Number(row.qty), fromAllocation: 0, fromFreeStock: 0, qtyRemaining: 0 }));/' $SVC
run "service: dispatch without re-checking stock"

# 14. Let a cancelled or draft order be delivered.
perl -0pi -e "s/  if \(order\.status !== 'confirmed' && order\.status !== 'partially_delivered'\) \{/  if (false) {/" $SVC
run "service: deliver against any order status"

# 15. Reverse the ledger when a dispatched delivery is cancelled.
perl -0pi -e "s/  if \(header\.status === 'dispatched'\) \{/  if (false) {/" $SVC
run "service: allow a dispatched delivery to be cancelled"
