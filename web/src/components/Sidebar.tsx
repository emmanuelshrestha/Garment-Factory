import React from 'react';

export type TabKey = 'dashboard' | 'catalogue' | 'inventory' | 'orders' | 'deliveries' | 'invoices' | 'payments' | 'ledger' | 'cutting' | 'earnings';

interface SidebarProps {
  activeTab: TabKey;
  onSelectTab: (tab: TabKey) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  redCount?: number;
  shortageCount?: number;
  pendingChequesCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  isCollapsed,
  onToggleCollapse,
  redCount = 0,
  shortageCount = 0,
  pendingChequesCount = 0,
}) => {
  const tabs: { key: TabKey; label: string; icon: string; badge?: number; badgeColor?: string }[] = [
    { key: 'dashboard', label: 'Dashboard', icon: '📊' },
    { key: 'catalogue', label: 'Catalogue', icon: '🏷️' },
    { key: 'inventory', label: 'Stock Matrix', icon: '📦', badge: redCount, badgeColor: 'bg-red-500 text-white' },
    { key: 'cutting', label: 'Cutting Stock', icon: '✂️' },
    { key: 'orders', label: 'Orders', icon: '📋', badge: shortageCount, badgeColor: 'bg-amber-500 text-white' },
    { key: 'deliveries', label: 'Deliveries', icon: '🚚' },
    { key: 'invoices', label: 'Invoices & Billing', icon: '📄' },
    { key: 'payments', label: 'Payments & Cheques', icon: '💳', badge: pendingChequesCount, badgeColor: 'bg-blue-500 text-white' },
    { key: 'ledger', label: 'Expenses', icon: '📈' },
    { key: 'earnings', label: 'Employee Earnings', icon: '👔' },
  ];

  return (
    <aside className={`${isCollapsed ? 'w-20' : 'w-64'} bg-slate-900 text-white border-r border-slate-800 min-h-screen flex flex-col shrink-0 sticky top-0 z-30 shadow-lg transition-all`}>
      {/* Brand / Logo */}
      <div 
        className="flex items-center justify-between px-6 h-20 border-b border-slate-800 cursor-pointer hover:bg-slate-800/50 transition"
        onClick={() => onSelectTab('dashboard')}
      >
        <div className="flex items-center space-x-3 overflow-hidden">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-white text-lg shadow-md shadow-blue-600/30 shrink-0">
            G
          </div>
          {!isCollapsed && (
            <div>
              <span className="font-bold text-sm tracking-tight block whitespace-nowrap">Garment Factory OS</span>
              <span className="text-xs text-slate-400 block whitespace-nowrap">Operations & Commercial</span>
            </div>
          )}
        </div>
        <button 
          onClick={(e) => { e.stopPropagation(); onToggleCollapse(); }} 
          className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          {isCollapsed ? '➡️' : '⬅️'}
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto scrollbar-hide">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => onSelectTab(tab.key)}
              title={isCollapsed ? tab.label : undefined}
              className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} px-4 py-3 rounded-xl text-xs font-semibold transition-all ${
                isActive
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
              }`}
            >
              <div className="flex items-center space-x-3">
                <span className="text-base">{tab.icon}</span>
                {!isCollapsed && <span>{tab.label}</span>}
              </div>
              {!isCollapsed && tab.badge !== undefined && tab.badge > 0 && (
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    tab.badgeColor ?? 'bg-slate-700 text-white'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer / System Info */}
      {!isCollapsed && (
        <div className="p-4 border-t border-slate-800 text-[11px] text-slate-400 text-center">
          <p className="font-medium text-slate-300">Node.js 22 + React 19</p>
          <p className="mt-0.5">SQLite STRICT Ledger</p>
        </div>
      )}
    </aside>
  );
};
