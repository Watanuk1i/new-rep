'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useStore } from '@/lib/store/StoreProvider';
import { Yen } from '@/components/ui/Yen';
import { cn } from '@/lib/utils';
import { getSupabase } from '@/lib/supabase/client';
import type { MiniGameType, GameChallenge } from '@/lib/store/types';

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

export default function PlayPage() {
  return (
    <Suspense fallback={<div className="px-4 py-12 text-center text-muted-foreground">Загрузка...</div>}>
      <PlayInner />
    </Suspense>
  );
}

// Чистая логика — определяет результат игры детерминированно (один раз).
// won = true означает «opponent выиграл»; false — «creator выиграл».
function rollGame(type: MiniGameType): { opponentWon: boolean; details: string } {
  switch (type) {
    case 'dice': {
      const a = (Math.floor(Math.random() * 6) + 1) + (Math.floor(Math.random() * 6) + 1);
      const b = (Math.floor(Math.random() * 6) + 1) + (Math.floor(Math.random() * 6) + 1);
      const opponentWon = a > b || (a === b && Math.random() > 0.5);
      return { opponentWon, details: `Соперник: ${a} — Создатель: ${b}` };
    }
    case 'high_card': {
      const a = Math.floor(Math.random() * 13) + 2;
      const b = Math.floor(Math.random() * 13) + 2;
      const opponentWon = a > b || (a === b && Math.random() > 0.5);
      return { opponentWon, details: `Карта соперника: ${a} — Карта создателя: ${b}` };
    }
    case 'roulette': {
      const num = Math.floor(Math.random() * 37);
      const opponentWon = num % 2 === 1;
      return { opponentWon, details: `Выпало: ${num} (${num === 0 ? 'зеро' : num % 2 === 0 ? 'чёт — создатель' : 'нечёт — соперник'})` };
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
      const opponentWon = triple || pair;
      return { opponentWon, details: `${r[0]} ${r[1]} ${r[2]}${triple ? ' — джекпот!' : pair ? ' — пара' : ''}` };
    }
    case 'blackjack': {
      const opp = Math.floor(Math.random() * 10) + 14; // 14-23
      const cre = Math.floor(Math.random() * 10) + 14;
      const oppOk = opp <= 21;
      const creOk = cre <= 21;
      let opponentWon: boolean;
      if (oppOk && !creOk) opponentWon = true;
      else if (!oppOk && creOk) opponentWon = false;
      else if (!oppOk && !creOk) opponentWon = false; // оба перебор — побеждает создатель (дилер)
      else opponentWon = opp > cre || (opp === cre && Math.random() > 0.5);
      return { opponentWon, details: `Соперник: ${opp}${!oppOk ? ' (перебор)' : ''} — Создатель: ${cre}${!creOk ? ' (перебор)' : ''}` };
    }
    case 'find_pair': {
      // Колода 8 карт (4 пары). Эмулируем — у кого больше пар нашёл.
      const oppPairs = Math.floor(Math.random() * 4) + 1;  // 1-4
      const crePairs = 4 - oppPairs;
      const opponentWon = oppPairs > crePairs;
      return {
        opponentWon,
        details: `Пар у соперника: ${oppPairs} — у создателя: ${crePairs}`,
      };
    }
    case 'find_joker': {
      // 5 карт, 1 джокер. Кто вытянул — проиграл.
      const cards = ['🂠','🂠','🂠','🂠','🃏'];
      // shuffle
      for (let i = cards.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [cards[i], cards[j]] = [cards[j], cards[i]];
      }
      // По очереди тянут: opponent, creator, opponent, creator, ...
      // Проигрывает кто вытянул джокера. Нам важно — кто.
      const jokerIdx = cards.indexOf('🃏');
      const opponentLost = jokerIdx % 2 === 0; // 0 — opp, 1 — creator
      return {
        opponentWon: !opponentLost,
        details: opponentLost
          ? `Соперник вытянул джокера на ходу #${jokerIdx + 1} 🃏`
          : `Создатель вытянул джокера на ходу #${jokerIdx + 1} 🃏`,
      };
    }
    case 'bluff_duel':
    case 'truth_or_bet':
    default: {
      const opponentWon = Math.random() > 0.5;
      return { opponentWon, details: opponentWon ? 'Соперник убедил' : 'Создатель раскусил блеф' };
    }
  }
}

function PlayInner() {
  const params = useParams();
  const sp = useSearchParams();
  const type = params.type as MiniGameType;
  const challengeId = sp.get('challenge');
  const { state, currentUser, notify, addHistory } = useStore();
  const [rolling, setRolling] = useState(false);
  const [localResult, setLocalResult] = useState<{ won: boolean; details: string } | null>(null);
  const sb = getSupabase();
  const info = LABELS[type] || { label: type, icon: '?' };

  // Берём текущее состояние challenge из стора (Realtime обновляет — поэтому creator увидит результат сам)
  const challenge: GameChallenge | undefined = challengeId
    ? state.challenges.find(c => c.id === challengeId)
    : undefined;

  const stake = challenge?.stake_amount || 10000;
  const opponentId = challenge ? (challenge.creator_id === currentUser?.id ? challenge.opponent_id : challenge.creator_id) : null;
  const opponent = opponentId ? state.participants.find(p => p.id === opponentId) : null;

  // Роли в этом конкретном вызове
  const isCreator = !!challenge && challenge.creator_id === currentUser?.id;
  const isOpponent = !!challenge && challenge.opponent_id === currentUser?.id;

  // Когда challenge уходит в finished через Realtime — создатель видит итог
  const finishedFor = (() => {
    if (!challenge || challenge.status !== 'finished' || !currentUser) return null;
    const won = challenge.winner_id === currentUser.id;
    const details = challenge.result_data?.details || '';
    return { won, details };
  })();

  if (!LABELS[type]) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="text-red-400 font-bold">Игра не найдена</p>
        <Link href="/games" className="btn-secondary mt-4 inline-flex">← К играм</Link>
      </div>
    );
  }

  // Демо-режим (без challenge) — играешь против рандома, как раньше
  const playDemo = async () => {
    if (!currentUser || !sb) return;
    setRolling(true);
    setTimeout(async () => {
      const { opponentWon, details } = rollGame(type);
      // в демо «opponent» это рандом; «we won» = !opponentWon
      const won = !opponentWon;
      setLocalResult({ won, details });
      setRolling(false);
      const newBal = won ? currentUser.balance + stake : Math.max(0, currentUser.balance - stake);
      const wins = won ? currentUser.wins + 1 : currentUser.wins;
      const losses = won ? currentUser.losses : currentUser.losses + 1;
      await sb.from('participants').update({ balance: newBal, wins, losses }).eq('id', currentUser.id);
      await addHistory(currentUser.id, won ? 'game_win' : 'game_loss',
        `${info.label} (тренировка)`, won ? stake : -stake, '/games');
    }, 1500);
  };

  // Реальный матч — opponent катит за обоих, результат сохраняется в challenge
  const playMatch = async () => {
    if (!currentUser || !sb || !challenge || !opponent) return;
    if (challenge.status !== 'accepted') return;
    if (!isOpponent) return; // защита — катить может только тот кто принял

    // Финальная проверка балансов (мог измениться)
    if (currentUser.balance < stake) {
      alert('У вас не хватает баланса для этой ставки.');
      return;
    }
    if (opponent.balance < stake) {
      alert('У соперника не хватает баланса. Игра отменена.');
      await sb.from('challenges').update({ status: 'cancelled' }).eq('id', challenge.id);
      return;
    }

    setRolling(true);
    setTimeout(async () => {
      const { opponentWon, details } = rollGame(type);
      // currentUser is the opponent; "won" from our perspective:
      const won = opponentWon;
      setLocalResult({ won, details });
      setRolling(false);

      // Расчёты
      const opponentNew = won ? currentUser.balance + stake : currentUser.balance - stake;
      const creatorNew  = won ? opponent.balance     - stake : opponent.balance     + stake;
      const winnerId = won ? currentUser.id : opponent.id;

      await sb.from('participants').update({
        balance: Math.max(0, opponentNew),
        wins:    won ? currentUser.wins + 1 : currentUser.wins,
        losses:  won ? currentUser.losses    : currentUser.losses + 1,
      }).eq('id', currentUser.id);

      await sb.from('participants').update({
        balance: Math.max(0, creatorNew),
        wins:    won ? opponent.wins        : opponent.wins + 1,
        losses:  won ? opponent.losses + 1  : opponent.losses,
      }).eq('id', opponent.id);

      await addHistory(currentUser.id, won ? 'game_win' : 'game_loss',
        `${info.label} vs ${opponent.display_name}`, won ? stake : -stake, '/games');
      await addHistory(opponent.id, won ? 'game_loss' : 'game_win',
        `${info.label} vs ${currentUser.display_name}`, won ? -stake : stake, '/games');

      // Сохраняем результат в challenge — Realtime сам уведомит creator-а
      await sb.from('challenges').update({
        status: 'finished',
        winner_id: winnerId,
        result_data: { details, opponentWon: won },
      }).eq('id', challenge.id);

      // Уведомление создателю — соперник сыграл, вот итог
      await notify(opponent.id, {
        type: 'game_result',
        title: won ? 'Вы проиграли игру' : 'Вы выиграли игру!',
        body: `${info.label} vs ${currentUser.display_name}: ${won ? '-' : '+'}${stake.toLocaleString('ru-RU')} ейн`,
        link_url: `/games/play/${type}?challenge=${challenge.id}`,
      });
    }, 1500);
  };

  const header = (
    <div className="text-center">
      <div className="text-5xl mb-2">{info.icon}</div>
      <h1 className="font-heading text-xl font-bold">{info.label}</h1>
      {opponent && <p className="text-xs text-muted-foreground mt-1">vs {opponent.display_name}</p>}
      <div className="mt-2"><Yen amount={stake} className="text-lg text-gold" iconClass="w-5 h-5" /></div>
    </div>
  );

  // Не залогинен — иди логиниться
  if (!currentUser) {
    return (
      <div className="px-3 sm:px-4 py-4 max-w-md mx-auto space-y-4 animate-fade-in">
        {header}
        <div className="glass-strong p-6 text-center">
          <p className="text-sm text-muted-foreground mb-3">Войдите, чтобы играть.</p>
          <Link href="/login" className="btn-primary inline-flex">Войти</Link>
        </div>
      </div>
    );
  }

  // Состояние challenge определяет UI
  const status = challenge?.status;

  // ===== ВЕТКА A: Игра без challenge — демо/тренировка =====
  if (!challenge) {
    return (
      <div className="px-3 sm:px-4 py-4 max-w-md mx-auto space-y-4 animate-fade-in">
        {header}
        {!localResult ? (
          <div className="glass-strong p-6 text-center space-y-4">
            {rolling ? (
              <div className="py-8">
                <div className="text-5xl animate-pulse">{info.icon}</div>
                <p className="text-sm text-muted-foreground mt-3">Играем...</p>
              </div>
            ) : (
              <>
                <div className="text-[10px] uppercase tracking-widest text-amber-300/70">Тренировочный режим</div>
                <p className="text-sm text-muted-foreground">Игра против случайности — ставка списывается с твоего баланса.</p>
                <button onClick={playDemo} className="btn-primary w-full text-base">
                  {info.icon} Играть!
                </button>
              </>
            )}
          </div>
        ) : (
          <ResultCard won={localResult.won} details={localResult.details} stake={stake} />
        )}
      </div>
    );
  }

  // ===== ВЕТКА B: pending — ждём принятия =====
  if (status === 'pending') {
    return (
      <div className="px-3 sm:px-4 py-4 max-w-md mx-auto space-y-4 animate-fade-in">
        {header}
        <div className="glass-strong p-6 text-center space-y-2">
          <div className="text-4xl animate-pulse">⏳</div>
          <p className="text-sm">
            {isCreator
              ? 'Вызов отправлен. Ждём, когда соперник примет.'
              : 'Этот вызов ещё в ожидании. Чтобы начать — прими его на странице вызовов.'}
          </p>
          <Link href="/games" className="btn-secondary inline-flex mt-3">К списку вызовов</Link>
        </div>
      </div>
    );
  }

  // ===== ВЕТКА C: cancelled =====
  if (status === 'cancelled') {
    return (
      <div className="px-3 sm:px-4 py-4 max-w-md mx-auto space-y-4 animate-fade-in">
        {header}
        <div className="glass-strong p-6 text-center crimson-border">
          <div className="text-4xl">✕</div>
          <p className="text-sm font-bold mt-2">Вызов отменён</p>
          <Link href="/games" className="btn-secondary inline-flex mt-3">К играм</Link>
        </div>
      </div>
    );
  }

  // ===== ВЕТКА D: finished — показываем итог =====
  if (status === 'finished' && finishedFor) {
    return (
      <div className="px-3 sm:px-4 py-4 max-w-md mx-auto space-y-4 animate-fade-in">
        {header}
        <ResultCard won={finishedFor.won} details={finishedFor.details} stake={stake} />
      </div>
    );
  }

  // ===== ВЕТКА E: accepted — играем =====
  if (status === 'accepted') {
    // Если уже катнули локально — показываем (Realtime финализирует через challenge.status='finished',
    // но локально мы тоже сразу видим)
    if (localResult) {
      return (
        <div className="px-3 sm:px-4 py-4 max-w-md mx-auto space-y-4 animate-fade-in">
          {header}
          <ResultCard won={localResult.won} details={localResult.details} stake={stake} />
        </div>
      );
    }

    if (rolling) {
      return (
        <div className="px-3 sm:px-4 py-4 max-w-md mx-auto space-y-4 animate-fade-in">
          {header}
          <div className="glass-strong p-6 text-center">
            <div className="text-5xl animate-pulse">{info.icon}</div>
            <p className="text-sm text-muted-foreground mt-3">Играем...</p>
          </div>
        </div>
      );
    }

    if (isOpponent) {
      // тот кто принял — катит игру
      return (
        <div className="px-3 sm:px-4 py-4 max-w-md mx-auto space-y-4 animate-fade-in">
          {header}
          <div className="glass-strong p-6 text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              Вы приняли вызов. Нажми «Играть!» — и за обоих катятся кости/карты.
              Создатель увидит результат автоматически.
            </p>
            <button onClick={playMatch} className="btn-primary w-full text-base">
              {info.icon} Играть!
            </button>
          </div>
        </div>
      );
    }

    if (isCreator) {
      // ждём соперника — Realtime обновит challenge когда тот сыграет
      return (
        <div className="px-3 sm:px-4 py-4 max-w-md mx-auto space-y-4 animate-fade-in">
          {header}
          <div className="glass-strong p-6 text-center">
            <div className="text-5xl animate-pulse">{info.icon}</div>
            <p className="text-sm mt-3">
              Соперник ({opponent?.display_name}) принял вызов и сейчас играет.
              Результат появится здесь автоматически.
            </p>
            <p className="text-[10px] text-muted-foreground mt-2">
              (если ничего не происходит — обнови страницу или включи Realtime в Supabase Database → Replication)
            </p>
          </div>
        </div>
      );
    }

    // Кто-то посторонний открыл ссылку
    return (
      <div className="px-3 sm:px-4 py-4 max-w-md mx-auto space-y-4 animate-fade-in">
        {header}
        <div className="glass-strong p-6 text-center">
          <p className="text-sm">Этот матч между другими игроками. Подсмотреть результат можно после его завершения.</p>
          <Link href="/games" className="btn-secondary inline-flex mt-3">К играм</Link>
        </div>
      </div>
    );
  }

  // Fallback
  return (
    <div className="px-3 sm:px-4 py-4 max-w-md mx-auto space-y-4 animate-fade-in">
      {header}
      <div className="glass p-4 text-center text-xs text-muted-foreground">
        Неизвестное состояние: {status}
      </div>
    </div>
  );
}

function ResultCard({ won, details, stake }: { won: boolean; details: string; stake: number }) {
  return (
    <div className={cn('glass-strong p-6 text-center space-y-3', won ? 'gold-border' : 'crimson-border')}>
      <div className="text-5xl">{won ? '🏆' : '💀'}</div>
      <h2 className={cn('font-heading text-2xl font-bold', won ? 'text-gold' : 'text-red-400')}>
        {won ? 'Победа!' : 'Проигрыш'}
      </h2>
      <p className="text-sm text-muted-foreground">{details}</p>
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
