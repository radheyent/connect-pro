/**
 * StatusSelect — Bespoke dark gradient card status selector.
 * SVG icons instead of emojis, unique gradient per status,
 * collapse on select, tap to expand.
 */
import React, { useState } from 'react';
import { cn } from '@/lib/utils';

// ─── SVG Icon Components ──────────────────────────────────────────────────────

const IconNotConnected = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="2" y1="2" x2="22" y2="22" />
    <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
    <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
    <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
    <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
    <path d="M13.54 14.31a4 4 0 0 1 2.17 1.19" />
    <path d="M8.53 14.11a4 4 0 0 1 2.29-.9" />
    <line x1="12" y1="20" x2="12.01" y2="20" strokeWidth="2.5" />
  </svg>
);

const IconNotInterested = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
  </svg>
);

const IconInterested = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IconFollowUp = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

const IconComplete = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StatusOption {
  value: string;
  label: string;
  Icon: React.FC<{ className?: string }>;
  iconColor: string;
  description?: string;
  badgeLabel: string;
  cardBg: string;
  cardBorder: string;
  cardBorderSelected: string;
  cardGlow: string;
  iconBg: string;
  titleColor: string;
  badgeColor: string;
  badgeBorder: string;
  badgeBg: string;
  checkBg: string;
  checkColor: string;
}

export const STATUS_OPTIONS: StatusOption[] = [
  {
    value: 'Not Connected',
    label: 'Not Connected',
    Icon: IconNotConnected,
    iconColor: 'text-slate-400',
    description: 'Call not answered',
    badgeLabel: 'NO ANSWER',
    cardBg: 'bg-gradient-to-br from-[#1a1f2e] to-[#13171f]',
    cardBorder: 'border-[#2d3448]',
    cardBorderSelected: 'border-[#4a5568]',
    cardGlow: 'shadow-[0_0_0_1px_#4a5568,0_8px_32px_rgba(74,85,104,0.3)]',
    iconBg: 'bg-gradient-to-br from-[#2d3448] to-[#1e2433]',
    titleColor: 'text-slate-400',
    badgeColor: 'text-slate-500',
    badgeBorder: 'border-[#2d3a4a]',
    badgeBg: 'bg-[#1e2433]/80',
    checkBg: 'bg-[#2d3448]',
    checkColor: 'text-slate-400',
  },
  {
    value: 'Not Interested',
    label: 'Not Interested',
    Icon: IconNotInterested,
    iconColor: 'text-orange-400',
    description: 'Customer declined',
    badgeLabel: 'DECLINED',
    cardBg: 'bg-gradient-to-br from-[#1f1610] to-[#170f08]',
    cardBorder: 'border-[#3d2010]',
    cardBorderSelected: 'border-orange-600',
    cardGlow: 'shadow-[0_0_0_1px_#c2410c,0_8px_32px_rgba(234,88,12,0.25)]',
    iconBg: 'bg-gradient-to-br from-[#431407] to-[#7c2d12]',
    titleColor: 'text-orange-400',
    badgeColor: 'text-orange-500',
    badgeBorder: 'border-[#7c2d12]',
    badgeBg: 'bg-[#1c0e06]/80',
    checkBg: 'bg-[#431407]',
    checkColor: 'text-orange-400',
  },
  {
    value: 'Interested',
    label: 'Interested',
    Icon: IconInterested,
    iconColor: 'text-green-400',
    description: 'Customer wants to proceed',
    badgeLabel: 'WARM LEAD',
    cardBg: 'bg-gradient-to-br from-[#0a1f12] to-[#071510]',
    cardBorder: 'border-[#14532d]',
    cardBorderSelected: 'border-green-600',
    cardGlow: 'shadow-[0_0_0_1px_#16a34a,0_8px_32px_rgba(22,163,74,0.28)]',
    iconBg: 'bg-gradient-to-br from-[#052e16] to-[#14532d]',
    titleColor: 'text-green-400',
    badgeColor: 'text-green-500',
    badgeBorder: 'border-[#14532d]',
    badgeBg: 'bg-[#05120a]/80',
    checkBg: 'bg-[#052e16]',
    checkColor: 'text-green-400',
  },
  {
    value: 'Follow-up',
    label: 'Follow-up',
    Icon: IconFollowUp,
    iconColor: 'text-blue-400',
    description: 'Call back later',
    badgeLabel: 'CALLBACK',
    cardBg: 'bg-gradient-to-br from-[#0c0f1f] to-[#08091a]',
    cardBorder: 'border-[#1e3a6e]',
    cardBorderSelected: 'border-blue-600',
    cardGlow: 'shadow-[0_0_0_1px_#2563eb,0_8px_32px_rgba(37,99,235,0.3)]',
    iconBg: 'bg-gradient-to-br from-[#1e3a8a] to-[#1d4ed8]',
    titleColor: 'text-blue-400',
    badgeColor: 'text-blue-500',
    badgeBorder: 'border-[#1e3a8a]',
    badgeBg: 'bg-[#080a1a]/80',
    checkBg: 'bg-[#1e3a8a]',
    checkColor: 'text-blue-400',
  },
  {
    value: 'Complete',
    label: 'Complete',
    Icon: IconComplete,
    iconColor: 'text-emerald-400',
    description: 'Sale closed successfully',
    badgeLabel: 'CLOSED',
    cardBg: 'bg-gradient-to-br from-[#071a12] to-[#04130e]',
    cardBorder: 'border-[#064e3b]',
    cardBorderSelected: 'border-emerald-600',
    cardGlow: 'shadow-[0_0_0_1px_#059669,0_8px_32px_rgba(5,150,105,0.32)]',
    iconBg: 'bg-gradient-to-br from-[#022c22] to-[#065f46]',
    titleColor: 'text-emerald-400',
    badgeColor: 'text-emerald-500',
    badgeBorder: 'border-[#064e3b]',
    badgeBg: 'bg-[#04100b]/80',
    checkBg: 'bg-[#022c22]',
    checkColor: 'text-emerald-400',
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

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

  const options = STATUS_OPTIONS.filter(
    o => allowComplete || o.value !== 'Complete'
  );

  const handleSelect = (optValue: string) => {
    if (disabled) return;
    if (optValue === value && collapsed) {
      setCollapsed(false);
      return;
    }
    onChange(optValue);
    setCollapsed(true);
  };

  return (
    <div className={cn('space-y-2', className)}>
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
            className={cn(
              'w-full flex items-center gap-3 px-4 py-3 rounded-2xl border-[1.5px] transition-all duration-200 text-left',
              'focus:outline-none focus:ring-2 focus:ring-white/10',
              'disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]',
              opt.cardBg,
              isSelected
                ? cn(opt.cardBorderSelected, opt.cardGlow)
                : cn(opt.cardBorder, 'hover:brightness-110')
            )}
          >
            {/* SVG Icon container */}
            <span
              className={cn(
                'w-11 h-11 rounded-xl flex items-center justify-center shrink-0',
                opt.iconBg
              )}
              aria-hidden="true"
            >
              <opt.Icon className={cn('w-5 h-5', opt.iconColor)} />
            </span>

            {/* Label + description */}
            <div className="flex-1 min-w-0">
              <p className={cn('text-[13px] font-bold tracking-tight mb-0.5', opt.titleColor)}>
                {opt.label}
              </p>
              {opt.description && (
                <p className="text-[11px] text-white/30 leading-snug">
                  {opt.description}
                </p>
              )}
            </div>

            {/* Badge chip */}
            <span
              className={cn(
                'shrink-0 text-[9px] font-bold tracking-widest px-2 py-1 rounded-md border',
                opt.badgeColor,
                opt.badgeBorder,
                opt.badgeBg
              )}
            >
              {opt.badgeLabel}
            </span>

            {/* Selected checkmark */}
            {isSelected && (
              <div
                className={cn(
                  'w-5 h-5 rounded-full flex items-center justify-center shrink-0',
                  opt.checkBg,
                  opt.checkColor
                )}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
            )}
          </button>
        );
      })}

      {collapsed && (
        <p className="text-center text-[11px] text-white/20 pt-1 tracking-wide select-none">
          tap to change status
        </p>
      )}
    </div>
  );
};

export default StatusSelect;
