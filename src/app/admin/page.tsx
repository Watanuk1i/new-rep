'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useStore, uid } from '@/lib/store/StoreProvider';
import { CharacterIcon } from '@/components/ui/CharacterIcon';
import { Yen, YenIcon } from '@/components/ui/Yen';
import { cn, getStatusLabel, SPRITE_SHEETS } from '@/lib/utils';
import { getSupabase } from '@/lib/supabase/client';
import type { Participant, ParticipantStatus, PariMarket, Debt, Rumor, ContentBlock } from '@/lib/store/types';

export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'overview', label: 'Обзор', icon: '📊' },
  { key: 'season', label: 'Сезон/День', icon: '📅' },
  { key: 'announce', label: 'Объявления', icon: '📢' },
  { key: 'participants', label: 'Игроки', icon: '👥' },
  { key: 'accounts', label: 'Аккаунты', icon: '🔑' },
  { key: 'pari', label: 'Пари', icon: '💰' },
  { key: 'super-games', label: 'Супер игры', icon: '🏟️' },
  { key: 'debts', label: 'Долги', icon: '📜' },
  { key: 'rumors', label: 'Слухи', icon: '👁️' },
  { key: 'icons', label: 'Иконки', icon: '🎭' },
  { key: 'content', label: 'Контент', icon: '📝' },
];

export default function AdminPage() {
  return (
    <Suspense fallback={<div className="px-4 py-12 text-center text-muted-foreground">Загрузка...</div>}>
      <AdminInner />
    </Suspense>
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
        <p className="text-sm text-muted-foreground mb-4">Только Ведущий и Селестия.</p>
        <Link href="/login" className="btn-primary inline-flex">Войти</Link>
      </div>
    );
  }

  return (
    <div className="px-3 sm:px-4 py-4 max-w-2xl mx-auto space-y-4 animate-fade-in">
      <div className="glass-strong gold-border p-4 flex items-center gap-3">
        <div className="text-3xl">⚙️</div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-gold/70">Управление</div>
          <h1 className="font-heading text-xl font-bold text-gradient-gold leading-tight">Панель Ведущего</h1>
        </div>
      </div>

      <div className="scroll-x">
        {TABS.map(t => (
          <button key={t.key} onClick={() => {
            setTab(t.key);
            router.replace(`/admin?tab=${t.key}`);
            setEditingParticipant(null);
          }} className={cn('tab-pill', tab === t.key ? 'tab-pill-active' : 'tab-pill-inactive')}>
            <span>{t.icon}</span><span>{t.label}</span>
          </button>
        ))}
      </div>

      {tab === 'overview' && <Overview />}
      {tab === 'season' && <SeasonDay />}
      {tab === 'announce' && <AnnounceTab />}
      {tab === 'participants' && (editingParticipant
        ? <EditParticipant id={editingParticipant} onBack={() => setEditingParticipant(null)} />
        : <ParticipantsList onEdit={setEditingParticipant} />)}
      {tab === 'accounts' && <AccountsTab />}
      {tab === 'pari' && <PariAdmin />}
      {tab === 'super-games' && <SuperGamesAdmin />}
      {tab === 'debts' && <DebtsAdmin />}
      {tab === 'rumors' && <RumorsAdmin />}
      {tab === 'icons' && (editingParticipant
        ? <IconEditor id={editingParticipant} onBack={() => setEditingParticipant(null)} />
        : <IconsList onEdit={setEditingParticipant} />)}
      {tab === 'content' && <ContentAdmin />}
    </div>
  );
}

function Overview() {
  const { state } = useStore();
  const players = state.participants.filter(p => p.status !== 'gm');
  const totalBank = players.reduce((s, p) => s + p.balance, 0);
  const activePari = state.pari.filter(m => m.status === 'open' || m.status === 'awaiting_confirmation').length;
  const awaitingPari = state.pari.filter(m => m.status === 'awaiting_confirmation').length;
  const liveGames = state.superGames.filter(g => g.status === 'live').length;
  const requestedDebts = state.debts.filter(d => d.status === 'requested').length;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Card label="Участников" value={players.length} icon="👥" />
        <Card label="Активных пари" value={activePari} icon="💰" />
        <Card label="Ожидание пари" value={awaitingPari} icon="⏳" highlight={awaitingPari > 0} />
        <Card label="Live игр" value={liveGames} icon="🔴" highlight={liveGames > 0} />
        <Card label="Запросов долгов" value={requestedDebts} icon="📜" highlight={requestedDebts > 0} />
        <Card label="Слухов" value={state.rumors.filter(r => r.status === 'active').length} icon="👁️" />
      </div>
      <div className="glass p-4">
        <div className="text-[10px] uppercase tracking-widest text-gold/70 mb-2">Общий банк</div>
        <Yen amount={totalBank} full className="text-2xl text-gold" iconClass="w-6 h-6" />
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
  const { state, notifyAllPlayers, addEvent } = useStore();
  const sb = getSupabase();
  const [season, setSeason] = useState(state.room.season);
  const [day, setDay] = useState(state.room.day);

  useEffect(() => {
    setSeason(state.room.season);
    setDay(state.room.day);
  }, [state.room]);

  const apply = async () => {
    if (!sb) return;
    const seasonChanged = season !== state.room.season;
    const dayChanged = day !== state.room.day;
    await sb.from('room_state').update({
      season, day, updated_at: new Date().toISOString(),
    }).eq('id', 'academy');
    if (seasonChanged) {
      await addEvent({ type: 'season_change', title: `Начало сезона ${season}`, body: 'Селестия объявляет начало нового сезона академии' });
      await notifyAllPlayers({ type: 'season_change', title: `Сезон ${season}`, body: 'Начинается новый сезон академии', link_url: '/' });
    }
    if (dayChanged) {
      await addEvent({ type: 'day_change', title: `День ${day}`, body: `Академия переходит к дню ${day}` });
      await notifyAllPlayers({ type: 'day_change', title: `День ${day}`, body: 'Академия перешла к новому дню', link_url: '/' });
    }
  };

  return (
    <div className="space-y-3">
      <div className="glass p-4 space-y-3">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-gold mb-2 block">Сезон</label>
          <input type="number" min={1} max={99} value={season}
            onChange={e => setSeason(Math.max(1, Math.min(99, Number(e.target.value))))}
            className="input-field font-mono text-2xl text-center" />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-gold mb-2 block">День</label>
          <input type="number" min={1} max={99} value={day}
            onChange={e => setDay(Math.max(1, Math.min(99, Number(e.target.value))))}
            className="input-field font-mono text-2xl text-center" />
        </div>
      </div>
      <button onClick={apply} className="btn-primary w-full">💾 Применить (с уведомлением всем)</button>
    </div>
  );
}

function AnnounceTab() {
  const { notifyAllPlayers, addEvent } = useStore();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [type, setType] = useState('queen_announcement');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!title.trim()) return;
    setBusy(true);
    await addEvent({
      type, title: title.trim(),
      body: body.trim() || undefined,
      link_url: '/notifications',
    });
    await notifyAllPlayers({
      type, title: title.trim(),
      body: body.trim() || undefined,
      link_url: '/',
    });
    setTitle(''); setBody('');
    setBusy(false);
  };

  return (
    <div className="glass p-4 space-y-3">
      <div className="text-[10px] uppercase tracking-widest text-gold/70">📢 Создать объявление</div>
      <select value={type} onChange={e => setType(e.target.value)} className="input-field">
        <option value="queen_announcement">👑 Объявление Селестии</option>
        <option value="big_game_start">🏟️ Большая игра</option>
        <option value="custom">📢 Прочее</option>
      </select>
      <input value={title} onChange={e => setTitle(e.target.value)}
        placeholder="Заголовок (например: Открытие сезона)" className="input-field" />
      <textarea value={body} onChange={e => setBody(e.target.value)}
        placeholder="Текст объявления" className="input-field min-h-[80px] resize-none" />
      <button onClick={send} disabled={!title.trim() || busy} className="btn-primary w-full">
        {busy ? '...' : '📤 Опубликовать всем'}
      </button>
      <p className="text-[10px] text-muted">
        Объявление появится в «События академии» на главной + придёт уведомление каждому игроку.
      </p>
    </div>
  );
}

function ParticipantsList({ onEdit }: { onEdit: (id: string) => void }) {
  const { state } = useStore();
  const list = state.participants.filter(p => p.status !== 'gm');
  return (
    <div className="space-y-2">
      {list.map(p => (
        <button key={p.id} onClick={() => onEdit(p.id)}
          className="glass p-3 w-full flex items-center gap-3 text-left active:scale-[0.99]">
          <CharacterIcon participant={p} size="md" ringless={p.status === 'queen'} />
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
  const { state } = useStore();
  const sb = getSupabase();
  const p = state.participants.find(x => x.id === id);
  const [balance, setBalance] = useState(p?.balance || 0);
  const [status, setStatus] = useState<ParticipantStatus>(p?.status || 'player');
  const [reputation, setReputation] = useState(p?.reputation || 0);
  const [ownerId, setOwnerId] = useState(p?.pet_owner_id || '');

  if (!p) return null;
  const others = state.participants.filter(x => x.status !== 'gm' && x.id !== id);

  const save = async () => {
    if (!sb) return;
    await sb.from('participants').update({
      balance, status, reputation,
      pet_owner_id: status === 'pet' ? (ownerId || null) : null,
    }).eq('id', id);
    onBack();
  };

  const remove = async () => {
    if (!sb) return;
    if (confirm(`Точно удалить ${p.display_name} из игры?`)) {
      await sb.from('participants').delete().eq('id', id);
      onBack();
    }
  };

  return (
    <div className="space-y-3">
      <button onClick={onBack} className="text-xs text-gold flex items-center gap-1">← К списку</button>
      <div className="glass-strong p-4 flex items-center gap-3">
        <CharacterIcon participant={p} size="lg" ringless={p.status === 'queen'} />
        <div>
          <div className="font-bold text-base">{p.display_name}</div>
          <div className="text-[10px] text-muted-foreground">{p.id}</div>
        </div>
      </div>

      <div className="glass p-4">
        <label className="text-[10px] font-bold uppercase tracking-widest text-gold mb-1 block">Баланс</label>
        <div className="flex items-center gap-2">
          <YenIcon className="w-5 h-5" />
          <input type="number" value={balance} onChange={e => setBalance(Math.max(0, Number(e.target.value)))}
            className="input-field font-mono" />
        </div>
        <div className="grid grid-cols-4 gap-1.5 mt-2">
          {[100_000, 500_000, 1_000_000, 5_000_000].map(v => (
            <button key={v} onClick={() => setBalance(v)}
              className="px-2 py-2 text-[11px] rounded-lg bg-card/60 border border-white/8 active:bg-white/5 font-mono">
              {v >= 1e6 ? `${v / 1e6}M` : `${v / 1000}K`}
            </button>
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
            { v: 'collector', label: 'Коллектор' },
          ].map(s => (
            <button key={s.v} onClick={() => setStatus(s.v as ParticipantStatus)}
              className={cn('py-2.5 rounded-xl text-sm font-bold border active:scale-95',
                status === s.v ? 'bg-gold/15 border-gold/50 text-gold' : 'bg-card/40 border-white/8')}>
              {s.label}
            </button>
          ))}
        </div>
        {status === 'pet' && (
          <div className="mt-3">
            <label className="text-[10px] uppercase tracking-widest text-muted mb-1 block">Хозяин</label>
            <select value={ownerId} onChange={e => setOwnerId(e.target.value)} className="input-field">
              <option value="">— выберите —</option>
              {others.map(o => <option key={o.id} value={o.id}>{o.display_name}</option>)}
            </select>
          </div>
        )}
      </div>

      <div className="glass p-4">
        <label className="text-[10px] font-bold uppercase tracking-widest text-gold mb-1 flex items-center justify-between">
          <span>Репутация</span><span className="font-mono text-sm normal-case">{reputation}/100</span>
        </label>
        <input type="range" min={0} max={100} value={reputation}
          onChange={e => setReputation(Number(e.target.value))} className="w-full accent-gold" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button onClick={save} className="btn-primary">💾 Сохранить</button>
        <button onClick={remove} className="btn-danger">✕ Удалить</button>
      </div>
    </div>
  );
}

function PariAdmin() {
  const { state, notifyAllPlayers } = useStore();
  const sb = getSupabase();
  const awaiting = state.pari.filter(m => m.status === 'awaiting_confirmation');
  const open = state.pari.filter(m => m.status === 'open');

  const resolvePari = async (m: PariMarket, optionId: string) => {
    if (!sb) return;
    if (!confirm(`Утвердить «${m.options.find(o => o.id === optionId)?.label}» как победный вариант?`)) return;
    const totalPool = (m.bets || []).reduce((s, b) => s + b.amount, 0);
    const commission = Math.floor(totalPool * m.commission_pct / 100);
    const payoutPool = totalPool - commission;
    const winners = (m.bets || []).filter(b => b.option_id === optionId);
    const winningTotal = winners.reduce((s, b) => s + b.amount, 0);

    // Комиссия создателю
    const creator = state.participants.find(p => p.id === m.creator_id);
    if (creator && commission > 0) {
      await sb.from('participants').update({ balance: creator.balance + commission }).eq('id', creator.id);
    }
    // Победителям выплата
    if (winningTotal > 0) {
      for (const w of winners) {
        const payout = Math.floor((w.amount / winningTotal) * payoutPool);
        const part = state.participants.find(p => p.id === w.participant_id);
        if (part) {
          await sb.from('participants').update({ balance: part.balance + payout }).eq('id', part.id);
          await sb.from('notifications').insert({
            id: uid('n'), recipient_id: part.id, type: 'bet_won',
            title: 'Ваша ставка выиграла!',
            body: `+${payout.toLocaleString('ru-RU')} ейнов · ${m.title}`,
            link_url: '/pari', is_read: false,
          });
        }
      }
    }
    // Уведомления проигравшим
    const losers = (m.bets || []).filter(b => b.option_id !== optionId);
    for (const l of losers) {
      await sb.from('notifications').insert({
        id: uid('n'), recipient_id: l.participant_id, type: 'bet_lost',
        title: 'Ваша ставка проиграла',
        body: m.title, link_url: '/pari', is_read: false,
      });
    }
    await sb.from('pari').update({ status: 'resolved', resolved_option_id: optionId }).eq('id', m.id);
    await sb.from('events').insert({
      id: uid('ev'), type: 'pari_resolved',
      title: `Пари решено: ${m.title}`, link_url: '/pari', is_for_gm_only: false,
    });
  };

  const cancelPari = async (m: PariMarket) => {
    if (!sb) return;
    if (!confirm('Отменить и вернуть все ставки?')) return;
    for (const b of (m.bets || [])) {
      const part = state.participants.find(p => p.id === b.participant_id);
      if (part) await sb.from('participants').update({ balance: part.balance + b.amount }).eq('id', part.id);
    }
    await sb.from('pari').update({ status: 'cancelled' }).eq('id', m.id);
  };

  return (
    <div className="space-y-4">
      {awaiting.length > 0 && (
        <section>
          <div className="text-[10px] font-bold uppercase tracking-widest text-amber-300 mb-2">⏳ Ожидают решения</div>
          <div className="space-y-2">
            {awaiting.map(m => (
              <div key={m.id} className="glass-strong gold-border p-4">
                <div className="font-bold text-sm mb-2">{m.title}</div>
                <div className="text-[10px] text-muted mb-3">
                  Пул: {(m.bets || []).reduce((s, b) => s + b.amount, 0)} · Комиссия: {m.commission_pct}%
                </div>
                <div className="space-y-1.5">
                  {m.options.map(opt => (
                    <button key={opt.id} onClick={() => resolvePari(m, opt.id)}
                      className={cn('w-full p-2.5 rounded-xl border text-sm font-bold',
                        opt.kind === 'yes' ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300' :
                        opt.kind === 'no' ? 'bg-red-500/10 border-red-500/40 text-red-300' :
                        'bg-card/40 border-white/8')}>
                      {opt.kind === 'yes' && '✓ '}{opt.kind === 'no' && '✗ '}{opt.label}
                    </button>
                  ))}
                </div>
                <button onClick={() => cancelPari(m)} className="text-xs text-red-300 mt-3 w-full">
                  ⚠️ Отменить пари
                </button>
              </div>
            ))}
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
                  Закрытие: День {m.closes_on_day} · Пул: {(m.bets || []).reduce((s, b) => s + b.amount, 0)}
                </div>
                <div className="flex gap-2 mt-2">
                  <button onClick={() => sb && sb.from('pari').update({ status: 'awaiting_confirmation' }).eq('id', m.id)}
                    className="btn-secondary text-xs flex-1">→ Закрыть приём</button>
                  <button onClick={() => cancelPari(m)} className="btn-danger text-xs flex-1">✕ Отменить</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      {awaiting.length === 0 && open.length === 0 && (
        <div className="glass p-6 text-center text-sm text-muted-foreground">Активных пари нет.</div>
      )}
    </div>
  );
}

function SuperGamesAdmin() {
  const { state } = useStore();
  const sb = getSupabase();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState('minority_rule');
  const [description, setDescription] = useState('');
  const [rules, setRules] = useState('');
  const [stakes, setStakes] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const others = state.participants.filter(p => p.status !== 'gm');

  const create = async () => {
    if (!sb || !title.trim()) return;
    const id = uid('sg');
    const ids = Array.from(selected);
    await sb.from('super_games').insert({
      id, title: title.trim(), type,
      description: description.trim() || null,
      rules: rules.trim() || null,
      stakes: stakes.trim() || null,
      status: 'scheduled',
      participant_ids: ids,
      spectator_bets_enabled: true,
    });
    // Уведомление участникам
    if (ids.length > 0) {
      await sb.from('notifications').insert(ids.map(pid => ({
        id: uid('n'), recipient_id: pid, type: 'big_game_invite',
        title: 'Вас пригласили в Большую игру',
        body: title.trim(),
        link_url: `/super-games/${id}`,
        is_read: false,
      })));
    }
    await sb.from('events').insert({
      id: uid('ev'), type: 'big_game_start',
      title: `Запланирована: ${title.trim()}`,
      link_url: `/super-games/${id}`, is_for_gm_only: false,
    });
    setTitle(''); setDescription(''); setRules(''); setStakes(''); setSelected(new Set());
    setCreating(false);
  };

  const togglePart = (pid: string) => {
    const next = new Set(selected);
    if (next.has(pid)) next.delete(pid); else next.add(pid);
    setSelected(next);
  };

  return (
    <div className="space-y-3">
      <CardShipCreator />

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
          <input value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Описание" className="input-field" />
          <textarea value={rules} onChange={e => setRules(e.target.value)}
            placeholder="Правила" className="input-field min-h-[80px] resize-none" />
          <input value={stakes} onChange={e => setStakes(e.target.value)}
            placeholder="Ставки" className="input-field" />

          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-gold mb-1 block">
              Пригласить участников ({selected.size})
            </label>
            <div className="max-h-48 overflow-y-auto space-y-1 glass p-2">
              {others.map(p => (
                <label key={p.id} className="flex items-center gap-2 p-1.5 rounded-lg cursor-pointer active:bg-white/5">
                  <input type="checkbox" checked={selected.has(p.id)}
                    onChange={() => togglePart(p.id)} className="w-4 h-4 accent-gold" />
                  <CharacterIcon participant={p} size="xs" ringless />
                  <span className="text-sm">{p.display_name}</span>
                </label>
              ))}
            </div>
          </div>

          <button onClick={create} disabled={!title.trim()} className="btn-primary w-full">
            Создать (с уведомлением приглашённым)
          </button>
        </div>
      )}

      <div className="space-y-2">
        {state.superGames.map(g => (
          <Link key={g.id} href={`/super-games/${g.id}`} className="glass p-3 block active:scale-[0.99]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm truncate">{g.title}</div>
                <div className="text-[10px] text-muted-foreground">
                  {g.status} · {(g.participant_ids || []).length} участн.
                </div>
              </div>
              <span className="text-gold text-xs">→</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function DebtsAdmin() {
  const { state } = useStore();
  const sb = getSupabase();
  const list = state.debts;

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted">Все долги под наблюдением. Можно закрывать принудительно.</div>
      {list.length === 0 ? (
        <div className="glass p-6 text-center text-sm text-muted-foreground">Долгов нет.</div>
      ) : list.map(d => {
        const debtor = state.participants.find(p => p.id === d.debtor_id);
        const creditor = state.participants.find(p => p.id === d.creditor_id);
        return (
          <div key={d.id} className="glass p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted">{d.status}</span>
              <Yen amount={d.amount} className="text-sm text-gold" iconClass="w-3 h-3" />
            </div>
            <div className="text-xs">
              <span className="text-red-300">{debtor?.display_name}</span>
              <span className="text-muted"> → должен → </span>
              <span className="text-gold">{creditor?.display_name}</span>
            </div>
            {d.description && <div className="text-[11px] text-muted-foreground mt-1">{d.description}</div>}
            <div className="flex gap-2 mt-2">
              {d.status === 'requested' && (
                <button onClick={async () => {
                  if (!sb) return;
                  await sb.from('debts').update({ status: 'active' }).eq('id', d.id);
                  if (debtor && creditor) {
                    await sb.from('participants').update({ balance: debtor.balance + d.amount }).eq('id', debtor.id);
                    await sb.from('participants').update({ balance: Math.max(0, creditor.balance - d.amount) }).eq('id', creditor.id);
                  }
                }} className="btn-success text-xs flex-1">Подтвердить</button>
              )}
              {d.status === 'active' && (
                <button onClick={async () => {
                  if (!sb) return;
                  if (debtor && creditor) {
                    await sb.from('participants').update({ balance: Math.max(0, debtor.balance - d.amount) }).eq('id', debtor.id);
                    await sb.from('participants').update({ balance: creditor.balance + d.amount }).eq('id', creditor.id);
                  }
                  await sb.from('debts').update({ status: 'closed' }).eq('id', d.id);
                }} className="btn-success text-xs flex-1">Закрыть</button>
              )}
              <button onClick={async () => {
                if (!sb) return;
                if (confirm('Удалить долг полностью?')) {
                  await sb.from('debts').delete().eq('id', d.id);
                }
              }} className="btn-danger text-xs">✕</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RumorsAdmin() {
  const { state } = useStore();
  const sb = getSupabase();
  return (
    <div className="space-y-2">
      {state.rumors.length === 0 ? (
        <div className="glass p-6 text-center text-sm text-muted-foreground">Слухов нет.</div>
      ) : state.rumors.map(r => (
        <div key={r.id} className="glass p-3">
          <div className="flex items-center justify-between mb-1">
            <div className="font-bold text-sm">{r.title}</div>
            <span className="text-[10px] text-muted">{r.status}</span>
          </div>
          <div className="text-xs text-muted-foreground">{r.text.slice(0, 120)}...</div>
          <div className="flex gap-2 mt-2">
            {r.status === 'active' && (
              <button onClick={async () => {
                if (!sb) return;
                await sb.from('rumors').update({ status: 'closed' }).eq('id', r.id);
              }} className="btn-secondary text-xs flex-1">Закрыть</button>
            )}
            <button onClick={async () => {
              if (!sb) return;
              if (confirm('Удалить?')) await sb.from('rumors').delete().eq('id', r.id);
            }} className="btn-danger text-xs">✕</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function IconsList({ onEdit }: { onEdit: (id: string) => void }) {
  const { state } = useStore();
  return (
    <div className="space-y-2">
      <div className="glass p-3 text-xs text-muted-foreground">
        Тапните на персонажа, чтобы настроить иконку.
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {state.participants.filter(p => p.status !== 'gm').map(p => (
          <button key={p.id} onClick={() => onEdit(p.id)}
            className="glass p-2 flex flex-col items-center gap-1 text-center active:scale-95">
            <CharacterIcon participant={p} size="md" ringless={p.status === 'queen'} />
            <div className="text-[10px] truncate w-full">{p.display_name}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function IconEditor({ id, onBack }: { id: string; onBack: () => void }) {
  const { state } = useStore();
  const sb = getSupabase();
  const p = state.participants.find(x => x.id === id);
  const [sheet, setSheet] = useState<1 | 2 | 3>((p?.sprite_sheet as any) || 1);
  const [y, setY] = useState(p?.sprite_y || 0);
  const [x, setX] = useState(p?.sprite_x || 0);
  const [size, setSize] = useState(p?.sprite_size || 86);
  const [customUrl, setCustomUrl] = useState(p?.custom_icon_url || '');

  if (!p) return null;
  const sheetData = SPRITE_SHEETS[sheet];

  const apply = async () => {
    if (!sb) return;
    await sb.from('participants').update({
      sprite_sheet: sheet, sprite_y: y, sprite_x: x, sprite_size: size,
      custom_icon_url: customUrl.trim() || null,
    }).eq('id', id);
    onBack();
  };

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setCustomUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  // Клик по спрайту → выставить координаты
  const onSheetClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratioY = sheetData.height / rect.height;
    const ratioX = sheetData.width / rect.width;
    const clickY = (e.clientY - rect.top) * ratioY;
    const clickX = (e.clientX - rect.left) * ratioX;
    setY(Math.max(0, Math.round(clickY - size / 2)));
    setX(Math.max(0, Math.round(clickX - size / 2)));
  };

  // Превью «как в ринге»
  const previewParticipant = {
    ...p, sprite_sheet: sheet, sprite_y: y, sprite_x: x, sprite_size: size,
    custom_icon_url: customUrl || null,
  };

  return (
    <div className="space-y-3">
      <button onClick={onBack} className="text-xs text-gold flex items-center gap-1">← Назад</button>

      <div className="glass-strong gold-border p-4 flex flex-col items-center gap-3">
        <div className="text-[10px] uppercase tracking-widest text-gold/70">Превью</div>
        <CharacterIcon participant={previewParticipant} size="2xl" ringless />
        <div className="font-bold">{p.display_name}</div>
      </div>

      <div className="glass p-4 space-y-2">
        <div className="text-[10px] uppercase tracking-widest text-gold/70">Своё изображение</div>
        <input type="url" value={customUrl} onChange={e => setCustomUrl(e.target.value)}
          placeholder="https://... или загрузите файл" className="input-field" />
        <input type="file" accept="image/*"
          onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
          className="block w-full text-xs text-muted-foreground file:mr-2 file:py-2 file:px-3 file:rounded-xl file:border file:border-gold/30 file:bg-gold/10 file:text-gold file:font-bold" />
        {customUrl && (
          <button onClick={() => setCustomUrl('')} className="text-xs text-red-300">
            ✕ Очистить (использовать спрайт)
          </button>
        )}
      </div>

      {!customUrl && (
        <div className="glass p-4 space-y-3">
          <div className="text-[10px] uppercase tracking-widest text-gold/70">Из спрайт-листа</div>
          <div className="grid grid-cols-3 gap-1.5">
            {([1, 2, 3] as const).map(n => (
              <button key={n} onClick={() => { setSheet(n); setY(0); setX(0); }}
                className={cn('py-2 rounded-xl text-sm font-bold border',
                  sheet === n ? 'bg-gold/15 border-gold/50 text-gold' : 'bg-card/40 border-white/8')}>
                Лист {n}
              </button>
            ))}
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-widest text-muted mb-1 flex justify-between">
              <span>Y (вверх/вниз)</span>
              <span className="font-mono normal-case">{y}px</span>
            </label>
            <input type="range" min={0} max={Math.max(0, sheetData.height - size)} step={1}
              value={y} onChange={e => setY(Number(e.target.value))} className="w-full accent-gold" />
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-widest text-muted mb-1 flex justify-between">
              <span>X (влево/вправо)</span>
              <span className="font-mono normal-case">{x}px</span>
            </label>
            <input type="range" min={0} max={Math.max(0, sheetData.width - Math.min(size, sheetData.width))}
              step={1} value={x} onChange={e => setX(Number(e.target.value))} className="w-full accent-gold" />
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-widest text-muted mb-1 flex justify-between">
              <span>Размер (увелич./уменьш.)</span>
              <span className="font-mono normal-case">{size}px</span>
            </label>
            <input type="range" min={40} max={200} step={1} value={size}
              onChange={e => setSize(Number(e.target.value))} className="w-full accent-gold" />
          </div>

          <div className="text-[10px] uppercase tracking-widest text-muted">Лист {sheet} (клик — установить центр):</div>
          <div className="relative max-h-72 overflow-y-auto bg-black/40 rounded-xl border border-white/5">
            <div onClick={onSheetClick} className="relative cursor-crosshair">
              <img src={sheetData.url} alt={`Sheet ${sheet}`} className="w-full" draggable={false}
                style={{ imageRendering: 'auto' }} />
              <div className="absolute border-2 border-gold pointer-events-none rounded"
                style={{
                  top: `${(y / sheetData.height) * 100}%`,
                  left: `${(x / sheetData.width) * 100}%`,
                  width: `${(size / sheetData.width) * 100}%`,
                  height: `${(size / sheetData.height) * 100}%`,
                }} />
            </div>
          </div>
        </div>
      )}

      <button onClick={apply} className="btn-primary w-full">💾 Применить</button>
    </div>
  );
}

function ContentAdmin() {
  const { state } = useStore();
  const sb = getSupabase();
  const [page, setPage] = useState<'help' | 'rules'>('help');
  const blocks = state.content.filter(c => c.page === page).sort((a, b) => a.sort_order - b.sort_order);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const add = async () => {
    if (!sb || !title.trim() || !body.trim()) return;
    await sb.from('content_blocks').insert({
      id: uid('cb'), page, title: title.trim(), body: body.trim(),
      sort_order: blocks.length, updated_at: new Date().toISOString(),
    });
    setTitle(''); setBody('');
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setPage('help')}
          className={cn('p-3 rounded-xl border text-sm font-bold',
            page === 'help' ? 'bg-gold/15 border-gold/50 text-gold' : 'bg-card/40 border-white/8')}>❔ Помощь</button>
        <button onClick={() => setPage('rules')}
          className={cn('p-3 rounded-xl border text-sm font-bold',
            page === 'rules' ? 'bg-gold/15 border-gold/50 text-gold' : 'bg-card/40 border-white/8')}>⚖️ Правила</button>
      </div>

      <div className="glass-strong p-4 space-y-3">
        <div className="text-[10px] uppercase tracking-widest text-gold/70">Добавить блок</div>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Заголовок" className="input-field" />
        <textarea value={body} onChange={e => setBody(e.target.value)}
          placeholder="Текст" className="input-field min-h-[80px] resize-none" />
        <button onClick={add} disabled={!title.trim() || !body.trim()} className="btn-primary w-full">Добавить</button>
      </div>

      <div className="space-y-2">
        {blocks.map(b => (
          <div key={b.id} className="glass p-3">
            <div className="flex items-center justify-between mb-1">
              <div className="font-bold text-sm">{b.title}</div>
              <button onClick={async () => {
                if (!sb) return;
                if (confirm('Удалить блок?')) await sb.from('content_blocks').delete().eq('id', b.id);
              }} className="text-red-400 text-xs">✕</button>
            </div>
            <div className="text-xs text-muted-foreground whitespace-pre-line">{b.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}



function AccountsTab() {
  const { state, role } = useStore();
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // Сортировка: GM сверху, потом Селестия, потом игроки по id
  const list = [...state.participants].sort((a, b) => {
    const order = (s: string) => (s === 'gm' ? 0 : s === 'queen' ? 1 : 2);
    if (order(a.status) !== order(b.status)) return order(a.status) - order(b.status);
    return a.id.localeCompare(b.id, undefined, { numeric: true });
  });

  // Логин = что вводить в поле «Имя персонажа» на /login
  const loginFor = (p: Participant): string => {
    if (p.id === 'p-gm') return 'host';
    if (p.id === 'p-queen') return 'queen';
    return p.display_name;
  };

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1200);
    } catch {}
  };

  if (role !== 'gm') {
    return (
      <div className="glass p-6 text-center text-sm text-muted-foreground">
        🔒 Просмотр учёток доступен только Ведущему (host).
      </div>
    );
  }

  // Проверка целостности — есть ли p-gm и p-queen
  const hasGm = list.some(p => p.id === 'p-gm');
  const hasQueen = list.some(p => p.id === 'p-queen');
  const seedBroken = !hasGm || !hasQueen;

  return (
    <div className="space-y-3">
      <div className="glass-strong gold-border p-4">
        <div className="text-[10px] uppercase tracking-widest text-gold/70 mb-1">🔑 Учётные записи</div>
        <p className="text-xs text-muted-foreground">
          Логин — это то, что игрок вводит в поле «Имя персонажа» на странице входа.
          Для GM — <span className="font-mono text-gold">host</span>, для Селестии —{' '}
          <span className="font-mono text-gold">queen</span>, для остальных — имя персонажа целиком
          (например, <span className="font-mono text-gold">Макото Наэги</span>).
        </p>
        <p className="text-[11px] text-muted-foreground mt-2">
          Если у игрока пароль не задан (NULL) — войти можно с <b>любым</b> паролем (включая пустой).
        </p>
        <button
          onClick={() => setRevealed(v => !v)}
          className={cn('btn-secondary w-full mt-3 text-sm', revealed && 'bg-gold/15 border-gold/50 text-gold')}
        >
          {revealed ? '🙈 Скрыть пароли' : '👁️ Показать пароли'}
        </button>
      </div>

      {seedBroken && (
        <div className="glass-strong p-3 border border-red-500/40 bg-red-500/5 space-y-1">
          <div className="text-xs font-bold text-red-300">⚠ В БД нет p-gm или p-queen</div>
          <p className="text-[11px] text-muted-foreground">
            Логины <span className="font-mono">host</span> / <span className="font-mono">queen</span> не сработают
            пока эти id отсутствуют. Открой Supabase → SQL Editor и запусти целиком файл{' '}
            <span className="font-mono text-gold">supabase/setup.sql</span> — он пересоздаст всю БД
            с 16 участниками за один прогон.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {list.map(p => {
          const login = loginFor(p);
          const password = p.password ?? '';
          const hasPassword = !!p.password;
          return (
            <div key={p.id} className="glass p-3 space-y-2">
              <div className="flex items-center gap-2">
                <CharacterIcon participant={p} size="sm" ringless={p.status === 'queen' || p.status === 'gm'} />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate">{p.display_name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {getStatusLabel(p.status)} · {p.id}
                    {p.is_registered && <span className="ml-1 text-emerald-300">· занят</span>}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-[64px_1fr_auto] items-center gap-2 text-xs">
                <div className="text-[10px] uppercase tracking-widest text-muted">Логин</div>
                <div className="font-mono text-gold truncate">{login}</div>
                <button onClick={() => copy(login, `${p.id}-l`)}
                  className="text-[10px] px-2 py-1 rounded-md bg-card/60 border border-white/8 active:bg-white/5">
                  {copied === `${p.id}-l` ? '✓' : '⧉'}
                </button>
              </div>

              <div className="grid grid-cols-[64px_1fr_auto] items-center gap-2 text-xs">
                <div className="text-[10px] uppercase tracking-widest text-muted">Пароль</div>
                <div className="font-mono truncate">
                  {hasPassword
                    ? (revealed ? <span className="text-gold">{password}</span> : <span className="text-muted">••••••••</span>)
                    : <span className="text-muted-foreground italic">любой (NULL)</span>}
                </div>
                {hasPassword && (
                  <button onClick={() => copy(password, `${p.id}-p`)}
                    className="text-[10px] px-2 py-1 rounded-md bg-card/60 border border-white/8 active:bg-white/5">
                    {copied === `${p.id}-p` ? '✓' : '⧉'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


// =====================================================================
// КАРТОЧНЫЙ КОРАБЛЬ — создание Большой игры
// =====================================================================
// Создаёт связку: super_games (для отображения в списке) + card_ship_games
// (с собственным состоянием — карты/звёзды/банк/дуэли/рынок).
// Игроки выбираются вручную или скопом (все активные кроме Селестии).
// Для запуска (списания ¥100k и раздачи карт) используется кнопка
// «Запустить игру» уже на странице самой игры.

const DEFAULT_ENTRY_FEE = 100_000;

function CardShipCreator() {
  const { state } = useStore();
  const sb = getSupabase();
  const [open, setOpen] = useState(false);
  const [entryFee, setEntryFee] = useState(DEFAULT_ENTRY_FEE);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Селестия (queen) НЕ участвует — она ведущая/наблюдатель.
  const eligible = state.participants.filter(p =>
    p.status !== 'gm' && p.status !== 'queen' && p.is_active,
  );

  const togglePart = (pid: string) => {
    const next = new Set(selected);
    if (next.has(pid)) next.delete(pid); else next.add(pid);
    setSelected(next);
  };

  const selectAll = () => setSelected(new Set(eligible.map(p => p.id)));
  const clearAll = () => setSelected(new Set());

  const create = async () => {
    setError(null);
    const ids = Array.from(selected);
    if (ids.length < 2) {
      setError('Нужно минимум 2 игрока (рекомендуется 8–14).');
      return;
    }
    if (entryFee <= 0) {
      setError('Входная ставка должна быть больше 0.');
      return;
    }
    if (!sb) return;
    setBusy(true);

    const sgId = uid('sg');
    const csId = uid('cs');

    // 1) super_games — чтобы корабль появился в общем списке Больших игр
    await sb.from('super_games').insert({
      id: sgId,
      title: 'Карточный корабль',
      type: 'card_ship',
      description: 'Камень — Ножницы — Бумага. Сделки, дуэли и блеф.',
      rules: 'Каждый игрок начинает с 9 карт (3 Камня + 3 Ножниц + 3 Бумаги) и 3 звёзд.\n' +
        'Цель: к концу игры остаться с 0 карт и не менее 3 звёзд.\n' +
        'Дуэли: тайный выбор → раскрытие. Победителю +1 звезда от проигравшего.\n' +
        'Рынок: можно продавать и покупать карты и звёзды за ейны.\n' +
        'В конце выжившие делят банк поровну.',
      stakes: `Входная ставка: ¥${entryFee.toLocaleString('ru-RU')} с каждого игрока в банк`,
      status: 'scheduled',
      participant_ids: ids,
      spectator_bets_enabled: false,
    });

    // 2) card_ship_games — собственное состояние игры
    await sb.from('card_ship_games').insert({
      id: csId,
      super_game_id: sgId,
      status: 'collecting_stakes',
      entry_fee: entryFee,
      bank: 0,
      participant_ids: ids,
      winner_ids: [],
    });

    // 3) Уведомление приглашённым
    await sb.from('notifications').insert(ids.map(pid => ({
      id: uid('n'),
      recipient_id: pid,
      type: 'big_game_invite',
      title: 'Карточный корабль',
      body: `Вас пригласили. Входная ставка: ¥${entryFee.toLocaleString('ru-RU')}`,
      link_url: `/super-games/${sgId}`,
      is_read: false,
    })));

    await sb.from('events').insert({
      id: uid('ev'),
      type: 'big_game_start',
      title: 'Карточный корабль — собирается',
      body: `Игроков: ${ids.length}. Банк сформируется при запуске.`,
      link_url: `/super-games/${sgId}`,
      is_for_gm_only: false,
    });

    setBusy(false);
    setOpen(false);
    setSelected(new Set());
    setEntryFee(DEFAULT_ENTRY_FEE);
  };

  return (
    <div className="glass-strong gold-border p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="text-2xl">🎴</div>
        <div className="flex-1">
          <div className="text-[10px] uppercase tracking-widest text-gold/70">Большая игра</div>
          <div className="font-heading text-lg font-bold text-gradient-gold leading-tight">
            Карточный корабль
          </div>
        </div>
      </div>

      {!open ? (
        <button onClick={() => setOpen(true)} className="btn-primary w-full">
          + Создать Карточный корабль
        </button>
      ) : (
        <div className="space-y-3 animate-slide-down">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-gold mb-1 block">
              Входная ставка (ейн)
            </label>
            <input
              type="number"
              value={entryFee}
              onChange={e => setEntryFee(Math.max(0, Number(e.target.value)))}
              className="input-field font-mono"
              min={1}
            />
            <div className="grid grid-cols-4 gap-1.5 mt-2">
              {[50_000, 100_000, 200_000, 500_000].map(v => (
                <button key={v} onClick={() => setEntryFee(v)}
                  className={cn('px-2 py-2 text-[11px] rounded-lg border font-mono active:scale-95',
                    entryFee === v ? 'bg-gold/15 border-gold/50 text-gold' : 'bg-card/60 border-white/8')}>
                  {v >= 1e6 ? `${v / 1e6}M` : `${v / 1000}K`}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-bold uppercase tracking-widest text-gold">
                Игроки ({selected.size})
              </label>
              <div className="flex gap-2">
                <button onClick={selectAll} className="text-[10px] text-gold underline">все</button>
                <button onClick={clearAll} className="text-[10px] text-muted underline">сбросить</button>
              </div>
            </div>
            <div className="text-[10px] text-muted mb-2">
              Селестия не участвует — она наблюдатель.
            </div>
            <div className="max-h-56 overflow-y-auto space-y-1 glass p-2">
              {eligible.map(p => (
                <label key={p.id} className="flex items-center gap-2 p-1.5 rounded-lg cursor-pointer active:bg-white/5">
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => togglePart(p.id)}
                    className="w-4 h-4 accent-gold"
                  />
                  <CharacterIcon participant={p} size="xs" ringless />
                  <span className="text-sm flex-1">{p.display_name}</span>
                  <Yen amount={p.balance} className="text-[10px] text-muted-foreground" iconClass="w-3 h-3" />
                </label>
              ))}
            </div>
          </div>

          <div className="text-[10px] text-muted leading-relaxed bg-white/5 rounded-lg px-3 py-2 border border-white/5">
            После создания игра будет в статусе «сбор ставок». Запустить и списать
            ¥{entryFee.toLocaleString('ru-RU')} с каждого можно будет на странице игры.
          </div>

          {error && (
            <div className="glass crimson-border p-2 text-xs text-red-300 text-center">{error}</div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setOpen(false)} className="btn-secondary">Отмена</button>
            <button onClick={create} disabled={busy} className={cn('btn-primary', busy && 'opacity-50')}>
              {busy ? '...' : '🎴 Создать'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
