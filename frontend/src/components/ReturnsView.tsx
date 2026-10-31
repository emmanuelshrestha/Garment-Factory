import React, { useState, useMemo } from 'react';
import { 
  RotateCcw, AlertTriangle, CheckCircle2, Printer, 
  FileText, Package
} from 'lucide-react';
import { 
  api, 
  type Delivery, 
  type ProductVariant, 
  type Customer, 
  type Invoice, 
  formatMoney, 
  formatDate 
} from '../api.ts';
import { downloadCSV } from '../utils/csv.ts';

interface ReturnsViewProps {
  deliveries: Delivery[];
  customers: Customer[];
  variants: ProductVariant[];
  invoices: Invoice[];
  onRefresh: () => void;
}

export interface ReturnRecord {
  id: number;
  returnDate: string;
  deliveryNo: string;
  customerName: string;
  productName: string;
  colour: string;
  size: string;
  qty: number;
  condition: 'restock_a' | 'quarantine_defect';
  reasonCategory: string;
  notes: string;
}

/**
 * Isolated A4 Print Engine for Credit Notes & Inward Gate Passes.
 * Streams clean HTML into an invisible iframe to guarantee pure white paper
 * and natural page breaks across Page 1, Page 2+.
 */
function printDocumentContent(title: string, htmlContent: string) {
  let iframe = document.getElementById('garment-credit-note-print-iframe') as HTMLIFrameElement;
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.id = 'garment-credit-note-print-iframe';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
  }

  const doc = iframe.contentWindow?.document;
  if (!doc) return;

  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>${title}</title>
      <style>
        @page {
          size: A4 portrait;
          margin: 15mm 15mm 15mm 15mm;
        }
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
        html, body {
          background-color: #ffffff !important;
          color: #000000 !important;
          color-scheme: light !important;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          font-size: 11px;
          line-height: 1.45;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          page-break-inside: auto;
        }
        thead {
          display: table-header-group !important;
        }
        tfoot {
          display: table-footer-group !important;
        }
        tr {
          page-break-inside: avoid !important;
          break-inside: avoid !important;
        }
        .page-break-avoid {
          page-break-inside: avoid !important;
          break-inside: avoid !important;
        }
        th, td {
          padding: 7px 10px;
          border-bottom: 1px solid #d1d5db;
        }
        th {
          background-color: #f3f4f6 !important;
          color: #000000 !important;
          font-weight: 700;
          text-transform: uppercase;
          font-size: 10px;
          letter-spacing: 0.05em;
          border-bottom: 2px solid #000000;
        }
      </style>
    </head>
    <body>
      ${htmlContent}
    </body>
    </html>
  `);
  doc.close();

  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
  }, 250);
}

export const ReturnsView: React.FC<ReturnsViewProps> = ({ 
  deliveries = [], 
  customers = [], 
  variants = [], 
  invoices = [], 
  onRefresh 
}) => {
  // Navigation / Tabs
  const [activeTab, setActiveTab] = useState<'record' | 'log'>('record');

  // Return Form State
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<number | null>(null);
  const [deliveryDetail, setDeliveryDetail] = useState<Delivery | null>(null);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  const [selectedLineId, setSelectedLineId] = useState<number | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(null);
  const [qty, setQty] = useState<number | null>(null);
  const [returnDate, setReturnDate] = useState<string>(new Date().toISOString().split('T')[0]);
  
  // Defect Tracking & Disposition
  const [condition, setCondition] = useState<'restock_a' | 'quarantine_defect'>('restock_a');
  const [reasonCategory, setReasonCategory] = useState<string>('stitching_defect');
  const [notes, setNotes] = useState<string>('');

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Void-and-Reissue Modal State
  const [showVoidModal, setShowVoidModal] = useState<boolean>(false);
  const [invoiceToVoid, setInvoiceToVoid] = useState<Invoice | null>(null);
  const [voidReturnLineIds, setVoidReturnLineIds] = useState<number[]>([]);

  // Local / Mock Returns Ledger Log for UI transparency
  const [returnsLog, setReturnsLog] = useState<ReturnRecord[]>([
    {
      id: 1,
      returnDate: new Date().toISOString().split('T')[0],
      deliveryNo: 'DEL-2026-00001',
      customerName: 'Everest Outfitters',
      productName: 'Tactical Cargo Pants',
      colour: 'BLACK',
      size: 'L',
      qty: 12,
      condition: 'quarantine_defect',
      reasonCategory: 'Broken Zipper / Hardware',
      notes: 'Customer reported faulty brass zippers on 12 pieces from Batch #1.',
    }
  ]);

  // Printable Credit Note state
  const [printCreditNote, setPrintCreditNote] = useState<ReturnRecord | null>(null);

  // Filter dispatched deliveries
  const dispatchedDeliveries = useMemo(() => {
    return deliveries.filter(d => d.status === 'dispatched');
  }, [deliveries]);

  const selectedDelivery = useMemo(() => {
    return dispatchedDeliveries.find(d => d.id === selectedDeliveryId);
  }, [dispatchedDeliveries, selectedDeliveryId]);

  // Invoice corresponding to the selected delivery
  const deliveryInvoice = useMemo(() => {
    if (!selectedDelivery) return null;
    return invoices.find(i => i.orderId === selectedDelivery.orderId && i.status === 'issued');
  }, [selectedDelivery, invoices]);

  const selectedLineItem = useMemo(() => {
    if (!deliveryDetail || !selectedLineId) return null;
    return deliveryDetail.lines?.find(l => l.id === selectedLineId);
  }, [deliveryDetail, selectedLineId]);

  const handleReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDeliveryId || !selectedLineId || !selectedVariantId || !qty || qty <= 0) {
      setError('Please select delivery line and enter valid return quantity.');
      return;
    }

    const maxPcs = selectedLineItem?.qty ?? 0;
    if (qty > maxPcs) {
      setError(`Cannot return more than originally dispatched (${maxPcs} pcs).`);
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    const fullReasonString = `[${reasonCategory.toUpperCase()}|${condition === 'restock_a' ? 'A-GRADE-RESTOCK' : 'DEFECT-QUARANTINE'}] ${notes.trim()}`;

    try {
      await api.createReturn({
        deliveryId: selectedDeliveryId,
        deliveryLineId: selectedLineId,
        variantId: selectedVariantId,
        qty,
        returnDate,
        reason: fullReasonString,
      });

      // Append to the active returns audit trail
      const newLogEntry: ReturnRecord = {
        id: Date.now(),
        returnDate,
        deliveryNo: selectedDelivery?.deliveryNo || 'DEL-REF',
        customerName: selectedDelivery?.customerName || 'Wholesale Client',
        productName: selectedLineItem?.productName || 'Garment Spec',
        colour: selectedLineItem?.colour || 'Standard',
        size: selectedLineItem?.size || 'Free',
        qty,
        condition,
        reasonCategory: reasonCategory.replace('_', ' ').toUpperCase(),
        notes: notes.trim() || 'Factory return accepted.',
      };

      setReturnsLog(prev => [newLogEntry, ...prev]);

      setSuccess(
        condition === 'restock_a'
          ? `Return recorded: ${qty} pieces restored to Finished Stock A-Grade.`
          : `Return recorded: ${qty} pieces quarantined to Factory Alteration Floor.`
      );

      // Offer printing credit note
      setPrintCreditNote(newLogEntry);

      setSelectedDeliveryId(null);
      setSelectedLineId(null);
      setSelectedVariantId(null);
      setDeliveryDetail(null);
      setQty(null);
      setNotes('');
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

      setSuccess(`Original invoice ${invoiceToVoid.invoiceNo} voided. Corrected invoice ${result.invoice.invoiceNo} issued to customer khata.`);
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

  const handleExecutePrintCreditNote = () => {
    const el = document.getElementById('credit-note-printable-doc');
    if (el) {
      printDocumentContent(`Credit_Note_${printCreditNote?.deliveryNo || 'Return'}`, el.innerHTML);
    }
  };

  const handleExportCSV = () => {
    const headers = ['Return Date', 'Challan #', 'Customer', 'Product', 'Colour', 'Size', 'Return Qty', 'Stock Action', 'Defect Root Cause', 'Notes'];
    const data = returnsLog.map(r => [
      r.returnDate,
      r.deliveryNo,
      r.customerName,
      r.productName,
      r.colour,
      r.size,
      r.qty,
      r.condition === 'restock_a' ? 'Restocked A-Grade' : 'Quarantined for Alteration',
      r.reasonCategory,
      r.notes,
    ]);
    downloadCSV(`returns_audit_log_${new Date().toISOString().split('T')[0]}.csv`, headers, data);
  };

  return (
    <div className="space-y-4 font-sans">
      {/* Top Banner */}
      <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h3 className="font-extrabold text-base sm:text-lg text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <RotateCcw size={20} className="text-blue-600 dark:text-blue-400" />
            <span>Goods Returns & Rejections (चलन फिर्ता)</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Physical stock inspection, tailor alteration quarantine, and customer invoice credit reconciliation[cite: 11].
          </p>
        </div>

        {/* View Switcher */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('record')}
            className={`px-3.5 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'record'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <RotateCcw size={13} />
            <span>Record New Return</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('log')}
            className={`px-3.5 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'log'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <FileText size={13} />
            <span>Returns Log ({returnsLog.length})</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 rounded-xl text-xs font-semibold flex items-center gap-2">
          <AlertTriangle size={15} />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 rounded-xl text-xs font-semibold border border-emerald-200 dark:border-emerald-800 flex items-center gap-2">
          <CheckCircle2 size={15} />
          <span>{success}</span>
        </div>
      )}

      {/* ─── TAB 1: RECORD RETURN WORKFLOW ─── */}
      {activeTab === 'record' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 shadow-2xs space-y-4">
            <h4 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Package size={16} className="text-blue-600" />
              <span>Record Inward Return from Customer</span>
            </h4>

            <form onSubmit={handleReturn} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                {/* 1. Select Past Dispatched Challan */}
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Select Dispatched Delivery Challan *
                  </label>
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
                    className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl px-3 py-2 text-xs font-semibold focus:border-blue-600 focus:outline-none cursor-pointer"
                    required
                  >
                    <option value="">— Select Dispatched Challan —</option>
                    {dispatchedDeliveries.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.deliveryNo} — {d.customerName} ({d.totalQty} pcs • {formatDate(d.deliveredAt)})
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Select Specific Garment Spec */}
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Garment Spec from Challan *
                  </label>
                  <select
                    value={selectedLineId ?? ''}
                    onChange={(e) => {
                      const lineId = Number(e.target.value) || null;
                      setSelectedLineId(lineId);
                      if (lineId && deliveryDetail) {
                        const line = deliveryDetail.lines?.find(l => l.id === lineId);
                        if (line) setSelectedVariantId(line.variantId);
                      }
                    }}
                    className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl px-3 py-2 text-xs font-semibold focus:border-blue-600 focus:outline-none cursor-pointer disabled:opacity-50"
                    required
                    disabled={!selectedDeliveryId || detailLoading}
                  >
                    <option value="">— Select Garment Spec —</option>
                    {detailLoading && <option disabled>Loading challan items…</option>}
                    {deliveryDetail?.lines?.map(l => (
                      <option key={l.id} value={l.id}>
                        {l.productName} — {l.colour} / {l.size} (Dispatched: {l.qty} pcs)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* 3. Return Quantity */}
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Return Quantity (Pieces) *
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="1"
                      max={selectedLineItem?.qty ?? 9999}
                      value={qty ?? ''}
                      onChange={(e) => setQty(e.target.value ? Number(e.target.value) : null)}
                      placeholder="e.g. 10"
                      className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl px-3 py-2 text-xs font-bold font-mono focus:border-blue-600 focus:outline-none"
                      required
                    />
                    {selectedLineItem && (
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-mono">
                        Max: {selectedLineItem.qty} pcs
                      </span>
                    )}
                  </div>
                </div>

                {/* 4. Stock Inspection & Disposition */}
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Quality Inspection & Restock Action *
                  </label>
                  <select
                    value={condition}
                    onChange={(e) => setCondition(e.target.value as any)}
                    className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl px-3 py-2 text-xs font-bold focus:border-blue-600 focus:outline-none cursor-pointer"
                  >
                    <option value="restock_a">A-Grade (Sellable ➔ Restock to Finished Goods)</option>
                    <option value="quarantine_defect">Damaged / Flawed (Quarantine for Alteration)</option>
                  </select>
                </div>

                {/* 5. Return Date */}
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Return Date
                  </label>
                  <input
                    type="date"
                    value={returnDate}
                    onChange={(e) => setReturnDate(e.target.value)}
                    className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl px-3 py-2 text-xs font-semibold focus:border-blue-600 focus:outline-none [color-scheme:light] dark:[color-scheme:dark]"
                    required
                  />
                </div>
              </div>

              {/* 6. Root-Cause Category & Note */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Defect Root-Cause Code *
                  </label>
                  <select
                    value={reasonCategory}
                    onChange={(e) => setReasonCategory(e.target.value)}
                    className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl px-3 py-2 text-xs font-semibold focus:border-blue-600 focus:outline-none cursor-pointer"
                  >
                    <option value="stitching_defect">Stitching / Seam Breakdown</option>
                    <option value="broken_hardware">Broken Zipper / Button / Snap</option>
                    <option value="fabric_stain">Fabric Flaw / Oil / Dye Stain</option>
                    <option value="wrong_supply">Wrong Supply (Packing / Size Error)</option>
                    <option value="buyer_exchange">Buyer Seasonal Stock Exchange</option>
                    <option value="transit_damage">Transit Damage (Torn Cartons)</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Inspection Remarks & Notes
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Broken zipper teeth on size L, sent by transport counter"
                    className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl px-3 py-2 text-xs focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="submit"
                  disabled={submitting || detailLoading || !selectedDeliveryId || !selectedLineId}
                  className="px-6 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition shadow-xs cursor-pointer"
                >
                  {submitting ? 'Recording Inward Return…' : 'Confirm Inward Return & Generate Credit Slip'}
                </button>
              </div>
            </form>
          </div>

          {/* Void & Reissue Financial Adjustment Banner */}
          {deliveryInvoice && selectedDeliveryId && (
            <div className="bg-amber-50/70 dark:bg-amber-950/40 rounded-2xl border border-amber-300 dark:border-amber-800 p-4 sm:p-5 shadow-2xs space-y-3">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-amber-500 text-white shrink-0 mt-0.5">
                  <FileText size={18} />
                </div>
                <div>
                  <h4 className="font-extrabold text-sm text-amber-900 dark:text-amber-100">
                    Linked Commercial Invoice Detected: {deliveryInvoice.invoiceNo}
                  </h4>
                  <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
                    Challan <strong>{selectedDelivery?.deliveryNo}</strong> has an issued commercial bill for <strong>{formatMoney(deliveryInvoice.totalMinor, deliveryInvoice.currency)}</strong>. 
                    To deduct returned pieces from the customer khata, void the original bill and issue a corrected invoice for remaining goods[cite: 11].
                  </p>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setInvoiceToVoid(deliveryInvoice);
                    setShowVoidModal(true);
                    setVoidReturnLineIds([]);
                  }}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer"
                >
                  Void & Reissue Invoice for Return
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 2: RETURNS AUDIT LOG & REJECTION HISTORY ─── */}
      {activeTab === 'log' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h4 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-slate-100">
                Returns & Rejections Audit Log
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">
                Physical inward records of all customer returns and defect root-causes.
              </p>
            </div>

            <button
              type="button"
              onClick={handleExportCSV}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
            >
              Export CSV
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 font-mono text-[10px] uppercase text-slate-500 tracking-wider">
                <tr>
                  <th className="py-2.5 px-4">Date</th>
                  <th className="py-2.5 px-4">Challan #</th>
                  <th className="py-2.5 px-4 min-w-[150px]">Customer</th>
                  <th className="py-2.5 px-4">Garment Spec</th>
                  <th className="py-2.5 px-4 text-right">Return Qty</th>
                  <th className="py-2.5 px-4 text-center">Stock Action</th>
                  <th className="py-2.5 px-4">Defect Root Cause</th>
                  <th className="py-2.5 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                {returnsLog.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400 text-xs font-sans">
                      No returns recorded yet.
                    </td>
                  </tr>
                ) : (
                  returnsLog.map(r => (
                    <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                      <td className="py-3 px-4 text-slate-500 whitespace-nowrap">{formatDate(r.returnDate)}</td>
                      <td className="py-3 px-4 font-bold text-blue-600 whitespace-nowrap">{r.deliveryNo}</td>
                      <td className="py-3 px-4 font-sans font-bold text-slate-900 dark:text-slate-100">{r.customerName}</td>
                      <td className="py-3 px-4 font-sans text-slate-700 dark:text-slate-300">
                        {r.productName} — {r.colour} / {r.size}
                      </td>
                      <td className="py-3 px-4 text-right font-black text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {r.qty} pcs
                      </td>
                      <td className="py-3 px-4 text-center font-sans whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          r.condition === 'restock_a'
                            ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                            : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                        }`}>
                          {r.condition === 'restock_a' ? 'Restocked A-Grade' : 'Quarantined for Repair'}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-sans text-slate-600 dark:text-slate-400">
                        {r.reasonCategory}
                      </td>
                      <td className="py-3 px-4 text-center font-sans">
                        <button
                          type="button"
                          onClick={() => setPrintCreditNote(r)}
                          className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold transition flex items-center gap-1 mx-auto cursor-pointer"
                          title="Print Credit Note Slip"
                        >
                          <Printer size={12} />
                          <span>Credit Note</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── VOID & REISSUE MODAL ─── */}
      {showVoidModal && invoiceToVoid && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-3 sm:p-4 text-xs font-sans">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 sm:p-6 max-w-lg w-full max-h-[85vh] overflow-y-auto border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex justify-between items-start border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h4 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-slate-100">
                  Void & Reissue Invoice {invoiceToVoid.invoiceNo}[cite: 11]
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Check which items are being returned[cite: 11]. The invoice will be voided and a corrected bill reissued for kept goods[cite: 11].
                </p>
              </div>
              <button 
                type="button"
                onClick={() => setShowVoidModal(false)}
                className="text-slate-400 hover:text-slate-700 font-bold text-lg p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-2">
              <span className="font-bold text-slate-700 dark:text-slate-300 block">
                Select Returned Lines to Deduct from Invoice:
              </span>
              {deliveryDetail?.lines?.map(line => (
                <label key={line.id} className="flex items-center space-x-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-750 transition border border-slate-200 dark:border-slate-700">
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
                    className="rounded text-blue-600 w-4 h-4"
                  />
                  <span className="text-xs text-slate-800 dark:text-slate-200 font-medium">
                    {line.productName} — {line.colour} / {line.size} ({line.qty} pcs)
                  </span>
                </label>
              ))}
            </div>

            <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowVoidModal(false)}
                className="px-4 py-2 font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleVoidAndReissue}
                disabled={submitting || voidReturnLineIds.length === 0}
                className="px-5 py-2 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 disabled:opacity-50 transition shadow-xs cursor-pointer"
              >
                {submitting ? 'Processing…' : 'Confirm Void & Reissue'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── PRINTABLE CREDIT NOTE (ISOLATED A4 ENGINE) ─── */}
      {printCreditNote && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto font-sans">
          <div className="relative max-w-2xl w-full my-auto flex flex-col items-center">
            
            <div className="w-full bg-slate-900 text-white px-5 py-3 rounded-t-2xl flex items-center justify-between border border-slate-700 shadow-lg">
              <div className="flex items-center gap-2">
                <Printer size={16} className="text-blue-400" />
                <span className="font-bold text-sm">Credit Note Slip Preview</span>
                <span className="text-[11px] text-slate-400 font-mono">
                  ({printCreditNote.deliveryNo})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExecutePrintCreditNote}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer size={14} />
                  <span>Print Credit Note</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPrintCreditNote(null)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs rounded-xl transition cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>

            {/* Pristine White Sheet of Paper on Screen */}
            <div 
              style={{ backgroundColor: '#ffffff', color: '#000000', colorScheme: 'light' }}
              className="w-full p-6 sm:p-8 rounded-b-2xl shadow-2xl border-x border-b border-slate-300 overflow-y-auto max-h-[82vh]"
            >
              <div id="credit-note-printable-doc" style={{ backgroundColor: '#ffffff', color: '#000000', colorScheme: 'light' }} className="space-y-4 text-xs">
                
                {/* Header */}
                <div style={{ borderColor: '#000000' }} className="flex justify-between items-start border-b-2 pb-3">
                  <div>
                    <h1 style={{ color: '#000000' }} className="text-2xl font-black uppercase tracking-tight">GARMENT FACTORY</h1>
                    <p style={{ color: '#4b5563' }} className="text-[10px] font-semibold uppercase tracking-wider mt-0.5">
                      Quality Control & Goods Inward Returns Division
                    </p>
                    <p style={{ color: '#6b7280' }} className="text-[10px] mt-0.5">
                      Raniban, Kathmandu, Nepal • Phone: +977-1-4880000
                    </p>
                  </div>

                  <div className="text-right">
                    <div style={{ backgroundColor: '#000000', color: '#ffffff' }} className="inline-block px-3 py-1 font-mono font-extrabold text-xs uppercase tracking-wider rounded">
                      COMMERCIAL CREDIT NOTE / चलन फिर्ता
                    </div>
                    <div className="mt-2 font-mono text-xs space-y-0.5">
                      <span style={{ color: '#000000' }} className="font-black text-sm block">Ref Challan: {printCreditNote.deliveryNo}</span>
                      <span style={{ color: '#4b5563' }} className="block">Date: {formatDate(printCreditNote.returnDate)}</span>
                      <span style={{ color: '#4b5563' }} className="block uppercase">Action: {printCreditNote.condition === 'restock_a' ? 'A-Grade Restock' : 'Defect Quarantine'}</span>
                    </div>
                  </div>
                </div>

                {/* Return Customer Box */}
                <div style={{ borderColor: '#000000', backgroundColor: '#f9fafb' }} className="p-3 border rounded-lg space-y-1">
                  <span style={{ color: '#6b7280' }} className="text-[10px] font-bold uppercase tracking-wider block">
                    CREDIT ISSUED TO (CUSTOMER):
                  </span>
                  <span style={{ color: '#000000' }} className="font-black text-base block">{printCreditNote.customerName}</span>
                </div>

                {/* Returned Garment Particulars */}
                <div className="overflow-x-auto pt-1">
                  <table style={{ width: '100%', borderColor: '#d1d5db' }} className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr style={{ backgroundColor: '#f3f4f6', borderColor: '#000000', color: '#000000' }} className="border-b-2 uppercase font-mono text-[10px]">
                        <th style={{ backgroundColor: '#f3f4f6', color: '#000000' }} className="py-2 px-3 font-bold">Garment Particulars</th>
                        <th style={{ backgroundColor: '#f3f4f6', color: '#000000' }} className="py-2 px-3 font-bold">Colour</th>
                        <th style={{ backgroundColor: '#f3f4f6', color: '#000000' }} className="py-2 px-3 text-center font-bold">Size</th>
                        <th style={{ backgroundColor: '#f3f4f6', color: '#000000' }} className="py-2 px-4 text-right font-bold">Returned Qty</th>
                      </tr>
                    </thead>
                    <tbody style={{ borderColor: '#d1d5db' }} className="divide-y font-mono text-xs">
                      <tr>
                        <td style={{ color: '#000000' }} className="py-2.5 px-3 font-sans font-bold">{printCreditNote.productName}</td>
                        <td style={{ color: '#374151' }} className="py-2.5 px-3 font-sans">{printCreditNote.colour}</td>
                        <td style={{ color: '#111827' }} className="py-2.5 px-3 text-center font-bold">{printCreditNote.size}</td>
                        <td style={{ color: '#000000' }} className="py-2.5 px-4 text-right font-black">{printCreditNote.qty} pcs</td>
                      </tr>
                    </tbody>
                    <tfoot>
                      <tr style={{ borderColor: '#000000', backgroundColor: '#f9fafb', color: '#000000' }} className="border-t-2 font-mono font-black text-sm">
                        <td colSpan={3} className="py-2.5 px-3 font-sans uppercase text-right">
                          Total Credited Pieces:
                        </td>
                        <td style={{ color: '#000000' }} className="py-2.5 px-4 text-right">
                          {printCreditNote.qty} Pieces
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Reason & Notes Breakdown */}
                <div style={{ borderColor: '#e5e7eb' }} className="p-3 border rounded-lg space-y-1.5 font-sans text-xs">
                  <div className="flex justify-between">
                    <span style={{ color: '#6b7280' }}>Defect Root Cause:</span>
                    <strong style={{ color: '#111827' }}>{printCreditNote.reasonCategory}</strong>
                  </div>
                  {printCreditNote.notes && (
                    <div className="flex justify-between">
                      <span style={{ color: '#6b7280' }}>Inspector Remarks:</span>
                      <span style={{ color: '#111827' }}>{printCreditNote.notes}</span>
                    </div>
                  )}
                </div>

                <p style={{ color: '#6b7280' }} className="text-[10px] italic pt-1">
                  * Note: This credit note serves as official confirmation of returned inventory. Financial reconciliation is credited directly against customer khata ledger or adjusted via replacement challan.
                </p>

                {/* Signatory Area */}
                <div style={{ borderColor: '#000000', color: '#000000' }} className="grid grid-cols-2 gap-6 pt-10 text-[10px] font-sans border-t mt-6 page-break-avoid">
                  <div>
                    <span style={{ color: '#4b5563' }} className="text-[9px]">Quality Control Inward Verification</span>
                  </div>
                  <div className="text-center">
                    <div style={{ borderColor: '#000000' }} className="border-b w-36 mx-auto mb-1.5"></div>
                    <span className="font-bold block uppercase">Authorized Factory Officer</span>
                    <span style={{ color: '#6b7280' }} className="text-[9px]">(Store & Accounts Division)</span>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};