import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  X,
  Undo2,
  Menu
} from 'lucide-react';

export type TabKey = 'dashboard' | 'catalogue' | 'inventory' | 'orders' | 'deliveries' | 'invoices' | 'payments' | 'ledger' | 'cutting' | 'earnings' | 'returns';

interface SidebarProps {
  activeTab: TabKey;
  onSelectTab: (tab: TabKey) => void;
  user?: { role: 'owner' | 'staff' } | null;
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
  size: 20,
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
    returns: <Undo2 {...iconProps} />,
    ledger: <Receipt {...iconProps} />,
    earnings: <Users {...iconProps} />,
  };
  return icons[key];
};

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  user = null,
  isCollapsed,
  onToggleCollapse,
  isMobileOpen = false,
  onCloseMobile,
  redCount = 0,
  shortageCount = 0,
  pendingChequesCount = 0,
}) => {
  // Draggable sidebar width state with persistence
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const saved = localStorage.getItem('garment_sidebar_width');
    const parsed = saved ? parseInt(saved, 10) : 260;
    return isNaN(parsed) || parsed < 200 || parsed > 450 ? 260 : parsed;
  });

  const [isResizing, setIsResizing] = useState<boolean>(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback((e: MouseEvent) => {
    if (isResizing) {
      const newWidth = Math.min(Math.max(e.clientX, 200), 450);
      setSidebarWidth(newWidth);
      localStorage.setItem('garment_sidebar_width', newWidth.toString());
    }
  }, [isResizing]);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResizing);
      document.body.classList.add('select-none', 'cursor-col-resize');
    } else {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
      document.body.classList.remove('select-none', 'cursor-col-resize');
    }
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
      document.body.classList.remove('select-none', 'cursor-col-resize');
    };
  }, [isResizing, resize, stopResizing]);

  // Tabs a floor worker must never see: money, billing, costs and reports[cite: 12].
  const STAFF_HIDDEN: ReadonlySet<TabKey> = new Set<TabKey>([
    'invoices',
    'payments',
    'ledger',
    'earnings',
    'returns',
    'catalogue',
  ]);

  const allTabs: TabConfig[] = [
    { key: 'dashboard', label: 'Dashboard', icon: getIcon('dashboard') },
    { key: 'catalogue', label: 'Catalogue', icon: getIcon('catalogue') },
    { key: 'inventory', label: 'Stock Matrix', icon: getIcon('inventory'), badge: redCount },
    { key: 'cutting', label: 'Cutting Stock', icon: getIcon('cutting') },
    { key: 'orders', label: 'Orders', icon: getIcon('orders'), badge: shortageCount },
    { key: 'deliveries', label: 'Deliveries', icon: getIcon('deliveries') },
    { key: 'invoices', label: 'Invoices & Billing', icon: getIcon('invoices') },
    { key: 'payments', label: 'Customer Collections & Cheques', icon: getIcon('payments'), badge: pendingChequesCount },
    { key: 'returns', label: 'Returns', icon: getIcon('returns') },
    { key: 'ledger', label: 'Expenses', icon: getIcon('ledger') },
    { key: 'earnings', label: 'Employee Earnings', icon: getIcon('earnings') },
  ];

  const tabs: TabConfig[] =
    user?.role === 'staff' ? allTabs.filter((tab) => !STAFF_HIDDEN.has(tab.key)) : allTabs;

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
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 relative">
      {/* ── Header: Logo when open, ONLY Three Lines (Menu) when closed ── */}
      <div 
        className={`flex items-center ${isCollapsed && !isMobileOpen ? 'justify-center px-0' : 'justify-between px-4'} h-16 border-b border-slate-200 dark:border-slate-800 transition-colors`}
      >
        {isCollapsed && !isMobileOpen ? (
          /* ONLY THE THREE LINES WHEN COLLAPSED (NO LOGO) */
          <button
            type="button"
            onClick={onToggleCollapse}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer mx-auto"
            title="Expand Sidebar"
            aria-label="Expand Sidebar"
          >
            <Menu size={22} strokeWidth={2} />
          </button>
        ) : (
          /* FULL LOGO & COLLAPSE BUTTON WHEN OPEN */
          <>
            <div 
              className="flex items-center space-x-2.5 cursor-pointer hover:opacity-85 transition"
              onClick={() => handleTabClick('dashboard')}
            >
              <div className="w-8 h-8 rounded-xl bg-blue-600 dark:bg-blue-500 flex items-center justify-center text-white font-black text-sm shadow-md shrink-0">
                G
              </div>
              <div className="min-w-0">
                <span className="font-extrabold text-base tracking-tight whitespace-nowrap text-slate-900 dark:text-slate-100 block">
                  GarmentOS
                </span>
              </div>
            </div>

            {isMobileOpen ? (
              <button
                type="button"
                onClick={onCloseMobile}
                className="md:hidden p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <X size={20} />
              </button>
            ) : (
              <button 
                type="button"
                onClick={onToggleCollapse} 
                className="hidden md:flex p-1.5 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition items-center justify-center cursor-pointer"
                title="Collapse Sidebar"
              >
                <Menu size={20} strokeWidth={2} />
              </button>
            )}
          </>
        )}
      </div>

      {/* ── Navigation Links (Centered when collapsed, Left-aligned when open) ── */}
      <nav className="flex-1 px-2.5 py-3 space-y-1.5 overflow-y-auto">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          const hasBadge = tab.badge !== undefined && tab.badge > 0;
          
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => handleTabClick(tab.key)}
              title={isCollapsed && !isMobileOpen ? tab.label : undefined}
              className={`w-full flex items-center ${
                isCollapsed && !isMobileOpen 
                  ? 'justify-center px-0 py-3' 
                  : 'justify-between px-3 py-2.5 text-left'
              } rounded-xl text-xs transition-all cursor-pointer ${
                isActive
                  ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 shadow-2xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/80 dark:hover:bg-slate-800/80 font-semibold'
              }`}
            >
              <div className={`flex items-center min-w-0 ${isCollapsed && !isMobileOpen ? 'justify-center w-full' : 'gap-2.5 flex-1 text-left'}`}>
                <span className={`shrink-0 flex items-center justify-center ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'}`}>
                  {tab.icon}
                </span>
                {(!isCollapsed || isMobileOpen) && (
                  <span className="text-left leading-tight break-words min-w-0">
                    {tab.label}
                  </span>
                )}
              </div>
              {(!isCollapsed || isMobileOpen) && hasBadge && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ml-1.5 ${badgeClass(tab.key)}`}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* ── Footer / System Info (No theme toggle) ── */}
      {(!isCollapsed || isMobileOpen) && (
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 text-[10px] text-slate-400 dark:text-slate-500 text-center">
          <p className="font-semibold text-slate-500 dark:text-slate-400">Garment Factory Suite</p>
          <p className="mt-0.5">SQLite STRICT Ledger</p>
        </div>
      )}

      {/* ── Draggable Right Border Resize Handle (Desktop Only) ── */}
      {!isCollapsed && (
        <div 
          onMouseDown={startResizing}
          className="hidden md:block absolute top-0 right-0 w-2 h-full cursor-col-resize hover:bg-blue-500/40 active:bg-blue-600 transition-colors z-40 group"
          title="Click and drag to resize sidebar"
        >
          <div className="w-[1px] h-full mx-auto bg-transparent group-hover:bg-blue-500/80" />
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop & Tablet Dynamic Resizable Sidebar */}
      <aside 
        ref={sidebarRef}
        style={{ width: isCollapsed ? 64 : sidebarWidth }}
        className="hidden md:flex border-r border-slate-200 dark:border-slate-800 min-h-screen flex-col shrink-0 sticky top-0 z-30 transition-[width] duration-100 ease-out"
      >
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