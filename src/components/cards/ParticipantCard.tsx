'use client';

import Link from 'next/link';
import { CharacterIcon } from '@/components/ui/CharacterIcon';
import { Yen } from '@/components/ui/Yen';
import { cn, getStatusLabel, getStatusColor } from '@/lib/utils';
import type { Participant } from '@/lib/store/types';

interface Props {
  participant: Participant;
  rank?: number;
  variant?: 'list' | 'grid';
  ownerName?: string | null;
}

export function ParticipantCard({ participant, rank, variant = 'list', ownerName }: Props) {
  const isQueen = participant.status === 'queen';
  const isElite = participant.status === 'elite';
  const isPet = participant.status === 'pet';

  if (variant === 'list') {
    return (
      <Link href={`/profile/${participant.id}`}>
        <div className={cn(
          'glass p-3 flex items-center gap-3 active:scale-[0.99] transition-transform duration-100',
          isQueen && 'gold-border',
          isElite && 'gold-border',
          isPet && 'crimson-border'
        )}>
          {rank !== undefined && (
            <div className={cn(
              'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
              rank === 1 ? 'bg-gradient-to-br from-gold-light to-gold-dark text-black' :
              rank === 2 ? 'bg-gray-300 text-black' :
              rank === 3 ? 'bg-amber-700 text-white' :
              'bg-card text-muted-foreground border border-white/10'
            )}>
              {rank}
            </div>
          )}
          <CharacterIcon participant={participant} size="md" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className={cn(
                'font-bold truncate text-sm leading-tight',
                isQueen && 'text-gradient-gold',
                isElite && 'text-gold'
              )}>
                {isQueen && '👑 '}{participant.display_name}
              </h3>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span className={cn('status-badge border', getStatusColor(participant.status))}>
                {getStatusLabel(participant.status)}
              </span>
              <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                <span className="text-amber-400">★</span>
                <span>{participant.reputation}</span>
              </span>
              {isPet && ownerName && (
                <span className="text-[10px] text-red-300 truncate">↳ {ownerName}</span>
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            <Yen amount={participant.balance} className="text-sm text-gold" />
            <div className="text-[10px] text-muted">{participant.wins}W · {participant.losses}L</div>
          </div>
        </div>
      </Link>
    );
  }

  // grid
  return (
    <Link href={`/profile/${participant.id}`}>
      <div className={cn(
        'glass p-3 flex flex-col items-center text-center gap-2 active:scale-95 transition-transform duration-100',
        isQueen && 'gold-border',
        isElite && 'gold-border',
        isPet && 'crimson-border'
      )}>
        <CharacterIcon participant={participant} size="lg" />
        <div className="min-w-0 w-full">
          <div className={cn(
            'font-bold text-sm truncate leading-tight',
            isQueen && 'text-gradient-gold',
            isElite && 'text-gold'
          )}>
            {participant.display_name}
          </div>
          <div className="mt-1">
            <span className={cn('status-badge border', getStatusColor(participant.status))}>
              {getStatusLabel(participant.status)}
            </span>
          </div>
          <Yen amount={participant.balance} className="text-xs text-gold mt-1.5" />
          <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center justify-center gap-1">
            <span className="text-amber-400">★</span>
            <span>{participant.reputation}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
