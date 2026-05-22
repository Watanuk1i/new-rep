'use client';

// ===========================================================================
// «Совет бунта» — 8-я Большая игра. Идёт после «Суда над Элитой».
// Селестия наблюдает (через систему). 6–12 игроков, 5 раундов тайных
// действий: Бунт / Предательство / Нейтралитет / Сделка с Элитой.
// Цель: собрать Фонд бунта ≥ ¥3 000 000.
// ===========================================================================

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/lib/store/StoreProvider';
import { CharacterIcon } from '@/components/ui/CharacterIcon';
import { Yen } from '@/components/ui/Yen';
import { cn, isPlayer } from '@/lib/utils';
import { getSupabase } from '@/lib/supabase/client';
import { chargeToTreasury, payoutFromTreasury } from '@/lib/store/tx';
import {
  TOTAL_ROUNDS, REBELLION_PERSONAL_COST, REBELLION_FUND_GAIN,
  BETRAYAL_REWARD, BETRAYAL_FUND_DAMAGE,
  ELITE_DEAL_REWARD, ELITE_DEAL_SUCCESS_PENALTY,
  REBELLION_SUCCESS_GOAL, TREASURY_DAMAGE_ON_SUCCESS,
  LOYAL_REBEL_REWARD, LOYAL_REBEL_MIN_CHOICES,
  BETRAYER_PENALTY_ON_SUCCESS, BETRAYER_MIN_CHOICES_FOR_PENALTY,
  REBEL_PENALTY_ON_FAILURE,
  resolveRound, resolveFinal, emptyCounts,
} from '@/lib/rebellion/logic';
import type {
  SuperGame, Participant, RebellionState, RebellionRound,
  RebellionAction, RebellionPlayerCounts,
} from '@/lib/store/types';

// ---------- helpers ----------

function getState(g: SuperGame): RebellionState {
  const s = (g.state || {}) as Partial<RebellionState>;
  return {
    current_round: s.current_round ?? 0,
    total_rounds: s.total_rounds ?? TOTAL_ROUNDS,
    rounds: s.rounds ?? [],
    rebellion_fund: s.rebellion_fund ?? 0,
    rebellion_goal: s.rebellion_goal ?? REBELLION_SUCCESS_GOAL,
    reveal_mode: s.reveal_mode ?? 'public_names',
    player_counts: s.player_counts ?? {},
    result: s.result ?? null,
    throne_unlocked: s.throne_unlocked ?? false,
    status: s.status ?? 'scheduled',
  };
}

async function readState(gameId: string): Promise<RebellionState | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.from('super_games').select('state').eq('id', gameId).single();
  return (data?.state as RebellionState) ?? null;
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

// ===========================================================================

export function RebellionRoom({ game }: { game: SuperGame }) {
  const { state, currentUser, role } = useStore();
  const isAdmin = role === 'gm' || role === 'queen';
  const rb = getState(game);

  const participants = (game.participant_ids || [])
    .map(pid => state.participants.find(p => p.id === pid))
    .filter(Boolean) as Participant[];

  const isPlayerInGame = !!currentUser && participants.some(p => p.id === currentUser.id);
  const currentRound: RebellionRound | null =
    rb.current_round > 0 ? rb.rounds[rb.current_round - 1] ?? null : null;

  return (
    <div className="space-y-4">
      <Header rb={rb} />

      {/* Прогресс Фонда */}
      <FundProgress rb={rb} />

      {/* Текущий раунд */}
      {currentRound && rb.status !== 'finished' && rb.status !== 'cancelled' && (
        <RoundView
          game={game} rb={rb} round={currentRound}
          participants={participants}
          currentUserId={currentUser?.id ?? null}
          isPlayerInGame={isPlayerInGame}
          isAdmin={isAdmin}
        />
      )}

      {/* Финал */}
      {rb.status === 'finished' && (
        <FinishedView rb={rb} participants={participants} />
      )}

      {/* История раундов */}
      {rb.rounds.some(r => r.status === 'resolved') && (
        <RoundsHistory rb={rb} participants={participants} />
      )}

      {/* Админ */}
      {isAdmin && rb.status !== 'finished' && rb.status !== 'cancelled' && (
        <AdminPanel game={game} rb={rb} participants={participants} />
      )}
    </div>
  );
}

// ---------- Шапка и прогресс ----------

function Header({ rb }: { rb: RebellionState }) {
  return (
    <div className="glass-strong gold-border p-4">
      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-gold/70">Раунд</div>
          <div className="font-mono font-bold text-gold text-lg mt-1">
            {rb.current_round > 0 ? `${rb.current_round}/${TOTAL_ROUNDS}` : `0/${TOTAL_ROUNDS}`}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-gold/70">Фонд</div>
          <Yen amount={rb.rebellion_fund} className="text-base text-gold mt-1" iconClass="w-4 h-4" />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-gold/70">Цель</div>
          <Yen amount={rb.rebellion_goal} className="text-base mt-1" iconClass="w-4 h-4" />
        </div>
      </div>
      <div className="mt-3 text-center text-[10px] text-muted-foreground">
        Селестия наблюдает · Казна обеспечивает выплаты предателям и сделочникам
      </div>
    </div>
  );
}

function FundProgress({ rb }: { rb: RebellionState }) {
  const percent = Math.min(100, Math.round((rb.rebellion_fund / rb.rebellion_goal) * 100));
  return (
    <div className="glass p-3">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
        <span>Фонд бунта</span>
        <span>{percent}%</span>
      </div>
      <div className="h-3 rounded-full bg-card/60 overflow-hidden border border-white/8">
        <div
          className={cn(
            'h-full transition-all',
            percent >= 100 ? 'bg-gradient-to-r from-emerald-400 to-emerald-600'
                          : 'bg-gradient-to-r from-amber-400 to-red-500',
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

// ---------- Раунд ----------

function RoundView({
  game, rb, round, participants, currentUserId, isPlayerInGame, isAdmin,
}: {
  game: SuperGame; rb: RebellionState; round: RebellionRound;
  participants: Participant[]; currentUserId: string | null;
  isPlayerInGame: boolean; isAdmin: boolean;
}) {
  return (
    <div className="glass-strong gold-border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-heading text-lg font-bold text-gradient-gold">Раунд {round.number}/{TOTAL_ROUNDS}</div>
        <PhaseBadge status={round.status} />
      </div>

      {round.status === 'choice' && (
        <ChoicePhase
          game={game} round={round}
          participants={participants}
          currentUserId={currentUserId}
          isPlayerInGame={isPlayerInGame}
        />
      )}

      {round.status === 'revealed' && (
        <div className="text-xs text-muted-foreground text-center py-2">
          Все игроки сделали выбор. Ведущий применит результаты раунда.
        </div>
      )}

      {round.status === 'resolved' && (
        <ResolvedRoundBlock round={round} participants={participants} revealMode={rb.reveal_mode} />
      )}
    </div>
  );
}

function PhaseBadge({ status }: { status: RebellionRound['status'] }) {
  const map: Record<RebellionRound['status'], { label: string; cls: string }> = {
    choice:   { label: 'Тайные действия', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
    revealed: { label: 'Готово',          cls: 'bg-purple-500/15 text-purple-300 border-purple-500/30' },
    resolved: { label: 'Раскрыто',        cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  };
  const m = map[status];
  return <span className={cn('status-badge border', m.cls)}>{m.label}</span>;
}

function ChoicePhase({
  game, round, participants, currentUserId, isPlayerInGame,
}: {
  game: SuperGame; round: RebellionRound;
  participants: Participant[]; currentUserId: string | null;
  isPlayerInGame: boolean;
}) {
  const placedCount = Object.keys(round.choices ?? {}).length;
  const myChoice = currentUserId ? (round.choices ?? {})[currentUserId] : undefined;

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        Все участники тайно выбирают одно из четырёх действий. До раскрытия выборы скрыты.
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
        {participants.map(p => {
          const placed = !!round.choices?.[p.id];
          return (
            <div key={p.id} className={cn(
              'flex flex-col items-center gap-1 p-1.5 rounded-lg',
              placed ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-card/40 border border-white/8',
            )}>
              <CharacterIcon participant={p} size="xs" ringless />
              <span className="text-[10px] truncate max-w-[60px]">{p.display_name.split(' ')[0]}</span>
              <span className={cn('text-[9px] font-bold',
                placed ? 'text-emerald-300' : 'text-muted-foreground')}>
                {placed ? '✓' : '…'}
              </span>
            </div>
          );
        })}
      </div>
      <div className="text-[10px] text-center text-muted-foreground">
        Готово: {placedCount}/{participants.length}
      </div>

      {isPlayerInGame && currentUserId && (
        <ActionButtons game={game} round={round} currentUserId={currentUserId} myChoice={myChoice} />
      )}
    </div>
  );
}

function ActionButtons({
  game, round, currentUserId, myChoice,
}: {
  game: SuperGame; round: RebellionRound; currentUserId: string;
  myChoice?: RebellionAction;
}) {
  const actions: { key: RebellionAction; title: string; emoji: string; desc: React.ReactNode; color: string }[] = [
    {
      key: 'rebellion', title: 'Бунт', emoji: '🔥', color: 'red',
      desc: <>−<Yen amount={REBELLION_PERSONAL_COST} className="inline" iconClass="w-3 h-3" /> · Фонд +<Yen amount={REBELLION_FUND_GAIN} className="inline" iconClass="w-3 h-3" /></>,
    },
    {
      key: 'betrayal', title: 'Предательство', emoji: '🕵️', color: 'sky',
      desc: <>+<Yen amount={BETRAYAL_REWARD} className="inline" iconClass="w-3 h-3" /> · Фонд −<Yen amount={BETRAYAL_FUND_DAMAGE} className="inline" iconClass="w-3 h-3" /></>,
    },
    {
      key: 'neutral', title: 'Нейтралитет', emoji: '⚖️', color: 'gray',
      desc: <>Без изменений</>,
    },
    {
      key: 'elite_deal', title: 'Сделка с Элитой', emoji: '👑', color: 'amber',
      desc: <>+<Yen amount={ELITE_DEAL_REWARD} className="inline" iconClass="w-3 h-3" /> · при успехе бунта −<Yen amount={ELITE_DEAL_SUCCESS_PENALTY} className="inline" iconClass="w-3 h-3" /></>,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-2">
      {actions.map(a => {
        const active = myChoice === a.key;
        return (
          <button
            key={a.key}
            onClick={() => placeAction(game, currentUserId, a.key)}
            className={cn(
              'w-full px-3 py-3 rounded-xl text-left transition-colors border',
              active
                ? 'bg-gold/15 border-gold text-gold-light'
                : 'bg-card/60 border-white/10 active:bg-card/80',
            )}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm">{a.emoji} {a.title}</span>
              {active && <span className="text-[10px] text-gold">✓ выбрано</span>}
            </div>
            <div className="text-[11px] text-muted-foreground mt-1">{a.desc}</div>
          </button>
        );
      })}
      {myChoice && (
        <div className="text-[11px] text-emerald-300 text-center">
          ✓ Выбор записан. Можно сменить, пока ведущий не закрыл раунд.
        </div>
      )}
    </div>
  );
}

async function placeAction(game: SuperGame, playerId: string, action: RebellionAction) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  const idx = cur.current_round - 1;
  const rounds = [...cur.rounds];
  if (!rounds[idx] || rounds[idx].status !== 'choice') return;
  rounds[idx] = {
    ...rounds[idx],
    choices: { ...(rounds[idx].choices ?? {}), [playerId]: action },
  };
  await sb.from('super_games').update({ state: { ...cur, rounds } }).eq('id', game.id);
}

function ResolvedRoundBlock({
  round, participants, revealMode,
}: {
  round: RebellionRound; participants: Participant[];
  revealMode: 'public_names' | 'numbers_only';
}) {
  const counts = [
    { key: 'rebellion' as const, label: 'Бунт',           emoji: '🔥', count: round.rebellion_count ?? 0,    cls: 'text-red-300' },
    { key: 'betrayal' as const,  label: 'Предательство',  emoji: '🕵️', count: round.betrayal_count ?? 0,    cls: 'text-sky-300' },
    { key: 'neutral' as const,   label: 'Нейтралитет',    emoji: '⚖️', count: round.neutral_count ?? 0,     cls: 'text-muted-foreground' },
    { key: 'elite_deal' as const,label: 'Сделка с Элитой',emoji: '👑', count: round.elite_deal_count ?? 0, cls: 'text-amber-300' },
  ];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {counts.map(c => (
          <div key={c.key} className="p-2 rounded-xl bg-card/40 text-xs">
            <div className={cn('text-[10px] uppercase tracking-widest', c.cls)}>{c.emoji} {c.label}</div>
            <div className="font-bold text-base">{c.count}</div>
          </div>
        ))}
      </div>

      <div className="text-center text-xs">
        Фонд: <Yen amount={round.fund_after_round ?? 0} full className="inline text-sm" iconClass="w-3 h-3" />
        <span className="text-muted-foreground ml-2">
          ({(round.fund_delta ?? 0) >= 0 ? '+' : ''}{new Intl.NumberFormat('ru-RU').format(round.fund_delta ?? 0)})
        </span>
      </div>

      {revealMode === 'public_names' && (
        <div className="space-y-1">
          {participants.map(p => {
            const action = round.choices?.[p.id];
            if (!action) return null;
            return (
              <div key={p.id} className="flex items-center gap-2 p-1.5 rounded-xl bg-card/40 text-xs">
                <CharacterIcon participant={p} size="xs" ringless />
                <span className="flex-1 truncate">{p.display_name}</span>
                <ActionChip action={action} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ActionChip({ action }: { action: RebellionAction }) {
  const map: Record<RebellionAction, { label: string; cls: string; emoji: string }> = {
    rebellion:  { label: 'Бунт',           cls: 'bg-red-500/15 text-red-300 border-red-500/30',     emoji: '🔥' },
    betrayal:   { label: 'Предательство',  cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30',     emoji: '🕵️' },
    neutral:    { label: 'Нейтралитет',    cls: 'bg-gray-500/15 text-gray-300 border-gray-500/30',  emoji: '⚖️' },
    elite_deal: { label: 'Сделка с Элитой',cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30',emoji: '👑' },
  };
  const m = map[action];
  return <span className={cn('px-1.5 py-0.5 rounded-full text-[10px] font-bold border', m.cls)}>{m.emoji} {m.label}</span>;
}

// ---------- История ----------

function RoundsHistory({ rb, participants }: { rb: RebellionState; participants: Participant[] }) {
  const rounds = rb.rounds.filter(r => r.status === 'resolved');
  if (rounds.length === 0) return null;
  return (
    <div className="glass p-4">
      <div className="section-title text-sm mb-2">📜 История раундов</div>
      <div className="space-y-2">
        {rounds.map(r => (
          <details key={r.number} className="bg-card/30 rounded-xl border border-white/8 overflow-hidden">
            <summary className="px-3 py-2 cursor-pointer text-xs">
              <span className="font-bold">Раунд {r.number}</span>
              <span className="ml-2 text-muted-foreground font-normal">
                🔥 {r.rebellion_count ?? 0} · 🕵️ {r.betrayal_count ?? 0} · ⚖️ {r.neutral_count ?? 0} · 👑 {r.elite_deal_count ?? 0}
              </span>
              <span className="ml-auto float-right text-[10px] text-gold/80">
                Фонд: {(r.fund_after_round ?? 0) / 1000}K
              </span>
            </summary>
            <div className="p-3 pt-0">
              <ResolvedRoundBlock round={r} participants={participants} revealMode={rb.reveal_mode} />
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

// ---------- Финал ----------

function FinishedView({ rb, participants }: { rb: RebellionState; participants: Participant[] }) {
  const success = rb.result === 'rebellion_success';
  return (
    <div className={cn('glass-strong p-5 text-center',
      success ? 'gold-border' : 'crimson-border')}>
      <div className="text-[10px] uppercase tracking-widest text-gold/70">Игра завершена</div>
      <h3 className={cn('font-heading text-2xl font-bold mt-2',
        success ? 'text-gradient-gold' : 'text-red-300')}>
        {success ? '🔥 Бунт успешен' : '⚖️ Бунт провален'}
      </h3>
      <p className="text-xs text-muted-foreground mt-1">
        Фонд: <Yen amount={rb.rebellion_fund} full className="inline" iconClass="w-3 h-3" /> из <Yen amount={rb.rebellion_goal} full className="inline" iconClass="w-3 h-3" />
      </p>
      {success && rb.throne_unlocked && (
        <div className="mt-3 inline-block px-3 py-1 rounded-full bg-gold/10 border border-gold/40 text-gold text-xs font-bold">
          👑 Финальная игра «Трон Селестии» разблокирована
        </div>
      )}
      {!success && (
        <div className="mt-3 inline-block px-3 py-1 rounded-full bg-red-500/10 border border-red-500/40 text-red-300 text-xs font-bold">
          Селестия получила право выбрать одного игрока для личной игры
        </div>
      )}

      <div className="mt-4 space-y-1">
        {participants.map(p => {
          const c = rb.player_counts[p.id] ?? { ...emptyCounts(), total_money_delta: 0 };
          return (
            <div key={p.id} className="flex items-center gap-2 p-1.5 rounded-xl bg-card/40 text-xs">
              <CharacterIcon participant={p} size="xs" ringless />
              <span className="flex-1 truncate text-left">{p.display_name}</span>
              <span className="text-red-300 font-mono w-8 text-right">🔥{c.rebellion ?? 0}</span>
              <span className="text-sky-300 font-mono w-8 text-right">🕵️{c.betrayal ?? 0}</span>
              <span className="text-amber-300 font-mono w-8 text-right">👑{c.elite_deal ?? 0}</span>
              <span className={cn('font-mono w-20 text-right',
                (c.total_money_delta ?? 0) > 0 ? 'text-emerald-300' :
                (c.total_money_delta ?? 0) < 0 ? 'text-red-300' : 'text-muted-foreground')}>
                {(c.total_money_delta ?? 0) > 0 ? '+' : ''}
                {new Intl.NumberFormat('ru-RU').format(c.total_money_delta ?? 0)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Админ-панель ----------

function AdminPanel({
  game, rb, participants,
}: {
  game: SuperGame; rb: RebellionState; participants: Participant[];
}) {
  const round = rb.current_round > 0 ? rb.rounds[rb.current_round - 1] : null;

  return (
    <div className="glass-strong gold-border p-4 space-y-2">
      <div className="text-[10px] uppercase tracking-widest text-gold/70">⚙️ Управление</div>

      {/* Toggle reveal mode */}
      <div className="flex items-center gap-2 text-[11px]">
        <span>Режим раскрытия:</span>
        <button
          className={cn('px-2 py-1 rounded-md border',
            rb.reveal_mode === 'public_names' ? 'bg-gold/15 border-gold/40 text-gold' : 'bg-card/40 border-white/8')}
          onClick={() => setRevealMode(game, 'public_names')}
        >Имена</button>
        <button
          className={cn('px-2 py-1 rounded-md border',
            rb.reveal_mode === 'numbers_only' ? 'bg-gold/15 border-gold/40 text-gold' : 'bg-card/40 border-white/8')}
          onClick={() => setRevealMode(game, 'numbers_only')}
        >Только числа</button>
      </div>

      {rb.status === 'scheduled' && (
        <button
          className="btn-primary w-full text-xs"
          onClick={() => startRound1(game, participants)}
        >▶ Запустить игру (раунд 1)</button>
      )}

      {round?.status === 'choice' && (
        <>
          <div className="text-[11px] text-muted-foreground">
            Сделали выбор: {Object.keys(round.choices ?? {}).length}/{participants.length}
          </div>
          <button
            className="btn-primary w-full text-xs"
            onClick={() => closeChoices(game)}
          >Завершить выбор действий</button>
        </>
      )}

      {round?.status === 'revealed' && (
        <button
          className="btn-success w-full text-xs"
          onClick={() => revealRound(game, participants)}
        >🎬 Раскрыть и применить</button>
      )}

      {round?.status === 'resolved' && (
        rb.current_round < TOTAL_ROUNDS ? (
          <button
            className="btn-primary w-full text-xs"
            onClick={() => nextRound(game)}
          >Начать раунд {rb.current_round + 1}</button>
        ) : (
          <button
            className="btn-success w-full text-xs"
            onClick={() => finishGame(game, participants)}
          >🏁 Завершить игру</button>
        )
      )}

      {(rb.status === 'round_choice' || rb.status === 'round_reveal' || rb.status === 'round_result') && (
        <details className="text-xs">
          <summary className="cursor-pointer text-red-300/80 py-1">Отменить игру</summary>
          <button
            className="btn-danger w-full text-xs mt-2"
            onClick={() => cancelGame(game)}
          >Отменить</button>
        </details>
      )}
    </div>
  );
}

async function setRevealMode(game: SuperGame, mode: 'public_names' | 'numbers_only') {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  await sb.from('super_games').update({ state: { ...cur, reveal_mode: mode } }).eq('id', game.id);
}

async function startRound1(game: SuperGame, participants: Participant[]) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  const counts: Record<string, RebellionPlayerCounts> = { ...cur.player_counts };
  for (const p of participants) {
    if (!counts[p.id]) counts[p.id] = { rebellion: 0, betrayal: 0, neutral: 0, elite_deal: 0, total_money_delta: 0 };
  }
  const r1: RebellionRound = { number: 1, status: 'choice', choices: {} };
  await sb.from('super_games').update({
    state: { ...cur, current_round: 1, rounds: [r1], status: 'round_choice', player_counts: counts },
    status: 'live',
  }).eq('id', game.id);
  await pushEvent('Совет бунта · раунд 1 начался', undefined, `/super-games/${game.id}`);
}

async function closeChoices(game: SuperGame) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  const idx = cur.current_round - 1;
  const rounds = [...cur.rounds];
  if (!rounds[idx] || rounds[idx].status !== 'choice') return;
  rounds[idx] = { ...rounds[idx], status: 'revealed' };
  await sb.from('super_games').update({ state: { ...cur, rounds, status: 'round_reveal' } }).eq('id', game.id);
}

async function revealRound(game: SuperGame, participants: Participant[]) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  const idx = cur.current_round - 1;
  const round = cur.rounds[idx];
  if (!round) return;

  const link = `/super-games/${game.id}`;
  const choices = round.choices ?? {};
  const out = resolveRound(choices, cur.rebellion_fund);

  // Применяем дельты через Казну
  const counts = { ...cur.player_counts };
  for (const [pid, delta] of Object.entries(out.perPlayerDelta)) {
    if (delta > 0) {
      await payoutFromTreasury(pid, delta, `Совет бунта · раунд ${round.number}`, link);
    } else if (delta < 0) {
      await chargeToTreasury(pid, -delta, `Совет бунта · раунд ${round.number}`, link);
    }
    const c = counts[pid] ?? { rebellion: 0, betrayal: 0, neutral: 0, elite_deal: 0, total_money_delta: 0 };
    const action = choices[pid];
    if (action === 'rebellion')  c.rebellion += 1;
    if (action === 'betrayal')   c.betrayal += 1;
    if (action === 'neutral')    c.neutral += 1;
    if (action === 'elite_deal') c.elite_deal += 1;
    c.total_money_delta += delta;
    counts[pid] = c;
  }

  const fundAfter = Math.max(0, cur.rebellion_fund + out.fundDelta);

  const newRounds = [...cur.rounds];
  newRounds[idx] = {
    ...round,
    status: 'resolved',
    rebellion_count: out.rebellionCount,
    betrayal_count: out.betrayalCount,
    neutral_count: out.neutralCount,
    elite_deal_count: out.eliteDealCount,
    fund_delta: out.fundDelta,
    fund_after_round: fundAfter,
    resolved_at: new Date().toISOString(),
  };

  await sb.from('super_games').update({
    state: {
      ...cur,
      rounds: newRounds,
      rebellion_fund: fundAfter,
      player_counts: counts,
      status: 'round_result',
    },
  }).eq('id', game.id);

  await pushEvent(
    `Совет бунта · раунд ${round.number} раскрыт`,
    `Фонд: ${new Intl.NumberFormat('ru-RU').format(fundAfter)}.`,
    link,
  );
}

async function nextRound(game: SuperGame) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  const nextNum = cur.current_round + 1;
  if (nextNum > TOTAL_ROUNDS) return;
  const r: RebellionRound = { number: nextNum, status: 'choice', choices: {} };
  await sb.from('super_games').update({
    state: { ...cur, current_round: nextNum, rounds: [...cur.rounds, r], status: 'round_choice' },
  }).eq('id', game.id);
  await pushEvent(`Совет бунта · раунд ${nextNum}`, undefined, `/super-games/${game.id}`);
}

async function finishGame(game: SuperGame, participants: Participant[]) {
  const sb = getSupabase();
  if (!sb) return;
  const cur = await readState(game.id);
  if (!cur) return;
  const link = `/super-games/${game.id}`;

  // Считаем финал по суммарным счётчикам
  const countsForLogic: Record<string, any> = {};
  for (const [pid, c] of Object.entries(cur.player_counts)) {
    countsForLogic[pid] = {
      rebellion: c.rebellion ?? 0,
      betrayal: c.betrayal ?? 0,
      neutral: c.neutral ?? 0,
      elite_deal: c.elite_deal ?? 0,
    };
  }
  const final = resolveFinal(countsForLogic, cur.rebellion_fund);

  // Если бунт успешен — Казна теряет 3M (символическая транзакция: списываем у Казны через
  // несколько финальных операций — фактически деньги уже разошлись по игрокам в раундах,
  // но финансовый штраф можно зафиксировать как «потеря Казны» отдельной записью истории).
  // Здесь просто фиксируем событие, реальные движения остаются на бонусах ниже.

  const counts = { ...cur.player_counts };
  for (const p of participants) {
    const delta = final.perPlayer[p.id] ?? 0;
    if (delta > 0) {
      await payoutFromTreasury(p.id, delta, `Совет бунта · итог`, link);
    } else if (delta < 0) {
      await chargeToTreasury(p.id, -delta, `Совет бунта · итог`, link);
    }
    const c = counts[p.id] ?? { rebellion: 0, betrayal: 0, neutral: 0, elite_deal: 0, total_money_delta: 0 };
    c.total_money_delta += delta;
    counts[p.id] = c;
  }

  await sb.from('super_games').update({
    state: {
      ...cur,
      status: 'finished',
      result: final.result,
      throne_unlocked: final.throneUnlocked,
      player_counts: counts,
    },
    status: 'finished',
  }).eq('id', game.id);

  if (final.result === 'rebellion_success') {
    await pushEvent(
      `Совет бунта завершён · бунт успешен`,
      `Фонд: ${new Intl.NumberFormat('ru-RU').format(cur.rebellion_fund)}. Финальная игра «Трон Селестии» разблокирована.`,
      link,
    );
  } else {
    await pushEvent(
      `Совет бунта завершён · бунт провален`,
      `Фонд: ${new Intl.NumberFormat('ru-RU').format(cur.rebellion_fund)} из ${new Intl.NumberFormat('ru-RU').format(cur.rebellion_goal)}. Селестия получила право выбрать игрока.`,
      link,
    );
  }
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
  await pushEvent('Совет бунта отменён', undefined, `/super-games/${game.id}`);
}
