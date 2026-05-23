'use client';

// «Испытание кандидата в Элиту» — упрощённый MVP.
// Кандидат получает фонд 1M, выдаёт 3 приказа, потом — голосование.
// Цель: вернуть фонд ≥ 1.2M (или 1.3M в harsh).

import { useState } from 'react';
import { useStore, uid } from '@/lib/store/StoreProvider';
import { CharacterIcon } from '@/components/ui/CharacterIcon';
import { Yen } from '@/components/ui/Yen';
import { cn, isPlayer } from '@/lib/utils';
import { getSupabase } from '@/lib/supabase/client';
import { applyTransfer, chargeToTreasury, payoutFromTreasury, TREASURY_ID } from '@/lib/store/tx';
import {
  CANDIDATE_FUND_INITIAL, CANDIDATE_TOTAL_ROUNDS,
  ORDER_META, ORDER_COLLECT_AMOUNT, ORDER_RISKY_INVEST,
  ORDER_LOYALTY_BRIBE, ORDER_PUNISH_AMOUNT, ORDER_PROTECT_COST,
  rollRiskyDeal, returnGoalFor, failPenaltyFor,
  type CandidateOrderType, type CandidateTrialDifficulty,
} from '@/lib/elitecandidate/logic';
import type { SuperGame, Participant } from '@/lib/store/types';

interface CandidateState {
  candidate_id: string;
  examiner_id: string;
  participant_ids: string[];
  difficulty: CandidateTrialDifficulty;
  fund_amount: number;
  current_round: number;
  used_orders: CandidateOrderType[];
  round_log: Array<{
    round: number;
    order: CandidateOrderType;
    description: string;
    fund_after: number;
    created_at: string;
  }>;
  votes: Record<string, 'recognize' | 'reject'>;
  status: 'scheduled' | 'active' | 'final_vote' | 'finished' | 'cancelled';
  result?: 'candidate_approved' | 'candidate_failed' | null;
  promoted_to_elite?: boolean;
}

function getState(g: SuperGame): CandidateState {
  const s = (g.state || {}) as Partial<CandidateState>;
  return {
    candidate_id: s.candidate_id ?? '',
    examiner_id: s.examiner_id ?? 'p-queen',
    participant_ids: s.participant_ids ?? [],
    difficulty: s.difficulty ?? 'normal',
    fund_amount: s.fund_amount ?? CANDIDATE_FUND_INITIAL,
    current_round: s.current_round ?? 0,
    used_orders: s.used_orders ?? [],
    round_log: s.round_log ?? [],
    votes: s.votes ?? {},
    status: s.status ?? 'scheduled',
    result: s.result ?? null,
    promoted_to_elite: s.promoted_to_elite ?? false,
  };
}

async function patchState(gameId: string, patch: Partial<CandidateState>) {
  const sb = getSupabase();
  if (!sb) return;
  const { data } = await sb.from('super_games').select('state').eq('id', gameId).single();
  const cur = (data?.state ?? {}) as CandidateState;
  await sb.from('super_games').update({ state: { ...cur, ...patch } }).eq('id', gameId);
}

async function pushEvent(title: string, body: string | undefined, link: string) {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from('events').insert({
    id: 'ev-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
    type: 'candidate_trial',
    title, body: body ?? null, link_url: link, is_for_gm_only: false,
  });
}

export function EliteCandidateTrialRoom({ game }: { game: SuperGame }) {
  const { state, currentUser, role } = useStore();
  const isAdmin = role === 'gm' || role === 'queen';
  const cs = getState(game);
  const candidate = state.participants.find(p => p.id === cs.candidate_id);
  const isCandidate = !!currentUser && currentUser.id === cs.candidate_id;
  const isParticipant = !!currentUser && cs.participant_ids.includes(currentUser.id);
  const link = `/super-games/${game.id}`;

  const goal = returnGoalFor(cs.difficulty);
  const finished = cs.status === 'finished' || cs.status === 'cancelled';

  return (
    <div className="space-y-3">
      <Header game={game} cs={cs} candidate={candidate ?? null} goal={goal} />

      {/* Текущий приказ */}
      {cs.status === 'active' && (isCandidate || isAdmin) && (
        <OrderPicker game={game} cs={cs} />
      )}

      {/* Лог раундов */}
      {cs.round_log.length > 0 && (
        <div className="glass p-3 space-y-2">
          <div className="text-[10px] uppercase tracking-widest text-gold/70">Лог приказов</div>
          {cs.round_log.map((r, i) => (
            <div key={i} className="text-xs p-2 rounded bg-card/40">
              <div className="font-bold">{ORDER_META[r.order].emoji} Раунд {r.round}: {ORDER_META[r.order].title}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{r.description}</div>
              <div className="text-[10px] mt-0.5">
                Фонд после: <Yen amount={r.fund_after} className="inline text-gold" iconClass="w-3 h-3" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Финальное голосование */}
      {cs.status === 'final_vote' && (isParticipant || isAdmin) && (
        <FinalVote game={game} cs={cs} />
      )}

      {finished && cs.result && (
        <FinalView cs={cs} candidate={candidate ?? null} />
      )}

      {isAdmin && !finished && (
        <AdminPanel game={game} cs={cs} />
      )}
    </div>
  );
}

function Header({
  game, cs, candidate, goal,
}: { game: SuperGame; cs: CandidateState; candidate: Participant | null; goal: number }) {
  const fundProgress = Math.min(100, (cs.fund_amount / goal) * 100);
  return (
    <div className="glass-strong gold-border p-4">
      <div className="flex items-start gap-3">
        <div className="text-3xl">👑</div>
        <div className="flex-1">
          <div className="text-[10px] uppercase tracking-widest text-gold/70">Испытание кандидата</div>
          <div className="font-heading text-lg font-bold text-gradient-gold">
            {(candidate?.display_name ?? cs.candidate_id) || 'Кандидат не выбран'}
          </div>
          <div className="text-[10px] text-muted-foreground">
            Сложность: <b>{cs.difficulty === 'harsh' ? 'жёсткая' : 'обычная'}</b> · Раунд {cs.current_round}/{CANDIDATE_TOTAL_ROUNDS}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-center">
        <div className="p-2 rounded-xl bg-card/40">
          <div className="text-[10px] text-muted-foreground">Фонд</div>
          <Yen amount={cs.fund_amount} className="text-base text-gold" iconClass="w-4 h-4" />
        </div>
        <div className="p-2 rounded-xl bg-card/40">
          <div className="text-[10px] text-muted-foreground">Цель</div>
          <Yen amount={goal} className="text-base text-emerald-300" iconClass="w-4 h-4" />
        </div>
      </div>
      <div className="mt-2 h-2 rounded-full bg-card/60 overflow-hidden">
        <div className={cn('h-full transition-all',
          cs.fund_amount >= goal
            ? 'bg-gradient-to-r from-emerald-500 to-emerald-300'
            : 'bg-gradient-to-r from-gold-light to-gold-dark')}
          style={{ width: `${fundProgress}%` }} />
      </div>
    </div>
  );
}

function OrderPicker({ game, cs }: { game: SuperGame; cs: CandidateState }) {
  const [chosen, setChosen] = useState<CandidateOrderType | null>(null);
  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase tracking-widest text-gold/70">
        Раунд {cs.current_round + 1}: выберите приказ
      </div>
      <div className="grid grid-cols-1 gap-1.5">
        {(Object.keys(ORDER_META) as CandidateOrderType[]).map(type => {
          const meta = ORDER_META[type];
          const used = cs.used_orders.includes(type);
          const active = chosen === type;
          return (
            <button key={type} disabled={used}
              onClick={() => setChosen(type)}
              className={cn(
                'px-3 py-3 rounded-xl text-left border',
                used
                  ? 'bg-card/20 border-white/5 opacity-40'
                  : active
                    ? 'bg-gold/15 border-gold/50 text-gold'
                    : 'bg-card/40 border-white/8 active:bg-white/5',
              )}>
              <div className="text-sm font-bold">{meta.emoji} {meta.title}{used && ' (использовано)'}</div>
              <div className="text-[11px] text-muted-foreground">{meta.short}</div>
            </button>
          );
        })}
      </div>
      {chosen && (
        <OrderResolve game={game} cs={cs} order={chosen} onClose={() => setChosen(null)} />
      )}
    </div>
  );
}

function OrderResolve({
  game, cs, order, onClose,
}: { game: SuperGame; cs: CandidateState; order: CandidateOrderType; onClose: () => void }) {
  const { state } = useStore();
  const meta = ORDER_META[order];
  const link = `/super-games/${game.id}`;
  const candidates = state.participants.filter(p => cs.participant_ids.includes(p.id));
  const [target1, setTarget1] = useState('');
  const [target2, setTarget2] = useState('');
  const [busy, setBusy] = useState(false);

  const finishRound = async (description: string, fundDelta: number) => {
    const newFund = cs.fund_amount + fundDelta;
    const newRound = cs.current_round + 1;
    const newLog = [...cs.round_log, {
      round: newRound,
      order,
      description,
      fund_after: newFund,
      created_at: new Date().toISOString(),
    }];
    const newUsed = [...cs.used_orders, order];
    const isLast = newRound >= CANDIDATE_TOTAL_ROUNDS;
    await patchState(game.id, {
      fund_amount: newFund,
      current_round: newRound,
      used_orders: newUsed,
      round_log: newLog,
      status: isLast ? 'final_vote' : 'active',
    });
    await pushEvent(`Приказ: ${meta.title}`, description, link);
    onClose();
  };

  const apply = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (order === 'collect_contribution') {
        if (!target1 || !target2 || target1 === target2) { alert('Выберите 2 разных игроков'); return; }
        let collected = 0;
        for (const id of [target1, target2]) {
          const tx = await applyTransfer(id, TREASURY_ID, ORDER_COLLECT_AMOUNT,
            `Сбор взноса для кандидата ${cs.candidate_id}`, link);
          if (tx.ok) collected += ORDER_COLLECT_AMOUNT;
        }
        const t1 = state.participants.find(p => p.id === target1)?.display_name ?? target1;
        const t2 = state.participants.find(p => p.id === target2)?.display_name ?? target2;
        await finishRound(`Сбор взноса с ${t1} и ${t2}: +${collected.toLocaleString('ru-RU')} в фонд`, +collected);
      }
      else if (order === 'risky_deal') {
        if (cs.fund_amount < ORDER_RISKY_INVEST) { alert('Недостаточно средств в фонде'); return; }
        const r = rollRiskyDeal();
        await finishRound(
          r.success
            ? `Рискованная сделка: УСПЕХ. Фонд +${ORDER_RISKY_REWARD_DELTA(r.fundDelta)}`
            : `Рискованная сделка: ПРОВАЛ. Фонд −${ORDER_RISKY_INVEST.toLocaleString('ru-RU')}`,
          r.fundDelta,
        );
      }
      else if (order === 'loyalty_check') {
        if (!target1) { alert('Выберите игрока'); return; }
        if (cs.fund_amount < ORDER_LOYALTY_BRIBE) { alert('Недостаточно средств в фонде'); return; }
        const choice = confirm(`Игрок принимает 100k? (OK = принял, Cancel = отказался)`);
        const t1 = state.participants.find(p => p.id === target1)?.display_name ?? target1;
        if (choice) {
          await payoutFromTreasury(target1, ORDER_LOYALTY_BRIBE,
            `Проверка верности: подкуп от кандидата ${cs.candidate_id}`, link);
          await finishRound(`${t1} принял 100k. Метка «куплен».`, -ORDER_LOYALTY_BRIBE);
        } else {
          await finishRound(`${t1} отказался от 100k. +10 репутации (вручную ведущим).`, 0);
        }
      }
      else if (order === 'punish_debtor') {
        if (!target1) { alert('Выберите должника'); return; }
        const paid = confirm(`Должник заплатил 100k? (OK = да, Cancel = отказался)`);
        const t1 = state.participants.find(p => p.id === target1)?.display_name ?? target1;
        if (paid) {
          await applyTransfer(target1, TREASURY_ID, ORDER_PUNISH_AMOUNT,
            `Наказание должника от кандидата`, link);
          await finishRound(`${t1} заплатил 100k. Долг −100k (применить вручную).`, +ORDER_PUNISH_AMOUNT);
        } else {
          await finishRound(`${t1} отказался платить. Долг +20%, репутация −10 (вручную).`, 0);
        }
      }
      else if (order === 'protect_ally') {
        if (!target1) { alert('Выберите союзника'); return; }
        if (cs.fund_amount < ORDER_PROTECT_COST) { alert('Недостаточно средств в фонде'); return; }
        const t1 = state.participants.find(p => p.id === target1)?.display_name ?? target1;
        await chargeToTreasury(cs.candidate_id, ORDER_PROTECT_COST,
          `Защита союзника ${t1}`, link).catch(() => {});
        await finishRound(`Защищён ${t1}: метка protected_this_round, штраф до 150k будет покрыт фондом (вручную).`, -ORDER_PROTECT_COST);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass p-3 border border-amber-500/30 bg-amber-500/5 space-y-2">
      <div className="text-[11px] text-amber-300">{meta.rules}</div>
      {(order === 'collect_contribution') && (
        <div className="grid grid-cols-2 gap-2">
          <select className="input-field text-xs" value={target1} onChange={e => setTarget1(e.target.value)}>
            <option value="">— игрок 1 —</option>
            {candidates.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
          </select>
          <select className="input-field text-xs" value={target2} onChange={e => setTarget2(e.target.value)}>
            <option value="">— игрок 2 —</option>
            {candidates.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
          </select>
        </div>
      )}
      {(order === 'loyalty_check' || order === 'punish_debtor' || order === 'protect_ally') && (
        <select className="input-field text-xs" value={target1} onChange={e => setTarget1(e.target.value)}>
          <option value="">— цель —</option>
          {candidates.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
        </select>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={onClose} className="btn-secondary text-xs">Отмена</button>
        <button onClick={apply} disabled={busy} className="btn-primary text-xs">
          {busy ? '...' : 'Применить приказ'}
        </button>
      </div>
    </div>
  );
}

function ORDER_RISKY_REWARD_DELTA(d: number): string {
  return d.toLocaleString('ru-RU');
}

function FinalVote({ game, cs }: { game: SuperGame; cs: CandidateState }) {
  const { currentUser } = useStore();
  const sb = getSupabase();
  if (!currentUser) return null;
  const myVote = cs.votes[currentUser.id];
  const totalVoters = cs.participant_ids.length;
  const votedCount = Object.keys(cs.votes).length;

  const vote = async (v: 'recognize' | 'reject') => {
    if (!sb) return;
    await patchState(game.id, {
      votes: { ...cs.votes, [currentUser.id]: v },
    });
  };

  return (
    <div className="glass-strong gold-border p-4 space-y-2">
      <div className="text-[10px] uppercase tracking-widest text-gold/70">Финальное голосование</div>
      <div className="text-xs text-muted-foreground">
        Признать кандидата подходящим для повышения в Элиту?
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => vote('recognize')} disabled={!!myVote}
          className={cn('px-3 py-3 rounded-xl border text-sm font-bold',
            myVote === 'recognize'
              ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
              : 'bg-card/40 border-white/8')}>
          ✓ Признать
        </button>
        <button onClick={() => vote('reject')} disabled={!!myVote}
          className={cn('px-3 py-3 rounded-xl border text-sm font-bold',
            myVote === 'reject'
              ? 'bg-red-500/15 border-red-500/50 text-red-300'
              : 'bg-card/40 border-white/8')}>
          ✕ Не признать
        </button>
      </div>
      <div className="text-[10px] text-muted-foreground text-center">
        Проголосовало: {votedCount}/{totalVoters}
      </div>
    </div>
  );
}

function FinalView({ cs, candidate }: { cs: CandidateState; candidate: Participant | null }) {
  const ok = cs.result === 'candidate_approved';
  return (
    <div className={cn('glass-strong p-5 text-center space-y-2',
      ok ? 'gold-border' : 'border border-red-500/40')}>
      <div className="text-3xl">{ok ? '👑' : '💀'}</div>
      <div className="text-base font-bold">
        {ok ? `${candidate?.display_name} прошёл испытание!` : `${candidate?.display_name} провалил испытание`}
      </div>
      <div className="text-[11px] text-muted-foreground">
        {ok
          ? '+25 репутации, право на повышение в Элиту (Селестия подтверждает кнопкой).'
          : `Штраф ${failPenaltyFor(cs.difficulty).toLocaleString('ru-RU')} ¥, репутация −15 (вручную).`}
      </div>
    </div>
  );
}

function AdminPanel({ game, cs }: { game: SuperGame; cs: CandidateState }) {
  const { state } = useStore();
  const sb = getSupabase();
  const [busy, setBusy] = useState(false);
  const [candidateId, setCandidateId] = useState(cs.candidate_id);
  const [participants, setParticipants] = useState<string[]>(cs.participant_ids);
  const [difficulty, setDifficulty] = useState<CandidateTrialDifficulty>(cs.difficulty);

  const players = state.participants.filter(p => isPlayer(p) && p.is_active);
  const link = `/super-games/${game.id}`;

  const startGame = async () => {
    if (!candidateId || participants.length < 3) {
      alert('Выберите кандидата и минимум 3 участников');
      return;
    }
    if (!sb) return;
    setBusy(true);
    // Выдать фонд из Казны кандидату — чисто для отслеживания, фактически фонд считается в state
    await patchState(game.id, {
      candidate_id: candidateId,
      participant_ids: participants,
      difficulty,
      fund_amount: CANDIDATE_FUND_INITIAL,
      current_round: 0,
      used_orders: [],
      round_log: [],
      votes: {},
      status: 'active',
    });
    await sb.from('super_games').update({ status: 'live' }).eq('id', game.id);
    await pushEvent('Испытание кандидата началось',
      `Кандидат: ${state.participants.find(p => p.id === candidateId)?.display_name}, фонд ${CANDIDATE_FUND_INITIAL.toLocaleString('ru-RU')} ¥`,
      link);
    setBusy(false);
  };

  const finalize = async () => {
    if (!sb) return;
    const goal = returnGoalFor(cs.difficulty);
    const reach = cs.fund_amount >= goal;
    const reject = Object.values(cs.votes).filter(v => v === 'reject').length;
    const recognize = Object.values(cs.votes).filter(v => v === 'recognize').length;
    const majorityReject = reject > recognize;
    const ok = reach && !majorityReject;
    const result = ok ? 'candidate_approved' : 'candidate_failed';
    if (!ok) {
      // Штраф кандидату
      const penalty = failPenaltyFor(cs.difficulty);
      await chargeToTreasury(cs.candidate_id, penalty,
        `Провал испытания кандидата`, link).catch(() => {});
    }
    await patchState(game.id, { status: 'finished', result });
    await sb.from('super_games').update({ status: 'finished' }).eq('id', game.id);
    await pushEvent(
      ok ? 'Кандидат одобрен' : 'Кандидат провалил испытание',
      ok ? '+25 репутации, право на Элиту.' : 'Штраф и репутация −15.',
      link,
    );
  };

  if (cs.status === 'scheduled') {
    return (
      <div className="glass-strong gold-border p-4 space-y-2">
        <div className="text-[10px] uppercase tracking-widest text-gold/70">⚙️ Настройка</div>
        <div>
          <label className="text-[10px] text-muted-foreground">Кандидат</label>
          <select className="input-field text-xs"
            value={candidateId} onChange={e => setCandidateId(e.target.value)}>
            <option value="">— выбрать —</option>
            {players.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground">Сложность</label>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setDifficulty('normal')}
              className={cn('p-2 rounded-lg border text-xs',
                difficulty === 'normal' ? 'bg-gold/15 border-gold/50 text-gold' : 'bg-card/40 border-white/8')}>
              Обычная (вернуть 1.2M)
            </button>
            <button onClick={() => setDifficulty('harsh')}
              className={cn('p-2 rounded-lg border text-xs',
                difficulty === 'harsh' ? 'bg-gold/15 border-gold/50 text-gold' : 'bg-card/40 border-white/8')}>
              Жёсткая (вернуть 1.3M)
            </button>
          </div>
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground">Участники (3–5)</label>
          <div className="max-h-40 overflow-y-auto space-y-1 glass p-2">
            {players.filter(p => p.id !== candidateId).map(p => {
              const checked = participants.includes(p.id);
              return (
                <label key={p.id} className="flex items-center gap-2 p-1 cursor-pointer">
                  <input type="checkbox" checked={checked}
                    onChange={() => {
                      if (checked) setParticipants(participants.filter(x => x !== p.id));
                      else if (participants.length < 5) setParticipants([...participants, p.id]);
                    }}
                    disabled={!checked && participants.length >= 5}
                    className="w-4 h-4 accent-gold" />
                  <CharacterIcon participant={p} size="xs" ringless />
                  <span className="text-xs">{p.display_name}</span>
                </label>
              );
            })}
          </div>
        </div>
        <button onClick={startGame} disabled={busy || !candidateId || participants.length < 3}
          className="btn-primary w-full text-sm">
          ▶ Начать испытание
        </button>
      </div>
    );
  }

  if (cs.status === 'final_vote') {
    return (
      <div className="glass-strong gold-border p-4 space-y-2">
        <div className="text-[10px] uppercase tracking-widest text-gold/70">⚙️ Управление</div>
        <button onClick={finalize} className="btn-primary w-full text-sm">
          🏁 Завершить испытание и применить итог
        </button>
      </div>
    );
  }

  return null;
}
