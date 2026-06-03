/**
 * StatusSelect — Bespoke dark card-style status selector.
 * Matches screenshot design: dark navy cards, colored icon containers,
 * status badge chips, glow borders on selection.
 * After selection → other options collapse. Tap again → expand.
 */
import React, { useState } from 'react';
import { cn } from '@/lib/utils';

export interface StatusOption {
  value: string;
  label: string;
  icon: string;
  color: string;
  bg: string;
  border: string;
  description?: string;
  iconBg: string;       // colored icon container background
  badgeLabel: string;   // chip label e.g. "CONNECTED", "DECLINED"
  badgeColor: string;   // chip text + border color classes
  glowColor: string;    // selected card glow color (box-shadow inline style)
}

export const STATUS_OPTIONS: StatusOption[] = [
  {
    value: 'Not Connected',
    label: 'Not Connected',
    icon: '📵',
    color: 'text-slate-300',
    bg: 'bg-[#141c2e]',
    border: 'border-slate-700',
    description: 'Call not answered',
    iconBg: 'bg-slate-700',
    badgeLabel: 'NO ANSWER',
    badgeColor: 'text-slate-400 border-slate-600',
    glowColor: 'rgba(148,163,184,0.35)',
  },
  {
    value: 'Not Interested',
    label: 'Not Interested',
    icon: '🚫',
    color: 'text-orange-300',
    bg: 'bg-[#1e140a]',
    border: 'border-orange-800',
    description: 'Customer declined',
    iconBg: 'bg-orange-900/70',
    badgeLabel: 'DECLINED',
    badgeColor: 'text-orange-400 border-orange-700',
    glowColor: 'rgba(251,146,60,0.35)',
  },
  {
    value: 'Interested',
    label: 'Interested',
    icon: '✅',
    color: 'text-green-300',
    bg: 'bg-[#0a1e10]',
    border: 'border-green-700',
    description: 'Customer wants to proceed',
    iconBg: 'bg-green-900/70',
    badgeLabel: 'WARM LEAD',
    badgeColor: 'text-green-400 border-green-700',
    glowColor: 'rgba(74,222,128,0.35)',
  },
  {
    value: 'Follow-up',
    label: 'Follow-up',
    icon: '🔔',
    color: 'text-blue-300',
    bg: 'bg-[#0a0f1e]',
    border: 'border-blue-700',
    description: 'Call back later',
    iconBg: 'bg-blue-900/70',
    badgeLabel: 'CALLBACK',
    badgeColor: 'text-blue-400 border-blue-700',
    glowColor: 'rgba(96,165,250,0.35)',
  },
  {
    value: 'Complete',
    label: 'Complete',
    icon: '🏆',
    color: 'text-emerald-300',
    bg: 'bg-[#081a12]',
    border: 'border-emerald-600',
    description: 'Sale closed successfully',
    iconBg: 'bg-emerald-900/70',
    badgeLabel: 'CLOSED',
    badgeColor: 'text-emerald-400 border-emerald-600',
    glowColor: 'rgba(52,211,153,0.4)',
  },
];

interface StatusSelectProps {
  value: string;
  onChange: (value: string) => void;
  allowComplete?: boolean;
  disabled?: boolean;
  className?: string;
}

const StatusSelect: React.FC<StatusSelectProps> = ({
  value,
  onChange,
  allowComplete = false,
  disabled = false,
  className,
}) => {
  const [collapsed, setCollapsed] = useState(false);

  const options = STATUS_OPTIONS.filter(o => allowComplete || o.value !== 'Complete');
  const selected = options.find(o => o.value === value);

  const handleSelect = (optValue: string) => {
    if (disabled) return;
    if (optValue === value && collapsed) {
      // Tap selected again → expand
      setCollapsed(false);
      return;
    }
    onChange(optValue);
    setCollapsed(true);
  };

  return (
    <div
      className={cn('space-y-2', className)}
      style={{ fontFamily: "'DM Sans', 'Sora', sans-serif" }}
    >
      {options.map(opt => {
        const isSelected = value === opt.value;
        const isHidden = collapsed && !isSelected;

        if (isHidden) return null;

        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => handleSelect(opt.value)}
            style={
              isSelected
                ? {
                    boxShadow: `0 0 0 2px ${opt.glowColor}, 0 4px 24px ${opt.glowColor}`,
                  }
                : {}
            }
            className={cn(
              'w-full flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all duration-200 text-left',
              'focus:outline-none focus:ring-2 focus:ring-blue-500/50',
              'disabled:opacity-40 disabled:cursor-not-allowed',
              'active:scale-[0.98]',
              isSelected
                ? cn(opt.bg, opt.border, 'border-2')
                : 'bg-[#111827] border-[#1f2a3d] hover:border-[#2d3f57] hover:bg-[#141d2e]'
            )}
          >
            {/* Colored icon container */}
            <span
              className={cn(
                'w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-xl',
                isSelected ? opt.iconBg : 'bg-[#1c2844]'
              )}
              role="img"
              aria-label={opt.label}
            >
              {opt.icon}
            </span>

            {/* Label + description */}
            <div className="flex-1 min-w-0">
              <p className={cn(
                'text-sm font-bold tracking-tight',
                isSelected ? opt.color : 'text-slate-200'
              )}>
                {opt.label}
              </p>
              {opt.description && (
                <p className="text-xs text-slate-500 mt-0.5 leading-snug">
                  {opt.description}
                </p>
              )}
            </div>

            {/* Badge chip */}
            <span
              className={cn(
                'shrink-0 text-[10px] font-bold tracking-widest px-2 py-1 rounded-md border',
                isSelected ? opt.badgeColor : 'text-slate-600 border-slate-700'
              )}
            >
              {opt.badgeLabel}
            </span>
          </button>
        );
      })}

      {/* Expand hint when collapsed */}
      {collapsed && selected && (
        <p className="text-center text-[11px] text-slate-600 pt-1 tracking-wide select-none">
          Tap to change status
        </p>
      )}
    </div>
  );
};

export default StatusSelect;
