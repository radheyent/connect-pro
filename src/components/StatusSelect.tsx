/**
 * StatusSelect — Professional status dropdown with icons and colors.
 * Replaces plain <Select> for lead status updates across the app.
 * Large touch targets, clear visual hierarchy, mobile-optimized.
 */
import React from 'react';
import { cn } from '@/lib/utils';

export interface StatusOption {
  value: string;
  label: string;
  icon: string;       // emoji icon
  color: string;      // tailwind text color
  bg: string;         // tailwind bg color
  border: string;     // tailwind border color
  description?: string;
}

export const STATUS_OPTIONS: StatusOption[] = [
  {
    value: 'Not Connected',
    label: 'Not Connected',
    icon: '📵',
    color: 'text-slate-700 dark:text-slate-300',
    bg: 'bg-slate-100 dark:bg-slate-800',
    border: 'border-slate-200 dark:border-slate-700',
    description: 'Call not answered',
  },
  {
    value: 'Not Interested',
    label: 'Not Interested',
    icon: '🚫',
    color: 'text-orange-700 dark:text-orange-300',
    bg: 'bg-orange-50 dark:bg-orange-950/30',
    border: 'border-orange-200 dark:border-orange-800',
    description: 'Customer declined',
  },
  {
    value: 'Interested',
    label: 'Interested',
    icon: '✅',
    color: 'text-green-700 dark:text-green-300',
    bg: 'bg-green-50 dark:bg-green-950/30',
    border: 'border-green-200 dark:border-green-800',
    description: 'Customer wants to proceed',
  },
  {
    value: 'Follow-up',
    label: 'Follow-up',
    icon: '🔔',
    color: 'text-blue-700 dark:text-blue-300',
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    border: 'border-blue-200 dark:border-blue-800',
    description: 'Call back later',
  },
  {
    value: 'Complete',
    label: 'Complete',
    icon: '🏆',
    color: 'text-emerald-700 dark:text-emerald-300',
    bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    border: 'border-emerald-300 dark:border-emerald-700',
    description: 'Sale closed successfully',
  },
];

interface StatusSelectProps {
  value: string;
  onChange: (value: string) => void;
  allowComplete?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * A full-page-style status selector designed for mobile.
 * Shows each status as a large tappable card with icon + description.
 */
const StatusSelect: React.FC<StatusSelectProps> = ({
  value,
  onChange,
  allowComplete = false,
  disabled = false,
  className,
}) => {
  const options = STATUS_OPTIONS.filter(o => allowComplete || o.value !== 'Complete');
  const selected = options.find(o => o.value === value);

  return (
    <div className={cn("space-y-2", className)}>
      {options.map(opt => {
        const isSelected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left",
              "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              isSelected
                ? cn(opt.bg, opt.border, "shadow-sm ring-2", opt.border.replace('border-', 'ring-'))
                : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
            )}
          >
            {/* Icon */}
            <span className="text-2xl shrink-0 select-none" role="img" aria-label={opt.label}>
              {opt.icon}
            </span>

            {/* Label + description */}
            <div className="flex-1 min-w-0">
              <p className={cn(
                "text-sm font-bold",
                isSelected ? opt.color : "text-slate-800 dark:text-slate-200"
              )}>
                {opt.label}
              </p>
              {opt.description && (
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                  {opt.description}
                </p>
              )}
            </div>

            {/* Selected indicator */}
            {isSelected && (
              <div className={cn(
                "w-5 h-5 rounded-full flex items-center justify-center shrink-0",
                opt.bg,
                opt.color
              )}>
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default StatusSelect;
