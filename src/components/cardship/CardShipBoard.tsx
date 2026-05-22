'use client';

// Главный экран Большой игры «Карточный корабль».
// Включает: панель статуса игры, мою руку, список игроков (публичная инфа),
// активные дуэли, рынок, журнал, кнопки управления для ведущего.

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useStore, uid } from '@/lib/store/StoreProvider';
import { CharacterIcon } from '@/components/ui/CharacterIcon';
import { Yen, YenIcon } from '@/components/ui/Yen';
import { TransferModal } from '@/components/economy/TransferModal';
import { TogamiInfluencePanel } from '@/components/super-games/TogamiInfluencePanel';
import { cn, formatYenFull, timeAgo } from '@/lib/utils';
import { getSupabase } from '@/lib/supabase/client';
import {
  CARD_LABELS, CARD_EMOJI,
  STARTING_ROCKS, STARTING_SCISSORS, STARTING_PAPERS, STARTING_STARS,
  STARTING_TOTAL_CARDS, WIN_STARS_REQUIRED,
  PRICE_LIMITS, ACCEPT_TIMEOUT_MS, PICK_TIMEOUT_MS,
  compareCards, totalCards, cardField, pickRandomAvailable, isSurvived,
} from '@/lib/cardship/logic';
import type {
  CardShipGame, CardShipState, CardShipDuel, CardShipListing,
  CardType, SuperGame,
} from '@/lib/store/types';

interface Props {
  superGame: SuperGame;
}

export function CardShipBoard({ superGame }: Props) {
  const { state, currentUser, role, addHistory, notify, addEvent } = useStore();
  const sb = getSupabase();
  const isAdmin = role === 'gm' || role === 'queen';

  // Найти связанную card_ship_games запись
  const game = state.cardShipGames.find(g => g.super_game_id === superGame.id);
  const states = useMemo(
    () => game ? state.cardShipStates.filter(s => s.game_id === game.id) : [],
    [state.cardShipStates, game],
  );
  const duels = useMemo(
    () => game ? state.cardShipDuels.filter(d => d.game_id === game.id) : [],
    [state.cardShipDuels, game],
  );
  const listings = useMemo(
    () => game ? state.cardShipListings.filter(l => l.game_id === game.id) : [],
    [state.cardShipListings, game],
  );

  const myState = currentUser
    ? states.find(s => s.player_id === currentUser.id) || null
    : null;
  const isParticipant = !!myState;

  // Просроченные дуэли — авто-обработка при загрузке + тик каждые 10 сек.
  const [expireTick, setExpireTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setExpireTick(x => x + 1), 10_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!sb || !game) return;
    if (game.status !== 'active') return;
    const now = Date.now();
    duels.forEach(async d => {
      // Если дуэль accepted и обе карты уже выбраны — раскрываем.
      // Это закрывает гонку, когда два клиента кликнули практически одновременно
      // и ни один не успел увидеть карту оппонента в re-fetch внутри pickCard.
      if (d.status === 'accepted' && d.challenger_card && d.opponent_card) {
        await resolveDuel(d.id, d.challenger_card, d.opponent_card);
        return;
      }
      if (d.status === 'pending' && d.accept_deadline) {
        if (now > new Date(d.accept_deadline).getTime()) {
          await sb.from('card_ship_duels')
            .update({ status: 'expired', resolved_at: new Date().toISOString() })
            .eq('id', d.id).eq('status', 'pending');
        }
      }
      if (d.status === 'accepted' && d.pick_deadline) {
        if (now > new Date(d.pick_deadline).getTime()) {
          // Авто-выбор случайной карты для тех, кто не выбрал
          await autoResolveDuel(d.id);
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.status, duels, expireTick]);

  if (!game) {
    return (
      <div className="glass p-6 text-center">
        <div className="text-3xl mb-2 opacity-30">🎴</div>
        <p className="text-sm text-muted-foreground mb-2">
          Внутреннее состояние игры не найдено.
        </p>
        <p className="text-[10px] text-muted">
          Возможно, миграция БД не применена. Запустите supabase/setup_v2_economy.sql.
        </p>
      </div>
    );
  }

  // ==================================================================
  // ДЕЙСТВИЯ ВЕДУЩЕГО
  // ==================================================================

  const startGame = async () => {
    if (!sb || !isAdmin) return;
    if (game.status !== 'collecting_stakes') return;
    const ids = game.participant_ids;
    if (ids.length < 2) {
      alert('Нужно минимум 2 игрока');
      return;
    }
    // Проверяем, что у всех хватает на ставку
    const players = ids.map(pid => state.participants.find(p => p.id === pid)).filter(Boolean) as any[];
    const insufficient = players.filter(p => p.balance < game.entry_fee);
    if (insufficient.length > 0) {
      alert(`Недостаточно ейн у: ${insufficient.map(p => p.display_name).join(', ')}`);
      return;
    }
    if (!confirm(`Списать ¥${formatYenFull(game.entry_fee)} с каждого из ${ids.length} игроков и запустить игру?`)) return;

    // Списание
    for (const p of players) {
      await sb.from('participants').update({ balance: p.balance - game.entry_fee }).eq('id', p.id);
      await addHistory(p.id, 'card_ship_stake', 'Входная ставка в Карточный корабль', -game.entry_fee, `/super-games/${superGame.id}`);
    }
    const totalBank = game.entry_fee * ids.length;

    // Создаём состояния игроков
    const stateRows = ids.map(pid => ({
      id: uid('css'),
      game_id: game.id,
      player_id: pid,
      rocks: STARTING_ROCKS,
      scissors: STARTING_SCISSORS,
      papers: STARTING_PAPERS,
      stars: STARTING_STARS,
      cards_played: 0,
      duels_count: 0,
      status: 'active',
    }));
    await sb.from('card_ship_states').insert(stateRows);

    // Обновляем игру
    await sb.from('card_ship_games').update({
      status: 'active',
      bank: totalBank,
      started_at: new Date().toISOString(),
    }).eq('id', game.id);

    await sb.from('super_games').update({ status: 'live' }).eq('id', superGame.id);

    await addEvent({
      type: 'big_game_start',
      title: 'Карточный корабль запущен',
      body: `Банк: ¥${formatYenFull(totalBank)} · Игроков: ${ids.length}`,
      link_url: `/super-games/${superGame.id}`,
    });

    // Уведомление участникам
    for (const pid of ids) {
      await notify(pid, {
        type: 'big_game_invite',
        title: 'Карточный корабль начался',
        body: 'Получите свои карты и звёзды на странице игры',
        link_url: `/super-games/${superGame.id}`,
      });
    }
  };

  const cancelGame = async () => {
    if (!sb || !isAdmin) return;
    if (!confirm('Отменить игру и вернуть входные ставки участникам?')) return;
    // Если игра уже шла — возвращаем deposit. Если только собиралась — банк нулевой.
    if (game.status === 'active' || game.status === 'finishing') {
      for (const pid of game.participant_ids) {
        const p = state.participants.find(x => x.id === pid);
        if (!p) continue;
        await sb.from('participants').update({ balance: p.balance + game.entry_fee }).eq('id', pid);
        await addHistory(pid, 'card_ship_refund', 'Возврат входной ставки (игра отменена)', game.entry_fee, `/super-games/${superGame.id}`);
      }
    }
    await sb.from('card_ship_games').update({
      status: 'cancelled',
      bank: 0,
      finished_at: new Date().toISOString(),
    }).eq('id', game.id);
    await sb.from('super_games').update({ status: 'cancelled' }).eq('id', superGame.id);
    await addEvent({
      type: 'big_game_finished',
      title: 'Карточный корабль отменён',
      link_url: `/super-games/${superGame.id}`,
    });
  };

  const finishGame = async () => {
    if (!sb || !isAdmin) return;
    if (!confirm('Завершить игру и распределить банк?')) return;
    await sb.from('card_ship_games').update({ status: 'finishing' }).eq('id', game.id);

    // Определяем выживших
    const survivors = states.filter(s => isSurvived(s));
    const losers = states.filter(s => !isSurvived(s));

    // Помечаем статусы
    for (const s of survivors) {
      await sb.from('card_ship_states').update({ status: 'survived' }).eq('id', s.id);
    }
    for (const s of losers) {
      await sb.from('card_ship_states').update({ status: 'lost' }).eq('id', s.id);
    }

    // Распределяем банк
    let recap = '';
    if (survivors.length > 0) {
      const share = Math.floor(game.bank / survivors.length);
      for (const s of survivors) {
        const p = state.participants.find(x => x.id === s.player_id);
        if (!p) continue;
        await sb.from('participants').update({ balance: p.balance + share }).eq('id', p.id);
        await addHistory(p.id, 'card_ship_survived',
          `Выжил в Карточном корабле (+¥${formatYenFull(share)})`, share,
          `/super-games/${superGame.id}`);
        await notify(p.id, {
          type: 'card_ship_finished',
          title: '🏆 Вы выжили!',
          body: `+¥${formatYenFull(share)} из банка`,
          link_url: `/super-games/${superGame.id}`,
        });
      }
      recap = `Выжившие (${survivors.length}): ${survivors.map(s => state.participants.find(p => p.id === s.player_id)?.display_name).filter(Boolean).join(', ')}. Каждый получил ¥${formatYenFull(share)}.`;
    } else {
      recap = `Никто не выжил. Банк ¥${formatYenFull(game.bank)} переведён в Казну студсовета.`;
      // Зачислим в казну Селестии (queen) как держательнице казны
      const queen = state.participants.find(p => p.status === 'queen');
      if (queen) {
        await sb.from('participants').update({ balance: queen.balance + game.bank }).eq('id', queen.id);
      }
    }

    // Уведомления проигравшим
    for (const s of losers) {
      await addHistory(s.player_id, 'card_ship_lost',
        'Не выполнил условия победы в Карточном корабле', undefined,
        `/super-games/${superGame.id}`);
    }

    await sb.from('card_ship_games').update({
      status: 'finished',
      winner_ids: survivors.map(s => s.player_id),
      finished_at: new Date().toISOString(),
    }).eq('id', game.id);

    await sb.from('super_games').update({ status: 'finished' }).eq('id', superGame.id);

    await addEvent({
      type: 'big_game_finished',
      title: 'Карточный корабль завершён',
      body: `Банк: ¥${formatYenFull(game.bank)}. ${recap}`,
      link_url: `/super-games/${superGame.id}`,
    });
  };

  // ==================================================================
  // ДЕЙСТВИЯ ИГРОКА: ДУЭЛИ
  // ==================================================================

  const challenge = async (opponentId: string) => {
    if (!sb || !currentUser || !myState || game.status !== 'active') return;
    if (totalCards(myState) === 0) {
      alert('У вас нет карт для дуэли');
      return;
    }
    const oppState = states.find(s => s.player_id === opponentId);
    if (!oppState || totalCards(oppState) === 0) {
      alert('У оппонента нет карт');
      return;
    }
    // Уже есть открытый вызов между нами?
    const existing = duels.find(d =>
      (d.challenger_id === currentUser.id && d.opponent_id === opponentId ||
        d.challenger_id === opponentId && d.opponent_id === currentUser.id) &&
      (d.status === 'pending' || d.status === 'accepted')
    );
    if (existing) {
      alert('У вас уже есть активная дуэль с этим игроком');
      return;
    }
    const now = new Date();
    await sb.from('card_ship_duels').insert({
      id: uid('csd'),
      game_id: game.id,
      challenger_id: currentUser.id,
      opponent_id: opponentId,
      status: 'pending',
      accept_deadline: new Date(now.getTime() + ACCEPT_TIMEOUT_MS).toISOString(),
    });
    await notify(opponentId, {
      type: 'card_ship_duel',
      title: '⚔️ Вызов на дуэль',
      body: `${currentUser.display_name} вызывает вас на дуэль`,
      link_url: `/super-games/${superGame.id}`,
    });
  };

  const acceptDuel = async (duelId: string) => {
    if (!sb || !currentUser) return;
    const d = duels.find(x => x.id === duelId);
    if (!d || d.opponent_id !== currentUser.id || d.status !== 'pending') return;
    if (!myState || totalCards(myState) === 0) {
      alert('У вас нет карт для дуэли');
      return;
    }
    const now = new Date();
    await sb.from('card_ship_duels').update({
      status: 'accepted',
      pick_deadline: new Date(now.getTime() + PICK_TIMEOUT_MS).toISOString(),
    }).eq('id', duelId);
    await notify(d.challenger_id, {
      type: 'card_ship_duel',
      title: '⚔️ Дуэль принята',
      body: 'Выберите карту',
      link_url: `/super-games/${superGame.id}`,
    });
  };

  const declineDuel = async (duelId: string) => {
    if (!sb || !currentUser) return;
    const d = duels.find(x => x.id === duelId);
    if (!d) return;
    if (d.opponent_id !== currentUser.id && d.challenger_id !== currentUser.id) return;
    await sb.from('card_ship_duels').update({
      status: 'declined',
      resolved_at: new Date().toISOString(),
    }).eq('id', duelId);
  };

  const pickCard = async (duelId: string, card: CardType) => {
    if (!sb || !currentUser || !myState) return;
    const d = duels.find(x => x.id === duelId);
    if (!d || d.status !== 'accepted') return;

    const isChallenger = d.challenger_id === currentUser.id;
    const myField = isChallenger ? 'challenger_card' : 'opponent_card';
    const myCardCount = card === 'rock' ? myState.rocks
      : card === 'scissors' ? myState.scissors : myState.papers;
    if (myCardCount <= 0) {
      alert(`У вас нет карт типа ${CARD_LABELS[card]}`);
      return;
    }
    if ((d as any)[myField]) {
      alert('Вы уже выбрали карту');
      return;
    }
    // 1) Сохраняем свой выбор
    await sb.from('card_ship_duels').update({
      [myField]: card,
    }).eq('id', duelId);

    // 2) Перечитываем запись из БД — там может быть карта оппонента (он мог выбрать одновременно).
    const { data: fresh } = await sb.from('card_ship_duels')
      .select('*').eq('id', duelId).maybeSingle();
    if (fresh && fresh.status === 'accepted'
      && fresh.challenger_card && fresh.opponent_card) {
      await resolveDuel(duelId, fresh.challenger_card, fresh.opponent_card);
    }
  };

  // Авто-резолв при просрочке выбора (если кто-то не успел)
  const autoResolveDuel = async (duelId: string) => {
    if (!sb) return;
    const d = state.cardShipDuels.find(x => x.id === duelId);
    if (!d || d.status !== 'accepted') return;
    let chCard = d.challenger_card;
    let opCard = d.opponent_card;
    if (!chCard) {
      const challengerState = state.cardShipStates.find(s => s.game_id === d.game_id && s.player_id === d.challenger_id);
      chCard = challengerState ? pickRandomAvailable(challengerState) : null;
    }
    if (!opCard) {
      const opponentState = state.cardShipStates.find(s => s.game_id === d.game_id && s.player_id === d.opponent_id);
      opCard = opponentState ? pickRandomAvailable(opponentState) : null;
    }
    if (!chCard || !opCard) {
      // У кого-то нет карт — отменяем дуэль
      await sb.from('card_ship_duels').update({
        status: 'cancelled',
        resolved_at: new Date().toISOString(),
      }).eq('id', duelId);
      return;
    }
    await sb.from('card_ship_duels').update({
      challenger_card: chCard,
      opponent_card: opCard,
    }).eq('id', duelId);
    await resolveDuel(duelId, chCard, opCard);
  };

  // Сожжение карт + передача звезды + запись результата
  const resolveDuel = async (duelId: string, chCard: CardType, opCard: CardType) => {
    if (!sb) return;
    // Идемпотентность: атомарно переводим из 'accepted' → 'revealed'.
    // Если другая ветка уже это сделала — нашему UPDATE не достанется ни одной строки.
    const { data: claimed } = await sb.from('card_ship_duels')
      .update({
        status: 'revealed',
        challenger_card: chCard,
        opponent_card: opCard,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', duelId)
      .eq('status', 'accepted')
      .select('*');
    if (!claimed || claimed.length === 0) {
      // Уже разрешено кем-то — выходим, не дублируем побочные эффекты.
      return;
    }
    const d = claimed[0] as CardShipDuel;
    const ch = state.cardShipStates.find(s => s.game_id === d.game_id && s.player_id === d.challenger_id);
    const op = state.cardShipStates.find(s => s.game_id === d.game_id && s.player_id === d.opponent_id);
    if (!ch || !op) return;

    const verdict = compareCards(chCard, opCard);
    const winnerId = verdict === 'tie' ? null : verdict === 'a' ? d.challenger_id : d.opponent_id;
    const loserId = verdict === 'tie' ? null : verdict === 'a' ? d.opponent_id : d.challenger_id;
    const winnerState = winnerId === d.challenger_id ? ch : op;
    const loserState = loserId === d.challenger_id ? ch : op;

    // Списываем карты
    const chField = cardField(chCard);
    const opField = cardField(opCard);
    const newCh: any = {
      [chField]: (ch as any)[chField] - 1,
      cards_played: ch.cards_played + 1,
      duels_count: ch.duels_count + 1,
    };
    const newOp: any = {
      [opField]: (op as any)[opField] - 1,
      cards_played: op.cards_played + 1,
      duels_count: op.duels_count + 1,
    };

    // Звёзды (только если не ничья и у проигравшего есть звёзды)
    if (winnerId && loserState && loserState.stars > 0) {
      if (winnerId === d.challenger_id) {
        newCh.stars = ch.stars + 1;
        newOp.stars = op.stars - 1;
      } else {
        newOp.stars = op.stars + 1;
        newCh.stars = ch.stars - 1;
      }
    }

    // Статус «закончил карты»
    const chTotal = newCh.rocks ?? ch.rocks;
    const chSciss = newCh.scissors ?? ch.scissors;
    const chPap   = newCh.papers ?? ch.papers;
    const newChTotal = chTotal + chSciss + chPap;
    if (newChTotal === 0) newCh.status = 'out_of_cards';

    const opTotal = newOp.rocks ?? op.rocks;
    const opSciss = newOp.scissors ?? op.scissors;
    const opPap   = newOp.papers ?? op.papers;
    const newOpTotal = opTotal + opSciss + opPap;
    if (newOpTotal === 0) newOp.status = 'out_of_cards';

    await sb.from('card_ship_states').update(newCh).eq('id', ch.id);
    await sb.from('card_ship_states').update(newOp).eq('id', op.id);

    // Дописываем winner_id (атомарный claim выше уже выставил status='revealed' и карты)
    await sb.from('card_ship_duels').update({
      winner_id: winnerId,
    }).eq('id', duelId);

    // История + уведомления
    const challengerName = state.participants.find(p => p.id === d.challenger_id)?.display_name || '?';
    const opponentName = state.participants.find(p => p.id === d.opponent_id)?.display_name || '?';

    if (winnerId) {
      const winnerName = winnerId === d.challenger_id ? challengerName : opponentName;
      const loserName = winnerId === d.challenger_id ? opponentName : challengerName;
      await addHistory(d.challenger_id,
        winnerId === d.challenger_id ? 'card_ship_duel_won' : 'card_ship_duel_lost',
        `Дуэль с ${opponentName}: ${CARD_LABELS[chCard]} vs ${CARD_LABELS[opCard]} · ${winnerId === d.challenger_id ? 'победа' : 'поражение'}`,
        undefined, `/super-games/${superGame.id}`);
      await addHistory(d.opponent_id,
        winnerId === d.opponent_id ? 'card_ship_duel_won' : 'card_ship_duel_lost',
        `Дуэль с ${challengerName}: ${CARD_LABELS[opCard]} vs ${CARD_LABELS[chCard]} · ${winnerId === d.opponent_id ? 'победа' : 'поражение'}`,
        undefined, `/super-games/${superGame.id}`);
      await notify(d.challenger_id, {
        type: 'card_ship_duel',
        title: winnerId === d.challenger_id ? '⚔️ Победа в дуэли' : '⚔️ Поражение в дуэли',
        body: `${CARD_LABELS[chCard]} vs ${CARD_LABELS[opCard]}`,
        link_url: `/super-games/${superGame.id}`,
      });
      await notify(d.opponent_id, {
        type: 'card_ship_duel',
        title: winnerId === d.opponent_id ? '⚔️ Победа в дуэли' : '⚔️ Поражение в дуэли',
        body: `${CARD_LABELS[opCard]} vs ${CARD_LABELS[chCard]}`,
        link_url: `/super-games/${superGame.id}`,
      });
    } else {
      await addHistory(d.challenger_id, 'card_ship_duel_won',
        `Ничья в дуэли с ${opponentName}: ${CARD_LABELS[chCard]} vs ${CARD_LABELS[opCard]}`,
        undefined, `/super-games/${superGame.id}`);
      await addHistory(d.opponent_id, 'card_ship_duel_won',
        `Ничья в дуэли с ${challengerName}: ${CARD_LABELS[opCard]} vs ${CARD_LABELS[chCard]}`,
        undefined, `/super-games/${superGame.id}`);
    }
  };

  // ==================================================================
  // ДЕЙСТВИЯ ИГРОКА: РЫНОК
  // ==================================================================

  const createListing = async (item: 'card' | 'star', cardType: CardType | null, price: number) => {
    if (!sb || !currentUser || !myState || game.status !== 'active') return;
    if (price <= 0) { alert('Цена должна быть больше 0'); return; }
    if (item === 'card') {
      const limits = PRICE_LIMITS.card;
      if (price < limits.min || price > limits.max) {
        alert(`Цена карты: ¥${formatYenFull(limits.min)} – ¥${formatYenFull(limits.max)}`);
        return;
      }
      if (!cardType) return;
      const have = cardType === 'rock' ? myState.rocks
        : cardType === 'scissors' ? myState.scissors : myState.papers;
      if (have <= 0) { alert(`У вас нет карт типа ${CARD_LABELS[cardType]}`); return; }
      // Списываем карту в «локированное» состояние = просто уменьшаем
      await sb.from('card_ship_states').update({
        [cardField(cardType)]: have - 1,
      }).eq('id', myState.id);
    } else {
      const limits = PRICE_LIMITS.star;
      if (price < limits.min || price > limits.max) {
        alert(`Цена звезды: ¥${formatYenFull(limits.min)} – ¥${formatYenFull(limits.max)}`);
        return;
      }
      if (myState.stars <= 0) { alert('У вас нет звёзд'); return; }
      await sb.from('card_ship_states').update({ stars: myState.stars - 1 }).eq('id', myState.id);
    }
    await sb.from('card_ship_listings').insert({
      id: uid('csl'),
      game_id: game.id,
      seller_id: currentUser.id,
      item_type: item,
      card_type: item === 'card' ? cardType : null,
      price,
      status: 'open',
    });
    await addHistory(currentUser.id, 'card_ship_market_listing',
      `Выставил на рынок: ${item === 'star' ? '⭐ звезда' : '🎴 ' + CARD_LABELS[cardType!]} за ¥${formatYenFull(price)}`,
      undefined, `/super-games/${superGame.id}`);
  };

  const cancelListing = async (listingId: string) => {
    if (!sb || !currentUser) return;
    const l = listings.find(x => x.id === listingId);
    if (!l || l.seller_id !== currentUser.id || l.status !== 'open') return;
    // Возвращаем предмет продавцу
    if (l.item_type === 'card' && l.card_type) {
      const s = states.find(x => x.player_id === currentUser.id);
      if (!s) return;
      const f = cardField(l.card_type);
      await sb.from('card_ship_states').update({
        [f]: (s as any)[f] + 1,
      }).eq('id', s.id);
    } else if (l.item_type === 'star') {
      const s = states.find(x => x.player_id === currentUser.id);
      if (!s) return;
      await sb.from('card_ship_states').update({ stars: s.stars + 1 }).eq('id', s.id);
    }
    await sb.from('card_ship_listings').update({
      status: 'cancelled',
    }).eq('id', listingId);
    await addHistory(currentUser.id, 'card_ship_market_cancel',
      `Отменил лот за ¥${formatYenFull(l.price)}`,
      undefined, `/super-games/${superGame.id}`);
  };

  const buyListing = async (listingId: string) => {
    if (!sb || !currentUser || !myState) return;
    if (game.status !== 'active') return;
    const l = listings.find(x => x.id === listingId);
    if (!l || l.status !== 'open') return;
    if (l.seller_id === currentUser.id) { alert('Нельзя купить свой лот'); return; }
    if (currentUser.balance < l.price) { alert('Недостаточно ейн'); return; }
    const seller = state.participants.find(p => p.id === l.seller_id);
    const sellerState = states.find(s => s.player_id === l.seller_id);
    if (!seller || !sellerState) return;

    // Деньги: покупатель → продавец
    await sb.from('participants').update({ balance: currentUser.balance - l.price }).eq('id', currentUser.id);
    await sb.from('participants').update({ balance: seller.balance + l.price }).eq('id', seller.id);

    // Передаём предмет покупателю (продавец уже потерял его при создании лота)
    if (l.item_type === 'card' && l.card_type) {
      const f = cardField(l.card_type);
      await sb.from('card_ship_states').update({
        [f]: (myState as any)[f] + 1,
      }).eq('id', myState.id);
    } else if (l.item_type === 'star') {
      await sb.from('card_ship_states').update({ stars: myState.stars + 1 }).eq('id', myState.id);
    }

    await sb.from('card_ship_listings').update({
      status: 'sold',
      buyer_id: currentUser.id,
      sold_at: new Date().toISOString(),
    }).eq('id', listingId);

    const itemLabel = l.item_type === 'star' ? '⭐ звезду' : '🎴 ' + CARD_LABELS[l.card_type!];
    await addHistory(currentUser.id, 'card_ship_market_buy',
      `Купил у ${seller.display_name} ${itemLabel} за ¥${formatYenFull(l.price)}`,
      -l.price, `/super-games/${superGame.id}`);
    await addHistory(seller.id, 'card_ship_market_sell',
      `Продал ${currentUser.display_name} ${itemLabel} за ¥${formatYenFull(l.price)}`,
      l.price, `/super-games/${superGame.id}`);
    await notify(seller.id, {
      type: 'card_ship_market',
      title: '🛒 Ваш лот продан',
      body: `${currentUser.display_name} купил ${itemLabel} за ¥${formatYenFull(l.price)}`,
      link_url: `/super-games/${superGame.id}`,
    });
  };

  // Вспомогательные UI
  const findPart = (pid: string) => state.participants.find(p => p.id === pid);

  return (
    <div className="space-y-4">
      {/* Шапка игры */}
      <CardShipHeader
        game={game}
        superGame={superGame}
        isAdmin={isAdmin}
        onStart={startGame}
        onCancel={cancelGame}
        onFinish={finishGame}
      />

      {/* Влияние Бьякуи (Фонд Тогами) */}
      <TogamiInfluencePanel
        game={superGame}
        gameKind="card_ship"
        participantIds={game.participant_ids ?? []}
      />

      {/* Моя рука (для участника) */}
      {myState && game.status === 'active' && (
        <MyHandPanel state={myState} />
      )}

      {/* Игроки */}
      <PlayersPanel
        states={states}
        gameStatus={game.status}
        myId={currentUser?.id || null}
        onChallenge={challenge}
        canChallenge={isParticipant && myState !== null && totalCards(myState!) > 0}
        isAdmin={isAdmin}
      />

      {/* Активные/недавние дуэли */}
      {game.status === 'active' && (
        <DuelsPanel
          duels={duels}
          myId={currentUser?.id || null}
          findPart={findPart}
          onAccept={acceptDuel}
          onDecline={declineDuel}
          onPickCard={pickCard}
          myState={myState}
        />
      )}

      {/* Рынок */}
      {game.status === 'active' && (
        <MarketPanel
          listings={listings}
          myId={currentUser?.id || null}
          findPart={findPart}
          onBuy={buyListing}
          onCancel={cancelListing}
          onCreate={createListing}
          myState={myState}
        />
      )}

      {/* История раскрытых дуэлей */}
      <DuelsHistory duels={duels} findPart={findPart} />

      {/* Финал */}
      {game.status === 'finished' && (
        <FinishedSummary game={game} states={states} findPart={findPart} />
      )}
    </div>
  );
}

// =============================================================================
// ШАПКА
// =============================================================================
function CardShipHeader({
  game, superGame, isAdmin, onStart, onCancel, onFinish,
}: {
  game: CardShipGame;
  superGame: SuperGame;
  isAdmin: boolean;
  onStart: () => void;
  onCancel: () => void;
  onFinish: () => void;
}) {
  const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
    scheduled:        { label: '📅 Запланирована', cls: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
    collecting_stakes:{ label: '💰 Сбор ставок',   cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
    active:           { label: '🔴 В эфире',       cls: 'bg-red-500/15 text-red-300 border-red-500/30 animate-pulse-gold' },
    finishing:        { label: '⏳ Подсчёт',       cls: 'bg-purple-500/15 text-purple-300 border-purple-500/30' },
    finished:         { label: '✓ Завершено',     cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
    cancelled:        { label: '✕ Отменено',      cls: 'bg-gray-500/15 text-gray-400 border-gray-500/30' },
  };
  const meta = STATUS_LABEL[game.status] || STATUS_LABEL.scheduled;

  return (
    <div className="glass-strong gold-border p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-gold/70">🎴 Большая игра</div>
          <h2 className="font-heading text-xl font-bold text-gradient-gold leading-tight">
            Карточный корабль
          </h2>
        </div>
        <span className={cn('status-badge border shrink-0', meta.cls)}>{meta.label}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-3">
        <Stat label="Банк">
          <Yen amount={game.bank} className="text-base text-gold" iconClass="w-4 h-4" />
        </Stat>
        <Stat label="Игроков">
          <span className="font-mono font-bold text-base text-gold">{game.participant_ids.length}</span>
        </Stat>
        <Stat label="Ставка">
          <Yen amount={game.entry_fee} className="text-base text-gold" iconClass="w-4 h-4" />
        </Stat>
      </div>

      {isAdmin && (
        <div className="grid grid-cols-2 gap-2 mt-3">
          {game.status === 'collecting_stakes' && (
            <button onClick={onStart} className="btn-success text-xs">▶ Запустить игру</button>
          )}
          {(game.status === 'active' || game.status === 'finishing') && (
            <button onClick={onFinish} className="btn-primary text-xs">🏁 Завершить</button>
          )}
          {game.status !== 'finished' && game.status !== 'cancelled' && (
            <button onClick={onCancel} className="btn-danger text-xs">
              {game.status === 'collecting_stakes' ? '✕ Отменить' : '↩ Отменить + вернуть ставки'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="bg-card/40 rounded-xl p-2 text-center border border-white/5">
      <div>{children}</div>
      <div className="text-[10px] text-muted uppercase tracking-wider mt-1">{label}</div>
    </div>
  );
}

// =============================================================================
// МОЯ РУКА
// =============================================================================
function MyHandPanel({ state }: { state: CardShipState }) {
  const total = totalCards(state);
  return (
    <div className="glass-strong gold-border p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] uppercase tracking-widest text-gold/70">🎴 Моя рука</div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">⭐ {state.stars}</span>
          <span className="text-xs text-muted-foreground">🎴 {total}/{STARTING_TOTAL_CARDS}</span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <CardCounter card="rock" count={state.rocks} />
        <CardCounter card="scissors" count={state.scissors} />
        <CardCounter card="paper" count={state.papers} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
        <div className="bg-card/40 rounded-lg p-2 text-center border border-white/5">
          Сыграно карт: <span className="font-mono font-bold text-gold">{state.cards_played}</span>
        </div>
        <div className="bg-card/40 rounded-lg p-2 text-center border border-white/5">
          Сыграно дуэлей: <span className="font-mono font-bold text-gold">{state.duels_count}</span>
        </div>
      </div>
      <div className="mt-3 text-[10px] text-muted leading-relaxed">
        Выживание: 0 карт в руке + минимум {WIN_STARS_REQUIRED} звезды.
        Сейчас вы {isSurvived(state) ? 'выполнили' : 'не выполнили'} условие.
      </div>
    </div>
  );
}

function CardCounter({ card, count }: { card: CardType; count: number }) {
  return (
    <div className={cn(
      'glass p-3 flex flex-col items-center text-center',
      count === 0 && 'opacity-40',
    )}>
      <div className="text-3xl">{CARD_EMOJI[card]}</div>
      <div className="font-mono font-bold text-2xl text-gold mt-1">{count}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted mt-0.5">
        {CARD_LABELS[card]}
      </div>
    </div>
  );
}

// =============================================================================
// ИГРОКИ
// =============================================================================
function PlayersPanel({
  states, gameStatus, myId, onChallenge, canChallenge, isAdmin,
}: {
  states: CardShipState[];
  gameStatus: string;
  myId: string | null;
  onChallenge: (id: string) => void;
  canChallenge: boolean;
  isAdmin: boolean;
}) {
  const { state } = useStore();

  return (
    <div className="glass p-4">
      <div className="text-[10px] font-bold uppercase tracking-widest text-gold/70 mb-3">
        👥 Игроки ({states.length})
      </div>
      <div className="space-y-2">
        {states.map(s => {
          const p = state.participants.find(x => x.id === s.player_id);
          if (!p) return null;
          const isMe = s.player_id === myId;
          const total = totalCards(s);
          const survived = isSurvived(s);
          const dead = total === 0 && s.stars < WIN_STARS_REQUIRED;
          return (
            <div key={s.id} className={cn(
              'glass p-3 flex items-center gap-3',
              isMe && 'gold-border',
              s.status === 'survived' && 'gold-border',
              s.status === 'lost' && 'opacity-60',
            )}>
              <CharacterIcon participant={p} size="sm" ringless />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm truncate">
                  {p.display_name}
                  {isMe && <span className="text-[10px] text-gold ml-1">(вы)</span>}
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-[11px]">
                  <span className="text-muted-foreground">🎴 {total}</span>
                  <span className="text-amber-300">⭐ {s.stars}</span>
                  {s.status === 'survived' && (
                    <span className="text-emerald-300 font-bold">✓ ВЫЖИЛ</span>
                  )}
                  {s.status === 'lost' && (
                    <span className="text-red-400 font-bold">✕ ПРОИГРАЛ</span>
                  )}
                  {s.status === 'out_of_cards' && (
                    <span className="text-gold">📭 без карт</span>
                  )}
                  {!survived && !dead && s.status === 'active' && total === 0 && (
                    <span className="text-muted">скоро</span>
                  )}
                </div>
                <div className="text-[10px] text-muted mt-0.5">
                  Дуэлей: {s.duels_count} · Сыграно карт: {s.cards_played}
                </div>
              </div>
              {/* Кнопка вызова */}
              {gameStatus === 'active' && !isMe && canChallenge && total > 0 && s.status === 'active' && (
                <button
                  onClick={() => onChallenge(s.player_id)}
                  className="btn-outline text-xs px-3"
                >
                  ⚔
                </button>
              )}
            </div>
          );
        })}
      </div>
      {gameStatus === 'collecting_stakes' && (
        <div className="text-[10px] text-muted text-center mt-3">
          Игра ещё не запущена. Ведущий должен нажать «Запустить игру».
        </div>
      )}
    </div>
  );
}

// =============================================================================
// ДУЭЛИ
// =============================================================================
function DuelsPanel({
  duels, myId, findPart, onAccept, onDecline, onPickCard, myState,
}: {
  duels: CardShipDuel[];
  myId: string | null;
  findPart: (id: string) => any;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
  onPickCard: (id: string, card: CardType) => void;
  myState: CardShipState | null;
}) {
  const active = duels.filter(d => d.status === 'pending' || d.status === 'accepted');
  const myActive = myId ? active.filter(d => d.challenger_id === myId || d.opponent_id === myId) : [];
  const otherActive = myId ? active.filter(d => d.challenger_id !== myId && d.opponent_id !== myId) : active;

  if (active.length === 0) {
    return (
      <div className="glass p-4">
        <div className="text-[10px] font-bold uppercase tracking-widest text-gold/70 mb-2">
          ⚔️ Активные дуэли
        </div>
        <div className="text-xs text-muted-foreground text-center py-2">Активных дуэлей нет.</div>
      </div>
    );
  }

  return (
    <div className="glass-strong p-4 space-y-3">
      <div className="text-[10px] font-bold uppercase tracking-widest text-gold/70">
        ⚔️ Активные дуэли ({active.length})
      </div>
      {myActive.map(d => (
        <DuelRow key={d.id} duel={d} myId={myId} findPart={findPart}
          onAccept={onAccept} onDecline={onDecline} onPickCard={onPickCard}
          myState={myState} />
      ))}
      {otherActive.length > 0 && (
        <>
          <div className="text-[10px] uppercase tracking-widest text-muted mt-2">Прочие</div>
          {otherActive.map(d => (
            <DuelRow key={d.id} duel={d} myId={myId} findPart={findPart}
              onAccept={onAccept} onDecline={onDecline} onPickCard={onPickCard}
              myState={null} />
          ))}
        </>
      )}
    </div>
  );
}

function DuelRow({
  duel, myId, findPart, onAccept, onDecline, onPickCard, myState,
}: {
  duel: CardShipDuel;
  myId: string | null;
  findPart: (id: string) => any;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
  onPickCard: (id: string, card: CardType) => void;
  myState: CardShipState | null;
}) {
  const ch = findPart(duel.challenger_id);
  const op = findPart(duel.opponent_id);
  const isChallenger = myId === duel.challenger_id;
  const isOpponent = myId === duel.opponent_id;
  const isMine = isChallenger || isOpponent;
  const myCard = isChallenger ? duel.challenger_card : isOpponent ? duel.opponent_card : null;
  const otherCard = isChallenger ? duel.opponent_card : isOpponent ? duel.challenger_card : null;
  const otherPicked = !!otherCard;

  return (
    <div className="glass p-3 space-y-2">
      <div className="flex items-center gap-2 text-xs flex-wrap">
        {ch && (
          <span className="flex items-center gap-1">
            <CharacterIcon participant={ch} size="xs" ringless />
            <span className="font-bold truncate max-w-[80px]">{ch.display_name}</span>
          </span>
        )}
        <span className="text-muted">⚔️</span>
        {op && (
          <span className="flex items-center gap-1">
            <CharacterIcon participant={op} size="xs" ringless />
            <span className="font-bold truncate max-w-[80px]">{op.display_name}</span>
          </span>
        )}
        <span className={cn('status-badge border ml-auto',
          duel.status === 'pending' && 'bg-amber-500/15 text-amber-300 border-amber-500/30',
          duel.status === 'accepted' && 'bg-blue-500/15 text-blue-300 border-blue-500/30',
        )}>
          {duel.status === 'pending' ? 'Ожидание' : 'Идёт'}
        </span>
      </div>

      {/* Сценарий: я — оппонент, дуэль pending */}
      {isOpponent && duel.status === 'pending' && (
        <div className="flex gap-2">
          <button onClick={() => onAccept(duel.id)} className="btn-success text-xs flex-1">
            ✓ Принять
          </button>
          <button onClick={() => onDecline(duel.id)} className="btn-danger text-xs flex-1">
            ✕ Отклонить
          </button>
        </div>
      )}

      {/* Сценарий: я — челленджер, дуэль pending */}
      {isChallenger && duel.status === 'pending' && (
        <div className="text-[11px] text-muted text-center">
          Ждём ответа... <CountdownLabel deadline={duel.accept_deadline} />
        </div>
      )}

      {/* Сценарий: дуэль accepted, я участник */}
      {isMine && duel.status === 'accepted' && (
        <div>
          {myCard ? (
            <div className="text-[11px] text-emerald-300 text-center py-1">
              ✓ Вы выбрали карту. {otherPicked ? 'Раскрытие...' : 'Ждём оппонента.'}
            </div>
          ) : (
            <>
              <div className="text-[11px] text-muted text-center mb-2">
                Выберите карту тайно. <CountdownLabel deadline={duel.pick_deadline} />
              </div>
              {myState && (
                <div className="grid grid-cols-3 gap-2">
                  {(['rock', 'scissors', 'paper'] as CardType[]).map(c => {
                    const cnt = c === 'rock' ? myState.rocks : c === 'scissors' ? myState.scissors : myState.papers;
                    return (
                      <button
                        key={c}
                        onClick={() => onPickCard(duel.id, c)}
                        disabled={cnt === 0}
                        className={cn(
                          'glass p-2 flex flex-col items-center active:scale-95',
                          cnt === 0 && 'opacity-30 pointer-events-none',
                        )}
                      >
                        <div className="text-2xl">{CARD_EMOJI[c]}</div>
                        <div className="text-[10px]">{CARD_LABELS[c]}</div>
                        <div className="text-[10px] text-muted">×{cnt}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
          {/* Челленджер может отозвать пока сам не выбрал */}
          {isChallenger && !myCard && (
            <button onClick={() => onDecline(duel.id)} className="btn-secondary text-[10px] w-full mt-2">
              Отозвать дуэль
            </button>
          )}
        </div>
      )}

      {/* Внешний наблюдатель */}
      {!isMine && duel.status === 'accepted' && (
        <div className="text-[11px] text-muted text-center">
          Игроки выбирают карты...
        </div>
      )}
    </div>
  );
}

function CountdownLabel({ deadline }: { deadline?: string | null }) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force(x => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  if (!deadline) return null;
  const left = new Date(deadline).getTime() - Date.now();
  if (left <= 0) return <span className="text-red-300">просрочено</span>;
  const sec = Math.floor(left / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return <span className="font-mono">{m}:{s.toString().padStart(2, '0')}</span>;
}

// =============================================================================
// РЫНОК
// =============================================================================
function MarketPanel({
  listings, myId, findPart, onBuy, onCancel, onCreate, myState,
}: {
  listings: CardShipListing[];
  myId: string | null;
  findPart: (id: string) => any;
  onBuy: (id: string) => void;
  onCancel: (id: string) => void;
  onCreate: (item: 'card' | 'star', cardType: CardType | null, price: number) => void;
  myState: CardShipState | null;
}) {
  const open = listings.filter(l => l.status === 'open');
  const [showCreate, setShowCreate] = useState(false);
  const [item, setItem] = useState<'card' | 'star'>('card');
  const [card, setCard] = useState<CardType>('rock');
  const [price, setPrice] = useState<number>(50_000);

  return (
    <div className="glass-strong p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-bold uppercase tracking-widest text-gold/70">
          🛒 Рынок ({open.length})
        </div>
        {myState && (
          <button onClick={() => setShowCreate(v => !v)} className="text-xs text-gold">
            {showCreate ? '✕' : '+ Лот'}
          </button>
        )}
      </div>

      {showCreate && myState && (
        <div className="glass p-3 space-y-2 animate-slide-down">
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => { setItem('card'); setPrice(50_000); }}
              className={cn('p-2 rounded-xl border text-xs font-bold',
                item === 'card' ? 'bg-gold/15 border-gold/50 text-gold' : 'bg-card/40 border-white/8')}>
              🎴 Карта
            </button>
            <button onClick={() => { setItem('star'); setPrice(150_000); }}
              className={cn('p-2 rounded-xl border text-xs font-bold',
                item === 'star' ? 'bg-gold/15 border-gold/50 text-gold' : 'bg-card/40 border-white/8')}>
              ⭐ Звезда
            </button>
          </div>
          {item === 'card' && (
            <div className="grid grid-cols-3 gap-2">
              {(['rock', 'scissors', 'paper'] as CardType[]).map(c => {
                const cnt = c === 'rock' ? myState.rocks : c === 'scissors' ? myState.scissors : myState.papers;
                return (
                  <button
                    key={c}
                    onClick={() => setCard(c)}
                    disabled={cnt === 0}
                    className={cn('p-2 rounded-xl border text-xs flex flex-col items-center',
                      card === c ? 'bg-gold/15 border-gold/50 text-gold' : 'bg-card/40 border-white/8',
                      cnt === 0 && 'opacity-30 pointer-events-none',
                    )}>
                    <span className="text-lg">{CARD_EMOJI[c]}</span>
                    <span className="text-[10px]">{CARD_LABELS[c]}</span>
                    <span className="text-[10px] text-muted">×{cnt}</span>
                  </button>
                );
              })}
            </div>
          )}
          <div>
            <label className="text-[10px] uppercase tracking-widest text-muted mb-1 block">
              Цена (ейн)
            </label>
            <div className="flex items-center gap-2">
              <YenIcon className="w-4 h-4 shrink-0" />
              <input type="number" value={price} min={1}
                onChange={e => setPrice(Math.max(0, Number(e.target.value)))}
                className="input-field font-mono" />
            </div>
            <div className="text-[10px] text-muted mt-1">
              Лимиты: {item === 'card'
                ? `¥${formatYenFull(PRICE_LIMITS.card.min)}–¥${formatYenFull(PRICE_LIMITS.card.max)}`
                : `¥${formatYenFull(PRICE_LIMITS.star.min)}–¥${formatYenFull(PRICE_LIMITS.star.max)}`}
            </div>
          </div>
          <button
            onClick={() => {
              onCreate(item, item === 'card' ? card : null, price);
              setShowCreate(false);
            }}
            className="btn-primary w-full text-xs"
          >
            Выставить
          </button>
        </div>
      )}

      {open.length === 0 ? (
        <div className="text-xs text-muted-foreground text-center py-2">Лотов нет.</div>
      ) : (
        <div className="space-y-2">
          {open.map(l => {
            const seller = findPart(l.seller_id);
            const isMine = l.seller_id === myId;
            const itemEmoji = l.item_type === 'star' ? '⭐' : CARD_EMOJI[l.card_type!];
            const itemLabel = l.item_type === 'star' ? 'Звезда' : CARD_LABELS[l.card_type!];
            return (
              <div key={l.id} className="glass p-2.5 flex items-center gap-3">
                <div className="text-2xl shrink-0">{itemEmoji}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm">{itemLabel}</div>
                  {seller && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <CharacterIcon participant={seller} size="xs" ringless />
                      <span className="text-[11px] text-muted-foreground truncate">
                        {seller.display_name}
                      </span>
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <Yen amount={l.price} className="text-sm text-gold" iconClass="w-3 h-3" />
                  {isMine ? (
                    <button onClick={() => onCancel(l.id)} className="block mt-1 text-[10px] text-red-300">
                      Отменить
                    </button>
                  ) : myState ? (
                    <button onClick={() => onBuy(l.id)} className="btn-success text-[10px] px-2 py-1 mt-1">
                      Купить
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// ИСТОРИЯ
// =============================================================================
function DuelsHistory({
  duels, findPart,
}: {
  duels: CardShipDuel[];
  findPart: (id: string) => any;
}) {
  const resolved = duels.filter(d => d.status === 'revealed');
  if (resolved.length === 0) return null;
  return (
    <div className="glass p-4">
      <div className="text-[10px] font-bold uppercase tracking-widest text-gold/70 mb-2">
        📜 Журнал дуэлей ({resolved.length})
      </div>
      <div className="space-y-1.5 max-h-72 overflow-y-auto">
        {resolved.map(d => {
          const ch = findPart(d.challenger_id);
          const op = findPart(d.opponent_id);
          const winnerName = d.winner_id ? findPart(d.winner_id)?.display_name : null;
          return (
            <div key={d.id} className="text-[11px] glass p-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-bold">{ch?.display_name}</span>
                <span>{d.challenger_card && CARD_EMOJI[d.challenger_card]}</span>
                <span className="text-muted">vs</span>
                <span>{d.opponent_card && CARD_EMOJI[d.opponent_card]}</span>
                <span className="font-bold">{op?.display_name}</span>
                <span className="ml-auto text-muted text-[10px]">{timeAgo(d.created_at)}</span>
              </div>
              <div className="mt-1 text-muted-foreground">
                {winnerName
                  ? <>🏆 <b className="text-gold">{winnerName}</b> +1 ⭐</>
                  : <span>🤝 Ничья</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// ФИНАЛ
// =============================================================================
function FinishedSummary({
  game, states, findPart,
}: {
  game: CardShipGame;
  states: CardShipState[];
  findPart: (id: string) => any;
}) {
  const survivors = states.filter(s => s.status === 'survived');
  const losers = states.filter(s => s.status === 'lost');
  const share = survivors.length > 0 ? Math.floor(game.bank / survivors.length) : 0;

  return (
    <div className="glass-strong gold-border p-4 space-y-3">
      <div className="text-[10px] uppercase tracking-widest text-gold/70">🏁 Финал</div>
      <div className="flex items-center justify-between">
        <span className="text-sm">Банк</span>
        <Yen amount={game.bank} className="text-base text-gold" iconClass="w-4 h-4" />
      </div>
      {survivors.length > 0 ? (
        <>
          <div className="text-xs">
            Выживших: <b className="text-emerald-300">{survivors.length}</b>.
            Каждый получил <Yen amount={share} className="text-gold inline" iconClass="w-3 h-3" />.
          </div>
          <div className="space-y-1">
            {survivors.map(s => {
              const p = findPart(s.player_id);
              return p && (
                <div key={s.id} className="flex items-center gap-2 text-xs">
                  <CharacterIcon participant={p} size="xs" ringless />
                  <span className="font-bold flex-1">{p.display_name}</span>
                  <span className="text-emerald-300">✓ ВЫЖИЛ</span>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="text-xs text-red-300 text-center py-2">
          Никто не выжил. Банк ушёл в Казну студсовета.
        </div>
      )}
      {losers.length > 0 && (
        <>
          <div className="text-[10px] uppercase tracking-widest text-muted mt-2">Проигравшие</div>
          <div className="space-y-1">
            {losers.map(s => {
              const p = findPart(s.player_id);
              return p && (
                <div key={s.id} className="flex items-center gap-2 text-xs opacity-60">
                  <CharacterIcon participant={p} size="xs" ringless />
                  <span className="font-bold flex-1">{p.display_name}</span>
                  <span className="text-muted">🎴 {totalCards(s)} · ⭐ {s.stars}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
