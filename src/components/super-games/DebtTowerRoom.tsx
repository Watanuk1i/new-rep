'use client';

// ===========================================================================
// «Долговая башня Мондо» — личная Большая игра Мондо.
// Куратор: Мондо (p-11). Селестия — наблюдатель.
// 4–8 игроков, 5 этажей, на каждом игрок тайно выбирает дверь:
//   - Оплата: −¥50k
//   - Риск:   50/50 ±¥150k
//   - Долг:   получить долг 100k → 200k → ... → 500k за повторные выборы
// Победитель = max cleanResult; забирает банк и помечается «Кандидат в Элиту».
// Долги создаются в таблице debts (creditor = Казна; в description пометка
// «коллектор Мондо», чтобы он мог их фильтровать в админ-вкладке Долгов).
// ===========================================================================

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/lib/store/StoreProvider';
import { CharacterIcon } from '@/components/ui/CharacterIcon';
import { Yen } from '@/components/ui/Yen';
import { cn } from '@/lib/utils';
import { getSupabase } from '@/lib/supabase/client';
import { chargeToTreasury, payoutFromTreasury, TREASURY_ID } from '@/lib/store/tx';
import {
  ENTRY_FEE, PAYMENT_COST, RISK_SUCCESS_REWARD, RISK_FAIL_PENALTY,
  DEBT_AMOUNTS_BY_COUNT, TOTAL_FLOORS,
  resolveChoice, applyOutcomeToScore, emptyScore, pickWinner,
} from '@/lib/debttower/logic';
import type {
  SuperGame, Participant, DebtTowerState, DebtTowerFloor, DebtTowerChoice,
  DebtTowerPlayerState, DoorChoice,
} from '@/lib/store/types';

const MONDO_ID = 'p-11';

// ---------- helpers ----------

function getState(g: SuperGame): DebtTowerState {
  const s = (g.state || {}) as Partial<DebtTowerState>;
  return {
    current_floor: s.current_floor ?? 0,
    total_floors: s.total_floors ?? TOTAL_FLOORS,
    floors: s.floors ?? [],
    fee_paid: s.fee_paid ?? {},
    scores: s.scores ?? {},
    status: s.status ?? 'scheduled',
    winner_id: s.winner_id ?? null,
    winner_is_candidate_for_elite: s.winner_is_candidate_for_elite ?? false,
  };
}

async function readState(gameId: string): Promise<DebtTowerState | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.from('super_games').select('state').eq('id', gameId).single();
  return (data?.state as DebtTowerState) ?? null;
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

export function DebtTowerRoom({ game }: { game: SuperGame }) {
  const { state, currentUser, role } = useStore();
  const isAdmin = role === 'gm' || role === 'queen';
  const dt = getState(game);

  const participants = (game.participant_ids || [])
    .map(pid => state.participants.find(p => p.id === pid))
    .filter(Boolean) as Participant[];

  const currentFloor: DebtTowerFloor | null =
    dt.current_floor > 0 ? dt.floors[dt.current_floor - 1] ?? null : null;

  const isPlayerInGame = !!currentUser && participants.some(p => p.id === currentUser.id);

  return (
    <div className="space-y-4">
      <Header game={game} dt={dt} />

      {/* Сбор взносов */}
      {(dt.status === 'scheduled' || dt.status === 'collecting_stakes') && (
        <StakesBlock game={game} dt={dt} participants={participants} isAdmin={isAdmin} />
      )}

      {/* Текущий этаж */}
      {currentFloor && dt.status !== 'finished' && dt.status !== 'cancelled' && (
        <FloorView
          game={game} dt={dt} floor={currentFloor}
          participants={participants}
          currentUserId={currentUser?.id ?? null}
          isPlayerInGame={isPlayerInGame}
          isAdmin={isAdmin}
        />
      )}

      {/* Таблица результатов */}
      {Object.keys(dt.scores).length > 0 && (
        <ScoresTable dt={dt} participants={participants} />
      )}

      {/* История этажей */}
      {dt.floors.some(f => f.status === 'resolved') && (
        <FloorsHistory dt={dt} participants={participants} />
      )}

      {/* Финал */}
      {dt.status === 'finished' && (
        <FinishedView dt={dt} participants={participants} game={game} isAdmin={isAdmin} />
      )}

      {/* Админ-панель */}
      {isAdmin && dt.status !== 'finished' && dt.status !== 'cancelled' && (
        <AdminPanel game={game} dt={dt} participants={participants} />
      )}
    </div>
  );
}

// ---------- Шапка ----------

function Header({ game, dt }: { game: SuperGame; dt: DebtTowerState }) {
  return (
    <div className="glass-strong gold-border p-4">
      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-gold/70">Банк</div>
          <Yen amount={game.bank} className="text-base text-gold mt-1" iconClass="w-4 h-4" />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-gold/70">Этаж</div>
          <div className="font-mono font-bold text-gold text-lg mt-1">
            {dt.current_floor > 0 ? `${dt.current_floor}/${TOTAL_FLOORS}` : `0/${TOTAL_FLOORS}`}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-gold/70">Игроков</div>
          <div className="font-mono font-bold text-gold text-lg mt-1">{(game.participant_ids || []).length}</div>
        </div>
      </div>
      <div className="mt-3 text-center text-[10px] text-muted-foreground">
        Куратор · Мондо Овада · Наблюдатель · Селестия Люденберг
      </div>
    </div>
  );
}

// ---------- Сбор взносов ----------

function StakesBlock({
  game, dt, participants, isAdmin,
}: {
  game: SuperGame; dt: DebtTowerState; participants: Participant[]; isAdmin: boolean;
}) {
  const expectedBank = participants.length * ENTRY_FEE;
  const allPaid = participants.length > 0 && participants.every(p => (dt.fee_paid[p.id] ?? 0) > 0);

  return (
    <div className="glass p-4 space-y-3">
      <div className="section-title text-sm">💰 Входные ставки</div>
      <p className="text-xs text-muted-foreground">
        Каждый участник вносит <Yen amount={ENTRY_FEE} className="inline" iconClass="w-3 h-3" /> в банк.
        Ожидаемый банк: <Yen amount={expectedBank} className="inline" iconClass="w-3 h-3" />.
      </p>
      <div className="space-y-1.5">
        {participants.map(p => {
          const paid = (dt.fee_paid[p.id] ?? 0) > 0;
          return (
            <div key={p.id} className="flex items-center gap-2 p-2 rounded-xl bg-card/40">
              <CharacterIcon participant={p} size="xs" ringless />
              <span className="flex-1 text-sm">{p.display_name}</span>
              <Yen amount={ENTRY_FEE} className="text-xs text-muted-foreground" iconClass="w-3 h-3" />
              {paid
                ? <span className="text-emerald-400 text-sm">✓</span>
                : <span className="text-muted-foreground text-sm">…</span>}
            </div>
          );
        })}
      </div>
      {isAdmin && !allPaid && (
        <button
          className="btn-primary w-full text-sm"
          onClick={() => collectStakes(game, dt, participants)}
        >
          Собрать взносы
        </button>
      )}
      {allPaid && isAdmin && dt.current_floor === 0 && (
        <button
          className="btn-success w-full text-sm"
          onClick={() => startFirstFloor(game)}
        >
          ▶ Начать этаж 1
        </button>
      )}
    </div>
  );
}

async function collectStakes(game: SuperGame, dt: DebtTowerState, participants: Participant[]) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id) ?? dt;
  const feePaid: Record<string, number> = { ...cur.fee_paid };
  const scores: Record<string, DebtTowerPlayerState> = { ...cur.scores };
  let bankAdded = 0;

  for (const p of participants) {
    if ((feePaid[p.id] ?? 0) > 0) continue;
    const res = await chargeToTreasury(p.id, ENTRY_FEE, 'Взнос: Долговая башня Мондо', `/super-games/${game.id}`);
    if (res.ok) {
      feePaid[p.id] = ENTRY_FEE;
      bankAdded += ENTRY_FEE;
    }
    if (!scores[p.id]) {
      scores[p.id] = {
        total_profit: 0, total_loss: 0, total_debt: 0, debt_choice_count: 0, clean_result: 0,
      };
    }
  }

  const next: DebtTowerState = {
    ...cur,
    fee_paid: feePaid,
    scores,
    status: 'collecting_stakes',
  };

  await sb.from('super_games').update({
    state: next,
    bank: (game.bank ?? 0) + bankAdded,
    status: 'live',
  }).eq('id', game.id);

  await pushEvent(
    'Долговая башня Мондо: взносы собраны',
    `${participants.length} игроков, банк формируется.`,
    `/super-games/${game.id}`,
  );
}

async function startFirstFloor(game: SuperGame) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  const floor: DebtTowerFloor = {
    number: 1,
    status: 'selection',
    choices: {},
  };
  await sb.from('super_games').update({
    state: { ...cur, current_floor: 1, floors: [floor], status: 'floor_selection' },
  }).eq('id', game.id);
  await pushEvent('Долговая башня · этаж 1', undefined, `/super-games/${game.id}`);
}

// ---------- Этаж: фазы ----------

function FloorView({
  game, dt, floor, participants, currentUserId, isPlayerInGame, isAdmin,
}: {
  game: SuperGame; dt: DebtTowerState; floor: DebtTowerFloor;
  participants: Participant[]; currentUserId: string | null;
  isPlayerInGame: boolean; isAdmin: boolean;
}) {
  return (
    <div className="glass-strong gold-border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-heading text-lg font-bold text-gradient-gold">Этаж {floor.number}/{TOTAL_FLOORS}</div>
        <PhaseBadge status={floor.status} />
      </div>

      {floor.status === 'selection' && (
        <FloorSelection
          game={game} dt={dt} floor={floor}
          participants={participants}
          currentUserId={currentUserId}
          isPlayerInGame={isPlayerInGame}
        />
      )}

      {floor.status === 'revealed' && (
        <div className="text-xs text-muted-foreground text-center py-2">
          Все игроки сделали выбор. Ведущий раскроет результаты этажа.
        </div>
      )}

      {floor.status === 'resolved' && (
        <FloorResolved floor={floor} participants={participants} />
      )}
    </div>
  );
}

function PhaseBadge({ status }: { status: DebtTowerFloor['status'] }) {
  const map: Record<DebtTowerFloor['status'], { label: string; cls: string }> = {
    selection: { label: 'Выбор дверей', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
    revealed:  { label: 'Готово',      cls: 'bg-purple-500/15 text-purple-300 border-purple-500/30' },
    resolved:  { label: 'Раскрыт',     cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  };
  const m = map[status];
  return <span className={cn('status-badge border', m.cls)}>{m.label}</span>;
}

function FloorSelection({
  game, dt, floor, participants, currentUserId, isPlayerInGame,
}: {
  game: SuperGame; dt: DebtTowerState; floor: DebtTowerFloor;
  participants: Participant[]; currentUserId: string | null;
  isPlayerInGame: boolean;
}) {
  const myChoice = currentUserId ? floor.choices[currentUserId]?.choice : undefined;
  const totalNeeded = participants.length;
  const placedCount = Object.keys(floor.choices).length;
  const myDebtCount = currentUserId ? (dt.scores[currentUserId]?.debt_choice_count ?? 0) : 0;

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        Все участники тайно выбирают одну из трёх дверей. Выборы скрыты до раскрытия.
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
        {participants.map(p => {
          const placed = !!floor.choices[p.id];
          return (
            <div key={p.id} className={cn(
              'flex flex-col items-center gap-1 p-1.5 rounded-lg',
              placed ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-card/40 border border-white/8',
            )}>
              <CharacterIcon participant={p} size="xs" ringless />
              <span className="text-[10px] truncate max-w-[60px]">{p.display_name.split(' ')[0]}</span>
              <span className={cn('text-[9px] uppercase tracking-wider font-bold',
                placed ? 'text-emerald-300' : 'text-muted-foreground')}>
                {placed ? '✓' : '…'}
              </span>
            </div>
          );
        })}
      </div>
      <div className="text-[10px] text-center text-muted-foreground">
        Готово: {placedCount}/{totalNeeded}
      </div>

      {isPlayerInGame && currentUserId && (
        <DoorButtons
          game={game} floor={floor}
          currentUserId={currentUserId}
          myChoice={myChoice}
          myDebtCount={myDebtCount}
        />
      )}

      {!isPlayerInGame && (
        <div className="text-[11px] text-muted-foreground italic text-center">
          Вы наблюдатель — выборы будут раскрыты после фазы.
        </div>
      )}
    </div>
  );
}

function DoorButtons({
  game, floor, currentUserId, myChoice, myDebtCount,
}: {
  game: SuperGame; floor: DebtTowerFloor;
  currentUserId: string;
  myChoice?: DoorChoice;
  myDebtCount: number;
}) {
  const nextDebtAmount = DEBT_AMOUNTS_BY_COUNT[Math.min(myDebtCount + 1, 5)];

  const doors: { key: DoorChoice; title: string; emoji: string; desc: React.ReactNode; color: string }[] = [
    {
      key: 'payment', title: 'Оплата', emoji: '💵',
      desc: <>Отдать <Yen amount={PAYMENT_COST} className="inline" iconClass="w-3 h-3" /> и пройти этаж. Безопасно.</>,
      color: 'emerald',
    },
    {
      key: 'risk', title: 'Риск', emoji: '🎲',
      desc: <>50/50: +<Yen amount={RISK_SUCCESS_REWARD} className="inline" iconClass="w-3 h-3" /> или −<Yen amount={RISK_FAIL_PENALTY} className="inline" iconClass="w-3 h-3" />.</>,
      color: 'amber',
    },
    {
      key: 'debt', title: 'Долг', emoji: '📜',
      desc: <>Сейчас 0. Долг {myDebtCount + 1}-й = <Yen amount={nextDebtAmount} className="inline" iconClass="w-3 h-3" />. Кредитор — Казна, взыскатель — Мондо.</>,
      color: 'red',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-2">
      {doors.map(d => {
        const active = myChoice === d.key;
        return (
          <button
            key={d.key}
            onClick={() => placeChoice(game, floor, currentUserId, d.key)}
            className={cn(
              'w-full px-3 py-3 rounded-xl text-left transition-colors border',
              active
                ? 'bg-gold/15 border-gold text-gold-light'
                : 'bg-card/60 border-white/10 active:bg-card/80',
            )}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm">{d.emoji} {d.title}</span>
              {active && <span className="text-[10px] text-gold">✓ выбрано — нажмите другую, чтобы поменять</span>}
            </div>
            <div className="text-[11px] text-muted-foreground mt-1">{d.desc}</div>
          </button>
        );
      })}
      {myChoice && (
        <div className="text-[11px] text-emerald-300 text-center">
          ✓ Выбор записан. Можно поменять, пока ведущий не закрыл этаж.
        </div>
      )}
    </div>
  );
}

async function placeChoice(game: SuperGame, floor: DebtTowerFloor, playerId: string, choice: DoorChoice) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  const idx = cur.current_floor - 1;
  const floors = [...cur.floors];
  const target = floors[idx];
  if (!target) return;
  // Запрет смены после закрытия этажа: только в фазе 'selection'
  if (target.status !== 'selection') return;

  const newChoice: DebtTowerChoice = {
    player_id: playerId,
    choice,
  };
  floors[idx] = {
    ...target,
    choices: { ...target.choices, [playerId]: newChoice },
  };
  await sb.from('super_games').update({ state: { ...cur, floors } }).eq('id', game.id);
}

// ---------- Раскрытый этаж ----------

function FloorResolved({ floor, participants }: { floor: DebtTowerFloor; participants: Participant[] }) {
  return (
    <div className="space-y-1.5">
      {participants.map(p => {
        const c = floor.choices[p.id];
        return <FloorChoiceRow key={p.id} player={p} choice={c} />;
      })}
    </div>
  );
}

function FloorChoiceRow({ player, choice }: { player: Participant; choice?: DebtTowerChoice }) {
  if (!choice) {
    return (
      <div className="flex items-center gap-2 p-2 rounded-xl bg-card/30 text-xs">
        <CharacterIcon participant={player} size="xs" ringless />
        <span className="flex-1 truncate">{player.display_name}</span>
        <span className="text-muted-foreground italic">пропустил</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 p-2 rounded-xl bg-card/40 text-xs">
      <CharacterIcon participant={player} size="xs" ringless />
      <span className="flex-1 truncate">{player.display_name}</span>
      <DoorChip choice={choice.choice} riskResult={choice.risk_result ?? null} />
      <span className="font-mono text-xs w-24 text-right">
        {(choice.money_delta ?? 0) !== 0 && (
          <span className={cn((choice.money_delta ?? 0) > 0 ? 'text-emerald-300' : 'text-red-300')}>
            {(choice.money_delta ?? 0) > 0 ? '+' : ''}
            {new Intl.NumberFormat('ru-RU').format(choice.money_delta ?? 0)}
          </span>
        )}
        {(choice.debt_created ?? 0) > 0 && (
          <span className="text-fuchsia-300">+долг {(choice.debt_created ?? 0) / 1000}K</span>
        )}
      </span>
    </div>
  );
}

function DoorChip({ choice, riskResult }: { choice: DoorChoice; riskResult: 'success' | 'fail' | null }) {
  if (choice === 'payment') {
    return <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold border bg-emerald-500/15 text-emerald-300 border-emerald-500/30">💵 Оплата</span>;
  }
  if (choice === 'risk') {
    if (riskResult === 'success') return <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold border bg-emerald-500/15 text-emerald-300 border-emerald-500/30">🎲 Риск ✓</span>;
    if (riskResult === 'fail') return <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold border bg-red-500/15 text-red-300 border-red-500/30">🎲 Риск ✕</span>;
    return <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold border bg-amber-500/15 text-amber-300 border-amber-500/30">🎲 Риск</span>;
  }
  return <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold border bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30">📜 Долг</span>;
}

// ---------- Таблица результатов ----------

function ScoresTable({ dt, participants }: { dt: DebtTowerState; participants: Participant[] }) {
  return (
    <div className="glass p-4">
      <div className="section-title text-sm mb-2">📊 Результаты</div>
      <div className="space-y-1">
        {participants.map(p => {
          const s = dt.scores[p.id] ?? emptyScoreObj();
          return (
            <div key={p.id} className="flex items-center gap-2 p-1.5 rounded-xl bg-card/40 text-xs">
              <CharacterIcon participant={p} size="xs" ringless />
              <span className="flex-1 truncate">{p.display_name}</span>
              <span className="text-emerald-300/80 font-mono w-14 text-right">+{(s.total_profit / 1000).toFixed(0)}K</span>
              <span className="text-red-300/80 font-mono w-14 text-right">-{(s.total_loss / 1000).toFixed(0)}K</span>
              <span className="text-fuchsia-300/80 font-mono w-14 text-right">{s.total_debt > 0 ? `долг ${(s.total_debt / 1000).toFixed(0)}K` : '—'}</span>
              <span className={cn(
                'font-mono w-16 text-right font-bold',
                s.clean_result > 0 ? 'text-emerald-300' : s.clean_result < 0 ? 'text-red-300' : 'text-muted-foreground',
              )}>
                {s.clean_result > 0 ? '+' : ''}{new Intl.NumberFormat('ru-RU').format(s.clean_result)}
              </span>
            </div>
          );
        })}
      </div>
      <div className="text-[10px] text-muted-foreground mt-2">
        Чистый результат = прибыль − потери − созданные долги. Входной взнос не учитывается.
      </div>
    </div>
  );
}

function emptyScoreObj(): DebtTowerPlayerState {
  return { total_profit: 0, total_loss: 0, total_debt: 0, debt_choice_count: 0, clean_result: 0 };
}

// ---------- История этажей ----------

function FloorsHistory({ dt, participants }: { dt: DebtTowerState; participants: Participant[] }) {
  const floors = dt.floors.filter(f => f.status === 'resolved');
  if (floors.length === 0) return null;

  return (
    <div className="glass p-4">
      <div className="section-title text-sm mb-2">🏛️ История этажей</div>
      <div className="space-y-2">
        {floors.map(f => (
          <details key={f.number} className="bg-card/30 rounded-xl border border-white/8 overflow-hidden">
            <summary className="px-3 py-2 cursor-pointer text-xs font-bold">
              Этаж {f.number}
              <span className="ml-2 text-muted-foreground font-normal">
                ({Object.keys(f.choices).length} выборов)
              </span>
            </summary>
            <div className="p-3 pt-0">
              <FloorResolved floor={f} participants={participants} />
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

// ---------- Финал ----------

function FinishedView({
  dt, participants, game, isAdmin,
}: {
  dt: DebtTowerState; participants: Participant[]; game: SuperGame; isAdmin: boolean;
}) {
  const winner = participants.find(p => p.id === dt.winner_id) ?? null;

  return (
    <div className="glass-strong gold-border p-5 text-center">
      <div className="text-[10px] uppercase tracking-widest text-gold/70">Игра завершена</div>
      {winner ? (
        <>
          <h3 className="font-heading text-2xl font-bold text-gradient-gold mt-2">{winner.display_name}</h3>
          <p className="text-xs text-muted-foreground mt-1">забрал банк</p>
          <Yen amount={game.bank} className="text-2xl text-gold mt-2 justify-center" iconClass="w-5 h-5" />
          {dt.winner_is_candidate_for_elite && (
            <div className="mt-3 inline-block px-3 py-1 rounded-full bg-gold/10 border border-gold/40 text-gold text-xs font-bold">
              👑 Кандидат в Элиту
            </div>
          )}
          {isAdmin && winner.status !== 'elite' && (
            <div className="mt-3">
              <button
                className="btn-primary text-xs"
                onClick={() => promoteToElite(winner.id, game.id)}
              >
                ⭐ Повысить до Элиты
              </button>
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground mt-2">Победитель не определён.</p>
      )}
    </div>
  );
}

async function promoteToElite(playerId: string, gameId: string) {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from('participants').update({ status: 'elite' }).eq('id', playerId);
  const { data: p } = await sb.from('participants').select('display_name').eq('id', playerId).single();
  const name = p?.display_name ?? '';
  await pushEvent(
    `${name} прошёл Долговую башню Мондо и был повышен до Элиты`,
    undefined,
    `/super-games/${gameId}`,
  );
  await logHistory(playerId, 'elite_promotion',
    'Повышение до Элиты по итогам Долговой башни Мондо',
    null, `/super-games/${gameId}`);
}

// ===========================================================================
// АДМИН-ПАНЕЛЬ
// ===========================================================================

function AdminPanel({
  game, dt, participants,
}: {
  game: SuperGame; dt: DebtTowerState; participants: Participant[];
}) {
  const floor = dt.current_floor > 0 ? dt.floors[dt.current_floor - 1] : null;

  return (
    <div className="glass-strong gold-border p-4 space-y-2">
      <div className="text-[10px] uppercase tracking-widest text-gold/70">⚙️ Управление ведущего</div>

      {floor?.status === 'selection' && (
        <>
          <div className="text-[11px] text-muted-foreground">
            Сделали выбор: {Object.keys(floor.choices).length}/{participants.length}
          </div>
          <button
            className="btn-primary w-full text-xs"
            disabled={Object.keys(floor.choices).length < participants.length}
            onClick={() => closeSelection(game)}
          >Завершить выбор дверей</button>
        </>
      )}

      {floor?.status === 'revealed' && (
        <button
          className="btn-success w-full text-xs"
          onClick={() => revealFloor(game, participants)}
        >🎬 Раскрыть этаж и применить эффекты</button>
      )}

      {floor?.status === 'resolved' && (
        dt.current_floor < TOTAL_FLOORS ? (
          <button
            className="btn-primary w-full text-xs"
            onClick={() => nextFloor(game)}
          >Начать этаж {dt.current_floor + 1}</button>
        ) : (
          <button
            className="btn-success w-full text-xs"
            onClick={() => finishGame(game, participants)}
          >🏁 Завершить игру и выплатить банк</button>
        )
      )}

      {/* Назначить победителя вручную */}
      {dt.status !== 'finished' && dt.status !== 'cancelled' && Object.keys(dt.scores).length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground py-1">Назначить победителя вручную</summary>
          <div className="grid grid-cols-2 gap-1 mt-2">
            {participants.map(p => (
              <button
                key={p.id}
                className="text-left px-2 py-2 rounded-lg bg-card/40 border border-white/8 active:bg-white/5"
                onClick={() => finishGame(game, participants, p.id)}
              >
                🏆 {p.display_name}
              </button>
            ))}
          </div>
        </details>
      )}

      {(dt.status === 'collecting_stakes' || dt.status === 'floor_selection'
        || dt.status === 'floor_reveal' || dt.status === 'floor_result') && (
        <details className="text-xs">
          <summary className="cursor-pointer text-red-300/80 py-1">Отменить игру и вернуть взносы</summary>
          <button
            className="btn-danger w-full text-xs mt-2"
            onClick={() => cancelAndRefund(game, dt, participants)}
          >Отменить</button>
        </details>
      )}
    </div>
  );
}

async function closeSelection(game: SuperGame) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  const idx = cur.current_floor - 1;
  const floors = [...cur.floors];
  if (!floors[idx]) return;
  floors[idx] = { ...floors[idx], status: 'revealed' };
  await sb.from('super_games').update({
    state: { ...cur, floors, status: 'floor_reveal' },
  }).eq('id', game.id);
}

// ---------- Раскрытие этажа ----------

async function revealFloor(game: SuperGame, participants: Participant[]) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  const idx = cur.current_floor - 1;
  const floor = cur.floors[idx];
  if (!floor) return;

  const link = `/super-games/${game.id}`;
  const newScores: Record<string, DebtTowerPlayerState> = { ...cur.scores };
  const newChoices: Record<string, DebtTowerChoice> = { ...floor.choices };
  let bankAdded = 0; // долговые сборы не идут в банк, но стоит держать переменную для будущего

  for (const p of participants) {
    const c = newChoices[p.id];
    if (!c) continue;
    const prevScore = newScores[p.id] ?? emptyScoreObj();

    // Импорт логики
    const out = (() => {
      // inline-обёртка над resolveChoice, чтобы не тащить сюда импорт второй раз
      return resolveChoice(c.choice, prevScore.debt_choice_count);
    })();

    let debtId: string | null = null;
    // Применяем денежные дельты
    if (out.moneyDelta > 0) {
      // Деньги «риска» приходят из Казны (banker = система). Используем payoutFromTreasury.
      await payoutFromTreasury(p.id, out.moneyDelta,
        `Долговая башня · этаж ${floor.number} · риск (успех)`, link);
    } else if (out.moneyDelta < 0) {
      // Платежи и провалы риска уходят в Казну.
      const reason = c.choice === 'payment'
        ? `Долговая башня · этаж ${floor.number} · оплата прохода`
        : `Долговая башня · этаж ${floor.number} · риск (провал)`;
      await chargeToTreasury(p.id, -out.moneyDelta, reason, link);
    }

    // Создаём долг при выборе двери Долга
    if (out.debtCreated > 0) {
      debtId = await createDebt(p.id, out.debtCreated, game.id, floor.number);
    }

    // Записываем результат в choice
    newChoices[p.id] = {
      ...c,
      money_delta: out.moneyDelta,
      debt_created: out.debtCreated,
      risk_result: out.riskResult ?? null,
      debt_id: debtId,
    };

    // Обновляем скор
    newScores[p.id] = applyOutcomeFromLogic(prevScore, out);
  }

  const newFloor: DebtTowerFloor = {
    ...floor,
    status: 'resolved',
    choices: newChoices,
    resolved_at: new Date().toISOString(),
  };
  const newFloors = [...cur.floors];
  newFloors[idx] = newFloor;

  await sb.from('super_games').update({
    state: {
      ...cur,
      floors: newFloors,
      scores: newScores,
      status: 'floor_result',
    },
  }).eq('id', game.id);

  await pushEvent(`Долговая башня · этаж ${floor.number} раскрыт`, undefined, link);
}

/** Тонкая обёртка, чтобы конвертировать форму outcome в нашу запись. */
function applyOutcomeFromLogic(
  prev: DebtTowerPlayerState,
  out: { moneyDelta: number; debtCreated: number },
): DebtTowerPlayerState {
  // Используем applyOutcomeToScore из чистой логики (формат там немного другой — снепшот переведу).
  const snap = applyOutcomeToScore({
    totalProfit: prev.total_profit,
    totalLoss: prev.total_loss,
    totalDebt: prev.total_debt,
    debtChoiceCount: prev.debt_choice_count,
    cleanResult: prev.clean_result,
  }, out);
  return {
    total_profit: snap.totalProfit,
    total_loss: snap.totalLoss,
    total_debt: snap.totalDebt,
    debt_choice_count: snap.debtChoiceCount,
    clean_result: snap.cleanResult,
  };
}

async function createDebt(debtorId: string, amount: number, gameId: string, floor: number): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const id = 'd-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  // creditor_id = Казна. В description — пометка про коллектора Мондо и источник.
  const { error } = await sb.from('debts').insert({
    id,
    debtor_id: debtorId,
    creditor_id: TREASURY_ID,
    amount,
    description: `Долговая башня Мондо · этаж ${floor} · взыскатель: Мондо · игра ${gameId}`,
    due_day: 7,
    status: 'active',
    initiator: 'creditor',
  });
  if (error) {
    console.error('[createDebt]', error);
    return null;
  }
  await logHistory(debtorId, 'debt_created',
    `Создан долг ${amount} в Долговой башне Мондо (этаж ${floor})`,
    -amount, `/super-games/${gameId}`);
  return id;
}

async function nextFloor(game: SuperGame) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  const nextNum = cur.current_floor + 1;
  if (nextNum > TOTAL_FLOORS) return;
  const floor: DebtTowerFloor = { number: nextNum, status: 'selection', choices: {} };
  await sb.from('super_games').update({
    state: {
      ...cur,
      current_floor: nextNum,
      floors: [...cur.floors, floor],
      status: 'floor_selection',
    },
  }).eq('id', game.id);
  await pushEvent(`Долговая башня · этаж ${nextNum}`, undefined, `/super-games/${game.id}`);
}

async function finishGame(game: SuperGame, participants: Participant[], manualWinnerId?: string) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  const { data: gameRow } = await sb.from('super_games').select('bank').eq('id', game.id).single();
  const bank = gameRow?.bank ?? 0;

  const balances: Record<string, number> = {};
  for (const p of participants) balances[p.id] = p.balance ?? 0;

  // Пересборка под формат pickWinner
  const scoresForLogic: Record<string, any> = {};
  for (const [pid, s] of Object.entries(cur.scores)) {
    scoresForLogic[pid] = {
      totalProfit: s.total_profit,
      totalLoss: s.total_loss,
      totalDebt: s.total_debt,
      debtChoiceCount: s.debt_choice_count,
      cleanResult: s.clean_result,
    };
  }

  let winnerId: string | null = manualWinnerId ?? pickWinner(scoresForLogic, balances);
  const link = `/super-games/${game.id}`;

  if (winnerId && bank > 0) {
    await payoutFromTreasury(winnerId, bank, 'Долговая башня Мондо · банк', link);
  }

  await sb.from('super_games').update({
    state: { ...cur, status: 'finished', winner_id: winnerId, winner_is_candidate_for_elite: !!winnerId },
    status: 'finished',
    winner_id: winnerId,
    bank: 0,
  }).eq('id', game.id);

  if (winnerId) {
    const winner = participants.find(p => p.id === winnerId);
    if (winner) {
      const winnerScore = cur.scores[winnerId];
      await pushEvent(
        `Долговая башня Мондо завершена · победитель ${winner.display_name}`,
        `Банк ${new Intl.NumberFormat('ru-RU').format(bank)}, чистый результат ${winnerScore?.clean_result ?? 0}. Получает статус «Кандидат в Элиту».`,
        link,
      );
      await logHistory(winnerId, 'debt_tower_win',
        `Победа в Долговой башне Мондо · банк ${bank} · Кандидат в Элиту`,
        bank, link);
    }
  } else {
    await pushEvent('Долговая башня Мондо завершена без победителя (тройная ничья)', undefined, link);
  }
}

async function cancelAndRefund(game: SuperGame, dt: DebtTowerState, participants: Participant[]) {
  const sb = getSupabase();
  if (!sb) return;
  for (const p of participants) {
    const paid = dt.fee_paid[p.id] ?? 0;
    if (paid > 0) {
      await payoutFromTreasury(p.id, paid, 'Возврат: Долговая башня Мондо отменена', `/super-games/${game.id}`);
    }
  }
  await sb.from('super_games').update({
    state: { ...dt, status: 'cancelled' },
    status: 'cancelled',
    bank: 0,
  }).eq('id', game.id);
  await pushEvent('Долговая башня Мондо отменена', 'Все взносы возвращены.', `/super-games/${game.id}`);
}
