'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useStore } from '@/lib/store/StoreProvider';
import { CharacterIcon } from '@/components/ui/CharacterIcon';
import { Yen } from '@/components/ui/Yen';
import { cn, uid } from '@/lib/utils';
import type { MiniGameType } from '@/lib/store/types';

const GAMES: { key: MiniGameType; label: string; icon: string }[] = [
  { key: 'dice', label: 'Кости', icon: '🎲' },
  { key: 'high_card', label: 'Старшая карта', icon: '🃏' },
  { key: 'roulette', label: 'Рулетка', icon: '🎰' },
  { key: 'slots', label: 'Слоты', icon: '🍒' },
  { key: 'blackjack', label: '21 очко', icon: '🂡' },
  { key: 'bluff_duel', label: 'Блеф-дуэль', icon: '🎭' },
  { key: 'truth_or_bet', label: 'Правда/ставка', icon: '❓' },
];

export default function CreateGamePage() {
  const { state, currentUser, dispatch } = useStore();
  const router = useRouter();
  const [gameType, setGameType] = useState<MiniGameType | ''>('');
  const [opponentId, setOpponentId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [stakeAmount, setStakeAmount] = useState(10000);

  const others = state.participants.filter(p => p.status !== 'gm' && p.id !== currentUser?.id && p.is_active);

  const canSubmit = gameType && (isOpen || opponentId) && stakeAmount > 0 && currentUser && stakeAmount <= currentUser.balance;

  const submit = () => {
    if (!canSubmit || !currentUser || !gameType) return;
    const id = uid('ch');
    dispatch({
      type: 'add_challenge',
      challenge: {
        id,
        game_type: gameType,
        creator_id: currentUser.id,
        opponent_id: isOpen ? null : opponentId,
        stake_amount: stakeAmount,
        status: 'pending',
        created_at: Date.now(),
      },
    });
    dispatch({
      type: 'add_event',
      event: {
        id: uid('ev'),
        type: 'custom' as any,
        title: `${currentUser.display_name} бросил вызов`,
        body: `${GAMES.find(g => g.key === gameType)?.label} · ${stakeAmount.toLocaleString()} ейнов`,
        link_url: '/games',
        created_at: Date.now(),
      },
    });
    router.push('/games');
  };

  if (!currentUser) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="text-sm text-muted-foreground mb-4">Войдите, чтобы создать вызов.</p>
        <Link href="/login" className="btn-primary inline-flex">Войти</Link>
      </div>
    );
  }

  return (
    <div className="px-3 sm:px-4 py-4 max-w-md mx-auto space-y-4 animate-fade-in">
      {/* Game type */}
      <div className="glass p-4">
        <div className="text-[10px] font-bold uppercase tracking-widest text-gold mb-2">Выберите игру</div>
        <div className="grid grid-cols-2 gap-2">
          {GAMES.map(g => (
            <button
              key={g.key}
              onClick={() => setGameType(g.key)}
              className={cn('glass p-3 text-center active:scale-95 transition-transform', gameType === g.key && 'gold-border')}
            >
              <div className="text-2xl mb-1">{g.icon}</div>
              <div className="text-xs font-bold">{g.label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Opponent */}
      <div className="glass p-4 space-y-3">
        <div className="text-[10px] font-bold uppercase tracking-widest text-gold">Соперник</div>
        <button
          onClick={() => { setIsOpen(!isOpen); setOpponentId(null); }}
          className={cn('w-full glass p-3 flex items-center gap-3 active:scale-[0.99]', isOpen && 'gold-border')}
        >
          <span className="text-xl">🌍</span>
          <div className="flex-1 text-left">
            <div className="font-bold text-sm">Открытый вызов</div>
            <div className="text-[10px] text-muted-foreground">Любой может принять</div>
          </div>
        </button>
        {!isOpen && (
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {others.map(p => (
              <button
                key={p.id}
                onClick={() => setOpponentId(p.id)}
                className={cn('w-full glass p-2.5 flex items-center gap-2.5 active:scale-[0.99]', opponentId === p.id && 'gold-border')}
              >
                <CharacterIcon participant={p} size="sm" />
                <span className="font-bold text-sm truncate">{p.display_name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Stake */}
      <div className="glass p-4 space-y-3">
        <div className="text-[10px] font-bold uppercase tracking-widest text-gold flex items-center justify-between">
          <span>Ставка</span>
          <Yen amount={stakeAmount} className="text-sm text-gold normal-case" />
        </div>
        <input
          type="range"
          min={1000}
          max={Math.min(currentUser.balance, 5000000)}
          step={1000}
          value={stakeAmount}
          onChange={e => setStakeAmount(Number(e.target.value))}
          className="w-full accent-gold"
        />
        <div className="grid grid-cols-4 gap-1.5">
          {[10000, 50000, 100000, 500000].map(v => (
            <button key={v} onClick={() => setStakeAmount(Math.min(v, currentUser.balance))} className="px-1 py-2 text-[10px] rounded-lg bg-card/60 border border-white/10 active:bg-white/5 font-mono">
              {v >= 1000 ? `${v/1000}K` : v}
            </button>
          ))}
        </div>
        <div className="text-[10px] text-muted">Доступно: <Yen amount={currentUser.balance} className="text-gold" iconClass="hidden" /></div>
      </div>

      <button
        onClick={submit}
        disabled={!canSubmit}
        className={cn('btn-primary w-full text-base', !canSubmit && 'opacity-50')}
      >
        ⚔️ Отправить вызов
      </button>
    </div>
  );
}
