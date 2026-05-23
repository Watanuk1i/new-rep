'use client';

// ===========================================================================
// «Королевская рулетка» — 4-я Большая игра.
// Куратор и участник: Селестия. + 4 обычных игрока.
// 5 раундов × тайный выбор ставки → рулетка из 12 секторов → расчёт.
// Деньги ходят через Казну студсовета (как банк игры).
// Подробное ТЗ см. сообщение задачи. Логика — в src/lib/roulette/logic.ts.
// ===========================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@/lib/store/StoreProvider';
import { CharacterIcon } from '@/components/ui/CharacterIcon';
import { Yen } from '@/components/ui/Yen';
import { cn } from '@/lib/utils';
import { getSupabase } from '@/lib/supabase/client';
import { chargeToTreasury, payoutFromTreasury, TREASURY_ID } from '@/lib/store/tx';
import {
  WHEEL, SECTOR_META, BET_SPECS, ENTRY_FEE_PLAYER, ENTRY_FEE_CELESTIA,
  TOTAL_ROUNDS, allowedBets, spinWheel, resolveRound, pickWinner,
} from '@/lib/roulette/logic';
import type {
  SuperGame, Participant, RoyalRouletteState, RoyalRouletteRound,
  RouletteBet, RouletteSector,
} from '@/lib/store/types';

// ---------- helpers ----------

function getState(g: SuperGame): RoyalRouletteState {
  const s = (g.state || {}) as Partial<RoyalRouletteState>;
  return {
    current_round: s.current_round ?? 0,
    rounds: s.rounds ?? [],
    celestia_id: s.celestia_id ?? 'p-queen',
    celestia_privilege_used: s.celestia_privilege_used ?? false,
    fee_paid: s.fee_paid ?? {},
    net_profit: s.net_profit ?? {},
    status: s.status ?? 'scheduled',
    winner_id: s.winner_id ?? null,
  };
}

async function patchState(gameId: string, patch: Partial<RoyalRouletteState>, gameFields?: Partial<SuperGame>) {
  const sb = getSupabase();
  if (!sb) return;
  // читаем актуальное состояние перед обновлением, чтобы не затереть параллельные изменения
  const { data } = await sb.from('super_games').select('state, bank, status, winner_id').eq('id', gameId).single();
  const cur: RoyalRouletteState = data?.state ?? {};
  const next: RoyalRouletteState = { ...cur, ...patch } as RoyalRouletteState;
  await sb.from('super_games').update({ state: next, ...(gameFields ?? {}) }).eq('id', gameId);
}

async function logHistory(participantId: string, action: string, description: string, amount?: number, link?: string) {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from('history').insert({
    id: 'h-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    participant_id: participantId,
    action,
    description,
    amount: amount ?? null,
    link_url: link ?? null,
  });
}

async function pushEvent(title: string, body?: string, link?: string) {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from('events').insert({
    id: 'ev-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
    type: 'big_game_progress',
    title, body: body ?? null,
    link_url: link ?? null,
    is_for_gm_only: false,
  });
}

// ===========================================================================

export function RoyalRouletteRoom({ game }: { game: SuperGame }) {
  const { state, currentUser, role } = useStore();
  const isAdmin = role === 'gm' || role === 'queen';
  const rr = getState(game);

  const participants = (game.participant_ids || [])
    .map(pid => state.participants.find(p => p.id === pid))
    .filter(Boolean) as Participant[];

  const celestia = participants.find(p => p.id === rr.celestia_id) ?? null;
  const players = participants.filter(p => p.id !== rr.celestia_id);

  const isCelestia = !!currentUser && currentUser.id === rr.celestia_id;
  const isPlayerInGame = !!currentUser && participants.some(p => p.id === currentUser.id);

  const currentRound: RoyalRouletteRound | null =
    rr.current_round > 0 ? rr.rounds[rr.current_round - 1] ?? null : null;

  return (
    <div className="space-y-4">
      <Header game={game} rr={rr} celestia={celestia} />

      {/* Сбор взносов */}
      {(rr.status === 'scheduled' || rr.status === 'collecting_stakes') && (
        <StakesBlock game={game} rr={rr} participants={participants} celestia={celestia} isAdmin={isAdmin} />
      )}

      {/* Текущий раунд */}
      {currentRound && rr.status !== 'finished' && rr.status !== 'cancelled' && (
        <RoundView
          game={game} rr={rr} round={currentRound}
          participants={participants} celestia={celestia} players={players}
          isAdmin={isAdmin} isCelestia={isCelestia} isPlayerInGame={isPlayerInGame}
          currentUserId={currentUser?.id ?? null}
        />
      )}

      {/* История раундов */}
      {rr.rounds.length > 0 && (
        <RoundsHistory rr={rr} participants={participants} celestia={celestia} />
      )}

      {/* Финал */}
      {rr.status === 'finished' && (
        <FinishedView game={game} rr={rr} participants={participants} />
      )}

      {/* Админ-панель */}
      {isAdmin && rr.status !== 'finished' && rr.status !== 'cancelled' && (
        <AdminPanel game={game} rr={rr} participants={participants} celestia={celestia} players={players} />
      )}
    </div>
  );
}

// ---------- Шапка с банком и раундами ----------

function Header({ game, rr, celestia }: { game: SuperGame; rr: RoyalRouletteState; celestia: Participant | null }) {
  return (
    <div className="glass-strong gold-border p-4">
      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-gold/70">Банк</div>
          <Yen amount={game.bank} className="text-base text-gold mt-1" iconClass="w-4 h-4" />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-gold/70">Раунд</div>
          <div className="font-mono font-bold text-gold text-lg mt-1">
            {rr.current_round > 0 ? `${rr.current_round}/${TOTAL_ROUNDS}` : `0/${TOTAL_ROUNDS}`}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-gold/70">Привилегия</div>
          <div className={cn('font-bold text-sm mt-1', rr.celestia_privilege_used ? 'text-muted-foreground' : 'text-gold')}>
            {rr.celestia_privilege_used ? 'использована' : 'доступна'}
          </div>
        </div>
      </div>
      {celestia && (
        <div className="mt-3 flex items-center gap-2 px-2 py-2 rounded-xl bg-gold/5 border border-gold/20">
          <CharacterIcon participant={celestia} size="sm" />
          <div className="flex-1">
            <div className="text-[10px] uppercase tracking-widest text-gold/70">Куратор и игрок</div>
            <div className="font-bold text-sm">{celestia.display_name}</div>
          </div>
          <span className="text-[10px] text-gold/80 font-bold">♛</span>
        </div>
      )}
    </div>
  );
}

// ---------- Блок взносов ----------

function StakesBlock({
  game, rr, participants, celestia, isAdmin,
}: {
  game: SuperGame; rr: RoyalRouletteState;
  participants: Participant[]; celestia: Participant | null; isAdmin: boolean;
}) {
  const playersCount = participants.filter(p => p.id !== rr.celestia_id).length;
  const expectedBank = playersCount * ENTRY_FEE_PLAYER + (celestia ? ENTRY_FEE_CELESTIA : 0);
  const allPaid = participants.every(p => (rr.fee_paid[p.id] ?? 0) > 0);

  return (
    <div className="glass p-4 space-y-3">
      <div className="section-title text-sm">💰 Входные ставки</div>
      <p className="text-xs text-muted-foreground">
        Каждый обычный игрок вносит <Yen amount={ENTRY_FEE_PLAYER} className="inline" iconClass="w-3 h-3" />,
        Селестия — <Yen amount={ENTRY_FEE_CELESTIA} className="inline" iconClass="w-3 h-3" />.
        Банк <Yen amount={expectedBank} className="inline" iconClass="w-3 h-3" /> заберёт победитель.
      </p>
      <div className="space-y-1.5">
        {participants.map(p => {
          const paid = (rr.fee_paid[p.id] ?? 0) > 0;
          const fee = p.id === rr.celestia_id ? ENTRY_FEE_CELESTIA : ENTRY_FEE_PLAYER;
          return (
            <div key={p.id} className="flex items-center gap-2 p-2 rounded-xl bg-card/40">
              <CharacterIcon participant={p} size="xs" ringless />
              <span className="flex-1 text-sm">{p.display_name}</span>
              <Yen amount={fee} className="text-xs text-muted-foreground" iconClass="w-3 h-3" />
              {paid
                ? <span className="text-emerald-400 text-sm">✓</span>
                : <span className="text-muted-foreground text-sm">…</span>}
            </div>
          );
        })}
      </div>
      {isAdmin && !allPaid && (
        <button
          className="btn-primary w-full text-sm"
          onClick={() => collectStakes(game, rr, participants)}
        >
          Собрать взносы и начать игру
        </button>
      )}
      {allPaid && rr.status === 'collecting_stakes' && isAdmin && (
        <button
          className="btn-success w-full text-sm"
          onClick={() => startFirstRound(game, rr)}
        >
          ▶ Начать раунд 1
        </button>
      )}
    </div>
  );
}

async function collectStakes(game: SuperGame, rr: RoyalRouletteState, participants: Participant[]) {
  const sb = getSupabase();
  if (!sb) return;

  let bankAdded = 0;
  const feePaid: Record<string, number> = { ...rr.fee_paid };

  for (const p of participants) {
    if ((feePaid[p.id] ?? 0) > 0) continue;
    const fee = p.id === rr.celestia_id ? ENTRY_FEE_CELESTIA : ENTRY_FEE_PLAYER;
    const res = await chargeToTreasury(p.id, fee, `Взнос: Королевская рулетка`, `/super-games/${game.id}`);
    if (res.ok) {
      feePaid[p.id] = fee;
      bankAdded += fee;
    }
  }

  await patchState(game.id, {
    fee_paid: feePaid,
    status: 'collecting_stakes',
  }, {
    bank: (game.bank ?? 0) + bankAdded,
    status: 'live',
  });

  await pushEvent(
    'Королевская рулетка: взносы собраны',
    'Селестия и 4 игрока внесли свои йены в банк.',
    `/super-games/${game.id}`,
  );
}

async function startFirstRound(game: SuperGame, rr: RoyalRouletteState) {
  const round: RoyalRouletteRound = {
    number: 1,
    status: 'discussion',
    bets: {},
    celestia_viewed_player_id: null,
    celestia_view_seen_bet: null,
    result_sector: null,
    result_index: null,
  };
  await patchState(game.id, {
    current_round: 1,
    rounds: [round],
    status: 'round_discussion',
  });
  await pushEvent('Королевская рулетка: раунд 1', 'Обсуждение перед ставками.', `/super-games/${game.id}`);
}

// ---------- Раунд: разные фазы ----------

function RoundView({
  game, rr, round, participants, celestia, players, isAdmin, isCelestia, isPlayerInGame, currentUserId,
}: {
  game: SuperGame;
  rr: RoyalRouletteState;
  round: RoyalRouletteRound;
  participants: Participant[];
  celestia: Participant | null;
  players: Participant[];
  isAdmin: boolean;
  isCelestia: boolean;
  isPlayerInGame: boolean;
  currentUserId: string | null;
}) {
  const myBet = currentUserId ? round.bets[currentUserId] : undefined;

  return (
    <div className="glass-strong gold-border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-heading text-lg font-bold text-gradient-gold">Раунд {round.number}/{TOTAL_ROUNDS}</div>
        <PhaseBadge status={round.status} />
      </div>

      {/* Фаза: обсуждение */}
      {round.status === 'discussion' && (
        <div className="text-sm text-muted-foreground">
          Селестия открывает раунд. Обсудите ставки голосом — затем ведущий начнёт приём ставок.
        </div>
      )}

      {/* Фаза: выбор ставок */}
      {round.status === 'choosing' && (
        <BetChoosingBlock
          game={game} rr={rr} round={round}
          participants={participants}
          celestia={celestia} players={players}
          isCelestia={isCelestia}
          isPlayerInGame={isPlayerInGame}
          currentUserId={currentUserId}
          myBet={myBet}
        />
      )}

      {/* Фаза: рулетка крутится */}
      {round.status === 'spinning' && (
        <SpinningBlock round={round} />
      )}

      {/* Фаза: результат */}
      {round.status === 'resolved' && (
        <ResolvedBlock
          round={round} participants={participants} celestia={celestia}
          game={game} rr={rr} isCelestiaOrAdmin={isAdmin}
        />
      )}
    </div>
  );
}

function PhaseBadge({ status }: { status: RoyalRouletteRound['status'] }) {
  const map: Record<RoyalRouletteRound['status'], { label: string; cls: string }> = {
    discussion: { label: 'Обсуждение', cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
    choosing:   { label: 'Тайные ставки', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
    spinning:   { label: 'Рулетка', cls: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30' },
    resolved:   { label: 'Раскрыто', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  };
  const m = map[status];
  return <span className={cn('status-badge border', m.cls)}>{m.label}</span>;
}

// ---------- Выбор ставки ----------

function BetChoosingBlock({
  game, rr, round, participants, celestia, players,
  isCelestia, isPlayerInGame, currentUserId, myBet,
}: {
  game: SuperGame; rr: RoyalRouletteState; round: RoyalRouletteRound;
  participants: Participant[]; celestia: Participant | null; players: Participant[];
  isCelestia: boolean; isPlayerInGame: boolean;
  currentUserId: string | null; myBet?: RouletteBet;
}) {
  const totalNeeded = participants.length;
  const placedCount = Object.keys(round.bets).length;

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        Все участники тайно выбирают тип ставки. Выборы скрыты до раскрытия результата.
      </div>

      {/* индикатор сделанных ставок (без раскрытия) */}
      <div className="grid grid-cols-5 gap-1.5">
        {participants.map(p => {
          const placed = !!round.bets[p.id];
          return (
            <div key={p.id} className={cn(
              'flex flex-col items-center gap-1 p-1.5 rounded-lg',
              placed ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-card/40 border border-white/8',
            )}>
              <CharacterIcon participant={p} size="xs" ringless />
              <span className="text-[10px] truncate max-w-[60px]">{p.display_name.split(' ')[0]}</span>
              <span className={cn('text-[9px] uppercase tracking-wider font-bold',
                placed ? 'text-emerald-300' : 'text-muted-foreground')}>
                {placed ? '✓' : '…'}
              </span>
            </div>
          );
        })}
      </div>
      <div className="text-[10px] text-center text-muted-foreground">
        Готово: {placedCount}/{totalNeeded}
      </div>

      {/* Кнопки выбора для текущего игрока */}
      {isPlayerInGame && currentUserId && (
        <BetButtonsForCurrentUser
          game={game} rr={rr} round={round}
          isCelestia={isCelestia} currentUserId={currentUserId}
          myBet={myBet} players={players}
        />
      )}

      {!isPlayerInGame && (
        <div className="text-[11px] text-muted-foreground italic text-center">
          Вы наблюдатель — выборы будут раскрыты после рулетки.
        </div>
      )}
    </div>
  );
}

function BetButtonsForCurrentUser({
  game, rr, round, isCelestia, currentUserId, myBet, players,
}: {
  game: SuperGame; rr: RoyalRouletteState; round: RoyalRouletteRound;
  isCelestia: boolean; currentUserId: string;
  myBet?: RouletteBet; players: Participant[];
}) {
  const allowed = allowedBets(isCelestia);
  const [pickingTarget, setPickingTarget] = useState(false);

  // Селестии: подсветим увиденную карту, если она использовала Королевский взгляд
  const seenInfo = isCelestia && round.celestia_viewed_player_id
    ? {
        playerId: round.celestia_viewed_player_id,
        bet: round.celestia_view_seen_bet,
      }
    : null;

  return (
    <div className="space-y-2">
      {/* Селестия: привилегия */}
      {isCelestia && !rr.celestia_privilege_used && !pickingTarget && !seenInfo && (
        <button
          className="w-full px-3 py-2 rounded-xl border border-gold/40 bg-gold/10 text-gold text-xs font-bold active:scale-95"
          onClick={() => setPickingTarget(true)}
        >
          ♛ Королевский взгляд (1 раз за игру)
        </button>
      )}

      {pickingTarget && (
        <div className="glass p-3">
          <div className="text-[10px] uppercase tracking-widest text-gold/80 mb-2">Кого посмотреть?</div>
          <div className="grid grid-cols-2 gap-1.5">
            {players.map(p => {
              const placed = !!round.bets[p.id];
              return (
                <button
                  key={p.id}
                  disabled={!placed}
                  className={cn(
                    'flex items-center gap-1.5 p-1.5 rounded-lg text-left text-xs',
                    placed
                      ? 'bg-card/60 border border-gold/30 active:bg-gold/10'
                      : 'bg-card/30 border border-white/5 opacity-40',
                  )}
                  onClick={() => useCelestiaView(game, rr, round, p.id, currentUserId).then(() => setPickingTarget(false))}
                >
                  <CharacterIcon participant={p} size="xs" ringless />
                  <span className="truncate">{p.display_name}</span>
                  {!placed && <span className="text-[9px] text-muted-foreground ml-auto">не готов</span>}
                </button>
              );
            })}
          </div>
          <button
            className="mt-2 w-full text-xs text-muted-foreground py-1.5"
            onClick={() => setPickingTarget(false)}
          >Отменить</button>
        </div>
      )}

      {seenInfo && seenInfo.bet && (
        <div className="glass p-3 border border-gold/30">
          <div className="text-[10px] uppercase tracking-widest text-gold/80 mb-1">Вы увидели</div>
          <div className="flex items-center justify-between">
            <span className="text-sm">
              {players.find(p => p.id === seenInfo.playerId)?.display_name}
            </span>
            <BetChip bet={seenInfo.bet} />
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">
            В историю запишется: «Селестия использовала Королевский взгляд». Чей выбор — раскроется после игры.
          </div>
        </div>
      )}

      {/* Кнопки выбора ставки */}
      <div className="grid grid-cols-1 gap-2">
        {allowed.map(b => {
          const spec = BET_SPECS[b];
          const meta = SECTOR_META[b];
          const active = myBet === b;
          return (
            <button
              key={b}
              disabled={!!myBet}
              onClick={() => placeBet(game, round, currentUserId, b)}
              className={cn(
                'w-full px-3 py-3 rounded-xl text-left transition-colors',
                active
                  ? 'bg-gold/15 border-2 border-gold text-gold-light'
                  : myBet
                    ? 'bg-card/30 border border-white/5 opacity-50'
                    : 'bg-card/60 border border-white/10 active:bg-card/80',
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm">{meta.emoji} {meta.label}</span>
                {active && <span className="text-[10px] text-gold">✓ выбрано</span>}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">
                Риск <Yen amount={spec.riskAmount} className="inline text-[11px]" iconClass="w-3 h-3" />
                {' · '}
                Выигрыш <span className="text-emerald-300">+<Yen amount={spec.winAmount} className="inline text-[11px]" iconClass="w-3 h-3" /></span>
              </div>
            </button>
          );
        })}
      </div>

      {myBet && (
        <div className="text-[11px] text-emerald-300 text-center">
          ✓ Ставка принята. Ждём остальных и розыгрыша.
        </div>
      )}
    </div>
  );
}

function BetChip({ bet }: { bet: RouletteBet }) {
  const m = SECTOR_META[bet];
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border',
      bet === 'safe'  && 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
      bet === 'risky' && 'bg-amber-500/15 text-amber-300 border-amber-500/30',
      bet === 'royal' && 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30',
    )}>
      {m.emoji} {m.label}
    </span>
  );
}

async function placeBet(game: SuperGame, round: RoyalRouletteRound, playerId: string, bet: RouletteBet) {
  const sb = getSupabase();
  if (!sb) return;
  // обязательно — читаем актуальное состояние, потом мутируем
  const { data } = await sb.from('super_games').select('state').eq('id', game.id).single();
  const cur: RoyalRouletteState = data?.state ?? {};
  const idx = (cur.current_round ?? 1) - 1;
  const rounds = [...(cur.rounds ?? [])];
  if (!rounds[idx]) return;
  if (rounds[idx].bets[playerId]) return; // нельзя поменять ставку
  rounds[idx] = {
    ...rounds[idx],
    bets: { ...rounds[idx].bets, [playerId]: bet },
  };
  await sb.from('super_games').update({ state: { ...cur, rounds } }).eq('id', game.id);
}

async function useCelestiaView(
  game: SuperGame,
  rr: RoyalRouletteState,
  round: RoyalRouletteRound,
  targetPlayerId: string,
  celestiaId: string,
) {
  if (rr.celestia_privilege_used) return;
  const targetBet = round.bets[targetPlayerId];
  if (!targetBet) return; // нельзя смотреть до того, как игрок выбрал

  const sb = getSupabase();
  if (!sb) return;
  const { data } = await sb.from('super_games').select('state').eq('id', game.id).single();
  const cur: RoyalRouletteState = data?.state ?? {};
  const idx = (cur.current_round ?? 1) - 1;
  const rounds = [...(cur.rounds ?? [])];
  if (!rounds[idx]) return;
  rounds[idx] = {
    ...rounds[idx],
    celestia_viewed_player_id: targetPlayerId,
    celestia_view_seen_bet: targetBet,
  };
  await sb.from('super_games')
    .update({ state: { ...cur, rounds, celestia_privilege_used: true } })
    .eq('id', game.id);

  await pushEvent(
    'Селестия использовала «Королевский взгляд»',
    'Чей выбор она посмотрела — раскроется по итогам игры.',
    `/super-games/${game.id}`,
  );
  await logHistory(celestiaId, 'royal_roulette',
    'Использован «Королевский взгляд» в Королевской рулетке',
    undefined, `/super-games/${game.id}`);
}

// ---------- Анимация рулетки ----------

function SpinningBlock({ round }: { round: RoyalRouletteRound }) {
  // Если result_index ещё не известен — крутим неопределённо.
  // Если известен — анимируем приземление на этот сектор.
  const targetIndex = round.result_index ?? null;
  const [angle, setAngle] = useState(0);

  useEffect(() => {
    if (targetIndex == null) {
      let raf = 0;
      let a = 0;
      const tick = () => { a = (a + 12) % 360; setAngle(a); raf = requestAnimationFrame(tick); };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    } else {
      // Поворот так, чтобы выбранный сектор остановился под стрелкой сверху.
      const segments = WHEEL.length;
      const seg = 360 / segments;
      const final = 360 * 6 + (360 - (targetIndex * seg + seg / 2));
      setAngle(final);
    }
  }, [targetIndex]);

  return (
    <div className="flex flex-col items-center py-3">
      <Wheel angle={angle} highlightSector={null} />
      <div className="text-[11px] text-muted-foreground mt-2">
        {targetIndex == null ? 'Рулетка крутится...' : 'Останавливается...'}
      </div>
    </div>
  );
}

function Wheel({ angle, highlightSector }: { angle: number; highlightSector: RouletteSector | null }) {
  const size = 240;
  const r = size / 2;
  const segments = WHEEL.length;
  const seg = 360 / segments;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* стрелка-указатель */}
      <div
        className="absolute left-1/2 -translate-x-1/2 -top-1 z-10"
        style={{ width: 0, height: 0,
          borderLeft: '10px solid transparent',
          borderRight: '10px solid transparent',
          borderTop: '16px solid #d4af37',
          filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
        }}
      />
      <svg
        width={size} height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: `rotate(${angle}deg)`, transition: 'transform 4.5s cubic-bezier(0.17, 0.67, 0.21, 0.99)' }}
      >
        <circle cx={r} cy={r} r={r - 1} fill="#1a0f1f" stroke="#d4af37" strokeWidth={2} />
        {WHEEL.map((sector, i) => {
          const a0 = (i * seg - 90) * Math.PI / 180;
          const a1 = ((i + 1) * seg - 90) * Math.PI / 180;
          const x0 = r + (r - 4) * Math.cos(a0);
          const y0 = r + (r - 4) * Math.sin(a0);
          const x1 = r + (r - 4) * Math.cos(a1);
          const y1 = r + (r - 4) * Math.sin(a1);
          const isHi = highlightSector === sector;
          const fill = SECTOR_META[sector].hex;
          // подпись по центру сектора
          const am = ((i + 0.5) * seg - 90) * Math.PI / 180;
          const tx = r + (r - 36) * Math.cos(am);
          const ty = r + (r - 36) * Math.sin(am);
          return (
            <g key={i}>
              <path
                d={`M ${r} ${r} L ${x0} ${y0} A ${r - 4} ${r - 4} 0 0 1 ${x1} ${y1} Z`}
                fill={fill}
                fillOpacity={isHi ? 0.95 : 0.7}
                stroke="rgba(0,0,0,0.4)"
                strokeWidth={1}
              />
              <text
                x={tx} y={ty}
                fill="white" fontSize="13" fontWeight="700" textAnchor="middle"
                dominantBaseline="middle"
                style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.6))' }}
                transform={`rotate(${(i + 0.5) * seg} ${tx} ${ty})`}
              >
                {SECTOR_META[sector].emoji}
              </text>
            </g>
          );
        })}
        <circle cx={r} cy={r} r={18} fill="#0c0810" stroke="#d4af37" strokeWidth={2} />
      </svg>
    </div>
  );
}

// ---------- Раскрытие результата ----------

function ResolvedBlock({
  round, participants, celestia, game, rr, isCelestiaOrAdmin,
}: {
  round: RoyalRouletteRound; participants: Participant[]; celestia: Participant | null;
  game: SuperGame; rr: RoyalRouletteState; isCelestiaOrAdmin: boolean;
}) {
  const sector = round.result_sector!;
  const meta = SECTOR_META[sector];

  return (
    <div className="space-y-3">
      <Wheel angle={resolvedAngleFor(round.result_index ?? 0)} highlightSector={sector} />
      <div className="text-center">
        <div className="text-[10px] uppercase tracking-widest text-gold/70">Выпало</div>
        <div className={cn('font-heading font-bold text-2xl mt-1',
          sector === 'crown' ? 'text-gradient-gold' : '',
        )}>
          {meta.emoji} {meta.label}
        </div>
      </div>

      {/* Раскрытые ставки */}
      <div className="space-y-1.5">
        {participants.map(p => {
          const bet = round.bets[p.id];
          const delta = round.deltas?.[p.id] ?? 0;
          // Показываем дополнительные пометки от привилегий
          const arrog = round.arrogance_penalty_target === p.id;
          const luck = round.luck_tax_target === p.id;
          const cow = round.cowardice_penalty_target === p.id;
          return (
            <div key={p.id} className="flex items-center gap-2 p-2 rounded-xl bg-card/40">
              <CharacterIcon participant={p} size="xs" ringless />
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{p.display_name}</div>
                {(arrog || luck || cow) && (
                  <div className="text-[9px] text-fuchsia-300 italic mt-0.5">
                    {arrog && '♛ Штраф за дерзость '}
                    {luck && '♛ Налог на удачу '}
                    {cow && '♛ Штраф за трусость'}
                  </div>
                )}
              </div>
              {bet
                ? <BetChip bet={bet} />
                : <span className="text-[10px] text-muted-foreground italic">пропустил</span>}
              <span className={cn(
                'font-mono text-xs w-20 text-right',
                delta > 0 ? 'text-emerald-300' : delta < 0 ? 'text-red-300' : 'text-muted-foreground',
              )}>
                {delta > 0 ? '+' : ''}{new Intl.NumberFormat('ru-RU').format(delta)}
              </span>
            </div>
          );
        })}
      </div>

      {round.celestia_viewed_player_id && celestia && (
        <div className="text-[11px] text-gold/80 italic text-center">
          ♛ В этом раунде Селестия использовала «Королевский взгляд».
        </div>
      )}

      {isCelestiaOrAdmin && round.status === 'resolved' && (
        <CelestiaPrivilegesBlock game={game} rr={rr} round={round} participants={participants} />
      )}
    </div>
  );
}

// ---------- Привилегии Селестии после раскрытия раунда ----------

function CelestiaPrivilegesBlock({
  game, rr, round, participants,
}: {
  game: SuperGame; rr: RoyalRouletteState; round: RoyalRouletteRound; participants: Participant[];
}) {
  const [openType, setOpenType] = useState<null | 'arrogance' | 'luck' | 'cowardice'>(null);
  const arrUsed = rr.arrogance_penalty_used;
  const luckUsed = rr.luck_tax_used;
  const cowUsed = rr.cowardice_penalty_used;

  // Целевые игроки для каждой привилегии (по результату раунда)
  const royalLosers = participants.filter(p => {
    const bet = round.bets[p.id];
    const delta = round.deltas?.[p.id] ?? 0;
    return bet === 'royal' && delta < 0; // выбрали Royal и проиграли
  });
  const winners = participants.filter(p => {
    const delta = round.deltas?.[p.id] ?? 0;
    return delta > 0 && p.id !== rr.celestia_id;
  });
  const safeWinners = participants.filter(p => {
    const bet = round.bets[p.id];
    const delta = round.deltas?.[p.id] ?? 0;
    return bet === 'safe' && delta > 0;
  });

  const hasAnyTarget = (royalLosers.length > 0 && !arrUsed)
    || (winners.length > 0 && !luckUsed)
    || (safeWinners.length > 0 && !cowUsed);

  if (!hasAnyTarget && arrUsed && luckUsed && cowUsed) {
    return (
      <div className="text-[10px] text-muted-foreground italic text-center">
        ♛ Все привилегии Селестии в этой игре уже использованы.
      </div>
    );
  }

  return (
    <div className="glass p-3 border border-fuchsia-500/30 bg-fuchsia-500/5 space-y-2">
      <div className="text-[10px] uppercase tracking-widest text-fuchsia-300">♛ Привилегии Селестии · после раскрытия</div>

      <div className="grid grid-cols-1 gap-1.5">
        <button
          disabled={arrUsed || royalLosers.length === 0}
          onClick={() => setOpenType('arrogance')}
          className={cn('px-2 py-2 rounded-lg text-xs text-left border',
            arrUsed ? 'bg-card/20 border-white/5 opacity-40'
              : royalLosers.length === 0 ? 'bg-card/30 border-white/8 opacity-50'
              : 'bg-fuchsia-500/10 border-fuchsia-500/30 active:bg-fuchsia-500/20')}>
          ⚜ Штраф за дерзость · −100k проигравшему Королевскую
          {arrUsed && ' (использовано)'}
        </button>
        <button
          disabled={luckUsed || winners.length === 0}
          onClick={() => setOpenType('luck')}
          className={cn('px-2 py-2 rounded-lg text-xs text-left border',
            luckUsed ? 'bg-card/20 border-white/5 opacity-40'
              : winners.length === 0 ? 'bg-card/30 border-white/8 opacity-50'
              : 'bg-fuchsia-500/10 border-fuchsia-500/30 active:bg-fuchsia-500/20')}>
          💸 Налог на удачу · 20% выигрыша → Селестии
          {luckUsed && ' (использовано)'}
        </button>
        <button
          disabled={cowUsed || safeWinners.length === 0}
          onClick={() => setOpenType('cowardice')}
          className={cn('px-2 py-2 rounded-lg text-xs text-left border',
            cowUsed ? 'bg-card/20 border-white/5 opacity-40'
              : safeWinners.length === 0 ? 'bg-card/30 border-white/8 opacity-50'
              : 'bg-fuchsia-500/10 border-fuchsia-500/30 active:bg-fuchsia-500/20')}>
          🛡 Штраф за трусость · −50% Безопасного выигрыша
          {cowUsed && ' (использовано)'}
        </button>
      </div>

      {openType === 'arrogance' && (
        <PrivilegeTargetPicker
          title="Штраф за дерзость"
          quote="«Вы хотели играть по-королевски. Тогда и платить будете по-королевски.»"
          targets={royalLosers}
          onPick={(pid) => applyArrogancePenalty(game, pid).then(() => setOpenType(null))}
          onCancel={() => setOpenType(null)}
        />
      )}
      {openType === 'luck' && (
        <PrivilegeTargetPicker
          title="Налог на удачу"
          quote="«Поздравляю. Академия рада вашему успеху. Настолько рада, что заберёт свою долю.»"
          targets={winners}
          onPick={(pid) => applyLuckTax(game, pid).then(() => setOpenType(null))}
          onCancel={() => setOpenType(null)}
        />
      )}
      {openType === 'cowardice' && (
        <PrivilegeTargetPicker
          title="Штраф за трусость"
          quote="«Безопасность — это роскошь. А роскошь в моей Академии облагается налогом.»"
          targets={safeWinners}
          onPick={(pid) => applyCowardicePenalty(game, pid).then(() => setOpenType(null))}
          onCancel={() => setOpenType(null)}
        />
      )}
    </div>
  );
}

function PrivilegeTargetPicker({
  title, quote, targets, onPick, onCancel,
}: {
  title: string; quote: string;
  targets: Participant[];
  onPick: (id: string) => void; onCancel: () => void;
}) {
  return (
    <div className="glass-strong p-3 border border-fuchsia-500/40 space-y-2">
      <div className="text-xs font-bold text-fuchsia-200">{title}</div>
      <div className="text-[11px] text-fuchsia-300 italic">{quote}</div>
      <div className="space-y-1">
        {targets.map(p => (
          <button key={p.id} onClick={() => onPick(p.id)}
            className="w-full flex items-center gap-2 p-1.5 rounded-lg bg-card/40 active:bg-white/5 text-left">
            <CharacterIcon participant={p} size="xs" ringless />
            <span className="text-sm flex-1">{p.display_name}</span>
            <span className="text-fuchsia-300 text-xs">→</span>
          </button>
        ))}
      </div>
      <button onClick={onCancel} className="btn-secondary w-full text-xs">Отмена</button>
    </div>
  );
}

async function applyArrogancePenalty(game: SuperGame, targetId: string) {
  const sb = getSupabase();
  if (!sb) return;
  const { data } = await sb.from('super_games').select('state').eq('id', game.id).single();
  const cur: RoyalRouletteState = data?.state ?? {};
  if (cur.arrogance_penalty_used) { alert('Уже использовано'); return; }
  const idx = (cur.current_round ?? 1) - 1;
  const rounds = [...(cur.rounds ?? [])];
  const round = rounds[idx];
  if (!round) return;
  const PENALTY = 100_000;
  // Списываем у игрока в Казну
  await chargeToTreasury(targetId, PENALTY,
    `Штраф за дерзость · Королевская рулетка раунд ${round.number}`,
    `/super-games/${game.id}`);
  // Обновляем state: помечаем флаг и пишем дельту в раунд
  const newDeltas = { ...(round.deltas ?? {}) };
  newDeltas[targetId] = (newDeltas[targetId] ?? 0) - PENALTY;
  const netProfit = { ...(cur.net_profit ?? {}) };
  netProfit[targetId] = (netProfit[targetId] ?? 0) - PENALTY;
  rounds[idx] = {
    ...round, deltas: newDeltas,
    arrogance_penalty_target: targetId,
    arrogance_penalty_amount: PENALTY,
  };
  await sb.from('super_games').update({
    state: { ...cur, rounds, net_profit: netProfit, arrogance_penalty_used: true },
  }).eq('id', game.id);
  await pushEvent('Селестия применила «Штраф за дерзость»',
    'Вы хотели играть по-королевски. Тогда и платить будете по-королевски.',
    `/super-games/${game.id}`);
}

async function applyLuckTax(game: SuperGame, targetId: string) {
  const sb = getSupabase();
  if (!sb) return;
  const { data } = await sb.from('super_games').select('state').eq('id', game.id).single();
  const cur: RoyalRouletteState = data?.state ?? {};
  if (cur.luck_tax_used) { alert('Уже использовано'); return; }
  const idx = (cur.current_round ?? 1) - 1;
  const rounds = [...(cur.rounds ?? [])];
  const round = rounds[idx];
  if (!round) return;
  const win = round.deltas?.[targetId] ?? 0;
  if (win <= 0) { alert('У игрока нет выигрыша в этом раунде'); return; }
  const TAX = Math.floor(win * 0.20);
  // Игрок → Селестии
  const { applyTransfer } = await import('@/lib/store/tx');
  await applyTransfer(targetId, cur.celestia_id, TAX,
    `Налог на удачу · Королевская рулетка раунд ${round.number}`,
    `/super-games/${game.id}`);
  const newDeltas = { ...(round.deltas ?? {}) };
  newDeltas[targetId] = (newDeltas[targetId] ?? 0) - TAX;
  newDeltas[cur.celestia_id] = (newDeltas[cur.celestia_id] ?? 0) + TAX;
  const netProfit = { ...(cur.net_profit ?? {}) };
  netProfit[targetId] = (netProfit[targetId] ?? 0) - TAX;
  netProfit[cur.celestia_id] = (netProfit[cur.celestia_id] ?? 0) + TAX;
  rounds[idx] = {
    ...round, deltas: newDeltas,
    luck_tax_target: targetId,
    luck_tax_amount: TAX,
  };
  await sb.from('super_games').update({
    state: { ...cur, rounds, net_profit: netProfit, luck_tax_used: true },
  }).eq('id', game.id);
  await pushEvent('Селестия применила «Налог на удачу»',
    'Поздравляю. Академия рада вашему успеху. Настолько рада, что заберёт свою долю.',
    `/super-games/${game.id}`);
}

async function applyCowardicePenalty(game: SuperGame, targetId: string) {
  const sb = getSupabase();
  if (!sb) return;
  const { data } = await sb.from('super_games').select('state').eq('id', game.id).single();
  const cur: RoyalRouletteState = data?.state ?? {};
  if (cur.cowardice_penalty_used) { alert('Уже использовано'); return; }
  const idx = (cur.current_round ?? 1) - 1;
  const rounds = [...(cur.rounds ?? [])];
  const round = rounds[idx];
  if (!round) return;
  const win = round.deltas?.[targetId] ?? 0;
  if (win <= 0) return;
  const PENALTY = Math.floor(win * 0.5); // забираем половину
  await chargeToTreasury(targetId, PENALTY,
    `Штраф за трусость · Королевская рулетка раунд ${round.number}`,
    `/super-games/${game.id}`);
  const newDeltas = { ...(round.deltas ?? {}) };
  newDeltas[targetId] = (newDeltas[targetId] ?? 0) - PENALTY;
  const netProfit = { ...(cur.net_profit ?? {}) };
  netProfit[targetId] = (netProfit[targetId] ?? 0) - PENALTY;
  rounds[idx] = {
    ...round, deltas: newDeltas,
    cowardice_penalty_target: targetId,
    cowardice_penalty_amount: PENALTY,
  };
  await sb.from('super_games').update({
    state: { ...cur, rounds, net_profit: netProfit, cowardice_penalty_used: true },
  }).eq('id', game.id);
  await pushEvent('Селестия применила «Штраф за трусость»',
    'Безопасность — это роскошь. А роскошь в моей Академии облагается налогом.',
    `/super-games/${game.id}`);
}

function resolvedAngleFor(index: number): number {
  // Поворот, при котором сектор index стоит под стрелкой.
  const seg = 360 / WHEEL.length;
  return 360 * 6 + (360 - (index * seg + seg / 2));
}

// ---------- История раундов ----------

function RoundsHistory({
  rr, participants, celestia,
}: {
  rr: RoyalRouletteState; participants: Participant[]; celestia: Participant | null;
}) {
  const finishedRounds = rr.rounds.filter(r => r.status === 'resolved');
  if (finishedRounds.length === 0) return null;

  return (
    <div className="glass p-4">
      <div className="section-title text-sm mb-2">📜 История раундов</div>
      <div className="space-y-2">
        {finishedRounds.map(r => (
          <details key={r.number} className="bg-card/30 rounded-xl border border-white/8 overflow-hidden">
            <summary className="px-3 py-2 cursor-pointer flex items-center gap-2 text-xs">
              <span className="font-bold">Раунд {r.number}</span>
              <span className="text-muted-foreground">·</span>
              <span>{SECTOR_META[r.result_sector!].emoji} {SECTOR_META[r.result_sector!].label}</span>
              {r.celestia_viewed_player_id && (
                <span className="ml-auto text-[10px] text-gold/80">♛ взгляд</span>
              )}
            </summary>
            <div className="p-3 pt-0 space-y-1">
              {participants.map(p => {
                const bet = r.bets[p.id];
                const delta = r.deltas?.[p.id] ?? 0;
                return (
                  <div key={p.id} className="flex items-center gap-2 text-xs">
                    <CharacterIcon participant={p} size="xs" ringless />
                    <span className="flex-1 truncate">{p.display_name}</span>
                    {bet ? <BetChip bet={bet} /> : <span className="text-muted-foreground italic">—</span>}
                    <span className={cn('font-mono w-16 text-right',
                      delta > 0 ? 'text-emerald-300' : delta < 0 ? 'text-red-300' : 'text-muted-foreground',
                    )}>
                      {delta > 0 ? '+' : ''}{new Intl.NumberFormat('ru-RU').format(delta)}
                    </span>
                  </div>
                );
              })}
              {r.celestia_viewed_player_id && r.celestia_view_seen_bet && rr.status === 'finished' && (
                <div className="mt-2 text-[10px] text-gold/80 italic">
                  ♛ Просмотрено: {participants.find(p => p.id === r.celestia_viewed_player_id)?.display_name} → <BetChip bet={r.celestia_view_seen_bet} />
                </div>
              )}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

// ---------- Финальный экран ----------

function FinishedView({
  game, rr, participants,
}: {
  game: SuperGame; rr: RoyalRouletteState; participants: Participant[];
}) {
  const winner = participants.find(p => p.id === rr.winner_id) ?? null;
  return (
    <div className="glass-strong gold-border p-5 text-center">
      <div className="text-[10px] uppercase tracking-widest text-gold/70">Игра завершена</div>
      {winner ? (
        <>
          <h3 className="font-heading text-2xl font-bold text-gradient-gold mt-2">{winner.display_name}</h3>
          <p className="text-xs text-muted-foreground mt-1">забирает банк</p>
          <Yen amount={game.bank} className="text-2xl text-gold mt-2 justify-center" iconClass="w-5 h-5" />
        </>
      ) : (
        <p className="text-sm text-muted-foreground mt-2">Победитель не определён.</p>
      )}
      <div className="mt-4 grid grid-cols-1 gap-1.5">
        {participants.map(p => {
          const profit = rr.net_profit[p.id] ?? 0;
          return (
            <div key={p.id} className="flex items-center gap-2 p-2 rounded-xl bg-card/40">
              <CharacterIcon participant={p} size="xs" ringless />
              <span className="flex-1 text-xs text-left">{p.display_name}</span>
              <span className={cn('font-mono text-xs',
                profit > 0 ? 'text-emerald-300' : profit < 0 ? 'text-red-300' : 'text-muted-foreground',
              )}>
                {profit > 0 ? '+' : ''}{new Intl.NumberFormat('ru-RU').format(profit)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Админ-панель ----------

function AdminPanel({
  game, rr, participants, celestia, players,
}: {
  game: SuperGame; rr: RoyalRouletteState;
  participants: Participant[]; celestia: Participant | null; players: Participant[];
}) {
  const round = rr.current_round > 0 ? rr.rounds[rr.current_round - 1] : null;
  const [manualWinnerOpen, setManualWinnerOpen] = useState(false);

  return (
    <div className="glass-strong gold-border p-4 space-y-2">
      <div className="text-[10px] uppercase tracking-widest text-gold/70">⚙️ Управление ведущего</div>

      {round?.status === 'discussion' && (
        <button
          className="btn-primary w-full text-xs"
          onClick={() => updateRoundStatus(game, 'choosing')}
        >Открыть приём ставок</button>
      )}

      {round?.status === 'choosing' && (
        <>
          <div className="text-[11px] text-muted-foreground">
            Сделали выбор: {Object.keys(round.bets).length}/{participants.length}
          </div>
          <button
            className="btn-primary w-full text-xs"
            disabled={Object.keys(round.bets).length < participants.length}
            onClick={() => startSpin(game)}
          >Завершить выбор и крутить рулетку</button>
        </>
      )}

      {round?.status === 'spinning' && (
        <button
          className="btn-success w-full text-xs"
          onClick={() => resolveSpin(game)}
        >Раскрыть результат</button>
      )}

      {round?.status === 'resolved' && (
        rr.current_round < TOTAL_ROUNDS ? (
          <button
            className="btn-primary w-full text-xs"
            onClick={() => nextRound(game)}
          >Начать раунд {rr.current_round + 1}</button>
        ) : (
          <button
            className="btn-success w-full text-xs"
            onClick={() => finishGame(game, participants)}
          >🏁 Завершить игру и выплатить банк</button>
        )
      )}

      {/* Назначить победителя вручную (на случай двойной ничьей или спорной ситуации) */}
      {rr.status !== 'cancelled' && rr.status !== 'finished' && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground py-1">Назначить победителя вручную</summary>
          <div className="grid grid-cols-2 gap-1 mt-2">
            {participants.map(p => (
              <button
                key={p.id}
                className="text-left px-2 py-2 rounded-lg bg-card/40 border border-white/8 active:bg-white/5"
                onClick={() => finishGame(game, participants, p.id)}
              >
                🏆 {p.display_name}
              </button>
            ))}
          </div>
        </details>
      )}

      {/* Отмена и возврат ставок */}
      {(rr.status === 'collecting_stakes' || rr.status === 'round_discussion'
        || rr.status === 'choosing_bets' || rr.status === 'spinning' || rr.status === 'round_result') && (
        <details className="text-xs">
          <summary className="cursor-pointer text-red-300/80 py-1">Отменить игру и вернуть ставки</summary>
          <button
            className="btn-danger w-full text-xs mt-2"
            onClick={() => cancelAndRefund(game, rr, participants)}
          >Отменить и вернуть взносы</button>
        </details>
      )}
    </div>
  );
}

async function updateRoundStatus(game: SuperGame, next: RoyalRouletteRound['status']) {
  const sb = getSupabase();
  if (!sb) return;
  const { data } = await sb.from('super_games').select('state').eq('id', game.id).single();
  const cur: RoyalRouletteState = data?.state ?? {};
  const idx = (cur.current_round ?? 1) - 1;
  const rounds = [...(cur.rounds ?? [])];
  if (!rounds[idx]) return;
  rounds[idx] = { ...rounds[idx], status: next };
  const statusMap: Record<RoyalRouletteRound['status'], RoyalRouletteState['status']> = {
    discussion: 'round_discussion',
    choosing:   'choosing_bets',
    spinning:   'spinning',
    resolved:   'round_result',
  };
  await sb.from('super_games').update({ state: { ...cur, rounds, status: statusMap[next] } }).eq('id', game.id);
}

async function startSpin(game: SuperGame) {
  const sb = getSupabase();
  if (!sb) return;
  const { data } = await sb.from('super_games').select('state').eq('id', game.id).single();
  const cur: RoyalRouletteState = data?.state ?? {};
  const idx = (cur.current_round ?? 1) - 1;
  const rounds = [...(cur.rounds ?? [])];
  if (!rounds[idx]) return;

  const { index, sector } = spinWheel();
  rounds[idx] = {
    ...rounds[idx],
    status: 'spinning',
    result_index: index,
    result_sector: sector,
  };
  await sb.from('super_games').update({ state: { ...cur, rounds, status: 'spinning' } }).eq('id', game.id);
}

async function resolveSpin(game: SuperGame) {
  const sb = getSupabase();
  if (!sb) return;
  const { data } = await sb.from('super_games').select('state, bank').eq('id', game.id).single();
  const cur: RoyalRouletteState = data?.state ?? {};
  const idx = (cur.current_round ?? 1) - 1;
  const rounds = [...(cur.rounds ?? [])];
  const round = rounds[idx];
  if (!round || !round.result_sector) return;
  // ЗАЩИТА от двойного срабатывания: если уже применили дельты — не пересчитываем.
  if (round.deltas || round.status === 'resolved' || round.resolved_at) return;
  // Сразу помечаем раунд как resolved, чтобы повторный клик увидел и вышел.
  // Дельты применятся ниже — атомарно через двойной апдейт.
  rounds[idx] = { ...round, status: 'resolved', resolved_at: new Date().toISOString() };
  const lockResult = await sb.from('super_games').update({
    state: { ...cur, rounds },
  }).eq('id', game.id).eq('status', cur.status); // optimistic lock на статус
  if (lockResult.error) {
    console.error('[resolveSpin] lock failed', lockResult.error);
    return;
  }

  const deltas = resolveRound(round.result_sector, round.bets, cur.celestia_id);

  // Применяем дельты через Казну
  for (const [pid, delta] of Object.entries(deltas.perPlayer)) {
    if (delta > 0) {
      await payoutFromTreasury(pid, delta, `Королевская рулетка · раунд ${round.number}`, `/super-games/${game.id}`);
    } else if (delta < 0) {
      await chargeToTreasury(pid, -delta, `Королевская рулетка · раунд ${round.number}`, `/super-games/${game.id}`);
    }
  }

  // Обновим net_profit
  const netProfit = { ...(cur.net_profit ?? {}) };
  for (const [pid, delta] of Object.entries(deltas.perPlayer)) {
    netProfit[pid] = (netProfit[pid] ?? 0) + delta;
  }

  // Финальная запись с дельтами и сменой статуса игры
  rounds[idx] = {
    ...rounds[idx],
    deltas: deltas.perPlayer,
    treasury_delta: deltas.treasury,
  };

  await sb.from('super_games').update({
    state: { ...cur, rounds, net_profit: netProfit, status: 'round_result' },
  }).eq('id', game.id);

  await pushEvent(
    `Королевская рулетка: раунд ${round.number} — ${SECTOR_META[round.result_sector].label}`,
    undefined, `/super-games/${game.id}`,
  );
}

async function nextRound(game: SuperGame) {
  const sb = getSupabase();
  if (!sb) return;
  const { data } = await sb.from('super_games').select('state').eq('id', game.id).single();
  const cur: RoyalRouletteState = data?.state ?? {};
  const nextNum = (cur.current_round ?? 0) + 1;
  if (nextNum > TOTAL_ROUNDS) return;
  const newRound: RoyalRouletteRound = {
    number: nextNum,
    status: 'discussion',
    bets: {},
    celestia_viewed_player_id: null,
    celestia_view_seen_bet: null,
    result_sector: null,
    result_index: null,
  };
  const rounds = [...(cur.rounds ?? []), newRound];
  await sb.from('super_games').update({
    state: { ...cur, current_round: nextNum, rounds, status: 'round_discussion' },
  }).eq('id', game.id);
  await pushEvent(`Королевская рулетка: раунд ${nextNum}`, undefined, `/super-games/${game.id}`);
}

async function finishGame(game: SuperGame, participants: Participant[], manualWinnerId?: string) {
  const sb = getSupabase();
  if (!sb) return;
  const { data } = await sb.from('super_games').select('state, bank').eq('id', game.id).single();
  const cur: RoyalRouletteState = data?.state ?? {};
  const bank = data?.bank ?? 0;

  const balances: Record<string, number> = {};
  for (const p of participants) balances[p.id] = p.balance ?? 0;

  let winnerId: string | null = manualWinnerId ?? null;
  if (!winnerId) winnerId = pickWinner(cur.net_profit ?? {}, balances);

  if (winnerId && bank > 0) {
    await payoutFromTreasury(winnerId, bank, `Королевская рулетка: банк`, `/super-games/${game.id}`);
  }

  await sb.from('super_games').update({
    state: { ...cur, status: 'finished', winner_id: winnerId },
    status: 'finished',
    winner_id: winnerId,
    bank: 0,
  }).eq('id', game.id);

  const winner = participants.find(p => p.id === winnerId);
  if (winner) {
    const isCelestia = winner.id === cur.celestia_id;
    const title = isCelestia
      ? `Селестия лично выиграла «Королевскую рулетку» и забрала банк`
      : `${winner.display_name} победил Селестию в «Королевской рулетке» и забрал банк`;
    await pushEvent(title, `Банк: ${new Intl.NumberFormat('ru-RU').format(bank)}`, `/super-games/${game.id}`);
    await logHistory(winner.id, 'royal_roulette', title, bank, `/super-games/${game.id}`);
  } else {
    await pushEvent('Королевская рулетка завершена без победителя', undefined, `/super-games/${game.id}`);
  }
}

async function cancelAndRefund(game: SuperGame, rr: RoyalRouletteState, participants: Participant[]) {
  const sb = getSupabase();
  if (!sb) return;
  // вернуть взносы, какие были собраны
  for (const p of participants) {
    const paid = rr.fee_paid[p.id] ?? 0;
    if (paid > 0) {
      await payoutFromTreasury(p.id, paid, `Возврат: Королевская рулетка отменена`, `/super-games/${game.id}`);
    }
  }
  await sb.from('super_games').update({
    state: { ...rr, status: 'cancelled' },
    status: 'cancelled',
    bank: 0,
  }).eq('id', game.id);
  await pushEvent('Королевская рулетка отменена', 'Все взносы возвращены.', `/super-games/${game.id}`);
}
