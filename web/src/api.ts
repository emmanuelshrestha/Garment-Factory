export type Currency = 'NPR' | 'INR' | 'USD';
export type StockBand = 'red' | 'amber' | 'normal' | 'green';
export type PaymentMethod = 'cash' | 'bank_transfer' | 'cheque';
export type PaymentStatus = 'pending' | 'cleared' | 'bounced' | 'cancelled';
export type OrderStatus = 'draft' | 'confirmed' | 'partially_delivered' | 'delivered' | 'closed' | 'cancelled';
export type DeliveryStatus = 'draft' | 'dispatched' | 'cancelled';
export type InvoiceStatus = 'draft' | 'issued' | 'void';

export function formatMoney(minor: number, currency: Currency = 'NPR'): string {
  const symbol = currency === 'NPR' ? 'Rs. ' : currency === 'INR' ? '₹' : '$';
  const major = (minor / 100).toFixed(2);
  const parts = major.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${symbol}${parts.join('.')}`;
}

export function formatDate(isoDate: string): string {
  if (!isoDate) return '';
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return isoDate;
  const day = d.getDate().toString().padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

// ─── Catalogue ────────────────────────────────────────────────────────────────

export type Colour = { id: number; name: string; isActive: boolean };
export type Size = { id: number; name: string; sortOrder: number; isActive: boolean };

export type Product = {
  id: number;
  code: string;
  name: string;
  category: string | null;
  defaultPriceMinor: number | null;
  defaultCurrency: Currency;
  isActive: boolean;
};

export type ProductVariant = {
  id: number;
  productId: number;
  sku: string;
  colourId: number;
  colour: string;
  sizeId: number;
  size: string;
  priceMinor: number | null;
  minStockQty: number;
  isActive: boolean;
};

// ─── Stock ────────────────────────────────────────────────────────────────────

export type StockSummary = {
  variantId: number;
  sku: string;
  productId: number;
  productCode: string;
  productName: string;
  colour: string;
  size: string;
  onHand: number;
  allocated: number;
  available: number;
  minStockQty: number;
  band: StockBand;
  overCommitted: boolean;
};

export type CuttingStockSummary = {
  variantId: number;
  sku: string;
  productId: number;
  productCode: string;
  productName: string;
  colour: string;
  size: string;
  onHand: number;
};

// ─── Customers ────────────────────────────────────────────────────────────────

export type Customer = {
  id: number;
  code: string;
  name: string;
  phone: string | null;
  address: string | null;
  defaultCurrency: Currency;
  notes: string | null;
  isActive: boolean;
};

// ─── Orders ───────────────────────────────────────────────────────────────────

export type OrderLine = {
  id: number;
  variantId: number;
  sku: string;
  productName: string;
  colour: string;
  size: string;
  qtyOrdered: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
  qtyAllocated: number;
  qtyDelivered: number;
  shortageQty: number;
  note: string | null;
};

export type Order = {
  id: number;
  orderNo: string;
  customerId: number;
  customerName: string;
  orderDate: string;
  requiredDate: string | null;
  currency: Currency;
  fxRateToNpr: number;
  status: OrderStatus;
  notes: string | null;
  lines: OrderLine[];
  totalMinor: number;
  totalShortageQty: number;
};

// ─── Deliveries ───────────────────────────────────────────────────────────────

export type DeliveryLine = {
  id: number;
  orderLineId: number;
  variantId: number;
  sku: string;
  productName: string;
  colour: string;
  size: string;
  qty: number;
  movementId: number | null;
  qtyOrdered: number;
  qtyDeliveredOnOrderLine: number;
};

export type Delivery = {
  id: number;
  deliveryNo: string;
  orderId: number;
  orderNo: string;
  customerId: number;
  customerName: string;
  deliveredAt: string;
  status: DeliveryStatus;
  notes: string | null;
  lines: DeliveryLine[];
  totalQty: number;
};

// ─── Invoices ─────────────────────────────────────────────────────────────────

export type InvoiceLine = {
  id: number;
  deliveryLineId: number;
  deliveryId: number;
  deliveryNo: string;
  variantId: number;
  sku: string;
  description: string;
  qty: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
};

export type Invoice = {
  id: number;
  invoiceNo: string;
  customerId: number;
  customerName: string;
  orderId: number;
  orderNo: string;
  invoiceDate: string;
  dueDate: string | null;
  currency: Currency;
  fxRateToNpr: number;
  subtotalMinor: number;
  discountMinor: number;
  discountReason: string | null;
  totalMinor: number;
  status: InvoiceStatus;
  voidedAt: string | null;
  voidReason: string | null;
  lines?: InvoiceLine[];
  lineCount?: number;
};

export type BillableDeliveryLine = {
  deliveryLineId: number;
  deliveryId: number;
  deliveryNo: string;
  deliveredAt: string;
  orderId: number;
  orderNo: string;
  customerId: number;
  customerName: string;
  variantId: number;
  sku: string;
  description: string;
  qty: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
  currency: Currency;
};

// ─── Payments ─────────────────────────────────────────────────────────────────

export type PaymentAllocation = {
  id: number;
  invoiceId: number;
  invoiceNo: string;
  invoiceDate: string;
  invoiceTotalMinor: number;
  invoiceStatus: InvoiceStatus;
  amountMinor: number;
  createdAt: string;
};

export type Payment = {
  id: number;
  paymentNo: string;
  customerId: number;
  customerName: string;
  receivedAt: string;
  method: PaymentMethod;
  amountMinor: number;
  currency: Currency;
  fxRateToNpr: number;
  status: PaymentStatus;
  chequeNo: string | null;
  chequeDate: string | null;
  postDated: boolean;
  appliedMinor: number;
  unappliedMinor: number;
  historicAppliedMinor: number;
  clearedAt: string | null;
  bouncedAt: string | null;
  bounceReason: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  note: string | null;
  allocations?: PaymentAllocation[];
};

export type CustomerStatement = {
  customerId: number;
  customerName: string;
  balances: Array<{
    currency: Currency;
    invoiceCount: number;
    invoicedMinor: number;
    settledMinor: number;
    outstandingMinor: number;
    advanceMinor: number;
    pendingChequeMinor: number;
  }>;
  invoices: Invoice[];
  payments: Payment[];
};

// ─── Expenses & Purchases ─────────────────────────────────────────────────────

export type Expense = {
  id: number;
  expenseNo: string;
  expenseDate: string;
  category: string;
  payee: string | null;
  amountMinor: number;
  currency: Currency;
  fxRateToNpr: number;
  method: PaymentMethod;
  note: string | null;
  createdAt: string;
};

export type Purchase = {
  id: number;
  purchaseNo: string;
  supplierName: string;
  purchaseDate: string;
  description: string;
  amountMinor: number;
  currency: Currency;
  fxRateToNpr: number;
  note: string | null;
  createdAt: string;
};

// ─── Employee Earnings ──────────────────────────────────────────────────────────

export type Employee = {
  id: number;
  tailorNumber: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type EarningsEntry = {
  id: number;
  employeeId: number;
  employeeName: string;
  tailorNumber: string;
  fiscalYear: number;
  month: number; // 1-12 for Nepali months (Baisakh=1)
  quantity: number;
  totalEarned: number;
  advance: number;
  others: number;
  openingDue: number;
  closingDue: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MonthlyEarningsSummary = {
  employeeId: number;
  employeeName: string;
  tailorNumber: string;
  quantity: number;
  totalEarned: number;
  advance: number;
  others: number;
  openingDue: number;
  closingDue: number;
};

// ─── Dashboard ────────────────────────────────────────────────────────────────

export type DashboardSummary = {
  asOf: string;
  orders: {
    confirmedCount: number;
    partiallyDeliveredCount: number;
    shortagePiecesCount: number;
    shortageVariantsCount: number;
  };
  deliveries: {
    draftCount: number;
    dispatchedCount: number;
  };
  inventory: {
    totalVariants: number;
    redCount: number;
    amberCount: number;
    normalCount: number;
  };
  receivables: Array<{
    currency: Currency;
    outstandingMinor: number;
    overdueMinor: number;
    invoiceCount: number;
  }>;
  cheques: {
    pendingCount: number;
    pendingAmountMinorNpr: number;
  };
  recentAudit: Array<{
    id: number;
    at: string;
    userId: number | null;
    action: string;
    entityType: string;
    entityId: number | null;
    detail: Record<string, unknown> | null;
  }>;
};

// ─── HTTP client ──────────────────────────────────────────────────────────────

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const tenantSlug = localStorage.getItem('tenantSlug') ?? '';
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(opts.headers as Record<string, string> ?? {}) };
  if (tenantSlug) {
    headers['x-tenant-slug'] = tenantSlug;
  }
  const res = await fetch(path, {
    ...opts,
    headers,
    credentials: 'include',
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      msg = body.message ?? body.error ?? msg;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

// ─── API surface ──────────────────────────────────────────────────────────────

export const api = {
  // Dashboard
  getDashboard: () => request<{ dashboard: DashboardSummary }>('/api/dashboard'),

  // Catalogue — colours
  getColours: () => request<{ colours: Colour[] }>('/api/colours'),
  createColour: (name: string) =>
    request<{ id: number }>('/api/colours', { method: 'POST', body: JSON.stringify({ name }) }),
  deactivateColour: (id: number) =>
    request<{ ok: boolean }>(`/api/colours/${id}`, { method: 'PATCH', body: JSON.stringify({ isActive: false }) }),

  // Catalogue — sizes
  getSizes: () => request<{ sizes: Size[] }>('/api/sizes'),
  createSize: (name: string, sortOrder: number) =>
    request<{ id: number }>('/api/sizes', { method: 'POST', body: JSON.stringify({ name, sortOrder }) }),
  deactivateSize: (id: number) =>
    request<{ ok: boolean }>(`/api/sizes/${id}`, { method: 'PATCH', body: JSON.stringify({ isActive: false }) }),

  // Catalogue — products
  getProducts: () => request<{ products: Product[] }>('/api/products'),
  getProduct: (id: number) =>
    request<{ product: Product; variants: ProductVariant[]; priceHistory: unknown[] }>(`/api/products/${id}`),
  createProduct: (data: {
    code: string;
    name: string;
    category?: string;
    defaultPriceMinor?: number;
    defaultCurrency?: Currency;
  }) => request<{ id: number }>('/api/products', { method: 'POST', body: JSON.stringify(data) }),
  updateProduct: (id: number, data: Partial<{ name: string; category: string; isActive: boolean }>) =>
    request<{ ok: boolean }>(`/api/products/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deactivateProduct: (id: number) =>
    request<{ ok: boolean }>(`/api/products/${id}`, { method: 'PATCH', body: JSON.stringify({ isActive: false }) }),
  setProductPrice: (id: number, priceMinor: number, note?: string) =>
    request<{ ok: boolean }>(`/api/products/${id}/price`, {
      method: 'POST',
      body: JSON.stringify({ priceMinor, note }),
    }),

  // Catalogue — variants
  getVariants: (productId?: number) => {
    const q = productId ? `?productId=${productId}` : '';
    return request<{ variants: ProductVariant[] }>(`/api/variants${q}`);
  },
  generateVariants: (productId: number, colourIds: number[], sizeIds: number[], minStockQty?: number, openingStockQty?: number) =>
    request<{ created: number[]; skipped: number }>(`/api/products/${productId}/variants`, {
      method: 'POST',
      body: JSON.stringify({ colourIds, sizeIds, minStockQty, openingStockQty }),
    }),
  updateVariant: (id: number, data: Partial<{ minStockQty: number; isActive: boolean; priceMinor: number | null }>) =>
    request<{ ok: boolean }>(`/api/variants/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  // Stock
  getStockSummaries: (params: { productId?: number; activeOnly?: boolean } = {}) => {
    const qParts: string[] = [];
    if (params.productId !== undefined) qParts.push(`productId=${params.productId}`);
    if (params.activeOnly !== undefined) qParts.push(`activeOnly=${params.activeOnly}`);
    const q = qParts.length > 0 ? `?${qParts.join('&')}` : '';
    return request<{ summaries: StockSummary[] }>(`/api/stock${q}`);
  },
  getStockSummary: (variantId: number) =>
    request<{ summary: StockSummary }>(`/api/stock/${variantId}`),
  getLowStock: () => request<{ lowStock: StockSummary[] }>('/api/stock/low'),
  recordOpeningBalance: (variantId: number, qty: number) =>
    request<{ ok: boolean }>('/api/stock/opening-balance', {
      method: 'POST',
      body: JSON.stringify({ variantId, qty }),
    }),
  createStockAdjustment: (data: {
    reasonCode: string;
    note?: string;
    lines: { variantId: number; qtyDelta: number }[];
  }) => request<{ ok: boolean }>('/api/stock/adjustments', { method: 'POST', body: JSON.stringify(data) }),

  // Cutting Stock
  getCuttingStockSummaries: () => request<{ summaries: CuttingStockSummary[] }>('/api/cutting-stock'),
  addCuttingStock: (variantId: number, qty: number) =>
    request<{ ok: boolean }>('/api/cutting-stock/add', {
      method: 'POST',
      body: JSON.stringify({ variantId, qty }),
    }),
  transferCuttingToFinished: (variantId: number, qty: number) =>
    request<{ ok: boolean }>('/api/cutting-stock/transfer-to-finished', {
      method: 'POST',
      body: JSON.stringify({ variantId, qty }),
    }),
  adjustCuttingStock: (variantId: number, qtyDelta: number, reasonCode: string, note: string) =>
    request<{ ok: boolean }>('/api/cutting-stock/adjust', {
      method: 'POST',
      body: JSON.stringify({ variantId, qtyDelta, reasonCode, note }),
    }),

  // Customers
  getCustomers: (params: { activeOnly?: boolean; search?: string } = {}) => {
    const q = new URLSearchParams();
    if (params.activeOnly) q.set('activeOnly', 'true');
    if (params.search) q.set('search', params.search);
    const qs = q.toString();
    return request<{ customers: Customer[] }>(`/api/customers${qs ? `?${qs}` : ''}`);
  },
  getCustomer: (id: number) =>
    request<{ customer: Customer; orders: Order[] }>(`/api/customers/${id}`),
  createCustomer: (data: {
    code: string;
    name: string;
    phone?: string;
    address?: string;
    defaultCurrency?: Currency;
    notes?: string;
  }) => request<{ customer: Customer }>('/api/customers', { method: 'POST', body: JSON.stringify(data) }),
  updateCustomer: (id: number, data: Partial<{ name: string; phone: string | null; address: string | null; notes: string | null; defaultCurrency: Currency }>) =>
    request<{ customer: Customer }>(`/api/customers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deactivateCustomer: (id: number) =>
    request<{ ok: boolean }>(`/api/customers/${id}/deactivate`, { method: 'POST' }),
  getCustomerStatement: (customerId: number) =>
    request<{ statement: CustomerStatement }>(`/api/customers/${customerId}/statement`),

  // Orders
  getOrders: (params: { customerId?: number; status?: string; openOnly?: boolean; fromDate?: string; toDate?: string } = {}) => {
    const q = new URLSearchParams();
    if (params.customerId) q.set('customerId', String(params.customerId));
    if (params.status) q.set('status', params.status);
    if (params.openOnly) q.set('openOnly', 'true');
    if (params.fromDate) q.set('fromDate', params.fromDate);
    if (params.toDate) q.set('toDate', params.toDate);
    const qs = q.toString();
    return request<{ orders: Order[] }>(`/api/orders${qs ? `?${qs}` : ''}`);
  },
  getOrder: (orderId: number) => request<{ order: Order }>(`/api/orders/${orderId}`),
  createOrder: (data: {
    customerId: number;
    orderDate?: string;
    requiredDate?: string;
    currency?: Currency;
    fxRateToNpr?: number;
    notes?: string;
    lines: { variantId: number; qtyOrdered: number; unitPriceMinor?: number; note?: string }[];
  }) => request<{ order: Order }>('/api/orders', { method: 'POST', body: JSON.stringify(data) }),
  confirmOrder: (orderId: number) =>
    request<{ order: Order; allocation: { totalShortageQty: number } }>(`/api/orders/${orderId}/confirm`, { method: 'POST' }),
  cancelOrder: (orderId: number, reason: string) =>
    request<{ order: Order }>(`/api/orders/${orderId}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),
  closeOrder: (orderId: number) =>
    request<{ order: Order }>(`/api/orders/${orderId}/close`, { method: 'POST' }),

  // Deliveries
  getDeliveries: (params: { orderId?: number; customerId?: number; status?: string } = {}) => {
    const q = new URLSearchParams();
    if (params.orderId) q.set('orderId', String(params.orderId));
    if (params.customerId) q.set('customerId', String(params.customerId));
    if (params.status) q.set('status', params.status);
    const qs = q.toString();
    return request<{ deliveries: Delivery[] }>(`/api/deliveries${qs ? `?${qs}` : ''}`);
  },
  getDelivery: (deliveryId: number) => request<{ delivery: Delivery }>(`/api/deliveries/${deliveryId}`),
  createDelivery: (data: {
    orderId: number;
    deliveredAt?: string;
    notes?: string;
    lines: { orderLineId: number; qty: number }[];
  }) => request<{ delivery: Delivery }>('/api/deliveries', { method: 'POST', body: JSON.stringify(data) }),
  dispatchDelivery: (deliveryId: number) =>
    request<{ delivery: Delivery; order: Order }>(`/api/deliveries/${deliveryId}/dispatch`, { method: 'POST' }),
  cancelDelivery: (deliveryId: number, reason: string) =>
    request<{ delivery: Delivery }>(`/api/deliveries/${deliveryId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  // Invoices
  getInvoices: (params: { customerId?: number; status?: string } = {}) => {
    const q = new URLSearchParams();
    if (params.customerId) q.set('customerId', String(params.customerId));
    if (params.status) q.set('status', params.status);
    const qs = q.toString();
    return request<{ invoices: Invoice[] }>(`/api/invoices${qs ? `?${qs}` : ''}`);
  },
  getInvoice: (invoiceId: number) => request<{ invoice: Invoice }>(`/api/invoices/${invoiceId}`),
  getBillableDeliveries: (customerId?: number) => {
    const q = customerId ? `?customerId=${customerId}` : '';
    return request<{ lines: BillableDeliveryLine[] }>(`/api/billable${q}`);
  },
  createInvoiceForDelivery: (
    deliveryId: number,
    data: { invoiceDate?: string; dueDate?: string; discountMinor?: number; discountReason?: string },
    issue = true,
  ) =>
    request<{ invoice: Invoice }>(`/api/invoices${issue ? '?issue=true' : ''}`, {
      method: 'POST',
      body: JSON.stringify({ deliveryId, ...data }),
    }),
  issueInvoice: (invoiceId: number) =>
    request<{ invoice: Invoice }>(`/api/invoices/${invoiceId}/issue`, { method: 'POST' }),
  voidInvoice: (invoiceId: number, reason: string) =>
    request<{ invoice: Invoice }>(`/api/invoices/${invoiceId}/void`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  // Payments
  getPayments: (params: { customerId?: number; status?: string } = {}) => {
    const q = new URLSearchParams();
    if (params.customerId) q.set('customerId', String(params.customerId));
    if (params.status) q.set('status', params.status);
    const qs = q.toString();
    return request<{ payments: Payment[] }>(`/api/payments${qs ? `?${qs}` : ''}`);
  },
  getPayment: (paymentId: number) => request<{ payment: Payment }>(`/api/payments/${paymentId}`),
  getPendingCheques: () => request<{ cheques: Payment[] }>('/api/cheques/pending'),
  getReceivables: (params: { customerId?: number; onlyOutstanding?: boolean } = {}) => {
    const q = new URLSearchParams();
    if (params.customerId) q.set('customerId', String(params.customerId));
    if (params.onlyOutstanding) q.set('onlyOutstanding', 'true');
    const qs = q.toString();
    return request<{ receivables: unknown[] }>(`/api/receivables${qs ? `?${qs}` : ''}`);
  },
  recordPayment: (data: {
    customerId: number;
    amountMinor: number;
    method: PaymentMethod;
    currency?: Currency;
    fxRateToNpr?: number;
    receivedAt?: string;
    chequeNo?: string | null;
    chequeDate?: string | null;
    note?: string | null;
    allocations?: { invoiceId: number; amountMinor: number }[];
  }) => request<{ payment: Payment }>('/api/payments', { method: 'POST', body: JSON.stringify(data) }),
  applyPayment: (paymentId: number, allocations: { invoiceId: number; amountMinor: number }[]) =>
    request<{ payment: Payment }>(`/api/payments/${paymentId}/apply`, {
      method: 'POST',
      body: JSON.stringify({ allocations }),
    }),
  clearCheque: (paymentId: number, clearedOn?: string) =>
    request<{ payment: Payment }>(`/api/payments/${paymentId}/clear`, {
      method: 'POST',
      body: JSON.stringify({ clearedOn }),
    }),
  bounceCheque: (paymentId: number, reason: string, bouncedOn?: string) =>
    request<{ payment: Payment }>(`/api/payments/${paymentId}/bounce`, {
      method: 'POST',
      body: JSON.stringify({ reason, bouncedOn }),
    }),
  cancelPayment: (paymentId: number, reason: string) =>
    request<{ payment: Payment }>(`/api/payments/${paymentId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  // Expenses
  getExpenses: () => request<{ expenses: Expense[] }>('/api/expenses'),
  createExpense: (data: {
    category: string;
    amountMinor: number;
    currency?: Currency;
    method: PaymentMethod;
    payee?: string | null;
    note?: string | null;
  }) => request<{ expense: Expense }>('/api/expenses', { method: 'POST', body: JSON.stringify(data) }),

  // Purchases
  getPurchases: () => request<{ purchases: Purchase[] }>('/api/purchases'),
  createPurchase: (data: {
    supplierName: string;
    description: string;
    amountMinor: number;
    currency?: Currency;
    note?: string | null;
  }) => request<{ purchase: Purchase }>('/api/purchases', { method: 'POST', body: JSON.stringify(data) }),

  // Production
  createCuttingJob: (data: { variantId: number; qty: number; cutDate: string; orderId?: number }) =>
    request<{ jobId: number }>('/api/production/cutting-jobs', { method: 'POST', body: JSON.stringify(data) }),
  getCuttingJobs: () => request<{ jobs: any[] }>('/api/production/cutting-jobs'),
  updateCuttingJobStatus: (id: number, data: { status: 'in_progress' | 'cut' | 'cancelled'; qtyCut?: number }) =>
    request<{ ok: boolean }>(`/api/production/cutting-jobs/${id}/status`, { method: 'POST', body: JSON.stringify(data) }),
  createBatch: (data: { cuttingJobId: number; qty: number }) =>
    request<{ batchId: number }>('/api/production/batches', { method: 'POST', body: JSON.stringify(data) }),
  getBatches: () => request<{ batches: any[] }>('/api/production/batches'),
  updateBatchStatus: (id: number, data: { status: 'sewing' | 'finishing' | 'qc' | 'packing' | 'packed' | 'scrapped' }) =>
    request<{ ok: boolean }>(`/api/production/batches/${id}/status`, { method: 'POST', body: JSON.stringify(data) }),
  recordQcInspection: (data: {
    batchId: number;
    qtyInspected: number;
    qtyPass: number;
    qtyRework: number;
    qtyScrap: number;
    scrapDeductions: { materialId: number; qty: number }[];
    note: string;
  }) => request<{ inspectionId: number }>('/api/production/qc-inspections', { method: 'POST', body: JSON.stringify(data) }),

  // Raw Materials
  recordRawMovement: (data: {
    materialId: number;
    qty: number;
    movementType: 'stock_in' | 'scrap_out' | 'adjustment_in' | 'adjustment_out';
    refType: 'receipt' | 'scrap' | 'adjustment';
    refId?: number;
    occurredAt?: string;
    note?: string;
  }) => request<{ movementId: number }>('/api/raw-materials/movements', { method: 'POST', body: JSON.stringify(data) }),

  // ─── Employee Earnings ──────────────────────────────────────────────────────────
  // Employees
  getEmployees: (activeOnly?: boolean) => {
    const q = activeOnly ? '?activeOnly=true' : '';
    return request<{ employees: Employee[] }>(`/api/employees${q}`);
  },
  createEmployee: (data: { tailorNumber: string; name: string }) =>
    request<{ employee: Employee }>('/api/employees', { method: 'POST', body: JSON.stringify(data) }),
  toggleEmployee: (id: number) =>
    request<{ employee: Employee }>(`/api/employees/${id}/toggle`, { method: 'PATCH' }),

  // Earnings
  recordEarnings: (data: {
    employeeId: number;
    fiscalYear: number;
    month: number; // 1-12 for Nepali months (Baisakh=1)
    quantity: number;
    totalEarned: number;
    advance: number;
    others: number;
    note?: string;
  }) => request<{ earnings: EarningsEntry }>('/api/earnings', { method: 'POST', body: JSON.stringify(data) }),
  getMonthlyEarnings: (fiscalYear: number, month: number) =>
    request<{ summary: MonthlyEarningsSummary[] }>(`/api/earnings/monthly?year=${fiscalYear}&month=${month}`),
  getEmployeeHistory: (employeeId: number, fiscalYear?: number) =>
    request<{ history: EarningsEntry[] }>(`/api/earnings/employee/${employeeId}${fiscalYear ? `?year=${fiscalYear}` : ''}`),

  // ─── Auth ─────────────────────────────────────────────────────────────────────
  async login(username: string, password: string): Promise<{ user: { id: number; username: string; displayName: string } }> {
    const tenantSlug = localStorage.getItem('tenantSlug') ?? '';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (tenantSlug) {
      headers['x-tenant-slug'] = tenantSlug;
    }
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers,
      body: JSON.stringify({ username, password }),
      credentials: 'include'
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.message || 'Login failed');
    }
    return response.json();
  },

  async logout(): Promise<void> {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include'
    });
    localStorage.removeItem('isAuthenticated');
    localStorage.removeItem('user');
    localStorage.removeItem('tenantSlug');
  },

  // Returns
  createReturn: (input: {
    deliveryId: number;
    deliveryLineId: number;
    variantId: number;
    qty: number;
    returnDate: string;
    reason: string;
  }) =>
    request<{ movementId: number }>('/api/stock/returns', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  voidAndReissueForReturn: (input: {
    originalInvoiceId: number;
    returnedDeliveryLineIds: number[];
    newInvoiceDate?: string;
    discountMinor?: number;
    discountReason?: string;
  }) =>
    request<{ invoice: Invoice }>(`/api/invoices/${input.originalInvoiceId}/void-and-reissue-for-return`, {
      method: 'POST',
      body: JSON.stringify({
        returnedDeliveryLineIds: input.returnedDeliveryLineIds,
        newInvoiceDate: input.newInvoiceDate,
        discountMinor: input.discountMinor,
        discountReason: input.discountReason,
      }),
    }),

};