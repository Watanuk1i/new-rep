'use client';

import { useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

const GAME_TYPES = [
  { key: 'dice', label: 'Кости', icon: '🎲' },
  { key: 'high_card', label: 'Старшая карта', icon: '🃏' },
  { key: 'roulette', label: 'Рулетка', icon: '🎰' },
  { key: 'slots', label: 'Слоты', icon: '🍒' },
  { key: 'blackjack', label: '21 очко', icon: '🂡' },
  { key: 'bluff_duel', label: 'Блеф-дуэль', icon: '🎭' },
  { key: 'truth_or_bet', label: 'Правда', icon: '❓' },
];

const STAKE_TYPES = [
  { key: 'points', label: 'Очки', icon: '💰' },
  { key: 'debt', label: 'Долг', icon: '📜' },
  { key: 'secret', label: 'Тайна', icon: '🤫' },
  { key: 'pet_temp', label: 'Питомец', icon: '🔗' },
  { key: 'service', label: 'Услуга', icon: '🤝' },
  { key: 'challenge_right', label: 'Право вызова', icon: '⚔️' },
];

const participants = [
  { id: '3', name: 'Макото Наэги' },
  { id: '4', name: 'Кёко Киригири' },
  { id: '5', name: 'Бьякуя Тогами' },
  { id: '6', name: 'Токо Фукава' },
  { id: '7', name: 'Аой Асахина' },
  { id: '8', name: 'Ясухиро Хагакуре' },
  { id: '9', name: 'Сакура Огами' },
  { id: '10', name: 'Леон Кувата' },
  { id: '11', name: 'Саяка Майзоно' },
  { id: '12', name: 'Чихиро Фуджисаки' },
  { id: '13', name: 'Мондо Овада' },
  { id: '14', name: 'Киётака Ишимару' },
  { id: '15', name: 'Хифуми Ямада' },
  { id: '16', name: 'Джунко Эношима' },
];

export default function CreateGamePage() {
  const [step, setStep] = useState(1);
  const [gameType, setGameType] = useState('');
  const [opponent, setOpponent] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [stakeType, setStakeType] = useState('points');
  const [stakeAmount, setStakeAmount] = useState(100);
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <div className="px-4 py-8 max-w-md mx-auto">
        <div className="glass-card gold-border p-6 text-center">
          <div className="text-6xl mb-3 animate-scale-in">⚔️</div>
          <h2 className="font-heading text-2xl font-bold text-gradient-gold mb-2">Вызов отправлен!</h2>
          <p className="text-sm text-muted-foreground mb-6">
            {isOpen ? 'Открытый вызов опубликован. Ждём противника.' : 'Сопернику отправлено уведомление.'}
          </p>
          <div className="flex gap-2">
            <Link href="/games" className="btn-secondary flex-1 text-sm">К играм</Link>
            <Link href="/" className="btn-primary flex-1 text-sm">На главную</Link>
          </div>
        </div>
      </div>
    );
  }

  const canProceed1 = !!gameType;
  const canProceed2 = isOpen || !!opponent;
  const canSubmit = canProceed1 && canProceed2;

  return (
    <div className="px-4 py-4 max-w-md mx-auto space-y-4">
      {/* Progress */}
      <div className="flex items-center gap-2">
        {[1, 2, 3].map(s => (
          <div
            key={s}
            className={cn(
              'h-1.5 flex-1 rounded-full transition-all',
              step >= s ? 'bg-gradient-gold' : 'bg-card border border-white/5'
            )}
          />
        ))}
      </div>

      {/* Step 1: Game type */}
      {step === 1 && (
        <section className="space-y-4 page-enter">
          <div className="text-center mb-2">
            <div className="text-[10px] text-muted uppercase tracking-widest">Шаг 1</div>
            <h2 className="font-heading text-xl font-bold">Выберите игру</h2>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {GAME_TYPES.map(g => (
              <button
                key={g.key}
                onClick={() => setGameType(g.key)}
                className={cn(
                  'glass-card p-4 text-center active:scale-95 transition-all',
                  gameType === g.key && 'gold-border'
                )}
              >
                <div className="text-3xl mb-2">{g.icon}</div>
                <div className="text-xs font-bold">{g.label}</div>
              </button>
            ))}
          </div>

          <button
            onClick={() => setStep(2)}
            disabled={!canProceed1}
            className={cn('btn-primary w-full', !canProceed1 && 'opacity-50 cursor-not-allowed')}
          >
            Далее →
          </button>
        </section>
      )}

      {/* Step 2: Opponent */}
      {step === 2 && (
        <section className="space-y-4 page-enter">
          <div className="text-center mb-2">
            <div className="text-[10px] text-muted uppercase tracking-widest">Шаг 2</div>
            <h2 className="font-heading text-xl font-bold">Соперник</h2>
          </div>

          <button
            onClick={() => setIsOpen(!isOpen)}
            className={cn(
              'glass-card w-full p-4 text-left active:scale-[0.98] transition-all',
              isOpen && 'gold-border'
            )}
          >
            <div className="flex items-center gap-3">
              <div className="text-2xl">🌍</div>
              <div className="flex-1">
                <div className="font-bold text-sm">Открытый вызов</div>
                <div className="text-xs text-muted-foreground">Любой может принять</div>
              </div>
              <div className={cn(
                'w-6 h-6 rounded-full border-2 transition-all',
                isOpen ? 'bg-gold border-gold' : 'border-white/20'
              )}>
                {isOpen && (
                  <svg className="w-full h-full text-black p-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </div>
            </div>
          </button>

          {!isOpen && (
            <div className="space-y-2">
              <div className="text-xs text-muted px-1">Или выберите конкретного соперника:</div>
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {participants.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setOpponent(p.id)}
                    className={cn(
                      'glass-card w-full p-3 text-left active:scale-[0.98] transition-all flex items-center gap-3',
                      opponent === p.id && 'gold-border'
                    )}
                  >
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-velvet to-card border border-white/10 flex items-center justify-center text-xs text-gold font-bold">
                      {p.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                    </div>
                    <span className="font-bold text-sm">{p.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={() => setStep(1)} className="btn-secondary flex-1">← Назад</button>
            <button
              onClick={() => setStep(3)}
              disabled={!canProceed2}
              className={cn('btn-primary flex-1', !canProceed2 && 'opacity-50 cursor-not-allowed')}
            >
              Далее →
            </button>
          </div>
        </section>
      )}

      {/* Step 3: Stake */}
      {step === 3 && (
        <section className="space-y-4 page-enter">
          <div className="text-center mb-2">
            <div className="text-[10px] text-muted uppercase tracking-widest">Шаг 3</div>
            <h2 className="font-heading text-xl font-bold">Ставка</h2>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {STAKE_TYPES.map(s => (
              <button
                key={s.key}
                onClick={() => setStakeType(s.key)}
                className={cn(
                  'glass-card p-3 text-center active:scale-95 transition-all',
                  stakeType === s.key && 'gold-border'
                )}
              >
                <div className="text-xl mb-1">{s.icon}</div>
                <div className="text-[10px] font-bold leading-tight">{s.label}</div>
              </button>
            ))}
          </div>

          {stakeType === 'points' && (
            <div className="glass-card p-4 space-y-3">
              <div className="text-xs text-muted uppercase tracking-widest">Сумма ставки</div>
              <div className="flex items-center gap-3">
                <div className="text-3xl font-mono font-bold text-gold flex-1 text-center">
                  {stakeAmount}
                </div>
              </div>
              <input
                type="range"
                min={10}
                max={5000}
                step={10}
                value={stakeAmount}
                onChange={(e) => setStakeAmount(Number(e.target.value))}
                className="w-full accent-gold"
              />
              <div className="grid grid-cols-4 gap-1.5">
                {[100, 500, 1000, 2000].map(v => (
                  <button
                    key={v}
                    onClick={() => setStakeAmount(v)}
                    className="px-2 py-1.5 text-xs rounded-lg bg-card/60 border border-white/5 active:bg-white/5 font-mono"
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={() => setStep(2)} className="btn-secondary flex-1">← Назад</button>
            <button
              onClick={() => setSubmitted(true)}
              disabled={!canSubmit}
              className={cn('btn-primary flex-1', !canSubmit && 'opacity-50 cursor-not-allowed')}
            >
              ⚔️ Отправить
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
