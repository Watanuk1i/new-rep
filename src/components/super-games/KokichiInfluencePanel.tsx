'use client';

// Панель куратора Кокичи в «Контрабанде капитала».
// Хранит состояние в super_games.state.kokichi (поля Кокичи интегрированы
// прямо в ContrabandState, см. types.ts).

import { useState } from 'react';
import { useStore } from '@/lib/store/StoreProvider';
import { CharacterIcon } from '@/components/ui/CharacterIcon';
import { Yen } from '@/components/ui/Yen';
import { cn } from '@/lib/utils';
import { getSupabase } from '@/lib/supabase/client';
import { chargeToTreasury, payoutFromTreasury } from '@/lib/store/tx';
import {
  KOKICHI_FALSE_TRAIL_REWARD, KOKICHI_FALSE_TRAIL_PENALTY,
  KOKICHI_COURIER_SWAP_COST,
  KOKICHI_FALSE_TRAIL_MESSAGES, randomFalseTrail,
  inspectorMadeMistake,
} from '@/lib/contraband/logic';
import type { SuperGame, ContrabandState, ContrabandRound } from '@/lib/store/types';

const KOKICHI_ID = 'p-kokichi';

interface Props {
  game: SuperGame;
}

function getState(g: SuperGame): ContrabandState {
  return (g.state || {}) as ContrabandState;
}

async function patchState(gameId: string, patch: Partial<ContrabandState>) {
  const sb = getSupabase();
  if (!sb) return;
  const { data } = await sb.from('super_games').select('state').eq('id', gameId).single();
  const cur = (data?.state ?? {}) as ContrabandState;
  await sb.from('super_games').update({ state: { ...cur, ...patch } }).eq('id', gameId);
}

async function pushEvent(title: string, body: string | undefined, link: string) {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from('events').insert({
    id: 'ev-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
    type: 'kokichi_influence',
    title, body: body ?? null, link_url: link, is_for_gm_only: false,
  });
}

export function KokichiInfluencePanel({ game }: Props) {
  const { state, role, currentUser } = useStore();
  const isAdmin = role === 'gm' || role === 'queen';
  const cs = getState(game);

  const kokichi = state.participants.find(p => p.id === KOKICHI_ID);
  const isKokichiUser = !!currentUser && currentUser.id === KOKICHI_ID;
  const canActAsKokichi = isAdmin || isKokichiUser;
  const mode = cs.kokichi_mode ?? 'curator_player';

  const round: ContrabandRound | undefined = cs.rounds?.[cs.current_round - 1];
  const link = `/super-games/${game.id}`;

  // Окна доступности способностей по статусу раунда
  const canCourierSwap = round?.status === 'kokichi_courier_swap_window'
    || (round?.smuggler_id && !round.smuggled_amount && !cs.kokichi_courier_swap_used);
  const canFalseTrail = round?.inspector_id && !round.inspector_action && !cs.kokichi_false_trail_used;
  const canDoubt = round?.inspector_action && !round.result && !cs.kokichi_doubt_used;

  // ---------------------- handlers ----------------------

  const useFalseTrail = async (customText?: string) => {
    if (!round) return;
    const text = customText && customText.trim() ? customText.trim() : randomFalseTrail();
    const idx = cs.current_round - 1;
    const newRounds = [...cs.rounds];
    newRounds[idx] = {
      ...round,
      kokichi_false_trail_text: text,
    };
    await patchState(game.id, {
      rounds: newRounds,
      kokichi_false_trail_used: true,
    });
    await pushEvent('Кокичи: Ложный след', `«${text}»`, link);
  };

  const useDoubt = async () => {
    if (!round) return;
    const idx = cs.current_round - 1;
    const newRounds = [...cs.rounds];
    newRounds[idx] = {
      ...round,
      kokichi_doubt_used: true,
    };
    await patchState(game.id, {
      rounds: newRounds,
      kokichi_doubt_used: true,
    });
    await pushEvent('Кокичи: Сомнение Таможенника', 'Таможенник должен подтвердить или поменять решение.', link);
  };

  const useCourierSwap = async () => {
    if (!round) return;
    if (!confirm(`Сменить курьера команды ${round.smuggler_team}? С Кокичи спишется ${KOKICHI_COURIER_SWAP_COST.toLocaleString('ru-RU')} в Казну.`)) return;
    const tx = await chargeToTreasury(KOKICHI_ID, KOKICHI_COURIER_SWAP_COST,
      'Контрабанда · Кокичи использовал Смену курьера', link);
    if (!tx.ok) { alert(tx.error || 'Ошибка'); return; }
    const idx = cs.current_round - 1;
    const newRounds = [...cs.rounds];
    newRounds[idx] = {
      ...round,
      kokichi_courier_swap_used: true,
      kokichi_old_smuggler_id: round.smuggler_id ?? null,
      smuggler_id: null,
      // Возвращаем фазу в выбор Контрабандиста, чтобы команда могла выбрать другого.
      status: 'selecting_smuggler',
    };
    await patchState(game.id, {
      rounds: newRounds,
      kokichi_courier_swap_used: true,
      status: 'selecting_smuggler',
    });
    await pushEvent('Кокичи: Смена курьера',
      `Команда ${round.smuggler_team} должна выбрать другого Контрабандиста.`, link);
  };

  /** Применить итог Ложного следа после раскрытия (вручную или авто). */
  const settleFalseTrail = async () => {
    if (!round || !round.result || round.kokichi_money_delta) return;
    const inspectorAction = round.inspector_final_action ?? round.inspector_action;
    if (!inspectorAction) return;
    const mistake = inspectorMadeMistake({
      caseAmount: round.smuggled_amount ?? 0,
      action: inspectorAction,
    });
    const delta = mistake ? +KOKICHI_FALSE_TRAIL_REWARD : -KOKICHI_FALSE_TRAIL_PENALTY;
    if (delta > 0) {
      await payoutFromTreasury(KOKICHI_ID, delta, 'Контрабанда · Ложный след сработал', link);
    } else {
      await chargeToTreasury(KOKICHI_ID, -delta, 'Контрабанда · Ложный след провалился', link);
    }
    const idx = cs.current_round - 1;
    const newRounds = [...cs.rounds];
    newRounds[idx] = { ...round, kokichi_money_delta: delta };
    await patchState(game.id, {
      rounds: newRounds,
      kokichi_total_money_delta: (cs.kokichi_total_money_delta ?? 0) + delta,
    });
    await pushEvent(
      mistake ? 'Ложный след сработал. Кокичи получает 100 000.' : 'Ложный след провалился. Кокичи теряет 100 000.',
      undefined, link,
    );
  };

  if (mode === 'disabled') return null;

  return (
    <div className="glass-strong p-4 space-y-2 border border-purple-500/30">
      <div className="flex items-center gap-2">
        <div className="text-2xl">🃏</div>
        <div className="flex-1">
          <div className="text-[10px] uppercase tracking-widest text-purple-300/80">Куратор</div>
          <div className="font-heading text-base font-bold text-gradient-gold">
            Кокичи Ома
          </div>
          <div className="text-[10px] text-muted-foreground">
            {mode === 'curator' && 'Куратор-наблюдатель: бонус 200k при обороте ≥ 1M, штраф при обороте &lt; 700k.'}
            {mode === 'curator_player' && 'Куратор-участник: входит в команду, может быть Контрабандистом или Таможенником максимум 1 раз.'}
          </div>
        </div>
      </div>

      {/* Состояние использования */}
      <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
        <div className={cn('p-2 rounded-lg',
          cs.kokichi_false_trail_used ? 'bg-purple-500/10 border border-purple-500/30' : 'bg-card/40')}>
          Ложный след
          <div className="font-bold mt-0.5">{cs.kokichi_false_trail_used ? 'исп.' : 'доступен'}</div>
        </div>
        <div className={cn('p-2 rounded-lg',
          cs.kokichi_doubt_used ? 'bg-purple-500/10 border border-purple-500/30' : 'bg-card/40')}>
          Сомнение
          <div className="font-bold mt-0.5">{cs.kokichi_doubt_used ? 'исп.' : 'доступно'}</div>
        </div>
        <div className={cn('p-2 rounded-lg',
          cs.kokichi_courier_swap_used ? 'bg-purple-500/10 border border-purple-500/30' : 'bg-card/40')}>
          Смена курьера
          <div className="font-bold mt-0.5">{cs.kokichi_courier_swap_used ? 'исп.' : 'доступна'}</div>
        </div>
      </div>

      {/* Действия Кокичи / админа */}
      {canActAsKokichi && round && (
        <div className="space-y-2">
          {!cs.kokichi_courier_swap_used && round.smuggler_id && !round.smuggled_amount && (
            <button
              className="btn-secondary w-full text-xs"
              onClick={useCourierSwap}
            >🔁 Смена курьера · −{(KOKICHI_COURIER_SWAP_COST / 1000)}k в Казну</button>
          )}

          {!cs.kokichi_false_trail_used && round.inspector_id && !round.inspector_action && (
            <FalseTrailPicker onPick={useFalseTrail} />
          )}

          {!cs.kokichi_doubt_used && round.inspector_action && !round.result && (
            <button
              className="btn-secondary w-full text-xs"
              onClick={useDoubt}
            >❓ Сомнение Таможенника</button>
          )}

          {round.result && cs.kokichi_false_trail_used && !round.kokichi_money_delta
            && round.kokichi_false_trail_text && (
            <button
              className="btn-primary w-full text-xs"
              onClick={settleFalseTrail}
            >💸 Зафиксировать итог Ложного следа</button>
          )}
        </div>
      )}

      {/* Лог: что произошло в текущем раунде */}
      {round && round.kokichi_false_trail_text && (
        <div className="text-[11px] p-2 rounded bg-purple-500/10 border border-purple-500/30 italic">
          🃏 <b>Ложный след:</b> «{round.kokichi_false_trail_text}»
        </div>
      )}
      {round && round.kokichi_doubt_used && (
        <div className="text-[11px] p-2 rounded bg-purple-500/10 border border-purple-500/30">
          ❓ Кокичи заставил Таможенника усомниться.
          {round.inspector_final_action && round.inspector_final_action !== round.inspector_action && (
            <span className="text-amber-300 ml-1">Решение изменено.</span>
          )}
        </div>
      )}
      {round && round.kokichi_courier_swap_used && (
        <div className="text-[11px] p-2 rounded bg-purple-500/10 border border-purple-500/30">
          🔁 Кокичи сменил курьера. Старый: {round.kokichi_old_smuggler_id ?? '?'}
        </div>
      )}

      {/* Итог Кокичи */}
      {(cs.kokichi_total_money_delta ?? 0) !== 0 && (
        <div className="text-[10px] text-muted-foreground text-center">
          Итог Кокичи за игру:&nbsp;
          <Yen amount={Math.abs(cs.kokichi_total_money_delta ?? 0)}
            className={cn('inline', (cs.kokichi_total_money_delta ?? 0) > 0 ? 'text-emerald-300' : 'text-red-300')}
            iconClass="w-3 h-3" />
        </div>
      )}
    </div>
  );
}

function FalseTrailPicker({ onPick }: { onPick: (text?: string) => void }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');
  if (!open) {
    return (
      <button className="btn-secondary w-full text-xs" onClick={() => setOpen(true)}>
        🃏 Ложный след
      </button>
    );
  }
  return (
    <div className="glass p-2 space-y-1.5">
      <div className="text-[10px] text-muted-foreground">Выберите готовое или впишите своё:</div>
      <div className="space-y-1 max-h-40 overflow-y-auto">
        {KOKICHI_FALSE_TRAIL_MESSAGES.map((m, i) => (
          <button key={i} className="w-full text-left text-[11px] p-1.5 rounded bg-card/40 active:bg-white/5"
            onClick={() => { onPick(m); setOpen(false); }}>
            {m}
          </button>
        ))}
      </div>
      <input value={custom} onChange={e => setCustom(e.target.value)}
        placeholder="свой текст ложного следа..."
        className="input-field text-xs" />
      <div className="grid grid-cols-2 gap-1.5">
        <button className="btn-secondary text-[10px]" onClick={() => setOpen(false)}>Отмена</button>
        <button className="btn-primary text-[10px]" disabled={!custom.trim()}
          onClick={() => { onPick(custom); setOpen(false); }}>
          Использовать свой
        </button>
      </div>
    </div>
  );
}
