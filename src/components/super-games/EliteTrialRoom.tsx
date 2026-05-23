'use client';

// ===========================================================================
// «Суд над Элитой» — 9-я Большая игра. Карточный судебный поединок.
// Селестия — судья. При равенстве очков побеждает Защита.
// Стороны: Обвинение и Защита. Каждая собирает фонд (взносы), раскрывает
// случайные карты дела (50k), покупает их (100k), играет до 5 карт.
// ===========================================================================

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/lib/store/StoreProvider';
import { CharacterIcon } from '@/components/ui/CharacterIcon';
import { Yen } from '@/components/ui/Yen';
import { cn, isPlayer } from '@/lib/utils';
import { getSupabase } from '@/lib/supabase/client';
import { chargeToTreasury, payoutFromTreasury } from '@/lib/store/tx';
import {
  REVEAL_RANDOM_CARD_COST, BUY_REVEALED_CARD_COST,
  ELITE_GUILTY_FINE, ELITE_ACQUITTED_COMPENSATION, MAX_CARDS_PER_SIDE,
  generateDeck, applyCardPlay, pickVerdict,
} from '@/lib/elitetrial/logic';
import type {
  SuperGame, Participant,
  EliteTrialState, EliteTrialCard, EliteTrialSide, EliteTrialFundContribution,
} from '@/lib/store/types';

// ---------- helpers ----------

function getState(g: SuperGame): EliteTrialState {
  const s = (g.state || {}) as Partial<EliteTrialState>;
  return {
    judge_id: s.judge_id ?? 'p-queen',
    target_elite_id: s.target_elite_id ?? '',
    prosecution_player_ids: s.prosecution_player_ids ?? [],
    defense_player_ids: s.defense_player_ids ?? [],
    accusation_text: s.accusation_text ?? '',
    defense_text: s.defense_text ?? '',
    prosecution_fund: s.prosecution_fund ?? 0,
    defense_fund: s.defense_fund ?? 0,
    prosecution_score: s.prosecution_score ?? 0,
    defense_score: s.defense_score ?? 0,
    cards: s.cards ?? [],
    contributions: s.contributions ?? [],
    verdict: s.verdict ?? null,
    status: s.status ?? 'scheduled',
  };
}

async function readState(gameId: string): Promise<EliteTrialState | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.from('super_games').select('state').eq('id', gameId).single();
  return (data?.state as EliteTrialState) ?? null;
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

function sideOf(playerId: string, st: EliteTrialState): EliteTrialSide | null {
  if (st.prosecution_player_ids.includes(playerId)) return 'prosecution';
  if (st.defense_player_ids.includes(playerId)) return 'defense';
  return null;
}

// ===========================================================================

export function EliteTrialRoom({ game }: { game: SuperGame }) {
  const { state, currentUser, role } = useStore();
  const isAdmin = role === 'gm' || role === 'queen';
  const et = getState(game);

  const target = state.participants.find(p => p.id === et.target_elite_id) ?? null;
  const judge = state.participants.find(p => p.id === et.judge_id) ?? null;

  const mySide = currentUser ? sideOf(currentUser.id, et) : null;

  return (
    <div className="space-y-4">
      <Header et={et} target={target} judge={judge} />
      <SidesBlock et={et} />

      {(et.status === 'evidence_market' || et.status === 'trial') && (
        <>
          <FundsBlock game={game} et={et} mySide={mySide} currentUserId={currentUser?.id ?? null} />
          <CardsBlock game={game} et={et} mySide={mySide} isAdmin={isAdmin} />
        </>
      )}

      {et.status === 'finished' && (
        <FinalView et={et} target={target} />
      )}

      {isAdmin && et.status !== 'finished' && et.status !== 'cancelled' && (
        <AdminPanel game={game} et={et} />
      )}
    </div>
  );
}

// ---------- Шапка и стороны ----------

function Header({
  et, target, judge,
}: { et: EliteTrialState; target: Participant | null; judge: Participant | null }) {
  return (
    <div className="glass-strong gold-border p-4">
      <div className="grid grid-cols-3 gap-3 text-center text-xs">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-red-400">Обвинение</div>
          <div className="font-mono font-bold text-red-300 text-lg mt-1">{et.prosecution_score}</div>
          <div className="text-[10px] text-muted-foreground">очк.</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-gold/70">Судит</div>
          {target ? (
            <div className="flex items-center justify-center gap-1 mt-1">
              <CharacterIcon participant={target} size="xs" ringless />
              <span className="font-bold truncate">{target.display_name}</span>
            </div>
          ) : <span className="italic text-muted-foreground">не выбран</span>}
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-emerald-400">Защита</div>
          <div className="font-mono font-bold text-emerald-300 text-lg mt-1">{et.defense_score}</div>
          <div className="text-[10px] text-muted-foreground">очк.</div>
        </div>
      </div>
      {et.accusation_text && (
        <div className="mt-3 p-2 rounded-xl bg-red-500/5 border border-red-500/20 text-xs">
          <div className="text-[10px] uppercase tracking-widest text-red-400 mb-0.5">Пункт обвинения</div>
          <div>{et.accusation_text}</div>
        </div>
      )}
      {et.defense_text && (
        <div className="mt-2 p-2 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-xs">
          <div className="text-[10px] uppercase tracking-widest text-emerald-400 mb-0.5">Линия защиты</div>
          <div>{et.defense_text}</div>
        </div>
      )}
      {judge && (
        <div className="mt-2 text-center text-[10px] text-muted-foreground">
          Судья · {judge.display_name}. При равенстве очков побеждает Защита.
        </div>
      )}
    </div>
  );
}

function SidesBlock({ et }: { et: EliteTrialState }) {
  const { state } = useStore();
  const pros = et.prosecution_player_ids.map(id => state.participants.find(p => p.id === id)).filter(Boolean) as Participant[];
  const def = et.defense_player_ids.map(id => state.participants.find(p => p.id === id)).filter(Boolean) as Participant[];

  return (
    <div className="grid grid-cols-2 gap-3">
      <SideCard side="prosecution" players={pros} fund={et.prosecution_fund} />
      <SideCard side="defense"     players={def}  fund={et.defense_fund} />
    </div>
  );
}

function SideCard({ side, players, fund }: { side: EliteTrialSide; players: Participant[]; fund: number }) {
  const isPros = side === 'prosecution';
  return (
    <div className={cn('glass p-3 border-l-4', isPros ? 'border-red-500/60' : 'border-emerald-500/60')}>
      <div className={cn('text-[10px] uppercase tracking-widest', isPros ? 'text-red-400' : 'text-emerald-400')}>
        {isPros ? '⚖️ Обвинение' : '🛡️ Защита'}
      </div>
      <div className="text-[10px] text-muted-foreground">Фонд</div>
      <Yen amount={fund} className="text-sm" iconClass="w-3 h-3" />
      <div className="mt-2 space-y-1">
        {players.map(p => (
          <div key={p.id} className="flex items-center gap-1.5 text-xs">
            <CharacterIcon participant={p} size="xs" ringless />
            <span className="truncate">{p.display_name}</span>
          </div>
        ))}
        {players.length === 0 && (
          <div className="text-[11px] italic text-muted-foreground">не назначены</div>
        )}
      </div>
    </div>
  );
}

// ---------- Фонды (взносы) ----------

function FundsBlock({
  game, et, mySide, currentUserId,
}: {
  game: SuperGame; et: EliteTrialState;
  mySide: EliteTrialSide | null; currentUserId: string | null;
}) {
  const [amount, setAmount] = useState<number>(100_000);

  if (!mySide || !currentUserId) return null;

  return (
    <div className="glass p-3 space-y-2">
      <div className="text-[10px] uppercase tracking-widest text-gold/80">
        Внести в фонд {mySide === 'prosecution' ? 'Обвинения' : 'Защиты'}
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <input
          type="number"
          step={50_000} min={50_000}
          value={amount}
          onChange={e => setAmount(Math.max(50_000, Number(e.target.value)))}
          className="input-field font-mono text-sm"
        />
        <button
          className="btn-primary text-xs px-4"
          onClick={() => contribute(game, currentUserId, mySide, amount)}
        >Внести</button>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {[100_000, 250_000, 500_000, 1_000_000].map(v => (
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

async function contribute(game: SuperGame, playerId: string, side: EliteTrialSide, amount: number) {
  const sb = getSupabase();
  if (!sb || amount <= 0) return;
  const res = await chargeToTreasury(playerId, amount,
    `Взнос в фонд ${side === 'prosecution' ? 'Обвинения' : 'Защиты'}`,
    `/super-games/${game.id}`);
  if (!res.ok) return;

  const cur = await readState(game.id);
  if (!cur) return;
  const contrib: EliteTrialFundContribution = {
    id: 'cf-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
    player_id: playerId,
    side,
    amount,
    created_at: new Date().toISOString(),
  };
  const next: EliteTrialState = {
    ...cur,
    contributions: [...cur.contributions, contrib],
    prosecution_fund: side === 'prosecution' ? cur.prosecution_fund + amount : cur.prosecution_fund,
    defense_fund: side === 'defense' ? cur.defense_fund + amount : cur.defense_fund,
  };
  await sb.from('super_games').update({ state: next }).eq('id', game.id);
}

// ---------- Карты ----------

function CardsBlock({
  game, et, mySide, isAdmin,
}: {
  game: SuperGame; et: EliteTrialState;
  mySide: EliteTrialSide | null; isAdmin: boolean;
}) {
  const hidden = et.cards.filter(c => c.status === 'hidden');
  const revealed = et.cards.filter(c => c.status === 'revealed');
  const owned = et.cards.filter(c => c.status === 'owned');
  const played = et.cards.filter(c => c.status === 'played').sort((a, b) => (a.played_at ?? '').localeCompare(b.played_at ?? ''));

  const canRevealRandom = (mySide && et.status === 'evidence_market' && hidden.length > 0)
    && ((mySide === 'prosecution' && et.prosecution_fund >= REVEAL_RANDOM_CARD_COST)
        || (mySide === 'defense' && et.defense_fund >= REVEAL_RANDOM_CARD_COST));

  return (
    <div className="space-y-3">
      {/* Раскрыть случайную */}
      {mySide && et.status === 'evidence_market' && (
        <div className="glass p-3">
          <div className="flex items-center justify-between">
            <div className="text-xs">
              <span className="font-bold">Открыть случайную карту дела</span>
              <span className="text-muted-foreground ml-2">−<Yen amount={REVEAL_RANDOM_CARD_COST} className="inline" iconClass="w-3 h-3" /> из фонда</span>
            </div>
            <button
              className="btn-secondary text-xs"
              disabled={!canRevealRandom}
              onClick={() => revealRandomCard(game, mySide)}
            >Открыть</button>
          </div>
          <div className="mt-1 text-[10px] text-muted-foreground">Скрытых карт в колоде: {hidden.length}</div>
        </div>
      )}

      {/* Открытый рынок */}
      {revealed.length > 0 && (
        <div className="glass p-3">
          <div className="text-[10px] uppercase tracking-widest text-gold/70 mb-2">🔍 Открытые карты дела</div>
          <div className="grid grid-cols-1 gap-1.5">
            {revealed.map(c => (
              <CardRow key={c.id} card={c} game={game} et={et} mySide={mySide} kind="market" />
            ))}
          </div>
        </div>
      )}

      {/* Рука стороны */}
      {mySide && owned.filter(c => c.owner_side === mySide).length > 0 && et.status === 'trial' && (
        <div className="glass p-3">
          <div className="text-[10px] uppercase tracking-widest text-gold/70 mb-2">🃏 Ваша рука</div>
          <div className="grid grid-cols-1 gap-1.5">
            {owned.filter(c => c.owner_side === mySide).map(c => (
              <CardRow key={c.id} card={c} game={game} et={et} mySide={mySide} kind="hand" />
            ))}
          </div>
        </div>
      )}

      {/* Куплено противником (для админа) */}
      {isAdmin && owned.length > 0 && (
        <details className="glass p-3 text-xs">
          <summary className="cursor-pointer text-muted-foreground py-1">Видно ведущему: купленные карты</summary>
          <div className="mt-2 space-y-1">
            {owned.map(c => (
              <div key={c.id} className="flex items-center gap-2 p-1.5 rounded-lg bg-card/40 text-[11px]">
                <CardSideChip side={c.side} />
                <span className="flex-1 truncate">{c.title}</span>
                <span className={cn('text-[10px]', c.owner_side === 'prosecution' ? 'text-red-300' : 'text-emerald-300')}>
                  {c.owner_side === 'prosecution' ? 'Обвинение' : 'Защита'}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Сыгранные карты (открыто всем) */}
      {played.length > 0 && (
        <div className="glass p-3">
          <div className="text-[10px] uppercase tracking-widest text-gold/70 mb-2">⚖️ Сыграно ({played.length})</div>
          <div className="space-y-1.5">
            {played.map(c => (
              <PlayedCardRow key={c.id} card={c} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CardRow({
  card, game, et, mySide, kind,
}: {
  card: EliteTrialCard; game: SuperGame; et: EliteTrialState;
  mySide: EliteTrialSide | null; kind: 'market' | 'hand';
}) {
  const playedBySide = et.cards.filter(c => c.status === 'played' && c.played_by_side === mySide).length;

  const myFund = mySide === 'prosecution' ? et.prosecution_fund : mySide === 'defense' ? et.defense_fund : 0;
  const canBuy = !!mySide && kind === 'market' && et.status === 'evidence_market' && myFund >= BUY_REVEALED_CARD_COST;
  const canPlay = !!mySide && kind === 'hand' && et.status === 'trial' && card.owner_side === mySide && playedBySide < MAX_CARDS_PER_SIDE;

  return (
    <div className="flex items-center gap-2 p-2 rounded-xl bg-card/40 text-xs">
      <CardSideChip side={card.side} />
      <div className="flex-1 min-w-0">
        <div className="font-bold truncate">{card.title}</div>
        <div className="text-[10px] text-muted-foreground truncate">{card.description}</div>
      </div>
      <span className={cn('font-mono text-xs',
        card.points > 0 ? 'text-emerald-300' : card.points < 0 ? 'text-red-300' : 'text-muted-foreground')}>
        {card.points > 0 ? '+' : ''}{card.points}
      </span>
      {kind === 'market' && (
        <button
          className="btn-secondary text-[10px] px-2 py-1.5"
          disabled={!canBuy}
          onClick={() => buyCard(game, card.id, mySide!)}
        >Купить</button>
      )}
      {kind === 'hand' && (
        <button
          className="btn-primary text-[10px] px-2 py-1.5"
          disabled={!canPlay}
          onClick={() => playCard(game, card.id, mySide!)}
        >Сыграть</button>
      )}
    </div>
  );
}

function PlayedCardRow({ card }: { card: EliteTrialCard }) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-xl bg-card/30 border border-white/5 text-xs">
      <CardSideChip side={card.side} />
      <div className="flex-1 min-w-0">
        <div className="font-bold truncate">{card.title}</div>
        <div className="text-[10px] text-muted-foreground">
          {card.played_by_side === 'prosecution' ? 'сыграло Обвинение' : 'сыграла Защита'}
          {card.effect_note && ` · ${card.effect_note}`}
        </div>
      </div>
      <span className={cn('font-mono text-xs',
        card.points > 0 ? 'text-emerald-300' : card.points < 0 ? 'text-red-300' : 'text-muted-foreground')}>
        {card.points > 0 ? '+' : ''}{card.points}
      </span>
    </div>
  );
}

function CardSideChip({ side }: { side: EliteTrialCard['side'] }) {
  const map: Record<EliteTrialCard['side'], { label: string; cls: string }> = {
    prosecution: { label: 'обв.',   cls: 'bg-red-500/15 text-red-300 border-red-500/30' },
    defense:     { label: 'защ.',   cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
    neutral:     { label: 'нейтр.', cls: 'bg-gray-500/15 text-gray-300 border-gray-500/30' },
    dangerous:   { label: 'риск',   cls: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30' },
  };
  const m = map[side];
  return <span className={cn('px-1.5 py-0.5 rounded-full text-[9px] font-bold border', m.cls)}>{m.label}</span>;
}

// ---------- Действия с картами ----------

async function revealRandomCard(game: SuperGame, side: EliteTrialSide) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  const fund = side === 'prosecution' ? cur.prosecution_fund : cur.defense_fund;
  if (fund < REVEAL_RANDOM_CARD_COST) return;
  const hidden = cur.cards.filter(c => c.status === 'hidden');
  if (hidden.length === 0) return;

  const pick = hidden[Math.floor(Math.random() * hidden.length)];
  const cards = cur.cards.map(c => c.id === pick.id ? { ...c, status: 'revealed' as const } : c);
  const next: EliteTrialState = {
    ...cur,
    cards,
    prosecution_fund: side === 'prosecution' ? cur.prosecution_fund - REVEAL_RANDOM_CARD_COST : cur.prosecution_fund,
    defense_fund: side === 'defense' ? cur.defense_fund - REVEAL_RANDOM_CARD_COST : cur.defense_fund,
  };
  await sb.from('super_games').update({ state: next }).eq('id', game.id);
  await pushEvent(`Открыта карта дела: ${pick.title}`, undefined, `/super-games/${game.id}`);
}

async function buyCard(game: SuperGame, cardId: string, side: EliteTrialSide) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  const card = cur.cards.find(c => c.id === cardId);
  if (!card || card.status !== 'revealed') return;
  const fund = side === 'prosecution' ? cur.prosecution_fund : cur.defense_fund;
  if (fund < BUY_REVEALED_CARD_COST) return;

  const cards = cur.cards.map(c => c.id === cardId
    ? { ...c, status: 'owned' as const, owner_side: side }
    : c);
  const next: EliteTrialState = {
    ...cur,
    cards,
    prosecution_fund: side === 'prosecution' ? cur.prosecution_fund - BUY_REVEALED_CARD_COST : cur.prosecution_fund,
    defense_fund: side === 'defense' ? cur.defense_fund - BUY_REVEALED_CARD_COST : cur.defense_fund,
  };
  await sb.from('super_games').update({ state: next }).eq('id', game.id);
}

async function playCard(game: SuperGame, cardId: string, side: EliteTrialSide) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  const card = cur.cards.find(c => c.id === cardId);
  if (!card || card.status !== 'owned' || card.owner_side !== side) return;

  // Проверка лимита (5 карт на сторону)
  const playedBySide = cur.cards.filter(c => c.status === 'played' && c.played_by_side === side).length;
  if (playedBySide >= MAX_CARDS_PER_SIDE) return;

  // Применяем эффект через чистую логику
  const result = applyCardPlay(card, side, cur.prosecution_score, cur.defense_score);

  const cards = cur.cards.map(c => c.id === cardId
    ? {
        ...c,
        status: 'played' as const,
        played_at: new Date().toISOString(),
        played_by_side: side,
        effect_note: result.note,
      }
    : c);

  const next: EliteTrialState = {
    ...cur,
    cards,
    prosecution_score: result.prosecution,
    defense_score: result.defense,
  };
  await sb.from('super_games').update({ state: next }).eq('id', game.id);
  await pushEvent(
    `Сыграна карта: ${card.title}`,
    result.note,
    `/super-games/${game.id}`,
  );
}

// ---------- Финал ----------

function FinalView({ et, target }: { et: EliteTrialState; target: Participant | null }) {
  const guilty = et.verdict === 'elite_guilty';
  return (
    <div className={cn('glass-strong p-5 text-center',
      guilty ? 'crimson-border' : 'gold-border')}>
      <div className="text-[10px] uppercase tracking-widest text-gold/70">Вердикт</div>
      <h3 className={cn('font-heading text-2xl font-bold mt-2',
        guilty ? 'text-red-300' : 'text-gradient-gold')}>
        {target?.display_name ?? 'Элита'} {guilty ? 'признан(а) виновным(ой)' : 'оправдан(а)'}
      </h3>
      <p className="text-xs text-muted-foreground mt-1">
        Обвинение: <span className="text-red-300">{et.prosecution_score}</span>
        {' · '}
        Защита: <span className="text-emerald-300">{et.defense_score}</span>
      </p>
      {guilty ? (
        <div className="mt-3 inline-block px-3 py-1 rounded-full bg-red-500/10 border border-red-500/40 text-red-300 text-xs">
          Штраф в Казну: <Yen amount={ELITE_GUILTY_FINE} className="inline" iconClass="w-3 h-3" />
        </div>
      ) : (
        <div className="mt-3 inline-block px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/40 text-emerald-300 text-xs">
          Компенсация из Казны: <Yen amount={ELITE_ACQUITTED_COMPENSATION} className="inline" iconClass="w-3 h-3" />
        </div>
      )}
    </div>
  );
}

// ---------- Админ-панель ----------

function AdminPanel({ game, et }: { game: SuperGame; et: EliteTrialState }) {
  const { state } = useStore();
  const [target, setTarget] = useState<string>(et.target_elite_id);
  const [accusation, setAccusation] = useState<string>(et.accusation_text);
  const [defense, setDefense] = useState<string>(et.defense_text);

  // Активные цели Суда: Джунко (p-14), Мондо (p-11), Кируми (p-15).
  // Бьякуя (p-3) исключён, потому что не активный участник.
  const TARGET_ELITE_IDS = ['p-14', 'p-11', 'p-15'];
  const elites = state.participants.filter(p =>
    TARGET_ELITE_IDS.includes(p.id) && p.is_active
  );
  const players = state.participants.filter(p => isPlayer(p) && p.is_active && p.id !== et.target_elite_id);

  return (
    <div className="glass-strong gold-border p-4 space-y-3">
      <div className="text-[10px] uppercase tracking-widest text-gold/70">⚙️ Управление ведущего</div>

      {/* Выбор Элиты и текстов */}
      {(et.status === 'scheduled' || et.status === 'target_selection' || et.status === 'side_setup' || et.status === 'accusation_setup' || et.status === 'defense_setup') && (
        <div className="space-y-2">
          <select
            className="input-field text-xs"
            value={target}
            onChange={e => setTarget(e.target.value)}
          >
            <option value="">— выбрать судимую Элиту —</option>
            {elites.map(p => (
              <option key={p.id} value={p.id}>{p.display_name}</option>
            ))}
          </select>
          <input
            className="input-field text-xs"
            placeholder="Пункт обвинения"
            value={accusation}
            onChange={e => setAccusation(e.target.value)}
          />
          <input
            className="input-field text-xs"
            placeholder="Линия защиты"
            value={defense}
            onChange={e => setDefense(e.target.value)}
          />
          <button
            className="btn-secondary w-full text-xs"
            onClick={() => updateMeta(game, target, accusation, defense)}
          >Сохранить</button>

          <SidePicker game={game} et={et} side="prosecution" players={players} />
          <SidePicker game={game} et={et} side="defense" players={players} />
        </div>
      )}

      {/* Сгенерировать колоду и открыть рынок */}
      {et.status !== 'evidence_market' && et.status !== 'trial' && et.status !== 'finished' && (
        <button
          className="btn-primary w-full text-xs"
          disabled={!et.target_elite_id || !et.accusation_text}
          onClick={() => startEvidenceMarket(game)}
        >Сгенерировать колоду и открыть рынок</button>
      )}

      {et.status === 'evidence_market' && (
        <button
          className="btn-primary w-full text-xs"
          onClick={() => startTrial(game)}
        >▶ Начать суд (фаза публичных карт)</button>
      )}

      {et.status === 'trial' && (
        <button
          className="btn-success w-full text-xs"
          onClick={() => finishTrial(game)}
        >🏁 Вынести вердикт</button>
      )}

      <details className="text-xs">
        <summary className="cursor-pointer text-red-300/80 py-1">Отменить суд</summary>
        <button
          className="btn-danger w-full text-xs mt-2"
          onClick={() => cancelTrial(game)}
        >Отменить</button>
      </details>
    </div>
  );
}

function SidePicker({
  game, et, side, players,
}: {
  game: SuperGame; et: EliteTrialState; side: EliteTrialSide; players: Participant[];
}) {
  const ids = side === 'prosecution' ? et.prosecution_player_ids : et.defense_player_ids;
  return (
    <details className="text-[11px]">
      <summary className="cursor-pointer text-gold/80 py-1">
        {side === 'prosecution' ? 'Назначить Обвинение' : 'Назначить Защиту'} ({ids.length})
      </summary>
      <div className="grid grid-cols-2 gap-1 mt-1">
        {players.map(p => {
          const inSide = ids.includes(p.id);
          const inOther = side === 'prosecution'
            ? et.defense_player_ids.includes(p.id)
            : et.prosecution_player_ids.includes(p.id);
          return (
            <button
              key={p.id}
              disabled={inOther}
              onClick={() => toggleSidePlayer(game, side, p.id)}
              className={cn(
                'flex items-center gap-1.5 p-1.5 rounded-lg text-left text-xs border',
                inSide ? 'bg-gold/15 border-gold/40 text-gold' : 'bg-card/40 border-white/8',
                inOther && 'opacity-40 cursor-not-allowed',
              )}
            >
              <CharacterIcon participant={p} size="xs" ringless />
              <span className="truncate">{p.display_name}</span>
            </button>
          );
        })}
      </div>
    </details>
  );
}

async function updateMeta(game: SuperGame, targetId: string, accusation: string, defense: string) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  await sb.from('super_games').update({
    state: { ...cur, target_elite_id: targetId, accusation_text: accusation, defense_text: defense },
  }).eq('id', game.id);
}

async function toggleSidePlayer(game: SuperGame, side: EliteTrialSide, playerId: string) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  const key = side === 'prosecution' ? 'prosecution_player_ids' : 'defense_player_ids';
  const list = (cur[key] as string[]) ?? [];
  const next = list.includes(playerId) ? list.filter(x => x !== playerId) : [...list, playerId];
  await sb.from('super_games').update({
    state: { ...cur, [key]: next },
  }).eq('id', game.id);
}

async function startEvidenceMarket(game: SuperGame) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  // Если карты уже сгенерированы — не пересоздаём
  if (cur.cards.length === 0) {
    const deck = generateDeck();
    const cards: EliteTrialCard[] = deck.map((t, i) => ({
      id: 'c-' + Date.now() + '-' + i + '-' + Math.random().toString(36).slice(2, 4),
      title: t.title,
      side: t.side,
      points: t.points,
      effect_type: t.effect_type,
      description: t.description,
      status: 'hidden',
      owner_side: null,
    }));
    await sb.from('super_games').update({
      state: { ...cur, cards, status: 'evidence_market' },
      status: 'live',
    }).eq('id', game.id);
  } else {
    await sb.from('super_games').update({
      state: { ...cur, status: 'evidence_market' },
      status: 'live',
    }).eq('id', game.id);
  }
  await pushEvent('Суд над Элитой · открыт рынок доказательств', undefined, `/super-games/${game.id}`);
}

async function startTrial(game: SuperGame) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  await sb.from('super_games').update({
    state: { ...cur, status: 'trial' },
  }).eq('id', game.id);
  await pushEvent('Суд над Элитой · фаза публичного суда', undefined, `/super-games/${game.id}`);
}

async function finishTrial(game: SuperGame) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  const verdict = pickVerdict(cur.prosecution_score, cur.defense_score);
  const link = `/super-games/${game.id}`;

  if (verdict === 'elite_guilty' && cur.target_elite_id) {
    await chargeToTreasury(cur.target_elite_id, ELITE_GUILTY_FINE,
      'Суд над Элитой · штраф', link);
  } else if (verdict === 'elite_acquitted' && cur.target_elite_id) {
    await payoutFromTreasury(cur.target_elite_id, ELITE_ACQUITTED_COMPENSATION,
      'Суд над Элитой · компенсация', link);
  }

  await sb.from('super_games').update({
    state: { ...cur, verdict, status: 'finished' },
    status: 'finished',
  }).eq('id', game.id);

  const sb2 = getSupabase();
  if (sb2) {
    const { data: tgt } = await sb2.from('participants').select('display_name').eq('id', cur.target_elite_id).single();
    const name = tgt?.display_name ?? 'Элита';
    if (verdict === 'elite_guilty') {
      await pushEvent(
        `${name} признан(а) виновным(ой)`,
        `Очки: ${cur.prosecution_score} обв. — ${cur.defense_score} защ. Штраф ${ELITE_GUILTY_FINE} в Казну.`,
        link,
      );
    } else {
      await pushEvent(
        `${name} оправдан(а)`,
        `Очки: ${cur.prosecution_score} обв. — ${cur.defense_score} защ. Компенсация ${ELITE_ACQUITTED_COMPENSATION} из Казны.`,
        link,
      );
    }
  }
}

async function cancelTrial(game: SuperGame) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  await sb.from('super_games').update({
    state: { ...cur, status: 'cancelled' },
    status: 'cancelled',
  }).eq('id', game.id);
  await pushEvent('Суд над Элитой отменён', undefined, `/super-games/${game.id}`);
}
