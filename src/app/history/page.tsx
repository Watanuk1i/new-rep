'use client';

import Link from 'next/link';
import { useStore } from '@/lib/store/StoreProvider';
import { Yen } from '@/components/ui/Yen';
import { CharacterIcon } from '@/components/ui/CharacterIcon';
import { timeAgo, cn } from '@/lib/utils';

export default function HistoryPage() {
  const { state } = useStore();
  // Лента: события + завершённые пари
  const items = [
    ...state.events.map(e => ({ kind: 'event' as const, when: e.created_at, payload: e })),
    ...state.pari.filter(m => m.status === 'resolved' || m.status === 'cancelled')
      .map(m => ({ kind: 'pari' as const, when: m.created_at, payload: m })),
  ].sort((a, b) => b.when - a.when);

  return (
    <div className="px-3 sm:px-4 py-4 max-w-2xl mx-auto space-y-4 animate-fade-in">
      <div className="glass-strong p-5">
        <div className="text-[10px] uppercase tracking-widest text-muted mb-1">🕰️ Хроники</div>
        <h1 className="font-heading text-2xl font-bold">История Академии</h1>
        <p className="text-xs text-muted-foreground mt-1">Все события и решённые пари.</p>
      </div>

      <div className="space-y-2">
        {items.length === 0 ? (
          <div className="glass p-6 text-center">
            <div className="text-3xl mb-2 opacity-30">🕰️</div>
            <p className="text-sm text-muted-foreground">История пуста.</p>
          </div>
        ) : items.map((it, idx) => {
          if (it.kind === 'event') {
            return (
              <div key={`e-${it.payload.id}`} className="glass p-3 flex gap-3">
                <div className="w-9 h-9 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center text-base shrink-0">
                  📡
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold leading-tight">{it.payload.title}</div>
                  {it.payload.body && <div className="text-xs text-muted-foreground mt-0.5">{it.payload.body}</div>}
                  <div className="text-[10px] text-muted mt-1">{timeAgo(it.when)}</div>
                </div>
              </div>
            );
          }
          // pari
          return (
            <div key={`p-${it.payload.id}`} className="glass p-3 flex gap-3">
              <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-base shrink-0">
                💰
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold leading-tight truncate">{it.payload.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Статус: {it.payload.status === 'resolved' ? 'Решено' : 'Отменено'}
                </div>
                <div className="text-[10px] text-muted mt-1">{timeAgo(it.when)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
