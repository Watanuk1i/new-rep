'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store/StoreProvider';
import { CharacterIcon } from '@/components/ui/CharacterIcon';
import { Yen } from '@/components/ui/Yen';
import { getStatusLabel } from '@/lib/utils';

export default function AccountPage() {
  const { currentUser, logout } = useStore();
  const router = useRouter();

  if (!currentUser) {
    return (
      <div className="px-4 py-12 text-center max-w-md mx-auto">
        <div className="text-5xl mb-3 opacity-40">💳</div>
        <h2 className="font-heading text-xl font-bold mb-2">Вы не вошли</h2>
        <p className="text-sm text-muted-foreground mb-4">Войдите, чтобы увидеть свой баланс и аккаунт.</p>
        <Link href="/login" className="btn-primary inline-flex">Войти</Link>
      </div>
    );
  }

  return (
    <div className="px-4 py-4 max-w-md mx-auto space-y-4">
      <div className="glass-strong gold-border p-5 text-center">
        <CharacterIcon participant={currentUser} size="2xl" className="mx-auto mb-3" />
        <h2 className="font-heading text-2xl font-bold leading-tight">{currentUser.display_name}</h2>
        <div className="text-[10px] uppercase tracking-widest text-muted mt-1">
          {getStatusLabel(currentUser.status)}
        </div>
      </div>

      {currentUser.status !== 'gm' && (
        <div className="glass p-4 text-center">
          <div className="text-[10px] uppercase tracking-widest text-gold/70 mb-1">Баланс</div>
          <Yen amount={currentUser.balance} full className="text-3xl text-gold" iconClass="w-7 h-7" />
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <div className="glass p-3 text-center">
          <div className="text-base text-emerald-400">✓</div>
          <div className="font-mono font-bold text-lg">{currentUser.wins}</div>
          <div className="text-[9px] text-muted uppercase tracking-wider">Победы</div>
        </div>
        <div className="glass p-3 text-center">
          <div className="text-base text-red-400">✗</div>
          <div className="font-mono font-bold text-lg">{currentUser.losses}</div>
          <div className="text-[9px] text-muted uppercase tracking-wider">Пораж.</div>
        </div>
        <div className="glass p-3 text-center">
          <div className="text-base text-amber-400">★</div>
          <div className="font-mono font-bold text-lg">{currentUser.reputation}</div>
          <div className="text-[9px] text-muted uppercase tracking-wider">Репутация</div>
        </div>
      </div>

      <div className="space-y-2">
        <Link href={`/profile/${currentUser.id}`} className="btn-secondary w-full">
          👤 Открыть профиль
        </Link>
        <Link href="/notifications" className="btn-secondary w-full">
          🔔 Мои события
        </Link>
        <button
          onClick={() => { logout(); router.push('/login'); }}
          className="w-full flex items-center justify-center gap-2 text-red-300 active:bg-red-500/10 rounded-xl py-3 text-sm font-bold border border-red-500/20"
        >
          🚪 Выйти
        </button>
      </div>
    </div>
  );
}
