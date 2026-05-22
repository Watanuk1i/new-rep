'use client';

import Link from 'next/link';
import { useStore } from '@/lib/store/StoreProvider';
import { Yen } from '@/components/ui/Yen';
import { cn, timeAgo } from '@/lib/utils';

const ICONS: Record<string, string> = {
  game_win: '🏆',
  game_loss: '💀',
  pari_bet: '💰',
  bet_won: '🎉',
  bet_lost: '😢',
  debt_received: '📥',
  debt_given: '📤',
  debt_paid: '✅',
  debt_recovered: '💵',
  transfer_sent: '💸',
  transfer_received: '💰',
  card_ship_stake: '🎴',
  card_ship_duel_won: '⚔️',
  card_ship_duel_lost: '⚔️',
  card_ship_market_buy: '🛒',
  card_ship_market_sell: '🛒',
  card_ship_market_listing: '📋',
  card_ship_market_cancel: '✖️',
  card_ship_survived: '🏆',
  card_ship_lost: '💀',
  card_ship_refund: '↩️',
  custom: '✦',
};

export default function HistoryPage() {
  const { state, currentUser } = useStore();

  if (!currentUser) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="text-sm text-muted-foreground mb-4">Войдите, чтобы видеть историю</p>
        <Link href="/login" className="btn-primary inline-flex">Войти</Link>
      </div>
    );
  }

  return (
    <div className="px-3 sm:px-4 py-4 max-w-2xl mx-auto space-y-4 animate-fade-in">
      <div className="glass-strong p-5">
        <div className="text-[10px] uppercase tracking-widest text-muted mb-1">🕰️ Хроники</div>
        <h1 className="font-heading text-2xl font-bold">Моя история</h1>
        <p className="text-xs text-muted-foreground mt-1">Что вы делали в академии.</p>
      </div>

      <div className="space-y-2">
        {state.history.length === 0 ? (
          <div className="glass p-6 text-center">
            <div className="text-3xl mb-2 opacity-30">🕰️</div>
            <p className="text-sm text-muted-foreground">История пуста.</p>
          </div>
        ) : state.history.map(h => {
          const Wrap = h.link_url ? Link : 'div';
          const props: any = h.link_url ? { href: h.link_url } : {};
          return (
            <Wrap key={h.id} {...props}>
              <div className="glass p-3 flex gap-3">
                <div className="w-9 h-9 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center text-base shrink-0">
                  {ICONS[h.action] || '✦'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold leading-tight">{h.description || h.action}</div>
                  {h.amount != null && (
                    <div className={cn('text-xs mt-0.5', h.amount > 0 ? 'text-emerald-400' : 'text-red-400')}>
                      {h.amount > 0 ? '+' : ''}<Yen amount={Math.abs(h.amount)} className="inline" iconClass="hidden" />
                    </div>
                  )}
                  <div className="text-[10px] text-muted mt-1">{timeAgo(h.created_at)}</div>
                </div>
              </div>
            </Wrap>
          );
        })}
      </div>
    </div>
  );
}
