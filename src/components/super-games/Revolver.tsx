'use client';

// Барабан револьвера на 9 слотов для «Комнаты девяти патронов».
// Слот 1 — сверху, далее по часовой стрелке. Каждое место в игре
// соответствует одному слоту барабана.

import { cn } from '@/lib/utils';
import type { Bullet } from '@/lib/store/types';

interface RevolverProps {
  /** Массив зарядов. Если null — барабан пустой. */
  chamber: Bullet[] | null;
  /** Сколько выстрелов раскрыто (0..9). */
  revealed?: number;
  /** Стартовая позиция барабана (0..8). Выстрел №1 берёт chamber[(startPos+0) % 9] и т.д. */
  startPos?: number;
  /** Раскрыть все цвета (по концу игры). */
  showAll?: boolean;
  /** Идёт анимация прокрутки. */
  spinning?: boolean;
  /** Подсветить текущее место (1..9). */
  highlightSeat?: number | null;
  /** Размер барабана в пикселях. */
  size?: number;
  /** Класс контейнера. */
  className?: string;
  /** Последнее место, куда стреляли (1..9) — используется для пульсации эффекта. */
  flashSeat?: number | null;
}

export function Revolver({
  chamber,
  revealed = 0,
  startPos = 0,
  showAll = false,
  spinning = false,
  highlightSeat,
  size = 240,
  className,
  flashSeat = null,
}: RevolverProps) {
  // 9 слотов: индекс i (0..8) → место (i+1).
  // Угол i-го слота: -90° + i*40° (вверху и по часовой).
  const slots = Array.from({ length: 9 }, (_, i) => i);
  const radius = size * 0.36;
  const slotRadius = size * 0.085;
  const cx = size / 2;
  const cy = size / 2;

  // Анимация прокрутки: при spinning — крутится много оборотов и останавливается
  // на startPos. При спокойном состоянии — фиксируется в позиции.
  const spinDeg = spinning ? 1080 + startPos * 40 : 0;

  return (
    <div className={cn('relative', className)} style={{ width: size, height: size }}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="w-full h-full"
        style={{
          filter: 'drop-shadow(0 6px 20px rgba(0,0,0,0.6))',
          transform: `rotate(${spinDeg}deg)`,
          transition: spinning ? 'transform 2s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'transform 0.3s ease',
          transformOrigin: 'center',
        }}
      >
        <defs>
          <radialGradient id="rev-body" cx="0.4" cy="0.35" r="0.85">
            <stop offset="0%" stopColor="#3a3540" />
            <stop offset="55%" stopColor="#1f1a26" />
            <stop offset="100%" stopColor="#0e0a14" />
          </radialGradient>
          <radialGradient id="rev-rim" cx="0.5" cy="0.5" r="0.5">
            <stop offset="80%" stopColor="#d4af37" stopOpacity="0" />
            <stop offset="100%" stopColor="#d4af37" stopOpacity="0.55" />
          </radialGradient>
          <radialGradient id="bullet-blue" cx="0.35" cy="0.3" r="0.85">
            <stop offset="0%" stopColor="#7dd3fc" />
            <stop offset="60%" stopColor="#2563eb" />
            <stop offset="100%" stopColor="#0c1c4a" />
          </radialGradient>
          <radialGradient id="bullet-red" cx="0.35" cy="0.3" r="0.85">
            <stop offset="0%" stopColor="#fda4a4" />
            <stop offset="55%" stopColor="#e11d48" />
            <stop offset="100%" stopColor="#4a0613" />
          </radialGradient>
          <radialGradient id="bullet-hidden" cx="0.4" cy="0.35" r="0.85">
            <stop offset="0%" stopColor="#5a5260" />
            <stop offset="100%" stopColor="#1a151f" />
          </radialGradient>
          <radialGradient id="bullet-empty" cx="0.5" cy="0.5" r="0.55">
            <stop offset="0%" stopColor="#000" />
            <stop offset="80%" stopColor="#0a0810" />
            <stop offset="100%" stopColor="#1a151f" />
          </radialGradient>
        </defs>

        {/* Корпус барабана */}
        <circle cx={cx} cy={cy} r={size * 0.48} fill="url(#rev-body)" stroke="#d4af37" strokeWidth={1.5} strokeOpacity={0.45} />
        <circle cx={cx} cy={cy} r={size * 0.48} fill="url(#rev-rim)" />

        {/* Метка-индикатор сверху (где «выстрел») */}
        <polygon
          points={`${cx - 7},${cy - size * 0.49 - 4} ${cx + 7},${cy - size * 0.49 - 4} ${cx},${cy - size * 0.42}`}
          fill="#f5d77a"
          stroke="#3a2c0a"
          strokeWidth={1}
        />

        {/* Центральная ось */}
        <circle cx={cx} cy={cy} r={size * 0.07} fill="#0a0810" stroke="#d4af37" strokeOpacity={0.5} />
        <circle cx={cx} cy={cy} r={size * 0.025} fill="#d4af37" />

        {/* 9 слотов */}
        {slots.map(i => {
          const seat = i + 1; // 1..9
          const angle = (-90 + i * 40) * (Math.PI / 180);
          const x = cx + radius * Math.cos(angle);
          const y = cy + radius * Math.sin(angle);

          // Этот слот стреляет на выстреле под номером seat (1..9).
          // Какой патрон в нём лежит = chamber[(startPos + seat - 1) % 9].
          const chamberIdx = chamber ? (startPos + seat - 1) % 9 : -1;
          const bullet: Bullet | null = chamber && chamberIdx >= 0 ? chamber[chamberIdx] : null;

          // Видимость цвета:
          //  - showAll → видим всегда
          //  - иначе → видим только если seat <= revealed
          //  - после выстрела «пуля исчезла», но цвет остаётся помечен (мы хотим показать историю)
          const visible = bullet !== null && (showAll || seat <= revealed);

          // Если идёт прокрутка — прячем содержимое
          const showContent = !spinning && chamber !== null;

          let fill = 'url(#bullet-hidden)';
          if (showContent) {
            if (visible && bullet === 'red') fill = 'url(#bullet-red)';
            else if (visible && bullet === 'blue') fill = 'url(#bullet-blue)';
            else fill = 'url(#bullet-hidden)';
          } else if (chamber === null) {
            fill = 'url(#bullet-empty)';
          }

          const isHighlighted = highlightSeat === seat;
          const isFired = !showAll && seat <= revealed;
          const isFlashing = flashSeat === seat && bullet !== null;

          return (
            <g key={i}>
              {/* Лунка (углубление) */}
              <circle cx={x} cy={y} r={slotRadius + 3} fill="#0a0810" stroke="#000" strokeOpacity={0.6} />

              {/* Эффект пульсации только что произведённого выстрела */}
              {isFlashing && bullet === 'red' && (
                <>
                  <circle cx={x} cy={y} r={slotRadius + 6} fill="none" stroke="#ef4444" strokeWidth={3} opacity={0.85}>
                    <animate attributeName="r" from={slotRadius + 6} to={slotRadius + 18} dur="1.2s" begin="0s" repeatCount="indefinite" />
                    <animate attributeName="opacity" from="0.95" to="0" dur="1.2s" begin="0s" repeatCount="indefinite" />
                  </circle>
                  <circle cx={x} cy={y} r={slotRadius + 2} fill="#7f1d1d" opacity={0.55}>
                    <animate attributeName="opacity" values="0.55;0.2;0.55" dur="1.4s" repeatCount="indefinite" />
                  </circle>
                </>
              )}
              {isFlashing && bullet === 'blue' && (
                <>
                  <circle cx={x} cy={y} r={slotRadius + 6} fill="none" stroke="#38bdf8" strokeWidth={2.5} opacity={0.7}>
                    <animate attributeName="r" from={slotRadius + 6} to={slotRadius + 16} dur="1.4s" begin="0s" repeatCount="indefinite" />
                    <animate attributeName="opacity" from="0.7" to="0" dur="1.4s" begin="0s" repeatCount="indefinite" />
                  </circle>
                  <circle cx={x} cy={y} r={slotRadius + 1} fill="#0c4a6e" opacity={0.4}>
                    <animate attributeName="opacity" values="0.4;0.15;0.4" dur="1.6s" repeatCount="indefinite" />
                  </circle>
                </>
              )}

              {/* Патрон или скрытое содержимое */}
              <circle
                cx={x} cy={y} r={slotRadius}
                fill={fill}
                stroke={isFlashing
                  ? (bullet === 'red' ? '#fca5a5' : '#7dd3fc')
                  : isHighlighted ? '#f5d77a'
                    : isFired ? (bullet === 'red' ? '#fca5a5' : '#7dd3fc') : '#3a3540'}
                strokeWidth={isHighlighted || isFlashing ? 2.5 : 1.2}
                style={{
                  filter: isHighlighted
                    ? 'drop-shadow(0 0 8px #f5d77a)'
                    : isFlashing
                      ? `drop-shadow(0 0 12px ${bullet === 'red' ? '#ef4444' : '#38bdf8'})`
                      : undefined,
                  transition: 'fill 0.4s ease, stroke 0.3s ease',
                }}
              />
              {/* Номер места */}
              <text
                x={x} y={y + slotRadius + 12}
                textAnchor="middle"
                fontFamily="Montserrat, sans-serif"
                fontSize={Math.max(10, size * 0.05)}
                fontWeight={700}
                fill={isHighlighted || isFlashing ? '#f5d77a' : '#9a8a6a'}
                opacity={0.85}
              >
                {seat}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Маленькая иконка патрона (для UI вне барабана). */
export function BulletIcon({ kind, size = 18, className }: { kind: Bullet | 'hidden'; size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className}>
      <defs>
        <radialGradient id={`bi-${kind}`} cx="0.35" cy="0.3" r="0.85">
          {kind === 'red' && (<>
            <stop offset="0%" stopColor="#fda4a4" />
            <stop offset="55%" stopColor="#e11d48" />
            <stop offset="100%" stopColor="#4a0613" />
          </>)}
          {kind === 'blue' && (<>
            <stop offset="0%" stopColor="#7dd3fc" />
            <stop offset="60%" stopColor="#2563eb" />
            <stop offset="100%" stopColor="#0c1c4a" />
          </>)}
          {kind === 'hidden' && (<>
            <stop offset="0%" stopColor="#5a5260" />
            <stop offset="100%" stopColor="#1a151f" />
          </>)}
        </radialGradient>
      </defs>
      <circle cx={12} cy={12} r={10} fill={`url(#bi-${kind})`} stroke="#0a0810" strokeWidth={1.2} />
    </svg>
  );
}


/**
 * Барабан для фазы Зарядки. Заряжающий кликает по слотам и переключает
 * патрон между red ↔ blue. В отличие от Revolver, здесь:
 * - все 9 слотов всегда раскрыты (видны их цвета);
 * - клик по слоту вызывает onToggle(i);
 * - нет анимации прокрутки;
 * - подсветка hover.
 */
export function LoadingRevolver({
  draft, onToggle, size = 240, className,
}: {
  draft: Bullet[];
  onToggle: (idx: number) => void;
  size?: number;
  className?: string;
}) {
  const slots = Array.from({ length: 9 }, (_, i) => i);
  const radius = size * 0.36;
  const slotRadius = size * 0.085;
  const cx = size / 2;
  const cy = size / 2;

  return (
    <div className={cn('relative', className)} style={{ width: size, height: size }}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="w-full h-full"
        style={{ filter: 'drop-shadow(0 6px 20px rgba(0,0,0,0.6))' }}
      >
        <defs>
          <radialGradient id="load-rev-body" cx="0.4" cy="0.35" r="0.85">
            <stop offset="0%" stopColor="#3a3540" />
            <stop offset="55%" stopColor="#1f1a26" />
            <stop offset="100%" stopColor="#0e0a14" />
          </radialGradient>
          <radialGradient id="load-bullet-blue" cx="0.35" cy="0.3" r="0.85">
            <stop offset="0%" stopColor="#7dd3fc" />
            <stop offset="60%" stopColor="#2563eb" />
            <stop offset="100%" stopColor="#0c1c4a" />
          </radialGradient>
          <radialGradient id="load-bullet-red" cx="0.35" cy="0.3" r="0.85">
            <stop offset="0%" stopColor="#fda4a4" />
            <stop offset="55%" stopColor="#e11d48" />
            <stop offset="100%" stopColor="#4a0613" />
          </radialGradient>
        </defs>

        <circle cx={cx} cy={cy} r={size * 0.48} fill="url(#load-rev-body)" stroke="#d4af37" strokeWidth={1.5} strokeOpacity={0.45} />

        {/* Центр */}
        <circle cx={cx} cy={cy} r={size * 0.07} fill="#0a0810" stroke="#d4af37" strokeOpacity={0.5} />
        <circle cx={cx} cy={cy} r={size * 0.025} fill="#d4af37" />
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize={Math.max(8, size * 0.038)}
          fill="#d4af37" opacity={0.5}>зарядка</text>

        {slots.map(i => {
          const seat = i + 1;
          const angle = (-90 + i * 40) * (Math.PI / 180);
          const x = cx + radius * Math.cos(angle);
          const y = cy + radius * Math.sin(angle);
          const bullet = draft[i] ?? 'blue';
          const fill = bullet === 'red' ? 'url(#load-bullet-red)' : 'url(#load-bullet-blue)';
          const stroke = bullet === 'red' ? '#fca5a5' : '#7dd3fc';
          return (
            <g key={i} style={{ cursor: 'pointer' }} onClick={() => onToggle(i)}>
              <circle cx={x} cy={y} r={slotRadius + 3} fill="#0a0810" stroke="#000" strokeOpacity={0.6} />
              <circle cx={x} cy={y} r={slotRadius}
                fill={fill}
                stroke={stroke}
                strokeWidth={1.5}
                style={{ transition: 'fill 0.2s ease' }} />
              <text
                x={x} y={y + slotRadius + 12}
                textAnchor="middle"
                fontFamily="Montserrat, sans-serif"
                fontSize={Math.max(10, size * 0.05)}
                fontWeight={700}
                fill={bullet === 'red' ? '#fca5a5' : '#7dd3fc'}
                opacity={0.85}>
                {seat}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
