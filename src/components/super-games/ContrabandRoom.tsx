'use client';

// ===========================================================================
// «Контрабанда капитала» — командная Большая игра.
// Куратор: Бьякуя (наблюдает, не играет лично).
// 2 команды × 7 игроков. 7 раундов: каждый раунд одна команда отправляет
// Контрабандиста, другая выбирает Таможенника. Тайные суммы, проверка/пропуск.
// Деньги ходят через Казну. Логика — в src/lib/contraband/logic.ts.
// ===========================================================================

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/lib/store/StoreProvider';
import { CharacterIcon } from '@/components/ui/CharacterIcon';
import { Yen } from '@/components/ui/Yen';
import { cn, isPlayer } from '@/lib/utils';
import { getSupabase } from '@/lib/supabase/client';
import { chargeToTreasury, payoutFromTreasury } from '@/lib/store/tx';
import { TogamiInfluencePanel } from '@/components/super-games/TogamiInfluencePanel';
import { KokichiInfluencePanel } from '@/components/super-games/KokichiInfluencePanel';
import {
  TOTAL_ROUNDS, TEAM_SIZE, TEAM_LABELS, TEAM_COLORS,
  MAX_SMUGGLE_AMOUNT, INSPECTOR_MISTAKE_PENALTY, EMPTY_CASE_REWARD,
  WINNING_TEAM_REWARD, LOSING_TEAM_PENALTY, INITIAL_TEAM_SAFE,
  resolveRound, pickWinner, randomSplit,
} from '@/lib/contraband/logic';
import type {
  SuperGame, Participant, ContrabandState, ContrabandRound,
  ContrabandTeam, InspectorAction, ContrabandResult,
} from '@/lib/store/types';

// ---------- helpers ----------

function getState(g: SuperGame): ContrabandState {
  const s = (g.state || {}) as Partial<ContrabandState>;
  return {
    current_round: s.current_round ?? 0,
    rounds: s.rounds ?? [],
    north_team_ids: s.north_team_ids ?? [],
    south_team_ids: s.south_team_ids ?? [],
    north_captain_id: s.north_captain_id ?? null,
    south_captain_id: s.south_captain_id ?? null,
    north_score: s.north_score ?? 0,
    south_score: s.south_score ?? 0,
    smuggler_history: s.smuggler_history ?? { north: [], south: [] },
    status: s.status ?? 'scheduled',
    winner_team: s.winner_team ?? null,
  };
}

async function readState(gameId: string): Promise<ContrabandState | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.from('super_games').select('state').eq('id', gameId).single();
  if (!data) return null;
  return data.state as ContrabandState;
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

function teamOf(playerId: string, st: ContrabandState): ContrabandTeam | null {
  if (st.north_team_ids.includes(playerId)) return 'north';
  if (st.south_team_ids.includes(playerId)) return 'south';
  return null;
}

// ===========================================================================

export function ContrabandRoom({ game }: { game: SuperGame }) {
  const { state, currentUser, role } = useStore();
  // Кокичи (p-kokichi) — куратор Контрабанды и имеет права админа внутри игры:
  // запускать раунды, раскрывать результат, выбирать Контрабандиста/Таможенника и т.д.
  const isKokichiUser = !!currentUser && currentUser.id === 'p-kokichi';
  const isAdmin = role === 'gm' || role === 'queen' || isKokichiUser;
  const cb = getState(game);

  const participants = (game.participant_ids || [])
    .map(pid => state.participants.find(p => p.id === pid))
    .filter(Boolean) as Participant[];

  const myTeam: ContrabandTeam | null = currentUser ? teamOf(currentUser.id, cb) : null;
  const currentRound: ContrabandRound | null =
    cb.current_round > 0 ? cb.rounds[cb.current_round - 1] ?? null : null;

  return (
    <div className="space-y-4">
      <Header game={game} cb={cb} />

      {/* Куратор Кокичи Ома */}
      <KokichiInfluencePanel game={game} />

      {/* Влияние Бьякуи (Фонд Тогами) — оставлено на случай возвращения Бьякуи */}
      <TogamiInfluencePanel
        game={game}
        gameKind="contraband"
        participantIds={game.participant_ids ?? []}
      />

      {/* Команды */}
      <TeamsBlock cb={cb} participants={participants} isAdmin={isAdmin} game={game} />

      {/* Текущий раунд */}
      {currentRound && cb.status !== 'finished' && cb.status !== 'cancelled' && (
        <RoundView
          game={game} cb={cb} round={currentRound}
          participants={participants}
          myTeam={myTeam}
          currentUserId={currentUser?.id ?? null}
          isAdmin={isAdmin}
        />
      )}

      {/* История раундов */}
      {cb.rounds.length > 0 && (
        <RoundsHistory cb={cb} participants={participants} />
      )}

      {/* Финал */}
      {cb.status === 'finished' && (
        <FinishedView cb={cb} participants={participants} />
      )}

      {/* Админ-панель */}
      {isAdmin && cb.status !== 'finished' && cb.status !== 'cancelled' && (
        <AdminPanel game={game} cb={cb} participants={participants} />
      )}
    </div>
  );
}

// ---------- Шапка ----------

function Header({ game, cb }: { game: SuperGame; cb: ContrabandState }) {
  return (
    <div className="glass-strong gold-border p-4">
      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-sky-400">Северный банк</div>
          <Yen amount={cb.north_score} className="text-base mt-1 text-sky-300" iconClass="w-4 h-4" />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-gold/70">Раунд</div>
          <div className="font-mono font-bold text-gold text-lg mt-1">
            {cb.current_round > 0 ? `${cb.current_round}/${TOTAL_ROUNDS}` : `0/${TOTAL_ROUNDS}`}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-amber-400">Южный банк</div>
          <Yen amount={cb.south_score} className="text-base mt-1 text-amber-300" iconClass="w-4 h-4" />
        </div>
      </div>
      <div className="mt-3 text-center text-[10px] text-muted-foreground">
        Куратор · Бьякуя Тогами · Системные операции через Казну
      </div>
    </div>
  );
}

// ---------- Блок команд ----------

function TeamsBlock({
  cb, participants, isAdmin, game,
}: {
  cb: ContrabandState; participants: Participant[]; isAdmin: boolean; game: SuperGame;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <TeamCard team="north" cb={cb} participants={participants} isAdmin={isAdmin} game={game} />
      <TeamCard team="south" cb={cb} participants={participants} isAdmin={isAdmin} game={game} />
    </div>
  );
}

function TeamCard({
  team, cb, participants, isAdmin, game,
}: {
  team: ContrabandTeam;
  cb: ContrabandState;
  participants: Participant[];
  isAdmin: boolean;
  game: SuperGame;
}) {
  const ids = team === 'north' ? cb.north_team_ids : cb.south_team_ids;
  const captainId = team === 'north' ? cb.north_captain_id : cb.south_captain_id;
  const score = team === 'north' ? cb.north_score : cb.south_score;
  const members = ids.map(id => participants.find(p => p.id === id)).filter(Boolean) as Participant[];
  const teamColor = TEAM_COLORS[team];
  const used = cb.smuggler_history[team] ?? [];

  return (
    <div
      className="glass p-3"
      style={{ borderLeft: `3px solid ${teamColor.hex}` }}
    >
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-[10px] uppercase tracking-widest" style={{ color: teamColor.hex }}>
            {TEAM_LABELS[team]}
          </div>
          <div className="font-bold text-sm">Сейф: <Yen amount={INITIAL_TEAM_SAFE} className="inline text-xs" iconClass="w-3 h-3" /></div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-muted-foreground">Счёт</div>
          <Yen amount={score} className="text-sm" iconClass="w-3 h-3" />
        </div>
      </div>
      <div className="space-y-1">
        {members.map(p => {
          const isCap = p.id === captainId;
          const wasSmuggler = used.includes(p.id);
          return (
            <div key={p.id} className="flex items-center gap-2 text-xs">
              <CharacterIcon participant={p} size="xs" ringless />
              <span className="flex-1 truncate">{p.display_name}</span>
              {isCap && <span className="text-[9px] text-gold">★ кап</span>}
              {wasSmuggler && <span className="text-[9px] text-muted-foreground">был</span>}
            </div>
          );
        })}
        {members.length === 0 && (
          <div className="text-[11px] text-muted-foreground italic">Команда пока пустая.</div>
        )}
      </div>
      {isAdmin && cb.status === 'team_setup' && (
        <CaptainPicker team={team} cb={cb} game={game} members={members} />
      )}
    </div>
  );
}

function CaptainPicker({
  team, cb, game, members,
}: {
  team: ContrabandTeam; cb: ContrabandState; game: SuperGame; members: Participant[];
}) {
  if (members.length === 0) return null;
  return (
    <details className="mt-2 text-[11px]">
      <summary className="cursor-pointer text-gold/80 py-1">Назначить капитана</summary>
      <div className="grid grid-cols-2 gap-1 mt-1">
        {members.map(p => (
          <button
            key={p.id}
            onClick={() => setCaptain(game, team, p.id)}
            className="text-left px-2 py-1.5 rounded-lg bg-card/40 border border-white/8 active:bg-white/5"
          >
            ★ {p.display_name}
          </button>
        ))}
      </div>
    </details>
  );
}

async function setCaptain(game: SuperGame, team: ContrabandTeam, playerId: string) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  const next: ContrabandState = {
    ...cur,
    [team === 'north' ? 'north_captain_id' : 'south_captain_id']: playerId,
  } as ContrabandState;
  await sb.from('super_games').update({ state: next }).eq('id', game.id);
}

// ---------- Раунд ----------

function RoundView({
  game, cb, round, participants, myTeam, currentUserId, isAdmin,
}: {
  game: SuperGame; cb: ContrabandState; round: ContrabandRound;
  participants: Participant[];
  myTeam: ContrabandTeam | null;
  currentUserId: string | null;
  isAdmin: boolean;
}) {
  const smuggler = round.smuggler_id ? (participants.find(p => p.id === round.smuggler_id) ?? null) : null;
  const inspector = round.inspector_id ? (participants.find(p => p.id === round.inspector_id) ?? null) : null;

  const iAmSmuggler = !!currentUserId && currentUserId === round.smuggler_id;
  const iAmInspector = !!currentUserId && currentUserId === round.inspector_id;

  return (
    <div className="glass-strong gold-border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-heading text-lg font-bold text-gradient-gold">Раунд {round.number}/{TOTAL_ROUNDS}</div>
        <PhaseBadge status={round.status} />
      </div>

      {/* Имена сторон */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="p-2 rounded-xl bg-card/40">
          <div className="text-[10px] uppercase tracking-widest" style={{ color: TEAM_COLORS[round.smuggler_team].hex }}>
            Контрабандист · {TEAM_LABELS[round.smuggler_team]}
          </div>
          {smuggler ? (
            <div className="flex items-center gap-2 mt-1">
              <CharacterIcon participant={smuggler} size="xs" ringless />
              <span className="font-bold truncate">{smuggler.display_name}</span>
            </div>
          ) : (
            <div className="text-muted-foreground italic mt-1">не выбран</div>
          )}
        </div>
        <div className="p-2 rounded-xl bg-card/40">
          <div className="text-[10px] uppercase tracking-widest" style={{ color: TEAM_COLORS[round.inspector_team].hex }}>
            Таможенник · {TEAM_LABELS[round.inspector_team]}
          </div>
          {inspector ? (
            <div className="flex items-center gap-2 mt-1">
              <CharacterIcon participant={inspector} size="xs" ringless />
              <span className="font-bold truncate">{inspector.display_name}</span>
            </div>
          ) : (
            <div className="text-muted-foreground italic mt-1">не выбран</div>
          )}
        </div>
      </div>

      {/* Фаза: выбор Контрабандиста — ждём ведущего */}
      {round.status === 'selecting_smuggler' && (
        <div className="text-xs text-muted-foreground">
          Ведущий или капитан команды {TEAM_LABELS[round.smuggler_team]} выбирает Контрабандиста.
        </div>
      )}

      {/* Фаза: ввод суммы */}
      {round.status === 'choosing_amount' && (
        <SmugglerAmountInput
          game={game} round={round}
          isMine={iAmSmuggler}
          smuggler={smuggler}
        />
      )}

      {/* Фаза: выбор Таможенника */}
      {round.status === 'selecting_inspector' && (
        <div className="text-xs text-muted-foreground">
          Сумма принята. Ведущий или капитан команды {TEAM_LABELS[round.inspector_team]} выбирает Таможенника.
        </div>
      )}

      {/* Фаза: решение Таможенника */}
      {round.status === 'inspection_decision' && (
        <InspectorDecision
          game={game} round={round}
          isMine={iAmInspector}
          inspector={inspector}
        />
      )}

      {/* Фаза: ждём раскрытия */}
      {round.status === 'reveal' && (
        <div className="text-xs text-muted-foreground text-center py-2">
          Решение принято. Ведущий раскроет результат.
        </div>
      )}

      {/* Фаза: результат */}
      {round.status === 'round_result' && (
        <RoundResultBlock round={round} smuggler={smuggler} inspector={inspector} />
      )}
    </div>
  );
}

function PhaseBadge({ status }: { status: ContrabandRound['status'] }) {
  const map: Record<ContrabandRound['status'], { label: string; cls: string }> = {
    selecting_smuggler:  { label: 'Выбор Контрабандиста', cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
    kokichi_courier_swap_window: { label: 'Кокичи: Смена курьера?', cls: 'bg-purple-500/15 text-purple-300 border-purple-500/30' },
    choosing_amount:     { label: 'Выбор суммы',          cls: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30' },
    selecting_inspector: { label: 'Выбор Таможенника',    cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
    kokichi_false_trail_window: { label: 'Кокичи: Ложный след?', cls: 'bg-purple-500/15 text-purple-300 border-purple-500/30' },
    inspection_decision: { label: 'Решение Таможенника',  cls: 'bg-red-500/15 text-red-300 border-red-500/30' },
    kokichi_doubt_window: { label: 'Кокичи: Сомнение?', cls: 'bg-purple-500/15 text-purple-300 border-purple-500/30' },
    reveal:              { label: 'Раскрытие',            cls: 'bg-purple-500/15 text-purple-300 border-purple-500/30' },
    round_result:        { label: 'Итог',                 cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  };
  const m = map[status];
  return <span className={cn('status-badge border', m.cls)}>{m.label}</span>;
}

// ---------- Контрабандист вводит сумму ----------

function SmugglerAmountInput({
  game, round, isMine, smuggler,
}: {
  game: SuperGame; round: ContrabandRound; isMine: boolean; smuggler: Participant | null;
}) {
  const [amount, setAmount] = useState<number>(0);
  const submitted = round.smuggled_amount != null;

  if (submitted) {
    return (
      <div className="text-xs text-emerald-300 text-center py-2">
        ✓ Сумма выбрана и тайно записана. Ждём ход Таможенника.
      </div>
    );
  }

  if (!isMine) {
    return (
      <div className="text-xs text-muted-foreground text-center py-2">
        {smuggler ? `${smuggler.display_name} выбирает сумму...` : 'Контрабандист выбирает сумму...'}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">
        Выберите сумму, которую несёте: от <Yen amount={0} className="inline" iconClass="w-3 h-3" /> до <Yen amount={MAX_SMUGGLE_AMOUNT} className="inline" iconClass="w-3 h-3" />.
        Никто, кроме вас, не увидит её до раскрытия раунда.
      </div>
      <input
        type="range" min={0} max={MAX_SMUGGLE_AMOUNT} step={50_000}
        value={amount}
        onChange={e => setAmount(Number(e.target.value))}
        className="w-full accent-gold"
      />
      <div className="grid grid-cols-6 gap-1 text-[10px]">
        {[0, 100_000, 200_000, 300_000, 400_000, 500_000].map(v => (
          <button
            key={v}
            onClick={() => setAmount(v)}
            className={cn(
              'px-1 py-1.5 rounded-lg font-mono border',
              amount === v ? 'bg-gold/15 border-gold/50 text-gold' : 'bg-card/60 border-white/8',
            )}
          >
            {v === 0 ? '0' : `${v / 1000}K`}
          </button>
        ))}
      </div>
      <div className="text-center font-mono text-lg text-gold">
        <Yen amount={amount} full className="text-lg" iconClass="w-4 h-4" />
      </div>
      <button
        className="btn-primary w-full text-xs"
        onClick={() => submitSmuggledAmount(game, amount)}
      >
        Подтвердить сумму
      </button>
    </div>
  );
}

async function submitSmuggledAmount(game: SuperGame, amount: number) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  const idx = cur.current_round - 1;
  const rounds = [...cur.rounds];
  if (!rounds[idx]) return;
  rounds[idx] = {
    ...rounds[idx],
    smuggled_amount: amount,
    status: 'selecting_inspector',
  };
  await sb.from('super_games').update({
    state: { ...cur, rounds, status: 'selecting_inspector' },
  }).eq('id', game.id);
}

// ---------- Таможенник: пропустить / проверить ----------

function InspectorDecision({
  game, round, isMine, inspector,
}: {
  game: SuperGame; round: ContrabandRound; isMine: boolean; inspector: Participant | null;
}) {
  const [picking, setPicking] = useState<InspectorAction | null>(null);
  const [suspected, setSuspected] = useState<number>(0);
  const submitted = round.inspector_action != null;

  if (submitted) {
    return (
      <div className="text-xs text-emerald-300 text-center py-2">
        ✓ Решение принято и тайно записано. Ведущий раскроет результат.
      </div>
    );
  }

  if (!isMine) {
    return (
      <div className="text-xs text-muted-foreground text-center py-2">
        {inspector ? `${inspector.display_name} принимает решение...` : 'Таможенник принимает решение...'}
      </div>
    );
  }

  if (picking === null) {
    return (
      <div className="grid grid-cols-2 gap-2">
        <button
          className="btn-secondary text-sm"
          onClick={() => submitInspectorDecision(game, 'pass')}
        >
          ✓ Пропустить
        </button>
        <button
          className="btn-danger text-sm"
          onClick={() => setPicking('inspect')}
        >
          🔍 Проверить
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">
        Назовите сумму подозрения. Если назовёте больше или ровно — поймаете и заберёте её.
        Если меньше — Контрабандист пройдёт, и вы потеряете <Yen amount={INSPECTOR_MISTAKE_PENALTY} className="inline" iconClass="w-3 h-3" />.
      </div>
      <input
        type="range" min={0} max={MAX_SMUGGLE_AMOUNT} step={50_000}
        value={suspected}
        onChange={e => setSuspected(Number(e.target.value))}
        className="w-full accent-red-400"
      />
      <div className="grid grid-cols-6 gap-1 text-[10px]">
        {[0, 100_000, 200_000, 300_000, 400_000, 500_000].map(v => (
          <button
            key={v}
            onClick={() => setSuspected(v)}
            className={cn(
              'px-1 py-1.5 rounded-lg font-mono border',
              suspected === v ? 'bg-red-500/15 border-red-500/50 text-red-300' : 'bg-card/60 border-white/8',
            )}
          >
            {v === 0 ? '0' : `${v / 1000}K`}
          </button>
        ))}
      </div>
      <div className="text-center font-mono text-lg text-red-300">
        <Yen amount={suspected} full className="text-lg" iconClass="w-4 h-4" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          className="btn-secondary text-xs"
          onClick={() => setPicking(null)}
        >
          Назад
        </button>
        <button
          className="btn-danger text-xs"
          onClick={() => submitInspectorDecision(game, 'inspect', suspected)}
        >
          Проверить за {(suspected / 1000).toFixed(0)}K
        </button>
      </div>
    </div>
  );
}

async function submitInspectorDecision(game: SuperGame, action: InspectorAction, suspected?: number) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  const idx = cur.current_round - 1;
  const rounds = [...cur.rounds];
  if (!rounds[idx]) return;
  rounds[idx] = {
    ...rounds[idx],
    inspector_action: action,
    suspected_amount: action === 'inspect' ? (suspected ?? 0) : null,
    status: 'reveal',
  };
  await sb.from('super_games').update({
    state: { ...cur, rounds, status: 'reveal' },
  }).eq('id', game.id);
}

// ---------- Раскрытый результат ----------

function RoundResultBlock({
  round, smuggler, inspector,
}: {
  round: ContrabandRound; smuggler: Participant | null; inspector: Participant | null;
}) {
  const result = round.result!;
  const labels: Record<ContrabandResult, { title: string; color: string; emoji: string }> = {
    passed:           { title: 'Контрабандист прошёл',     color: 'text-emerald-300', emoji: '✓' },
    caught:           { title: 'Поймали с поличным',       color: 'text-red-300',     emoji: '🚨' },
    underestimated:   { title: 'Таможенник недооценил',    color: 'text-amber-300',   emoji: '😏' },
    empty_case_trap:  { title: 'Ловушка пустого кейса',    color: 'text-fuchsia-300', emoji: '🪤' },
  };
  const info = labels[result];

  return (
    <div className="space-y-2">
      <div className={cn('text-center font-heading text-lg font-bold', info.color)}>
        {info.emoji} {info.title}
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="p-2 rounded-xl bg-card/40">
          <div className="text-[10px] text-muted-foreground">Несли</div>
          <Yen amount={round.smuggled_amount ?? 0} full className="text-sm" iconClass="w-3 h-3" />
        </div>
        <div className="p-2 rounded-xl bg-card/40">
          <div className="text-[10px] text-muted-foreground">
            {round.inspector_action === 'pass' ? 'Решение' : 'Подозрение'}
          </div>
          <div className="text-sm font-bold">
            {round.inspector_action === 'pass'
              ? 'Пропустить'
              : <Yen amount={round.suspected_amount ?? 0} full className="text-sm" iconClass="w-3 h-3" />}
          </div>
        </div>
      </div>

      {/* Командные изменения */}
      <div className="grid grid-cols-2 gap-2">
        <ScoreDeltaCard team="north" delta={round.north_score_delta ?? 0} />
        <ScoreDeltaCard team="south" delta={round.south_score_delta ?? 0} />
      </div>

      {/* Личные дельты */}
      {(round.smuggler_personal_delta || round.inspector_personal_delta) ? (
        <div className="text-[11px] space-y-1">
          {smuggler && round.smuggler_personal_delta !== 0 && (
            <div className="flex items-center gap-2">
              <CharacterIcon participant={smuggler} size="xs" ringless />
              <span className="flex-1">{smuggler.display_name}</span>
              <span className={cn('font-mono',
                (round.smuggler_personal_delta ?? 0) > 0 ? 'text-emerald-300' : 'text-red-300')}>
                {(round.smuggler_personal_delta ?? 0) > 0 ? '+' : ''}
                {new Intl.NumberFormat('ru-RU').format(round.smuggler_personal_delta ?? 0)}
              </span>
            </div>
          )}
          {inspector && round.inspector_personal_delta !== 0 && (
            <div className="flex items-center gap-2">
              <CharacterIcon participant={inspector} size="xs" ringless />
              <span className="flex-1">{inspector.display_name}</span>
              <span className={cn('font-mono',
                (round.inspector_personal_delta ?? 0) > 0 ? 'text-emerald-300' : 'text-red-300')}>
                {(round.inspector_personal_delta ?? 0) > 0 ? '+' : ''}
                {new Intl.NumberFormat('ru-RU').format(round.inspector_personal_delta ?? 0)}
              </span>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ScoreDeltaCard({ team, delta }: { team: ContrabandTeam; delta: number }) {
  if (delta === 0) {
    return (
      <div className="p-2 rounded-xl bg-card/30 border border-white/5 text-center">
        <div className="text-[10px]" style={{ color: TEAM_COLORS[team].hex }}>{TEAM_LABELS[team]}</div>
        <div className="text-xs text-muted-foreground">без изменений</div>
      </div>
    );
  }
  return (
    <div className="p-2 rounded-xl bg-card/40 border" style={{ borderColor: TEAM_COLORS[team].hex + '50' }}>
      <div className="text-[10px]" style={{ color: TEAM_COLORS[team].hex }}>{TEAM_LABELS[team]}</div>
      <Yen amount={delta} full className="text-sm" iconClass="w-3 h-3" />
    </div>
  );
}

// ---------- История раундов ----------

function RoundsHistory({
  cb, participants,
}: {
  cb: ContrabandState; participants: Participant[];
}) {
  const completed = cb.rounds.filter(r => r.status === 'round_result');
  if (completed.length === 0) return null;

  return (
    <div className="glass p-4">
      <div className="section-title text-sm mb-2">📜 История раундов</div>
      <div className="space-y-2">
        {completed.map(r => {
          const smuggler = r.smuggler_id ? (participants.find(p => p.id === r.smuggler_id) ?? null) : null;
          const inspector = r.inspector_id ? (participants.find(p => p.id === r.inspector_id) ?? null) : null;
          return (
            <details key={r.number} className="bg-card/30 rounded-xl border border-white/8 overflow-hidden">
              <summary className="px-3 py-2 cursor-pointer flex items-center gap-2 text-xs">
                <span className="font-bold">Раунд {r.number}</span>
                <span className="text-muted-foreground">·</span>
                <ResultChip result={r.result!} />
                <span className="ml-auto font-mono text-[10px]">
                  {r.north_score_delta ? <span className="text-sky-300">N+{(r.north_score_delta / 1000).toFixed(0)}K </span> : null}
                  {r.south_score_delta ? <span className="text-amber-300">S+{(r.south_score_delta / 1000).toFixed(0)}K</span> : null}
                </span>
              </summary>
              <div className="p-3 pt-0 space-y-1.5 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 rounded-lg bg-card/40">
                    <div className="text-[10px]" style={{ color: TEAM_COLORS[r.smuggler_team].hex }}>
                      Контрабандист
                    </div>
                    <div className="font-bold">{smuggler?.display_name ?? '—'}</div>
                    <div className="text-muted-foreground">
                      Нёс <Yen amount={r.smuggled_amount ?? 0} full className="inline" iconClass="w-3 h-3" />
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-card/40">
                    <div className="text-[10px]" style={{ color: TEAM_COLORS[r.inspector_team].hex }}>
                      Таможенник
                    </div>
                    <div className="font-bold">{inspector?.display_name ?? '—'}</div>
                    <div className="text-muted-foreground">
                      {r.inspector_action === 'pass'
                        ? 'Пропустил'
                        : <>Назвал <Yen amount={r.suspected_amount ?? 0} full className="inline" iconClass="w-3 h-3" /></>}
                    </div>
                  </div>
                </div>
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}

function ResultChip({ result }: { result: ContrabandResult }) {
  const map: Record<ContrabandResult, { label: string; cls: string }> = {
    passed:          { label: 'провёл',        cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
    caught:          { label: 'пойман',        cls: 'bg-red-500/15 text-red-300 border-red-500/30' },
    underestimated:  { label: 'недооценил',    cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
    empty_case_trap: { label: 'пустой кейс',   cls: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30' },
  };
  const m = map[result];
  return <span className={cn('px-1.5 py-0.5 rounded-full text-[10px] font-bold border', m.cls)}>{m.label}</span>;
}

// ---------- Финал ----------

function FinishedView({
  cb, participants,
}: {
  cb: ContrabandState; participants: Participant[];
}) {
  if (cb.winner_team === 'draw') {
    return (
      <div className="glass-strong gold-border p-5 text-center">
        <div className="text-[10px] uppercase tracking-widest text-gold/70">Игра завершена</div>
        <h3 className="font-heading text-2xl font-bold text-gradient-gold mt-2">Ничья</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Командные награды и штрафы не применены. Личные комиссии и штрафы раундов остались.
        </p>
        <div className="grid grid-cols-2 gap-2 mt-4">
          <ScoreDeltaCard team="north" delta={cb.north_score} />
          <ScoreDeltaCard team="south" delta={cb.south_score} />
        </div>
      </div>
    );
  }

  const winner = cb.winner_team!;
  const loser: ContrabandTeam = winner === 'north' ? 'south' : 'north';
  const winnerIds = winner === 'north' ? cb.north_team_ids : cb.south_team_ids;
  const winners = winnerIds.map(id => participants.find(p => p.id === id)).filter(Boolean) as Participant[];

  return (
    <div className="glass-strong gold-border p-5 text-center">
      <div className="text-[10px] uppercase tracking-widest text-gold/70">Победитель</div>
      <h3 className="font-heading text-2xl font-bold text-gradient-gold mt-2">{TEAM_LABELS[winner]}</h3>
      <div className="grid grid-cols-2 gap-2 mt-3">
        <ScoreDeltaCard team="north" delta={cb.north_score} />
        <ScoreDeltaCard team="south" delta={cb.south_score} />
      </div>
      <p className="text-xs text-muted-foreground mt-3">
        Каждому из {TEAM_LABELS[winner]} +<Yen amount={WINNING_TEAM_REWARD} className="inline" iconClass="w-3 h-3" />.
        Каждому из {TEAM_LABELS[loser]} −<Yen amount={LOSING_TEAM_PENALTY} className="inline" iconClass="w-3 h-3" />.
      </p>
      <div className="mt-3 space-y-1">
        {winners.map(p => (
          <div key={p.id} className="flex items-center gap-2 p-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <CharacterIcon participant={p} size="xs" ringless />
            <span className="flex-1 text-xs text-left">{p.display_name}</span>
            <Yen amount={WINNING_TEAM_REWARD} className="text-emerald-300 text-xs" iconClass="w-3 h-3" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ===========================================================================
// АДМИН-ПАНЕЛЬ
// ===========================================================================

function AdminPanel({
  game, cb, participants,
}: {
  game: SuperGame; cb: ContrabandState; participants: Participant[];
}) {
  return (
    <div className="glass-strong gold-border p-4 space-y-2">
      <div className="text-[10px] uppercase tracking-widest text-gold/70">⚙️ Управление ведущего</div>

      {/* Этап: распределение команд */}
      {(cb.status === 'scheduled' || cb.status === 'team_setup') && (
        <TeamSetupAdminBlock game={game} cb={cb} participants={participants} />
      )}

      {/* Текущий раунд: кнопки фаз */}
      {cb.status !== 'scheduled' && cb.status !== 'team_setup' && cb.current_round > 0 && (
        <RoundAdminBlock game={game} cb={cb} participants={participants} />
      )}

      {/* Отмена */}
      <details className="text-xs">
        <summary className="cursor-pointer text-red-300/80 py-1">Отменить игру</summary>
        <button
          className="btn-danger w-full text-xs mt-2"
          onClick={() => cancelGame(game)}
        >Отменить и оставить балансы как есть</button>
      </details>
    </div>
  );
}

function TeamSetupAdminBlock({
  game, cb, participants,
}: {
  game: SuperGame; cb: ContrabandState; participants: Participant[];
}) {
  const allActive = participants.length;
  const splitCount = cb.north_team_ids.length + cb.south_team_ids.length;

  return (
    <div className="space-y-2">
      <div className="text-[11px] text-muted-foreground">
        Игроков всего: {allActive}. Распределено: {splitCount}.
        Целевые размеры команд по {TEAM_SIZE} игроков (или поделить поровну, если меньше).
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          className="btn-secondary text-xs"
          onClick={() => randomSplitTeams(game, participants)}
        >🎲 Случайно</button>
        <button
          className="btn-primary text-xs"
          disabled={splitCount === 0}
          onClick={() => startGame(game)}
        >▶ Начать игру</button>
      </div>
      <ManualTeamPicker game={game} cb={cb} participants={participants} />
    </div>
  );
}

function ManualTeamPicker({
  game, cb, participants,
}: {
  game: SuperGame; cb: ContrabandState; participants: Participant[];
}) {
  return (
    <details>
      <summary className="cursor-pointer text-[11px] text-gold/80 py-1">Распределить вручную</summary>
      <div className="mt-2 space-y-1 max-h-64 overflow-y-auto">
        {participants.map(p => {
          const team = teamOf(p.id, cb);
          return (
            <div key={p.id} className="flex items-center gap-2 p-1.5 rounded-lg bg-card/40">
              <CharacterIcon participant={p} size="xs" ringless />
              <span className="flex-1 text-xs truncate">{p.display_name}</span>
              <button
                onClick={() => assignToTeam(game, p.id, 'north')}
                className={cn('px-2 py-0.5 rounded-md text-[10px] font-bold border',
                  team === 'north' ? 'bg-sky-500/30 border-sky-500/60 text-sky-100' : 'bg-card/60 border-white/8 text-sky-300')}
              >N</button>
              <button
                onClick={() => assignToTeam(game, p.id, 'south')}
                className={cn('px-2 py-0.5 rounded-md text-[10px] font-bold border',
                  team === 'south' ? 'bg-amber-500/30 border-amber-500/60 text-amber-100' : 'bg-card/60 border-white/8 text-amber-300')}
              >S</button>
              {team && (
                <button
                  onClick={() => assignToTeam(game, p.id, null)}
                  className="px-1.5 py-0.5 rounded-md text-[10px] text-muted-foreground"
                >✕</button>
              )}
            </div>
          );
        })}
      </div>
    </details>
  );
}

async function randomSplitTeams(game: SuperGame, participants: Participant[]) {
  const sb = getSupabase();
  if (!sb) return;
  const ids = participants.map(p => p.id);
  // Размер команды = min(TEAM_SIZE, floor(N/2))
  const teamSize = Math.min(TEAM_SIZE, Math.floor(ids.length / 2));
  const [north, south] = randomSplit(ids, teamSize);
  const cur = await readState(game.id);
  if (!cur) return;
  const next: ContrabandState = {
    ...cur,
    north_team_ids: north,
    south_team_ids: south,
    status: 'team_setup',
  };
  await sb.from('super_games').update({ state: next }).eq('id', game.id);
}

async function assignToTeam(game: SuperGame, playerId: string, team: ContrabandTeam | null) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  const north = cur.north_team_ids.filter(id => id !== playerId);
  const south = cur.south_team_ids.filter(id => id !== playerId);
  if (team === 'north') north.push(playerId);
  if (team === 'south') south.push(playerId);
  const next: ContrabandState = {
    ...cur,
    north_team_ids: north,
    south_team_ids: south,
    status: 'team_setup',
  };
  await sb.from('super_games').update({ state: next }).eq('id', game.id);
}

async function startGame(game: SuperGame) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  if (cur.north_team_ids.length === 0 || cur.south_team_ids.length === 0) return;

  // Раунд 1: Север отправляет Контрабандиста, Юг проверяет.
  // Дальше — чередование.
  const r1: ContrabandRound = {
    number: 1,
    status: 'selecting_smuggler',
    smuggler_team: 'north',
    inspector_team: 'south',
    smuggler_id: null,
    inspector_id: null,
    smuggled_amount: null,
    inspector_action: null,
    suspected_amount: null,
    result: null,
  };
  const next: ContrabandState = {
    ...cur,
    current_round: 1,
    rounds: [r1],
    status: 'selecting_smuggler',
  };
  await sb.from('super_games').update({
    state: next,
    status: 'live',
  }).eq('id', game.id);

  await pushEvent('Контрабанда капитала: игра началась', undefined, `/super-games/${game.id}`);
}

function RoundAdminBlock({
  game, cb, participants,
}: {
  game: SuperGame; cb: ContrabandState; participants: Participant[];
}) {
  const round = cb.rounds[cb.current_round - 1];
  if (!round) return null;

  if (round.status === 'selecting_smuggler') {
    return <SmugglerPicker game={game} cb={cb} round={round} participants={participants} />;
  }
  if (round.status === 'choosing_amount') {
    return (
      <div className="text-[11px] text-muted-foreground">
        Контрабандист {participants.find(p => p.id === round.smuggler_id)?.display_name} вводит сумму...
      </div>
    );
  }
  if (round.status === 'selecting_inspector') {
    return <InspectorPicker game={game} cb={cb} round={round} participants={participants} />;
  }
  if (round.status === 'inspection_decision') {
    return (
      <div className="text-[11px] text-muted-foreground">
        Таможенник {participants.find(p => p.id === round.inspector_id)?.display_name} принимает решение...
      </div>
    );
  }
  if (round.status === 'reveal') {
    return (
      <button
        className="btn-success w-full text-xs"
        onClick={() => revealRound(game, participants)}
      >🎬 Раскрыть результат</button>
    );
  }
  if (round.status === 'round_result') {
    if (cb.current_round < TOTAL_ROUNDS) {
      return (
        <button
          className="btn-primary w-full text-xs"
          onClick={() => nextRound(game)}
        >Начать раунд {cb.current_round + 1}</button>
      );
    }
    return (
      <button
        className="btn-success w-full text-xs"
        onClick={() => finishGame(game, participants)}
      >🏁 Завершить игру</button>
    );
  }
  return null;
}

function SmugglerPicker({
  game, cb, round, participants,
}: {
  game: SuperGame; cb: ContrabandState; round: ContrabandRound; participants: Participant[];
}) {
  const ids = round.smuggler_team === 'north' ? cb.north_team_ids : cb.south_team_ids;
  const used = cb.smuggler_history[round.smuggler_team] ?? [];
  const candidates = ids.map(id => participants.find(p => p.id === id)).filter(Boolean) as Participant[];

  return (
    <div className="space-y-1">
      <div className="text-[11px] text-muted-foreground">
        Выберите Контрабандиста из команды {TEAM_LABELS[round.smuggler_team]}.
        Те, кто уже был, помечены серым.
      </div>
      <div className="grid grid-cols-2 gap-1">
        {candidates.map(p => {
          const wasUsed = used.includes(p.id);
          return (
            <button
              key={p.id}
              onClick={() => pickSmuggler(game, p.id)}
              className={cn(
                'flex items-center gap-1.5 p-1.5 rounded-lg text-left text-xs border active:scale-95',
                wasUsed
                  ? 'bg-card/30 border-white/5 opacity-50'
                  : 'bg-card/60 border-white/10',
              )}
            >
              <CharacterIcon participant={p} size="xs" ringless />
              <span className="truncate flex-1">{p.display_name}</span>
              {wasUsed && <span className="text-[9px] text-muted-foreground">был</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function InspectorPicker({
  game, cb, round, participants,
}: {
  game: SuperGame; cb: ContrabandState; round: ContrabandRound; participants: Participant[];
}) {
  const ids = round.inspector_team === 'north' ? cb.north_team_ids : cb.south_team_ids;
  const candidates = ids.map(id => participants.find(p => p.id === id)).filter(Boolean) as Participant[];

  return (
    <div className="space-y-1">
      <div className="text-[11px] text-muted-foreground">
        Сумма зафиксирована. Выберите Таможенника из команды {TEAM_LABELS[round.inspector_team]}.
      </div>
      <div className="grid grid-cols-2 gap-1">
        {candidates.map(p => (
          <button
            key={p.id}
            onClick={() => pickInspector(game, p.id)}
            className="flex items-center gap-1.5 p-1.5 rounded-lg text-left text-xs border bg-card/60 border-white/10 active:scale-95"
          >
            <CharacterIcon participant={p} size="xs" ringless />
            <span className="truncate flex-1">{p.display_name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

async function pickSmuggler(game: SuperGame, playerId: string) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  const idx = cur.current_round - 1;
  const rounds = [...cur.rounds];
  if (!rounds[idx]) return;
  rounds[idx] = {
    ...rounds[idx],
    smuggler_id: playerId,
    status: 'choosing_amount',
  };
  await sb.from('super_games').update({
    state: { ...cur, rounds, status: 'choosing_amount' },
  }).eq('id', game.id);
}

async function pickInspector(game: SuperGame, playerId: string) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  const idx = cur.current_round - 1;
  const rounds = [...cur.rounds];
  if (!rounds[idx]) return;
  rounds[idx] = {
    ...rounds[idx],
    inspector_id: playerId,
    status: 'inspection_decision',
  };
  await sb.from('super_games').update({
    state: { ...cur, rounds, status: 'inspection_decision' },
  }).eq('id', game.id);
}

// ---------- Раскрытие раунда (применение всех денежных дельт) ----------

async function revealRound(game: SuperGame, participants: Participant[]) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  const idx = cur.current_round - 1;
  const round = cur.rounds[idx];
  if (!round) return;
  if (round.smuggler_id == null || round.inspector_id == null) return;
  if (round.smuggled_amount == null || round.inspector_action == null) return;

  const deltas = resolveRound({
    smugglerTeam: round.smuggler_team,
    inspectorTeam: round.inspector_team,
    smuggledAmount: round.smuggled_amount,
    inspectorAction: round.inspector_action,
    suspectedAmount: round.suspected_amount ?? undefined,
  });

  // Применяем личные дельты через Казну
  const link = `/super-games/${game.id}`;
  if (deltas.smugglerPersonalDelta > 0) {
    await payoutFromTreasury(round.smuggler_id, deltas.smugglerPersonalDelta,
      `Контрабанда капитала · раунд ${round.number} · комиссия Контрабандиста`, link);
  } else if (deltas.smugglerPersonalDelta < 0) {
    await chargeToTreasury(round.smuggler_id, -deltas.smugglerPersonalDelta,
      `Контрабанда капитала · раунд ${round.number} · штраф Контрабандиста`, link);
  }
  if (deltas.inspectorPersonalDelta > 0) {
    await payoutFromTreasury(round.inspector_id, deltas.inspectorPersonalDelta,
      `Контрабанда капитала · раунд ${round.number} · комиссия Таможенника`, link);
  } else if (deltas.inspectorPersonalDelta < 0) {
    await chargeToTreasury(round.inspector_id, -deltas.inspectorPersonalDelta,
      `Контрабанда капитала · раунд ${round.number} · штраф Таможенника`, link);
  }

  // Обновим состояние
  const newRounds = [...cur.rounds];
  newRounds[idx] = {
    ...round,
    result: deltas.result,
    north_score_delta: deltas.northScoreDelta,
    south_score_delta: deltas.southScoreDelta,
    smuggler_personal_delta: deltas.smugglerPersonalDelta,
    inspector_personal_delta: deltas.inspectorPersonalDelta,
    status: 'round_result',
    resolved_at: new Date().toISOString(),
  };

  // Историю Контрабандиста — отметим
  const newHistory: Record<ContrabandTeam, string[]> = {
    north: [...(cur.smuggler_history.north ?? [])],
    south: [...(cur.smuggler_history.south ?? [])],
  };
  if (round.smuggler_id && !newHistory[round.smuggler_team].includes(round.smuggler_id)) {
    newHistory[round.smuggler_team].push(round.smuggler_id);
  }

  const next: ContrabandState = {
    ...cur,
    rounds: newRounds,
    north_score: cur.north_score + deltas.northScoreDelta,
    south_score: cur.south_score + deltas.southScoreDelta,
    smuggler_history: newHistory,
    status: 'round_result',
  };

  await sb.from('super_games').update({ state: next }).eq('id', game.id);

  await pushEvent(
    `Контрабанда капитала · раунд ${round.number}`,
    `Результат: ${labelOfResult(deltas.result)}`,
    link,
  );
}

function labelOfResult(r: ContrabandResult): string {
  switch (r) {
    case 'passed': return 'Контрабандист прошёл';
    case 'caught': return 'Поймали с поличным';
    case 'underestimated': return 'Таможенник недооценил';
    case 'empty_case_trap': return 'Ловушка пустого кейса';
  }
}

async function nextRound(game: SuperGame) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  const nextNum = cur.current_round + 1;
  if (nextNum > TOTAL_ROUNDS) return;

  // Чередуем: нечётные раунды — Север везёт, Юг проверяет; чётные — наоборот.
  const smugglerTeam: ContrabandTeam = nextNum % 2 === 1 ? 'north' : 'south';
  const inspectorTeam: ContrabandTeam = smugglerTeam === 'north' ? 'south' : 'north';

  const r: ContrabandRound = {
    number: nextNum,
    status: 'selecting_smuggler',
    smuggler_team: smugglerTeam,
    inspector_team: inspectorTeam,
    smuggler_id: null,
    inspector_id: null,
    smuggled_amount: null,
    inspector_action: null,
    suspected_amount: null,
    result: null,
  };
  const next: ContrabandState = {
    ...cur,
    current_round: nextNum,
    rounds: [...cur.rounds, r],
    status: 'selecting_smuggler',
  };
  await sb.from('super_games').update({ state: next }).eq('id', game.id);
}

async function finishGame(game: SuperGame, participants: Participant[]) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;

  const winner = pickWinner(cur.north_score, cur.south_score);
  const link = `/super-games/${game.id}`;

  if (winner !== 'draw') {
    const winnerIds = winner === 'north' ? cur.north_team_ids : cur.south_team_ids;
    const loserIds = winner === 'north' ? cur.south_team_ids : cur.north_team_ids;
    for (const pid of winnerIds) {
      await payoutFromTreasury(pid, WINNING_TEAM_REWARD,
        `Контрабанда капитала · награда команде ${TEAM_LABELS[winner]}`, link);
    }
    for (const pid of loserIds) {
      await chargeToTreasury(pid, LOSING_TEAM_PENALTY,
        `Контрабанда капитала · штраф проигравшей команде`, link);
    }
    await pushEvent(
      `Контрабанда капитала · победила команда ${TEAM_LABELS[winner]}`,
      `Счёт ${cur.north_score} : ${cur.south_score}. Каждому победителю +${WINNING_TEAM_REWARD}, каждому проигравшему −${LOSING_TEAM_PENALTY}.`,
      link,
    );
  } else {
    await pushEvent(
      `Контрабанда капитала · ничья`,
      `Счёт ${cur.north_score} : ${cur.south_score}. Командные награды и штрафы не применены.`,
      link,
    );
  }

  await sb.from('super_games').update({
    state: { ...cur, status: 'finished', winner_team: winner },
    status: 'finished',
  }).eq('id', game.id);
}

async function cancelGame(game: SuperGame) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  await sb.from('super_games').update({
    state: { ...cur, status: 'cancelled' },
    status: 'cancelled',
  }).eq('id', game.id);
  await pushEvent('Контрабанда капитала отменена', undefined, `/super-games/${game.id}`);
}
