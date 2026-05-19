'use client';

import { useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

const GAME_TYPES = [
  { key: 'dice', label: 'Кости', icon: '🎲', description: '2 кости, у кого больше — победил', players: 2, color: 'from-velvet to-card' },
  { key: 'high_card', label: 'Старшая карта', icon: '🃏', description: 'Тянуть карту, старшая побеждает', players: 2, color: 'from-velvet-dark to-card' },
  { key: 'roulette', label: 'Рулетка', icon: '🎰', description: 'Цвет, чёт/нечёт, число', players: 1, color: 'from-crimson-dark to-velvet-dark' },
  { key: 'slots', label: 'Слоты', icon: '🍒', description: '3 барабана, комбинации', players: 1, color: 'from-amber-900/40 to-velvet' },
  { key: 'blackjack', label: '21 очко', icon: '🂡', description: 'Набрать ближе к 21', players: 2, color: 'from-velvet to-velvet-dark' },
  { key: 'bluff_duel', label: 'Блеф-дуэль', icon: '🎭', description: 'Утверждение + верю/не верю', players: 2, color: 'from-purple-900/40 to-velvet' },
  { key: 'truth_or_bet', label: 'Правда или ставка', icon: '❓', description: 'Вопрос или повышение', players: 2, color: 'from-crimson-dark to-card' },
];

const mockChallenges = [
  { id: '1', creator: 'Леон Кувата', game: 'dice', stake: 200 },
  { id: '2', creator: 'Мондо Овада', game: 'high_card', stake: 300 },
];

export default function GamesPage() {
  const [tab, setTab] = useState<'games' | 'challenges' | 'history'>('games');

  return (
    <div className="px-4 py-4 max-w-2xl lg:max-w-6xl mx-auto space-y-4">
      {/* CTA */}
      <Link href="/games/create" className="block">
        <div className="relative glass-card overflow-hidden gold-border p-4 active:scale-[0.98] transition-all">
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-gold/10 rounded-full blur-3xl" />
          <div className="relative flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-gold flex items-center justify-center text-2xl shadow-glow">
              ⚔️
            </div>
            <div className="flex-1">
              <div className="font-heading font-bold text-base">Создать игру</div>
              <div className="text-xs text-muted-foreground">Вызвать соперника или открытый вызов</div>
            </div>
            <span className="text-gold/70">→</span>
          </div>
        </div>
      </Link>

      {/* Tabs */}
      <div className="scroll-x">
        {[
          { key: 'games', label: 'Игры', icon: '🎲' },
          { key: 'challenges', label: `Вызовы · ${mockChallenges.length}`, icon: '⚔️' },
          { key: 'history', label: 'История', icon: '📜' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as any)}
            className={cn('tab-pill', tab === t.key ? 'tab-pill-active' : 'tab-pill-inactive')}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {tab === 'games' && (
        <section>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {GAME_TYPES.map(game => (
              <Link key={game.key} href={`/games/play/${game.key}`}>
                <div className={cn(
                  'relative bg-gradient-to-br rounded-2xl p-4 border border-white/5 active:scale-95 transition-all overflow-hidden h-full',
                  game.color
                )}>
                  <div className="absolute -bottom-4 -right-4 text-6xl opacity-15">{game.icon}</div>
                  <div className="relative">
                    <div className="text-3xl mb-2">{game.icon}</div>
                    <h3 className="font-bold text-sm leading-tight">{game.label}</h3>
                    <p className="text-[10px] text-muted-foreground mt-1 leading-snug">{game.description}</p>
                    <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/30 text-[9px] uppercase tracking-wider text-muted-foreground">
                      {game.players === 1 ? 'Соло' : 'Дуэль'}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {tab === 'challenges' && (
        <section className="space-y-2">
          {mockChallenges.length === 0 ? (
            <div className="glass-card p-6 text-center">
              <div className="text-3xl mb-2 opacity-30">⚔️</div>
              <p className="text-sm text-muted-foreground">Открытых вызовов нет.</p>
            </div>
          ) : (
            mockChallenges.map(ch => {
              const game = GAME_TYPES.find(g => g.key === ch.game);
              return (
                <div key={ch.id} className="glass-card p-3 flex items-center gap-3">
                  <div className="text-2xl">{game?.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm truncate">{ch.creator}</div>
                    <div className="text-xs text-muted-foreground">
                      {game?.label} · <span className="text-gold font-mono">{ch.stake}</span> очк.
                    </div>
                  </div>
                  <button className="btn-primary text-xs px-4" style={{ minHeight: '40px' }}>Принять</button>
                </div>
              );
            })
          )}
        </section>
      )}

      {tab === 'history' && (
        <section>
          <div className="glass-card p-6 text-center">
            <div className="text-3xl mb-2 opacity-30">📜</div>
            <p className="text-sm text-muted-foreground">История игр пока пуста.</p>
            <p className="text-[10px] text-muted mt-1">Сыграйте первую партию!</p>
          </div>
        </section>
      )}
    </div>
  );
}
