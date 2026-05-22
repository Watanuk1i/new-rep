'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useStore, uid } from '@/lib/store/StoreProvider';
import { CharacterIcon } from '@/components/ui/CharacterIcon';
import { Yen } from '@/components/ui/Yen';
import { cn } from '@/lib/utils';
import { getSupabase } from '@/lib/supabase/client';
import type { GameChallenge, MiniGameType } from '@/lib/store/types';
import { useRouter } from 'next/navigation';

const GAME_LABELS: Record<MiniGameType, { label: string; icon: string }> = {
  dice: { label: 'Кости', icon: '🎲' },
  high_card: { label: 'Старшая карта', icon: '🃏' },
  roulette: { label: 'Рулетка', icon: '🎰' },
  slots: { label: 'Слоты', icon: '🍒' },
  blackjack: { label: '21 очко', icon: '🂡' },
  bluff_duel: { label: 'Блеф-дуэль', icon: '🎭' },
  truth_or_bet: { label: 'Правда/ставка', icon: '❓' },
  find_pair: { label: 'Найди пару', icon: '🃟' },
  find_joker: { label: 'Найди Джокера', icon: '🎴' },
};

export default function GamesPage() {
  const { state, currentUser, notify } = useStore();
  const router = useRouter();
  const [tab, setTab] = useState<'open' | 'mine' | 'types'>('open');
  const sb = getSupabase();

  // Открытые вызовы — все pending в которых текущий не creator
  // (или которые либо открытые, либо адресованы текущему)
  const openChallenges = state.challenges.filter(c => {
    if (c.status !== 'pending') return false;
    if (!currentUser) return c.opponent_id === null;
    if (c.creator_id === currentUser.id) return false;
    return c.opponent_id === null || c.opponent_id === currentUser.id;
  });

  const myChallenges = currentUser
    ? state.challenges.filter(c => c.creator_id === currentUser.id || c.opponent_id === currentUser.id)
    : [];

  const accept = async (ch: GameChallenge) => {
    if (!currentUser || !sb) return;
    // Принять можно даже с нехваткой — проигрыш создаст долг победителю.
    if (currentUser.balance < ch.stake_amount) {
      const ok = confirm(
        `У вас ${currentUser.balance.toLocaleString('ru-RU')} ейн, ставка ${ch.stake_amount.toLocaleString('ru-RU')}. ` +
        `В случае проигрыша вы уйдёте в долг сопернику. Продолжить?`
      );
      if (!ok) return;
    }
    await sb.from('challenges').update({
      status: 'accepted', opponent_id: currentUser.id,
    }).eq('id', ch.id);
    // уведомление автору
    await notify(ch.creator_id, {
      type: 'challenge_accepted',
      title: 'Ваш вызов принят',
      body: `${currentUser.display_name} принял вызов в ${GAME_LABELS[ch.game_type].label}`,
      link_url: `/games/play/${ch.game_type}?challenge=${ch.id}`,
    });
    router.push(`/games/play/${ch.game_type}?challenge=${ch.id}`);
  };

  const cancel = async (ch: GameChallenge) => {
    if (!sb) return;
    await sb.from('challenges').update({ status: 'cancelled' }).eq('id', ch.id);
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
          { key: 'open', label: `Вызовы · ${openChallenges.length}`, icon: '⚔️' },
          { key: 'types', label: 'Типы игр', icon: '🎲' },
          { key: 'mine', label: 'Мои', icon: '👤' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)} className={cn('tab-pill', tab === t.key ? 'tab-pill-active' : 'tab-pill-inactive')}>
            <span>{t.icon}</span><span>{t.label}</span>
          </button>
        ))}
      </div>

      {tab === 'open' && (
        <div className="space-y-3">
          {openChallenges.length === 0 ? (
            <div className="glass p-6 text-center">
              <div className="text-3xl mb-2 opacity-30">⚔️</div>
              <p className="text-sm text-muted-foreground">Нет открытых вызовов.</p>
              {!currentUser && <p className="text-xs text-gold mt-2">Войдите, чтобы видеть вызовы для вас.</p>}
            </div>
          ) : openChallenges.map(ch => {
            const creator = state.participants.find(p => p.id === ch.creator_id);
            const gl = GAME_LABELS[ch.game_type];
            const targeted = ch.opponent_id === currentUser?.id;
            const insufficient = !!currentUser && currentUser.balance < ch.stake_amount;
            return (
              <div key={ch.id} className="glass p-3 flex items-center gap-3">
                {creator && <CharacterIcon participant={creator} size="md" />}
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate">
                    {creator?.display_name || '—'}
                    {targeted && <span className="text-[10px] text-gold ml-1">(вас вызвали)</span>}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1 flex-wrap">
                    <span>{gl.icon}</span><span>{gl.label}</span>
                    <span>·</span>
                    <Yen amount={ch.stake_amount} className="text-gold" iconClass="w-3 h-3" />
                    {ch.opponent_id === null && <span className="text-emerald-300">· открытый</span>}
                    {insufficient && <span className="text-red-300">· не хватает баланса</span>}
                  </div>
                </div>
                {currentUser ? (
                  <button onClick={() => accept(ch)}
                    className={cn('btn-primary text-xs px-4', insufficient && 'btn-danger')}
                    style={{ minHeight: 40 }}>
                    {insufficient ? 'Принять (в долг)' : 'Принять'}
                  </button>
                ) : (
                  <Link href="/login" className="btn-secondary text-xs px-3" style={{ minHeight: 40 }}>Войти</Link>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === 'types' && (
        <div className="grid grid-cols-2 gap-3">
          {(Object.entries(GAME_LABELS) as [MiniGameType, { label: string; icon: string }][]).map(([key, { label, icon }]) => (
            <Link key={key} href={`/games/create?type=${key}`}>
              <div className="glass p-4 text-center active:scale-95 transition-transform">
                <div className="text-3xl mb-2">{icon}</div>
                <div className="font-bold text-sm">{label}</div>
                <div className="text-[10px] text-muted-foreground mt-1">Создать вызов →</div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {tab === 'mine' && (
        <div className="space-y-2">
          {myChallenges.length === 0 ? (
            <div className="glass p-6 text-center">
              <p className="text-sm text-muted-foreground">У вас ещё нет игр.</p>
            </div>
          ) : myChallenges.map(ch => {
            const gl = GAME_LABELS[ch.game_type];
            const opp = state.participants.find(p =>
              p.id === (ch.creator_id === currentUser?.id ? ch.opponent_id : ch.creator_id)
            );
            const isMine = ch.creator_id === currentUser?.id;
            return (
              <div key={ch.id} className={cn('glass p-3',
                ch.status === 'finished' && (ch.winner_id === currentUser?.id ? 'gold-border' : 'crimson-border')
              )}>
                <div className="flex items-center gap-2 text-sm">
                  <span>{gl.icon}</span>
                  <span className="font-bold">{gl.label}</span>
                  <span className="text-muted">vs</span>
                  <span className="font-bold truncate">{opp?.display_name || (ch.opponent_id ? '—' : 'Открытый')}</span>
                </div>
                <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
                  <Yen amount={ch.stake_amount} className="text-gold" iconClass="w-3 h-3" />
                  <span className={cn(
                    ch.status === 'finished' ? (ch.winner_id === currentUser?.id ? 'text-emerald-400' : 'text-red-400') : 'text-muted'
                  )}>
                    {ch.status === 'pending' && (isMine ? 'Ожидание' : 'К бою')}
                    {ch.status === 'accepted' && 'В процессе'}
                    {ch.status === 'finished' && (ch.winner_id === currentUser?.id ? '✓ Победа' : '✗ Проигрыш')}
                    {ch.status === 'cancelled' && 'Отменено'}
                  </span>
                </div>
                {ch.status === 'pending' && isMine && (
                  <button onClick={() => cancel(ch)} className="text-[10px] text-red-300 mt-2">Отменить</button>
                )}
                {ch.status === 'accepted' && (
                  <Link href={`/games/play/${ch.game_type}?challenge=${ch.id}`} className="text-[10px] text-gold mt-2 inline-block">Перейти к игре →</Link>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
