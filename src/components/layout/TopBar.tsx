'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useStore } from '@/lib/store/StoreProvider';
import { Yen } from '@/components/ui/Yen';
import { CharacterIcon } from '@/components/ui/CharacterIcon';
import { getStatusLabel } from '@/lib/utils';

const TITLES: Record<string, string> = {
  '/': 'Академия',
  '/account': 'Аккаунт',
  '/login': 'Вход',
  '/participants': 'Игроки',
  '/games': 'Игры',
  '/games/create': 'Создать игру',
  '/pari': 'Пари',
  '/pari/create': 'Создать пари',
  '/super-games': 'Супер игры',
  '/transfers': 'Переводы',
  '/notifications': 'События',
  '/rumors': 'Слухи',
  '/debts': 'Долги',
  '/rules': 'Правила',
  '/help': 'Помощь',
  '/history': 'История',
  '/admin': 'Админка',
};

export function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { currentUser, role } = useStore();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isHome = pathname === '/';

  // Закрываем drawer при смене страницы
  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  // Блокируем body скролл когда drawer открыт
  useEffect(() => {
    if (drawerOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [drawerOpen]);

  const title = TITLES[pathname] || (
    pathname.startsWith('/profile/') ? 'Профиль' :
    pathname.startsWith('/games/play/') ? 'Игра' :
    pathname.startsWith('/super-games/') ? 'Супер игра' :
    pathname.startsWith('/pari/') ? 'Пари' :
    'Академия'
  );

  return (
    <>
      <header
        className="sticky top-0 z-40 bg-background/85 backdrop-blur-xl border-b border-white/5"
        style={{ paddingTop: 'var(--safe-area-inset-top)' }}
      >
        <div className="h-14 px-3 flex items-center gap-2">
          {!isHome ? (
            <button
              onClick={() => router.back()}
              className="btn-icon"
              aria-label="Назад"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          ) : (
            <Link href="/" className="flex items-center gap-2 px-1" aria-label="Главная">
              <Image
                src="/logo.ico"
                alt="Академия"
                width={32}
                height={32}
                className="rounded-lg"
                unoptimized
                priority
              />
            </Link>
          )}

          <div className="flex-1 min-w-0 text-center">
            <h1 className="font-heading text-base sm:text-lg font-bold tracking-wide truncate">
              {isHome ? <span className="text-gradient-gold">{title}</span> : title}
            </h1>
            {isHome && (
              <p className="text-[10px] text-muted -mt-0.5 tracking-widest uppercase">Безумный Азарт</p>
            )}
          </div>

          {/* Баланс в шапке для авторизованного пользователя */}
          {currentUser && currentUser.status !== 'gm' && currentUser.status !== 'treasury' && (
            <Link
              href="/account"
              className={cn(
                'hidden xs:flex items-center gap-2 px-2 py-1 rounded-xl border',
                currentUser.balance < 0
                  ? 'bg-red-500/10 border-red-500/30'
                  : 'bg-white/5 border-white/8'
              )}
              aria-label="Аккаунт и баланс"
            >
              {currentUser.balance < 0 && <span className="text-xs">📜</span>}
              <Yen amount={currentUser.balance} className="text-xs" iconClass="w-4 h-4" />
            </Link>
          )}

          <button
            onClick={() => setDrawerOpen(true)}
            className="btn-icon relative"
            aria-label="Меню"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </div>
      </header>

      {/* Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in"
            onClick={() => setDrawerOpen(false)}
          />
          <div
            className="absolute right-0 top-0 bottom-0 w-72 bg-card/95 backdrop-blur-2xl border-l border-white/10 animate-slide-down p-4 overflow-y-auto"
            style={{ paddingTop: 'calc(var(--safe-area-inset-top) + 1rem)', paddingBottom: 'calc(var(--safe-area-inset-bottom) + 1rem)' }}
          >
            <div className="flex items-center justify-between mb-4">
              <span className="font-heading text-lg text-gradient-gold font-bold">Меню</span>
              <button
                onClick={() => setDrawerOpen(false)}
                className="btn-icon"
                aria-label="Закрыть"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* User card */}
            {currentUser ? (
              <Link
                href="/account"
                className="glass p-3 flex items-center gap-3 mb-4"
              >
                <CharacterIcon participant={currentUser} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate">{currentUser.display_name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {getStatusLabel(currentUser.status)}
                  </div>
                  {currentUser.status !== 'gm' && currentUser.status !== 'treasury' && (
                    <Yen amount={currentUser.balance} className="text-xs text-gold mt-0.5" />
                  )}
                </div>
              </Link>
            ) : (
              <Link
                href="/login"
                className="glass p-3 flex items-center gap-3 mb-4"
              >
                <div className="w-11 h-11 rounded-full bg-card border border-white/10 flex items-center justify-center text-xl">
                  ➜
                </div>
                <div>
                  <div className="font-bold text-sm">Войти</div>
                  <div className="text-[10px] text-muted-foreground">Гость</div>
                </div>
              </Link>
            )}

            <DrawerLink href="/" icon="🏛️" label="Главная" pathname={pathname} />
            {currentUser && (
              <DrawerLink href={`/profile/${currentUser.id}`} icon="👤" label="Профиль" pathname={pathname} />
            )}
            <DrawerLink href="/super-games" icon="🏟️" label="Супер игры" pathname={pathname} />
            <DrawerLink href="/togami" icon="💼" label="Фонд Тогами" pathname={pathname} />
            <DrawerLink href="/loans" icon="💳" label="Кредиты / Долги" pathname={pathname} />
            <DrawerLink href="/transfers" icon="💸" label="Переводы" pathname={pathname} />
            <DrawerLink href="/rumors" icon="👁️" label="Слухи" pathname={pathname} />
            <DrawerLink href="/rules" icon="⚖️" label="Правила" pathname={pathname} />
            <DrawerLink href="/help" icon="❔" label="Помощь" pathname={pathname} />
            <DrawerLink href="/history" icon="🕰️" label="История" pathname={pathname} />

            {(role === 'gm' || role === 'queen') && (
              <>
                <div className="divider-ornate my-4">✦ Управление ✦</div>
                <DrawerLink href="/admin" icon="⚙️" label="Админка" pathname={pathname} />
                {role === 'gm' && (
                  <DrawerLink href="/debug" icon="🔧" label="Диагностика БД" pathname={pathname} />
                )}
              </>
            )}

            {currentUser ? (
              <>
                <Link
                  href="/help"
                  onClick={() => setDrawerOpen(false)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium bg-rose-500/10 border border-rose-500/30 text-rose-200 active:bg-rose-500/20 mt-4"
                >
                  <span className="text-lg">🆘</span>
                  <span>Позвать на помощь</span>
                </Link>
                <button
                  onClick={() => {
                    setDrawerOpen(false);
                    const ev = new CustomEvent('app:logout');
                    window.dispatchEvent(ev);
                    router.push('/login');
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-300 active:bg-red-500/10 mt-2"
                >
                  <span className="text-lg">🚪</span>
                  <span>Выйти</span>
                </button>
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* Listener для событий выхода */}
      <LogoutBridge />
    </>
  );
}

function DrawerLink({ href, icon, label, pathname }: { href: string; icon: string; label: string; pathname: string }) {
  const active = pathname === href || (href !== '/' && pathname.startsWith(href));
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium',
        active ? 'bg-gold/10 text-gold border border-gold/20' : 'text-foreground/85 active:bg-white/5'
      )}
    >
      <span className="text-lg">{icon}</span>
      <span>{label}</span>
    </Link>
  );
}

function LogoutBridge() {
  const { logout } = useStore();
  useEffect(() => {
    const handler = () => logout();
    window.addEventListener('app:logout', handler);
    return () => window.removeEventListener('app:logout', handler);
  }, [logout]);
  return null;
}
