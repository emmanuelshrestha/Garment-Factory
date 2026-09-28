import React, { useState } from 'react';
import { api, type Delivery, type ProductVariant, type Customer, type Invoice, formatMoney, formatDate } from '../api.ts';

interface ReturnsViewProps {
  deliveries: Delivery[];
  customers: Customer[];
  variants: ProductVariant[];
  invoices: Invoice[];
  onRefresh: () => void;
}

export const ReturnsView: React.FC<ReturnsViewProps> = ({ deliveries, customers, variants, invoices, onRefresh }) => {
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<number | null>(null);
  const [deliveryDetail, setDeliveryDetail] = useState<Delivery | null>(null);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  const [selectedLineId, setSelectedLineId] = useState<number | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(null);
  const [qty, setQty] = useState<number | null>(null);
  const [returnDate, setReturnDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [reason, setReason] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Void-and-reissue state
  const [showVoidModal, setShowVoidModal] = useState<boolean>(false);
  const [invoiceToVoid, setInvoiceToVoid] = useState<Invoice | null>(null);
  const [voidReturnLineIds, setVoidReturnLineIds] = useState<number[]>([]);

  // Filter dispatched deliveries only
  const dispatchedDeliveries = deliveries.filter(d => d.status === 'dispatched');
  const selectedDelivery = dispatchedDeliveries.find(d => d.id === selectedDeliveryId);

  // Find the invoice for this delivery (if any)
  const deliveryInvoice = selectedDelivery
    ? invoices.find(i => i.orderId === selectedDelivery.orderId && i.status === 'issued')
    : null;

  const handleReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDeliveryId || !selectedLineId || !selectedVariantId || !qty || qty <= 0 || !reason.trim()) {
      setError('All fields are required');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      await api.createReturn({
        deliveryId: selectedDeliveryId,
        deliveryLineId: selectedLineId,
        variantId: selectedVariantId,
        qty,
        returnDate,
        reason: reason.trim(),
      });

      setSuccess(`Return recorded: ${qty} piece(s) added back to stock`);
      setSelectedDeliveryId(null);
      setSelectedLineId(null);
      setSelectedVariantId(null);
      setDeliveryDetail(null);
      setQty(null);
      setReason('');
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to record return');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVoidAndReissue = async () => {
    if (!invoiceToVoid || voidReturnLineIds.length === 0) return;

    setSubmitting(true);
    setError(null);

    try {
      const result = await api.voidAndReissueForReturn({
        originalInvoiceId: invoiceToVoid.id,
        returnedDeliveryLineIds: voidReturnLineIds,
        newInvoiceDate: returnDate,
      });

      setSuccess(`Invoice ${invoiceToVoid.invoiceNo} voided. New invoice ${result.invoice.invoiceNo} issued for remaining goods.`);
      setShowVoidModal(false);
      setInvoiceToVoid(null);
      setVoidReturnLineIds([]);
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to void and reissue invoice');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Goods Returns</h2>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-400 rounded-xl border border-red-200 dark:border-red-900/60 text-sm font-semibold">
          {error}
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 rounded-xl border border-green-200 dark:border-green-900/60 text-sm font-semibold">
          {success}
        </div>
      )}

      {/* Return Form */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 shadow-xs">
        <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4">Record Return</h3>
        
        <form onSubmit={handleReturn} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Delivery Selection */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Delivery</label>
              <select
                value={selectedDeliveryId ?? ''}
                onChange={(e) => {
                  const id = Number(e.target.value) || null;
                  setSelectedDeliveryId(id);
                  setSelectedLineId(null);
                  setSelectedVariantId(null);
                  setDeliveryDetail(null);
                  if (id) {
                    setDetailLoading(true);
                    api.getDelivery(id)
                      .then((res) => setDeliveryDetail(res.delivery))
                      .catch(() => setDeliveryDetail(null))
                      .finally(() => setDetailLoading(false));
                  }
                }}
                className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
                required
              >
                <option value="">Select a dispatched delivery...</option>
                {dispatchedDeliveries.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.deliveryNo} — {d.customerName} — {formatDate(d.deliveredAt)} ({d.totalQty} pcs)
                  </option>
                ))}
              </select>
            </div>

            {/* Line Selection */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Delivery Line</label>
              <select
                value={selectedLineId ?? ''}
                onChange={(e) => {
                  const lineId = Number(e.target.value) || null;
                  setSelectedLineId(lineId);
                  if (lineId && deliveryDetail) {
                    const line = deliveryDetail.lines.find(l => l.id === lineId);
                    if (line) setSelectedVariantId(line.variantId);
                  }
                }}
                className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
                required
                disabled={!selectedDeliveryId}
              >
                <option value="">Select a line...</option>
                {detailLoading && <option disabled>Loading lines…</option>}
                {deliveryDetail?.lines.map(l => (
                  <option key={l.id} value={l.id}>
                    {l.productName} / {l.colour} / {l.size} — {l.qty} pcs
                  </option>
                ))}
              </select>
            </div>

            {/* Quantity */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Quantity to Return</label>
              <input
                type="number"
                min="1"
                value={qty ?? ''}
                onChange={(e) => setQty(e.target.value ? Number(e.target.value) : null)}
                placeholder="Enter quantity to return..."
                className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
                required
              />
            </div>

            {/* Return Date */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Return Date</label>
              <input
                type="date"
                value={returnDate}
                onChange={(e) => setReturnDate(e.target.value)}
                className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
                required
              />
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Reason</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why are these goods being returned?"
              className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
              rows={2}
              required
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {selectedLineId && deliveryDetail && (
                <>
                  Selected: {deliveryDetail.lines.find(l => l.id === selectedLineId)?.productName} — 
                  Max returnable: {deliveryDetail.lines.find(l => l.id === selectedLineId)?.qty ?? 0} pcs
                </>
              )}
            </div>
            <button
              type="submit"
              disabled={submitting || detailLoading || !selectedDeliveryId || !selectedLineId}
              className="px-6 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-xs self-end sm:self-auto"
            >
              {submitting ? 'Recording...' : 'Record Return'}
            </button>
          </div>
        </form>
      </div>

      {/* Void and Reissue Section */}
      {deliveryInvoice && selectedDeliveryId && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-amber-200 dark:border-amber-900/50 p-4 sm:p-6 shadow-xs">
          <h3 className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider mb-2">
            Adjust Invoice for Return
          </h3>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mb-4">
            Delivery <strong>{selectedDelivery?.deliveryNo}</strong> has issued invoice{' '}
            <strong className="text-slate-900 dark:text-slate-100">{deliveryInvoice.invoiceNo}</strong> ({formatMoney(deliveryInvoice.totalMinor, deliveryInvoice.currency)}).
            To adjust the bill for returned goods, void and reissue the invoice.
          </p>
          <button
            onClick={() => {
              setInvoiceToVoid(deliveryInvoice);
              setShowVoidModal(true);
              setVoidReturnLineIds([]);
            }}
            className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-xl transition shadow-xs"
          >
            Void & Reissue Invoice for Return
          </button>
        </div>
      )}

      {/* Void and Reissue Modal */}
      {showVoidModal && invoiceToVoid && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 sm:p-6 max-w-lg w-full max-h-[85vh] overflow-y-auto border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Void & Reissue Invoice</h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
              Select the delivery lines being returned. The invoice will be voided and a new one
              created for the remaining goods.
            </p>
            
            <div className="space-y-2">
              {deliveryDetail?.lines.map(line => (
                <label key={line.id} className="flex items-center space-x-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-750 transition">
                  <input
                    type="checkbox"
                    checked={voidReturnLineIds.includes(line.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setVoidReturnLineIds([...voidReturnLineIds, line.id]);
                      } else {
                        setVoidReturnLineIds(voidReturnLineIds.filter(id => id !== line.id));
                      }
                    }}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 font-medium">
                    {line.productName} / {line.colour} / {line.size} — {line.qty} pcs
                  </span>
                </label>
              ))}
            </div>

            <div className="flex justify-end space-x-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setShowVoidModal(false)}
                className="px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                onClick={handleVoidAndReissue}
                disabled={submitting || voidReturnLineIds.length === 0}
                className="px-5 py-2 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 disabled:opacity-50 transition shadow-xs"
              >
                {submitting ? 'Processing...' : 'Void & Reissue'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Info */}
      <div className="bg-blue-50 dark:bg-blue-950/40 rounded-2xl border border-blue-200 dark:border-blue-900/50 p-4 text-xs sm:text-sm text-blue-800 dark:text-blue-300">
        <strong>Returns go straight into finished stock.</strong> The returned pieces will be
        available for new orders immediately after recording.
        ({customers.length} customers, {variants.length} variants on file)
      </div>
    </div>
  );
};