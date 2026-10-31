import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, UserPlus, Search, X, Check, Power, 
  Hash, Calendar, AlertCircle, RefreshCw 
} from 'lucide-react';
import { api, type Employee } from '../api.ts';

interface EmployeesViewProps {
  onEmployeeAdded?: () => void;
  onEmployeeToggled?: () => void;
  onSelectEmployee?: (emp: Employee) => void;
}

export const EmployeesView: React.FC<EmployeesViewProps> = ({
  onEmployeeAdded,
  onEmployeeToggled,
  onSelectEmployee,
}) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active');

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [tailorNumberInput, setTailorNumberInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const loadEmployees = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getEmployees();
      setEmployees(res.employees || []);
    } catch (err: any) {
      console.error('Failed to load employees:', err);
      setError(err.message || 'Failed to load employee list');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEmployees();
  }, []);

  const suggestedNextNumber = useMemo(() => {
    const numbers = employees
      .map((e) => parseInt(e.tailorNumber.replace(/\D/g, ''), 10))
      .filter((n) => !isNaN(n));
    if (numbers.length === 0) return '01';
    const max = Math.max(...numbers);
    return String(max + 1).padStart(2, '0');
  }, [employees]);

  const handleOpenAddModal = () => {
    setTailorNumberInput(suggestedNextNumber);
    setNameInput('');
    setIsAddModalOpen(true);
  };

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tailorNumberInput.trim() || !nameInput.trim()) {
      setError('Tailor number and name are required.');
      return;
    }

    try {
      setIsSaving(true);
      setError(null);
      await api.createEmployee({
        tailorNumber: tailorNumberInput.trim(),
        name: nameInput.trim(),
      });

      setIsAddModalOpen(false);
      setSuccessMessage(`Tailor #${tailorNumberInput.trim()} registered successfully.`);
      setTimeout(() => setSuccessMessage(null), 3000);

      await loadEmployees();
      if (onEmployeeAdded) onEmployeeAdded();
    } catch (err: any) {
      console.error('Failed to create employee:', err);
      setError(err.message || 'Failed to add employee');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleStatus = async (emp: Employee) => {
    try {
      setError(null);
      await api.toggleEmployeeStatus(emp.id);

      setEmployees((prev) =>
        prev.map((e) => (e.id === emp.id ? { ...e, isActive: !e.isActive } : e))
      );

      setSuccessMessage(`Tailor #${emp.tailorNumber} marked as ${!emp.isActive ? 'Active' : 'Inactive'}.`);
      setTimeout(() => setSuccessMessage(null), 2500);

      if (onEmployeeToggled) onEmployeeToggled();
    } catch (err: any) {
      console.error('Failed to toggle status:', err);
      setError(err.message || 'Failed to update employee status');
    }
  };

  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      if (statusFilter === 'active' && !emp.isActive) return false;
      if (statusFilter === 'inactive' && emp.isActive) return false;

      if (searchFilter.trim()) {
        const q = searchFilter.toLowerCase();
        return (
          emp.tailorNumber.toLowerCase().includes(q) ||
          emp.name.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [employees, statusFilter, searchFilter]);

  const activeCount = employees.filter((e) => e.isActive).length;
  const inactiveCount = employees.length - activeCount;

  return (
    <div className="space-y-4 max-w-7xl mx-auto font-sans">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Users size={20} className="text-blue-600 dark:text-blue-400" />
            <span>Employee & Tailor Directory</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Manage factory floor tailors, active working status, and registration records.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleOpenAddModal}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs active:scale-95"
          >
            <UserPlus size={15} />
            <span>Add New Tailor</span>
          </button>

          <button
            type="button"
            onClick={loadEmployees}
            className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl transition"
            title="Reload directory"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2.5 sm:gap-3 text-xs">
        <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <span className="text-[10px] text-slate-400 uppercase font-bold block">Total Registered</span>
          <span className="text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5 block">
            {employees.length}
          </span>
        </div>
        <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase font-bold block">Active Floor Tailors</span>
          <span className="text-base font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 block">
            {activeCount}
          </span>
        </div>
        <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <span className="text-[10px] text-slate-400 uppercase font-bold block">Inactive / On Leave</span>
          <span className="text-base font-bold text-slate-500 mt-0.5 block">
            {inactiveCount}
          </span>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-3 sm:p-4 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setStatusFilter('active')}
            className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              statusFilter === 'active'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Active ({activeCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              statusFilter === 'all'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            All ({employees.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('inactive')}
            className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              statusFilter === 'inactive'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Inactive ({inactiveCount})
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          <input
            type="text"
            placeholder="Search Tailor # or name..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full pl-8 pr-8 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs focus:outline-none focus:border-blue-600"
          />
          {searchFilter && (
            <button
              onClick={() => setSearchFilter('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-400 rounded-xl border border-red-200 dark:border-red-900 text-xs font-semibold flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="font-bold ml-2">✕</button>
        </div>
      )}
      {successMessage && (
        <div className="p-3 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-400 rounded-xl border border-emerald-200 dark:border-emerald-900 text-xs font-semibold flex items-center gap-1.5">
          <Check size={14} />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Mobile Card List */}
      <div className="block md:hidden space-y-2.5">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading directory...</div>
        ) : filteredEmployees.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
            No employees match the current filter.
          </div>
        ) : (
          filteredEmployees.map((emp) => (
            <div
              key={emp.id}
              className="p-3.5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3 truncate">
                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900 flex items-center justify-center shrink-0">
                  <span className="font-mono font-bold text-sm text-blue-600 dark:text-blue-400">
                    #{emp.tailorNumber}
                  </span>
                </div>
                <div className="truncate">
                  <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">
                    {emp.name}
                  </h4>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span
                      className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
                        emp.isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${emp.isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                      {emp.isActive ? 'Active' : 'Inactive'}
                    </span>
                    {emp.createdAt && (
                      <span className="text-[10px] text-slate-400 font-mono">
                        Joined {new Date(emp.createdAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => handleToggleStatus(emp)}
                  className={`p-2 rounded-xl border transition ${
                    emp.isActive
                      ? 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300'
                      : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-500 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400'
                  }`}
                  title={emp.isActive ? 'Mark as Inactive' : 'Mark as Active'}
                >
                  <Power size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-500">Loading directory...</div>
        ) : filteredEmployees.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500">No employees match the current filter.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 font-mono text-[10px] uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                  <th className="py-3 px-4 w-20">Tailor #</th>
                  <th className="py-3 px-4 min-w-[200px]">Full Name</th>
                  <th className="py-3 px-4 w-32">Status</th>
                  <th className="py-3 px-4 w-40 font-sans">Date Registered</th>
                  <th className="py-3 px-4 text-right w-36 font-sans">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredEmployees.map((emp) => (
                  <tr
                    key={emp.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition"
                  >
                    <td className="py-3 px-4 font-mono font-bold text-blue-600 dark:text-blue-400">
                      #{emp.tailorNumber}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">
                      {emp.name}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                          emp.isActive
                            ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${emp.isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                        {emp.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                      {emp.createdAt ? new Date(emp.createdAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(emp)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition inline-flex items-center gap-1.5 ${
                          emp.isActive
                            ? 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                            : 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100'
                        }`}
                      >
                        <Power size={13} />
                        <span>{emp.isActive ? 'Deactivate' : 'Activate'}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-3">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-sm w-full p-5 border border-slate-200 dark:border-slate-800">
            <div className="flex justify-between items-center mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <UserPlus size={16} className="text-blue-600" />
                Add New Tailor
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateEmployee} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                  Tailor Number (#)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 05 or T-05"
                  value={tailorNumberInput}
                  onChange={(e) => setTailorNumberInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono font-bold text-sm focus:outline-none focus:border-blue-600"
                  required
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Suggested next available number: #{suggestedNextNumber}
                </span>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                  Tailor Full Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Ram Bahadur Shrestha"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs font-semibold focus:outline-none focus:border-blue-600"
                  required
                  autoFocus
                />
              </div>

              <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="flex-1 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold rounded-xl"
                  disabled={isSaving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-xs disabled:opacity-50"
                >
                  {isSaving ? 'Registering...' : 'Register Tailor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};