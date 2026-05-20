'use client';

import { useState } from 'react';
import { cn, getInitials, SPRITE_SHEETS, SPRITE_DEFAULT_SIZE } from '@/lib/utils';

interface Props {
  participant?: {
    display_name: string;
    custom_icon_url?: string | null;
    sprite_sheet?: number | null;
    sprite_y?: number | null;
    sprite_x?: number | null;
    sprite_size?: number | null;
    status?: string;
  };
  name?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  className?: string;
  ring?: boolean;
  /** убирает пульсацию у queen */
  ringless?: boolean;
}

const SIZE_PX: Record<NonNullable<Props['size']>, number> = {
  xs: 28, sm: 36, md: 44, lg: 56, xl: 80, '2xl': 112,
};

const STATUS_RING: Record<string, string> = {
  player: 'ring-2 ring-emerald-400/40',
  pet: 'ring-2 ring-red-500/60',
  master: 'ring-2 ring-purple-400/50',
  elite: 'ring-2 ring-gold/70',
  queen: 'ring-2 ring-gold',
  gm: 'ring-2 ring-white/40',
  collector: 'ring-2 ring-blue-400/50',
};

export function CharacterIcon({ participant, name, size = 'md', className, ring = true, ringless }: Props) {
  const [imgError, setImgError] = useState(false);
  const px = SIZE_PX[size];
  const displayName = participant?.display_name || name || '?';
  const initials = getInitials(displayName);
  const ringClass = (ring && !ringless && participant?.status) ? STATUS_RING[participant.status] || '' : '';

  // 1) Кастомная иконка
  if (participant?.custom_icon_url && !imgError) {
    return (
      <div className={cn('relative rounded-full overflow-hidden shrink-0 bg-card', ringClass, className)}
        style={{ width: px, height: px }}>
        <img src={participant.custom_icon_url} alt={displayName}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)} />
      </div>
    );
  }

  // 2) Сегмент из спрайт-листа
  if (participant?.sprite_sheet && participant.sprite_y != null) {
    const sheet = SPRITE_SHEETS[participant.sprite_sheet];
    const sourceSize = participant.sprite_size || SPRITE_DEFAULT_SIZE;
    const sourceX = participant.sprite_x || 0;
    const scale = px / sourceSize;
    if (sheet) {
      return (
        <div className={cn('relative rounded-full overflow-hidden shrink-0 bg-card', ringClass, className)}
          style={{ width: px, height: px }}>
          <img src={sheet.url} alt={displayName} draggable={false}
            style={{
              position: 'absolute',
              left: -sourceX * scale,
              top: -participant.sprite_y * scale,
              width: sheet.width * scale,
              height: sheet.height * scale,
              imageRendering: 'auto',
              userSelect: 'none',
            }} onError={() => setImgError(true)} />
        </div>
      );
    }
  }

  // 3) Заглушка с инициалами
  const gradients = [
    'from-purple-900 to-velvet',
    'from-crimson-dark to-velvet',
    'from-velvet-dark to-crimson-dark',
    'from-velvet to-purple-900',
  ];
  const gradient = gradients[displayName.charCodeAt(0) % gradients.length];
  const fontSize = px * 0.34;

  return (
    <div className={cn(
      'relative rounded-full flex items-center justify-center font-bold overflow-hidden shrink-0',
      'bg-gradient-to-br', gradient, ringClass, className,
    )} style={{ width: px, height: px }}>
      <span className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent" />
      <span className="relative text-gradient-gold font-heading tracking-wider" style={{ fontSize }}>
        {initials}
      </span>
    </div>
  );
}
