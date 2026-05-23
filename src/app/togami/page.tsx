'use client';

// Фонд Тогами — куда уходят минусовые балансы и крупные провалы.
// Показывает баланс, последние крупные операции, активные долги перед фондом
// и игроков с худшим балансом.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useStore } from '@/lib/store/StoreProvider';
import { CharacterIcon } from '@/components/ui/CharacterIcon';
import { Yen } from '@/components/ui/Yen';
import { cn, isPlayer } from '@/lib/utils';
import { getSupabase } from '@/lib/supabase/client';
import {
  TOGAMI_FUND_ID, BYAKUYA_ID,
} from '@/lib/togami/constants';

const BIG_OPERATION_THRESHOLD = 500_000;

export default function TogamiPage() {
  const { state, currentUser, role } = useStore();
  const sb = getSupabase();
  const isAdmin = role === 'gm' || role === 'queen';

  const fund = state.participants.find(p => p.id === TOGAMI_FUND_ID) ?? null;
  const byakuya = state.participants.find(p => p.id === BYAKUYA_ID) ?? null;

  // Долги перед Фондом
  const fundDebts = state.debts.filter(d =>
    d.creditor_id === TOGAMI_FUND_ID && (d.status === 'active' || d.status === 'overdue'),
  );

  // Игроки с минусовым/малым балансом — только те, у кого ЕСТЬ долги и они НЕ Питомцы.
  const lowBalancePlayers = useMemo(() => {
    const debtorIds = new Set(
      state.debts
        .filter(d => d.status === 'active' || d.status === 'overdue' || d.status === 'collection' || d.status === 'pet_candidate')
        .map(d => d.debtor_id),
    );
    return [...state.participants]
      .filter(p => isPlayer(p) && p.status !== 'pet' && debtorIds.has(p.id))
      .sort((a, b) => a.balance - b.balance)
      .slice(0, 10);
  }, [state.participants, state.debts]);

  // Топ должников Фонду
  const topFundDebtors = useMemo(() => {
    const map = new Map<string, number>();
    fundDebts.forEach(d => {
      map.set(d.debtor_id, (map.get(d.debtor_id) ?? 0) + d.amount);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  }, [fundDebts]);

  const [history, setHistory] = useState<any[]>([]);
  const [bigOps, setBigOps] = useState<any[]>([]);
  useEffect(() => {
    if (!sb) return;
    let alive = true;
    const load = async () => {
      const [{ data: hist }, { data: big }] = await Promise.all([
        sb.from('history').select('*')
          .eq('participant_id', TOGAMI_FUND_ID)
          .order('created_at', { ascending: false }).limit(30),
        sb.from('history').select('*')
          .gte('amount', BIG_OPERATION_THRESHOLD)
          .order('created_at', { ascending: false }).limit(30),
      ]);
      if (!alive) return;
      setHistory(hist ?? []);
      setBigOps(big ?? []);
    };
    load();
    const id = setInterval(load, 8000);
    return () => { alive = false; clearInterval(id); };
  }, [sb]);

  if (!fund) {
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
    <div className="px-3 sm:px-4 py-4 max-w-2xl mx-auto space-y-3 animate-fade-in">
      {/* Баланс */}
      <div className="glass-strong gold-border p-5">
        <div className="text-[10px] uppercase tracking-widest text-gold/70">📉 Куда уходят минусовые балансы</div>
        <h1 className="font-heading text-2xl font-bold text-gradient-gold mt-1">Фонд Тогами</h1>
        <Yen amount={fund.balance} className="text-3xl text-gold mt-2" iconClass="w-6 h-6" />
        {byakuya && (
          <div className="mt-3 flex items-center gap-2 p-2 rounded-xl bg-card/40">
            <CharacterIcon participant={byakuya} size="xs" ringless />
            <span className="text-xs">Куратор: <b>{byakuya.display_name}</b></span>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
          Когда игрок уходит в большой минус во время игры, средства поступают в Фонд.
          Из него же выдаются кредиты Кируми и крупные выплаты.
        </p>
      </div>

      {/* Топ должников Фонду */}
      {topFundDebtors.length > 0 && (
        <div className="glass p-4">
          <div className="section-title text-sm mb-2">⚠️ Должники Фонду</div>
          <div className="space-y-1.5">
            {topFundDebtors.map(([id, amount]) => {
              const p = state.participants.find(x => x.id === id);
              return (
                <Link key={id} href={`/profile/${id}`} className="flex items-center gap-2 p-2 rounded-xl bg-card/40 hover:bg-card/60 transition text-xs">
                  {p && <CharacterIcon participant={p} size="xs" ringless />}
                  <span className="flex-1 truncate font-bold">{p?.display_name ?? id}</span>
                  <Yen amount={amount} className="text-red-300" iconClass="w-3 h-3" />
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Низкие балансы — только должники и не питомцы */}
      {lowBalancePlayers.length > 0 && (
        <div className="glass p-4">
          <div className="section-title text-sm mb-2">🔻 Должники с худшим балансом</div>
          <div className="space-y-1">
            {lowBalancePlayers.map(p => (
              <Link key={p.id} href={`/profile/${p.id}`} className="flex items-center gap-2 p-1.5 rounded-xl bg-card/30 hover:bg-card/50 transition text-xs">
                <CharacterIcon participant={p} size="xs" ringless />
                <span className="flex-1 truncate">{p.display_name}</span>
                <Yen amount={p.balance} className={cn('text-[11px]', p.balance < 100_000 ? 'text-red-300' : 'text-muted-foreground')} iconClass="w-3 h-3" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* История операций Фонда */}
      <div className="glass p-4">
        <div className="section-title text-sm mb-2">📊 Операции Фонда</div>
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
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                  {new Date(h.created_at).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Крупные провалы */}
      <div className="glass p-4">
        <div className="section-title text-sm mb-2">💥 Крупные операции (от 500k)</div>
        {bigOps.length === 0 ? (
          <div className="text-xs text-muted-foreground italic">Крупных операций пока нет.</div>
        ) : (
          <div className="space-y-1">
            {bigOps.map(h => {
              const p = state.participants.find(x => x.id === h.participant_id);
              return (
                <div key={h.id} className="flex items-center gap-2 p-1.5 rounded-xl bg-card/30 text-xs">
                  {p && <CharacterIcon participant={p} size="xs" ringless />}
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{p?.display_name ?? h.participant_id}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{h.description ?? h.action}</div>
                  </div>
                  <Yen amount={Math.abs(h.amount ?? 0)} className="text-[11px] text-amber-300" iconClass="w-3 h-3" />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
