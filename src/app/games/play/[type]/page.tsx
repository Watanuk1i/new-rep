'use client';

import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useStore } from '@/lib/store/StoreProvider';
import { Yen } from '@/components/ui/Yen';
import { cn, uid } from '@/lib/utils';
import type { MiniGameType } from '@/lib/store/types';
import { Suspense } from 'react';

export default function PlayPage() {
  return <Suspense fallback={<div className="px-4 py-12 text-center text-muted-foreground">Загрузка...</div>}><PlayInner /></Suspense>;
}

function PlayInner() {
  const params = useParams();
  const sp = useSearchParams();
  const type = params.type as MiniGameType;
  const challengeId = sp.get('challenge');
  const { state, currentUser, dispatch } = useStore();

  const [result, setResult] = useState<{ won: boolean; details: string } | null>(null);
  const [rolling, setRolling] = useState(false);

  const challenge = challengeId ? state.challenges.find(c => c.id === challengeId) : null;
  const stake = challenge?.stake_amount || 10000;
  const opponentId = challenge ? (challenge.creator_id === currentUser?.id ? challenge.opponent_id : challenge.creator_id) : null;
  const opponent = opponentId ? state.participants.find(p => p.id === opponentId) : null;

  const LABELS: Record<string, { label: string; icon: string }> = {
    dice: { label: 'Кости', icon: '🎲' },
    high_card: { label: 'Старшая карта', icon: '🃏' },
    roulette: { label: 'Рулетка', icon: '🎰' },
    slots: { label: 'Слоты', icon: '🍒' },
    blackjack: { label: '21 очко', icon: '🂡' },
    bluff_duel: { label: 'Блеф-дуэль', icon: '🎭' },
    truth_or_bet: { label: 'Правда или ставка', icon: '❓' },
  };

  const info = LABELS[type] || { label: type, icon: '?' };

  const play = () => {
    if (!currentUser) return;
    setRolling(true);
    setTimeout(() => {
      // Серверная генерация результата (на клиенте для демо)
      let won: boolean;
      let details: string;

      switch (type) {
        case 'dice': {
          const p1 = Math.floor(Math.random() * 6) + 1 + Math.floor(Math.random() * 6) + 1;
          const p2 = Math.floor(Math.random() * 6) + 1 + Math.floor(Math.random() * 6) + 1;
          won = p1 > p2;
          if (p1 === p2) won = Math.random() > 0.5;
          details = `Вы: ${p1} — Соперник: ${p2}`;
          break;
        }
        case 'high_card': {
          const v1 = Math.floor(Math.random() * 13) + 2;
          const v2 = Math.floor(Math.random() * 13) + 2;
          won = v1 > v2;
          if (v1 === v2) won = Math.random() > 0.5;
          details = `Ваша карта: ${v1} — Соперник: ${v2}`;
          break;
        }
        case 'roulette': {
          const num = Math.floor(Math.random() * 37);
          won = num % 2 === 1; // для демо: нечётное = выигрыш
          details = `Выпало: ${num} (${num === 0 ? 'зеро' : num % 2 === 0 ? 'чёт' : 'нечёт'})`;
          break;
        }
        case 'slots': {
          const syms = ['🍒','🍋','🍊','💎','7️⃣','⭐'];
          const r = [syms[Math.floor(Math.random()*syms.length)], syms[Math.floor(Math.random()*syms.length)], syms[Math.floor(Math.random()*syms.length)]];
          won = r[0] === r[1] && r[1] === r[2];
          if (!won) won = r[0] === r[1] || r[1] === r[2];
          details = `${r[0]} ${r[1]} ${r[2]}`;
          break;
        }
        case 'blackjack': {
          const yours = Math.floor(Math.random() * 10) + 15;
          const dealer = Math.floor(Math.random() * 10) + 14;
          won = yours <= 21 && (dealer > 21 || yours > dealer);
          details = `Вы: ${yours} — Дилер: ${dealer}${dealer > 21 ? ' (перебор!)' : ''}`;
          break;
        }
        default:
          won = Math.random() > 0.5;
          details = won ? 'Вы убедили соперника' : 'Соперник раскусил блеф';
      }

      setResult({ won, details });
      setRolling(false);

      // Обновляем challenge если он есть
      if (challenge && currentUser) {
        const winnerId = won ? currentUser.id : opponentId;
        dispatch({ type: 'finish_challenge', id: challenge.id, winner_id: winnerId || null, result_data: { details } });
      } else if (currentUser) {
        // Быстрая игра без вызова — просто обновляем баланс
        if (won) {
          dispatch({ type: 'update_participant', id: currentUser.id, patch: { balance: currentUser.balance + stake, wins: currentUser.wins + 1 } });
        } else {
          dispatch({ type: 'update_participant', id: currentUser.id, patch: { balance: Math.max(0, currentUser.balance - stake), losses: currentUser.losses + 1 } });
        }
      }
    }, 1500);
  };

  if (!LABELS[type]) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="text-red-400 font-bold">Игра не найдена</p>
        <Link href="/games" className="btn-secondary mt-4 inline-flex">← К играм</Link>
      </div>
    );
  }

  return (
    <div className="px-3 sm:px-4 py-4 max-w-md mx-auto space-y-4 animate-fade-in">
      {/* Header */}
      <div className="text-center">
        <div className="text-5xl mb-2">{info.icon}</div>
        <h1 className="font-heading text-xl font-bold">{info.label}</h1>
        {opponent && <p className="text-xs text-muted-foreground mt-1">vs {opponent.display_name}</p>}
        <div className="mt-2"><Yen amount={stake} className="text-lg text-gold" iconClass="w-5 h-5" /></div>
      </div>

      {/* Game area */}
      {!result ? (
        <div className="glass-strong p-6 text-center space-y-4">
          {rolling ? (
            <div className="py-8">
              <div className="text-5xl animate-pulse">{info.icon}</div>
              <p className="text-sm text-muted-foreground mt-3">Играем...</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {!currentUser ? 'Войдите, чтобы играть' : 'Нажмите кнопку, чтобы начать раунд'}
              </p>
              {currentUser ? (
                <button onClick={play} className="btn-primary w-full text-base">
                  {info.icon} Играть!
                </button>
              ) : (
                <Link href="/login" className="btn-primary w-full text-base inline-flex">Войти</Link>
              )}
            </>
          )}
        </div>
      ) : (
        <div className={cn('glass-strong p-6 text-center space-y-3', result.won ? 'gold-border' : 'crimson-border')}>
          <div className="text-5xl">{result.won ? '🏆' : '💀'}</div>
          <h2 className={cn('font-heading text-2xl font-bold', result.won ? 'text-gold' : 'text-red-400')}>
            {result.won ? 'Победа!' : 'Проигрыш'}
          </h2>
          <p className="text-sm text-muted-foreground">{result.details}</p>
          <div className={cn('text-lg font-mono font-bold', result.won ? 'text-emerald-400' : 'text-red-400')}>
            {result.won ? '+' : '-'}<Yen amount={stake} className="inline" iconClass="w-4 h-4" />
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={() => setResult(null)} className="btn-secondary flex-1">Ещё раз</button>
            <Link href="/games" className="btn-outline flex-1">К играм</Link>
          </div>
        </div>
      )}
    </div>
  );
}
