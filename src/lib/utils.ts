import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// «ейны» — игровая валюта
export const CURRENCY = 'ейн';
export const CURRENCY_SYMBOL = '◈';

export function formatYen(amount: number): string {
  // Компактная форма для больших чисел: 1 234 567 → "1.23M"
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(amount >= 10_000_000 ? 1 : 2)}M`;
  if (amount >= 1_000) return `${Math.round(amount / 100) / 10}K`;
  return new Intl.NumberFormat('ru-RU').format(amount);
}

export function formatYenFull(amount: number): string {
  return new Intl.NumberFormat('ru-RU').format(amount);
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    player: 'Игрок',
    pet: 'Питомец',
    master: 'Игрок · с Питомцем',
    candidate: 'Претендент',
    elite: 'Элита',
    queen: 'Королева',
    gm: 'Ведущий',
    collector: 'Коллектор',
    treasury: 'Казна',
  };
  return labels[status] || status;
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    player: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    pet: 'bg-red-500/15 text-red-300 border-red-500/30',
    master: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
    candidate: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
    elite: 'bg-gold/15 text-gold border-gold/30',
    queen: 'bg-gradient-to-r from-gold/25 to-amber-500/25 text-gold-light border-gold/50',
    gm: 'bg-white/10 text-white/80 border-white/20',
    collector: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    treasury: 'bg-amber-500/15 text-amber-200 border-amber-500/30',
  };
  return colors[status] || 'bg-gray-500/20 text-gray-400';
}

/** Признак "системного" участника (Ведущий или Казна) — таких не показываем в списках. */
export function isSystemParticipant(p: { status?: string; id?: string }): boolean {
  return p.status === 'gm' || p.status === 'treasury' || p.id === 'p-gm' || p.id === 'p-treasury';
}

/** Реальный игрок (не Ведущий, не Казна). Фильтр для списков и игр. */
export function isPlayer(p: { status?: string; id?: string }): boolean {
  return !isSystemParticipant(p);
}

export function timeAgo(input: number | string): string {
  const ms = typeof input === 'string' ? new Date(input).getTime() : input;
  const diff = Math.floor((Date.now() - ms) / 1000);
  if (diff < 60) return 'только что';
  if (diff < 3600) return `${Math.floor(diff / 60)} мин`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч`;
  return `${Math.floor(diff / 86400)} дн`;
}

export function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

export function uid(prefix = 'id'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Спрайт-листы персонажей
export const SPRITE_SHEETS: Record<number, { url: string; width: number; height: number }> = {
  1: { url: '/sprites/sheet1.png', width: 86, height: 1674 },
  2: { url: '/sprites/sheet2.png', width: 86, height: 1938 },
  3: { url: '/sprites/sheet3.png', width: 88, height: 1586 },
};

export const SPRITE_DEFAULT_SIZE = 86;
