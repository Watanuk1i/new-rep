'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useStore, uid } from '@/lib/store/StoreProvider';
import { CharacterIcon } from '@/components/ui/CharacterIcon';
import { Yen } from '@/components/ui/Yen';
import { cn, isPlayer } from '@/lib/utils';
import { getSupabase } from '@/lib/supabase/client';
import type { MiniGameType } from '@/lib/store/types';

const GAMES: { key: MiniGameType; label: string; icon: string }[] = [
  { key: 'dice', label: 'Кости', icon: '🎲' },
  { key: 'coin_flip', label: 'Монетка', icon: '🪙' },
  { key: 'parity', label: 'Чёт / Нечёт', icon: '🔢' },
  { key: 'high_card', label: 'Старшая карта', icon: '🃏' },
  { key: 'roulette', label: 'Рулетка', icon: '🎰' },
  { key: 'slots', label: 'Камень-Ножницы-Бумага', icon: '✊' },
  { key: 'blackjack', label: '21 очко', icon: '🂡' },
  { key: 'bluff_duel', label: 'Блеф-дуэль', icon: '🎭' },
  { key: 'find_pair', label: 'Найди пару', icon: '🃟' },
  { key: 'find_joker', label: 'Найди Джокера', icon: '🎴' },
  // liars_bar — это супер-игра 2-6 человек, создаётся через /games "Создать малую игру"
];

export default function CreateGamePage() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}

function Inner() {
  const { state, currentUser, notify, addEvent } = useStore();
  const router = useRouter();
  const sp = useSearchParams();
  const initialType = (sp.get('type') as MiniGameType) || '';
  const [gameType, setGameType] = useState<MiniGameType | ''>(initialType);
  const [opponentId, setOpponentId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [stakeAmount, setStakeAmount] = useState(10000);
  const [busy, setBusy] = useState(false);
  const sb = getSupabase();

  const others = state.participants.filter(p =>
    isPlayer(p) && p.id !== currentUser?.id && p.is_active
  );

  const canSubmit = gameType && (isOpen || opponentId) && stakeAmount > 0
    && currentUser && stakeAmount <= currentUser.balance && !busy;

  const submit = async () => {
    if (!canSubmit || !currentUser || !gameType || !sb) return;
    setBusy(true);
    const id = uid('ch');
    const opp = isOpen ? null : opponentId;
    const requiresGmApproval = stakeAmount > 100_000;
    const { error } = await sb.from('challenges').insert({
      id, game_type: gameType, creator_id: currentUser.id,
      opponent_id: opp, stake_amount: stakeAmount,
      status: requiresGmApproval ? 'pending' : 'pending',
      result_data: requiresGmApproval ? { needs_gm_approval: true } : null,
    });
    if (error) {
      alert('Ошибка: ' + error.message);
      setBusy(false);
      return;
    }
    const gl = GAMES.find(g => g.key === gameType)!;
    // Если нужен апрув — уведомляем ведущего
    if (requiresGmApproval) {
      await sb.from('notifications').insert({
        id: uid('n'),
        recipient_id: 'p-gm',
        type: 'help_request_urgent',
        title: '🚨 Большая ставка ждёт апрува',
        body: `${currentUser.display_name} → ${gl.label} · ${stakeAmount.toLocaleString('ru-RU')} ¥`,
        link_url: '/admin?tab=overview',
        is_read: false,
      });
    }
    // Уведомление: только тому, кому адресован вызов, или всем (если открытый)
    if (opp) {
      const target = state.participants.find(p => p.id === opp);
      await notify(opp, {
        type: 'challenge_received',
        title: 'Вас вызвали в игру',
        body: `${currentUser.display_name} вызвал вас в ${gl.label} · ${stakeAmount.toLocaleString('ru-RU')} ейнов`,
        link_url: '/games',
      });
      // Дополнительно — всем игрокам кроме создателя и приглашённого, что игра стартовала
      const others = state.participants.filter(p =>
        isPlayer(p) && p.is_active && p.id !== currentUser.id && p.id !== opp,
      );
      if (others.length > 0) {
        await sb.from('notifications').insert(others.map(t => ({
          id: uid('n'),
          recipient_id: t.id,
          type: 'challenge_started',
          title: `Быстрая игра: ${gl.label}`,
          body: `${currentUser.display_name} вызвал ${target?.display_name ?? 'игрока'} · ${stakeAmount.toLocaleString('ru-RU')} ¥`,
          link_url: '/games',
          is_read: false,
        })));
      }
    } else {
      // Открытый вызов — уведомление всем игрокам кроме создателя
      const targets = state.participants.filter(p =>
        isPlayer(p) && p.id !== currentUser.id && p.is_active
      );
      if (sb && targets.length > 0) {
        await sb.from('notifications').insert(targets.map(t => ({
          id: uid('n'),
          recipient_id: t.id,
          type: 'challenge_open',
          title: 'Открытый вызов',
          body: `${currentUser.display_name} бросил открытый вызов в ${gl.label}`,
          link_url: '/games',
          is_read: false,
        })));
      }
    }
    // Событие в общую ленту тоже
    await sb.from('events').insert({
      id: uid('ev'),
      type: 'mini_game_start',
      title: `Быстрая игра: ${gl.label}`,
      body: opp
        ? `${currentUser.display_name} вызвал ${state.participants.find(p => p.id === opp)?.display_name ?? 'игрока'} · ${stakeAmount.toLocaleString('ru-RU')} ¥`
        : `${currentUser.display_name} бросил открытый вызов · ${stakeAmount.toLocaleString('ru-RU')} ¥`,
      link_url: '/games',
      is_for_gm_only: false,
    });
    setBusy(false);
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
      <div className="glass p-4">
        <div className="text-[10px] font-bold uppercase tracking-widest text-gold mb-2">Игра</div>
        <div className="grid grid-cols-2 gap-2">
          {GAMES.map(g => (
            <button key={g.key} onClick={() => setGameType(g.key)}
              className={cn('glass p-3 text-center active:scale-95 transition-transform',
                gameType === g.key && 'gold-border')}>
              <div className="text-2xl mb-1">{g.icon}</div>
              <div className="text-xs font-bold">{g.label}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="glass p-4 space-y-3">
        <div className="text-[10px] font-bold uppercase tracking-widest text-gold">Соперник</div>
        <button onClick={() => { setIsOpen(!isOpen); setOpponentId(null); }}
          className={cn('w-full glass p-3 flex items-center gap-3 active:scale-[0.99]', isOpen && 'gold-border')}>
          <span className="text-xl">🌍</span>
          <div className="flex-1 text-left">
            <div className="font-bold text-sm">Открытый вызов</div>
            <div className="text-[10px] text-muted-foreground">Любой может принять, всем придёт уведомление</div>
          </div>
        </button>
        {!isOpen && (
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {others.map(p => (
              <button key={p.id} onClick={() => setOpponentId(p.id)}
                className={cn('w-full glass p-2.5 flex items-center gap-2.5 active:scale-[0.99]',
                  opponentId === p.id && 'gold-border')}>
                <CharacterIcon participant={p} size="sm" />
                <span className="font-bold text-sm truncate">{p.display_name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="glass p-4 space-y-3">
        <div className="text-[10px] font-bold uppercase tracking-widest text-gold flex items-center justify-between">
          <span>Ставка</span>
          <Yen amount={stakeAmount} className="text-sm text-gold normal-case" />
        </div>
        <input type="range" min={1000} max={Math.min(currentUser.balance, 5000000)}
          step={1000} value={stakeAmount}
          onChange={e => setStakeAmount(Number(e.target.value))} className="w-full accent-gold" />
        <div className="grid grid-cols-4 gap-1.5">
          {[10000, 50000, 100000, 500000].map(v => (
            <button key={v} onClick={() => setStakeAmount(Math.min(v, currentUser.balance))}
              className="px-1 py-2 text-[10px] rounded-lg bg-card/60 border border-white/10 active:bg-white/5 font-mono">
              {v >= 1000 ? `${v / 1000}K` : v}
            </button>
          ))}
        </div>
        <div className="text-[10px] text-muted">
          Доступно: <Yen amount={currentUser.balance} className="text-gold" iconClass="hidden" />
        </div>
      </div>

      <button onClick={submit} disabled={!canSubmit}
        className={cn('btn-primary w-full text-base', !canSubmit && 'opacity-50')}>
        {busy ? 'Отправляю...' : '⚔️ Отправить вызов'}
      </button>
    </div>
  );
}
