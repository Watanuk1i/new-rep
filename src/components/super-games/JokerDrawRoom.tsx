'use client';

// ===========================================================================
// «Достать Джокера» — 3 режима (quick / long / advanced).
// type='mini_joker'. 2–6 игроков. Колода 10 обычных + 1 джокер.
// quick: один тянет джокера → проигрывает один, остальные делят банк.
// long: тянет джокера → выбывает, колода обновляется, играют до одного.
// advanced: long + действия (skip 20k / hint 30k / pass_turn).
// ===========================================================================

import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store/StoreProvider';
import { CharacterIcon } from '@/components/ui/CharacterIcon';
import { Yen } from '@/components/ui/Yen';
import { cn, isPlayer } from '@/lib/utils';
import { getSupabase } from '@/lib/supabase/client';
import { chargeToTreasury, payoutFromTreasury } from '@/lib/store/tx';
import {
  freshDeck, jokerChance, riskLevel, drawFromDeck, nextActiveIndex,
  applyTreasuryFee, splitPayout,
  SKIP_TURN_COST, HINT_COST, PASS_TURN_COST, NORMAL_CARDS_START, JOKERS_START,
} from '@/lib/jokerdraw/logic';
import type {
  SuperGame, Participant, JokerDrawState, JokerDrawAction, JokerDrawCard,
  JokerDrawMode,
} from '@/lib/store/types';

function getState(g: SuperGame): JokerDrawState {
  const s = (g.state || {}) as Partial<JokerDrawState>;
  return {
    mode: s.mode ?? 'quick',
    stake: s.stake ?? 0,
    fee_paid: s.fee_paid ?? {},
    bank: s.bank ?? 0,
    treasury_fee: s.treasury_fee ?? 0,
    payout_bank: s.payout_bank ?? 0,
    deck: s.deck ?? [],
    turn_order: s.turn_order ?? [],
    current_idx: s.current_idx ?? 0,
    eliminated_ids: s.eliminated_ids ?? [],
    skip_used_ids: s.skip_used_ids ?? [],
    hint_uses: s.hint_uses ?? {},
    hint_revealed_top: s.hint_revealed_top ?? {},
    pending_pass_from: s.pending_pass_from ?? null,
    pending_pass_to: s.pending_pass_to ?? null,
    actions: s.actions ?? [],
    winner_ids: s.winner_ids ?? [],
    loser_ids: s.loser_ids ?? [],
    status: s.status ?? 'waiting_players',
  };
}

async function readState(gameId: string): Promise<JokerDrawState | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.from('super_games').select('state').eq('id', gameId).single();
  return (data?.state as JokerDrawState) ?? null;
}

async function writeState(gameId: string, next: JokerDrawState, gameFields?: Partial<SuperGame>) {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from('super_games').update({ state: next, ...(gameFields ?? {}) }).eq('id', gameId);
}

async function pushEvent(title: string, body: string | undefined, link: string) {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from('events').insert({
    id: 'ev-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
    type: 'mini_game_progress',
    title, body: body ?? null, link_url: link, is_for_gm_only: false,
  });
}

function appendAction(j: JokerDrawState, action: Partial<JokerDrawAction>): JokerDrawAction[] {
  const a: JokerDrawAction = {
    id: 'a-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
    player_id: action.player_id ?? '',
    action_type: action.action_type ?? 'draw',
    target_player_id: action.target_player_id ?? null,
    card_result: action.card_result ?? null,
    risk_percent: action.risk_percent,
    risk_level: action.risk_level,
    money_delta: action.money_delta ?? 0,
    player_eliminated: !!action.player_eliminated,
    created_at: new Date().toISOString(),
  };
  return [...j.actions, a];
}

// ===========================================================================

export function JokerDrawRoom({ game }: { game: SuperGame }) {
  const { state, currentUser, role } = useStore();
  const isAdmin = role === 'gm' || role === 'queen';
  const j = getState(game);
  const players = (game.participant_ids || [])
    .map(pid => state.participants.find(p => p.id === pid))
    .filter(Boolean) as Participant[];

  const eliminatedSet = new Set(j.eliminated_ids);
  const activePlayers = players.filter(p => !eliminatedSet.has(p.id));
  const currentPlayerId = j.turn_order[j.current_idx];
  const currentPlayer = players.find(p => p.id === currentPlayerId) ?? null;
  const isMyTurn = !!currentUser && currentUser.id === currentPlayerId;
  const finished = j.status === 'finished';

  const allPaid = players.length > 0 && players.every(p => (j.fee_paid ?? {})[p.id] > 0);

  const chance = jokerChance(j.deck);
  const lvl = riskLevel(chance);

  return (
    <div className="space-y-3">
      <Header game={game} j={j} />

      <StakesBlock
        game={game} players={players} feePaid={j.fee_paid}
        stake={j.stake} isAdmin={isAdmin}
        onCollect={() => collectStakes(game, players, j.stake)}
        onCancel={() => cancelGame(game, players)}
      />

      {allPaid && !finished && j.status !== 'cancelled' && (
        <div className="glass p-3 space-y-3">
          {/* Колода и шанс */}
          <DeckIndicator deck={j.deck} chance={chance} level={lvl} />

          {/* Очередь */}
          <TurnOrder
            players={players} turnOrder={j.turn_order} currentIdx={j.current_idx}
            eliminated={eliminatedSet} skipUsed={new Set(j.skip_used_ids)}
          />

          {/* Кнопки текущего игрока */}
          {isMyTurn && (
            <CurrentPlayerActions
              game={game} j={j} currentUserId={currentUser!.id}
              activePlayers={activePlayers.filter(p => p.id !== currentUser!.id)}
            />
          )}

          {/* Подсказка: показать купившему игроку, какая верхняя карта (один раз до следующего тяга) */}
          {currentUser && j.hint_revealed_top && j.hint_revealed_top[currentUser.id] && (
            <div className="glass p-3 border border-amber-400/40 bg-amber-400/10 text-center">
              <div className="text-[10px] uppercase tracking-widest text-amber-300">Ваша подсказка</div>
              <div className="text-sm mt-1">
                Верхняя карта: {j.hint_revealed_top[currentUser.id] === 'joker'
                  ? <span className="text-red-300 font-bold">🃏 ДЖОКЕР — не тяните!</span>
                  : <span className="text-emerald-300 font-bold">🂠 безопасная</span>}
              </div>
            </div>
          )}

          {!isMyTurn && currentPlayer && (
            <div className="text-[11px] text-muted-foreground italic text-center">
              Сейчас ход: <b>{currentPlayer.display_name}</b>
            </div>
          )}

          {/* История ходов */}
          <ActionsLog actions={j.actions} players={players} />
        </div>
      )}

      {finished && (
        <FinalView j={j} players={players} game={game} />
      )}
    </div>
  );
}

// ---------- Шапка / индикатор колоды / очередь ----------

function Header({ game, j }: { game: SuperGame; j: JokerDrawState }) {
  const modeLabel: Record<JokerDrawMode, string> = {
    quick: '⚡ Быстрый',
    long: '🌀 Без бонусов',
    advanced: '♟️ С бонусами',
  };
  return (
    <div className="glass-strong gold-border p-4">
      <div className="font-heading text-lg font-bold text-gradient-gold">🎴 Достать Джокера</div>
      <div className="text-[11px] text-muted-foreground mt-1">
        Режим: <b>{modeLabel[j.mode]}</b> · Ставка <Yen amount={j.stake} className="inline" iconClass="w-3 h-3" /> · Казна 5%
      </div>
      <div className="grid grid-cols-3 gap-2 mt-3 text-center text-xs">
        <div>
          <div className="text-[10px] text-muted-foreground">Банк</div>
          <Yen amount={game.bank} className="text-base text-gold" iconClass="w-4 h-4" />
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground">Обычных</div>
          <div className="font-mono font-bold">{j.deck.filter(c => c === 'normal').length}</div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground">Джокеров</div>
          <div className="font-mono font-bold text-red-300">{j.deck.filter(c => c === 'joker').length}</div>
        </div>
      </div>
    </div>
  );
}

function DeckIndicator({ deck, chance, level }: { deck: JokerDrawCard[]; chance: number; level: 'low' | 'medium' | 'high' }) {
  return (
    <div className="p-3 rounded-xl bg-card/40 text-center">
      <div className="text-[10px] uppercase tracking-widest text-gold/70">Шанс джокера</div>
      <div className={cn('font-mono font-bold text-2xl mt-1',
        level === 'low' ? 'text-emerald-300' :
        level === 'medium' ? 'text-amber-300' : 'text-red-300')}>
        {chance.toFixed(2)}%
      </div>
      <div className="text-[10px] text-muted-foreground mt-1">
        {level === 'low' && 'низкий риск'}
        {level === 'medium' && 'средний риск'}
        {level === 'high' && 'высокий риск'}
        {' · карт в колоде: ' + deck.length}
      </div>
    </div>
  );
}

function TurnOrder({
  players, turnOrder, currentIdx, eliminated, skipUsed,
}: {
  players: Participant[]; turnOrder: string[]; currentIdx: number;
  eliminated: Set<string>; skipUsed: Set<string>;
}) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {turnOrder.map((id, i) => {
        const p = players.find(x => x.id === id);
        if (!p) return null;
        const isCurrent = i === currentIdx;
        const isOut = eliminated.has(id);
        return (
          <div key={id} className={cn(
            'flex flex-col items-center gap-1 p-1.5 rounded-lg border',
            isOut ? 'bg-card/20 border-white/5 opacity-50' :
            isCurrent ? 'bg-gold/10 border-gold/40' :
            'bg-card/40 border-white/8',
          )}>
            <CharacterIcon participant={p} size="xs" ringless />
            <span className="text-[10px] truncate max-w-[60px]">{p.display_name.split(' ')[0]}</span>
            <div className="flex items-center gap-1 text-[9px]">
              {isCurrent && <span className="text-gold">🎯</span>}
              {isOut && <span className="text-red-300">✕</span>}
              {skipUsed.has(id) && <span className="text-muted-foreground">пропуск исп.</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------- Действия текущего игрока ----------

function CurrentPlayerActions({
  game, j, currentUserId, activePlayers,
}: {
  game: SuperGame; j: JokerDrawState; currentUserId: string;
  activePlayers: Participant[];
}) {
  const skipUsed = j.skip_used_ids.includes(currentUserId);
  const hintUsed = (j.hint_uses?.[currentUserId] ?? 0) > 0;

  if (j.mode === 'advanced') {
    return (
      <div className="space-y-2">
        <button
          className="btn-primary w-full text-sm"
          onClick={() => doDraw(game, currentUserId)}
        >🎴 Тянуть карту</button>
        <div className="grid grid-cols-3 gap-2">
          <button
            className="btn-secondary text-[10px]"
            disabled={skipUsed}
            onClick={() => doSkip(game, currentUserId)}
          >⏭ Пропустить · {(SKIP_TURN_COST / 1000)}K</button>
          <button
            className="btn-secondary text-[10px]"
            disabled={hintUsed}
            onClick={() => doHint(game, currentUserId)}
          >💡 Подсказка · {(HINT_COST / 1000)}K</button>
          <PassMenu game={game} from={currentUserId} active={activePlayers} />
        </div>
        <div className="text-[10px] text-muted-foreground text-center">
          {skipUsed && 'Пропуск использован · '}
          {hintUsed && 'Подсказка использована · '}
          Передача хода {(PASS_TURN_COST / 1000)}K (моментально, без подтверждения).
        </div>
      </div>
    );
  }

  // quick / long
  return (
    <button
      className="btn-primary w-full text-sm"
      onClick={() => doDraw(game, currentUserId)}
    >🎴 Тянуть карту</button>
  );
}

function PassMenu({ game, from, active }: { game: SuperGame; from: string; active: Participant[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn-secondary text-[10px]" onClick={() => setOpen(true)}>↪ Передать ход · {(PASS_TURN_COST / 1000)}K</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="relative glass-strong w-full max-w-md p-4 rounded-2xl space-y-2">
            <div className="text-sm font-bold">Кому передать ход?</div>
            <div className="text-[11px] text-muted-foreground">
              Списывается {(PASS_TURN_COST / 1000)}K. Выбранный игрок ходит сразу.
            </div>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {active.map(p => (
                <button
                  key={p.id}
                  className="w-full flex items-center gap-2 p-2 rounded-xl bg-card/40 active:bg-white/5 text-left"
                  onClick={() => {
                    forcePass(game, from, p.id);
                    setOpen(false);
                  }}
                >
                  <CharacterIcon participant={p} size="xs" ringless />
                  <span className="text-sm">{p.display_name}</span>
                </button>
              ))}
            </div>
            <button className="btn-secondary w-full text-xs" onClick={() => setOpen(false)}>Отмена</button>
          </div>
        </div>
      )}
    </>
  );
}

// ---------- Лог действий ----------

function ActionsLog({ actions, players }: { actions: JokerDrawAction[]; players: Participant[] }) {
  if (actions.length === 0) return null;
  const last = actions.slice(-12).reverse();
  return (
    <details>
      <summary className="cursor-pointer text-[11px] text-muted-foreground py-1">История ходов ({actions.length})</summary>
      <div className="mt-2 space-y-1">
        {last.map(a => {
          const p = players.find(x => x.id === a.player_id);
          const t = players.find(x => x.id === a.target_player_id);
          return (
            <div key={a.id} className="flex items-center gap-2 p-1.5 rounded-lg bg-card/30 text-[11px]">
              {p && <CharacterIcon participant={p} size="xs" ringless />}
              <span className="flex-1 truncate">
                {p?.display_name}{' '}
                {a.action_type === 'draw' && (
                  <>
                    тянет: {a.card_result === 'joker' ? '🃏 Джокер' : '🂠 обычная'}
                    {a.player_eliminated && <span className="text-red-300 ml-1">— выбыл</span>}
                  </>
                )}
                {a.action_type === 'skip' && <>пропустил ход</>}
                {a.action_type === 'hint' && (
                  <>купил подсказку (топ: {a.card_result === 'joker' ? '🃏 джокер' : '🂠 безопасная'})</>
                )}
                {a.action_type === 'pass_request' && <>передал ход {t?.display_name} (платно)</>}
              </span>
            </div>
          );
        })}
      </div>
    </details>
  );
}

// ---------- Финал ----------

function FinalView({
  j, players, game,
}: { j: JokerDrawState; players: Participant[]; game: SuperGame }) {
  return (
    <div className="glass-strong gold-border p-4 space-y-2">
      <div className="text-[10px] uppercase tracking-widest text-gold/70">Игра завершена</div>
      <div className="text-xs">
        Банк: <Yen amount={j.bank} className="inline" iconClass="w-3 h-3" /> · Казна: <Yen amount={j.treasury_fee} className="inline" iconClass="w-3 h-3" /> · Выплачено: <Yen amount={j.payout_bank} className="inline" iconClass="w-3 h-3" />
      </div>
      <div className="space-y-1">
        {players.map(p => {
          const isWinner = j.winner_ids.includes(p.id);
          const isLoser = j.loser_ids.includes(p.id);
          return (
            <div key={p.id} className="flex items-center gap-2 p-1.5 rounded-xl bg-card/40 text-xs">
              <CharacterIcon participant={p} size="xs" ringless />
              <span className="flex-1 truncate">{p.display_name}</span>
              {isWinner && <span className="text-emerald-300 text-[10px]">победитель</span>}
              {isLoser && <span className="text-red-300 text-[10px]">проиграл</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Действия ----------

async function collectStakes(game: SuperGame, players: Participant[], stake: number) {
  const sb = getSupabase();
  if (!sb) return;
  const link = `/super-games/${game.id}`;
  const cur = await readState(game.id);
  if (!cur) return;
  const feePaid: Record<string, number> = { ...cur.fee_paid };
  let added = 0;
  for (const p of players) {
    if ((feePaid[p.id] ?? 0) > 0) continue;
    const res = await chargeToTreasury(p.id, stake, 'Достать Джокера · ставка', link);
    if (res.ok) { feePaid[p.id] = stake; added += stake; }
  }
  // Случайный порядок ходов
  const order = [...players.map(p => p.id)];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const next: JokerDrawState = {
    ...cur,
    fee_paid: feePaid,
    bank: (cur.bank ?? 0) + added,
    deck: freshDeck(),
    turn_order: order,
    current_idx: 0,
    status: 'active',
  };
  await writeState(game.id, next, { bank: (game.bank ?? 0) + added, status: 'live' });
}

async function cancelGame(game: SuperGame, players: Participant[]) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  const link = `/super-games/${game.id}`;
  for (const p of players) {
    const paid = (cur.fee_paid ?? {})[p.id] ?? 0;
    if (paid > 0) await payoutFromTreasury(p.id, paid, 'Возврат · Достать Джокера', link);
  }
  await writeState(game.id, { ...cur, status: 'cancelled' }, { status: 'cancelled', bank: 0 });
  await pushEvent('Достать Джокера · отменена', undefined, link);
}

async function doDraw(game: SuperGame, playerId: string) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  const link = `/super-games/${game.id}`;
  // Это должен быть текущий игрок (или принявший передачу)
  const expected = cur.turn_order[cur.current_idx];
  if (expected !== playerId) return;

  const before = cur.deck.length;
  const beforeChance = jokerChance(cur.deck);
  const { card, rest } = drawFromDeck(cur.deck);
  const eliminated = new Set(cur.eliminated_ids);
  let newEliminated = [...cur.eliminated_ids];
  let didEliminate = false;
  let newDeck = rest;
  let nextIdx = cur.current_idx;

  if (card === 'joker') {
    if (cur.mode === 'quick') {
      // Игра завершается сразу
      const loserIds = [playerId];
      const winnerIds = cur.turn_order.filter(id => id !== playerId);
      const { fee, payout } = applyTreasuryFee(cur.bank);
      const { each, remainder } = splitPayout(payout, winnerIds.length);
      // Выплата победителям
      for (const wid of winnerIds) {
        await payoutFromTreasury(wid, each, 'Достать Джокера · выплата', link);
      }
      // Остаток — в Казну (он там и так — мы просто не выводим)
      const next: JokerDrawState = {
        ...cur,
        deck: rest,
        eliminated_ids: [],
        winner_ids: winnerIds,
        loser_ids: loserIds,
        bank: cur.bank,
        treasury_fee: fee + remainder,
        payout_bank: each * winnerIds.length,
        status: 'finished',
        actions: appendAction(cur, {
          player_id: playerId, action_type: 'draw',
          card_result: 'joker', player_eliminated: true,
          risk_percent: beforeChance,
        }),
      };
      await writeState(game.id, next, { status: 'finished', bank: 0 });
      await pushEvent('Достать Джокера · быстрый режим завершён', undefined, link);
      return;
    }
    // long / advanced — игрок выбывает
    didEliminate = true;
    newEliminated = [...newEliminated, playerId];
    eliminated.add(playerId);
    newDeck = freshDeck();
    // Следующий активный ход
    const remaining = cur.turn_order.filter(id => !eliminated.has(id));
    if (remaining.length === 1) {
      // Завершаем
      const winnerId = remaining[0];
      const { fee, payout } = applyTreasuryFee(cur.bank);
      await payoutFromTreasury(winnerId, payout, 'Достать Джокера · банк', link);
      const next: JokerDrawState = {
        ...cur,
        deck: newDeck,
        eliminated_ids: newEliminated,
        winner_ids: [winnerId],
        loser_ids: cur.turn_order.filter(id => id !== winnerId),
        treasury_fee: fee,
        payout_bank: payout,
        status: 'finished',
        actions: appendAction(cur, {
          player_id: playerId, action_type: 'draw',
          card_result: 'joker', player_eliminated: true, risk_percent: beforeChance,
        }),
      };
      await writeState(game.id, next, { status: 'finished', bank: 0 });
      await pushEvent('Достать Джокера · игра завершена', undefined, link);
      return;
    }
    nextIdx = nextActiveIndex(cur.turn_order, cur.current_idx, eliminated);
  } else {
    // обычная карта — следующий
    nextIdx = nextActiveIndex(cur.turn_order, cur.current_idx, eliminated);
  }

  await writeState(game.id, {
    ...cur,
    deck: newDeck,
    eliminated_ids: newEliminated,
    current_idx: nextIdx,
    pending_pass_from: null, pending_pass_to: null,
    // Сбрасываем подсказку для тянувшего; при выбывании (новая колода) — сбрасываем всем
    hint_revealed_top: didEliminate
      ? {}
      : { ...(cur.hint_revealed_top ?? {}), [playerId]: null },
    actions: appendAction(cur, {
      player_id: playerId, action_type: 'draw',
      card_result: card,
      risk_percent: beforeChance,
      player_eliminated: didEliminate,
    }),
  });
}

async function doSkip(game: SuperGame, playerId: string) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  if (cur.skip_used_ids.includes(playerId)) return;
  const expected = cur.turn_order[cur.current_idx];
  if (expected !== playerId) return;
  const link = `/super-games/${game.id}`;
  const res = await chargeToTreasury(playerId, SKIP_TURN_COST, 'Достать Джокера · пропуск хода', link);
  if (!res.ok) return;
  const eliminated = new Set(cur.eliminated_ids);
  const nextIdx = nextActiveIndex(cur.turn_order, cur.current_idx, eliminated);
  await writeState(game.id, {
    ...cur,
    skip_used_ids: [...cur.skip_used_ids, playerId],
    current_idx: nextIdx,
    pending_pass_from: null, pending_pass_to: null,
    actions: appendAction(cur, {
      player_id: playerId, action_type: 'skip', money_delta: -SKIP_TURN_COST,
    }),
  });
}

async function doHint(game: SuperGame, playerId: string) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  const expected = cur.turn_order[cur.current_idx];
  if (expected !== playerId) return;
  if ((cur.hint_uses?.[playerId] ?? 0) > 0) return; // уже куплено
  const link = `/super-games/${game.id}`;
  const res = await chargeToTreasury(playerId, HINT_COST, 'Достать Джокера · подсказка', link);
  if (!res.ok) return;
  const chance = jokerChance(cur.deck);
  const lvl = riskLevel(chance);
  // Показываем верхнюю карту купившему — единственный полезный эффект подсказки
  const topCard = cur.deck[0] ?? null;
  await writeState(game.id, {
    ...cur,
    hint_uses: { ...cur.hint_uses, [playerId]: (cur.hint_uses[playerId] ?? 0) + 1 },
    hint_revealed_top: { ...(cur.hint_revealed_top ?? {}), [playerId]: topCard },
    actions: appendAction(cur, {
      player_id: playerId, action_type: 'hint',
      risk_percent: chance, risk_level: lvl, money_delta: -HINT_COST,
      card_result: topCard,
    }),
  });
}

async function forcePass(game: SuperGame, fromId: string, toId: string) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  const expected = cur.turn_order[cur.current_idx];
  if (expected !== fromId) return;
  if (toId === fromId) return;
  if (cur.eliminated_ids.includes(toId)) return;
  const link = `/super-games/${game.id}`;
  const res = await chargeToTreasury(fromId, PASS_TURN_COST, 'Достать Джокера · передача хода', link);
  if (!res.ok) return;
  const newIdx = cur.turn_order.indexOf(toId);
  if (newIdx < 0) return;
  await writeState(game.id, {
    ...cur,
    current_idx: newIdx,
    pending_pass_from: null,
    pending_pass_to: null,
    actions: appendAction(cur, {
      player_id: fromId, action_type: 'pass_request', target_player_id: toId,
      money_delta: -PASS_TURN_COST,
    }),
  });
}

// ---------- Общий компонент ставок (из шаблона) ----------

function StakesBlock({
  game, players, feePaid, stake, isAdmin, onCollect, onCancel,
}: {
  game: SuperGame; players: Participant[];
  feePaid: Record<string, number>; stake: number; isAdmin: boolean;
  onCollect: () => void; onCancel: () => void;
}) {
  const allPaid = players.length > 0 && players.every(p => (feePaid[p.id] ?? 0) > 0);
  if (allPaid) return null;
  return (
    <div className="glass p-3 space-y-2">
      <div className="text-[10px] uppercase tracking-widest text-gold/70">Ставки</div>
      <div className="space-y-1">
        {players.map(p => {
          const paid = (feePaid[p.id] ?? 0) > 0;
          return (
            <div key={p.id} className="flex items-center gap-2 p-1.5 rounded-xl bg-card/40 text-xs">
              <CharacterIcon participant={p} size="xs" ringless />
              <span className="flex-1 truncate">{p.display_name}</span>
              <Yen amount={stake} className="text-[10px] text-muted-foreground" iconClass="w-3 h-3" />
              {paid ? <span className="text-emerald-300 text-[10px]">✓</span> : <span className="text-muted-foreground text-[10px]">…</span>}
            </div>
          );
        })}
      </div>
      {isAdmin && (
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-primary text-xs" onClick={onCollect}>Собрать ставки</button>
          <button className="btn-danger text-xs" onClick={onCancel}>Отменить</button>
        </div>
      )}
    </div>
  );
}
