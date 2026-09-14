import { useState, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
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

// Auth hook
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

// Main App
export function App() {
  const { isAuthenticated, user, login, logout } = useAuth();
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

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <LoginPage onLogin={login} />;
  }

  // Render loading/error states
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
    <div className="min-h-screen bg-slate-100 flex flex-row font-sans text-slate-900 selection:bg-blue-600 selection:text-white">
      <Sidebar
        activeTab={activeTab}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        onSelectTab={(tab) => {
          setActiveTab(tab);
          if (tab !== 'deliveries') setSelectedOrderForDispatch(null);
        }}
        redCount={dashboard?.inventory?.redCount ?? 0}
        shortageCount={dashboard?.orders?.shortageVariantsCount ?? 0}
        pendingChequesCount={dashboard?.cheques?.pendingCount ?? 0}
      />

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

          <header className="mb-6">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold text-slate-800">
                {activeTab === 'dashboard' && 'Operations Briefing'}
                {activeTab === 'catalogue' && 'Product Catalogue'}
                {activeTab === 'inventory' && 'Finished Stock'}
                {activeTab === 'cutting' && 'Cutting Stock'}
                {activeTab === 'orders' && 'Orders'}
                {activeTab === 'deliveries' && 'Deliveries'}
                {activeTab === 'invoices' && 'Invoices & Billing'}
                {activeTab === 'payments' && 'Payments'}
                {activeTab === 'ledger' && 'Expenses & Purchases'}
                {activeTab === 'earnings' && 'Employee Earnings'}
                {activeTab === 'returns' && 'Returns'}
              </h1>
              <div className="flex items-center gap-4">
                {user && (
                  <span className="text-sm text-slate-600">
                    Welcome, <span className="font-medium">{user.fullName || user.username}</span>
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

          {activeTab === 'ledger' && (
            <LedgerView
              expenses={expenses}
              purchases={purchases}
              onRefresh={loadAllData}
            />
          )}

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
                  Monthly Earnings & Dues
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
                  <span>Employee Directory</span>
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

        <footer className="w-full bg-slate-100 border-t border-slate-200 py-6 text-center text-xs text-slate-400 no-print mt-auto">
          Garment Factory Management System • Node.js 22 + React 19 + SQLite STRICT
        </footer>
      </main>
    </div>
  );
}

export default App;