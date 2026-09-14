import React from 'react';
import {
  LayoutDashboard,
  PackageSearch,
  Grid3X3,
  Scissors,
  ShoppingBag,
  Truck,
  FileText,
  CreditCard,
  Receipt,
  Users,
  PanelLeftClose,
  PanelLeft
} from 'lucide-react';

export type TabKey = 'dashboard' | 'catalogue' | 'inventory' | 'orders' | 'deliveries' | 'invoices' | 'payments' | 'ledger' | 'cutting' | 'earnings' | 'returns';

interface SidebarProps {
  activeTab: TabKey;
  onSelectTab: (tab: TabKey) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  redCount?: number;
  shortageCount?: number;
  pendingChequesCount?: number;
}

interface TabConfig {
  key: TabKey;
  label: string;
  icon: React.ReactNode;
  badge?: number;
}

const iconProps = {
  size: 18,
  strokeWidth: 1.75,
};

const getIcon = (key: TabKey): React.ReactNode => {
  const icons: Record<TabKey, React.ReactNode> = {
    dashboard: <LayoutDashboard {...iconProps} />,
    catalogue: <PackageSearch {...iconProps} />,
    inventory: <Grid3X3 {...iconProps} />,
    cutting: <Scissors {...iconProps} />,
    orders: <ShoppingBag {...iconProps} />,
    deliveries: <Truck {...iconProps} />,
    invoices: <FileText {...iconProps} />,
    payments: <CreditCard {...iconProps} />,
    returns: <Receipt {...iconProps} />,
    ledger: <Receipt {...iconProps} />,
    earnings: <Users {...iconProps} />,
  };
  return icons[key];
};

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  isCollapsed,
  onToggleCollapse,
  redCount = 0,
  shortageCount = 0,
  pendingChequesCount = 0,
}) => {
  const tabs: TabConfig[] = [
    { key: 'dashboard', label: 'Dashboard', icon: getIcon('dashboard') },
    { key: 'catalogue', label: 'Catalogue', icon: getIcon('catalogue') },
    { key: 'inventory', label: 'Stock Matrix', icon: getIcon('inventory'), badge: redCount },
    { key: 'cutting', label: 'Cutting Stock', icon: getIcon('cutting') },
    { key: 'orders', label: 'Orders', icon: getIcon('orders'), badge: shortageCount },
    { key: 'deliveries', label: 'Deliveries', icon: getIcon('deliveries') },
    { key: 'invoices', label: 'Invoices & Billing', icon: getIcon('invoices') },
    { key: 'payments', label: 'Payments & Cheques', icon: getIcon('payments'), badge: pendingChequesCount },
    { key: 'returns', label: 'Returns', icon: getIcon('returns') },
    { key: 'ledger', label: 'Expenses', icon: getIcon('ledger') },
    { key: 'earnings', label: 'Employee Earnings', icon: getIcon('earnings') },
  ];

  const badgeClass = (key: TabKey): string => {
    const classes: Record<TabKey, string> = {
      dashboard: '',
      catalogue: '',
      inventory: 'bg-red-50 text-red-600 border-red-200',
      orders: 'bg-amber-50 text-amber-600 border-amber-200',
      deliveries: '',
      invoices: '',
      payments: 'bg-blue-50 text-blue-600 border-blue-200',
      ledger: '',
      cutting: '',
      earnings: '',
      returns: '',
    };
    return classes[key] || '';
  };

  return (
    <aside className={`${isCollapsed ? 'w-16' : 'w-64'} bg-white border-r border-slate-200 min-h-screen flex flex-col shrink-0 sticky top-0 z-30 transition-all duration-200`}>
      {/* Brand / Logo */}
      <div 
        className={`flex items-center ${isCollapsed ? 'justify-center px-2' : 'justify-between px-4'} h-16 border-b border-slate-200 cursor-pointer hover:bg-slate-50 transition`}
        onClick={() => onSelectTab('dashboard')}
      >
        {!isCollapsed && (
          <span className="font-bold text-base tracking-tight whitespace-nowrap text-slate-900">GarmentOS</span>
        )}
        <button 
          onClick={(e) => { e.stopPropagation(); onToggleCollapse(); }} 
          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition flex items-center justify-center"
          title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          {isCollapsed ? <PanelLeft size={18} strokeWidth={1.75} /> : <PanelLeftClose size={18} strokeWidth={1.75} />}
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          const hasBadge = tab.badge !== undefined && tab.badge > 0;
          
          return (
            <button
              key={tab.key}
              onClick={() => onSelectTab(tab.key)}
              title={isCollapsed ? tab.label : undefined}
              className={`w-full flex items-center ${isCollapsed ? 'justify-center px-2' : 'justify-between px-3'} py-2.5 rounded-lg text-xs font-medium transition-all ${
                isActive
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className={`${isActive ? 'text-blue-600' : 'text-slate-500'}`}>
                  {tab.icon}
                </span>
                {!isCollapsed && <span>{tab.label}</span>}
              </div>
              {!isCollapsed && hasBadge && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${badgeClass(tab.key)}`}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer / System Info */}
      {!isCollapsed && (
        <div className="p-4 border-t border-slate-200 text-[11px] text-slate-400 text-center">
          <p className="font-medium text-slate-500">Node.js 22 + React 19</p>
          <p className="mt-0.5">SQLite STRICT Ledger</p>
        </div>
      )}
    </aside>
  );
};
