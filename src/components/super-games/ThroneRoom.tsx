'use client';

// ===========================================================================
// «Трон Селестии» — финальная супер-игра.
// Селестия (p-queen) против Претендента, остальные выбирают сторону.
// 10 раундов карт (Император / Гражданин / Питомец) + sudden death при ничьей.
// Привилегия Селестии «Королевский регламент» (1 раз).
// Преимущества сторон покупаются из фондов.
// ===========================================================================

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/lib/store/StoreProvider';
import { CharacterIcon } from '@/components/ui/CharacterIcon';
import { Yen } from '@/components/ui/Yen';
import { cn, isPlayer } from '@/lib/utils';
import { getSupabase } from '@/lib/supabase/client';
import { chargeToTreasury, payoutFromTreasury, TREASURY_ID } from '@/lib/store/tx';
import {
  CELESTIA_FINAL_STAKE, CHALLENGER_FINAL_STAKE,
  PEEK_CARD_COST, CHANGE_CARD_COST, REPLAY_LOSS_COST, BLOCK_CELESTIA_PRIVILEGE_COST,
  TOTAL_ROUNDS, HALF_ROUNDS,
  initialDeckForPhase, resolveCardDuel, resolveSuddenDeath, phaseOfRound,
} from '@/lib/throne/logic';
import type {
  SuperGame, Participant,
  ThroneState, ThroneRound, ThroneCard, ThroneSide,
  ThroneAdvantageType, ThroneFundContribution, ThroneAdvantagePurchase,
  CelestiaPrivilegeAction,
} from '@/lib/store/types';

const QUEEN_ID = 'p-queen';

// ---------- helpers ----------

function getState(g: SuperGame): ThroneState {
  const s = (g.state || {}) as Partial<ThroneState>;
  return {
    celestia_id: s.celestia_id ?? QUEEN_ID,
    challenger_id: s.challenger_id ?? '',
    celestia_supporter_ids: s.celestia_supporter_ids ?? [],
    challenger_supporter_ids: s.challenger_supporter_ids ?? [],
    neutral_ids: s.neutral_ids ?? [],
    celestia_fund: s.celestia_fund ?? 0,
    challenger_fund: s.challenger_fund ?? 0,
    celestia_score: s.celestia_score ?? 0,
    challenger_score: s.challenger_score ?? 0,
    current_round: s.current_round ?? 0,
    total_rounds: s.total_rounds ?? TOTAL_ROUNDS,
    rounds: s.rounds ?? [],
    contributions: s.contributions ?? [],
    purchases: s.purchases ?? [],
    celestia_privilege_used: s.celestia_privilege_used ?? false,
    block_celestia_next_round: s.block_celestia_next_round ?? false,
    replay_used_celestia: s.replay_used_celestia ?? false,
    replay_used_challenger: s.replay_used_challenger ?? false,
    winner: s.winner ?? null,
    final_outcome: s.final_outcome ?? null,
    status: s.status ?? 'scheduled',
  };
}

async function readState(gameId: string): Promise<ThroneState | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.from('super_games').select('state').eq('id', gameId).single();
  return (data?.state as ThroneState) ?? null;
}

async function writeState(gameId: string, next: ThroneState, extra?: Partial<SuperGame>) {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from('super_games').update({ state: next, ...(extra ?? {}) }).eq('id', gameId);
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

function sideOf(playerId: string, st: ThroneState): ThroneSide | 'neutral' | null {
  if (playerId === st.celestia_id) return 'celestia';
  if (playerId === st.challenger_id) return 'challenger';
  if (st.celestia_supporter_ids.includes(playerId)) return 'celestia';
  if (st.challenger_supporter_ids.includes(playerId)) return 'challenger';
  if (st.neutral_ids.includes(playerId)) return 'neutral';
  return null;
}

// ===========================================================================

export function ThroneRoom({ game }: { game: SuperGame }) {
  const { state, currentUser, role } = useStore();
  const isAdmin = role === 'gm' || role === 'queen';
  const th = getState(game);

  const celestia = state.participants.find(p => p.id === th.celestia_id) ?? null;
  const challenger = state.participants.find(p => p.id === th.challenger_id) ?? null;

  const isCelestia = !!currentUser && currentUser.id === th.celestia_id;
  const isChallenger = !!currentUser && currentUser.id === th.challenger_id;
  const mySide = currentUser ? sideOf(currentUser.id, th) : null;

  const currentRound: ThroneRound | null =
    th.current_round > 0 ? th.rounds[th.current_round - 1] ?? null : null;

  return (
    <div className="space-y-4">
      <Header th={th} celestia={celestia} challenger={challenger} />

      {/* Стороны и фонды */}
      <SidesBlock
        game={game} th={th}
        currentUserId={currentUser?.id ?? null}
        mySide={mySide as ThroneSide | 'neutral' | null}
      />

      {/* Текущий раунд */}
      {currentRound && th.status !== 'finished' && th.status !== 'cancelled' && (
        <RoundView
          game={game} th={th} round={currentRound}
          isCelestia={isCelestia} isChallenger={isChallenger}
          mySide={mySide as ThroneSide | 'neutral' | null}
          isAdmin={isAdmin}
        />
      )}

      {/* Финальный выбор Претендента */}
      {th.status === 'final_choice' && (
        <FinalChoiceBlock game={game} th={th} isChallenger={isChallenger} isAdmin={isAdmin} />
      )}

      {/* Финал */}
      {th.status === 'finished' && (
        <FinishedView th={th} celestia={celestia} challenger={challenger} game={game} isAdmin={isAdmin} />
      )}

      {/* История раундов */}
      {th.rounds.some(r => r.status === 'resolved') && (
        <RoundsHistory th={th} celestia={celestia} challenger={challenger} />
      )}

      {/* Админ */}
      {isAdmin && th.status !== 'finished' && th.status !== 'cancelled' && (
        <AdminPanel game={game} th={th} />
      )}
    </div>
  );
}

// ---------- Шапка ----------

function Header({
  th, celestia, challenger,
}: { th: ThroneState; celestia: Participant | null; challenger: Participant | null }) {
  return (
    <div className="glass-strong gold-border p-4">
      <div className="grid grid-cols-3 gap-3 items-center">
        <div className="text-center">
          {celestia && <CharacterIcon participant={celestia} size="md" />}
          <div className="font-bold text-sm mt-1">{celestia?.display_name ?? 'Селестия'}</div>
          <div className="font-mono font-bold text-gold text-2xl mt-0.5">{th.celestia_score}</div>
        </div>
        <div className="text-center">
          <div className="text-[10px] uppercase tracking-widest text-gold/70">Раунд</div>
          <div className="font-mono font-bold text-gold text-lg mt-1">
            {th.current_round > 0 ? `${th.current_round}/${TOTAL_ROUNDS}` : `0/${TOTAL_ROUNDS}`}
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">
            {th.celestia_privilege_used ? 'привилегия исп.' : 'привилегия доступна'}
          </div>
        </div>
        <div className="text-center">
          {challenger
            ? <CharacterIcon participant={challenger} size="md" />
            : <div className="w-12 h-12 mx-auto rounded-full bg-card/40 border border-white/8 flex items-center justify-center text-2xl">?</div>}
          <div className="font-bold text-sm mt-1">{challenger?.display_name ?? 'Претендент'}</div>
          <div className="font-mono font-bold text-gold text-2xl mt-0.5">{th.challenger_score}</div>
        </div>
      </div>
      <div className="mt-3 text-center text-[10px] text-muted-foreground">
        Ставки: Селестия — должность + <Yen amount={CELESTIA_FINAL_STAKE} className="inline" iconClass="w-3 h-3" />, Претендент — <Yen amount={CHALLENGER_FINAL_STAKE} className="inline" iconClass="w-3 h-3" />
      </div>
    </div>
  );
}

// ---------- Стороны и фонды ----------

function SidesBlock({
  game, th, currentUserId, mySide,
}: {
  game: SuperGame; th: ThroneState;
  currentUserId: string | null;
  mySide: ThroneSide | 'neutral' | null;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <SideCard side="celestia" th={th} />
      <SideCard side="challenger" th={th} />

      {/* Игрок выбирает сторону */}
      {currentUserId && th.status !== 'finished' && th.status !== 'cancelled' && (
        <SideJoiner game={game} th={th} currentUserId={currentUserId} mySide={mySide} />
      )}

      {/* Игрок вкладывается в фонд */}
      {currentUserId && (mySide === 'celestia' || mySide === 'challenger') && (th.status === 'fund_collection' || th.status === 'side_selection' || th.status === 'card_selection' || th.status === 'advantage_phase' || th.status === 'reveal' || th.status === 'round_result' || th.status === 'active') && (
        <FundContributor game={game} th={th} currentUserId={currentUserId} side={mySide} />
      )}
    </div>
  );
}

function SideCard({ side, th }: { side: ThroneSide; th: ThroneState }) {
  const { state } = useStore();
  const ids = side === 'celestia' ? th.celestia_supporter_ids : th.challenger_supporter_ids;
  const fund = side === 'celestia' ? th.celestia_fund : th.challenger_fund;
  const supporters = ids.map(id => state.participants.find(p => p.id === id)).filter(Boolean) as Participant[];
  const isCel = side === 'celestia';

  return (
    <div className={cn('glass p-3 border-l-4', isCel ? 'border-fuchsia-500/60' : 'border-amber-500/60')}>
      <div className={cn('text-[10px] uppercase tracking-widest', isCel ? 'text-fuchsia-300' : 'text-amber-300')}>
        {isCel ? '♛ Сторона Селестии' : '🔥 Сторона Претендента'}
      </div>
      <div className="text-[10px] text-muted-foreground mt-1">Фонд</div>
      <Yen amount={fund} className="text-base" iconClass="w-4 h-4" />
      <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
        {supporters.map(p => (
          <div key={p.id} className="flex items-center gap-1.5 text-xs">
            <CharacterIcon participant={p} size="xs" ringless />
            <span className="truncate">{p.display_name}</span>
          </div>
        ))}
        {supporters.length === 0 && (
          <div className="text-[11px] italic text-muted-foreground">никого</div>
        )}
      </div>
    </div>
  );
}

function SideJoiner({
  game, th, currentUserId, mySide,
}: {
  game: SuperGame; th: ThroneState;
  currentUserId: string;
  mySide: ThroneSide | 'neutral' | null;
}) {
  // Дуэлянты не выбирают сторону.
  if (currentUserId === th.celestia_id || currentUserId === th.challenger_id) return null;

  return (
    <div className="col-span-2 glass p-3">
      <div className="text-[10px] uppercase tracking-widest text-gold/70 mb-2">Ваша сторона</div>
      <div className="grid grid-cols-3 gap-1.5 text-xs">
        <button
          className={cn('px-2 py-2 rounded-lg border',
            mySide === 'celestia' ? 'bg-fuchsia-500/20 border-fuchsia-500/60 text-fuchsia-200' : 'bg-card/40 border-white/8')}
          onClick={() => pickSide(game, currentUserId, 'celestia')}
        >♛ Селестия</button>
        <button
          className={cn('px-2 py-2 rounded-lg border',
            mySide === 'challenger' ? 'bg-amber-500/20 border-amber-500/60 text-amber-200' : 'bg-card/40 border-white/8')}
          onClick={() => pickSide(game, currentUserId, 'challenger')}
        >🔥 Претендент</button>
        <button
          className={cn('px-2 py-2 rounded-lg border',
            mySide === 'neutral' ? 'bg-gray-500/20 border-gray-500/60 text-gray-200' : 'bg-card/40 border-white/8')}
          onClick={() => pickSide(game, currentUserId, 'neutral')}
        >⚖️ Нейтрал</button>
      </div>
    </div>
  );
}

async function pickSide(game: SuperGame, playerId: string, side: ThroneSide | 'neutral') {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  if (playerId === cur.celestia_id || playerId === cur.challenger_id) return;
  const next: ThroneState = {
    ...cur,
    celestia_supporter_ids: cur.celestia_supporter_ids.filter(x => x !== playerId),
    challenger_supporter_ids: cur.challenger_supporter_ids.filter(x => x !== playerId),
    neutral_ids: cur.neutral_ids.filter(x => x !== playerId),
  };
  if (side === 'celestia')   next.celestia_supporter_ids.push(playerId);
  if (side === 'challenger') next.challenger_supporter_ids.push(playerId);
  if (side === 'neutral')    next.neutral_ids.push(playerId);
  await writeState(game.id, next);
}

function FundContributor({
  game, th, currentUserId, side,
}: {
  game: SuperGame; th: ThroneState; currentUserId: string; side: ThroneSide;
}) {
  const [amount, setAmount] = useState<number>(100_000);
  return (
    <div className="col-span-2 glass p-3 space-y-2">
      <div className="text-[10px] uppercase tracking-widest text-gold/80">
        Внести в Фонд {side === 'celestia' ? 'Селестии' : 'Претендента'}
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <input
          type="number" min={50_000} step={50_000}
          value={amount}
          onChange={e => setAmount(Math.max(50_000, Number(e.target.value)))}
          className="input-field font-mono text-sm"
        />
        <button
          className="btn-primary text-xs px-4"
          onClick={() => contribute(game, currentUserId, side, amount)}
        >Внести</button>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {[100_000, 250_000, 500_000, 1_000_000].map(v => (
          <button
            key={v}
            onClick={() => setAmount(v)}
            className="px-1 py-1.5 text-[10px] rounded-lg bg-card/60 border border-white/8 font-mono active:bg-white/5"
          >
            {v >= 1_000_000 ? `${v / 1_000_000}M` : `${v / 1000}K`}
          </button>
        ))}
      </div>
    </div>
  );
}

async function contribute(game: SuperGame, playerId: string, side: ThroneSide, amount: number) {
  const sb = getSupabase();
  if (!sb || amount <= 0) return;
  const res = await chargeToTreasury(playerId, amount,
    `Вклад в Фонд ${side === 'celestia' ? 'Селестии' : 'Претендента'}`,
    `/super-games/${game.id}`);
  if (!res.ok) return;

  const cur = await readState(game.id);
  if (!cur) return;
  const contrib: ThroneFundContribution = {
    id: 'tc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
    player_id: playerId, side, amount,
    created_at: new Date().toISOString(),
  };
  const next: ThroneState = {
    ...cur,
    contributions: [...cur.contributions, contrib],
    celestia_fund: side === 'celestia' ? cur.celestia_fund + amount : cur.celestia_fund,
    challenger_fund: side === 'challenger' ? cur.challenger_fund + amount : cur.challenger_fund,
  };
  await writeState(game.id, next);
}

// ---------- Раунд ----------

function RoundView({
  game, th, round, isCelestia, isChallenger, mySide, isAdmin,
}: {
  game: SuperGame; th: ThroneState; round: ThroneRound;
  isCelestia: boolean; isChallenger: boolean;
  mySide: ThroneSide | 'neutral' | null;
  isAdmin: boolean;
}) {
  return (
    <div className="glass-strong gold-border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-heading text-lg font-bold text-gradient-gold">
          Раунд {round.number}
          {round.phase === 'second_half' && <span className="text-xs text-muted-foreground ml-2">(второй блок)</span>}
          {round.phase === 'sudden_death' && <span className="text-xs text-red-300 ml-2">(Последний трон)</span>}
        </div>
        <PhaseBadge status={round.status} />
      </div>

      {/* Два слота карт */}
      <div className="grid grid-cols-2 gap-2">
        <CardSlot side="celestia" round={round} isMine={isCelestia} />
        <CardSlot side="challenger" round={round} isMine={isChallenger} />
      </div>

      {/* Мои действия */}
      {round.status === 'card_selection' && (
        <PlayerActions
          game={game} th={th} round={round}
          isCelestia={isCelestia} isChallenger={isChallenger}
        />
      )}

      {round.status === 'advantage_phase' && (
        <AdvantagePhase
          game={game} th={th} round={round}
          isCelestia={isCelestia} isChallenger={isChallenger}
        />
      )}

      {round.status === 'reveal' && (
        <div className="text-xs text-muted-foreground text-center py-2">
          Карты выбраны. Ведущий раскрывает раунд.
        </div>
      )}

      {round.status === 'resolved' && (
        <ResolvedRound round={round} />
      )}
    </div>
  );
}

function PhaseBadge({ status }: { status: ThroneRound['status'] }) {
  const map: Record<ThroneRound['status'], { label: string; cls: string }> = {
    card_selection:  { label: 'Выбор карт',     cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
    advantage_phase: { label: 'Преимущества',   cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
    reveal:          { label: 'Раскрытие',      cls: 'bg-purple-500/15 text-purple-300 border-purple-500/30' },
    resolved:        { label: 'Раскрыто',       cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  };
  const m = map[status];
  return <span className={cn('status-badge border', m.cls)}>{m.label}</span>;
}

function CardSlot({ side, round, isMine }: { side: ThroneSide; round: ThroneRound; isMine: boolean }) {
  const card = side === 'celestia' ? round.celestia_card : round.challenger_card;
  const placed = !!card;
  const reveal = round.status === 'resolved';
  const showCard = reveal || (isMine && placed);
  return (
    <div className={cn(
      'p-3 rounded-xl border text-center',
      side === 'celestia' ? 'border-fuchsia-500/30 bg-fuchsia-500/5' : 'border-amber-500/30 bg-amber-500/5',
    )}>
      <div className={cn('text-[10px] uppercase tracking-widest',
        side === 'celestia' ? 'text-fuchsia-300' : 'text-amber-300')}>
        {side === 'celestia' ? 'Селестия' : 'Претендент'}
      </div>
      <div className="mt-2 text-3xl">
        {showCard && card ? <CardEmoji card={card} /> : (placed ? '🎴' : '–')}
      </div>
      <div className="text-[10px] text-muted-foreground mt-1">
        {showCard && card ? cardName(card) : (placed ? 'выбрано' : 'не выбрано')}
      </div>
    </div>
  );
}

function CardEmoji({ card }: { card: ThroneCard }) {
  if (card === 'emperor') return <span>👑</span>;
  if (card === 'citizen') return <span>👤</span>;
  return <span>🐾</span>;
}

function cardName(card: ThroneCard): string {
  if (card === 'emperor') return 'Император';
  if (card === 'citizen') return 'Гражданин';
  return 'Питомец';
}

// ---------- Действия игроков (выбор карты) ----------

function PlayerActions({
  game, th, round, isCelestia, isChallenger,
}: {
  game: SuperGame; th: ThroneState; round: ThroneRound;
  isCelestia: boolean; isChallenger: boolean;
}) {
  if (!isCelestia && !isChallenger) return null;

  const myDeck = isCelestia ? round.celestia_deck : round.challenger_deck;
  const myCard = isCelestia ? round.celestia_card : round.challenger_card;
  const myFund = isCelestia ? th.celestia_fund : th.challenger_fund;

  // Ограничения: блокировка одной из карт Претендента → нельзя её выбрать
  const blockedForChallenger = isChallenger ? round.challenger_blocked_card : null;

  return (
    <div className="space-y-2">
      <div className="text-[11px] text-muted-foreground">
        Ваши доступные карты в этом раунде. Выбор тайный — соперник не видит до раскрытия.
      </div>
      <div className="grid grid-cols-3 gap-2">
        {(['emperor', 'citizen', 'pet'] as ThroneCard[]).map(c => {
          const count = myDeck.filter(x => x === c).length;
          const isMine = myCard === c;
          const blocked = blockedForChallenger === c;
          const disabled = count === 0 || blocked;
          return (
            <button
              key={c}
              disabled={disabled}
              onClick={() => pickCard(game, isCelestia ? 'celestia' : 'challenger', c)}
              className={cn(
                'p-3 rounded-xl border text-center transition-colors',
                isMine ? 'bg-gold/15 border-gold text-gold-light' :
                disabled ? 'bg-card/30 border-white/5 opacity-40' :
                'bg-card/60 border-white/10 active:bg-card/80',
              )}
            >
              <div className="text-2xl"><CardEmoji card={c} /></div>
              <div className="text-[11px] font-bold mt-1">{cardName(c)}</div>
              <div className="text-[9px] text-muted-foreground">x{count}</div>
              {isMine && <div className="text-[9px] text-gold mt-0.5">✓ выбрано</div>}
              {blocked && <div className="text-[9px] text-red-300 mt-0.5">заблокирована</div>}
            </button>
          );
        })}
      </div>

      {/* Селестия: привилегия */}
      {isCelestia && !th.celestia_privilege_used && !th.block_celestia_next_round && (
        <CelestiaPrivilege game={game} th={th} round={round} />
      )}
      {isCelestia && th.block_celestia_next_round && (
        <div className="text-[11px] text-amber-300/80 italic">
          🔒 Привилегия Селестии заблокирована Претендентом на этот раунд.
        </div>
      )}

      {/* Преимущества из фонда */}
      <FundAdvantages
        game={game} th={th} round={round}
        side={isCelestia ? 'celestia' : 'challenger'}
        myCard={myCard ?? null}
        myDeck={myDeck}
        myFund={myFund}
      />
    </div>
  );
}

async function pickCard(game: SuperGame, side: ThroneSide, card: ThroneCard) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  const idx = cur.current_round - 1;
  const rounds = [...cur.rounds];
  const round = rounds[idx];
  if (!round) return;
  if (round.status !== 'card_selection' && round.status !== 'advantage_phase') return;
  const deck = side === 'celestia' ? round.celestia_deck : round.challenger_deck;
  if (!deck.includes(card)) return;
  if (side === 'challenger' && round.challenger_blocked_card === card) return;

  rounds[idx] = {
    ...round,
    [side === 'celestia' ? 'celestia_card' : 'challenger_card']: card,
  } as ThroneRound;
  await writeState(game.id, { ...cur, rounds });
}

// ---------- Привилегия Селестии ----------

function CelestiaPrivilege({
  game, th, round,
}: { game: SuperGame; th: ThroneState; round: ThroneRound }) {
  const [open, setOpen] = useState(false);
  const challengerHasCard = !!round.challenger_card;

  return (
    <div className="glass p-3 border border-fuchsia-500/30 bg-fuchsia-500/5">
      <div className="text-[10px] uppercase tracking-widest text-fuchsia-300">♛ Королевский регламент</div>
      <div className="text-[11px] text-muted-foreground">Один раз за игру. Используется до раскрытия.</div>
      {!open ? (
        <button className="btn-secondary w-full text-xs mt-2" onClick={() => setOpen(true)}>Использовать</button>
      ) : (
        <div className="mt-2 grid grid-cols-1 gap-2">
          <button
            className="btn-secondary text-xs"
            disabled={!challengerHasCard}
            onClick={() => useCelestiaPrivilege(game, 'peek_card').then(() => setOpen(false))}
          >👁 Посмотреть карту Претендента</button>
          <button
            className="btn-secondary text-xs"
            onClick={() => useCelestiaPrivilege(game, 'force_replay').then(() => setOpen(false))}
          >🔁 Заставить переиграть раунд</button>
          <button
            className="btn-secondary text-xs"
            onClick={() => promptBlockCard(game).then(() => setOpen(false))}
          >🚫 Заблокировать одну карту Претендента на след. раунд</button>
          <button className="text-[10px] text-muted-foreground" onClick={() => setOpen(false)}>Отмена</button>
        </div>
      )}
      {round.celestia_peeked_card && (
        <div className="mt-2 text-[11px] text-fuchsia-200">
          👁 Вы видите карту Претендента: <CardEmoji card={round.celestia_peeked_card} /> {cardName(round.celestia_peeked_card)}
        </div>
      )}
    </div>
  );
}

async function useCelestiaPrivilege(game: SuperGame, action: CelestiaPrivilegeAction) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  if (cur.celestia_privilege_used || cur.block_celestia_next_round) return;
  const idx = cur.current_round - 1;
  const rounds = [...cur.rounds];
  const round = rounds[idx];
  if (!round) return;

  if (action === 'peek_card') {
    if (!round.challenger_card) return;
    rounds[idx] = {
      ...round,
      celestia_privilege_action: 'peek_card',
      celestia_peeked_card: round.challenger_card,
    };
  } else if (action === 'force_replay') {
    // Сбрасываем выборы в раунде
    rounds[idx] = {
      ...round,
      celestia_privilege_action: 'force_replay',
      celestia_card: null,
      challenger_card: null,
      status: 'card_selection',
    };
  } else if (action === 'block_card') {
    // Блокировка реализуется через promptBlockCard (выбор карты)
  }

  await writeState(game.id, { ...cur, rounds, celestia_privilege_used: true });
  await pushEvent('Селестия использовала Королевский регламент', undefined, `/super-games/${game.id}`);
}

async function promptBlockCard(game: SuperGame) {
  const choice = window.prompt('Какую карту заблокировать у Претендента на следующий раунд? emperor / citizen / pet');
  const c = (choice ?? '').trim().toLowerCase() as ThroneCard;
  if (c !== 'emperor' && c !== 'citizen' && c !== 'pet') return;

  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur || cur.celestia_privilege_used) return;
  // Помечаем блок: если есть следующий раунд — на него; если нет — на текущий
  const idx = cur.current_round - 1;
  const rounds = [...cur.rounds];
  const r = rounds[idx];
  if (!r) return;
  rounds[idx] = {
    ...r,
    celestia_privilege_action: 'block_card',
    challenger_blocked_card: c,
  };
  await writeState(game.id, { ...cur, rounds, celestia_privilege_used: true });
  await pushEvent('Селестия заблокировала карту Претендента', cardName(c), `/super-games/${game.id}`);
}

// ---------- Преимущества из фондов ----------

function FundAdvantages({
  game, th, round, side, myCard, myDeck, myFund,
}: {
  game: SuperGame; th: ThroneState; round: ThroneRound;
  side: ThroneSide;
  myCard: ThroneCard | null;
  myDeck: ThroneCard[];
  myFund: number;
}) {
  const opponentHasCard = side === 'celestia' ? !!round.challenger_card : !!round.celestia_card;
  const replayUsed = side === 'celestia' ? th.replay_used_celestia : th.replay_used_challenger;

  return (
    <div className="glass p-3 space-y-2">
      <div className="text-[10px] uppercase tracking-widest text-gold/80">
        Преимущества из Фонда (фонд: <Yen amount={myFund} className="inline" iconClass="w-3 h-3" />)
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <button
          className="btn-secondary text-[10px]"
          disabled={myFund < PEEK_CARD_COST || !opponentHasCard}
          onClick={() => buyAdvantage(game, side, 'peek_card')}
        >👁 Посмотреть · {(PEEK_CARD_COST / 1000)}K</button>
        <button
          className="btn-secondary text-[10px]"
          disabled={myFund < CHANGE_CARD_COST || !myCard}
          onClick={() => buyChangeCard(game, side)}
        >🔄 Заменить карту · {(CHANGE_CARD_COST / 1000)}K</button>
        <button
          className="btn-secondary text-[10px]"
          disabled={myFund < REPLAY_LOSS_COST || replayUsed || round.status !== 'resolved' ||
            (side === 'celestia' ? round.winner !== 'challenger' : round.winner !== 'celestia')}
          onClick={() => buyReplay(game, side)}
        >↩ Переиграть · {(REPLAY_LOSS_COST / 1000)}K</button>
        {side === 'challenger' && (
          <button
            className="btn-secondary text-[10px]"
            disabled={myFund < BLOCK_CELESTIA_PRIVILEGE_COST || th.block_celestia_next_round}
            onClick={() => buyBlockPrivilege(game)}
          >🛑 Блок привил. · {(BLOCK_CELESTIA_PRIVILEGE_COST / 1000)}K</button>
        )}
      </div>
    </div>
  );
}

async function buyAdvantage(game: SuperGame, side: ThroneSide, type: ThroneAdvantageType) {
  // Только peek_card обрабатываем здесь, change/replay/block — отдельные функции
  if (type !== 'peek_card') return;
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  const cost = PEEK_CARD_COST;
  const fund = side === 'celestia' ? cur.celestia_fund : cur.challenger_fund;
  if (fund < cost) return;
  const idx = cur.current_round - 1;
  const round = cur.rounds[idx];
  if (!round) return;
  const oppCard = side === 'celestia' ? round.challenger_card : round.celestia_card;
  if (!oppCard) return;

  alert(`Вы видите карту соперника: ${cardName(oppCard)}`);

  const purchase: ThroneAdvantagePurchase = {
    id: 'ap-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
    side, advantage_type: 'peek_card', cost,
    used_in_round: round.number,
    created_at: new Date().toISOString(),
  };
  const next: ThroneState = {
    ...cur,
    purchases: [...cur.purchases, purchase],
    celestia_fund: side === 'celestia' ? cur.celestia_fund - cost : cur.celestia_fund,
    challenger_fund: side === 'challenger' ? cur.challenger_fund - cost : cur.challenger_fund,
  };
  await writeState(game.id, next);
}

async function buyChangeCard(game: SuperGame, side: ThroneSide) {
  const choice = window.prompt('На какую карту заменить? emperor / citizen / pet');
  const c = (choice ?? '').trim().toLowerCase() as ThroneCard;
  if (c !== 'emperor' && c !== 'citizen' && c !== 'pet') return;

  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  const cost = CHANGE_CARD_COST;
  const fund = side === 'celestia' ? cur.celestia_fund : cur.challenger_fund;
  if (fund < cost) return;
  const idx = cur.current_round - 1;
  const round = cur.rounds[idx];
  if (!round) return;
  const deck = side === 'celestia' ? round.celestia_deck : round.challenger_deck;
  if (!deck.includes(c)) {
    alert('Такой карты нет в колоде стороны.');
    return;
  }

  const rounds = [...cur.rounds];
  rounds[idx] = {
    ...round,
    [side === 'celestia' ? 'celestia_card' : 'challenger_card']: c,
  } as ThroneRound;

  const purchase: ThroneAdvantagePurchase = {
    id: 'ap-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
    side, advantage_type: 'change_card', cost,
    used_in_round: round.number,
    created_at: new Date().toISOString(),
  };
  await writeState(game.id, {
    ...cur,
    rounds,
    purchases: [...cur.purchases, purchase],
    celestia_fund: side === 'celestia' ? cur.celestia_fund - cost : cur.celestia_fund,
    challenger_fund: side === 'challenger' ? cur.challenger_fund - cost : cur.challenger_fund,
  });
}

async function buyReplay(game: SuperGame, side: ThroneSide) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  if ((side === 'celestia' && cur.replay_used_celestia) || (side === 'challenger' && cur.replay_used_challenger)) return;
  const cost = REPLAY_LOSS_COST;
  const fund = side === 'celestia' ? cur.celestia_fund : cur.challenger_fund;
  if (fund < cost) return;
  const idx = cur.current_round - 1;
  const round = cur.rounds[idx];
  if (!round || round.status !== 'resolved') return;
  // Только если эта сторона проиграла раунд
  if (side === 'celestia' && round.winner !== 'challenger') return;
  if (side === 'challenger' && round.winner !== 'celestia') return;

  // Откатываем очко победителю и сбрасываем раунд
  const rounds = [...cur.rounds];
  rounds[idx] = {
    ...round,
    status: 'card_selection',
    celestia_card: null,
    challenger_card: null,
    winner: null,
  };
  const purchase: ThroneAdvantagePurchase = {
    id: 'ap-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
    side, advantage_type: 'replay_loss', cost,
    used_in_round: round.number,
    created_at: new Date().toISOString(),
  };
  await writeState(game.id, {
    ...cur,
    rounds,
    purchases: [...cur.purchases, purchase],
    celestia_score: side === 'celestia' ? cur.celestia_score : cur.celestia_score - 1,
    challenger_score: side === 'challenger' ? cur.challenger_score : cur.challenger_score - 1,
    celestia_fund: side === 'celestia' ? cur.celestia_fund - cost : cur.celestia_fund,
    challenger_fund: side === 'challenger' ? cur.challenger_fund - cost : cur.challenger_fund,
    replay_used_celestia: side === 'celestia' ? true : cur.replay_used_celestia,
    replay_used_challenger: side === 'challenger' ? true : cur.replay_used_challenger,
    status: 'card_selection',
  });
  await pushEvent(`Сторона ${side === 'celestia' ? 'Селестии' : 'Претендента'} оплатила переигровку раунда`, undefined, `/super-games/${game.id}`);
}

async function buyBlockPrivilege(game: SuperGame) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  if (cur.block_celestia_next_round || cur.celestia_privilege_used) return;
  const cost = BLOCK_CELESTIA_PRIVILEGE_COST;
  if (cur.challenger_fund < cost) return;

  const purchase: ThroneAdvantagePurchase = {
    id: 'ap-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
    side: 'challenger', advantage_type: 'block_celestia_privilege', cost,
    used_in_round: cur.current_round,
    created_at: new Date().toISOString(),
  };
  await writeState(game.id, {
    ...cur,
    purchases: [...cur.purchases, purchase],
    challenger_fund: cur.challenger_fund - cost,
    block_celestia_next_round: true,
  });
  await pushEvent('Претендент заблокировал привилегию Селестии', undefined, `/super-games/${game.id}`);
}

// ---------- Фаза преимуществ (между выбором и раскрытием) ----------

function AdvantagePhase({
  game, th, round, isCelestia, isChallenger,
}: {
  game: SuperGame; th: ThroneState; round: ThroneRound;
  isCelestia: boolean; isChallenger: boolean;
}) {
  if (!isCelestia && !isChallenger) {
    return (
      <div className="text-xs text-muted-foreground text-center py-2">
        Стороны рассматривают преимущества...
      </div>
    );
  }
  // Реиспользуем компонент покупки преимуществ из фазы выбора
  const myDeck = isCelestia ? round.celestia_deck : round.challenger_deck;
  const myCard = isCelestia ? round.celestia_card : round.challenger_card;
  const myFund = isCelestia ? th.celestia_fund : th.challenger_fund;
  return (
    <FundAdvantages
      game={game} th={th} round={round}
      side={isCelestia ? 'celestia' : 'challenger'}
      myCard={myCard ?? null}
      myDeck={myDeck}
      myFund={myFund}
    />
  );
}

function ResolvedRound({ round }: { round: ThroneRound }) {
  const winner = round.winner;
  return (
    <div className="text-center">
      <div className={cn('font-heading text-base font-bold',
        winner === 'celestia' ? 'text-fuchsia-300' :
        winner === 'challenger' ? 'text-amber-300' : 'text-muted-foreground')}>
        {winner === 'celestia' ? '♛ Селестия выиграла раунд' :
         winner === 'challenger' ? '🔥 Претендент выиграл раунд' : 'Ничья'}
      </div>
    </div>
  );
}

// ---------- Финал и финальный выбор ----------

function FinalChoiceBlock({
  game, th, isChallenger, isAdmin,
}: { game: SuperGame; th: ThroneState; isChallenger: boolean; isAdmin: boolean }) {
  return (
    <div className="glass-strong gold-border p-4 text-center space-y-2">
      <div className="text-[10px] uppercase tracking-widest text-gold/70">Финальный выбор Претендента</div>
      <div className="font-heading text-lg font-bold">Какой будет финал сезона?</div>
      <div className="grid grid-cols-1 gap-2">
        {(isChallenger || isAdmin) && (
          <>
            <button
              className="btn-primary text-sm"
              onClick={() => applyFinalOutcome(game, 'new_director')}
            >👑 Новый директор — занять трон Селестии</button>
            <button
              className="btn-danger text-sm"
              onClick={() => applyFinalOutcome(game, 'rebellion_wins')}
            >🔥 Бунт победил — разрушить систему</button>
          </>
        )}
        {!isChallenger && !isAdmin && (
          <div className="text-xs text-muted-foreground italic">Ждём выбора Претендента...</div>
        )}
      </div>
    </div>
  );
}

function FinishedView({
  th, celestia, challenger, game, isAdmin,
}: {
  th: ThroneState; celestia: Participant | null; challenger: Participant | null;
  game: SuperGame; isAdmin: boolean;
}) {
  const celWon = th.winner === 'celestia';
  const out = th.final_outcome;

  return (
    <div className={cn('glass-strong p-5 text-center',
      celWon ? 'gold-border' : out === 'rebellion_wins' ? 'crimson-border' : 'gold-border')}>
      <div className="text-[10px] uppercase tracking-widest text-gold/70">Финал завершён</div>
      <h3 className="font-heading text-2xl font-bold mt-2 text-gradient-gold">
        {celWon
          ? `${celestia?.display_name ?? 'Селестия'} сохраняет трон`
          : out === 'new_director'
            ? `${challenger?.display_name ?? 'Претендент'} — новый директор`
            : out === 'rebellion_wins'
              ? `Бунт победил`
              : 'Финал'}
      </h3>
      <p className="text-xs text-muted-foreground mt-1">
        Счёт: {th.celestia_score} : {th.challenger_score}
      </p>
      {isAdmin && !celWon && (
        <details className="mt-4 text-xs text-left">
          <summary className="cursor-pointer text-gold/80 py-1">Ручные последствия (для ведущего)</summary>
          <div className="grid grid-cols-1 gap-2 mt-2">
            <ManualConsequenceButton label="🪙 Передать Казну Претенденту" onClick={() => transferTreasury(game)} />
            <ManualConsequenceButton label="📜 Списать просроченные долги" onClick={() => cancelOverdueDebts(game)} />
            <ManualConsequenceButton label="🔓 Освободить Питомцев (снять статус pet)" onClick={() => freePets(game)} />
            <ManualConsequenceButton label="📕 Завершить сезон" onClick={() => endSeason(game)} />
          </div>
        </details>
      )}
    </div>
  );
}

function ManualConsequenceButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      className="btn-secondary text-xs text-left"
      onClick={() => {
        if (confirm(`${label} — подтвердить?`)) onClick();
      }}
    >{label}</button>
  );
}

async function transferTreasury(game: SuperGame) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur || !cur.challenger_id) return;
  // Достаём баланс Казны и переводим Претенденту
  const { data: t } = await sb.from('participants').select('balance').eq('id', TREASURY_ID).single();
  const amount = t?.balance ?? 0;
  if (amount <= 0) return;
  await payoutFromTreasury(cur.challenger_id, amount, 'Финал · передача Казны новому директору', `/super-games/${game.id}`);
  await pushEvent('Казна студсовета передана новому директору', undefined, `/super-games/${game.id}`);
}

async function cancelOverdueDebts(game: SuperGame) {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from('debts').update({ status: 'cancelled' }).eq('status', 'overdue');
  await pushEvent('Просроченные долги списаны по итогам финала', undefined, `/super-games/${game.id}`);
}

async function freePets(game: SuperGame) {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from('participants').update({ status: 'player', pet_owner_id: null }).eq('status', 'pet');
  await pushEvent('Питомцы освобождены', undefined, `/super-games/${game.id}`);
}

async function endSeason(game: SuperGame) {
  await pushEvent('Сезон завершён', 'Финал «Трон Селестии» закрыл сезон.', `/super-games/${game.id}`);
}

// ---------- История раундов ----------

function RoundsHistory({
  th, celestia, challenger,
}: { th: ThroneState; celestia: Participant | null; challenger: Participant | null }) {
  const rounds = th.rounds.filter(r => r.status === 'resolved');
  if (rounds.length === 0) return null;
  return (
    <div className="glass p-4">
      <div className="section-title text-sm mb-2">📜 История раундов</div>
      <div className="space-y-1.5">
        {rounds.map(r => (
          <div key={r.number} className="flex items-center gap-2 p-2 rounded-xl bg-card/40 text-xs">
            <span className="font-bold w-10">№{r.number}</span>
            <span className="flex items-center gap-1 w-20">
              {r.celestia_card && <CardEmoji card={r.celestia_card} />}
              {r.celestia_card && <span className="text-[10px]">{cardName(r.celestia_card)}</span>}
            </span>
            <span className="text-muted-foreground">vs</span>
            <span className="flex items-center gap-1 w-20">
              {r.challenger_card && <CardEmoji card={r.challenger_card} />}
              {r.challenger_card && <span className="text-[10px]">{cardName(r.challenger_card)}</span>}
            </span>
            <span className={cn('ml-auto text-[10px] font-bold',
              r.winner === 'celestia' ? 'text-fuchsia-300' :
              r.winner === 'challenger' ? 'text-amber-300' : 'text-muted-foreground')}>
              {r.winner === 'celestia' ? 'Селестия' :
               r.winner === 'challenger' ? 'Претендент' : 'ничья'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Админ-панель ----------

function AdminPanel({ game, th }: { game: SuperGame; th: ThroneState }) {
  const { state } = useStore();
  const [chal, setChal] = useState<string>(th.challenger_id);
  const players = state.participants.filter(p => isPlayer(p) && p.id !== QUEEN_ID && p.is_active);

  const round = th.current_round > 0 ? th.rounds[th.current_round - 1] : null;

  return (
    <div className="glass-strong gold-border p-4 space-y-2">
      <div className="text-[10px] uppercase tracking-widest text-gold/70">⚙️ Управление ведущего</div>

      {/* Назначение Претендента */}
      {(th.status === 'scheduled' || th.status === 'challenger_setup' || th.status === 'side_selection' || th.status === 'fund_collection') && (
        <div className="space-y-2">
          <select
            className="input-field text-xs"
            value={chal}
            onChange={e => setChal(e.target.value)}
          >
            <option value="">— выбрать Претендента —</option>
            {players.map(p => (
              <option key={p.id} value={p.id}>{p.display_name}</option>
            ))}
          </select>
          <button
            className="btn-secondary w-full text-xs"
            disabled={!chal}
            onClick={() => assignChallenger(game, chal)}
          >Сохранить Претендента</button>
        </div>
      )}

      {(th.status === 'challenger_setup' || th.status === 'scheduled') && th.challenger_id && (
        <button
          className="btn-primary w-full text-xs"
          onClick={() => openSideSelection(game)}
        >Открыть выбор сторон</button>
      )}

      {th.status === 'side_selection' && (
        <button
          className="btn-primary w-full text-xs"
          onClick={() => openFundCollection(game)}
        >Открыть сбор фондов</button>
      )}

      {th.status === 'fund_collection' && (
        <button
          className="btn-success w-full text-xs"
          onClick={() => startFirstRound(game)}
        >▶ Начать дуэль (раунд 1)</button>
      )}

      {/* Управление текущим раундом */}
      {round?.status === 'card_selection' && (
        <button
          className="btn-primary w-full text-xs"
          disabled={!round.celestia_card || !round.challenger_card}
          onClick={() => closeCardSelection(game)}
        >Завершить выбор карт</button>
      )}
      {round?.status === 'advantage_phase' && (
        <button
          className="btn-success w-full text-xs"
          onClick={() => revealRound(game)}
        >🎬 Раскрыть раунд</button>
      )}
      {round?.status === 'resolved' && (() => {
        const phase = round.phase;
        const isLast10 = th.current_round === TOTAL_ROUNDS && phase !== 'sudden_death';
        const tied = th.celestia_score === th.challenger_score;
        if (!isLast10 && phase !== 'sudden_death') {
          return (
            <button
              className="btn-primary w-full text-xs"
              onClick={() => nextRound(game)}
            >Начать раунд {th.current_round + 1}</button>
          );
        }
        if (isLast10 && tied) {
          return (
            <button
              className="btn-danger w-full text-xs"
              onClick={() => startSuddenDeath(game)}
            >🔥 Запустить «Последний трон»</button>
          );
        }
        if (phase === 'sudden_death' && tied) {
          return (
            <button
              className="btn-primary w-full text-xs"
              onClick={() => nextSuddenDeath(game)}
            >Ещё раунд Последнего трона</button>
          );
        }
        return (
          <button
            className="btn-success w-full text-xs"
            onClick={() => declareWinner(game)}
          >🏁 Объявить победителя</button>
        );
      })()}

      <details className="text-xs">
        <summary className="cursor-pointer text-red-300/80 py-1">Отменить финал</summary>
        <button
          className="btn-danger w-full text-xs mt-2"
          onClick={() => cancelGame(game)}
        >Отменить</button>
      </details>
    </div>
  );
}

async function assignChallenger(game: SuperGame, challengerId: string) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  await writeState(game.id, { ...cur, challenger_id: challengerId, status: 'challenger_setup' });
}

async function openSideSelection(game: SuperGame) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  await writeState(game.id, { ...cur, status: 'side_selection' });
}

async function openFundCollection(game: SuperGame) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  await writeState(game.id, { ...cur, status: 'fund_collection' });
}

async function startFirstRound(game: SuperGame) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur || !cur.challenger_id) return;

  // Списываем ставки Селестии и Претендента в Казну? В ТЗ ставка фиксируется,
  // но фактически Селестия ставит «должность + 5M» а Претендент 2M (или всё своё).
  // Реализуем: списываем 5M с p-queen и 2M (или весь баланс) с Претендента в Казну.
  const link = `/super-games/${game.id}`;
  await chargeToTreasury(QUEEN_ID, CELESTIA_FINAL_STAKE, 'Финал · ставка Селестии', link);

  const { data: chal } = await sb.from('participants').select('balance').eq('id', cur.challenger_id).single();
  const chalBalance = chal?.balance ?? 0;
  const challengerStake = Math.min(CHALLENGER_FINAL_STAKE, chalBalance);
  if (challengerStake > 0) {
    await chargeToTreasury(cur.challenger_id, challengerStake, 'Финал · ставка Претендента', link);
  }

  const r1: ThroneRound = {
    number: 1,
    phase: 'first_half',
    celestia_deck: initialDeckForPhase('celestia', 'first_half'),
    challenger_deck: initialDeckForPhase('challenger', 'first_half'),
    status: 'card_selection',
  };
  await writeState(game.id, {
    ...cur,
    current_round: 1,
    rounds: [r1],
    status: 'card_selection',
  }, { status: 'live' });
  await pushEvent('Трон Селестии · дуэль началась', 'Раунд 1 — фаза карт.', link);
}

async function closeCardSelection(game: SuperGame) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  const idx = cur.current_round - 1;
  const rounds = [...cur.rounds];
  if (!rounds[idx]) return;
  rounds[idx] = { ...rounds[idx], status: 'advantage_phase' };
  await writeState(game.id, { ...cur, rounds, status: 'advantage_phase' });
}

async function revealRound(game: SuperGame) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  const idx = cur.current_round - 1;
  const rounds = [...cur.rounds];
  const round = rounds[idx];
  if (!round || !round.celestia_card || !round.challenger_card) return;

  const phase = round.phase;
  const winner = phase === 'sudden_death'
    ? resolveSuddenDeath(round.celestia_card, round.challenger_card)
    : resolveCardDuel(round.celestia_card, round.challenger_card);

  // Сжигаем использованные карты из колод
  const burnFrom = (deck: ThroneCard[], card: ThroneCard) => {
    const i = deck.indexOf(card);
    if (i < 0) return deck;
    const next = [...deck];
    next.splice(i, 1);
    return next;
  };

  rounds[idx] = {
    ...round,
    status: 'resolved',
    winner,
    celestia_deck: burnFrom(round.celestia_deck, round.celestia_card),
    challenger_deck: burnFrom(round.challenger_deck, round.challenger_card),
    resolved_at: new Date().toISOString(),
  };

  let celScore = cur.celestia_score;
  let chalScore = cur.challenger_score;
  if (winner === 'celestia') celScore += 1;
  if (winner === 'challenger') chalScore += 1;

  await writeState(game.id, {
    ...cur,
    rounds,
    celestia_score: celScore,
    challenger_score: chalScore,
    block_celestia_next_round: false, // блок действует один раунд
    status: 'round_result',
  });
  await pushEvent(`Раунд ${round.number} — ${winner === 'draw' ? 'ничья' : winner === 'celestia' ? 'Селестия' : 'Претендент'}`,
    `${cardName(round.celestia_card)} vs ${cardName(round.challenger_card)}`,
    `/super-games/${game.id}`);
}

async function nextRound(game: SuperGame) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  const nextNum = cur.current_round + 1;
  if (nextNum > TOTAL_ROUNDS) return;

  const phase = phaseOfRound(nextNum);
  const prev = cur.rounds[cur.current_round - 1];
  // Колода сохраняется внутри блока 5 раундов и обновляется на втором блоке
  const celDeck = phase === prev.phase
    ? prev.celestia_deck
    : initialDeckForPhase('celestia', phase);
  const chalDeck = phase === prev.phase
    ? prev.challenger_deck
    : initialDeckForPhase('challenger', phase);

  const newRound: ThroneRound = {
    number: nextNum,
    phase,
    celestia_deck: celDeck,
    challenger_deck: chalDeck,
    status: 'card_selection',
  };
  await writeState(game.id, {
    ...cur,
    current_round: nextNum,
    rounds: [...cur.rounds, newRound],
    status: 'card_selection',
  });
  await pushEvent(`Трон Селестии · раунд ${nextNum}`, undefined, `/super-games/${game.id}`);
}

async function startSuddenDeath(game: SuperGame) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  const newRound: ThroneRound = {
    number: cur.current_round + 1,
    phase: 'sudden_death',
    celestia_deck: initialDeckForPhase('celestia', 'sudden_death'),
    challenger_deck: initialDeckForPhase('challenger', 'sudden_death'),
    status: 'card_selection',
  };
  await writeState(game.id, {
    ...cur,
    current_round: newRound.number,
    rounds: [...cur.rounds, newRound],
    status: 'sudden_death',
  });
  await pushEvent('Запущен «Последний трон»', undefined, `/super-games/${game.id}`);
}

async function nextSuddenDeath(game: SuperGame) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  const newRound: ThroneRound = {
    number: cur.current_round + 1,
    phase: 'sudden_death',
    celestia_deck: initialDeckForPhase('celestia', 'sudden_death'),
    challenger_deck: initialDeckForPhase('challenger', 'sudden_death'),
    status: 'card_selection',
  };
  await writeState(game.id, {
    ...cur,
    current_round: newRound.number,
    rounds: [...cur.rounds, newRound],
    status: 'sudden_death',
  });
}

async function declareWinner(game: SuperGame) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  const winner: ThroneSide = cur.celestia_score > cur.challenger_score ? 'celestia' : 'challenger';
  if (winner === 'celestia') {
    // Селестия побеждает: ставка Претендента и Фонд Претендента уходят в Казну (они уже там).
    await writeState(game.id, {
      ...cur,
      winner,
      final_outcome: 'celestia_wins',
      status: 'finished',
    }, { status: 'finished' });
    await pushEvent('Финал · Селестия победила', `Счёт ${cur.celestia_score}:${cur.challenger_score}.`, `/super-games/${game.id}`);
  } else {
    // Претендент победил: переходим в final_choice
    await writeState(game.id, { ...cur, winner, status: 'final_choice' });
    await pushEvent('Финал · Претендент победил, ждём финального выбора', undefined, `/super-games/${game.id}`);
  }
}

async function applyFinalOutcome(game: SuperGame, outcome: 'new_director' | 'rebellion_wins') {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  await writeState(game.id, {
    ...cur,
    final_outcome: outcome,
    status: 'finished',
  }, { status: 'finished' });

  const link = `/super-games/${game.id}`;
  if (outcome === 'new_director') {
    await pushEvent(
      'Финал · Новый директор',
      'Претендент занял должность директора студсовета. Ведущий применит ручные последствия (передача Казны и пр.).',
      link,
    );
  } else {
    await pushEvent(
      'Финал · Бунт победил',
      'Власть Селестии разрушена. Ведущий применит ручные последствия (списание долгов, освобождение Питомцев).',
      link,
    );
  }
}

async function cancelGame(game: SuperGame) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  await writeState(game.id, { ...cur, status: 'cancelled' }, { status: 'cancelled' });
  await pushEvent('Финал «Трон Селестии» отменён', undefined, `/super-games/${game.id}`);
}
