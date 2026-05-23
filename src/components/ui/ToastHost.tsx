'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useStore } from '@/lib/store/StoreProvider';
import type { Notification } from '@/lib/store/types';

const ICONS: Record<string, string> = {
  challenge_received: '⚔️',
  challenge_open: '🌍',
  challenge_started: '⚔️',
  challenge_accepted: '✓',
  game_result: '🏆',
  pari_new: '💰',
  bet_placed: '💵',
  bet_won: '💎',
  bet_lost: '💔',
  debt_request: '📜',
  debt_overdue: '⏰',
  debt_assigned: '🔨',
  debt_executor: '⚔️',
  big_game_invite: '🏟️',
  mini_game_invite: '🎯',
  day_change: '📅',
  season_change: '✨',
  rumor_new: '👁️',
  custom: '📢',
  transfer_received: '💸',
  card_ship_duel: '⚔️',
  card_ship_market: '🛒',
  card_ship_finished: '🏁',
  loan_request: '💳',
  loan_counter: '📤',
  loan_accepted: '✓',
  loan_rejected: '✕',
  refund: '↩',
  pet_candidate: '🐾',
  debt_game_created: '⚔️',
  candidate_trial: '👑',
  nine_bullets_shot: '🔫',
  junko_influence: '🎀',
  kokichi_influence: '🃏',
  queen_announcement: '👑',
  big_game_start: '🏟️',
  mini_game_start: '🎯',
  mini_game_progress: '🎯',
};

const TOAST_DURATION_MS = 12_000; // 12 секунд видно
const MAX_VISIBLE = 5;
const SEEN_KEY = 'toast_seen_ids_v1';

function loadSeen(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY + ':' + userId);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch { return new Set(); }
}

function saveSeen(userId: string, ids: Set<string>) {
  try {
    // Храним только последние 500 ID, чтобы не разрастался localStorage
    const arr = Array.from(ids).slice(-500);
    localStorage.setItem(SEEN_KEY + ':' + userId, JSON.stringify(arr));
  } catch {}
}

export function ToastHost() {
  const { state, currentUser } = useStore();
  const [toasts, setToasts] = useState<Notification[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const initRef = useRef(false);

  useEffect(() => {
    if (!currentUser) return;
    if (!initRef.current) {
      // При первом рендере: всё что уже в localStorage — игнорим как «уже видел»;
      // всё новое — пометим как seen и НЕ покажем (это история, не свежие).
      seenRef.current = loadSeen(currentUser.id);
      state.notifications.forEach(n => seenRef.current.add(n.id));
      saveSeen(currentUser.id, seenRef.current);
      initRef.current = true;
      return;
    }
    // Свежие нотификации: те которые мы ещё не видели и не прочитали
    const fresh = state.notifications.filter(n =>
      !seenRef.current.has(n.id) && !n.is_read
    );
    if (fresh.length === 0) return;
    fresh.forEach(n => seenRef.current.add(n.id));
    saveSeen(currentUser.id, seenRef.current);
    setToasts(prev => [...prev, ...fresh]);
    const ids = fresh.map(n => n.id);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => !ids.includes(t.id)));
    }, TOAST_DURATION_MS);
  }, [state.notifications, currentUser]);

  // Сбрасываем seen при смене пользователя
  useEffect(() => {
    if (!currentUser) {
      seenRef.current = new Set();
      initRef.current = false;
      setToasts([]);
      return;
    }
    seenRef.current = loadSeen(currentUser.id);
    initRef.current = false;
    setToasts([]);
  }, [currentUser?.id]);

  if (toasts.length === 0) return null;
  // Показываем последние MAX_VISIBLE, накапливая стопкой
  const visible = toasts.slice(-MAX_VISIBLE);

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 w-[calc(100%-1.5rem)] max-w-sm pointer-events-none"
      style={{ paddingTop: 'var(--safe-area-inset-top)' }}>
      {visible.map(t => (
        <div key={t.id} className="toast-card rounded-2xl p-3 pr-2 flex items-start gap-3 animate-slide-down pointer-events-auto shadow-lg">
          <div className="text-xl shrink-0">{ICONS[t.type] || '✦'}</div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm text-gold leading-tight">{t.title}</div>
            {t.body && <div className="text-xs text-muted-foreground mt-0.5 leading-snug">{t.body}</div>}
            {t.link_url && (
              <Link
                href={t.link_url}
                onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
                className="text-xs text-gold-light mt-1 inline-block hover:text-gold">
                Перейти →
              </Link>
            )}
          </div>
          <button
            onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
            className="w-7 h-7 rounded-full bg-red-500/20 hover:bg-red-500/40 border border-red-500/30 text-red-200 hover:text-red-100 flex items-center justify-center text-base font-bold shrink-0 transition-colors"
            aria-label="Закрыть">
            ×
          </button>
        </div>
      ))}
      {toasts.length > MAX_VISIBLE && (
        <div className="text-[10px] text-center text-muted-foreground bg-card/80 rounded-full px-2 py-0.5 inline-block self-center pointer-events-auto">
          +{toasts.length - MAX_VISIBLE} ещё
        </div>
      )}
    </div>
  );
}
