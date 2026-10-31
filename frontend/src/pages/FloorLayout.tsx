import React from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Package, Search, ArrowLeft, LogOut } from 'lucide-react';
import { staffApi } from '../api';

export function FloorLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const logout = async () => {
    try {
      await staffApi.logout();
    } catch {
      // Ignore network errors on logout
    }
    navigate('/pin-login');
  };

  const navItems = [
    { name: 'Bags', path: '/floor/bags', icon: Package },
    { name: 'Stock Lookup', path: '/floor/search', icon: Search },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans antialiased">
      {/* Top Header - Clean, uncrowded, direct link to Stock Matrix */}
      <header className="h-13 sm:h-14 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 sm:px-6 flex items-center justify-between sticky top-0 z-20 shadow-xs">
        <a
          href="/?tab=inventory"
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/80 transition active:scale-95"
          title="Return directly to Finished Stock Matrix"
        >
          <ArrowLeft size={14} className="text-blue-600 dark:text-blue-400" />
          <span>Stock Matrix</span>
        </a>

        {/* Desktop Tab Switcher (hidden on mobile, visible on desktop) */}
        <div className="hidden sm:flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
          {navItems.map((item) => {
            const active = location.pathname.startsWith(item.path);
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition ${
                  active
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <item.icon size={13} />
                <span>{item.name}</span>
              </button>
            );
          })}
        </div>

        {/* Sign Out */}
        <button
          onClick={logout}
          className="flex items-center gap-1 px-2 py-1.5 rounded-xl text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-semibold transition active:scale-95"
          title="Sign out of floor terminal"
        >
          <LogOut size={16} />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </header>

      {/* Main Content Area - padded bottom on mobile for the fixed nav */}
      <main className="flex-1 p-3.5 sm:p-6 max-w-4xl w-full mx-auto pb-24 sm:pb-8">
        <Outlet />
      </main>

      {/* Mobile Bottom Navigation Bar - Easy thumb targets */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 py-1.5 px-4 flex justify-around items-center z-30 shadow-lg">
        {navItems.map((item) => {
          const active = location.pathname.startsWith(item.path);
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`flex-1 flex flex-col items-center py-1 rounded-xl transition duration-150 active:scale-95 ${
                active
                  ? 'text-blue-600 dark:text-blue-400 font-bold'
                  : 'text-slate-500 dark:text-slate-400 font-medium'
              }`}
            >
              <div
                className={`p-1 rounded-lg transition ${
                  active ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400' : ''
                }`}
              >
                <item.icon size={20} />
              </div>
              <span className="text-[11px] mt-0.5 tracking-tight">{item.name}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}