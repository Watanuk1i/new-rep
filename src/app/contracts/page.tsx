'use client';

// /contracts — официальные договоры через Кируми.
// Простой UX: 4 поля, кнопка создать → вторая сторона принимает →
// проверяющий подтверждает или фиксирует нарушение.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useStore, uid } from '@/lib/store/StoreProvider';
import { CharacterIcon } from '@/components/ui/CharacterIcon';
import { Yen } from '@/components/ui/Yen';
import { cn, isPlayer } from '@/lib/utils';
import { getSupabase } from '@/lib/supabase/client';
import { applyTransfer, chargeToTreasury, payoutFromTreasury, TREASURY_ID } from '@/lib/store/tx';

const KIRUMI_ID = 'p-15';
const QUEEN_ID = 'p-queen';

interface Contract {
  id: string;
  creator_id: string;
  counterparty_id: string;
  payer_id: string;
  receiver_id: string;
  performer_id: string;
  amount: number;
  payment_mode: 'escrow' | 'instant';
  frozen_amount: number;
  obligation_text: string;
  reason?: string | null;
  due_days?: number | null;
  due_at?: string | null;
  verifier_type: 'kirumi' | 'mondo' | 'peko' | 'celestia' | 'host' | 'auto';
  breach_consequence: 'refund' | 'refund_plus_50' | 'create_debt' | 'send_to_mondo';
  commission_amount: number;
  status:
    | 'draft' | 'pending' | 'counter_offer' | 'active'
    | 'completed' | 'expired' | 'breached' | 'disputed'
    | 'cancelled' | 'rejected';
  created_at: string;
  updated_at: string;
  signed_at?: string | null;
  completed_at?: string | null;
  breached_at?: string | null;
  created_debt_id?: string | null;
}

function calcCommission(amount: number): number {
  return Math.max(20_000, Math.floor(amount * 0.10));
}

export default function ContractsPage() {
  const { state, currentUser, role } = useStore();
  const sb = getSupabase();
  const isAdmin = role === 'gm' || role === 'queen';
  const isKirumi = !!currentUser && currentUser.id === KIRUMI_ID;
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!sb) return;
    let alive = true;
    const load = async () => {
      const { data } = await sb.from('kirumi_contracts').select('*')
        .order('created_at', { ascending: false }).limit(100);
      if (alive) setContracts((data ?? []) as Contract[]);
    };
    load();
    const ch = sb.channel('kirumi-contracts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kirumi_contracts' }, load)
      .subscribe();
    return () => { alive = false; sb.removeChannel(ch); };
  }, [sb]);

  if (!currentUser) {
    return (
      <div className="px-4 py-12 text-center max-w-md mx-auto">
        <p className="text-sm text-muted-foreground mb-4">Войдите, чтобы создавать договоры</p>
        <Link href="/login" className="btn-primary inline-flex">Войти</Link>
      </div>
    );
  }

  const myActive = contracts.filter(c =>
    (c.creator_id === currentUser.id || c.counterparty_id === currentUser.id)
    && (c.status === 'pending' || c.status === 'active' || c.status === 'expired' || c.status === 'disputed')
  );
  // Входящие — те, где я counterparty и pending
  const incomingForMe = contracts.filter(c =>
    c.counterparty_id === currentUser.id && c.status === 'pending'
  );
  const visibleAll = isAdmin || isKirumi
    ? contracts
    : contracts.filter(c =>
        c.creator_id === currentUser.id || c.counterparty_id === currentUser.id
        || c.payer_id === currentUser.id || c.receiver_id === currentUser.id);

  return (
    <div className="px-3 sm:px-4 py-4 max-w-2xl mx-auto space-y-4 animate-fade-in">
      <div className="glass-strong gold-border p-5">
        <div className="text-[10px] uppercase tracking-widest text-gold/70">📜 Защищённые сделки</div>
        <h1 className="font-heading text-xl font-bold text-gradient-gold mt-1">Договоры через Кируми</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Деньги и условия фиксируются системой. Нарушение → автоматический штраф или долг.
          Комиссия Кируми — max(10%, ¥20 000).
        </p>
      </div>

      <button onClick={() => setCreating(!creating)} className="btn-primary w-full">
        {creating ? '✕ Отмена' : '+ Создать договор'}
      </button>

      {creating && <CreateContractForm onDone={() => setCreating(false)} />}

      {/* Входящие — требуют вашего ответа */}
      {incomingForMe.length > 0 && (
        <section>
          <div className="text-[10px] uppercase tracking-widest text-emerald-300 mb-2 animate-pulse">
            📥 Вам предложен{incomingForMe.length === 1 ? '' : 'ы'} {incomingForMe.length === 1 ? 'договор' : `договоры (${incomingForMe.length})`}
          </div>
          <div className="space-y-2">
            {incomingForMe.map(c => <ContractCard key={c.id} contract={c} />)}
          </div>
        </section>
      )}

      {/* Активные мои */}
      {myActive.length > 0 && (
        <section>
          <div className="text-[10px] uppercase tracking-widest text-amber-300 mb-2">⏳ Ваши активные договоры</div>
          <div className="space-y-2">
            {myActive.map(c => <ContractCard key={c.id} contract={c} />)}
          </div>
        </section>
      )}

      {/* Все доступные */}
      <section>
        <div className="text-[10px] uppercase tracking-widest text-gold/70 mb-2">
          {isAdmin || isKirumi ? `Все договоры (${contracts.length})` : 'Доступные вам'}
        </div>
        <div className="space-y-2">
          {visibleAll.length === 0 ? (
            <div className="glass p-6 text-center text-sm text-muted-foreground">
              Договоров пока нет.
            </div>
          ) : visibleAll.map(c => <ContractCard key={c.id} contract={c} />)}
        </div>
      </section>
    </div>
  );
}

// ===========================================================================
// Создание договора
// ===========================================================================

function CreateContractForm({ onDone }: { onDone: () => void }) {
  const { state, currentUser } = useStore();
  const sb = getSupabase();
  const [counterpartyId, setCounterpartyId] = useState('');
  const [amount, setAmount] = useState(100_000);
  const [paymentMode, setPaymentMode] = useState<'escrow' | 'instant'>('escrow');
  const [obligationText, setObligationText] = useState('');
  const [dueDays, setDueDays] = useState(3);
  const [verifier, setVerifier] = useState<'kirumi' | 'mondo' | 'peko' | 'celestia' | 'host'>('kirumi');
  const [consequence, setConsequence] = useState<'refund' | 'refund_plus_50' | 'create_debt' | 'send_to_mondo'>('refund_plus_50');
  // Кто получает деньги (по умолчанию — вторая сторона)
  const [payerIsCreator, setPayerIsCreator] = useState(true);
  const [busy, setBusy] = useState(false);

  if (!currentUser) return null;
  const others = state.participants.filter(p =>
    isPlayer(p) && p.is_active && p.id !== currentUser.id
  );
  const commission = calcCommission(amount);

  const submit = async () => {
    if (!sb || !counterpartyId || !obligationText.trim() || amount <= 0) return;
    setBusy(true);
    const id = uid('kc');
    const payerId = payerIsCreator ? currentUser.id : counterpartyId;
    const receiverId = payerIsCreator ? counterpartyId : currentUser.id;
    const performerId = counterpartyId; // условие выполняет вторая сторона

    await sb.from('kirumi_contracts').insert({
      id,
      creator_id: currentUser.id,
      counterparty_id: counterpartyId,
      payer_id: payerId,
      receiver_id: receiverId,
      performer_id: performerId,
      amount,
      payment_mode: paymentMode,
      frozen_amount: 0,
      obligation_text: obligationText.trim(),
      due_type: 'days',
      due_days: dueDays,
      verifier_type: verifier,
      breach_consequence: consequence,
      commission_amount: commission,
      commission_payer_mode: 'creator',
      commission_creator_amount: commission,
      commission_counterparty_amount: 0,
      status: 'pending',
    });

    // Уведомление второй стороне
    await sb.from('notifications').insert({
      id: uid('n'),
      recipient_id: counterpartyId,
      type: 'kirumi_contract',
      title: '📜 Вам предложен договор',
      body: `${currentUser.display_name} → ${obligationText.trim().slice(0, 60)}`,
      link_url: '/contracts',
      is_read: false,
    });
    // Уведомление Кируми
    await sb.from('notifications').insert({
      id: uid('n'),
      recipient_id: KIRUMI_ID,
      type: 'kirumi_contract',
      title: '📜 Новый договор',
      body: `Сумма ${amount.toLocaleString('ru-RU')}, комиссия ${commission.toLocaleString('ru-RU')}`,
      link_url: '/contracts',
      is_read: false,
    });

    setBusy(false);
    onDone();
  };

  return (
    <div className="glass-strong p-4 space-y-3 animate-slide-down">
      <div className="text-[10px] uppercase tracking-widest text-gold/70">Шаг 1. Стороны</div>
      <div>
        <label className="text-[10px] text-muted-foreground">Вторая сторона</label>
        <select className="input-field text-sm"
          value={counterpartyId} onChange={e => setCounterpartyId(e.target.value)}>
          <option value="">— выбрать игрока —</option>
          {others.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
        </select>
      </div>

      <div className="text-[10px] uppercase tracking-widest text-gold/70">Шаг 2. Деньги</div>
      <div>
        <label className="text-[10px] text-muted-foreground">Сумма договора (¥)</label>
        <input type="number" min={10_000} step={10_000} value={amount}
          onChange={e => setAmount(Math.max(10_000, Number(e.target.value)))}
          className="input-field font-mono text-sm" />
        <p className="text-[10px] text-muted-foreground mt-1">
          Комиссия Кируми (платит создатель): <Yen amount={commission} className="inline text-gold" iconClass="hidden" /> ¥
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setPayerIsCreator(true)}
          className={cn('p-2 rounded-lg border text-xs',
            payerIsCreator ? 'bg-gold/15 border-gold/50 text-gold' : 'bg-card/40 border-white/8')}>
          Вы → платите
        </button>
        <button onClick={() => setPayerIsCreator(false)}
          className={cn('p-2 rounded-lg border text-xs',
            !payerIsCreator ? 'bg-gold/15 border-gold/50 text-gold' : 'bg-card/40 border-white/8')}>
          Вторая сторона → платит
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setPaymentMode('escrow')}
          className={cn('p-2 rounded-lg border text-xs',
            paymentMode === 'escrow' ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300' : 'bg-card/40 border-white/8')}>
          🔒 Заморозка
        </button>
        <button onClick={() => setPaymentMode('instant')}
          className={cn('p-2 rounded-lg border text-xs',
            paymentMode === 'instant' ? 'bg-amber-500/15 border-amber-500/50 text-amber-300' : 'bg-card/40 border-white/8')}>
          ⚡ Сразу
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Заморозка: деньги уйдут после подтверждения. Сразу: уйдут сейчас, при нарушении создаётся долг.
      </p>

      <div className="text-[10px] uppercase tracking-widest text-gold/70">Шаг 3. Условие</div>
      <textarea value={obligationText} onChange={e => setObligationText(e.target.value)}
        placeholder="Что должна выполнить сторона?"
        rows={3} className="input-field text-sm resize-none" />

      <div>
        <label className="text-[10px] text-muted-foreground">Срок (дней)</label>
        <input type="number" min={1} max={30} value={dueDays}
          onChange={e => setDueDays(Math.max(1, Math.min(30, Number(e.target.value))))}
          className="input-field font-mono text-sm" />
      </div>

      <div className="text-[10px] uppercase tracking-widest text-gold/70">Шаг 4. Проверка</div>
      <div>
        <label className="text-[10px] text-muted-foreground">Проверяющий</label>
        <select value={verifier} onChange={e => setVerifier(e.target.value as any)}
          className="input-field text-sm">
          <option value="kirumi">Кируми (по умолчанию)</option>
          <option value="mondo">Мондо</option>
          <option value="peko">Пеко</option>
          <option value="celestia">Селестия</option>
          <option value="host">Ведущий</option>
        </select>
      </div>
      <div>
        <label className="text-[10px] text-muted-foreground">При нарушении</label>
        <select value={consequence} onChange={e => setConsequence(e.target.value as any)}
          className="input-field text-sm">
          <option value="refund">Просто вернуть деньги</option>
          <option value="refund_plus_50">Вернуть + штраф 50%</option>
          <option value="create_debt">Создать долг нарушителю</option>
          <option value="send_to_mondo">Передать долг Мондо (+50%)</option>
        </select>
      </div>

      <button onClick={submit}
        disabled={busy || !counterpartyId || !obligationText.trim()}
        className="btn-primary w-full">
        {busy ? '...' : '📜 Отправить второй стороне'}
      </button>
    </div>
  );
}

// ===========================================================================
// Карточка договора
// ===========================================================================

function ContractCard({ contract }: { contract: Contract }) {
  const { state, currentUser, role } = useStore();
  const sb = getSupabase();
  const isAdmin = role === 'gm' || role === 'queen';
  const isKirumi = !!currentUser && currentUser.id === KIRUMI_ID;
  const isCreator = !!currentUser && currentUser.id === contract.creator_id;
  const isCounterparty = !!currentUser && currentUser.id === contract.counterparty_id;
  const isVerifier = !!currentUser && (
    (contract.verifier_type === 'kirumi' && currentUser.id === KIRUMI_ID) ||
    (contract.verifier_type === 'mondo' && currentUser.id === 'p-11') ||
    (contract.verifier_type === 'peko' && currentUser.id === 'p-peko') ||
    (contract.verifier_type === 'celestia' && currentUser.id === QUEEN_ID) ||
    (contract.verifier_type === 'host' && role === 'gm')
  );

  const creator = state.participants.find(p => p.id === contract.creator_id);
  const counterparty = state.participants.find(p => p.id === contract.counterparty_id);
  const payer = state.participants.find(p => p.id === contract.payer_id);
  const receiver = state.participants.find(p => p.id === contract.receiver_id);

  const acceptContract = async () => {
    if (!sb || !currentUser) return;
    const link = '/contracts';
    // 1. Списать комиссию с создателя в Казну (Фонд Тогами / Кируми)
    if (contract.commission_amount > 0) {
      const tx = await chargeToTreasury(contract.creator_id, contract.commission_amount,
        `Комиссия Кируми за договор`, link);
      if (!tx.ok) { alert(tx.error || 'Не удалось списать комиссию'); return; }
    }
    // 2. По режиму оплаты
    if (contract.payment_mode === 'instant') {
      // Перевод сразу
      const tx = await applyTransfer(contract.payer_id, contract.receiver_id, contract.amount,
        `Договор Кируми: ${contract.obligation_text.slice(0, 50)}`, link);
      if (!tx.ok) { alert(tx.error || 'Ошибка перевода'); return; }
    } else {
      // Заморозка — снимаем у плательщика в Казну (там она хранится)
      const tx = await chargeToTreasury(contract.payer_id, contract.amount,
        `Договор Кируми (заморозка)`, link);
      if (!tx.ok) { alert(tx.error || 'Ошибка заморозки'); return; }
    }
    const dueAt = contract.due_days
      ? new Date(Date.now() + contract.due_days * 24 * 60 * 60 * 1000).toISOString()
      : null;
    await sb.from('kirumi_contracts').update({
      status: 'active',
      frozen_amount: contract.payment_mode === 'escrow' ? contract.amount : 0,
      signed_at: new Date().toISOString(),
      due_at: dueAt,
    }).eq('id', contract.id);
    await sb.from('notifications').insert({
      id: uid('n'),
      recipient_id: contract.creator_id,
      type: 'kirumi_contract',
      title: '✓ Договор подписан',
      body: contract.obligation_text.slice(0, 60),
      link_url: link, is_read: false,
    });
  };

  const rejectContract = async () => {
    if (!sb) return;
    await sb.from('kirumi_contracts').update({ status: 'rejected' }).eq('id', contract.id);
    await sb.from('notifications').insert({
      id: uid('n'),
      recipient_id: contract.creator_id,
      type: 'kirumi_contract',
      title: '✕ Договор отклонён',
      body: contract.obligation_text.slice(0, 60),
      link_url: '/contracts', is_read: false,
    });
  };

  const confirmCompletion = async () => {
    if (!sb) return;
    const link = '/contracts';
    // Если деньги были заморожены — отдать получателю
    if (contract.payment_mode === 'escrow' && contract.frozen_amount > 0) {
      await payoutFromTreasury(contract.receiver_id, contract.frozen_amount,
        `Договор Кируми выполнен: ${contract.obligation_text.slice(0, 50)}`, link);
    }
    await sb.from('kirumi_contracts').update({
      status: 'completed',
      frozen_amount: 0,
      completed_at: new Date().toISOString(),
    }).eq('id', contract.id);
    await sb.from('notifications').insert([
      {
        id: uid('n'), recipient_id: contract.creator_id, type: 'kirumi_contract',
        title: '✓ Договор выполнен', body: contract.obligation_text.slice(0, 60),
        link_url: link, is_read: false,
      },
      {
        id: uid('n'), recipient_id: contract.counterparty_id, type: 'kirumi_contract',
        title: '✓ Договор выполнен', body: contract.obligation_text.slice(0, 60),
        link_url: link, is_read: false,
      },
    ]);
  };

  const fixBreach = async () => {
    if (!sb) return;
    if (!confirm(`Зафиксировать нарушение? Будет применено: ${
      contract.breach_consequence === 'refund' ? 'возврат денег' :
      contract.breach_consequence === 'refund_plus_50' ? 'возврат + штраф 50%' :
      contract.breach_consequence === 'create_debt' ? 'создать долг' :
      'передать долг Мондо'
    }`)) return;
    const link = '/contracts';
    const violator = contract.performer_id;
    const victim = contract.receiver_id === violator ? contract.payer_id : contract.payer_id;

    if (contract.breach_consequence === 'refund' || contract.breach_consequence === 'refund_plus_50') {
      // Если заморожено — возвращаем плательщику
      if (contract.payment_mode === 'escrow' && contract.frozen_amount > 0) {
        await payoutFromTreasury(contract.payer_id, contract.frozen_amount,
          `Договор Кируми нарушен — возврат`, link);
      }
      // При +50% штрафе — создаём долг нарушителю
      if (contract.breach_consequence === 'refund_plus_50') {
        const fineAmount = Math.floor(contract.amount * 0.5);
        const debtId = uid('d');
        await sb.from('debts').insert({
          id: debtId,
          debtor_id: violator,
          creditor_id: TREASURY_ID,
          amount: fineAmount,
          principal_amount: fineAmount,
          interest_rate: 0,
          description: `Штраф за нарушение договора Кируми`,
          due_day: 99,
          status: 'overdue',
          initiator: 'creditor',
          source: 'contract_breach',
        });
        await sb.from('kirumi_contracts').update({ created_debt_id: debtId }).eq('id', contract.id);
      }
    } else if (contract.breach_consequence === 'create_debt' || contract.breach_consequence === 'send_to_mondo') {
      const debtAmount = contract.breach_consequence === 'send_to_mondo'
        ? Math.floor(contract.amount * 1.5)
        : contract.amount;
      const debtId = uid('d');
      await sb.from('debts').insert({
        id: debtId,
        debtor_id: violator,
        creditor_id: TREASURY_ID,
        amount: debtAmount,
        principal_amount: contract.amount,
        interest_rate: 0,
        description: `Долг по нарушенному договору Кируми`,
        due_day: 99,
        status: contract.breach_consequence === 'send_to_mondo' ? 'collection' : 'active',
        collector_id: contract.breach_consequence === 'send_to_mondo' ? 'p-11' : null,
        initiator: 'creditor',
        source: 'contract_breach',
      });
      await sb.from('kirumi_contracts').update({ created_debt_id: debtId }).eq('id', contract.id);
    }

    await sb.from('kirumi_contracts').update({
      status: 'breached',
      breached_at: new Date().toISOString(),
    }).eq('id', contract.id);
    await sb.from('notifications').insert([
      {
        id: uid('n'), recipient_id: contract.creator_id, type: 'kirumi_contract',
        title: '⚠️ Договор нарушен', body: contract.obligation_text.slice(0, 60),
        link_url: link, is_read: false,
      },
      {
        id: uid('n'), recipient_id: contract.counterparty_id, type: 'kirumi_contract',
        title: '⚠️ Вы нарушили договор', body: contract.obligation_text.slice(0, 60),
        link_url: link, is_read: false,
      },
    ]);
  };

  const cancelContract = async () => {
    if (!sb) return;
    if (!confirm('Отменить договор?')) return;
    // Возврат заморозки и комиссии
    if (contract.payment_mode === 'escrow' && contract.frozen_amount > 0) {
      await payoutFromTreasury(contract.payer_id, contract.frozen_amount,
        `Договор Кируми отменён — возврат`, '/contracts');
    }
    await sb.from('kirumi_contracts').update({
      status: 'cancelled',
      frozen_amount: 0,
    }).eq('id', contract.id);
  };

  const statusLabel: Record<Contract['status'], { cls: string; label: string }> = {
    draft: { cls: 'bg-gray-500/15 text-gray-300', label: 'черновик' },
    pending: { cls: 'bg-amber-500/15 text-amber-300', label: 'ждёт ответа' },
    counter_offer: { cls: 'bg-blue-500/15 text-blue-300', label: 'встреч. условия' },
    active: { cls: 'bg-emerald-500/15 text-emerald-300', label: 'активный' },
    completed: { cls: 'bg-emerald-500/15 text-emerald-300', label: '✓ выполнен' },
    expired: { cls: 'bg-amber-500/15 text-amber-300', label: 'срок истёк' },
    breached: { cls: 'bg-red-500/15 text-red-300', label: '✕ нарушен' },
    disputed: { cls: 'bg-fuchsia-500/15 text-fuchsia-300', label: 'спор' },
    cancelled: { cls: 'bg-gray-500/15 text-gray-300', label: 'отменён' },
    rejected: { cls: 'bg-gray-500/15 text-gray-300', label: 'отклонён' },
  };
  const sl = statusLabel[contract.status];

  return (
    <div className={cn('glass p-4 border-l-4',
      contract.status === 'active' ? 'border-emerald-500/40' :
      contract.status === 'breached' ? 'border-red-500/40' :
      contract.status === 'completed' ? 'border-emerald-500/60' :
      'border-amber-500/40')}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {creator && <CharacterIcon participant={creator} size="xs" ringless />}
          <span className="text-xs">{creator?.display_name ?? '?'}</span>
          <span className="text-muted-foreground text-xs">↔</span>
          {counterparty && <CharacterIcon participant={counterparty} size="xs" ringless />}
          <span className="text-xs truncate">{counterparty?.display_name ?? '?'}</span>
        </div>
        <span className={cn('text-[10px] px-2 py-0.5 rounded', sl.cls)}>{sl.label}</span>
      </div>

      <div className="text-sm whitespace-pre-line mb-2">{contract.obligation_text}</div>

      <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
        <div>
          {contract.payment_mode === 'escrow' ? '🔒 Заморозка' : '⚡ Сразу'}:
          {' '}<Yen amount={contract.amount} className="inline text-gold" iconClass="hidden" /> ¥
        </div>
        <div>
          {payer?.display_name ?? '?'} → {receiver?.display_name ?? '?'}
        </div>
      </div>
      <div className="text-[10px] text-muted-foreground mt-1">
        Проверяет: <b>{contract.verifier_type}</b> · При нарушении: <b>{
          contract.breach_consequence === 'refund' ? 'возврат' :
          contract.breach_consequence === 'refund_plus_50' ? '+50%' :
          contract.breach_consequence === 'create_debt' ? 'долг' :
          'долг → Мондо'
        }</b>
        {contract.due_at && ` · до ${new Date(contract.due_at).toLocaleDateString('ru-RU')}`}
      </div>

      {/* Действия */}
      {contract.status === 'pending' && isCounterparty && (
        <div className="grid grid-cols-2 gap-2 mt-3">
          <button onClick={acceptContract} className="btn-success text-xs">✓ Принять и подписать</button>
          <button onClick={rejectContract} className="btn-danger text-xs">✕ Отклонить</button>
        </div>
      )}

      {contract.status === 'pending' && isCreator && (
        <button onClick={cancelContract} className="btn-secondary w-full text-xs mt-2">
          Отозвать предложение
        </button>
      )}

      {contract.status === 'active' && (isVerifier || isAdmin) && (
        <div className="grid grid-cols-2 gap-2 mt-3">
          <button onClick={confirmCompletion} className="btn-success text-xs">✓ Подтвердить выполнение</button>
          <button onClick={fixBreach} className="btn-danger text-xs">✕ Зафиксировать нарушение</button>
        </div>
      )}

      {(isAdmin || isKirumi) && (contract.status === 'active' || contract.status === 'pending') && (
        <button onClick={cancelContract} className="text-[10px] text-red-300 mt-2 inline-block">
          ⚠️ Отменить (возврат)
        </button>
      )}
    </div>
  );
}
