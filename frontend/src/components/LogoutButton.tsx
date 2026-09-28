import { useState } from 'react';
import { api } from '../api.ts';
import { LogOut } from 'lucide-react';

interface LogoutButtonProps {
  onLogout: () => void;
}

export function LogoutButton({ onLogout }: LogoutButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    if (!confirm('Are you sure you want to logout?')) return;
    
    setLoading(true);
    try {
      await api.logout();
    } catch (err) {
      console.error('Logout API failed:', err);
      // Continue with local logout anyway
    } finally {
      setLoading(false);
      onLogout();
    }
  };

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 rounded-xl transition duration-150 border border-slate-200 dark:border-slate-700/60"
    >
      <LogOut className="w-3.5 h-3.5" />
      <span>{loading ? 'Logging out...' : 'Logout'}</span>
    </button>
  );
}
