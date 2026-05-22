'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useStore } from '@/lib/store/StoreProvider';
import { CharacterIcon } from '@/components/ui/CharacterIcon';
import { Yen } from '@/components/ui/Yen';
import { TransferModal } from '@/components/economy/TransferModal';
import { cn, timeAgo } from '@/lib/utils';

export default function TransfersPage() {
  const { state, currentUser, role } = useStore();
  const [tab, setTab] = useState<'all' | 'in' | 'out'>('all');
  const [transferOpen, setTransferOpen] = useState(false);

  const isAdmin = role === 'gm' || role === 'queen';

  // Админ видит все переводы; игрок — только свои
  const list = useMemo(() => {
    if (!currentUser) return [];
    let arr = state.transfers;
    if (!isAdmin) {
      arr = arr.filter(t =>
        t.sender_id === currentUser.id || t.recipient_id === currentUser.id,
      );
    }
    if (tab === 'in') arr = arr.filter(t => t.recipient_id === currentUser.id);
    else if (tab === 'out') arr = arr.filter(t => t.sender_id === currentUser.id);
    return arr;
  }, [state.transfers, currentUser, isAdmin, tab]);

  if (!currentUser) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="text-sm text-muted-foreground mb-4">Войдите, чтобы видеть переводы</p>
        <Link href="/login" className="btn-primary inline-flex">Войти</Link>
      </div>
    );
  }

  return (
    <div className="px-3 sm:px-4 py-4 max-w-2xl mx-auto space-y-4 animate-fade-in">
      <div className="relative glass-strong gold-border p-5">
        <div className="text-[10px] font-bold uppercase tracking-widest text-gold/70 mb-1">
          💸 Экономика
        </div>
        <h1 className="font-heading text-2xl font-bold text-gradient-gold">Переводы йен</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Сделки, выплаты, компенсации, взятки и договорённости. {isAdmin && 'Вы видите все переводы.'}
        </p>
      </div>

      <button onClick={() => setTransferOpen(true)} className="btn-primary w-full">
        💸 Перевести йены
      </button>

      <div className="scroll-x">
        {[
          { key: 'all', label: 'Все', icon: '∗' },
          { key: 'in', label: 'Получено', icon: '↓' },
          { key: 'out', label: 'Отправлено', icon: '↑' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as any)}
            className={cn('tab-pill', tab === t.key ? 'tab-pill-active' : 'tab-pill-inactive')}
          >
            <span>{t.icon}</span><span>{t.label}</span>
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {list.length === 0 ? (
          <div className="glass p-8 text-center">
            <div className="text-3xl mb-2 opacity-30">💸</div>
            <p className="text-sm text-muted-foreground">Переводов пока нет.</p>
          </div>
        ) : list.map(t => {
          const sender = state.participants.find(p => p.id === t.sender_id);
          const recipient = state.participants.find(p => p.id === t.recipient_id);
          const isOutgoing = t.sender_id === currentUser.id;
          const isIncoming = t.recipient_id === currentUser.id;
          return (
            <div key={t.id} className="glass p-3">
              <div className="flex items-center gap-3 mb-2">
                {sender && (
                  <Link href={`/profile/${sender.id}`} className="flex items-center gap-1.5 min-w-0 max-w-[42%]">
                    <CharacterIcon participant={sender} size="xs" ringless />
                    <span className={cn(
                      'text-xs font-bold truncate',
                      isOutgoing ? 'text-red-300' : 'text-foreground',
                    )}>
                      {sender.display_name}
                    </span>
                  </Link>
                )}
                <span className="text-muted text-xs shrink-0">→</span>
                {recipient && (
                  <Link href={`/profile/${recipient.id}`} className="flex items-center gap-1.5 min-w-0 max-w-[42%]">
                    <CharacterIcon participant={recipient} size="xs" ringless />
                    <span className={cn(
                      'text-xs font-bold truncate',
                      isIncoming ? 'text-emerald-300' : 'text-foreground',
                    )}>
                      {recipient.display_name}
                    </span>
                  </Link>
                )}
                <Yen
                  amount={t.amount}
                  className={cn(
                    'ml-auto text-sm shrink-0',
                    isIncoming ? 'text-emerald-300' : isOutgoing ? 'text-red-300' : 'text-gold',
                  )}
                  iconClass="w-3 h-3"
                />
              </div>
              <p className="text-xs text-muted-foreground italic">«{t.comment}»</p>
              <div className="flex items-center justify-between mt-1">
                <div className="text-[10px] text-muted">{timeAgo(t.created_at)}</div>
                {t.related_game_id && (
                  <Link
                    href={`/super-games/${t.related_game_id}`}
                    className="text-[10px] text-gold/80"
                  >
                    🏟️ К игре →
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <TransferModal open={transferOpen} onClose={() => setTransferOpen(false)} />
    </div>
  );
}
