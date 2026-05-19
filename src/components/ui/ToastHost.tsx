'use client';

// Тост-уведомления при появлении новых событий академии для текущего пользователя.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useStore } from '@/lib/store/StoreProvider';
import type { AcademyEvent } from '@/lib/store/types';

const ICONS: Record<string, string> = {
  big_game_start: '🏟️',
  player_eliminated: '💀',
  pet_assigned: '🔗',
  elite_promoted: '👑',
  queen_announcement: '👑',
  pari_created: '💰',
  pari_resolved: '✓',
  gm_alert: '⚠️',
  custom: '📢',
};

export function ToastHost() {
  const { state, role } = useStore();
  const [toasts, setToasts] = useState<AcademyEvent[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const initRef = useRef(false);

  useEffect(() => {
    // При первом рендере отметим существующие события как «уже виденные»
    if (!initRef.current) {
      state.events.forEach(e => seenRef.current.add(e.id));
      initRef.current = true;
      return;
    }
    const fresh = state.events.filter(e => !seenRef.current.has(e.id));
    if (fresh.length === 0) return;
    fresh.forEach(e => seenRef.current.add(e.id));

    const visible = fresh.filter(e => {
      if (e.is_for_gm_only) return role === 'gm' || role === 'queen';
      return true;
    });
    if (visible.length === 0) return;

    setToasts(prev => [...prev, ...visible]);
    const ids = visible.map(v => v.id);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => !ids.includes(t.id)));
    }, 4500);
  }, [state.events, role]);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-3 left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 w-[calc(100%-1.5rem)] max-w-sm pointer-events-none"
      style={{ paddingTop: 'var(--safe-area-inset-top)' }}
    >
      {toasts.slice(-3).map(t => (
        <div
          key={t.id}
          className="toast-card rounded-2xl p-3 flex items-start gap-3 animate-slide-down pointer-events-auto"
        >
          <div className="text-xl shrink-0">{ICONS[t.type] || '✦'}</div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm text-gold leading-tight">{t.title}</div>
            {t.body && <div className="text-xs text-muted-foreground mt-0.5 leading-snug">{t.body}</div>}
            {t.link_url && (
              <Link href={t.link_url} className="text-xs text-gold-light mt-1 inline-block">
                Перейти →
              </Link>
            )}
          </div>
          <button
            onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
            className="text-muted text-sm shrink-0"
            aria-label="Закрыть"
          >✕</button>
        </div>
      ))}
    </div>
  );
}
