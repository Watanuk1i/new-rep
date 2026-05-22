'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useStore } from '@/lib/store/StoreProvider';
import type { Notification } from '@/lib/store/types';

const ICONS: Record<string, string> = {
  challenge_received: '⚔️',
  challenge_open: '🌍',
  challenge_accepted: '✓',
  game_result: '🏆',
  pari_new: '💰',
  bet_placed: '💵',
  debt_request: '📜',
  big_game_invite: '🏟️',
  day_change: '📅',
  season_change: '✨',
  rumor_new: '👁️',
  custom: '📢',
  transfer_received: '💸',
  card_ship_duel: '⚔️',
  card_ship_market: '🛒',
  card_ship_finished: '🏁',
};

export function ToastHost() {
  const { state, currentUser } = useStore();
  const [toasts, setToasts] = useState<Notification[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const initRef = useRef(false);

  useEffect(() => {
    // При первом рендере — все существующие нотификации помечаем как уже виденные
    if (!initRef.current) {
      state.notifications.forEach(n => seenRef.current.add(n.id));
      initRef.current = true;
      return;
    }
    // Показываем тост ТОЛЬКО для новых непрочитанных нотификаций
    const fresh = state.notifications.filter(n =>
      !seenRef.current.has(n.id) && !n.is_read
    );
    if (fresh.length === 0) return;
    fresh.forEach(n => seenRef.current.add(n.id));
    setToasts(prev => [...prev, ...fresh]);
    const ids = fresh.map(n => n.id);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => !ids.includes(t.id)));
    }, 4500);
  }, [state.notifications]);

  // Сбрасываем seen при смене пользователя
  useEffect(() => {
    seenRef.current = new Set();
    initRef.current = false;
    setToasts([]);
  }, [currentUser?.id]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 w-[calc(100%-1.5rem)] max-w-sm pointer-events-none"
      style={{ paddingTop: 'var(--safe-area-inset-top)' }}>
      {toasts.slice(-3).map(t => (
        <div key={t.id} className="toast-card rounded-2xl p-3 flex items-start gap-3 animate-slide-down pointer-events-auto">
          <div className="text-xl shrink-0">{ICONS[t.type] || '✦'}</div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm text-gold leading-tight">{t.title}</div>
            {t.body && <div className="text-xs text-muted-foreground mt-0.5 leading-snug">{t.body}</div>}
            {t.link_url && (
              <Link href={t.link_url} className="text-xs text-gold-light mt-1 inline-block">Перейти →</Link>
            )}
          </div>
          <button onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
            className="text-muted text-sm shrink-0">✕</button>
        </div>
      ))}
    </div>
  );
}
