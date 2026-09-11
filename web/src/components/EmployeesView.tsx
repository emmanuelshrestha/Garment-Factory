import React, { useState, useEffect } from 'react';
import { api, type Employee } from '../api.ts';

interface EmployeesViewProps {
  onEmployeeAdded?: () => void;
  onEmployeeToggled?: () => void;
}

export const EmployeesView: React.FC<EmployeesViewProps> = ({ onEmployeeAdded, onEmployeeToggled }) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  const [newTailorNumber, setNewTailorNumber] = useState<string>('');
  const [newName, setNewName] = useState<string>('');
  const [adding, setAdding] = useState<boolean>(false);

  const loadEmployees = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.getEmployees();
      setEmployees(response.employees);
    } catch (err: any) {
      console.error('Failed to load employees:', err);
      setError(err.message || 'Failed to load employees');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEmployees();
  }, []);

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTailorNumber.trim() || !newName.trim()) {
      setError('Tailor number and name are required');
      return;
    }

    try {
      setAdding(true);
      setError(null);
      await api.createEmployee({
        tailorNumber: newTailorNumber.trim(),
        name: newName.trim(),
      });
      
      setNewTailorNumber('');
      setNewName('');
      setShowAddForm(false);
      await loadEmployees();
      
      if (onEmployeeAdded) onEmployeeAdded();
    } catch (err: any) {
      console.error('Failed to create employee:', err);
      setError(err.message || 'Failed to create employee');
    } finally {
      setAdding(false);
    }
  };

  const handleToggleEmployee = async (id: number) => {
    try {
      await api.toggleEmployee(id);
      await loadEmployees();
      
      if (onEmployeeToggled) onEmployeeToggled();
    } catch (err: any) {
      console.error('Failed to toggle employee:', err);
      setError(err.message || 'Failed to update employee');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Employee Management</h2>
          <p className="text-sm text-slate-600">Add and manage tailors</p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-sm transition whitespace-nowrap"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
          </svg>
          Add Employee
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-100 text-red-800 rounded-xl border border-red-200 text-sm font-semibold">
          {error}
        </div>
      )}

      {/* Add Employee Form */}
      {showAddForm && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-slate-900">New Employee</h3>
            <button
              onClick={() => setShowAddForm(false)}
              className="text-slate-400 hover:text-slate-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <form onSubmit={handleAddEmployee} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Tailor Number *
                </label>
                <input
                  type="text"
                  value={newTailorNumber}
                  onChange={(e) => setNewTailorNumber(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g., TAIL-001"
                  disabled={adding}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Full Name *
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g., Ram Bahadur"
                  disabled={adding}
                  required
                />
              </div>
            </div>
            
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition"
                disabled={adding}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-sm transition flex items-center gap-1.5"
                disabled={adding}
              >
                {adding ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Adding...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                    </svg>
                    Add Employee
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Employees Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h3 className="font-bold text-slate-900">All Employees ({employees.length})</h3>
          <p className="text-sm text-slate-600 mt-1">
            Active employees are included in monthly earnings reports
          </p>
        </div>
        
        {loading ? (
          <div className="p-8 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-sm text-slate-600">Loading employees...</p>
          </div>
        ) : employees.length === 0 ? (
          <div className="p-8 text-center">
            <svg className="w-12 h-12 text-slate-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <p className="text-slate-600">No employees yet</p>
            <button
              onClick={() => setShowAddForm(true)}
              className="mt-3 text-sm text-blue-600 hover:text-blue-800 font-semibold"
            >
              Add your first employee →
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left py-3.5 px-6 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Tailor #
                  </th>
                  <th className="text-left py-3.5 px-6 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="text-left py-3.5 px-6 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="text-left py-3.5 px-6 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="text-left py-3.5 px-6 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {employees.map((employee) => (
                  <tr key={employee.id} className="hover:bg-slate-50">
                    <td className="py-4 px-6">
                      <div className="font-mono text-sm font-bold text-slate-900">
                        {employee.tailorNumber}
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="font-medium text-slate-900">{employee.name}</div>
                    </td>
                    <td className="py-4 px-6">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        employee.isActive 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {employee.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <div className="text-sm text-slate-600">{formatDate(employee.createdAt)}</div>
                    </td>
                    <td className="py-4 px-6">
                      <button
                        onClick={() => handleToggleEmployee(employee.id)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                          employee.isActive
                            ? 'bg-red-50 text-red-700 hover:bg-red-100'
                            : 'bg-green-50 text-green-700 hover:bg-green-100'
                        }`}
                      >
                        {employee.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};