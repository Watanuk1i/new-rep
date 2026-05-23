'use client';

// ===========================================================================
// Малые игры (MVP, ТЗ claude_opus_mini_igry):
//   1. mini_red_black     — Красное/Чёрное (1v1)
//   2. mini_blind_bid     — Слепая ставка (2–6)
//   3. mini_liar_dice     — Лжец на кубиках (2–6, MVP: один спор)
//   4. mini_despair_21    — 21 отчаяния (1–5 против дилера)
//   5. mini_ransom        — Выкупной стол (должник vs хозяин/Мондо/Казна)
//
// Каждая игра — это запись в super_games со своим типом mini_*.
// Универсальная комната диспетчеризует по game.type.
// ===========================================================================

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/lib/store/StoreProvider';
import { CharacterIcon } from '@/components/ui/CharacterIcon';
import { Yen } from '@/components/ui/Yen';
import { cn } from '@/lib/utils';
import { getSupabase } from '@/lib/supabase/client';
import {
  applyTransfer, chargeToTreasury, payoutFromTreasury, transferBetweenPlayers,
} from '@/lib/store/tx';
import { JokerDrawRoom } from './JokerDrawRoom';
import { MiniGameLobby, isInLobby } from './MiniGameLobby';
import { DieView } from '@/components/ui/DieView';
import { freshDeck as freshJokerDeck } from '@/lib/jokerdraw/logic';
import {
  TREASURY_FEE_RATE, applyTreasuryFee,
  spinRedBlack, findUniqueMax,
  LIAR_DICE_PER_PLAYER, rollDie, countFaces, isHigherClaim,
  drawBjCard, dealerPlay, bjCompare,
  shuffleRansomCards, applyRansom,
} from '@/lib/minigames/logic';
import type {
  SuperGame, Participant, MiniGameKind,
  MiniGameRedBlackState, MiniGameBlindBidState, MiniGameLiarDiceState,
  MiniGameDespair21State, MiniGameRansomState,
} from '@/lib/store/types';

// ---------- shared helpers ----------

async function readState<T = any>(gameId: string): Promise<T | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.from('super_games').select('state, bank').eq('id', gameId).single();
  return (data?.state ?? null) as T | null;
}

async function writeState(gameId: string, next: any, gameFields?: Partial<SuperGame>) {
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
    title, body: body ?? null, link_url: link,
    is_for_gm_only: false,
  });
}

// ===========================================================================

export function MiniGameRoom({ game }: { game: SuperGame }) {
  const st = (game.state || {}) as any;

  // Универсальное лобби: показываем перед стартом игры.
  // Игры могут поднять status = 'active' либо в onStart колбэке, либо через свои действия.
  if (isInLobby(st)) {
    // Минимум игроков по типу игры
    const minByType: Record<string, number> = {
      mini_red_black: 2,
      mini_blind_bid: 2,
      mini_liar_dice: 2,
      mini_despair_21: 1,
      mini_ransom: 1,
      mini_joker: 2,
    };
    return (
      <MiniGameLobby
        game={game}
        state={st}
        minPlayers={minByType[game.type] ?? 2}
        onStart={async () => { await startMiniGame(game); }}
      />
    );
  }

  switch (game.type as MiniGameKind) {
    case 'mini_red_black':   return <RedBlackRoom game={game} />;
    case 'mini_blind_bid':   return <BlindBidRoom game={game} />;
    case 'mini_liar_dice':   return <LiarDiceRoom game={game} />;
    case 'mini_despair_21':  return <Despair21Room game={game} />;
    case 'mini_ransom':      return <RansomRoom game={game} />;
    default:
      // Поддержка mini_joker (3 режима) живёт отдельным файлом
      if (game.type === 'mini_joker') return <JokerDrawRoom game={game} />;
      return null;
  }
}

/**
 * Стартует малую игру: переводит статус в 'active'. Для red_black/blind_bid/liar_dice/despair_21
 * также сразу списывает входные ставки, чтобы игроки могли начать действовать без отдельного
 * шага «оплатить ставку».
 */
async function startMiniGame(game: SuperGame) {
  const sb = getSupabase();
  if (!sb) return;
  const { data } = await sb.from('super_games').select('state, bank, participant_ids, entry_fee, type').eq('id', game.id).single();
  if (!data) return;
  const cur = (data.state ?? {}) as any;
  const stake = data.entry_fee ?? cur.stake ?? 0;
  const participants = (data.participant_ids ?? []) as string[];
  const players = participants
    .map((pid: string) => ({ id: pid })) as any as Participant[];

  // Liar dice и 21 отчаяния — отдельная логика (списание + раздача)
  if (data.type === 'mini_liar_dice') {
    const { data: parts } = await sb.from('participants').select('*').in('id', participants);
    await collectStakesAndDeal(game, (parts ?? []) as Participant[], stake);
    return;
  }
  if (data.type === 'mini_despair_21') {
    const { data: parts } = await sb.from('participants').select('*').in('id', participants);
    await collectStakesAndDeal21(game, (parts ?? []) as Participant[], stake);
    return;
  }

  const link = `/super-games/${game.id}`;
  const feePaid: Record<string, number> = { ...(cur.fee_paid ?? {}) };
  let added = 0;

  // Сразу собираем ставки для red_black и mini_joker
  const collectImmediately = ['mini_red_black', 'mini_joker'];
  if (stake > 0 && collectImmediately.includes(data.type)) {
    for (const pid of participants) {
      if ((feePaid[pid] ?? 0) > 0) continue;
      const res = await chargeToTreasury(pid, stake, `Малая игра · ставка`, link, { noDebt: true });
      if (res.ok) { feePaid[pid] = stake; added += stake; }
    }
  }

  // Для mini_joker дополнительно инициализируем колоду и порядок ходов
  const extraStateUpdate: any = {};
  if (data.type === 'mini_joker') {
    const order = [...participants];
    // Перемешиваем порядок
    for (let i = order.length - 1; i > 0; i--) {
      const k = Math.floor(Math.random() * (i + 1));
      [order[i], order[k]] = [order[k], order[i]];
    }
    extraStateUpdate.deck = freshJokerDeck();
    extraStateUpdate.turn_order = order;
    extraStateUpdate.current_idx = 0;
  }

  await sb.from('super_games').update({
    state: { ...cur, ...extraStateUpdate, status: 'active', fee_paid: feePaid, bank: (cur.bank ?? 0) + added },
    status: 'live',
    bank: (data.bank ?? 0) + added,
  }).eq('id', game.id);
}

// ===========================================================================
// 1. Красное / Чёрное
// ===========================================================================

function RedBlackRoom({ game }: { game: SuperGame }) {
  const { state, currentUser, role } = useStore();
  const isAdmin = role === 'gm' || role === 'queen';
  const st = (game.state || {}) as MiniGameRedBlackState;
  const stake = st.stake ?? game.entry_fee ?? 0;

  const players = (game.participant_ids || [])
    .map(pid => state.participants.find(p => p.id === pid))
    .filter(Boolean) as Participant[];

  const allPaid = players.length > 0 && players.every(p => (st.fee_paid ?? {})[p.id] > 0);
  const allChose = players.length > 0 && players.every(p => !!(st.choices ?? {})[p.id]);
  const myChoice = currentUser ? (st.choices ?? {})[currentUser.id] : undefined;
  const result = st.result ?? null;
  const finished = st.status === 'finished';

  return (
    <div className="space-y-3">
      <MiniHeader game={game} title="🎴 Красное / Чёрное" stake={stake} />

      {/* Выбор */}
      {allPaid && !finished && st.status !== 'cancelled' && (
        <div className="glass p-3 space-y-3">
          <div className="text-[10px] uppercase tracking-widest text-gold/70">Тайный выбор</div>
          <div className="grid grid-cols-2 gap-2">
            {players.map(p => {
              const placed = !!(st.choices ?? {})[p.id];
              return (
                <div key={p.id} className={cn('flex items-center gap-2 p-2 rounded-xl',
                  placed ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-card/40')}>
                  <CharacterIcon participant={p} size="xs" ringless />
                  <span className="text-xs flex-1 truncate">{p.display_name}</span>
                  <span className="text-xs">{placed ? '✓' : '…'}</span>
                </div>
              );
            })}
          </div>

          {currentUser && players.some(p => p.id === currentUser.id) && !myChoice && !result && (
            <div className="grid grid-cols-2 gap-2">
              <button
                className="px-3 py-3 rounded-xl bg-red-500/15 border border-red-500/40 text-red-300 font-bold"
                onClick={() => placeRBChoice(game, currentUser.id, 'red')}
              >🔴 Красное</button>
              <button
                className="px-3 py-3 rounded-xl bg-gray-800/40 border border-gray-500/40 text-gray-200 font-bold"
                onClick={() => placeRBChoice(game, currentUser.id, 'black')}
              >⚫ Чёрное</button>
            </div>
          )}
          {myChoice && !result && (
            <div className="text-[11px] text-emerald-300 text-center">✓ Ваш выбор записан</div>
          )}

          {allChose && !result && (
            <button
              className="btn-success w-full"
              onClick={() => revealRedBlack(game, players, stake)}
            >🎬 Раскрыть результат</button>
          )}
        </div>
      )}

      {/* Финал */}
      {finished && (
        <div className="glass-strong gold-border p-4 text-center">
          <div className="text-[10px] uppercase tracking-widest text-gold/70">Раскрыто</div>
          <div className={cn('font-heading text-xl font-bold mt-1',
            result === 'red' ? 'text-red-300' : 'text-gray-200')}>
            {result === 'red' ? '🔴 Красное' : '⚫ Чёрное'}
          </div>
          <div className="mt-2 space-y-1">
            {players.map(p => {
              const ch = (st.choices ?? {})[p.id];
              const won = ch === result;
              const isWinner = (st.winner_ids ?? []).includes(p.id);
              return (
                <div key={p.id} className="flex items-center gap-2 p-1.5 rounded-xl bg-card/40 text-xs">
                  <CharacterIcon participant={p} size="xs" ringless />
                  <span className="flex-1 truncate">{p.display_name}</span>
                  <span className="text-[10px] uppercase">{ch === 'red' ? '🔴' : '⚫'}</span>
                  <span className={cn('text-[10px]',
                    isWinner ? 'text-emerald-300' : won ? 'text-amber-300' : 'text-red-300')}>
                    {isWinner ? 'забрал банк' : won ? 'угадал' : 'мимо'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

async function placeRBChoice(game: SuperGame, playerId: string, choice: 'red' | 'black') {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState<MiniGameRedBlackState>(game.id);
  if (!cur) return;
  if ((cur.choices ?? {})[playerId]) return;
  await writeState(game.id, {
    ...cur,
    choices: { ...(cur.choices ?? {}), [playerId]: choice },
  });
}

async function revealRedBlack(game: SuperGame, players: Participant[], stake: number) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState<MiniGameRedBlackState>(game.id);
  if (!cur) return;
  const result = spinRedBlack();
  const link = `/super-games/${game.id}`;

  const winners = players.filter(p => (cur.choices ?? {})[p.id] === result);
  const losers = players.filter(p => (cur.choices ?? {})[p.id] !== result);
  let winnerIds: string[] = [];

  if (winners.length === 1 && losers.length === 1) {
    const winner = winners[0];
    const bank = stake * 2;
    const { fee, payout } = applyTreasuryFee(bank);
    // Списали все ставки в Казну → выплачиваем победителю payout
    await payoutFromTreasury(winner.id, payout, 'Малая игра · Красное/Чёрное · банк', link);
    // комиссия остаётся в Казне (мы её не выводим)
    winnerIds = [winner.id];
    await pushEvent(`Красное/Чёрное · ${winner.display_name} забрал банк`, `Банк ${bank}, Казна ${fee}.`, link);
  } else {
    // Оба угадали или оба ошиблись → возврат ставок
    for (const p of players) {
      if ((cur.fee_paid ?? {})[p.id] > 0) {
        await payoutFromTreasury(p.id, stake, 'Малая игра · Красное/Чёрное · возврат', link);
      }
    }
    await pushEvent('Красное/Чёрное · ставки возвращены', undefined, link);
  }

  await writeState(game.id, {
    ...cur,
    result,
    winner_ids: winnerIds,
    status: 'finished',
  }, { status: 'finished', bank: 0 });
}

// ===========================================================================
// 2. Слепая ставка
// ===========================================================================

function BlindBidRoom({ game }: { game: SuperGame }) {
  const { state, currentUser, role } = useStore();
  const isAdmin = role === 'gm' || role === 'queen';
  const st = (game.state || {}) as MiniGameBlindBidState;
  const players = (game.participant_ids || [])
    .map(pid => state.participants.find(p => p.id === pid))
    .filter(Boolean) as Participant[];

  const myBid = currentUser ? (st.bids ?? {})[currentUser.id] : undefined;
  const placedCount = Object.keys(st.bids ?? {}).length;
  const finished = st.status === 'finished';
  const winnerId = st.winner_id ?? null;
  const totalBank = Object.values(st.bids ?? {}).reduce((a, b) => a + (b ?? 0), 0);

  return (
    <div className="space-y-3">
      <MiniHeader game={game} title="🎯 Слепая ставка" />

      <div className="glass p-3">
        <div className="text-[11px] text-muted-foreground mb-2">
          Каждый тайно ставит 10–100k. Самая большая <b>уникальная</b> ставка забирает банк.
          Ставки идут в Казну сразу при подтверждении.
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {players.map(p => {
            const placed = !!(st.bids ?? {})[p.id];
            return (
              <div key={p.id} className={cn('flex items-center gap-2 p-1.5 rounded-xl',
                placed ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-card/40')}>
                <CharacterIcon participant={p} size="xs" ringless />
                <span className="text-[11px] flex-1 truncate">{p.display_name}</span>
                <span className="text-[10px]">{placed ? '✓' : '…'}</span>
              </div>
            );
          })}
        </div>
        <div className="text-[10px] text-center text-muted-foreground mt-1">
          Готово: {placedCount}/{players.length}
        </div>
      </div>

      {currentUser && players.some(p => p.id === currentUser.id) && !myBid && !finished && (
        <BidInput game={game} currentUserId={currentUser.id} />
      )}
      {myBid && !finished && <div className="text-[11px] text-emerald-300 text-center">✓ Ваша тайная ставка принята</div>}

      {placedCount === players.length && players.length >= 2 && !finished && (
        <button
          className="btn-success w-full"
          onClick={() => revealBlindBid(game, players)}
        >🎬 Раскрыть и определить победителя</button>
      )}

      {finished && (
        <div className="glass-strong gold-border p-4">
          <div className="text-[10px] uppercase tracking-widest text-gold/70 mb-2">Раскрытие</div>
          <div className="space-y-1">
            {players.map(p => {
              const v = (st.bids ?? {})[p.id] ?? 0;
              const isWinner = winnerId === p.id;
              return (
                <div key={p.id} className="flex items-center gap-2 p-1.5 rounded-xl bg-card/40 text-xs">
                  <CharacterIcon participant={p} size="xs" ringless />
                  <span className="flex-1 truncate">{p.display_name}</span>
                  <Yen amount={v} className="text-xs" iconClass="w-3 h-3" />
                  {isWinner && <span className="text-emerald-300 text-[10px]">забрал банк</span>}
                </div>
              );
            })}
          </div>
          {!winnerId && (
            <div className="mt-2 text-center text-[11px] text-amber-300/80 italic">
              Уникальной ставки не было — ставки возвращены участникам.
            </div>
          )}
          <div className="mt-2 text-[10px] text-center text-muted-foreground">
            Общий банк: <Yen amount={totalBank} className="inline" iconClass="w-3 h-3" />
          </div>
        </div>
      )}
    </div>
  );
}

function BidInput({ game, currentUserId }: { game: SuperGame; currentUserId: string }) {
  const [val, setVal] = useState<number>(50_000);
  return (
    <div className="glass p-3 space-y-2">
      <div className="text-[10px] uppercase tracking-widest text-gold/70">Ваша тайная ставка</div>
      <input
        type="range" min={10_000} max={100_000} step={10_000}
        value={val}
        onChange={e => setVal(Number(e.target.value))}
        className="w-full accent-gold"
      />
      <div className="grid grid-cols-5 gap-1 text-[10px]">
        {[10_000, 30_000, 50_000, 70_000, 100_000].map(v => (
          <button key={v}
            className={cn('px-1 py-1.5 rounded-lg font-mono border',
              val === v ? 'bg-gold/15 border-gold/50 text-gold' : 'bg-card/60 border-white/8')}
            onClick={() => setVal(v)}
          >{v / 1000}K</button>
        ))}
      </div>
      <div className="text-center font-mono text-base text-gold">
        <Yen amount={val} full className="text-base" iconClass="w-4 h-4" />
      </div>
      <button
        className="btn-primary w-full text-xs"
        onClick={() => placeBlindBid(game, currentUserId, val)}
      >Подтвердить ставку</button>
    </div>
  );
}

async function placeBlindBid(game: SuperGame, playerId: string, amount: number) {
  const sb = getSupabase();
  if (!sb) return;
  // Списываем сумму в Казну (без долга — малые игры в минус не уходят)
  const res = await chargeToTreasury(playerId, amount, 'Малая игра · Слепая ставка', `/super-games/${game.id}`, { noDebt: true });
  if (!res.ok) return;
  const cur = await readState<MiniGameBlindBidState>(game.id);
  if (!cur) return;
  if ((cur.bids ?? {})[playerId]) return;
  await writeState(game.id, {
    ...cur,
    bids: { ...(cur.bids ?? {}), [playerId]: amount },
    fee_paid: { ...(cur.fee_paid ?? {}), [playerId]: amount },
  });
}

async function revealBlindBid(game: SuperGame, players: Participant[]) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState<MiniGameBlindBidState>(game.id);
  if (!cur) return;
  const link = `/super-games/${game.id}`;

  const { winnerId, uniqueMax } = findUniqueMax(cur.bids ?? {});
  const totalBank = Object.values(cur.bids ?? {}).reduce((a, b) => a + (b ?? 0), 0);

  if (winnerId) {
    const { fee, payout } = applyTreasuryFee(totalBank);
    await payoutFromTreasury(winnerId, payout, 'Малая игра · Слепая ставка · банк', link);
    await pushEvent(`Слепая ставка · банк забрал ${players.find(p => p.id === winnerId)?.display_name}`,
      `Уникальный максимум ${uniqueMax}, банк ${totalBank}, Казна ${fee}.`, link);
  } else {
    // Возврат ставок
    for (const [pid, amount] of Object.entries(cur.bids ?? {})) {
      if (amount > 0) await payoutFromTreasury(pid, amount, 'Слепая ставка · возврат', link);
    }
    await pushEvent('Слепая ставка · нет уникального максимума, ставки возвращены', undefined, link);
  }

  await writeState(game.id, {
    ...cur, winner_id: winnerId, status: 'finished',
  }, { status: 'finished', bank: 0 });
}

// ===========================================================================
// 3. Лжец на кубиках
// ===========================================================================

function LiarDiceRoom({ game }: { game: SuperGame }) {
  const { state, currentUser, role } = useStore();
  const isAdmin = role === 'gm' || role === 'queen';
  const st = (game.state || {}) as MiniGameLiarDiceState;
  const stake = st.stake ?? game.entry_fee ?? 0;
  const players = (game.participant_ids || [])
    .map(pid => state.participants.find(p => p.id === pid))
    .filter(Boolean) as Participant[];

  const allPaid = players.length > 0 && players.every(p => (st.fee_paid ?? {})[p.id] > 0);
  const myDice = currentUser ? (st.dice ?? {})[currentUser.id] : undefined;
  const finished = st.status === 'finished';
  const turnPlayer = st.turn_order && st.turn_order[st.current_turn_idx];
  const isMyTurn = !!currentUser && currentUser.id === turnPlayer;
  const claim = st.claim ?? null;

  return (
    <div className="space-y-3">
      <MiniHeader game={game} title="🎲 Лжец на кубиках" stake={stake} />

      <details className="glass p-3 group">
        <summary className="cursor-pointer text-[11px] flex items-center justify-between">
          <span className="text-gold/80 font-bold">📖 Как играть · правила</span>
          <span className="text-gold/60 group-open:rotate-180 transition">▾</span>
        </summary>
        <div className="text-[11px] text-muted-foreground mt-2 space-y-2 leading-relaxed">
          <p><b className="text-gold">Суть.</b> У каждого игрока 5 скрытых кубиков. Вы видите только свои. Заявки идут на ВСЕ кубики на столе у всех игроков сразу.</p>
          <p><b className="text-gold">Ход.</b> Заявите «минимум N кубиков со значением X». Например: «минимум 3 шестёрки» — на столе как минимум 3 шестёрки.</p>
          <p><b className="text-gold">Следующий игрок:</b> либо <b className="text-emerald-300">повысить ставку</b> (увеличить количество, или то же количество с большим значением), либо <b className="text-red-300">обвинить во лжи</b>.</p>
          <p><b className="text-gold">Раскрытие.</b> Все кубики раскрываются и считаются. Если заявка правдива — наказание получает обвинитель. Если ложна — наказание получает заявивший.</p>
          <p><b className="text-gold">Наказание</b> — револьверная проверка. Осечка — игрок остаётся, выстрел — выбывает (теряет ставку, банк остаётся в игре). Последний за столом забирает банк.</p>
        </div>
      </details>

      {allPaid && !finished && st.status !== 'cancelled' && (
        <div className="glass p-3 space-y-2">
          <div className="text-[10px] uppercase tracking-widest text-gold/70">Ваши кубики</div>
          {myDice ? (
            <div className="flex items-center gap-3 justify-center my-2">
              {myDice.map((v, i) => <DieView key={i} value={v} size="lg" />)}
            </div>
          ) : (
            <div className="text-[11px] text-muted-foreground italic">кубики розданы только участникам</div>
          )}

          {claim ? (
            <div className="p-2 rounded-xl bg-card/40 text-xs">
              Текущая заявка: <b>«минимум {claim.count} кубик(ов) со значением {claim.face}»</b>
              <span className="text-muted-foreground ml-1">
                ({players.find(p => p.id === claim.player_id)?.display_name})
              </span>
            </div>
          ) : (
            <div className="text-[11px] text-muted-foreground">Заявок ещё не было — ходит первый игрок.</div>
          )}

          {isMyTurn && (
            <ClaimForm game={game} prev={claim ?? null} />
          )}
          {!isMyTurn && !finished && allPaid && (
            <div className="text-[11px] text-muted-foreground italic">
              Сейчас ход: <b>{players.find(p => p.id === turnPlayer)?.display_name}</b>
            </div>
          )}
          {isMyTurn && claim && (
            <button
              className="btn-danger w-full text-xs"
              onClick={() => callLiar(game, currentUser!.id, players, stake)}
            >🤥 Сказать «Ложь!»</button>
          )}
        </div>
      )}

      {finished && (
        <div className="glass-strong gold-border p-4">
          <div className="text-[10px] uppercase tracking-widest text-gold/70 mb-1">Раскрыто</div>
          <div className="space-y-1">
            {players.map(p => {
              const dice = (st.dice ?? {})[p.id] ?? [];
              return (
                <div key={p.id} className="flex items-center gap-2 p-1.5 rounded-xl bg-card/40 text-xs">
                  <CharacterIcon participant={p} size="xs" ringless />
                  <span className="flex-1 truncate">{p.display_name}</span>
                  <span className="flex gap-1.5">
                    {dice.map((v, i) => <DieView key={i} value={v} size="sm" />)}
                  </span>
                  {st.winner_id === p.id && <span className="text-emerald-300 text-[10px]">забрал банк</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function DieIcon({ value, small }: { value: number; small?: boolean }) {
  // Устаревший компонент — оставлен для обратной совместимости. Используйте DieView.
  return <DieView value={value} size={small ? 'xs' : 'md'} />;
}

function ClaimForm({
  game, prev,
}: { game: SuperGame; prev: { count: number; face: number } | null }) {
  const initCount = prev ? prev.count : 1;
  const initFace = prev ? prev.face : 1;
  const [count, setCount] = useState(initCount);
  const [face, setFace] = useState(initFace);

  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="text-[10px] flex flex-col gap-1">
        Количество (≥{initCount})
        <input
          type="number" min={initCount} step={1}
          value={count} onChange={e => setCount(Number(e.target.value))}
          className="input-field text-sm"
        />
      </label>
      <label className="text-[10px] flex flex-col gap-1">
        Значение (1–6)
        <input
          type="number" min={1} max={6} step={1}
          value={face} onChange={e => setFace(Number(e.target.value))}
          className="input-field text-sm"
        />
      </label>
      <button
        className="btn-primary col-span-2 text-xs"
        onClick={() => makeClaim(game, count, face)}
      >Заявить</button>
    </div>
  );
}

async function collectStakesAndDeal(game: SuperGame, players: Participant[], stake: number) {
  const link = `/super-games/${game.id}`;
  const cur = await readState<MiniGameLiarDiceState>(game.id);
  if (!cur) return;
  const feePaid: Record<string, number> = { ...cur.fee_paid };
  let bankAdded = 0;
  for (const p of players) {
    if ((feePaid[p.id] ?? 0) > 0) continue;
    const res = await chargeToTreasury(p.id, stake, 'Малая игра · Лжец на кубиках · ставка', link, { noDebt: true });
    if (res.ok) { feePaid[p.id] = stake; bankAdded += stake; }
  }
  // Раздаём кубики
  const dice: Record<string, number[]> = { ...cur.dice };
  for (const p of players) {
    if (!dice[p.id]) dice[p.id] = Array.from({ length: LIAR_DICE_PER_PLAYER }, () => rollDie());
  }
  // Очерёдность — порядок player_ids
  const turnOrder = players.map(p => p.id);
  const sb = getSupabase();
  if (!sb) return;
  await sb.from('super_games').update({
    state: { ...cur, fee_paid: feePaid, dice, turn_order: turnOrder, current_turn_idx: 0, status: 'active' },
    bank: (game.bank ?? 0) + bankAdded,
    status: 'live',
  }).eq('id', game.id);
}

async function makeClaim(game: SuperGame, count: number, face: number) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState<MiniGameLiarDiceState>(game.id);
  if (!cur) return;
  const turnPlayer = cur.turn_order[cur.current_turn_idx];
  if (cur.claim) {
    if (!isHigherClaim(cur.claim, { count, face })) {
      alert('Заявка должна быть выше текущей.');
      return;
    }
  }
  const next: MiniGameLiarDiceState = {
    ...cur,
    claim: { count, face, player_id: turnPlayer },
    current_turn_idx: (cur.current_turn_idx + 1) % cur.turn_order.length,
  };
  await writeState(game.id, next);
}

async function callLiar(game: SuperGame, callerId: string, players: Participant[], stake: number) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState<MiniGameLiarDiceState>(game.id);
  if (!cur || !cur.claim) return;
  const link = `/super-games/${game.id}`;
  const { count, face, player_id: claimerId } = cur.claim;
  const real = countFaces(cur.dice ?? {}, face);
  const claimWasTrue = real >= count;

  // Проигравший: если заявка ложная → claimer; иначе → caller
  const loserId = claimWasTrue ? callerId : claimerId;
  const winnerId = claimWasTrue ? claimerId : callerId;
  const bank = stake * players.length;
  const { fee, payout } = applyTreasuryFee(bank);
  await payoutFromTreasury(winnerId, payout, 'Малая игра · Лжец · банк', link);

  await writeState(game.id, {
    ...cur,
    liar_caller_id: callerId,
    winner_id: winnerId,
    status: 'finished',
  }, { status: 'finished', bank: 0 });

  await pushEvent('Лжец на кубиках · раскрытие',
    `${claimWasTrue ? 'Заявка была правдой' : 'Заявка была ложью'}. Выиграл ${players.find(p => p.id === winnerId)?.display_name}.`,
    link);
}

// ===========================================================================
// 4. 21 отчаяния
// ===========================================================================

function Despair21Room({ game }: { game: SuperGame }) {
  const { state, currentUser, role } = useStore();
  const isAdmin = role === 'gm' || role === 'queen';
  const st = (game.state || {}) as MiniGameDespair21State;
  const stake = st.stake ?? game.entry_fee ?? 0;
  const players = (game.participant_ids || [])
    .map(pid => state.participants.find(p => p.id === pid))
    .filter(Boolean) as Participant[];

  const allPaid = players.length > 0 && players.every(p => (st.fee_paid ?? {})[p.id] > 0);
  const myHand = currentUser ? (st.hands ?? {})[currentUser.id] ?? [] : [];
  const myStood = currentUser ? !!(st.stand ?? {})[currentUser.id] : false;
  const myTotal = myHand.reduce((a, b) => a + b, 0);
  const finished = st.status === 'finished';
  const allStood = players.every(p => (st.stand ?? {})[p.id] || ((st.hands ?? {})[p.id] ?? []).reduce((a, b) => a + b, 0) > 21);

  return (
    <div className="space-y-3">
      <MiniHeader game={game} title="🂡 21 отчаяния" stake={stake} />

      {allPaid && !finished && st.status !== 'cancelled' && (
        <div className="glass p-3 space-y-2">
          <div className="text-[11px] text-muted-foreground">Ваша рука и сумма</div>
          <div className="flex items-center gap-2 text-base">
            {myHand.map((c, i) => <span key={i} className="px-2 py-1 rounded bg-card/60 border border-white/10 font-mono">{c}</span>)}
            <span className="ml-2 font-mono text-gold">= {myTotal}</span>
          </div>
          {!myStood && myTotal <= 21 && (
            <div className="grid grid-cols-2 gap-2">
              <button
                className="btn-primary text-xs"
                onClick={() => bjHit(game, currentUser!.id)}
              >+ Взять карту</button>
              <button
                className="btn-secondary text-xs"
                onClick={() => bjStand(game, currentUser!.id)}
              >Остановиться</button>
            </div>
          )}
          {myTotal > 21 && <div className="text-[11px] text-red-300 text-center">Перебор!</div>}
          {myStood && myTotal <= 21 && <div className="text-[11px] text-emerald-300 text-center">✓ Вы остановились</div>}

          {/* Открытые суммы остальных */}
          <div className="mt-2 space-y-1">
            {players.filter(p => p.id !== currentUser?.id).map(p => {
              const total = ((st.hands ?? {})[p.id] ?? []).reduce((a, b) => a + b, 0);
              const stood = !!(st.stand ?? {})[p.id];
              return (
                <div key={p.id} className="flex items-center gap-2 p-1.5 rounded-xl bg-card/40 text-xs">
                  <CharacterIcon participant={p} size="xs" ringless />
                  <span className="flex-1 truncate">{p.display_name}</span>
                  <span className="font-mono text-xs">{total}</span>
                  <span className="text-[10px] text-muted-foreground">{stood ? 'стоп' : 'играет'}</span>
                </div>
              );
            })}
          </div>

          {isAdmin && allStood && (
            <button
              className="btn-success w-full text-xs"
              onClick={() => resolve21(game, players, stake)}
            >🎬 Ход дилера и расчёт</button>
          )}
        </div>
      )}

      {finished && (
        <div className="glass-strong gold-border p-4">
          <div className="text-[10px] uppercase tracking-widest text-gold/70">Дилер: {st.dealer_hand.reduce((a, b) => a + b, 0)}</div>
          <div className="flex items-center gap-2 mt-1 text-base">
            {st.dealer_hand.map((c, i) => <span key={i} className="px-2 py-1 rounded bg-card/60 border border-white/10 font-mono">{c}</span>)}
          </div>
          <div className="mt-3 space-y-1">
            {players.map(p => {
              const total = ((st.hands ?? {})[p.id] ?? []).reduce((a, b) => a + b, 0);
              const result = (st.results ?? {})[p.id];
              return (
                <div key={p.id} className="flex items-center gap-2 p-1.5 rounded-xl bg-card/40 text-xs">
                  <CharacterIcon participant={p} size="xs" ringless />
                  <span className="flex-1 truncate">{p.display_name}</span>
                  <span className="font-mono text-xs">{total}</span>
                  <span className={cn('text-[10px]',
                    result === 'win' ? 'text-emerald-300' : result === 'push' ? 'text-amber-300' : 'text-red-300')}>
                    {result === 'win' ? `+${stake * 2}` : result === 'push' ? 'возврат' : `-${stake}`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

async function collectStakesAndDeal21(game: SuperGame, players: Participant[], stake: number) {
  const link = `/super-games/${game.id}`;
  const cur = await readState<MiniGameDespair21State>(game.id);
  if (!cur) return;
  const feePaid: Record<string, number> = { ...cur.fee_paid };
  let added = 0;
  for (const p of players) {
    if ((feePaid[p.id] ?? 0) > 0) continue;
    const res = await chargeToTreasury(p.id, stake, '21 отчаяния · ставка', link, { noDebt: true });
    if (res.ok) { feePaid[p.id] = stake; added += stake; }
  }
  const hands: Record<string, number[]> = { ...cur.hands };
  for (const p of players) {
    if (!hands[p.id]) hands[p.id] = [drawBjCard(), drawBjCard()];
  }
  const dealer = cur.dealer_hand && cur.dealer_hand.length > 0 ? cur.dealer_hand : [drawBjCard()];
  const sb = getSupabase();
  if (!sb) return;
  await sb.from('super_games').update({
    state: { ...cur, fee_paid: feePaid, hands, dealer_hand: dealer, status: 'active' },
    bank: (game.bank ?? 0) + added,
    status: 'live',
  }).eq('id', game.id);
}

async function bjHit(game: SuperGame, playerId: string) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState<MiniGameDespair21State>(game.id);
  if (!cur) return;
  const hands = { ...cur.hands };
  const my = [...(hands[playerId] ?? [])];
  my.push(drawBjCard());
  hands[playerId] = my;
  const total = my.reduce((a, b) => a + b, 0);
  const stand = { ...cur.stand };
  if (total > 21) stand[playerId] = true; // авто-стоп при переборе
  await writeState(game.id, { ...cur, hands, stand });
}

async function bjStand(game: SuperGame, playerId: string) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState<MiniGameDespair21State>(game.id);
  if (!cur) return;
  await writeState(game.id, { ...cur, stand: { ...cur.stand, [playerId]: true } });
}

async function resolve21(game: SuperGame, players: Participant[], stake: number) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState<MiniGameDespair21State>(game.id);
  if (!cur) return;
  const link = `/super-games/${game.id}`;

  const dealerFinal = dealerPlay(cur.dealer_hand);
  const dealerTotal = dealerFinal.reduce((a, b) => a + b, 0);
  const results: Record<string, 'win' | 'lose' | 'push'> = {};

  for (const p of players) {
    const total = ((cur.hands ?? {})[p.id] ?? []).reduce((a, b) => a + b, 0);
    const r = bjCompare(total, dealerTotal);
    results[p.id] = r;
    if (r === 'win') {
      // Игрок получает ставка ×2 из Казны (списано stake уже)
      await payoutFromTreasury(p.id, stake * 2, '21 отчаяния · выплата', link);
    } else if (r === 'push') {
      await payoutFromTreasury(p.id, stake, '21 отчаяния · возврат', link);
    }
    // lose: ничего не делаем, ставка осталась в Казне
  }

  await writeState(game.id, {
    ...cur, dealer_hand: dealerFinal, results, status: 'finished',
  }, { status: 'finished', bank: 0 });

  await pushEvent('21 отчаяния · раздача завершена', `Дилер ${dealerTotal}.`, link);
}

// ===========================================================================
// 5. Выкупной стол
// ===========================================================================

function RansomRoom({ game }: { game: SuperGame }) {
  const { state, currentUser, role } = useStore();
  const isAdmin = role === 'gm' || role === 'queen';
  const st = (game.state || {}) as MiniGameRansomState;
  const players = (game.participant_ids || [])
    .map(pid => state.participants.find(p => p.id === pid))
    .filter(Boolean) as Participant[];

  // Должник = первый участник
  const debtor = players[0] ?? null;
  const isDebtor = !!currentUser && currentUser.id === debtor?.id;
  const isRemover = !!currentUser && (isAdmin || currentUser.id === st.remover_id);

  const removedIdx = st.removed_card_index;

  return (
    <div className="space-y-3">
      <MiniHeader game={game} title="🃟 Выкупной стол" />

      <div className="glass p-3 text-xs space-y-1">
        <div>Должник: <b>{debtor?.display_name}</b></div>
        <div>Сумма долга: <Yen amount={st.debt_amount_initial} className="inline" iconClass="w-3 h-3" /></div>
        {st.new_debt_amount != null && st.new_debt_amount !== st.debt_amount_initial && (
          <div className="text-amber-300">Новая сумма: <Yen amount={st.new_debt_amount} className="inline" iconClass="w-3 h-3" /></div>
        )}
        {st.postponed && <div className="text-emerald-300">Срок отложен до следующей Большой игры</div>}
      </div>

      {/* 3 карты, перевёрнутые */}
      {st.status === 'waiting_remove' || st.status === 'waiting_pick' ? (
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map(i => {
            const removed = removedIdx === i;
            const picked = st.picked_card_index === i;
            return (
              <button
                key={i}
                disabled={removed || st.status === 'waiting_remove' || picked}
                onClick={() => pickRansomCard(game, i)}
                className={cn(
                  'h-32 rounded-xl border flex items-center justify-center text-3xl',
                  removed ? 'bg-card/20 border-red-500/40 text-red-400 line-through' :
                  picked ? 'bg-gold/15 border-gold/60' :
                  'bg-card/60 border-white/10 active:scale-95',
                )}
              >
                {removed ? '✕' : picked ? '🎴' : '🂠'}
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Действия удаляющего */}
      {st.status === 'waiting_remove' && isRemover && (
        <div className="glass p-3 space-y-2">
          <div className="text-[11px] text-muted-foreground">
            Хозяин/Мондо/Казна может убрать одну карту за <Yen amount={100_000} className="inline" iconClass="w-3 h-3" />.
            Должник видит, что одна карта убрана, но не знает какая.
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map(i => (
              <button key={i} className="btn-secondary text-[10px]"
                onClick={() => removeRansomCard(game, i)}
              >Убрать №{i + 1}</button>
            ))}
          </div>
          <button className="btn-primary w-full text-xs" onClick={() => skipRemoveRansom(game)}>
            Не убирать карту — пусть выбирает
          </button>
        </div>
      )}

      {/* Финал */}
      {st.status === 'finished' && (
        <div className="glass-strong gold-border p-4 text-center">
          <div className="text-[10px] uppercase tracking-widest text-gold/70">Раскрыто</div>
          <div className="font-heading text-lg font-bold mt-1">
            {st.picked_card === 'cancel_half' && '✓ Долг уменьшен на 50%'}
            {st.picked_card === 'double' && '✕ Долг увеличен на 50%'}
            {st.picked_card === 'postpone' && '⏳ Срок долга отложен'}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Было: <Yen amount={st.debt_amount_initial} className="inline" iconClass="w-3 h-3" /> →
            Стало: <Yen amount={st.new_debt_amount ?? st.debt_amount_initial} className="inline" iconClass="w-3 h-3" />
          </div>
        </div>
      )}
    </div>
  );
}

async function removeRansomCard(game: SuperGame, idx: number) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState<MiniGameRansomState>(game.id);
  if (!cur || cur.status !== 'waiting_remove') return;
  // Списываем 100k с Казны (или с remover_id)
  const link = `/super-games/${game.id}`;
  if (cur.remover_id) {
    const res = await applyTransfer(cur.remover_id, 'p-treasury', 100_000, 'Выкупной стол · удаление карты', link);
    if (!res.ok) return;
  }
  await writeState(game.id, { ...cur, removed_card_index: idx, status: 'waiting_pick' });
  await pushEvent('Выкупной стол · одна карта убрана', undefined, link);
}

async function skipRemoveRansom(game: SuperGame) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState<MiniGameRansomState>(game.id);
  if (!cur || cur.status !== 'waiting_remove') return;
  await writeState(game.id, { ...cur, status: 'waiting_pick' });
}

async function pickRansomCard(game: SuperGame, idx: number) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState<MiniGameRansomState>(game.id);
  if (!cur || cur.status !== 'waiting_pick') return;
  if (cur.removed_card_index === idx) return;

  const card = cur.cards_order[idx];
  const link = `/super-games/${game.id}`;
  const { newAmount, postpone } = applyRansom(cur.debt_amount_initial, card);

  // Применить изменение к долгу в БД
  if (postpone) {
    // Только продлеваем due_day на 7 (прокси к Большой игре)
    const { data } = await sb.from('debts').select('due_day').eq('id', cur.debt_id).single();
    const day = (data?.due_day ?? 1) + 7;
    await sb.from('debts').update({ due_day: day }).eq('id', cur.debt_id);
  } else {
    await sb.from('debts').update({ amount: newAmount }).eq('id', cur.debt_id);
  }

  await writeState(game.id, {
    ...cur,
    picked_card_index: idx,
    picked_card: card,
    new_debt_amount: postpone ? cur.debt_amount_initial : newAmount,
    postponed: postpone,
    status: 'finished',
  }, { status: 'finished' });

  await pushEvent(
    'Выкупной стол · карта раскрыта',
    card === 'cancel_half' ? 'Долг уменьшен на 50%.'
      : card === 'double' ? 'Долг увеличен на 50%.'
      : 'Срок долга отложен.',
    link,
  );
}

// ===========================================================================
// Общие компоненты
// ===========================================================================

function MiniHeader({ game, title, stake }: { game: SuperGame; title: string; stake?: number }) {
  return (
    <div className="glass-strong gold-border p-4">
      <div className="font-heading text-lg font-bold text-gradient-gold">{title}</div>
      <div className="text-[11px] text-muted-foreground mt-1">
        {stake != null && <>Ставка: <Yen amount={stake} className="inline" iconClass="w-3 h-3" /> · </>}
        Комиссия Казны: 5%
      </div>
    </div>
  );
}

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

async function collectStakes(game: SuperGame, players: Participant[], stake: number, kind: MiniGameKind) {
  const sb = getSupabase();
  if (!sb) return;
  const link = `/super-games/${game.id}`;
  const cur = await readState<any>(game.id);
  if (!cur) return;
  const feePaid: Record<string, number> = { ...(cur.fee_paid ?? {}) };
  let added = 0;
  for (const p of players) {
    if ((feePaid[p.id] ?? 0) > 0) continue;
    const res = await chargeToTreasury(p.id, stake, `Малая игра · ставка`, link, { noDebt: true });
    if (res.ok) { feePaid[p.id] = stake; added += stake; }
  }
  await sb.from('super_games').update({
    state: { ...cur, fee_paid: feePaid, status: 'active' },
    bank: (game.bank ?? 0) + added,
    status: 'live',
  }).eq('id', game.id);
}

async function cancelMiniRefund(game: SuperGame, players: Participant[], feePaid: Record<string, number>) {
  const sb = getSupabase();
  if (!sb) return;
  const link = `/super-games/${game.id}`;
  for (const p of players) {
    const paid = feePaid[p.id] ?? 0;
    if (paid > 0) await payoutFromTreasury(p.id, paid, 'Возврат · малая игра отменена', link);
  }
  const cur = await readState<any>(game.id);
  if (!cur) return;
  await sb.from('super_games').update({
    state: { ...cur, status: 'cancelled' },
    status: 'cancelled',
    bank: 0,
  }).eq('id', game.id);
  await pushEvent('Малая игра отменена', undefined, link);
}
