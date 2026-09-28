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
  PanelLeft,
  X
} from 'lucide-react';
import { ThemeToggle } from './ThemeToggle.tsx';

export type TabKey = 'dashboard' | 'catalogue' | 'inventory' | 'orders' | 'deliveries' | 'invoices' | 'payments' | 'ledger' | 'cutting' | 'earnings' | 'returns';

interface SidebarProps {
  activeTab: TabKey;
  onSelectTab: (tab: TabKey) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
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
  isMobileOpen = false,
  onCloseMobile,
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
      inventory: 'bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900/60',
      orders: 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900/60',
      deliveries: '',
      invoices: '',
      payments: 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900/60',
      ledger: '',
      cutting: '',
      earnings: '',
      returns: '',
    };
    return classes[key] || '';
  };

  const handleTabClick = (key: TabKey) => {
    onSelectTab(key);
    if (onCloseMobile) {
      onCloseMobile();
    }
  };

  const content = (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900">
      {/* Brand / Logo */}
      <div 
        className={`flex items-center ${isCollapsed ? 'justify-center px-2' : 'justify-between px-4'} h-16 border-b border-slate-200 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 transition`}
        onClick={() => handleTabClick('dashboard')}
      >
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-xl bg-blue-600 dark:bg-blue-500 flex items-center justify-center text-white font-black text-sm shadow-md">
            G
          </div>
          {(!isCollapsed || isMobileOpen) && (
            <div>
              <span className="font-extrabold text-base tracking-tight whitespace-nowrap text-slate-900 dark:text-slate-100">GarmentOS</span>
              <span className="hidden sm:inline-block ml-1.5 px-1.5 py-0.2 text-[9px] font-bold bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 rounded-md">ERP</span>
            </div>
          )}
        </div>

        {/* Mobile close button */}
        {isMobileOpen ? (
          <button
            onClick={(e) => { e.stopPropagation(); onCloseMobile?.(); }}
            className="md:hidden p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X size={20} />
          </button>
        ) : (
          <button 
            onClick={(e) => { e.stopPropagation(); onToggleCollapse(); }} 
            className="hidden md:flex p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition items-center justify-center"
            title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            {isCollapsed ? <PanelLeft size={18} strokeWidth={1.75} /> : <PanelLeftClose size={18} strokeWidth={1.75} />}
          </button>
        )}
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-2.5 py-3 space-y-1 overflow-y-auto">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          const hasBadge = tab.badge !== undefined && tab.badge > 0;
          
          return (
            <button
              key={tab.key}
              onClick={() => handleTabClick(tab.key)}
              title={isCollapsed && !isMobileOpen ? tab.label : undefined}
              className={`w-full flex items-center ${isCollapsed && !isMobileOpen ? 'justify-center px-2' : 'justify-between px-3'} py-2.5 rounded-xl text-xs font-semibold transition-all ${
                isActive
                  ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 shadow-2xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/80 dark:hover:bg-slate-800/80'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className={`${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'}`}>
                  {tab.icon}
                </span>
                {(!isCollapsed || isMobileOpen) && <span>{tab.label}</span>}
              </div>
              {(!isCollapsed || isMobileOpen) && hasBadge && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${badgeClass(tab.key)}`}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer / Theme & System Info */}
      <div className="p-3 border-t border-slate-200 dark:border-slate-800 flex flex-col items-center gap-2">
        <ThemeToggle variant={isCollapsed && !isMobileOpen ? 'compact' : 'segmented'} className="w-full justify-center" />

        {(!isCollapsed || isMobileOpen) && (
          <div className="text-[10px] text-slate-400 dark:text-slate-500 text-center mt-0.5">
            <p className="font-semibold text-slate-500 dark:text-slate-400">Garment Factory Suite</p>
            <p className="mt-0.5">SQLite STRICT Ledger</p>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop & Tablet Sidebar */}
      <aside className={`hidden md:flex ${isCollapsed ? 'w-16' : 'w-64'} border-r border-slate-200 dark:border-slate-800 min-h-screen flex-col shrink-0 sticky top-0 z-30 transition-all duration-200`}>
        {content}
      </aside>

      {/* Mobile Drawer Overlay */}
      {isMobileOpen && (
        <div 
          className="md:hidden fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs transition-opacity duration-200"
          onClick={onCloseMobile}
        >
          <div 
            className="w-72 max-w-[85vw] h-full shadow-2xl transition-transform duration-300 transform translate-x-0"
            onClick={(e) => e.stopPropagation()}
          >
            {content}
          </div>
        </div>
      )}
    </>
  );
};
