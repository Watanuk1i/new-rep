'use client';

import Link from 'next/link';
import { useStore } from '@/lib/store/StoreProvider';
import { ParticipantCard } from '@/components/cards/ParticipantCard';
import { Yen } from '@/components/ui/Yen';
import { CharacterIcon } from '@/components/ui/CharacterIcon';
import { timeAgo, cn } from '@/lib/utils';

export default function HomePage() {
  const { state, role } = useStore();
  const players = state.participants.filter(p => p.status !== 'gm');
  const queen = state.participants.find(p => p.status === 'queen');
  const elite = state.participants.filter(p => p.status === 'elite');
  const totalBank = players.reduce((s, p) => s + p.balance, 0);
  const activePari = state.pari.filter(m => m.status === 'open' || m.status === 'awaiting_confirmation').length;

  // Сортировка по балансу для рейтинга (топ-5)
  const topRanking = [...players]
    .filter(p => p.status !== 'queen')
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 5);

  // События для пользователей (без gm-only, если не админ)
  const visibleEvents = state.events
    .filter(e => !(e.is_for_gm_only && role !== 'gm' && role !== 'queen'))
    .slice(0, 5);

  return (
    <div className="px-3 sm:px-4 py-4 max-w-2xl lg:max-w-none mx-auto space-y-4 animate-fade-in">
      {/* Hero */}
      <section>
        <div className="relative glass-strong gold-border overflow-hidden">
          <div className="absolute -top-16 -right-16 w-40 h-40 bg-gold/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-16 -left-16 w-40 h-40 bg-crimson/15 rounded-full blur-3xl pointer-events-none" />
          <div className="relative p-5 sm:p-6">
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-crimson/20 border border-crimson/40 text-[10px] font-bold uppercase tracking-widest text-red-300">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                Сезон {state.season} · День {state.day}
              </span>
            </div>
            <h2 className="font-heading text-2xl sm:text-3xl font-bold leading-tight">
              Добро пожаловать <br />
              <span className="text-gradient-gold">в Академию</span>
            </h2>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed italic">
              «Здесь роскошь и отчаяние идут рука об руку. Делай ставки, собирай Питомцев и пробивайся в Элиту.»
            </p>
            <div className="mt-4">
              <Link href="/games" className="btn-primary w-full sm:w-auto">
                🎲 Начать Безумный Азарт
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Президент */}
      {queen && (
        <section>
          <div className="text-[10px] font-bold uppercase tracking-widest text-gold/70 mb-2 px-1">Президент</div>
          <Link href={`/profile/${queen.id}`}>
            <div className="glass-strong gold-border p-4 flex items-center gap-3 active:scale-[0.99] transition-transform duration-100">
              <div className="text-3xl">👑</div>
              <CharacterIcon participant={queen} size="lg" />
              <div className="flex-1 min-w-0">
                <div className="text-[10px] uppercase tracking-widest text-gold/70">Королева</div>
                <h3 className="font-heading text-lg font-bold text-gradient-gold leading-tight truncate">
                  {queen.display_name}
                </h3>
                <Yen amount={queen.balance} className="text-xs text-gold-light mt-0.5" />
              </div>
            </div>
          </Link>
        </section>
      )}

      {/* Элита */}
      {elite.length > 0 && (
        <section>
          <h2 className="section-title text-base mb-2 px-1"><span>👑</span> Элита</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {elite.map(p => <ParticipantCard key={p.id} participant={p} variant="grid" />)}
          </div>
        </section>
      )}

      {/* Рейтинг */}
      <section>
        <div className="flex items-center justify-between mb-2 px-1">
          <h2 className="section-title text-base"><span>🏆</span> Рейтинг Академии</h2>
          <Link href="/participants" className="text-xs text-gold/80 active:text-gold-light font-semibold">
            Все →
          </Link>
        </div>
        <div className="space-y-2">
          {topRanking.map((p, i) => (
            <ParticipantCard key={p.id} participant={p} rank={i + 1} variant="list" />
          ))}
        </div>
      </section>

      {/* Статистика академии */}
      <section>
        <div className="glass-strong gold-border p-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gold/70 mb-3 text-center">
            Статистика академии
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <Stat icon="👥" value={players.length} label="Участники" />
            <Stat icon="💰" value={activePari} label="Активные пари" />
            <StatYen amount={totalBank} label="Общий банк" />
          </div>
        </div>
      </section>

      {/* События */}
      <section>
        <div className="flex items-center justify-between mb-2 px-1">
          <h2 className="section-title text-base"><span>📡</span> События академии</h2>
          <Link href="/notifications" className="text-xs text-gold/80 font-semibold">Все →</Link>
        </div>
        <div className="glass p-4">
          {visibleEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-2">Событий пока нет.</p>
          ) : (
            <div className="space-y-3">
              {visibleEvents.map((e, idx) => (
                <Link
                  key={e.id}
                  href={e.link_url || '/notifications'}
                  className="flex gap-3 text-sm relative active:opacity-70"
                >
                  {idx !== visibleEvents.length - 1 && (
                    <div className="absolute left-[15px] top-9 bottom-[-12px] w-px bg-white/5" />
                  )}
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-velvet to-velvet-dark border border-gold/20 flex items-center justify-center text-sm shrink-0">
                    {EVENT_ICONS[e.type] || '✦'}
                  </div>
                  <div className="flex-1 pt-0.5 min-w-0">
                    <p className="text-sm leading-snug truncate">{e.title}</p>
                    <p className="text-[10px] text-muted mt-0.5 uppercase tracking-wider">
                      {timeAgo(e.created_at)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

const EVENT_ICONS: Record<string, string> = {
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

function Stat({ icon, value, label }: { icon: string; value: number; label: string }) {
  return (
    <div>
      <div className="text-xl mb-0.5">{icon}</div>
      <div className="font-mono font-bold text-gold text-lg leading-none">{value}</div>
      <div className="text-[10px] text-muted uppercase tracking-wider mt-1">{label}</div>
    </div>
  );
}

function StatYen({ amount, label }: { amount: number; label: string }) {
  return (
    <div>
      <div className="text-xl mb-0.5">◈</div>
      <Yen amount={amount} className="text-gold text-lg" iconClass="hidden" />
      <div className="text-[10px] text-muted uppercase tracking-wider mt-1">{label}</div>
    </div>
  );
}
