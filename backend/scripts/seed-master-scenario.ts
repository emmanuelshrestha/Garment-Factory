import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// -----------------------------------------------------------------------------
// Database Connection & Configuration
// -----------------------------------------------------------------------------
const dbDir = join(process.cwd(), 'data');
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}
const dbPath = process.env.GARMENT_DB_PATH || join(dbDir, 'garment.db');
const db = new DatabaseSync(dbPath);

console.log(`[Master Seed] Connected to database at: ${dbPath}`);

const ownerRow = db.prepare('SELECT id FROM users ORDER BY id ASC LIMIT 1;').get() as { id: number } | undefined;
const ownerId = ownerRow ? ownerRow.id : 1;
console.log(`[Master Seed] Attributing operations to user ID: ${ownerId}`);

function hasTable(name: string): boolean {
  const row = db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?;`).get(name);
  return Boolean(row);
}

interface TableColInfo {
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

const tableColsCache = new Map<string, Map<string, TableColInfo>>();

function getTableInfo(table: string): Map<string, TableColInfo> {
  if (tableColsCache.has(table)) return tableColsCache.get(table)!;
  if (!hasTable(table)) {
    const empty = new Map<string, TableColInfo>();
    tableColsCache.set(table, empty);
    return empty;
  }
  const rows = db.prepare(`PRAGMA table_info("${table}");`).all() as unknown as TableColInfo[];
  const map = new Map<string, TableColInfo>();
  for (const r of rows) {
    map.set(r.name, r);
  }
  tableColsCache.set(table, map);
  return map;
}

function clearTable(name: string, whereClause = '') {
  if (hasTable(name)) {
    const query = whereClause ? `DELETE FROM "${name}" WHERE ${whereClause};` : `DELETE FROM "${name}";`;
    db.exec(query);
  }
}

function safeInsert(table: string, data: Record<string, unknown>): number {
  if (!hasTable(table)) return 0;
  const colMap = getTableInfo(table);

  // 1. Audit & Ownership resolution
  if (colMap.has('created_by') && data.created_by === undefined) data.created_by = ownerId;
  if (colMap.has('created_by_user_id') && data.created_by_user_id === undefined) data.created_by_user_id = ownerId;
  if (colMap.has('user_id') && data.user_id === undefined) data.user_id = ownerId;
  if (colMap.has('recorded_by') && data.recorded_by === undefined) data.recorded_by = ownerId;
  if (colMap.has('recorded_by_id') && data.recorded_by_id === undefined) data.recorded_by_id = ownerId;

  // 2. Timestamps
  const nowIso = new Date().toISOString();
  if (colMap.has('created_at') && data.created_at === undefined) data.created_at = nowIso;
  if (colMap.has('updated_at') && data.updated_at === undefined) data.updated_at = nowIso;
  if (colMap.has('allocated_at') && data.allocated_at === undefined) data.allocated_at = nowIso;

  // 3. Note/notes synonyms
  if (colMap.has('notes') && data.notes === undefined && data.note !== undefined) data.notes = data.note;
  if (colMap.has('note') && data.note === undefined && data.notes !== undefined) data.note = data.notes;

  // 4. Quantity synonyms
  if (colMap.has('qty') && data.qty === undefined) {
    data.qty = data.qty_allocated ?? data.quantity ?? data.qty_ordered;
  }
  if (colMap.has('qty_allocated') && data.qty_allocated === undefined) {
    data.qty_allocated = data.qty ?? data.quantity;
  }
  if (colMap.has('quantity') && data.quantity === undefined) {
    data.quantity = data.qty ?? data.qty_allocated;
  }
  if (colMap.has('qty_delta') && data.qty_delta === undefined && data.qty !== undefined) {
    data.qty_delta = data.qty;
  }

  // 5. Status defaults
  if (colMap.has('status') && data.status === undefined) {
    if (table === 'stock_allocations') data.status = 'active';
    else if (table === 'orders') data.status = 'confirmed';
    else if (table === 'deliveries') data.status = 'draft';
    else if (table === 'invoices') data.status = 'issued';
    else data.status = 'active';
  }

  // 6. Currency & FX
  if (colMap.has('currency') && data.currency === undefined) data.currency = 'NPR';
  if (colMap.has('fx_rate_to_npr') && data.fx_rate_to_npr === undefined) data.fx_rate_to_npr = 1.0;

  // 7. General NOT NULL fallback for any remaining required fields
  for (const [colName, colInfo] of colMap.entries()) {
    if (colInfo.notnull === 1 && colInfo.dflt_value === null && colInfo.pk === 0 && data[colName] === undefined) {
      const uType = (colInfo.type || '').toUpperCase();
      if (uType.includes('INT')) {
        data[colName] = 0;
      } else if (uType.includes('REAL') || uType.includes('NUM') || uType.includes('DEC') || uType.includes('FLOA')) {
        data[colName] = 0.0;
      } else {
        data[colName] = colName.includes('status') ? 'active' : '';
      }
    }
  }

  const validKeys = Object.keys(data).filter((k) => colMap.has(k) && data[k] !== undefined);
  if (validKeys.length === 0) return 0;

  const colNames = validKeys.map((k) => `"${k}"`).join(', ');
  const placeholders = validKeys.map(() => '?').join(', ');
  const values = validKeys.map((k) => data[k]);

  db.prepare(`INSERT INTO "${table}" (${colNames}) VALUES (${placeholders});`).run(...values);
  const row = db.prepare('SELECT last_insert_rowid() AS id;').get() as { id: number | bigint };
  return Number(row.id);
}

// -----------------------------------------------------------------------------
// Nepali BS 2082 Calendar Configuration
// -----------------------------------------------------------------------------
const NEPALI_MONTHS = [
  { id: 1, name: 'Baishakh', startGreg: '2025-04-14', endGreg: '2025-05-14' },
  { id: 2, name: 'Jestha',   startGreg: '2025-05-15', endGreg: '2025-06-14' },
  { id: 3, name: 'Ashadh',   startGreg: '2025-06-15', endGreg: '2025-07-16' },
  { id: 4, name: 'Shrawan',  startGreg: '2025-07-17', endGreg: '2025-08-16' },
  { id: 5, name: 'Bhadra',   startGreg: '2025-08-17', endGreg: '2025-09-16' },
  { id: 6, name: 'Ashwin',   startGreg: '2025-09-17', endGreg: '2025-10-17' },
  { id: 7, name: 'Kartik',   startGreg: '2025-10-18', endGreg: '2025-11-16' },
  { id: 8, name: 'Mangsir',  startGreg: '2025-11-17', endGreg: '2025-12-15' },
  { id: 9, name: 'Poush',    startGreg: '2025-12-16', endGreg: '2026-01-14' },
  { id: 10, name: 'Magh',    startGreg: '2026-01-15', endGreg: '2026-02-12' },
  { id: 11, name: 'Falgun',  startGreg: '2026-02-13', endGreg: '2026-03-14' },
  { id: 12, name: 'Chaitra', startGreg: '2026-03-15', endGreg: '2026-04-13' },
];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomDateInMonth(monthIndex: number): string {
  const m = NEPALI_MONTHS[monthIndex - 1];
  const start = new Date(m.startGreg).getTime();
  const end = new Date(m.endGreg).getTime();
  const randomTime = start + Math.random() * (end - start);
  return new Date(randomTime).toISOString().slice(0, 10);
}

// -----------------------------------------------------------------------------
// Main Transaction
// -----------------------------------------------------------------------------
db.exec('PRAGMA foreign_keys = OFF;');
db.exec('BEGIN IMMEDIATE;');

try {
  console.log('[Master Seed] Clearing previous transactional data...');

  clearTable('returns');
  clearTable('audit_log');
  clearTable('payment_allocations');
  clearTable('payments');
  clearTable('invoice_lines');
  clearTable('invoices');
  clearTable('delivery_lines');
  clearTable('deliveries');
  clearTable('stock_allocations');
  clearTable('order_lines');
  clearTable('orders');
  clearTable('stock_movements', "movement_type != 'opening_balance'");
  clearTable('cutting_stock');
  clearTable('purchases');
  clearTable('expenses');
  clearTable('employee_earnings');

  // 1. Resolve Variants & Customers
  const variantTable = hasTable('product_variants') ? 'product_variants' : 'variants';
  const variants = db.prepare(`
    SELECT v.id, v.sku, v.product_id, p.name as product_name, c.name as colour, s.name as size
    FROM "${variantTable}" v
    JOIN products p ON v.product_id = p.id
    JOIN colours c ON v.colour_id = c.id
    JOIN sizes s ON v.size_id = s.id
    ORDER BY v.id ASC;
  `).all() as Array<{ id: number; sku: string; product_id: number; product_name: string; colour: string; size: string }>;

  if (variants.length === 0) {
    throw new Error('No variants found. Run `npm run seed:demo` first.');
  }

  const customers = db.prepare(`SELECT id, code, name, default_currency FROM customers;`).all() as Array<{
    id: number;
    code: string;
    name: string;
    default_currency: string;
  }>;

  if (customers.length === 0) {
    throw new Error('No customers found. Run `npm run seed:demo` first.');
  }

  const custA = customers.find((c) => c.name.toLowerCase().includes('himalaya')) || customers[0];
  const custB = customers.find((c) => c.name.toLowerCase().includes('everest')) || customers[1] || customers[0];
  const custC = customers.find((c) => c.name.toLowerCase().includes('kathmandu')) || customers[2] || customers[0];

  const varBomberM = variants[0];
  const varBomberL = variants[1] || variants[0];
  const varPufferM = variants[2] || variants[0];
  const varPufferL = variants[3] || variants[1] || variants[0];
  const varShortageSKU = variants[variants.length - 1];

  // 2. Raw Material Purchases
  console.log('[Master Seed] Seeding raw material purchases...');
  const suppliers = [
    { supplier: 'Bhrikuti Textile Industries', desc: 'Waterproof Taslan 228T Fabric Roll (Black)', baseCost: 120000 },
    { supplier: 'Bhrikuti Textile Industries', desc: 'Ripstop 75D Polyester Shell (Navy Blue)', baseCost: 95000 },
    { supplier: 'Everest YKK Fasteners Nepal', desc: '#5 Vislon Open-End Reversible Zippers (70cm)', baseCost: 42000 },
    { supplier: 'Reliance Thermal & Polyfill', desc: '140 GSM Siliconized Polyfill Batting Roll', baseCost: 65000 },
    { supplier: 'Siddhartha Lining & Trims', desc: '210T Antistatic Polyester Taffeta Lining', baseCost: 48000 },
    { supplier: 'Himalayan Thread & Haberdashery', desc: 'Vardhman 40/2 Spun Poly Sewing Thread Cones', baseCost: 18000 },
  ];

  let purIdx = 1;
  for (let m = 1; m <= 12; m++) {
    const item = suppliers[(purIdx - 1) % suppliers.length];
    const costPaisa = (item.baseCost + randomInt(-2000, 8000)) * 100;
    safeInsert('purchases', {
      purchase_no: `PUR-2082-${String(purIdx).padStart(4, '0')}`,
      supplier_name: item.supplier,
      purchase_date: getRandomDateInMonth(m),
      description: item.desc,
      amount_minor: costPaisa,
      currency: 'NPR',
      fx_rate_to_npr: 1.0,
      note: `Delivery verified for batch M${m}-2082`,
    });
    purIdx++;
  }

  // 3. Factory Operating Expenses
  console.log('[Master Seed] Seeding factory expenses...');
  let expIdx = 1;
  for (let m = 1; m <= 12; m++) {
    const monthName = NEPALI_MONTHS[m - 1].name;
    safeInsert('expenses', {
      expense_no: `EXP-2082-${String(expIdx++).padStart(4, '0')}`,
      expense_date: getRandomDateInMonth(m),
      category: 'rent',
      payee: 'Raniban Factory Shed Owner',
      amount_minor: 65000 * 100,
      currency: 'NPR',
      fx_rate_to_npr: 1.0,
      method: 'bank_transfer',
      note: `Monthly factory premises rent for ${monthName} 2082`,
    });

    safeInsert('expenses', {
      expense_no: `EXP-2082-${String(expIdx++).padStart(4, '0')}`,
      expense_date: getRandomDateInMonth(m),
      category: 'utilities',
      payee: 'Nepal Electricity Authority (Balaju)',
      amount_minor: randomInt(15000, 24000) * 100,
      currency: 'NPR',
      fx_rate_to_npr: 1.0,
      method: 'bank_transfer',
      note: `Three-phase industrial power for ${monthName} 2082`,
    });
  }

  // 4. Employees & 2082 Piece-Rate Earnings
  console.log('[Master Seed] Seeding employees and 2082 salary ledgers...');
  const employeeList = [
    { tailorNumber: 'T-01', name: 'Dhan Bahadur Tamang', rate: 260, startMonth: 1 },
    { tailorNumber: 'T-02', name: 'Rajesh Gurung',       rate: 240, startMonth: 2 },
    { tailorNumber: 'T-03', name: 'Sunita Thapa',        rate: 220, startMonth: 2 },
    { tailorNumber: 'T-04', name: 'Kumar Pariyar',       rate: 250, startMonth: 3 },
    { tailorNumber: 'T-05', name: 'Prem Shrestha',       rate: 210, startMonth: 4 },
  ];

  for (const emp of employeeList) {
    let empId = 0;
    const existing = db.prepare('SELECT id FROM employees WHERE tailor_number = ?;').get(emp.tailorNumber) as { id: number } | undefined;

    if (existing) {
      empId = existing.id;
    } else {
      empId = safeInsert('employees', {
        tailor_number: emp.tailorNumber,
        name: emp.name,
        is_active: 1,
        active: 1,
        created_at: NEPALI_MONTHS[emp.startMonth - 1].startGreg,
      });
    }

    let runningClosing = 0;
    for (let m = emp.startMonth; m <= 12; m++) {
      const monthMeta = NEPALI_MONTHS[m - 1];
      const pieces = m >= 7 && m <= 10 ? randomInt(180, 250) : randomInt(120, 180);
      const earned = pieces * emp.rate;
      const advance = randomInt(1, 2) * 5000;
      const bonus = m === 6 ? 8000 : m === 7 ? 4000 : 0;
      const opening = runningClosing;
      const closing = opening + earned - advance + bonus;
      runningClosing = closing;

      safeInsert('employee_earnings', {
        employee_id: empId,
        fiscal_year: 2082,
        month: m,
        quantity: pieces,
        total_earned: earned,
        advance: advance,
        others: bonus,
        opening_due: opening,
        closing_due: closing,
        note: `Piece-rate payout ${monthMeta.name} 2082 (${pieces} pcs @ Rs.${emp.rate})`,
      });
    }
  }

  // 5. Cutting Room Stock
  console.log('[Master Seed] Seeding cutting room stock...');
  if (hasTable('cutting_stock')) {
    safeInsert('cutting_stock', {
      variant_id: varBomberM.id,
      product_id: varBomberM.product_id,
      size: varBomberM.size,
      qty: 120,
      quantity: 120,
      occurred_at: '2025-08-10 10:00:00',
      cut_date: '2025-08-10',
    });
  }

  // 6. Orders
  console.log('[Master Seed] Seeding orders with reservation & shortage edge cases...');

  // Order 1: Fully Delivered
  const order1Id = safeInsert('orders', {
    order_no: 'ORD-2082-0001',
    customer_id: custA.id,
    order_date: '2025-08-15',
    required_date: '2025-08-30',
    currency: 'NPR',
    fx_rate_to_npr: 1.0,
    status: 'delivered',
    total_minor: 34000000,
    total_shortage_qty: 0,
    notes: 'Winter jacket stock batch 2082',
  });

  const line1M = safeInsert('order_lines', {
    order_id: order1Id,
    variant_id: varBomberM.id,
    product_id: varBomberM.product_id,
    qty_ordered: 50,
    qty: 50,
    unit_price_minor: 340000,
    line_total_minor: 17000000,
    qty_allocated: 50,
    qty_delivered: 50,
    shortage_qty: 0,
    note: '50 pcs size M (2082)',
  });

  const line1L = safeInsert('order_lines', {
    order_id: order1Id,
    variant_id: varBomberL.id,
    product_id: varBomberL.product_id,
    qty_ordered: 50,
    qty: 50,
    unit_price_minor: 340000,
    line_total_minor: 17000000,
    qty_allocated: 50,
    qty_delivered: 50,
    shortage_qty: 0,
    note: '50 pcs size L (2082)',
  });

  // Order 2: Partially Delivered
  const order2Id = safeInsert('orders', {
    order_no: 'ORD-2082-0002',
    customer_id: custB.id,
    order_date: '2025-09-01',
    required_date: '2025-09-25',
    currency: 'NPR',
    fx_rate_to_npr: 1.0,
    status: 'partially_delivered',
    total_minor: 28800000,
    total_shortage_qty: 0,
    notes: 'Split shipment requested by dealer (2082)',
  });

  const line2M = safeInsert('order_lines', {
    order_id: order2Id,
    variant_id: varPufferM.id,
    product_id: varPufferM.product_id,
    qty_ordered: 40,
    qty: 40,
    unit_price_minor: 360000,
    line_total_minor: 14400000,
    qty_allocated: 20,
    qty_delivered: 20,
    shortage_qty: 0,
    note: '20 dispatched, 20 remaining reserved (2082)',
  });

  const line2L = safeInsert('order_lines', {
    order_id: order2Id,
    variant_id: varPufferL.id,
    product_id: varPufferL.product_id,
    qty_ordered: 40,
    qty: 40,
    unit_price_minor: 360000,
    line_total_minor: 14400000,
    qty_allocated: 40,
    qty_delivered: 0,
    shortage_qty: 0,
    note: '40 reserved on shelf waiting for vehicle (2082)',
  });

  safeInsert('stock_allocations', {
    order_id: order2Id,
    order_line_id: line2M,
    variant_id: varPufferM.id,
    qty: 20,
    qty_allocated: 20,
    status: 'active',
  });
  safeInsert('stock_allocations', {
    order_id: order2Id,
    order_line_id: line2L,
    variant_id: varPufferL.id,
    qty: 40,
    qty_allocated: 40,
    status: 'active',
  });

  // Order 3: Confirmed with SHORTAGE
  const order3Id = safeInsert('orders', {
    order_no: 'ORD-2082-0003',
    customer_id: custC.id,
    order_date: '2025-10-18',
    required_date: '2025-11-10',
    currency: 'NPR',
    fx_rate_to_npr: 1.0,
    status: 'confirmed',
    total_minor: 32000000,
    total_shortage_qty: 45,
    notes: 'Festival volume order with stock shortage (2082)',
  });

  const line3 = safeInsert('order_lines', {
    order_id: order3Id,
    variant_id: varShortageSKU.id,
    product_id: varShortageSKU.product_id,
    qty_ordered: 80,
    qty: 80,
    unit_price_minor: 400000,
    line_total_minor: 32000000,
    qty_allocated: 35,
    qty_delivered: 0,
    shortage_qty: 45,
    note: '35 on shelf, 45 shortage queued for cutting (2082)',
  });

  safeInsert('stock_allocations', {
    order_id: order3Id,
    order_line_id: line3,
    variant_id: varShortageSKU.id,
    qty: 35,
    qty_allocated: 35,
    status: 'active',
  });

  // 7. Deliveries (Chalan)
  console.log('[Master Seed] Seeding deliveries and inventory deductions...');

  // Delivery 1 (Order 1 - Full 100 pcs dispatched)
  const deliv1Id = safeInsert('deliveries', {
    delivery_no: 'DEL-2082-0001',
    order_id: order1Id,
    customer_id: custA.id,
    delivered_at: '2025-08-28 14:00:00',
    status: 'dispatched',
    total_qty: 100,
    notes: 'Dispatched in truck Ba 2 Kha 4521 (2082)',
  });

  const move1Id = safeInsert('stock_movements', {
    variant_id: varBomberM.id,
    product_id: varBomberM.product_id,
    qty_delta: -50,
    movement_type: 'delivery_out',
    ref_type: 'delivery',
    ref_id: deliv1Id,
    occurred_at: '2025-08-28 14:00:00',
    note: 'Dispatched on Chalan DEL-2082-0001',
  });
  const dLine1M_Id = safeInsert('delivery_lines', {
    delivery_id: deliv1Id,
    order_line_id: line1M,
    variant_id: varBomberM.id,
    product_id: varBomberM.product_id,
    qty: 50,
    movement_id: move1Id,
  });

  const move2Id = safeInsert('stock_movements', {
    variant_id: varBomberL.id,
    product_id: varBomberL.product_id,
    qty_delta: -50,
    movement_type: 'delivery_out',
    ref_type: 'delivery',
    ref_id: deliv1Id,
    occurred_at: '2025-08-28 14:00:00',
    note: 'Dispatched on Chalan DEL-2082-0001',
  });
  const dLine1L_Id = safeInsert('delivery_lines', {
    delivery_id: deliv1Id,
    order_line_id: line1L,
    variant_id: varBomberL.id,
    product_id: varBomberL.product_id,
    qty: 50,
    movement_id: move2Id,
  });

  // Delivery 2 (Order 2 - Partial 20 pcs dispatched)
  const deliv2Id = safeInsert('deliveries', {
    delivery_no: 'DEL-2082-0002',
    order_id: order2Id,
    customer_id: custB.id,
    delivered_at: '2025-09-12 11:30:00',
    status: 'dispatched',
    total_qty: 20,
    notes: 'Partial delivery 1 of 2 (2082)',
  });

  const move3Id = safeInsert('stock_movements', {
    variant_id: varPufferM.id,
    product_id: varPufferM.product_id,
    qty_delta: -20,
    movement_type: 'delivery_out',
    ref_type: 'delivery',
    ref_id: deliv2Id,
    occurred_at: '2025-09-12 11:30:00',
    note: 'Dispatched on Chalan DEL-2082-0002',
  });
  const dLine2M_Id = safeInsert('delivery_lines', {
    delivery_id: deliv2Id,
    order_line_id: line2M,
    variant_id: varPufferM.id,
    product_id: varPufferM.product_id,
    qty: 20,
    movement_id: move3Id,
  });

  // Delivery 3 (Order 2 - Staged DRAFT 40 pcs)
  const deliv3Id = safeInsert('deliveries', {
    delivery_no: 'DEL-2082-0003',
    order_id: order2Id,
    customer_id: custB.id,
    delivered_at: '2025-10-25 09:00:00',
    status: 'draft',
    total_qty: 40,
    notes: 'Draft packing list; cartons packed waiting for pickup (2082)',
  });
  safeInsert('delivery_lines', {
    delivery_id: deliv3Id,
    order_line_id: line2L,
    variant_id: varPufferL.id,
    product_id: varPufferL.product_id,
    qty: 40,
    movement_id: null,
  });

  // 8. Invoices & Billing
  console.log('[Master Seed] Seeding invoices & billing...');

  // Invoice 1: Overdue bill with approved discount
  const inv1Id = safeInsert('invoices', {
    invoice_no: 'INV-2082-0001',
    customer_id: custA.id,
    order_id: order1Id,
    delivery_id: deliv1Id,
    invoice_date: '2025-08-29',
    due_date: '2025-09-28',
    currency: 'NPR',
    fx_rate_to_npr: 1.0,
    subtotal_minor: 34000000,
    discount_minor: 1000000,
    discount_reason: 'Seasonal advance booking discount approved by owner (2082)',
    total_minor: 33000000,
    status: 'issued',
  });
  safeInsert('invoice_lines', {
    invoice_id: inv1Id,
    delivery_line_id: dLine1M_Id,
    variant_id: varBomberM.id,
    product_id: varBomberM.product_id,
    sku: varBomberM.sku,
    description: `${varBomberM.product_name} - ${varBomberM.colour} (M)`,
    qty: 50,
    unit_price_minor: 340000,
    line_total_minor: 17000000,
  });
  safeInsert('invoice_lines', {
    invoice_id: inv1Id,
    delivery_line_id: dLine1L_Id,
    variant_id: varBomberL.id,
    product_id: varBomberL.product_id,
    sku: varBomberL.sku,
    description: `${varBomberL.product_name} - ${varBomberL.colour} (L)`,
    qty: 50,
    unit_price_minor: 340000,
    line_total_minor: 17000000,
  });

  // Invoice 2: Billed on partial delivery
  const inv2Id = safeInsert('invoices', {
    invoice_no: 'INV-2082-0002',
    customer_id: custB.id,
    order_id: order2Id,
    delivery_id: deliv2Id,
    invoice_date: '2025-09-14',
    due_date: '2025-10-14',
    currency: 'NPR',
    fx_rate_to_npr: 1.0,
    subtotal_minor: 7200000,
    discount_minor: 0,
    discount_reason: null,
    total_minor: 7200000,
    status: 'issued',
  });
  safeInsert('invoice_lines', {
    invoice_id: inv2Id,
    delivery_line_id: dLine2M_Id,
    variant_id: varPufferM.id,
    product_id: varPufferM.product_id,
    sku: varPufferM.sku,
    description: `${varPufferM.product_name} - ${varPufferM.colour} (M)`,
    qty: 20,
    unit_price_minor: 360000,
    line_total_minor: 7200000,
  });

  // 9. Customer Returns (चलन फिर्ता) - ref_type is strictly 'return'
  console.log('[Master Seed] Seeding customer return and inventory restock...');
  if (hasTable('returns')) {
    safeInsert('returns', {
      return_no: 'RET-2082-0001',
      customer_id: custA.id,
      delivery_id: deliv1Id,
      delivery_line_id: dLine1M_Id,
      variant_id: varBomberM.id,
      product_id: varBomberM.product_id,
      qty: 5,
      return_date: '2025-09-20',
      reason: 'Sleeve stitch revision (2082)',
    });
  }

  safeInsert('stock_movements', {
    variant_id: varBomberM.id,
    product_id: varBomberM.product_id,
    qty_delta: 5,
    movement_type: 'return_in',
    ref_type: 'return', // Must be 'return', not 'customer_return'
    ref_id: deliv1Id,
    occurred_at: '2025-09-20 14:30:00',
    note: 'Customer return (चलन फिर्ता): 5 pcs returned by Himalaya Traders (2082)',
  });

  // 10. Audit Log Stream
  console.log('[Master Seed] Seeding audit log events...');
  const auditEntries = [
    { at: '2025-08-15 10:15:00', action: 'order.created', entityType: 'order', entityId: order1Id, detail: { orderNo: 'ORD-2082-0001', customer: custA.name, totalPcs: 100 } },
    { at: '2025-08-28 14:00:00', action: 'delivery.dispatched', entityType: 'delivery', entityId: deliv1Id, detail: { deliveryNo: 'DEL-2082-0001', piecesDispatched: 100 } },
    { at: '2025-08-29 09:30:00', action: 'invoice.issued', entityType: 'invoice', entityId: inv1Id, detail: { invoiceNo: 'INV-2082-0001', totalMinor: 33000000 } },
    { at: '2025-09-20 14:30:00', action: 'goods.returned', entityType: 'return', entityId: deliv1Id, detail: { piecesReturned: 5, variant: varBomberM.sku, reason: 'Stitch revision' } },
    { at: '2025-10-18 11:00:00', action: 'order.shortage_alert', entityType: 'order', entityId: order3Id, detail: { orderNo: 'ORD-2082-0003', shortagePcs: 45, variant: varShortageSKU.sku } },
  ];

  for (const entry of auditEntries) {
    const detailJson = JSON.stringify(entry.detail);
    safeInsert('audit_log', {
      at: entry.at,
      user_id: ownerId,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId,
      detail: detailJson,
      details: detailJson,
      details_json: detailJson,
      payload: detailJson,
      metadata: detailJson,
    });
  }

  db.exec('COMMIT;');
  db.exec('PRAGMA foreign_keys = ON;');

  console.log('\n[Master Seed] Success! Full factory scenario seeded with zero errors.');
} catch (error) {
  db.exec('ROLLBACK;');
  db.exec('PRAGMA foreign_keys = ON;');
  console.error('\n[Master Seed Error] Transaction rolled back:', error);
  process.exit(1);
}