'use client';

// «Бар лжецов» (Liar's Bar)
// 2–6 игроков, входная ставка → банк. Каждый получает 5 карт из колоды
// (6A + 6K + 6Q + 2J = 20). Карта стола — Туз/Король/Дама.
// В свой ход: положить 1–3 закрытые карты и заявить «N карт стола».
// Любой из остальных может обвинить во лжи. Раскрытие → проверка:
//   правда → проверку проходит обвинитель; ложь → проверку проходит автор.
// Револьверная проверка (personal_chambers): шанс выбыть растёт после каждого
// прохождения (1/6, 1/5, 1/4, 1/3, 1/2, 1/1).
// Последний оставшийся забирает банк. Долги не создаются.

import { useState, useMemo } from 'react';
import { useStore, uid } from '@/lib/store/StoreProvider';
import { CharacterIcon } from '@/components/ui/CharacterIcon';
import { Yen } from '@/components/ui/Yen';
import { cn, isPlayer } from '@/lib/utils';
import { getSupabase } from '@/lib/supabase/client';
import { transferBetweenPlayers, payoutFromTreasury, chargeToTreasury } from '@/lib/store/tx';
import {
  type LiarsBarState, type LiarsCardKind, type LiarsTableCard, type LiarsPlayer,
  ROULETTE_MODE, eliminationChance, rouletteShot, isStatementTrue,
  makeLiarsDeck, pickTableCard, tableCardLabel, cardKindLabel, dealHands, nextAliveId,
  ENTRY_FEE_MIN, ENTRY_FEE_DEFAULT, ENTRY_FEE_MAX, CARDS_PER_PLAYER, MIN_PLAYERS, MAX_PLAYERS,
} from '@/lib/liarsbar/logic';
import type { SuperGame } from '@/lib/store/types';

function getState(g: SuperGame): LiarsBarState {
  const s = (g.state || {}) as Partial<LiarsBarState>;
  return {
    status: s.status ?? 'waiting',
    players: s.players ?? [],
    table_card: s.table_card ?? 'A',
    deck: s.deck ?? [],
    discard: s.discard ?? [],
    turn_player_id: s.turn_player_id ?? null,
    pending_play: s.pending_play ?? null,
    pending_roulette: s.pending_roulette ?? null,
    turn_limit: s.turn_limit,
    turn_count: s.turn_count ?? 0,
    round_index: s.round_index ?? 1,
    bank: s.bank ?? 0,
    winner_id: s.winner_id ?? null,
    log: s.log ?? [],
  };
}

async function readState(gameId: string): Promise<LiarsBarState | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.from('super_games').select('state').eq('id', gameId).single();
  return (data?.state as LiarsBarState) ?? null;
}

async function writeState(gameId: string, state: LiarsBarState) {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from('super_games').update({ state }).eq('id', gameId);
}

function pushLog(state: LiarsBarState, text: string, pub = true): LiarsBarState {
  return { ...state, log: [...state.log, { ts: Date.now(), text, pub }] };
}

// ===========================================================================
// ROOT
// ===========================================================================

export function LiarsBarRoom({ game }: { game: SuperGame }) {
  const { state: app, currentUser, role } = useStore();
  const lb = getState(game);
  const isAdmin = role === 'gm' || role === 'queen';
  const me = currentUser ? lb.players.find(p => p.id === currentUser.id) ?? null : null;
  const isInGame = !!me;

  const aliveCount = lb.players.filter(p => p.alive).length;

  return (
    <div className="space-y-3">
      <Header lb={lb} bank={game.bank} entryFee={game.entry_fee ?? ENTRY_FEE_DEFAULT} />

      {lb.status === 'waiting' && (
        <WaitingRoom game={game} lb={lb} />
      )}

      {lb.status === 'playing' && (
        <PlayingArea game={game} lb={lb} me={me} isAdmin={isAdmin} />
      )}

      {lb.status === 'finished' && lb.winner_id && (
        <FinishedView lb={lb} />
      )}

      {/* Лог публичных событий */}
      <LogView log={lb.log} />
    </div>
  );
}

function Header({ lb, bank, entryFee }: { lb: LiarsBarState; bank: number; entryFee: number }) {
  return (
    <div className="glass-strong gold-border p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-gold/70">🍷 Бар лжецов</div>
          <div className="text-xs text-muted-foreground mt-1">
            Банк: <Yen amount={bank} className="inline text-gold" iconClass="w-3 h-3" /> · Вход: <Yen amount={entryFee} className="inline" iconClass="w-3 h-3" />
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-gold/70">Карта стола</div>
          <div className="text-2xl font-bold mt-1">
            {lb.status === 'playing' ? `${lb.table_card} (${tableCardLabel(lb.table_card)})` : '—'}
          </div>
        </div>
      </div>
    </div>
  );
}

function LogView({ log }: { log: LiarsBarState['log'] }) {
  const pubLog = log.filter(l => l.pub).slice(-15);
  if (pubLog.length === 0) return null;
  return (
    <div className="glass p-3">
      <div className="text-[10px] uppercase tracking-widest text-gold/70 mb-1">📜 Журнал</div>
      <div className="space-y-0.5 max-h-48 overflow-y-auto">
        {pubLog.map((l, i) => (
          <div key={i} className="text-[11px] text-muted-foreground">
            <span className="text-gold/60">{new Date(l.ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span> {l.text}
          </div>
        ))}
      </div>
    </div>
  );
}

// ===========================================================================
// WAITING ROOM — присоединение, оплата ставки, старт
// ===========================================================================

function WaitingRoom({ game, lb }: { game: SuperGame; lb: LiarsBarState }) {
  const { state: app, currentUser, role } = useStore();
  const sb = getSupabase();
  const isAdmin = role === 'gm' || role === 'queen';
  const isCreator = !!currentUser && (game.participant_ids ?? []).includes(currentUser.id);
  const entryFee = game.entry_fee ?? ENTRY_FEE_DEFAULT;
  const [busy, setBusy] = useState(false);

  const inGame = !!currentUser && lb.players.some(p => p.id === currentUser.id);
  const canJoin = !inGame && !!currentUser && isPlayer(currentUser)
    && currentUser.balance >= entryFee
    && lb.players.length < MAX_PLAYERS;

  const join = async () => {
    if (!sb || !currentUser || !canJoin || busy) return;
    setBusy(true);
    // Списываем входной взнос с игрока в банк игры (через Фонд Тогами как pool).
    const tx = await chargeToTreasury(currentUser.id, entryFee, `Бар лжецов · вход`, `/super-games/${game.id}`, { noDebt: true });
    if (!tx.ok) { alert(tx.error || 'Не удалось'); setBusy(false); return; }
    const cur = await readState(game.id);
    if (!cur) { setBusy(false); return; }
    const next: LiarsBarState = pushLog({
      ...cur,
      players: [
        ...cur.players,
        {
          id: currentUser.id,
          name: currentUser.display_name,
          hand: [],
          alive: true,
          stake_paid: entryFee,
          roulette_checks: 0,
        },
      ],
    }, `${currentUser.display_name} занял место за столом`);
    await writeState(game.id, next);
    await sb.from('super_games').update({ bank: (game.bank ?? 0) + entryFee }).eq('id', game.id);
    setBusy(false);
  };

  const leave = async () => {
    if (!sb || !currentUser || busy) return;
    setBusy(true);
    const cur = await readState(game.id);
    if (!cur) { setBusy(false); return; }
    const me = cur.players.find(p => p.id === currentUser.id);
    if (!me) { setBusy(false); return; }
    // Возвращаем взнос
    await payoutFromTreasury(currentUser.id, me.stake_paid, `Бар лжецов · возврат входа`, `/super-games/${game.id}`);
    const next: LiarsBarState = pushLog({
      ...cur,
      players: cur.players.filter(p => p.id !== currentUser.id),
    }, `${currentUser.display_name} покинул стол`);
    await writeState(game.id, next);
    await sb.from('super_games').update({ bank: Math.max(0, (game.bank ?? 0) - me.stake_paid) }).eq('id', game.id);
    setBusy(false);
  };

  const start = async () => {
    if (!sb || busy) return;
    if (lb.players.length < MIN_PLAYERS) { alert(`Нужно минимум ${MIN_PLAYERS} игрока`); return; }
    setBusy(true);
    const cur = await readState(game.id);
    if (!cur) { setBusy(false); return; }
    const cardsPerPlayer = lb.players.length >= 5 ? 4 : CARDS_PER_PLAYER;
    let deck = makeLiarsDeck();
    const dealt = dealHands(deck, cur.players, cardsPerPlayer);
    deck = dealt.deck;
    const tableCard = pickTableCard();
    const firstPlayerId = dealt.players[Math.floor(Math.random() * dealt.players.length)].id;
    const next: LiarsBarState = pushLog({
      ...cur,
      status: 'playing',
      players: dealt.players,
      deck,
      discard: [],
      table_card: tableCard,
      turn_player_id: firstPlayerId,
      turn_count: 0,
      round_index: 1,
    }, `Старт. Карта стола — ${tableCardLabel(tableCard)}. Первый ход: ${dealt.players.find(p => p.id === firstPlayerId)?.name}`);
    await writeState(game.id, next);
    await sb.from('super_games').update({ status: 'live' }).eq('id', game.id);
    setBusy(false);
  };

  const cancelGame = async () => {
    if (!sb || busy) return;
    if (!confirm('Отменить игру и вернуть всем взнос?')) return;
    setBusy(true);
    const cur = await readState(game.id);
    if (!cur) { setBusy(false); return; }
    for (const p of cur.players) {
      await payoutFromTreasury(p.id, p.stake_paid, `Бар лжецов · отмена`, `/super-games/${game.id}`);
    }
    const next: LiarsBarState = pushLog({
      ...cur,
      status: 'cancelled',
      players: [],
    }, 'Игра отменена. Ставки возвращены.');
    await writeState(game.id, next);
    await sb.from('super_games').update({ bank: 0, status: 'cancelled' }).eq('id', game.id);
    setBusy(false);
  };

  return (
    <div className="space-y-3">
      <div className="glass p-4">
        <div className="text-[10px] uppercase tracking-widest text-gold/70 mb-2">За столом ({lb.players.length}/{MAX_PLAYERS})</div>
        {lb.players.length === 0 ? (
          <div className="text-xs text-muted-foreground italic">Пока никого. Присоединяйтесь первым.</div>
        ) : (
          <div className="space-y-1.5">
            {lb.players.map(p => {
              const part = app.participants.find(x => x.id === p.id);
              return (
                <div key={p.id} className="flex items-center gap-2 p-2 rounded-xl bg-card/40 text-xs">
                  {part && <CharacterIcon participant={part} size="xs" ringless />}
                  <span className="flex-1 truncate font-bold">{p.name}</span>
                  <Yen amount={p.stake_paid} className="text-[10px]" iconClass="w-3 h-3" />
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="glass-strong p-3 space-y-2">
        {!inGame && (
          <button onClick={join} disabled={!canJoin || busy} className="btn-primary w-full">
            {!currentUser ? 'Войдите' :
             !isPlayer(currentUser) ? 'Только игрокам' :
             currentUser.balance < entryFee ? `Не хватает: нужно ${entryFee.toLocaleString('ru-RU')} ¥` :
             lb.players.length >= MAX_PLAYERS ? 'Стол полон' :
             `🍷 Сесть за стол · ${entryFee.toLocaleString('ru-RU')} ¥`}
          </button>
        )}
        {inGame && (
          <button onClick={leave} disabled={busy} className="btn-secondary w-full">
            ↩ Покинуть стол (возврат входа)
          </button>
        )}
        {isAdmin && (
          <>
            <button onClick={start} disabled={lb.players.length < MIN_PLAYERS || busy} className="btn-success w-full">
              ▶ Начать игру
            </button>
            <button onClick={cancelGame} disabled={busy} className="btn-danger w-full text-xs">
              ✕ Отменить игру
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ===========================================================================
// PLAYING AREA
// ===========================================================================

function PlayingArea({ game, lb, me, isAdmin }: { game: SuperGame; lb: LiarsBarState; me: LiarsPlayer | null; isAdmin: boolean }) {
  const { state: app } = useStore();

  return (
    <div className="space-y-3">
      <PlayersList lb={lb} />

      {/* Текущая заявка */}
      {lb.pending_play && lb.status === 'playing' && !lb.pending_roulette && (
        <PendingPlayView lb={lb} me={me} game={game} isAdmin={isAdmin} />
      )}

      {/* Револьверная проверка */}
      {lb.pending_roulette && (
        <RouletteView lb={lb} game={game} isAdmin={isAdmin} />
      )}

      {/* Ход текущего игрока */}
      {!lb.pending_play && !lb.pending_roulette && lb.turn_player_id === me?.id && me?.alive && (
        <MoveForm lb={lb} game={game} me={me} />
      )}

      {/* Чужой ход */}
      {!lb.pending_play && !lb.pending_roulette && lb.turn_player_id && lb.turn_player_id !== me?.id && (
        <div className="glass p-3 text-center text-xs text-muted-foreground">
          Ход: <b>{lb.players.find(p => p.id === lb.turn_player_id)?.name ?? '—'}</b>
        </div>
      )}

      {/* Моя рука */}
      {me && me.alive && me.hand.length > 0 && (
        <MyHand hand={me.hand} />
      )}

      {/* Если выбыл */}
      {me && !me.alive && (
        <div className="glass p-3 text-center text-sm text-red-300">💀 Вы выбыли. Наблюдайте.</div>
      )}
    </div>
  );
}

function PlayersList({ lb }: { lb: LiarsBarState }) {
  const { state: app } = useStore();
  return (
    <div className="glass p-3">
      <div className="text-[10px] uppercase tracking-widest text-gold/70 mb-2">Игроки</div>
      <div className="grid grid-cols-2 gap-1.5">
        {lb.players.map(p => {
          const part = app.participants.find(x => x.id === p.id);
          const chance = ROULETTE_MODE === 'personal_chambers' ? eliminationChance(p.roulette_checks + 1) : 1/6;
          return (
            <div key={p.id} className={cn('p-2 rounded-xl text-[11px] flex items-center gap-2',
              !p.alive ? 'bg-red-500/10 border border-red-500/30 opacity-60' :
              lb.turn_player_id === p.id ? 'bg-gold/15 border border-gold/40 gold-border' :
              'bg-card/30',
            )}>
              {part && <CharacterIcon participant={part} size="xs" ringless />}
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate">{p.name}</div>
                <div className="text-[9px] text-muted-foreground">
                  {!p.alive ? 'выбыл' :
                   `🃏${p.hand.length} · 🎯 ${(chance * 100).toFixed(0)}%`}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MyHand({ hand }: { hand: LiarsCardKind[] }) {
  return (
    <div className="glass-strong p-3">
      <div className="text-[10px] uppercase tracking-widest text-gold/70 mb-2">Ваши карты ({hand.length})</div>
      <div className="flex gap-1 flex-wrap">
        {hand.map((c, i) => (
          <div key={i} className="w-12 h-16 rounded-lg bg-white text-slate-900 font-bold border-2 border-white/30 flex items-center justify-center text-2xl">
            {cardKindLabel(c)}
          </div>
        ))}
      </div>
    </div>
  );
}

// ===========================================================================
// MOVE FORM — выбрать 1-3 карты + заявить
// ===========================================================================

function MoveForm({ lb, game, me }: { lb: LiarsBarState; game: SuperGame; me: LiarsPlayer }) {
  const sb = getSupabase();
  const [selected, setSelected] = useState<number[]>([]);
  const [declared, setDeclared] = useState(1);
  const [busy, setBusy] = useState(false);

  const toggle = (i: number) => {
    if (selected.includes(i)) {
      setSelected(s => s.filter(x => x !== i));
    } else if (selected.length < 3) {
      setSelected(s => [...s, i]);
    }
  };

  const submit = async () => {
    if (busy || selected.length === 0 || !sb) return;
    if (declared < 1 || declared > selected.length) {
      alert('Заявленное количество должно быть от 1 до ' + selected.length);
      return;
    }
    setBusy(true);
    const cur = await readState(game.id);
    if (!cur) { setBusy(false); return; }
    const playedCards = selected.map(i => me.hand[i]);
    const newHand = me.hand.filter((_, i) => !selected.includes(i));
    const newPlayers = cur.players.map(p => p.id === me.id ? { ...p, hand: newHand } : p);
    const next: LiarsBarState = pushLog({
      ...cur,
      players: newPlayers,
      pending_play: {
        player_id: me.id,
        cards: playedCards,
        declared_count: declared,
      },
      turn_count: cur.turn_count + 1,
    }, `${me.name} сыграл ${selected.length} карт закрыто и заявил «${declared} ${tableCardLabel(cur.table_card)}»`);
    await writeState(game.id, next);
    setSelected([]); setDeclared(1);
    setBusy(false);
  };

  return (
    <div className="glass-strong gold-border p-3 space-y-2">
      <div className="text-sm font-bold text-gold">Ваш ход</div>
      <div className="text-[11px] text-muted-foreground">
        Выберите 1–3 карты и заявите, сколько из них «{tableCardLabel(lb.table_card)}». Можно блефовать.
      </div>
      <div className="flex gap-1 flex-wrap">
        {me.hand.map((c, i) => (
          <button key={i} onClick={() => toggle(i)}
            className={cn('w-12 h-16 rounded-lg font-bold border-2 text-2xl flex items-center justify-center transition-all',
              selected.includes(i) ? 'bg-gold/30 border-gold scale-95' : 'bg-white text-slate-900 border-white/30',
            )}>
            {cardKindLabel(c)}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-2">
        <span className="text-xs">Заявить:</span>
        <input type="number" min={1} max={selected.length || 1} value={declared}
          onChange={e => setDeclared(Math.max(1, Math.min(selected.length || 1, Number(e.target.value))))}
          className="input-field w-16 font-mono text-center" />
        <span className="text-xs">{tableCardLabel(lb.table_card)}{declared > 1 ? '' : ''}</span>
      </div>
      <button onClick={submit} disabled={busy || selected.length === 0} className="btn-primary w-full">
        🍷 Сыграть ({selected.length}) и заявить «{declared}»
      </button>
    </div>
  );
}

// ===========================================================================
// PENDING PLAY — другие могут обвинить или пропустить
// ===========================================================================

function PendingPlayView({ lb, me, game, isAdmin }: { lb: LiarsBarState; me: LiarsPlayer | null; game: SuperGame; isAdmin: boolean }) {
  const sb = getSupabase();
  const play = lb.pending_play!;
  const author = lb.players.find(p => p.id === play.player_id);
  const [busy, setBusy] = useState(false);

  const canAccuse = me && me.alive && me.id !== play.player_id;

  const accuse = async () => {
    if (!sb || busy || !me) return;
    setBusy(true);
    const cur = await readState(game.id);
    if (!cur || !cur.pending_play) { setBusy(false); return; }
    const truth = isStatementTrue(cur.pending_play.cards, cur.table_card);
    // Если правда — обвинитель идёт в проверку, иначе — автор.
    const targetId = truth ? me.id : cur.pending_play.player_id;
    const reason: 'caught_lying' | 'wrong_accusation' = truth ? 'wrong_accusation' : 'caught_lying';
    let next: LiarsBarState = {
      ...cur,
      discard: [...cur.discard, ...cur.pending_play.cards],
      pending_play: null,
      pending_roulette: { target_id: targetId, challenger_id: me.id, reason },
    };
    next = pushLog(next, truth
      ? `${me.name} обвинил ${author?.name} во лжи. Карты раскрыты — заявление было правдой. Проверку проходит ${me.name}.`
      : `${me.name} обвинил ${author?.name} во лжи. Карты раскрыты — там была ложь. Проверку проходит ${author?.name}.`);
    await writeState(game.id, next);
    setBusy(false);
  };

  const skip = async () => {
    if (!sb || busy) return;
    setBusy(true);
    const cur = await readState(game.id);
    if (!cur || !cur.pending_play) { setBusy(false); return; }
    // Передаём ход следующему живому игроку.
    const nextPlayerId = nextAliveId(cur.players, cur.pending_play.player_id);
    let next: LiarsBarState = {
      ...cur,
      pending_play: null,
      turn_player_id: nextPlayerId,
    };
    next = pushLog(next, `Никто не обвинил. Ход переходит к ${cur.players.find(p => p.id === nextPlayerId)?.name ?? '—'}`);
    // Если у текущего игрока кончились карты — перераздать
    next = maybeRedeal(next);
    await writeState(game.id, next);
    setBusy(false);
  };

  return (
    <div className="glass-strong gold-border p-3 space-y-2">
      <div className="text-[10px] uppercase tracking-widest text-gold/70">Заявка</div>
      <div className="text-sm">
        <b>{author?.name}</b> сыграл <b>{play.cards.length}</b> закрытых карт и сказал:
        «{play.declared_count} {tableCardLabel(lb.table_card)}»
      </div>
      <div className="flex justify-center gap-1 my-2">
        {play.cards.map((_, i) => (
          <div key={i} className="w-10 h-14 rounded-lg bg-gradient-to-br from-fuchsia-900 to-purple-950 border-2 border-gold/40 flex items-center justify-center text-gold text-xl">✦</div>
        ))}
      </div>
      {canAccuse ? (
        <div className="grid grid-cols-2 gap-2">
          <button onClick={accuse} disabled={busy} className="btn-danger">⚠️ Обвинить во лжи</button>
          <button onClick={skip} disabled={busy} className="btn-secondary">Пропустить</button>
        </div>
      ) : me && me.id === play.player_id ? (
        <div className="text-center text-xs text-muted-foreground">Ждём реакции остальных...</div>
      ) : isAdmin ? (
        <div className="grid grid-cols-2 gap-2">
          <button onClick={skip} disabled={busy} className="btn-secondary text-xs">→ Передать ход (никто не обвинил)</button>
        </div>
      ) : (
        <div className="text-center text-xs text-muted-foreground">Наблюдаем...</div>
      )}
    </div>
  );
}

function maybeRedeal(state: LiarsBarState): LiarsBarState {
  // Если у активного игрока кончились карты — перераздаём всем живым.
  const turnPlayer = state.players.find(p => p.id === state.turn_player_id);
  if (!turnPlayer || turnPlayer.hand.length > 0) return state;
  const cardsPerPlayer = state.players.filter(p => p.alive).length >= 5 ? 4 : CARDS_PER_PLAYER;
  let deck = makeLiarsDeck();
  const dealt = dealHands(deck, state.players, cardsPerPlayer);
  const tableCard = pickTableCard();
  return pushLog({
    ...state,
    players: dealt.players,
    deck: dealt.deck,
    discard: [],
    table_card: tableCard,
    round_index: state.round_index + 1,
  }, `Раздача #${state.round_index + 1}. Карта стола — ${tableCardLabel(tableCard)}.`);
}

// ===========================================================================
// ROULETTE — щёлк или выстрел
// ===========================================================================

function RouletteView({ lb, game, isAdmin }: { lb: LiarsBarState; game: SuperGame; isAdmin: boolean }) {
  const sb = getSupabase();
  const r = lb.pending_roulette!;
  const target = lb.players.find(p => p.id === r.target_id);
  const [shooting, setShooting] = useState(false);

  const myTurn = useStore().currentUser?.id === r.target_id;

  const pull = async () => {
    if (!sb || shooting) return;
    setShooting(true);
    setTimeout(async () => {
      const cur = await readState(game.id);
      if (!cur || !cur.pending_roulette) { setShooting(false); return; }
      const tgt = cur.players.find(p => p.id === cur.pending_roulette!.target_id);
      if (!tgt) { setShooting(false); return; }
      const checkIndex = tgt.roulette_checks + 1;
      const eliminated = rouletteShot(checkIndex);
      const newPlayers = cur.players.map(p =>
        p.id === tgt.id
          ? { ...p, roulette_checks: checkIndex, alive: !eliminated, hand: eliminated ? [] : p.hand }
          : p,
      );
      let next: LiarsBarState = {
        ...cur,
        players: newPlayers,
        pending_roulette: null,
      };
      next = pushLog(next, eliminated
        ? `💥 Выстрел! ${tgt.name} выбывает из игры.`
        : `🔇 Осечка. ${tgt.name} остаётся за столом (риск ${(eliminationChance(checkIndex + 1) * 100).toFixed(0)}%).`);

      // Проверка победы
      const alive = newPlayers.filter(p => p.alive);
      if (alive.length <= 1) {
        const winner = alive[0];
        next = pushLog({
          ...next,
          status: 'finished',
          winner_id: winner?.id ?? null,
          turn_player_id: null,
        }, winner ? `🏆 ${winner.name} забирает банк!` : 'Никто не остался за столом.');
        // Выплата
        if (winner) {
          await payoutFromTreasury(winner.id, game.bank, `Бар лжецов · банк`, `/super-games/${game.id}`);
          await sb.from('super_games').update({ status: 'finished', winner_id: winner.id, bank: 0 }).eq('id', game.id);
        }
      } else {
        // Если выбыл — ход переходит следующему живому от него
        const fromId = eliminated ? tgt.id : (next.turn_player_id ?? tgt.id);
        const nextId = nextAliveId(newPlayers, fromId);
        next.turn_player_id = nextId;
        next = pushLog(next, `Ход переходит к ${newPlayers.find(p => p.id === nextId)?.name ?? '—'}`);
        next = maybeRedeal(next);
      }
      await writeState(game.id, next);
      setShooting(false);
    }, 1800);
  };

  const chance = target ? eliminationChance(target.roulette_checks + 1) : 1/6;

  return (
    <div className="glass-strong p-4 text-center space-y-3" style={{ background: 'radial-gradient(circle, rgba(220,38,38,0.15) 0%, transparent 70%)' }}>
      <div className="text-[10px] uppercase tracking-widest text-red-300">🔫 Револьверная проверка</div>
      <div className="text-sm">
        {r.reason === 'caught_lying'
          ? <><b>{target?.name}</b> пойман на лжи. Сейчас говорит револьвер.</>
          : <><b>{target?.name}</b> ошибся с обвинением. Проверку проходит он.</>}
      </div>
      <div className="text-2xl font-bold text-amber-300">
        Шанс выстрела: {(chance * 100).toFixed(0)}%
      </div>
      <div className={cn('text-7xl py-4 transition-transform', shooting && 'animate-spin')} style={{ animationDuration: '0.5s' }}>🔫</div>
      {myTurn && !shooting && (
        <button onClick={pull} className="btn-danger w-full">🎯 Спустить курок</button>
      )}
      {!myTurn && !shooting && (
        <div className="text-xs text-muted-foreground">Ждём, когда {target?.name} спустит курок...</div>
      )}
      {!myTurn && isAdmin && !shooting && (
        <button onClick={pull} className="btn-secondary text-xs w-full">⚙️ За игрока (GM)</button>
      )}
      {shooting && <div className="text-sm text-amber-300 animate-pulse">Барабан крутится...</div>}
    </div>
  );
}

// ===========================================================================
// FINISHED
// ===========================================================================

function FinishedView({ lb }: { lb: LiarsBarState }) {
  const winner = lb.players.find(p => p.id === lb.winner_id);
  return (
    <div className="glass-strong gold-border p-5 text-center space-y-3">
      <div className="text-5xl">🏆</div>
      <h2 className="font-heading text-2xl font-bold text-gradient-gold">{winner?.name ?? '—'}</h2>
      <p className="text-sm text-muted-foreground">забрал(а) весь банк</p>
    </div>
  );
}
