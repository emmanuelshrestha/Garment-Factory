#!/bin/bash
# Manual smoke test: start the server on a throwaway database and drive the
# sales flow the way the console does, then check the ledger.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB=/tmp/garment-smoke/garment.db
PORT=${PORT:-4211}
B="localhost:$PORT"

rm -rf /tmp/garment-smoke && mkdir -p /tmp/garment-smoke
cd "$ROOT"
GARMENT_DB=$DB node scripts/seed.ts --demo >/dev/null 2>&1
GARMENT_DB=$DB GARMENT_PORT=$PORT node src/main.ts >/tmp/garment-smoke/server.log 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT

for _ in $(seq 1 40); do
  curl -sf $B/api/health >/dev/null && break
  sleep 0.25
done

j() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);$1})"; }

echo "== console page"
curl -s -o /tmp/garment-smoke/page.html -w "  status %{http_code}  type %{content_type}  bytes %{size_download}\n" $B/
echo "== traversal refused"
curl -s -o /dev/null -w "  /%2e%2e/package.json -> %{http_code}\n" $B/%2e%2e/package.json

echo "== stock for product 1 (available of on hand, with band)"
curl -s "$B/api/stock?productId=1" | j "console.log(j.stock.slice(0,6).map(s=>\`  \${s.sku} \${s.available}/\${s.onHand} \${s.band}\`).join('\n'))"

echo "== order: 30 of variant 3, 5 of variant 1"
curl -s -X POST $B/api/orders -H 'content-type: application/json' \
  -d '{"customerId":1,"requiredDate":"2026-09-15","lines":[{"variantId":3,"qtyOrdered":30},{"variantId":1,"qtyOrdered":5}]}' \
  | j "console.log('  ',j.order.orderNo,j.order.status,'total',j.order.totalMinor)"

echo "== confirm"
curl -s -X POST $B/api/orders/1/confirm \
  | j "console.log('   status',j.order.status,'shortage',j.allocation.totalShortageQty);console.log(j.order.lines.map(l=>\`   \${l.sku} ordered \${l.qtyOrdered} reserved \${l.qtyAllocated} short \${l.shortageQty}\`).join('\n'))"

echo "== variant 3 after confirm (expect on hand unchanged, movements 1)"
curl -s $B/api/stock/3 | j "console.log('  ',JSON.stringify(j.summary),'movements',j.movements.length)"

echo "== shortages"
curl -s $B/api/shortages | j "console.log(j.shortages.map(s=>\`   \${s.sku} short \${s.shortageQty} across \${s.orderCount} order(s)\`).join('\n'))"

echo "== refusals"
curl -s -o /dev/null -w "  fractional qty        -> %{http_code}\n" -X POST $B/api/orders -H 'content-type: application/json' -d '{"customerId":1,"lines":[{"variantId":3,"qtyOrdered":1.5}]}'
curl -s -o /dev/null -w "  confirm twice         -> %{http_code}\n" -X POST $B/api/orders/1/confirm
curl -s -o /dev/null -w "  edit confirmed order  -> %{http_code}\n" -X POST $B/api/orders/1/lines -H 'content-type: application/json' -d '{"variantId":5,"qtyOrdered":1}'
curl -s -o /dev/null -w "  set stock directly    -> %{http_code}\n" -X PUT $B/api/stock/3 -H 'content-type: application/json' -d '{"qty":999}'
curl -s -o /dev/null -w "  unknown order         -> %{http_code}\n" $B/api/orders/9999
curl -s -o /dev/null -w "  wrong verb            -> %{http_code}\n" -X DELETE $B/api/customers

echo "== cancel, then variant 3 (expect reserved 0, movements still 1)"
curl -s -X POST $B/api/orders/1/cancel -H 'content-type: application/json' -d '{"reason":"customer withdrew"}' \
  | j "console.log('   status',j.order.status,'| notes:',j.order.notes)"
curl -s $B/api/stock/3 | j "console.log('  ',JSON.stringify(j.summary),'movements',j.movements.length)"

# ------------------------------------------------------------------ delivery
# Variant 5 has 60 pieces in the demo seed and nothing reserved against it,
# so this half of the script is about stock actually leaving the building.

echo "== order 2: 20 of variant 5, confirmed"
curl -s -X POST $B/api/orders -H 'content-type: application/json' \
  -d '{"customerId":1,"lines":[{"variantId":5,"qtyOrdered":20}]}' \
  | j "console.log('  ',j.order.orderNo,j.order.status,'line',j.order.lines[0].id)"
curl -s -X POST $B/api/orders/2/confirm \
  | j "console.log('   status',j.order.status,'reserved',j.order.lines[0].qtyAllocated)"

echo "== draft a delivery of 8 (expect nothing to move)"
curl -s -X POST $B/api/deliveries -H 'content-type: application/json' \
  -d '{"orderId":2,"deliveredAt":"2026-08-20","lines":[{"orderLineId":3,"qty":8}]}' \
  | j "console.log('  ',j.delivery.deliveryNo,j.delivery.status,'movement',j.delivery.lines[0].movementId)"
curl -s $B/api/stock/5 | j "console.log('  ',JSON.stringify(j.summary),'movements',j.movements.length)"

echo "== dispatch it (expect on hand 52, order partially delivered)"
curl -s -X POST $B/api/deliveries/1/dispatch \
  | j "console.log('  ',j.delivery.deliveryNo,j.delivery.status,'| order',j.order.status,'| shortage after re-reserving',j.allocation?j.allocation.totalShortageQty:'n/a')"
curl -s $B/api/stock/5 | j "console.log('  ',JSON.stringify(j.summary),'movements',j.movements.length)"

echo "== delivery refusals"
curl -s -o /dev/null -w "  more than ordered     -> %{http_code}\n" -X POST "$B/api/deliveries?dispatch=true" -H 'content-type: application/json' -d '{"orderId":2,"lines":[{"orderLineId":3,"qty":13}]}'
curl -s -o /dev/null -w "  cancel a dispatched   -> %{http_code}\n" -X POST $B/api/deliveries/1/cancel -H 'content-type: application/json' -d '{"reason":"wrong colour"}'
curl -s -o /dev/null -w "  cancel a cancelled o. -> %{http_code}\n" -X POST "$B/api/deliveries?dispatch=true" -H 'content-type: application/json' -d '{"orderId":1,"lines":[{"orderLineId":1,"qty":1}]}'

echo "== deliver the remaining 12 in one step (expect on hand 40, delivered)"
curl -s -X POST "$B/api/deliveries?dispatch=true" -H 'content-type: application/json' \
  -d '{"orderId":2,"lines":[{"orderLineId":3,"qty":12}]}' \
  | j "console.log('  ',j.delivery.deliveryNo,j.delivery.status,'| order',j.order.status,'| reservation',j.allocation)"
curl -s $B/api/stock/5 | j "console.log('  ',JSON.stringify(j.summary),'movements',j.movements.length)"

# DEL-2026-00001 is deliberately back-dated to the 20th: the movement must
# carry the day the goods left, not the day it was typed in (D021). That is
# why it sorts before the opening balance the demo seed dated today.
echo "== the ledger for variant 5, as the API returns it (oldest first)"
curl -s $B/api/stock/5 | j "console.log(j.movements.map(m=>\`   \${m.occurredAt} \${m.movementType} \${m.qtyDelta>0?'+':''}\${m.qtyDelta} \${m.reason||''}\`).join('\n'))"

echo "== deliveries for order 2"
curl -s "$B/api/deliveries?orderId=2" | j "console.log(j.deliveries.map(d=>\`   \${d.deliveryNo} \${d.deliveredAt} \${d.status} \${d.totalQty} pcs\`).join('\n'))"

# ------------------------------------------------------------------- invoice
# Two dispatched deliveries are sitting unbilled: DEL-…0001 (8 pcs, back-dated)
# and DEL-…0002 (12 pcs). Billing never looks at stock or at the order — only
# at what actually left the building.

echo "== delivered but not yet billed"
curl -s $B/api/billable | j "console.log(j.lines.map(l=>\`   \${l.deliveryNo} \${l.sku} \${l.qty} pcs at \${l.unitPriceMinor} = \${l.lineTotalMinor} \${l.currency}\`).join('\n'))"

echo "== bill the first delivery and issue it, due in 30 days"
curl -s -X POST "$B/api/invoices?issue=true" -H 'content-type: application/json' \
  -d '{"deliveryId":1,"invoiceDate":"2026-08-24","dueDate":"2026-09-23"}' \
  | j "console.log('  ',j.invoice.invoiceNo,j.invoice.status,'| due',j.invoice.dueDate,'| total',j.invoice.totalMinor,j.invoice.currency)"

echo "== invoice refusals"
curl -s -o /dev/null -w "  bill the same goods again -> %{http_code}\n" -X POST $B/api/invoices -H 'content-type: application/json' -d '{"deliveryId":1}'
curl -s -o /dev/null -w "  issue an issued invoice   -> %{http_code}\n" -X POST $B/api/invoices/1/issue
curl -s -o /dev/null -w "  discount with no reason   -> %{http_code}\n" -X POST $B/api/invoices -H 'content-type: application/json' -d '{"deliveryId":2,"discountMinor":5000}'
curl -s -o /dev/null -w "  discount over the total   -> %{http_code}\n" -X POST $B/api/invoices -H 'content-type: application/json' -d '{"deliveryId":2,"discountMinor":99000000,"discountReason":"far too much"}'
curl -s -o /dev/null -w "  due before the bill date  -> %{http_code}\n" -X POST $B/api/invoices -H 'content-type: application/json' -d '{"deliveryId":2,"invoiceDate":"2026-08-24","dueDate":"2026-08-01"}'
curl -s -o /dev/null -w "  void with no reason       -> %{http_code}\n" -X POST $B/api/invoices/1/void -H 'content-type: application/json' -d '{}'

echo "== bill the second delivery with an explained discount, as a draft"
curl -s -X POST $B/api/invoices -H 'content-type: application/json' \
  -d '{"deliveryId":2,"invoiceDate":"2026-08-24","discountMinor":50000,"discountReason":"agreed for the late shipment"}' \
  | j "console.log('  ',j.invoice.invoiceNo,j.invoice.status,'| subtotal',j.invoice.subtotalMinor,'- discount',j.invoice.discountMinor,'=',j.invoice.totalMinor)"

# D005: the correction path. Void it, and the very same delivered goods become
# billable again — the invoice itself is kept for ever.
echo "== void it, then bill the same goods correctly"
curl -s -X POST $B/api/invoices/2/void -H 'content-type: application/json' -d '{"reason":"discount was not agreed"}' \
  | j "console.log('  ',j.invoice.invoiceNo,j.invoice.status,'| lines kept',j.invoice.lines.length,'| still says',j.invoice.totalMinor)"
curl -s $B/api/billable | j "console.log('   billable again:',j.lines.map(l=>\`\${l.deliveryNo} \${l.qty} pcs\`).join(', '))"
curl -s -X POST "$B/api/invoices?issue=true" -H 'content-type: application/json' \
  -d '{"deliveryId":2,"invoiceDate":"2026-08-24"}' \
  | j "console.log('  ',j.invoice.invoiceNo,j.invoice.status,'| total',j.invoice.totalMinor)"

echo "== every invoice, newest first (nothing is ever deleted)"
curl -s $B/api/invoices | j "console.log(j.invoices.map(i=>\`   \${i.invoiceNo} \${i.invoiceDate} \${i.status} \${i.totalMinor} \${i.currency}\`).join('\n'))"

echo "== a price rise must not touch an issued invoice"
# Raise every product's price, so whichever one the invoice billed is covered.
for pid in $(curl -s $B/api/products | j "console.log(j.products.map(p=>p.id).join(' '))"); do
  curl -s -X POST $B/api/products/$pid/price -H 'content-type: application/json' \
    -d '{"priceMinor":999999,"note":"smoke test rise"}' >/dev/null
done
curl -s $B/api/invoices/1 | j "console.log('   INV-…0001 still charges',j.invoice.lines[0].unitPriceMinor,'a piece for',j.invoice.lines[0].description)"

echo "== the shelf is untouched by any of the billing above"
curl -s $B/api/stock/5 | j "console.log('  ',JSON.stringify(j.summary),'movements',j.movements.length)"

echo "== server log"
sed 's/^/  /' /tmp/garment-smoke/server.log
