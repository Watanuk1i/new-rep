'use client';

// /loans — единая страница системы кредитования.
// Вкладки динамические в зависимости от роли:
//   Игрок:  «Запросить кредит» + «Мои запросы»
//   Кируми (p-15) или admin:  + «Все запросы», «Кредиты Кируми»
//   Мондо (p-11)  или admin:  + «Взыскания»
//   Пеко (p-peko) или admin:  + «Мои взыскания»

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useStore, uid } from '@/lib/store/StoreProvider';
import { Yen } from '@/components/ui/Yen';
import { CharacterIcon } from '@/components/ui/CharacterIcon';
import { cn, isPlayer } from '@/lib/utils';
import { getSupabase } from '@/lib/supabase/client';
import { applyTransfer } from '@/lib/store/tx';
import {
  KIRUMI_ID, MONDO_ID, PEKO_ID, QUEEN_ID, TREASURY_ID, KIRUMI_FUND_ID,
  LOAN_NORMAL_RATE, LOAN_URGENT_RATE,
  OVERDUE_RATE, MONDO_COMMISSION_RATE,
  PET_CANDIDATE_THRESHOLD, PET_LIMITS,
  loanReturnAmount, splitCollectionCommission,
} from '@/lib/loans/constants';
import type { Debt, LoanRequest, DebtCollectionNote } from '@/lib/store/types';

type Tab =
  | 'request' | 'my_requests' | 'kirumi_inbox' | 'kirumi_loans'
  | 'all_debts' | 'mondo_collection' | 'peko_my';

export default function LoansPage() {
  const { state, currentUser, role } = useStore();
  const sb = getSupabase();
  const isAdmin = role === 'gm' || role === 'queen';
  const isKirumiUser = !!currentUser && currentUser.id === KIRUMI_ID;
  const isMondoUser  = !!currentUser && currentUser.id === MONDO_ID;
  const isPekoUser   = !!currentUser && currentUser.id === PEKO_ID;

  const [tab, setTab] = useState<Tab>('request');
  const [requests, setRequests] = useState<LoanRequest[]>([]);
  const [notes, setNotes] = useState<DebtCollectionNote[]>([]);

  useEffect(() => {
    if (!sb) return;
    let alive = true;
    const load = async () => {
      const [{ data: lr }, { data: nt }] = await Promise.all([
        sb.from('loan_requests').select('*').order('created_at', { ascending: false }),
        sb.from('debt_collection_notes').select('*').order('created_at', { ascending: false }),
      ]);
      if (!alive) return;
      setRequests((lr ?? []) as LoanRequest[]);
      setNotes((nt ?? []) as DebtCollectionNote[]);
    };
    load();
    const ch = sb.channel('loans-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'loan_requests' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'debt_collection_notes' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'debts' }, load)
      .subscribe();
    return () => { alive = false; sb.removeChannel(ch); };
  }, [sb]);

  const tabs: { key: Tab; label: string; icon: string; show: boolean }[] = ([
    { key: 'request' as Tab,          label: 'Запросить', icon: '📝', show: !!currentUser && isPlayer(currentUser) },
    { key: 'my_requests' as Tab,      label: 'Мои запросы', icon: '📨', show: !!currentUser },
    { key: 'kirumi_inbox' as Tab,     label: 'Запросы (Кируми)', icon: '📥', show: isKirumiUser || isAdmin },
    { key: 'kirumi_loans' as Tab,     label: 'Кредиты Кируми', icon: '💳', show: isKirumiUser || isAdmin },
    { key: 'all_debts' as Tab,        label: 'Все долги', icon: '📜', show: isAdmin },
    { key: 'mondo_collection' as Tab, label: 'Взыскания (Мондо)', icon: '🔨', show: isMondoUser || isAdmin },
    { key: 'peko_my' as Tab,          label: 'Мои взыскания (Пеко)', icon: '⚔️', show: isPekoUser || isAdmin },
  ]).filter(t => t.show);

  // Подгоняем активную вкладку, если текущая недоступна
  useEffect(() => {
    if (!tabs.find(t => t.key === tab)) setTab(tabs[0]?.key ?? 'request');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  if (!currentUser) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="text-sm text-muted-foreground mb-4">Войдите, чтобы пользоваться кредитами</p>
        <Link href="/login" className="btn-primary inline-flex">Войти</Link>
      </div>
    );
  }

  return (
    <div className="px-3 sm:px-4 py-4 max-w-2xl mx-auto space-y-4 animate-fade-in">
      <div className="glass-strong gold-border p-5">
        <div className="text-[10px] uppercase tracking-widest text-gold/70">💼 Кредитная система</div>
        <h1 className="font-heading text-xl font-bold text-gradient-gold mt-1">Кредиты Кируми и взыскания</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Кируми выдаёт кредит. Мондо взыскивает. Пеко исполняет давление. Селестия утверждает крайние решения.
        </p>
      </div>

      <div className="scroll-x">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn('tab-pill', tab === t.key ? 'tab-pill-active' : 'tab-pill-inactive')}>
            <span>{t.icon}</span><span>{t.label}</span>
          </button>
        ))}
      </div>

      {tab === 'request' && <RequestForm />}
      {tab === 'my_requests' && <MyRequests requests={requests.filter(r => r.borrower_id === currentUser.id)} />}
      {tab === 'kirumi_inbox' && <KirumiInbox requests={requests.filter(r => r.status === 'pending' || r.status === 'counter_offer')} />}
      {tab === 'kirumi_loans' && <KirumiLoans />}
      {tab === 'all_debts' && <AllDebts />}
      {tab === 'mondo_collection' && <MondoCollection />}
      {tab === 'peko_my' && <PekoMy notes={notes.filter(n => n.author_id === currentUser.id)} />}
    </div>
  );
}

// =============================================================================
// REQUEST FORM
// =============================================================================

function RequestForm() {
  const { state, currentUser } = useStore();
  const sb = getSupabase();
  const [amount, setAmount] = useState(200_000);
  const [reason, setReason] = useState('');
  const [dueDay, setDueDay] = useState(() => (state.room?.day ?? 1) + 3);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  if (!currentUser) return null;

  const submit = async () => {
    if (!sb || amount <= 0) return;
    setBusy(true);
    const id = uid('lr');
    await sb.from('loan_requests').insert({
      id,
      borrower_id: currentUser.id,
      requested_amount: amount,
      reason: reason.trim() || null,
      requested_due_day: dueDay,
      comment: comment.trim() || null,
      status: 'pending',
      created_by_id: currentUser.id,
    });
    // Уведомление Кируми и админу
    await sb.from('notifications').insert([
      {
        id: uid('n'),
        recipient_id: KIRUMI_ID,
        type: 'loan_request',
        title: 'Новый запрос на кредит',
        body: `${currentUser.display_name} просит ${amount.toLocaleString('ru-RU')} ¥`,
        link_url: '/loans',
        is_read: false,
      },
    ]);
    setBusy(false);
    setReason(''); setComment('');
    alert('Запрос отправлен Кируми');
  };

  return (
    <div className="glass p-4 space-y-3">
      <div>
        <label className="text-[10px] font-bold uppercase tracking-widest text-gold mb-1 block">Сумма (¥)</label>
        <input type="number" value={amount} min={10_000} step={10_000}
          onChange={e => setAmount(Math.max(10_000, Number(e.target.value)))}
          className="input-field font-mono text-lg" />
        <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
          <span>обычный: 100k–500k @ {LOAN_NORMAL_RATE}%</span>
          <span>срочный: до 400k @ {LOAN_URGENT_RATE}%</span>
        </div>
      </div>
      <div>
        <label className="text-[10px] font-bold uppercase tracking-widest text-gold mb-1 block">Причина</label>
        <input value={reason} onChange={e => setReason(e.target.value)}
          placeholder="на ставку в Девяти патронах" className="input-field" />
      </div>
      <div>
        <label className="text-[10px] font-bold uppercase tracking-widest text-gold mb-1 block">Желаемый срок (день)</label>
        <input type="number" min={1} max={99} value={dueDay}
          onChange={e => setDueDay(Math.max(1, Math.min(99, Number(e.target.value))))}
          className="input-field font-mono" />
      </div>
      <div>
        <label className="text-[10px] font-bold uppercase tracking-widest text-muted mb-1 block">Комментарий (опц.)</label>
        <textarea value={comment} onChange={e => setComment(e.target.value)}
          placeholder="залог, доп. условия, аргументы..." className="input-field min-h-[60px] resize-none" />
      </div>
      <button onClick={submit} disabled={busy} className="btn-primary w-full">
        {busy ? '...' : '📨 Отправить запрос Кируми'}
      </button>
      <p className="text-[10px] text-muted-foreground text-center">
        Запрос увидит Кируми. Она может одобрить, отклонить или прислать встречные условия.
      </p>
    </div>
  );
}

// =============================================================================
// MY REQUESTS (просмотр игрока)
// =============================================================================

function MyRequests({ requests }: { requests: LoanRequest[] }) {
  const { state, currentUser } = useStore();
  const sb = getSupabase();
  if (requests.length === 0) {
    return <div className="glass p-6 text-center text-sm text-muted-foreground">Запросов нет.</div>;
  }
  const accept = async (r: LoanRequest) => {
    if (!sb || !currentUser) return;
    if (r.status !== 'counter_offer') return;
    if (!confirm('Принять условия Кируми и получить деньги?')) return;
    // Деньги выдаются из Казны (Фонд Тогами); Кируми — официальный кредитор как роль.
    const principal = r.proposed_amount ?? r.requested_amount;
    const rate = r.proposed_interest_rate ?? LOAN_NORMAL_RATE;
    const dueDay = r.proposed_due_day ?? r.requested_due_day ?? 3;
    const link = '/loans';
    // Кредиты идут из Кредитного резерва Кируми. Если резерв пуст — fallback на Фонд Тогами.
    const { data: fund } = await sb.from('participants').select('balance').eq('id', KIRUMI_FUND_ID).maybeSingle();
    const sourceId = (fund?.balance ?? 0) >= principal ? KIRUMI_FUND_ID : TREASURY_ID;
    const tx = await applyTransfer(sourceId, currentUser.id, principal,
      `Кредит Кируми: ${r.reason ?? '—'}`, link);
    if (!tx.ok) { alert(tx.error || 'Ошибка'); return; }
    const debtId = uid('d');
    const owe = loanReturnAmount(principal, rate);
    await sb.from('debts').insert({
      id: debtId,
      debtor_id: currentUser.id,
      // Кредитор = Кредитный резерв Кируми (или Фонд Тогами при fallback).
      creditor_id: sourceId,
      amount: owe,
      principal_amount: principal,
      interest_rate: rate,
      description: `Кредит Кируми${r.reason ? ': ' + r.reason : ''}`,
      due_day: dueDay,
      status: 'active',
      initiator: 'creditor',
      source: 'kirumi_loan',
      collateral_text: r.collateral_text ?? null,
    });
    await sb.from('loan_requests').update({
      status: 'accepted',
      resulting_debt_id: debtId,
      updated_at: new Date().toISOString(),
    }).eq('id', r.id);
    await sb.from('notifications').insert({
      id: uid('n'), recipient_id: KIRUMI_ID, type: 'loan_accepted',
      title: 'Заёмщик принял условия',
      body: `${currentUser.display_name} принял кредит на ${principal.toLocaleString('ru-RU')} ¥`,
      link_url: link, is_read: false,
    });
  };
  const cancel = async (r: LoanRequest) => {
    if (!sb) return;
    if (!confirm('Отозвать запрос?')) return;
    await sb.from('loan_requests').update({
      status: 'cancelled',
      updated_at: new Date().toISOString(),
    }).eq('id', r.id);
  };
  return (
    <div className="space-y-2">
      {requests.map(r => (
        <RequestCard key={r.id} r={r} forBorrower onAccept={() => accept(r)} onCancel={() => cancel(r)} />
      ))}
    </div>
  );
}

// =============================================================================
// KIRUMI INBOX (запросы на одобрение)
// =============================================================================

function KirumiInbox({ requests }: { requests: LoanRequest[] }) {
  const { state, currentUser } = useStore();
  const sb = getSupabase();
  if (requests.length === 0) {
    return <div className="glass p-6 text-center text-sm text-muted-foreground">Нет активных запросов.</div>;
  }
  return (
    <div className="space-y-2">
      {requests.map(r => (
        <KirumiInboxCard key={r.id} r={r} />
      ))}
    </div>
  );
}

function KirumiInboxCard({ r }: { r: LoanRequest }) {
  const { state } = useStore();
  const sb = getSupabase();
  const [amount, setAmount] = useState(r.proposed_amount ?? r.requested_amount);
  const [rate, setRate] = useState(r.proposed_interest_rate ?? LOAN_NORMAL_RATE);
  const [dueDay, setDueDay] = useState(r.proposed_due_day ?? r.requested_due_day ?? 3);
  const [collateral, setCollateral] = useState(r.collateral_text ?? '');
  const [busy, setBusy] = useState(false);
  const borrower = state.participants.find(p => p.id === r.borrower_id);

  const reject = async () => {
    if (!sb) return;
    if (!confirm('Отклонить запрос?')) return;
    await sb.from('loan_requests').update({
      status: 'rejected',
      reviewed_by_id: KIRUMI_ID,
      updated_at: new Date().toISOString(),
    }).eq('id', r.id);
    await sb.from('notifications').insert({
      id: uid('n'), recipient_id: r.borrower_id, type: 'loan_rejected',
      title: 'Запрос на кредит отклонён',
      body: 'Кируми отклонила ваш запрос.',
      link_url: '/loans', is_read: false,
    });
  };

  const counter = async () => {
    if (!sb) return;
    setBusy(true);
    await sb.from('loan_requests').update({
      status: 'counter_offer',
      proposed_amount: amount,
      proposed_interest_rate: rate,
      proposed_due_day: dueDay,
      collateral_text: collateral.trim() || null,
      reviewed_by_id: KIRUMI_ID,
      updated_at: new Date().toISOString(),
    }).eq('id', r.id);
    await sb.from('notifications').insert({
      id: uid('n'), recipient_id: r.borrower_id, type: 'loan_counter',
      title: 'Кируми прислала встречное предложение',
      body: `${amount.toLocaleString('ru-RU')} @ ${rate}% до дня ${dueDay}`,
      link_url: '/loans', is_read: false,
    });
    setBusy(false);
  };

  return (
    <div className="glass-strong p-4 space-y-2">
      <div className="flex items-center gap-2">
        {borrower && <CharacterIcon participant={borrower} size="sm" ringless />}
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm truncate">{borrower?.display_name ?? r.borrower_id}</div>
          <div className="text-[10px] text-muted-foreground truncate">
            запросил <Yen amount={r.requested_amount} className="inline" iconClass="w-3 h-3" />
            {' · '}срок: день {r.requested_due_day ?? '?'}
          </div>
          {r.reason && <div className="text-[11px] mt-1">{r.reason}</div>}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <div className="text-[10px] text-muted-foreground">Выдать ¥</div>
          <input type="number" value={amount} min={10_000} step={10_000}
            onChange={e => setAmount(Math.max(10_000, Number(e.target.value)))}
            className="input-field font-mono text-xs" />
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground">Процент</div>
          <input type="number" value={rate} min={0} max={200}
            onChange={e => setRate(Math.max(0, Math.min(200, Number(e.target.value))))}
            className="input-field font-mono text-xs" />
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground">Срок (день)</div>
          <input type="number" value={dueDay} min={1} max={99}
            onChange={e => setDueDay(Math.max(1, Math.min(99, Number(e.target.value))))}
            className="input-field font-mono text-xs" />
        </div>
      </div>
      <div>
        <div className="text-[10px] text-muted-foreground">Залог / условие (опц.)</div>
        <input value={collateral} onChange={e => setCollateral(e.target.value)}
          placeholder="например: 50% выигрыша или место в игре"
          className="input-field text-xs" />
      </div>
      <div className="text-[10px] text-muted-foreground">
        К возврату: <Yen amount={loanReturnAmount(amount, rate)} className="inline text-gold" iconClass="w-3 h-3" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={counter} disabled={busy} className="btn-primary text-xs">📤 Отправить условия</button>
        <button onClick={reject} className="btn-danger text-xs">✕ Отклонить</button>
      </div>
    </div>
  );
}

function RequestCard({
  r, forBorrower, onAccept, onCancel,
}: { r: LoanRequest; forBorrower?: boolean; onAccept?: () => void; onCancel?: () => void }) {
  const { state } = useStore();
  const borrower = state.participants.find(p => p.id === r.borrower_id);
  const principal = r.proposed_amount ?? r.requested_amount;
  const rate = r.proposed_interest_rate ?? null;
  return (
    <div className="glass p-3">
      <div className="flex items-start gap-2">
        {borrower && <CharacterIcon participant={borrower} size="xs" ringless />}
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm truncate">{borrower?.display_name ?? r.borrower_id}</div>
          <div className="text-[10px] text-muted-foreground">{r.reason ?? '—'}</div>
          <div className="text-[11px] mt-1">
            запрос <Yen amount={r.requested_amount} className="inline" iconClass="w-3 h-3" />
            {r.proposed_amount && (
              <> · предложено <Yen amount={r.proposed_amount} className="inline text-gold" iconClass="w-3 h-3" /> @ {r.proposed_interest_rate}%</>
            )}
          </div>
          {r.collateral_text && (
            <div className="text-[10px] text-muted-foreground mt-1">залог: {r.collateral_text}</div>
          )}
        </div>
        <span className={cn('status-badge text-[10px]',
          r.status === 'pending' && 'bg-amber-500/15 text-amber-300',
          r.status === 'counter_offer' && 'bg-blue-500/15 text-blue-300',
          r.status === 'accepted' && 'bg-emerald-500/15 text-emerald-300',
          r.status === 'rejected' && 'bg-red-500/15 text-red-300',
          r.status === 'cancelled' && 'bg-gray-500/15 text-gray-300',
        )}>
          {r.status === 'pending' && 'ждёт'}
          {r.status === 'counter_offer' && 'встр. условия'}
          {r.status === 'accepted' && 'принят'}
          {r.status === 'rejected' && 'отклонён'}
          {r.status === 'cancelled' && 'отменён'}
        </span>
      </div>
      {forBorrower && r.status === 'counter_offer' && (
        <div className="grid grid-cols-2 gap-2 mt-2">
          <button onClick={onAccept} className="btn-success text-xs">✓ Принять и получить деньги</button>
          <button onClick={onCancel} className="btn-secondary text-xs">Отозвать</button>
        </div>
      )}
      {forBorrower && r.status === 'pending' && (
        <button onClick={onCancel} className="btn-secondary w-full text-xs mt-2">Отозвать запрос</button>
      )}
    </div>
  );
}

// =============================================================================
// KIRUMI LOANS — список выданных Кируми долгов
// =============================================================================

function KirumiLoans() {
  const { state } = useStore();
  // Кредиты Кируми = долги с source 'kirumi_loan' (или с creditor_id KIRUMI_ID/KIRUMI_FUND_ID).
  const debts = state.debts.filter(d =>
    d.source === 'kirumi_loan' || d.creditor_id === KIRUMI_ID || d.creditor_id === KIRUMI_FUND_ID
  );
  if (debts.length === 0) {
    return <div className="glass p-6 text-center text-sm text-muted-foreground">Кируми пока никому не выдала.</div>;
  }
  return (
    <div className="space-y-2">
      {debts.map(d => <DebtCard key={d.id} debt={d} forKirumi />)}
    </div>
  );
}

// =============================================================================
// ALL DEBTS (admin)
// =============================================================================

function AllDebts() {
  const { state } = useStore();
  const debts = [...state.debts].sort((a, b) =>
    (a.status === 'active' || a.status === 'overdue' ? 0 : 1) -
    (b.status === 'active' || b.status === 'overdue' ? 0 : 1));
  if (debts.length === 0) return <div className="glass p-6 text-center text-sm text-muted-foreground">Долгов нет.</div>;
  return <div className="space-y-2">{debts.map(d => <DebtCard key={d.id} debt={d} forKirumi />)}</div>;
}

// =============================================================================
// MONDO COLLECTION
// =============================================================================

function MondoCollection() {
  const { state } = useStore();
  const collectible = state.debts.filter(d =>
    d.status === 'overdue' || d.status === 'collection' || d.status === 'pet_candidate',
  );
  if (collectible.length === 0) {
    return <div className="glass p-6 text-center text-sm text-muted-foreground">На взыскании пусто.</div>;
  }
  return (
    <div className="space-y-2">
      {collectible.map(d => <DebtCard key={d.id} debt={d} forMondo />)}
    </div>
  );
}

// =============================================================================
// PEKO MY
// =============================================================================

function PekoMy({ notes }: { notes: DebtCollectionNote[] }) {
  const { state, currentUser } = useStore();
  const myDebts = state.debts.filter(d => d.executor_id === (currentUser?.id ?? PEKO_ID));
  if (myDebts.length === 0) {
    return <div className="glass p-6 text-center text-sm text-muted-foreground">Нет назначенных взысканий.</div>;
  }
  return (
    <div className="space-y-2">
      {myDebts.map(d => (
        <div key={d.id} className="space-y-1">
          <DebtCard debt={d} forPeko />
          <PekoNotes debtId={d.id} myNotes={notes.filter(n => n.debt_id === d.id)} />
        </div>
      ))}
    </div>
  );
}

function PekoNotes({ debtId, myNotes }: { debtId: string; myNotes: DebtCollectionNote[] }) {
  const { currentUser } = useStore();
  const sb = getSupabase();
  const [text, setText] = useState('');
  const [status, setStatus] = useState<DebtCollectionNote['status']>('note');
  const add = async () => {
    if (!sb || !currentUser || !text.trim()) return;
    await sb.from('debt_collection_notes').insert({
      id: uid('dcn'),
      debt_id: debtId,
      author_id: currentUser.id,
      status, text: text.trim(),
    });
    setText('');
  };
  return (
    <div className="glass p-3 space-y-1">
      <div className="text-[10px] uppercase tracking-widest text-gold/70">Заметки исполнителя</div>
      {myNotes.length > 0 && (
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {myNotes.map(n => (
            <div key={n.id} className="text-[11px] p-1.5 rounded bg-card/30">
              <span className="text-gold">[{n.status}]</span> {n.text}
            </div>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-1.5 mt-1">
        <select className="input-field text-[10px]" value={status} onChange={e => setStatus(e.target.value as any)}>
          <option value="note">заметка</option>
          <option value="warned">предупреждение выдано</option>
          <option value="refused">отказался платить</option>
          <option value="promised">обещал выплатить</option>
          <option value="partial_paid">частичная выплата</option>
          <option value="report_sent">отчёт Мондо</option>
        </select>
        <button onClick={add} className="btn-secondary text-[10px]">+ Добавить</button>
      </div>
      <input value={text} onChange={e => setText(e.target.value)}
        placeholder="что произошло..." className="input-field text-xs" />
    </div>
  );
}

// =============================================================================
// DEBT CARD
// =============================================================================

function DebtCard({
  debt, forKirumi, forMondo, forPeko,
}: { debt: Debt; forKirumi?: boolean; forMondo?: boolean; forPeko?: boolean }) {
  const { state, currentUser, role } = useStore();
  const sb = getSupabase();
  const isAdmin = role === 'gm' || role === 'queen';
  const isKirumiUser = !!currentUser && currentUser.id === KIRUMI_ID;
  const isMondoUser  = !!currentUser && currentUser.id === MONDO_ID;
  const isOwner = !!currentUser && (debt.creditor_id === currentUser.id);
  const debtor = state.participants.find(p => p.id === debt.debtor_id);
  const creditor = state.participants.find(p => p.id === debt.creditor_id);
  const collector = debt.collector_id ? state.participants.find(p => p.id === debt.collector_id) : null;
  const executor  = debt.executor_id  ? state.participants.find(p => p.id === debt.executor_id)  : null;

  const [busy, setBusy] = useState(false);

  const accrueOverdue = async () => {
    if (!sb) return;
    if (!confirm(`Начислить +${OVERDUE_RATE}% просрочки на долг ${debt.id}?`)) return;
    const newAmount = Math.round(debt.amount * (1 + OVERDUE_RATE / 100));
    await sb.from('debts').update({
      amount: newAmount,
      status: 'overdue',
    }).eq('id', debt.id);
    await sb.from('notifications').insert({
      id: uid('n'), recipient_id: debt.debtor_id, type: 'debt_overdue',
      title: 'Просрочка по долгу',
      body: `Сумма выросла с ${debt.amount.toLocaleString('ru-RU')} до ${newAmount.toLocaleString('ru-RU')}`,
      link_url: '/loans', is_read: false,
    });
  };

  const transferToMondo = async () => {
    if (!sb) return;
    if (!confirm('Передать долг Мондо на взыскание (+10% комиссия Мондо при оплате)?')) return;
    await sb.from('debts').update({
      status: 'collection',
      collector_id: MONDO_ID,
    }).eq('id', debt.id);
    await sb.from('notifications').insert({
      id: uid('n'), recipient_id: MONDO_ID, type: 'debt_assigned',
      title: 'Новый долг на взыскание',
      body: `${debtor?.display_name ?? debt.debtor_id} · ${debt.amount.toLocaleString('ru-RU')} ¥`,
      link_url: '/loans', is_read: false,
    });
  };

  const assignPeko = async () => {
    if (!sb) return;
    if (!confirm('Назначить Пеко исполнителем взыскания?')) return;
    await sb.from('debts').update({ executor_id: PEKO_ID }).eq('id', debt.id);
    await sb.from('debt_collection_notes').insert({
      id: uid('dcn'), debt_id: debt.id, author_id: MONDO_ID,
      status: 'assigned',
      text: `Назначена Пеко (исполнитель)`,
    });
    await sb.from('notifications').insert({
      id: uid('n'), recipient_id: PEKO_ID, type: 'debt_executor',
      title: 'Новое взыскание',
      body: `${debtor?.display_name ?? debt.debtor_id} · ${debt.amount.toLocaleString('ru-RU')} ¥`,
      link_url: '/loans', is_read: false,
    });
  };

  const markPetCandidate = async () => {
    if (!sb) return;
    if (debt.amount < PET_CANDIDATE_THRESHOLD) {
      alert(`Кандидат в Питомцы: только при долге от ${PET_CANDIDATE_THRESHOLD.toLocaleString('ru-RU')} ¥`);
      return;
    }
    if (!confirm('Пометить долг как «Кандидат в Питомцы»? Любой игрок сможет выкупить долг и стать хозяином должника.')) return;
    await sb.from('debts').update({ status: 'pet_candidate' }).eq('id', debt.id);
    await sb.from('notifications').insert([
      { id: uid('n'), recipient_id: QUEEN_ID, type: 'pet_candidate',
        title: 'Кандидат в Питомцы',
        body: `${debtor?.display_name ?? debt.debtor_id} · долг ${debt.amount.toLocaleString('ru-RU')} ¥`,
        link_url: '/loans', is_read: false },
      { id: uid('n'), recipient_id: debt.debtor_id, type: 'pet_candidate',
        title: 'Вы — кандидат в Питомцы',
        body: `Ваш долг ${debt.amount.toLocaleString('ru-RU')} ¥ выставлен на выкуп.`,
        link_url: '/loans', is_read: false },
    ]);
  };

  const buyOutAsPet = async () => {
    if (!sb || !currentUser) return;
    if (debt.status !== 'pet_candidate') return;
    if (currentUser.id === debt.debtor_id) { alert('Нельзя выкупить свой долг'); return; }
    const limit = PET_LIMITS[currentUser.status] ?? 1;
    const owns = state.participants.filter(p => p.pet_owner_id === currentUser.id).length;
    if (owns >= limit) {
      alert(`У вас уже ${owns} Питомцев (лимит ${limit}).`);
      return;
    }
    if (currentUser.balance < debt.amount) {
      alert(`Недостаточно средств. Нужно ${debt.amount.toLocaleString('ru-RU')} ¥`);
      return;
    }
    if (!confirm(`Выкупить долг за ${debt.amount.toLocaleString('ru-RU')} ¥ и сделать ${debtor?.display_name} своим Питомцем?`)) return;
    setBusy(true);
    const tx = await applyTransfer(currentUser.id, debt.creditor_id, debt.amount,
      `Выкуп долга «Кандидат в Питомцы»: ${debtor?.display_name ?? ''}`, '/loans');
    if (!tx.ok) { alert(tx.error || 'Ошибка'); setBusy(false); return; }
    await sb.from('debts').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', debt.id);
    await sb.from('participants').update({
      status: 'pet',
      pet_owner_id: currentUser.id,
    }).eq('id', debt.debtor_id);
    await sb.from('notifications').insert([
      { id: uid('n'), recipient_id: debt.debtor_id, type: 'pet_assigned',
        title: 'Вас сделали Питомцем',
        body: `${currentUser.display_name} выкупил ваш долг и стал вашим хозяином.`,
        link_url: '/profile/' + debt.debtor_id, is_read: false },
      { id: uid('n'), recipient_id: QUEEN_ID, type: 'pet_assigned',
        title: 'Новый Питомец',
        body: `${debtor?.display_name} → Питомец ${currentUser.display_name}`,
        link_url: '/profile/' + debt.debtor_id, is_read: false },
    ]);
    setBusy(false);
  };

  const cancelDebt = async () => {
    if (!sb) return;
    if (!confirm('Списать долг полностью?')) return;
    await sb.from('debts').update({ status: 'cancelled' }).eq('id', debt.id);
  };

  const repayFull = async () => {
    if (!sb || !currentUser) return;
    if (currentUser.id !== debt.debtor_id && !isAdmin) { alert('Только должник'); return; }
    if (!confirm(`Погасить долг полностью (${debt.amount.toLocaleString('ru-RU')} ¥)?`)) return;
    setBusy(true);
    const link = '/loans';
    // Если долг на взыскании Мондо — комиссия
    if (debt.status === 'collection' && debt.collector_id === MONDO_ID) {
      const split = splitCollectionCommission(debt.amount, !!debt.executor_id);
      // Платим напрямую: должник → владелец долга на сумму ownerReceived; затем владелец → Мондо
      await applyTransfer(debt.debtor_id, debt.creditor_id, split.ownerReceived,
        `Возврат долга (за вычетом комиссии Мондо)`, link);
      if (split.mondoShare > 0) {
        await applyTransfer(debt.debtor_id, MONDO_ID, split.mondoShare,
          `Комиссия взыскания Мондо`, link);
      }
      if (split.pekoShare > 0 && debt.executor_id) {
        await applyTransfer(debt.debtor_id, debt.executor_id, split.pekoShare,
          `Комиссия исполнителя`, link);
      }
    } else {
      await applyTransfer(debt.debtor_id, debt.creditor_id, debt.amount,
        `Возврат долга: ${debt.description ?? ''}`, link);
    }
    await sb.from('debt_payments').insert({
      id: uid('dp'), debt_id: debt.id, payer_id: debt.debtor_id,
      amount: debt.amount,
    });
    await sb.from('debts').update({
      status: 'paid', paid_at: new Date().toISOString(),
    }).eq('id', debt.id);
    setBusy(false);
  };

  const repayPart = async () => {
    if (!sb || !currentUser) return;
    const amountStr = prompt(`Частичная выплата (¥). Текущий долг: ${debt.amount.toLocaleString('ru-RU')}`, '50000');
    if (!amountStr) return;
    const part = Math.max(0, Math.min(debt.amount, Number(amountStr)));
    if (part <= 0) return;
    setBusy(true);
    const link = '/loans';
    if (debt.status === 'collection' && debt.collector_id === MONDO_ID) {
      const split = splitCollectionCommission(part, !!debt.executor_id);
      await applyTransfer(debt.debtor_id, debt.creditor_id, split.ownerReceived,
        `Частичный возврат (за вычетом комиссии)`, link);
      if (split.mondoShare > 0) {
        await applyTransfer(debt.debtor_id, MONDO_ID, split.mondoShare, `Комиссия взыскания Мондо`, link);
      }
      if (split.pekoShare > 0 && debt.executor_id) {
        await applyTransfer(debt.debtor_id, debt.executor_id, split.pekoShare, `Комиссия исполнителя`, link);
      }
    } else {
      await applyTransfer(debt.debtor_id, debt.creditor_id, part, `Частичный возврат долга`, link);
    }
    await sb.from('debt_payments').insert({
      id: uid('dp'), debt_id: debt.id, payer_id: debt.debtor_id,
      amount: part,
    });
    const remaining = debt.amount - part;
    if (remaining <= 0) {
      await sb.from('debts').update({ status: 'paid', amount: 0, paid_at: new Date().toISOString() }).eq('id', debt.id);
    } else {
      await sb.from('debts').update({ amount: remaining }).eq('id', debt.id);
    }
    setBusy(false);
  };

  const restructure = async () => {
    if (!sb) return;
    const newDueStr = prompt('Новый день срока', String(debt.due_day));
    if (!newDueStr) return;
    const newAmountStr = prompt('Новая сумма долга', String(debt.amount));
    const newAmount = Math.max(1, Number(newAmountStr ?? debt.amount));
    const newDue = Math.max(1, Number(newDueStr));
    await sb.from('debts').update({
      amount: newAmount, due_day: newDue, status: 'restructured',
    }).eq('id', debt.id);
  };

  return (
    <div className={cn('glass p-3 border',
      debt.status === 'overdue' && 'border-red-500/40',
      debt.status === 'collection' && 'border-fuchsia-500/40',
      debt.status === 'pet_candidate' && 'border-amber-500/60',
      debt.status === 'paid' && 'border-emerald-500/40 opacity-70',
    )}>
      <div className="flex items-start gap-2">
        {debtor && <CharacterIcon participant={debtor} size="xs" ringless />}
        <div className="flex-1 min-w-0">
          <div className="text-xs">
            <span className="font-bold">{debtor?.display_name ?? debt.debtor_id}</span>
            <span className="text-muted-foreground"> должен </span>
            <span className="font-bold text-gold">{creditor?.display_name ?? debt.creditor_id}</span>
          </div>
          <div className="text-[10px] text-muted-foreground truncate">{debt.description ?? '—'}</div>
          {debt.collateral_text && (
            <div className="text-[10px] text-amber-300/80 mt-0.5">залог: {debt.collateral_text}</div>
          )}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Yen amount={debt.amount} className="text-sm text-red-300" iconClass="w-3 h-3" />
            {debt.principal_amount && (debt.principal_amount !== debt.amount) && (
              <span className="text-[10px] text-muted-foreground">
                (выдано: {debt.principal_amount.toLocaleString('ru-RU')} @ {debt.interest_rate ?? 0}%)
              </span>
            )}
            <StatusBadge status={debt.status} />
            <span className="text-[10px] text-muted-foreground">срок: день {debt.due_day}</span>
          </div>
          {(collector || executor) && (
            <div className="text-[10px] text-fuchsia-300/80 mt-0.5">
              {collector && <>взыскатель: {collector.display_name}</>}
              {collector && executor && ' · '}
              {executor && <>исполнитель: {executor.display_name}</>}
            </div>
          )}
        </div>
      </div>

      {/* Действия */}
      {debt.status !== 'paid' && debt.status !== 'cancelled' && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {/* Должник */}
          {currentUser?.id === debt.debtor_id && (
            <>
              <button onClick={repayFull} disabled={busy} className="btn-success text-[10px]">✓ Погасить полностью</button>
              <button onClick={repayPart} disabled={busy} className="btn-secondary text-[10px]">Частично</button>
            </>
          )}
          {/* Выкуп долга «Кандидат в Питомцы» — доступен любому игроку, кроме должника */}
          {debt.status === 'pet_candidate' && currentUser && currentUser.id !== debt.debtor_id && isPlayer(currentUser) && (
            <button onClick={buyOutAsPet} disabled={busy} className="btn-warning text-[10px]">
              🐾 Выкупить и стать хозяином
            </button>
          )}
          {/* Кируми / владелец долга / админ */}
          {(forKirumi || isOwner || isAdmin) && (
            <>
              <button onClick={accrueOverdue} className="btn-danger text-[10px]">+{OVERDUE_RATE}% просрочка</button>
              {debt.status !== 'collection' && (
                <button onClick={transferToMondo} className="btn-secondary text-[10px]">→ Мондо</button>
              )}
              <button onClick={restructure} className="btn-secondary text-[10px]">Реструктур.</button>
            </>
          )}
          {/* Мондо или админ */}
          {(forMondo || isMondoUser || isAdmin) && debt.status === 'collection' && !debt.executor_id && (
            <button onClick={assignPeko} className="btn-secondary text-[10px]">→ Пеко</button>
          )}
          {(forMondo || isMondoUser || isAdmin) && debt.amount >= PET_CANDIDATE_THRESHOLD && debt.status !== 'pet_candidate' && (
            <button onClick={markPetCandidate} className="btn-danger text-[10px]">🐾 Кандидат в Питомцы</button>
          )}
          {/* Селестия / админ */}
          {isAdmin && (
            <button onClick={cancelDebt} className="btn-danger text-[10px]">✕ Списать</button>
          )}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: Debt['status'] }) {
  const map: Record<Debt['status'], { cls: string; label: string }> = {
    requested:     { cls: 'bg-amber-500/15 text-amber-300', label: 'запрошен' },
    active:        { cls: 'bg-blue-500/15 text-blue-300', label: 'активный' },
    due_soon:      { cls: 'bg-amber-400/15 text-amber-300', label: 'скоро срок' },
    overdue:       { cls: 'bg-red-500/15 text-red-300', label: 'просрочен' },
    collection:    { cls: 'bg-fuchsia-500/15 text-fuchsia-300', label: 'на взыскании' },
    restructured:  { cls: 'bg-cyan-500/15 text-cyan-300', label: 'реструктурирован' },
    auctioned:     { cls: 'bg-orange-500/15 text-orange-300', label: 'на аукционе' },
    pet_candidate: { cls: 'bg-amber-400/20 text-amber-200', label: 'кандидат в питомцы' },
    paid:          { cls: 'bg-emerald-500/15 text-emerald-300', label: 'погашен' },
    closed:        { cls: 'bg-emerald-500/15 text-emerald-300', label: 'закрыт' },
    declined:      { cls: 'bg-gray-500/15 text-gray-300', label: 'отклонён' },
    cancelled:     { cls: 'bg-gray-500/15 text-gray-300', label: 'отменён' },
  };
  const m = map[status];
  return <span className={cn('px-1.5 py-0.5 rounded text-[10px]', m.cls)}>{m.label}</span>;
}
