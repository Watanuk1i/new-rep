'use client';

// Значок валюты «ейн»
import { cn, formatYen, formatYenFull } from '@/lib/utils';

export function Yen({
  amount,
  full = false,
  className,
  iconClass,
}: { amount: number; full?: boolean; className?: string; iconClass?: string }) {
  const text = full ? formatYenFull(amount) : formatYen(amount);
  return (
    <span className={cn('inline-flex items-center gap-1 font-mono font-bold tabular-nums', className)}>
      <YenIcon className={iconClass} />
      <span>{text}</span>
    </span>
  );
}

export function YenIcon({ className }: { className?: string }) {
  // Стилизованный значок: золотая монета с гравировкой
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn('w-3.5 h-3.5 text-gold', className)}
      fill="none"
      aria-hidden
    >
      <defs>
        <linearGradient id="yen-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f5d77a" />
          <stop offset="100%" stopColor="#a88a2a" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="10" fill="url(#yen-grad)" stroke="#5c4a18" strokeWidth="1" />
      <path
        d="M8 7l4 5 4-5M12 12v6M9 14h6M9 17h6"
        stroke="#3a2c0a"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
