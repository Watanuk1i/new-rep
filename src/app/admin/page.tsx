'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useStore, uid } from '@/lib/store/StoreProvider';
import { CharacterIcon } from '@/components/ui/CharacterIcon';
import { Yen, YenIcon } from '@/components/ui/Yen';
import { cn, getStatusLabel, SPRITE_SHEETS, isPlayer } from '@/lib/utils';
import { getSupabase } from '@/lib/supabase/client';
import { payoutFromTreasury } from '@/lib/store/tx';
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
  { key: 'treasury', label: 'Казна', icon: '🏛️' },
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
      {tab === 'treasury' && <TreasuryTab />}
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
  const players = state.participants.filter(p => isPlayer(p));
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
  const list = state.participants.filter(p => isPlayer(p));
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
  const others = state.participants.filter(x => isPlayer(x) && x.id !== id);

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

      <div className="glass p-4 space-y-2">
        <div className="text-[10px] uppercase tracking-widest text-gold/70">Видимость</div>
        <div className="text-[11px] text-muted-foreground">
          {p.is_active
            ? 'Игрок виден в активном составе и может участвовать в играх.'
            : 'Игрок скрыт — не появляется в списках выбора участников.'}
        </div>
        <button
          onClick={async () => {
            if (!sb) return;
            await sb.from('participants').update({ is_active: !p.is_active }).eq('id', id);
            onBack();
          }}
          className={cn('w-full text-xs',
            p.is_active ? 'btn-secondary' : 'btn-success')}
        >
          {p.is_active ? '🙈 Деактивировать (скрыть)' : '👁 Активировать (показать)'}
        </button>
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

    // Комиссия создателю — Казна студсовета удерживает её и выплачивает.
    if (commission > 0) {
      await payoutFromTreasury(m.creator_id, commission, `Комиссия пари: ${m.title}`, '/pari');
    }
    // Победителям выплата из Казны (где лежал пул).
    if (winningTotal > 0) {
      for (const w of winners) {
        const payout = Math.floor((w.amount / winningTotal) * payoutPool);
        if (payout <= 0) continue;
        await payoutFromTreasury(w.participant_id, payout, `Выигрыш пари: ${m.title}`, '/pari');
        await sb.from('notifications').insert({
          id: uid('n'), recipient_id: w.participant_id, type: 'bet_won',
          title: 'Ваша ставка выиграла!',
          body: `+${payout.toLocaleString('ru-RU')} ейнов · ${m.title}`,
          link_url: '/pari', is_read: false,
        });
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
      await payoutFromTreasury(b.participant_id, b.amount, `Возврат ставки: ${m.title}`, '/pari');
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
  const [entryFee, setEntryFee] = useState(100000);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const others = state.participants.filter(p => isPlayer(p));

  const minPlayers = type === 'nine_bullets' ? 7 : type === 'minority_rule' ? 2 : 1;
  const isLiveType = type === 'minority_rule' || type === 'nine_bullets';

  const create = async () => {
    if (!sb || !title.trim()) return;
    if (selected.size < minPlayers) {
      alert(`Для типа «${type}» нужно минимум ${minPlayers} участников.`);
      return;
    }
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
      entry_fee: type === 'minority_rule' ? entryFee : 0,
      bank: 0,
      state: {},
    });
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
      <RoyalRouletteCreator />
      <ContrabandCreator />
      <DebtTowerCreator />
      <DebtAuctionCreator />
      <EliteTrialCreator />
      <RebellionCreator />
      <ThroneCreator />
      <MiniGamesCreator />

      <button onClick={() => setCreating(!creating)} className="btn-primary w-full">
        {creating ? '✕ Отмена' : '+ Создать Супер игру'}
      </button>

      {creating && (
        <div className="glass-strong p-4 space-y-3 animate-slide-down">
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Название" className="input-field" />
          <select value={type} onChange={e => setType(e.target.value)} className="input-field">
            <option value="minority_rule">Правило меньшинства (live · от 2 чел.)</option>
            <option value="nine_bullets">Комната девяти патронов (live · от 7 чел.)</option>
            <option value="collar">Игра ошейника</option>
            <option value="status_tower">Башня статуса</option>
            <option value="queen_throne">Трон Селестии</option>
            <option value="emperor">Император, гражданин, раб</option>
            <option value="custom">Своя</option>
          </select>
          {isLiveType && (
            <div className="text-[11px] text-amber-300/90 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2 py-1.5">
              ⚡ Интерактивная игра — управление пройдёт через комнату /super-games/[id].
              {type === 'nine_bullets' && ' Деньги ходят через Казну студсовета и напрямую между игроками.'}
            </div>
          )}
          <input value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Описание" className="input-field" />
          <textarea value={rules} onChange={e => setRules(e.target.value)}
            placeholder="Правила" className="input-field min-h-[80px] resize-none" />
          <input value={stakes} onChange={e => setStakes(e.target.value)}
            placeholder="Ставки (для информации игрокам)" className="input-field" />

          {type === 'minority_rule' && (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-gold mb-1 block">
                Взнос с каждого участника (ейн)
              </label>
              <input type="number" value={entryFee} min={0} step={10000}
                onChange={e => setEntryFee(Math.max(0, Number(e.target.value)))}
                className="input-field font-mono" />
              <p className="text-[10px] text-muted mt-1">
                Списывается при старте игры в банк. У кого нет — ведущий получит алерт.
              </p>
            </div>
          )}

          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-gold mb-1 block">
              Пригласить участников ({selected.size}{minPlayers > 1 && ` / мин ${minPlayers}`})
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

function TreasuryTab() {
  const { state } = useStore();
  const sb = getSupabase();
  const treasury = state.participants.find(p => p.id === 'p-treasury');
  const [log, setLog] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (!sb) return;
      setLoading(true);
      const { data } = await sb.from('history')
        .select('*').eq('participant_id', 'p-treasury')
        .order('created_at', { ascending: false }).limit(100);
      if (alive) { setLog(data || []); setLoading(false); }
    };
    load();
    const id = setInterval(load, 7000);
    return () => { alive = false; clearInterval(id); };
  }, [sb]);

  // Долги к Казне (entire system)
  const treasuryCredits = state.debts.filter(d => d.creditor_id === 'p-treasury' && d.status === 'active');
  const totalOwedToTreasury = treasuryCredits.reduce((s, d) => s + d.amount, 0);

  // Income/outcome за период
  const totalIncome  = log.filter(h => h.action === 'tx_in').reduce((s, h) => s + (h.amount || 0), 0);
  const totalOutcome = log.filter(h => h.action === 'tx_out').reduce((s, h) => s - (h.amount || 0), 0);

  return (
    <div className="space-y-3">
      <div className="glass-strong gold-border p-4">
        <div className="text-[10px] uppercase tracking-widest text-amber-300/80 mb-1">🏛️ Фонд Тогами · Казна академии</div>
        <Yen amount={treasury?.balance || 0} full className="text-3xl text-amber-200" iconClass="w-7 h-7" />
        <p className="text-[10px] text-muted mt-2">
          Системный кошелёк: взносы, штрафы, комиссии, выплаты против манекенов.
          Не участвует в прямом обмене между игроками.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Card label="Доход (последние)" value={totalIncome} icon="↘️" />
        <Card label="Расход (последние)" value={totalOutcome} icon="↗️" />
      </div>

      {treasuryCredits.length > 0 && (
        <div className="glass p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] uppercase tracking-widest text-gold/70">📜 Должники Казны</div>
            <Yen amount={totalOwedToTreasury} className="text-base text-red-300" iconClass="w-3 h-3" />
          </div>
          <div className="space-y-1">
            {treasuryCredits.map(d => {
              const debtor = state.participants.find(p => p.id === d.debtor_id);
              return (
                <div key={d.id} className="flex items-center justify-between text-xs py-1">
                  <span className="truncate">{debtor?.display_name || d.debtor_id}</span>
                  <span className="text-red-300 font-mono">−{d.amount.toLocaleString('ru-RU')}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="glass p-3">
        <div className="text-[10px] uppercase tracking-widest text-gold/70 mb-2">
          📒 Журнал операций {loading && '(обновление...)'}
        </div>
        {log.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-3">Операций пока нет.</p>
        ) : (
          <div className="space-y-1 max-h-[60vh] overflow-y-auto">
            {log.map(h => (
              <div key={h.id} className="flex items-center gap-2 text-xs py-1.5 border-b border-white/5 last:border-0">
                <span className={cn('w-12 font-mono text-[10px] uppercase',
                  h.action === 'tx_in' ? 'text-emerald-300' : 'text-red-300')}>
                  {h.action === 'tx_in' ? 'INC' : 'OUT'}
                </span>
                <span className="flex-1 truncate text-muted-foreground">
                  {h.description || '—'}
                </span>
                <span className={cn('font-mono shrink-0',
                  (h.amount || 0) > 0 ? 'text-emerald-300' : 'text-red-300')}>
                  {(h.amount || 0) > 0 ? '+' : ''}{(h.amount || 0).toLocaleString('ru-RU')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <ResetEconomySection />

      <FullResetSection />
    </div>
  );
}

function ResetEconomySection() {
  const sb = getSupabase();
  const [busy, setBusy] = useState(false);
  const [opts, setOpts] = useState({
    balances: true,
    debts: true,
    games: true,
    history: false,
    events: false,
  });

  const run = async () => {
    if (!sb) return;
    if (!confirm('СБРОС ЭКОНОМИКИ — это необратимо. Продолжить?')) return;
    if (!confirm('Точно? После сброса вы НЕ восстановите долги/банки/балансы.')) return;
    setBusy(true);
    try {
      if (opts.balances) {
        // Возвращаем стартовые балансы по статусам
        const map: Record<string, number> = {
          gm: 999_999_999,
          treasury: 15_000_000, // под 11 игроков
          queen: 5_000_000,
          elite: 3_000_000,
          collector: 3_000_000,
          master: 2_000_000,
          player: 1_000_000,
          pet: 100_000,
        };
        const { data: parts } = await sb.from('participants').select('id, status');
        for (const p of parts ?? []) {
          const target = map[p.status] ?? 1_000_000;
          await sb.from('participants').update({ balance: target }).eq('id', p.id);
        }
        // Особые системные аккаунты
        // p-togami-fund устарел — фонд = p-treasury. Оставлен ради старых данных, баланс не сбрасываем.
      }
      if (opts.debts) {
        await sb.from('debts').delete().neq('id', '');
      }
      if (opts.games) {
        await sb.from('super_games').delete().neq('id', '');
        await sb.from('challenges').delete().neq('id', '');
        await sb.from('pari').delete().neq('id', '');
        // Card Ship V2
        await sb.from('card_ship_listings').delete().neq('id', '');
        await sb.from('card_ship_duels').delete().neq('id', '');
        await sb.from('card_ship_states').delete().neq('id', '');
        await sb.from('card_ship_games').delete().neq('id', '');
        // Сброс счёта побед/поражений
        await sb.from('participants').update({ wins: 0, losses: 0 }).neq('id', '');
      }
      if (opts.history) {
        await sb.from('history').delete().neq('id', '');
      }
      if (opts.events) {
        await sb.from('events').delete().neq('id', '');
      }
      // Запись о сбросе
      await sb.from('events').insert({
        id: 'ev-reset-' + Date.now(),
        type: 'gm_alert',
        title: 'Ведущий выполнил сброс экономики',
        body: `Сброшено: ${[
          opts.balances && 'балансы',
          opts.debts && 'долги',
          opts.games && 'игры/пари/вызовы',
          opts.history && 'история',
          opts.events && 'события',
        ].filter(Boolean).join(', ')}.`,
        is_for_gm_only: false,
      });
      alert('Сброс выполнен.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass-strong p-4 border border-red-500/40 bg-red-500/5 space-y-2">
      <div className="text-[10px] uppercase tracking-widest text-red-300/80">⚠ Опасная зона</div>
      <div className="text-sm font-bold">Сброс экономики</div>
      <p className="text-[11px] text-muted-foreground">
        Возвращает балансы к стартовым (по статусу), удаляет активные игры/долги/пари. Сама БД и
        учётки игроков не сбрасываются — для этого есть отдельный SQL-файл setup.sql.
      </p>

      <div className="space-y-1">
        {([
          ['balances', 'Балансы (вернуть стартовые)'],
          ['debts',    'Долги (удалить все)'],
          ['games',    'Активные игры, пари, вызовы (удалить)'],
          ['history',  'История операций (удалить — необратимо)'],
          ['events',   'Лента событий (удалить)'],
        ] as const).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-xs cursor-pointer p-1.5 rounded-lg active:bg-white/5">
            <input
              type="checkbox"
              checked={opts[key]}
              onChange={e => setOpts(s => ({ ...s, [key]: e.target.checked }))}
              className="w-4 h-4 accent-red-400"
            />
            {label}
          </label>
        ))}
      </div>

      <button
        onClick={run}
        disabled={busy}
        className="btn-danger w-full text-xs"
      >
        {busy ? 'Сброс...' : '🛑 Сбросить выбранное'}
      </button>
    </div>
  );
}

function FullResetSection() {
  const sb = getSupabase();
  const [busy, setBusy] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const run = async () => {
    if (!sb) return;
    if (confirmText !== 'СБРОС') {
      alert('Чтобы подтвердить полный сброс, введите слово СБРОС в поле выше.');
      return;
    }
    if (!confirm('ПОЛНЫЙ сброс БД до дефолтных значений: учётки разблокируются, имена персонажей вернутся к каноничным, балансы — стартовые, ВСЕ игры/долги/пари/история будут удалены. Это нельзя отменить. Продолжить?')) return;
    setBusy(true);
    try {
      // 1) Удаляем все динамические данные.
      await sb.from('card_ship_listings').delete().neq('id', '');
      await sb.from('card_ship_duels').delete().neq('id', '');
      await sb.from('card_ship_states').delete().neq('id', '');
      await sb.from('card_ship_games').delete().neq('id', '');
      await sb.from('transfers').delete().neq('id', '');
      await sb.from('history').delete().neq('id', '');
      await sb.from('events').delete().neq('id', '');
      await sb.from('notifications').delete().neq('id', '');
      await sb.from('rumors').delete().neq('id', '');
      await sb.from('super_games').delete().neq('id', '');
      await sb.from('pari').delete().neq('id', '');
      await sb.from('debts').delete().neq('id', '');
      await sb.from('challenges').delete().neq('id', '');

      // 2) Возвращаем участников к каноничным дефолтам.
      const seed: Array<[string, string, string, number, number, boolean]> = [
        // id, display_name, status, balance, reputation, is_active
        ['p-gm',         'Монокума',           'gm',       999_999_999, 100, true],
        ['p-treasury',   'Фонд Тогами',        'treasury', 15_000_000,  0,   true],
        ['p-queen',      'Селестия Люденберг', 'queen',    5_000_000,   50,  true],
        ['p-1',          'Макото Наэги',       'player',   1_000_000,   60,  false],
        ['p-2',          'Кёко Киригири',      'player',   1_500_000,   70,  false],
        ['p-3',          'Бьякуя Тогами',      'player',   2_000_000,   80,  false],
        ['p-4',          'Токо Фукава',        'player',   800_000,     40,  false],
        ['p-5',          'Аой Асахина',        'player',   900_000,     65,  false],
        ['p-6',          'Ясухиро Хагакуре',   'player',   600_000,     35,  false],
        ['p-7',          'Сакура Огами',       'player',   1_200_000,   75,  false],
        ['p-8',          'Леон Кувата',        'player',   1_000_000,   45,  true],
        ['p-9',          'Саяка Майзоно',      'player',   1_100_000,   70,  false],
        ['p-10',         'Чихиро Фуджисаки',   'player',   850_000,     60,  false],
        ['p-11',         'Мондо Овада',        'elite',    3_000_000,   30,  true],
        ['p-12',         'Киётака Ишимару',    'player',   1_050_000,   65,  false],
        ['p-13',         'Хифуми Ямада',       'player',   500_000,     30,  false],
        ['p-14',         'Джунко Эношима',     'elite',    3_000_000,   30,  true],
        ['p-15',         'Кируми Тоджо',       'elite',    3_000_000,   30,  true],
        ['p-kokichi',    'Кокичи Ома',         'player',   1_200_000,   0,   true],
        ['p-nagito',     'Нагито Комаэда',     'player',   1_000_000,   0,   true],
        ['p-mikan',      'Микан Цумики',       'player',   800_000,     0,   true],
        ['p-peko',       'Пеко Пекояма',       'player',   1_000_000,   0,   true],
        ['p-komaru',     'Комару Наэги',       'player',   1_000_000,   0,   true],
        ['p-shuichi',    'Шуичи Сайхара',      'player',   1_000_000,   0,   true],
        ['p-incog-1',    'Инкогнито',          'player',   1_000_000,   0,   true],
        ['p-incog-2',    'Инкогнито',          'player',   1_000_000,   0,   true],
        ['p-incog-3',    'Инкогнито',          'player',   1_000_000,   0,   true],
        // Старые фонды как отдельные аккаунты больше не нужны:
        // Фонд Тогами объединён с p-treasury, Кируми работает напрямую.
      ];

      for (const [id, name, status, balance, reputation, is_active] of seed) {
        // Если такого id нет — создаём; есть — обновляем.
        const { data: exists } = await sb.from('participants').select('id').eq('id', id).maybeSingle();
        if (exists) {
          // Спецлогины p-gm / p-queen имеют системные пароли — их нужно сохранить.
          const updatePayload: any = {
            display_name: name,
            status,
            balance,
            reputation,
            wins: 0,
            losses: 0,
            pet_owner_id: null,
            is_active,
          };
          if (id === 'p-gm') updatePayload.password = 'host_academy_2026';
          else if (id === 'p-queen') updatePayload.password = 'queen_celestia_2026';
          else {
            // Все остальные → пароль null, регистрация снимается, чтобы можно было
            // зарегистрироваться заново с новым логином.
            updatePayload.password = null;
            updatePayload.is_registered = false;
          }
          await sb.from('participants').update(updatePayload).eq('id', id);
        } else {
          await sb.from('participants').insert({
            id, display_name: name, status, balance, reputation,
            wins: 0, losses: 0, is_active,
            is_registered: id === 'p-gm' || id === 'p-queen',
            password: id === 'p-gm' ? 'host_academy_2026' : id === 'p-queen' ? 'queen_celestia_2026' : null,
          });
        }
      }

      // Записываем большое событие
      await sb.from('events').insert({
        id: 'ev-fullreset-' + Date.now(),
        type: 'gm_alert',
        title: 'Ведущий выполнил полный сброс БД до дефолта',
        body: 'Балансы, имена и регистрации возвращены к стартовым. История очищена.',
        is_for_gm_only: false,
      });

      alert('Полный сброс выполнен. Все игроки могут регистрироваться заново.');
      setConfirmText('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass-strong p-4 border border-red-500/60 bg-red-500/10 space-y-2">
      <div className="text-[10px] uppercase tracking-widest text-red-300">☠ Полный сброс БД</div>
      <p className="text-[11px] text-muted-foreground">
        Сбрасывает БД до состояния как после первой установки:
        — имена персонажей возвращаются к каноничным (Макото, Кёко, Бьякуя…);
        — все логины/пароли игроков обнуляются (можно регистрироваться заново);
        — балансы и репутация → стартовые;
        — все игры, долги, пари, переводы, история, события — удалены;
        — учётки <b>host</b> / <b>queen</b> сохраняются с системными паролями.
      </p>
      <p className="text-[11px] text-red-300">
        Введите слово <b>СБРОС</b> заглавными буквами, чтобы подтвердить:
      </p>
      <input
        type="text"
        value={confirmText}
        onChange={e => setConfirmText(e.target.value)}
        placeholder="СБРОС"
        className="input-field font-mono text-sm"
      />
      <button
        onClick={run}
        disabled={busy || confirmText !== 'СБРОС'}
        className="btn-danger w-full text-xs"
      >
        {busy ? 'Полный сброс...' : '☠ Полный сброс БД до дефолта'}
      </button>
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
        {state.participants.filter(p => isPlayer(p)).map(p => (
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
        {list.map(p => (
          <AccountRow key={p.id} participant={p} loginFor={loginFor}
            revealed={revealed} copy={copy} copied={copied} />
        ))}
      </div>
    </div>
  );
}

function AccountRow({
  participant: p, loginFor, revealed, copy, copied,
}: {
  participant: Participant;
  loginFor: (p: Participant) => string;
  revealed: boolean;
  copy: (text: string, key: string) => void;
  copied: string | null;
}) {
  const sb = getSupabase();
  const [editing, setEditing] = useState(false);
  const [newName, setNewName] = useState(p.display_name);
  const [newPassword, setNewPassword] = useState(p.password ?? '');

  const login = loginFor(p);
  const password = p.password ?? '';
  const hasPassword = !!p.password;

  const save = async () => {
    if (!sb) return;
    const update: any = {};
    if (newName !== p.display_name) update.display_name = newName.trim();
    if (newPassword !== (p.password ?? '')) update.password = newPassword === '' ? null : newPassword;
    if (Object.keys(update).length === 0) {
      setEditing(false);
      return;
    }
    const { error } = await sb.from('participants').update(update).eq('id', p.id);
    if (error) {
      alert('Ошибка: ' + error.message);
      return;
    }
    setEditing(false);
  };

  const reset = async () => {
    if (!sb) return;
    if (!confirm(`Освободить персонажа ${p.display_name}? Это сбросит логин/пароль и пометит как незанятого. Игрок сможет заново зарегистрироваться.`)) return;
    // Возвращаем оригинальное имя если оно было перезаписано? Нельзя узнать оригинал.
    // Просто чистим password и is_registered.
    await sb.from('participants').update({
      password: null,
      is_registered: false,
    }).eq('id', p.id);
  };

  return (
    <div className="glass p-3 space-y-2">
      <div className="flex items-center gap-2">
        <CharacterIcon participant={p} size="sm" ringless={p.status === 'queen' || p.status === 'gm'} />
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm truncate">{p.display_name}</div>
          <div className="text-[10px] text-muted-foreground">
            {getStatusLabel(p.status)} · {p.id}
            {p.is_registered && <span className="ml-1 text-emerald-300">· занят</span>}
          </div>
        </div>
        <button
          onClick={() => setEditing(v => !v)}
          className="text-[10px] px-2 py-1 rounded-md bg-card/60 border border-white/8 active:bg-white/5"
        >{editing ? '✕ Отмена' : '✎ Изменить'}</button>
      </div>

      {!editing ? (
        <>
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
          {p.is_registered && p.id !== 'p-gm' && p.id !== 'p-queen' && (
            <button onClick={reset}
              className="text-[10px] w-full text-amber-300/80 px-2 py-1.5 rounded-md bg-amber-500/10 border border-amber-500/30 active:bg-amber-500/20">
              ↻ Освободить персонажа (сбросить логин/пароль)
            </button>
          )}
        </>
      ) : (
        <div className="space-y-2">
          <label className="block text-[10px] text-muted">
            Логин (имя персонажа)
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              className="input-field text-sm font-mono mt-0.5"
              disabled={p.id === 'p-gm' || p.id === 'p-queen'}
            />
            {(p.id === 'p-gm' || p.id === 'p-queen') && (
              <span className="block text-[10px] text-muted-foreground mt-0.5">
                Имя GM/Селестии менять нельзя — это специальный логин (host/queen).
              </span>
            )}
          </label>
          <label className="block text-[10px] text-muted">
            Пароль (пусто = любой)
            <input
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              className="input-field text-sm font-mono mt-0.5"
              type="text"
            />
          </label>
          <button onClick={save} className="btn-primary w-full text-xs">💾 Сохранить</button>
        </div>
      )}
    </div>
  );
}



// =====================================================================
// КАРТОЧНЫЙ КОРАБЛЬ — создание Большой игры
// =====================================================================
// Создаёт связку: super_games (для отображения в списке) + card_ship_games
// (с собственным состоянием — карты/звёзды/банк/дуэли/рынок).
// Игроки выбираются вручную или скопом (все активные кроме Селестии и Казны).
// Для запуска (списания ¥100k и раздачи карт) используется кнопка
// «Запустить игру» уже на странице самой игры.

const CARDSHIP_DEFAULT_ENTRY_FEE = 100_000;

function CardShipCreator() {
  const { state } = useStore();
  const sb = getSupabase();
  const [open, setOpen] = useState(false);
  const [entryFee, setEntryFee] = useState(CARDSHIP_DEFAULT_ENTRY_FEE);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Селестия (queen) НЕ участвует — она наблюдатель. Казна — системный аккаунт.
  const eligible = state.participants.filter(p => isPlayer(p) && p.is_active);

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
      rules:
        'Каждый игрок начинает с 9 карт (3 Камня + 3 Ножниц + 3 Бумаги) и 3 звёзд.\n' +
        'Цель: к концу игры остаться с 0 карт и не менее 3 звёзд.\n' +
        'Дуэли: тайный выбор → раскрытие. Победителю +1 звезда от проигравшего.\n' +
        'Рынок: можно продавать и покупать карты и звёзды за ейны.\n' +
        'В конце выжившие делят банк поровну.',
      stakes: `Входная ставка: ¥${entryFee.toLocaleString('ru-RU')} с каждого игрока в банк`,
      status: 'scheduled',
      participant_ids: ids,
      spectator_bets_enabled: false,
      entry_fee: entryFee,
      bank: 0,
      state: {},
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
    setEntryFee(CARDSHIP_DEFAULT_ENTRY_FEE);
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
              Селестия и Казна не участвуют — они наблюдатели.
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


// =====================================================================
// КОРОЛЕВСКАЯ РУЛЕТКА — создание Большой игры
// =====================================================================
// Селестия (queen) добавляется автоматически. Ведущий выбирает ровно 4
// обычных игроков. Состояние полностью хранится в super_games.state.
// Взносы списываются позже на странице игры (блок «Входные ставки»).

const RR_PLAYERS_COUNT = 4;

function RoyalRouletteCreator() {
  const { state } = useStore();
  const sb = getSupabase();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const celestia = state.participants.find(p => p.id === 'p-queen');
  // Селестию из выбора исключаем — она всегда сама.
  const eligible = state.participants.filter(p =>
    isPlayer(p) && p.is_active && p.id !== 'p-queen'
  );

  const togglePart = (pid: string) => {
    const next = new Set(selected);
    if (next.has(pid)) {
      next.delete(pid);
    } else {
      if (next.size >= RR_PLAYERS_COUNT) return; // лимит ровно 4
      next.add(pid);
    }
    setSelected(next);
  };

  const create = async () => {
    setError(null);
    if (!celestia) {
      setError('Не найден аккаунт Селестии (p-queen).');
      return;
    }
    if (selected.size !== RR_PLAYERS_COUNT) {
      setError(`Нужно ровно ${RR_PLAYERS_COUNT} игрока. Сейчас выбрано: ${selected.size}.`);
      return;
    }
    if (!sb) return;
    setBusy(true);

    const sgId = uid('sg');
    const ids = ['p-queen', ...Array.from(selected)];

    const initialState = {
      current_round: 0,
      rounds: [],
      celestia_id: 'p-queen',
      celestia_privilege_used: false,
      fee_paid: {},
      net_profit: {},
      status: 'scheduled',
      winner_id: null,
    };

    await sb.from('super_games').insert({
      id: sgId,
      title: 'Королевская рулетка',
      type: 'royal_roulette',
      description: 'Личная игра Селестии. 5 раундов рулетки, тайные ставки.',
      rules:
        'Селестия + 4 игрока. 5 раундов.\n' +
        'Каждый раунд: тайный выбор ставки (Безопасная / Рискованная / Королевская) → рулетка.\n' +
        'Селестия не может выбрать Безопасную и один раз за игру может посмотреть выбор одного игрока («Королевский взгляд»).\n' +
        'Победитель — у кого наибольшая чистая прибыль за 5 раундов. Забирает банк.',
      stakes: 'Взнос: 250k от игрока, 1M от Селестии · банк 2 000 000',
      status: 'scheduled',
      participant_ids: ids,
      spectator_bets_enabled: false,
      entry_fee: 250_000,
      bank: 0,
      state: initialState,
    });

    await sb.from('notifications').insert(
      Array.from(selected).map(pid => ({
        id: uid('n'),
        recipient_id: pid,
        type: 'big_game_invite',
        title: 'Королевская рулетка',
        body: 'Селестия лично пригласила вас. Взнос 250 000.',
        link_url: `/super-games/${sgId}`,
        is_read: false,
      })),
    );

    await sb.from('events').insert({
      id: uid('ev'),
      type: 'big_game_start',
      title: 'Селестия открывает «Королевскую рулетку»',
      body: 'Приглашены 4 игрока. Банк сформируется после сбора взносов.',
      link_url: `/super-games/${sgId}`,
      is_for_gm_only: false,
    });

    setBusy(false);
    setOpen(false);
    setSelected(new Set());
  };

  return (
    <div className="glass-strong gold-border p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="text-2xl">♛</div>
        <div className="flex-1">
          <div className="text-[10px] uppercase tracking-widest text-gold/70">Большая игра</div>
          <div className="font-heading text-lg font-bold text-gradient-gold leading-tight">
            Королевская рулетка
          </div>
          <div className="text-[10px] text-muted-foreground">
            Селестия + 4 игрока · 5 раундов · банк 2 000 000
          </div>
        </div>
      </div>

      {!open ? (
        <button onClick={() => setOpen(true)} className="btn-primary w-full">
          + Создать Королевскую рулетку
        </button>
      ) : (
        <div className="space-y-3 animate-slide-down">
          {celestia && (
            <div className="flex items-center gap-2 p-2 rounded-xl bg-gold/5 border border-gold/30">
              <CharacterIcon participant={celestia} size="xs" ringless />
              <div className="flex-1 text-sm">
                <div className="font-bold">{celestia.display_name}</div>
                <div className="text-[10px] text-gold/80">Куратор + игрок · взнос 1 000 000</div>
              </div>
              <span className="text-[10px] text-gold/80">авто</span>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-bold uppercase tracking-widest text-gold">
                Выберите 4 игрока ({selected.size}/{RR_PLAYERS_COUNT})
              </label>
            </div>
            <div className="text-[10px] text-muted mb-2">
              Можно выбрать кого угодно: победителей прошлых игр, самого богатого, должника или того, кто заинтересовал Селестию.
            </div>
            <div className="max-h-56 overflow-y-auto space-y-1 glass p-2">
              {eligible.map(p => {
                const isSelected = selected.has(p.id);
                const limitReached = !isSelected && selected.size >= RR_PLAYERS_COUNT;
                return (
                  <label
                    key={p.id}
                    className={cn(
                      'flex items-center gap-2 p-1.5 rounded-lg cursor-pointer active:bg-white/5',
                      limitReached && 'opacity-40 cursor-not-allowed',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={limitReached}
                      onChange={() => togglePart(p.id)}
                      className="w-4 h-4 accent-gold"
                    />
                    <CharacterIcon participant={p} size="xs" ringless />
                    <span className="text-sm flex-1">{p.display_name}</span>
                    <Yen amount={p.balance} className="text-[10px] text-muted-foreground" iconClass="w-3 h-3" />
                  </label>
                );
              })}
            </div>
          </div>

          <div className="text-[10px] text-muted leading-relaxed bg-white/5 rounded-lg px-3 py-2 border border-white/5">
            После создания игра будет в статусе «запланирована». Сбор взносов и старт раунда 1 — на странице игры.
          </div>

          {error && (
            <div className="glass crimson-border p-2 text-xs text-red-300 text-center">{error}</div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setOpen(false)} className="btn-secondary">Отмена</button>
            <button
              onClick={create}
              disabled={busy || selected.size !== RR_PLAYERS_COUNT}
              className={cn('btn-primary', busy && 'opacity-50')}
            >
              {busy ? '...' : '♛ Создать'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


// =====================================================================
// КОНТРАБАНДА КАПИТАЛА — создание Большой игры
// =====================================================================
// Куратор — Бьякуя. Селестия не участвует. Все остальные активные игроки
// делятся на 2 команды (Северный/Южный банк). Если их меньше 14 — игра
// всё равно создаётся, ведущий разделит вручную или случайно из админ-панели
// на странице игры.

const CONTRABAND_TEAM_SIZE = 7;

function ContrabandCreator() {
  const { state } = useStore();
  const sb = getSupabase();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [includeQueen, setIncludeQueen] = useState(false);
  const [autoSplit, setAutoSplit] = useState(true);

  // Все активные игроки, кроме Казны и (по умолчанию) Селестии.
  const eligible = state.participants.filter(p =>
    isPlayer(p) && p.is_active && (includeQueen || p.id !== 'p-queen')
  );

  const create = async () => {
    setError(null);
    if (eligible.length < 4) {
      setError('Минимум 4 игрока (по 2 на команду).');
      return;
    }
    if (!sb) return;
    setBusy(true);

    const sgId = uid('sg');
    const ids = eligible.map(p => p.id);

    // Размер команды = min(7, floor(N/2))
    const teamSize = Math.min(CONTRABAND_TEAM_SIZE, Math.floor(ids.length / 2));

    let northTeam: string[] = [];
    let southTeam: string[] = [];
    if (autoSplit) {
      const shuffled = [...ids];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      northTeam = shuffled.slice(0, teamSize);
      southTeam = shuffled.slice(teamSize, teamSize * 2);
    }

    const initialState = {
      current_round: 0,
      rounds: [],
      north_team_ids: northTeam,
      south_team_ids: southTeam,
      north_captain_id: null,
      south_captain_id: null,
      north_score: 0,
      south_score: 0,
      smuggler_history: { north: [], south: [] },
      status: autoSplit && northTeam.length > 0 ? 'team_setup' : 'scheduled',
      winner_team: null,
    };

    await sb.from('super_games').insert({
      id: sgId,
      title: 'Контрабанда капитала',
      type: 'contraband',
      description: 'Командная игра-блеф. Контрабандист vs Таможенник. 7 раундов.',
      rules:
        'Куратор — Бьякуя. 2 команды по 7 игроков (или меньше при нехватке): Северный банк и Южный банк.\n' +
        '7 раундов. В каждом — одна команда отправляет Контрабандиста (тайно несёт от 0 до 500 000), другая — Таможенника.\n' +
        'Таможенник пропускает или проверяет (называя сумму подозрения).\n' +
        '— Назвал больше или ровно реальной суммы → команда Таможенника получает сумму на счёт + 10% комиссии Таможеннику.\n' +
        '— Назвал меньше → команда Контрабандиста получает сумму на счёт + 10% комиссии Контрабандисту, Таможенник теряет 100 000.\n' +
        '— Пропустил → команда Контрабандиста получает сумму, Контрабандист 10% комиссии.\n' +
        '— Контрабандист нёс 0, а Таможенник проверил → ловушка: Контрабандист получает 100 000, Таможенник теряет 100 000.\n' +
        'Победители: каждый +200 000, проигравшим −100 000. При ничье — командные награды и штрафы не применяются.',
      stakes: 'Командные счета. Победители +200k каждому, проигравшие −100k каждому.',
      status: 'scheduled',
      participant_ids: ids,
      spectator_bets_enabled: false,
      entry_fee: 0,
      bank: 0,
      state: initialState,
    });

    await sb.from('notifications').insert(
      ids.map(pid => ({
        id: uid('n'),
        recipient_id: pid,
        type: 'big_game_invite',
        title: 'Контрабанда капитала',
        body: 'Бьякуя собирает 2 команды для большой игры.',
        link_url: `/super-games/${sgId}`,
        is_read: false,
      })),
    );

    await sb.from('events').insert({
      id: uid('ev'),
      type: 'big_game_start',
      title: 'Бьякуя открывает «Контрабанду капитала»',
      body: `Игроков: ${ids.length}. Команды по ${teamSize}.`,
      link_url: `/super-games/${sgId}`,
      is_for_gm_only: false,
    });

    setBusy(false);
    setOpen(false);
  };

  const teamSize = Math.min(CONTRABAND_TEAM_SIZE, Math.floor(eligible.length / 2));

  return (
    <div className="glass-strong gold-border p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="text-2xl">💼</div>
        <div className="flex-1">
          <div className="text-[10px] uppercase tracking-widest text-gold/70">Большая игра</div>
          <div className="font-heading text-lg font-bold text-gradient-gold leading-tight">
            Контрабанда капитала
          </div>
          <div className="text-[10px] text-muted-foreground">
            Куратор — Бьякуя · 2 команды × {teamSize} · 7 раундов
          </div>
        </div>
      </div>

      {!open ? (
        <button onClick={() => setOpen(true)} className="btn-primary w-full">
          + Создать Контрабанду капитала
        </button>
      ) : (
        <div className="space-y-3 animate-slide-down">
          <div className="text-[11px] text-muted-foreground bg-white/5 rounded-lg px-3 py-2 border border-white/5">
            Будет добавлено {eligible.length} игроков. Команды по {teamSize}.
            {eligible.length < 14 && eligible.length >= 4 && (
              <> При меньшем числе участников размер команды уменьшится.</>
            )}
          </div>

          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={autoSplit}
              onChange={e => setAutoSplit(e.target.checked)}
              className="w-4 h-4 accent-gold"
            />
            Сразу разделить случайно (потом всё равно можно править вручную)
          </label>

          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={includeQueen}
              onChange={e => setIncludeQueen(e.target.checked)}
              className="w-4 h-4 accent-gold"
            />
            Включить Селестию как игрока (по умолчанию — нет, она наблюдатель)
          </label>

          {error && (
            <div className="glass crimson-border p-2 text-xs text-red-300 text-center">{error}</div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setOpen(false)} className="btn-secondary">Отмена</button>
            <button
              onClick={create}
              disabled={busy || eligible.length < 4}
              className={cn('btn-primary', busy && 'opacity-50')}
            >
              {busy ? '...' : '💼 Создать'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


// =====================================================================
// ДОЛГОВАЯ БАШНЯ МОНДО — создание Большой игры
// =====================================================================
// Куратор — Мондо (p-11), наблюдатель — Селестия. Оба не участвуют как
// игроки. Ведущий выбирает 4–8 участников. Состояние в super_games.state.

const DEBT_TOWER_MIN_PLAYERS = 4;
const DEBT_TOWER_MAX_PLAYERS = 8;

function DebtTowerCreator() {
  const { state } = useStore();
  const sb = getSupabase();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mondo = state.participants.find(p => p.id === 'p-11');
  const queen = state.participants.find(p => p.id === 'p-queen');

  // Кандидаты: все активные игроки, кроме Мондо и Селестии (они не играют).
  const eligible = state.participants.filter(p =>
    isPlayer(p) && p.is_active && p.id !== 'p-11' && p.id !== 'p-queen'
  );

  const togglePart = (pid: string) => {
    const next = new Set(selected);
    if (next.has(pid)) {
      next.delete(pid);
    } else {
      if (next.size >= DEBT_TOWER_MAX_PLAYERS) return;
      next.add(pid);
    }
    setSelected(next);
  };

  const create = async () => {
    setError(null);
    if (selected.size < DEBT_TOWER_MIN_PLAYERS) {
      setError(`Нужно от ${DEBT_TOWER_MIN_PLAYERS} до ${DEBT_TOWER_MAX_PLAYERS} игроков. Сейчас выбрано: ${selected.size}.`);
      return;
    }
    if (!sb) return;
    setBusy(true);

    const sgId = uid('sg');
    const ids = Array.from(selected);

    const initialState = {
      current_floor: 0,
      total_floors: 5,
      floors: [],
      fee_paid: {},
      scores: {},
      status: 'scheduled',
      winner_id: null,
      winner_is_candidate_for_elite: false,
    };

    await sb.from('super_games').insert({
      id: sgId,
      title: 'Долговая башня Мондо',
      type: 'debt_tower',
      description: 'Личная игра Мондо. 5 этажей, 3 двери: оплата, риск, долг.',
      rules:
        'Куратор — Мондо, наблюдатель — Селестия. 4–8 игроков.\n' +
        'Взнос: 150 000 в банк. 5 этажей. На каждом — тайный выбор двери:\n' +
        '— Оплата: −50k и пройти этаж.\n' +
        '— Риск: 50/50 → +150k или −150k.\n' +
        '— Долг: сейчас 0, создаётся долг к Казне. 1-й раз 100k, далее 200k / 300k / 400k / 500k. Взыскатель — Мондо.\n' +
        'Победитель = максимальный чистый результат (прибыль − потери − долги). Забирает банк и получает статус «Кандидат в Элиту». Повышение до Элиты — отдельной кнопкой.',
      stakes: 'Взнос: 150 000 от каждого. Победитель забирает банк.',
      status: 'scheduled',
      participant_ids: ids,
      spectator_bets_enabled: false,
      entry_fee: 150_000,
      bank: 0,
      state: initialState,
    });

    await sb.from('notifications').insert(
      ids.map(pid => ({
        id: uid('n'),
        recipient_id: pid,
        type: 'big_game_invite',
        title: 'Долговая башня Мондо',
        body: 'Мондо собирает игроков. Взнос 150 000.',
        link_url: `/super-games/${sgId}`,
        is_read: false,
      })),
    );

    await sb.from('events').insert({
      id: uid('ev'),
      type: 'big_game_start',
      title: 'Мондо открывает «Долговую башню»',
      body: `Игроков: ${ids.length}. Этажей: 5.`,
      link_url: `/super-games/${sgId}`,
      is_for_gm_only: false,
    });

    setBusy(false);
    setOpen(false);
    setSelected(new Set());
  };

  return (
    <div className="glass-strong gold-border p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="text-2xl">🏛️</div>
        <div className="flex-1">
          <div className="text-[10px] uppercase tracking-widest text-gold/70">Большая игра</div>
          <div className="font-heading text-lg font-bold text-gradient-gold leading-tight">
            Долговая башня Мондо
          </div>
          <div className="text-[10px] text-muted-foreground">
            Куратор — Мондо · 4–8 игроков · 5 этажей · взнос 150 000
          </div>
        </div>
      </div>

      {!open ? (
        <button onClick={() => setOpen(true)} className="btn-primary w-full">
          + Создать Долговую башню
        </button>
      ) : (
        <div className="space-y-3 animate-slide-down">
          <div className="grid grid-cols-2 gap-2">
            {mondo && (
              <div className="flex items-center gap-2 p-2 rounded-xl bg-gold/5 border border-gold/30">
                <CharacterIcon participant={mondo} size="xs" ringless />
                <div className="flex-1 text-xs">
                  <div className="font-bold">{mondo.display_name}</div>
                  <div className="text-[10px] text-gold/80">Куратор · взыскатель</div>
                </div>
              </div>
            )}
            {queen && (
              <div className="flex items-center gap-2 p-2 rounded-xl bg-card/40 border border-white/8">
                <CharacterIcon participant={queen} size="xs" ringless />
                <div className="flex-1 text-xs">
                  <div className="font-bold">{queen.display_name}</div>
                  <div className="text-[10px] text-muted-foreground">Наблюдатель</div>
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-bold uppercase tracking-widest text-gold">
                Выберите 4–8 игроков ({selected.size})
              </label>
            </div>
            <div className="text-[10px] text-muted mb-2">
              Мондо и Селестия не участвуют.
            </div>
            <div className="max-h-56 overflow-y-auto space-y-1 glass p-2">
              {eligible.map(p => {
                const isSelected = selected.has(p.id);
                const limitReached = !isSelected && selected.size >= DEBT_TOWER_MAX_PLAYERS;
                return (
                  <label
                    key={p.id}
                    className={cn(
                      'flex items-center gap-2 p-1.5 rounded-lg cursor-pointer active:bg-white/5',
                      limitReached && 'opacity-40 cursor-not-allowed',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={limitReached}
                      onChange={() => togglePart(p.id)}
                      className="w-4 h-4 accent-gold"
                    />
                    <CharacterIcon participant={p} size="xs" ringless />
                    <span className="text-sm flex-1">{p.display_name}</span>
                    <Yen amount={p.balance} className="text-[10px] text-muted-foreground" iconClass="w-3 h-3" />
                  </label>
                );
              })}
            </div>
          </div>

          <div className="text-[10px] text-muted leading-relaxed bg-white/5 rounded-lg px-3 py-2 border border-white/5">
            Долги создаются автоматически в системе долгов: кредитор — Казна, в комментарии помечено «взыскатель Мондо». Мондо найдёт их во вкладке Долгов админки.
          </div>

          {error && (
            <div className="glass crimson-border p-2 text-xs text-red-300 text-center">{error}</div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setOpen(false)} className="btn-secondary">Отмена</button>
            <button
              onClick={create}
              disabled={busy || selected.size < DEBT_TOWER_MIN_PLAYERS}
              className={cn('btn-primary', busy && 'opacity-50')}
            >
              {busy ? '...' : '🏛️ Создать'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


// =====================================================================
// АУКЦИОН ДОЛГОВ — создание Большой игры
// =====================================================================
// Куратор — Кредитор Элиты, взыскатель — Мондо (p-11), наблюдатель —
// Селестия (p-queen). Лоты создаются прямо на странице игры из реальных
// активных и просроченных долгов.

function DebtAuctionCreator() {
  const sb = getSupabase();
  const [busy, setBusy] = useState(false);
  const [activeDebtCount, setActiveDebtCount] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!sb) return;
      const { count } = await sb.from('debts').select('id', { count: 'exact', head: true })
        .in('status', ['active', 'overdue', 'requested']);
      if (alive) setActiveDebtCount(count ?? 0);
    })();
    return () => { alive = false; };
  }, [sb]);

  const create = async () => {
    if (!sb) return;
    setBusy(true);
    const sgId = uid('sg');
    const initialState = {
      curator_id: 'p-collector',
      collector_id: 'p-11',
      observer_id: 'p-queen',
      lots: [],
      current_lot_id: null,
      mondo_markup_used: false,
      creditor_loan_used: false,
      celestia_treasury_hand_used: false,
      status: 'preparing_lots',
    };

    await sb.from('super_games').insert({
      id: sgId,
      title: 'Аукцион долгов',
      type: 'debt_auction',
      description: 'Долги становятся товаром. Можно купить чужой долг, спасти союзника или выкупить свой.',
      rules:
        'Куратор — Кредитор Элиты, взыскатель — Мондо, наблюдатель — Селестия.\n' +
        'Ведущий выбирает активные и просроченные долги и создаёт из них лоты.\n' +
        'Стартовая цена 50% от суммы долга, цена самовыкупа должником 70%, шаг ставки 50k.\n' +
        'Победитель аукциона получает власть над долгом (становится новым владельцем). Должник, выкупивший сам себя, закрывает долг.\n' +
        'Спецдействия (по 1 разу): Мондо — +20% к лоту до открытия; Кредитор — срочный заём ≤500k под 20%; Селестия — Казна перебивает ставку +100k и забирает лот.',
      stakes: 'Платит только победитель лота. Самовыкуп — должник платит сразу.',
      status: 'live',
      participant_ids: [],
      spectator_bets_enabled: false,
      entry_fee: 0,
      bank: 0,
      state: initialState,
    });

    await sb.from('events').insert({
      id: uid('ev'),
      type: 'big_game_start',
      title: 'Кредитор Элиты открывает «Аукцион долгов»',
      body: `Активных долгов в системе: ${activeDebtCount ?? '?'}.`,
      link_url: `/super-games/${sgId}`,
      is_for_gm_only: false,
    });

    setBusy(false);
  };

  const canStart = (activeDebtCount ?? 0) >= 3;

  return (
    <div className="glass-strong gold-border p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="text-2xl">⚖️</div>
        <div className="flex-1">
          <div className="text-[10px] uppercase tracking-widest text-gold/70">Большая игра</div>
          <div className="font-heading text-lg font-bold text-gradient-gold leading-tight">
            Аукцион долгов
          </div>
          <div className="text-[10px] text-muted-foreground">
            Активных долгов: {activeDebtCount === null ? '...' : activeDebtCount}
            {!canStart && activeDebtCount !== null && ' · нужно минимум 3'}
          </div>
        </div>
      </div>

      <div className="text-[10px] text-muted leading-relaxed bg-white/5 rounded-lg px-3 py-2 border border-white/5">
        Игра запустится сразу. Лоты добавляются прямо на странице из реальных активных/просроченных долгов.
        Никаких взносов, никакого банка — деньги ходят между покупателями и владельцами долгов.
      </div>

      <button
        className="btn-primary w-full"
        onClick={create}
        disabled={busy || !canStart}
      >
        {busy ? '...' : '⚖️ Создать Аукцион долгов'}
      </button>
    </div>
  );
}


// =====================================================================
// СУД НАД ЭЛИТОЙ — создание Большой игры
// =====================================================================

function EliteTrialCreator() {
  const { state } = useStore();
  const sb = getSupabase();
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!sb) return;
    setBusy(true);
    const sgId = uid('sg');
    const initialState = {
      judge_id: 'p-queen',
      target_elite_id: '',
      prosecution_player_ids: [],
      defense_player_ids: [],
      accusation_text: '',
      defense_text: '',
      prosecution_fund: 0,
      defense_fund: 0,
      prosecution_score: 0,
      defense_score: 0,
      cards: [],
      contributions: [],
      verdict: null,
      status: 'target_selection',
    };

    await sb.from('super_games').insert({
      id: sgId,
      title: 'Суд над Элитой',
      type: 'elite_trial',
      description: 'Публичный суд: карточный поединок Обвинения и Защиты.',
      rules:
        'Судья — Селестия. Защита побеждает при равенстве очков.\n' +
        'Стороны собирают фонды (любой игрок может внести в свою сторону).\n' +
        'За 50k открывается случайная карта дела, за 100k покупается. Сторона играет до 5 карт.\n' +
        'Очки складываются согласно карте; опасные карты могут давать штрафы или менять сторону.\n' +
        'Виновный — штраф 1M в Казну. Оправданный — компенсация 500k из Казны.',
      stakes: 'Игроки рискуют только тем, что вложили в фонды своих сторон.',
      status: 'live',
      participant_ids: [],
      spectator_bets_enabled: false,
      entry_fee: 0,
      bank: 0,
      state: initialState,
    });

    await sb.from('events').insert({
      id: uid('ev'),
      type: 'big_game_start',
      title: 'Селестия открывает «Суд над Элитой»',
      body: 'Назначьте судимую Элиту, стороны и пункт обвинения.',
      link_url: `/super-games/${sgId}`,
      is_for_gm_only: false,
    });

    setBusy(false);
  };

  return (
    <div className="glass-strong gold-border p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="text-2xl">⚖️</div>
        <div className="flex-1">
          <div className="text-[10px] uppercase tracking-widest text-gold/70">Большая игра</div>
          <div className="font-heading text-lg font-bold text-gradient-gold leading-tight">
            Суд над Элитой
          </div>
          <div className="text-[10px] text-muted-foreground">
            Судья — Селестия · Обвинение vs Защита · карточный поединок
          </div>
        </div>
      </div>
      <div className="text-[10px] text-muted leading-relaxed bg-white/5 rounded-lg px-3 py-2 border border-white/5">
        Создаёт пустой суд. Выбор Элиты, сторон и текстов — на странице игры.
      </div>
      <button className="btn-primary w-full" onClick={create} disabled={busy}>
        {busy ? '...' : '⚖️ Создать Суд над Элитой'}
      </button>
    </div>
  );
}

// =====================================================================
// СОВЕТ БУНТА — создание Большой игры
// =====================================================================

function RebellionCreator() {
  const { state } = useStore();
  const sb = getSupabase();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eligible = state.participants.filter(p => isPlayer(p) && p.is_active);

  const togglePart = (pid: string) => {
    const next = new Set(selected);
    if (next.has(pid)) next.delete(pid);
    else if (next.size < 12) next.add(pid);
    setSelected(next);
  };

  const create = async () => {
    setError(null);
    if (selected.size < 6) {
      setError(`Минимум 6 игроков. Сейчас: ${selected.size}.`);
      return;
    }
    if (!sb) return;
    setBusy(true);
    const sgId = uid('sg');
    const ids = Array.from(selected);

    const initialState = {
      current_round: 0,
      total_rounds: 5,
      rounds: [],
      rebellion_fund: 0,
      rebellion_goal: 3_000_000,
      reveal_mode: 'public_names',
      player_counts: {},
      result: null,
      throne_unlocked: false,
      status: 'scheduled',
    };

    await sb.from('super_games').insert({
      id: sgId,
      title: 'Совет бунта',
      type: 'rebellion',
      description: 'Тайный совет недовольных академией. 5 раундов · 4 действия.',
      rules:
        'Селестия наблюдает. 6–12 игроков, 5 раундов.\n' +
        'В каждом раунде игрок тайно выбирает одно из четырёх действий:\n' +
        '— Бунт: −100k, Фонд бунта +150k.\n' +
        '— Предательство: +150k из Казны, Фонд −100k.\n' +
        '— Нейтралитет: без изменений.\n' +
        '— Сделка с Элитой: +250k, но при успехе бунта −500k штраф.\n' +
        'Цель: собрать Фонд бунта ≥ 3 000 000.\n' +
        'Успех: Казна теряет 3M; лояльные бунтари (≥3 выборов) +300k; сделочники −500k; частые предатели (≥2 раз) −300k. Разблокируется «Трон Селестии».\n' +
        'Провал: лояльные бунтари (≥3 выборов) −300k; предатели и сделочники сохраняют выплаты.',
      stakes: 'Платежи и награды идут через Казну. Личные деньги под риском.',
      status: 'scheduled',
      participant_ids: ids,
      spectator_bets_enabled: false,
      entry_fee: 0,
      bank: 0,
      state: initialState,
    });

    await sb.from('notifications').insert(
      ids.map(pid => ({
        id: uid('n'),
        recipient_id: pid,
        type: 'big_game_invite',
        title: 'Совет бунта',
        body: 'Тайный совет — будете бунтовать или продадите союзников?',
        link_url: `/super-games/${sgId}`,
        is_read: false,
      })),
    );

    await sb.from('events').insert({
      id: uid('ev'),
      type: 'big_game_start',
      title: 'Совет бунта собирается',
      body: `Игроков: ${ids.length}. Цель Фонда бунта: 3 000 000.`,
      link_url: `/super-games/${sgId}`,
      is_for_gm_only: false,
    });

    setBusy(false);
    setOpen(false);
    setSelected(new Set());
  };

  return (
    <div className="glass-strong gold-border p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="text-2xl">🔥</div>
        <div className="flex-1">
          <div className="text-[10px] uppercase tracking-widest text-gold/70">Большая игра</div>
          <div className="font-heading text-lg font-bold text-gradient-gold leading-tight">
            Совет бунта
          </div>
          <div className="text-[10px] text-muted-foreground">
            6–12 игроков · 5 раундов · цель Фонда 3 000 000
          </div>
        </div>
      </div>

      {!open ? (
        <button onClick={() => setOpen(true)} className="btn-primary w-full">
          + Создать Совет бунта
        </button>
      ) : (
        <div className="space-y-3 animate-slide-down">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-bold uppercase tracking-widest text-gold">
              Выбрать 6–12 игроков ({selected.size})
            </label>
          </div>
          <div className="max-h-56 overflow-y-auto space-y-1 glass p-2">
            {eligible.map(p => {
              const isSelected = selected.has(p.id);
              const limitReached = !isSelected && selected.size >= 12;
              return (
                <label
                  key={p.id}
                  className={cn(
                    'flex items-center gap-2 p-1.5 rounded-lg cursor-pointer active:bg-white/5',
                    limitReached && 'opacity-40 cursor-not-allowed',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={limitReached}
                    onChange={() => togglePart(p.id)}
                    className="w-4 h-4 accent-gold"
                  />
                  <CharacterIcon participant={p} size="xs" ringless />
                  <span className="text-sm flex-1">{p.display_name}</span>
                  <Yen amount={p.balance} className="text-[10px] text-muted-foreground" iconClass="w-3 h-3" />
                </label>
              );
            })}
          </div>

          {error && (
            <div className="glass crimson-border p-2 text-xs text-red-300 text-center">{error}</div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setOpen(false)} className="btn-secondary">Отмена</button>
            <button
              onClick={create}
              disabled={busy || selected.size < 6}
              className={cn('btn-primary', busy && 'opacity-50')}
            >
              {busy ? '...' : '🔥 Создать'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


// =====================================================================
// ТРОН СЕЛЕСТИИ — финал сезона
// =====================================================================

function ThroneCreator() {
  const sb = getSupabase();
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!sb) return;
    setBusy(true);
    const sgId = uid('sg');
    const initialState = {
      celestia_id: 'p-queen',
      challenger_id: '',
      celestia_supporter_ids: [],
      challenger_supporter_ids: [],
      neutral_ids: [],
      celestia_fund: 0,
      challenger_fund: 0,
      celestia_score: 0,
      challenger_score: 0,
      current_round: 0,
      total_rounds: 10,
      rounds: [],
      contributions: [],
      purchases: [],
      celestia_privilege_used: false,
      block_celestia_next_round: false,
      replay_used_celestia: false,
      replay_used_challenger: false,
      winner: null,
      final_outcome: null,
      status: 'challenger_setup',
    };

    await sb.from('super_games').insert({
      id: sgId,
      title: 'Трон Селестии',
      type: 'throne_celestia',
      description: 'Финальная супер-игра сезона. Селестия против Претендента.',
      rules:
        '10 раундов дуэли. Карты: Император / Гражданин / Питомец (Император > Гражданин > Питомец > Император).\n' +
        'Первые 5 раундов: Селестия — Император, Претендент — Питомец. Вторые 5 — стороны меняются.\n' +
        'При ничье после 10 раундов — серия «Последний трон» (только Император vs Питомец).\n' +
        'Привилегия Селестии «Королевский регламент» (1 раз): посмотреть карту, заставить переиграть, заблокировать карту.\n' +
        'Преимущества из фондов: посмотреть 500k, заменить 700k, переиграть проигрыш 1M, блок привилегии 1.5M (только Претендент).\n' +
        'Победа Селестии: должность остаётся, ставки уходят в Казну.\n' +
        'Победа Претендента: выбор финала — Новый директор или Бунт победил.',
      stakes: 'Селестия — должность + 5 000 000. Претендент — 2 000 000 (или весь баланс).',
      status: 'live',
      participant_ids: [],
      spectator_bets_enabled: false,
      entry_fee: 0,
      bank: 0,
      state: initialState,
    });

    await sb.from('events').insert({
      id: uid('ev'),
      type: 'big_game_start',
      title: 'Открыт финал сезона: «Трон Селестии»',
      body: 'Назначьте Претендента и откройте выбор сторон.',
      link_url: `/super-games/${sgId}`,
      is_for_gm_only: false,
    });

    setBusy(false);
  };

  return (
    <div className="glass-strong gold-border p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="text-2xl">♛</div>
        <div className="flex-1">
          <div className="text-[10px] uppercase tracking-widest text-gold/70">Финальная супер-игра</div>
          <div className="font-heading text-lg font-bold text-gradient-gold leading-tight">
            Трон Селестии
          </div>
          <div className="text-[10px] text-muted-foreground">
            Селестия vs Претендент · 10 раундов · ставка должности
          </div>
        </div>
      </div>
      <div className="text-[10px] text-muted leading-relaxed bg-white/5 rounded-lg px-3 py-2 border border-white/5">
        Создаёт пустой финал. Выбор Претендента, открытие сторон/фондов и старт дуэли — на странице игры.
        Ставки 5M Селестии и до 2M Претендента списываются в Казну при старте 1-го раунда.
      </div>
      <button className="btn-primary w-full" onClick={create} disabled={busy}>
        {busy ? '...' : '♛ Создать финал «Трон Селестии»'}
      </button>
    </div>
  );
}


// =====================================================================
// МАЛЫЕ ИГРЫ (5 MVP)
// =====================================================================
// 1. Красное / Чёрное (1v1)
// 2. Слепая ставка (2–6)
// 3. Лжец на кубиках (2–6)
// 4. 21 отчаяния (1–5 vs дилер)
// 5. Выкупной стол (должник + хозяин)

const MINI_GAMES: { type: string; label: string; emoji: string; minPlayers: number; maxPlayers: number; defaultStake: number; allowsDebt?: boolean }[] = [
  { type: 'mini_red_black',  label: 'Красное / Чёрное', emoji: '🎴', minPlayers: 2, maxPlayers: 2, defaultStake: 50_000 },
  { type: 'mini_blind_bid',  label: 'Слепая ставка',    emoji: '🎯', minPlayers: 2, maxPlayers: 6, defaultStake: 0 },
  { type: 'mini_liar_dice',  label: 'Лжец на кубиках',  emoji: '🎲', minPlayers: 2, maxPlayers: 6, defaultStake: 50_000 },
  { type: 'mini_despair_21', label: '21 отчаяния',      emoji: '🂡', minPlayers: 1, maxPlayers: 5, defaultStake: 50_000 },
  { type: 'mini_ransom',     label: 'Выкупной стол',    emoji: '🃟', minPlayers: 1, maxPlayers: 1, defaultStake: 0, allowsDebt: true },
  { type: 'mini_joker',      label: 'Достать Джокера',  emoji: '🎴', minPlayers: 2, maxPlayers: 6, defaultStake: 50_000 },
];

function MiniGamesCreator() {
  const { state } = useStore();
  const sb = getSupabase();
  const [open, setOpen] = useState(false);
  const [pickedType, setPickedType] = useState<string>('mini_red_black');
  const [stake, setStake] = useState<number>(50_000);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debtId, setDebtId] = useState<string>(''); // для выкупного стола
  const [debts, setDebts] = useState<any[]>([]);
  const [jokerMode, setJokerMode] = useState<'quick' | 'long' | 'advanced'>('quick');

  const meta = MINI_GAMES.find(m => m.type === pickedType)!;
  const eligible = state.participants.filter(p => isPlayer(p) && p.is_active);

  useEffect(() => {
    if (pickedType !== 'mini_ransom' || !sb) return;
    let alive = true;
    (async () => {
      const { data } = await sb.from('debts').select('*').in('status', ['active', 'overdue']).order('created_at', { ascending: false });
      if (alive) setDebts(data ?? []);
    })();
    return () => { alive = false; };
  }, [pickedType, sb]);

  const togglePart = (pid: string) => {
    const next = new Set(selected);
    if (next.has(pid)) next.delete(pid);
    else if (next.size < meta.maxPlayers) next.add(pid);
    setSelected(next);
  };

  const create = async () => {
    setError(null);
    if (selected.size < meta.minPlayers) {
      setError(`Нужно минимум ${meta.minPlayers} игрок(ов).`);
      return;
    }
    if (!sb) return;
    setBusy(true);

    const sgId = uid('sg');
    const ids = Array.from(selected);
    let initialState: any = {};

    if (pickedType === 'mini_red_black') {
      initialState = { stake, fee_paid: {}, choices: {}, result: null, winner_ids: [], status: 'waiting_players' };
    } else if (pickedType === 'mini_blind_bid') {
      initialState = { fee_paid: {}, bids: {}, status: 'active', winner_id: null };
    } else if (pickedType === 'mini_liar_dice') {
      initialState = { stake, fee_paid: {}, dice: {}, turn_order: [], current_turn_idx: 0, claim: null, status: 'waiting_players' };
    } else if (pickedType === 'mini_despair_21') {
      initialState = { stake, fee_paid: {}, hands: {}, stand: {}, dealer_hand: [], status: 'waiting_players' };
    } else if (pickedType === 'mini_ransom') {
      const debt = debts.find(d => d.id === debtId);
      if (!debt) { setError('Выберите долг.'); setBusy(false); return; }
      initialState = {
        debt_id: debt.id,
        debt_amount_initial: debt.amount,
        remover_id: 'p-treasury',
        removed_card_index: null,
        cards_order: shuffleRansomCardsAdminCopy(),
        picked_card_index: null,
        picked_card: null,
        new_debt_amount: debt.amount,
        postponed: false,
        status: 'waiting_remove',
      };
      // Должник = только этот игрок
      const debtorId = debt.debtor_id;
      const arr = [debtorId];
      for (const id of arr) selected.add(id);
    } else if (pickedType === 'mini_joker') {
      initialState = {
        mode: jokerMode,
        stake,
        fee_paid: {},
        bank: 0,
        treasury_fee: 0,
        payout_bank: 0,
        deck: [],
        turn_order: [],
        current_idx: 0,
        eliminated_ids: [],
        skip_used_ids: [],
        hint_uses: {},
        pending_pass_from: null,
        pending_pass_to: null,
        actions: [],
        winner_ids: [],
        loser_ids: [],
        status: 'waiting_players',
      };
    }

    const finalIds = pickedType === 'mini_ransom' ? Array.from(selected) : ids;

    await sb.from('super_games').insert({
      id: sgId,
      title: meta.label,
      type: pickedType,
      description: `Малая игра: ${meta.label}`,
      rules: '',
      stakes: stake > 0 ? `Ставка ${stake.toLocaleString('ru-RU')} с каждого участника` : null,
      status: 'live',
      participant_ids: finalIds,
      spectator_bets_enabled: false,
      entry_fee: stake,
      bank: 0,
      state: initialState,
    });

    await sb.from('events').insert({
      id: uid('ev'),
      type: 'mini_game_start',
      title: `Малая игра: ${meta.label}`,
      body: `Игроков: ${finalIds.length}.`,
      link_url: `/super-games/${sgId}`,
      is_for_gm_only: false,
    });

    // Уведомления приглашённым
    if (finalIds.length > 0) {
      await sb.from('notifications').insert(
        finalIds.map((pid: string) => ({
          id: uid('n'),
          recipient_id: pid,
          type: 'mini_game_invite',
          title: `Малая игра: ${meta.label}`,
          body: `Вас пригласили. Ставка: ${stake.toLocaleString('ru-RU')} ¥.`,
          link_url: `/super-games/${sgId}`,
          is_read: false,
        })),
      );
    }

    setBusy(false);
    setOpen(false);
    setSelected(new Set());
  };

  return (
    <div className="glass-strong gold-border p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="text-2xl">🎯</div>
        <div className="flex-1">
          <div className="text-[10px] uppercase tracking-widest text-gold/70">Малые игры</div>
          <div className="font-heading text-lg font-bold text-gradient-gold leading-tight">
            5 быстрых форматов
          </div>
          <div className="text-[10px] text-muted-foreground">
            Красное/Чёрное · Слепая ставка · Лжец · 21 отчаяния · Выкупной стол
          </div>
        </div>
      </div>

      {!open ? (
        <button onClick={() => setOpen(true)} className="btn-primary w-full">
          + Создать малую игру
        </button>
      ) : (
        <div className="space-y-3 animate-slide-down">
          <select
            className="input-field text-xs"
            value={pickedType}
            onChange={e => { setPickedType(e.target.value); setSelected(new Set()); }}
          >
            {MINI_GAMES.map(m => (
              <option key={m.type} value={m.type}>{m.emoji} {m.label}</option>
            ))}
          </select>

          {meta.defaultStake > 0 && (
            <div>
              <div className="text-[10px] text-gold/80 mb-1">Ставка с каждого (¥)</div>
              <input
                type="number" min={10_000} step={10_000}
                value={stake}
                onChange={e => setStake(Math.max(10_000, Number(e.target.value)))}
                className="input-field font-mono text-sm"
              />
            </div>
          )}

          {pickedType === 'mini_joker' && (
            <div>
              <div className="text-[10px] text-gold/80 mb-1">Режим</div>
              <div className="grid grid-cols-3 gap-1">
                {(['quick', 'long', 'advanced'] as const).map(m => (
                  <button key={m}
                    className={cn('px-2 py-2 rounded-lg text-xs border',
                      jokerMode === m ? 'bg-gold/15 border-gold/50 text-gold' : 'bg-card/60 border-white/8')}
                    onClick={() => setJokerMode(m)}
                  >
                    {m === 'quick' && '⚡ Быстрый'}
                    {m === 'long' && '🌀 Без бонусов'}
                    {m === 'advanced' && '♟️ С бонусами'}
                  </button>
                ))}
              </div>
              <div className="text-[10px] text-muted-foreground mt-1.5 leading-relaxed">
                {jokerMode === 'quick' && (
                  <>⚡ <b>Быстрый</b> — кто вытянул джокера, тот проиграл; остальные делят банк. Колода 10+1, без бонусов.</>
                )}
                {jokerMode === 'long' && (
                  <>🌀 <b>Без бонусов</b> — тянет джокера → выбывает, колода обновляется. Играют до одного. Платных действий нет.</>
                )}
                {jokerMode === 'advanced' && (
                  <>♟️ <b>С бонусами</b> — то же что «Без бонусов», но открыты платные действия:
                  пропуск 20 000 ¥ (1 раз),
                  подсказка 30 000 ¥ (показывает верхнюю карту покупателю),
                  передача хода 30 000 ¥ (мгновенно, без подтверждения).</>
                )}
              </div>
            </div>
          )}

          {pickedType === 'mini_ransom' && (
            <div>
              <div className="text-[10px] text-gold/80 mb-1">Долг для выкупного стола</div>
              <select
                className="input-field text-xs"
                value={debtId}
                onChange={e => setDebtId(e.target.value)}
              >
                <option value="">— выбрать долг —</option>
                {debts.map(d => {
                  const debtor = state.participants.find(p => p.id === d.debtor_id);
                  return (
                    <option key={d.id} value={d.id}>
                      {debtor?.display_name ?? d.debtor_id} — {d.amount.toLocaleString('ru-RU')}
                      {d.status === 'overdue' ? ' (просрочен)' : ''}
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          {pickedType !== 'mini_ransom' && (
            <div>
              <div className="text-[10px] text-gold/80 mb-1">
                Игроки ({selected.size}/{meta.maxPlayers}, мин {meta.minPlayers})
              </div>
              <div className="max-h-44 overflow-y-auto space-y-1 glass p-2">
                {eligible.map(p => {
                  const isSelected = selected.has(p.id);
                  const limitReached = !isSelected && selected.size >= meta.maxPlayers;
                  return (
                    <label
                      key={p.id}
                      className={cn(
                        'flex items-center gap-2 p-1.5 rounded-lg cursor-pointer active:bg-white/5',
                        limitReached && 'opacity-40 cursor-not-allowed',
                      )}
                    >
                      <input
                        type="checkbox" checked={isSelected} disabled={limitReached}
                        onChange={() => togglePart(p.id)}
                        className="w-4 h-4 accent-gold"
                      />
                      <CharacterIcon participant={p} size="xs" ringless />
                      <span className="text-sm flex-1">{p.display_name}</span>
                      <Yen amount={p.balance} className="text-[10px] text-muted-foreground" iconClass="w-3 h-3" />
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {error && (
            <div className="glass crimson-border p-2 text-xs text-red-300 text-center">{error}</div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setOpen(false)} className="btn-secondary">Отмена</button>
            <button
              onClick={create}
              disabled={busy}
              className={cn('btn-primary', busy && 'opacity-50')}
            >{busy ? '...' : 'Создать'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// Лёгкая копия shuffleRansomCards (чтобы не тащить импорт в этот файл)
function shuffleRansomCardsAdminCopy(): ('cancel_half' | 'double' | 'postpone')[] {
  const arr: ('cancel_half' | 'double' | 'postpone')[] = ['cancel_half', 'double', 'postpone'];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
