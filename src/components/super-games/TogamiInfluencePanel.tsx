'use client';

// «Влияние Бьякуи» — компактный модуль с кнопками для Карточного корабля
// и Контрабанды капитала. Управляет займами Фонда Тогами, аудитом и
// финансовой проверкой. Состояние живёт в super_games.state.togami.

import { useState } from 'react';
import { useStore } from '@/lib/store/StoreProvider';
import { CharacterIcon } from '@/components/ui/CharacterIcon';
import { Yen } from '@/components/ui/Yen';
import { cn, isPlayer } from '@/lib/utils';
import { getSupabase } from '@/lib/supabase/client';
import { applyTransfer, payoutFromTreasury } from '@/lib/store/tx';
import {
  TOGAMI_FUND_ID, BYAKUYA_ID,
  CARD_SHIP_LOAN_AMOUNT, CARD_SHIP_REQUIRED_RETURN, CARD_SHIP_FAILURE_RETURN_RATE,
  CARD_SHIP_FAILURE_PENALTY,
  CONTRABAND_TURNOVER_COMMISSION, CONTRABAND_FAILURE_TURNOVER_THRESHOLD, CONTRABAND_FAILURE_PENALTY,
} from '@/lib/togami/constants';
import type { SuperGame, Participant } from '@/lib/store/types';

interface TogamiSubState {
  loans?: Record<string, { principal: number; expected: number; returned?: number; debt_created?: number; status?: string }>;
  audit_used?: boolean;
  audit_target_id?: string | null;
  financial_check_used?: boolean;
  financial_check_result?: string | null;
  invested?: number;
  total_returned?: number;
  total_profit?: number;
  total_loss?: number;
  is_financial_failure?: boolean;
  /** Для контрабанды */
  total_turnover?: number;
  byakuya_commission?: number;
}

function getSub(g: SuperGame): TogamiSubState {
  const s = (g.state || {}) as any;
  return (s.togami ?? {}) as TogamiSubState;
}

async function patchSub(gameId: string, patch: Partial<TogamiSubState>) {
  const sb = getSupabase();
  if (!sb) return;
  const { data } = await sb.from('super_games').select('state').eq('id', gameId).single();
  const cur = (data?.state ?? {}) as any;
  const togami = { ...(cur.togami ?? {}), ...patch };
  await sb.from('super_games').update({ state: { ...cur, togami } }).eq('id', gameId);
}

async function pushEvent(title: string, body: string | undefined, link: string) {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from('events').insert({
    id: 'ev-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
    type: 'togami_influence',
    title, body: body ?? null, link_url: link, is_for_gm_only: false,
  });
}

// ===========================================================================

export function TogamiInfluencePanel({
  game, gameKind, participantIds,
}: {
  game: SuperGame;
  gameKind: 'card_ship' | 'contraband';
  participantIds: string[];
}) {
  const { state, currentUser, role } = useStore();
  const isByakuya = !!currentUser && currentUser.id === BYAKUYA_ID;
  const isAdmin = role === 'gm' || role === 'queen';
  const canManage = isByakuya || isAdmin;
  const fund = state.participants.find(p => p.id === TOGAMI_FUND_ID) ?? null;
  const sub = getSub(game);

  if (!fund) {
    if (!canManage) return null;
    return (
      <div className="glass p-3 border border-fuchsia-500/30">
        <div className="text-[11px] text-muted-foreground">
          💼 Фонд Тогами не создан. <a href="/togami" className="text-gold underline">Создать</a>, чтобы активировать роль Бьякуи в этой игре.
        </div>
      </div>
    );
  }

  return (
    <div className="glass-strong gold-border p-4 space-y-2">
      <div className="flex items-center gap-2">
        <div className="text-2xl">💼</div>
        <div className="flex-1">
          <div className="text-[10px] uppercase tracking-widest text-fuchsia-300/80">Влияние Бьякуи</div>
          <div className="font-heading text-base font-bold text-gradient-gold">Фонд Тогами</div>
          <div className="text-[10px] text-muted-foreground">
            Баланс: <Yen amount={fund.balance} className="inline" iconClass="w-3 h-3" />
          </div>
        </div>
      </div>

      {gameKind === 'card_ship' && (
        <CardShipInfluence game={game} sub={sub} participantIds={participantIds} canManage={canManage} />
      )}
      {gameKind === 'contraband' && (
        <ContrabandInfluence game={game} sub={sub} canManage={canManage} />
      )}
    </div>
  );
}

// ---------- Карточный корабль ----------

function CardShipInfluence({
  game, sub, participantIds, canManage,
}: {
  game: SuperGame; sub: TogamiSubState; participantIds: string[]; canManage: boolean;
}) {
  const { state } = useStore();
  const link = `/super-games/${game.id}`;
  const loansIssued = !!sub.loans && Object.keys(sub.loans).length > 0;
  const settled = !!sub.total_returned || !!sub.total_loss || !!sub.is_financial_failure;

  const issueLoans = async () => {
    if (!confirm(`Выдать займы по ${CARD_SHIP_LOAN_AMOUNT.toLocaleString('ru-RU')} ¥ всем ${participantIds.length} участникам? Возврат: ${CARD_SHIP_REQUIRED_RETURN.toLocaleString('ru-RU')} ¥`)) return;
    const loans: Record<string, any> = {};
    let invested = 0;
    for (const pid of participantIds) {
      // Деньги выдаются Фондом → пишем как перевод между p-togami-fund и игроком
      const res = await applyTransfer(TOGAMI_FUND_ID, pid, CARD_SHIP_LOAN_AMOUNT,
        'Заём Фонда Тогами в Карточном корабле', link);
      if (!res.ok) continue;
      loans[pid] = {
        principal: CARD_SHIP_LOAN_AMOUNT,
        expected: CARD_SHIP_REQUIRED_RETURN,
        status: 'active',
      };
      invested += CARD_SHIP_LOAN_AMOUNT;
    }
    await patchSub(game.id, { loans, invested, audit_used: false });
    await pushEvent(
      `Бьякуя выдал займы Фонда Тогами`,
      `${participantIds.length} игроков по 1 000 000. Возврат 1 200 000 каждый.`,
      link,
    );
  };

  const settleLoans = async () => {
    if (!sub.loans) return;
    if (!confirm('Рассчитать возврат займов? У кого не хватит средств — недостача станет долгом перед Фондом Тогами.')) return;
    const sb = getSupabase();
    if (!sb) return;
    let totalReturned = 0;
    let fullyReturnedCount = 0;
    let totalDebt = 0;
    const loans = { ...sub.loans };

    for (const pid of Object.keys(loans)) {
      const loan = loans[pid];
      const { data: p } = await sb.from('participants').select('balance').eq('id', pid).single();
      const balance = p?.balance ?? 0;
      const owe = loan.expected;
      if (balance >= owe) {
        // Полный возврат
        await applyTransfer(pid, TOGAMI_FUND_ID, owe, 'Возврат займа Фонду Тогами', link);
        loans[pid] = { ...loan, returned: owe, status: 'repaid' };
        totalReturned += owe;
        fullyReturnedCount += 1;
      } else {
        // Частичный возврат + долг
        if (balance > 0) {
          await applyTransfer(pid, TOGAMI_FUND_ID, balance, 'Частичный возврат займа Фонду Тогами', link);
        }
        const shortfall = owe - balance;
        // Создаём долг
        await sb.from('debts').insert({
          id: 'd-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
          debtor_id: pid,
          creditor_id: TOGAMI_FUND_ID,
          amount: shortfall,
          description: `Недостача по Карточному кораблю · взыскатель: Мондо · игра ${game.id}`,
          due_day: 7,
          status: 'active',
          initiator: 'creditor',
        });
        loans[pid] = { ...loan, returned: balance, debt_created: shortfall, status: 'partial' };
        totalReturned += balance;
        totalDebt += shortfall;
      }
    }

    const totalParticipants = Object.keys(loans).length;
    const isFailure = totalParticipants > 0 && (fullyReturnedCount * 2 < totalParticipants);
    let totalLoss = 0;
    let totalProfit = 0;
    if (isFailure) {
      totalLoss = CARD_SHIP_FAILURE_PENALTY;
      // Списываем штраф из Фонда в Казну
      await applyTransfer(TOGAMI_FUND_ID, 'p-treasury', CARD_SHIP_FAILURE_PENALTY, 'Штраф Фонда Тогами за провал Карточного корабля', link);
    } else {
      totalProfit = totalReturned - (sub.invested ?? 0);
    }
    await patchSub(game.id, {
      loans,
      total_returned: totalReturned,
      total_profit: totalProfit,
      total_loss: totalLoss,
      is_financial_failure: isFailure,
    });
    await pushEvent(
      isFailure
        ? 'Фонд Тогами потерял контроль над капиталом в Карточном корабле'
        : 'Фонд Тогами рассчитал возвраты',
      `Полный возврат: ${fullyReturnedCount}/${totalParticipants}. Прибыль: ${totalProfit}, убыток: ${totalLoss}, новые долги: ${totalDebt}.`,
      link,
    );
  };

  return (
    <div className="space-y-2 text-xs">
      {!loansIssued ? (
        canManage && (
          <button className="btn-primary w-full text-xs" onClick={issueLoans}>
            💰 Выдать займы по 1M ({participantIds.length} игроков)
          </button>
        )
      ) : (
        <>
          <div className="text-[11px] text-muted-foreground">
            Выдано займов: {Object.keys(sub.loans!).length}, на сумму <Yen amount={sub.invested ?? 0} className="inline" iconClass="w-3 h-3" />
          </div>
          <div className="space-y-1">
            {Object.entries(sub.loans!).map(([pid, l]) => {
              const p = state.participants.find(x => x.id === pid);
              return (
                <div key={pid} className="flex items-center gap-2 p-1.5 rounded-xl bg-card/40 text-[11px]">
                  {p && <CharacterIcon participant={p} size="xs" ringless />}
                  <span className="flex-1 truncate">{p?.display_name ?? pid}</span>
                  <Yen amount={l.expected} className="text-[10px]" iconClass="w-3 h-3" />
                  {l.status === 'repaid' && <span className="text-emerald-300 text-[10px]">возврат</span>}
                  {l.status === 'partial' && <span className="text-amber-300 text-[10px]">долг {(l.debt_created ?? 0) / 1000}K</span>}
                  {l.status === 'active' && <span className="text-muted-foreground text-[10px]">активен</span>}
                </div>
              );
            })}
          </div>
          {!settled && canManage && (
            <button className="btn-success w-full text-xs" onClick={settleLoans}>
              🏁 Рассчитать возвраты
            </button>
          )}
          {settled && (
            <div className="text-[10px] text-muted-foreground">
              Возвращено: <Yen amount={sub.total_returned ?? 0} className="inline" iconClass="w-3 h-3" />,
              {(sub.total_profit ?? 0) > 0 && <> прибыль <Yen amount={sub.total_profit ?? 0} className="inline text-emerald-300" iconClass="w-3 h-3" /></>}
              {(sub.total_loss ?? 0) > 0 && <> убыток <Yen amount={sub.total_loss ?? 0} className="inline text-red-300" iconClass="w-3 h-3" /></>}
              {sub.is_financial_failure && <span className="text-red-300"> · ФИНАНСОВЫЙ ПРОВАЛ</span>}
            </div>
          )}
        </>
      )}

      <AuditButton game={game} sub={sub} participantIds={participantIds} canManage={canManage} />
    </div>
  );
}

function AuditButton({
  game, sub, participantIds, canManage,
}: {
  game: SuperGame; sub: TogamiSubState; participantIds: string[]; canManage: boolean;
}) {
  const { state, currentUser } = useStore();
  const [picking, setPicking] = useState(false);
  const isByakuya = !!currentUser && currentUser.id === BYAKUYA_ID;

  if (sub.audit_used) {
    const target = state.participants.find(p => p.id === sub.audit_target_id);
    return (
      <div className="text-[10px] text-fuchsia-300/80 italic">
        ♛ Аудит Тогами использован{target ? ` (на ${target.display_name})` : ''}.
      </div>
    );
  }
  if (!canManage) return null;

  const players = participantIds
    .map(id => state.participants.find(p => p.id === id))
    .filter(Boolean) as Participant[];

  return (
    <div>
      {!picking ? (
        <button className="btn-secondary w-full text-[11px]" onClick={() => setPicking(true)}>
          ♛ Использовать Аудит Тогами (1 раз)
        </button>
      ) : (
        <div className="grid grid-cols-2 gap-1 mt-1">
          {players.map(p => (
            <button
              key={p.id}
              className="text-left px-2 py-1.5 rounded-lg bg-card/40 border border-white/8 text-[11px]"
              onClick={async () => {
                await patchSub(game.id, { audit_used: true, audit_target_id: p.id });
                const link = `/super-games/${game.id}`;
                await pushEvent('Бьякуя использовал Аудит Тогами', `Цель: ${p.display_name}.`, link);
                alert(
                  `📋 Аудит Тогами\n\n${p.display_name}\n` +
                  `Баланс: ${(p.balance ?? 0).toLocaleString('ru-RU')} ¥\n` +
                  `Может ли вернуть 1.2M займ: ${(p.balance ?? 0) >= 1_200_000 ? 'Да' : 'Нет'}\n`,
                );
                setPicking(false);
              }}
            >📋 {p.display_name}</button>
          ))}
          <button className="col-span-2 text-[10px] text-muted-foreground" onClick={() => setPicking(false)}>Отмена</button>
        </div>
      )}
    </div>
  );
}

// ---------- Контрабанда капитала ----------

function ContrabandInfluence({
  game, sub, canManage,
}: {
  game: SuperGame; sub: TogamiSubState; canManage: boolean;
}) {
  const link = `/super-games/${game.id}`;
  // Для контрабанды считаем общий оборот = north_score + south_score
  const cb = (game.state || {}) as any;
  const turnover = (cb.north_score ?? 0) + (cb.south_score ?? 0);
  const finished = cb.status === 'finished';
  const commission = Math.floor(turnover * CONTRABAND_TURNOVER_COMMISSION);
  const failure = turnover < CONTRABAND_FAILURE_TURNOVER_THRESHOLD;

  const settle = async () => {
    if (sub.byakuya_commission != null) {
      alert('Комиссия уже начислена.');
      return;
    }
    if (commission > 0) {
      await applyTransfer('p-treasury', TOGAMI_FUND_ID, commission, 'Комиссия Бьякуи в Контрабанде капитала', link);
    }
    let loss = 0;
    if (failure) {
      await applyTransfer(TOGAMI_FUND_ID, 'p-treasury', CONTRABAND_FAILURE_PENALTY, 'Штраф Бьякуи за низкий оборот Контрабанды', link);
      loss = CONTRABAND_FAILURE_PENALTY;
    }
    await patchSub(game.id, {
      total_turnover: turnover,
      byakuya_commission: commission,
      total_profit: commission,
      total_loss: loss,
      is_financial_failure: failure,
    });
    await pushEvent(
      failure ? 'Контрабанда капитала провалилась как экономическая модель Бьякуи' : 'Бьякуя получил комиссию с оборота',
      `Оборот ${turnover}, комиссия ${commission}${failure ? `, штраф ${loss}` : ''}.`,
      link,
    );
  };

  return (
    <div className="space-y-2 text-xs">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="p-2 rounded-xl bg-card/40">
          <div className="text-[10px] text-muted-foreground">Оборот</div>
          <Yen amount={turnover} className="text-xs" iconClass="w-3 h-3" />
        </div>
        <div className="p-2 rounded-xl bg-card/40">
          <div className="text-[10px] text-muted-foreground">Комиссия 5%</div>
          <Yen amount={commission} className="text-xs" iconClass="w-3 h-3" />
        </div>
        <div className="p-2 rounded-xl bg-card/40">
          <div className="text-[10px] text-muted-foreground">Порог провала</div>
          <Yen amount={CONTRABAND_FAILURE_TURNOVER_THRESHOLD} className="text-xs" iconClass="w-3 h-3" />
        </div>
      </div>
      {finished && canManage && sub.byakuya_commission == null && (
        <button className="btn-success w-full text-xs" onClick={settle}>
          🏁 Начислить комиссию / зафиксировать провал
        </button>
      )}
      {sub.byakuya_commission != null && (
        <div className="text-[10px] text-muted-foreground">
          Зафиксировано: комиссия <Yen amount={sub.byakuya_commission} className="inline" iconClass="w-3 h-3" />
          {(sub.total_loss ?? 0) > 0 && <span className="text-red-300"> · штраф <Yen amount={sub.total_loss ?? 0} className="inline" iconClass="w-3 h-3" /></span>}
        </div>
      )}
      <FinancialCheckButton game={game} sub={sub} canManage={canManage} />
    </div>
  );
}

function FinancialCheckButton({
  game, sub, canManage,
}: { game: SuperGame; sub: TogamiSubState; canManage: boolean }) {
  if (sub.financial_check_used) {
    return (
      <div className="text-[10px] text-fuchsia-300/80 italic">
        ♛ Финансовая проверка использована{sub.financial_check_result ? `: ${sub.financial_check_result}` : ''}.
      </div>
    );
  }
  if (!canManage) return null;
  const link = `/super-games/${game.id}`;
  const use = async (variant: number) => {
    const cb = (game.state || {}) as any;
    let result = '';
    if (variant === 1) {
      result = `Север: ${cb.north_score ?? 0}, Юг: ${cb.south_score ?? 0}`;
    } else if (variant === 2) {
      result = 'Команды получили личные комиссии — детали в истории раундов';
    } else if (variant === 3) {
      const turnover = (cb.north_score ?? 0) + (cb.south_score ?? 0);
      result = `Текущий оборот: ${turnover}`;
    } else {
      result = 'Штрафы Таможенника зафиксированы в истории';
    }
    await patchSub(game.id, { financial_check_used: true, financial_check_result: result });
    await pushEvent('Бьякуя использовал Финансовую проверку', result, link);
    alert('📋 Финансовая проверка\n\n' + result);
  };
  return (
    <details>
      <summary className="cursor-pointer text-[11px] text-fuchsia-300/80 py-1">♛ Финансовая проверка (1 раз)</summary>
      <div className="grid grid-cols-1 gap-1 mt-1">
        <button className="btn-secondary text-[10px]" onClick={() => use(1)}>1. Какая команда заработала больше</button>
        <button className="btn-secondary text-[10px]" onClick={() => use(2)}>2. Сводка по комиссиям</button>
        <button className="btn-secondary text-[10px]" onClick={() => use(3)}>3. Текущий общий оборот</button>
        <button className="btn-secondary text-[10px]" onClick={() => use(4)}>4. Штрафы в Казне</button>
      </div>
    </details>
  );
}
