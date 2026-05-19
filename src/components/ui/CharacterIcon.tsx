'use client';

// Иконка персонажа: сначала custom_icon_url, затем сегмент из спрайт-листа,
// иначе — красивая заглушка с инициалами.
import { useState } from 'react';
import { cn, getInitials, SPRITE_SHEETS, SPRITE_DEFAULT_SIZE } from '@/lib/utils';
import type { Participant } from '@/lib/store/types';

interface Props {
  participant?: Pick<Participant, 'display_name' | 'custom_icon_url' | 'sprite_sheet' | 'sprite_y' | 'sprite_size' | 'status'>;
  name?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  className?: string;
  ring?: boolean;
}

const SIZE_PX: Record<NonNullable<Props['size']>, number> = {
  xs: 28, sm: 36, md: 44, lg: 56, xl: 80, '2xl': 112,
};

const STATUS_RING: Record<string, string> = {
  player: 'ring-2 ring-emerald-400/40',
  pet: 'ring-2 ring-red-500/60',
  master: 'ring-2 ring-purple-400/50',
  elite: 'ring-2 ring-gold/70',
  queen: 'ring-2 ring-gold animate-pulse-gold',
  gm: 'ring-2 ring-white/40',
};

export function CharacterIcon({ participant, name, size = 'md', className, ring = true }: Props) {
  const [imgError, setImgError] = useState(false);
  const px = SIZE_PX[size];
  const displayName = participant?.display_name || name || '?';
  const initials = getInitials(displayName);
  const ringClass = ring && participant?.status ? STATUS_RING[participant.status] || '' : '';

  // 1) Кастомная иконка
  if (participant?.custom_icon_url && !imgError) {
    return (
      <div
        className={cn('relative rounded-full overflow-hidden shrink-0 bg-card', ringClass, className)}
        style={{ width: px, height: px }}
      >
        <img
          src={participant.custom_icon_url}
          alt={displayName}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      </div>
    );
  }

  // 2) Сегмент из спрайт-листа
  if (participant?.sprite_sheet && participant.sprite_y != null) {
    const sheet = SPRITE_SHEETS[participant.sprite_sheet];
    const sourceSize = participant.sprite_size || SPRITE_DEFAULT_SIZE;
    const scale = px / sourceSize;
    if (sheet) {
      return (
        <div
          className={cn('relative rounded-full overflow-hidden shrink-0 bg-card', ringClass, className)}
          style={{ width: px, height: px }}
        >
          <img
            src={sheet.url}
            alt={displayName}
            draggable={false}
            style={{
              position: 'absolute',
              left: 0,
              top: -participant.sprite_y * scale,
              width: sheet.width * scale,
              height: sheet.height * scale,
              imageRendering: 'auto',
              userSelect: 'none',
            }}
            onError={() => setImgError(true)}
          />
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
    <div
      className={cn(
        'relative rounded-full flex items-center justify-center font-bold overflow-hidden shrink-0',
        'bg-gradient-to-br',
        gradient,
        ringClass,
        className
      )}
      style={{ width: px, height: px }}
    >
      <span className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent" />
      <span
        className="relative text-gradient-gold font-heading tracking-wider"
        style={{ fontSize }}
      >
        {initials}
      </span>
    </div>
  );
}
