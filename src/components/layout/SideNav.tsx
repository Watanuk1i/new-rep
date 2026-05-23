'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { cn, getStatusLabel } from '@/lib/utils';
import { useStore } from '@/lib/store/StoreProvider';
import { CharacterIcon } from '@/components/ui/CharacterIcon';
import { Yen } from '@/components/ui/Yen';

const ITEMS = [
  { href: '/', icon: '🏛️', label: 'Главная' },
  { href: '/participants', icon: '👥', label: 'Игроки' },
  { href: '/games', icon: '🎲', label: 'Игры' },
  { href: '/pari', icon: '💰', label: 'Пари' },
  { href: '/super-games', icon: '🏟️', label: 'Супер игры' },
  { href: '/togami', icon: '💼', label: 'Фонд Тогами' },
  { href: '/loans', icon: '💳', label: 'Кредиты / Долги' },
  { href: '/contracts', icon: '📜', label: 'Договоры' },
  { href: '/transfers', icon: '💸', label: 'Переводы' },
  { href: '/notifications', icon: '🔔', label: 'События' },
  { href: '/rumors', icon: '👁️', label: 'Слухи' },
  { href: '/rules', icon: '⚖️', label: 'Правила' },
  { href: '/help', icon: '❔', label: 'Помощь' },
  { href: '/history', icon: '🕰️', label: 'История' },
];

export function SideNav() {
  const pathname = usePathname();
  const { currentUser, role } = useStore();

  return (
    <aside className="hidden lg:block w-64 shrink-0 sticky top-20 self-start max-h-[calc(100vh-6rem)] overflow-y-auto py-6 pr-2">
      <Link href="/" className="flex items-center gap-2 mb-6 px-2">
        <Image src="/logo.ico" alt="Академия" width={36} height={36} className="rounded-lg" unoptimized />
        <div>
          <div className="font-heading text-lg font-bold text-gradient-gold leading-tight">Академия</div>
          <div className="text-[10px] uppercase tracking-widest text-muted">Безумный Азарт</div>
        </div>
      </Link>

      {currentUser && (
        <Link href={`/profile/${currentUser.id}`} className="glass p-3 flex items-center gap-3 mb-4">
          <CharacterIcon participant={currentUser} size="md" ringless={currentUser.status === 'queen'} />
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm truncate">{currentUser.display_name}</div>
            <div className="text-[10px] text-muted-foreground">{getStatusLabel(currentUser.status)}</div>
            {currentUser.status !== 'gm' && (
              <Yen amount={currentUser.balance} className="text-xs text-gold mt-0.5" />
            )}
          </div>
        </Link>
      )}

      <nav className="space-y-1">
        {ITEMS.map(it => {
          const active = it.href === '/' ? pathname === '/' : pathname.startsWith(it.href);
          return (
            <Link key={it.href} href={it.href}
              className={cn('flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors',
                active ? 'bg-gold/10 text-gold border border-gold/20' : 'text-foreground/80 hover:bg-white/5')}>
              <span className="text-base">{it.icon}</span>
              <span>{it.label}</span>
            </Link>
          );
        })}

        {(role === 'gm' || role === 'queen') && (
          <>
            <div className="divider-ornate my-3">✦ Управление</div>
            <Link href="/admin"
              className={cn('flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors',
                pathname.startsWith('/admin') ? 'bg-gold/10 text-gold border border-gold/20' : 'text-foreground/80 hover:bg-white/5')}>
              <span>⚙️</span><span>Админка</span>
            </Link>
            {role === 'gm' && (
              <Link href="/debug" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-muted-foreground hover:bg-white/5">
                <span>🔧</span><span>Диагностика БД</span>
              </Link>
            )}
          </>
        )}

        {currentUser && (
          <Link href="/help" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm bg-rose-500/10 border border-rose-500/30 text-rose-200 hover:bg-rose-500/20 mt-2">
            <span>🆘</span><span>Позвать на помощь</span>
          </Link>
        )}

        {!currentUser && (
          <Link href="/login" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gold hover:bg-gold/10 mt-2">
            <span>➜</span><span>Войти</span>
          </Link>
        )}
      </nav>
    </aside>
  );
}
