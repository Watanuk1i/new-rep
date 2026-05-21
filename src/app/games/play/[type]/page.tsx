'use client';

// Пошаговая игра двух игроков. Все ходы летят через challenge.result_data
// (JSONB), Realtime разносит изменения соперникам автоматически.
//
// Фазы:
//   ready   — оба должны нажать «Я готов»
//   playing — игра идёт, каждый ходит по правилам конкретной игры
//   finished — результат, баланс уже посчитан (challenge.status = 'finished')

import { Suspense, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useStore } from '@/lib/store/StoreProvider';
import { Yen } from '@/components/ui/Yen';
import { cn } from '@/lib/utils';
import { getSupabase } from '@/lib/supabase/client';
import type { MiniGameType, GameChallenge, Participant } from '@/lib/store/types';

// ============================================================
// CONST
// ============================================================

const LABELS: Record<MiniGameType, { label: string; icon: string }> = {
  dice:        { label: 'Кости',           icon: '🎲' },
  high_card:   { label: 'Старшая карта',   icon: '🃏' },
  roulette:    { label: 'Рулетка',         icon: '🎰' },
  slots:       { label: 'Слоты',           icon: '🍒' },
  blackjack:   { label: '21 очко',         icon: '🂡' },
  bluff_duel:  { label: 'Блеф-дуэль',      icon: '🎭' },
  truth_or_bet:{ label: 'Правда/ставка',   icon: '❓' },
  find_pair:   { label: 'Найди пару',      icon: '🃟' },
  find_joker:  { label: 'Найди Джокера',   icon: '🎴' },
};

// Простые игры — у которых нет хода игрока, просто рандом после готовности
const SIMPLE_GAMES: MiniGameType[] = ['high_card', 'roulette', 'slots', 'bluff_duel', 'truth_or_bet'];

// ============================================================
// SHARED HELPERS
// ============================================================

interface ResultData {
  phase?: 'ready' | 'playing' | 'finished';
  creator_ready?: boolean;
  opponent_ready?: boolean;

  // dice
  creator_dice?: [number, number];
  opponent_dice?: [number, number];

  // blackjack
  bj_creator_cards?: number[];
  bj_opponent_cards?: number[];
  bj_creator_stand?: boolean;
  bj_opponent_stand?: boolean;
  bj_turn?: 'creator' | 'opponent';

  // find_pair
  pair_cards?: { id: number; value: number; collected_by: 'creator' | 'opponent' | null }[];
  pair_flipped?: number[];
  pair_turn?: 'creator' | 'opponent';
  pair_creator_score?: number;
  pair_opponent_score?: number;
  pair_locked_until?: number;

  // find_joker
  joker_deck?: ('regular' | 'joker')[];
  joker_drawn?: { idx: number; card: 'regular' | 'joker'; by: 'creator' | 'opponent' }[];
  joker_turn?: 'creator' | 'opponent';

  // simple games
  simple_result?: { winnerSide: 'creator' | 'opponent'; details: string };

  // финал
  details?: string;
}

// Прочитать актуальный result_data перед записью.
async function patchResult(
  sb: any,
  challengeId: string,
  patch: Partial<ResultData> | ((rd: ResultData) => Partial<ResultData>)
): Promise<ResultData> {
  const { data } = await sb.from('challenges').select('result_data').eq('id', challengeId).single();
  const current: ResultData = (data?.result_data as any) || {};
  const delta = typeof patch === 'function' ? patch(current) : patch;
  const next = { ...current, ...delta };
  await sb.from('challenges').update({ result_data: next }).eq('id', challengeId);
  return next;
}

// Финиш матча: считает балансы, обновляет wins/losses, history, нотификации.
async function finishMatch(opts: {
  sb: any;
  challenge: GameChallenge;
  creator: Participant;
  opponent: Participant;
  winnerSide: 'creator' | 'opponent';
  details: string;
  rdExtra?: Partial<ResultData>;
  notify: (id: string, n: any) => Promise<void>;
  addHistory: (pid: string, action: string, desc: string, amount: number, link?: string) => Promise<void>;
  gameLabel: string;
  gameType: MiniGameType;
}) {
  const { sb, challenge, creator, opponent, winnerSide, details, rdExtra, notify, addHistory, gameLabel, gameType } = opts;
  const stake = challenge.stake_amount;

  const winner = winnerSide === 'creator' ? creator : opponent;
  const loser  = winnerSide === 'creator' ? opponent : creator;

  await sb.from('participants').update({
    balance: winner.balance + stake,
    wins:    winner.wins + 1,
  }).eq('id', winner.id);

  await sb.from('participants').update({
    balance: Math.max(0, loser.balance - stake),
    losses:  loser.losses + 1,
  }).eq('id', loser.id);

  await addHistory(winner.id, 'game_win',
    `${gameLabel} vs ${loser.display_name}`, stake, `/games`);
  await addHistory(loser.id, 'game_loss',
    `${gameLabel} vs ${winner.display_name}`, -stake, `/games`);

  await sb.from('challenges').update({
    status: 'finished',
    winner_id: winner.id,
    result_data: {
      ...(rdExtra || {}),
      phase: 'finished',
      details,
    },
  }).eq('id', challenge.id);

  await notify(winner.id, {
    type: 'game_result',
    title: 'Вы выиграли игру!',
    body: `${gameLabel} vs ${loser.display_name}: +${stake.toLocaleString('ru-RU')} ейн`,
    link_url: `/games/play/${gameType}?challenge=${challenge.id}`,
  });
  await notify(loser.id, {
    type: 'game_result',
    title: 'Вы проиграли игру',
    body: `${gameLabel} vs ${winner.display_name}: -${stake.toLocaleString('ru-RU')} ейн`,
    link_url: `/games/play/${gameType}?challenge=${challenge.id}`,
  });
}

function drawCard(): number {
  return Math.floor(Math.random() * 10) + 1;
}
function bjScore(cards: number[]): number {
  return cards.reduce((s, c) => s + c, 0);
}

// ============================================================
// PAGE ROOT
// ============================================================

export default function PlayPage() {
  return (
    <Suspense fallback={<div className="px-4 py-12 text-center text-muted-foreground">Загрузка...</div>}>
      <PlayInner />
    </Suspense>
  );
}

function PlayInner() {
  const params = useParams();
  const sp = useSearchParams();
  const type = params.type as MiniGameType;
  const challengeId = sp.get('challenge');
  const { state, currentUser, notify, addHistory } = useStore();
  const sb = getSupabase();

  if (!LABELS[type]) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="text-red-400 font-bold">Игра не найдена</p>
        <Link href="/games" className="btn-secondary mt-4 inline-flex">← К играм</Link>
      </div>
    );
  }
  const info = LABELS[type];

  if (!currentUser) {
    return (
      <div className="px-3 sm:px-4 py-4 max-w-md mx-auto space-y-4">
        <Header info={info} />
        <div className="glass-strong p-6 text-center">
          <p className="text-sm text-muted-foreground mb-3">Войдите, чтобы играть.</p>
          <Link href="/login" className="btn-primary inline-flex">Войти</Link>
        </div>
      </div>
    );
  }

  const challenge = challengeId
    ? state.challenges.find(c => c.id === challengeId)
    : null;

  if (!challenge) return <DemoMode type={type} />;

  const creator = state.participants.find(p => p.id === challenge.creator_id) || null;
  const opponent = challenge.opponent_id
    ? state.participants.find(p => p.id === challenge.opponent_id) || null
    : null;

  const isCreator = currentUser.id === challenge.creator_id;
  const isOpponent = currentUser.id === challenge.opponent_id;

  const otherDisplayName = isCreator
    ? (opponent?.display_name || '—')
    : (creator?.display_name || '—');

  const head = (
    <Header info={info} stake={challenge.stake_amount} otherName={isCreator || isOpponent ? otherDisplayName : undefined} />
  );

  if (challenge.status === 'pending') {
    return (
      <div className="px-3 sm:px-4 py-4 max-w-md mx-auto space-y-4 animate-fade-in">
        {head}
        <div className="glass-strong p-6 text-center space-y-2">
          <div className="text-4xl animate-pulse">⏳</div>
          <p className="text-sm">
            {isCreator
              ? 'Вызов отправлен. Ждём, когда соперник примет.'
              : 'Этот вызов ещё в ожидании. Прими его на странице вызовов.'}
          </p>
          <Link href="/games" className="btn-secondary inline-flex mt-3">К списку вызовов</Link>
        </div>
      </div>
    );
  }

  if (challenge.status === 'cancelled') {
    return (
      <div className="px-3 sm:px-4 py-4 max-w-md mx-auto space-y-4 animate-fade-in">
        {head}
        <div className="glass-strong p-6 text-center crimson-border">
          <div className="text-4xl">✕</div>
          <p className="text-sm font-bold mt-2">Вызов отменён</p>
          <Link href="/games" className="btn-secondary inline-flex mt-3">К играм</Link>
        </div>
      </div>
    );
  }

  if (challenge.status === 'finished') {
    const won = challenge.winner_id === currentUser.id;
    const details = (challenge.result_data as any)?.details || '';
    return (
      <div className="px-3 sm:px-4 py-4 max-w-md mx-auto space-y-4 animate-fade-in">
        {head}
        <ResultCard won={won} details={details} stake={challenge.stake_amount} />
      </div>
    );
  }

  if (challenge.status !== 'accepted') {
    return (
      <div className="px-3 sm:px-4 py-4 max-w-md mx-auto space-y-4">
        {head}
        <div className="glass p-4 text-center text-xs text-muted-foreground">Неизвестное состояние: {challenge.status}</div>
      </div>
    );
  }

  if (!isCreator && !isOpponent) {
    return (
      <div className="px-3 sm:px-4 py-4 max-w-md mx-auto space-y-4 animate-fade-in">
        {head}
        <div className="glass-strong p-6 text-center">
          <p className="text-sm">Этот матч между другими игроками.</p>
          <Link href="/games" className="btn-secondary inline-flex mt-3">К играм</Link>
        </div>
      </div>
    );
  }

  if (!creator || !opponent) {
    return (
      <div className="px-3 sm:px-4 py-4 max-w-md mx-auto space-y-4">
        {head}
        <div className="glass p-4 text-center text-xs text-red-300">Не нашёл одного из участников.</div>
      </div>
    );
  }

  const rd: ResultData = (challenge.result_data as any) || {};
  const phase: ResultData['phase'] = rd.phase || 'ready';

  if (phase === 'ready') {
    return (
      <div className="px-3 sm:px-4 py-4 max-w-md mx-auto space-y-4 animate-fade-in">
        {head}
        <ReadyView
          challenge={challenge}
          isCreator={isCreator}
          rd={rd}
          gameType={type}
        />
      </div>
    );
  }

  if (phase === 'playing') {
    const common = { challenge, rd, isCreator, creator, opponent, currentUser, sb, notify, addHistory, gameLabel: info.label, gameType: type };
    return (
      <div className="px-3 sm:px-4 py-4 max-w-md mx-auto space-y-4 animate-fade-in">
        {head}
        {type === 'dice'        && <DiceGame {...common} />}
        {type === 'blackjack'   && <BlackjackGame {...common} />}
        {type === 'find_pair'   && <FindPairGame {...common} />}
        {type === 'find_joker'  && <FindJokerGame {...common} />}
        {SIMPLE_GAMES.includes(type) && <SimpleRollGame {...common} />}
      </div>
    );
  }

  return (
    <div className="px-3 sm:px-4 py-4 max-w-md mx-auto space-y-4 animate-fade-in">
      {head}
      <div className="glass p-4 text-center text-xs text-muted-foreground">Игра завершена, обновляю экран...</div>
    </div>
  );
}

// ============================================================
// HEADER
// ============================================================

function Header({ info, stake, otherName }: { info: { label: string; icon: string }; stake?: number; otherName?: string }) {
  return (
    <div className="text-center">
      <div className="text-5xl mb-2">{info.icon}</div>
      <h1 className="font-heading text-xl font-bold">{info.label}</h1>
      {otherName && <p className="text-xs text-muted-foreground mt-1">vs {otherName}</p>}
      {stake !== undefined && (
        <div className="mt-2"><Yen amount={stake} className="text-lg text-gold" iconClass="w-5 h-5" /></div>
      )}
    </div>
  );
}

// ============================================================
// READY VIEW
// ============================================================

function ReadyView({ challenge, isCreator, rd, gameType }: {
  challenge: GameChallenge;
  isCreator: boolean;
  rd: ResultData;
  gameType: MiniGameType;
}) {
  const sb = getSupabase();
  const myReady = isCreator ? !!rd.creator_ready : !!rd.opponent_ready;
  const otherReady = isCreator ? !!rd.opponent_ready : !!rd.creator_ready;
  const [busy, setBusy] = useState(false);

  const press = async () => {
    if (!sb || busy || myReady) return;
    setBusy(true);
    await patchResult(sb, challenge.id, (cur) => {
      const next: Partial<ResultData> = isCreator
        ? { creator_ready: true }
        : { opponent_ready: true };
      const both = isCreator
        ? (cur.opponent_ready === true)
        : (cur.creator_ready === true);
      if (both) {
        next.phase = 'playing';
        if (gameType === 'blackjack') {
          next.bj_creator_cards = [drawCard(), drawCard()];
          next.bj_opponent_cards = [drawCard(), drawCard()];
          next.bj_creator_stand = false;
          next.bj_opponent_stand = false;
          next.bj_turn = 'creator';
        } else if (gameType === 'find_pair') {
          const ids = [0,1,2,3,4,5,6,7];
          const values = [1,1,2,2,3,3,4,4];
          for (let i = values.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [values[i], values[j]] = [values[j], values[i]];
          }
          next.pair_cards = ids.map(id => ({ id, value: values[id], collected_by: null }));
          next.pair_flipped = [];
          next.pair_turn = 'creator';
          next.pair_creator_score = 0;
          next.pair_opponent_score = 0;
        } else if (gameType === 'find_joker') {
          const deck: ('regular' | 'joker')[] = ['regular', 'regular', 'regular', 'regular', 'joker'];
          for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
          }
          next.joker_deck = deck;
          next.joker_drawn = [];
          next.joker_turn = 'creator';
        }
      }
      return next;
    });
    setBusy(false);
  };

  return (
    <div className="glass-strong p-6 text-center space-y-3">
      <div className="text-4xl">{myReady ? '✅' : '⏳'}</div>
      <h2 className="font-heading text-lg font-bold">
        {isCreator ? 'Ваш вызов приняли. Готовы начать?' : 'Вы приняли вызов. Готовы начать?'}
      </h2>
      <div className="space-y-1 text-xs text-muted-foreground">
        <div>Вы: {myReady ? <span className="text-emerald-400">готовы ✓</span> : <span className="text-amber-300">не готовы</span>}</div>
        <div>Соперник: {otherReady ? <span className="text-emerald-400">готов ✓</span> : <span className="text-amber-300">не готов</span>}</div>
      </div>
      <button onClick={press} disabled={myReady || busy} className={cn('btn-primary w-full', (myReady || busy) && 'opacity-50')}>
        {myReady ? 'Жду соперника...' : '⚔️ Я готов'}
      </button>
    </div>
  );
}

// ============================================================
// RESULT CARD
// ============================================================

function ResultCard({ won, details, stake }: { won: boolean; details: string; stake: number }) {
  return (
    <div className={cn('glass-strong p-6 text-center space-y-3', won ? 'gold-border' : 'crimson-border')}>
      <div className="text-5xl">{won ? '🏆' : '💀'}</div>
      <h2 className={cn('font-heading text-2xl font-bold', won ? 'text-gold' : 'text-red-400')}>
        {won ? 'Победа!' : 'Проигрыш'}
      </h2>
      {details && <p className="text-sm text-muted-foreground">{details}</p>}
      <div className={cn('text-lg font-mono font-bold', won ? 'text-emerald-400' : 'text-red-400')}>
        {won ? '+' : '-'}<Yen amount={stake} className="inline" iconClass="w-4 h-4" />
      </div>
      <div className="flex gap-2 pt-2">
        <Link href="/games" className="btn-outline flex-1">К играм</Link>
        <Link href="/history" className="btn-secondary flex-1">История</Link>
      </div>
    </div>
  );
}

// ============================================================
// GAME COMPONENTS
// ============================================================

interface GameProps {
  challenge: GameChallenge;
  rd: ResultData;
  isCreator: boolean;
  creator: Participant;
  opponent: Participant;
  currentUser: Participant;
  sb: any;
  notify: (id: string, n: any) => Promise<void>;
  addHistory: (pid: string, action: string, desc: string, amount: number, link?: string) => Promise<void>;
  gameLabel: string;
  gameType: MiniGameType;
}

// ===== DICE =====
function DiceGame(p: GameProps) {
  const { challenge, rd, isCreator, creator, opponent, sb, notify, addHistory, gameLabel, gameType } = p;
  const [rolling, setRolling] = useState(false);

  const myDice  = isCreator ? rd.creator_dice  : rd.opponent_dice;
  const oppDice = isCreator ? rd.opponent_dice : rd.creator_dice;

  const myThrown  = !!myDice;
  const oppThrown = !!oppDice;

  const roll = async () => {
    if (rolling || myThrown) return;
    setRolling(true);
    setTimeout(async () => {
      const d: [number, number] = [Math.floor(Math.random()*6)+1, Math.floor(Math.random()*6)+1];
      const updated = await patchResult(sb, challenge.id,
        isCreator ? { creator_dice: d } : { opponent_dice: d }
      );
      const cd = updated.creator_dice;
      const od = updated.opponent_dice;
      if (cd && od) {
        const sumC = cd[0] + cd[1];
        const sumO = od[0] + od[1];
        let winnerSide: 'creator' | 'opponent';
        if (sumC > sumO) winnerSide = 'creator';
        else if (sumO > sumC) winnerSide = 'opponent';
        else winnerSide = Math.random() > 0.5 ? 'creator' : 'opponent';
        const details = `Создатель ${cd[0]}+${cd[1]}=${sumC} · Соперник ${od[0]}+${od[1]}=${sumO}`;
        await finishMatch({ sb, challenge, creator, opponent, winnerSide, details, notify, addHistory, gameLabel, gameType, rdExtra: updated });
      }
      setRolling(false);
    }, 1200);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className={cn('glass p-4 text-center', myThrown && 'gold-border')}>
          <div className="text-[10px] uppercase text-gold/70">Вы</div>
          {myDice ? (
            <>
              <div className="text-3xl mt-2">🎲 🎲</div>
              <div className="font-mono text-2xl font-bold mt-1">{myDice[0]} + {myDice[1]} = {myDice[0]+myDice[1]}</div>
            </>
          ) : rolling ? (
            <div className="text-3xl mt-2 animate-pulse">🎲</div>
          ) : (
            <button onClick={roll} className="btn-primary w-full mt-3 text-sm">Кинуть кости</button>
          )}
        </div>
        <div className={cn('glass p-4 text-center', oppThrown && 'gold-border')}>
          <div className="text-[10px] uppercase text-gold/70">Соперник</div>
          {oppDice ? (
            <>
              <div className="text-3xl mt-2">🎲 🎲</div>
              <div className="font-mono text-2xl font-bold mt-1">{oppDice[0]} + {oppDice[1]} = {oppDice[0]+oppDice[1]}</div>
            </>
          ) : (
            <div className="text-xs text-muted-foreground mt-6">Ещё не кинул(а)...</div>
          )}
        </div>
      </div>
      <div className="text-center text-xs text-muted-foreground">
        {!myThrown && !oppThrown && 'Кидайте по очереди или одновременно — больше сумма выигрывает.'}
        {myThrown && !oppThrown && 'Жду соперника...'}
        {!myThrown && oppThrown && 'Соперник уже кинул. Ваш ход!'}
      </div>
    </div>
  );
}

// ===== BLACKJACK =====
function BlackjackGame(p: GameProps) {
  const { challenge, rd, isCreator, creator, opponent, sb, notify, addHistory, gameLabel, gameType } = p;

  const myCards: number[]  = (isCreator ? rd.bj_creator_cards : rd.bj_opponent_cards) || [];
  const oppCards: number[] = (isCreator ? rd.bj_opponent_cards : rd.bj_creator_cards) || [];
  const myStand  = isCreator ? !!rd.bj_creator_stand : !!rd.bj_opponent_stand;
  const oppStand = isCreator ? !!rd.bj_opponent_stand : !!rd.bj_creator_stand;
  const turn = rd.bj_turn === 'creator' ? (isCreator ? 'me' : 'opp') : (isCreator ? 'opp' : 'me');

  const myScore  = bjScore(myCards);
  const oppScore = bjScore(oppCards);
  const myBust = myScore > 21;
  const oppBust = oppScore > 21;

  const finishIfReady = async (next: ResultData) => {
    const cs = next.bj_creator_cards || [];
    const os = next.bj_opponent_cards || [];
    const cScore = bjScore(cs);
    const oScore = bjScore(os);
    const cBust = cScore > 21;
    const oBust = oScore > 21;
    const cStand = !!next.bj_creator_stand;
    const oStand = !!next.bj_opponent_stand;

    const bothDone = (cStand || cBust) && (oStand || oBust);
    if (!bothDone) return;

    let winnerSide: 'creator' | 'opponent';
    if (cBust && oBust) winnerSide = cScore < oScore ? 'creator' : oScore < cScore ? 'opponent' : (Math.random() > 0.5 ? 'creator' : 'opponent');
    else if (cBust) winnerSide = 'opponent';
    else if (oBust) winnerSide = 'creator';
    else if (cScore === oScore) winnerSide = Math.random() > 0.5 ? 'creator' : 'opponent';
    else winnerSide = cScore > oScore ? 'creator' : 'opponent';

    const details = `Создатель: ${cScore}${cBust ? ' (перебор)' : ''} · Соперник: ${oScore}${oBust ? ' (перебор)' : ''}`;
    await finishMatch({ sb, challenge, creator, opponent, winnerSide, details, notify, addHistory, gameLabel, gameType, rdExtra: next });
  };

  const hit = async () => {
    if (turn !== 'me' || myStand || myBust) return;
    const card = drawCard();
    const updated = await patchResult(sb, challenge.id, (cur) => {
      const newCards = [...((isCreator ? cur.bj_creator_cards : cur.bj_opponent_cards) || []), card];
      const newScore = bjScore(newCards);
      const patch: Partial<ResultData> = {};
      if (isCreator) patch.bj_creator_cards = newCards;
      else patch.bj_opponent_cards = newCards;
      if (newScore >= 21) {
        if (isCreator) patch.bj_creator_stand = true;
        else patch.bj_opponent_stand = true;
      }
      const otherCards = (isCreator ? cur.bj_opponent_cards : cur.bj_creator_cards) || [];
      const otherStand = isCreator ? cur.bj_opponent_stand : cur.bj_creator_stand;
      const otherDone = otherStand || bjScore(otherCards) > 21;
      if (!otherDone) patch.bj_turn = isCreator ? 'opponent' : 'creator';
      return patch;
    });
    await finishIfReady(updated);
  };

  const stand = async () => {
    if (turn !== 'me' || myStand || myBust) return;
    const updated = await patchResult(sb, challenge.id, (cur) => {
      const patch: Partial<ResultData> = {};
      if (isCreator) patch.bj_creator_stand = true;
      else patch.bj_opponent_stand = true;
      const otherCards = (isCreator ? cur.bj_opponent_cards : cur.bj_creator_cards) || [];
      const otherStand = isCreator ? cur.bj_opponent_stand : cur.bj_creator_stand;
      const otherDone = otherStand || bjScore(otherCards) > 21;
      if (!otherDone) patch.bj_turn = isCreator ? 'opponent' : 'creator';
      return patch;
    });
    await finishIfReady(updated);
  };

  const myDone = myStand || myBust;
  const oppDone = oppStand || oppBust;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className={cn('glass p-3 text-center', myDone && 'gold-border')}>
          <div className="text-[10px] uppercase text-gold/70">Вы</div>
          <div className="text-2xl mt-1">{myCards.map(() => '🂠').join('')}</div>
          <div className="font-mono font-bold mt-1">
            {myCards.join(' + ')} = <span className={cn(myBust && 'text-red-400', myScore === 21 && 'text-emerald-400')}>{myScore}</span>
          </div>
          {myBust && <div className="text-[10px] text-red-400 mt-1">Перебор</div>}
          {myScore === 21 && !myBust && <div className="text-[10px] text-emerald-400 mt-1">21!</div>}
          {myStand && !myBust && myScore !== 21 && <div className="text-[10px] text-muted-foreground mt-1">Стоп</div>}
        </div>
        <div className={cn('glass p-3 text-center', oppDone && 'gold-border')}>
          <div className="text-[10px] uppercase text-gold/70">Соперник</div>
          <div className="text-2xl mt-1">{oppCards.map(() => '🂠').join('')}</div>
          <div className="font-mono font-bold mt-1">
            {oppCards.join(' + ')} = <span className={cn(oppBust && 'text-red-400', oppScore === 21 && 'text-emerald-400')}>{oppScore}</span>
          </div>
          {oppBust && <div className="text-[10px] text-red-400 mt-1">Перебор</div>}
          {oppScore === 21 && !oppBust && <div className="text-[10px] text-emerald-400 mt-1">21!</div>}
          {oppStand && !oppBust && oppScore !== 21 && <div className="text-[10px] text-muted-foreground mt-1">Стоп</div>}
        </div>
      </div>

      <div className="glass-strong p-4 text-center">
        {turn === 'me' && !myDone && (
          <>
            <div className="text-sm font-bold text-gold mb-2">Ваш ход</div>
            <div className="flex gap-2">
              <button onClick={hit}   className="btn-primary flex-1">+ Карта</button>
              <button onClick={stand} className="btn-secondary flex-1">Стоп</button>
            </div>
          </>
        )}
        {turn === 'opp' && !oppDone && (
          <div className="text-sm text-muted-foreground">Ход соперника...</div>
        )}
        {myDone && !oppDone && turn === 'opp' && (
          <div className="text-sm text-muted-foreground">Жду пока соперник доиграет...</div>
        )}
        {myDone && oppDone && (
          <div className="text-sm text-muted-foreground">Подвожу итог...</div>
        )}
      </div>
    </div>
  );
}

// ===== FIND_PAIR =====
function FindPairGame(p: GameProps) {
  const { challenge, rd, isCreator, creator, opponent, sb, notify, addHistory, gameLabel, gameType } = p;
  const cards = rd.pair_cards || [];
  const flipped = rd.pair_flipped || [];
  const turn = rd.pair_turn === 'creator' ? (isCreator ? 'me' : 'opp') : (isCreator ? 'opp' : 'me');
  const myScore  = (isCreator ? rd.pair_creator_score  : rd.pair_opponent_score)  || 0;
  const oppScore = (isCreator ? rd.pair_opponent_score : rd.pair_creator_score) || 0;
  const totalCollected = cards.filter(c => c.collected_by !== null).length;
  const allDone = totalCollected === cards.length && cards.length > 0;

  const lockedUntil = rd.pair_locked_until || 0;
  const isLocked = Date.now() < lockedUntil;

  const flip = async (idx: number) => {
    if (turn !== 'me' || isLocked) return;
    if (cards[idx].collected_by !== null) return;
    if (flipped.includes(idx)) return;
    if (flipped.length >= 2) return;

    const newFlipped = [...flipped, idx];

    if (newFlipped.length < 2) {
      await patchResult(sb, challenge.id, { pair_flipped: newFlipped });
      return;
    }

    const a = cards[newFlipped[0]];
    const b = cards[newFlipped[1]];
    const match = a.value === b.value;

    if (match) {
      const newCards = cards.map((c, i) =>
        (i === newFlipped[0] || i === newFlipped[1])
          ? { ...c, collected_by: (isCreator ? 'creator' : 'opponent') as 'creator' | 'opponent' }
          : c
      );
      const allCollected = newCards.every(c => c.collected_by !== null);
      const newCScore = (rd.pair_creator_score || 0) + (isCreator ? 1 : 0);
      const newOScore = (rd.pair_opponent_score || 0) + (isCreator ? 0 : 1);
      const updated = await patchResult(sb, challenge.id, {
        pair_cards: newCards,
        pair_flipped: [],
        pair_creator_score: newCScore,
        pair_opponent_score: newOScore,
      });

      if (allCollected) {
        let winnerSide: 'creator' | 'opponent';
        if (newCScore > newOScore) winnerSide = 'creator';
        else if (newOScore > newCScore) winnerSide = 'opponent';
        else winnerSide = Math.random() > 0.5 ? 'creator' : 'opponent';
        const details = `Создатель собрал ${newCScore} пары · Соперник ${newOScore}`;
        await finishMatch({ sb, challenge, creator, opponent, winnerSide, details, notify, addHistory, gameLabel, gameType, rdExtra: updated });
      }
    } else {
      await patchResult(sb, challenge.id, {
        pair_flipped: newFlipped,
        pair_locked_until: Date.now() + 1500,
      });
      setTimeout(async () => {
        await patchResult(sb, challenge.id, {
          pair_flipped: [],
          pair_turn: isCreator ? 'opponent' : 'creator',
          pair_locked_until: 0,
        });
      }, 1500);
    }
  };

  const labels = ['🍒','🍋','🍊','💎','7️⃣','⭐','🍀','🔔'];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-around glass p-2 text-xs">
        <div>Вы: <span className="text-gold font-bold">{myScore}</span></div>
        <div className="text-muted">vs</div>
        <div>Соперник: <span className="text-gold font-bold">{oppScore}</span></div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {cards.map((card, i) => {
          const open = flipped.includes(i) || card.collected_by !== null;
          const collected = card.collected_by !== null;
          return (
            <button
              key={card.id}
              onClick={() => flip(i)}
              disabled={turn !== 'me' || open || isLocked || flipped.length >= 2}
              className={cn(
                'aspect-square rounded-xl border text-3xl flex items-center justify-center transition-transform active:scale-95',
                open ? 'bg-gold/15 border-gold/50' : 'bg-card/60 border-white/10',
                collected && 'opacity-30',
              )}
            >
              {open ? labels[card.value % labels.length] : '🂠'}
            </button>
          );
        })}
      </div>

      <div className="text-center text-xs text-muted-foreground">
        {turn === 'me' && !allDone && !isLocked && 'Ваш ход — откройте 2 карты'}
        {turn === 'opp' && !allDone && 'Ход соперника...'}
        {isLocked && 'Запоминаем...'}
        {allDone && 'Подвожу итог...'}
      </div>
    </div>
  );
}

// ===== FIND_JOKER =====
function FindJokerGame(p: GameProps) {
  const { challenge, rd, isCreator, creator, opponent, sb, notify, addHistory, gameLabel, gameType } = p;
  const deck = rd.joker_deck || [];
  const drawn = rd.joker_drawn || [];
  const turn = rd.joker_turn === 'creator' ? (isCreator ? 'me' : 'opp') : (isCreator ? 'opp' : 'me');

  const draw = async () => {
    if (turn !== 'me') return;
    if (deck.length === 0) return;
    const card = deck[0];
    const newDeck = deck.slice(1);
    const idx = drawn.length;
    const by: 'creator' | 'opponent' = isCreator ? 'creator' : 'opponent';
    const newDrawn = [...drawn, { idx, card, by }];

    const updated = await patchResult(sb, challenge.id, {
      joker_deck: newDeck,
      joker_drawn: newDrawn,
      joker_turn: isCreator ? 'opponent' : 'creator',
    });

    if (card === 'joker') {
      const winnerSide: 'creator' | 'opponent' = isCreator ? 'opponent' : 'creator';
      const details = `${isCreator ? creator.display_name : opponent.display_name} вытянул(а) джокера 🃏 на ходу #${idx + 1}`;
      await finishMatch({ sb, challenge, creator, opponent, winnerSide, details, notify, addHistory, gameLabel, gameType, rdExtra: updated });
    }
  };

  return (
    <div className="space-y-3">
      <div className="glass p-3">
        <div className="text-[10px] uppercase text-gold/70 mb-2">Вытащенные карты</div>
        <div className="flex flex-wrap gap-2">
          {drawn.length === 0 ? (
            <div className="text-xs text-muted-foreground">Ещё ничего не тянули</div>
          ) : drawn.map(d => (
            <div key={d.idx} className="text-center">
              <div className="text-2xl">{d.card === 'joker' ? '🃏' : '🂠'}</div>
              <div className="text-[9px] text-muted">{d.by === 'creator' ? creator.display_name : opponent.display_name}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="glass-strong p-4 text-center space-y-2">
        <div className="text-xs text-muted-foreground">В колоде осталось: {deck.length} карт</div>
        {turn === 'me' && deck.length > 0 && (
          <button onClick={draw} className="btn-primary w-full">🎴 Тянуть карту</button>
        )}
        {turn === 'opp' && deck.length > 0 && (
          <div className="text-sm text-muted-foreground py-2">Соперник тянет карту...</div>
        )}
        {deck.length === 0 && (
          <div className="text-sm text-muted-foreground py-2">Колода пуста, подвожу итог...</div>
        )}
      </div>
    </div>
  );
}

// ===== SIMPLE ROLL =====
function SimpleRollGame(p: GameProps) {
  const { challenge, rd, isCreator, creator, opponent, sb, notify, addHistory, gameLabel, gameType } = p;
  const result = rd.simple_result;
  const [busy, setBusy] = useState(false);
  const canRoll = isCreator && !result;

  const roll = async () => {
    if (busy || !canRoll) return;
    setBusy(true);
    setTimeout(async () => {
      let winnerSide: 'creator' | 'opponent';
      let details: string;
      switch (gameType) {
        case 'high_card': {
          const a = Math.floor(Math.random() * 13) + 2;
          const b = Math.floor(Math.random() * 13) + 2;
          winnerSide = a > b ? 'creator' : b > a ? 'opponent' : (Math.random() > 0.5 ? 'creator' : 'opponent');
          details = `Создатель: ${a} · Соперник: ${b}`;
          break;
        }
        case 'roulette': {
          const num = Math.floor(Math.random() * 37);
          winnerSide = num % 2 === 0 ? 'creator' : 'opponent';
          details = `Выпало ${num} (${num === 0 ? 'зеро' : num % 2 === 0 ? 'чёт' : 'нечёт'})`;
          break;
        }
        case 'slots': {
          const syms = ['🍒','🍋','🍊','💎','7️⃣','⭐'];
          const r = [
            syms[Math.floor(Math.random() * syms.length)],
            syms[Math.floor(Math.random() * syms.length)],
            syms[Math.floor(Math.random() * syms.length)],
          ];
          const triple = (r[0] === r[1] && r[1] === r[2]);
          const pair = !triple && (r[0] === r[1] || r[1] === r[2] || r[0] === r[2]);
          winnerSide = (triple || pair) ? 'creator' : 'opponent';
          details = `${r.join(' ')}${triple ? ' — джекпот' : pair ? ' — пара' : ''}`;
          break;
        }
        case 'bluff_duel':
        case 'truth_or_bet':
        default:
          winnerSide = Math.random() > 0.5 ? 'creator' : 'opponent';
          details = winnerSide === 'creator' ? 'Создатель раскусил блеф' : 'Соперник убедил';
      }
      const updated = await patchResult(sb, challenge.id, { simple_result: { winnerSide, details } });
      await finishMatch({ sb, challenge, creator, opponent, winnerSide, details, notify, addHistory, gameLabel, gameType, rdExtra: updated });
      setBusy(false);
    }, 1200);
  };

  return (
    <div className="glass-strong p-6 text-center space-y-3">
      {!result ? (
        canRoll ? (
          <>
            <div className="text-[10px] uppercase text-gold/70">Готовы — катим раунд</div>
            <button onClick={roll} disabled={busy} className="btn-primary w-full">{busy ? 'Катим...' : '🎲 Сыграть!'}</button>
          </>
        ) : (
          <div className="text-sm text-muted-foreground py-2">Создатель катит раунд...</div>
        )
      ) : (
        <div className="text-sm text-muted-foreground py-2">Подвожу итог: {result.details}</div>
      )}
    </div>
  );
}

// ===== DEMO MODE =====
function DemoMode({ type }: { type: MiniGameType }) {
  const { currentUser, addHistory } = useStore();
  const sb = getSupabase();
  const [stake] = useState(10000);
  const [rolling, setRolling] = useState(false);
  const [result, setResult] = useState<{ won: boolean; details: string } | null>(null);
  const info = LABELS[type];

  const play = async () => {
    if (!currentUser || !sb || rolling) return;
    setRolling(true);
    setTimeout(async () => {
      const won = Math.random() > 0.5;
      const details = won ? 'Удача на вашей стороне' : 'В этот раз не повезло';
      setResult({ won, details });
      setRolling(false);
      const newBal = won ? currentUser.balance + stake : Math.max(0, currentUser.balance - stake);
      await sb.from('participants').update({
        balance: newBal,
        wins: won ? currentUser.wins + 1 : currentUser.wins,
        losses: won ? currentUser.losses : currentUser.losses + 1,
      }).eq('id', currentUser.id);
      await addHistory(currentUser.id, won ? 'game_win' : 'game_loss',
        `${info.label} (тренировка)`, won ? stake : -stake, '/games');
    }, 1200);
  };

  return (
    <div className="px-3 sm:px-4 py-4 max-w-md mx-auto space-y-4 animate-fade-in">
      <Header info={info} stake={stake} />
      {!result ? (
        <div className="glass-strong p-6 text-center space-y-3">
          {rolling ? (
            <>
              <div className="text-5xl animate-pulse">{info.icon}</div>
              <p className="text-sm text-muted-foreground">Играем...</p>
            </>
          ) : (
            <>
              <div className="text-[10px] uppercase tracking-widest text-amber-300/70">Тренировочный режим</div>
              <p className="text-sm text-muted-foreground">Игра против случайности — ставка списывается с вашего баланса.</p>
              <button onClick={play} className="btn-primary w-full">{info.icon} Играть!</button>
            </>
          )}
        </div>
      ) : (
        <ResultCard won={result.won} details={result.details} stake={stake} />
      )}
    </div>
  );
}
