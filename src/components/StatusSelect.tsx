/**
 * StatusSelect — Light unselected cards, dark selected card.
 * Each status has unique mixed gradient colors.
 * SVG icons, collapse on select, tap selected to expand.
 */
import React, { useState } from 'react';
import { cn } from '@/lib/utils';

// ─── SVG Icons ────────────────────────────────────────────────────────────────

const Svg = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className}>
    {children}
  </svg>
);

const IconNotConnected = ({ className }: { className?: string }) => (
  <Svg className={className}>
    <line x1="2" y1="2" x2="22" y2="22" />
    <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
    <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
    <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
    <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
    <path d="M13.54 14.31a4 4 0 0 1 2.17 1.19" />
    <path d="M8.53 14.11a4 4 0 0 1 2.29-.9" />
    <line x1="12" y1="20" x2="12.01" y2="20" />
  </Svg>
);
const IconNotInterested = ({ className }: { className?: string }) => (
  <Svg className={className}><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></Svg>
);
const IconInterested = ({ className }: { className?: string }) => (
  <Svg className={className}><polyline points="20 6 9 17 4 12" /></Svg>
);
const IconFollowUp = ({ className }: { className?: string }) => (
  <Svg className={className}>
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </Svg>
);
const IconComplete = ({ className }: { className?: string }) => (
  <Svg className={className}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></Svg>
);
const IconCheck = ({ className }: { className?: string }) => (
  <Svg className={className}><polyline points="20 6 9 17 4 12" strokeWidth="2.5" /></Svg>
);

// ─── Types ────────────────────────────────────────────────────────────────────

interface StatusOption {
  value: string;
  label: string;
  description: string;
  badgeLabel: string;
  Icon: React.FC<{ className?: string }>;
  // unselected (light)
  cardBg: string;
  cardBorder: string;
  iconBg: string;
  iconStroke: string;
  titleColor: string;
  descColor: string;
  badgeColor: string;
  badgeBorder: string;
  badgeBg: string;
  // selected (dark)
  selCardBg: string;
  selCardBorder: string;
  selCardGlow: string;
  selIconBg: string;
  selIconStroke: string;
  selTitleColor: string;
  selDescColor: string;
  selBadgeColor: string;
  selBadgeBorder: string;
  selBadgeBg: string;
  selCheckBg: string;
  selCheckStroke: string;
}

export const STATUS_OPTIONS: StatusOption[] = [
  {
    value: 'Not Connected',
    label: 'Not Connected',
    description: 'Call not answered',
    badgeLabel: 'NO ANSWER',
    Icon: IconNotConnected,
    // light: slate + indigo
    cardBg:       'bg-[linear-gradient(135deg,#e8eaf2,#dde0ee)]',
    cardBorder:   'border-[#c4c9de]',
    iconBg:       'bg-[linear-gradient(135deg,#c4c9de,#b0b6d0)]',
    iconStroke:   'stroke-[#5c6585]',
    titleColor:   'text-[#3a4165]',
    descColor:    'text-[#6b7399]',
    badgeColor:   'text-[#6b7399]',
    badgeBorder:  'border-[#b0b6d0]',
    badgeBg:      'bg-[rgba(100,110,150,0.1)]',
    // dark selected
    selCardBg:      'bg-[linear-gradient(135deg,#1c2030,#141624)]',
    selCardBorder:  'border-[#5b6899]',
    selCardGlow:    'shadow-[0_0_0_1px_#3d4d7a,0_6px_24px_rgba(80,100,160,0.25)]',
    selIconBg:      'bg-[linear-gradient(135deg,#252d48,#1a2038)]',
    selIconStroke:  'stroke-[#8fa0c8]',
    selTitleColor:  'text-[#8fa0c8]',
    selDescColor:   'text-[rgba(143,160,200,0.45)]',
    selBadgeColor:  'text-[#5a6e9a]',
    selBadgeBorder: 'border-[#252f50]',
    selBadgeBg:     'bg-[rgba(20,24,40,0.7)]',
    selCheckBg:     'bg-[#252d48]',
    selCheckStroke: 'stroke-[#8fa0c8]',
  },
  {
    value: 'Not Interested',
    label: 'Not Interested',
    description: 'Customer declined',
    badgeLabel: 'DECLINED',
    Icon: IconNotInterested,
    // light: amber + red
    cardBg:       'bg-[linear-gradient(135deg,#fdf0e8,#fae3d0)]',
    cardBorder:   'border-[#f0c4a0]',
    iconBg:       'bg-[linear-gradient(135deg,#f0c4a0,#e8a878)]',
    iconStroke:   'stroke-[#8a4018]',
    titleColor:   'text-[#7a3010]',
    descColor:    'text-[#b06030]',
    badgeColor:   'text-[#b06030]',
    badgeBorder:  'border-[#e8b090]',
    badgeBg:      'bg-[rgba(180,80,20,0.08)]',
    // dark selected
    selCardBg:      'bg-[linear-gradient(135deg,#201610,#160e07)]',
    selCardBorder:  'border-[#b85520]',
    selCardGlow:    'shadow-[0_0_0_1px_#9b4418,0_6px_24px_rgba(180,80,20,0.25)]',
    selIconBg:      'bg-[linear-gradient(135deg,#3d1a08,#6b2810)]',
    selIconStroke:  'stroke-[#d4804a]',
    selTitleColor:  'text-[#d4804a]',
    selDescColor:   'text-[rgba(212,128,74,0.45)]',
    selBadgeColor:  'text-[#b86030]',
    selBadgeBorder: 'border-[#5a2010]',
    selBadgeBg:     'bg-[rgba(24,12,5,0.7)]',
    selCheckBg:     'bg-[#3d1a08]',
    selCheckStroke: 'stroke-[#d4804a]',
  },
  {
    value: 'Interested',
    label: 'Interested',
    description: 'Customer wants to proceed',
    badgeLabel: 'WARM LEAD',
    Icon: IconInterested,
    // light: teal + green
    cardBg:       'bg-[linear-gradient(135deg,#e6f5ec,#d4eedd)]',
    cardBorder:   'border-[#a8d8bc]',
    iconBg:       'bg-[linear-gradient(135deg,#a8d8bc,#80c89a)]',
    iconStroke:   'stroke-[#1a6840]',
    titleColor:   'text-[#14562e]',
    descColor:    'text-[#2a8050]',
    badgeColor:   'text-[#2a8050]',
    badgeBorder:  'border-[#80c89a]',
    badgeBg:      'bg-[rgba(20,130,60,0.08)]',
    // dark selected
    selCardBg:      'bg-[linear-gradient(135deg,#0c1e14,#06140d)]',
    selCardBorder:  'border-[#1a8a4a]',
    selCardGlow:    'shadow-[0_0_0_1px_#156638,0_6px_24px_rgba(20,130,60,0.25)]',
    selIconBg:      'bg-[linear-gradient(135deg,#0a2e18,#104825)]',
    selIconStroke:  'stroke-[#48c47a]',
    selTitleColor:  'text-[#48c47a]',
    selDescColor:   'text-[rgba(72,196,122,0.45)]',
    selBadgeColor:  'text-[#28a058]',
    selBadgeBorder: 'border-[#104828]',
    selBadgeBg:     'bg-[rgba(5,14,9,0.7)]',
    selCheckBg:     'bg-[#0a2e18]',
    selCheckStroke: 'stroke-[#48c47a]',
  },
  {
    value: 'Follow-up',
    label: 'Follow-up',
    description: 'Call back later',
    badgeLabel: 'CALLBACK',
    Icon: IconFollowUp,
    // light: blue + violet
    cardBg:       'bg-[linear-gradient(135deg,#e8edfb,#d8e0f8)]',
    cardBorder:   'border-[#a8b8f0]',
    iconBg:       'bg-[linear-gradient(135deg,#a8b8f0,#8098e8)]',
    iconStroke:   'stroke-[#1a3890]',
    titleColor:   'text-[#18308a]',
    descColor:    'text-[#2848b8]',
    badgeColor:   'text-[#2848b8]',
    badgeBorder:  'border-[#8098e8]',
    badgeBg:      'bg-[rgba(30,70,200,0.08)]',
    // dark selected
    selCardBg:      'bg-[linear-gradient(135deg,#0d1020,#080818)]',
    selCardBorder:  'border-[#2858d0]',
    selCardGlow:    'shadow-[0_0_0_1px_#1e48b8,0_6px_24px_rgba(30,70,200,0.25)]',
    selIconBg:      'bg-[linear-gradient(135deg,#1a2e7a,#2040b0)]',
    selIconStroke:  'stroke-[#6090e8]',
    selTitleColor:  'text-[#6090e8]',
    selDescColor:   'text-[rgba(96,144,232,0.45)]',
    selBadgeColor:  'text-[#3868c0]',
    selBadgeBorder: 'border-[#1a2e6a]',
    selBadgeBg:     'bg-[rgba(7,8,22,0.7)]',
    selCheckBg:     'bg-[#1a2e7a]',
    selCheckStroke: 'stroke-[#6090e8]',
  },
  {
    value: 'Complete',
    label: 'Complete',
    description: 'Sale closed successfully',
    badgeLabel: 'CLOSED',
    Icon: IconComplete,
    // light: emerald + cyan
    cardBg:       'bg-[linear-gradient(135deg,#e4f5f0,#d0ede6)]',
    cardBorder:   'border-[#90d0c0]',
    iconBg:       'bg-[linear-gradient(135deg,#90d0c0,#60bca8)]',
    iconStroke:   'stroke-[#0a5540]',
    titleColor:   'text-[#084838]',
    descColor:    'text-[#0e7058]',
    badgeColor:   'text-[#0e7058]',
    badgeBorder:  'border-[#60bca8]',
    badgeBg:      'bg-[rgba(10,130,100,0.08)]',
    // dark selected
    selCardBg:      'bg-[linear-gradient(135deg,#081a12,#04100d)]',
    selCardBorder:  'border-[#0d9060]',
    selCardGlow:    'shadow-[0_0_0_1px_#0a7050,0_6px_24px_rgba(10,130,80,0.25)]',
    selIconBg:      'bg-[linear-gradient(135deg,#062a1e,#0a4a32)]',
    selIconStroke:  'stroke-[#30c890]',
    selTitleColor:  'text-[#30c890]',
    selDescColor:   'text-[rgba(48,200,144,0.45)]',
    selBadgeColor:  'text-[#14a060]',
    selBadgeBorder: 'border-[#0a4030]',
    selBadgeBg:     'bg-[rgba(3,12,9,0.7)]',
    selCheckBg:     'bg-[#062a1e]',
    selCheckStroke: 'stroke-[#30c890]',
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
    if (optValue === value && collapsed) { setCollapsed(false); return; }
    onChange(optValue);
    setCollapsed(true);
  };

  return (
    <div className={cn('space-y-[7px]', className)}>
      {options.map(opt => {
        const isSel = value === opt.value;
        if (collapsed && !isSel) return null;

        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => handleSelect(opt.value)}
            className={cn(
              'w-full flex items-center gap-3 px-[13px] py-3 rounded-[13px] border text-left',
              'transition-all duration-150 active:scale-[0.98]',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-black/10',
              'disabled:opacity-40 disabled:cursor-not-allowed',
              isSel
                ? cn(opt.selCardBg, opt.selCardBorder, opt.selCardGlow)
                : cn(opt.cardBg, opt.cardBorder)
            )}
          >
            {/* Icon box */}
            <span
              className={cn(
                'w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0',
                isSel ? opt.selIconBg : opt.iconBg
              )}
              aria-hidden="true"
            >
              <opt.Icon className={cn('w-[17px] h-[17px]', isSel ? opt.selIconStroke : opt.iconStroke)} />
            </span>

            {/* Text */}
            <div className="flex-1 min-w-0">
              <p className={cn('text-[13px] font-bold tracking-tight mb-0.5', isSel ? opt.selTitleColor : opt.titleColor)}>
                {opt.label}
              </p>
              <p className={cn('text-[11px] leading-snug', isSel ? opt.selDescColor : opt.descColor)}>
                {opt.description}
              </p>
            </div>

            {/* Badge */}
            <span className={cn(
              'shrink-0 text-[9px] font-bold tracking-[.07em] px-[6px] py-[3px] rounded-[5px] border',
              isSel ? cn(opt.selBadgeColor, opt.selBadgeBorder, opt.selBadgeBg)
                    : cn(opt.badgeColor, opt.badgeBorder, opt.badgeBg)
            )}>
              {opt.badgeLabel}
            </span>

            {/* Check (selected only) */}
            {isSel && (
              <span className={cn('w-[18px] h-[18px] rounded-full flex items-center justify-center shrink-0', opt.selCheckBg)}>
                <IconCheck className={cn('w-[10px] h-[10px]', opt.selCheckStroke)} />
              </span>
            )}
          </button>
        );
      })}

      {collapsed && (
        <p className="text-center text-[10px] text-black/20 pt-1 tracking-[.04em] select-none">
          tap to change
        </p>
      )}
    </div>
  );
};

export default StatusSelect;
