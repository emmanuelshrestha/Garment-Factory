import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Menu } from 'lucide-react';
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
  type Employee,
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
import { ReturnsView } from './components/ReturnsView.tsx';
import { LoginPage } from './components/LoginPage.tsx';
import { LogoutButton } from './components/LogoutButton.tsx';
import { ThemeToggle } from './components/ThemeToggle.tsx';
import { ExpensesView } from './components/ExpensesView.tsx';

function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem('isAuthenticated') === 'true';
  });
  const [user, setUser] = useState(() => {
    try {
      const userData = localStorage.getItem('user');
      return userData ? JSON.parse(userData) : null;
    } catch {
      return null;
    }
  });

  const login = (userData: { id: number; username: string; fullName: string }) => {
    localStorage.setItem('isAuthenticated', 'true');
    localStorage.setItem('user', JSON.stringify(userData));
    setIsAuthenticated(true);
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('isAuthenticated');
    localStorage.removeItem('user');
    setIsAuthenticated(false);
    setUser(null);
  };

  return { isAuthenticated, user, login, logout };
}

export function App() {
  const { isAuthenticated, user, login, logout } = useAuth();
  
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab') as TabKey;
    const validTabs: TabKey[] = [
      'dashboard', 'catalogue', 'inventory', 'cutting', 'orders', 
      'deliveries', 'invoices', 'payments', 'ledger', 'earnings', 'returns'
    ];
    return validTabs.includes(tabParam) ? tabParam : 'dashboard';
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('tab')) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const [ordersSubTab, setOrdersSubTab] = useState<'create' | 'list'>('create');
  const [selectedOrderForDispatch, setSelectedOrderForDispatch] = useState<Order | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);

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
  const [ledgerSubTab, setLedgerSubTab] = useState<'expenses' | 'purchases'>('expenses');
  const [selectedSupplierForHistory, setSelectedSupplierForHistory] = useState<string | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadAllData = useCallback(async () => {
    try {
      setError(null);
      const results = await Promise.all([
        api.getDashboard().catch(() => ({ dashboard: null })),
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

      if (results[0].dashboard) setDashboard(results[0].dashboard);
      setProducts(results[1].products);
      setVariants(results[2].variants);
      setStock(results[3].summaries);
      setCuttingStock(results[4].summaries);
      setCustomers(results[5].customers);
      setOrders(results[6].orders);
      setDeliveries(results[7].deliveries);
      setInvoices(results[8].invoices);
      setPayments(results[9].payments);
      setExpenses(results[10].expenses);
      setPurchases(results[11].purchases);
      setEmployees(results[12].employees);
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

  const handleRefresh = async () => {
    try {
      const { dashboard } = await api.getDashboard();
      setDashboard(dashboard);
    } catch (err) {
      console.error('Refresh error:', err);
    }
  };

  if (!isAuthenticated) {
    return <LoginPage onLogin={login} />;
  }

  if (loading && !dashboard) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto text-blue-600" />
          <p className="mt-2 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white p-8 rounded-lg shadow-md text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button onClick={handleRefresh} className="px-4 py-2 bg-blue-600 text-white rounded">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex flex-col md:flex-row font-sans text-slate-900 dark:text-slate-100 selection:bg-blue-600 selection:text-white transition-colors duration-150">
      <div className="md:hidden flex items-center justify-between px-4 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-20 shadow-2xs">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setIsMobileSidebarOpen(true)}
            className="p-1.5 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            aria-label="Open Navigation Menu"
          >
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-blue-600 dark:bg-blue-500 flex items-center justify-center text-white font-black text-xs shadow-sm">
              G
            </div>
            <span className="font-extrabold text-base tracking-tight text-slate-900 dark:text-slate-100">GarmentOS</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle variant="compact" />
          <LogoutButton onLogout={logout} />
        </div>
      </div>

      <Sidebar
        activeTab={activeTab}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        onSelectTab={(tab) => {
          setActiveTab(tab);
          if (tab !== 'deliveries') setSelectedOrderForDispatch(null);
          if (tab !== 'ledger') setSelectedSupplierForHistory(null);
        }}
        redCount={dashboard?.inventory?.redCount ?? 0}
        shortageCount={dashboard?.orders?.shortageVariantsCount ?? 0}
        pendingChequesCount={dashboard?.cheques?.pendingCount ?? 0}
      />

      <main className="flex-1 overflow-x-hidden overflow-y-auto flex flex-col justify-between min-w-0">
        <div className="max-w-7xl w-full mx-auto p-3 sm:p-6 lg:p-8 flex-1">
          {error && (
            <div className="mb-6 p-4 bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300 rounded-2xl border border-red-200 dark:border-red-900/60 text-sm font-semibold flex justify-between items-center">
              <span>{error}</span>
              <button onClick={loadAllData} className="px-3 py-1 bg-red-200 dark:bg-red-900/60 hover:bg-red-300 dark:hover:bg-red-800 rounded-lg text-xs">
                Retry
              </button>
            </div>
          )}

          <header className="mb-4 sm:mb-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">
                  {activeTab === 'dashboard' && 'Operations Briefing'}
                  {activeTab === 'catalogue' && 'Product Catalogue'}
                  {activeTab === 'inventory' && 'Finished Stock'}
                  {activeTab === 'cutting' && 'Cutting Stock'}
                  {activeTab === 'orders' && 'Orders'}
                  {activeTab === 'deliveries' && 'Deliveries'}
                  {activeTab === 'invoices' && 'Invoices & Billing'}
                  {activeTab === 'payments' && 'Customer Collections & Cheques'}
                  {activeTab === 'ledger' && 'Expenses & Purchases'}
                  {activeTab === 'earnings' && 'Employee Earnings'}
                  {activeTab === 'returns' && 'Returns'}
                </h1>
              </div>
              <div className="hidden md:flex items-center gap-3">
                <ThemeToggle variant="segmented" />
                {user && (
                  <span className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                    Welcome, <span className="font-semibold text-slate-800 dark:text-slate-200">{user.fullName || user.username}</span>
                  </span>
                )}
                <LogoutButton onLogout={logout} />
              </div>
            </div>
          </header>

          {activeTab === 'dashboard' && (
            <DashboardView
              data={dashboard}
              loading={loading}
              onNavigate={(t) => {
                setActiveTab(t);
                if (t === 'orders') setOrdersSubTab('create');
              }}
              onRefresh={handleRefresh}
            />
          )}

          {activeTab === 'catalogue' && <CatalogueView />}

          {activeTab === 'inventory' && (
            <InventoryMatrix
              products={products}
              stock={stock}
              onRefresh={loadAllData}
            />
          )}

          {activeTab === 'cutting' && (
            <CuttingStockMatrix
              products={products}
              stock={cuttingStock}
              onRefresh={loadAllData}
            />
          )}

          {activeTab === 'orders' && (
            <div className="space-y-6">
              <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3 overflow-x-auto no-scrollbar">
                <button
                  onClick={() => setOrdersSubTab('create')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap shrink-0 ${
                    ordersSubTab === 'create'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
                  }`}
                >
                  + New Matrix Order
                </button>
                <button
                  onClick={() => setOrdersSubTab('list')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 whitespace-nowrap shrink-0 ${
                    ordersSubTab === 'list'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <span>All Orders</span>
                  <span className="bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-1.5 py-0.2 rounded-full text-[10px]">
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

          {activeTab === 'invoices' && (
            <InvoicesView
              invoices={invoices}
              customers={customers}
              onRefresh={loadAllData}
            />
          )}

          {activeTab === 'payments' && (
            <PaymentsView
              customers={customers}
              payments={payments}
              invoices={invoices}
              onRefresh={loadAllData}
            />
          )}

          {/* Expenses & Purchases Tab */}
          {activeTab === 'ledger' && (
            <div className="space-y-6">
              <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3 overflow-x-auto no-scrollbar">
                <button
                  type="button"
                  onClick={() => {
                    setLedgerSubTab('expenses');
                    setSelectedSupplierForHistory(null);
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap shrink-0 ${
                    ledgerSubTab === 'expenses' && !selectedSupplierForHistory
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
                  }`}
                >
                  Operating Expenses
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLedgerSubTab('purchases');
                    setSelectedSupplierForHistory(null);
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 whitespace-nowrap shrink-0 ${
                    ledgerSubTab === 'purchases' && !selectedSupplierForHistory
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <span>Raw Materials & Purchases</span>
                  <span className="bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-1.5 py-0.2 rounded-full text-[10px]">
                    {purchases.length}
                  </span>
                </button>
                {selectedSupplierForHistory && (
                  <button
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 text-white shadow-sm flex items-center space-x-1 whitespace-nowrap shrink-0"
                  >
                    <span>Supplier Record: {selectedSupplierForHistory}</span>
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedSupplierForHistory(null);
                      }}
                      className="ml-2 hover:bg-amber-700 px-1 rounded cursor-pointer"
                    >
                      ✕
                    </span>
                  </button>
                )}
              </div>

              {ledgerSubTab === 'expenses' && !selectedSupplierForHistory ? (
                <ExpensesView expenses={expenses} onRefresh={loadAllData} />
              ) : (
                <LedgerView
                  expenses={expenses}
                  purchases={purchases}
                  onRefresh={loadAllData}
                  selectedSupplier={selectedSupplierForHistory}
                  onSelectSupplier={(name) => setSelectedSupplierForHistory(name)}
                  onBack={() => setSelectedSupplierForHistory(null)}
                />
              )}
            </div>
          )}

          {activeTab === 'earnings' && (
            <div className="space-y-6">
              <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3 overflow-x-auto no-scrollbar">
                <button
                  onClick={() => {
                    setEarningsSubTab('monthly');
                    setSelectedEmployeeForHistory(null);
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap shrink-0 ${
                    earningsSubTab === 'monthly' && !selectedEmployeeForHistory
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
                  }`}
                >
                  Monthly Earnings & Dues
                </button>
                <button
                  onClick={() => {
                    setEarningsSubTab('employees');
                    setSelectedEmployeeForHistory(null);
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 whitespace-nowrap shrink-0 ${
                    earningsSubTab === 'employees' && !selectedEmployeeForHistory
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <span>Employee Directory</span>
                  <span className="bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-1.5 py-0.2 rounded-full text-[10px]">
                    {employees.length}
                  </span>
                </button>
                {selectedEmployeeForHistory && (
                  <button
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 text-white shadow-sm flex items-center space-x-1 whitespace-nowrap shrink-0"
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

          {activeTab === 'returns' && (
            <ReturnsView
              deliveries={deliveries}
              customers={customers}
              variants={variants}
              invoices={invoices}
              onRefresh={loadAllData}
            />
          )}
        </div>

        <footer className="w-full bg-slate-100 dark:bg-slate-900/60 border-t border-slate-200 dark:border-slate-800 py-6 text-center text-xs text-slate-400 dark:text-slate-500 no-print mt-auto">
          Garment Factory Management System • Node.js 22 + React 19 + SQLite STRICT
        </footer>
      </main>
    </div>
  );
}

export default App;