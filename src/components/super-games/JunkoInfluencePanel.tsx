'use client';

// Панель влияния Джунко в «Комнате девяти патронов».
// Хранит состояние в super_games.state.junko, не трогая NineBulletsState.

import { useState } from 'react';
import { useStore } from '@/lib/store/StoreProvider';
import { CharacterIcon } from '@/components/ui/CharacterIcon';
import { Yen } from '@/components/ui/Yen';
import { cn } from '@/lib/utils';
import { getSupabase } from '@/lib/supabase/client';
import { chargeToTreasury } from '@/lib/store/tx';
import {
  JUNKO_ID,
  JUNKO_AUCTION_PROVOCATION_PRICE_INCREASE,
  JUNKO_LAUGH_SWAP_COST, JUNKO_LAUGH_REFUSE_COST,
  JUNKO_LAUGH_FAILURE_PENALTY, JUNKO_GENERAL_FAILURE_PENALTY,
} from '@/lib/junko/constants';
import type { SuperGame, Participant } from '@/lib/store/types';

interface JunkoSubState {
  /** На какие места провоцирован аукцион в текущем раунде. */
  auction_provocations?: { round: number; seat: number; old_min: number; new_min: number }[];
  /** Использован ли «Смех Джунко» в этой игре. */
  laugh_used?: boolean;
  laugh_round?: number | null;
  laugh_result?: 'shooter_swapped' | 'shooter_refused' | 'pending' | null;
  laugh_failure_applied?: boolean;
  general_failure_applied?: boolean;
  /** Сколько раз использована Провокация в текущем раунде (по номеру раунда). */
  provocation_used_in_round?: number | null;
  /** id Джунко-участника, если есть. */
  junko_id?: string | null;
}

function getSub(g: SuperGame): JunkoSubState {
  const s = (g.state || {}) as any;
  return (s.junko ?? {}) as JunkoSubState;
}

async function patchSub(gameId: string, patch: Partial<JunkoSubState>) {
  const sb = getSupabase();
  if (!sb) return;
  const { data } = await sb.from('super_games').select('state').eq('id', gameId).single();
  const cur = (data?.state ?? {}) as any;
  const junko = { ...(cur.junko ?? {}), ...patch };
  await sb.from('super_games').update({ state: { ...cur, junko } }).eq('id', gameId);
}

async function pushEvent(title: string, body: string | undefined, link: string) {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from('events').insert({
    id: 'ev-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
    type: 'junko_influence',
    title, body: body ?? null, link_url: link, is_for_gm_only: false,
  });
}

// ===========================================================================

export function JunkoInfluencePanel({ game }: { game: SuperGame }) {
  const { state, role, currentUser } = useStore();
  const isAdmin = role === 'gm' || role === 'queen';
  const sub = getSub(game);
  const nb = (game.state ?? {}) as any;
  const round = nb.rounds?.[nb.current_round - 1] ?? null;

  // Берём Джунко по фиксированному id, fallback — поиск по имени.
  const junkoParticipant =
    state.participants.find(p => p.id === JUNKO_ID) ??
    state.participants.find(p =>
      p.display_name?.toLowerCase().includes('джунко') || p.display_name?.toLowerCase().includes('junko'));

  // Сама Джунко (если залогинена) тоже может управлять своей панелью
  const isJunkoUser = !!currentUser && junkoParticipant?.id === currentUser.id;
  const canActAsJunko = isAdmin || isJunkoUser;

  const inAuction = round?.status === 'seat_auction' || round?.auction_status === 'open';
  const inSwap = round?.status === 'shooter_swap';
  const provUsedInThisRound = sub.provocation_used_in_round === round?.n;

  return (
    <div className="glass-strong p-4 space-y-2 border border-fuchsia-500/30">
      <div className="flex items-center gap-2">
        <div className="text-2xl">🎀</div>
        <div className="flex-1">
          <div className="text-[10px] uppercase tracking-widest text-fuchsia-300/80">Куратор</div>
          <div className="font-heading text-base font-bold text-gradient-gold">
            Джунко Эношима · режиссёр хаоса
          </div>
          <div className="text-[10px] text-muted-foreground">
            Не меняет патроны и не управляет результатом. Может усложнять торги или ставить
            Стрелка перед сложным выбором.
          </div>
        </div>
      </div>

      {/* Состояние использования */}
      <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
        <div className={cn('p-2 rounded-lg',
          provUsedInThisRound ? 'bg-fuchsia-500/10 border border-fuchsia-500/30' : 'bg-card/40')}>
          Провокация
          <div className="font-bold mt-0.5">{provUsedInThisRound ? 'исп.' : 'доступна'}</div>
        </div>
        <div className={cn('p-2 rounded-lg',
          sub.laugh_used ? 'bg-fuchsia-500/10 border border-fuchsia-500/30' : 'bg-card/40')}>
          Смех Джунко
          <div className="font-bold mt-0.5">{sub.laugh_used ? 'исп.' : 'доступен'}</div>
        </div>
        <div className="p-2 rounded-lg bg-card/40">
          Штрафы
          <div className="font-bold mt-0.5">
            {[sub.laugh_failure_applied, sub.general_failure_applied].filter(Boolean).length}
          </div>
        </div>
      </div>

      {canActAsJunko && (
        <div className="space-y-2">
          {isJunkoUser && !isAdmin && (
            <div className="text-[10px] text-fuchsia-300/80 italic">
              Вы — Джунко. Можно использовать свои возможности, даже если не в составе игры.
            </div>
          )}
          {inAuction && !provUsedInThisRound && (
            <ProvocationButton game={game} round={round} junkoId={junkoParticipant?.id ?? null} />
          )}
          {inSwap && !sub.laugh_used && (
            <button
              className="btn-secondary w-full text-xs"
              onClick={() => useLaugh(game, round.n)}
            >🤣 Использовать Смех Джунко</button>
          )}
          {sub.laugh_used && sub.laugh_result === 'pending' && (
            <ShooterChoiceForLaugh game={game} round={round} />
          )}
          {sub.laugh_used && sub.laugh_result && sub.laugh_result !== 'pending' && !sub.laugh_failure_applied && (
            <button
              className="btn-danger w-full text-xs"
              onClick={() => fixLaughFailure(game, junkoParticipant?.id ?? null)}
            >😈 Зафиксировать провал Смеха Джунко (−300k)</button>
          )}
          {nb.status === 'finished' && !sub.general_failure_applied && (
            <button
              className="btn-danger w-full text-xs"
              onClick={() => fixGeneralFailure(game, junkoParticipant?.id ?? null)}
            >📉 Зафиксировать общий провал Джунко (−500k)</button>
          )}
        </div>
      )}

      {/* Лог провокаций */}
      {sub.auction_provocations && sub.auction_provocations.length > 0 && (
        <details>
          <summary className="cursor-pointer text-[11px] text-muted-foreground py-1">
            История провокаций ({sub.auction_provocations.length})
          </summary>
          <div className="mt-1 space-y-1">
            {sub.auction_provocations.map((p, i) => (
              <div key={i} className="text-[10px] p-1.5 rounded bg-card/30">
                Раунд {p.round}: место №{p.seat}, мин. цена {p.old_min} → {p.new_min}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

// ---------- Провокация аукциона ----------

function ProvocationButton({
  game, round, junkoId,
}: { game: SuperGame; round: any; junkoId: string | null }) {
  const [pickingSeat, setPickingSeat] = useState(false);
  if (!pickingSeat) {
    return (
      <button
        className="btn-secondary w-full text-xs"
        onClick={() => setPickingSeat(true)}
      >🎯 Использовать Провокацию аукциона (1 раз/раунд)</button>
    );
  }
  return (
    <div className="glass p-2">
      <div className="text-[11px] mb-1 text-muted-foreground">Выберите место (1–9):</div>
      <div className="grid grid-cols-9 gap-1">
        {Array.from({ length: 9 }, (_, i) => i + 1).map(seat => (
          <button
            key={seat}
            className="text-xs px-1 py-1.5 rounded-md bg-card/60 border border-white/8 active:bg-white/5"
            onClick={() => provoke(game, round, seat).then(() => setPickingSeat(false))}
          >{seat}</button>
        ))}
      </div>
      <button className="text-[10px] text-muted-foreground mt-1" onClick={() => setPickingSeat(false)}>Отмена</button>
    </div>
  );
}

async function provoke(game: SuperGame, round: any, seat: number) {
  // В нашей NineBullets минимальная цена места не отдельным полем — это аукционная
  // ставка. Но эффект «+50k к минимальной цене» можно зафиксировать как метаданные:
  // в state.junko.auction_provocations мы пишем факт. UI покажет «место подозрительно».
  const link = `/super-games/${game.id}`;
  const cur = await fetchSub(game.id);
  const list = cur?.auction_provocations ?? [];
  // Базовая мин. цена в нашей реализации — 0; считаем условно от текущей макс. ставки
  const oldMin = 50_000;
  const newMin = oldMin + JUNKO_AUCTION_PROVOCATION_PRICE_INCREASE;
  await patchSub(game.id, {
    auction_provocations: [...list, { round: round.n, seat, old_min: oldMin, new_min: newMin }],
    provocation_used_in_round: round.n,
  });
  await pushEvent(
    'Джунко использовала Провокацию аукциона',
    `Минимальная цена места ${seat} увеличена на ${JUNKO_AUCTION_PROVOCATION_PRICE_INCREASE.toLocaleString('ru-RU')}.`,
    link,
  );
}

async function fetchSub(gameId: string): Promise<JunkoSubState | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.from('super_games').select('state').eq('id', gameId).single();
  return ((data?.state as any)?.junko ?? null) as JunkoSubState | null;
}

// ---------- Смех Джунко ----------

async function useLaugh(game: SuperGame, roundN: number) {
  await patchSub(game.id, {
    laugh_used: true, laugh_round: roundN, laugh_result: 'pending',
  });
  await pushEvent(
    'Джунко активировала Смех Джунко',
    `Стрелок должен выбрать: заплатить ${JUNKO_LAUGH_SWAP_COST.toLocaleString('ru-RU')} за перестановку двух Сидящих или отказаться (потеряв ${JUNKO_LAUGH_REFUSE_COST.toLocaleString('ru-RU')}).`,
    `/super-games/${game.id}`,
  );
}

function ShooterChoiceForLaugh({ game, round }: { game: SuperGame; round: any }) {
  const link = `/super-games/${game.id}`;
  const accept = async () => {
    if (!round?.shooter_id) { alert('Стрелок не определён.'); return; }
    const res = await chargeToTreasury(round.shooter_id, JUNKO_LAUGH_SWAP_COST,
      'Смех Джунко · Стрелок согласился перепутать места', link);
    if (!res.ok) return;
    await patchSub(game.id, { laugh_result: 'shooter_swapped' });
    await pushEvent(
      'Стрелок заплатил 100 000 за перестановку Сидящих',
      'Перестановку проведите вручную в фазе перестановки.',
      link,
    );
  };
  const refuse = async () => {
    if (!round?.shooter_id) { alert('Стрелок не определён.'); return; }
    const res = await chargeToTreasury(round.shooter_id, JUNKO_LAUGH_REFUSE_COST,
      'Смех Джунко · Стрелок отказался от перестановки', link);
    if (!res.ok) return;
    await patchSub(game.id, { laugh_result: 'shooter_refused' });
    await pushEvent('Стрелок отказался от перестановки и потерял 50 000', undefined, link);
  };
  return (
    <div className="glass p-2 space-y-1">
      <div className="text-[11px] text-muted-foreground">Стрелок выбирает (для MVP админ нажимает):</div>
      <div className="grid grid-cols-2 gap-2">
        <button className="btn-success text-xs" onClick={accept}>Заплатить 100k и переставить</button>
        <button className="btn-danger text-xs" onClick={refuse}>Отказаться (−50k)</button>
      </div>
    </div>
  );
}

async function fixLaughFailure(game: SuperGame, junkoId: string | null) {
  if (!confirm('Стрелок завершил раунд в плюсе после Смеха Джунко? Это спишет с Джунко 300 000 в Казну.')) return;
  const link = `/super-games/${game.id}`;
  // Если Джунко-участник найден, списываем у неё; иначе только событие
  if (junkoId) {
    await chargeToTreasury(junkoId, JUNKO_LAUGH_FAILURE_PENALTY,
      'Смех Джунко · провал', link);
  }
  await patchSub(game.id, { laugh_failure_applied: true });
  await pushEvent(
    'Смех Джунко не сломал Стрелка',
    `Джунко теряет ${JUNKO_LAUGH_FAILURE_PENALTY.toLocaleString('ru-RU')}.`,
    link,
  );
}

async function fixGeneralFailure(game: SuperGame, junkoId: string | null) {
  if (!confirm('Большинство участников завершили игру в плюсе? Это спишет с Джунко 500 000 в Казну.')) return;
  const link = `/super-games/${game.id}`;
  if (junkoId) {
    await chargeToTreasury(junkoId, JUNKO_GENERAL_FAILURE_PENALTY,
      'Комната девяти патронов · общий провал куратора Джунко', link);
  }
  await patchSub(game.id, { general_failure_applied: true });
  await pushEvent(
    'Комната девяти патронов не сломала игроков',
    `Джунко теряет ${JUNKO_GENERAL_FAILURE_PENALTY.toLocaleString('ru-RU')}.`,
    link,
  );
}
