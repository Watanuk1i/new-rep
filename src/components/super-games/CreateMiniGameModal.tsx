'use client';

// Универсальная модалка создания малой игры. Доступна всем игрокам с /games.
// Игрок-создатель сам участвует автоматически.

import { useState } from 'react';
import { useStore, uid } from '@/lib/store/StoreProvider';
import { CharacterIcon } from '@/components/ui/CharacterIcon';
import { Yen } from '@/components/ui/Yen';
import { cn, isPlayer } from '@/lib/utils';
import { getSupabase } from '@/lib/supabase/client';
import { MINI_GAMES } from '@/lib/minigames/catalog';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CreateMiniGameModal({ open, onClose }: Props) {
  const { state, currentUser, role } = useStore();
  const sb = getSupabase();
  const isAdmin = role === 'gm' || role === 'queen';
  const [pickedType, setPickedType] = useState<string>('mini_red_black');
  const [stake, setStake] = useState<number>(50_000);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openCall, setOpenCall] = useState(false); // открытый сбор: любой может присоединиться
  const [jokerMode, setJokerMode] = useState<'quick' | 'long' | 'advanced'>('quick');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Игроку показываем только не-adminOnly игры; админ видит всё.
  const games = MINI_GAMES.filter(m => isAdmin || !m.adminOnly);
  const meta = games.find(m => m.type === pickedType) ?? games[0];

  if (!open || !currentUser) return null;

  const eligible = state.participants.filter(p => isPlayer(p) && p.is_active && p.id !== currentUser.id);

  const togglePart = (pid: string) => {
    const next = new Set(selected);
    if (next.has(pid)) next.delete(pid);
    else if (next.size + 1 < meta.maxPlayers) next.add(pid);  // -1 потому что создатель тоже
    setSelected(next);
  };

  const create = async () => {
    setError(null);
    if (!sb) return;
    // Создатель автоматически входит в игру.
    // openCall: только создатель в participant_ids, остальные присоединятся через /games.
    const allIds = openCall
      ? [currentUser.id]
      : (isAdmin ? Array.from(selected) : [currentUser.id, ...Array.from(selected)]);
    if (!openCall && allIds.length < meta.minPlayers) {
      setError(`Нужно минимум ${meta.minPlayers} игроков (или включите «Открытый сбор»).`);
      return;
    }
    setBusy(true);
    const sgId = uid('sg');
    let initialState: any = {};
    if (pickedType === 'mini_red_black') {
      initialState = { stake, fee_paid: {}, choices: {}, result: null, winner_ids: [], status: 'waiting_players' };
    } else if (pickedType === 'mini_blind_bid') {
      initialState = { fee_paid: {}, bids: {}, status: 'active', winner_id: null };
    } else if (pickedType === 'mini_liar_dice') {
      initialState = { stake, fee_paid: {}, dice: {}, turn_order: [], current_turn_idx: 0, claim: null, status: 'waiting_players' };
    } else if (pickedType === 'mini_despair_21') {
      initialState = { stake, fee_paid: {}, hands: {}, stand: {}, dealer_hand: [], status: 'waiting_players' };
    } else if (pickedType === 'mini_joker') {
      initialState = {
        mode: jokerMode, stake, fee_paid: {}, bank: 0, treasury_fee: 0, payout_bank: 0,
        deck: [], turn_order: [], current_idx: 0, eliminated_ids: [], skip_used_ids: [],
        hint_uses: {}, hint_revealed_top: {},
        pending_pass_from: null, pending_pass_to: null,
        actions: [], winner_ids: [], loser_ids: [], status: 'waiting_players',
      };
    } else if (pickedType === 'liars_bar') {
      initialState = {
        status: 'waiting',
        players: [],
        table_card: 'A',
        deck: [],
        discard: [],
        turn_player_id: null,
        pending_play: null,
        pending_roulette: null,
        turn_count: 0,
        round_index: 1,
        bank: 0,
        winner_id: null,
        log: [],
      };
    }

    // Добавляем openCall в state, чтобы /games показывал «открытый сбор» и любой мог присоединиться
    const initialStateWithOpen = { ...initialState, is_open: openCall };

    await sb.from('super_games').insert({
      id: sgId,
      title: meta.label + (openCall ? ' · открытый сбор' : ''),
      type: pickedType,
      description: pickedType === 'liars_bar'
        ? 'Бар лжецов · карты, заявления, обвинения, револьвер. Долги не создаются.'
        : `Малая игра: ${meta.label}`,
      rules: '',
      stakes: stake > 0 ? `Ставка ${stake.toLocaleString('ru-RU')} с каждого участника` : null,
      // Новые игры всегда стартуют в `scheduled` — лобби с кнопкой готов.
      status: 'scheduled',
      participant_ids: allIds,
      spectator_bets_enabled: false,
      entry_fee: stake,
      bank: 0,
      state: initialStateWithOpen,
    });

    await sb.from('events').insert({
      id: uid('ev'),
      type: 'mini_game_start',
      title: `Малая игра: ${meta.label}${openCall ? ' (открытый сбор)' : ''}`,
      body: `${currentUser.display_name} создал игру. ${openCall ? 'Любой может присоединиться через раздел Игры.' : `Игроков: ${allIds.length}.`}`,
      link_url: `/super-games/${sgId}`,
      is_for_gm_only: false,
    });

    if (openCall) {
      // Уведомление ВСЕМ активным игрокам кроме создателя
      const targets = state.participants.filter(p => isPlayer(p) && p.is_active && p.id !== currentUser.id);
      if (targets.length > 0) {
        await sb.from('notifications').insert(
          targets.map(t => ({
            id: uid('n'),
            recipient_id: t.id,
            type: 'mini_game_invite',
            title: `🎯 Открытый сбор: ${meta.label}`,
            body: `${currentUser.display_name} собирает игру. Ставка: ${stake.toLocaleString('ru-RU')} ¥. Заходите!`,
            link_url: `/games`,
            is_read: false,
          })),
        );
      }
    } else if (allIds.length > 0) {
      await sb.from('notifications').insert(
        allIds.filter(id => id !== currentUser.id).map((pid: string) => ({
          id: uid('n'),
          recipient_id: pid,
          type: 'mini_game_invite',
          title: `Малая игра: ${meta.label}`,
          body: `${currentUser.display_name} пригласил вас. Ставка: ${stake.toLocaleString('ru-RU')} ¥.`,
          link_url: `/super-games/${sgId}`,
          is_read: false,
        })),
      );
    }

    setBusy(false);
    setSelected(new Set());
    setOpenCall(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative glass-strong gold-border w-full max-w-md p-4 rounded-2xl space-y-3 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center gap-2">
          <div className="text-3xl">🎯</div>
          <div className="flex-1">
            <div className="text-[10px] uppercase tracking-widest text-gold/70">Малая игра</div>
            <div className="font-heading text-lg font-bold text-gradient-gold">Создать игру</div>
            <div className="text-[10px] text-muted-foreground">
              {isAdmin
                ? 'Вы создаёте от ведущего, выбирайте игроков.'
                : 'Вы автоматически участник. Пригласите остальных.'}
            </div>
          </div>
          <button onClick={onClose} className="text-2xl text-muted-foreground">×</button>
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-widest text-gold/70 mb-1 block">Тип</label>
          <select className="input-field text-sm"
            value={pickedType}
            onChange={e => { setPickedType(e.target.value); setSelected(new Set()); setStake(MINI_GAMES.find(m => m.type === e.target.value)?.defaultStake ?? 0); }}>
            {games.map(m => (
              <option key={m.type} value={m.type}>{m.emoji} {m.label}</option>
            ))}
          </select>
        </div>

        {meta.defaultStake > 0 && (
          <div>
            <label className="text-[10px] uppercase tracking-widest text-gold/70 mb-1 block">
              Ставка с каждого (¥)
            </label>
            <input type="number" min={10_000} step={10_000}
              value={stake}
              onChange={e => setStake(Math.max(10_000, Number(e.target.value)))}
              className="input-field font-mono text-sm" />
            {currentUser && stake > currentUser.balance && (
              <div className="text-[10px] text-amber-300 mt-1">
                У вас не хватает (баланс: <Yen amount={currentUser.balance} className="inline" iconClass="hidden" />). Уйдёт в долг Казне.
              </div>
            )}
          </div>
        )}

        {pickedType === 'mini_joker' && (
          <div>
            <label className="text-[10px] uppercase tracking-widest text-gold/70 mb-1 block">Режим</label>
            <div className="grid grid-cols-3 gap-1">
              {(['quick', 'long', 'advanced'] as const).map(m => (
                <button key={m}
                  className={cn('px-2 py-2 rounded-lg text-xs border',
                    jokerMode === m ? 'bg-gold/15 border-gold/50 text-gold' : 'bg-card/60 border-white/8')}
                  onClick={() => setJokerMode(m)}>
                  {m === 'quick' && '⚡ Быстрый'}
                  {m === 'long' && '🌀 Без бонусов'}
                  {m === 'advanced' && '♟️ С бонусами'}
                </button>
              ))}
            </div>
            <div className="text-[10px] text-muted-foreground mt-1.5">
              {jokerMode === 'quick' && 'Один тянет джокера → проиграл, остальные делят банк.'}
              {jokerMode === 'long' && 'Тянет джокера → выбывает, до одного.'}
              {jokerMode === 'advanced' && 'То же + платные действия (пропуск 20k, подсказка 30k, передача 30k).'}
            </div>
          </div>
        )}

        <div>
          <button onClick={() => setOpenCall(!openCall)}
            className={cn('w-full p-3 rounded-xl border-2 transition-all',
              openCall ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-200' : 'bg-card/40 border-white/10')}>
            <div className="flex items-center gap-2">
              <span className="text-xl">{openCall ? '🌍' : '🔒'}</span>
              <div className="flex-1 text-left">
                <div className="font-bold text-sm">
                  {openCall ? 'Открытый сбор включён' : 'Открытый сбор'}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {openCall
                    ? 'Любой игрок присоединится со страницы Игры'
                    : 'Включите чтобы все игроки увидели вашу игру в Вызовах'}
                </div>
              </div>
            </div>
          </button>
        </div>

        {!openCall && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-gold/70 mb-1">
            Пригласить ({selected.size + (isAdmin ? 0 : 1)}/{meta.maxPlayers}, мин {meta.minPlayers})
          </div>
          <div className="max-h-44 overflow-y-auto space-y-1 glass p-2">
            {eligible.map(p => {
              const isSelected = selected.has(p.id);
              const limitReached = !isSelected && (selected.size + (isAdmin ? 0 : 1)) >= meta.maxPlayers;
              return (
                <label
                  key={p.id}
                  className={cn(
                    'flex items-center gap-2 p-1.5 rounded-lg cursor-pointer active:bg-white/5',
                    limitReached && 'opacity-40 cursor-not-allowed',
                  )}
                >
                  <input type="checkbox" checked={isSelected} disabled={limitReached}
                    onChange={() => togglePart(p.id)}
                    className="w-4 h-4 accent-gold" />
                  <CharacterIcon participant={p} size="xs" ringless />
                  <span className="text-sm flex-1">{p.display_name}</span>
                  <Yen amount={p.balance} className="text-[10px] text-muted-foreground" iconClass="w-3 h-3" />
                </label>
              );
            })}
          </div>
          {!isAdmin && (
            <div className="text-[10px] text-emerald-300 mt-1">
              Вы участвуете автоматически.
            </div>
          )}
        </div>
        )}

        {error && (
          <div className="glass crimson-border p-2 text-xs text-red-300 text-center">{error}</div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button onClick={onClose} className="btn-secondary text-sm">Отмена</button>
          <button onClick={create} disabled={busy} className="btn-primary text-sm">
            {busy ? '...' : '▶ Создать'}
          </button>
        </div>
      </div>
    </div>
  );
}
