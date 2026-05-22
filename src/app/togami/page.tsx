'use client';

// Страница «Фонд Тогами» — баланс, последние операции, активные долги
// перед Фондом, ручные действия Бьякуи/ведущего.
// Логика без отдельной таблицы — всё через существующие участников и долги.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useStore } from '@/lib/store/StoreProvider';
import { CharacterIcon } from '@/components/ui/CharacterIcon';
import { Yen } from '@/components/ui/Yen';
import { cn, isPlayer } from '@/lib/utils';
import { getSupabase } from '@/lib/supabase/client';
import {
  TOGAMI_FUND_ID, BYAKUYA_ID, TOGAMI_FUND_START_BALANCE,
} from '@/lib/togami/constants';

export default function TogamiPage() {
  const { state, currentUser, role } = useStore();
  const sb = getSupabase();
  const isByakuya = !!currentUser && currentUser.id === BYAKUYA_ID;
  const isAdmin = role === 'gm' || role === 'queen';
  const canManage = isByakuya || isAdmin;

  const fund = state.participants.find(p => p.id === TOGAMI_FUND_ID) ?? null;
  const byakuya = state.participants.find(p => p.id === BYAKUYA_ID) ?? null;

  // Долги перед Фондом
  const fundDebts = state.debts.filter(d =>
    d.creditor_id === TOGAMI_FUND_ID && (d.status === 'active' || d.status === 'overdue'),
  );

  const [history, setHistory] = useState<any[]>([]);
  useEffect(() => {
    if (!sb) return;
    let alive = true;
    (async () => {
      const { data } = await sb.from('history').select('*')
        .eq('participant_id', TOGAMI_FUND_ID)
        .order('created_at', { ascending: false }).limit(50);
      if (alive) setHistory(data ?? []);
    })();
    const id = setInterval(async () => {
      if (!alive || !sb) return;
      const { data } = await sb.from('history').select('*')
        .eq('participant_id', TOGAMI_FUND_ID)
        .order('created_at', { ascending: false }).limit(50);
      if (alive) setHistory(data ?? []);
    }, 7000);
    return () => { alive = false; clearInterval(id); };
  }, [sb]);

  const createFund = async () => {
    if (!sb) return;
    if (!confirm('Создать системный аккаунт «Фонд Тогами» с балансом 15M? Это резервный сценарий — обычно фонд уже создан как Казна академии.')) return;
    await sb.from('participants').insert({
      id: TOGAMI_FUND_ID,
      display_name: 'Фонд Тогами',
      status: 'treasury',
      balance: TOGAMI_FUND_START_BALANCE,
      reputation: 0,
      wins: 0, losses: 0,
      is_active: true,
      is_registered: false,
    });
    await sb.from('history').insert({
      id: 'h-' + Date.now(),
      participant_id: TOGAMI_FUND_ID,
      action: 'fund_created',
      description: 'Создан Фонд Тогами со стартовым балансом 15 000 000',
      amount: TOGAMI_FUND_START_BALANCE,
    });
  };

  if (!fund) {
    // p-treasury всегда должен быть в БД. Эта ветка останется только если нет seed.
    return (
      <div className="px-3 sm:px-4 py-4 max-w-2xl mx-auto space-y-4">
        <div className="glass-strong gold-border p-5">
          <div className="text-[10px] uppercase tracking-widest text-gold/70">Фонд Тогами</div>
          <h1 className="font-heading text-2xl font-bold text-gradient-gold mt-1">Фонд не найден</h1>
          <p className="text-xs text-muted-foreground mt-2">
            Системный аккаунт <code>{TOGAMI_FUND_ID}</code> не найден. Запустите setup.sql или сделайте «Полный сброс БД» из админки.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-3 sm:px-4 py-4 max-w-2xl mx-auto space-y-4 animate-fade-in">
      <div className="glass-strong gold-border p-5">
        <div className="text-[10px] uppercase tracking-widest text-gold/70">Капитал Бьякуи</div>
        <h1 className="font-heading text-2xl font-bold text-gradient-gold mt-1">Фонд Тогами</h1>
        <Yen amount={fund.balance} className="text-3xl text-gold mt-2" iconClass="w-6 h-6" />
        {byakuya && (
          <div className="mt-3 flex items-center gap-2 p-2 rounded-xl bg-card/40">
            <CharacterIcon participant={byakuya} size="xs" ringless />
            <span className="text-xs">Куратор: <b>{byakuya.display_name}</b></span>
          </div>
        )}
      </div>

      {/* Долги перед Фондом */}
      <div className="glass p-4">
        <div className="section-title text-sm mb-2">📜 Активные долги перед Фондом</div>
        {fundDebts.length === 0 ? (
          <div className="text-xs text-muted-foreground italic">Нет активных долгов.</div>
        ) : (
          <div className="space-y-1.5">
            {fundDebts.map(d => {
              const debtor = state.participants.find(p => p.id === d.debtor_id);
              return (
                <div key={d.id} className="flex items-center gap-2 p-2 rounded-xl bg-card/40 text-xs">
                  {debtor && <CharacterIcon participant={debtor} size="xs" ringless />}
                  <div className="flex-1 min-w-0">
                    <div className="font-bold truncate">{debtor?.display_name ?? d.debtor_id}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{d.description ?? ''}</div>
                  </div>
                  <Yen amount={d.amount} className="text-xs" iconClass="w-3 h-3" />
                  {d.status === 'overdue' && <span className="text-red-300 text-[10px]">просрочен</span>}
                  {canManage && (
                    <DebtActions debt={d} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* История операций фонда */}
      <div className="glass p-4">
        <div className="section-title text-sm mb-2">📊 Последние операции</div>
        {history.length === 0 ? (
          <div className="text-xs text-muted-foreground italic">Операций пока нет.</div>
        ) : (
          <div className="space-y-1">
            {history.map(h => (
              <div key={h.id} className="flex items-center gap-2 p-1.5 rounded-xl bg-card/30 text-xs">
                <span className="flex-1 truncate">{h.description ?? h.action}</span>
                {h.amount != null && (
                  <Yen amount={h.amount} className={cn('text-[11px]', h.amount > 0 ? 'text-emerald-300' : 'text-red-300')} iconClass="w-3 h-3" />
                )}
                <span className="text-[10px] text-muted-foreground">
                  {new Date(h.created_at).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DebtActions({ debt }: { debt: any }) {
  const sb = getSupabase();
  const transferToMondo = async () => {
    if (!sb) return;
    if (!confirm(`Передать долг ${debt.id} Мондо на взыскание? Текущий кредитор Фонда Тогами останется, но в описании появится пометка.`)) return;
    await sb.from('debts').update({
      description: (debt.description ?? '') + ' · взыскатель: Мондо',
    }).eq('id', debt.id);
  };
  const cancelDebt = async () => {
    if (!sb) return;
    if (!confirm('Отменить (списать) долг? Это безвозвратно.')) return;
    await sb.from('debts').update({ status: 'cancelled' }).eq('id', debt.id);
  };
  return (
    <div className="flex gap-1">
      <button className="text-[10px] text-fuchsia-300 px-1.5 py-1 rounded-md bg-fuchsia-500/10 border border-fuchsia-500/30" onClick={transferToMondo}>→ Мондо</button>
      <button className="text-[10px] text-red-300 px-1.5 py-1 rounded-md bg-red-500/10 border border-red-500/30" onClick={cancelDebt}>списать</button>
    </div>
  );
}
