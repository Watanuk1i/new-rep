'use client';

import { useState, useMemo } from 'react';
import { useStore } from '@/lib/store/StoreProvider';
import { ParticipantCard } from '@/components/cards/ParticipantCard';
import { CharacterIcon } from '@/components/ui/CharacterIcon';
import { Yen } from '@/components/ui/Yen';
import { cn, isPlayer } from '@/lib/utils';

const FILTERS = [
  { key: 'all', label: 'Все', icon: '◉' },
  { key: 'player', label: 'Игроки', icon: '✦' },
  { key: 'pet', label: 'Питомцы', icon: '🔗' },
  { key: 'master', label: 'Хозяева', icon: '👤' },
  { key: 'elite', label: 'Элита', icon: '👑' },
];

const SORTS = [
  { key: 'balance', label: 'Баланс' },
  { key: 'reputation', label: 'Репутация' },
  { key: 'wins', label: 'Победы' },
];

export default function ParticipantsPage() {
  const { state } = useStore();
  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState('balance');
  const [view, setView] = useState<'list' | 'grid'>('list');

  const all = state.participants.filter(p => isPlayer(p));
  const queen = all.find(p => p.status === 'queen');

  const list = useMemo(() => {
    let arr = all.filter(p => p.status !== 'queen');
    if (filter !== 'all') arr = arr.filter(p => p.status === filter);
    return arr.sort((a, b) => {
      if (sortBy === 'balance') return b.balance - a.balance;
      if (sortBy === 'reputation') return b.reputation - a.reputation;
      if (sortBy === 'wins') return b.wins - a.wins;
      return 0;
    });
  }, [all, filter, sortBy]);

  return (
    <div className="px-3 sm:px-4 py-4 max-w-2xl mx-auto space-y-4 animate-fade-in">
      {queen && (
        <div className="glass-strong gold-border p-4 flex items-center gap-3">
          <div className="text-3xl">👑</div>
          <CharacterIcon participant={queen} size="lg" ringless />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-widest text-gold/70">Президент Академии</div>
            <h2 className="font-heading text-lg font-bold text-gradient-gold leading-tight truncate">{queen.display_name}</h2>
            <Yen amount={queen.balance} className="text-xs text-gold mt-0.5" />
          </div>
        </div>
      )}

      <div className="scroll-x">
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={cn('tab-pill', filter === f.key ? 'tab-pill-active' : 'tab-pill-inactive')}>
            <span>{f.icon}</span><span>{f.label}</span>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
          className="input-field flex-1 py-2 text-xs" style={{ minHeight: 40 }}>
          {SORTS.map(s => <option key={s.key} value={s.key}>Сортировка: {s.label}</option>)}
        </select>
        <div className="flex bg-card/60 border border-white/8 rounded-xl p-1">
          <button onClick={() => setView('list')}
            className={cn('p-2 rounded-lg', view === 'list' ? 'bg-gold/15 text-gold' : 'text-muted')}>☰</button>
          <button onClick={() => setView('grid')}
            className={cn('p-2 rounded-lg', view === 'grid' ? 'bg-gold/15 text-gold' : 'text-muted')}>▦</button>
        </div>
      </div>

      <div className="text-xs text-muted px-1">{list.length} участников</div>

      {view === 'list' ? (
        <div className="space-y-4">
          {list.map((p, i) => (
            <ParticipantCard key={p.id} participant={p} variant="list"
              rank={sortBy === 'balance' ? i + 1 : undefined} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {list.map(p => <ParticipantCard key={p.id} participant={p} variant="grid" />)}
        </div>
      )}
    </div>
  );
}
