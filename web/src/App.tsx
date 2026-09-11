import { useState, useEffect, useCallback } from 'react';
import {
  api,
  type Product,
  type ProductVariant,
  type StockSummary,
  type Customer,
  type Order,
  type Delivery,
  type Invoice,
  type Payment,
  type Expense,
  type Purchase,
  type DashboardSummary,
  type CuttingStockSummary,
} from './api.ts';
import { Sidebar, type TabKey } from './components/Sidebar.tsx';
import { DashboardView } from './components/DashboardView.tsx';
import { CatalogueView } from './components/CatalogueView.tsx';
import { InventoryMatrix } from './components/InventoryMatrix.tsx';
import { CuttingStockMatrix } from './components/CuttingStockMatrix.tsx';
import { OrderEntryMatrix } from './components/OrderEntryMatrix.tsx';
import { OrdersList } from './components/OrdersList.tsx';
import { DeliveriesView } from './components/DeliveriesView.tsx';
import { InvoicesView } from './components/InvoicesView.tsx';
import { PaymentsView } from './components/PaymentsView.tsx';
import { LedgerView } from './components/LedgerView.tsx';
import { EmployeesView } from './components/EmployeesView.tsx';
import { MonthlyEarningsView } from './components/MonthlyEarningsView.tsx';
import { EmployeeYearlyView } from './components/EmployeeYearlyView.tsx';
import { type Employee } from './api.ts';

export function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [ordersSubTab, setOrdersSubTab] = useState<'create' | 'list'>('create');
  const [selectedOrderForDispatch, setSelectedOrderForDispatch] = useState<Order | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);

  // Core state
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [stock, setStock] = useState<StockSummary[]>([]);
  const [cuttingStock, setCuttingStock] = useState<CuttingStockSummary[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [earningsSubTab, setEarningsSubTab] = useState<'monthly' | 'employees'>('monthly');
  const [selectedEmployeeForHistory, setSelectedEmployeeForHistory] = useState<Employee | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadAllData = useCallback(async () => {
    try {
      setError(null);
      const [
        dashRes,
        prodRes,
        varRes,
        stockRes,
        cuttingRes,
        custRes,
        ordRes,
        delRes,
        invRes,
        payRes,
        expRes,
        purRes,
        empRes,
      ] = await Promise.all([
        api.getDashboard().catch(() => ({ dashboard: null as any })),
        api.getProducts().catch(() => ({ products: [] })),
        api.getVariants().catch(() => ({ variants: [] })),
        api.getStockSummaries({ activeOnly: true }).catch(() => ({ summaries: [] })),
        api.getCuttingStockSummaries().catch(() => ({ summaries: [] })),
        api.getCustomers().catch(() => ({ customers: [] })),
        api.getOrders().catch(() => ({ orders: [] })),
        api.getDeliveries().catch(() => ({ deliveries: [] })),
        api.getInvoices().catch(() => ({ invoices: [] })),
        api.getPayments().catch(() => ({ payments: [] })),
        api.getExpenses().catch(() => ({ expenses: [] })),
        api.getPurchases().catch(() => ({ purchases: [] })),
        api.getEmployees().catch(() => ({ employees: [] })),
      ]);

      if (dashRes.dashboard) setDashboard(dashRes.dashboard);
      setProducts(prodRes.products);
      setVariants(varRes.variants);
      setStock(stockRes.summaries);
      setCuttingStock(cuttingRes.summaries);
      setCustomers(custRes.customers);
      setOrders(ordRes.orders);
      setDeliveries(delRes.deliveries);
      setInvoices(invRes.invoices);
      setPayments(payRes.payments);
      setExpenses(expRes.expenses);
      setPurchases(purRes.purchases);
      setEmployees(empRes.employees);
    } catch (err: any) {
      console.error('Data refresh failure:', err);
      setError(err.message || 'Failed to load factory state');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  const handleStartDeliveryFromOrder = (order: Order) => {
    setSelectedOrderForDispatch(order);
    setActiveTab('deliveries');
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-row font-sans text-slate-900 selection:bg-blue-600 selection:text-white">
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        onSelectTab={(tab) => {
          setActiveTab(tab);
          if (tab !== 'deliveries') setSelectedOrderForDispatch(null);
        }}
        redCount={dashboard?.inventory.redCount}
        shortageCount={dashboard?.orders.shortageVariantsCount}
        pendingChequesCount={dashboard?.cheques.pendingCount}
      />

      {/* Main Body */}
      <main className="flex-1 overflow-x-hidden overflow-y-auto flex flex-col justify-between">
        <div className="max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex-1">
          {error && (
            <div className="mb-6 p-4 bg-red-100 text-red-800 rounded-2xl border border-red-200 text-sm font-semibold flex justify-between items-center">
              <span>{error}</span>
              <button onClick={loadAllData} className="px-3 py-1 bg-red-200 hover:bg-red-300 rounded-lg text-xs">
                Retry
              </button>
            </div>
          )}

          {/* Tab 1: Dashboard */}
          {activeTab === 'dashboard' && (
            <DashboardView
              data={dashboard}
              loading={loading}
              onNavigate={(t) => {
                setActiveTab(t);
                if (t === 'orders') setOrdersSubTab('create');
              }}
              onRefresh={loadAllData}
            />
          )}

          {/* Tab 2: Catalogue */}
          {activeTab === 'catalogue' && (
            <CatalogueView />
          )}

          {/* Tab 3: Stock Matrix */}
          {activeTab === 'inventory' && (
            <InventoryMatrix
              products={products}
              stock={stock}
              onRefresh={loadAllData}
            />
          )}

          {/* Tab 3: Cutting Stock */}
          {activeTab === 'cutting' && (
            <CuttingStockMatrix
              products={products}
              stock={cuttingStock}
              onRefresh={loadAllData}
            />
          )}

          {/* Tab 3: Orders */}
          {activeTab === 'orders' && (
            <div className="space-y-6">
              <div className="flex space-x-2 border-b border-slate-200 pb-3">
                <button
                  onClick={() => setOrdersSubTab('create')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                    ordersSubTab === 'create'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
                  }`}
                >
                  + New Matrix Order
                </button>
                <button
                  onClick={() => setOrdersSubTab('list')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ${
                    ordersSubTab === 'list'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
                  }`}
                >
                  <span>All Orders</span>
                  <span className="bg-slate-200 text-slate-800 px-1.5 py-0.2 rounded-full text-[10px]">
                    {orders.length}
                  </span>
                </button>
              </div>

              {ordersSubTab === 'create' ? (
                <OrderEntryMatrix
                  customers={customers}
                  products={products}
                  variants={variants}
                  stock={stock}
                  onOrderCreated={() => {
                    loadAllData();
                    setOrdersSubTab('list');
                  }}
                />
              ) : (
                <OrdersList
                  orders={orders}
                  customers={customers}
                  invoices={invoices}
                  onRefresh={loadAllData}
                  onCreateDelivery={handleStartDeliveryFromOrder}
                />
              )}
            </div>
          )}

          {/* Tab 4: Deliveries */}
          {activeTab === 'deliveries' && (
            <DeliveriesView
              deliveries={deliveries}
              orders={orders}
              customers={customers}
              onRefresh={loadAllData}
              selectedOrderForDispatch={selectedOrderForDispatch}
              onClearSelectedOrder={() => setSelectedOrderForDispatch(null)}
            />
          )}

          {/* Tab 5: Invoices & Billing */}
          {activeTab === 'invoices' && (
            <InvoicesView
              invoices={invoices}
              customers={customers}
              onRefresh={loadAllData}
            />
          )}

          {/* Tab 6: Payments */}
          {activeTab === 'payments' && (
            <PaymentsView
              customers={customers}
              payments={payments}
              invoices={invoices}
              onRefresh={loadAllData}
            />
          )}

          {/* Tab 7: Expenses & Purchases */}
          {activeTab === 'ledger' && (
            <LedgerView
              expenses={expenses}
              purchases={purchases}
              onRefresh={loadAllData}
            />
          )}

          {/* Tab 8: Employee Earnings */}
          {activeTab === 'earnings' && (
            <div className="space-y-6">
              <div className="flex space-x-2 border-b border-slate-200 pb-3">
                <button
                  onClick={() => {
                    setEarningsSubTab('monthly');
                    setSelectedEmployeeForHistory(null);
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                    earningsSubTab === 'monthly' && !selectedEmployeeForHistory
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
                  }`}
                >
                  📅 Monthly Earnings & Dues
                </button>
                <button
                  onClick={() => {
                    setEarningsSubTab('employees');
                    setSelectedEmployeeForHistory(null);
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ${
                    earningsSubTab === 'employees' && !selectedEmployeeForHistory
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
                  }`}
                >
                  <span>👥 Employee Directory</span>
                  <span className="bg-slate-200 text-slate-800 px-1.5 py-0.2 rounded-full text-[10px]">
                    {employees.length}
                  </span>
                </button>
                {selectedEmployeeForHistory && (
                  <button
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 text-white shadow-sm flex items-center space-x-1"
                  >
                    <span>Yearly Record: {selectedEmployeeForHistory.name}</span>
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedEmployeeForHistory(null);
                      }}
                      className="ml-2 hover:bg-amber-700 px-1 rounded cursor-pointer"
                    >
                      ✕
                    </span>
                  </button>
                )}
              </div>

              {selectedEmployeeForHistory ? (
                <EmployeeYearlyView
                  employee={selectedEmployeeForHistory}
                  onBack={() => setSelectedEmployeeForHistory(null)}
                />
              ) : earningsSubTab === 'monthly' ? (
                <MonthlyEarningsView
                  employees={employees}
                  onSelectEmployee={(emp) => setSelectedEmployeeForHistory(emp)}
                  onEarningsChanged={loadAllData}
                />
              ) : (
                <EmployeesView
                  onEmployeeAdded={loadAllData}
                  onEmployeeToggled={loadAllData}
                />
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="w-full bg-slate-100 border-t border-slate-200 py-6 text-center text-xs text-slate-400 no-print mt-auto">
          Garment Factory Management System • Node.js 22 + React 19 + SQLite STRICT
        </footer>
      </main>
    </div>
  );
}

export default App;
