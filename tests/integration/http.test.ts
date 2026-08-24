/**
 * HTTP layer tests.
 *
 * Two jobs only: prove the whole sales flow works through the API end to end,
 * and prove a refusal arrives as the right status code. Business rules are
 * tested against the services; repeating them here would be duplication.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { postRaw, startTestServer, type TestServer } from '../helpers/testServer.ts';

/** Catalogue + stock built through the API, so the endpoints are exercised too. */
async function seedCatalogue(s: TestServer, onHand: number, priceMinor = 80000) {
  const customer = await s.request('POST', '/api/customers', { code: 'C-1', name: 'Himalaya Traders' });
  assert.equal(customer.status, 201);

  const colour = await s.request('POST', '/api/colours', { name: 'Black' });
  assert.equal(colour.status, 201);

  const sizes = await s.request('GET', '/api/sizes');
  const sizeL = sizes.body.sizes.find((size: any) => size.name === 'L');

  const product = await s.request('POST', '/api/products', {
    code: 'JKT-A',
    name: 'Bomber Jacket',
    defaultPriceMinor: priceMinor,
  });
  assert.equal(product.status, 201);

  const variants = await s.request('POST', `/api/products/${product.body.id}/variants`, {
    colourIds: [colour.body.id],
    sizeIds: [sizeL.id],
    minStockQty: 20,
  });
  assert.equal(variants.status, 201);

  const detail = await s.request('GET', `/api/products/${product.body.id}`);
  const variantId = detail.body.variants[0].id;

  if (onHand > 0) {
    const opening = await s.request('POST', '/api/stock/opening-balance', { variantId, qty: onHand });
    assert.equal(opening.status, 201);
  }

  return { customerId: customer.body.id, productId: product.body.id, variantId };
}

test('health check answers', async () => {
  const s = await startTestServer();
  try {
    const res = await s.request('GET', '/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
  } finally {
    await s.cleanup();
  }
});

test('the sales flow works end to end over HTTP', async () => {
  const s = await startTestServer();
  try {
    const { customerId, variantId } = await seedCatalogue(s, 22);

    // 30 ordered against 22 on hand: a shortage the owner must decide about.
    const created = await s.request('POST', '/api/orders', {
      customerId,
      requiredDate: '2099-01-31',
      lines: [{ variantId, qtyOrdered: 30 }],
    });
    assert.equal(created.status, 201);
    const orderId = created.body.order.id;
    assert.match(created.body.order.orderNo, /^ORD-\d{4}-\d{5}$/);
    assert.equal(created.body.order.status, 'draft');
    assert.equal(created.body.order.lines[0].unitPriceMinor, 80000);
    assert.equal(created.body.order.totalMinor, 2400000);

    const confirmed = await s.request('POST', `/api/orders/${orderId}/confirm`);
    assert.equal(confirmed.status, 200);
    assert.equal(confirmed.body.order.status, 'confirmed');
    assert.equal(confirmed.body.allocation.totalShortageQty, 8);
    assert.equal(confirmed.body.order.lines[0].qtyAllocated, 22);
    assert.equal(confirmed.body.order.lines[0].shortageQty, 8);

    // Reserving is not a stock movement (D004): on hand unchanged, available nil.
    const afterConfirm = await s.request('GET', `/api/stock/${variantId}`);
    assert.equal(afterConfirm.body.summary.onHand, 22);
    assert.equal(afterConfirm.body.summary.allocated, 22);
    assert.equal(afterConfirm.body.summary.available, 0);
    assert.equal(afterConfirm.body.movements.length, 1);

    const shortages = await s.request('GET', '/api/shortages');
    assert.equal(shortages.body.shortages.length, 1);
    assert.equal(shortages.body.shortages[0].shortageQty, 8);

    // Stock arrives; re-running allocation tops up only the outstanding 8.
    const adjustment = await s.request('POST', '/api/stock/adjustments', {
      reasonCode: 'found',
      note: 'ten pieces found in the packing area',
      lines: [{ variantId, qtyDelta: 10 }],
    });
    assert.equal(adjustment.status, 201);

    const topUp = await s.request('POST', `/api/orders/${orderId}/allocate`);
    assert.equal(topUp.status, 200);
    assert.equal(topUp.body.allocation.totalShortageQty, 0);
    assert.equal(topUp.body.order.lines[0].qtyAllocated, 30);

    const afterTopUp = await s.request('GET', `/api/stock/${variantId}`);
    assert.equal(afterTopUp.body.summary.onHand, 32);
    assert.equal(afterTopUp.body.summary.allocated, 30);
    assert.equal(afterTopUp.body.summary.available, 2);

    // Cancelling frees the reservation and leaves the stock ledger alone.
    const cancelled = await s.request('POST', `/api/orders/${orderId}/cancel`, {
      reason: 'customer withdrew',
    });
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.order.status, 'cancelled');
    assert.match(cancelled.body.order.notes, /Cancelled: customer withdrew/);

    const afterCancel = await s.request('GET', `/api/stock/${variantId}`);
    assert.equal(afterCancel.body.summary.onHand, 32);
    assert.equal(afterCancel.body.summary.allocated, 0);
    assert.equal(afterCancel.body.summary.available, 32);
    assert.equal(afterCancel.body.movements.length, 2);
  } finally {
    await s.cleanup();
  }
});

test('a bad request is a 400, a missing thing is a 404, a forbidden thing is a 409', async () => {
  const s = await startTestServer();
  try {
    const { customerId, variantId } = await seedCatalogue(s, 5);

    // 400: a quantity that is not a whole number never reaches the service.
    const fractional = await s.request('POST', '/api/orders', {
      customerId,
      lines: [{ variantId, qtyOrdered: 2.5 }],
    });
    assert.equal(fractional.status, 400);
    assert.equal(fractional.body.error, 'validation_error');
    assert.equal(fractional.body.field, 'lines[0].qtyOrdered');

    // 400: a required field missing.
    const noCustomer = await s.request('POST', '/api/orders', { lines: [{ variantId, qtyOrdered: 1 }] });
    assert.equal(noCustomer.status, 400);
    assert.equal(noCustomer.body.field, 'customerId');

    // 400: malformed JSON.
    const malformed = await postRaw(s.baseUrl, '/api/customers', '{"code": ');
    assert.equal(malformed.status, 400);
    assert.equal(malformed.body.error, 'validation_error');

    // 400: a JSON array where an object is required.
    const arrayBody = await postRaw(s.baseUrl, '/api/customers', '[1,2,3]');
    assert.equal(arrayBody.status, 400);

    // 404: an order that does not exist.
    const missing = await s.request('GET', '/api/orders/9999');
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error, 'not_found');

    // 409: confirming twice is an illegal transition, not a validation problem.
    const order = await s.request('POST', '/api/orders', {
      customerId,
      lines: [{ variantId, qtyOrdered: 2 }],
    });
    const orderId = order.body.order.id;
    assert.equal((await s.request('POST', `/api/orders/${orderId}/confirm`)).status, 200);
    const twice = await s.request('POST', `/api/orders/${orderId}/confirm`);
    assert.equal(twice.status, 409);
    assert.equal(twice.body.error, 'illegal_order_transition');

    // 409: a confirmed order is frozen (D005).
    const frozen = await s.request('POST', `/api/orders/${orderId}/lines`, { variantId, qtyOrdered: 1 });
    assert.equal(frozen.status, 409);
    assert.equal(frozen.body.error, 'order_not_editable');

    // 409: stock can never go negative.
    const overdraw = await s.request('POST', '/api/stock/adjustments', {
      reasonCode: 'damage',
      note: 'more than exists',
      lines: [{ variantId, qtyDelta: -500 }],
    });
    assert.equal(overdraw.status, 409);
    assert.equal(overdraw.body.error, 'stock_cannot_go_negative');

    // 400: an adjustment with no explanation is refused.
    const noNote = await s.request('POST', '/api/stock/adjustments', {
      reasonCode: 'damage',
      lines: [{ variantId, qtyDelta: -1 }],
    });
    assert.equal(noNote.status, 400);

    // 400: cancelling without a reason is refused.
    const noReason = await s.request('POST', `/api/orders/${orderId}/cancel`, {});
    assert.equal(noReason.status, 400);
    assert.equal(noReason.body.field, 'reason');
  } finally {
    await s.cleanup();
  }
});

test('stock quantities cannot be set directly over the API', async () => {
  const s = await startTestServer();
  try {
    const { variantId } = await seedCatalogue(s, 10);
    const attempt = await s.request('PUT', `/api/stock/${variantId}`, { qty: 999 });
    assert.equal(attempt.status, 400);
    assert.match(attempt.body.message, /adjustment/);

    const unchanged = await s.request('GET', `/api/stock/${variantId}`);
    assert.equal(unchanged.body.summary.onHand, 10);
  } finally {
    await s.cleanup();
  }
});

test('the router distinguishes a wrong verb from a wrong path', async () => {
  const s = await startTestServer();
  try {
    const wrongVerb = await s.request('DELETE', '/api/customers');
    assert.equal(wrongVerb.status, 405);
    assert.equal(wrongVerb.body.error, 'method_not_allowed');

    const wrongPath = await s.request('GET', '/api/does-not-exist');
    assert.equal(wrongPath.status, 404);
    assert.equal(wrongPath.body.error, 'not_found');
  } finally {
    await s.cleanup();
  }
});

test('an oversized body is refused before it is parsed', async () => {
  const s = await startTestServer();
  try {
    const huge = `{"code":"C-9","name":"${'x'.repeat(1_100_000)}"}`;
    const res = await postRaw(s.baseUrl, '/api/customers', huge);
    assert.equal(res.status, 400);
    assert.match(res.body.message, /exceeds/);
  } finally {
    await s.cleanup();
  }
});

test('the static console cannot serve files outside its own directory', async () => {
  const s = await startTestServer({ staticDir: '/tmp/garment-console-does-not-exist' });
  try {
    for (const path of ['/../src/main.ts', '/..%2fsrc%2fmain.ts', '/%2e%2e/package.json']) {
      const res = await s.request('GET', path);
      assert.equal(res.status, 404, `${path} should not be served`);
    }
  } finally {
    await s.cleanup();
  }
});

test('deliveries move stock over HTTP, and only when dispatched', async () => {
  const s = await startTestServer();
  try {
    const { customerId, variantId } = await seedCatalogue(s, 30);
    const created = await s.request('POST', '/api/orders', {
      customerId,
      lines: [{ variantId, qtyOrdered: 30 }],
    });
    const orderId = created.body.order.id;
    const orderLineId = created.body.order.lines[0].id;
    await s.request('POST', `/api/orders/${orderId}/confirm`);

    // A draft delivery is paperwork: no movement, no change to the shelf.
    const draft = await s.request('POST', '/api/deliveries', {
      orderId,
      deliveredAt: '2026-08-20',
      lines: [{ orderLineId, qty: 12 }],
    });
    assert.equal(draft.status, 201);
    assert.match(draft.body.delivery.deliveryNo, /^DEL-\d{4}-\d{5}$/);
    assert.equal(draft.body.delivery.status, 'draft');
    assert.equal(draft.body.delivery.lines[0].movementId, null);

    const beforeDispatch = await s.request('GET', `/api/stock/${variantId}`);
    assert.equal(beforeDispatch.body.summary.onHand, 30);
    assert.equal(beforeDispatch.body.movements.length, 1, 'still just the opening balance');

    // Dispatching is the physical event.
    const dispatched = await s.request('POST', `/api/deliveries/${draft.body.delivery.id}/dispatch`);
    assert.equal(dispatched.status, 200);
    assert.equal(dispatched.body.delivery.status, 'dispatched');
    assert.equal(dispatched.body.order.status, 'partially_delivered');
    assert.ok(dispatched.body.delivery.lines[0].movementId, 'the line records its movement');

    const afterDispatch = await s.request('GET', `/api/stock/${variantId}`);
    assert.equal(afterDispatch.body.summary.onHand, 18);
    assert.equal(afterDispatch.body.summary.allocated, 18, 'the remainder was reserved again');
    assert.equal(afterDispatch.body.summary.available, 0);
    assert.equal(afterDispatch.body.movements.length, 2);

    // The rest goes out in one step.
    const rest = await s.request('POST', '/api/deliveries?dispatch=true', {
      orderId,
      lines: [{ orderLineId, qty: 18 }],
    });
    assert.equal(rest.status, 201);
    assert.equal(rest.body.order.status, 'delivered');
    assert.equal(rest.body.allocation, null);

    const final = await s.request('GET', `/api/stock/${variantId}`);
    assert.equal(final.body.summary.onHand, 0);

    const list = await s.request('GET', `/api/deliveries?orderId=${orderId}`);
    assert.equal(list.body.deliveries.length, 2);
    assert.equal(list.body.deliveries[0].totalQty, 18, 'newest first');
  } finally {
    await s.cleanup();
  }
});

test('delivery refusals arrive as the right status code', async () => {
  const s = await startTestServer();
  try {
    // 12 on the shelf: 10 for the first order, 2 left over for the second.
    const { customerId, variantId } = await seedCatalogue(s, 12);
    const created = await s.request('POST', '/api/orders', {
      customerId,
      lines: [{ variantId, qtyOrdered: 10 }],
    });
    const orderId = created.body.order.id;
    const orderLineId = created.body.order.lines[0].id;

    // 409: the order is still a draft, so nothing may be delivered against it.
    const tooEarly = await s.request('POST', '/api/deliveries', {
      orderId,
      lines: [{ orderLineId, qty: 1 }],
    });
    assert.equal(tooEarly.status, 409);
    assert.equal(tooEarly.body.error, 'order_not_deliverable');

    await s.request('POST', `/api/orders/${orderId}/confirm`);

    // 409: more than the order asked for.
    const tooMany = await s.request('POST', '/api/deliveries?dispatch=true', {
      orderId,
      lines: [{ orderLineId, qty: 11 }],
    });
    assert.equal(tooMany.status, 409);
    assert.equal(tooMany.body.error, 'delivery_exceeds_order');

    // 400: a fractional quantity of garments.
    const fractional = await s.request('POST', '/api/deliveries', {
      orderId,
      lines: [{ orderLineId, qty: 1.5 }],
    });
    assert.equal(fractional.status, 400);
    assert.equal(fractional.body.field, 'lines[0].qty');

    // 400: a line belonging to no order of ours.
    const foreign = await s.request('POST', '/api/deliveries', {
      orderId,
      lines: [{ orderLineId: orderLineId + 999, qty: 1 }],
    });
    assert.equal(foreign.status, 400);

    // 404: no such delivery.
    assert.equal((await s.request('GET', '/api/deliveries/999')).status, 404);
    assert.equal((await s.request('POST', '/api/deliveries/999/dispatch')).status, 404);

    // 409: a dispatched delivery cannot be cancelled; the goods have gone.
    const out = await s.request('POST', '/api/deliveries?dispatch=true', {
      orderId,
      lines: [{ orderLineId, qty: 10 }],
    });
    assert.equal(out.status, 201);
    const cancel = await s.request('POST', `/api/deliveries/${out.body.delivery.id}/cancel`, {
      reason: 'wrong colour',
    });
    assert.equal(cancel.status, 409);
    assert.equal(cancel.body.error, 'dispatched_delivery_cannot_be_cancelled');

    // 400: cancelling without saying why.
    const second = await s.request('POST', '/api/orders', {
      customerId,
      lines: [{ variantId, qtyOrdered: 2 }],
    });
    const secondId = second.body.order.id;
    await s.request('POST', `/api/orders/${secondId}/confirm`);
    const draft = await s.request('POST', '/api/deliveries', {
      orderId: secondId,
      lines: [{ orderLineId: second.body.order.lines[0].id, qty: 2 }],
    });
    assert.equal(draft.status, 201);
    const noReason = await s.request('POST', `/api/deliveries/${draft.body.delivery.id}/cancel`, {});
    assert.equal(noReason.status, 400);
    assert.equal(noReason.body.field, 'reason');

    // A cancelled draft is allowed, and moves nothing.
    const cancelled = await s.request('POST', `/api/deliveries/${draft.body.delivery.id}/cancel`, {
      reason: 'van broke down',
    });
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.delivery.status, 'cancelled');

    const stockAfter = await s.request('GET', `/api/stock/${variantId}`);
    assert.equal(stockAfter.body.summary.onHand, 2, 'only the one real delivery moved stock');
  } finally {
    await s.cleanup();
  }
});

test('invoices bill delivered goods over HTTP, and void-and-reissue works', async () => {
  const s = await startTestServer();
  try {
    const { customerId, variantId } = await seedCatalogue(s, 30);
    const created = await s.request('POST', '/api/orders', {
      customerId,
      lines: [{ variantId, qtyOrdered: 30 }],
    });
    const orderId = created.body.order.id;
    const orderLineId = created.body.order.lines[0].id;
    await s.request('POST', `/api/orders/${orderId}/confirm`);

    // Nothing delivered, nothing billable.
    const emptyBillable = await s.request('GET', '/api/billable');
    assert.equal(emptyBillable.status, 200);
    assert.deepEqual(emptyBillable.body.lines, []);

    const out = await s.request('POST', '/api/deliveries?dispatch=true', {
      orderId,
      lines: [{ orderLineId, qty: 12 }],
    });
    assert.equal(out.status, 201);
    const deliveryId = out.body.delivery.id;

    const billable = await s.request('GET', '/api/billable');
    assert.equal(billable.body.lines.length, 1);
    assert.equal(billable.body.lines[0].qty, 12);
    assert.equal(billable.body.lines[0].unitPriceMinor, 80000);
    assert.equal(billable.body.lines[0].description, 'Bomber Jacket / Black / L');

    // Bill and issue in one step.
    const invoice = await s.request('POST', '/api/invoices?issue=true', {
      deliveryId,
      invoiceDate: '2026-08-24',
      dueDate: '2026-09-23',
    });
    assert.equal(invoice.status, 201);
    assert.match(invoice.body.invoice.invoiceNo, /^INV-\d{4}-\d{5}$/);
    assert.equal(invoice.body.invoice.status, 'issued');
    assert.equal(invoice.body.invoice.currency, 'NPR');
    assert.equal(invoice.body.invoice.dueDate, '2026-09-23');
    assert.equal(invoice.body.invoice.totalMinor, 960000, '12 pieces at 800.00');
    assert.equal(invoice.body.invoice.lines.length, 1);
    const invoiceId = invoice.body.invoice.id;

    const afterInvoice = await s.request('GET', '/api/billable');
    assert.deepEqual(afterInvoice.body.lines, [], 'a standing invoice blocks re-billing');

    // Void it, and the same delivered goods come back to be billed properly.
    const voided = await s.request('POST', `/api/invoices/${invoiceId}/void`, {
      reason: 'wrong due date agreed',
    });
    assert.equal(voided.status, 200);
    assert.equal(voided.body.invoice.status, 'void');
    assert.equal(voided.body.invoice.lines.length, 1, 'the lines stay for the record');

    const freed = await s.request('GET', '/api/billable');
    assert.equal(freed.body.lines.length, 1);

    const reissued = await s.request('POST', '/api/invoices', {
      deliveryLineIds: [freed.body.lines[0].deliveryLineId],
      invoiceDate: '2026-08-24',
      discountMinor: 60000,
      discountReason: 'agreed for the delay',
    });
    assert.equal(reissued.status, 201);
    assert.equal(reissued.body.invoice.status, 'draft');
    assert.equal(reissued.body.invoice.totalMinor, 900000);

    const issued = await s.request('POST', `/api/invoices/${reissued.body.invoice.id}/issue`);
    assert.equal(issued.status, 200);
    assert.equal(issued.body.invoice.status, 'issued');

    const list = await s.request('GET', `/api/invoices?customerId=${customerId}`);
    assert.equal(list.body.invoices.length, 2, 'nothing was deleted');
    assert.deepEqual(
      list.body.invoices.map((i: any) => i.status),
      ['issued', 'void'],
    );
    const onlyIssued = await s.request('GET', '/api/invoices?status=issued');
    assert.equal(onlyIssued.body.invoices.length, 1);
  } finally {
    await s.cleanup();
  }
});

test('invoice refusals arrive as the right status code', async () => {
  const s = await startTestServer();
  try {
    const { customerId, variantId } = await seedCatalogue(s, 20);
    const created = await s.request('POST', '/api/orders', {
      customerId,
      lines: [{ variantId, qtyOrdered: 20 }],
    });
    const orderId = created.body.order.id;
    const orderLineId = created.body.order.lines[0].id;
    await s.request('POST', `/api/orders/${orderId}/confirm`);

    // 409: a draft delivery has not left the factory.
    const draft = await s.request('POST', '/api/deliveries', {
      orderId,
      lines: [{ orderLineId, qty: 5 }],
    });
    const tooEarly = await s.request('POST', '/api/invoices', { deliveryId: draft.body.delivery.id });
    assert.equal(tooEarly.status, 409);
    assert.equal(tooEarly.body.error, 'delivery_not_dispatched');

    // 404: no such delivery.
    const missing = await s.request('POST', '/api/invoices', { deliveryId: 9999 });
    assert.equal(missing.status, 404);

    // 400: neither a delivery nor its lines named.
    const nothing = await s.request('POST', '/api/invoices', {});
    assert.equal(nothing.status, 400);
    assert.equal(nothing.body.field, 'deliveryId');

    await s.request('POST', `/api/deliveries/${draft.body.delivery.id}/dispatch`);
    const deliveryId = draft.body.delivery.id;

    // 400: a discount with no reason (D024).
    const silent = await s.request('POST', '/api/invoices', { deliveryId, discountMinor: 1000 });
    assert.equal(silent.status, 400);
    assert.equal(silent.body.field, 'discountReason');

    // 409: a discount larger than the bill.
    const tooBig = await s.request('POST', '/api/invoices', {
      deliveryId,
      discountMinor: 99_000_000,
      discountReason: 'far too much',
    });
    assert.equal(tooBig.status, 409);
    assert.equal(tooBig.body.error, 'discount_exceeds_invoice');

    // 409: money cannot fall due before the bill exists (D022).
    const backwards = await s.request('POST', '/api/invoices', {
      deliveryId,
      invoiceDate: '2026-08-24',
      dueDate: '2026-08-01',
    });
    assert.equal(backwards.status, 409);
    assert.equal(backwards.body.error, 'due_date_before_invoice_date');

    const good = await s.request('POST', '/api/invoices?issue=true', { deliveryId });
    assert.equal(good.status, 201);
    const invoiceId = good.body.invoice.id;

    // 409: an issued invoice cannot be issued again, nor billed twice.
    const again = await s.request('POST', `/api/invoices/${invoiceId}/issue`);
    assert.equal(again.status, 409);
    assert.equal(again.body.error, 'invoice_already_issued');

    const twice = await s.request('POST', '/api/invoices', { deliveryId });
    assert.equal(twice.status, 409);
    assert.equal(twice.body.error, 'nothing_left_to_invoice');

    // 400: voiding without saying why.
    const noReason = await s.request('POST', `/api/invoices/${invoiceId}/void`, {});
    assert.equal(noReason.status, 400);
    assert.equal(noReason.body.field, 'reason');

    // 404: no such invoice.
    const unknown = await s.request('GET', '/api/invoices/9999');
    assert.equal(unknown.status, 404);

    // Every refusal above left exactly one invoice behind.
    const list = await s.request('GET', '/api/invoices');
    assert.equal(list.body.invoices.length, 1);
    assert.equal(list.body.invoices[0].invoiceNo, 'INV-2026-00001', 'numbers stay gapless');
  } finally {
    await s.cleanup();
  }
});
