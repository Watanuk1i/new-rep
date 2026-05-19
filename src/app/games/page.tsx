'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useStore } from '@/lib/store/StoreProvider';
import { CharacterIcon } from '@/components/ui/CharacterIcon';
import { Yen } from '@/components/ui/Yen';
import { cn, uid, getStatusLabel } from '@/lib/utils';
import type { GameChallenge, MiniGameType } from '@/lib/store/types';

const GAME_LABELS: Record<MiniGameType, { label: string; icon: string }> = {
  dice: { label: 'Кости', icon: '🎲' },
  high_card: { label: 'Старшая карта', icon: '🃏' },
  roulette: { label: 'Рулетка', icon: '🎰' },
  slots: { label: 'Слоты', icon: '🍒' },
  blackjack: { label: '21 очко', icon: '🂡' },
  bluff_duel: { label: 'Блеф-дуэль', icon: '🎭' },
  truth_or_bet: { label: 'Правда или ставка', icon: '❓' },
};

export default function GamesPage() {
  const { state, currentUser, dispatch } = useStore();
  const [tab, setTab] = useState<'games' | 'challenges' | 'my'>('challenges');

  const pending = state.challenges.filter(c => c.status === 'pending');
  const myChallenges = currentUser
    ? state.challenges.filter(c => c.creator_id === currentUser.id || c.opponent_id === currentUser.id)
    : [];

  const accept = (ch: GameChallenge) => {
    if (!currentUser) return;
    dispatch({ type: 'accept_challenge', id: ch.id, acceptor_id: currentUser.id });
    // Сразу переходим к игре
    window.location.href = `/games/play/${ch.game_type}?challenge=${ch.id}`;
  };

  return (
    <div className="px-3 sm:px-4 py-4 max-w-2xl mx-auto space-y-4 animate-fade-in">
      <Link href="/games/create" className="block">
        <div className="relative glass-strong gold-border p-4 active:scale-[0.99] transition-transform">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-gold-light to-gold-dark flex items-center justify-center text-2xl">⚔️</div>
            <div className="flex-1">
              <div className="font-heading font-bold text-base">Создать вызов</div>
              <div className="text-xs text-muted-foreground">Выбери игру, соперника и ставку</div>
            </div>
            <span className="text-gold/70">→</span>
          </div>
        </div>
      </Link>

      <div className="scroll-x">
        {[
          { key: 'challenges', label: `Вызовы · ${pending.length}`, icon: '⚔️' },
          { key: 'games', label: 'Типы игр', icon: '🎲' },
          { key: 'my', label: 'Мои', icon: '👤' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)} className={cn('tab-pill', tab === t.key ? 'tab-pill-active' : 'tab-pill-inactive')}>
            <span>{t.icon}</span><span>{t.label}</span>
          </button>
        ))}
      </div>

      {tab === 'challenges' && (
        <div className="space-y-2">
          {pending.length === 0 ? (
            <div className="glass p-6 text-center">
              <div className="text-3xl mb-2 opacity-30">⚔️</div>
              <p className="text-sm text-muted-foreground">Нет открытых вызовов.</p>
              <Link href="/games/create" className="text-xs text-gold mt-2 inline-block">Создать первый →</Link>
            </div>
          ) : pending.map(ch => {
            const creator = state.participants.find(p => p.id === ch.creator_id);
            const gl = GAME_LABELS[ch.game_type];
            const isOwn = currentUser?.id === ch.creator_id;
            return (
              <div key={ch.id} className="glass p-3 flex items-center gap-3">
                {creator && <CharacterIcon participant={creator} size="md" />}
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate">{creator?.display_name || '—'}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <span>{gl.icon}</span><span>{gl.label}</span>
                    <span className="mx-1">·</span>
                    <Yen amount={ch.stake_amount} className="text-gold" iconClass="w-3 h-3" />
                  </div>
                </div>
                {!isOwn && currentUser ? (
                  <button onClick={() => accept(ch)} className="btn-primary text-xs px-4" style={{ minHeight: 40 }}>Принять</button>
                ) : isOwn ? (
                  <button onClick={() => dispatch({ type: 'cancel_challenge', id: ch.id })} className="btn-secondary text-xs px-3" style={{ minHeight: 40 }}>Отменить</button>
                ) : (
                  <Link href="/login" className="btn-secondary text-xs px-3" style={{ minHeight: 40 }}>Войти</Link>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === 'games' && (
        <div className="grid grid-cols-2 gap-3">
          {(Object.entries(GAME_LABELS) as [MiniGameType, { label: string; icon: string }][]).map(([key, { label, icon }]) => (
            <Link key={key} href={`/games/play/${key}`}>
              <div className="glass p-4 text-center active:scale-95 transition-transform">
                <div className="text-3xl mb-2">{icon}</div>
                <div className="font-bold text-sm">{label}</div>
                <div className="text-[10px] text-muted-foreground mt-1">Играть →</div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {tab === 'my' && (
        <div className="space-y-2">
          {myChallenges.length === 0 ? (
            <div className="glass p-6 text-center">
              <p className="text-sm text-muted-foreground">У вас ещё нет игр.</p>
            </div>
          ) : myChallenges.map(ch => {
            const gl = GAME_LABELS[ch.game_type];
            const opp = state.participants.find(p => p.id === (ch.creator_id === currentUser?.id ? ch.opponent_id : ch.creator_id));
            return (
              <div key={ch.id} className={cn('glass p-3', ch.status === 'finished' && (ch.winner_id === currentUser?.id ? 'gold-border' : 'crimson-border'))}>
                <div className="flex items-center gap-2 text-sm">
                  <span>{gl.icon}</span>
                  <span className="font-bold">{gl.label}</span>
                  <span className="text-muted">vs</span>
                  <span className="font-bold truncate">{opp?.display_name || 'Открытый'}</span>
                </div>
                <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
                  <Yen amount={ch.stake_amount} className="text-gold" iconClass="w-3 h-3" />
                  <span className={cn(
                    ch.status === 'finished' ? (ch.winner_id === currentUser?.id ? 'text-emerald-400' : 'text-red-400') : 'text-muted'
                  )}>
                    {ch.status === 'pending' && 'Ожидание'}
                    {ch.status === 'accepted' && 'В процессе'}
                    {ch.status === 'finished' && (ch.winner_id === currentUser?.id ? '✓ Победа' : '✗ Проигрыш')}
                    {ch.status === 'cancelled' && 'Отменено'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
