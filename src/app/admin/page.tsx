'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useStore } from '@/lib/store/StoreProvider';
import { CharacterIcon } from '@/components/ui/CharacterIcon';
import { Yen, YenIcon } from '@/components/ui/Yen';
import { cn, getStatusLabel, uid, SPRITE_SHEETS } from '@/lib/utils';
import type { Participant, ParticipantStatus, PariMarket } from '@/lib/store/types';

export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'overview', label: 'Обзор', icon: '📊' },
  { key: 'season', label: 'Сезон / День', icon: '📅' },
  { key: 'participants', label: 'Игроки', icon: '👥' },
  { key: 'pari', label: 'Пари', icon: '💰' },
  { key: 'super-games', label: 'Супер игры', icon: '🏟️' },
  { key: 'events', label: 'События', icon: '📡' },
  { key: 'icons', label: 'Иконки', icon: '🎭' },
];

// Обёртка, чтобы useSearchParams был внутри Suspense (требование Next.js 14)
export default function AdminPage() {
  return (
    <Suspense fallback={<AdminFallback />}>
      <AdminInner />
    </Suspense>
  );
}

function AdminFallback() {
  return (
    <div className="px-4 py-12 text-center max-w-md mx-auto">
      <div className="text-3xl mb-2 opacity-30">⚙️</div>
      <p className="text-sm text-muted-foreground">Загрузка панели...</p>
    </div>
  );
}

function AdminInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const { role } = useStore();
  const [tab, setTab] = useState(sp.get('tab') || 'overview');
  const [editingParticipant, setEditingParticipant] = useState<string | null>(null);

  useEffect(() => {
    const t = sp.get('tab');
    if (t) setTab(t);
  }, [sp]);

  if (role !== 'gm' && role !== 'queen') {
    return (
      <div className="px-4 py-12 text-center max-w-md mx-auto">
        <div className="text-5xl mb-3">🔒</div>
        <h2 className="font-heading text-xl font-bold mb-2">Доступ запрещён</h2>
        <p className="text-sm text-muted-foreground mb-4">Админка доступна только Ведущему и Селестии.</p>
        <Link href="/login" className="btn-primary inline-flex">Войти</Link>
      </div>
    );
  }

  return (
    <div className="px-3 sm:px-4 py-4 max-w-2xl lg:max-w-none mx-auto space-y-4 animate-fade-in">
      <div className="glass-strong gold-border p-4 flex items-center gap-3">
        <div className="text-3xl">⚙️</div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-gold/70">Управление</div>
          <h1 className="font-heading text-xl font-bold text-gradient-gold leading-tight">
            Панель Ведущего
          </h1>
        </div>
      </div>

      <div className="scroll-x">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => {
              setTab(t.key);
              router.replace(`/admin?tab=${t.key}`);
              setEditingParticipant(null);
            }}
            className={cn('tab-pill', tab === t.key ? 'tab-pill-active' : 'tab-pill-inactive')}
          >
            <span>{t.icon}</span><span>{t.label}</span>
          </button>
        ))}
      </div>

      {tab === 'overview' && <Overview />}
      {tab === 'season' && <SeasonDay />}
      {tab === 'participants' && (
        editingParticipant
          ? <EditParticipant id={editingParticipant} onBack={() => setEditingParticipant(null)} />
          : <ParticipantsList onEdit={setEditingParticipant} />
      )}
      {tab === 'pari' && <PariAdmin />}
      {tab === 'super-games' && <SuperGamesAdmin />}
      {tab === 'events' && <EventsAdmin />}
      {tab === 'icons' && (
        editingParticipant
          ? <IconEditor id={editingParticipant} onBack={() => setEditingParticipant(null)} />
          : <IconsList onEdit={setEditingParticipant} />
      )}
    </div>
  );
}

function Overview() {
  const { state, dispatch } = useStore();
  const players = state.participants.filter(p => p.status !== 'gm');
  const totalBank = players.reduce((s, p) => s + p.balance, 0);
  const activePari = state.pari.filter(m => m.status === 'open' || m.status === 'awaiting_confirmation').length;
  const awaitingPari = state.pari.filter(m => m.status === 'awaiting_confirmation').length;
  const liveGames = state.superGames.filter(g => g.status === 'live').length;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Card label="Участников" value={players.length} icon="👥" />
        <Card label="Активных пари" value={activePari} icon="💰" />
        <Card label="Ожидание решения" value={awaitingPari} icon="⏳" highlight={awaitingPari > 0} />
        <Card label="Live игр" value={liveGames} icon="🔴" highlight={liveGames > 0} />
      </div>

      <div className="glass p-4">
        <div className="text-[10px] uppercase tracking-widest text-gold/70 mb-2">Общий банк</div>
        <Yen amount={totalBank} full className="text-2xl text-gold" iconClass="w-6 h-6" />
      </div>

      <div className="glass p-4 space-y-2">
        <div className="text-[10px] uppercase tracking-widest text-gold/70">Быстрые действия</div>
        <button
          onClick={() => {
            if (confirm('Раздать всем игрокам случайный баланс от 100 000 до 10 000 000 ейнов?')) {
              dispatch({ type: 'randomize_balances' });
            }
          }}
          className="btn-outline w-full text-sm"
        >
          🎲 Раздать случайные балансы
        </button>
        <button
          onClick={() => {
            if (confirm('ВНИМАНИЕ! Это полностью сбросит состояние игры до начального. Продолжить?')) {
              dispatch({ type: 'reset' });
              alert('Состояние сброшено');
            }
          }}
          className="w-full text-xs text-red-300 active:bg-red-500/10 rounded-xl py-3 border border-red-500/20"
        >
          ⚠️ Сбросить всё состояние
        </button>
      </div>
    </div>
  );
}

function Card({ label, value, icon, highlight }: { label: string; value: number; icon: string; highlight?: boolean }) {
  return (
    <div className={cn('glass p-3', highlight && 'gold-border')}>
      <div className="text-base">{icon}</div>
      <div className="font-mono font-bold text-gold text-2xl leading-none mt-1">{value}</div>
      <div className="text-[10px] text-muted uppercase tracking-wider mt-1">{label}</div>
    </div>
  );
}

function SeasonDay() {
  const { state, dispatch } = useStore();
  return (
    <div className="space-y-3">
      <div className="glass p-4 space-y-3">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-gold mb-2 block">Сезон</label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => dispatch({ type: 'set_season', season: state.season - 1 })}
              className="btn-icon"
            >−</button>
            <div className="flex-1 text-center font-mono text-3xl font-bold text-gold">{state.season}</div>
            <button
              onClick={() => dispatch({ type: 'set_season', season: state.season + 1 })}
              className="btn-icon"
            >+</button>
          </div>
        </div>
      </div>

      <div className="glass p-4 space-y-3">
        <label className="text-[10px] font-bold uppercase tracking-widest text-gold mb-2 block">День (1—5)</label>
        <div className="grid grid-cols-5 gap-1.5">
          {[1, 2, 3, 4, 5].map(d => (
            <button
              key={d}
              onClick={() => dispatch({ type: 'set_day', day: d })}
              className={cn(
                'py-4 rounded-xl text-base font-bold border active:scale-95',
                state.day === d ? 'bg-gold/15 border-gold/50 text-gold' : 'bg-card/40 border-white/8'
              )}
            >
              Д{d}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-muted">
          Изменение дня автоматически закрывает пари с соответствующим сроком.
        </p>
      </div>
    </div>
  );
}

function ParticipantsList({ onEdit }: { onEdit: (id: string) => void }) {
  const { state } = useStore();
  const list = state.participants.filter(p => p.status !== 'gm');
  return (
    <div className="space-y-2">
      {list.map(p => (
        <button
          key={p.id}
          onClick={() => onEdit(p.id)}
          className="glass p-3 w-full flex items-center gap-3 text-left active:scale-[0.99]"
        >
          <CharacterIcon participant={p} size="md" />
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm truncate">{p.display_name}</div>
            <div className="text-[10px] text-muted-foreground">{getStatusLabel(p.status)}</div>
          </div>
          <Yen amount={p.balance} className="text-xs text-gold" />
        </button>
      ))}
    </div>
  );
}

function EditParticipant({ id, onBack }: { id: string; onBack: () => void }) {
  const { state, dispatch } = useStore();
  const p = state.participants.find(x => x.id === id);
  const [balance, setBalance] = useState(p?.balance || 0);
  const [status, setStatus] = useState<ParticipantStatus>(p?.status || 'player');
  const [reputation, setReputation] = useState(p?.reputation || 0);
  const [ownerId, setOwnerId] = useState(p?.pet_owner_id || '');

  if (!p) return null;
  const others = state.participants.filter(x => x.status !== 'gm' && x.id !== id);

  const save = () => {
    dispatch({
      type: 'update_participant',
      id,
      patch: {
        balance,
        status,
        reputation,
        pet_owner_id: status === 'pet' ? ownerId || null : null,
      },
    });
    onBack();
  };

  const remove = () => {
    if (confirm(`Точно удалить ${p.display_name} из игры и базы данных?`)) {
      dispatch({ type: 'remove_participant', id });
      onBack();
    }
  };

  return (
    <div className="space-y-3">
      <button onClick={onBack} className="text-xs text-gold flex items-center gap-1">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        К списку участников
      </button>

      <div className="glass-strong p-4 flex items-center gap-3">
        <CharacterIcon participant={p} size="lg" />
        <div>
          <div className="font-bold text-base">{p.display_name}</div>
          <div className="text-[10px] text-muted-foreground">{p.id}</div>
        </div>
      </div>

      <div className="glass p-4">
        <label className="text-[10px] font-bold uppercase tracking-widest text-gold mb-1 block">Баланс (ейны)</label>
        <div className="flex items-center gap-2">
          <YenIcon className="w-5 h-5" />
          <input
            type="number"
            value={balance}
            onChange={e => setBalance(Math.max(0, Number(e.target.value)))}
            className="input-field font-mono"
          />
        </div>
        <div className="grid grid-cols-4 gap-1.5 mt-2">
          {[100_000, 500_000, 1_000_000, 5_000_000].map(v => (
            <button
              key={v}
              onClick={() => setBalance(v)}
              className="px-2 py-2 text-[11px] rounded-lg bg-card/60 border border-white/8 active:bg-white/5 font-mono"
            >+{v >= 1e6 ? `${v / 1e6}M` : `${v / 1000}K`}</button>
          ))}
        </div>
      </div>

      <div className="glass p-4">
        <label className="text-[10px] font-bold uppercase tracking-widest text-gold mb-2 block">Статус</label>
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { v: 'player', label: 'Игрок' },
            { v: 'pet', label: 'Питомец' },
            { v: 'master', label: 'Хозяин' },
            { v: 'elite', label: 'Элита' },
            { v: 'queen', label: 'Королева' },
          ].map(s => (
            <button
              key={s.v}
              onClick={() => setStatus(s.v as ParticipantStatus)}
              className={cn(
                'py-2.5 rounded-xl text-sm font-bold border active:scale-95',
                status === s.v ? 'bg-gold/15 border-gold/50 text-gold' : 'bg-card/40 border-white/8'
              )}
            >{s.label}</button>
          ))}
        </div>
        {status === 'pet' && (
          <div className="mt-3">
            <label className="text-[10px] uppercase tracking-widest text-muted mb-1 block">Хозяин</label>
            <select value={ownerId} onChange={e => setOwnerId(e.target.value)} className="input-field">
              <option value="">— выберите хозяина —</option>
              {others.map(o => <option key={o.id} value={o.id}>{o.display_name}</option>)}
            </select>
          </div>
        )}
      </div>

      <div className="glass p-4">
        <label className="text-[10px] font-bold uppercase tracking-widest text-gold mb-1 flex items-center justify-between">
          <span>Репутация</span>
          <span className="font-mono text-sm normal-case">{reputation}/100</span>
        </label>
        <input
          type="range"
          min={0}
          max={100}
          value={reputation}
          onChange={e => setReputation(Number(e.target.value))}
          className="w-full accent-gold"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button onClick={save} className="btn-primary">💾 Сохранить</button>
        <button onClick={remove} className="btn-danger">✕ Удалить</button>
      </div>
    </div>
  );
}

function PariAdmin() {
  const { state, dispatch } = useStore();
  const awaiting = state.pari.filter(m => m.status === 'awaiting_confirmation');
  const open = state.pari.filter(m => m.status === 'open');

  return (
    <div className="space-y-4">
      {awaiting.length > 0 && (
        <section>
          <div className="text-[10px] font-bold uppercase tracking-widest text-amber-300 mb-2">⏳ Ожидают решения</div>
          <div className="space-y-2">
            {awaiting.map(m => <PariResolveCard key={m.id} market={m} />)}
          </div>
        </section>
      )}

      {open.length > 0 && (
        <section>
          <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-300 mb-2">🟢 Открытые</div>
          <div className="space-y-2">
            {open.map(m => (
              <div key={m.id} className="glass p-3">
                <div className="font-bold text-sm">{m.title}</div>
                <div className="text-[10px] text-muted-foreground mt-1">
                  Закрытие: День {m.closes_on_day} · Комиссия {m.commission_pct}% · Пул: {m.bets.reduce((s, b) => s + b.amount, 0)}
                </div>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => {
                      if (confirm('Перевести в «Ожидание подтверждения»?')) {
                        dispatch({ type: 'update_pari', id: m.id, patch: { status: 'awaiting_confirmation' } });
                      }
                    }}
                    className="btn-secondary text-xs flex-1"
                  >→ Закрыть приём</button>
                  <button
                    onClick={() => {
                      if (confirm('Отменить пари и вернуть все ставки?')) {
                        dispatch({ type: 'cancel_pari', market_id: m.id });
                      }
                    }}
                    className="btn-danger text-xs flex-1"
                  >✕ Отменить</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {awaiting.length === 0 && open.length === 0 && (
        <div className="glass p-6 text-center">
          <p className="text-sm text-muted-foreground">Активных пари нет.</p>
        </div>
      )}
    </div>
  );
}

function PariResolveCard({ market }: { market: PariMarket }) {
  const { dispatch } = useStore();
  return (
    <div className="glass-strong gold-border p-4">
      <div className="font-bold text-sm mb-1">{market.title}</div>
      <div className="text-[10px] text-muted-foreground mb-3">
        Пул: {market.bets.reduce((s, b) => s + b.amount, 0)} · Комиссия: {market.commission_pct}%
      </div>
      <div className="text-[10px] uppercase tracking-widest text-gold mb-2">Выберите победителя</div>
      <div className="space-y-1.5">
        {market.options.map(opt => (
          <button
            key={opt.id}
            onClick={() => {
              if (confirm(`Утвердить «${opt.label}» как победный вариант?`)) {
                dispatch({ type: 'resolve_pari', market_id: market.id, option_id: opt.id });
              }
            }}
            className={cn(
              'w-full p-2.5 rounded-xl border text-sm font-bold active:scale-95',
              opt.kind === 'yes' ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300' :
              opt.kind === 'no' ? 'bg-red-500/10 border-red-500/40 text-red-300' :
              'bg-card/40 border-white/8'
            )}
          >
            {opt.kind === 'yes' && '✓ '}{opt.kind === 'no' && '✗ '}{opt.label}
          </button>
        ))}
      </div>
      <button
        onClick={() => {
          if (confirm('Отменить пари и вернуть все ставки?')) {
            dispatch({ type: 'cancel_pari', market_id: market.id });
          }
        }}
        className="text-xs text-red-300 active:text-red-400 mt-3 w-full"
      >
        ⚠️ Отменить пари (вернуть ставки)
      </button>
    </div>
  );
}

function SuperGamesAdmin() {
  const { state, dispatch } = useStore();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState('minority_rule');
  const [description, setDescription] = useState('');
  const [rules, setRules] = useState('');
  const [stakes, setStakes] = useState('');

  const create = () => {
    if (!title.trim()) return;
    dispatch({
      type: 'add_super_game',
      game: {
        id: uid('sg'),
        title: title.trim(),
        type,
        description: description.trim() || undefined,
        rules: rules.trim() || undefined,
        stakes: stakes.trim() || undefined,
        status: 'scheduled',
        participant_ids: [],
        spectator_bets_enabled: true,
      },
    });
    setTitle(''); setDescription(''); setRules(''); setStakes('');
    setCreating(false);
  };

  return (
    <div className="space-y-3">
      <button onClick={() => setCreating(!creating)} className="btn-primary w-full">
        {creating ? '✕ Отмена' : '+ Создать Супер игру'}
      </button>

      {creating && (
        <div className="glass-strong p-4 space-y-3 animate-slide-down">
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Название" className="input-field" />
          <select value={type} onChange={e => setType(e.target.value)} className="input-field">
            <option value="minority_rule">Правило меньшинства</option>
            <option value="collar">Игра ошейника</option>
            <option value="status_tower">Башня статуса</option>
            <option value="queen_throne">Трон Селестии</option>
            <option value="emperor">Император, гражданин, раб</option>
            <option value="custom">Своя</option>
          </select>
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Описание" className="input-field" />
          <textarea value={rules} onChange={e => setRules(e.target.value)} placeholder="Правила" className="input-field min-h-[80px] resize-none" />
          <input value={stakes} onChange={e => setStakes(e.target.value)} placeholder="Ставки" className="input-field" />
          <button onClick={create} disabled={!title.trim()} className="btn-primary w-full">Создать</button>
        </div>
      )}

      <div className="space-y-2">
        {state.superGames.map(g => (
          <Link key={g.id} href={`/super-games/${g.id}`} className="glass p-3 block active:scale-[0.99]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm truncate">{g.title}</div>
                <div className="text-[10px] text-muted-foreground">{getStatusLabel(g.status)} · {g.participant_ids.length} участн.</div>
              </div>
              <span className="text-gold text-xs">→</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function EventsAdmin() {
  const { state, dispatch } = useStore();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [type, setType] = useState<string>('queen_announcement');

  const send = () => {
    if (!title.trim()) return;
    dispatch({
      type: 'add_event',
      event: {
        id: uid('ev'),
        type: type as any,
        title: title.trim(),
        body: body.trim() || undefined,
        created_at: Date.now(),
      },
    });
    setTitle(''); setBody('');
  };

  return (
    <div className="space-y-3">
      <div className="glass-strong p-4 space-y-3">
        <div className="text-[10px] uppercase tracking-widest text-gold/70">Создать событие</div>
        <select value={type} onChange={e => setType(e.target.value)} className="input-field">
          <option value="queen_announcement">👑 Объявление Королевы</option>
          <option value="big_game_start">🏟️ Началась большая игра</option>
          <option value="player_eliminated">💀 Выбыл игрок</option>
          <option value="pet_assigned">🔗 Кто-то стал Питомцем</option>
          <option value="elite_promoted">👑 Кто-то стал Элитой</option>
          <option value="custom">📢 Прочее</option>
        </select>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Заголовок" className="input-field" />
        <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Текст" className="input-field min-h-[60px] resize-none" />
        <button onClick={send} disabled={!title.trim()} className="btn-primary w-full">📤 Опубликовать</button>
      </div>

      <div className="text-[10px] uppercase tracking-widest text-muted">Лента событий</div>
      <div className="space-y-2">
        {state.events.slice(0, 30).map(e => (
          <div key={e.id} className="glass p-3 flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm">{e.title}</div>
              {e.body && <div className="text-xs text-muted-foreground">{e.body}</div>}
            </div>
            <button
              onClick={() => dispatch({ type: 'remove_event', id: e.id })}
              className="text-red-400 text-xs"
            >✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function IconsList({ onEdit }: { onEdit: (id: string) => void }) {
  const { state } = useStore();
  return (
    <div className="space-y-2">
      <div className="glass p-3 text-xs text-muted-foreground">
        Тапните на персонажа, чтобы настроить иконку: выбрать сегмент из спрайт-листа или загрузить свою.
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {state.participants.filter(p => p.status !== 'gm').map(p => (
          <button
            key={p.id}
            onClick={() => onEdit(p.id)}
            className="glass p-2 flex flex-col items-center gap-1 text-center active:scale-95"
          >
            <CharacterIcon participant={p} size="md" />
            <div className="text-[10px] truncate w-full">{p.display_name}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function IconEditor({ id, onBack }: { id: string; onBack: () => void }) {
  const { state, dispatch } = useStore();
  const p = state.participants.find(x => x.id === id);
  const [sheet, setSheet] = useState<1 | 2 | 3>(p?.sprite_sheet || 1);
  const [y, setY] = useState(p?.sprite_y || 0);
  const [size, setSize] = useState(p?.sprite_size || 86);
  const [customUrl, setCustomUrl] = useState(p?.custom_icon_url || '');

  if (!p) return null;

  const sheetData = SPRITE_SHEETS[sheet];

  const apply = () => {
    dispatch({
      type: 'update_participant',
      id,
      patch: {
        sprite_sheet: sheet,
        sprite_y: y,
        sprite_size: size,
        custom_icon_url: customUrl.trim() || null,
      },
    });
    onBack();
  };

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setCustomUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-3">
      <button onClick={onBack} className="text-xs text-gold flex items-center gap-1">
        ← Назад к списку иконок
      </button>

      <div className="glass-strong gold-border p-4 flex flex-col items-center gap-3">
        <div className="text-[10px] uppercase tracking-widest text-gold/70">Превью</div>
        <CharacterIcon
          participant={{
            ...p,
            sprite_sheet: sheet,
            sprite_y: y,
            sprite_size: size,
            custom_icon_url: customUrl || null,
          }}
          size="2xl"
        />
        <div className="font-bold">{p.display_name}</div>
      </div>

      {/* Кастомное изображение */}
      <div className="glass p-4 space-y-2">
        <div className="text-[10px] uppercase tracking-widest text-gold/70">Своё изображение</div>
        <input
          type="url"
          value={customUrl}
          onChange={e => setCustomUrl(e.target.value)}
          placeholder="https://... или загрузите файл"
          className="input-field"
        />
        <input
          type="file"
          accept="image/*"
          onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
          className="block w-full text-xs text-muted-foreground file:mr-2 file:py-2 file:px-3 file:rounded-xl file:border file:border-gold/30 file:bg-gold/10 file:text-gold file:font-bold"
        />
        {customUrl && (
          <button onClick={() => setCustomUrl('')} className="text-xs text-red-300 active:text-red-400">
            ✕ Очистить (использовать спрайт)
          </button>
        )}
      </div>

      {/* Спрайт-выбор */}
      {!customUrl && (
        <div className="glass p-4 space-y-3">
          <div className="text-[10px] uppercase tracking-widest text-gold/70">Из спрайт-листа</div>
          <div className="grid grid-cols-3 gap-1.5">
            {([1, 2, 3] as const).map(n => (
              <button
                key={n}
                onClick={() => { setSheet(n); setY(0); }}
                className={cn(
                  'py-2 rounded-xl text-sm font-bold border',
                  sheet === n ? 'bg-gold/15 border-gold/50 text-gold' : 'bg-card/40 border-white/8'
                )}
              >Лист {n}</button>
            ))}
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-widest text-muted mb-1 flex justify-between">
              <span>Y-позиция</span>
              <span className="font-mono normal-case">{y}px</span>
            </label>
            <input
              type="range"
              min={0}
              max={Math.max(0, sheetData.height - size)}
              step={2}
              value={y}
              onChange={e => setY(Number(e.target.value))}
              className="w-full accent-gold"
            />
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-widest text-muted mb-1 flex justify-between">
              <span>Размер квадрата</span>
              <span className="font-mono normal-case">{size}px</span>
            </label>
            <input
              type="range"
              min={60}
              max={120}
              step={1}
              value={size}
              onChange={e => setSize(Number(e.target.value))}
              className="w-full accent-gold"
            />
          </div>

          {/* Визуализация на исходном листе */}
          <div className="text-[10px] uppercase tracking-widest text-muted">Лист {sheet} (полный):</div>
          <div className="relative max-h-60 overflow-y-auto bg-black/40 rounded-xl border border-white/5">
            <img
              src={sheetData.url}
              alt={`Sheet ${sheet}`}
              className="w-full"
              style={{ imageRendering: 'pixelated' }}
            />
            <div
              className="absolute left-0 right-0 border-2 border-gold pointer-events-none"
              style={{
                top: `${(y / sheetData.height) * 100}%`,
                height: `${(size / sheetData.height) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      <button onClick={apply} className="btn-primary w-full">💾 Применить</button>
    </div>
  );
}
