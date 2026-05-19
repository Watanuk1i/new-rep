'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';

// === Helpers ===
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const SUITS = ['♠','♥','♦','♣'];

const rollDice = () => ({ die1: Math.floor(Math.random() * 6) + 1, die2: Math.floor(Math.random() * 6) + 1 });
const drawCard = () => {
  const rank = RANKS[Math.floor(Math.random() * RANKS.length)];
  const suit = SUITS[Math.floor(Math.random() * SUITS.length)];
  const value = RANKS.indexOf(rank) + 2;
  return { rank, suit, value, isRed: suit === '♥' || suit === '♦' };
};

// === Card visual component ===
function PlayingCard({ card, hidden = false, large = false }: { card?: any; hidden?: boolean; large?: boolean }) {
  if (hidden || !card) {
    return (
      <div className={cn(
        'rounded-xl bg-gradient-to-br from-crimson-dark to-velvet-dark border-2 border-gold/30 flex items-center justify-center',
        large ? 'w-20 h-28' : 'w-14 h-20'
      )}>
        <span className="text-gold/40 text-2xl font-heading">✦</span>
      </div>
    );
  }
  return (
    <div className={cn(
      'rounded-xl bg-white border-2 border-gold/30 flex flex-col items-center justify-center font-bold shadow-glow',
      card.isRed ? 'text-red-600' : 'text-black',
      large ? 'w-20 h-28 text-3xl' : 'w-14 h-20 text-xl'
    )}>
      <div>{card.rank}</div>
      <div className={large ? 'text-2xl' : 'text-lg'}>{card.suit}</div>
    </div>
  );
}

// === Die visual ===
function Die({ value, rolling = false }: { value?: number; rolling?: boolean }) {
  return (
    <div className={cn(
      'w-16 h-16 rounded-2xl bg-gradient-to-br from-white to-gray-200 border-2 border-gold/30 shadow-glow flex items-center justify-center text-4xl font-bold text-black',
      rolling && 'animate-spin'
    )}>
      {!rolling && value ? ['⚀','⚁','⚂','⚃','⚄','⚅'][value - 1] : '?'}
    </div>
  );
}

// === DICE GAME ===
function DiceGame() {
  const [result, setResult] = useState<any>(null);
  const [rolling, setRolling] = useState(false);

  const play = () => {
    setRolling(true);
    setResult(null);
    setTimeout(() => {
      const p = rollDice();
      const o = rollDice();
      const pT = p.die1 + p.die2;
      const oT = o.die1 + o.die2;
      setResult({ player: p, opponent: o, playerTotal: pT, opponentTotal: oT, won: pT > oT, tie: pT === oT });
      setRolling(false);
    }, 1200);
  };

  return (
    <div className="space-y-5">
      {/* Opponent area */}
      <div className="glass-card p-4 text-center">
        <div className="text-[10px] text-muted uppercase tracking-widest mb-2">Соперник</div>
        <div className="flex items-center justify-center gap-3 mb-2">
          <Die value={result?.opponent.die1} rolling={rolling} />
          <Die value={result?.opponent.die2} rolling={rolling} />
        </div>
        {result && (
          <div className="text-xl font-mono font-bold animate-fade-in">
            = {result.opponentTotal}
          </div>
        )}
      </div>

      {/* VS divider */}
      <div className="text-center text-gold/50 font-heading text-sm">— VS —</div>

      {/* Player area */}
      <div className={cn('glass-card p-4 text-center', result?.won && 'gold-border')}>
        <div className="text-[10px] text-gold uppercase tracking-widest mb-2">Вы</div>
        <div className="flex items-center justify-center gap-3 mb-2">
          <Die value={result?.player.die1} rolling={rolling} />
          <Die value={result?.player.die2} rolling={rolling} />
        </div>
        {result && (
          <div className="text-xl font-mono font-bold text-gold animate-fade-in">
            = {result.playerTotal}
          </div>
        )}
      </div>

      {/* Result */}
      {result && (
        <ResultBanner won={result.won} tie={result.tie} />
      )}

      {/* Action */}
      <button
        onClick={play}
        disabled={rolling}
        className="btn-primary w-full text-base"
      >
        {rolling ? '🎲 Бросаем...' : result ? '🎲 Бросить ещё раз' : '🎲 Бросить кости'}
      </button>
    </div>
  );
}

// === HIGH CARD ===
function HighCardGame() {
  const [result, setResult] = useState<any>(null);
  const [drawing, setDrawing] = useState(false);

  const play = () => {
    setDrawing(true);
    setResult(null);
    setTimeout(() => {
      const p = drawCard();
      let o = drawCard();
      while (o.value === p.value) o = drawCard();
      setResult({ player: p, opponent: o, won: p.value > o.value });
      setDrawing(false);
    }, 1000);
  };

  return (
    <div className="space-y-5">
      <div className="glass-card p-4 text-center">
        <div className="text-[10px] text-muted uppercase tracking-widest mb-2">Соперник</div>
        <div className="flex justify-center">
          <PlayingCard card={result?.opponent} hidden={drawing || !result} large />
        </div>
      </div>

      <div className="text-center text-gold/50 font-heading text-sm">— VS —</div>

      <div className={cn('glass-card p-4 text-center', result?.won && 'gold-border')}>
        <div className="text-[10px] text-gold uppercase tracking-widest mb-2">Вы</div>
        <div className="flex justify-center">
          <PlayingCard card={result?.player} hidden={drawing || !result} large />
        </div>
      </div>

      {result && <ResultBanner won={result.won} />}

      <button onClick={play} disabled={drawing} className="btn-primary w-full text-base">
        {drawing ? '🃏 Тянем...' : result ? '🃏 Сыграть снова' : '🃏 Тянуть карту'}
      </button>
    </div>
  );
}

// === ROULETTE ===
function RouletteGame() {
  const [bet, setBet] = useState<string>('');
  const [result, setResult] = useState<any>(null);
  const [spinning, setSpinning] = useState(false);
  const RED = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];

  const spin = () => {
    if (!bet) return;
    setSpinning(true);
    setResult(null);
    setTimeout(() => {
      const num = Math.floor(Math.random() * 37);
      const color = num === 0 ? 'green' : RED.includes(num) ? 'red' : 'black';
      const isEven = num !== 0 && num % 2 === 0;
      let won = false, multi = 0;
      if (bet === 'red') { won = color === 'red'; multi = 2; }
      else if (bet === 'black') { won = color === 'black'; multi = 2; }
      else if (bet === 'even') { won = isEven; multi = 2; }
      else if (bet === 'odd') { won = num !== 0 && !isEven; multi = 2; }
      else if (bet === '1-12') { won = num >= 1 && num <= 12; multi = 3; }
      else if (bet === '13-24') { won = num >= 13 && num <= 24; multi = 3; }
      else if (bet === '25-36') { won = num >= 25 && num <= 36; multi = 3; }
      setResult({ number: num, color, won, multiplier: won ? multi : 0 });
      setSpinning(false);
    }, 1800);
  };

  return (
    <div className="space-y-5">
      {/* Wheel */}
      <div className="glass-card p-6 text-center">
        <div className="text-[10px] text-muted uppercase tracking-widest mb-3">Рулетка</div>
        <div className={cn(
          'inline-flex items-center justify-center w-32 h-32 rounded-full border-4 text-4xl font-mono font-bold mx-auto',
          spinning && 'animate-spin',
          result?.color === 'red' ? 'border-red-500 bg-gradient-to-br from-red-600 to-red-800 text-white' :
          result?.color === 'black' ? 'border-gray-500 bg-gradient-to-br from-gray-700 to-black text-white' :
          result?.color === 'green' ? 'border-green-500 bg-gradient-to-br from-green-600 to-green-800 text-white' :
          'border-gold/40 bg-gradient-to-br from-velvet-dark to-card text-gold/30'
        )}>
          {result ? result.number : spinning ? '⟳' : '?'}
        </div>
        {result && (
          <div className="mt-3 animate-fade-in">
            <div className="text-2xl font-bold font-mono text-gold">{result.number}</div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground">
              {result.color === 'red' ? 'Красное' : result.color === 'black' ? 'Чёрное' : 'Зелёное'}
            </div>
          </div>
        )}
      </div>

      {/* Bet selection */}
      {!result && (
        <div className="space-y-3">
          <div className="text-xs text-muted text-center uppercase tracking-widest">Выберите ставку</div>
          <div className="grid grid-cols-2 gap-2">
            <BetButton label="🔴 Красное" active={bet === 'red'} onClick={() => setBet('red')} multiplier="x2" />
            <BetButton label="⚫ Чёрное" active={bet === 'black'} onClick={() => setBet('black')} multiplier="x2" />
            <BetButton label="2️⃣ Чётное" active={bet === 'even'} onClick={() => setBet('even')} multiplier="x2" />
            <BetButton label="1️⃣ Нечётное" active={bet === 'odd'} onClick={() => setBet('odd')} multiplier="x2" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <BetButton label="1-12" active={bet === '1-12'} onClick={() => setBet('1-12')} multiplier="x3" />
            <BetButton label="13-24" active={bet === '13-24'} onClick={() => setBet('13-24')} multiplier="x3" />
            <BetButton label="25-36" active={bet === '25-36'} onClick={() => setBet('25-36')} multiplier="x3" />
          </div>
        </div>
      )}

      {result && (
        <ResultBanner won={result.won} multiplier={result.multiplier} />
      )}

      <button
        onClick={result ? () => { setResult(null); setBet(''); } : spin}
        disabled={!result && (!bet || spinning)}
        className={cn('w-full text-base', result ? 'btn-secondary' : 'btn-primary',
          (!result && (!bet || spinning)) && 'opacity-50 cursor-not-allowed')}
      >
        {spinning ? '🎰 Крутим...' : result ? '🎰 Новая ставка' : '🎰 Крутить'}
      </button>
    </div>
  );
}

function BetButton({ label, active, onClick, multiplier }: { label: string; active: boolean; onClick: () => void; multiplier: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'p-3 rounded-xl border transition-all text-sm font-bold active:scale-95',
        active ? 'bg-gold/20 border-gold/50 text-gold' : 'bg-card/60 border-white/10 text-foreground active:bg-white/5'
      )}
    >
      <div>{label}</div>
      <div className="text-[9px] text-muted mt-0.5 uppercase tracking-wider">{multiplier}</div>
    </button>
  );
}

// === SLOTS ===
function SlotsGame() {
  const [reels, setReels] = useState<string[]>(['❓', '❓', '❓']);
  const [result, setResult] = useState<any>(null);
  const [spinning, setSpinning] = useState(false);
  const SYMBOLS = ['🍒', '🍋', '🍊', '🍇', '💎', '7️⃣', '🔔', '⭐'];

  const spin = () => {
    setSpinning(true);
    setResult(null);
    // Animate reels
    let count = 0;
    const interval = setInterval(() => {
      setReels([
        SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
        SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
        SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
      ]);
      count++;
      if (count > 10) {
        clearInterval(interval);
        const finalReels: [string, string, string] = [
          SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
          SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
          SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
        ];
        let multi = 0;
        if (finalReels[0] === finalReels[1] && finalReels[1] === finalReels[2]) {
          if (finalReels[0] === '7️⃣') multi = 10;
          else if (finalReels[0] === '💎') multi = 7;
          else if (finalReels[0] === '⭐') multi = 5;
          else multi = 3;
        } else if (finalReels[0] === finalReels[1] || finalReels[1] === finalReels[2] || finalReels[0] === finalReels[2]) {
          multi = 1.5;
        }
        setReels(finalReels);
        setResult({ multiplier: multi, won: multi > 0 });
        setSpinning(false);
      }
    }, 100);
  };

  return (
    <div className="space-y-5">
      <div className="glass-card p-6 text-center">
        <div className="text-[10px] text-muted uppercase tracking-widest mb-3">Слоты</div>
        <div className="inline-flex gap-3 p-4 rounded-2xl bg-gradient-to-br from-velvet-dark to-card border-2 border-gold/30">
          {reels.map((r, i) => (
            <div key={i} className="w-16 h-20 sm:w-20 sm:h-24 rounded-xl bg-gradient-to-b from-white to-gray-200 flex items-center justify-center text-4xl sm:text-5xl shadow-inner">
              {r}
            </div>
          ))}
        </div>
        {result && (
          <div className="mt-3 text-xs text-muted-foreground animate-fade-in">
            {result.won ? `Множитель x${result.multiplier}` : 'Нет совпадений'}
          </div>
        )}
      </div>

      {result && <ResultBanner won={result.won} multiplier={result.multiplier} />}

      <button onClick={spin} disabled={spinning} className="btn-primary w-full text-base">
        {spinning ? '🎰 Крутим...' : result ? '🎰 Крутить ещё' : '🎰 Крутить'}
      </button>
    </div>
  );
}

// === BLACKJACK ===
function BlackjackGame() {
  const [game, setGame] = useState<any>(null);

  const calcTotal = (hand: any[]) => {
    let total = 0, aces = 0;
    for (const c of hand) {
      if (c.rank === 'A') { aces++; total += 11; }
      else if (['K','Q','J'].includes(c.rank)) total += 10;
      else total += parseInt(c.rank);
    }
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return total;
  };

  const start = () => {
    const hand = [drawCard(), drawCard()];
    const dealer = [drawCard(), drawCard()];
    setGame({
      playerHand: hand, dealerHand: dealer,
      playerTotal: calcTotal(hand), dealerTotal: calcTotal(dealer),
      status: 'playing',
    });
  };

  const hit = () => {
    const newHand = [...game.playerHand, drawCard()];
    const total = calcTotal(newHand);
    setGame({ ...game, playerHand: newHand, playerTotal: total, status: total > 21 ? 'bust' : 'playing' });
  };

  const stand = () => {
    let dealer = [...game.dealerHand];
    while (calcTotal(dealer) < 17) dealer.push(drawCard());
    const dt = calcTotal(dealer);
    let status = 'push';
    if (dt > 21) status = 'win';
    else if (dt > game.playerTotal) status = 'lose';
    else if (game.playerTotal > dt) status = 'win';
    setGame({ ...game, dealerHand: dealer, dealerTotal: dt, status });
  };

  if (!game) {
    return (
      <div className="text-center space-y-5">
        <div className="text-7xl py-8">🂡</div>
        <p className="text-sm text-muted-foreground">
          Цель: набрать ближе к 21, не перебрав. Туз = 1 или 11.
        </p>
        <button onClick={start} className="btn-primary w-full text-base">🂡 Начать игру</button>
      </div>
    );
  }

  const finished = ['bust', 'win', 'lose', 'push'].includes(game.status);
  const won = game.status === 'win';

  return (
    <div className="space-y-5">
      {/* Dealer */}
      <div className="glass-card p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] text-muted uppercase tracking-widest">Дилер</span>
          <span className="font-mono text-sm">{finished ? game.dealerTotal : '?'}</span>
        </div>
        <div className="flex gap-2 justify-center flex-wrap">
          {game.dealerHand.map((c: any, i: number) => (
            <PlayingCard key={i} card={c} hidden={!finished && i > 0} />
          ))}
        </div>
      </div>

      {/* Player */}
      <div className={cn('glass-card p-4',
        game.status === 'win' && 'gold-border',
        (game.status === 'bust' || game.status === 'lose') && 'crimson-border'
      )}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] text-gold uppercase tracking-widest">Вы</span>
          <span className="font-mono text-sm font-bold text-gold">{game.playerTotal}</span>
        </div>
        <div className="flex gap-2 justify-center flex-wrap">
          {game.playerHand.map((c: any, i: number) => (
            <PlayingCard key={i} card={c} />
          ))}
        </div>
      </div>

      {/* Action / Result */}
      {!finished ? (
        <div className="grid grid-cols-2 gap-2">
          <button onClick={hit} className="btn-primary text-base">+ Карта</button>
          <button onClick={stand} className="btn-secondary text-base">Стоп</button>
        </div>
      ) : (
        <div className="space-y-3">
          <ResultBanner
            won={won}
            tie={game.status === 'push'}
            message={
              game.status === 'win' ? '🏆 Победа!' :
              game.status === 'bust' ? '💥 Перебор!' :
              game.status === 'lose' ? '💀 Проигрыш' :
              '🤝 Ничья'
            }
          />
          <button onClick={() => setGame(null)} className="btn-secondary w-full text-base">Играть снова</button>
        </div>
      )}
    </div>
  );
}

// === BLUFF DUEL ===
function BluffDuelGame() {
  const [phase, setPhase] = useState<'create' | 'respond' | 'done'>('create');
  const [statement, setStatement] = useState('');
  const [response, setResponse] = useState<'believe' | 'disbelieve' | null>(null);

  return (
    <div className="space-y-5">
      <div className="text-center">
        <div className="text-6xl py-4">🎭</div>
      </div>

      {phase === 'create' && (
        <div className="space-y-4">
          <div className="glass-card p-4">
            <div className="text-[10px] uppercase tracking-widest text-gold mb-2">Игрок A</div>
            <p className="text-xs text-muted-foreground mb-3">
              Напишите утверждение — правду или ложь.
            </p>
            <textarea
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
              placeholder="Например: Я не крал деньги из казны..."
              className="input-field min-h-[100px] resize-none"
            />
          </div>
          <button
            onClick={() => setPhase('respond')}
            disabled={!statement.trim()}
            className={cn('btn-primary w-full text-base', !statement.trim() && 'opacity-50')}
          >
            Передать сопернику →
          </button>
        </div>
      )}

      {phase === 'respond' && (
        <div className="space-y-4">
          <div className="glass-card p-4 border-l-4 border-gold/50">
            <div className="text-[10px] uppercase tracking-widest text-muted mb-2">Утверждение игрока A</div>
            <p className="italic text-sm">«{statement}»</p>
          </div>
          <div className="glass-card p-4">
            <div className="text-[10px] uppercase tracking-widest text-gold mb-2">Игрок B</div>
            <p className="text-xs text-muted-foreground mb-3">Веришь или нет?</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => { setResponse('believe'); setPhase('done'); }} className="btn-primary text-base">
                ✓ Верю
              </button>
              <button onClick={() => { setResponse('disbelieve'); setPhase('done'); }} className="btn-danger text-base">
                ✗ Не верю
              </button>
            </div>
          </div>
        </div>
      )}

      {phase === 'done' && (
        <div className="space-y-4 animate-fade-in">
          <div className="glass-card p-4">
            <div className="text-[10px] uppercase tracking-widest text-muted mb-2">Утверждение</div>
            <p className="italic text-sm mb-3">«{statement}»</p>
            <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Ответ</div>
            <p className="font-bold text-sm">{response === 'believe' ? '✓ Верю' : '✗ Не верю'}</p>
          </div>
          <div className="glass-card p-4 gold-border">
            <p className="text-sm text-gold flex items-center gap-2">
              <span className="animate-pulse">⏳</span>
              <span>Ожидание решения ведущего</span>
            </p>
            <p className="text-[11px] text-muted mt-2">
              Ведущий подтвердит истинность и объявит победителя.
            </p>
          </div>
          <button onClick={() => { setPhase('create'); setStatement(''); setResponse(null); }} className="btn-secondary w-full text-base">
            Новая дуэль
          </button>
        </div>
      )}
    </div>
  );
}

// === Result banner ===
function ResultBanner({ won, tie, multiplier, message }: { won: boolean; tie?: boolean; multiplier?: number; message?: string }) {
  return (
    <div className={cn(
      'glass-card p-4 text-center animate-scale-in',
      won && 'gold-border',
      !won && !tie && 'crimson-border',
    )}>
      <div className="text-3xl mb-1">
        {won ? '🏆' : tie ? '🤝' : '💀'}
      </div>
      <div className={cn(
        'font-heading text-lg font-bold',
        won ? 'text-gradient-gold' : tie ? 'text-gold' : 'text-red-400'
      )}>
        {message || (won ? 'Победа!' : tie ? 'Ничья!' : 'Поражение')}
      </div>
      {multiplier && multiplier > 0 && (
        <div className="text-xs text-muted-foreground mt-1">
          Множитель: <span className="text-gold font-mono font-bold">x{multiplier}</span>
        </div>
      )}
    </div>
  );
}

// === Main page ===
const GAMES: Record<string, { label: string; icon: string; Component: React.FC }> = {
  dice: { label: 'Кости', icon: '🎲', Component: DiceGame },
  high_card: { label: 'Старшая карта', icon: '🃏', Component: HighCardGame },
  roulette: { label: 'Рулетка', icon: '🎰', Component: RouletteGame },
  slots: { label: 'Слоты', icon: '🍒', Component: SlotsGame },
  blackjack: { label: '21 очко', icon: '🂡', Component: BlackjackGame },
  bluff_duel: { label: 'Блеф-дуэль', icon: '🎭', Component: BluffDuelGame },
  truth_or_bet: { label: 'Правда или ставка', icon: '❓', Component: BluffDuelGame },
};

export default function PlayGamePage() {
  const params = useParams();
  const type = params.type as string;
  const game = GAMES[type];

  if (!game) {
    return (
      <div className="px-4 py-8 max-w-md mx-auto text-center space-y-4">
        <div className="text-6xl opacity-30">❓</div>
        <h1 className="text-xl font-bold text-red-400">Игра не найдена</h1>
        <Link href="/games" className="btn-outline inline-flex">← К играм</Link>
      </div>
    );
  }

  const GameComponent = game.Component;

  return (
    <div className="px-4 py-4 max-w-md mx-auto">
      {/* Game title */}
      <div className="text-center mb-5">
        <div className="text-4xl mb-1">{game.icon}</div>
        <h1 className="font-heading text-xl font-bold">{game.label}</h1>
      </div>

      <div className="page-enter">
        <GameComponent />
      </div>
    </div>
  );
}
