'use client';

import { cn } from '@/lib/utils';

interface Props {
  value: number; // 1..6
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  rolling?: boolean;
}

/**
 * 3D-кубик с настоящими точками (pips).
 * Большой, контрастный, заметный — для Лжец на кубиках, Кости и т.п.
 */
export function DieView({ value, size = 'md', rolling, className }: Props) {
  const dims = SIZE_MAP[size];
  const v = Math.max(1, Math.min(6, value));

  return (
    <div
      className={cn(
        'inline-block rounded-xl select-none relative',
        rolling && 'animate-bounce',
        className,
      )}
      style={{
        width: dims.box,
        height: dims.box,
        background: 'linear-gradient(135deg, #fbf6e0 0%, #f5e8b5 60%, #d4af37 100%)',
        border: `${dims.border}px solid #b8941f`,
        boxShadow: 'inset 0 -4px 8px rgba(80,50,0,0.35), 0 4px 8px rgba(0,0,0,0.4), inset 0 0 12px rgba(255,255,255,0.4)',
      }}
    >
      <div className="grid grid-cols-3 grid-rows-3 w-full h-full p-[10%]">
        {PIP_LAYOUT[v].map((on, i) => (
          <div key={i} className="flex items-center justify-center">
            {on && (
              <span
                className="rounded-full block"
                style={{
                  width: dims.pip,
                  height: dims.pip,
                  background: 'radial-gradient(circle at 30% 30%, #5a3a0a 0%, #2a1a02 100%)',
                  boxShadow: 'inset 0 -1px 2px rgba(255,200,80,0.4), 0 1px 2px rgba(0,0,0,0.6)',
                }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const SIZE_MAP = {
  xs: { box: 24, pip: 4, border: 1 },
  sm: { box: 36, pip: 7, border: 2 },
  md: { box: 56, pip: 10, border: 2 },
  lg: { box: 72, pip: 13, border: 3 },
  xl: { box: 96, pip: 18, border: 3 },
} as const;

// Расположение точек 3x3 для значений 1..6.
// Индексы 0..8: [0=tl, 1=tc, 2=tr, 3=ml, 4=mc, 5=mr, 6=bl, 7=bc, 8=br]
const PIP_LAYOUT: Record<number, boolean[]> = {
  1: [false, false, false, false, true, false, false, false, false],
  2: [true, false, false, false, false, false, false, false, true],
  3: [true, false, false, false, true, false, false, false, true],
  4: [true, false, true, false, false, false, true, false, true],
  5: [true, false, true, false, true, false, true, false, true],
  6: [true, false, true, true, false, true, true, false, true],
};
