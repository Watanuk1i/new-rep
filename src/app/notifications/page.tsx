'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useStore } from '@/lib/store/StoreProvider';
import { cn, timeAgo } from '@/lib/utils';

const ICONS: Record<string, string> = {
  challenge_received: '⚔️',
  challenge_open: '🌍',
  challenge_accepted: '✓',
  game_result: '🏆',
  pari_new: '💰',
  bet_placed: '💵',
  bet_won: '🎉',
  bet_lost: '💀',
  debt_request: '📜',
  debt_closed: '✅',
  pet_assigned: '🔗',
  status_changed: '🔄',
  big_game_invite: '🏟️',
  day_change: '📅',
  season_change: '✨',
  rumor_new: '👁️',
  custom: '📢',
  gm_alert: '⚠️',
};

export default function NotificationsPage() {
  const { state, currentUser, role, markNotificationsRead } = useStore();

  // Помечаем прочитанными при просмотре
  useEffect(() => {
    if (!currentUser) return;
    const unread = state.notifications.filter(n => !n.is_read).map(n => n.id);
    if (unread.length === 0) return;
    const t = setTimeout(() => markNotificationsRead(unread), 1500);
    return () => clearTimeout(t);
  }, [state.notifications, currentUser, markNotificationsRead]);

  const unreadCount = state.notifications.filter(n => !n.is_read).length;
  const isAdmin = role === 'gm' || role === 'queen';

  // Для ведущего отдельная лента — события только для GM
  const gmAlerts = isAdmin
    ? state.events.filter(e => e.type === 'gm_alert' || e.is_for_gm_only)
    : [];

  if (!currentUser) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="text-sm text-muted-foreground mb-4">Войдите, чтобы видеть уведомления</p>
        <Link href="/login" className="btn-primary inline-flex">Войти</Link>
      </div>
    );
  }

  return (
    <div className="px-3 sm:px-4 py-4 max-w-2xl mx-auto space-y-4 animate-fade-in">
      <h1 className="section-title text-base px-1">
        <span>🔔</span> Уведомления
        {unreadCount > 0 && <span className="text-xs text-gold/70">({unreadCount} новых)</span>}
      </h1>

      {isAdmin && gmAlerts.length > 0 && (
        <section>
          <div className="text-[10px] font-bold uppercase tracking-widest text-amber-300 mb-2 px-1">
            ⚠️ Запросы и споры (для админов)
          </div>
          <div className="space-y-2">
            {gmAlerts.slice(0, 10).map(e => (
              <div key={e.id} className="glass p-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-lg shrink-0">
                    ⚠️
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-sm leading-snug">{e.title}</h3>
                    {e.body && <p className="text-xs text-muted-foreground mt-0.5">{e.body}</p>}
                    <div className="text-[10px] text-muted mt-1">{timeAgo(e.created_at)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="text-[10px] font-bold uppercase tracking-widest text-muted mb-2 px-1">Личные уведомления</div>
        <div className="space-y-2">
          {state.notifications.length === 0 ? (
            <div className="glass p-6 text-center">
              <div className="text-3xl mb-2 opacity-30">🔔</div>
              <p className="text-sm text-muted-foreground">Пока тихо.</p>
            </div>
          ) : state.notifications.map(n => {
            const Wrapper = n.link_url ? Link : 'div';
            const props: any = n.link_url ? { href: n.link_url } : {};
            return (
              <Wrapper key={n.id} {...props}>
                <div className={cn('glass p-3 active:scale-[0.99] transition-transform',
                  !n.is_read && 'border-l-4 border-l-gold')}>
                  <div className="flex items-start gap-3">
                    <div className={cn('w-10 h-10 rounded-2xl flex items-center justify-center text-lg shrink-0',
                      !n.is_read ? 'bg-gold/15 border border-gold/30' : 'bg-card/60 border border-white/10')}>
                      {ICONS[n.type] || '✦'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className={cn('font-bold text-sm leading-snug', !n.is_read && 'text-gold')}>{n.title}</h3>
                      {n.body && <p className="text-xs text-muted-foreground mt-0.5">{n.body}</p>}
                      <div className="text-[10px] text-muted mt-1">{timeAgo(n.created_at)}</div>
                    </div>
                  </div>
                </div>
              </Wrapper>
            );
          })}
        </div>
      </section>
    </div>
  );
}
