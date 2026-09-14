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
      className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 rounded-md"
    >
      <LogOut className="w-4 h-4" />
      {loading ? 'Logging out...' : 'Logout'}
    </button>
  );
}
