'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useStore, uid } from '@/lib/store/StoreProvider';
import { CharacterIcon } from '@/components/ui/CharacterIcon';
import { Yen, YenIcon } from '@/components/ui/Yen';
import { cn, timeAgo } from '@/lib/utils';
import { getSupabase } from '@/lib/supabase/client';
import type { PariMarket, PariOption } from '@/lib/store/types';

const STATUS_LABELS: Record<string, { text: string; cls: string }> = {
  open: { text: 'Открыто', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  awaiting_confirmation: { text: 'Ожидает подтверждения', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  resolved: { text: 'Решено', cls: 'bg-purple-500/15 text-purple-300 border-purple-500/30' },
  cancelled: { text: 'Отменено', cls: 'bg-gray-500/15 text-gray-400 border-gray-500/30' },
};

export default function PariPage() {
  const { state, currentUser, role } = useStore();
  const [tab, setTab] = useState<'open' | 'resolved' | 'my'>('open');
  const [betting, setBetting] = useState<{ market: PariMarket; option: PariOption } | null>(null);
  const [commenting, setCommenting] = useState<PariMarket | null>(null);
  const sb = getSupabase();

  // Авто-перевод в "ожидание подтверждения" если день закрытия наступил
  useEffect(() => {
    if (!sb) return;
    state.pari.forEach(m => {
      if (m.status === 'open' && state.room.day >= m.closes_on_day) {
        sb.from('pari').update({ status: 'awaiting_confirmation' }).eq('id', m.id);
      }
    });
  }, [state.room.day]);

  const filtered = useMemo(() => {
    if (tab === 'open') return state.pari.filter(m => m.status === 'open' || m.status === 'awaiting_confirmation');
    if (tab === 'resolved') return state.pari.filter(m => m.status === 'resolved' || m.status === 'cancelled');
    if (tab === 'my' && currentUser) {
      return state.pari.filter(m =>
        m.creator_id === currentUser.id ||
        (m.bets || []).some(b => b.participant_id === currentUser.id)
      );
    }
    return state.pari;
  }, [state.pari, tab, currentUser]);

  return (
    <div className="px-3 sm:px-4 py-4 max-w-2xl mx-auto space-y-4 animate-fade-in">
      <Link href="/pari/create" className="block">
        <div className="relative glass-strong gold-border p-4 active:scale-[0.99]">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-gold-light to-gold-dark flex items-center justify-center text-2xl">💰</div>
            <div className="flex-1">
              <div className="font-heading font-bold text-base">Создать пари</div>
              <div className="text-xs text-muted-foreground">Поставьте свой вопрос — пусть ставят</div>
            </div>
            <span className="text-gold/70">→</span>
          </div>
        </div>
      </Link>

      <div className="scroll-x">
        {[
          { key: 'open', label: 'Открытые', icon: '🟢' },
          { key: 'resolved', label: 'Архив', icon: '✓' },
          { key: 'my', label: 'Мои', icon: '👤' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className={cn('tab-pill', tab === t.key ? 'tab-pill-active' : 'tab-pill-inactive')}>
            <span>{t.icon}</span><span>{t.label}</span>
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="glass p-6 text-center">
            <div className="text-3xl mb-2 opacity-30">💰</div>
            <p className="text-sm text-muted-foreground">Пари в этой категории пока нет.</p>
          </div>
        ) : filtered.map(m => (
          <PariCard key={m.id} market={m}
            onBet={(opt) => setBetting({ market: m, option: opt })}
            onComment={() => setCommenting(m)} />
        ))}
      </div>

      {betting && <BetModal market={betting.market} option={betting.option} onClose={() => setBetting(null)} />}
      {commenting && <CommentsModal market={commenting} onClose={() => setCommenting(null)} />}

      {(role === 'gm' || role === 'queen') && (
        <div className="glass p-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gold/70 mb-2">Действия админа</div>
          <Link href="/admin?tab=pari" className="btn-outline w-full text-sm">⚙️ Решить ожидающие пари</Link>
        </div>
      )}
    </div>
  );
}

function PariCard({ market, onBet, onComment }: {
  market: PariMarket;
  onBet: (opt: PariOption) => void;
  onComment: () => void;
}) {
  const { state } = useStore();
  const statusInfo = STATUS_LABELS[market.status] || STATUS_LABELS.open;
  const bets = market.bets || [];
  const totalPool = bets.reduce((s, b) => s + b.amount, 0);
  const creator = market.is_anonymous ? null : state.participants.find(p => p.id === market.creator_id);

  return (
    <div className={cn('glass-strong overflow-hidden',
      market.status === 'awaiting_confirmation' && 'gold-border')}>
      <div className="p-4 pb-2">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-bold text-sm leading-snug flex-1">{market.title}</h3>
          <span className={cn('status-badge border shrink-0', statusInfo.cls)}>{statusInfo.text}</span>
        </div>
        {market.description && <p className="text-xs text-muted-foreground mb-2">{market.description}</p>}
        <div className="flex items-center justify-between text-[11px] text-muted-foreground flex-wrap gap-1">
          <span className="truncate">{market.is_anonymous ? '👤 Аноним' : `от ${creator?.display_name || '—'}`}</span>
          <span className="flex items-center gap-2">
            <span>Комиссия: <span className="text-gold font-bold">{market.commission_pct}%</span></span>
            <span>·</span>
            <span>Пул:</span>
            <Yen amount={totalPool} className="text-gold" iconClass="w-3 h-3" />
          </span>
        </div>
      </div>

      <div className="px-4 pb-3 space-y-2">
        {market.options.map(opt => {
          const optTotal = bets.filter(b => b.option_id === opt.id).reduce((s, b) => s + b.amount, 0);
          const pct = totalPool > 0 ? Math.round((optTotal / totalPool) * 100) : 0;
          const odds = optTotal > 0 ? (totalPool * (1 - market.commission_pct / 100)) / optTotal : 0;
          const isYes = opt.kind === 'yes';
          const isNo = opt.kind === 'no';
          const colorClass = isYes
            ? 'bg-emerald-500/10 border-emerald-500/40 active:bg-emerald-500/20'
            : isNo
            ? 'bg-red-500/10 border-red-500/40 active:bg-red-500/20'
            : 'bg-card/40 border-white/10 active:bg-white/5';

          return (
            <button key={opt.id}
              onClick={() => market.status === 'open' && onBet(opt)}
              disabled={market.status !== 'open'}
              className={cn('relative w-full rounded-xl p-3 overflow-hidden border text-left transition-colors',
                colorClass, market.status !== 'open' && 'opacity-60 cursor-default')}>
              <div className={cn('absolute inset-y-0 left-0',
                isYes ? 'bg-emerald-500/15' : isNo ? 'bg-red-500/15' : 'bg-gold/10')}
                style={{ width: `${pct}%` }} />
              <div className="relative flex items-center justify-between gap-2">
                <span className={cn('font-bold text-sm', isYes && 'text-emerald-300', isNo && 'text-red-300')}>
                  {isYes && '✓ '}{isNo && '✗ '}{opt.label}
                </span>
                <div className="flex items-center gap-2 text-xs shrink-0">
                  <span className="text-muted">{optTotal > 0 ? `${pct}%` : '—'}</span>
                  {odds > 0 && (
                    <span className="font-mono font-bold text-gold bg-black/40 px-2 py-0.5 rounded-md">x{odds.toFixed(2)}</span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="px-4 py-2 border-t border-white/5 flex items-center justify-between text-xs">
        <span className="text-muted">⏰ Закрытие: День {market.closes_on_day}</span>
        <button onClick={onComment} className="text-gold font-semibold flex items-center gap-1">
          💬 Комментарии · {(market.comments || []).length}
        </button>
      </div>
    </div>
  );
}

function BetModal({ market, option, onClose }: { market: PariMarket; option: PariOption; onClose: () => void }) {
  const { currentUser, notify } = useStore();
  const [amount, setAmount] = useState(1000);
  const [busy, setBusy] = useState(false);
  const sb = getSupabase();

  const place = async () => {
    if (!currentUser || !sb) return;
    if (amount < 1 || amount > currentUser.balance) {
      alert('Недостаточно средств');
      return;
    }
    setBusy(true);
    const newBet = {
      id: uid('bet'),
      option_id: option.id,
      participant_id: currentUser.id,
      amount,
      created_at: Date.now(),
    };
    const newBets = [...(market.bets || []), newBet];
    const { error } = await sb.from('pari').update({ bets: newBets }).eq('id', market.id);
    if (error) { setBusy(false); alert(error.message); return; }
    await sb.from('participants')
      .update({ balance: currentUser.balance - amount })
      .eq('id', currentUser.id);
    if (!market.is_anonymous && market.creator_id !== currentUser.id) {
      await notify(market.creator_id, {
        type: 'bet_placed',
        title: 'Новая ставка на ваше пари',
        body: `${currentUser.display_name} поставил ${amount.toLocaleString('ru-RU')} ейнов`,
        link_url: '/pari',
      });
    }
    setBusy(false);
    onClose();
  };

  const isYes = option.kind === 'yes';
  const isNo = option.kind === 'no';

  return (
    <Modal onClose={onClose}>
      <div className="text-[10px] uppercase tracking-widest text-gold/70 mb-1">{market.title}</div>
      <h3 className={cn('font-heading text-xl font-bold mb-3',
        isYes && 'text-emerald-300', isNo && 'text-red-300')}>
        Ставка: {isYes && '✓ '}{isNo && '✗ '}{option.label}
      </h3>
      <div className="glass p-3 mb-3 text-center">
        <div className="text-[10px] text-muted uppercase tracking-widest mb-1">Сумма ставки</div>
        <div className="flex items-center justify-center gap-2">
          <YenIcon className="w-6 h-6" />
          <input type="number" value={amount} onChange={e => setAmount(Math.max(0, Number(e.target.value)))}
            min={1} max={currentUser?.balance || 0}
            className="bg-transparent text-2xl font-mono font-bold text-gold text-center w-32 outline-none" />
        </div>
        {currentUser && (
          <div className="text-[10px] text-muted mt-1">
            Доступно: <Yen amount={currentUser.balance} className="text-xs text-gold" iconClass="hidden" />
          </div>
        )}
      </div>
      <input type="range" min={1} max={Math.min(currentUser?.balance || 1000, 5_000_000)} step={1000}
        value={amount} onChange={e => setAmount(Number(e.target.value))}
        className="w-full accent-gold mb-3" />
      <div className="grid grid-cols-4 gap-1.5 mb-4">
        {[1_000, 10_000, 100_000, 500_000].map(v => (
          <button key={v} onClick={() => setAmount(v)}
            className="px-2 py-2 text-[11px] rounded-lg bg-card/60 border border-white/8 active:bg-white/5 font-mono">
            {v >= 1000 ? `${v / 1000}K` : v}
          </button>
        ))}
      </div>
      <div className="text-[10px] text-muted text-center mb-3">
        Комиссия создателя: <strong className="text-gold">{market.commission_pct}%</strong>
      </div>
      <div className="flex gap-2">
        <button onClick={onClose} className="btn-secondary flex-1">Отмена</button>
        <button onClick={place} disabled={busy} className={cn('flex-1',
          isYes ? 'btn-success' : isNo ? 'btn-danger' : 'btn-primary')}>
          {busy ? '...' : 'Поставить'}
        </button>
      </div>
    </Modal>
  );
}

function CommentsModal({ market, onClose }: { market: PariMarket; onClose: () => void }) {
  const { state, currentUser } = useStore();
  const [text, setText] = useState('');
  const [anon, setAnon] = useState(false);
  const [busy, setBusy] = useState(false);
  const sb = getSupabase();

  const send = async () => {
    if (!text.trim() || !currentUser || !sb) return;
    setBusy(true);
    const newComment = {
      id: uid('cmt'),
      participant_id: currentUser.id,
      is_anonymous: anon,
      text: text.trim(),
      created_at: Date.now(),
    };
    const newComments = [...(market.comments || []), newComment];
    await sb.from('pari').update({ comments: newComments }).eq('id', market.id);
    setText('');
    setBusy(false);
  };

  return (
    <Modal onClose={onClose} title={`💬 Комментарии · ${(market.comments || []).length}`}>
      <div className="text-xs text-muted-foreground mb-3 truncate">{market.title}</div>
      <div className="max-h-72 overflow-y-auto space-y-2 mb-3">
        {(market.comments || []).length === 0 ? (
          <p className="text-sm text-muted text-center py-4">Пока без комментариев.</p>
        ) : (market.comments || []).map(c => {
          const author = c.is_anonymous ? null : state.participants.find(p => p.id === c.participant_id);
          return (
            <div key={c.id} className="glass p-2.5 flex gap-2">
              {author ? <CharacterIcon participant={author} size="xs" ringless /> : (
                <div className="w-7 h-7 rounded-full bg-card border border-white/10 flex items-center justify-center text-xs">?</div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold truncate">{c.is_anonymous ? 'Аноним' : (author?.display_name || '—')}</span>
                  <span className="text-[10px] text-muted">{timeAgo(c.created_at)}</span>
                </div>
                <p className="text-xs text-foreground/90 mt-0.5">{c.text}</p>
              </div>
            </div>
          );
        })}
      </div>
      {currentUser ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input value={text} onChange={e => setText(e.target.value)}
              placeholder="Ваш комментарий..." className="input-field flex-1"
              onKeyDown={e => e.key === 'Enter' && send()} />
            <button onClick={send} disabled={busy || !text.trim()} className="btn-primary px-4" title="Отправить">📤</button>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={anon} onChange={e => setAnon(e.target.checked)} className="w-4 h-4 accent-gold" />
            <span>Анонимно</span>
          </label>
        </div>
      ) : (
        <div className="text-xs text-center text-muted">Войдите, чтобы оставлять комментарии.</div>
      )}
    </Modal>
  );
}

function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title?: string }) {
  return (
    <div className="fixed inset-0 z-[55] flex items-end sm:items-center justify-center p-3">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative glass-strong w-full max-w-md p-4 sm:p-5 max-h-[85vh] overflow-y-auto animate-slide-up rounded-2xl">
        {title && (
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-heading text-lg font-bold">{title}</h3>
            <button onClick={onClose} className="btn-icon" aria-label="Закрыть">✕</button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
