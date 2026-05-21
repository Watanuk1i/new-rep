'use client';

// Supabase-based глобальный стор + Realtime подписки.
// Данные общие для всех пользователей (мультиплеер).

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getSupabase } from '@/lib/supabase/client';
import type {
  Participant, GameChallenge, PariMarket, Debt, SuperGame,
  AcademyEvent, Notification, Rumor, ContentBlock, HistoryEntry, RoomState, Role,
} from './types';

const AUTH_KEY = 'academy-auth-v4';
const CACHE_KEY = 'academy-cache-v1';
// Если меняешь форму State — меняй и CACHE_VERSION, иначе старый кэш сломает рендер.
const CACHE_VERSION = 1;
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 1 сутки — потом всё равно обновится из БД

interface State {
  participants: Participant[];
  challenges: GameChallenge[];
  pari: PariMarket[];
  debts: Debt[];
  superGames: SuperGame[];
  events: AcademyEvent[];
  notifications: Notification[];
  rumors: Rumor[];
  content: ContentBlock[];
  history: HistoryEntry[];
  room: RoomState;
}

const initialState: State = {
  participants: [],
  challenges: [],
  pari: [],
  debts: [],
  superGames: [],
  events: [],
  notifications: [],
  rumors: [],
  content: [],
  history: [],
  room: { id: 'academy', season: 1, day: 1, updated_at: '' },
};

interface StoreCtx {
  state: State;
  ready: boolean;
  online: boolean;
  currentUser: Participant | null;
  role: Role;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  refresh: () => Promise<void>;
  // helpers
  notify: (recipientId: string, n: { type: string; title: string; body?: string; link_url?: string }) => Promise<void>;
  notifyAllPlayers: (n: { type: string; title: string; body?: string; link_url?: string }, exceptId?: string) => Promise<void>;
  addEvent: (e: { type: string; title: string; body?: string; link_url?: string; related_participant_id?: string; is_for_gm_only?: boolean }) => Promise<void>;
  addHistory: (participantId: string, action: string, description: string, amount?: number, link_url?: string) => Promise<void>;
  markNotificationsRead: (ids: string[]) => Promise<void>;
}

const Ctx = createContext<StoreCtx | null>(null);

function uid(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>(initialState);
  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const sb = useMemo(() => getSupabase(), []);
  const channelsRef = useRef<any[]>([]);

  // Загрузка авторизации + восстановление кэша состояния (для мгновенного первого рендера).
  // После этого UI уже можно рендерить — параллельно начинается свежая загрузка из БД.
  useEffect(() => {
    try {
      const id = localStorage.getItem(AUTH_KEY);
      if (id) setCurrentUserId(id);
    } catch {}
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw);
        if (cached?.v === CACHE_VERSION && cached?.t && (Date.now() - cached.t) < CACHE_TTL_MS && cached.state) {
          setState(prev => ({ ...prev, ...cached.state }));
          // Готовы рендерить — данные есть из кэша. Свежие подтянутся из БД параллельно.
          setReady(true);
        }
      }
    } catch {}
  }, []);

  // Сохранить state в кэш (debounced через requestIdleCallback / setTimeout).
  const saveCacheRef = useRef<any>(null);
  const saveCache = useCallback((s: State) => {
    if (saveCacheRef.current) clearTimeout(saveCacheRef.current);
    saveCacheRef.current = setTimeout(() => {
      try {
        // Сохраняем только публичные коллекции — notifications/history привязаны к юзеру и легче подгружаются отдельно.
        const toCache = {
          participants: s.participants,
          challenges: s.challenges,
          pari: s.pari,
          debts: s.debts,
          superGames: s.superGames,
          events: s.events,
          rumors: s.rumors,
          content: s.content,
          room: s.room,
        };
        localStorage.setItem(CACHE_KEY, JSON.stringify({ v: CACHE_VERSION, t: Date.now(), state: toCache }));
      } catch {}
    }, 500);
  }, []);

  // Загрузка данных + realtime подписки
  const loadAll = useCallback(async () => {
    if (!sb) {
      setReady(true);
      setOnline(false);
      return;
    }
    // Promise.allSettled — один медленный/упавший запрос не блокирует остальные
    const results = await Promise.allSettled([
      sb.from('participants').select('*').order('created_at', { ascending: true }),
      sb.from('challenges').select('*').order('created_at', { ascending: false }),
      sb.from('pari').select('*').order('created_at', { ascending: false }),
      sb.from('debts').select('*').order('created_at', { ascending: false }),
      sb.from('super_games').select('*').order('created_at', { ascending: false }),
      sb.from('events').select('*').order('created_at', { ascending: false }).limit(100),
      sb.from('rumors').select('*').order('created_at', { ascending: false }),
      sb.from('content_blocks').select('*').order('sort_order', { ascending: true }),
      sb.from('room_state').select('*').eq('id', 'academy').maybeSingle(),
    ]);
    const pick = (i: number, fallback: any = []) => {
      const r = results[i];
      if (r.status !== 'fulfilled') return fallback;
      return (r.value as any).data ?? fallback;
    };
    let anyOk = results.some(r => r.status === 'fulfilled');

    setState(prev => {
      const next: State = {
        ...prev,
        participants: pick(0) || prev.participants,
        challenges: pick(1) || prev.challenges,
        pari: pick(2) || prev.pari,
        debts: pick(3) || prev.debts,
        superGames: pick(4) || prev.superGames,
        events: pick(5) || prev.events,
        rumors: pick(6) || prev.rumors,
        content: pick(7) || prev.content,
        room: pick(8, null) || prev.room,
      };
      // Сохраняем в localStorage для следующего захода
      saveCache(next);
      return next;
    });
    setOnline(anyOk);
    setReady(true);
  }, [sb, saveCache]);

  // Загрузка нотификаций для текущего пользователя
  const loadNotifications = useCallback(async () => {
    if (!sb || !currentUserId) {
      setState(prev => ({ ...prev, notifications: [] }));
      return;
    }
    const { data } = await sb.from('notifications')
      .select('*').eq('recipient_id', currentUserId)
      .order('created_at', { ascending: false }).limit(50);
    setState(prev => ({ ...prev, notifications: (data || []) as any }));
  }, [sb, currentUserId]);

  const loadHistory = useCallback(async () => {
    if (!sb || !currentUserId) return;
    const { data } = await sb.from('history')
      .select('*').eq('participant_id', currentUserId)
      .order('created_at', { ascending: false }).limit(100);
    setState(prev => ({ ...prev, history: (data || []) as any }));
  }, [sb, currentUserId]);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => { loadNotifications(); loadHistory(); }, [loadNotifications, loadHistory]);

  // Realtime: подписки на все таблицы
  useEffect(() => {
    if (!sb) return;
    // Очищаем старые каналы
    channelsRef.current.forEach(c => sb.removeChannel(c));
    channelsRef.current = [];

    const tables: { name: string; key: keyof State }[] = [
      { name: 'participants', key: 'participants' },
      { name: 'challenges', key: 'challenges' },
      { name: 'pari', key: 'pari' },
      { name: 'debts', key: 'debts' },
      { name: 'super_games', key: 'superGames' },
      { name: 'events', key: 'events' },
      { name: 'rumors', key: 'rumors' },
      { name: 'content_blocks', key: 'content' },
    ];

    for (const t of tables) {
      const ch = sb.channel(`rt-${t.name}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: t.name }, (payload: any) => {
          setState(prev => {
            const list = prev[t.key] as any[];
            if (payload.eventType === 'INSERT') {
              if (list.find(x => x.id === payload.new.id)) return prev;
              return { ...prev, [t.key]: [payload.new, ...list] };
            }
            if (payload.eventType === 'UPDATE') {
              return { ...prev, [t.key]: list.map(x => x.id === payload.new.id ? payload.new : x) };
            }
            if (payload.eventType === 'DELETE') {
              return { ...prev, [t.key]: list.filter(x => x.id !== payload.old.id) };
            }
            return prev;
          });
        })
        .subscribe();
      channelsRef.current.push(ch);
    }

    // room_state — отдельный канал
    const roomCh = sb.channel('rt-room')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_state' }, (payload: any) => {
        if (payload.new) setState(prev => ({ ...prev, room: payload.new }));
      })
      .subscribe();
    channelsRef.current.push(roomCh);

    // notifications — фильтр по recipient
    if (currentUserId) {
      const notifCh = sb.channel(`rt-notif-${currentUserId}`)
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${currentUserId}` },
          (payload: any) => {
            setState(prev => ({ ...prev, notifications: [payload.new, ...prev.notifications] }));
          })
        .on('postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${currentUserId}` },
          (payload: any) => {
            setState(prev => ({
              ...prev,
              notifications: prev.notifications.map(n => n.id === payload.new.id ? payload.new : n),
            }));
          })
        .subscribe();
      channelsRef.current.push(notifCh);

      // history — фильтр
      const histCh = sb.channel(`rt-hist-${currentUserId}`)
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'history', filter: `participant_id=eq.${currentUserId}` },
          (payload: any) => {
            setState(prev => ({ ...prev, history: [payload.new, ...prev.history] }));
          })
        .subscribe();
      channelsRef.current.push(histCh);
    }

    return () => {
      channelsRef.current.forEach(c => sb.removeChannel(c));
      channelsRef.current = [];
    };
  }, [sb, currentUserId]);

  const currentUser = useMemo(
    () => state.participants.find(p => p.id === currentUserId) || null,
    [state.participants, currentUserId]
  );

  const role: Role = useMemo(() => {
    if (!currentUser) return 'guest';
    if (currentUser.status === 'gm') return 'gm';
    if (currentUser.status === 'queen') return 'queen';
    if (currentUser.status === 'collector') return 'collector';
    return 'player';
  }, [currentUser]);

  const login = useCallback(async (username: string, password: string): Promise<boolean> => {
    const u = username.trim().toLowerCase();
    // Сначала пробуем найти в уже загруженном state — это мгновенно (из localStorage-кэша или
    // первой загрузки). Сетевой fetch делаем только если ничего не нашли — например, юзер
    // вошёл первым на этой машине, кэша ещё нет.
    let candidate = state.participants.find(x =>
      x.display_name.toLowerCase() === u ||
      (x.id === 'p-gm' && u === 'host') ||
      (x.id === 'p-queen' && u === 'queen')
    );
    if (!candidate && sb) {
      const { data } = await sb.from('participants').select('*');
      candidate = (data || []).find((x: any) =>
        x.display_name.toLowerCase() === u ||
        (x.id === 'p-gm' && u === 'host') ||
        (x.id === 'p-queen' && u === 'queen')
      ) as any;
    }
    if (!candidate) return false;
    if (candidate.password) {
      if (candidate.password !== password) return false;
    }
    setCurrentUserId(candidate.id);
    try { localStorage.setItem(AUTH_KEY, candidate.id); } catch {}
    return true;
  }, [sb, state.participants]);

  const logout = useCallback(() => {
    setCurrentUserId(null);
    try {
      localStorage.removeItem(AUTH_KEY);
      // Кэш state не чистим — он публичный, пригодится при следующем входе
    } catch {}
    setState(prev => ({ ...prev, notifications: [], history: [] }));
  }, []);

  const notify: StoreCtx['notify'] = useCallback(async (recipientId, n) => {
    if (!sb) return;
    await sb.from('notifications').insert({
      id: uid('n'),
      recipient_id: recipientId,
      type: n.type,
      title: n.title,
      body: n.body || null,
      link_url: n.link_url || null,
      is_read: false,
    });
  }, [sb]);

  const notifyAllPlayers: StoreCtx['notifyAllPlayers'] = useCallback(async (n, exceptId) => {
    if (!sb) return;
    const targets = state.participants.filter(p => p.status !== 'gm' && p.id !== exceptId);
    if (targets.length === 0) return;
    const rows = targets.map(p => ({
      id: uid('n'),
      recipient_id: p.id,
      type: n.type,
      title: n.title,
      body: n.body || null,
      link_url: n.link_url || null,
      is_read: false,
    }));
    await sb.from('notifications').insert(rows);
  }, [sb, state.participants]);

  const addEvent: StoreCtx['addEvent'] = useCallback(async (e) => {
    if (!sb) return;
    await sb.from('events').insert({
      id: uid('ev'),
      type: e.type,
      title: e.title,
      body: e.body || null,
      link_url: e.link_url || null,
      related_participant_id: e.related_participant_id || null,
      is_for_gm_only: e.is_for_gm_only || false,
    });
  }, [sb]);

  const addHistory: StoreCtx['addHistory'] = useCallback(async (pid, action, desc, amount, link) => {
    if (!sb) return;
    await sb.from('history').insert({
      id: uid('h'),
      participant_id: pid,
      action,
      description: desc,
      amount: amount ?? null,
      link_url: link || null,
    });
  }, [sb]);

  const markNotificationsRead: StoreCtx['markNotificationsRead'] = useCallback(async (ids) => {
    if (!sb || ids.length === 0) return;
    await sb.from('notifications').update({ is_read: true }).in('id', ids);
  }, [sb]);

  const refresh = loadAll;

  const value: StoreCtx = {
    state, ready, online, currentUser, role,
    login, logout, refresh,
    notify, notifyAllPlayers, addEvent, addHistory, markNotificationsRead,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}

// Утилита для генерации id
export { uid };
