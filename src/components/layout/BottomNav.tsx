'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useStore } from '@/lib/store/StoreProvider';

const ITEMS = [
  { href: '/', label: 'Главная', Icon: HomeIcon },
  { href: '/participants', label: 'Игроки', Icon: UsersIcon },
  { href: '/games', label: 'Игры', Icon: DiceIcon },
  { href: '/pari', label: 'Пари', Icon: CoinIcon },
  { href: '/notifications', label: 'События', Icon: BellIcon },
];

export function BottomNav() {
  const pathname = usePathname();
  const { state, role } = useStore();

  // Счётчик новых событий (упрощённо — все события за последние 30 мин)
  const newEvents = state.events.filter(e => {
    if (e.is_for_gm_only && role !== 'gm' && role !== 'queen') return false;
    return Date.now() - e.created_at < 1000 * 60 * 30;
  }).length;

  return (
    <nav className="bottom-nav fixed bottom-0 left-0 right-0 z-40 lg:hidden">
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/95 to-background/0 -top-6 pointer-events-none" />
      <div className="relative mx-3 mb-2 px-1 py-1 rounded-2xl bg-card/90 backdrop-blur-xl border border-white/8 shadow-lg">
        <div className="grid grid-cols-5 gap-1">
          {ITEMS.map(item => {
            const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            const Icon = item.Icon;
            const showBadge = item.href === '/notifications' && newEvents > 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'relative flex flex-col items-center justify-center gap-0.5 py-2 rounded-xl active:scale-90 transition-transform duration-100',
                  isActive ? 'text-gold' : 'text-muted-foreground'
                )}
              >
                {isActive && (
                  <span className="absolute inset-0 bg-gradient-to-br from-gold/15 to-gold/5 rounded-xl border border-gold/20" />
                )}
                <Icon className="relative w-5 h-5" />
                <span className="relative text-[10px] font-semibold tracking-tight">{item.label}</span>
                {showBadge && (
                  <span className="absolute top-1 right-3 w-1.5 h-1.5 rounded-full bg-red-500" />
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

function HomeIcon(p: any) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}
function UsersIcon(p: any) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function DiceIcon(p: any) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="8.5" cy="8.5" r="1.2" fill="currentColor" />
      <circle cx="15.5" cy="15.5" r="1.2" fill="currentColor" />
      <circle cx="15.5" cy="8.5" r="1.2" fill="currentColor" />
      <circle cx="8.5" cy="15.5" r="1.2" fill="currentColor" />
    </svg>
  );
}
function CoinIcon(p: any) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9.5c0-1 1-2 3-2s3 1 3 2-1 1.5-3 2-3 1-3 2 1 2 3 2 3-1 3-2" />
      <path d="M12 6.5v11" />
    </svg>
  );
}
function BellIcon(p: any) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}
