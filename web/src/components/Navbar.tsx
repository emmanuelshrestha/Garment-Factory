import React from 'react';

export type TabKey = 'dashboard' | 'catalogue' | 'inventory' | 'orders' | 'deliveries' | 'invoices' | 'payments' | 'ledger' | 'cutting' | 'earnings';

interface NavbarProps {
  activeTab: TabKey;
  onSelectTab: (tab: TabKey) => void;
  redCount?: number;
  shortageCount?: number;
  pendingChequesCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onSelectTab,
  redCount = 0,
  shortageCount = 0,
  pendingChequesCount = 0,
}) => {
  const tabs: { key: TabKey; label: string; badge?: number; badgeColor?: string }[] = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'catalogue', label: 'Catalogue' },
    { key: 'inventory', label: 'Stock Matrix', badge: redCount, badgeColor: 'bg-red-500 text-white' },
    { key: 'cutting', label: 'Cutting Stock' },
    { key: 'orders', label: 'Orders', badge: shortageCount, badgeColor: 'bg-amber-500 text-white' },
    { key: 'deliveries', label: 'Deliveries' },
    { key: 'invoices', label: 'Invoices & Billing' },
    { key: 'payments', label: 'Payments & Cheques', badge: pendingChequesCount, badgeColor: 'bg-blue-500 text-white' },
    { key: 'ledger', label: 'Expenses' },
    { key: 'earnings', label: 'Employee Earnings' },
  ];

  return (
    <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-30 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo / Brand */}
          <div className="flex items-center space-x-3 cursor-pointer shrink-0" onClick={() => onSelectTab('dashboard')}>
            <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center font-bold text-white text-base">
              G
            </div>
            <div className="hidden sm:block">
              <span className="font-bold text-sm tracking-tight block">Garment Factory OS</span>
              <span className="text-xs text-slate-400 block -mt-1">Operations & Commercial</span>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex space-x-0.5 overflow-x-auto py-2 scrollbar-hide">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => onSelectTab(tab.key)}
                  className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <span>{tab.label}</span>
                  {tab.badge !== undefined && tab.badge > 0 && (
                    <span
                      className={`px-1.5 rounded-full text-[10px] font-bold ${
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
        </div>
      </div>
    </header>
  );
};