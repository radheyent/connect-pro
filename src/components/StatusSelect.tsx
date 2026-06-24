import React, { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

// ─── SVG Icons (unchanged) ───────────────────────────────────────

const Svg = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    {children}
  </svg>
);

const IconNotConnected = ({ className }: { className?: string }) => (
  <Svg className={className}>
    <path d="M16.5 9.4l-9-5.19M10.68 13.31a16.1 16.1 0 0 0 1.89 2.12c.38.38.79.72 1.21 1.03" />
    <path d="M6.68 6.68A10 10 0 0 0 3.5 14c0 .64.07 1.26.2 1.86" />
    <path d="M6.09 17.91A10 10 0 0 0 21.5 14a10 10 0 0 0-2.95-7.07" />
    <path d="M22 22 2 2" />
    <path d="M10.67 7.32A10 10 0 0 1 21.5 14" />
  </Svg>
);

const IconNotInterested = ({ className }: { className?: string }) => (
  <Svg className={className}>
    <circle cx="12" cy="12" r="10" />
    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
  </Svg>
);

const IconInterested = ({ className }: { className?: string }) => (
  <Svg className={className}>
    <polyline points="20 6 9 17 4 12" />
  </Svg>
);

const IconFollowUp = ({ className }: { className?: string }) => (
  <Svg className={className}>
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </Svg>
);

const IconComplete = ({ className }: { className?: string }) => (
  <Svg className={className}>
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </Svg>
);

const IconCheck = ({ className }: { className?: string }) => (
  <Svg className={className}>
    <polyline points="20 6 9 17 4 12" strokeWidth="2.5" />
  </Svg>
);

const IconChevronDown = ({ className }: { className?: string }) => (
  <Svg className={className}>
    <polyline points="6 9 12 15 18 9" />
  </Svg>
);

// ─── Options (unchanged) ─────────────────────────────────────

export const STATUS_OPTIONS = [
  {
    value: 'Not Connected',
    label: 'Not Connected',
    description: 'Call not answered',
    badgeLabel: 'NO ANSWER',
    Icon: IconNotConnected,
    cardBg: 'bg-[linear-gradient(135deg,#e8eaf2,#dde0ee)]',
    cardBorder: 'border-[#c4c9de]',
    iconBg: 'bg-[linear-gradient(135deg,#c4c9de,#b0b6d0)]',
    iconStroke: 'stroke-[#5c6585]',
    titleColor: 'text-[#3a4165]',
    descColor: 'text-[#6b7399]',
    badgeColor: 'text-[#6b7399]',
    badgeBorder: 'border-[#b0b6d0]',
    badgeBg: 'bg-[rgba(100,110,150,0.1)]',
    selCardBg: 'bg-[linear-gradient(135deg,#1c2030,#141624)]',
    selCardBorder: 'border-[#5b6899]',
    selCardGlow: 'shadow-[0_0_0_1px_#3d4d7a,0_6px_24px_rgba(80,100,160,0.25)]',
    selIconBg: 'bg-[linear-gradient(135deg,#252d48,#1a2038)]',
    selIconStroke: 'stroke-[#8fa0c8]',
    selTitleColor: 'text-[#8fa0c8]',
    selDescColor: 'text-[rgba(143,160,200,0.45)]',
    selBadgeColor: 'text-[#5a6e9a]',
    selBadgeBorder: 'border-[#252f50]',
    selBadgeBg: 'bg-[rgba(20,24,40,0.7)]',
    selCheckBg: 'bg-[#252d48]',
    selCheckStroke: 'stroke-[#8fa0c8]',
  },
  {
    value: 'Not Interested',
    label: 'Not Interested',
    description: 'Customer declined',
    badgeLabel: 'DECLINED',
    Icon: IconNotInterested,
    cardBg: 'bg-[linear-gradient(135deg,#fdf0e8,#fae3d0)]',
    cardBorder: 'border-[#f0c4a0]',
    iconBg: 'bg-[linear-gradient(135deg,#f0c4a0,#e8a878)]',
    iconStroke: 'stroke-[#8a4018]',
    titleColor: 'text-[#7a3010]',
    descColor: 'text-[#b06030]',
    badgeColor: 'text-[#b06030]',
    badgeBorder: 'border-[#e8b090]',
    badgeBg: 'bg-[rgba(180,80,20,0.08)]',
    selCardBg: 'bg-[linear-gradient(135deg,#201610,#160e07)]',
    selCardBorder: 'border-[#b85520]',
    selCardGlow: 'shadow-[0_0_0_1px_#9b4418,0_6px_24px_rgba(180,80,20,0.25)]',
    selIconBg: 'bg-[linear-gradient(135deg,#3d1a08,#6b2810)]',
    selIconStroke: 'stroke-[#d4804a]',
    selTitleColor: 'text-[#d4804a]',
    selDescColor: 'text-[rgba(212,128,74,0.45)]',
    selBadgeColor: 'text-[#b86030]',
    selBadgeBorder: 'border-[#5a2010]',
    selBadgeBg: 'bg-[rgba(24,12,5,0.7)]',
    selCheckBg: 'bg-[#3d1a08]',
    selCheckStroke: 'stroke-[#d4804a]',
  },
  {
    value: 'Interested',
    label: 'Interested',
    description: 'Customer wants to proceed',
    badgeLabel: 'WARM LEAD',
    Icon: IconInterested,
    cardBg: 'bg-[linear-gradient(135deg,#e6f5ec,#d4eedd)]',
    cardBorder: 'border-[#a8d8bc]',
    iconBg: 'bg-[linear-gradient(135deg,#a8d8bc,#80c89a)]',
    iconStroke: 'stroke-[#1a6840]',
    titleColor: 'text-[#14562e]',
    descColor: 'text-[#2a8050]',
    badgeColor: 'text-[#2a8050]',
    badgeBorder: 'border-[#80c89a]',
    badgeBg: 'bg-[rgba(20,130,60,0.08)]',
    selCardBg: 'bg-[linear-gradient(135deg,#0c1e14,#06140d)]',
    selCardBorder: 'border-[#1a8a4a]',
    selCardGlow: 'shadow-[0_0_0_1px_#156638,0_6px_24px_rgba(20,130,60,0.25)]',
    selIconBg: 'bg-[linear-gradient(135deg,#0a2e18,#104825)]',
    selIconStroke: 'stroke-[#48c47a]',
    selTitleColor: 'text-[#48c47a]',
    selDescColor: 'text-[rgba(72,196,122,0.45)]',
    selBadgeColor: 'text-[#28a058]',
    selBadgeBorder: 'border-[#104828]',
    selBadgeBg: 'bg-[rgba(5,14,9,0.7)]',
    selCheckBg: 'bg-[#0a2e18]',
    selCheckStroke: 'stroke-[#48c47a]',
  },
  {
    value: 'Follow-up',
    label: 'Follow-up',
    description: 'Call back later',
    badgeLabel: 'CALLBACK',
    Icon: IconFollowUp,
    cardBg: 'bg-[linear-gradient(135deg,#e8edfb,#d8e0f8)]',
    cardBorder: 'border-[#a8b8f0]',
    iconBg: 'bg-[linear-gradient(135deg,#a8b8f0,#8098e8)]',
    iconStroke: 'stroke-[#1a3890]',
    titleColor: 'text-[#18308a]',
    descColor: 'text-[#2848b8]',
    badgeColor: 'text-[#2848b8]',
    badgeBorder: 'border-[#8098e8]',
    badgeBg: 'bg-[rgba(30,70,200,0.08)]',
    selCardBg: 'bg-[linear-gradient(135deg,#0d1020,#080818)]',
    selCardBorder: 'border-[#2858d0]',
    selCardGlow: 'shadow-[0_0_0_1px_#1e48b8,0_6px_24px_rgba(30,70,200,0.25)]',
    selIconBg: 'bg-[linear-gradient(135deg,#1a2e7a,#2040b0)]',
    selIconStroke: 'stroke-[#6090e8]',
    selTitleColor: 'text-[#6090e8]',
    selDescColor: 'text-[rgba(96,144,232,0.45)]',
    selBadgeColor: 'text-[#3868c0]',
    selBadgeBorder: 'border-[#1a2e6a]',
    selBadgeBg: 'bg-[rgba(7,8,22,0.7)]',
    selCheckBg: 'bg-[#1a2e7a]',
    selCheckStroke: 'stroke-[#6090e8]',
  },
  {
    value: 'Complete',
    label: 'Complete',
    description: 'Sale closed successfully',
    badgeLabel: 'CLOSED',
    Icon: IconComplete,
    cardBg: 'bg-[linear-gradient(135deg,#e4f5f0,#d0ede6)]',
    cardBorder: 'border-[#90d0c0]',
    iconBg: 'bg-[linear-gradient(135deg,#90d0c0,#60bca8)]',
    iconStroke: 'stroke-[#0a5540]',
    titleColor: 'text-[#084838]',
    descColor: 'text-[#0e7058]',
    badgeColor: 'text-[#0e7058]',
    badgeBorder: 'border-[#60bca8]',
    badgeBg: 'bg-[rgba(10,130,100,0.08)]',
    selCardBg: 'bg-[linear-gradient(135deg,#081a12,#04100d)]',
    selCardBorder: 'border-[#0d9060]',
    selCardGlow: 'shadow-[0_0_0_1px_#0a7050,0_6px_24px_rgba(10,130,80,0.25)]',
    selIconBg: 'bg-[linear-gradient(135deg,#062a1e,#0a4a32)]',
    selIconStroke: 'stroke-[#30c890]',
    selTitleColor: 'text-[#30c890]',
    selDescColor: 'text-[rgba(48,200,144,0.45)]',
    selBadgeColor: 'text-[#14a060]',
    selBadgeBorder: 'border-[#0a4030]',
    selBadgeBg: 'bg-[rgba(3,12,9,0.7)]',
    selCheckBg: 'bg-[#062a1e]',
    selCheckStroke: 'stroke-[#30c890]',
  },
];

// ─── Component (updated) ─────────────────────────────────────

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
  const [popoverOpen, setPopoverOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!popoverOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPopoverOpen(false);
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPopoverOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, [popoverOpen]);

  const options = STATUS_OPTIONS.filter(
    (o) => allowComplete || o.value !== 'Complete'
  );
  const selected = options.find((o) => o.value === value);
  const others = options.filter((o) => o.value !== value);

  const handleSelect = (optValue: string) => {
    if (disabled) return;
    onChange(optValue);
    setPopoverOpen(false);
  };

  // If the current status is not in our options (e.g., "Fresh"), show all options as a list
  if (!selected) {
    return (
      <div className={cn('space-y-[5px]', className)}>
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => handleSelect(opt.value)}
            className={cn(
              'w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-[13px] border text-left',
              'transition-[opacity,transform] duration-150 ease-out',
              'active:scale-[0.98]',
              opt.cardBg,
              opt.cardBorder
            )}
          >
            {/* Icon */}
            <span
              className={cn(
                'w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0',
                opt.iconBg
              )}
            >
              <opt.Icon className={cn('w-3.5 h-3.5', opt.iconStroke)} />
            </span>

            {/* Text */}
            <div className="flex-1 min-w-0">
              <p className={cn('text-[12px] font-bold tracking-tight mb-0.5', opt.titleColor)}>
                {opt.label}
              </p>
              <p className={cn('text-[10px] leading-snug', opt.descColor)}>
                {opt.description}
              </p>
            </div>

            {/* Badge */}
            <span
              className={cn(
                'shrink-0 text-[7px] font-bold tracking-[.05em] px-1 py-px rounded-[4px] border',
                opt.badgeColor,
                opt.badgeBorder,
                opt.badgeBg
              )}
            >
              {opt.badgeLabel}
            </span>

            {/* Empty spacer (since no right icon needed) */}
            <span className="w-[14px] h-[14px] shrink-0" />
          </button>
        ))}
      </div>
    );
  }

  // ─── Selected status exists: show trigger card + popover ────────

  const cardContent = (
    opt: any,
    isSelected: boolean,
    showCheck: boolean,
    showChevron: boolean
  ) => (
    <div
      className={cn(
        'w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-[13px] border text-left',
        'transition-[opacity,transform] duration-150 ease-out',
        isSelected
          ? cn(opt.selCardBg, opt.selCardBorder, opt.selCardGlow)
          : cn(opt.cardBg, opt.cardBorder)
      )}
    >
      {/* Icon container */}
      <span
        className={cn(
          'w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0',
          isSelected ? opt.selIconBg : opt.iconBg
        )}
      >
        <opt.Icon
          className={cn(
            'w-3.5 h-3.5',
            isSelected ? opt.selIconStroke : opt.iconStroke
          )}
        />
      </span>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            'text-[12px] font-bold tracking-tight mb-0.5',
            isSelected ? opt.selTitleColor : opt.titleColor
          )}
        >
          {opt.label}
        </p>
        <p
          className={cn(
            'text-[10px] leading-snug',
            isSelected ? opt.selDescColor : opt.descColor
          )}
        >
          {opt.description}
        </p>
      </div>

      {/* Badge */}
      <span
        className={cn(
          'shrink-0 text-[7px] font-bold tracking-[.05em] px-1 py-px rounded-[4px] border',
          isSelected
            ? cn(opt.selBadgeColor, opt.selBadgeBorder, opt.selBadgeBg)
            : cn(opt.badgeColor, opt.badgeBorder, opt.badgeBg)
        )}
      >
        {opt.badgeLabel}
      </span>

      {/* Right indicator */}
      {showCheck && (
        <span
          className={cn(
            'w-[14px] h-[14px] rounded-full flex items-center justify-center shrink-0',
            opt.selCheckBg
          )}
        >
          <IconCheck className={cn('w-[8px] h-[8px]', opt.selCheckStroke)} />
        </span>
      )}
      {showChevron && (
        <span
          className={cn(
            'w-[14px] h-[14px] flex items-center justify-center shrink-0',
            opt.selCheckBg
          )}
        >
          <IconChevronDown
            className={cn('w-[10px] h-[10px] rotate-180', opt.selCheckStroke)}
          />
        </span>
      )}
      {!showCheck && !showChevron && (
        <span className="w-[14px] h-[14px] shrink-0" />
      )}
    </div>
  );

  return (
    <div className={cn('relative', className)} ref={containerRef}>
      {/* Trigger card */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={popoverOpen}
        onClick={() => {
          if (!disabled) setPopoverOpen((prev) => !prev);
        }}
        className="active:scale-[0.98] transition-transform duration-150 cursor-pointer select-none"
      >
        {cardContent(selected, true, !popoverOpen, popoverOpen)}
      </div>

      {/* Popover (only other options) */}
      {popoverOpen && (
        <div
          className={cn(
            'absolute left-0 right-0 mt-1 z-50',
            'bg-white/10 backdrop-blur-md rounded-[14px] border border-white/20',
            'p-[5px] space-y-[5px]',
            'shadow-[0_12px_40px_rgba(0,0,0,0.3)]',
            'animate-in fade-in-0 zoom-in-95 origin-top'
          )}
        >
          {others.map((opt) => (
            <button
              key={opt.value}
              type="button"
              disabled={disabled}
              onClick={() => handleSelect(opt.value)}
              className="w-full active:scale-[0.98] transition-transform duration-150 cursor-pointer"
            >
              {cardContent(opt, false, false, false)}
            </button>
          ))}
        </div>
      )}

      {/* Hint */}
      {!popoverOpen && (
        <p className="text-center text-[10px] text-black/20 pt-1 tracking-[.04em] select-none">
          tap to change
        </p>
      )}
    </div>
  );
};

export default StatusSelect;
