'use client';

// Live-комната «Комната девяти патронов».
// Состояние игры — в super_games.state (JSONB). Клиенты слушают realtime.
// Админ-панель видна только Ведущему/Селестии и управляет фазами.

import { useState } from 'react';
import { useStore, uid } from '@/lib/store/StoreProvider';
import { CharacterIcon } from '@/components/ui/CharacterIcon';
import { Yen, YenIcon } from '@/components/ui/Yen';
import { JunkoInfluencePanel } from '@/components/super-games/JunkoInfluencePanel';
import { cn } from '@/lib/utils';
import { getSupabase } from '@/lib/supabase/client';
import {
  chargeToTreasury, payoutFromTreasury, placeSeatBid, transferBetweenPlayers, TREASURY_ID,
} from '@/lib/store/tx';
import { Revolver, BulletIcon } from './Revolver';
import type {
  SuperGame, NineBulletsState, NineBulletsRound, NineBulletsBid, NineBulletsShot,
  Bullet, Occupant, Participant,
} from '@/lib/store/types';

// =============================================================================
// HELPERS
// =============================================================================

function getNBState(g: SuperGame): NineBulletsState {
  const s = (g.state || {}) as Partial<NineBulletsState>;
  return {
    current_round: s.current_round ?? 1,
    rounds: s.rounds ?? [],
    status: s.status ?? 'scheduled',
    role_history: s.role_history ?? [],
  };
}

function getRound(nb: NineBulletsState): NineBulletsRound | null {
  return nb.rounds[nb.current_round - 1] ?? null;
}

function emptySeats(): NineBulletsRound['seats'] {
  return Array.from({ length: 9 }, (_, i) => ({ idx: i + 1, occupant: null }));
}

/** Алгоритм выбора ролей с учётом ограничений. */
function pickRoles(
  participantIds: string[],
  roleHistory: NineBulletsState['role_history'],
): { loader_id: string; shooter_id: string; sitters_ids: string[] } | null {
  if (participantIds.length < 7) return null;
  const last = roleHistory[roleHistory.length - 1];
  const prevLoader = last?.loader_id;
  const prevShooter = last?.shooter_id;

  // Счётчики участий — для приоритета сидящих
  const counts: Record<string, number> = {};
  for (const id of participantIds) counts[id] = 0;
  for (const h of roleHistory) {
    counts[h.loader_id]   = (counts[h.loader_id]   || 0) + 1;
    counts[h.shooter_id]  = (counts[h.shooter_id]  || 0) + 1;
    for (const s of h.sitters_ids) counts[s] = (counts[s] || 0) + 1;
  }
  const rand = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

  const loaderPool  = participantIds.filter(id => id !== prevLoader);
  const loader_id   = rand(loaderPool.length ? loaderPool : participantIds);

  const shooterPool = participantIds.filter(id => id !== loader_id && id !== prevShooter);
  const shooter_id  = rand(shooterPool.length
    ? shooterPool
    : participantIds.filter(id => id !== loader_id));

  const remaining = participantIds.filter(id => id !== loader_id && id !== shooter_id);
  remaining.sort((a, b) => (counts[a] - counts[b]) || (Math.random() - 0.5));
  const sitters_ids = remaining.slice(0, 5);

  return { loader_id, shooter_id, sitters_ids };
}

// =============================================================================
// MAIN
// =============================================================================

export function NineBulletsRoom({ game }: { game: SuperGame }) {
  const { currentUser, role } = useStore();
  const isAdmin = role === 'gm' || role === 'queen';
  const nb = getNBState(game);
  const round = getRound(nb);

  const myId = currentUser?.id;
  const isLoader  = !!round && myId === round.loader_id;
  const isShooter = !!round && myId === round.shooter_id;
  const isSitter  = !!round && !!myId && round.sitters_ids.includes(myId);

  return (
    <div className="space-y-4">
      <Header game={game} nb={nb} />

      <JunkoInfluencePanel game={game} />

      {nb.status === 'scheduled' && (
        <div className="glass p-4 text-center text-sm text-muted-foreground">
          Игра запланирована. Ожидайте старта от ведущего.
        </div>
      )}

      {round && nb.status !== 'scheduled' && nb.status !== 'finished' && (
        <>
          <RolesView round={round} />

          {nb.status === 'role_selection' && (
            <div className="glass p-4 text-center text-sm text-muted-foreground">
              Распределение ролей готово. Ведущий начнёт зарядку.
            </div>
          )}
          {nb.status === 'loading' && (
            <LoadingPhase game={game} nb={nb} round={round}
              isLoader={isLoader} isAdmin={isAdmin} />
          )}
          {nb.status === 'seat_auction' && (
            <AuctionPhase game={game} nb={nb} round={round}
              currentUser={currentUser ?? null} isSitter={isSitter} isAdmin={isAdmin} />
          )}
          {nb.status === 'shooter_swap' && (
            <SwapPhase game={game} nb={nb} round={round}
              isShooter={isShooter} isAdmin={isAdmin} />
          )}
          {nb.status === 'shooting' && (
            <ShootingPhase game={game} nb={nb} round={round} isAdmin={isAdmin} />
          )}
          {nb.status === 'round_result' && (
            <RoundResult round={round} showChamber />
          )}
        </>
      )}

      {nb.status === 'finished' && (
        <FinishedView game={game} nb={nb} />
      )}

      <RoundsHistory nb={nb} />

      {isAdmin && (
        <AdminPanel game={game} nb={nb} round={round} />
      )}
    </div>
  );
}

// =============================================================================
// HEADER + ROLES
// =============================================================================

function Header({ game, nb }: { game: SuperGame; nb: NineBulletsState }) {
  const { state } = useStore();
  const treasury = state.participants.find(p => p.id === TREASURY_ID);
  return (
    <div className="glass-strong gold-border p-4">
      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-gold/70">Раунд</div>
          <div className="font-mono font-bold text-gold text-lg mt-1">
            {Math.min(nb.current_round, 3)}/3
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-gold/70">Фаза</div>
          <div className="text-[11px] font-bold text-gold mt-1">
            {phaseLabel(nb.status)}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-gold/70">Казна</div>
          <Yen amount={treasury?.balance || 0} className="text-xs text-amber-200 mt-1" iconClass="w-3 h-3" />
        </div>
      </div>
    </div>
  );
}

function phaseLabel(s: NineBulletsState['status']): string {
  switch (s) {
    case 'scheduled':       return 'Запланирована';
    case 'role_selection':  return 'Выбор ролей';
    case 'loading':         return 'Зарядка';
    case 'seat_auction':    return 'Аукцион мест';
    case 'shooter_swap':    return 'Перестановка';
    case 'shooting':        return 'Стрельба';
    case 'round_result':    return 'Итог раунда';
    case 'finished':        return 'Завершено';
    default:                return s;
  }
}

function RolesView({ round }: { round: NineBulletsRound }) {
  const { state } = useStore();
  const loader  = state.participants.find(p => p.id === round.loader_id);
  const shooter = state.participants.find(p => p.id === round.shooter_id);
  const sitters = round.sitters_ids
    .map(id => state.participants.find(p => p.id === id))
    .filter(Boolean) as Participant[];

  return (
    <div className="glass p-3 space-y-2">
      <div className="text-[10px] uppercase tracking-widest text-gold/70 mb-1">Роли раунда</div>
      <div className="grid grid-cols-2 gap-2">
        <RoleCard label="Заряжающий" color="amber" participant={loader} />
        <RoleCard label="Стрелок" color="rose" participant={shooter} />
      </div>
      <div className="bg-card/40 border border-white/8 rounded-xl p-2">
        <div className="text-[10px] uppercase tracking-wider text-emerald-300 mb-1">Сидящие · 5</div>
        <div className="flex flex-wrap gap-1.5">
          {sitters.map(p => (
            <span key={p.id} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-[11px]">
              <CharacterIcon participant={p} size="xs" ringless />
              <span>{p.display_name}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function RoleCard({
  label, color, participant,
}: { label: string; color: 'amber' | 'rose'; participant?: Participant }) {
  const cls = color === 'amber'
    ? 'bg-amber-500/10 border-amber-500/30'
    : 'bg-rose-500/10 border-rose-500/30';
  const txt = color === 'amber' ? 'text-amber-200' : 'text-rose-200';
  return (
    <div className={cn('rounded-xl p-2 border', cls)}>
      <div className={cn('text-[10px] uppercase tracking-wider', txt)}>{label}</div>
      {participant ? (
        <div className="flex items-center gap-2 mt-1">
          <CharacterIcon participant={participant} size="xs" ringless />
          <span className="text-sm font-bold truncate">{participant.display_name}</span>
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">—</div>
      )}
    </div>
  );
}

// =============================================================================
// PHASE: LOADING (Заряжающий ставит 3 красных + 6 синих)
// =============================================================================

function LoadingPhase({
  game, nb, round, isLoader, isAdmin,
}: { game: SuperGame; nb: NineBulletsState; round: NineBulletsRound; isLoader: boolean; isAdmin: boolean }) {
  const sb = getSupabase();
  const [draft, setDraft] = useState<Bullet[]>(() =>
    round.chamber && round.chamber.length === 9 ? round.chamber : Array(9).fill('blue')
  );
  const [busy, setBusy] = useState(false);

  const reds = draft.filter(b => b === 'red').length;
  const blues = draft.filter(b => b === 'blue').length;
  const valid = reds === 3 && blues === 6;
  const alreadySaved = round.chamber && round.chamber.length === 9;

  const toggle = (i: number) => {
    if (alreadySaved) return;
    setDraft(prev => prev.map((b, idx) => idx === i ? (b === 'blue' ? 'red' : 'blue') : b));
  };

  const save = async () => {
    if (!sb || !valid || busy) return;
    setBusy(true);
    const start_pos = Math.floor(Math.random() * 9);
    const newRounds = [...nb.rounds];
    newRounds[nb.current_round - 1] = {
      ...round,
      chamber: draft,
      start_pos,
      status: 'loading',
    };
    await sb.from('super_games').update({
      state: { ...nb, rounds: newRounds },
    }).eq('id', game.id);
    setBusy(false);
  };

  if (isLoader && !alreadySaved) {
    return (
      <div className="glass-strong gold-border p-4 space-y-3">
        <div className="text-[10px] uppercase tracking-widest text-amber-300">🔫 Зарядка барабана</div>
        <div className="text-xs text-muted-foreground">
          Расставьте <strong className="text-red-300">3 красных</strong> и <strong className="text-blue-300">6 синих</strong> патронов.
          Никто не увидит порядок — только вы.
        </div>
        <div className="grid grid-cols-3 gap-2">
          {draft.map((b, i) => (
            <button key={i} onClick={() => toggle(i)}
              className={cn('aspect-square rounded-xl border-2 flex flex-col items-center justify-center gap-1 active:scale-95',
                b === 'red'
                  ? 'bg-red-500/15 border-red-500/50'
                  : 'bg-blue-500/15 border-blue-500/50')}>
              <BulletIcon kind={b} size={32} />
              <span className="text-[10px] font-mono text-muted">слот {i + 1}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className={cn(reds === 3 ? 'text-emerald-300' : 'text-red-300')}>Красных: {reds}/3</span>
          <span className={cn(blues === 6 ? 'text-emerald-300' : 'text-blue-300')}>Синих: {blues}/6</span>
        </div>
        <button onClick={save} disabled={!valid || busy} className="btn-primary w-full">
          {busy ? '...' : valid ? '🔒 Подтвердить зарядку' : 'Расставьте 3 красных и 6 синих'}
        </button>
      </div>
    );
  }

  // Не заряжающий — видит только статус
  return (
    <div className="glass p-4 text-center">
      <div className="text-3xl mb-2">🔒</div>
      <div className="text-sm">
        {alreadySaved ? 'Барабан заряжен и опечатан.' : 'Заряжающий заряжает барабан...'}
      </div>
      {alreadySaved && isAdmin && (
        <div className="text-[10px] text-muted-foreground mt-1">
          Стартовая позиция определена случайно. Запустите аукцион через панель ведущего.
        </div>
      )}
    </div>
  );
}

// =============================================================================
// PHASE: SEAT AUCTION (5 сидящих покупают места слепыми ставками)
// =============================================================================

function AuctionPhase({
  game, nb, round, currentUser, isSitter, isAdmin,
}: {
  game: SuperGame; nb: NineBulletsState; round: NineBulletsRound;
  currentUser: Participant | null; isSitter: boolean; isAdmin: boolean;
}) {
  const { state } = useStore();
  const occupiedSeats = new Set(round.seats.filter(s => s.occupant).map(s => s.idx));
  const freeSeats = round.seats.filter(s => !s.occupant);
  const seatedSitters = new Set(
    round.seats.filter(s => s.occupant && s.occupant !== 'dummy').map(s => s.occupant as string)
  );
  const remainingSitters = round.sitters_ids.filter(id => !seatedSitters.has(id));

  const myBidExisting = currentUser ? round.bids[currentUser.id] : undefined;
  const canBid =
    !!currentUser && isSitter && !seatedSitters.has(currentUser.id) &&
    round.auction_status === 'open' && !myBidExisting;

  const [seatChoice, setSeatChoice] = useState<number | ''>('');
  // Стартовая цена места = 0, чтобы случайно не списали деньги.
  const [amount, setAmount] = useState(0);
  const [busy, setBusy] = useState(false);

  const submitBid = async () => {
    if (!currentUser || !seatChoice || busy) return;
    setBusy(true);
    const ok = await placeSeatBid(game.id, nb.current_round - 1, currentUser.id, Number(seatChoice), amount);
    if (!ok) alert('Ставка не принята (место занято или вы уже ставили).');
    setBusy(false);
  };

  return (
    <div className="space-y-3">
      {/* Карта мест */}
      <SeatsGrid round={round} />

      {/* Форма для сидящего */}
      {isSitter && currentUser && !seatedSitters.has(currentUser.id) && (
        <div className="glass-strong gold-border p-4 space-y-2">
          <div className="text-[10px] uppercase tracking-widest text-gold/70">🎟️ Ваша ставка на место</div>
          {myBidExisting ? (
            <div className="text-sm">
              ✅ Ставка принята: место <strong>№{myBidExisting.seat}</strong> ·{' '}
              <Yen amount={myBidExisting.amount} className="text-gold" iconClass="w-3 h-3" />
            </div>
          ) : (
            <>
              <select value={seatChoice} onChange={e => setSeatChoice(e.target.value as any)} className="input-field">
                <option value="">— выберите место —</option>
                {freeSeats.map(s => (
                  <option key={s.idx} value={s.idx}>Место {s.idx}</option>
                ))}
              </select>
              <div className="flex items-center gap-2">
                <YenIcon className="w-4 h-4" />
                <input type="number" min={0} max={100000} step={1000} value={amount}
                  onChange={e => setAmount(Math.max(0, Math.min(100000, Number(e.target.value))))}
                  className="input-field font-mono" />
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {[0, 25000, 50000, 100000].map(v => (
                  <button key={v} onClick={() => setAmount(v)}
                    className="px-2 py-2 text-[11px] rounded-lg bg-card/60 border border-white/8 active:bg-white/5 font-mono">
                    {v >= 1000 ? `${v / 1000}K` : v}
                  </button>
                ))}
              </div>
              <button onClick={submitBid} disabled={!seatChoice || busy} className="btn-primary w-full">
                {busy ? '...' : 'Сделать ставку'}
              </button>
              <p className="text-[10px] text-muted">
                Ставка слепая. Проигравшие ставки не платят. Победитель платит сумму в Казну.
              </p>
            </>
          )}
        </div>
      )}

      {/* Прогресс */}
      <div className="glass p-3">
        <div className="text-[10px] uppercase tracking-widest text-gold/70 mb-1">
          Аукцион — круг ставок: {Object.keys(round.bids).length}/{remainingSitters.length} сделали ставку
        </div>
        {isAdmin && remainingSitters.length > 0 && (
          <div className="text-[11px] text-muted-foreground mt-1">
            Без ставки: {remainingSitters.filter(id => !round.bids[id])
              .map(id => state.participants.find(p => p.id === id)?.display_name)
              .filter(Boolean).join(', ') || 'все'}
          </div>
        )}
      </div>
    </div>
  );
}

function SeatsGrid({ round }: { round: NineBulletsRound }) {
  const { state } = useStore();
  return (
    <div className="glass p-3">
      <div className="text-[10px] uppercase tracking-widest text-gold/70 mb-2">Места 1–9</div>
      <div className="grid grid-cols-3 gap-2">
        {round.seats.map(s => {
          const occ = s.occupant;
          const player = occ && occ !== 'dummy' ? state.participants.find(p => p.id === occ) : null;
          return (
            <div key={s.idx} className={cn('rounded-xl p-2 border text-center min-h-[68px] flex flex-col justify-center',
              !occ ? 'bg-card/30 border-white/8' :
              occ === 'dummy' ? 'bg-gray-500/10 border-gray-500/30' :
              'bg-emerald-500/10 border-emerald-500/30')}>
              <div className="text-[10px] text-muted-foreground">Место {s.idx}</div>
              {occ === 'dummy' ? (
                <div className="text-xs font-bold text-gray-300 mt-0.5">🎯 Манекен</div>
              ) : player ? (
                <div className="flex items-center justify-center gap-1 mt-0.5">
                  <CharacterIcon participant={player} size="xs" ringless />
                  <span className="text-[11px] font-bold truncate">{player.display_name}</span>
                </div>
              ) : (
                <div className="text-[11px] text-muted-foreground mt-0.5">свободно</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// PHASE: SHOOTER SWAP
// =============================================================================

function SwapPhase({
  game, nb, round, isShooter, isAdmin,
}: { game: SuperGame; nb: NineBulletsState; round: NineBulletsRound; isShooter: boolean; isAdmin: boolean }) {
  const sb = getSupabase();
  const [a, setA] = useState<number | ''>('');
  const [b, setB] = useState<number | ''>('');
  const [busy, setBusy] = useState(false);

  const swap = async () => {
    if (!sb || !a || !b || a === b || busy) return;
    if (!confirm(`Поменять места ${a} и ${b}? С вас спишется ¥100 000 в Казну.`)) return;
    setBusy(true);
    const tx = await chargeToTreasury(round.shooter_id, 100000,
      `Перестановка цели · Раунд ${round.n}: ${game.title}`,
      `/super-games/${game.id}`);
    if (!tx.ok) { setBusy(false); alert(tx.error || 'Ошибка'); return; }
    const seats = [...round.seats];
    const ia = seats.findIndex(s => s.idx === a);
    const ib = seats.findIndex(s => s.idx === b);
    [seats[ia].occupant, seats[ib].occupant] = [seats[ib].occupant, seats[ia].occupant];
    const newRounds = [...nb.rounds];
    newRounds[nb.current_round - 1] = {
      ...round, seats,
      shooter_swap: { a: Number(a), b: Number(b), paid: true },
      status: 'shooting',
    };
    await sb.from('super_games').update({
      state: { ...nb, status: 'shooting', rounds: newRounds },
    }).eq('id', game.id);
    setBusy(false);
  };

  const skip = async () => {
    if (!sb) return;
    const newRounds = [...nb.rounds];
    newRounds[nb.current_round - 1] = {
      ...round,
      shooter_swap: { skipped: true } as any,
      status: 'shooting',
    };
    await sb.from('super_games').update({
      state: { ...nb, status: 'shooting', rounds: newRounds },
    }).eq('id', game.id);
  };

  const done = !!round.shooter_swap;

  return (
    <div className="space-y-3">
      <SeatsGrid round={round} />
      {!done && isShooter && (
        <div className="glass-strong gold-border p-4 space-y-2">
          <div className="text-[10px] uppercase tracking-widest text-rose-300">🎯 Право Стрелка</div>
          <div className="text-xs text-muted-foreground">
            Можно один раз поменять две цели местами за ¥100 000 в Казну, либо пропустить.
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select value={a} onChange={e => setA(e.target.value as any)} className="input-field">
              <option value="">место А</option>
              {round.seats.map(s => <option key={s.idx} value={s.idx}>№{s.idx}</option>)}
            </select>
            <select value={b} onChange={e => setB(e.target.value as any)} className="input-field">
              <option value="">место Б</option>
              {round.seats.map(s => <option key={s.idx} value={s.idx}>№{s.idx}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={swap} disabled={!a || !b || a === b || busy} className="btn-danger">
              🔁 Поменять (−100k)
            </button>
            <button onClick={skip} className="btn-secondary">Пропустить</button>
          </div>
        </div>
      )}
      {!done && !isShooter && (
        <div className="glass p-3 text-center text-sm text-muted-foreground">
          Стрелок принимает решение о перестановке...
        </div>
      )}
      {done && (
        <div className="glass p-3 text-center text-sm">
          {('skipped' in round.shooter_swap!)
            ? 'Стрелок отказался от перестановки.'
            : `🔁 Стрелок поменял места ${(round.shooter_swap as any).a} и ${(round.shooter_swap as any).b}.`}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// PHASE: SHOOTING
// =============================================================================

function ShootingPhase({
  game, nb, round, isAdmin,
}: { game: SuperGame; nb: NineBulletsState; round: NineBulletsRound; isAdmin: boolean }) {
  const { state } = useStore();
  const targetLabel = (target: Occupant): string => {
    if (target === 'dummy') return '🎯 Манекен';
    if (!target) return '—';
    const p = state.participants.find(x => x.id === target);
    return p?.display_name || '—';
  };

  const nextSeat = round.shots_revealed + 1;
  const lastShot = round.shots[round.shots.length - 1];
  const allDone = round.shots_revealed >= 9;
  return (
    <div className="space-y-3">
      <div className="glass-strong gold-border p-4 flex flex-col items-center">
        <Revolver
          chamber={round.chamber}
          revealed={round.shots_revealed}
          startPos={round.start_pos}
          highlightSeat={!allDone ? nextSeat : null}
          showAll={false}
          spinning={false}
          size={260}
        />
        <div className="mt-3 text-center">
          <div className="text-[10px] uppercase tracking-widest text-gold/70">
            {allDone ? 'Все 9 выстрелов сделаны' : `Выстрел ${nextSeat} из 9`}
          </div>
          {!allDone && (
            <div className="text-xs text-muted-foreground mt-1">
              Цель: место №{nextSeat}
            </div>
          )}
          {lastShot && (
            <div className="mt-2 inline-flex items-center gap-2 text-xs">
              <BulletIcon kind={lastShot.bullet} size={16} />
              <span className={cn(lastShot.bullet === 'red' ? 'text-red-300' : 'text-blue-300', 'font-bold')}>
                {lastShot.bullet === 'red' ? 'БОЕВОЙ' : 'ХОЛОСТОЙ'}
              </span>
              <span className="text-muted-foreground">
                в {targetLabel(lastShot.target)}
              </span>
            </div>
          )}
        </div>
      </div>

      <SeatsGrid round={round} />

      {round.shots.length > 0 && (
        <div className="glass p-3 space-y-1">
          <div className="text-[10px] uppercase tracking-widest text-gold/70 mb-1">Лента выстрелов</div>
          {round.shots.map(s => (
            <div key={s.seat} className="flex items-center gap-2 text-xs py-0.5">
              <span className="font-mono text-muted">№{s.seat}</span>
              <BulletIcon kind={s.bullet} size={14} />
              <span className={cn('font-bold w-16', s.bullet === 'red' ? 'text-red-300' : 'text-blue-300')}>
                {s.bullet === 'red' ? 'БОЕВ.' : 'ХОЛОСТ.'}
              </span>
              <span className="flex-1 truncate text-muted-foreground">→ {targetLabel(s.target)}</span>
              <ShotDeltas shot={s} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// PHASE: ROUND RESULT
// =============================================================================

function RoundResult({ round, showChamber }: { round: NineBulletsRound; showChamber?: boolean }) {
  const { state } = useStore();
  const sitterDeltas: Record<string, number> = {};
  for (const id of round.sitters_ids) sitterDeltas[id] = 0;
  let shooterDelta = 0;
  for (const sh of round.shots) {
    shooterDelta += sh.delta_shooter;
    if (sh.target && sh.target !== 'dummy') {
      sitterDeltas[sh.target] = (sitterDeltas[sh.target] || 0) + sh.delta_target;
    }
  }
  if (round.shooter_swap && 'paid' in round.shooter_swap && round.shooter_swap.paid) {
    shooterDelta -= 100000;
  }

  return (
    <div className="space-y-3">
      <div className="glass-strong gold-border p-4">
        <div className="text-[10px] uppercase tracking-widest text-gold/70 mb-2">Итог раунда {round.n}</div>
        <div className="grid grid-cols-3 gap-2 text-xs text-center">
          <div>
            <div className="text-muted">Боевых по сидящим</div>
            <div className="font-mono font-bold text-rose-300 text-xl mt-1">{round.hits_on_sitters}</div>
          </div>
          <div>
            <div className="text-muted">Стрелок</div>
            <DeltaText value={shooterDelta} />
          </div>
          <div>
            <div className="text-muted">Заряжающий</div>
            <DeltaText value={round.loader_payout} />
          </div>
        </div>
      </div>

      {/* Сидящие */}
      <div className="glass p-3">
        <div className="text-[10px] uppercase tracking-widest text-gold/70 mb-2">Сидящие</div>
        <div className="space-y-1.5">
          {round.sitters_ids.map(id => {
            const p = state.participants.find(x => x.id === id);
            const d = sitterDeltas[id] || 0;
            return (
              <div key={id} className="flex items-center justify-between text-xs">
                <span>{p?.display_name || '—'}</span>
                <DeltaText value={d} />
              </div>
            );
          })}
        </div>
      </div>

      {showChamber && round.chamber.length === 9 && (
        <div className="glass p-3">
          <div className="text-[10px] uppercase tracking-widest text-gold/70 mb-2">Барабан раскрыт</div>
          <div className="flex items-center justify-center">
            <Revolver
              chamber={round.chamber}
              startPos={round.start_pos}
              revealed={9}
              showAll
              size={220}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function DeltaText({ value }: { value: number }) {
  if (value === 0) return <div className="font-mono text-muted">±0</div>;
  return (
    <div className={cn('font-mono font-bold', value > 0 ? 'text-emerald-300' : 'text-red-300')}>
      {value > 0 ? '+' : ''}{value.toLocaleString('ru-RU')}
    </div>
  );
}

function ShotDeltas({ shot }: { shot: NineBulletsShot }) {
  return (
    <div className="flex items-center gap-1 text-[10px] font-mono shrink-0">
      <span className={cn(shot.delta_shooter > 0 ? 'text-emerald-300' : shot.delta_shooter < 0 ? 'text-red-300' : 'text-muted')}>
        {shot.delta_shooter > 0 ? '+' : ''}{shot.delta_shooter / 1000}k
      </span>
    </div>
  );
}

// =============================================================================
// FINISHED + HISTORY
// =============================================================================

function FinishedView({ game, nb }: { game: SuperGame; nb: NineBulletsState }) {
  const { state } = useStore();
  // Подсчёт суммарного дельты для каждого участника по всем раундам
  const totals: Record<string, number> = {};
  for (const r of nb.rounds) {
    // Сидящие
    for (const sh of r.shots) {
      totals[r.shooter_id] = (totals[r.shooter_id] || 0) + sh.delta_shooter;
      if (sh.target && sh.target !== 'dummy') {
        totals[sh.target] = (totals[sh.target] || 0) + sh.delta_target;
      }
    }
    // Заряжающий
    totals[r.loader_id] = (totals[r.loader_id] || 0) + r.loader_payout;
    // Стрелок: если делал swap
    if (r.shooter_swap && 'paid' in r.shooter_swap && r.shooter_swap.paid) {
      totals[r.shooter_id] = (totals[r.shooter_id] || 0) - 100000;
    }
  }
  const sortedIds = Object.keys(totals).sort((a, b) => totals[b] - totals[a]);

  return (
    <div className="glass-strong gold-border p-4 space-y-3">
      <div className="text-center">
        <div className="text-3xl mb-1">🏁</div>
        <div className="font-heading text-xl font-bold text-gradient-gold">Игра завершена</div>
      </div>
      <div className="space-y-1">
        <div className="text-[10px] uppercase tracking-widest text-gold/70">Итоговая прибыль/убыток</div>
        {sortedIds.map(id => {
          const p = state.participants.find(x => x.id === id);
          if (!p) return null;
          return (
            <div key={id} className="flex items-center justify-between text-xs py-1 border-b border-white/5 last:border-0">
              <div className="flex items-center gap-2">
                <CharacterIcon participant={p} size="xs" ringless />
                <span>{p.display_name}</span>
              </div>
              <DeltaText value={totals[id]} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RoundsHistory({ nb }: { nb: NineBulletsState }) {
  const finished = nb.rounds.filter(r => r.status === 'round_result' || r.shots_revealed === 9);
  const past = finished.filter(r => r.n < nb.current_round || nb.status === 'finished');
  if (past.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="divider-ornate my-2">✦ Завершённые раунды ✦</div>
      {past.map(r => (
        <details key={r.n} className="glass p-3">
          <summary className="cursor-pointer text-sm font-bold">Раунд {r.n}</summary>
          <div className="mt-2"><RoundResult round={r} showChamber /></div>
        </details>
      ))}
    </div>
  );
}

// =============================================================================
// ADMIN PANEL
// =============================================================================

function AdminPanel({
  game, nb, round,
}: { game: SuperGame; nb: NineBulletsState; round: NineBulletsRound | null }) {
  const sb = getSupabase();
  const { state } = useStore();
  const [busy, setBusy] = useState(false);

  // ---- старт игры (раунд 1, фаза role_selection) ----
  const startGame = async () => {
    if (!sb || busy) return;
    if ((game.participant_ids || []).length < 7) {
      alert('Нужно минимум 7 участников');
      return;
    }
    setBusy(true);
    const roles = pickRoles(game.participant_ids, []);
    if (!roles) { setBusy(false); return; }
    const r1: NineBulletsRound = {
      n: 1,
      ...roles,
      chamber: [],
      start_pos: 0,
      bids: {},
      auction_status: 'pending',
      seats: emptySeats(),
      shooter_swap: null,
      shots: [],
      shots_revealed: 0,
      hits_on_sitters: 0,
      loader_payout: 0,
      status: 'role_selection',
    };
    const newState: NineBulletsState = {
      current_round: 1,
      rounds: [r1],
      status: 'role_selection',
      role_history: [],
    };
    await sb.from('super_games').update({
      status: 'live',
      state: newState,
    }).eq('id', game.id);
    await sb.from('events').insert({
      id: uid('ev'), type: 'big_game_start',
      title: `Старт: ${game.title}`,
      link_url: `/super-games/${game.id}`, is_for_gm_only: false,
    });
    setBusy(false);
  };

  // ---- перевыбрать роли в текущем раунде ----
  const rerollRoles = async () => {
    if (!sb || !round || busy) return;
    const roles = pickRoles(game.participant_ids, nb.role_history);
    if (!roles) return;
    const newRounds = [...nb.rounds];
    newRounds[nb.current_round - 1] = { ...round, ...roles };
    await sb.from('super_games').update({ state: { ...nb, rounds: newRounds } }).eq('id', game.id);
  };

  // ---- перейти к зарядке ----
  const toLoading = async () => {
    if (!sb || !round) return;
    const newRounds = [...nb.rounds];
    newRounds[nb.current_round - 1] = { ...round, status: 'loading' };
    await sb.from('super_games').update({
      state: { ...nb, status: 'loading', rounds: newRounds },
    }).eq('id', game.id);
  };

  // ---- открыть аукцион ----
  const openAuction = async () => {
    if (!sb || !round) return;
    if (round.chamber.length !== 9) { alert('Барабан ещё не заряжен.'); return; }
    const newRounds = [...nb.rounds];
    newRounds[nb.current_round - 1] = {
      ...round, auction_status: 'open', bids: {}, status: 'seat_auction',
    };
    await sb.from('super_games').update({
      state: { ...nb, status: 'seat_auction', rounds: newRounds },
    }).eq('id', game.id);
  };

  // ---- завершить круг ставок ----
  const resolveAuctionRound = async () => {
    if (!sb || !round || busy) return;
    setBusy(true);

    // Группируем ставки по seat
    const bidsBySeat = new Map<number, { id: string; amount: number }[]>();
    for (const [pid, b] of Object.entries(round.bids)) {
      if (!bidsBySeat.has(b.seat)) bidsBySeat.set(b.seat, []);
      bidsBySeat.get(b.seat)!.push({ id: pid, amount: b.amount });
    }

    const newSeats = round.seats.map(s => ({ ...s }));
    for (const [seat, list] of bidsBySeat) {
      // Учитываем только свободные места
      const seatObj = newSeats.find(s => s.idx === seat);
      if (!seatObj || seatObj.occupant) continue;
      // Сортировка по сумме (убывание), при равенстве — рандом
      list.sort((a, b) => (b.amount - a.amount) || (Math.random() - 0.5));
      const winner = list[0];
      seatObj.occupant = winner.id;
      seatObj.bid = winner.amount;
      // Победитель платит в Казну
      if (winner.amount > 0) {
        await chargeToTreasury(winner.id, winner.amount,
          `Покупка места №${seat} · Раунд ${round.n}: ${game.title}`,
          `/super-games/${game.id}`);
      }
    }

    // Сколько ещё сидящих не заняли место?
    const seatedSet = new Set(newSeats.filter(s => s.occupant && s.occupant !== 'dummy').map(s => s.occupant));
    const remainingSitters = round.sitters_ids.filter(id => !seatedSet.has(id));

    let newStatus: NineBulletsState['status'] = 'seat_auction';
    let auction_status: NineBulletsRound['auction_status'] = 'open';

    if (remainingSitters.length === 0) {
      // Все сидящие заняли места — оставшиеся места становятся манекенами
      for (const s of newSeats) if (!s.occupant) s.occupant = 'dummy';
      auction_status = 'resolved';
      newStatus = 'shooter_swap';
    }

    const newRounds = [...nb.rounds];
    newRounds[nb.current_round - 1] = {
      ...round,
      seats: newSeats,
      bids: {}, // следующий круг ставок начинается с пустого
      auction_status,
      status: newStatus === 'shooter_swap' ? 'shooter_swap' : 'seat_auction',
    };
    await sb.from('super_games').update({
      state: { ...nb, status: newStatus, rounds: newRounds },
    }).eq('id', game.id);
    setBusy(false);
  };

  // ---- пропустить swap (если стрелок не отвечает) ----
  const adminSkipSwap = async () => {
    if (!sb || !round) return;
    const newRounds = [...nb.rounds];
    newRounds[nb.current_round - 1] = { ...round, shooter_swap: { skipped: true } as any };
    await sb.from('super_games').update({ state: { ...nb, rounds: newRounds } }).eq('id', game.id);
  };

  // ---- перейти к стрельбе ----
  const toShooting = async () => {
    if (!sb || !round) return;
    if (!round.shooter_swap) { alert('Стрелок ещё не решил.'); return; }
    const newRounds = [...nb.rounds];
    newRounds[nb.current_round - 1] = { ...round, status: 'shooting' };
    await sb.from('super_games').update({
      state: { ...nb, status: 'shooting', rounds: newRounds },
    }).eq('id', game.id);
  };

  // ---- раскрыть следующий выстрел ----
  const revealNextShot = async () => {
    if (!sb || !round || busy) return;
    if (round.shots_revealed >= 9) return;
    setBusy(true);

    const seatIdx = round.shots_revealed + 1; // 1..9
    const chamberIdx = (round.start_pos + seatIdx - 1) % 9;
    const bullet = round.chamber[chamberIdx] as Bullet;
    const seat = round.seats.find(s => s.idx === seatIdx)!;
    const target = seat.occupant; // string | 'dummy' | null

    let delta_shooter = 0, delta_target = 0, delta_treasury = 0;
    const linkRef = `/super-games/${game.id}`;
    if (target && target !== 'dummy') {
      // Прямой обмен Стрелок ↔ Сидящий
      if (bullet === 'blue') {
        delta_shooter = +100000; delta_target = -100000;
        await transferBetweenPlayers(target, round.shooter_id, 100000,
          `Холостой по сидящему · Раунд ${round.n}`, linkRef);
      } else {
        delta_shooter = -100000; delta_target = +100000;
        await transferBetweenPlayers(round.shooter_id, target, 100000,
          `Боевой по сидящему · Раунд ${round.n}`, linkRef);
      }
    } else if (target === 'dummy') {
      // С Казной
      if (bullet === 'red') {
        delta_shooter = +50000; delta_treasury = -50000;
        await payoutFromTreasury(round.shooter_id, 50000,
          `Боевой по манекену · Раунд ${round.n}`, linkRef);
      } else {
        delta_shooter = -25000; delta_treasury = +25000;
        await chargeToTreasury(round.shooter_id, 25000,
          `Холостой по манекену · Раунд ${round.n}`, linkRef);
      }
    }

    const newShot: NineBulletsShot = {
      seat: seatIdx, bullet, target,
      delta_shooter, delta_target, delta_treasury,
    };
    const newShots = [...round.shots, newShot];
    const newRevealed = round.shots_revealed + 1;
    const newRounds = [...nb.rounds];
    let nextStatus: NineBulletsState['status'] = 'shooting';
    let updated: NineBulletsRound = { ...round, shots: newShots, shots_revealed: newRevealed };

    if (newRevealed === 9) {
      // Подсчёт выплаты заряжающему
      const hits_on_sitters = newShots.filter(
        s => s.bullet === 'red' && s.target && s.target !== 'dummy'
      ).length;
      let loader_payout = 0;
      if (hits_on_sitters === 0)        loader_payout = -150000;
      else if (hits_on_sitters === 1)   loader_payout = +50000;
      else if (hits_on_sitters === 2)   loader_payout = +100000;
      else if (hits_on_sitters >= 3)    loader_payout = +150000;

      if (loader_payout > 0) {
        await payoutFromTreasury(round.loader_id, loader_payout,
          `Оплата заряжающему · Раунд ${round.n}`, linkRef);
      } else if (loader_payout < 0) {
        await chargeToTreasury(round.loader_id, -loader_payout,
          `Штраф заряжающему · Раунд ${round.n}`, linkRef);
      }

      updated = { ...updated, hits_on_sitters, loader_payout, status: 'round_result' };
      nextStatus = 'round_result';
    }

    newRounds[nb.current_round - 1] = updated;
    await sb.from('super_games').update({
      state: { ...nb, status: nextStatus, rounds: newRounds },
    }).eq('id', game.id);
    setBusy(false);
  };

  // ---- следующий раунд ----
  const nextRound = async () => {
    if (!sb || !round || busy) return;
    setBusy(true);
    // Сохраняем role_history
    const newRoleHistory = [...nb.role_history, {
      round: round.n,
      loader_id: round.loader_id,
      shooter_id: round.shooter_id,
      sitters_ids: round.sitters_ids,
    }];
    if (round.n >= 3) {
      // Все 3 раунда сыграны → finished
      await sb.from('super_games').update({
        status: 'finished',
        state: { ...nb, status: 'finished', role_history: newRoleHistory },
      }).eq('id', game.id);
      setBusy(false);
      return;
    }
    const roles = pickRoles(game.participant_ids, newRoleHistory);
    if (!roles) { setBusy(false); return; }
    const newRound: NineBulletsRound = {
      n: round.n + 1,
      ...roles,
      chamber: [],
      start_pos: 0,
      bids: {},
      auction_status: 'pending',
      seats: emptySeats(),
      shooter_swap: null,
      shots: [],
      shots_revealed: 0,
      hits_on_sitters: 0,
      loader_payout: 0,
      status: 'role_selection',
    };
    const newRounds = [...nb.rounds, newRound];
    await sb.from('super_games').update({
      state: {
        ...nb,
        current_round: round.n + 1,
        rounds: newRounds,
        status: 'role_selection',
        role_history: newRoleHistory,
      },
    }).eq('id', game.id);
    setBusy(false);
  };

  // ---- завершить игру вручную ----
  const finishNow = async () => {
    if (!sb || !round) return;
    if (!confirm('Завершить игру сейчас? Раунд будет сохранён как есть.')) return;
    const newRoleHistory = [...nb.role_history, {
      round: round.n,
      loader_id: round.loader_id,
      shooter_id: round.shooter_id,
      sitters_ids: round.sitters_ids,
    }];
    await sb.from('super_games').update({
      status: 'finished',
      state: { ...nb, status: 'finished', role_history: newRoleHistory },
    }).eq('id', game.id);
  };

  // =============== RENDER ===============

  if (game.status === 'finished' || game.status === 'cancelled') return null;

  return (
    <div className="glass-strong gold-border p-4 space-y-3">
      <div className="text-[10px] uppercase tracking-widest text-gold/70">⚙️ Управление: 9 патронов</div>

      {nb.status === 'scheduled' && (
        <button onClick={startGame} disabled={busy} className="btn-success w-full">
          🚀 Старт игры (раунд 1, выбор ролей)
        </button>
      )}

      {nb.status === 'role_selection' && round && (
        <RolePickerAdmin game={game} nb={nb} round={round}
          onReroll={rerollRoles} onContinue={toLoading} busy={busy} />
      )}

      {nb.status === 'loading' && round && (
        <button onClick={openAuction} disabled={busy || round.chamber.length !== 9} className="btn-primary w-full">
          {round.chamber.length === 9 ? '🎟️ Открыть аукцион мест →' : 'Ждём заряжающего...'}
        </button>
      )}

      {nb.status === 'seat_auction' && round && (
        <button onClick={resolveAuctionRound} disabled={busy} className="btn-primary w-full">
          🔚 Завершить круг ставок
        </button>
      )}

      {nb.status === 'shooter_swap' && round && (
        <div className="grid grid-cols-2 gap-2">
          <button onClick={adminSkipSwap} className="btn-secondary text-xs">
            ⏭ Пропустить за стрелка
          </button>
          <button onClick={toShooting} disabled={!round.shooter_swap} className="btn-primary text-xs">
            🎯 К стрельбе →
          </button>
        </div>
      )}

      {nb.status === 'shooting' && round && (
        <button onClick={revealNextShot} disabled={busy || round.shots_revealed >= 9} className="btn-primary w-full">
          {round.shots_revealed >= 9 ? 'Все 9 выстрелов сделаны' : `🔫 Раскрыть выстрел ${round.shots_revealed + 1}/9`}
        </button>
      )}

      {nb.status === 'round_result' && round && (
        <div className="grid grid-cols-2 gap-2">
          {round.n < 3 ? (
            <button onClick={nextRound} disabled={busy} className="btn-primary text-xs">
              ➡️ Следующий раунд
            </button>
          ) : (
            <button onClick={nextRound} disabled={busy} className="btn-success text-xs col-span-2">
              🏁 Завершить игру
            </button>
          )}
          {round.n < 3 && (
            <button onClick={finishNow} className="btn-danger text-xs">
              🏁 Завершить досрочно
            </button>
          )}
        </div>
      )}
    </div>
  );
}


function RolePickerAdmin({
  game, nb, round, onReroll, onContinue, busy,
}: {
  game: SuperGame; nb: NineBulletsState; round: NineBulletsRound;
  onReroll: () => void; onContinue: () => void; busy: boolean;
}) {
  const { state } = useStore();
  const sb = getSupabase();
  const participants = (game.participant_ids || [])
    .map((pid: string) => state.participants.find(p => p.id === pid))
    .filter(Boolean) as Participant[];

  const setLoader = async (id: string) => {
    if (!sb) return;
    if (id === round.shooter_id) { alert('Стрелок не может быть Заряжающим.'); return; }
    const newRounds = [...nb.rounds];
    const remaining = participants.map(p => p.id).filter(x => x !== id && x !== round.shooter_id);
    const sitters = remaining.slice(0, 5);
    newRounds[nb.current_round - 1] = { ...round, loader_id: id, sitters_ids: sitters };
    await sb.from('super_games').update({ state: { ...nb, rounds: newRounds } }).eq('id', game.id);
  };
  const setShooter = async (id: string) => {
    if (!sb) return;
    if (id === round.loader_id) { alert('Заряжающий не может быть Стрелком.'); return; }
    const newRounds = [...nb.rounds];
    const remaining = participants.map(p => p.id).filter(x => x !== round.loader_id && x !== id);
    const sitters = remaining.slice(0, 5);
    newRounds[nb.current_round - 1] = { ...round, shooter_id: id, sitters_ids: sitters };
    await sb.from('super_games').update({ state: { ...nb, rounds: newRounds } }).eq('id', game.id);
  };
  const toggleSitter = async (id: string) => {
    if (!sb) return;
    if (id === round.loader_id || id === round.shooter_id) return;
    const cur = new Set(round.sitters_ids);
    if (cur.has(id)) cur.delete(id);
    else if (cur.size < 5) cur.add(id);
    else return;
    const newRounds = [...nb.rounds];
    newRounds[nb.current_round - 1] = { ...round, sitters_ids: Array.from(cur) };
    await sb.from('super_games').update({ state: { ...nb, rounds: newRounds } }).eq('id', game.id);
  };

  const sittersOk = round.sitters_ids.length === 5;

  return (
    <div className="space-y-2">
      <div className="text-[11px] text-muted-foreground">
        Назначь роли вручную или жми «Случайно».
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-widest text-amber-300/80 mb-1">🔫 Заряжающий</div>
        <div className="grid grid-cols-2 gap-1">
          {participants.map(p => (
            <button key={p.id}
              onClick={() => setLoader(p.id)}
              className={cn(
                'flex items-center gap-1.5 p-1.5 rounded-lg border text-xs text-left',
                round.loader_id === p.id ? 'bg-amber-500/15 border-amber-500/50 text-amber-200' :
                p.id === round.shooter_id ? 'bg-card/30 border-white/5 opacity-40' :
                'bg-card/40 border-white/8',
              )}
            >
              <CharacterIcon participant={p} size="xs" ringless />
              <span className="truncate">{p.display_name}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-widest text-red-300/80 mb-1">🎯 Стрелок</div>
        <div className="grid grid-cols-2 gap-1">
          {participants.map(p => (
            <button key={p.id}
              onClick={() => setShooter(p.id)}
              className={cn(
                'flex items-center gap-1.5 p-1.5 rounded-lg border text-xs text-left',
                round.shooter_id === p.id ? 'bg-red-500/15 border-red-500/50 text-red-200' :
                p.id === round.loader_id ? 'bg-card/30 border-white/5 opacity-40' :
                'bg-card/40 border-white/8',
              )}
            >
              <CharacterIcon participant={p} size="xs" ringless />
              <span className="truncate">{p.display_name}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-widest text-emerald-300/80 mb-1">
          🪑 Сидящие · {round.sitters_ids.length}/5
        </div>
        <div className="grid grid-cols-2 gap-1">
          {participants.map(p => {
            const isSitter = round.sitters_ids.includes(p.id);
            const isOther = p.id === round.loader_id || p.id === round.shooter_id;
            return (
              <button key={p.id}
                onClick={() => toggleSitter(p.id)}
                disabled={isOther}
                className={cn(
                  'flex items-center gap-1.5 p-1.5 rounded-lg border text-xs text-left',
                  isSitter ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-200' :
                  isOther ? 'bg-card/30 border-white/5 opacity-30 cursor-not-allowed' :
                  'bg-card/40 border-white/8',
                )}
              >
                <CharacterIcon participant={p} size="xs" ringless />
                <span className="truncate">{p.display_name}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 pt-1">
        <button onClick={onReroll} disabled={busy} className="btn-secondary text-xs">
          🎲 Случайно
        </button>
        <button onClick={onContinue} disabled={busy || !sittersOk} className="btn-primary text-xs">
          🔫 К зарядке →
        </button>
      </div>
    </div>
  );
}
