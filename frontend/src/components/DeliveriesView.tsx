import React, { useState, useEffect, useMemo } from 'react';
import { 
  Truck, Package, Printer, Search, X, Check, 
  Calendar, User, FileText, ArrowLeft, AlertTriangle, 
  CheckCircle2, Building2, Phone, Hash, Plus, Sparkles, RotateCcw, Layers, Clock, Eye
} from 'lucide-react';
import { api, type Delivery, type Order, type Customer, formatDate, formatMoney } from '../api';
import { downloadCSV } from '../utils/csv.ts';

interface DeliveriesViewProps {
  deliveries: Delivery[];
  orders: Order[];
  customers: Customer[];
  onRefresh: () => void;
  selectedOrderForDispatch?: Order | null;
  onClearSelectedOrder?: () => void;
}

interface TransportMetadata {
  carrier: string;
  vehicleNo: string;
  cartons: string;
  phone: string;
  userNote: string;
}

function parseDeliveryNotes(rawNotes: string | null | undefined): TransportMetadata {
  if (!rawNotes) {
    return { carrier: '', vehicleNo: '', cartons: '', phone: '', userNote: '' };
  }

  const match = rawNotes.match(/^\[Transport:\s*(.*?)\s*\|\s*Vehicle:\s*(.*?)\s*\|\s*Cartons:\s*(.*?)(?:\s*\|\s*Phone:\s*(.*?))?\]\s*(.*)$/s);
  if (match) {
    return {
      carrier: match[1]?.trim() || '',
      vehicleNo: match[2]?.trim() || '',
      cartons: match[3]?.trim() || '',
      phone: match[4]?.trim() || '',
      userNote: match[5]?.trim() || '',
    };
  }

  return { carrier: '', vehicleNo: '', cartons: '', phone: '', userNote: rawNotes.trim() };
}

function buildDeliveryNotesPayload(meta: { carrier: string; vehicleNo: string; cartons: string; phone: string; userNote: string }): string {
  const parts: string[] = [];
  if (meta.carrier) parts.push(`Transport: ${meta.carrier.trim()}`);
  if (meta.vehicleNo) parts.push(`Vehicle: ${meta.vehicleNo.trim()}`);
  if (meta.cartons) parts.push(`Cartons: ${meta.cartons.trim()}`);
  if (meta.phone) parts.push(`Phone: ${meta.phone.trim()}`);

  if (parts.length > 0) {
    const header = `[${parts.join(' | ')}]`;
    return meta.userNote.trim() ? `${header} ${meta.userNote.trim()}` : header;
  }

  return meta.userNote.trim();
}

/**
 * Isolated A4 Multi-Page Print Engine.
 * Streams clean HTML into an invisible iframe to guarantee pure white paper
 * and natural page breaks across Page 1, Page 2, Page 3+.
 */
function printDocumentContent(title: string, htmlContent: string) {
  let iframe = document.getElementById('garment-print-iframe') as HTMLIFrameElement;
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.id = 'garment-print-iframe';
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
          margin: 12mm 15mm 15mm 15mm;
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
          padding: 6px 8px;
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

export const DeliveriesView: React.FC<DeliveriesViewProps> = ({
  deliveries,
  orders,
  customers,
  onRefresh,
  selectedOrderForDispatch,
  onClearSelectedOrder,
}) => {
  const [activeTab, setActiveTab] = useState<'pending_orders' | 'dispatched_challans'>('pending_orders');

  const [showDispatchModal, setShowDispatchModal] = useState<boolean>(false);
  const [dispatchOrder, setDispatchOrder] = useState<Order | null>(null);
  const [loadingOrderLines, setLoadingOrderLines] = useState<boolean>(false);
  const [dispatchLines, setDispatchLines] = useState<Record<number, number>>({});
  
  // Transport & Packing Metadata
  const [carrierName, setCarrierName] = useState<string>('');
  const [vehicleNo, setVehicleNo] = useState<string>('');
  const [cartonsCount, setCartonsCount] = useState<string>('1');
  const [driverPhone, setDriverPhone] = useState<string>('');
  const [deliveryNote, setDeliveryNote] = useState<string>('');

  // Automated Invoicing on Dispatch Toggle (Default is Undefined / null)
  const [autoCreateInvoice, setAutoCreateInvoice] = useState<boolean>(true);
  const [paymentTermsDays, setPaymentTermsDays] = useState<number | null>(null);

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  // Fully loaded delivery object with all line items
  const [printDelivery, setPrintDelivery] = useState<Delivery | null>(null);
  const [loadingPrintDetails, setLoadingPrintDetails] = useState<boolean>(false);

  // Filter state
  const [filterCustomerId, setFilterCustomerId] = useState<string>('');
  const [filterFrom, setFilterFrom] = useState<string>('');
  const [filterTo, setFilterTo] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filteredDeliveries, setFilteredDeliveries] = useState<Delivery[]>(deliveries);

  useEffect(() => { 
    setFilteredDeliveries(deliveries); 
  }, [deliveries]);

  const deliverableOrders = useMemo(() => {
    return orders.filter(o => o.status === 'confirmed' || o.status === 'partially_delivered');
  }, [orders]);

  useEffect(() => {
    if (selectedOrderForDispatch) {
      openCreateForOrder(selectedOrderForDispatch);
    }
  }, [selectedOrderForDispatch]);

  const applyFilters = () => {
    let result = deliveries;
    if (filterCustomerId) {
      result = result.filter(d => String(d.customerId) === filterCustomerId);
    }
    if (filterFrom) {
      result = result.filter(d => (d.deliveredAt ?? '') >= filterFrom);
    }
    if (filterTo) {
      result = result.filter(d => (d.deliveredAt ?? '') <= filterTo + 'T23:59:59');
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(d => 
        d.deliveryNo.toLowerCase().includes(q) ||
        d.orderNo.toLowerCase().includes(q) ||
        d.customerName.toLowerCase().includes(q) ||
        (d.notes && d.notes.toLowerCase().includes(q))
      );
    }
    setFilteredDeliveries(result);
  };

  const clearFilters = () => {
    setFilterCustomerId('');
    setFilterFrom('');
    setFilterTo('');
    setSearchQuery('');
    setFilteredDeliveries(deliveries);
  };

  const handleExport = () => {
    const headers = ['Delivery #', 'Dispatched Date', 'Order #', 'Customer', 'Carrier', 'Cartons', 'Total Pieces', 'Status'];
    const data = filteredDeliveries.map(d => {
      const meta = parseDeliveryNotes(d.notes);
      return [
        d.deliveryNo,
        d.deliveredAt ? d.deliveredAt.split('T')[0] : '',
        d.orderNo,
        d.customerName,
        meta.carrier || '—',
        meta.cartons || '1',
        d.totalQty,
        d.status,
      ];
    });
    downloadCSV(`delivery_challans_${new Date().toISOString().split('T')[0]}.csv`, headers, data);
  };

  const openCreateForOrder = async (ord: Order) => {
    setLoadingOrderLines(true);
    setError(null);
    setShowDispatchModal(true);

    try {
      const { order: fullOrder } = await api.getOrder(ord.id);
      setDispatchOrder(fullOrder);

      const initialQuantities: Record<number, number> = {};
      (fullOrder.lines ?? []).forEach((l) => {
        const delivered = Number(l.qtyDelivered ?? (l as any).deliveredQty ?? 0);
        const remaining = Math.max(0, l.qtyOrdered - delivered);
        if (remaining > 0) {
          initialQuantities[l.id] = remaining;
        }
      });

      setDispatchLines(initialQuantities);
      setCarrierName('');
      setVehicleNo('');
      setCartonsCount('1');
      setDriverPhone('');
      setDeliveryNote('');
      setPaymentTermsDays(null); // Default to Undefined for each new dispatch
    } catch (err: any) {
      setError(err.message || 'Failed to load order line items for dispatch.');
    } finally {
      setLoadingOrderLines(false);
    }
  };

  // Hydrate full lines for printing
  const handleOpenPrintGatePass = async (deliverySummary: Delivery) => {
    try {
      setLoadingPrintDetails(true);
      const res = await api.getDelivery(deliverySummary.id);
      setPrintDelivery(res.delivery);
    } catch (err) {
      setPrintDelivery(deliverySummary);
    } finally {
      setLoadingPrintDetails(false);
    }
  };

  // Group line items into 2D Matrices per Product Style
  const productMatrices = useMemo(() => {
    if (!dispatchOrder?.lines) return [];

    const map = new Map<string, {
      productKey: string;
      productName: string;
      sizes: string[];
      colours: string[];
      cellMap: Map<string, {
        id: number;
        qtyOrdered: number;
        deliveredCalculated: number;
        remainingQty: number;
      }>;
      totalRemainingInStyle: number;
      totalOrderedInStyle: number;
    }>();

    dispatchOrder.lines.forEach((l) => {
      const delivered = Number(l.qtyDelivered ?? (l as any).deliveredQty ?? 0);
      const remaining = Math.max(0, l.qtyOrdered - delivered);
      
      const styleName = l.productName?.trim() || 'Garment Style';
      const styleKey = String(l.productId || (l as any).product_id || styleName);

      const current = map.get(styleKey) || {
        productKey: styleKey,
        productName: styleName,
        sizes: [],
        colours: [],
        cellMap: new Map(),
        totalRemainingInStyle: 0,
        totalOrderedInStyle: 0,
      };

      if (!current.sizes.includes(l.size)) current.sizes.push(l.size);
      if (!current.colours.includes(l.colour)) current.colours.push(l.colour);

      current.cellMap.set(`${l.colour}___${l.size}`, {
        id: l.id,
        qtyOrdered: l.qtyOrdered,
        deliveredCalculated: delivered,
        remainingQty: remaining,
      });

      current.totalRemainingInStyle += remaining;
      current.totalOrderedInStyle += l.qtyOrdered;
      map.set(styleKey, current);
    });

    return Array.from(map.values());
  }, [dispatchOrder]);

  const totalPackingPieces = useMemo(() => {
    return Object.values(dispatchLines).reduce((sum, q) => sum + (Number(q) || 0), 0);
  }, [dispatchLines]);

  const totalOrderRemaining = useMemo(() => {
    return productMatrices.reduce((sum, m) => sum + m.totalRemainingInStyle, 0);
  }, [productMatrices]);

  const handlePackAll = () => {
    const fullPack: Record<number, number> = {};
    productMatrices.forEach((matrix) => {
      matrix.cellMap.forEach((cell) => {
        if (cell.remainingQty > 0) {
          fullPack[cell.id] = cell.remainingQty;
        }
      });
    });
    setDispatchLines(fullPack);
  };

  const handleClearAllDispatch = () => {
    setDispatchLines({});
  };

  // Dispatch and optional automated invoicing
  const handleCreateAndDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    const order = dispatchOrder;
    if (!order) {
      setError('Please select an order to dispatch.');
      return;
    }

    const lines = Object.entries(dispatchLines)
      .map(([olId, qty]) => ({ orderLineId: Number(olId), qty: Number(qty) || 0 }))
      .filter((l) => l.qty > 0);

    if (lines.length === 0) { 
      setError('Please enter at least one piece to dispatch in the matrix.'); 
      return; 
    }

    const notesPayload = buildDeliveryNotesPayload({
      carrier: carrierName,
      vehicleNo,
      cartons: cartonsCount,
      phone: driverPhone,
      userNote: deliveryNote,
    });

    setSubmitting(true);
    setError(null);

    try {
      // 1. Create and dispatch delivery
      const { delivery } = await api.createDelivery({ 
        orderId: order.id, 
        lines,
        notes: notesPayload || undefined,
      });
      await api.dispatchDelivery(delivery.id);

      // 2. Automated Invoicing (if enabled)
      if (autoCreateInvoice) {
        const today = new Date();
        let dueDateStr: string | undefined = undefined;

        if (paymentTermsDays !== null) {
          const due = new Date();
          due.setDate(due.getDate() + paymentTermsDays);
          dueDateStr = due.toISOString().split('T')[0];
        }

        await api.createInvoiceForDelivery(delivery.id, {
          invoiceDate: today.toISOString().split('T')[0],
          dueDate: dueDateStr,
        }).catch(err => {
          console.warn('Auto invoice creation skipped or handled separately:', err);
        });
      }

      // 3. Fetch fully populated delivery for printing
      const fullDispatched = await api.getDelivery(delivery.id);
      
      setShowDispatchModal(false);
      setDispatchOrder(null);
      if (onClearSelectedOrder) onClearSelectedOrder();
      onRefresh();
      setPrintDelivery(fullDispatched.delivery);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to dispatch delivery');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExecutePrintGatePass = () => {
    const el = document.getElementById('gate-pass-printable-doc');
    if (el) {
      printDocumentContent(`Gate_Pass_${printDelivery?.deliveryNo || 'Challan'}`, el.innerHTML);
    }
  };

  const summaryMetrics = useMemo(() => {
    let totalPieces = 0;
    let totalCartons = 0;
    filteredDeliveries.forEach(d => {
      totalPieces += d.totalQty;
      const meta = parseDeliveryNotes(d.notes);
      totalCartons += parseInt(meta.cartons, 10) || 1;
    });
    return { count: filteredDeliveries.length, totalPieces, totalCartons };
  }, [filteredDeliveries]);

  return (
    <div className="space-y-4 font-sans">
      {/* Top Banner */}
      <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h3 className="font-extrabold text-base sm:text-lg text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Truck size={20} className="text-blue-600 dark:text-blue-400" />
            <span>Deliveries & Transport Challans</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Physical carton dispatches, cargo gate passes, and outward stock deduction ledger[cite: 9].
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button 
            type="button"
            onClick={() => {
              if (deliverableOrders.length > 0) {
                openCreateForOrder(deliverableOrders[0]);
              } else {
                setError('No confirmed orders pending dispatch.');
                setShowDispatchModal(true);
              }
            }}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
          >
            <Package size={14} />
            <span>New Dispatch / Gate Pass</span>
          </button>

          <button
            type="button"
            onClick={onRefresh}
            className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl transition cursor-pointer"
            title="Reload data"
          >
            <Truck size={14} />
          </button>
        </div>
      </div>

      {/* Aggregate Metrics Bar */}
      <div className="grid grid-cols-3 gap-3 text-xs font-mono">
        <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <span className="text-[10px] text-amber-600 dark:text-amber-400 uppercase font-sans font-bold block">Orders Pending Delivery</span>
          <span className="text-base sm:text-lg font-bold text-amber-600 dark:text-amber-400 mt-0.5 block">
            {deliverableOrders.length} Orders Ready
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <span className="text-[10px] text-blue-600 dark:text-blue-400 uppercase font-sans font-bold block">Total Cartons Shipped</span>
          <span className="text-base sm:text-lg font-bold text-blue-600 dark:text-blue-400 mt-0.5 block">
            {summaryMetrics.totalCartons} Cartons / Sacks
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <span className="text-[10px] text-emerald-600 uppercase font-sans font-bold block">Total Garments Delivered</span>
          <span className="text-base sm:text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 block">
            {summaryMetrics.totalPieces} Pieces
          </span>
        </div>
      </div>

      {/* View Switcher: Pending Orders vs Dispatched Challans */}
      <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl w-fit text-xs">
        <button
          type="button"
          onClick={() => setActiveTab('pending_orders')}
          className={`px-3.5 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'pending_orders'
              ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <Clock size={13} />
          <span>Orders Pending Dispatch ({deliverableOrders.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('dispatched_challans')}
          className={`px-3.5 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'dispatched_challans'
              ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <FileText size={13} />
          <span>Dispatched Challans History ({deliveries.length})</span>
        </button>
      </div>

      {/* VIEW 1: ORDERS PENDING DISPATCH */}
      {activeTab === 'pending_orders' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h4 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-slate-100">Confirmed Orders Waiting for Delivery</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Click "Pack & Dispatch" on any order to open its packing matrix.</p>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium font-mono">{deliverableOrders.length} orders ready</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse font-sans">
              <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 font-mono text-[10px] uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                <tr>
                  <th className="py-2.5 px-3 sm:px-4">Order #</th>
                  <th className="py-2.5 px-3 sm:px-4">Order Date</th>
                  <th className="py-2.5 px-3 sm:px-4 min-w-[150px]">Customer</th>
                  <th className="py-2.5 px-3 sm:px-4 text-center">Status</th>
                  <th className="py-2.5 px-3 sm:px-4 text-right">Total Ordered</th>
                  <th className="py-2.5 px-3 sm:px-4 text-right">Delivered So Far</th>
                  <th className="py-2.5 px-3 sm:px-4 text-right font-bold text-blue-600 dark:text-blue-400">Remaining to Pack</th>
                  <th className="py-2.5 px-3 sm:px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                {deliverableOrders.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400 dark:text-slate-500 text-xs font-sans">
                      No orders are currently waiting for delivery. All confirmed orders have been fully dispatched!
                    </td>
                  </tr>
                ) : (
                  deliverableOrders.map((ord) => {
                    const lines = ord.lines ?? [];
                    const totalPieces = lines.reduce((s, l) => s + l.qtyOrdered, 0);
                    const totalDelivered = lines.reduce((s, l) => s + Number(l.qtyDelivered ?? (l as any).deliveredQty ?? 0), 0);
                    const totalRemaining = Math.max(0, totalPieces - totalDelivered);

                    return (
                      <tr key={ord.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                        <td className="py-3 px-3 sm:px-4 font-bold text-blue-700 dark:text-blue-400 whitespace-nowrap">
                          {ord.orderNo}
                        </td>
                        <td className="py-3 px-3 sm:px-4 text-slate-500 whitespace-nowrap">
                          {formatDate(ord.orderDate)}
                        </td>
                        <td className="py-3 px-3 sm:px-4 font-sans font-bold text-slate-900 dark:text-slate-100">
                          {ord.customerName}
                        </td>
                        <td className="py-3 px-3 sm:px-4 text-center font-sans whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            ord.status === 'confirmed' 
                              ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800' 
                              : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                          }`}>
                            {ord.status.replace('_', ' ').toUpperCase()}
                          </span>
                        </td>
                        <td className="py-3 px-3 sm:px-4 text-right text-slate-700 dark:text-slate-300">
                          {totalPieces} pcs
                        </td>
                        <td className="py-3 px-3 sm:px-4 text-right text-slate-400">
                          {totalDelivered} pcs
                        </td>
                        <td className="py-3 px-3 sm:px-4 text-right font-bold text-blue-600 dark:text-blue-400 text-sm">
                          {totalRemaining} pcs
                        </td>
                        <td className="py-3 px-3 sm:px-4 text-center font-sans">
                          <button
                            type="button"
                            onClick={() => openCreateForOrder(ord)}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-2xs flex items-center gap-1 mx-auto cursor-pointer"
                          >
                            <Package size={12} />
                            <span>Pack & Dispatch →</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 2: DISPATCHED CHALLANS (HISTORY) */}
      {activeTab === 'dispatched_challans' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs p-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[160px]">
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Customer</label>
                <select 
                  value={filterCustomerId} 
                  onChange={e => setFilterCustomerId(e.target.value)} 
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-sm focus:border-blue-600 focus:outline-none cursor-pointer"
                >
                  <option value="">All Customers</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div className="flex-1 min-w-[140px]">
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Dispatch Date From</label>
                <input 
                  type="date" 
                  value={filterFrom} 
                  onChange={e => setFilterFrom(e.target.value)} 
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-sm focus:border-blue-600 focus:outline-none [color-scheme:light] dark:[color-scheme:dark]" 
                />
              </div>

              <div className="flex-1 min-w-[140px]">
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Dispatch Date To</label>
                <input 
                  type="date" 
                  value={filterTo} 
                  onChange={e => setFilterTo(e.target.value)} 
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-sm focus:border-blue-600 focus:outline-none [color-scheme:light] dark:[color-scheme:dark]" 
                />
              </div>

              <div className="flex-1 min-w-[160px]">
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Search Challan / Note</label>
                <input 
                  type="text" 
                  placeholder="e.g. DEL-001, Sajha Cargo..." 
                  value={searchQuery} 
                  onChange={e => setSearchQuery(e.target.value)} 
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-sm focus:border-blue-600 focus:outline-none" 
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <button onClick={applyFilters} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer">Apply</button>
                <button onClick={clearFilters} className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl transition cursor-pointer">✕ Clear</button>
                <button onClick={handleExport} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer">Export CSV</button>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h4 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-slate-100">Dispatched Delivery Challans History</h4>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">{filteredDeliveries.length} challans</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse font-sans">
                <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 font-mono text-[10px] uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3 sm:px-4">Challan #</th>
                    <th className="py-2.5 px-3 sm:px-4">Dispatched Date</th>
                    <th className="py-2.5 px-3 sm:px-4">Order #</th>
                    <th className="py-2.5 px-3 sm:px-4 min-w-[150px]">Customer</th>
                    <th className="py-2.5 px-3 sm:px-4 min-w-[160px]">Carrier / Transport</th>
                    <th className="py-2.5 px-3 sm:px-4 text-center">Cartons</th>
                    <th className="py-2.5 px-3 sm:px-4 text-right font-bold">Total Pieces</th>
                    <th className="py-2.5 px-3 sm:px-4 text-center">Status</th>
                    <th className="py-2.5 px-3 sm:px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                  {filteredDeliveries.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400 dark:text-slate-500 text-xs font-sans">
                        No delivery records found matching criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredDeliveries.map((d) => {
                      const meta = parseDeliveryNotes(d.notes);
                      return (
                        <tr key={d.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                          <td className="py-3 px-3 sm:px-4 font-bold text-blue-700 dark:text-blue-400 whitespace-nowrap">
                            {d.deliveryNo}
                          </td>
                          <td className="py-3 px-3 sm:px-4 text-slate-500 whitespace-nowrap">
                            {d.deliveredAt ? formatDate(d.deliveredAt.split('T')[0]) : '—'}
                          </td>
                          <td className="py-3 px-3 sm:px-4 font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                            {d.orderNo}
                          </td>
                          <td className="py-3 px-3 sm:px-4 font-sans font-bold text-slate-900 dark:text-slate-100">
                            {d.customerName}
                          </td>
                          <td className="py-3 px-3 sm:px-4 font-sans text-slate-700 dark:text-slate-300">
                            {meta.carrier ? (
                              <span>
                                <span className="font-semibold">{meta.carrier}</span>
                                {meta.vehicleNo && <span className="text-[11px] text-slate-400 font-mono block">Veh: {meta.vehicleNo}</span>}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">Self Pickup</span>
                            )}
                          </td>
                          <td className="py-3 px-3 sm:px-4 text-center font-bold text-slate-900 dark:text-slate-100">
                            {meta.cartons ? `${meta.cartons} ctn` : '1 ctn'}
                          </td>
                          <td className="py-3 px-3 sm:px-4 text-right font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                            {d.totalQty} pcs
                          </td>
                          <td className="py-3 px-3 sm:px-4 text-center font-sans whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              d.status === 'dispatched' 
                                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' 
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700'
                            }`}>
                              {d.status.toUpperCase()}
                            </span>
                          </td>
                          <td className="py-3 px-3 sm:px-4 text-center font-sans">
                            {d.status === 'dispatched' && (
                              <button 
                                onClick={() => handleOpenPrintGatePass(d)} 
                                className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold transition flex items-center gap-1 mx-auto cursor-pointer"
                                title="Print packing slip without prices"
                              >
                                <Printer size={12} />
                                <span>Gate Pass</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Dispatch Modal with 2D Stock Matrix Tables */}
      {showDispatchModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-3xl w-full p-4 sm:p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 max-h-[92vh] overflow-y-auto text-xs font-sans">
            <div className="flex justify-between items-start border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h4 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Truck size={16} className="text-blue-600" />
                  Dispatch Order {dispatchOrder ? dispatchOrder.orderNo : ''}
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Pack items using the Colour × Size matrix below. Generates a price-free driver gate pass[cite: 9].
                </p>
              </div>
              <button 
                onClick={() => {
                  setShowDispatchModal(false);
                  setDispatchOrder(null);
                  if (onClearSelectedOrder) onClearSelectedOrder();
                }} 
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 font-bold text-lg p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 rounded-xl text-xs font-semibold flex items-center gap-2">
                <AlertTriangle size={14} />
                <span>{error}</span>
              </div>
            )}

            {/* Select Confirmed Order */}
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                Order to Deliver:
              </label>
              <select
                value={dispatchOrder?.id ?? ''}
                onChange={(e) => {
                  const targetOrd = orders.find(o => o.id === Number(e.target.value));
                  if (targetOrd) openCreateForOrder(targetOrd);
                }}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-semibold focus:border-blue-600 focus:outline-none cursor-pointer"
              >
                <option value="">— Select Confirmed Order —</option>
                {deliverableOrders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.orderNo} — {o.customerName} ({o.status.replace('_', ' ')})
                  </option>
                ))}
              </select>
            </div>

            {loadingOrderLines ? (
              <div className="py-12 text-center text-slate-400 text-xs font-sans">
                Loading order matrices and calculating delivered balances...
              </div>
            ) : dispatchOrder && (
              <form onSubmit={handleCreateAndDispatch} className="space-y-4">
                {/* Transport & Carrier Metadata Strip */}
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2.5">
                  <span className="font-bold uppercase tracking-wider text-[10px] text-slate-500 dark:text-slate-400 block">
                    Transport & Carrier Details (Gate Pass Information)
                  </span>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Carrier / Transport Agency
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Sajha Cargo, Factory Van"
                        value={carrierName}
                        onChange={e => setCarrierName(e.target.value)}
                        className="w-full px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-lg text-xs focus:border-blue-600 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Vehicle / LR Receipt #
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Ba 2 Kha 4021"
                        value={vehicleNo}
                        onChange={e => setVehicleNo(e.target.value)}
                        className="w-full px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-lg text-xs font-mono focus:border-blue-600 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Number of Cartons / Sacks
                      </label>
                      <input
                        type="number"
                        min="1"
                        placeholder="1"
                        value={cartonsCount}
                        onChange={e => setCartonsCount(e.target.value)}
                        className="w-full px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-lg text-xs font-mono font-bold focus:border-blue-600 focus:outline-none"
                        required
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Driver / Contact Phone
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 9841XXXXXX"
                        value={driverPhone}
                        onChange={e => setDriverPhone(e.target.value)}
                        className="w-full px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-lg text-xs font-mono focus:border-blue-600 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Challan Note (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Handover to driver, freight payable at destination"
                      value={deliveryNote}
                      onChange={e => setDeliveryNote(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-lg text-xs focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                </div>

                {/* 2D Stock Matrix per Product */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-1.5">
                    <span className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                      <Layers size={13} className="text-blue-600 dark:text-blue-400" />
                      <span>Pack Quantities Matrix ({productMatrices.length} Style{productMatrices.length !== 1 ? 's' : ''}):</span>
                    </span>
                    <div className="space-x-2 text-[10px] font-bold text-blue-600 dark:text-blue-400">
                      <button type="button" onClick={handlePackAll} className="hover:underline cursor-pointer">Pack All Remaining</button>
                      <span>•</span>
                      <button type="button" onClick={handleClearAllDispatch} className="hover:underline cursor-pointer">Reset to 0</button>
                    </div>
                  </div>

                  {productMatrices.length === 0 ? (
                    <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-center text-xs text-emerald-800 dark:text-emerald-300">
                      All garments in this order have already been delivered!
                    </div>
                  ) : (
                    <div className="max-h-[340px] overflow-y-auto space-y-4 pr-1.5">
                      {productMatrices.map((matrix) => {
                        const sizeColumnTotals: Record<string, number> = {};
                        let matrixPackingNow = 0;

                        matrix.sizes.forEach((s) => {
                          let colSum = 0;
                          matrix.colours.forEach((c) => {
                            const cell = matrix.cellMap.get(`${c}___${s}`);
                            if (cell) {
                              colSum += Number(dispatchLines[cell.id]) || 0;
                            }
                          });
                          sizeColumnTotals[s] = colSum;
                          matrixPackingNow += colSum;
                        });

                        const remainingAfterThis = Math.max(0, matrix.totalRemainingInStyle - matrixPackingNow);

                        return (
                          <div 
                            key={matrix.productKey} 
                            className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-2xs bg-white dark:bg-slate-900"
                          >
                            <div className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2 text-xs">
                              <span className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                                {matrix.productName}
                              </span>
                              
                              <div className="flex items-center gap-3 font-mono text-[11px]">
                                <span className="text-slate-500">
                                  To Deliver: <strong className="text-slate-900 dark:text-slate-100">{matrix.totalRemainingInStyle} pcs</strong>
                                </span>
                                <span className="text-slate-300 dark:text-slate-700">•</span>
                                <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                                  Packing Now: {matrixPackingNow} pcs
                                </span>
                                <span className="text-slate-300 dark:text-slate-700">•</span>
                                <span className="text-blue-600 dark:text-blue-400 font-semibold">
                                  Remaining After: {remainingAfterThis} pcs
                                </span>
                              </div>
                            </div>

                            <div className="overflow-x-auto">
                              <table className="w-full border-collapse text-xs">
                                <thead>
                                  <tr>
                                    <th className="sticky left-0 z-10 w-24 p-2 text-left text-[10px] font-mono font-semibold text-slate-600 dark:text-slate-300 uppercase bg-slate-50 dark:bg-slate-800 border-b border-r border-slate-200 dark:border-slate-700">
                                      Colour
                                    </th>
                                    {matrix.sizes.map((s) => (
                                      <th 
                                        key={s} 
                                        className="min-w-[76px] w-20 p-2 text-[10px] font-mono font-semibold text-slate-600 dark:text-slate-300 uppercase bg-slate-50 dark:bg-slate-800 border-b border-r border-slate-200 dark:border-slate-700 text-center"
                                      >
                                        {s}
                                      </th>
                                    ))}
                                    <th className="min-w-[64px] w-16 p-2 text-[10px] font-mono font-semibold text-slate-600 dark:text-slate-300 uppercase bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-center">
                                      Total
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                                  {matrix.colours.map((colour) => {
                                    let rowPackTotal = 0;

                                    return (
                                      <tr key={colour} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition">
                                        <td className="sticky left-0 z-10 p-2 text-left text-[11px] font-mono font-bold text-slate-800 dark:text-slate-200 uppercase border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                                          {colour}
                                        </td>

                                        {matrix.sizes.map((size) => {
                                          const cell = matrix.cellMap.get(`${colour}___${size}`);
                                          if (!cell) {
                                            return (
                                              <td key={size} className="p-2 text-slate-300 dark:text-slate-600 text-xs border-r border-slate-100 dark:border-slate-800 text-center">
                                                —
                                              </td>
                                            );
                                          }

                                          const packQty = dispatchLines[cell.id] || 0;
                                          rowPackTotal += packQty;

                                          if (cell.remainingQty <= 0) {
                                            return (
                                              <td key={size} className="p-1.5 border-r border-slate-100 dark:border-slate-800 text-center bg-slate-50/50 dark:bg-slate-950/20">
                                                <span className="text-[10px] font-sans font-semibold text-slate-400">
                                                  ✓ Done
                                                </span>
                                              </td>
                                            );
                                          }

                                          return (
                                            <td key={size} className="p-1 border-r border-slate-100 dark:border-slate-800 text-center">
                                              <div className="flex flex-col items-center gap-0.5">
                                                <input
                                                  type="number"
                                                  min="0"
                                                  max={cell.remainingQty}
                                                  value={packQty === 0 ? '' : packQty}
                                                  onChange={(e) => {
                                                    const val = parseInt(e.target.value, 10);
                                                    const safe = isNaN(val) ? 0 : Math.min(cell.remainingQty, Math.max(0, val));
                                                    setDispatchLines(prev => ({ ...prev, [cell.id]: safe }));
                                                  }}
                                                  placeholder="0"
                                                  className={`w-14 px-1 py-1 text-center font-mono text-xs rounded-lg border font-bold focus:outline-none transition ${
                                                    packQty > 0
                                                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-100'
                                                      : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:border-blue-600'
                                                  }`}
                                                />
                                                <span className="text-[9px] font-mono text-slate-400">
                                                  Rem: {cell.remainingQty}
                                                </span>
                                              </div>
                                            </td>
                                          );
                                        })}

                                        <td className="p-2 text-xs font-mono font-bold text-slate-900 dark:text-slate-100 text-center bg-slate-50/50 dark:bg-slate-800/50">
                                          {rowPackTotal}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>

                                <tfoot>
                                  <tr className="border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 font-mono font-bold text-[11px]">
                                    <td className="sticky left-0 z-10 p-2 text-left text-slate-600 dark:text-slate-300 border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                                      Total
                                    </td>
                                    {matrix.sizes.map((s) => (
                                      <td key={s} className="p-1.5 text-center text-slate-800 dark:text-slate-200 border-r border-slate-200 dark:border-slate-700">
                                        {sizeColumnTotals[s]}
                                      </td>
                                    ))}
                                    <td className="p-1.5 text-center text-blue-600 dark:text-blue-400">
                                      {matrixPackingNow}
                                    </td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Automated Invoicing on Dispatch Toggle (Default is Undefined) */}
                <div className="p-3 bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 rounded-xl space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input 
                      type="checkbox"
                      checked={autoCreateInvoice}
                      onChange={e => setAutoCreateInvoice(e.target.checked)}
                      className="rounded text-blue-600 w-4 h-4 cursor-pointer"
                    />
                    <span className="font-bold text-slate-900 dark:text-slate-100">
                      Auto-generate Commercial Invoice immediately on dispatch
                    </span>
                  </label>
                  {autoCreateInvoice && (
                    <div className="flex items-center gap-3 pl-6 text-[11px] text-slate-600 dark:text-slate-400">
                      <span>Payment Terms:</span>
                      <div className="space-x-1.5 font-bold text-blue-600 dark:text-blue-400">
                        <button 
                          type="button" 
                          onClick={() => setPaymentTermsDays(null)} 
                          className={`px-2 py-0.5 rounded cursor-pointer ${paymentTermsDays === null ? 'bg-blue-600 text-white' : 'hover:underline'}`}
                          title="No due date specified (open rolling credit)"
                        >
                          Undefined
                        </button>
                        <button type="button" onClick={() => setPaymentTermsDays(0)} className={`px-2 py-0.5 rounded cursor-pointer ${paymentTermsDays === 0 ? 'bg-blue-600 text-white' : 'hover:underline'}`}>Due Now</button>
                        <button type="button" onClick={() => setPaymentTermsDays(15)} className={`px-2 py-0.5 rounded cursor-pointer ${paymentTermsDays === 15 ? 'bg-blue-600 text-white' : 'hover:underline'}`}>15 Days</button>
                        <button type="button" onClick={() => setPaymentTermsDays(30)} className={`px-2 py-0.5 rounded cursor-pointer ${paymentTermsDays === 30 ? 'bg-blue-600 text-white' : 'hover:underline'}`}>30 Days</button>
                        <button type="button" onClick={() => setPaymentTermsDays(60)} className={`px-2 py-0.5 rounded cursor-pointer ${paymentTermsDays === 60 ? 'bg-blue-600 text-white' : 'hover:underline'}`}>60 Days</button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Packing Summary Strip */}
                <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex justify-between items-center font-mono">
                  <div>
                    <span className="font-sans text-slate-600 dark:text-slate-400 text-xs font-semibold block">
                      Total Garments Packing for this Gate Pass:
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      Remaining across order after dispatch: {Math.max(0, totalOrderRemaining - totalPackingPieces)} pcs
                    </span>
                  </div>
                  <span className="font-bold text-slate-900 dark:text-slate-100 text-base">
                    {totalPackingPieces} Pieces
                  </span>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button 
                    type="button" 
                    onClick={() => {
                      setShowDispatchModal(false);
                      setDispatchOrder(null);
                      if (onClearSelectedOrder) onClearSelectedOrder();
                    }} 
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    disabled={submitting || totalPackingPieces === 0} 
                    className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 transition shadow-xs cursor-pointer"
                  >
                    {submitting ? 'Dispatching…' : `Confirm Dispatch (${totalPackingPieces} pcs)`}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ─── PRISTINE WHITE MODAL PREVIEW & ISOLATED MULTI-PAGE PRINT ENGINE ─── */}
      {printDelivery && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto font-sans">
          <div className="relative max-w-3xl w-full my-auto flex flex-col items-center">
            
            {/* Top Toolbar */}
            <div className="w-full bg-slate-900 text-white px-5 py-3 rounded-t-2xl flex items-center justify-between border border-slate-700 shadow-lg">
              <div className="flex items-center gap-2">
                <Truck size={16} className="text-blue-400" />
                <span className="font-bold text-sm">Gate Pass Document Preview</span>
                <span className="text-[11px] text-slate-400 font-mono">
                  ({printDelivery.lines?.length || 0} unique garment specs)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExecutePrintGatePass}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer size={14} />
                  <span>Print Gate Pass</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPrintDelivery(null)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs rounded-xl transition cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>

            {/* Pristine White Sheet of Paper on Screen (Immune to App Dark Mode) */}
            <div 
              style={{ backgroundColor: '#ffffff', color: '#000000', colorScheme: 'light' }}
              className="w-full p-6 sm:p-10 rounded-b-2xl shadow-2xl border-x border-b border-slate-300 overflow-y-auto max-h-[82vh]"
            >
              <div id="gate-pass-printable-doc" style={{ backgroundColor: '#ffffff', color: '#000000', colorScheme: 'light' }} className="space-y-4 text-xs">
                
                {/* Formal Company Header */}
                <div style={{ borderColor: '#000000' }} className="flex justify-between items-start border-b-2 pb-3">
                  <div>
                    <h1 style={{ color: '#000000' }} className="text-2xl font-black uppercase tracking-tight">GARMENT FACTORY</h1>
                    <p style={{ color: '#4b5563' }} className="text-[10px] font-semibold uppercase tracking-wider mt-0.5">
                      Apparel Production, Wholesale & Export Division
                    </p>
                    <p style={{ color: '#6b7280' }} className="text-[10px] mt-0.5">
                      Factory: Raniban, Kathmandu, Nepal • Phone: +977-1-4880000
                    </p>
                  </div>

                  <div className="text-right">
                    <div style={{ backgroundColor: '#000000', color: '#ffffff' }} className="inline-block px-3 py-1 font-mono font-extrabold text-xs uppercase tracking-wider rounded">
                      DELIVERY CHALLAN & GATE PASS
                    </div>
                    <div className="mt-2 font-mono text-xs space-y-0.5">
                      <span style={{ color: '#000000' }} className="font-black text-sm block">Challan #: {printDelivery.deliveryNo}</span>
                      <span style={{ color: '#4b5563' }} className="block">Order Ref: {printDelivery.orderNo}</span>
                      <span style={{ color: '#4b5563' }} className="block">
                        Date: {printDelivery.deliveredAt ? formatDate(printDelivery.deliveredAt.split('T')[0]) : ''}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Consignee & Carrier Dispatch Details */}
                {(() => {
                  const meta = parseDeliveryNotes(printDelivery.notes);
                  return (
                    <div style={{ borderColor: '#000000', backgroundColor: '#f9fafb' }} className="grid grid-cols-2 gap-3 border rounded-lg p-3 text-xs">
                      <div>
                        <span style={{ color: '#6b7280' }} className="text-[10px] font-bold uppercase tracking-wider block">
                          CONSIGNEE / DELIVER TO:
                        </span>
                        <span style={{ color: '#000000' }} className="font-black text-sm block mt-0.5">{printDelivery.customerName}</span>
                        <span style={{ color: '#4b5563' }} className="block mt-0.5">Wholesale Commercial Delivery</span>
                      </div>

                      <div style={{ borderColor: '#d1d5db' }} className="border-l pl-3 space-y-0.5">
                        <span style={{ color: '#6b7280' }} className="text-[10px] font-bold uppercase tracking-wider block">
                          CARRIER & LOGISTICS INFO:
                        </span>
                        <div style={{ color: '#111827' }} className="font-mono text-[11px]">
                          <span><strong>Carrier:</strong> {meta.carrier || 'Self Pickup / Counter'}</span>
                          {meta.vehicleNo && <span className="block"><strong>Vehicle #:</strong> {meta.vehicleNo}</span>}
                          {meta.phone && <span className="block"><strong>Contact:</strong> {meta.phone}</span>}
                          <span className="block font-bold"><strong>Packaging:</strong> {meta.cartons ? `${meta.cartons} Cartons / Sacks` : '1 Carton'}</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Itemized Garment List (Strictly Price-Free)[cite: 9] */}
                <div className="overflow-x-auto pt-1">
                  <table style={{ width: '100%', borderColor: '#d1d5db' }} className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr style={{ backgroundColor: '#f3f4f6', borderColor: '#000000', color: '#000000' }} className="border-b-2 uppercase font-mono text-[10px]">
                        <th style={{ backgroundColor: '#f3f4f6', color: '#000000' }} className="py-2 px-3 w-10 text-center font-bold">#</th>
                        <th style={{ backgroundColor: '#f3f4f6', color: '#000000' }} className="py-2 px-3 font-bold">Garment Style Description</th>
                        <th style={{ backgroundColor: '#f3f4f6', color: '#000000' }} className="py-2 px-3 font-bold">Colour / Shade</th>
                        <th style={{ backgroundColor: '#f3f4f6', color: '#000000' }} className="py-2 px-3 text-center font-bold">Size</th>
                        <th style={{ backgroundColor: '#f3f4f6', color: '#000000' }} className="py-2 px-4 text-right font-bold">Packed Quantity</th>
                      </tr>
                    </thead>
                    <tbody style={{ borderColor: '#d1d5db' }} className="divide-y font-mono text-xs">
                      {printDelivery.lines && printDelivery.lines.length > 0 ? (
                        printDelivery.lines.map((l, idx) => (
                          <tr key={l.id || idx}>
                            <td style={{ color: '#6b7280' }} className="py-2.5 px-3 text-center">{idx + 1}</td>
                            <td style={{ color: '#000000' }} className="py-2.5 px-3 font-sans font-bold">{l.productName}</td>
                            <td style={{ color: '#374151' }} className="py-2.5 px-3 font-sans">{l.colour}</td>
                            <td style={{ color: '#111827' }} className="py-2.5 px-3 text-center font-bold">{l.size}</td>
                            <td style={{ color: '#000000' }} className="py-2.5 px-4 text-right font-black">{l.qty} pcs</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} style={{ color: '#6b7280' }} className="py-6 text-center italic font-sans">
                            {loadingPrintDetails ? 'Loading line items...' : 'Summary dispatch: ' + printDelivery.totalQty + ' pieces.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderColor: '#000000', backgroundColor: '#f9fafb', color: '#000000' }} className="border-t-2 font-mono font-black text-sm">
                        <td colSpan={4} className="py-2.5 px-3 font-sans uppercase text-right">
                          Total Garments Dispatched:
                        </td>
                        <td style={{ color: '#000000' }} className="py-2.5 px-4 text-right">
                          {printDelivery.totalQty} Pieces
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Gate Pass Legal Notice */}
                <div style={{ backgroundColor: '#f9fafb', borderColor: '#d1d5db', color: '#4b5563' }} className="p-2.5 border rounded text-[10px] leading-relaxed page-break-avoid">
                  <strong style={{ color: '#111827' }}>Gate Pass Declaration:</strong> Goods listed above have been checked and authorized for exit from the factory warehouse. 
                  The carrier is authorized to transport this shipment to the consignee destination. Discrepancies in carton seal or piece count must be recorded upon physical receipt.
                </div>

                {/* 3-Party Signatures[cite: 9] */}
                <div style={{ borderColor: '#000000', color: '#000000' }} className="grid grid-cols-3 gap-6 pt-10 text-center text-[10px] font-sans border-t mt-6 page-break-avoid">
                  <div>
                    <div style={{ borderColor: '#000000' }} className="border-b w-28 mx-auto mb-1.5"></div>
                    <span className="font-bold block uppercase">Prepared & Packed By</span>
                    <span style={{ color: '#6b7280' }} className="text-[9px]">(Storekeeper)</span>
                  </div>
                  <div>
                    <div style={{ borderColor: '#000000' }} className="border-b w-28 mx-auto mb-1.5"></div>
                    <span className="font-bold block uppercase">Carrier / Driver</span>
                    <span style={{ color: '#6b7280' }} className="text-[9px]">(Transport Sign & Seal)</span>
                  </div>
                  <div>
                    <div style={{ borderColor: '#000000' }} className="border-b w-28 mx-auto mb-1.5"></div>
                    <span className="font-bold block uppercase">Received in Good Order</span>
                    <span style={{ color: '#6b7280' }} className="text-[9px]">(Consignee Seal & Sign)</span>
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