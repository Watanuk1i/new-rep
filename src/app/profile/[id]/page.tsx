'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useStore } from '@/lib/store/StoreProvider';
import { CharacterIcon } from '@/components/ui/CharacterIcon';
import { Yen } from '@/components/ui/Yen';
import { cn, getStatusLabel, getStatusColor } from '@/lib/utils';

export default function ProfilePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { state, currentUser, notifyGM } = useStore();
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
  const isElite = p.status === 'elite';
  const isPet = p.status === 'pet';
  const owner = isPet && p.pet_owner_id ? state.participants.find(x => x.id === p.pet_owner_id) : null;

  return (
    <div className="px-3 sm:px-4 py-4 max-w-2xl mx-auto space-y-4 animate-fade-in">
      <div className={cn(
        'relative glass-strong overflow-hidden',
        isQueen && 'gold-border',
        isElite && 'gold-border',
        isPet && 'crimson-border'
      )}>
        <div className="absolute -top-16 -right-16 w-32 h-32 bg-gold/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative p-5 text-center">
          <CharacterIcon participant={p} size="2xl" className="mx-auto mb-3" />

          <span className={cn('status-badge border', getStatusColor(p.status))}>
            {isQueen && '👑 '}{getStatusLabel(p.status)}
          </span>

          <h1 className={cn(
            'font-heading text-2xl font-bold mt-2 leading-tight',
            isQueen && 'text-gradient-gold',
            isElite && 'text-gold'
          )}>
            {p.display_name}
          </h1>

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
          <div
            className="h-full bg-gradient-to-r from-amber-700 to-amber-300 transition-all"
            style={{ width: `${p.reputation}%` }}
          />
        </div>
      </div>

      {/* Actions */}
      {currentUser && currentUser.id !== p.id && currentUser.status !== 'gm' && (
        <div className="grid grid-cols-2 gap-2">
          <Link href={`/games/create?opponent=${p.id}`} className="btn-primary text-xs">
            🎲 Вызвать
          </Link>
          <Link href={`/pari/create?about=${p.id}`} className="btn-outline text-xs">
            💰 Создать пари
          </Link>
          <Link href={`/debts/create?with=${p.id}`} className="btn-secondary text-xs">
            📜 Долг
          </Link>
          <button
            onClick={() => {
              notifyGM(`Спор/жалоба на ${p.display_name}`, currentUser.id);
              alert('Уведомление отправлено Ведущему');
            }}
            className="btn-secondary text-xs"
          >
            📣 Позвать Ведущего
          </button>
        </div>
      )}

      {/* History placeholder */}
      <div className="glass p-4">
        <h3 className="section-title text-sm mb-2">История игр</h3>
        <p className="text-xs text-muted-foreground text-center py-3">Ещё не сыграно ни одной игры.</p>
      </div>
    </div>
  );
}

function Stat({ label, value, icon, color, suffix }: { label: string; value: number; icon: string; color: string; suffix?: string }) {
  return (
    <div className="glass p-3 text-center">
      <div className="text-base">{icon}</div>
      <div className={cn('font-mono font-bold text-lg', color)}>{value}{suffix && <span className="text-xs text-muted">{suffix}</span>}</div>
      <div className="text-[10px] text-muted uppercase tracking-wider mt-0.5">{label}</div>
    </div>
  );
}
