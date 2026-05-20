'use client';

import { Suspense, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useStore } from '@/lib/store/StoreProvider';
import { Yen } from '@/components/ui/Yen';
import { cn } from '@/lib/utils';
import { getSupabase } from '@/lib/supabase/client';
import type { MiniGameType } from '@/lib/store/types';

const LABELS: Record<string, { label: string; icon: string }> = {
  dice: { label: 'Кости', icon: '🎲' },
  high_card: { label: 'Старшая карта', icon: '🃏' },
  roulette: { label: 'Рулетка', icon: '🎰' },
  slots: { label: 'Слоты', icon: '🍒' },
  blackjack: { label: '21 очко', icon: '🂡' },
  bluff_duel: { label: 'Блеф-дуэль', icon: '🎭' },
  truth_or_bet: { label: 'Правда или ставка', icon: '❓' },
};

export default function PlayPage() {
  return <Suspense fallback={<div className="px-4 py-12 text-center text-muted-foreground">Загрузка...</div>}><PlayInner /></Suspense>;
}

function PlayInner() {
  const params = useParams();
  const sp = useSearchParams();
  const type = params.type as MiniGameType;
  const challengeId = sp.get('challenge');
  const { state, currentUser, notify, addHistory } = useStore();
  const [result, setResult] = useState<{ won: boolean; details: string } | null>(null);
  const [rolling, setRolling] = useState(false);
  const sb = getSupabase();
  const info = LABELS[type] || { label: type, icon: '?' };

  const challenge = challengeId ? state.challenges.find(c => c.id === challengeId) : null;
  const stake = challenge?.stake_amount || 10000;
  const opponentId = challenge ? (challenge.creator_id === currentUser?.id ? challenge.opponent_id : challenge.creator_id) : null;
  const opponent = opponentId ? state.participants.find(p => p.id === opponentId) : null;

  const play = async () => {
    if (!currentUser || !sb) return;
    setRolling(true);

    setTimeout(async () => {
      let won: boolean;
      let details: string;

      switch (type) {
        case 'dice': {
          const p1 = Math.floor(Math.random() * 6) + 1 + Math.floor(Math.random() * 6) + 1;
          const p2 = Math.floor(Math.random() * 6) + 1 + Math.floor(Math.random() * 6) + 1;
          won = p1 > p2 || (p1 === p2 && Math.random() > 0.5);
          details = `Вы: ${p1} — Соперник: ${p2}`;
          break;
        }
        case 'high_card': {
          const v1 = Math.floor(Math.random() * 13) + 2;
          const v2 = Math.floor(Math.random() * 13) + 2;
          won = v1 > v2 || (v1 === v2 && Math.random() > 0.5);
          details = `Ваша карта: ${v1} — Соперник: ${v2}`;
          break;
        }
        case 'roulette': {
          const num = Math.floor(Math.random() * 37);
          won = num % 2 === 1;
          details = `Выпало: ${num} (${num === 0 ? 'зеро' : num % 2 === 0 ? 'чёт' : 'нечёт'})`;
          break;
        }
        case 'slots': {
          const syms = ['🍒','🍋','🍊','💎','7️⃣','⭐'];
          const r = [
            syms[Math.floor(Math.random() * syms.length)],
            syms[Math.floor(Math.random() * syms.length)],
            syms[Math.floor(Math.random() * syms.length)],
          ];
          won = (r[0] === r[1] && r[1] === r[2]) || (r[0] === r[1] || r[1] === r[2]);
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

      // Обновление баланса в Supabase
      const newBal = won ? currentUser.balance + stake : Math.max(0, currentUser.balance - stake);
      const wins = won ? currentUser.wins + 1 : currentUser.wins;
      const losses = won ? currentUser.losses : currentUser.losses + 1;
      await sb.from('participants').update({
        balance: newBal, wins, losses,
      }).eq('id', currentUser.id);

      await addHistory(currentUser.id, won ? 'game_win' : 'game_loss',
        `${info.label}${opponent ? ' vs ' + opponent.display_name : ''}`,
        won ? stake : -stake, '/games');

      // Обновление challenge + противника
      if (challenge && opponentId) {
        const winnerId = won ? currentUser.id : opponentId;
        const loserId = won ? opponentId : currentUser.id;
        const opp = state.participants.find(p => p.id === opponentId);
        if (opp) {
          await sb.from('participants').update({
            balance: won ? Math.max(0, opp.balance - stake) : opp.balance + stake,
            wins: won ? opp.wins : opp.wins + 1,
            losses: won ? opp.losses + 1 : opp.losses,
          }).eq('id', opp.id);
          await addHistory(opp.id, won ? 'game_loss' : 'game_win',
            `${info.label} vs ${currentUser.display_name}`,
            won ? -stake : stake, '/games');
          await notify(opp.id, {
            type: 'game_result',
            title: won ? 'Вы проиграли игру' : 'Вы выиграли игру!',
            body: `${info.label} vs ${currentUser.display_name}: ${won ? '-' : '+'}${stake.toLocaleString('ru-RU')} ейнов`,
            link_url: '/history',
          });
        }
        await sb.from('challenges').update({
          status: 'finished', winner_id: winnerId, result_data: { details },
        }).eq('id', challenge.id);
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
      <div className="text-center">
        <div className="text-5xl mb-2">{info.icon}</div>
        <h1 className="font-heading text-xl font-bold">{info.label}</h1>
        {opponent && <p className="text-xs text-muted-foreground mt-1">vs {opponent.display_name}</p>}
        <div className="mt-2"><Yen amount={stake} className="text-lg text-gold" iconClass="w-5 h-5" /></div>
      </div>

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
            <Link href="/games" className="btn-outline flex-1">К играм</Link>
            <Link href="/history" className="btn-secondary flex-1">История</Link>
          </div>
        </div>
      )}
    </div>
  );
}
