'use client';

import { cn } from '@/lib/utils';
import { type PlayingCard, isRedSuit } from '@/lib/minigames/cards';

interface Props {
  card?: PlayingCard | null;
  faceDown?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** Помечен — в стопке «собрано». */
  dim?: boolean;
  onClick?: () => void;
}

export function PlayingCardView({ card, faceDown, size = 'md', className, dim, onClick }: Props) {
  const dims =
    size === 'sm' ? 'w-10 h-14 text-base' :
    size === 'lg' ? 'w-20 h-28 text-3xl' :
    'w-14 h-20 text-xl';

  const baseCls = cn(
    'rounded-lg border-2 flex items-center justify-center select-none transition-all',
    dims,
    onClick && 'cursor-pointer active:scale-95',
    dim && 'opacity-30',
    className,
  );

  if (faceDown || !card) {
    return (
      <div className={cn(baseCls, 'bg-gradient-to-br from-fuchsia-900 to-purple-950 border-gold/40')} onClick={onClick}>
        <span className="text-gold/60 text-xl">✦</span>
      </div>
    );
  }

  if (card.joker) {
    return (
      <div className={cn(baseCls, 'bg-gradient-to-br from-amber-700 to-rose-900 border-amber-300/60 text-amber-200')} onClick={onClick}>
        🃏
      </div>
    );
  }

  const red = isRedSuit(card.suit);
  return (
    <div
      className={cn(
        baseCls,
        'bg-white border-white/30 flex-col font-bold leading-none',
        red ? 'text-red-600' : 'text-slate-900',
      )}
      onClick={onClick}
    >
      <div className="text-[0.7em]">{card.rank}</div>
      <div className="text-[1.1em] -mt-0.5">{card.suit}</div>
    </div>
  );
}
