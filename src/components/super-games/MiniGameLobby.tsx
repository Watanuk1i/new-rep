'use client';

// Универсальное лобби малых игр.
// Перед стартом игры все участники должны нажать «Я готов».
// Создатель (или ведущий) подтверждает старт. Только после этого
// игра переходит в фазу `active` и происходит списание ставок.
// Также здесь обрабатывается флаг `needs_gm_approval` для больших ставок.

import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store/StoreProvider';
import { CharacterIcon } from '@/components/ui/CharacterIcon';
import { Yen } from '@/components/ui/Yen';
import { cn, isPlayer } from '@/lib/utils';
import { getSupabase } from '@/lib/supabase/client';
import type { SuperGame, Participant } from '@/lib/store/types';

interface Props {
  game: SuperGame;
  /** Текущий статус игры внутри state. */
  state: { status?: string; ready_ids?: string[]; needs_gm_approval?: boolean };
  /** Минимум игроков чтобы стартовать. По умолчанию 2. */
  minPlayers?: number;
  /** Колбэк старта (изменит state.status на active и спишет взносы). */
  onStart: () => Promise<void>;
}

/**
 * Возвращает true если игра ещё в лобби (waiting_players/lobby/ready_check)
 * и нужно показать лобби, иначе — false (показывайте игру).
 */
export function isInLobby(state: { status?: string }): boolean {
  return state.status === 'waiting_players' || state.status === 'lobby' || state.status === 'ready_check';
}

export function MiniGameLobby({ game, state: gs, onStart, minPlayers = 2 }: Props) {
  const { state: app, currentUser, role } = useStore();
  const sb = getSupabase();
  const isAdmin = role === 'gm' || role === 'queen';
  const [busy, setBusy] = useState(false);

  const players = (game.participant_ids || [])
    .map(id => app.participants.find(p => p.id === id))
    .filter(Boolean) as Participant[];

  const readyIds = new Set(gs.ready_ids ?? []);
  const allReady = players.length >= minPlayers && players.every(p => readyIds.has(p.id));
  const meReady = !!currentUser && readyIds.has(currentUser.id);
  const inGame = !!currentUser && players.some(p => p.id === currentUser.id);
  const isCreator = !!currentUser && (game.participant_ids ?? [])[0] === currentUser.id;
  // Создатель/админ может начать игру когда есть хотя бы minPlayers (даже если не все нажали «готов»).
  const enoughPlayers = players.length >= minPlayers;
  const canStart = (isCreator || isAdmin) && enoughPlayers;
  const needsGm = !!gs.needs_gm_approval;
  const isOpen = !!(game.state as any)?.is_open;

  const toggleReady = async () => {
    if (!sb || !currentUser || busy || needsGm) return;
    setBusy(true);
    const { data } = await sb.from('super_games').select('state').eq('id', game.id).single();
    const cur = (data?.state ?? {}) as any;
    const ids: string[] = cur.ready_ids ?? [];
    const next = ids.includes(currentUser.id)
      ? ids.filter(x => x !== currentUser.id)
      : [...ids, currentUser.id];
    await sb.from('super_games').update({ state: { ...cur, ready_ids: next } }).eq('id', game.id);
    setBusy(false);
  };

  const start = async () => {
    if (busy) return;
    setBusy(true);
    await onStart();
    setBusy(false);
  };

  const cancelGame = async () => {
    if (!sb || busy) return;
    if (!confirm('Отменить игру?')) return;
    setBusy(true);
    await sb.from('super_games').update({ status: 'cancelled' }).eq('id', game.id);
    setBusy(false);
  };

  const approveBigStake = async () => {
    if (!sb || busy) return;
    setBusy(true);
    const { data } = await sb.from('super_games').select('state').eq('id', game.id).single();
    const cur = (data?.state ?? {}) as any;
    await sb.from('super_games').update({ state: { ...cur, needs_gm_approval: false } }).eq('id', game.id);
    setBusy(false);
  };

  return (
    <div className="space-y-3">
      <div className="glass-strong gold-border p-4">
        <div className="text-[10px] uppercase tracking-widest text-gold/70">🎯 Лобби малой игры</div>
        <h2 className="font-heading text-lg font-bold mt-1">{game.title}</h2>
        {game.entry_fee ? (
          <div className="text-xs text-muted-foreground mt-1">
            Взнос с игрока: <Yen amount={game.entry_fee} className="inline text-gold" iconClass="w-3 h-3" />
          </div>
        ) : null}
        <div className="text-[10px] text-muted-foreground mt-1">
          Игра начнётся, когда все нажмут <b>«Я готов»</b> и создатель подтвердит старт.
        </div>
      </div>

      {needsGm && (
        <div className="glass-strong gold-border p-4 text-center" style={{ background: 'linear-gradient(135deg, rgba(212,175,55,0.15), rgba(139,26,26,0.15))' }}>
          <div className="text-[10px] uppercase tracking-widest text-gold/70">⏳ Большая ставка</div>
          <div className="text-sm mt-1">
            Ставка <b className="text-gold">{(game.entry_fee ?? 0).toLocaleString('ru-RU')} ¥</b> требует подтверждения ведущего.
          </div>
          {isAdmin ? (
            <button onClick={approveBigStake} disabled={busy} className="btn-success w-full mt-2">✓ Одобрить ставку</button>
          ) : (
            <div className="text-[10px] text-amber-300/80 mt-2 animate-pulse">Уведомление отправлено</div>
          )}
        </div>
      )}

      <div className="glass p-3">
        <div className="text-[10px] uppercase tracking-widest text-gold/70 mb-2">
          Игроки ({readyIds.size}/{players.length} готовы)
        </div>
        <div className="space-y-1.5">
          {players.length === 0 ? (
            <div className="text-xs text-muted-foreground italic">Пока никого. Создатель должен пригласить.</div>
          ) : players.map(p => {
            const ready = readyIds.has(p.id);
            const youCreator = (game.participant_ids ?? [])[0] === p.id;
            return (
              <div key={p.id} className={cn('flex items-center gap-2 p-2 rounded-xl text-xs',
                ready ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-card/40')}>
                <CharacterIcon participant={p} size="xs" ringless />
                <span className="flex-1 truncate font-bold">{p.display_name}</span>
                {youCreator && <span className="text-[9px] text-gold">создатель</span>}
                <span className={cn('text-[10px]', ready ? 'text-emerald-300' : 'text-muted-foreground')}>
                  {ready ? '✓ готов' : '...'}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="glass-strong p-3 space-y-2">
        {/* Открытый сбор: любой может присоединиться к игре прямо отсюда */}
        {isOpen && !inGame && currentUser && isPlayer(currentUser) && (
          <button onClick={async () => {
            if (!sb || busy) return;
            setBusy(true);
            const newIds = [...(game.participant_ids || []), currentUser.id];
            await sb.from('super_games').update({ participant_ids: newIds }).eq('id', game.id);
            setBusy(false);
          }} className="btn-primary w-full">
            🎯 Присоединиться к игре
          </button>
        )}

        {inGame && !needsGm && (
          <button onClick={toggleReady} disabled={busy}
            className={cn('w-full', meReady ? 'btn-secondary' : 'btn-primary')}>
            {meReady ? '↩ Я не готов' : '⚔️ Я готов'}
          </button>
        )}
        {(isCreator || isAdmin) && (
          <button onClick={start} disabled={!canStart || busy || needsGm}
            className={cn('btn-success w-full', (!canStart || busy || needsGm) && 'opacity-50 cursor-not-allowed')}>
            {needsGm ? '⏳ Ждём апрува ведущего' :
             players.length < minPlayers ? `▶ Нужно ещё ${minPlayers - players.length} игр.` :
             !allReady ? `▶ Начать (${readyIds.size}/${players.length} готовы)` :
             '▶ Начать игру'}
          </button>
        )}
        {(isCreator || isAdmin) && !allReady && enoughPlayers && (
          <div className="text-[10px] text-center text-amber-300/80">
            Не все нажали «Готов», но вы можете стартовать в любой момент.
          </div>
        )}
        {(isCreator || isAdmin) && (
          <button onClick={cancelGame} disabled={busy} className="btn-danger w-full text-xs">
            ✕ Отменить игру
          </button>
        )}
      </div>
    </div>
  );
}
