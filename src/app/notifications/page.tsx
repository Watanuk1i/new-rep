'use client';

import Link from 'next/link';
import { useStore } from '@/lib/store/StoreProvider';
import { cn, timeAgo } from '@/lib/utils';

const ICONS: Record<string, string> = {
  big_game_start: '🏟️',
  player_eliminated: '💀',
  pet_assigned: '🔗',
  elite_promoted: '👑',
  queen_announcement: '👑',
  pari_created: '💰',
  pari_resolved: '✓',
  gm_alert: '⚠️',
  custom: '📢',
};

export default function NotificationsPage() {
  const { state, role } = useStore();
  const events = state.events.filter(e => !(e.is_for_gm_only && role !== 'gm' && role !== 'queen'));
  const isAdmin = role === 'gm' || role === 'queen';

  // Для Ведущего отдельная лента "запросы" (gm_alert)
  const gmAlerts = isAdmin ? state.events.filter(e => e.type === 'gm_alert' || e.is_for_gm_only) : [];
  const generalEvents = events.filter(e => !e.is_for_gm_only);

  return (
    <div className="px-3 sm:px-4 py-4 max-w-2xl mx-auto space-y-4 animate-fade-in">
      <h1 className="section-title text-base px-1"><span>📡</span> События академии</h1>

      {isAdmin && gmAlerts.length > 0 && (
        <section>
          <div className="text-[10px] font-bold uppercase tracking-widest text-amber-300 mb-2 px-1">
            ⚠️ Запросы и споры
          </div>
          <div className="space-y-2">
            {gmAlerts.map(e => (
              <EventItem key={e.id} event={e} />
            ))}
          </div>
        </section>
      )}

      <section>
        {isAdmin && (
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted mb-2 px-1">
            Общая лента
          </div>
        )}
        <div className="space-y-2">
          {generalEvents.length === 0 ? (
            <div className="glass p-6 text-center">
              <div className="text-3xl mb-2 opacity-30">📡</div>
              <p className="text-sm text-muted-foreground">Пока тихо в академии...</p>
            </div>
          ) : generalEvents.map(e => <EventItem key={e.id} event={e} />)}
        </div>
      </section>
    </div>
  );
}

function EventItem({ event }: { event: any }) {
  const inner = (
    <div className="glass p-3 active:scale-[0.99] transition-transform duration-100">
      <div className="flex items-start gap-3">
        <div className={cn(
          'w-10 h-10 rounded-2xl flex items-center justify-center text-lg shrink-0',
          event.type === 'gm_alert'
            ? 'bg-amber-500/15 border border-amber-500/30'
            : 'bg-gold/10 border border-gold/20'
        )}>
          {ICONS[event.type] || '✦'}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-sm leading-snug">{event.title}</h3>
          {event.body && <p className="text-xs text-muted-foreground mt-0.5">{event.body}</p>}
          <div className="text-[10px] text-muted mt-1 uppercase tracking-wider">{timeAgo(event.created_at)}</div>
        </div>
      </div>
    </div>
  );
  return event.link_url ? <Link href={event.link_url}>{inner}</Link> : inner;
}
