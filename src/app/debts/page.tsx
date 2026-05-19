'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useStore } from '@/lib/store/StoreProvider';
import { Yen } from '@/components/ui/Yen';
import { CharacterIcon } from '@/components/ui/CharacterIcon';
import { cn, uid } from '@/lib/utils';

export default function DebtsPage() {
  const { state, currentUser, dispatch, role } = useStore();
  const [tab, setTab] = useState<'active' | 'closed' | 'create'>('active');

  const list = state.debts.filter(d => tab === 'active' ? d.status === 'active' : d.status === 'closed');

  return (
    <div className="px-3 sm:px-4 py-4 max-w-2xl mx-auto space-y-4 animate-fade-in">
      <div className="relative glass-strong crimson-border p-5 overflow-hidden">
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-crimson/20 rounded-full blur-3xl pointer-events-none" />
        <div className="relative">
          <div className="text-[10px] font-bold uppercase tracking-widest text-red-300/70 mb-1">📜 Кодекс чести</div>
          <h1 className="font-heading text-xl font-bold text-red-200">Долги и обязательства</h1>
          <p className="text-xs text-muted-foreground mt-1">Отказ от выплаты — позор, фиксируемый Ведущим.</p>
        </div>
      </div>

      <div className="scroll-x">
        {[
          { key: 'active', label: 'Активные', icon: '⏳' },
          { key: 'closed', label: 'Закрытые', icon: '✓' },
          { key: 'create', label: 'Взять долг', icon: '+' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as any)}
            className={cn('tab-pill', tab === t.key ? 'tab-pill-active' : 'tab-pill-inactive')}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {tab === 'create' ? (
        <CreateDebt onCreate={() => setTab('active')} />
      ) : list.length === 0 ? (
        <div className="glass p-6 text-center">
          <div className="text-3xl mb-2 opacity-30">📜</div>
          <p className="text-sm text-muted-foreground">
            {tab === 'active' ? 'Активных долгов нет.' : 'Закрытых долгов нет.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map(d => {
            const debtor = state.participants.find(p => p.id === d.debtor_id);
            const creditor = state.participants.find(p => p.id === d.creditor_id);
            const canClose = currentUser && (currentUser.id === d.debtor_id || currentUser.id === d.creditor_id || role === 'gm');
            return (
              <div key={d.id} className="glass-strong crimson-border p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-bold text-sm">{d.description || 'Долг'}</h3>
                  <span className={cn('status-badge border',
                    d.status === 'active'
                      ? 'bg-red-500/15 text-red-300 border-red-500/30'
                      : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  )}>
                    {d.status === 'active' ? 'Активен' : 'Закрыт'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs mb-3 flex-wrap">
                  {debtor && (
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-red-500/10 border border-red-500/20">
                      <CharacterIcon participant={debtor} size="xs" ring={false} />
                      <span className="text-red-300 font-bold truncate max-w-[80px]">{debtor.display_name}</span>
                    </div>
                  )}
                  <span className="text-muted">→</span>
                  {creditor && (
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gold/10 border border-gold/20">
                      <CharacterIcon participant={creditor} size="xs" ring={false} />
                      <span className="text-gold font-bold truncate max-w-[80px]">{creditor.display_name}</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <Yen amount={d.amount} className="text-base text-gold" iconClass="w-4 h-4" />
                  <div className="text-[10px] text-muted">⏰ День {d.due_day}</div>
                </div>
                {canClose && d.status === 'active' && (
                  <button
                    onClick={() => {
                      if (confirm('Закрыть долг? Сумма будет списана с должника и переведена кредитору.')) {
                        dispatch({ type: 'close_debt', id: d.id });
                      }
                    }}
                    className="btn-success w-full mt-3 text-xs"
                  >
                    ✓ Закрыть долг
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

function CreateDebt({ onCreate }: { onCreate: () => void }) {
  const { state, currentUser, dispatch } = useStore();
  const [creditorId, setCreditorId] = useState('');
  const [amount, setAmount] = useState(10_000);
  const [description, setDescription] = useState('');
  const [day, setDay] = useState<1 | 2 | 3 | 4>(2);

  const others = state.participants.filter(p => p.status !== 'gm' && p.id !== currentUser?.id);
  const canSubmit = currentUser && creditorId && amount > 0;

  const submit = () => {
    if (!canSubmit) return;
    dispatch({
      type: 'add_debt',
      debt: {
        id: uid('debt'),
        debtor_id: currentUser!.id,
        creditor_id: creditorId,
        amount,
        description: description.trim() || 'Долг',
        due_day: day,
        status: 'active',
        created_at: Date.now(),
      },
    });
    onCreate();
  };

  if (!currentUser) {
    return (
      <div className="glass p-6 text-center">
        <p className="text-sm text-muted-foreground">Войдите, чтобы взять долг.</p>
        <Link href="/login" className="btn-primary mt-3 inline-flex">Войти</Link>
      </div>
    );
  }

  return (
    <div className="glass p-4 space-y-3">
      <div>
        <label className="text-[10px] font-bold uppercase tracking-widest text-gold mb-1 block">У кого занять</label>
        <select value={creditorId} onChange={e => setCreditorId(e.target.value)} className="input-field">
          <option value="">— выберите кредитора —</option>
          {others.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
        </select>
      </div>
      <div>
        <label className="text-[10px] font-bold uppercase tracking-widest text-gold mb-1 block">Сумма (ейны)</label>
        <input
          type="number"
          value={amount}
          onChange={e => setAmount(Math.max(0, Number(e.target.value)))}
          className="input-field font-mono"
          min={1}
        />
      </div>
      <div>
        <label className="text-[10px] font-bold uppercase tracking-widest text-gold mb-1 block">Описание</label>
        <input
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Например: проиграл в кости"
          className="input-field"
        />
      </div>
      <div>
        <label className="text-[10px] font-bold uppercase tracking-widest text-gold mb-2 block">Срок (день)</label>
        <div className="grid grid-cols-4 gap-1.5">
          {[1, 2, 3, 4].map(d => (
            <button
              key={d}
              onClick={() => setDay(d as any)}
              className={cn(
                'py-2.5 rounded-xl text-sm font-bold border active:scale-95',
                day === d ? 'bg-gold/15 border-gold/50 text-gold' : 'bg-card/40 border-white/8'
              )}
            >
              День {d}
            </button>
          ))}
        </div>
      </div>
      <button onClick={submit} disabled={!canSubmit} className={cn('btn-primary w-full', !canSubmit && 'opacity-50')}>
        📜 Зафиксировать долг
      </button>
    </div>
  );
}
