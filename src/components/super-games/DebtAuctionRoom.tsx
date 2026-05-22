'use client';

// ===========================================================================
// «Аукцион долгов» — 7-я Большая игра.
// Куратор: Кредитор Элиты (роль 'collector') · Взыскатель: Мондо (p-11)
// · Наблюдатель: Селестия (p-queen).
//
// Лоты собираются из реальных записей таблицы `debts`. Покупка лота
// меняет creditor_id (= владельца) долга. Самовыкуп должником закрывает
// долг (status='paid'). Разовые спецдействия:
//   - Мондо: коллекторская надбавка +20% к лоту до открытия.
//   - Кредитор: срочный заём ≤ 500k любому игроку, к возврату ×1.2.
//   - Казна: перебивка ставки (current_bid + 100k).
// ===========================================================================

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/lib/store/StoreProvider';
import { CharacterIcon } from '@/components/ui/CharacterIcon';
import { Yen } from '@/components/ui/Yen';
import { cn, isPlayer } from '@/lib/utils';
import { getSupabase } from '@/lib/supabase/client';
import {
  applyTransfer, chargeToTreasury, payoutFromTreasury,
  transferBetweenPlayers, TREASURY_ID,
} from '@/lib/store/tx';
import {
  priceLot, nextMinBid, canSelfBuyout,
  applyMondoMarkup, emergencyLoanRepayment, celestiaOverbidAmount,
  CREDITOR_EMERGENCY_LOAN_MAX, MONDO_COLLECTION_COMMISSION,
} from '@/lib/debtauction/logic';
import type {
  SuperGame, Participant, Debt,
  DebtAuctionState, DebtAuctionLot, DebtAuctionBid, DebtAuctionLotStatus,
} from '@/lib/store/types';

const MONDO_ID = 'p-11';
const QUEEN_ID = 'p-queen';

// ---------- helpers ----------

function getState(g: SuperGame): DebtAuctionState {
  const s = (g.state || {}) as Partial<DebtAuctionState>;
  return {
    curator_id: s.curator_id ?? '',
    collector_id: s.collector_id ?? MONDO_ID,
    observer_id: s.observer_id ?? QUEEN_ID,
    lots: s.lots ?? [],
    current_lot_id: s.current_lot_id ?? null,
    mondo_markup_used: s.mondo_markup_used ?? false,
    creditor_loan_used: s.creditor_loan_used ?? false,
    celestia_treasury_hand_used: s.celestia_treasury_hand_used ?? false,
    status: s.status ?? 'scheduled',
  };
}

async function readState(gameId: string): Promise<DebtAuctionState | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.from('super_games').select('state').eq('id', gameId).single();
  return (data?.state as DebtAuctionState) ?? null;
}

async function writeState(gameId: string, next: DebtAuctionState) {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from('super_games').update({ state: next }).eq('id', gameId);
}

async function pushEvent(title: string, body: string | undefined, link: string) {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from('events').insert({
    id: 'ev-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
    type: 'big_game_progress',
    title, body: body ?? null, link_url: link,
    is_for_gm_only: false,
  });
}

async function logHistory(participantId: string, action: string, description: string, amount: number | null, link: string) {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from('history').insert({
    id: 'h-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    participant_id: participantId,
    action,
    description,
    amount,
    link_url: link,
  });
}

// ===========================================================================

export function DebtAuctionRoom({ game }: { game: SuperGame }) {
  const { state, currentUser, role } = useStore();
  const isAdmin = role === 'gm' || role === 'queen';
  const isCreditor = role === 'collector';
  const da = getState(game);

  const lots = da.lots ?? [];
  const currentLot = lots.find(l => l.id === da.current_lot_id) ?? null;
  const isParticipant = !!currentUser && isPlayer(currentUser);

  return (
    <div className="space-y-4">
      <Header da={da} />

      {/* Активный лот */}
      {currentLot && (currentLot.status === 'open' || currentLot.status === 'closed') && (
        <ActiveLot
          game={game}
          da={da}
          lot={currentLot}
          currentUser={currentUser}
          isAdmin={isAdmin}
          isCreditor={isCreditor}
        />
      )}

      {/* Список лотов */}
      <LotsList game={game} da={da} isAdmin={isAdmin} />

      {/* Спецдействия */}
      {(isAdmin || isCreditor) && da.status !== 'finished' && da.status !== 'cancelled' && (
        <SpecialActions game={game} da={da} isAdmin={isAdmin} isCreditor={isCreditor} />
      )}

      {/* Финал */}
      {da.status === 'finished' && (
        <FinalSummary da={da} />
      )}

      {/* Управление ведущего */}
      {isAdmin && da.status !== 'finished' && da.status !== 'cancelled' && (
        <AdminPanel game={game} da={da} />
      )}
    </div>
  );
}

// ---------- Шапка ----------

function Header({ da }: { da: DebtAuctionState }) {
  const total = da.lots.length;
  const sold = da.lots.filter(l => l.status === 'sold' || l.status === 'bought_by_debtor').length;
  const open = da.lots.filter(l => l.status === 'open').length;

  return (
    <div className="glass-strong gold-border p-4">
      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-gold/70">Лотов</div>
          <div className="font-mono font-bold text-gold text-lg mt-1">{total}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-emerald-400">Закрыто</div>
          <div className="font-mono font-bold text-emerald-300 text-lg mt-1">{sold}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-amber-400">Открыто</div>
          <div className="font-mono font-bold text-amber-300 text-lg mt-1">{open}</div>
        </div>
      </div>
      <div className="mt-3 text-center text-[10px] text-muted-foreground">
        Куратор · Кредитор Элиты · Взыскатель · Мондо · Наблюдатель · Селестия
      </div>
    </div>
  );
}

// ---------- Список лотов ----------

function LotsList({ game, da, isAdmin }: { game: SuperGame; da: DebtAuctionState; isAdmin: boolean }) {
  const { state } = useStore();
  if (da.lots.length === 0) {
    return (
      <div className="glass p-4 text-center text-sm text-muted-foreground">
        Лотов пока нет. Ведущий выбирает долги для аукциона.
      </div>
    );
  }
  const findP = (id: string | null | undefined) =>
    id ? state.participants.find(p => p.id === id) ?? null : null;

  return (
    <div className="glass p-4">
      <div className="section-title text-sm mb-2">📦 Лоты аукциона</div>
      <div className="space-y-2">
        {da.lots.map(lot => {
          const debtor = findP(lot.debtor_id);
          const owner = findP(lot.current_owner_id);
          const leader = findP(lot.current_bidder_id);
          const isCurrent = da.current_lot_id === lot.id;
          return (
            <div
              key={lot.id}
              className={cn(
                'p-3 rounded-xl border',
                isCurrent ? 'bg-gold/5 border-gold/40' : 'bg-card/40 border-white/8',
                (lot.status === 'sold' || lot.status === 'bought_by_debtor') && 'opacity-70',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {debtor && <CharacterIcon participant={debtor} size="xs" ringless />}
                  <div className="min-w-0">
                    <div className="text-xs font-bold truncate">
                      {debtor?.display_name ?? '???'}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      владеет {owner?.display_name ?? '—'}
                    </div>
                  </div>
                </div>
                <LotStatusChip status={lot.status} />
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1 text-[10px]">
                <div>
                  <div className="text-muted-foreground">Долг</div>
                  <Yen amount={lot.debt_amount} className="text-xs" iconClass="w-3 h-3" />
                </div>
                <div>
                  <div className="text-muted-foreground">Старт</div>
                  <Yen amount={lot.start_price} className="text-xs" iconClass="w-3 h-3" />
                </div>
                <div>
                  <div className="text-muted-foreground">Самовыкуп</div>
                  <Yen amount={lot.buyout_for_debtor} className="text-xs" iconClass="w-3 h-3" />
                </div>
              </div>
              {(lot.status === 'open' || lot.status === 'closed' || lot.status === 'sold' || lot.status === 'bought_by_debtor') && lot.current_bid > 0 && (
                <div className="mt-2 flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">
                    {leader ? `Лидер: ${leader.display_name}` : 'Ставка'}
                  </span>
                  <Yen amount={lot.current_bid} full className="text-xs" iconClass="w-3 h-3" />
                </div>
              )}
              {lot.mondo_markup_applied && (
                <div className="mt-1 text-[10px] text-fuchsia-300 italic">
                  ♦ применена надбавка Мондо
                </div>
              )}
              {isAdmin && (lot.status === 'pending' || lot.status === 'closed') && (
                <div className="mt-2 flex gap-1.5">
                  {lot.status === 'pending' && (
                    <button
                      className="btn-primary text-[10px] px-2 py-1.5 flex-1"
                      onClick={() => openLot(game, lot.id)}
                    >Открыть лот</button>
                  )}
                  {lot.status === 'closed' && lot.current_bidder_id && (
                    <button
                      className="btn-success text-[10px] px-2 py-1.5 flex-1"
                      onClick={() => sellLot(game, lot.id)}
                    >Продать победителю</button>
                  )}
                  {lot.status === 'closed' && !lot.current_bidder_id && (
                    <button
                      className="btn-secondary text-[10px] px-2 py-1.5 flex-1"
                      onClick={() => returnLot(game, lot.id)}
                    >Никто не купил</button>
                  )}
                  {lot.status === 'pending' && (
                    <button
                      className="btn-danger text-[10px] px-2 py-1.5"
                      onClick={() => cancelLot(game, lot.id)}
                    >✕</button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LotStatusChip({ status }: { status: DebtAuctionLotStatus }) {
  const map: Record<DebtAuctionLotStatus, { label: string; cls: string }> = {
    pending:          { label: 'ждёт',      cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
    open:             { label: 'торги',     cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30 animate-pulse-gold' },
    closed:           { label: 'закрыт',    cls: 'bg-purple-500/15 text-purple-300 border-purple-500/30' },
    sold:             { label: 'продан',    cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
    bought_by_debtor: { label: 'выкуплен',  cls: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/40' },
    cancelled:        { label: 'отменён',   cls: 'bg-gray-500/15 text-gray-400 border-gray-500/30' },
    returned:         { label: 'возвращён', cls: 'bg-gray-500/15 text-gray-400 border-gray-500/30' },
  };
  const m = map[status];
  return <span className={cn('status-badge border', m.cls)}>{m.label}</span>;
}

// ---------- Активный лот: ставки и самовыкуп ----------

function ActiveLot({
  game, da, lot, currentUser, isAdmin, isCreditor,
}: {
  game: SuperGame; da: DebtAuctionState; lot: DebtAuctionLot;
  currentUser: Participant | null;
  isAdmin: boolean;
  isCreditor: boolean;
}) {
  const { state } = useStore();
  const debtor = state.participants.find(p => p.id === lot.debtor_id) ?? null;
  const owner = state.participants.find(p => p.id === lot.current_owner_id) ?? null;
  const leader = state.participants.find(p => p.id === lot.current_bidder_id) ?? null;

  const minBid = nextMinBid(lot.current_bid, lot.start_price);
  const isDebtor = !!currentUser && currentUser.id === lot.debtor_id;
  const buyoutAvailable = isDebtor && canSelfBuyout(lot.current_bid, lot.buyout_for_debtor);
  const canPlayerBid = !!currentUser && isPlayer(currentUser) && lot.status === 'open';

  return (
    <div className="glass-strong gold-border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-heading text-lg font-bold text-gradient-gold">Текущий лот</div>
        <LotStatusChip status={lot.status} />
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="p-2 rounded-xl bg-card/40">
          <div className="text-[10px] text-muted-foreground">Должник</div>
          {debtor ? (
            <div className="flex items-center gap-2 mt-1">
              <CharacterIcon participant={debtor} size="xs" ringless />
              <span className="font-bold truncate">{debtor.display_name}</span>
            </div>
          ) : <span className="italic">—</span>}
        </div>
        <div className="p-2 rounded-xl bg-card/40">
          <div className="text-[10px] text-muted-foreground">Текущий владелец</div>
          {owner ? (
            <div className="flex items-center gap-2 mt-1">
              <CharacterIcon participant={owner} size="xs" ringless />
              <span className="font-bold truncate">{owner.display_name}</span>
            </div>
          ) : <span className="italic">—</span>}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="p-2 rounded-xl bg-card/40">
          <div className="text-[10px] text-muted-foreground">Сумма долга</div>
          <Yen amount={lot.debt_amount} full className="text-sm" iconClass="w-3 h-3" />
        </div>
        <div className="p-2 rounded-xl bg-card/40">
          <div className="text-[10px] text-muted-foreground">Старт</div>
          <Yen amount={lot.start_price} full className="text-sm" iconClass="w-3 h-3" />
        </div>
        <div className="p-2 rounded-xl bg-card/40">
          <div className="text-[10px] text-muted-foreground">Самовыкуп</div>
          <Yen amount={lot.buyout_for_debtor} full className="text-sm" iconClass="w-3 h-3" />
        </div>
      </div>

      {/* Текущая ставка */}
      <div className="p-3 rounded-xl bg-gold/5 border border-gold/30">
        <div className="text-[10px] uppercase tracking-widest text-gold/80">Текущая ставка</div>
        {lot.current_bid > 0 ? (
          <div className="flex items-center gap-2 mt-1">
            {leader && <CharacterIcon participant={leader} size="xs" ringless />}
            <div className="flex-1 truncate font-bold text-sm">{leader?.display_name ?? 'Лидер'}</div>
            <Yen amount={lot.current_bid} full className="text-base text-gold" iconClass="w-4 h-4" />
          </div>
        ) : (
          <div className="text-sm italic text-muted-foreground mt-1">ставок нет, минимум — стартовая</div>
        )}
      </div>

      {/* История ставок (последние 5) */}
      {lot.bids.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground py-1">История ставок ({lot.bids.length})</summary>
          <div className="mt-1 space-y-1 max-h-40 overflow-y-auto">
            {lot.bids.slice().reverse().slice(0, 30).map(b => {
              const bidder = state.participants.find(p => p.id === b.bidder_id);
              return (
                <div key={b.id} className="flex items-center gap-2 px-2 py-1 rounded-lg bg-card/30 text-[11px]">
                  {bidder && <CharacterIcon participant={bidder} size="xs" ringless />}
                  <span className="flex-1 truncate">{bidder?.display_name ?? b.bidder_id}</span>
                  <Yen amount={b.amount} full className="text-[11px]" iconClass="w-3 h-3" />
                </div>
              );
            })}
          </div>
        </details>
      )}

      {/* Действия игрока */}
      {canPlayerBid && currentUser && !isDebtor && (
        <BidForm game={game} lot={lot} currentUserId={currentUser.id} minBid={minBid} />
      )}

      {/* Самовыкуп должника */}
      {isDebtor && lot.status === 'open' && (
        <div className="space-y-2">
          {buyoutAvailable ? (
            <button
              className="btn-success w-full text-xs"
              onClick={() => doSelfBuyout(game, lot.id, currentUser!.id)}
            >
              💚 Выкупить свой долг за <Yen amount={lot.buyout_for_debtor} full className="inline" iconClass="w-3 h-3" />
            </button>
          ) : (
            <div className="text-[11px] text-amber-300/80 text-center italic">
              Самовыкуп недоступен — текущая ставка превысила цену самовыкупа. Перебивайте как обычный участник.
            </div>
          )}
          {canPlayerBid && (
            <BidForm game={game} lot={lot} currentUserId={currentUser!.id} minBid={minBid} />
          )}
        </div>
      )}
    </div>
  );
}

function BidForm({
  game, lot, currentUserId, minBid,
}: { game: SuperGame; lot: DebtAuctionLot; currentUserId: string; minBid: number }) {
  const [amount, setAmount] = useState<number>(minBid);
  // Если текущая ставка изменилась снаружи — сдвигаем поле
  useEffect(() => { setAmount(prev => Math.max(prev, minBid)); }, [minBid]);

  return (
    <div className="space-y-2">
      <div className="text-[11px] text-muted-foreground">
        Минимальная ставка: <Yen amount={minBid} full className="inline" iconClass="w-3 h-3" />.
        Шаг: 50 000.
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <input
          type="number"
          step={50_000}
          min={minBid}
          value={amount}
          onChange={e => setAmount(Math.max(minBid, Number(e.target.value)))}
          className="input-field font-mono text-sm"
        />
        <button
          className="btn-primary text-xs px-4"
          onClick={() => placeBid(game, lot.id, currentUserId, Math.max(minBid, amount))}
        >
          Ставить
        </button>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {[minBid, minBid + 100_000, minBid + 250_000, minBid + 500_000].map(v => (
          <button
            key={v}
            onClick={() => setAmount(v)}
            className="px-1 py-1.5 text-[10px] rounded-lg bg-card/60 border border-white/8 font-mono active:bg-white/5"
          >
            {(v / 1000).toFixed(0)}K
          </button>
        ))}
      </div>
    </div>
  );
}

async function placeBid(game: SuperGame, lotId: string, bidderId: string, amount: number) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  const idx = cur.lots.findIndex(l => l.id === lotId);
  if (idx < 0) return;
  const lot = cur.lots[idx];
  if (lot.status !== 'open') return;
  const minNext = nextMinBid(lot.current_bid, lot.start_price);
  if (amount < minNext) return;

  // Проверка: у игрока хватит денег на момент ставки. Деньги списываем только победителю в sellLot.
  const { data: bidder } = await sb.from('participants').select('balance').eq('id', bidderId).single();
  if (!bidder || (bidder.balance ?? 0) < amount) return;

  const bid: DebtAuctionBid = {
    id: 'b-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
    bidder_id: bidderId,
    amount,
    created_at: new Date().toISOString(),
  };
  const lots = [...cur.lots];
  lots[idx] = {
    ...lot,
    current_bid: amount,
    current_bidder_id: bidderId,
    bids: [...lot.bids, bid],
  };
  await writeState(game.id, { ...cur, lots });
}

// ---------- Самовыкуп ----------

async function doSelfBuyout(game: SuperGame, lotId: string, debtorId: string) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  const lot = cur.lots.find(l => l.id === lotId);
  if (!lot) return;
  if (!canSelfBuyout(lot.current_bid, lot.buyout_for_debtor)) return;
  if (lot.status !== 'open') return;

  const link = `/super-games/${game.id}`;
  // Должник платит сумму самовыкупа текущему владельцу долга (или Казне).
  const ok = await applyTransfer(debtorId, lot.current_owner_id, lot.buyout_for_debtor,
    `Самовыкуп долга на «Аукционе долгов»`, link);
  if (!ok.ok) return;

  // Закрываем долг
  await sb.from('debts').update({ status: 'paid' }).eq('id', lot.debt_id);

  // Обновляем лот
  const idx = cur.lots.findIndex(l => l.id === lot.id);
  const lots = [...cur.lots];
  lots[idx] = {
    ...lot,
    status: 'bought_by_debtor',
    current_bid: lot.buyout_for_debtor,
    current_bidder_id: debtorId,
    closed_at: new Date().toISOString(),
  };
  await writeState(game.id, { ...cur, lots, current_lot_id: null });

  await pushEvent(
    `Должник выкупил собственный долг`,
    `Сумма самовыкупа: ${new Intl.NumberFormat('ru-RU').format(lot.buyout_for_debtor)}.`,
    link,
  );
  await logHistory(debtorId, 'debt_auction_self_buyout',
    `Самовыкуп долга на «Аукционе долгов»`,
    -lot.buyout_for_debtor, link);
}

// ---------- Спецдействия ----------

function SpecialActions({
  game, da, isAdmin, isCreditor,
}: { game: SuperGame; da: DebtAuctionState; isAdmin: boolean; isCreditor: boolean }) {
  return (
    <div className="glass p-4 space-y-2">
      <div className="text-[10px] uppercase tracking-widest text-gold/70">⚜️ Спецдействия (1 раз каждое)</div>
      <div className="grid grid-cols-1 gap-2">
        <MondoMarkupAction game={game} da={da} isAdmin={isAdmin} />
        <CreditorLoanAction game={game} da={da} isAdmin={isAdmin} isCreditor={isCreditor} />
        <CelestiaTreasuryHandAction game={game} da={da} isAdmin={isAdmin} />
      </div>
    </div>
  );
}

function MondoMarkupAction({ game, da, isAdmin }: { game: SuperGame; da: DebtAuctionState; isAdmin: boolean }) {
  const [picking, setPicking] = useState(false);

  if (da.mondo_markup_used) {
    return (
      <div className="p-2 rounded-xl bg-card/30 text-[11px] text-muted-foreground">
        ♦ Коллекторская надбавка Мондо · использована
      </div>
    );
  }
  if (!isAdmin) return null;

  const candidates = da.lots.filter(l => l.status === 'pending');

  return (
    <div className="p-2 rounded-xl bg-fuchsia-500/5 border border-fuchsia-500/30">
      <div className="flex items-center justify-between">
        <div className="text-[11px]">
          <div className="font-bold text-fuchsia-300">♦ Коллекторская надбавка Мондо</div>
          <div className="text-muted-foreground text-[10px]">+20% к сумме одного лота до открытия торгов</div>
        </div>
        {!picking ? (
          <button
            className="btn-secondary text-[10px] px-2 py-1.5"
            disabled={candidates.length === 0}
            onClick={() => setPicking(true)}
          >Применить</button>
        ) : (
          <button
            className="text-[10px] text-muted-foreground px-2 py-1.5"
            onClick={() => setPicking(false)}
          >Отмена</button>
        )}
      </div>
      {picking && candidates.length > 0 && (
        <MondoMarkupPicker game={game} lots={candidates} onClose={() => setPicking(false)} />
      )}
    </div>
  );
}

function MondoMarkupPicker({
  game, lots, onClose,
}: { game: SuperGame; lots: DebtAuctionLot[]; onClose: () => void }) {
  const { state } = useStore();
  return (
    <div className="mt-2 space-y-1">
      {lots.map(lot => {
        const debtor = state.participants.find(p => p.id === lot.debtor_id);
        return (
          <button
            key={lot.id}
            className="w-full flex items-center gap-2 p-1.5 rounded-lg bg-card/40 border border-white/8 active:bg-white/5 text-left text-xs"
            onClick={() => applyMondoMarkupTo(game, lot.id).then(onClose)}
          >
            {debtor && <CharacterIcon participant={debtor} size="xs" ringless />}
            <span className="flex-1 truncate">{debtor?.display_name ?? '???'}</span>
            <Yen amount={lot.debt_amount} className="text-[11px]" iconClass="w-3 h-3" />
            <span className="text-fuchsia-300 text-[10px]">→ {(applyMondoMarkup(lot.debt_amount) / 1000).toFixed(0)}K</span>
          </button>
        );
      })}
    </div>
  );
}

async function applyMondoMarkupTo(game: SuperGame, lotId: string) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur || cur.mondo_markup_used) return;
  const idx = cur.lots.findIndex(l => l.id === lotId);
  if (idx < 0) return;
  const lot = cur.lots[idx];
  if (lot.status !== 'pending') return;

  const newAmount = applyMondoMarkup(lot.debt_amount);
  const { startPrice, buyoutForDebtor } = priceLot(newAmount);

  // Обновим долг в БД
  await sb.from('debts').update({ amount: newAmount }).eq('id', lot.debt_id);

  const lots = [...cur.lots];
  lots[idx] = {
    ...lot,
    debt_amount: newAmount,
    start_price: startPrice,
    buyout_for_debtor: buyoutForDebtor,
    mondo_markup_applied: true,
  };
  await writeState(game.id, { ...cur, lots, mondo_markup_used: true });

  await pushEvent(
    'Мондо применил коллекторскую надбавку',
    `+20% к долгу. Новая сумма: ${new Intl.NumberFormat('ru-RU').format(newAmount)}.`,
    `/super-games/${game.id}`,
  );
}

function CreditorLoanAction({
  game, da, isAdmin, isCreditor,
}: { game: SuperGame; da: DebtAuctionState; isAdmin: boolean; isCreditor: boolean }) {
  const [open, setOpen] = useState(false);
  const [borrowerId, setBorrowerId] = useState<string>('');
  const [amount, setAmount] = useState<number>(500_000);
  const { state } = useStore();
  const eligible = state.participants.filter(p => isPlayer(p) && p.is_active);

  if (da.creditor_loan_used) {
    return (
      <div className="p-2 rounded-xl bg-card/30 text-[11px] text-muted-foreground">
        ⚱ Срочный заём Кредитора · использован
      </div>
    );
  }
  // Кнопкой может пользоваться и Кредитор, и админ
  if (!isAdmin && !isCreditor) return null;

  return (
    <div className="p-2 rounded-xl bg-blue-500/5 border border-blue-500/30">
      <div className="flex items-center justify-between">
        <div className="text-[11px]">
          <div className="font-bold text-blue-300">⚱ Срочный заём Кредитора</div>
          <div className="text-muted-foreground text-[10px]">≤ 500 000 любому, к возврату ×1.2</div>
        </div>
        {!open ? (
          <button className="btn-secondary text-[10px] px-2 py-1.5" onClick={() => setOpen(true)}>Создать</button>
        ) : (
          <button className="text-[10px] text-muted-foreground px-2 py-1.5" onClick={() => setOpen(false)}>Отмена</button>
        )}
      </div>
      {open && (
        <div className="mt-2 space-y-2">
          <select
            value={borrowerId}
            onChange={e => setBorrowerId(e.target.value)}
            className="input-field text-xs"
          >
            <option value="">— выбрать получателя —</option>
            {eligible.map(p => (
              <option key={p.id} value={p.id}>{p.display_name}</option>
            ))}
          </select>
          <input
            type="number"
            min={50_000}
            max={CREDITOR_EMERGENCY_LOAN_MAX}
            step={50_000}
            value={amount}
            onChange={e => setAmount(Math.min(CREDITOR_EMERGENCY_LOAN_MAX, Math.max(50_000, Number(e.target.value))))}
            className="input-field font-mono text-xs"
          />
          <div className="text-[10px] text-muted-foreground">
            К возврату: <Yen amount={emergencyLoanRepayment(amount)} full className="inline" iconClass="w-3 h-3" />
          </div>
          <button
            className="btn-primary w-full text-xs"
            disabled={!borrowerId || amount <= 0}
            onClick={() => createEmergencyLoan(game, borrowerId, amount).then(() => setOpen(false))}
          >Выдать заём</button>
        </div>
      )}
    </div>
  );
}

async function createEmergencyLoan(game: SuperGame, borrowerId: string, amount: number) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur || cur.creditor_loan_used) return;

  const link = `/super-games/${game.id}`;
  const repayment = emergencyLoanRepayment(amount);

  // Деньги выдаются из Казны (системно). Возврат — в Казну как кредитора.
  await payoutFromTreasury(borrowerId, amount,
    `Срочный заём Кредитора: ${amount} (к возврату ${repayment})`, link);

  // Создаём долг
  const debtId = 'd-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  await sb.from('debts').insert({
    id: debtId,
    debtor_id: borrowerId,
    creditor_id: TREASURY_ID,
    amount: repayment,
    description: `Срочный заём Кредитора · к возврату ${repayment} · взыскатель: Мондо · игра ${game.id}`,
    due_day: 7,
    status: 'active',
    initiator: 'creditor',
  });

  await writeState(game.id, { ...cur, creditor_loan_used: true });
  await pushEvent(
    `Кредитор Элиты выдал срочный заём`,
    `Сумма ${amount}, к возврату ${repayment}.`,
    link,
  );
  await logHistory(borrowerId, 'emergency_loan',
    `Срочный заём Кредитора: получено ${amount}, к возврату ${repayment}`,
    amount, link);
}

function CelestiaTreasuryHandAction({
  game, da, isAdmin,
}: { game: SuperGame; da: DebtAuctionState; isAdmin: boolean }) {
  if (da.celestia_treasury_hand_used) {
    return (
      <div className="p-2 rounded-xl bg-card/30 text-[11px] text-muted-foreground">
        🕊️ Рука студсовета · использована
      </div>
    );
  }
  if (!isAdmin) return null;

  const lot = da.lots.find(l => l.id === da.current_lot_id);
  const canUse = lot && lot.status === 'open' && lot.current_bid > 0;
  const overbid = lot ? celestiaOverbidAmount(lot.current_bid) : 0;

  return (
    <div className="p-2 rounded-xl bg-emerald-500/5 border border-emerald-500/30">
      <div className="flex items-center justify-between">
        <div className="text-[11px]">
          <div className="font-bold text-emerald-300">🕊️ Рука студсовета</div>
          <div className="text-muted-foreground text-[10px]">
            Казна перебивает текущую ставку (+100k) и забирает лот. Долг возвращается под Казну.
          </div>
        </div>
        <button
          className="btn-secondary text-[10px] px-2 py-1.5"
          disabled={!canUse}
          onClick={() => useCelestiaHand(game).then(() => {})}
        >
          {canUse ? `Перебить за ${(overbid / 1000).toFixed(0)}K` : 'Нет лота'}
        </button>
      </div>
    </div>
  );
}

async function useCelestiaHand(game: SuperGame) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur || cur.celestia_treasury_hand_used) return;
  const idx = cur.lots.findIndex(l => l.id === cur.current_lot_id);
  if (idx < 0) return;
  const lot = cur.lots[idx];
  if (lot.status !== 'open' || lot.current_bid <= 0) return;

  const overbid = celestiaOverbidAmount(lot.current_bid);
  const bid: DebtAuctionBid = {
    id: 'b-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
    bidder_id: TREASURY_ID,
    amount: overbid,
    created_at: new Date().toISOString(),
  };
  const lots = [...cur.lots];
  lots[idx] = {
    ...lot,
    current_bid: overbid,
    current_bidder_id: TREASURY_ID,
    bids: [...lot.bids, bid],
  };
  await writeState(game.id, { ...cur, lots, celestia_treasury_hand_used: true });

  await pushEvent(
    'Селестия использовала «Руку студсовета»',
    `Казна перебила ставку до ${new Intl.NumberFormat('ru-RU').format(overbid)}.`,
    `/super-games/${game.id}`,
  );
}

// ---------- Финал ----------

function FinalSummary({ da }: { da: DebtAuctionState }) {
  const { state } = useStore();
  const sold = da.lots.filter(l => l.status === 'sold');
  const bought = da.lots.filter(l => l.status === 'bought_by_debtor');
  const totalSpent = [...sold, ...bought].reduce((acc, l) => acc + l.current_bid, 0);
  const biggestBuy = [...sold, ...bought].reduce((m, l) => Math.max(m, l.current_bid), 0);

  // Топ владельцев новых долгов
  const ownerCount: Record<string, number> = {};
  for (const l of sold) {
    if (l.current_bidder_id) ownerCount[l.current_bidder_id] = (ownerCount[l.current_bidder_id] ?? 0) + 1;
  }
  const topOwnerId = Object.entries(ownerCount).sort((a, b) => b[1] - a[1])[0]?.[0];
  const topOwner = topOwnerId ? state.participants.find(p => p.id === topOwnerId) : null;

  return (
    <div className="glass-strong gold-border p-5 text-center">
      <div className="text-[10px] uppercase tracking-widest text-gold/70">Аукцион завершён</div>
      <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
        <div className="p-2 rounded-xl bg-card/40">
          <div className="text-[10px] text-muted-foreground">Продано лотов</div>
          <div className="font-bold text-base">{sold.length}</div>
        </div>
        <div className="p-2 rounded-xl bg-card/40">
          <div className="text-[10px] text-muted-foreground">Самовыкупов</div>
          <div className="font-bold text-base">{bought.length}</div>
        </div>
        <div className="p-2 rounded-xl bg-card/40">
          <div className="text-[10px] text-muted-foreground">Всего потрачено</div>
          <Yen amount={totalSpent} full className="text-sm" iconClass="w-3 h-3" />
        </div>
        <div className="p-2 rounded-xl bg-card/40">
          <div className="text-[10px] text-muted-foreground">Самая дорогая</div>
          <Yen amount={biggestBuy} full className="text-sm" iconClass="w-3 h-3" />
        </div>
      </div>
      {topOwner && (
        <div className="mt-3 p-2 rounded-xl bg-gold/10 border border-gold/40">
          <div className="text-[10px] text-gold/80 uppercase tracking-widest">Крупнейший новый владелец</div>
          <div className="flex items-center justify-center gap-2 mt-1">
            <CharacterIcon participant={topOwner} size="xs" ringless />
            <span className="font-bold text-sm">{topOwner.display_name}</span>
            <span className="text-[10px] text-muted-foreground">— {ownerCount[topOwner.id]} долг(ов)</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Админ-панель ----------

function AdminPanel({ game, da }: { game: SuperGame; da: DebtAuctionState }) {
  return (
    <div className="glass-strong gold-border p-4 space-y-2">
      <div className="text-[10px] uppercase tracking-widest text-gold/70">⚙️ Управление ведущего</div>
      <AddLotsBlock game={game} da={da} />
      <div className="grid grid-cols-2 gap-2">
        <button
          className="btn-success text-xs"
          onClick={() => finishAuction(game)}
        >🏁 Завершить аукцион</button>
        <button
          className="btn-danger text-xs"
          onClick={() => cancelAuction(game)}
        >Отменить аукцион</button>
      </div>
    </div>
  );
}

function AddLotsBlock({ game, da }: { game: SuperGame; da: DebtAuctionState }) {
  const { state } = useStore();
  const [open, setOpen] = useState(false);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      const sb = getSupabase();
      if (!sb) return;
      const { data } = await sb.from('debts').select('*')
        .in('status', ['active', 'overdue', 'requested'])
        .order('amount', { ascending: false });
      if (alive) setDebts((data ?? []) as Debt[]);
    })();
    return () => { alive = false; };
  }, [open]);

  const usedDebtIds = new Set(da.lots.map(l => l.debt_id));
  const available = debts.filter(d => !usedDebtIds.has(d.id));

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const create = async () => {
    if (selected.size === 0) return;
    setBusy(true);
    const sb = getSupabase();
    if (!sb) return;
    const cur = await readState(game.id);
    if (!cur) return;

    const newLots: DebtAuctionLot[] = [];
    const link = `/super-games/${game.id}`;

    for (const d of debts.filter(x => selected.has(x.id))) {
      const { startPrice, buyoutForDebtor } = priceLot(d.amount);
      const lotId = 'l-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
      newLots.push({
        id: lotId,
        debt_id: d.id,
        debtor_id: d.debtor_id,
        current_owner_id: d.creditor_id,
        collector_id: MONDO_ID,
        debt_amount: d.amount,
        start_price: startPrice,
        buyout_for_debtor: buyoutForDebtor,
        current_bid: 0,
        current_bidder_id: null,
        bids: [],
        status: 'pending',
        mondo_markup_applied: false,
      });
      // Помечаем долг как auctioned, чтобы он не висел в обычной системе
      await sb.from('debts').update({ status: 'auctioned' }).eq('id', d.id);
    }

    await writeState(game.id, { ...cur, lots: [...cur.lots, ...newLots], status: 'preparing_lots' });
    await pushEvent(
      `Аукцион долгов · добавлено лотов: ${newLots.length}`,
      undefined, link,
    );

    setBusy(false);
    setOpen(false);
    setSelected(new Set());
  };

  return (
    <div>
      {!open ? (
        <button className="btn-primary w-full text-xs" onClick={() => setOpen(true)}>
          + Добавить долги в аукцион
        </button>
      ) : (
        <div className="glass p-2 mt-1 space-y-2 animate-slide-down">
          <div className="text-[11px] text-muted-foreground">
            Доступно долгов: {available.length}. Выбрано: {selected.size}.
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1">
            {available.length === 0 && (
              <div className="text-[11px] italic text-muted-foreground">Активных долгов нет.</div>
            )}
            {available.map(d => {
              const debtor = state.participants.find(p => p.id === d.debtor_id);
              const owner = state.participants.find(p => p.id === d.creditor_id);
              return (
                <label key={d.id} className="flex items-center gap-2 p-1.5 rounded-lg cursor-pointer bg-card/40 active:bg-white/5">
                  <input
                    type="checkbox"
                    checked={selected.has(d.id)}
                    onChange={() => toggle(d.id)}
                    className="w-4 h-4 accent-gold"
                  />
                  {debtor && <CharacterIcon participant={debtor} size="xs" ringless />}
                  <span className="flex-1 text-xs truncate">
                    {debtor?.display_name ?? d.debtor_id} → {owner?.display_name ?? d.creditor_id}
                  </span>
                  <Yen amount={d.amount} className="text-[10px] text-muted-foreground" iconClass="w-3 h-3" />
                  {d.status === 'overdue' && (
                    <span className="text-[10px] text-red-300">просрочен</span>
                  )}
                </label>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-secondary text-xs" onClick={() => setOpen(false)}>Отмена</button>
            <button
              className="btn-primary text-xs"
              disabled={busy || selected.size === 0}
              onClick={create}
            >Создать лоты</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Действия с лотом (открыть/продать/возврат/отмена) ----------

async function openLot(game: SuperGame, lotId: string) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  // Закрываем все остальные открытые лоты
  const lots = cur.lots.map(l => {
    if (l.id === lotId) return { ...l, status: 'open' as DebtAuctionLotStatus, opened_at: new Date().toISOString() };
    if (l.status === 'open') return { ...l, status: 'closed' as DebtAuctionLotStatus, closed_at: new Date().toISOString() };
    return l;
  });
  await writeState(game.id, { ...cur, lots, current_lot_id: lotId, status: 'lot_open' });
  await pushEvent('Аукцион долгов · открыт новый лот', undefined, `/super-games/${game.id}`);
}

async function sellLot(game: SuperGame, lotId: string) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  const idx = cur.lots.findIndex(l => l.id === lotId);
  if (idx < 0) return;
  const lot = cur.lots[idx];
  if (!lot.current_bidder_id || lot.current_bid <= 0) return;

  const link = `/super-games/${game.id}`;

  // Проводим оплату: победитель → текущему владельцу долга
  await applyTransfer(lot.current_bidder_id, lot.current_owner_id, lot.current_bid,
    `Покупка долга на аукционе`, link);

  // Меняем владельца долга в БД (creditor_id = новый владелец)
  await sb.from('debts').update({
    creditor_id: lot.current_bidder_id,
    status: 'active',
    description: `Куплен на «Аукционе долгов» · взыскатель: Мондо · игра ${game.id}`,
  }).eq('id', lot.debt_id);

  const lots = [...cur.lots];
  lots[idx] = {
    ...lot,
    status: 'sold',
    closed_at: new Date().toISOString(),
  };
  await writeState(game.id, { ...cur, lots, current_lot_id: null });

  await pushEvent('Долг продан на аукционе',
    `Сумма сделки: ${new Intl.NumberFormat('ru-RU').format(lot.current_bid)}.`,
    link);
  await logHistory(lot.current_bidder_id, 'debt_auction_buy',
    `Покупка долга на аукционе`, -lot.current_bid, link);
}

async function returnLot(game: SuperGame, lotId: string) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  const idx = cur.lots.findIndex(l => l.id === lotId);
  if (idx < 0) return;
  const lot = cur.lots[idx];

  // Возвращаем долг в обычное состояние active
  await sb.from('debts').update({ status: 'active' }).eq('id', lot.debt_id);

  const lots = [...cur.lots];
  lots[idx] = { ...lot, status: 'returned', closed_at: new Date().toISOString() };
  await writeState(game.id, { ...cur, lots, current_lot_id: null });

  await pushEvent('Лот не продан и возвращён владельцу', undefined, `/super-games/${game.id}`);
}

async function cancelLot(game: SuperGame, lotId: string) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  const idx = cur.lots.findIndex(l => l.id === lotId);
  if (idx < 0) return;
  const lot = cur.lots[idx];
  await sb.from('debts').update({ status: 'active' }).eq('id', lot.debt_id);
  const lots = [...cur.lots];
  lots[idx] = { ...lot, status: 'cancelled' };
  await writeState(game.id, { ...cur, lots });
}

async function finishAuction(game: SuperGame) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;

  // Возвращаем все нерешённые лоты владельцам
  const lots = cur.lots.map(l => {
    if (l.status === 'pending' || l.status === 'open' || l.status === 'closed') {
      // долг возвращаем в active
      sb.from('debts').update({ status: 'active' }).eq('id', l.debt_id);
      return { ...l, status: 'returned' as DebtAuctionLotStatus, closed_at: new Date().toISOString() };
    }
    return l;
  });

  await sb.from('super_games').update({
    state: { ...cur, lots, current_lot_id: null, status: 'finished' },
    status: 'finished',
  }).eq('id', game.id);

  const sold = lots.filter(l => l.status === 'sold').length;
  const bought = lots.filter(l => l.status === 'bought_by_debtor').length;
  const biggest = lots.reduce((m, l) => l.status === 'sold' || l.status === 'bought_by_debtor' ? Math.max(m, l.current_bid) : m, 0);

  await pushEvent(
    'Аукцион долгов завершён',
    `Продано: ${sold}, выкуплено должниками: ${bought}, самая дорогая сделка: ${new Intl.NumberFormat('ru-RU').format(biggest)}.`,
    `/super-games/${game.id}`,
  );
}

async function cancelAuction(game: SuperGame) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  // Возвращаем все долги в active
  for (const l of cur.lots) {
    await sb.from('debts').update({ status: 'active' }).eq('id', l.debt_id);
  }
  await sb.from('super_games').update({
    state: { ...cur, status: 'cancelled' },
    status: 'cancelled',
  }).eq('id', game.id);
  await pushEvent('Аукцион долгов отменён', 'Все долги возвращены в обычный статус.', `/super-games/${game.id}`);
}
