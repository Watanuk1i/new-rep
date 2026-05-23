'use client';

// /debt-games — отдельная страница «Игры на долг».
// Показывает 6 типов игр, активные сессии и завершённые.
// Логика создания зависит от роли текущего юзера и наличия долга у него/у выбранной цели.

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useStore, uid } from '@/lib/store/StoreProvider';
import { CharacterIcon } from '@/components/ui/CharacterIcon';
import { Yen } from '@/components/ui/Yen';
import { cn, isPlayer } from '@/lib/utils';
import { getSupabase } from '@/lib/supabase/client';
import { applyTransfer } from '@/lib/store/tx';
import {
  KIRUMI_ID, MONDO_ID, PEKO_ID, QUEEN_ID, TREASURY_ID,
} from '@/lib/loans/constants';
import {
  DEBT_GAMES_META, shuffleSeals, applyThreeSeals,
  rollDice2, applyCollectionDice,
  applyBlackNote, applyLastPayment, applyDelayGame,
  shuffleKirumiCards, applyKirumiRansom,
  PET_CANDIDATE_THRESHOLD, LAST_PAYMENT_OPTIONS,
  type ThreeSealsCard, type BlackNoteRisk, type KirumiRansomCard,
} from '@/lib/debtgames/logic';
import type {
  Debt, DebtGame, DebtGameType, DebtGameOpponentType,
} from '@/lib/store/types';

type Tab = 'list' | 'active' | 'history';

export default function DebtGamesPage() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}

function Inner() {
  const { state, currentUser, role } = useStore();
  const sb = getSupabase();
  const isAdmin = role === 'gm' || role === 'queen';
  const [tab, setTab] = useState<Tab>('list');
  const [games, setGames] = useState<DebtGame[]>([]);
  const [creating, setCreating] = useState<DebtGameType | null>(null);

  useEffect(() => {
    if (!sb) return;
    let alive = true;
    const load = async () => {
      const { data } = await sb.from('debt_games')
        .select('*').order('created_at', { ascending: false });
      if (alive) setGames((data ?? []) as DebtGame[]);
    };
    load();
    const ch = sb.channel('debt-games-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'debt_games' }, load)
      .subscribe();
    return () => { alive = false; sb.removeChannel(ch); };
  }, [sb]);

  const myGames = currentUser
    ? games.filter(g => g.debtor_id === currentUser.id || g.opponent_id === currentUser.id)
    : [];

  const activeGames = (isAdmin ? games : myGames)
    .filter(g => g.status !== 'finished' && g.status !== 'cancelled');
  const finishedGames = (isAdmin ? games : myGames)
    .filter(g => g.status === 'finished' || g.status === 'cancelled');

  if (!currentUser) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="text-sm text-muted-foreground mb-4">Войдите, чтобы играть на долг</p>
        <Link href="/login" className="btn-primary inline-flex">Войти</Link>
      </div>
    );
  }

  return (
    <div className="px-3 sm:px-4 py-4 max-w-2xl mx-auto space-y-4 animate-fade-in">
      <div className="glass-strong gold-border p-5">
        <div className="text-[10px] uppercase tracking-widest text-gold/70">⚔️ Игры на долг</div>
        <h1 className="font-heading text-xl font-bold text-gradient-gold mt-1">Сцены вокруг долга</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Долг — не просто число. Кируми предлагает договор, Мондо давит, Пеко фиксирует
          последний шанс. Сайт считает деньги — атмосфера в голосе.
        </p>
      </div>

      <div className="scroll-x">
        {(['list', 'active', 'history'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={cn('tab-pill', tab === t ? 'tab-pill-active' : 'tab-pill-inactive')}>
            <span>{t === 'list' ? '🃏' : t === 'active' ? '🔥' : '📜'}</span>
            <span>
              {t === 'list' ? 'Игры' :
               t === 'active' ? `Активные${activeGames.length ? ` (${activeGames.length})` : ''}` :
               'История'}
            </span>
          </button>
        ))}
      </div>

      {tab === 'list' && (
        <div className="space-y-3">
          {(Object.keys(DEBT_GAMES_META) as DebtGameType[]).map(type => (
            <GameCatalogCard key={type} type={type} onCreate={() => setCreating(type)} />
          ))}
        </div>
      )}

      {tab === 'active' && (
        <div className="space-y-2">
          {activeGames.length === 0 && (
            <div className="glass p-6 text-center text-sm text-muted-foreground">
              Активных игр на долг нет.
            </div>
          )}
          {activeGames.map(g => <ActiveGameCard key={g.id} game={g} />)}
        </div>
      )}

      {tab === 'history' && (
        <div className="space-y-2">
          {finishedGames.length === 0 && (
            <div className="glass p-6 text-center text-sm text-muted-foreground">
              Завершённых игр на долг нет.
            </div>
          )}
          {finishedGames.map(g => <HistoryGameCard key={g.id} game={g} />)}
        </div>
      )}

      {creating && (
        <CreateGameModal type={creating} onClose={() => setCreating(null)} />
      )}
    </div>
  );
}

// =============================================================================
// КАТАЛОГ ИГР
// =============================================================================

function GameCatalogCard({ type, onCreate }: { type: DebtGameType; onCreate: () => void }) {
  const meta = DEBT_GAMES_META[type];
  const [open, setOpen] = useState(false);
  const dangerColor = meta.danger === 'low'
    ? 'text-emerald-300'
    : meta.danger === 'medium'
      ? 'text-amber-300'
      : 'text-red-300';

  return (
    <div className="glass p-4 space-y-2">
      <div className="flex items-start gap-3">
        <div className="text-3xl">{meta.emoji}</div>
        <div className="flex-1 min-w-0">
          <div className="font-heading text-base font-bold">{meta.title}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">{meta.short}</div>
          <div className={cn('text-[10px] uppercase tracking-wider mt-1', dangerColor)}>
            риск: {meta.danger === 'low' ? 'низкий' : meta.danger === 'medium' ? 'средний' : 'высокий'}
          </div>
        </div>
      </div>
      {open && (
        <div className="text-[11px] text-muted-foreground whitespace-pre-line p-2 rounded-lg bg-card/40 border border-white/8">
          {meta.rules}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setOpen(!open)} className="btn-secondary text-xs">
          {open ? 'Скрыть правила' : 'Подробнее'}
        </button>
        <button onClick={onCreate} className="btn-primary text-xs">
          ▶ Создать
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// СОЗДАНИЕ ИГРЫ
// =============================================================================

function CreateGameModal({ type, onClose }: { type: DebtGameType; onClose: () => void }) {
  const { state, currentUser, role } = useStore();
  const sb = getSupabase();
  const isAdmin = role === 'gm' || role === 'queen';
  const meta = DEBT_GAMES_META[type];

  const [debtorId, setDebtorId] = useState<string>(currentUser?.id ?? '');
  const [debtId, setDebtId] = useState<string>('');
  const [opponentType, setOpponentType] = useState<DebtGameOpponentType>('kirumi');
  const [busy, setBusy] = useState(false);

  // Кандидаты в должники: для админа — все игроки с активными долгами; для не-админа — только сам.
  const debtorCandidates = isAdmin
    ? state.participants.filter(p => isPlayer(p) && state.debts.some(d => d.debtor_id === p.id && isOpenDebtStatus(d.status)))
    : currentUser ? [currentUser] : [];

  const debtorDebts = state.debts.filter(d => d.debtor_id === debtorId && isOpenDebtStatus(d.status));
  const selectedDebt = debtorDebts.find(d => d.id === debtId) ?? null;

  // Подбираем opponent по выбранному долгу/типу
  const opponentOptions = useMemo(() => {
    const opts: { value: DebtGameOpponentType; label: string; id: string }[] = [];
    if (selectedDebt) {
      if (selectedDebt.creditor_id === KIRUMI_ID) opts.push({ value: 'kirumi', label: 'Кируми (кредитор)', id: KIRUMI_ID });
      if (selectedDebt.creditor_id === TREASURY_ID) opts.push({ value: 'treasury', label: 'Фонд Тогами', id: TREASURY_ID });
      if (selectedDebt.collector_id === MONDO_ID || selectedDebt.status === 'collection' || selectedDebt.status === 'overdue')
        opts.push({ value: 'mondo', label: 'Мондо (взыскатель)', id: MONDO_ID });
      if (selectedDebt.executor_id === PEKO_ID) opts.push({ value: 'peko', label: 'Пеко (исполнитель)', id: PEKO_ID });
      if (selectedDebt.creditor_id && selectedDebt.creditor_id !== KIRUMI_ID && selectedDebt.creditor_id !== TREASURY_ID) {
        const owner = state.participants.find(p => p.id === selectedDebt.creditor_id);
        opts.push({ value: 'owner', label: `Владелец: ${owner?.display_name ?? selectedDebt.creditor_id}`, id: selectedDebt.creditor_id });
      }
    }
    // Селестия всегда доступна как «верхняя инстанция»
    opts.push({ value: 'celestia', label: 'Селестия (утверждение)', id: QUEEN_ID });
    return opts;
  }, [selectedDebt, state.participants]);

  const create = async () => {
    if (!sb || !currentUser) return;
    if (!debtorId) { alert('Выберите должника'); return; }
    if (!selectedDebt) { alert('Выберите долг'); return; }
    const opp = opponentOptions.find(o => o.value === opponentType);
    if (!opp) { alert('Сторона недоступна для этого долга'); return; }
    setBusy(true);
    const id = uid('dg');
    const initialAmount = selectedDebt.amount;
    let initialState: Record<string, any> = {};
    if (type === 'three_seals' || type === 'kirumi_ransom_table') {
      initialState = { cards: type === 'three_seals' ? shuffleSeals() : shuffleKirumiCards(), revealed_idx: null };
    }
    await sb.from('debt_games').insert({
      id, type, status: isAdmin ? 'active' : 'waiting_approval',
      debt_id: selectedDebt.id,
      debtor_id: debtorId,
      opponent_type: opponentType,
      opponent_id: opp.id,
      initial_debt_amount: initialAmount,
      state: initialState,
      requires_approval: false,
      rules_snapshot: meta.rules,
    });
    // Уведомления
    const notes: any[] = [];
    if (debtorId !== currentUser.id) {
      notes.push({
        id: uid('n'), recipient_id: debtorId, type: 'debt_game_created',
        title: `Игра на долг: ${meta.title}`,
        body: `${currentUser.display_name} начал игру на ваш долг`,
        link_url: '/debt-games', is_read: false,
      });
    }
    if (opp.id !== currentUser.id) {
      notes.push({
        id: uid('n'), recipient_id: opp.id, type: 'debt_game_created',
        title: `Игра на долг: ${meta.title}`,
        body: `${currentUser.display_name} вызвал вас стороной`,
        link_url: '/debt-games', is_read: false,
      });
    }
    if (notes.length > 0) await sb.from('notifications').insert(notes);

    await sb.from('events').insert({
      id: uid('ev'), type: 'debt_game_start',
      title: `Игра на долг: ${meta.title}`,
      body: `Должник: ${state.participants.find(p => p.id === debtorId)?.display_name ?? debtorId}, сумма: ${initialAmount.toLocaleString('ru-RU')} ¥`,
      link_url: '/debt-games', is_for_gm_only: false,
    });

    setBusy(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative glass-strong w-full max-w-md p-4 rounded-2xl space-y-3 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start gap-2">
          <div className="text-3xl">{meta.emoji}</div>
          <div className="flex-1">
            <div className="font-heading text-lg font-bold">{meta.title}</div>
            <div className="text-[11px] text-muted-foreground">{meta.short}</div>
          </div>
          <button onClick={onClose} className="text-2xl text-muted-foreground">×</button>
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-widest text-gold/70 mb-1 block">Должник</label>
          {debtorCandidates.length === 0 ? (
            <div className="glass p-3 text-xs text-muted-foreground">
              {isAdmin ? 'У игроков нет активных долгов.' : 'У вас нет активных долгов.'}
            </div>
          ) : (
            <select className="input-field text-sm"
              value={debtorId} onChange={e => { setDebtorId(e.target.value); setDebtId(''); }}>
              <option value="">— выбрать —</option>
              {debtorCandidates.map(p => (
                <option key={p.id} value={p.id}>{p.display_name}</option>
              ))}
            </select>
          )}
        </div>

        {debtorId && debtorDebts.length > 0 && (
          <div>
            <label className="text-[10px] uppercase tracking-widest text-gold/70 mb-1 block">Долг</label>
            <select className="input-field text-sm"
              value={debtId} onChange={e => setDebtId(e.target.value)}>
              <option value="">— выбрать —</option>
              {debtorDebts.map(d => (
                <option key={d.id} value={d.id}>
                  {d.amount.toLocaleString('ru-RU')} ¥ · {d.status} · {state.participants.find(p => p.id === d.creditor_id)?.display_name ?? d.creditor_id}
                </option>
              ))}
            </select>
          </div>
        )}

        {selectedDebt && opponentOptions.length > 0 && (
          <div>
            <label className="text-[10px] uppercase tracking-widest text-gold/70 mb-1 block">Сторона</label>
            <div className="grid grid-cols-1 gap-1">
              {opponentOptions.map(o => (
                <button key={o.value} type="button"
                  onClick={() => setOpponentType(o.value)}
                  className={cn('text-xs px-2.5 py-2 rounded-lg border text-left',
                    opponentType === o.value
                      ? 'bg-gold/15 border-gold/50 text-gold'
                      : 'bg-card/40 border-white/8')}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <details className="glass p-2">
          <summary className="cursor-pointer text-xs font-bold">Правила</summary>
          <p className="text-[11px] text-muted-foreground whitespace-pre-line mt-2">{meta.rules}</p>
        </details>

        <div className="grid grid-cols-2 gap-2">
          <button onClick={onClose} className="btn-secondary text-sm">Отмена</button>
          <button onClick={create} disabled={busy || !selectedDebt} className="btn-primary text-sm">
            {busy ? '...' : '▶ Создать игру'}
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// АКТИВНАЯ ИГРА
// =============================================================================

function ActiveGameCard({ game }: { game: DebtGame }) {
  const { state, currentUser, role } = useStore();
  const isAdmin = role === 'gm' || role === 'queen';
  const meta = DEBT_GAMES_META[game.type];
  const debtor = state.participants.find(p => p.id === game.debtor_id);
  const opponent = game.opponent_id ? state.participants.find(p => p.id === game.opponent_id) : null;
  const isDebtor = !!currentUser && currentUser.id === game.debtor_id;
  const isOpponent = !!currentUser && currentUser.id === game.opponent_id;
  const canPlay = isDebtor || isAdmin;

  return (
    <div className="glass-strong p-4 space-y-3">
      <div className="flex items-start gap-2">
        <div className="text-2xl">{meta.emoji}</div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm truncate">{meta.title}</div>
          <div className="text-[10px] text-muted-foreground">
            {debtor?.display_name ?? game.debtor_id} vs {opponent?.display_name ?? game.opponent_type}
          </div>
          <div className="text-[10px] text-gold mt-0.5">
            долг: <Yen amount={game.initial_debt_amount} className="inline" iconClass="w-3 h-3" />
          </div>
        </div>
        <span className="status-badge text-[10px] bg-amber-500/15 text-amber-300">
          {game.status}
        </span>
      </div>

      {/* Контекст текущего пользователя */}
      {!canPlay && !isOpponent && (
        <div className="text-[10px] text-muted-foreground italic">
          Вы наблюдатель. Только должник или ведущий может играть.
        </div>
      )}

      {/* Игровая часть в зависимости от типа */}
      {canPlay && (
        <GamePlayArea game={game} />
      )}
    </div>
  );
}

function GamePlayArea({ game }: { game: DebtGame }) {
  switch (game.type) {
    case 'three_seals':           return <ThreeSealsPlay game={game} />;
    case 'kirumi_ransom_table':   return <KirumiRansomPlay game={game} />;
    case 'collection_dice':       return <CollectionDicePlay game={game} />;
    case 'black_note':            return <BlackNotePlay game={game} />;
    case 'last_payment':          return <LastPaymentPlay game={game} />;
    case 'delay_game':            return <DelayGamePlay game={game} />;
  }
}

// ----- Три печати -----

function ThreeSealsPlay({ game }: { game: DebtGame }) {
  const sb = getSupabase();
  const { currentUser, role } = useStore();
  const isAdmin = role === 'gm' || role === 'queen';
  const cards = (game.state?.cards as ThreeSealsCard[]) ?? [];
  const revealedIdx: number | null = game.state?.revealed_idx ?? null;
  const pickedCard = revealedIdx !== null ? cards[revealedIdx] : null;
  const [busy, setBusy] = useState(false);

  const pick = async (idx: number) => {
    if (!sb || busy) return;
    if (revealedIdx !== null) return;
    setBusy(true);
    const card = cards[idx];
    const out = applyThreeSeals(game.initial_debt_amount, card);
    await sb.from('debt_games').update({
      state: { cards, revealed_idx: idx },
      result_debt_amount: out.newDebt,
      result: out.result,
      result_description: out.description,
      requires_approval: out.newDebt >= PET_CANDIDATE_THRESHOLD,
      status: out.newDebt >= PET_CANDIDATE_THRESHOLD ? 'resolving' : 'finished',
      finished_at: new Date().toISOString(),
    }).eq('id', game.id);
    if (game.debt_id) {
      await sb.from('debts').update({ amount: out.newDebt }).eq('id', game.debt_id);
    }
    setBusy(false);
  };

  if (revealedIdx !== null && pickedCard) {
    return <ResultBanner game={game} />;
  }

  return (
    <div className="space-y-2">
      <div className="text-[11px] text-muted-foreground text-center">
        Выберите одну из трёх закрытых печатей
      </div>
      <div className="grid grid-cols-3 gap-2">
        {cards.map((_, i) => (
          <button key={i} disabled={busy} onClick={() => pick(i)}
            className="aspect-[2/3] rounded-xl bg-gradient-to-br from-fuchsia-700/30 to-fuchsia-900/60 border-2 border-fuchsia-500/30 active:scale-95 flex items-center justify-center text-3xl">
            🔮
          </button>
        ))}
      </div>
    </div>
  );
}

// ----- Кируми Выкупной стол: 4 карты -----

function KirumiRansomPlay({ game }: { game: DebtGame }) {
  const sb = getSupabase();
  const { currentUser, role } = useStore();
  const isAdmin = role === 'gm' || role === 'queen';
  const isMondoUser = !!currentUser && currentUser.id === MONDO_ID;
  const cards = (game.state?.cards as KirumiRansomCard[]) ?? [];
  const revealedIdx: number | null = game.state?.revealed_idx ?? null;
  const removedIdx: number | null = game.state?.removed_idx ?? null;
  const removedBy: string | null = game.state?.removed_by ?? null;
  const [busy, setBusy] = useState(false);

  const removeCard = async (idx: number) => {
    if (!sb || !currentUser || busy) return;
    if (removedIdx !== null) return;
    if (!confirm('Убрать одну карту за 100 000 ¥? Сумма уйдёт в Казну (это ваша «комиссия»).')) return;
    setBusy(true);
    const tx = await applyTransfer(currentUser.id, TREASURY_ID, 100_000,
      `Выкупной стол · убрать карту`, '/debt-games');
    if (!tx.ok) { alert(tx.error || 'Ошибка'); setBusy(false); return; }
    await sb.from('debt_games').update({
      state: { ...game.state, removed_idx: idx, removed_by: currentUser.id },
    }).eq('id', game.id);
    setBusy(false);
  };

  const pick = async (idx: number) => {
    if (!sb || busy) return;
    if (revealedIdx !== null) return;
    if (idx === removedIdx) return; // нельзя выбрать убранную
    setBusy(true);
    const card = cards[idx];
    const out = applyKirumiRansom(game.initial_debt_amount, card);
    const requires = out.result === 'pet_candidate' || (out.newDebt >= PET_CANDIDATE_THRESHOLD);
    await sb.from('debt_games').update({
      state: { ...game.state, revealed_idx: idx },
      result_debt_amount: out.newDebt,
      result: out.result,
      result_description: out.description,
      requires_approval: requires,
      status: requires ? 'resolving' : 'finished',
      finished_at: new Date().toISOString(),
    }).eq('id', game.id);
    if (game.debt_id) {
      const updates: any = { amount: out.newDebt };
      if (out.newStatus) updates.status = out.newStatus;
      if (out.result === 'transferred_to_mondo') updates.collector_id = MONDO_ID;
      await sb.from('debts').update(updates).eq('id', game.debt_id);
    }
    setBusy(false);
  };

  const isDebtor = !!currentUser && currentUser.id === game.debtor_id;
  const canRemove = (isMondoUser || isAdmin) && removedIdx === null && revealedIdx === null;

  if (revealedIdx !== null) return <ResultBanner game={game} />;

  return (
    <div className="space-y-2">
      <div className="text-[11px] text-muted-foreground text-center">
        Кируми кладёт 4 закрытые карты. {isDebtor && 'Выберите одну.'}
        {canRemove && ' Мондо может убрать одну за 100k.'}
      </div>
      <div className="grid grid-cols-4 gap-2">
        {cards.map((_, i) => {
          const isRemoved = removedIdx === i;
          return (
            <button key={i} disabled={busy || isRemoved}
              onClick={() => isDebtor && pick(i)}
              className={cn(
                'aspect-[2/3] rounded-xl border-2 flex items-center justify-center text-3xl active:scale-95',
                isRemoved
                  ? 'bg-gray-700/30 border-gray-500/30 line-through opacity-40'
                  : 'bg-gradient-to-br from-rose-700/30 to-rose-900/60 border-rose-500/30',
              )}>
              {isRemoved ? '✕' : '🎴'}
            </button>
          );
        })}
      </div>
      {canRemove && (
        <div className="flex gap-1.5">
          {cards.map((_, i) => (
            <button key={i} onClick={() => removeCard(i)} disabled={busy}
              className="flex-1 btn-secondary text-[10px]">
              Убрать #{i + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ----- Кости взыскания -----

function CollectionDicePlay({ game }: { game: DebtGame }) {
  const sb = getSupabase();
  const rolled = game.state?.rolled === true;
  const debtorRoll = game.state?.debtor_roll;
  const opponentRoll = game.state?.opponent_roll;
  const [busy, setBusy] = useState(false);

  const roll = async () => {
    if (!sb || busy) return;
    setBusy(true);
    const dr = rollDice2();
    const or = rollDice2();
    const out = applyCollectionDice(game.initial_debt_amount, dr.sum, or.sum);
    const requires = out.newDebt >= PET_CANDIDATE_THRESHOLD;
    await sb.from('debt_games').update({
      state: { rolled: true, debtor_roll: dr, opponent_roll: or },
      result_debt_amount: out.newDebt,
      result: out.result,
      result_description: out.description,
      requires_approval: requires,
      status: requires ? 'resolving' : 'finished',
      finished_at: new Date().toISOString(),
    }).eq('id', game.id);
    if (game.debt_id) {
      await sb.from('debts').update({ amount: out.newDebt }).eq('id', game.debt_id);
    }
    setBusy(false);
  };

  if (rolled) {
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <DiceCard label="Должник" d1={debtorRoll.d1} d2={debtorRoll.d2} sum={debtorRoll.sum} />
          <DiceCard label="Сторона" d1={opponentRoll.d1} d2={opponentRoll.d2} sum={opponentRoll.sum} />
        </div>
        <ResultBanner game={game} />
      </div>
    );
  }
  return (
    <button onClick={roll} disabled={busy} className="btn-primary w-full text-sm">
      🎲 Бросить 2 кубика
    </button>
  );
}

function DiceCard({ label, d1, d2, sum }: { label: string; d1: number; d2: number; sum: number }) {
  return (
    <div className="glass p-3 text-center">
      <div className="text-[10px] uppercase tracking-widest text-gold/70">{label}</div>
      <div className="text-3xl my-1">🎲 {d1} + 🎲 {d2}</div>
      <div className="font-mono font-bold text-2xl text-gold">= {sum}</div>
    </div>
  );
}

// ----- Чёрная расписка -----

function BlackNotePlay({ game }: { game: DebtGame }) {
  const sb = getSupabase();
  const choice = game.state?.choice as BlackNoteRisk | undefined;
  const [busy, setBusy] = useState(false);

  const apply = async (c: BlackNoteRisk) => {
    if (!sb || busy) return;
    if (c === 'despair' && game.initial_debt_amount >= 700_000) {
      if (!confirm('Режим «Отчаяние» при долге ≥ 700k требует подтверждения ведущего. Продолжить и пометить требующим подтверждения?')) return;
    }
    setBusy(true);
    const out = applyBlackNote(game.initial_debt_amount, c);
    const requires = (c === 'despair' && game.initial_debt_amount >= 700_000) || out.newDebt >= PET_CANDIDATE_THRESHOLD;
    await sb.from('debt_games').update({
      state: { choice: c, pay_now: out.payNow ?? null },
      result_debt_amount: out.newDebt,
      result: out.result,
      result_description: out.description,
      requires_approval: requires,
      status: requires ? 'resolving' : 'finished',
      finished_at: new Date().toISOString(),
    }).eq('id', game.id);
    if (game.debt_id) {
      const updates: any = { amount: out.newDebt };
      if (out.newDebt === 0) updates.status = 'paid';
      await sb.from('debts').update(updates).eq('id', game.debt_id);
    }
    setBusy(false);
  };

  if (choice) return <ResultBanner game={game} />;
  return (
    <div className="grid grid-cols-1 gap-1.5">
      <button onClick={() => apply('safe')} disabled={busy}
        className="px-3 py-3 rounded-xl text-left border bg-emerald-500/10 border-emerald-500/30 active:bg-emerald-500/20">
        <div className="text-sm font-bold text-emerald-300">🛡 Безопасно</div>
        <div className="text-[11px] text-muted-foreground">оплатить 20% сейчас, остаток продлевается</div>
      </button>
      <button onClick={() => apply('risk')} disabled={busy}
        className="px-3 py-3 rounded-xl text-left border bg-amber-500/10 border-amber-500/30 active:bg-amber-500/20">
        <div className="text-sm font-bold text-amber-300">🎲 Риск 50/50</div>
        <div className="text-[11px] text-muted-foreground">−40% при удаче, +40% при провале</div>
      </button>
      <button onClick={() => apply('despair')} disabled={busy}
        className="px-3 py-3 rounded-xl text-left border bg-red-500/10 border-red-500/30 active:bg-red-500/20">
        <div className="text-sm font-bold text-red-300">💀 Отчаяние 30/70</div>
        <div className="text-[11px] text-muted-foreground">30% — весь долг списан, 70% — долг удвоен</div>
      </button>
    </div>
  );
}

// ----- Последний платёж -----

function LastPaymentPlay({ game }: { game: DebtGame }) {
  const sb = getSupabase();
  const { state, currentUser } = useStore();
  const debtor = state.participants.find(p => p.id === game.debtor_id);
  const paid = game.state?.paid_amount as number | undefined;
  const [busy, setBusy] = useState(false);

  const apply = async (amount: number, chance: number) => {
    if (!sb || !currentUser || busy) return;
    if (!debtor || debtor.balance < amount) {
      alert(`У должника не хватает денег (${debtor?.balance.toLocaleString('ru-RU') ?? 0} ¥).`);
      return;
    }
    setBusy(true);
    // Списываем платёж в Казну
    const tx = await applyTransfer(game.debtor_id, TREASURY_ID, amount,
      `Последний платёж · игра на долг`, '/debt-games');
    if (!tx.ok) { alert(tx.error || 'Ошибка'); setBusy(false); return; }
    const out = applyLastPayment(game.initial_debt_amount, amount, chance);
    const requires = out.newDebt >= PET_CANDIDATE_THRESHOLD;
    await sb.from('debt_games').update({
      state: { paid_amount: amount, chance, won: out.newDebt === 0 },
      result_debt_amount: out.newDebt,
      result: out.result,
      result_description: out.description,
      requires_approval: requires,
      status: requires ? 'resolving' : 'finished',
      finished_at: new Date().toISOString(),
    }).eq('id', game.id);
    if (game.debt_id) {
      const updates: any = { amount: out.newDebt };
      if (out.newDebt === 0) updates.status = 'paid';
      await sb.from('debts').update(updates).eq('id', game.debt_id);
    }
    setBusy(false);
  };

  if (paid !== undefined) return <ResultBanner game={game} />;

  return (
    <div className="grid grid-cols-1 gap-1.5">
      {LAST_PAYMENT_OPTIONS.map(({ amount, chance }) => {
        const canPay = !debtor || debtor.balance >= amount;
        return (
          <button key={amount} onClick={() => apply(amount, chance)}
            disabled={busy || !canPay}
            className={cn('px-3 py-3 rounded-xl text-left border',
              canPay
                ? 'bg-card/40 border-white/10 active:bg-white/5'
                : 'bg-card/20 border-white/5 opacity-40')}>
            <div className="text-sm font-bold flex items-center justify-between">
              <span>💴 {amount.toLocaleString('ru-RU')} ¥</span>
              <span className="text-gold">{Math.round(chance * 100)}%</span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              {canPay ? `шанс ${Math.round(chance * 100)}% списать остаток` : 'недостаточно средств'}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ----- Игра на отсрочку -----

function DelayGamePlay({ game }: { game: DebtGame }) {
  const sb = getSupabase();
  const rolled = game.state?.rolled === true;
  const won = game.state?.won;
  const [busy, setBusy] = useState(false);

  const roll = async () => {
    if (!sb || busy) return;
    setBusy(true);
    const out = applyDelayGame(game.initial_debt_amount);
    const isWin = out.result === 'due_extended';
    await sb.from('debt_games').update({
      state: { rolled: true, won: isWin },
      result_debt_amount: out.newDebt,
      result: out.result,
      result_description: out.description,
      requires_approval: false,
      status: 'finished',
      finished_at: new Date().toISOString(),
    }).eq('id', game.id);
    if (game.debt_id) {
      await sb.from('debts').update({ amount: out.newDebt }).eq('id', game.debt_id);
    }
    setBusy(false);
  };

  if (rolled) return <ResultBanner game={game} />;
  return (
    <button onClick={roll} disabled={busy} className="btn-primary w-full text-sm">
      ⌛ Сыграть 50/50 за продление срока
    </button>
  );
}

// ----- Баннер результата -----

function ResultBanner({ game }: { game: DebtGame }) {
  const meta = DEBT_GAMES_META[game.type];
  const positive = game.result === 'debt_reduced' || game.result === 'debt_paid' || game.result === 'due_extended';
  const dangerous = game.result === 'pet_candidate' || game.result === 'requires_approval' || game.requires_approval;
  return (
    <div className={cn('p-3 rounded-xl border space-y-1',
      dangerous ? 'bg-red-500/10 border-red-500/40'
        : positive ? 'bg-emerald-500/10 border-emerald-500/40'
        : 'bg-amber-500/10 border-amber-500/40')}>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
        {dangerous ? '⚠️ Требует утверждения' : positive ? 'Результат' : 'Результат'}
      </div>
      <div className="text-xs">{game.result_description}</div>
      {game.result_debt_amount !== null && game.result_debt_amount !== undefined && (
        <div className="text-[11px] text-muted-foreground">
          Долг: <Yen amount={game.initial_debt_amount} className="inline" iconClass="w-3 h-3" /> →
          {' '}<Yen amount={game.result_debt_amount} className="inline text-gold" iconClass="w-3 h-3" />
        </div>
      )}
      {dangerous && (
        <div className="text-[10px] text-red-300 italic">
          Селестия / ведущий должны подтвердить применение результата.
        </div>
      )}
    </div>
  );
}

// =============================================================================
// ИСТОРИЯ
// =============================================================================

function HistoryGameCard({ game }: { game: DebtGame }) {
  const { state } = useStore();
  const meta = DEBT_GAMES_META[game.type];
  const debtor = state.participants.find(p => p.id === game.debtor_id);
  return (
    <div className="glass p-3 space-y-1">
      <div className="flex items-center gap-2">
        <div className="text-xl">{meta.emoji}</div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-xs truncate">{meta.title}</div>
          <div className="text-[10px] text-muted-foreground">
            {debtor?.display_name ?? game.debtor_id} · {new Date(game.created_at).toLocaleDateString('ru-RU')}
          </div>
        </div>
        <span className={cn('status-badge text-[10px]',
          game.status === 'finished' ? 'bg-emerald-500/15 text-emerald-300'
            : 'bg-gray-500/15 text-gray-300')}>
          {game.status === 'finished' ? 'завершено' : 'отменено'}
        </span>
      </div>
      {game.result_description && (
        <div className="text-[11px] text-muted-foreground">{game.result_description}</div>
      )}
      {game.result_debt_amount !== null && game.result_debt_amount !== undefined && (
        <div className="text-[10px]">
          <Yen amount={game.initial_debt_amount} className="inline" iconClass="w-3 h-3" /> →
          {' '}<Yen amount={game.result_debt_amount} className="inline text-gold" iconClass="w-3 h-3" />
        </div>
      )}
    </div>
  );
}

// =============================================================================
// УТИЛИТЫ
// =============================================================================

function isOpenDebtStatus(status: string): boolean {
  return status === 'active' || status === 'overdue' || status === 'collection'
    || status === 'restructured' || status === 'pet_candidate' || status === 'due_soon'
    || status === 'requested';
}
