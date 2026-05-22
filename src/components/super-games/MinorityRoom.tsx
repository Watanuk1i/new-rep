'use client';

import { useEffect, useMemo, useState } from 'react';
import { useStore, uid } from '@/lib/store/StoreProvider';
import { CharacterIcon } from '@/components/ui/CharacterIcon';
import { Yen, YenIcon } from '@/components/ui/Yen';
import { cn } from '@/lib/utils';
import { getSupabase } from '@/lib/supabase/client';
import {
  chargeToTreasury, payoutFromTreasury, castMinorityVote,
} from '@/lib/store/tx';
import type {
  SuperGame, MinorityState, MinorityRound, MinorityHistoryEntry, Participant,
} from '@/lib/store/types';

// ===== helpers =====

function getMinState(g: SuperGame): MinorityState {
  const s = (g.state || {}) as Partial<MinorityState>;
  return {
    alive_ids: s.alive_ids ?? [],
    fee_paid: s.fee_paid ?? {},
    round: s.round ?? null,
    history: s.history ?? [],
    spectator_bets: s.spectator_bets ?? [],
  };
}

function fmtTime(sec: number): string {
  if (sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function useCountdown(startedAt: string | undefined, durationSec: number | undefined): number {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!startedAt || !durationSec) { setRemaining(0); return; }
    const tick = () => {
      const start = new Date(startedAt).getTime();
      const left = Math.max(0, Math.round((start + durationSec * 1000 - Date.now()) / 1000));
      setRemaining(left);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt, durationSec]);
  return remaining;
}

// ===== Главный компонент =====

export function MinorityRoom({ game }: { game: SuperGame }) {
  const { state, currentUser, role } = useStore();
  const isAdmin = role === 'gm' || role === 'queen';
  const min = getMinState(game);

  const participants = (game.participant_ids || [])
    .map(pid => state.participants.find(p => p.id === pid))
    .filter(Boolean) as Participant[];
  const aliveSet = new Set(min.alive_ids);
  const alive = participants.filter(p => aliveSet.has(p.id));
  const eliminated = participants.filter(p => !aliveSet.has(p.id));

  const isParticipant = !!currentUser && (game.participant_ids || []).includes(currentUser.id);
  const isAlive = !!currentUser && aliveSet.has(currentUser.id);

  return (
    <div className="space-y-4">
      <RoomHeader game={game} min={min} alive={alive} />

      {game.status === 'scheduled' && (
        <div className="glass p-4 text-center">
          <div className="text-sm text-muted-foreground">
            Игра запланирована. Ожидайте старта.
          </div>
        </div>
      )}

      {game.status === 'live' && min.round && (
        <RoundView
          game={game} min={min}
          isAdmin={isAdmin}
          currentUser={currentUser}
          isAlive={isAlive}
          isParticipant={isParticipant}
          alive={alive}
        />
      )}

      {game.status === 'live' && !min.round && (
        <div className="glass p-4 text-center">
          <div className="text-sm text-muted-foreground">
            {alive.length === 1
              ? `Остался один — ${alive[0]?.display_name}. Ведущий объявит победителя.`
              : 'Раунд ещё не открыт. Ведущий выбирает участника для вопроса...'}
          </div>
        </div>
      )}

      {/* Личный баннер по последнему раунду: «Вы прошли» / «Вы выбыли» */}
      {game.status === 'live' && !min.round && currentUser && isParticipant && min.history.length > 0 && (
        <PersonalRoundResultBanner min={min} currentUser={currentUser} />
      )}

      {/* Сводка кто остался / кто выбыл после раунда */}
      {game.status === 'live' && !min.round && min.history.length > 0 && (
        <RoundSurvivorsBlock game={game} min={min} alive={alive} />
      )}

      {game.status === 'finished' && (
        <FinishedView game={game} />
      )}

      {/* Зрительские ставки — только для не-участников и пока игра live */}
      {game.spectator_bets_enabled && game.status === 'live' && currentUser && !isParticipant && !isAdmin && (
        <SpectatorBetsBlock game={game} min={min} currentUser={currentUser} alive={alive} />
      )}

      {/* Сводка ставок зрителей видна всем */}
      {game.spectator_bets_enabled && min.spectator_bets.length > 0 && (
        <SpectatorBetsSummary game={game} min={min} />
      )}

      <RoundsHistory game={game} min={min} />

      {isAdmin && (
        <MinorityAdminPanel game={game} min={min} alive={alive} />
      )}
    </div>
  );
}

// ===== Шапка =====

function RoomHeader({ game, min, alive }: { game: SuperGame; min: MinorityState; alive: Participant[] }) {
  const round = min.round;
  const remaining = useCountdown(round?.started_at, round?.duration_sec);
  const totalPlayers = (game.participant_ids || []).length;

  return (
    <div className="glass-strong gold-border p-4">
      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-gold/70">Банк</div>
          <Yen amount={game.bank} className="text-base text-gold mt-1" iconClass="w-4 h-4" />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-gold/70">Живых</div>
          <div className="font-mono font-bold text-gold text-lg mt-1">{alive.length}/{totalPlayers}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-gold/70">Раунд</div>
          <div className="font-mono font-bold text-gold text-lg mt-1">
            {round ? `№${round.number}` : '—'}
          </div>
        </div>
      </div>
      {round && round.status === 'open' && (
        <div className="mt-3 text-center">
          <div className="text-[10px] uppercase tracking-widest text-red-300/80">До конца раунда</div>
          <div className="font-mono font-bold text-2xl mt-1">
            {fmtTime(remaining)}
          </div>
        </div>
      )}
    </div>
  );
}

// ===== Раунд =====

function RoundView({
  game, min, isAdmin, currentUser, isAlive, isParticipant, alive,
}: {
  game: SuperGame; min: MinorityState; isAdmin: boolean;
  currentUser: Participant | null; isAlive: boolean; isParticipant: boolean;
  alive: Participant[];
}) {
  const { state } = useStore();
  const round = min.round!;
  const askedPlayer = round.asked_id ? state.participants.find(p => p.id === round.asked_id) : null;
  const myVote = currentUser ? round.votes[currentUser.id] : undefined;

  const totalAlive = alive.length;
  const votedCount = Object.keys(round.votes).filter(pid => alive.some(a => a.id === pid)).length;

  // Подсчёт для админа (live)
  const yesCount = Object.values(round.votes).filter(v => v === 'yes').length;
  const noCount  = Object.values(round.votes).filter(v => v === 'no').length;

  const canVote = isAlive && round.status === 'open' && !myVote;

  return (
    <div className="space-y-3">
      {/* Кому задают вопрос */}
      {askedPlayer && (
        <div className="glass-strong p-4 text-center crimson-border">
          <div className="text-[10px] uppercase tracking-widest text-red-300/80 mb-2">Вопрос задаёт</div>
          <div className="flex items-center justify-center gap-3">
            <CharacterIcon participant={askedPlayer} size="lg" />
            <div className="text-left">
              <div className="font-heading text-xl font-bold text-gradient-gold">
                {askedPlayer.display_name}!
              </div>
              <div className="text-[11px] text-muted-foreground">
                Назовите вопрос вслух — голосуйте на сайте
              </div>
            </div>
          </div>
          {round.question && (
            <div className="mt-3 p-3 rounded-xl bg-card/40 border border-red-500/20 text-sm text-red-200 italic">
              «{round.question}»
            </div>
          )}
        </div>
      )}

      {/* Кнопки голосования или статус */}
      {round.status === 'open' && (
        <div className="space-y-2">
          {canVote ? (
            <div className="grid grid-cols-2 gap-3">
              <VoteButton kind="yes" gameId={game.id} voterId={currentUser!.id} />
              <VoteButton kind="no"  gameId={game.id} voterId={currentUser!.id} />
            </div>
          ) : isAlive && myVote ? (
            <div className="glass p-4 text-center">
              <div className="text-sm">
                ✅ Ваш голос отдан: <strong className={cn(myVote === 'yes' ? 'text-emerald-300' : 'text-red-300')}>
                  {myVote === 'yes' ? 'ДА' : 'НЕТ'}
                </strong>
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">
                Ожидайте остальных и закрытия раунда
              </div>
            </div>
          ) : !isAlive && isParticipant ? (
            <div className="glass p-4 text-center text-sm text-muted-foreground">
              Вы выбыли. Можете наблюдать за раундом.
            </div>
          ) : (
            <div className="glass p-4 text-center text-sm text-muted-foreground">
              Голосуют только живые участники игры.
            </div>
          )}

          {/* Прогресс */}
          <div className="glass p-3">
            <div className="text-[10px] uppercase tracking-widest text-gold/70 mb-1">
              Проголосовало: {votedCount} из {totalAlive}
            </div>
            <div className="h-2 bg-card/60 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-gold-light to-gold-dark"
                style={{ width: `${totalAlive > 0 ? (votedCount / totalAlive) * 100 : 0}%` }} />
            </div>
            {isAdmin && (
              <div className="mt-2 flex justify-between text-xs">
                <span className="text-emerald-300">ДА: {yesCount}</span>
                <span className="text-red-300">НЕТ: {noCount}</span>
                <span className="text-muted">Ждём: {totalAlive - votedCount}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Результат раунда показывается через history последний пункт */}
      {round.status === 'closed' && (
        <div className="glass p-4 text-sm text-muted-foreground">
          Раунд закрыт. Идёт подсчёт результатов...
        </div>
      )}
    </div>
  );
}

function VoteButton({ kind, gameId, voterId }: { kind: 'yes' | 'no'; gameId: string; voterId: string }) {
  const [busy, setBusy] = useState(false);
  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    const ok = await castMinorityVote(gameId, voterId, kind);
    if (!ok) {
      alert(
        'Не удалось зафиксировать голос.\n\n' +
        'Возможные причины:\n' +
        '• раунд уже закрыт;\n' +
        '• голос уже отдан и его нельзя переписать;\n' +
        '• вы выбыли из игры (выбывшие игроки не голосуют).'
      );
    }
    setBusy(false);
  };
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={cn(
        'rounded-2xl py-6 font-heading font-bold text-2xl border-2 active:scale-[0.98] transition',
        kind === 'yes'
          ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 active:bg-emerald-500/25'
          : 'bg-red-500/15 border-red-500/50 text-red-300 active:bg-red-500/25',
        busy && 'opacity-50',
      )}
    >
      {kind === 'yes' ? '✓ ДА' : '✗ НЕТ'}
    </button>
  );
}

// ===== История раундов =====

function RoundsHistory({ game, min }: { game: SuperGame; min: MinorityState }) {
  const { state } = useStore();
  if (min.history.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="divider-ornate my-2">✦ История раундов ✦</div>
      {[...min.history].reverse().map(h => {
        const asked = h.asked_id ? state.participants.find(p => p.id === h.asked_id) : null;
        const yesIds = Object.entries(h.votes).filter(([, v]) => v === 'yes').map(([k]) => k);
        const noIds  = Object.entries(h.votes).filter(([, v]) => v === 'no').map(([k]) => k);
        const minorityLabel =
          h.minority === 'tie' ? 'Ничья' :
          h.minority === 'yes' ? 'Меньшинство: ДА' : 'Меньшинство: НЕТ';
        const eliminatedNames = h.eliminated
          .map(id => state.participants.find(p => p.id === id)?.display_name)
          .filter(Boolean).join(', ');
        const penalties = Object.keys(h.penalties || {});
        return (
          <div key={h.number} className="glass p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] uppercase tracking-widest text-gold/70">Раунд {h.number}</div>
              <div className={cn('text-[11px] font-bold',
                h.minority === 'tie' ? 'text-amber-300' :
                h.minority === 'yes' ? 'text-emerald-300' : 'text-red-300')}>
                {minorityLabel}
              </div>
            </div>
            {asked && (
              <div className="text-[11px] text-muted-foreground mb-2">
                Вопрос задавал: <strong className="text-gold">{asked.display_name}</strong>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-2">
                <div className="text-[10px] text-emerald-300 uppercase tracking-wider mb-1">ДА · {yesIds.length}</div>
                <div className="text-[11px] text-foreground/80 leading-tight">
                  {yesIds.map(id => state.participants.find(p => p.id === id)?.display_name).filter(Boolean).join(', ') || '—'}
                </div>
              </div>
              <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-2">
                <div className="text-[10px] text-red-300 uppercase tracking-wider mb-1">НЕТ · {noIds.length}</div>
                <div className="text-[11px] text-foreground/80 leading-tight">
                  {noIds.map(id => state.participants.find(p => p.id === id)?.display_name).filter(Boolean).join(', ') || '—'}
                </div>
              </div>
            </div>
            {h.eliminated.length > 0 && (
              <div className="mt-2 text-[11px]">
                <span className="text-muted-foreground">Выбыли: </span>
                <span className="text-red-300 font-bold">{eliminatedNames}</span>
              </div>
            )}
            {penalties.length > 0 && (
              <div className="mt-1 text-[10px] text-amber-300/80">
                ⚠️ Штраф 100k за неучастие: {penalties.length} чел.
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ===== Финал =====

function FinishedView({ game }: { game: SuperGame }) {
  const { state } = useStore();
  const winner = game.winner_id ? state.participants.find(p => p.id === game.winner_id) : null;
  return (
    <div className="glass-strong gold-border p-5 text-center">
      <div className="text-3xl mb-2">🏆</div>
      {winner ? (
        <>
          <div className="text-[10px] uppercase tracking-widest text-gold/70">Победитель</div>
          <div className="font-heading text-2xl font-bold text-gradient-gold mt-1">
            {winner.display_name}
          </div>
          <div className="text-sm text-gold mt-2">
            +<Yen amount={game.bank} className="text-gold" iconClass="w-3 h-3" />
          </div>
        </>
      ) : (
        <div className="text-sm text-muted-foreground">Игра завершена.</div>
      )}
    </div>
  );
}

// ===== Зрительские ставки =====

function SpectatorBetsBlock({
  game, min, currentUser, alive,
}: {
  game: SuperGame; min: MinorityState; currentUser: Participant; alive: Participant[];
}) {
  const sb = getSupabase();
  const [onId, setOnId] = useState<string>('');
  const [amount, setAmount] = useState(10000);
  const [busy, setBusy] = useState(false);

  const myBets = min.spectator_bets.filter(b => b.spectator_id === currentUser.id);
  const myTotal = myBets.reduce((s, b) => s + b.amount, 0);

  const place = async () => {
    if (!sb || !onId || amount <= 0 || busy) return;
    setBusy(true);
    const tx = await chargeToTreasury(currentUser.id, amount,
      `Ставка зрителя на «${game.title}»`, `/super-games/${game.id}`);
    if (!tx.ok) { alert(tx.error || 'Ошибка'); setBusy(false); return; }
    const newBet = {
      id: uid('sb'), spectator_id: currentUser.id, on_id: onId,
      amount, created_at: Date.now(),
    };
    const newSpectatorBets = [...min.spectator_bets, newBet];
    await sb.from('super_games').update({
      state: { ...min, spectator_bets: newSpectatorBets },
    }).eq('id', game.id);
    setBusy(false);
    setAmount(10000);
  };

  return (
    <div className="glass p-4">
      <div className="text-[10px] uppercase tracking-widest text-gold/70 mb-2">🎟️ Ставка зрителя на победителя</div>
      <select value={onId} onChange={e => setOnId(e.target.value)} className="input-field mb-2">
        <option value="">— выберите участника —</option>
        {alive.map(p => (
          <option key={p.id} value={p.id}>{p.display_name}</option>
        ))}
      </select>
      <div className="flex items-center gap-2 mb-2">
        <YenIcon className="w-4 h-4" />
        <input type="number" min={1000} step={1000} value={amount}
          onChange={e => setAmount(Math.max(0, Number(e.target.value)))}
          className="input-field font-mono" />
      </div>
      <button onClick={place} disabled={!onId || amount <= 0 || busy} className="btn-primary w-full text-sm">
        {busy ? '...' : 'Поставить'}
      </button>
      {myBets.length > 0 && (
        <div className="mt-3 text-[11px] text-muted-foreground">
          Ваши ставки: {myBets.length} · итого <Yen amount={myTotal} className="text-gold" iconClass="w-3 h-3" />
        </div>
      )}
      <p className="text-[10px] text-muted mt-2">
        Пул ставок зрителей делится между угадавшими победителя пропорционально их ставке.
      </p>
    </div>
  );
}

function SpectatorBetsSummary({ game, min }: { game: SuperGame; min: MinorityState }) {
  const { state } = useStore();
  const totals = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of min.spectator_bets) {
      map.set(b.on_id, (map.get(b.on_id) || 0) + b.amount);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [min.spectator_bets]);
  const total = totals.reduce((s, [, v]) => s + v, 0);
  if (total === 0) return null;
  return (
    <div className="glass p-3">
      <div className="text-[10px] uppercase tracking-widest text-gold/70 mb-2">
        🎟️ Зрительский пул: <Yen amount={total} className="text-gold" iconClass="w-3 h-3" />
      </div>
      <div className="space-y-1.5">
        {totals.map(([pid, v]) => {
          const p = state.participants.find(x => x.id === pid);
          if (!p) return null;
          const pct = total > 0 ? (v / total) * 100 : 0;
          return (
            <div key={pid} className="relative">
              <div className="absolute inset-y-0 left-0 bg-gold/10 rounded-md" style={{ width: `${pct}%` }} />
              <div className="relative flex items-center justify-between text-[11px] py-1.5 px-2">
                <span className="font-bold">{p.display_name}</span>
                <span className="text-gold font-mono">{v.toLocaleString('ru-RU')}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// АДМИН-ПАНЕЛЬ
// =============================================================================

function MinorityAdminPanel({
  game, min, alive,
}: { game: SuperGame; min: MinorityState; alive: Participant[] }) {
  const { state } = useStore();
  const sb = getSupabase();
  const [duration, setDuration] = useState(600);
  const [pendingAskerId, setPendingAskerId] = useState<string | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState('');
  const [busy, setBusy] = useState(false);

  const pickAsker = (id: string) => setPendingAskerId(id);

  const openRoundWithAsker = async () => {
    if (!pendingAskerId) return;
    await startRound(pendingAskerId, pendingQuestion.trim() || null);
    setPendingAskerId(null);
    setPendingQuestion('');
  };

  // ---- старт игры ----
  const startGame = async () => {
    if (!sb || busy) return;
    const ids = game.participant_ids || [];
    if (ids.length < 2) { alert('Минимум 2 участника'); return; }

    const fee = game.entry_fee || 100000;
    const lowFunds = ids
      .map(id => state.participants.find(p => p.id === id))
      .filter((p): p is Participant => !!p)
      .filter(p => p.balance < fee);

    if (lowFunds.length > 0) {
      const list = lowFunds.map(p => `• ${p.display_name} (${p.balance.toLocaleString('ru-RU')} ейн)`).join('\n');
      const ok = confirm(
        `Недостаточно средств у:\n${list}\n\n` +
        `Стартовать всё равно? Они уйдут в долг Казне.`
      );
      if (!ok) return;
    }

    setBusy(true);
    const fee_paid: Record<string, number> = {};
    let totalBank = 0;
    for (const id of ids) {
      const tx = await chargeToTreasury(id, fee, `Взнос в банк: ${game.title}`, `/super-games/${game.id}`);
      if (tx.ok) { fee_paid[id] = fee; totalBank += fee; }
    }

    const newState: MinorityState = {
      alive_ids: [...ids],
      fee_paid,
      round: null,
      history: [],
      spectator_bets: min.spectator_bets || [],
    };
    await sb.from('super_games').update({
      status: 'live',
      bank: totalBank,
      state: newState,
    }).eq('id', game.id);
    await sb.from('events').insert({
      id: uid('ev'), type: 'big_game_start',
      title: `Старт: ${game.title}`,
      link_url: `/super-games/${game.id}`, is_for_gm_only: false,
    });
    setBusy(false);
  };

  // ---- открытие нового раунда ----
  const startRound = async (askedId: string, question?: string | null) => {
    if (!sb) return;
    const number = (min.history?.length || 0) + 1;
    const round: MinorityRound = {
      number,
      asked_id: askedId,
      started_at: new Date().toISOString(),
      duration_sec: duration,
      votes: {},
      status: 'open',
      question: question ?? null,
    };
    await sb.from('super_games').update({
      state: { ...min, round },
    }).eq('id', game.id);
  };

  const pickRandomAlive = () => {
    if (alive.length === 0) return;
    const choice = alive[Math.floor(Math.random() * alive.length)];
    if (confirm(`Выбран: ${choice.display_name}. Открыть раунд?`)) {
      startRound(choice.id);
    }
  };

  // ---- закрытие раунда + расчёт ----
  const closeRoundCore = async (silent: boolean) => {
    if (!sb || !min.round) return;
    if (!silent && !confirm('Закрыть раунд и подвести итоги?')) return;
    setBusy(true);

    const round = min.round;
    const votes = round.votes;
    let yesCount = 0, noCount = 0;
    for (const v of Object.values(votes)) {
      if (v === 'yes') yesCount++;
      else if (v === 'no') noCount++;
    }
    let minority: 'yes' | 'no' | 'tie';
    if (yesCount === noCount) minority = 'tie';
    else minority = yesCount < noCount ? 'yes' : 'no';

    // Кто не голосовал среди живых — штраф 100k в банк, и они выбывают.
    const aliveIds = min.alive_ids;
    const fee = game.entry_fee || 100000;
    const penalties: Record<string, number> = {};
    const eliminated: string[] = [];
    let bankAdd = 0;

    for (const aid of aliveIds) {
      const v = votes[aid];
      if (!v) {
        // Не проголосовал → штраф + выбыл
        const tx = await chargeToTreasury(aid, fee,
          `Штраф за неучастие · Раунд ${round.number}: ${game.title}`,
          `/super-games/${game.id}`);
        if (tx.ok) {
          penalties[aid] = fee;
          bankAdd += fee;
          eliminated.push(aid);
        }
      }
    }

    // Из проголосовавших — выбывают те, кто в большинстве (если не ничья).
    if (minority !== 'tie') {
      const majorityChoice = minority === 'yes' ? 'no' : 'yes';
      for (const [pid, choice] of Object.entries(votes)) {
        if (!aliveIds.includes(pid)) continue;
        if (choice === majorityChoice) {
          if (!eliminated.includes(pid)) eliminated.push(pid);
        }
      }
    }

    const newAlive = aliveIds.filter(id => !eliminated.includes(id));
    const historyEntry: MinorityHistoryEntry = {
      number: round.number,
      asked_id: round.asked_id,
      votes,
      minority,
      eliminated,
      penalties,
    };

    const newState: MinorityState = {
      ...min,
      alive_ids: newAlive,
      round: null,
      history: [...(min.history || []), historyEntry],
    };

    await sb.from('super_games').update({
      bank: (game.bank || 0) + bankAdd,
      state: newState,
    }).eq('id', game.id);

    setBusy(false);
  };

  const closeRound = async () => closeRoundCore(false);
  const closeRoundSilent = async () => closeRoundCore(true);

  // Автозакрытие: если все живые проголосовали — закрываем раунд тихо.
  // Любой клиент, заметивший 100% — попытается закрыть; повторные попытки
  // отсекутся, потому что round обнулится сразу после первого update.
  const round = min.round;
  const aliveCount = (min.alive_ids ?? []).length;
  const votedCount = round ? (min.alive_ids ?? []).filter(id => round.votes[id]).length : 0;
  useEffect(() => {
    if (!round || round.status !== 'open') return;
    if (aliveCount === 0) return;
    if (votedCount >= aliveCount) {
      // Не ждём подтверждения, не показываем confirm.
      closeRoundSilent();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round?.number, votedCount, aliveCount]);

  // ---- объявить победителя ----
  const declareWinner = async (winnerId: string) => {
    if (!sb) return;
    if (!confirm(`Объявить ${state.participants.find(p => p.id === winnerId)?.display_name} победителем? Банк уйдёт ему.`)) return;
    setBusy(true);
    const bank = game.bank || 0;
    if (bank > 0) {
      await payoutFromTreasury(winnerId, bank, `Победа в «${game.title}»`, `/super-games/${game.id}`);
    }
    // Распределение зрительских ставок
    await resolveSpectatorBets(game, min, winnerId);

    await sb.from('super_games').update({
      status: 'finished',
      winner_id: winnerId,
      bank: 0,
    }).eq('id', game.id);
    await sb.from('events').insert({
      id: uid('ev'), type: 'big_game_end',
      title: `Победа в «${game.title}»: ${state.participants.find(p => p.id === winnerId)?.display_name}`,
      link_url: `/super-games/${game.id}`, is_for_gm_only: false,
    });
    setBusy(false);
  };

  // ---- аннулирование игры ----
  const cancelGame = async () => {
    if (!sb) return;
    if (!confirm('Аннулировать игру? Все взносы вернутся участникам, зрительские ставки вернутся.')) return;
    setBusy(true);
    for (const [pid, fee] of Object.entries(min.fee_paid || {})) {
      if (fee > 0) await payoutFromTreasury(pid, fee, `Возврат взноса: ${game.title}`, `/super-games/${game.id}`);
    }
    for (const sBet of min.spectator_bets || []) {
      await payoutFromTreasury(sBet.spectator_id, sBet.amount,
        `Возврат ставки зрителя: ${game.title}`, `/super-games/${game.id}`);
    }
    await sb.from('super_games').update({
      status: 'cancelled',
      bank: 0,
    }).eq('id', game.id);
    setBusy(false);
  };

  // ====== RENDER ======

  if (game.status === 'scheduled') {
    return (
      <AdminBox>
        <button onClick={startGame} disabled={busy} className="btn-success w-full">
          🚀 Начать игру (списать взнос {(game.entry_fee || 100000).toLocaleString('ru-RU')} с каждого)
        </button>
      </AdminBox>
    );
  }
  if (game.status === 'finished' || game.status === 'cancelled') return null;

  // status === 'live'
  return (
    <AdminBox>
      <div className="text-[10px] uppercase tracking-widest text-gold/70">⚙️ Управление раундом</div>

      {!min.round && alive.length > 1 && (
        <>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-gold mb-1 block">
              Длительность раунда
            </label>
            <div className="grid grid-cols-4 gap-1.5 mb-2">
              {[300, 600, 900, 1200].map(s => (
                <button key={s} onClick={() => setDuration(s)}
                  className={cn('px-2 py-2 text-xs rounded-lg border',
                    duration === s ? 'bg-gold/15 border-gold/50 text-gold' : 'bg-card/40 border-white/8')}>
                  {s / 60} мин
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-gold mb-1 block">
              Кто задаёт вопрос
            </label>
            <div className="grid grid-cols-2 gap-1">
              {alive.map(p => (
                <button key={p.id} onClick={() => pickAsker(p.id)}
                  className={cn('flex items-center gap-1.5 px-2 py-2 rounded-lg border text-xs text-left',
                    pendingAskerId === p.id ? 'bg-gold/15 border-gold/50 text-gold' : 'bg-card/40 border-white/8')}>
                  <CharacterIcon participant={p} size="xs" ringless />
                  <span className="truncate">{p.display_name}</span>
                </button>
              ))}
            </div>
            <button onClick={() => pickAsker(alive[Math.floor(Math.random() * alive.length)].id)}
              className="text-[10px] text-gold/80 mt-1">🎲 Случайно</button>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-gold mb-1 block">
              Текст вопроса (видно всем во время таймера)
            </label>
            <textarea
              value={pendingQuestion}
              onChange={e => setPendingQuestion(e.target.value)}
              placeholder="«Вы хотя бы раз бросали человека в опасности?»"
              rows={2}
              className="input-field text-sm resize-none"
            />
          </div>
          <button onClick={openRoundWithAsker} disabled={!pendingAskerId} className="btn-primary w-full">
            ▶ Открыть раунд {pendingAskerId ? '' : '(выберите игрока)'}
          </button>
        </>
      )}

      {min.round && min.round.status === 'open' && (
        <>
          <NotVotedList min={min} alive={alive} />
          <button onClick={closeRound} disabled={busy} className="btn-danger w-full">
            🔴 Закрыть раунд и подвести итог
          </button>
        </>
      )}

      {alive.length === 1 && !min.round && (
        <button onClick={() => declareWinner(alive[0].id)} disabled={busy} className="btn-success w-full">
          🏆 Объявить победителем: {alive[0].display_name}
        </button>
      )}

      {alive.length > 1 && (
        <details className="text-xs mt-2">
          <summary className="cursor-pointer text-muted-foreground py-1">…или назначить победителя вручную</summary>
          <div className="grid grid-cols-2 gap-1 mt-1">
            {alive.map(p => (
              <button key={p.id} onClick={() => declareWinner(p.id)}
                className="px-2 py-2 text-xs rounded-lg bg-emerald-500/10 border border-emerald-500/30 active:bg-emerald-500/20">
                🏆 {p.display_name}
              </button>
            ))}
          </div>
        </details>
      )}

      <button onClick={cancelGame} className="btn-danger w-full text-xs mt-2">
        🚫 Аннулировать игру (вернуть взносы)
      </button>
    </AdminBox>
  );
}

function NotVotedList({ min, alive }: { min: MinorityState; alive: Participant[] }) {
  if (!min.round) return null;
  const notVoted = alive.filter(p => !min.round!.votes[p.id]);
  if (notVoted.length === 0) {
    return (
      <div className="text-[11px] text-emerald-300">✅ Все живые проголосовали — можно закрывать раунд.</div>
    );
  }
  return (
    <div className="text-[11px] text-muted-foreground">
      <div className="mb-1">⏳ Ждём ({notVoted.length}):</div>
      <div className="text-amber-300 leading-tight">
        {notVoted.map(p => p.display_name).join(', ')}
      </div>
    </div>
  );
}

function AdminBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="glass-strong gold-border p-4 space-y-3">
      {children}
    </div>
  );
}

// ===== Распределение зрительских ставок =====
async function resolveSpectatorBets(game: SuperGame, min: MinorityState, winnerId: string) {
  const total = min.spectator_bets.reduce((s, b) => s + b.amount, 0);
  if (total === 0) return;
  const winners = min.spectator_bets.filter(b => b.on_id === winnerId);
  const winningTotal = winners.reduce((s, b) => s + b.amount, 0);
  if (winningTotal === 0) {
    // Никто не угадал — возврат всем
    for (const b of min.spectator_bets) {
      await payoutFromTreasury(b.spectator_id, b.amount,
        `Зрительская ставка возвращена · ${game.title}`, `/super-games/${game.id}`);
    }
    return;
  }
  for (const b of winners) {
    const payout = Math.floor((b.amount / winningTotal) * total);
    if (payout > 0) {
      await payoutFromTreasury(b.spectator_id, payout,
        `Выигрыш зрителя · ${game.title}`, `/super-games/${game.id}`);
    }
  }
}


function PersonalRoundResultBanner({ min, currentUser }: { min: MinorityState; currentUser: Participant }) {
  const last = min.history[min.history.length - 1];
  if (!last) return null;
  const wasAlive = last.eliminated.includes(currentUser.id) ||
    Object.keys(last.votes).includes(currentUser.id);
  if (!wasAlive) return null;
  const survived = !last.eliminated.includes(currentUser.id) &&
    min.alive_ids.includes(currentUser.id);
  if (survived) {
    return (
      <div className="glass-strong p-5 text-center border border-emerald-500/40 bg-emerald-500/5">
        <div className="text-3xl">✓</div>
        <div className="font-heading text-xl font-bold text-emerald-200 mt-1">Вы прошли в следующий раунд</div>
        <div className="text-[11px] text-muted-foreground mt-1">Раунд {last.number} закрыт.</div>
      </div>
    );
  }
  return (
    <div className="glass-strong p-5 text-center border border-red-500/40 bg-red-500/5">
      <div className="text-3xl">✕</div>
      <div className="font-heading text-xl font-bold text-red-300 mt-1">Вы выбыли из игры</div>
      <div className="text-[11px] text-muted-foreground mt-1">Раунд {last.number}. Можете остаться зрителем.</div>
    </div>
  );
}

function RoundSurvivorsBlock({ game, min, alive }: { game: SuperGame; min: MinorityState; alive: Participant[] }) {
  const { state } = useStore();
  const last = min.history[min.history.length - 1];
  if (!last) return null;
  const eliminated = last.eliminated.map(id => state.participants.find(p => p.id === id)).filter(Boolean) as Participant[];
  return (
    <div className="glass p-4 space-y-3">
      <div>
        <div className="text-[10px] uppercase tracking-widest text-emerald-300/80 mb-1">
          ✓ Прошли в следующий раунд · {alive.length}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {alive.map(p => (
            <div key={p.id} className="flex items-center gap-1.5 p-1.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-xs">
              <CharacterIcon participant={p} size="xs" ringless />
              <span className="truncate">{p.display_name}</span>
            </div>
          ))}
        </div>
      </div>
      {eliminated.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-red-300/80 mb-1">
            ✕ Выбыли в раунде {last.number} · {eliminated.length}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {eliminated.map(p => (
              <div key={p.id} className="flex items-center gap-1.5 p-1.5 rounded-lg bg-red-500/5 border border-red-500/20 text-xs">
                <CharacterIcon participant={p} size="xs" ringless />
                <span className="truncate text-red-200/80">{p.display_name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
