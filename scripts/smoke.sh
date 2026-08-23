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

echo "== server log"
sed 's/^/  /' /tmp/garment-smoke/server.log
