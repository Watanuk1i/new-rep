'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useStore, uid } from '@/lib/store/StoreProvider';
import { Yen } from '@/components/ui/Yen';
import { CharacterIcon } from '@/components/ui/CharacterIcon';
import { cn, isPlayer } from '@/lib/utils';
import { getSupabase } from '@/lib/supabase/client';
import { TREASURY_ID, applyTransfer } from '@/lib/store/tx';
import type { Debt } from '@/lib/store/types';

export default function DebtsPage() {
  const { state, currentUser, role, notify, addHistory } = useStore();
  const [tab, setTab] = useState<'incoming' | 'mine' | 'closed' | 'create'>('mine');
  const sb = getSupabase();
  const isAdmin = role === 'gm' || role === 'queen' || role === 'collector';

  if (!currentUser) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="text-sm text-muted-foreground mb-4">Войдите, чтобы видеть долги</p>
        <Link href="/login" className="btn-primary inline-flex">Войти</Link>
      </div>
    );
  }

  // Запросы, которые ждут подтверждения текущего пользователя:
  // - инициатор=debtor → должен подтвердить кредитор
  // - инициатор=creditor → должен подтвердить должник
  const incoming = state.debts.filter(d => {
    if (d.status !== 'requested') return false;
    if (d.initiator === 'debtor' && d.creditor_id === currentUser.id) return true;
    if (d.initiator === 'creditor' && d.debtor_id === currentUser.id) return true;
    return false;
  });

  const myDebts = state.debts.filter(d =>
    (d.debtor_id === currentUser.id || d.creditor_id === currentUser.id)
  );
  const myActive = myDebts.filter(d => d.status === 'active' || d.status === 'requested');
  const closed = myDebts.filter(d => d.status === 'closed' || d.status === 'declined');

  // Долги текущего игрока перед Казной — показываем отдельным блоком
  const myTreasuryDebts = state.debts.filter(d =>
    d.debtor_id === currentUser.id &&
    d.creditor_id === TREASURY_ID &&
    d.status === 'active'
  );
  const myTreasuryDebtTotal = myTreasuryDebts.reduce((s, d) => s + d.amount, 0);

  const list = tab === 'incoming' ? incoming : tab === 'mine' ? myActive : tab === 'closed' ? closed : [];

  const confirmDebt = async (d: Debt) => {
    if (!sb) return;
    const debtor = state.participants.find(p => p.id === d.debtor_id);
    const creditor = state.participants.find(p => p.id === d.creditor_id);
    if (!debtor || !creditor) return;
    // RPC apply_transfer: атомарно списывает с кредитора и зачисляет должнику, пишет history.
    const tx = await applyTransfer(creditor.id, debtor.id, d.amount,
      `Долг: ${d.description || 'без описания'}`, '/debts');
    if (!tx.ok) { alert(tx.error || 'Не удалось зачислить долг'); return; }
    await sb.from('debts').update({ status: 'active' }).eq('id', d.id);
    await notify(d.initiator === 'debtor' ? d.debtor_id : d.creditor_id, {
      type: 'debt_request',
      title: 'Долг подтверждён',
      body: `${currentUser.display_name} подтвердил перевод: ${d.amount.toLocaleString('ru-RU')} ейнов`,
      link_url: '/debts',
    });
  };

  const declineDebt = async (d: Debt) => {
    if (!sb) return;
    await sb.from('debts').update({ status: 'declined' }).eq('id', d.id);
    await notify(d.initiator === 'debtor' ? d.debtor_id : d.creditor_id, {
      type: 'debt_request',
      title: 'Запрос отклонён',
      body: `${currentUser.display_name} отклонил запрос на долг`,
      link_url: '/debts',
    });
  };

  const closeDebt = async (d: Debt) => {
    if (!sb) return;
    if (!confirm('Закрыть долг? Должник вернёт сумму кредитору.')) return;
    const debtor = state.participants.find(p => p.id === d.debtor_id);
    const creditor = state.participants.find(p => p.id === d.creditor_id);
    if (!debtor || !creditor) return;
    // RPC сам пишет history; если у должника не хватит — допишет авто-долг.
    const tx = await applyTransfer(debtor.id, creditor.id, d.amount,
      `Возврат долга: ${d.description || 'Долг'}`, '/debts');
    if (!tx.ok) { alert(tx.error || 'Ошибка'); return; }
    await sb.from('debts').update({ status: 'closed' }).eq('id', d.id);
  };

  return (
    <div className="px-3 sm:px-4 py-4 max-w-2xl mx-auto space-y-4 animate-fade-in">
      <div className="relative glass-strong crimson-border p-5">
        <div className="text-[10px] font-bold uppercase tracking-widest text-red-300/70 mb-1">📜 Кодекс чести</div>
        <h1 className="font-heading text-xl font-bold text-red-200">Долги и обязательства</h1>
        <p className="text-xs text-muted-foreground mt-1">Запросы и подтверждения. Деньги переводятся только после согласия.</p>
      </div>

      {myTreasuryDebts.length > 0 && (
        <div className="glass-strong gold-border p-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-amber-300/80">🏛️ Долг Фонду Тогами</div>
              <div className="text-xs text-muted-foreground">Системные списания, превысившие баланс</div>
            </div>
            <Yen amount={myTreasuryDebtTotal} className="text-base text-red-300" iconClass="w-4 h-4" />
          </div>
          <div className="space-y-1 mt-2">
            {myTreasuryDebts.map(d => (
              <div key={d.id} className="text-[11px] text-muted-foreground flex justify-between gap-2">
                <span className="truncate">{d.description || 'Долг'}</span>
                <span className="text-red-300 font-mono shrink-0">−{d.amount.toLocaleString('ru-RU')}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted mt-2">
            Долг закрывается автоматически при поступлении средств (или ведущим вручную).
          </p>
        </div>
      )}

      <div className="scroll-x">
        {[
          { key: 'incoming', label: `Запросы · ${incoming.length}`, icon: '📩' },
          { key: 'mine', label: 'Активные', icon: '⏳' },
          { key: 'closed', label: 'Архив', icon: '✓' },
          // «Создать» доступно только админу/Кируми/Селестии — обычные игроки используют /transfers и /loans
          ...(isAdmin || (currentUser && (currentUser.id === 'p-15' || currentUser.id === 'p-queen'))
            ? [{ key: 'create', label: 'Создать', icon: '+' }]
            : []),
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className={cn('tab-pill', tab === t.key ? 'tab-pill-active' : 'tab-pill-inactive')}>
            <span>{t.icon}</span><span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Подсказка: для обычных игроков отдельные правильные пути */}
      {!isAdmin && currentUser && currentUser.id !== 'p-15' && currentUser.id !== 'p-queen' && (
        <div className="glass p-3 text-[11px] text-muted-foreground space-y-1">
          <div>💸 Перевести деньги другому: <Link href="/transfers" className="text-gold underline">/transfers</Link></div>
          <div>💳 Запросить официальный кредит у Кируми: <Link href="/loans" className="text-gold underline">/loans</Link></div>
        </div>
      )}

      {tab === 'create' ? (
        <CreateDebtForm onCreated={() => setTab('mine')} />
      ) : list.length === 0 ? (
        <div className="glass p-6 text-center">
          <div className="text-3xl mb-2 opacity-30">📜</div>
          <p className="text-sm text-muted-foreground">
            {tab === 'incoming' ? 'Нет запросов на подтверждение.' :
              tab === 'mine' ? 'Нет активных долгов.' : 'Архив пуст.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map(d => {
            const debtor = state.participants.find(p => p.id === d.debtor_id);
            const creditor = state.participants.find(p => p.id === d.creditor_id);
            const needConfirm =
              d.status === 'requested' &&
              ((d.initiator === 'debtor' && d.creditor_id === currentUser.id) ||
                (d.initiator === 'creditor' && d.debtor_id === currentUser.id));
            const canClose = d.status === 'active' &&
              (d.debtor_id === currentUser.id || d.creditor_id === currentUser.id || isAdmin);

            return (
              <div key={d.id} className="glass-strong crimson-border p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-bold text-sm">{d.description || 'Долг'}</h3>
                  <span className={cn('status-badge border',
                    d.status === 'requested' && 'bg-amber-500/15 text-amber-300 border-amber-500/30',
                    d.status === 'active' && 'bg-red-500/15 text-red-300 border-red-500/30',
                    d.status === 'closed' && 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
                    d.status === 'declined' && 'bg-gray-500/15 text-gray-400 border-gray-500/30',
                  )}>
                    {d.status === 'requested' && 'Ожидает'}
                    {d.status === 'active' && 'Активен'}
                    {d.status === 'closed' && 'Закрыт'}
                    {d.status === 'declined' && 'Отклонён'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs mb-3 flex-wrap">
                  {debtor && (
                    <Link href={`/profile/${debtor.id}`} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-red-500/10 border border-red-500/20">
                      <CharacterIcon participant={debtor} size="xs" ringless />
                      <span className="text-red-300 font-bold truncate max-w-[80px]">{debtor.display_name}</span>
                    </Link>
                  )}
                  <span className="text-muted">→ должен</span>
                  {creditor && (
                    creditor.id === TREASURY_ID ? (
                      <span className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30">
                        <span className="text-base leading-none">🏛️</span>
                        <span className="text-amber-200 font-bold">Фонду Тогами</span>
                      </span>
                    ) : (
                      <Link href={`/profile/${creditor.id}`} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gold/10 border border-gold/20">
                        <CharacterIcon participant={creditor} size="xs" ringless />
                        <span className="text-gold font-bold truncate max-w-[80px]">{creditor.display_name}</span>
                      </Link>
                    )
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <Yen amount={d.amount} className="text-base text-gold" iconClass="w-4 h-4" />
                  <div className="text-[10px] text-muted">⏰ День {d.due_day}</div>
                </div>

                {needConfirm && (
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <button onClick={() => confirmDebt(d)} className="btn-success text-xs">✓ Подтвердить</button>
                    <button onClick={() => declineDebt(d)} className="btn-danger text-xs">✗ Отклонить</button>
                  </div>
                )}
                {canClose && (
                  <button onClick={() => closeDebt(d)} className="btn-success w-full mt-3 text-xs">
                    ✓ Закрыть долг (вернуть деньги)
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CreateDebtForm({ onCreated }: { onCreated: () => void }) {
  const { state, currentUser, notify } = useStore();
  const [partnerId, setPartnerId] = useState('');
  const [amount, setAmount] = useState(10_000);
  const [description, setDescription] = useState('');
  const [day, setDay] = useState(() => (state.room?.day ?? 1) + 2);
  const [direction, setDirection] = useState<'borrow' | 'lend'>('borrow');
  const [busy, setBusy] = useState(false);
  const sb = getSupabase();

  const others = state.participants.filter(p =>
    isPlayer(p) && p.id !== currentUser?.id
  );
  const canSubmit = currentUser && partnerId && amount > 0;

  const submit = async () => {
    if (!canSubmit || !sb || !currentUser) return;
    setBusy(true);
    const id = uid('debt');
    const debtor_id = direction === 'borrow' ? currentUser.id : partnerId;
    const creditor_id = direction === 'borrow' ? partnerId : currentUser.id;
    const initiator = direction === 'borrow' ? 'debtor' : 'creditor';

    await sb.from('debts').insert({
      id, debtor_id, creditor_id, amount,
      description: description.trim() || 'Долг',
      due_day: day, status: 'requested', initiator,
    });
    // Уведомление другой стороне
    const recipient = direction === 'borrow' ? partnerId : partnerId;
    await notify(recipient, {
      type: 'debt_request',
      title: direction === 'borrow' ? 'У вас просят в долг' : 'Вам предлагают долг',
      body: `${currentUser.display_name}: ${amount.toLocaleString('ru-RU')} ейнов · «${description || 'Долг'}»`,
      link_url: '/debts',
    });
    setBusy(false);
    onCreated();
  };

  if (!currentUser) return null;

  return (
    <div className="glass p-4 space-y-3">
      <div>
        <label className="text-[10px] font-bold uppercase tracking-widest text-gold mb-1 block">Тип запроса</label>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setDirection('borrow')}
            className={cn('p-3 rounded-xl border text-sm font-bold',
              direction === 'borrow' ? 'bg-gold/15 border-gold/50 text-gold' : 'bg-card/40 border-white/8')}>
            ↓ Взять в долг
          </button>
          <button onClick={() => setDirection('lend')}
            className={cn('p-3 rounded-xl border text-sm font-bold',
              direction === 'lend' ? 'bg-gold/15 border-gold/50 text-gold' : 'bg-card/40 border-white/8')}>
            ↑ Дать в долг
          </button>
        </div>
      </div>
      <div>
        <label className="text-[10px] font-bold uppercase tracking-widest text-gold mb-1 block">
          {direction === 'borrow' ? 'У кого занять' : 'Кому одолжить'}
        </label>
        <select value={partnerId} onChange={e => setPartnerId(e.target.value)} className="input-field">
          <option value="">— выберите —</option>
          {others.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
        </select>
      </div>
      <div>
        <label className="text-[10px] font-bold uppercase tracking-widest text-gold mb-1 block">Сумма (ейны)</label>
        <input type="number" value={amount} onChange={e => setAmount(Math.max(0, Number(e.target.value)))}
          className="input-field font-mono" min={1} />
      </div>
      <div>
        <label className="text-[10px] font-bold uppercase tracking-widest text-gold mb-1 block">Описание</label>
        <input value={description} onChange={e => setDescription(e.target.value)}
          placeholder="Например: проиграл в кости" className="input-field" />
      </div>
      <div>
        <label className="text-[10px] font-bold uppercase tracking-widest text-gold mb-1 flex justify-between">
          <span>Срок (день)</span>
          <span className="font-mono normal-case">День {day}</span>
        </label>
        <input type="number" min={1} max={99} value={day}
          onChange={e => setDay(Math.max(1, Math.min(99, Number(e.target.value))))}
          className="input-field font-mono" />
      </div>
      <button onClick={submit} disabled={busy || !canSubmit}
        className={cn('btn-primary w-full', (busy || !canSubmit) && 'opacity-50')}>
        {busy ? '...' : '📜 Отправить запрос'}
      </button>
      <p className="text-[10px] text-muted text-center">
        Деньги переведутся только после подтверждения второй стороной.
      </p>
    </div>
  );
}
