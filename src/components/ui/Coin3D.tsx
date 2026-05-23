'use client';

import { cn } from '@/lib/utils';

interface Props {
  /** Сторона монетки в покое: 'heads' = орёл сверху, 'tails' = решка сверху. */
  side?: 'heads' | 'tails' | null;
  /** Идёт ли анимация подбрасывания. */
  flipping?: boolean;
  /** Размер диаметра. */
  size?: number;
  className?: string;
}

/**
 * Стилизованная 3D-монетка академии.
 * Орёл (heads) — золотой профиль с короной 👑.
 * Решка (tails) — гранат с гербом ✦.
 */
export function Coin3D({ side, flipping, size = 140, className }: Props) {
  // Финальный угол вращения по rotateX:
  //   heads → кратное 360° (лицо сверху).
  //   tails → 180° + кратное 360° (хвост сверху).
  // Базируемся на ~5 полных оборотов: 1800deg (heads) и 1980deg (tails).
  const finalDeg = side === 'tails' ? 1980 : 1800;
  const restRotate = side === 'tails' ? 'rotateX(180deg)' : 'rotateX(0deg)';

  return (
    <div className={cn('perspective-coin inline-block select-none', className)}
      style={{ width: size, height: size }}>
      <div
        className={cn('relative preserve-3d', flipping ? 'animate-coin-flip' : '')}
        style={{
          width: size,
          height: size,
          // CSS-переменная для @keyframes coinFlip — финальный угол
          ['--coin-final' as any]: `${finalDeg}deg`,
          // В покое — фиксированная сторона
          transform: flipping ? undefined : restRotate,
          transition: flipping ? undefined : 'transform 0.4s ease-out',
        }}
      >
        {/* Лицо: ОРЁЛ */}
        <div
          className="absolute inset-0 rounded-full backface-hidden flex items-center justify-center"
          style={{
            background: 'radial-gradient(circle at 30% 30%, #fbe27c 0%, #d4af37 45%, #8b6914 100%)',
            boxShadow: '0 0 30px rgba(212, 175, 55, 0.7), inset 0 0 18px rgba(255, 220, 100, 0.6), inset 0 -6px 14px rgba(80, 50, 0, 0.5)',
            border: '4px solid #b8941f',
          }}
        >
          <div
            className="rounded-full flex items-center justify-center"
            style={{
              width: '78%', height: '78%',
              background: 'radial-gradient(circle at 30% 30%, #ffe57f 0%, #b8941f 100%)',
              boxShadow: 'inset 0 0 12px rgba(80, 50, 0, 0.6)',
              fontSize: size * 0.42,
              filter: 'drop-shadow(0 2px 2px rgba(0, 0, 0, 0.4))',
            }}
          >
            👑
          </div>
        </div>

        {/* Тыл: РЕШКА */}
        <div
          className="absolute inset-0 rounded-full backface-hidden flex items-center justify-center"
          style={{
            background: 'radial-gradient(circle at 30% 30%, #f59e9e 0%, #8b1a1a 60%, #4a0e0e 100%)',
            boxShadow: '0 0 30px rgba(139, 26, 26, 0.6), inset 0 0 18px rgba(245, 158, 158, 0.4), inset 0 -6px 14px rgba(40, 0, 0, 0.6)',
            border: '4px solid #6b1414',
            transform: 'rotateX(180deg)',
          }}
        >
          <div
            className="rounded-full flex items-center justify-center"
            style={{
              width: '78%', height: '78%',
              background: 'radial-gradient(circle at 30% 30%, #c95252 0%, #6b1414 100%)',
              boxShadow: 'inset 0 0 12px rgba(40, 0, 0, 0.7)',
              fontSize: size * 0.42,
              color: '#fde2a8',
              fontWeight: 'bold',
              filter: 'drop-shadow(0 2px 2px rgba(0, 0, 0, 0.4))',
            }}
          >
            ✦
          </div>
        </div>

        {/* Ребро (тонкое кольцо для глубины при повороте) */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: 'linear-gradient(180deg, #6b4f1a 0%, #d4af37 50%, #6b4f1a 100%)',
            transform: 'translateZ(-2px)',
            opacity: 0.5,
          }}
        />
      </div>

      {/* Тень под монеткой во время полёта */}
      {flipping && (
        <div
          className="mx-auto rounded-full bg-black/40 blur-md"
          style={{
            width: size * 0.6,
            height: 8,
            marginTop: 4,
            animation: 'shake 1.8s ease-in-out infinite',
          }}
        />
      )}
    </div>
  );
}

export function CoinSideLabel({ side }: { side: 'heads' | 'tails' }) {
  return (
    <span className="font-bold">
      {side === 'heads' ? (
        <span className="text-gold">👑 Орёл</span>
      ) : (
        <span className="text-rose-300">✦ Решка</span>
      )}
    </span>
  );
}
