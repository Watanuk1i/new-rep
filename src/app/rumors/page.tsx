'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useStore, uid } from '@/lib/store/StoreProvider';
import { CharacterIcon } from '@/components/ui/CharacterIcon';
import { cn, timeAgo, isPlayer } from '@/lib/utils';
import { getSupabase } from '@/lib/supabase/client';
import type { Rumor } from '@/lib/store/types';

export default function RumorsPage() {
  const { state, currentUser, role } = useStore();
  const [tab, setTab] = useState<'active' | 'mine' | 'closed'>('active');
  const [composing, setComposing] = useState(false);
  const [commenting, setCommenting] = useState<Rumor | null>(null);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [anon, setAnon] = useState(false);
  const [closesOnDay, setClosesOnDay] = useState<number | ''>('');
  const [busy, setBusy] = useState(false);
  const sb = getSupabase();
  const isAdmin = role === 'gm' || role === 'queen';

  const submit = async () => {
    if (!currentUser || !sb || !title.trim() || !text.trim()) return;
    setBusy(true);
    const id = uid('r');
    await sb.from('rumors').insert({
      id, author_id: currentUser.id, is_anonymous: anon,
      title: title.trim(), text: text.trim(), truth_level: 'unknown',
      status: 'active',
      closes_on_day: closesOnDay === '' ? null : Number(closesOnDay),
      comments: [], votes: { true: [], false: [] },
    });
    // Уведомление всем
    const targets = state.participants.filter(p =>
      isPlayer(p) && p.id !== currentUser.id && p.is_active
    );
    if (targets.length > 0) {
      await sb.from('notifications').insert(targets.map(t => ({
        id: uid('n'),
        recipient_id: t.id,
        type: 'rumor_new',
        title: 'Новый слух',
        body: title.trim().slice(0, 80),
        link_url: '/rumors',
        is_read: false,
      })));
    }
    setTitle(''); setText(''); setAnon(false); setClosesOnDay(''); setComposing(false);
    setBusy(false);
  };

  const filtered = state.rumors.filter(r => {
    if (tab === 'active') return r.status === 'active';
    if (tab === 'closed') return r.status === 'closed';
    if (tab === 'mine' && currentUser) return r.author_id === currentUser.id;
    return true;
  });

  const vote = async (rumor: Rumor, side: 'true' | 'false') => {
    if (!currentUser || !sb) return;
    const votes = rumor.votes || { true: [], false: [] };
    // Удаляем голос из обеих сторон, потом добавляем в нужную
    const newVotes = {
      true: votes.true.filter(v => v.participant_id !== currentUser.id),
      false: votes.false.filter(v => v.participant_id !== currentUser.id),
    };
    newVotes[side].push({ participant_id: currentUser.id });
    await sb.from('rumors').update({ votes: newVotes }).eq('id', rumor.id);
  };

  return (
    <div className="px-3 sm:px-4 py-4 max-w-2xl mx-auto space-y-4 animate-fade-in">
      <div className="relative glass-strong p-5 overflow-hidden border border-purple-500/20">
        <div className="text-[10px] font-bold uppercase tracking-widest text-purple-300/70 mb-1">👁️ Шёпот в коридорах</div>
        <h1 className="font-heading text-xl font-bold text-purple-200">Слухи Академии</h1>
        <p className="text-xs text-muted-foreground mt-1">Каждый шёпот меняет картину. Что из этого правда?</p>
      </div>

      {currentUser ? (
        <button onClick={() => setComposing(!composing)} className="btn-primary w-full">
          {composing ? '✕ Отмена' : '✍️ Написать слух'}
        </button>
      ) : (
        <Link href="/login" className="btn-secondary w-full">Войдите, чтобы писать слухи</Link>
      )}

      {composing && currentUser && (
        <div className="glass-strong p-4 space-y-3 animate-slide-down">
          <input value={title} onChange={e => setTitle(e.target.value)}
            placeholder="Заголовок слуха..." className="input-field" />
          <textarea value={text} onChange={e => setText(e.target.value)}
            placeholder="Текст слуха..." className="input-field min-h-[100px] resize-none" />
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-gold mb-1 block">
              Закрыть до (день, опц.)
            </label>
            <input type="number" min={1} max={99}
              value={closesOnDay === '' ? '' : closesOnDay}
              onChange={e => setClosesOnDay(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="Без закрытия" className="input-field" />
          </div>
          <label className="flex items-center gap-3 p-3 rounded-xl bg-card/40 border border-white/8">
            <input type="checkbox" checked={anon} onChange={e => setAnon(e.target.checked)}
              className="w-4 h-4 accent-gold" />
            <span className="text-sm">Опубликовать анонимно</span>
          </label>
          <button onClick={submit} disabled={busy || !title.trim() || !text.trim()}
            className="btn-primary w-full">{busy ? '...' : '🗣️ Опубликовать'}</button>
        </div>
      )}

      <div className="scroll-x">
        {[
          { key: 'active', label: 'Активные', icon: '🟢' },
          { key: 'closed', label: 'Закрытые', icon: '✓' },
          { key: 'mine', label: 'Свои', icon: '👤' },
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
            <div className="text-3xl mb-2 opacity-30">👁️</div>
            <p className="text-sm text-muted-foreground">Слухов нет.</p>
          </div>
        ) : filtered.map(r => {
          const author = r.is_anonymous ? null : state.participants.find(p => p.id === r.author_id);
          const trueVotes = (r.votes?.true || []).length;
          const falseVotes = (r.votes?.false || []).length;
          const myVote = currentUser && r.votes
            ? (r.votes.true.find(v => v.participant_id === currentUser.id) ? 'true'
              : r.votes.false.find(v => v.participant_id === currentUser.id) ? 'false' : null)
            : null;
          const totalVotes = trueVotes + falseVotes;
          const truePct = totalVotes ? Math.round((trueVotes / totalVotes) * 100) : 50;

          return (
            <div key={r.id} className={cn('glass p-4 border-l-4',
              r.status === 'closed' ? 'border-gray-500/40 opacity-70' : 'border-purple-500/40')}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="font-heading font-bold text-base flex-1">{r.title}</h3>
                {r.closes_on_day && (
                  <span className="text-[10px] text-muted bg-card/60 px-2 py-0.5 rounded-full">
                    до Д{r.closes_on_day}
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{r.text}</p>

              {r.status === 'active' && (
                <div className="mt-3">
                  <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Голосование</div>
                  <div className="flex gap-2 mb-2">
                    <button onClick={() => vote(r, 'true')} disabled={!currentUser}
                      className={cn('flex-1 py-2 rounded-lg text-xs font-bold border',
                        myVote === 'true' ? 'bg-emerald-500/30 border-emerald-500/60 text-emerald-200'
                          : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300')}>
                      ✓ Правда · {trueVotes}
                    </button>
                    <button onClick={() => vote(r, 'false')} disabled={!currentUser}
                      className={cn('flex-1 py-2 rounded-lg text-xs font-bold border',
                        myVote === 'false' ? 'bg-red-500/30 border-red-500/60 text-red-200'
                          : 'bg-red-500/10 border-red-500/30 text-red-300')}>
                      ✗ Ложь · {falseVotes}
                    </button>
                  </div>
                  <div className="h-1 bg-black/40 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 transition-all" style={{ width: `${truePct}%` }} />
                  </div>
                </div>
              )}

              <div className="mt-3 flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-1.5 text-muted">
                  {r.is_anonymous ? (
                    <>
                      <span className="w-5 h-5 rounded-full bg-card border border-white/10 flex items-center justify-center text-[10px]">?</span>
                      <span>Аноним</span>
                    </>
                  ) : author ? (
                    <>
                      <CharacterIcon participant={author} size="xs" ringless />
                      <span>{author.display_name}</span>
                    </>
                  ) : null}
                  <span>·</span>
                  <span>{timeAgo(r.created_at)}</span>
                </div>
                <button onClick={() => setCommenting(r)} className="text-gold font-semibold">
                  💬 {(r.comments || []).length}
                </button>
              </div>
              {isAdmin && r.status === 'active' && (
                <button
                  onClick={async () => {
                    if (!sb) return;
                    if (confirm('Закрыть слух?')) {
                      await sb.from('rumors').update({ status: 'closed' }).eq('id', r.id);
                    }
                  }}
                  className="text-[10px] text-amber-400 mt-2 inline-block">
                  ⚙️ Закрыть слух
                </button>
              )}
            </div>
          );
        })}
      </div>

      {commenting && <RumorCommentsModal rumor={commenting} onClose={() => setCommenting(null)} />}
    </div>
  );
}

function RumorCommentsModal({ rumor, onClose }: { rumor: Rumor; onClose: () => void }) {
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
    await sb.from('rumors').update({
      comments: [...(rumor.comments || []), newComment],
    }).eq('id', rumor.id);
    setText(''); setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-[55] flex items-end sm:items-center justify-center p-3">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative glass-strong w-full max-w-md p-4 max-h-[85vh] overflow-y-auto animate-slide-up rounded-2xl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-heading text-lg font-bold">💬 Комментарии</h3>
          <button onClick={onClose} className="btn-icon">✕</button>
        </div>
        <div className="text-xs text-muted-foreground mb-3 truncate">{rumor.title}</div>
        <div className="max-h-72 overflow-y-auto space-y-2 mb-3">
          {(rumor.comments || []).length === 0 ? (
            <p className="text-sm text-muted text-center py-4">Пока без комментариев.</p>
          ) : (rumor.comments || []).map(c => {
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
              <button onClick={send} disabled={busy || !text.trim()} className="btn-primary px-4">📤</button>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={anon} onChange={e => setAnon(e.target.checked)} className="w-4 h-4 accent-gold" />
              <span>Анонимно</span>
            </label>
          </div>
        ) : (
          <div className="text-xs text-center text-muted">Войдите, чтобы оставлять комментарии.</div>
        )}
      </div>
    </div>
  );
}
