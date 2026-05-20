'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useStore } from '@/lib/store/StoreProvider';
import { CharacterIcon } from '@/components/ui/CharacterIcon';
import { Yen } from '@/components/ui/Yen';
import { cn, getStatusLabel, getStatusColor } from '@/lib/utils';

export default function ProfilePage() {
  const params = useParams();
  const id = params.id as string;
  const { state, currentUser } = useStore();
  const p = state.participants.find(x => x.id === id);

  if (!p) {
    return (
      <div className="px-4 py-12 text-center">
        <div className="text-4xl opacity-30 mb-2">?</div>
        <p className="text-sm text-muted-foreground">Игрок не найден</p>
        <Link href="/participants" className="btn-secondary inline-flex mt-4">К списку</Link>
      </div>
    );
  }

  const isQueen = p.status === 'queen';
  const isPet = p.status === 'pet';
  const isMaster = p.status === 'master';
  const owner = isPet && p.pet_owner_id ? state.participants.find(x => x.id === p.pet_owner_id) : null;
  const myPets = state.participants.filter(x => x.pet_owner_id === p.id);

  return (
    <div className="px-3 sm:px-4 py-4 max-w-2xl mx-auto space-y-4 animate-fade-in">
      <div className={cn('relative glass-strong overflow-hidden',
        isQueen && 'gold-border', p.status === 'elite' && 'gold-border', isPet && 'crimson-border')}>
        <div className="relative p-5 text-center">
          <CharacterIcon participant={p} size="2xl" className="mx-auto mb-3" ringless={isQueen} />
          <span className={cn('status-badge border', getStatusColor(p.status))}>
            {isQueen && '👑 '}{getStatusLabel(p.status)}
          </span>
          <h1 className={cn('font-heading text-2xl font-bold mt-2 leading-tight',
            isQueen && 'text-gradient-gold')}>{p.display_name}</h1>

          {isPet && owner && (
            <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-crimson/20 border border-crimson/30 text-xs text-red-200">
              🔗 Хозяин: <strong>{owner.display_name}</strong>
            </div>
          )}

          {p.status !== 'gm' && (
            <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-black/30 rounded-full border border-gold/20">
              <Yen amount={p.balance} full className="text-lg text-gold" iconClass="w-5 h-5" />
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Победы" value={p.wins} icon="✓" color="text-emerald-400" />
        <Stat label="Пораж." value={p.losses} icon="✗" color="text-red-400" />
        <Stat label="Репут." value={p.reputation} icon="★" color="text-amber-400" suffix="/100" />
      </div>

      {/* Repute bar */}
      <div className="glass p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold uppercase tracking-widest text-gold/80">Репутация</span>
          <span className="text-xs font-mono text-muted-foreground">{p.reputation}/100</span>
        </div>
        <div className="h-2 bg-black/40 rounded-full overflow-hidden border border-white/5">
          <div className="h-full bg-gradient-to-r from-amber-700 to-amber-300 transition-all"
            style={{ width: `${p.reputation}%` }} />
        </div>
      </div>

      {/* Питомцы под контролем */}
      {myPets.length > 0 && (
        <div className="glass p-4">
          <div className="text-xs font-bold uppercase tracking-widest text-purple-300/80 mb-2">
            🔗 Питомцы под контролем · {myPets.length}
          </div>
          <div className="space-y-2">
            {myPets.map(pet => (
              <Link key={pet.id} href={`/profile/${pet.id}`}>
                <div className="glass p-2 flex items-center gap-3 active:scale-[0.99]">
                  <CharacterIcon participant={pet} size="sm" />
                  <span className="font-bold text-sm flex-1 truncate">{pet.display_name}</span>
                  <Yen amount={pet.balance} className="text-xs text-gold" iconClass="w-3 h-3" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      {currentUser && currentUser.id !== p.id && currentUser.status !== 'gm' && (
        <div className="grid grid-cols-2 gap-2">
          <Link href={`/games/create?opponent=${p.id}`} className="btn-primary text-xs">🎲 Вызвать</Link>
          <Link href={`/pari/create?about=${p.id}`} className="btn-outline text-xs">💰 Создать пари</Link>
          <Link href={`/debts?with=${p.id}`} className="btn-secondary text-xs">📜 Долг</Link>
          <Link href={`/profile/${p.id}/history`} className="btn-secondary text-xs">📜 История</Link>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, icon, color, suffix }: { label: string; value: number; icon: string; color: string; suffix?: string }) {
  return (
    <div className="glass p-3 text-center">
      <div className="text-base">{icon}</div>
      <div className={cn('font-mono font-bold text-lg', color)}>
        {value}{suffix && <span className="text-xs text-muted">{suffix}</span>}
      </div>
      <div className="text-[10px] text-muted uppercase tracking-wider mt-0.5">{label}</div>
    </div>
  );
}
