'use client';

// Пошаговая игра двух игроков. Все ходы летят через challenge.result_data
// (JSONB), Realtime разносит изменения соперникам автоматически.
//
// Фазы:
//   ready    — оба должны нажать «Я готов»
//   playing  — игра идёт, каждый ходит по правилам конкретной игры
//   finished — результат, баланс уже посчитан (challenge.status = 'finished')

import { Suspense, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useStore, uid } from '@/lib/store/StoreProvider';
import { Yen } from '@/components/ui/Yen';
import { cn } from '@/lib/utils';
import { getSupabase } from '@/lib/supabase/client';
import { transferBetweenPlayers, chargeToTreasury, payoutFromTreasury } from '@/lib/store/tx';
import { PlayingCardView } from '@/components/ui/PlayingCardView';
import { Coin3D, CoinSideLabel } from '@/components/ui/Coin3D';
import {
  type PlayingCard, makeDeck52, shuffle, bjHandScore, cardLabel,
} from '@/lib/minigames/cards';
import type { MiniGameType, GameChallenge, Participant } from '@/lib/store/types';

// ============================================================
// CONST
// ============================================================

const LABELS: Record<MiniGameType, { label: string; icon: string }> = {
  dice:       { label: 'Кости',                   icon: '🎲' },
  coin_flip:  { label: 'Монетка',                  icon: '🪙' },
  parity:     { label: 'Чёт / Нечёт',              icon: '🔢' },
  high_card:  { label: 'Старшая карта',           icon: '🃏' },
  roulette:   { label: 'Рулетка',                 icon: '🎰' },
  slots:      { label: 'Камень-Ножницы-Бумага',   icon: '✊' },
  blackjack:  { label: '21 очко',                 icon: '🂡' },
  bluff_duel: { label: 'Блеф-дуэль',              icon: '🎭' },
  find_pair:  { label: 'Найди пару',              icon: '🃟' },
  find_joker: { label: 'Найди Джокера',           icon: '🎴' },
  liars_bar:  { label: 'Бар лжецов',              icon: '🍷' },
};

// ============================================================
// SHARED STATE
// ============================================================

type RPSChoice = 'rock' | 'paper' | 'scissors';

interface ResultData {
  phase?: 'ready' | 'playing' | 'finished';
  creator_ready?: boolean;
  opponent_ready?: boolean;

  // dice — каждый кидает по очереди
  dice_turn?: 'creator' | 'opponent';
  dice_creator?: [number, number];
  dice_opponent?: [number, number];

  // high_card — по очереди
  high_turn?: 'creator' | 'opponent';
  high_creator?: PlayingCard;
  high_opponent?: PlayingCard;

  // roulette — оба «дёргают рычаг»
  roulette_turn?: 'creator' | 'opponent';
  roulette_creator?: number;
  roulette_opponent?: number;

  // КНБ (slots): 3 раунда, каждый раунд оба выбирают
  rps_round?: number;            // 1..3
  rps_creator_choice?: RPSChoice;
  rps_opponent_choice?: RPSChoice;
  rps_creator_score?: number;
  rps_opponent_score?: number;
  rps_history?: { round: number; creator: RPSChoice; opponent: RPSChoice; winner: 'creator' | 'opponent' | 'tie' }[];

  // blackjack — нормальные карты
  bj_deck?: PlayingCard[];
  bj_creator_cards?: PlayingCard[];
  bj_opponent_cards?: PlayingCard[];
  bj_creator_stand?: boolean;
  bj_opponent_stand?: boolean;
  bj_turn?: 'creator' | 'opponent';

  // блеф-дуэль (новая логика): автор пишет утверждение, соперник
  // выбирает «правда/ложь», запрос отправляется ведущему.
  bluff_statement?: string;
  bluff_guess?: 'truth' | 'lie';     // ответ соперника
  bluff_verdict?: 'truth' | 'lie';    // ответ ведущего
  bluff_phase?: 'await_statement' | 'await_guess' | 'await_gm' | 'resolved';

  // find_pair — 18 пар × 36 карт
  pair_cards?: { id: number; value: number; collected_by: 'creator' | 'opponent' | null }[];
  pair_flipped?: number[];
  pair_turn?: 'creator' | 'opponent';
  pair_creator_score?: number;
  pair_opponent_score?: number;
  pair_locked_until?: number;

  // find_joker — 11 карт (10 обычных + 1 джокер)
  joker_deck?: PlayingCard[];
  joker_drawn?: { idx: number; card: PlayingCard; by: 'creator' | 'opponent' }[];
  joker_turn?: 'creator' | 'opponent';

  // coin_flip — оба угадывают, потом подброс
  coin_creator_pick?: 'heads' | 'tails';
  coin_opponent_pick?: 'heads' | 'tails';
  coin_result?: 'heads' | 'tails';

  // parity — оба загадывают число 1..10, сумма чёт/нечёт
  parity_creator_num?: number;
  parity_opponent_num?: number;
  parity_creator_pick?: 'even' | 'odd';
  parity_opponent_pick?: 'even' | 'odd';

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

  await transferBetweenPlayers(
    loser.id,
    winner.id,
    stake,
    `${gameLabel} vs ${loser.display_name}`,
    '/games',
  );

  await sb.from('participants').update({ wins:   winner.wins   + 1 }).eq('id', winner.id);
  await sb.from('participants').update({ losses: loser.losses  + 1 }).eq('id', loser.id);

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
    body: `${gameLabel} vs ${loser.display_name}: +${stake.toLocaleString('ru-RU')} ¥`,
    link_url: `/games/play/${gameType}?challenge=${challenge.id}`,
  });
  await notify(loser.id, {
    type: 'game_result',
    title: 'Вы проиграли игру',
    body: `${gameLabel} vs ${winner.display_name}: -${stake.toLocaleString('ru-RU')} ¥`,
    link_url: `/games/play/${gameType}?challenge=${challenge.id}`,
  });
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

  const challenge = challengeId ? state.challenges.find(c => c.id === challengeId) : null;
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
    const needsGm = !!(rd as any).needs_gm_approval;
    return (
      <div className="px-3 sm:px-4 py-4 max-w-md mx-auto space-y-4 animate-fade-in">
        {head}
        {needsGm && <GmApprovalBanner challenge={challenge} />}
        <ReadyView challenge={challenge} isCreator={isCreator} rd={rd} gameType={type} blocked={needsGm} />
      </div>
    );
  }

  if (phase === 'playing') {
    const common = { challenge, rd, isCreator, creator, opponent, currentUser, sb, notify, addHistory, gameLabel: info.label, gameType: type };
    return (
      <div className="px-3 sm:px-4 py-4 max-w-md mx-auto space-y-4 animate-fade-in">
        {head}
        {type === 'dice'       && <DiceGame {...common} />}
        {type === 'coin_flip'  && <CoinFlipGame {...common} />}
        {type === 'parity'     && <ParityGame {...common} />}
        {type === 'high_card'  && <HighCardGame {...common} />}
        {type === 'roulette'   && <RouletteGame {...common} />}
        {type === 'slots'      && <RPSGame {...common} />}
        {type === 'blackjack'  && <BlackjackGame {...common} />}
        {type === 'bluff_duel' && <BluffGame {...common} />}
        {type === 'find_pair'  && <FindPairGame {...common} />}
        {type === 'find_joker' && <FindJokerGame {...common} />}
        {type === 'liars_bar'  && (
          <div className="glass p-4 text-center text-xs text-muted-foreground">
            Бар лжецов — это игра 2–6 человек. Создавайте её на странице Супер игр (Малые игры).
          </div>
        )}
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

function ReadyView({ challenge, isCreator, rd, gameType, blocked }: {
  challenge: GameChallenge;
  isCreator: boolean;
  rd: ResultData;
  gameType: MiniGameType;
  blocked?: boolean;
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
      const both = isCreator ? (cur.opponent_ready === true) : (cur.creator_ready === true);
      if (both) {
        next.phase = 'playing';
        // Кто ходит первым — рандомно.
        const first: 'creator' | 'opponent' = Math.random() < 0.5 ? 'creator' : 'opponent';
        if (gameType === 'dice') next.dice_turn = first;
        if (gameType === 'high_card') next.high_turn = first;
        if (gameType === 'roulette') next.roulette_turn = first;
        if (gameType === 'slots') {
          next.rps_round = 1;
          next.rps_creator_score = 0;
          next.rps_opponent_score = 0;
          next.rps_history = [];
        }
        if (gameType === 'blackjack') {
          const deck = shuffle(makeDeck52());
          // По 2 карты каждому
          next.bj_creator_cards = [deck[0], deck[2]];
          next.bj_opponent_cards = [deck[1], deck[3]];
          next.bj_deck = deck.slice(4);
          next.bj_creator_stand = false;
          next.bj_opponent_stand = false;
          next.bj_turn = first;
        }
        if (gameType === 'bluff_duel') {
          // Автор всегда — создатель вызова.
          next.bluff_phase = 'await_statement';
        }
        if (gameType === 'find_pair') {
          // 18 пар = 36 карт. Используем 36 карт стандартной колоды (без 2..7? возьмём первые 18 рангов с разной мастью).
          const deck = shuffle(makeDeck52()).slice(0, 36);
          // Делаем пары: значениям присваиваем индекс пары так чтобы каждая пара совпадала по ранг+цвет.
          // Простой подход: из 36 берём 18 рангов, каждый встречается дважды.
          const pairValues: number[] = [];
          const usedRanks: Record<string, number> = {};
          let pairId = 0;
          for (const c of deck) {
            const key = c.rank;
            if (usedRanks[key] === undefined) usedRanks[key] = pairId++;
            pairValues.push(usedRanks[key]);
            if (pairId >= 18) break;
          }
          // Перегенерим равномерно: 18 значений по 2 раза, перемешаем.
          const values: number[] = [];
          for (let i = 0; i < 18; i++) { values.push(i); values.push(i); }
          const shuffled = shuffle(values);
          next.pair_cards = shuffled.map((v, id) => ({ id, value: v, collected_by: null }));
          next.pair_flipped = [];
          next.pair_turn = first;
          next.pair_creator_score = 0;
          next.pair_opponent_score = 0;
        }
        if (gameType === 'find_joker') {
          // 10 обычных + 1 джокер из реальной колоды
          const regulars = shuffle(makeDeck52()).slice(0, 10);
          const joker: PlayingCard = { id: 99, suit: '♠', rank: 'A', value: 0, joker: true };
          const deck = shuffle([...regulars, joker]);
          next.joker_deck = deck;
          next.joker_drawn = [];
          next.joker_turn = first;
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
      <button onClick={press} disabled={myReady || busy || blocked} className={cn('btn-primary w-full', (myReady || busy || blocked) && 'opacity-50')}>
        {blocked ? '⏳ Ждём апрув ведущего' : myReady ? 'Жду соперника...' : '⚔️ Я готов'}
      </button>
    </div>
  );
}

function GmApprovalBanner({ challenge }: { challenge: GameChallenge }) {
  const { role } = useStore();
  const sb = getSupabase();
  const [busy, setBusy] = useState(false);
  const isGm = role === 'gm';

  const approve = async () => {
    if (!sb || busy) return;
    setBusy(true);
    await patchResult(sb, challenge.id, { needs_gm_approval: false } as any);
    setBusy(false);
  };
  const reject = async () => {
    if (!sb || busy) return;
    if (!confirm('Отклонить вызов с большой ставкой?')) return;
    setBusy(true);
    await sb.from('challenges').update({ status: 'cancelled' }).eq('id', challenge.id);
    setBusy(false);
  };

  return (
    <div className="glass-strong gold-border p-4 text-center" style={{ background: 'linear-gradient(135deg, rgba(212,175,55,0.15) 0%, rgba(139,26,26,0.15) 100%)' }}>
      <div className="text-[10px] uppercase tracking-widest text-gold/70">⏳ Большая ставка</div>
      <div className="text-sm mt-1">Ставка <b className="text-gold">{challenge.stake_amount.toLocaleString('ru-RU')} ¥</b> требует подтверждения ведущего.</div>
      {isGm ? (
        <div className="grid grid-cols-2 gap-2 mt-3">
          <button onClick={approve} disabled={busy} className="btn-success">✓ Одобрить</button>
          <button onClick={reject} disabled={busy} className="btn-danger">✕ Отклонить</button>
        </div>
      ) : (
        <div className="text-[10px] text-amber-300/80 mt-2 animate-pulse">Уведомление отправлено</div>
      )}
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
// COMMON GAME PROPS
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

// ============================================================
// DICE — каждый кидает по очереди, анимация
// ============================================================

function DiceGame(p: GameProps) {
  const { challenge, rd, isCreator, creator, opponent, sb, notify, addHistory, gameLabel, gameType } = p;
  const [rolling, setRolling] = useState(false);
  const [animDice, setAnimDice] = useState<[number, number] | null>(null);

  const myDice  = isCreator ? rd.dice_creator  : rd.dice_opponent;
  const oppDice = isCreator ? rd.dice_opponent : rd.dice_creator;

  const turn = rd.dice_turn === 'creator' ? (isCreator ? 'me' : 'opp') : (isCreator ? 'opp' : 'me');

  // Анимация катящегося кубика
  useEffect(() => {
    if (!rolling) { setAnimDice(null); return; }
    const t = setInterval(() => {
      setAnimDice([Math.floor(Math.random()*6)+1, Math.floor(Math.random()*6)+1]);
    }, 80);
    return () => clearInterval(t);
  }, [rolling]);

  const roll = async () => {
    if (rolling || myDice || turn !== 'me') return;
    setRolling(true);
    setTimeout(async () => {
      const d: [number, number] = [Math.floor(Math.random()*6)+1, Math.floor(Math.random()*6)+1];
      const updated = await patchResult(sb, challenge.id, (cur) => {
        const patch: Partial<ResultData> = isCreator ? { dice_creator: d } : { dice_opponent: d };
        // Передаём ход сопернику, если он ещё не кидал
        const otherRolled = isCreator ? !!cur.dice_opponent : !!cur.dice_creator;
        if (!otherRolled) patch.dice_turn = isCreator ? 'opponent' : 'creator';
        return patch;
      });
      const cd = updated.dice_creator;
      const od = updated.dice_opponent;
      if (cd && od) {
        const sumC = cd[0] + cd[1];
        const sumO = od[0] + od[1];
        let winnerSide: 'creator' | 'opponent';
        if (sumC > sumO) winnerSide = 'creator';
        else if (sumO > sumC) winnerSide = 'opponent';
        else winnerSide = Math.random() > 0.5 ? 'creator' : 'opponent';
        const details = `${creator.display_name}: ${cd[0]}+${cd[1]}=${sumC} · ${opponent.display_name}: ${od[0]}+${od[1]}=${sumO}`;
        await finishMatch({ sb, challenge, creator, opponent, winnerSide, details, notify, addHistory, gameLabel, gameType, rdExtra: updated });
      }
      setRolling(false);
    }, 1100);
  };

  const renderDie = (n?: number) => {
    if (n === undefined) return '🎲';
    return ['⚀','⚁','⚂','⚃','⚄','⚅'][n-1] || '🎲';
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <PlayerDicePanel
          name="Вы"
          dice={myDice}
          rolling={rolling && turn === 'me'}
          animDice={animDice}
        />
        <PlayerDicePanel
          name={isCreator ? opponent.display_name : creator.display_name}
          dice={oppDice}
          rolling={false}
          animDice={null}
        />
      </div>

      <div className="glass-strong p-4 text-center">
        {turn === 'me' && !myDice && (
          <button onClick={roll} disabled={rolling} className="btn-primary w-full">
            {rolling ? 'Катятся...' : '🎲 Бросить кости'}
          </button>
        )}
        {turn === 'opp' && !oppDice && (
          <div className="text-sm text-muted-foreground">Ход соперника...</div>
        )}
        {myDice && !oppDice && (
          <div className="text-sm text-muted-foreground">Ждём бросок соперника...</div>
        )}
        {myDice && oppDice && (
          <div className="text-sm text-muted-foreground">Подвожу итог...</div>
        )}
      </div>
    </div>
  );

  function PlayerDicePanel({ name, dice, rolling, animDice }: { name: string; dice?: [number, number]; rolling: boolean; animDice: [number, number] | null }) {
    const display = rolling && animDice ? animDice : dice;
    return (
      <div className={cn('glass p-4 text-center', dice && 'gold-border')}>
        <div className="text-[10px] uppercase text-gold/70">{name}</div>
        <div className="text-5xl mt-2 select-none" style={{ minHeight: '3rem' }}>
          {display ? `${renderDie(display[0])} ${renderDie(display[1])}` : '🎲'}
        </div>
        {dice && !rolling && (
          <div className="font-mono text-xl font-bold mt-1">
            {dice[0]} + {dice[1]} = <span className="text-gold">{dice[0]+dice[1]}</span>
          </div>
        )}
        {rolling && <div className="text-[10px] text-amber-300/80 mt-1 animate-pulse">катятся...</div>}
      </div>
    );
  }
}

// ============================================================
// HIGH CARD — каждый тянет карту по очереди
// ============================================================

function HighCardGame(p: GameProps) {
  const { challenge, rd, isCreator, creator, opponent, sb, notify, addHistory, gameLabel, gameType } = p;
  const [drawing, setDrawing] = useState(false);

  const myCard  = isCreator ? rd.high_creator  : rd.high_opponent;
  const oppCard = isCreator ? rd.high_opponent : rd.high_creator;
  const turn = rd.high_turn === 'creator' ? (isCreator ? 'me' : 'opp') : (isCreator ? 'opp' : 'me');

  const draw = async () => {
    if (drawing || myCard || turn !== 'me') return;
    setDrawing(true);
    setTimeout(async () => {
      const deck = makeDeck52();
      const card = deck[Math.floor(Math.random() * deck.length)];
      const updated = await patchResult(sb, challenge.id, (cur) => {
        const patch: Partial<ResultData> = isCreator ? { high_creator: card } : { high_opponent: card };
        const otherDrew = isCreator ? !!cur.high_opponent : !!cur.high_creator;
        if (!otherDrew) patch.high_turn = isCreator ? 'opponent' : 'creator';
        return patch;
      });
      const cc = updated.high_creator;
      const oc = updated.high_opponent;
      if (cc && oc) {
        let winnerSide: 'creator' | 'opponent';
        if (cc.value > oc.value) winnerSide = 'creator';
        else if (oc.value > cc.value) winnerSide = 'opponent';
        else winnerSide = Math.random() > 0.5 ? 'creator' : 'opponent';
        const details = `${creator.display_name}: ${cardLabel(cc)} · ${opponent.display_name}: ${cardLabel(oc)}`;
        await finishMatch({ sb, challenge, creator, opponent, winnerSide, details, notify, addHistory, gameLabel, gameType, rdExtra: updated });
      }
      setDrawing(false);
    }, 800);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className={cn('glass p-4 flex flex-col items-center gap-2', myCard && 'gold-border')}>
          <div className="text-[10px] uppercase text-gold/70">Вы</div>
          {myCard ? <PlayingCardView card={myCard} size="lg" /> : <PlayingCardView faceDown size="lg" className={drawing ? 'animate-pulse' : ''} />}
        </div>
        <div className={cn('glass p-4 flex flex-col items-center gap-2', oppCard && 'gold-border')}>
          <div className="text-[10px] uppercase text-gold/70">{isCreator ? opponent.display_name : creator.display_name}</div>
          {oppCard ? <PlayingCardView card={oppCard} size="lg" /> : <PlayingCardView faceDown size="lg" />}
        </div>
      </div>
      <div className="glass-strong p-4 text-center">
        {turn === 'me' && !myCard && (
          <button onClick={draw} disabled={drawing} className="btn-primary w-full">
            {drawing ? 'Тянем карту...' : '🎴 Тянуть карту'}
          </button>
        )}
        {turn === 'opp' && !oppCard && <div className="text-sm text-muted-foreground">Ход соперника...</div>}
        {myCard && !oppCard && <div className="text-sm text-muted-foreground">Ждём соперника...</div>}
        {myCard && oppCard && <div className="text-sm text-muted-foreground">Подвожу итог...</div>}
      </div>
    </div>
  );
}

// ============================================================
// ROULETTE — оба «дёргают рычаг» по очереди (0..36, больше — побеждает)
// ============================================================

function RouletteGame(p: GameProps) {
  const { challenge, rd, isCreator, creator, opponent, sb, notify, addHistory, gameLabel, gameType } = p;
  const [spinning, setSpinning] = useState(false);
  const [animVal, setAnimVal] = useState<number | null>(null);

  const myVal  = isCreator ? rd.roulette_creator  : rd.roulette_opponent;
  const oppVal = isCreator ? rd.roulette_opponent : rd.roulette_creator;
  const turn = rd.roulette_turn === 'creator' ? (isCreator ? 'me' : 'opp') : (isCreator ? 'opp' : 'me');

  useEffect(() => {
    if (!spinning) { setAnimVal(null); return; }
    const t = setInterval(() => setAnimVal(Math.floor(Math.random() * 37)), 50);
    return () => clearInterval(t);
  }, [spinning]);

  const spin = async () => {
    if (spinning || myVal !== undefined || turn !== 'me') return;
    setSpinning(true);
    setTimeout(async () => {
      const value = Math.floor(Math.random() * 37);
      const updated = await patchResult(sb, challenge.id, (cur) => {
        const patch: Partial<ResultData> = isCreator ? { roulette_creator: value } : { roulette_opponent: value };
        const otherSpun = isCreator ? cur.roulette_opponent !== undefined : cur.roulette_creator !== undefined;
        if (!otherSpun) patch.roulette_turn = isCreator ? 'opponent' : 'creator';
        return patch;
      });
      const cv = updated.roulette_creator;
      const ov = updated.roulette_opponent;
      if (cv !== undefined && ov !== undefined) {
        let winnerSide: 'creator' | 'opponent';
        if (cv > ov) winnerSide = 'creator';
        else if (ov > cv) winnerSide = 'opponent';
        else winnerSide = Math.random() > 0.5 ? 'creator' : 'opponent';
        const details = `${creator.display_name}: ${cv} · ${opponent.display_name}: ${ov}`;
        await finishMatch({ sb, challenge, creator, opponent, winnerSide, details, notify, addHistory, gameLabel, gameType, rdExtra: updated });
      }
      setSpinning(false);
    }, 1400);
  };

  const SectorView = ({ value }: { value: number | undefined }) => {
    const v = spinning && animVal !== null ? animVal : value;
    if (v === undefined) return <div className="text-4xl">🎯</div>;
    const color = v === 0 ? 'bg-emerald-500/20 text-emerald-300' : v % 2 === 0 ? 'bg-red-500/20 text-red-300' : 'bg-slate-700/40 text-slate-200';
    return (
      <div className={cn('w-16 h-16 mx-auto rounded-full border-2 border-gold/40 flex items-center justify-center font-mono font-bold text-xl', color, spinning && 'animate-spin-slow')}>
        {v}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className={cn('glass p-4 text-center', myVal !== undefined && 'gold-border')}>
          <div className="text-[10px] uppercase text-gold/70 mb-2">Вы</div>
          <SectorView value={myVal} />
        </div>
        <div className={cn('glass p-4 text-center', oppVal !== undefined && 'gold-border')}>
          <div className="text-[10px] uppercase text-gold/70 mb-2">{isCreator ? opponent.display_name : creator.display_name}</div>
          <SectorView value={oppVal} />
        </div>
      </div>
      <div className="glass-strong p-4 text-center">
        {turn === 'me' && myVal === undefined && (
          <button onClick={spin} disabled={spinning} className="btn-primary w-full">
            {spinning ? 'Колесо крутится...' : '🎰 Дёрнуть рычаг'}
          </button>
        )}
        {turn === 'opp' && oppVal === undefined && <div className="text-sm text-muted-foreground">Ход соперника...</div>}
        {myVal !== undefined && oppVal === undefined && <div className="text-sm text-muted-foreground">Ждём соперника...</div>}
        {myVal !== undefined && oppVal !== undefined && <div className="text-sm text-muted-foreground">Подвожу итог...</div>}
      </div>
    </div>
  );
}

// ============================================================
// RPS (slots) — 3 раунда камень/ножницы/бумага
// ============================================================

function RPSGame(p: GameProps) {
  const { challenge, rd, isCreator, creator, opponent, sb, notify, addHistory, gameLabel, gameType } = p;
  const [busy, setBusy] = useState(false);
  const [revealing, setRevealing] = useState(false);

  const round = rd.rps_round ?? 1;
  const myChoice = isCreator ? rd.rps_creator_choice : rd.rps_opponent_choice;
  const oppChoice = isCreator ? rd.rps_opponent_choice : rd.rps_creator_choice;
  const myScore = (isCreator ? rd.rps_creator_score : rd.rps_opponent_score) ?? 0;
  const oppScore = (isCreator ? rd.rps_opponent_score : rd.rps_creator_score) ?? 0;
  const history = rd.rps_history ?? [];
  const decisiveRoundsPlayed = history.filter(h => h.winner !== 'tie').length;

  // Анимация «трясущегося кулака» во время выбора
  useEffect(() => {
    if (myChoice && oppChoice && !revealing) {
      setRevealing(true);
      const t = setTimeout(() => setRevealing(false), 1100);
      return () => clearTimeout(t);
    }
  }, [myChoice, oppChoice, revealing]);

  const choose = async (choice: RPSChoice) => {
    if (busy || myChoice) return;
    setBusy(true);
    const updated = await patchResult(sb, challenge.id, (cur) => {
      const patch: Partial<ResultData> = {};
      if (isCreator) patch.rps_creator_choice = choice;
      else patch.rps_opponent_choice = choice;
      return patch;
    });

    const cc = updated.rps_creator_choice;
    const oc = updated.rps_opponent_choice;
    if (cc && oc) {
      const winRound = ((): 'creator' | 'opponent' | 'tie' => {
        if (cc === oc) return 'tie';
        if ((cc === 'rock' && oc === 'scissors')
          || (cc === 'paper' && oc === 'rock')
          || (cc === 'scissors' && oc === 'paper')) return 'creator';
        return 'opponent';
      })();
      const oldCScore = updated.rps_creator_score ?? 0;
      const oldOScore = updated.rps_opponent_score ?? 0;
      const newCScore = oldCScore + (winRound === 'creator' ? 1 : 0);
      const newOScore = oldOScore + (winRound === 'opponent' ? 1 : 0);
      const newHistory = [
        ...(updated.rps_history ?? []),
        { round: updated.rps_round ?? 1, creator: cc, opponent: oc, winner: winRound },
      ];

      setTimeout(async () => {
        const r = updated.rps_round ?? 1;
        // Победитель — первый кто набрал 2 победы (best of 3 решающих)
        const someoneWon = newCScore >= 2 || newOScore >= 2;
        // Если решающих раундов сыграно 3 и всё ещё ничейный итог — конец, ничья → возврат
        const tooManyTies = newHistory.filter(h => h.winner === 'tie').length >= 5; // safety
        if (someoneWon || tooManyTies) {
          let wins: 'creator' | 'opponent';
          if (newCScore > newOScore) wins = 'creator';
          else if (newOScore > newCScore) wins = 'opponent';
          else wins = Math.random() < 0.5 ? 'creator' : 'opponent';
          const details = `Счёт ${newCScore}:${newOScore} · ${newHistory.map(h => {
            const sym = h.creator === 'rock' ? '✊' : h.creator === 'paper' ? '✋' : '✌️';
            const sym2 = h.opponent === 'rock' ? '✊' : h.opponent === 'paper' ? '✋' : '✌️';
            return `R${h.round}: ${sym} vs ${sym2}${h.winner === 'tie' ? ' (ничья)' : ''}`;
          }).join(' · ')}`;
          await finishMatch({ sb, challenge, creator, opponent, winnerSide: wins, details, notify, addHistory, gameLabel, gameType,
            rdExtra: { ...updated, rps_creator_score: newCScore, rps_opponent_score: newOScore, rps_history: newHistory },
          });
        } else {
          // При ничьей раунд НЕ засчитывается — продолжаем тот же номер с новым выбором
          // При победе — следующий раунд
          const nextRound = winRound === 'tie' ? r : r + 1;
          await patchResult(sb, challenge.id, {
            rps_round: nextRound,
            rps_creator_choice: undefined,
            rps_opponent_choice: undefined,
            rps_creator_score: newCScore,
            rps_opponent_score: newOScore,
            rps_history: newHistory,
          });
        }
      }, 1200);
    }
    setBusy(false);
  };

  const ICON: Record<RPSChoice, string> = { rock: '✊', paper: '✋', scissors: '✌️' };
  const lastEvent = history[history.length - 1];
  const showLastTie = lastEvent?.winner === 'tie' && !myChoice;

  return (
    <div className="space-y-3">
      <div className="glass p-3 text-center">
        <div className="text-[10px] uppercase text-gold/70">Раунд {round} (до 2 побед)</div>
        <div className="text-sm font-bold mt-1">Счёт: <span className="text-emerald-400">{myScore}</span> : <span className="text-red-400">{oppScore}</span></div>
        {showLastTie && (
          <div className="mt-1 text-[10px] text-amber-300 animate-pulse">
            ⚖ Ничья — раунд переигрывается
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className={cn('glass p-4 text-center', myChoice && 'gold-border')}>
          <div className="text-[10px] uppercase text-gold/70">Вы</div>
          <div className={cn('text-6xl mt-2', revealing && 'animate-shake')} style={{ minHeight: '4rem' }}>
            {revealing ? '✊' : (myChoice ? ICON[myChoice] : '❓')}
          </div>
        </div>
        <div className={cn('glass p-4 text-center', oppChoice && 'gold-border')}>
          <div className="text-[10px] uppercase text-gold/70">{isCreator ? opponent.display_name : creator.display_name}</div>
          <div className={cn('text-6xl mt-2', revealing && 'animate-shake')} style={{ minHeight: '4rem' }}>
            {revealing ? '✊' : (myChoice && oppChoice ? ICON[oppChoice] : (oppChoice ? '🔒' : '⏳'))}
          </div>
        </div>
      </div>

      {!myChoice ? (
        <div className="glass-strong p-3">
          <div className="text-xs text-muted-foreground text-center mb-2">Выберите ход</div>
          <div className="grid grid-cols-3 gap-2">
            {(['rock','paper','scissors'] as RPSChoice[]).map(c => (
              <button key={c} onClick={() => choose(c)} disabled={busy} className="glass p-3 text-center active:scale-95 hover:gold-border">
                <div className="text-3xl">{ICON[c]}</div>
                <div className="text-[10px] mt-1 text-muted-foreground">{rpsLabel(c)}</div>
              </button>
            ))}
          </div>
        </div>
      ) : !oppChoice ? (
        <div className="glass p-3 text-center text-xs text-muted-foreground">Жду выбор соперника...</div>
      ) : revealing ? (
        <div className="glass p-3 text-center text-xs text-amber-300 animate-pulse">⚔️ Раскрытие...</div>
      ) : (
        <div className="glass p-3 text-center text-xs text-muted-foreground">Готовлю следующий раунд...</div>
      )}

      {history.length > 0 && (
        <div className="glass p-3 text-[10px]">
          <div className="text-gold/70 uppercase tracking-widest mb-1">История</div>
          {history.map((h, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-muted-foreground">R{h.round}:</span>
              <span>{ICON[h.creator]}</span>
              <span className="text-muted">vs</span>
              <span>{ICON[h.opponent]}</span>
              <span className="text-gold flex-1">
                {h.winner === 'tie'
                  ? '⚖ ничья'
                  : h.winner === 'creator'
                    ? `→ ${creator.display_name}`
                    : `→ ${opponent.display_name}`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function rpsLabel(c: RPSChoice): string {
  return c === 'rock' ? 'Камень' : c === 'paper' ? 'Бумага' : 'Ножницы';
}

// ============================================================
// BLACKJACK — нормальные карты, по очереди
// ============================================================

function BlackjackGame(p: GameProps) {
  const { challenge, rd, isCreator, creator, opponent, sb, notify, addHistory, gameLabel, gameType } = p;

  const myCards: PlayingCard[]  = (isCreator ? rd.bj_creator_cards : rd.bj_opponent_cards) || [];
  const oppCards: PlayingCard[] = (isCreator ? rd.bj_opponent_cards : rd.bj_creator_cards) || [];
  const myStand  = isCreator ? !!rd.bj_creator_stand : !!rd.bj_opponent_stand;
  const oppStand = isCreator ? !!rd.bj_opponent_stand : !!rd.bj_creator_stand;
  const turn = rd.bj_turn === 'creator' ? (isCreator ? 'me' : 'opp') : (isCreator ? 'opp' : 'me');

  const myScore  = bjHandScore(myCards);
  const oppScore = bjHandScore(oppCards);
  const myBust = myScore > 21;
  const oppBust = oppScore > 21;
  const myDone = myStand || myBust;
  const oppDone = oppStand || oppBust;

  const finishIfReady = async (next: ResultData) => {
    const cs = next.bj_creator_cards || [];
    const os = next.bj_opponent_cards || [];
    const cScore = bjHandScore(cs);
    const oScore = bjHandScore(os);
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

    const details = `${creator.display_name}: ${cScore}${cBust ? ' (перебор)' : ''} · ${opponent.display_name}: ${oScore}${oBust ? ' (перебор)' : ''}`;
    await finishMatch({ sb, challenge, creator, opponent, winnerSide, details, notify, addHistory, gameLabel, gameType, rdExtra: next });
  };

  const hit = async () => {
    if (turn !== 'me' || myStand || myBust) return;
    const updated = await patchResult(sb, challenge.id, (cur) => {
      const deck = cur.bj_deck ?? [];
      if (deck.length === 0) return {};
      const card = deck[0];
      const newDeck = deck.slice(1);
      const newCards = [...((isCreator ? cur.bj_creator_cards : cur.bj_opponent_cards) || []), card];
      const newScore = bjHandScore(newCards);
      const patch: Partial<ResultData> = { bj_deck: newDeck };
      if (isCreator) patch.bj_creator_cards = newCards;
      else patch.bj_opponent_cards = newCards;
      if (newScore >= 21) {
        if (isCreator) patch.bj_creator_stand = true;
        else patch.bj_opponent_stand = true;
      }
      const otherCards = (isCreator ? cur.bj_opponent_cards : cur.bj_creator_cards) || [];
      const otherStand = isCreator ? cur.bj_opponent_stand : cur.bj_creator_stand;
      const otherDone = otherStand || bjHandScore(otherCards) > 21;
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
      const otherDone = otherStand || bjHandScore(otherCards) > 21;
      if (!otherDone) patch.bj_turn = isCreator ? 'opponent' : 'creator';
      return patch;
    });
    await finishIfReady(updated);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <BjPanel name="Вы" cards={myCards} score={myScore} bust={myBust} stand={myStand && !myBust} active={turn === 'me'} />
        <BjPanel name={isCreator ? opponent.display_name : creator.display_name} cards={oppCards} score={oppScore} bust={oppBust} stand={oppStand && !oppBust} active={turn === 'opp'} />
      </div>

      <div className="glass-strong p-4 text-center">
        {turn === 'me' && !myDone && (
          <>
            <div className="text-sm font-bold text-gold mb-2">Ваш ход</div>
            <div className="flex gap-2">
              <button onClick={hit} className="btn-primary flex-1">+ Карта</button>
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

function BjPanel({ name, cards, score, bust, stand, active }: { name: string; cards: PlayingCard[]; score: number; bust: boolean; stand: boolean; active: boolean }) {
  return (
    <div className={cn('glass p-3 text-center', active && 'gold-border')}>
      <div className="text-[10px] uppercase text-gold/70">{name}</div>
      <div className="flex gap-1 justify-center mt-2 flex-wrap">
        {cards.map((c, i) => <PlayingCardView key={i} card={c} size="sm" />)}
      </div>
      <div className="font-mono font-bold mt-2">
        <span className={cn(bust && 'text-red-400', score === 21 && 'text-emerald-400')}>{score}</span>
      </div>
      {bust && <div className="text-[10px] text-red-400">перебор</div>}
      {score === 21 && !bust && cards.length === 2 && <div className="text-[10px] text-emerald-400">блэкджек!</div>}
      {stand && score !== 21 && <div className="text-[10px] text-muted-foreground">стоп</div>}
    </div>
  );
}

// ============================================================
// BLUFF DUEL — утверждение → угадай → ведущий проверяет
// ============================================================

function BluffGame(p: GameProps) {
  const { challenge, rd, isCreator, creator, opponent, sb, notify, addHistory, gameLabel, gameType } = p;
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const phase = rd.bluff_phase ?? 'await_statement';
  // Автор утверждения — создатель вызова. Соперник угадывает.
  const isAuthor = isCreator;

  const submitStatement = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    await patchResult(sb, challenge.id, {
      bluff_statement: text.trim(),
      bluff_phase: 'await_guess',
    });
    await notify(opponent.id, {
      type: 'challenge_received',
      title: 'Блеф-дуэль: проверьте утверждение',
      body: `${creator.display_name} сделал заявление — выберите правда или ложь`,
      link_url: `/games/play/${gameType}?challenge=${challenge.id}`,
    });
    setText('');
    setBusy(false);
  };

  const submitGuess = async (guess: 'truth' | 'lie') => {
    if (busy) return;
    setBusy(true);
    await patchResult(sb, challenge.id, {
      bluff_guess: guess,
      bluff_phase: 'await_gm',
    });
    // Уведомление ведущему
    if (sb) {
      await sb.from('notifications').insert({
        id: uid('n'),
        recipient_id: 'p-gm',
        type: 'help_request',
        title: '🎭 Блеф-дуэль ждёт вашего вердикта',
        body: `${creator.display_name} vs ${opponent.display_name}: «${rd.bluff_statement}» → ${opponent.display_name} говорит ${guess === 'truth' ? 'правда' : 'ложь'}`,
        link_url: `/games/play/${gameType}?challenge=${challenge.id}`,
        is_read: false,
      });
    }
    setBusy(false);
  };

  const submitVerdict = async (verdict: 'truth' | 'lie') => {
    if (busy) return;
    setBusy(true);
    const guess = rd.bluff_guess;
    const winnerSide: 'creator' | 'opponent' = guess === verdict ? 'opponent' : 'creator';
    const details = `Заявление: «${rd.bluff_statement}» · Соперник: ${guess === 'truth' ? 'правда' : 'ложь'} · Ведущий: ${verdict === 'truth' ? 'правда' : 'ложь'}`;
    await finishMatch({ sb, challenge, creator, opponent, winnerSide, details, notify, addHistory, gameLabel, gameType,
      rdExtra: { ...rd, bluff_verdict: verdict, bluff_phase: 'resolved' },
    });
    setBusy(false);
  };

  const { role } = useStore();
  const isGm = role === 'gm';

  return (
    <div className="space-y-3">
      {phase === 'await_statement' && isAuthor && (
        <div className="glass-strong p-4 space-y-2">
          <div className="text-sm font-bold">Ваш ход — напишите утверждение</div>
          <p className="text-xs text-muted-foreground">Скажите что-то о себе или о ситуации. Соперник попробует угадать, правда это или ложь. Ведущий вынесет финальный вердикт.</p>
          <textarea value={text} onChange={e => setText(e.target.value)} className="input-field min-h-[80px]" placeholder="Например: я ел рыбу на завтрак" />
          <button onClick={submitStatement} disabled={!text.trim() || busy} className="btn-primary w-full">Отправить</button>
        </div>
      )}
      {phase === 'await_statement' && !isAuthor && (
        <div className="glass p-4 text-center text-sm text-muted-foreground">
          Ждём, пока {creator.display_name} напишет утверждение...
        </div>
      )}

      {phase === 'await_guess' && (
        <>
          <div className="glass-strong p-4">
            <div className="text-[10px] uppercase tracking-widest text-gold/70 mb-1">Утверждение от {creator.display_name}</div>
            <p className="text-base font-medium">«{rd.bluff_statement}»</p>
          </div>
          {!isAuthor ? (
            <div className="glass-strong p-4 text-center space-y-2">
              <div className="text-sm font-bold">Что скажете?</div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => submitGuess('truth')} disabled={busy} className="btn-success">✓ Правда</button>
                <button onClick={() => submitGuess('lie')} disabled={busy} className="btn-danger">✗ Ложь</button>
              </div>
            </div>
          ) : (
            <div className="glass p-4 text-center text-sm text-muted-foreground">
              Ждём ответа {opponent.display_name}...
            </div>
          )}
        </>
      )}

      {phase === 'await_gm' && (
        <>
          <div className="glass-strong p-4">
            <div className="text-[10px] uppercase tracking-widest text-gold/70 mb-1">Утверждение</div>
            <p className="text-base font-medium">«{rd.bluff_statement}»</p>
            <div className="text-[10px] uppercase tracking-widest text-gold/70 mt-3">Ответ {opponent.display_name}</div>
            <p className="text-sm">{rd.bluff_guess === 'truth' ? '✓ Правда' : '✗ Ложь'}</p>
          </div>
          {isGm ? (
            <div className="glass-strong p-4 text-center space-y-2">
              <div className="text-sm font-bold">Вердикт ведущего</div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => submitVerdict('truth')} disabled={busy} className="btn-success">✓ Это правда</button>
                <button onClick={() => submitVerdict('lie')} disabled={busy} className="btn-danger">✗ Это ложь</button>
              </div>
            </div>
          ) : (
            <div className="glass p-4 text-center text-sm text-muted-foreground">
              ⏳ Ждём вердикта ведущего. Уведомление отправлено.
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ============================================================
// FIND PAIR — 18 пар × 36 карт, по очереди
// ============================================================

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
        const details = `${creator.display_name}: ${newCScore} пар · ${opponent.display_name}: ${newOScore} пар`;
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

  // 18 эмодзи для пар
  const PAIR_EMOJIS = ['🍒','🍋','🍊','💎','7️⃣','⭐','🍀','🔔','🍇','🍉','🍓','🍑','🌟','🎴','♠️','♥️','♣️','♦️'];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-around glass p-2 text-xs">
        <div>Вы: <span className="text-emerald-400 font-bold">{myScore}</span></div>
        <div className="text-muted">vs</div>
        <div>{isCreator ? opponent.display_name : creator.display_name}: <span className="text-red-400 font-bold">{oppScore}</span></div>
      </div>

      <div className="text-center text-[10px] uppercase tracking-widest text-gold/70">
        {turn === 'me' ? 'Ваш ход — откройте 2 карты' : 'Ход соперника...'}
      </div>

      <div className="grid grid-cols-6 gap-1.5">
        {cards.map((card, i) => {
          const open = flipped.includes(i) || card.collected_by !== null;
          const collected = card.collected_by !== null;
          return (
            <button
              key={card.id}
              onClick={() => flip(i)}
              disabled={turn !== 'me' || open || isLocked || flipped.length >= 2}
              className={cn(
                'aspect-[2/3] rounded-md border text-xl flex items-center justify-center transition-all active:scale-95',
                open ? 'bg-gold/15 border-gold/50' : 'bg-gradient-to-br from-fuchsia-900 to-purple-950 border-gold/30',
                collected && 'opacity-30',
              )}
            >
              {open ? PAIR_EMOJIS[card.value % PAIR_EMOJIS.length] : '✦'}
            </button>
          );
        })}
      </div>

      <div className="text-center text-[10px] text-muted-foreground">
        {isLocked && '🤔 Запоминаем...'}
        {allDone && '🏆 Подвожу итог...'}
      </div>
    </div>
  );
}

// ============================================================
// FIND JOKER — 11 карт, по очереди тянут
// ============================================================

function FindJokerGame(p: GameProps) {
  const { challenge, rd, isCreator, creator, opponent, sb, notify, addHistory, gameLabel, gameType } = p;
  const deck = rd.joker_deck || [];
  const drawn = rd.joker_drawn || [];
  const turn = rd.joker_turn === 'creator' ? (isCreator ? 'me' : 'opp') : (isCreator ? 'opp' : 'me');
  const [busy, setBusy] = useState(false);

  const draw = async () => {
    if (turn !== 'me' || busy || deck.length === 0) return;
    setBusy(true);
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

    if (card.joker) {
      // Кто вытянул джокера — проиграл.
      const winnerSide: 'creator' | 'opponent' = isCreator ? 'opponent' : 'creator';
      const details = `${isCreator ? creator.display_name : opponent.display_name} вытянул(а) джокера 🃏 на карте #${idx + 1}`;
      await finishMatch({ sb, challenge, creator, opponent, winnerSide, details, notify, addHistory, gameLabel, gameType, rdExtra: updated });
    }
    setBusy(false);
  };

  return (
    <div className="space-y-3">
      <div className="glass p-3">
        <div className="text-[10px] uppercase text-gold/70 mb-2">Сброс</div>
        {drawn.length === 0 ? (
          <div className="text-xs text-muted-foreground">Карты ещё никто не тянул</div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {drawn.map(d => (
              <div key={d.idx} className="flex flex-col items-center gap-0.5">
                <PlayingCardView card={d.card} size="sm" />
                <div className="text-[8px] text-muted truncate max-w-[60px]">{d.by === 'creator' ? creator.display_name : opponent.display_name}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="glass-strong p-4 text-center space-y-2">
        <div className="text-xs text-muted-foreground">В колоде осталось: <b>{deck.length}</b> карт</div>
        <div className="flex justify-center gap-1">
          {Array.from({ length: Math.min(deck.length, 11) }).map((_, i) => (
            <PlayingCardView key={i} faceDown size="sm" className={cn(turn === 'me' && i === 0 && 'animate-pulse', 'translate-y-0', i > 0 ? `-ml-6` : '')} />
          ))}
        </div>
        {turn === 'me' && deck.length > 0 && (
          <button onClick={draw} disabled={busy} className="btn-primary w-full">
            🎴 Тянуть верхнюю карту
          </button>
        )}
        {turn === 'opp' && deck.length > 0 && (
          <div className="text-sm text-muted-foreground py-2">Ход соперника...</div>
        )}
        {deck.length === 0 && (
          <div className="text-sm text-muted-foreground py-2">Колода пуста, подвожу итог...</div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// DEMO MODE — для одиночной тренировки
// ============================================================

function DemoMode({ type }: { type: MiniGameType }) {
  const { currentUser, addHistory } = useStore();
  const sb = getSupabase();
  const [stake] = useState(10000);
  const [rolling, setRolling] = useState(false);
  const [result, setResult] = useState<{ won: boolean; details: string } | null>(null);
  const info = LABELS[type];

  const play = async () => {
    if (!currentUser || !sb || rolling) return;
    if (currentUser.balance < stake) { alert('Недостаточно средств для тренировки'); return; }
    setRolling(true);
    setTimeout(async () => {
      const won = Math.random() > 0.5;
      const details = won ? 'Удача на вашей стороне' : 'В этот раз не повезло';
      setResult({ won, details });
      setRolling(false);
      // Тренировочные ставки идут против Фонда Тогами (без долгов).
      if (won) {
        await payoutFromTreasury(currentUser.id, stake, `${info.label} (тренировка)`, '/games');
      } else {
        await chargeToTreasury(currentUser.id, stake, `${info.label} (тренировка)`, '/games', { noDebt: true });
      }
      await sb.from('participants').update({
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

// ============================================================
// COIN FLIP — оба выбирают сторону, монетка подбрасывается красиво в 3D
// Если выбрали одинаково — раунд переигрывается.
// ============================================================

function CoinFlipGame(p: GameProps) {
  const { challenge, rd, isCreator, creator, opponent, sb, notify, addHistory, gameLabel, gameType } = p;
  const [busy, setBusy] = useState(false);
  const [flipping, setFlipping] = useState(false);
  const [showResult, setShowResult] = useState<'heads' | 'tails' | null>(null);

  const myPick  = isCreator ? rd.coin_creator_pick  : rd.coin_opponent_pick;
  const oppPick = isCreator ? rd.coin_opponent_pick : rd.coin_creator_pick;
  const result = rd.coin_result ?? null;

  // Когда result обновился из БД — оба клиента запускают анимацию у себя
  useEffect(() => {
    if (result && !showResult) {
      setFlipping(true);
      setShowResult(null);
      const t = setTimeout(() => {
        setShowResult(result);
        setFlipping(false);
      }, 1900);
      return () => clearTimeout(t);
    }
  }, [result, showResult]);

  const choose = async (pick: 'heads' | 'tails') => {
    if (busy || myPick) return;
    setBusy(true);
    const updated = await patchResult(sb, challenge.id, isCreator ? { coin_creator_pick: pick } : { coin_opponent_pick: pick });
    const cp = updated.coin_creator_pick;
    const op = updated.coin_opponent_pick;
    if (cp && op) {
      // Если выбрали одинаково — переигровка.
      if (cp === op) {
        setTimeout(async () => {
          await patchResult(sb, challenge.id, {
            coin_creator_pick: undefined,
            coin_opponent_pick: undefined,
          });
        }, 1500);
        setBusy(false);
        return;
      }
      // Иначе — подбрасываем
      const resCoin: 'heads' | 'tails' = Math.random() < 0.5 ? 'heads' : 'tails';
      // Записываем результат в БД — оба клиента увидят и запустят анимацию через useEffect
      await patchResult(sb, challenge.id, { coin_result: resCoin });
      // Через 2 секунды (после анимации) — финиш
      setTimeout(async () => {
        const cWin = cp === resCoin;
        const winnerSide: 'creator' | 'opponent' = cWin ? 'creator' : 'opponent';
        const details = `Выпало ${resCoin === 'heads' ? '👑 Орёл' : '✦ Решка'} · ${creator.display_name}: ${cp === 'heads' ? 'орёл' : 'решка'} · ${opponent.display_name}: ${op === 'heads' ? 'орёл' : 'решка'}`;
        await finishMatch({ sb, challenge, creator, opponent, winnerSide, details, notify, addHistory, gameLabel, gameType,
          rdExtra: { coin_result: resCoin } });
      }, 2100);
    }
    setBusy(false);
  };

  const sameChoice = !!myPick && !!oppPick && myPick === oppPick;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className={cn('glass p-3 text-center', myPick && 'gold-border')}>
          <div className="text-[10px] uppercase text-gold/70">Вы</div>
          {myPick ? (
            <div className="mt-2">
              <Coin3D side={myPick} size={64} />
              <div className="text-[10px] mt-1"><CoinSideLabel side={myPick} /></div>
            </div>
          ) : (
            <div className="text-4xl mt-2">❓</div>
          )}
        </div>
        <div className={cn('glass p-3 text-center', oppPick && 'gold-border')}>
          <div className="text-[10px] uppercase text-gold/70">{isCreator ? opponent.display_name : creator.display_name}</div>
          {oppPick && myPick ? (
            <div className="mt-2">
              <Coin3D side={oppPick} size={64} />
              <div className="text-[10px] mt-1"><CoinSideLabel side={oppPick} /></div>
            </div>
          ) : (
            <div className="text-4xl mt-2">{oppPick ? '🔒' : '⏳'}</div>
          )}
        </div>
      </div>

      <div className="glass-strong p-4 text-center"
        style={{ background: 'radial-gradient(circle at center top, rgba(212,175,55,0.18) 0%, transparent 70%)' }}>
        {sameChoice && !result ? (
          <div className="space-y-2">
            <div className="text-amber-300 font-bold">⚖ Оба выбрали одну сторону</div>
            <div className="text-xs text-muted-foreground">Раунд переигрывается, выбирайте заново</div>
          </div>
        ) : result || flipping ? (
          <div className="space-y-3">
            <div className="text-[10px] uppercase tracking-widest text-gold/70">
              {flipping ? '🪙 Монетка в воздухе...' : 'Выпало'}
            </div>
            <div className="flex justify-center py-4" style={{ minHeight: 180 }}>
              <Coin3D side={showResult ?? result} flipping={flipping} size={140} />
            </div>
            {!flipping && showResult && (
              <div className="font-heading text-2xl font-bold text-gradient-gold animate-fade-in">
                <CoinSideLabel side={showResult} />
              </div>
            )}
          </div>
        ) : !myPick ? (
          <>
            <div className="text-sm font-bold mb-3">Выберите сторону монетки</div>
            <div className="flex justify-center gap-4 mb-3">
              <button onClick={() => choose('heads')} disabled={busy}
                className="flex flex-col items-center gap-1 active:scale-95 transition">
                <Coin3D side="heads" size={88} />
                <span className="text-xs font-bold text-gold">👑 Орёл</span>
              </button>
              <button onClick={() => choose('tails')} disabled={busy}
                className="flex flex-col items-center gap-1 active:scale-95 transition">
                <Coin3D side="tails" size={88} />
                <span className="text-xs font-bold text-rose-300">✦ Решка</span>
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <Coin3D side={myPick} size={88} className="animate-coin-shimmer" />
            <div className="text-sm text-muted-foreground">Ставка принята. Жду соперника...</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// PARITY — оба тайно загадывают число 1..10, сумма чёт/нечёт
// ============================================================

function ParityGame(p: GameProps) {
  const { challenge, rd, isCreator, creator, opponent, sb, notify, addHistory, gameLabel, gameType } = p;
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<'pick' | 'guess' | 'reveal'>('pick');

  const myNum  = isCreator ? rd.parity_creator_num  : rd.parity_opponent_num;
  const oppNum = isCreator ? rd.parity_opponent_num : rd.parity_creator_num;
  const myPick = isCreator ? rd.parity_creator_pick : rd.parity_opponent_pick;
  const oppPick = isCreator ? rd.parity_opponent_pick : rd.parity_creator_pick;

  const submitNum = async (n: number) => {
    if (busy || myNum) return;
    setBusy(true);
    await patchResult(sb, challenge.id, isCreator ? { parity_creator_num: n } : { parity_opponent_num: n });
    setBusy(false);
  };

  const submitPick = async (pick: 'even' | 'odd') => {
    if (busy || myPick) return;
    setBusy(true);
    const updated = await patchResult(sb, challenge.id, isCreator ? { parity_creator_pick: pick } : { parity_opponent_pick: pick });
    if (updated.parity_creator_pick && updated.parity_opponent_pick && updated.parity_creator_num && updated.parity_opponent_num) {
      // Раскрытие
      const sum = updated.parity_creator_num + updated.parity_opponent_num;
      const isEven = sum % 2 === 0;
      const cWin = (updated.parity_creator_pick === 'even') === isEven;
      const oWin = (updated.parity_opponent_pick === 'even') === isEven;
      let winnerSide: 'creator' | 'opponent';
      if (cWin && !oWin) winnerSide = 'creator';
      else if (oWin && !cWin) winnerSide = 'opponent';
      else winnerSide = Math.random() > 0.5 ? 'creator' : 'opponent';
      const details = `Сумма ${updated.parity_creator_num} + ${updated.parity_opponent_num} = ${sum} (${isEven ? 'чётное' : 'нечётное'})`;
      await finishMatch({ sb, challenge, creator, opponent, winnerSide, details, notify, addHistory, gameLabel, gameType, rdExtra: updated });
    }
    setBusy(false);
  };

  const bothNumsSet = !!(rd.parity_creator_num && rd.parity_opponent_num);

  return (
    <div className="space-y-3">
      <div className="glass p-3 text-center">
        <div className="text-[10px] uppercase text-gold/70">Правила</div>
        <div className="text-xs mt-1">Каждый загадывает число 1–10. Затем оба угадывают: сумма чётная или нечётная.</div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className={cn('glass p-3 text-center', myNum && 'gold-border')}>
          <div className="text-[10px] uppercase text-gold/70">Вы</div>
          <div className="text-2xl font-bold mt-2">{myNum ?? '?'}</div>
          <div className="text-[10px] mt-1">{myPick ? (myPick === 'even' ? 'Чёт' : 'Нечёт') : '—'}</div>
        </div>
        <div className={cn('glass p-3 text-center', oppNum && 'gold-border')}>
          <div className="text-[10px] uppercase text-gold/70">{isCreator ? opponent.display_name : creator.display_name}</div>
          <div className="text-2xl font-bold mt-2">{(oppNum && myPick && oppPick) ? oppNum : oppNum ? '🔒' : '?'}</div>
          <div className="text-[10px] mt-1">{oppPick && myPick ? (oppPick === 'even' ? 'Чёт' : 'Нечёт') : '...'}</div>
        </div>
      </div>

      {!myNum && (
        <div className="glass-strong p-3">
          <div className="text-sm font-bold mb-2 text-center">Загадайте число 1–10</div>
          <div className="grid grid-cols-5 gap-1.5">
            {[1,2,3,4,5,6,7,8,9,10].map(n => (
              <button key={n} onClick={() => submitNum(n)} disabled={busy} className="glass p-3 text-center font-bold active:scale-95 hover:gold-border">
                {n}
              </button>
            ))}
          </div>
        </div>
      )}

      {myNum && !myPick && bothNumsSet && (
        <div className="glass-strong p-3 text-center">
          <div className="text-sm font-bold mb-2">Угадайте: сумма чётная или нечётная?</div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => submitPick('even')} disabled={busy} className="btn-primary">⚖ Чёт</button>
            <button onClick={() => submitPick('odd')} disabled={busy} className="btn-secondary">⚡ Нечёт</button>
          </div>
        </div>
      )}

      {myNum && !bothNumsSet && (
        <div className="glass p-3 text-center text-xs text-muted-foreground">Ждём пока соперник загадает число...</div>
      )}

      {myPick && !oppPick && (
        <div className="glass p-3 text-center text-xs text-muted-foreground">Ждём ответ соперника...</div>
      )}
    </div>
  );
}
