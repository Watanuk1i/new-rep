'use client';

// Глобальный стор: React Context + localStorage. Архитектура готова для замены mock на Supabase/Firebase.
// === Места интеграции БД === ищите комментарии "DB:" внутри проекта.

import React, { createContext, useContext, useEffect, useMemo, useReducer, useState } from 'react';
import {
  AppState, Participant, PariMarket, PariBet, PariComment,
  Debt, SuperGame, AcademyEvent, Rumor, Role, GameChallenge,
} from './types';
import { buildInitialState, SPECIAL_ACCOUNTS } from './seed';

const STORAGE_KEY = 'academy-app-state-v3';

type Action =
  | { type: 'hydrate'; state: AppState }
  | { type: 'reset' }
  | { type: 'set_day'; day: number }
  | { type: 'set_season'; season: number }
  | { type: 'login'; userId: string }
  | { type: 'logout' }
  | { type: 'update_participant'; id: string; patch: Partial<Participant> }
  | { type: 'add_participant'; participant: Participant }
  | { type: 'remove_participant'; id: string }
  | { type: 'randomize_balances' }
  | { type: 'add_pari'; pari: PariMarket }
  | { type: 'place_bet'; bet: PariBet }
  | { type: 'add_pari_comment'; comment: PariComment }
  | { type: 'resolve_pari'; market_id: string; option_id: string }
  | { type: 'cancel_pari'; market_id: string }
  | { type: 'update_pari'; id: string; patch: Partial<PariMarket> }
  | { type: 'add_debt'; debt: Debt }
  | { type: 'close_debt'; id: string }
  | { type: 'add_super_game'; game: SuperGame }
  | { type: 'update_super_game'; id: string; patch: Partial<SuperGame> }
  | { type: 'remove_super_game'; id: string }
  | { type: 'add_event'; event: AcademyEvent }
  | { type: 'remove_event'; id: string }
  | { type: 'add_rumor'; rumor: Rumor }
  | { type: 'add_challenge'; challenge: GameChallenge }
  | { type: 'accept_challenge'; id: string; acceptor_id: string }
  | { type: 'finish_challenge'; id: string; winner_id: string | null; result_data?: any }
  | { type: 'cancel_challenge'; id: string };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'hydrate':
      return action.state;
    case 'reset':
      return buildInitialState();
    case 'set_day':
      return { ...state, day: Math.max(1, Math.min(5, action.day)) };
    case 'set_season':
      return { ...state, season: Math.max(1, action.season) };
    case 'login':
      return { ...state, currentUserId: action.userId };
    case 'logout':
      return { ...state, currentUserId: null };
    case 'update_participant':
      return {
        ...state,
        participants: state.participants.map(p => p.id === action.id ? { ...p, ...action.patch } : p),
      };
    case 'add_participant':
      return { ...state, participants: [...state.participants, action.participant] };
    case 'remove_participant':
      return { ...state, participants: state.participants.filter(p => p.id !== action.id) };
    case 'randomize_balances': {
      const min = 100_000, max = 10_000_000;
      const rand = () => {
        const v = Math.exp(Math.random() * (Math.log(max) - Math.log(min)) + Math.log(min));
        return Math.round(v / 100) * 100;
      };
      return {
        ...state,
        participants: state.participants.map(p => p.status === 'gm' ? p : { ...p, balance: rand() }),
      };
    }
    case 'add_pari':
      return { ...state, pari: [action.pari, ...state.pari] };
    case 'place_bet':
      return {
        ...state,
        pari: state.pari.map(m =>
          m.id === action.bet.market_id ? { ...m, bets: [...m.bets, action.bet] } : m
        ),
        participants: state.participants.map(p =>
          p.id === action.bet.participant_id ? { ...p, balance: p.balance - action.bet.amount } : p
        ),
      };
    case 'add_pari_comment':
      return {
        ...state,
        pari: state.pari.map(m =>
          m.id === action.comment.market_id ? { ...m, comments: [...m.comments, action.comment] } : m
        ),
      };
    case 'resolve_pari': {
      const market = state.pari.find(m => m.id === action.market_id);
      if (!market) return state;
      const totalPool = market.bets.reduce((s, b) => s + b.amount, 0);
      const commission = Math.floor(totalPool * market.commission_pct / 100);
      const payoutPool = totalPool - commission;
      const winners = market.bets.filter(b => b.option_id === action.option_id);
      const winningTotal = winners.reduce((s, b) => s + b.amount, 0);

      const balanceUpdates = new Map<string, number>();
      balanceUpdates.set(market.creator_id, (balanceUpdates.get(market.creator_id) || 0) + commission);
      if (winningTotal > 0) {
        for (const w of winners) {
          const payout = Math.floor((w.amount / winningTotal) * payoutPool);
          balanceUpdates.set(w.participant_id, (balanceUpdates.get(w.participant_id) || 0) + payout);
        }
      }

      const resolvedEvent: AcademyEvent = {
        id: `ev-${Date.now()}`,
        type: 'pari_resolved',
        title: `Пари решено: ${market.title}`,
        body: `Победителей: ${winners.length}`,
        created_at: Date.now(),
        link_url: '/pari',
      };

      return {
        ...state,
        pari: state.pari.map(m =>
          m.id === action.market_id ? { ...m, status: 'resolved', resolved_option_id: action.option_id } : m
        ),
        participants: state.participants.map(p => {
          const delta = balanceUpdates.get(p.id);
          return delta ? { ...p, balance: p.balance + delta } : p;
        }),
        events: [resolvedEvent, ...state.events].slice(0, 100),
      };
    }
    case 'cancel_pari': {
      const market = state.pari.find(m => m.id === action.market_id);
      if (!market) return state;
      const refunds = new Map<string, number>();
      market.bets.forEach(b => refunds.set(b.participant_id, (refunds.get(b.participant_id) || 0) + b.amount));
      return {
        ...state,
        pari: state.pari.map(m => m.id === action.market_id ? { ...m, status: 'cancelled' } : m),
        participants: state.participants.map(p =>
          refunds.has(p.id) ? { ...p, balance: p.balance + refunds.get(p.id)! } : p
        ),
      };
    }
    case 'update_pari':
      return { ...state, pari: state.pari.map(m => m.id === action.id ? { ...m, ...action.patch } : m) };
    case 'add_debt':
      return { ...state, debts: [action.debt, ...state.debts] };
    case 'close_debt': {
      const debt = state.debts.find(d => d.id === action.id);
      if (!debt) return state;
      return {
        ...state,
        debts: state.debts.map(d => d.id === action.id ? { ...d, status: 'closed' } : d),
        participants: state.participants.map(p => {
          if (p.id === debt.debtor_id) return { ...p, balance: p.balance - debt.amount };
          if (p.id === debt.creditor_id) return { ...p, balance: p.balance + debt.amount };
          return p;
        }),
      };
    }
    case 'add_super_game':
      return { ...state, superGames: [action.game, ...state.superGames] };
    case 'update_super_game':
      return {
        ...state,
        superGames: state.superGames.map(g => g.id === action.id ? { ...g, ...action.patch } : g),
      };
    case 'remove_super_game':
      return { ...state, superGames: state.superGames.filter(g => g.id !== action.id) };
    case 'add_event':
      return { ...state, events: [action.event, ...state.events].slice(0, 100) };
    case 'remove_event':
      return { ...state, events: state.events.filter(e => e.id !== action.id) };
    case 'add_rumor':
      return { ...state, rumors: [action.rumor, ...state.rumors] };
    case 'add_challenge':
      return { ...state, challenges: [action.challenge, ...state.challenges] };
    case 'accept_challenge': {
      return {
        ...state,
        challenges: state.challenges.map(c =>
          c.id === action.id ? { ...c, status: 'accepted' as const, opponent_id: action.acceptor_id } : c
        ),
      };
    }
    case 'finish_challenge': {
      const ch = state.challenges.find(c => c.id === action.id);
      if (!ch) return state;
      const stake = ch.stake_amount;
      const winnerId = action.winner_id;
      const loserId = winnerId === ch.creator_id ? ch.opponent_id : ch.creator_id;
      return {
        ...state,
        challenges: state.challenges.map(c =>
          c.id === action.id ? { ...c, status: 'finished' as const, winner_id: winnerId, result_data: action.result_data } : c
        ),
        participants: state.participants.map(p => {
          if (winnerId && p.id === winnerId) return { ...p, balance: p.balance + stake, wins: p.wins + 1 };
          if (loserId && p.id === loserId) return { ...p, balance: p.balance - stake, losses: p.losses + 1 };
          return p;
        }),
      };
    }
    case 'cancel_challenge':
      return {
        ...state,
        challenges: state.challenges.map(c =>
          c.id === action.id ? { ...c, status: 'cancelled' as const } : c
        ),
      };
    default:
      return state;
  }
}

interface StoreContextValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  currentUser: Participant | null;
  role: Role;
  hydrated: boolean;
  login: (username: string, password: string) => boolean;
  loginAsParticipant: (id: string) => void;
  logout: () => void;
  notifyGM: (reason: string, fromParticipantId: string) => void;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined as any, buildInitialState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.participants) && parsed.participants.length > 0) {
          dispatch({ type: 'hydrate', state: parsed });
        }
      }
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }, [state, hydrated]);

  const currentUser = useMemo(
    () => state.participants.find(p => p.id === state.currentUserId) || null,
    [state.currentUserId, state.participants]
  );

  const role: Role = useMemo(() => {
    if (!currentUser) return 'guest';
    if (currentUser.status === 'gm') return 'gm';
    if (currentUser.status === 'queen') return 'queen';
    return 'player';
  }, [currentUser]);

  const value: StoreContextValue = {
    state,
    dispatch,
    currentUser,
    role,
    hydrated,
    login(username, password) {
      const u = username.trim().toLowerCase();
      if (u === SPECIAL_ACCOUNTS.gm.username && password === SPECIAL_ACCOUNTS.gm.password) {
        dispatch({ type: 'login', userId: SPECIAL_ACCOUNTS.gm.participant_id });
        return true;
      }
      if (u === SPECIAL_ACCOUNTS.queen.username && password === SPECIAL_ACCOUNTS.queen.password) {
        dispatch({ type: 'login', userId: SPECIAL_ACCOUNTS.queen.participant_id });
        return true;
      }
      const p = state.participants.find(
        x => x.display_name.toLowerCase() === u && x.status === 'player'
      );
      if (p) {
        dispatch({ type: 'login', userId: p.id });
        return true;
      }
      return false;
    },
    loginAsParticipant(id) {
      dispatch({ type: 'login', userId: id });
    },
    logout() {
      dispatch({ type: 'logout' });
    },
    notifyGM(reason, fromParticipantId) {
      const from = state.participants.find(p => p.id === fromParticipantId);
      dispatch({
        type: 'add_event',
        event: {
          id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: 'gm_alert',
          title: 'Запрос Ведущему',
          body: `${from?.display_name || 'Игрок'}: ${reason}`,
          related_participant_id: fromParticipantId,
          is_for_gm_only: true,
          created_at: Date.now(),
        },
      });
    },
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}
