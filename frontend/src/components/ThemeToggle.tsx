import React from 'react';
import { Sun, Moon, Laptop } from 'lucide-react';
import { useTheme, type ThemeMode } from '../utils/theme.tsx';

interface ThemeToggleProps {
  variant?: 'segmented' | 'compact' | 'dropdown';
  className?: string;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ variant = 'segmented', className = '' }) => {
  const { theme, resolvedTheme, setTheme } = useTheme();

  const options: { mode: ThemeMode; label: string; icon: React.ReactNode }[] = [
    { mode: 'light', label: 'Light', icon: <Sun className="w-3.5 h-3.5" /> },
    { mode: 'auto', label: 'Auto', icon: <Laptop className="w-3.5 h-3.5" /> },
    { mode: 'dark', label: 'Dark', icon: <Moon className="w-3.5 h-3.5" /> },
  ];

  if (variant === 'compact') {
    return (
      <div className={`inline-flex p-1 bg-slate-200/80 dark:bg-slate-800 rounded-xl border border-slate-300/60 dark:border-slate-700/60 ${className}`}>
        {options.map((opt) => {
          const isActive = theme === opt.mode;
          return (
            <button
              key={opt.mode}
              type="button"
              onClick={() => setTheme(opt.mode)}
              title={`${opt.label} Mode`}
              className={`p-1.5 rounded-lg text-xs transition duration-150 flex items-center justify-center ${
                isActive
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {opt.icon}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center p-1 bg-slate-200/80 dark:bg-slate-800 rounded-xl border border-slate-300/60 dark:border-slate-700/60 shadow-2xs ${className}`}>
      {options.map((opt) => {
        const isActive = theme === opt.mode;
        return (
          <button
            key={opt.mode}
            type="button"
            onClick={() => setTheme(opt.mode)}
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition duration-150 ${
              isActive
                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {opt.icon}
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
};
