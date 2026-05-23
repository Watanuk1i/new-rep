'use client';

// Слухи v2: цель + тип (положительный/отрицательный) + лайк/дизлайк +
// закрытие Селестией с применением репутации.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useStore, uid } from '@/lib/store/StoreProvider';
import { CharacterIcon } from '@/components/ui/CharacterIcon';
import { cn, timeAgo, isPlayer } from '@/lib/utils';
import { getSupabase } from '@/lib/supabase/client';
import type { Rumor } from '@/lib/store/types';

type RumorType = 'positive' | 'negative';
type RumorFinal = 'positive' | 'negative' | 'neutral';

interface RumorVote {
  participant_id: string;
  vote: 'like' | 'dislike';
}

export default function RumorsPage() {
  const { state, currentUser, role } = useStore();
  const [tab, setTab] = useState<'active' | 'mine' | 'closed'>('active');
  const [composing, setComposing] = useState(false);
  const [commenting, setCommenting] = useState<Rumor | null>(null);
  const [closing, setClosing] = useState<Rumor | null>(null);
  const sb = getSupabase();
  const isAdmin = role === 'gm' || role === 'queen';

  const filtered = state.rumors.filter(r => {
    if (tab === 'active') return r.status === 'active';
    if (tab === 'closed') return r.status === 'closed';
    if (tab === 'mine' && currentUser) return r.author_id === currentUser.id;
    return true;
  });

  return (
    <div className="px-3 sm:px-4 py-4 max-w-2xl mx-auto space-y-4 animate-fade-in">
      <div className="relative glass-strong p-5 overflow-hidden border border-purple-500/20">
        <div className="text-[10px] font-bold uppercase tracking-widest text-purple-300/70 mb-1">👁️ Шёпот в коридорах</div>
        <h1 className="font-heading text-xl font-bold text-purple-200">Слухи Академии</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Слух не меняет репутацию сразу. Селестия закрывает слух и решает итог.
        </p>
      </div>

      {currentUser ? (
        <button onClick={() => setComposing(!composing)} className="btn-primary w-full">
          {composing ? '✕ Отмена' : '✍️ Создать слух'}
        </button>
      ) : (
        <Link href="/login" className="btn-secondary w-full">Войдите, чтобы писать слухи</Link>
      )}

      {composing && currentUser && (
        <ComposeRumor onDone={() => setComposing(false)} />
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
        ) : filtered.map(r => (
          <RumorCard key={r.id} rumor={r} isAdmin={isAdmin}
            onComment={() => setCommenting(r)}
            onClose={() => setClosing(r)} />
        ))}
      </div>

      {commenting && <RumorCommentsModal rumor={commenting} onClose={() => setCommenting(null)} />}
      {closing && <CloseRumorModal rumor={closing} onClose={() => setClosing(null)} />}
    </div>
  );
}

// =====================================================================
// Создание слуха
// =====================================================================

function ComposeRumor({ onDone }: { onDone: () => void }) {
  const { state, currentUser } = useStore();
  const sb = getSupabase();
  const [targetId, setTargetId] = useState('');
  const [rumorType, setRumorType] = useState<RumorType>('positive');
  const [text, setText] = useState('');
  const [anon, setAnon] = useState(false);
  const [busy, setBusy] = useState(false);

  const targets = state.participants.filter(p =>
    isPlayer(p) && p.is_active && p.id !== currentUser?.id
  );

  const submit = async () => {
    if (!sb || !currentUser || !targetId || !text.trim()) return;
    setBusy(true);
    const target = state.participants.find(p => p.id === targetId);
    const id = uid('r');
    const title = `${rumorType === 'positive' ? '☆' : '✗'} Слух о ${target?.display_name ?? ''}`;
    await sb.from('rumors').insert({
      id, author_id: currentUser.id, is_anonymous: anon,
      title,
      text: text.trim(),
      truth_level: rumorType === 'positive' ? 'true' : 'false', // храним тип в truth_level
      target_player_id: targetId,
      initial_type: rumorType,
      status: 'active',
      closes_on_day: null,
      comments: [],
      // Используем структуру { true: [], false: [] } для совместимости со старым типом.
      // true = like, false = dislike — голос игрока.
      votes: { true: [], false: [] },
    });
    // Уведомление цели + всем активным
    const everyone = state.participants.filter(p =>
      isPlayer(p) && p.is_active && p.id !== currentUser.id
    );
    if (everyone.length > 0) {
      await sb.from('notifications').insert(everyone.map(t => ({
        id: uid('n'),
        recipient_id: t.id,
        type: 'rumor_new',
        title: `${rumorType === 'positive' ? '☆ Положительный' : '✗ Отрицательный'} слух`,
        body: `${anon ? 'Аноним' : currentUser.display_name} → ${target?.display_name ?? ''}`,
        link_url: '/rumors',
        is_read: false,
      })));
    }
    setBusy(false);
    onDone();
  };

  return (
    <div className="glass-strong p-4 space-y-3 animate-slide-down">
      <div>
        <label className="text-[10px] font-bold uppercase tracking-widest text-gold mb-1 block">Цель слуха</label>
        <select value={targetId} onChange={e => setTargetId(e.target.value)} className="input-field">
          <option value="">— выбрать игрока —</option>
          {targets.map(p => (
            <option key={p.id} value={p.id}>{p.display_name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-[10px] font-bold uppercase tracking-widest text-gold mb-1 block">Тип слуха</label>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setRumorType('positive')}
            className={cn('p-3 rounded-xl border text-sm font-bold',
              rumorType === 'positive'
                ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                : 'bg-card/40 border-white/8 text-muted-foreground')}>
            ☆ Положительный
          </button>
          <button onClick={() => setRumorType('negative')}
            className={cn('p-3 rounded-xl border text-sm font-bold',
              rumorType === 'negative'
                ? 'bg-red-500/15 border-red-500/50 text-red-300'
                : 'bg-card/40 border-white/8 text-muted-foreground')}>
            ✗ Отрицательный
          </button>
        </div>
      </div>

      <textarea value={text} onChange={e => setText(e.target.value)}
        placeholder="Текст слуха..." className="input-field min-h-[100px] resize-none" />

      <label className="flex items-center gap-3 p-3 rounded-xl bg-card/40 border border-white/8">
        <input type="checkbox" checked={anon} onChange={e => setAnon(e.target.checked)}
          className="w-4 h-4 accent-gold" />
        <span className="text-sm">Опубликовать анонимно</span>
      </label>

      <button onClick={submit} disabled={busy || !targetId || !text.trim()}
        className="btn-primary w-full">{busy ? '...' : '🗣️ Опубликовать'}</button>
    </div>
  );
}

// =====================================================================
// Карточка слуха
// =====================================================================

function RumorCard({
  rumor, isAdmin, onComment, onClose,
}: {
  rumor: Rumor & { target_player_id?: string; initial_type?: RumorType; final_result?: RumorFinal | null;
    reputation_delta_target?: number; reputation_delta_author?: number; close_comment?: string };
  isAdmin: boolean;
  onComment: () => void;
  onClose: () => void;
}) {
  const { state, currentUser } = useStore();
  const sb = getSupabase();

  const target = rumor.target_player_id
    ? state.participants.find(p => p.id === rumor.target_player_id)
    : null;
  const author = rumor.is_anonymous ? null : state.participants.find(p => p.id === rumor.author_id);
  const type: RumorType = rumor.initial_type ??
    (rumor.truth_level === 'false' ? 'negative' : 'positive');

  const likes = (rumor.votes?.true || []).length;
  const dislikes = (rumor.votes?.false || []).length;
  const myVote = currentUser && rumor.votes
    ? (rumor.votes.true.find(v => v.participant_id === currentUser.id) ? 'like'
      : rumor.votes.false.find(v => v.participant_id === currentUser.id) ? 'dislike'
      : null)
    : null;

  const reactionScore = likes - dislikes;
  const isClosed = rumor.status === 'closed';

  const vote = async (v: 'like' | 'dislike') => {
    if (!sb || !currentUser) return;
    const votes = rumor.votes || { true: [], false: [] };
    const already = (v === 'like' ? votes.true : votes.false)
      .find(x => x.participant_id === currentUser.id);
    // toggle: если уже стоит этот голос — снять
    const newVotes = {
      true: votes.true.filter(x => x.participant_id !== currentUser.id),
      false: votes.false.filter(x => x.participant_id !== currentUser.id),
    };
    if (!already) {
      (v === 'like' ? newVotes.true : newVotes.false).push({ participant_id: currentUser.id });
    }
    await sb.from('rumors').update({ votes: newVotes }).eq('id', rumor.id);
  };

  return (
    <div className={cn('glass p-4 border-l-4',
      isClosed ? 'border-gray-500/40' :
      type === 'positive' ? 'border-emerald-500/40' : 'border-red-500/40')}>
      <div className="flex items-start gap-3">
        {target && (
          <Link href={`/profile/${target.id}`} className="shrink-0">
            <CharacterIcon participant={target} size="md" ringless />
          </Link>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn('text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border',
              type === 'positive'
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                : 'bg-red-500/15 border-red-500/30 text-red-300')}>
              {type === 'positive' ? '☆ Положит.' : '✗ Отрицат.'}
            </span>
            {target && (
              <span className="text-[10px] text-muted-foreground">→ {target.display_name}</span>
            )}
            {isClosed && rumor.final_result && (
              <span className={cn('text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border',
                rumor.final_result === 'positive' && 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300',
                rumor.final_result === 'negative' && 'bg-red-500/15 border-red-500/30 text-red-300',
                rumor.final_result === 'neutral' && 'bg-gray-500/15 border-gray-500/30 text-gray-300',
              )}>
                итог: {rumor.final_result === 'positive' ? '☆' : rumor.final_result === 'negative' ? '✗' : '—'}
              </span>
            )}
          </div>
          <p className="text-sm mt-2 leading-relaxed whitespace-pre-line">{rumor.text}</p>
        </div>
      </div>

      {/* Голосование */}
      <div className="mt-3 flex items-center gap-2">
        <button onClick={() => vote('like')} disabled={!currentUser || isClosed}
          className={cn('flex-1 py-2 rounded-lg text-xs font-bold border',
            myVote === 'like'
              ? 'bg-emerald-500/30 border-emerald-500/60 text-emerald-200'
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
            (!currentUser || isClosed) && 'opacity-50')}>
          👍 {likes}
        </button>
        <button onClick={() => vote('dislike')} disabled={!currentUser || isClosed}
          className={cn('flex-1 py-2 rounded-lg text-xs font-bold border',
            myVote === 'dislike'
              ? 'bg-red-500/30 border-red-500/60 text-red-200'
              : 'bg-red-500/10 border-red-500/30 text-red-300',
            (!currentUser || isClosed) && 'opacity-50')}>
          👎 {dislikes}
        </button>
        <div className={cn('text-[10px] font-mono px-2',
          reactionScore > 0 ? 'text-emerald-300' :
          reactionScore < 0 ? 'text-red-300' : 'text-muted-foreground')}>
          {reactionScore > 0 ? '+' : ''}{reactionScore}
        </div>
      </div>

      {/* Итог закрытия */}
      {isClosed && rumor.close_comment && (
        <div className="mt-3 p-2 rounded-lg bg-card/40 border border-white/8">
          <div className="text-[10px] uppercase tracking-widest text-gold/70">Решение Селестии</div>
          <div className="text-xs whitespace-pre-line mt-1">{rumor.close_comment}</div>
          {(rumor.reputation_delta_target || rumor.reputation_delta_author) && (
            <div className="text-[10px] text-muted-foreground mt-1.5">
              {rumor.reputation_delta_target ? (
                <>Цель: <span className={rumor.reputation_delta_target > 0 ? 'text-emerald-300' : 'text-red-300'}>
                  {rumor.reputation_delta_target > 0 ? '+' : ''}{rumor.reputation_delta_target} реп.
                </span></>
              ) : null}
              {rumor.reputation_delta_target && rumor.reputation_delta_author ? ' · ' : ''}
              {rumor.reputation_delta_author ? (
                <>Автор: <span className={rumor.reputation_delta_author > 0 ? 'text-emerald-300' : 'text-red-300'}>
                  {rumor.reputation_delta_author > 0 ? '+' : ''}{rumor.reputation_delta_author} реп.
                </span></>
              ) : null}
            </div>
          )}
        </div>
      )}

      {/* Подвал */}
      <div className="mt-3 flex items-center justify-between text-[10px]">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          {rumor.is_anonymous ? (
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
          <span>{timeAgo(rumor.created_at)}</span>
        </div>
        <button onClick={onComment} className="text-gold font-semibold">
          💬 {(rumor.comments || []).length}
        </button>
      </div>

      {isAdmin && !isClosed && (
        <button onClick={onClose}
          className="text-[10px] text-amber-400 mt-2 inline-block hover:text-amber-300">
          ⚙️ Закрыть слух · решить итог
        </button>
      )}
    </div>
  );
}

// =====================================================================
// Закрытие слуха (только админ/Селестия)
// =====================================================================

function CloseRumorModal({ rumor, onClose }: { rumor: Rumor; onClose: () => void }) {
  const { state, currentUser } = useStore();
  const sb = getSupabase();
  const initialType: RumorType = (rumor as any).initial_type ??
    (rumor.truth_level === 'false' ? 'negative' : 'positive');
  const likes = (rumor.votes?.true || []).length;
  const dislikes = (rumor.votes?.false || []).length;
  const reactionScore = likes - dislikes;

  const [finalResult, setFinalResult] = useState<RumorFinal>('neutral');
  const [comment, setComment] = useState('');
  const [manualTarget, setManualTarget] = useState('');
  const [manualAuthor, setManualAuthor] = useState('');
  const [busy, setBusy] = useState(false);

  // Автоматический расчёт репутации по ТЗ
  const auto = useMemo(() => {
    const supported = reactionScore >= 3;
    const failed = reactionScore <= -3;
    if (initialType === 'positive') {
      if (finalResult === 'positive') {
        if (supported) return { target: +10, author: 0 };
        if (failed) return { target: -5, author: -5 };
        return { target: 0, author: 0 };
      }
      if (finalResult === 'negative') return { target: -5, author: -5 };
      return { target: 0, author: 0 }; // neutral
    } else {
      if (finalResult === 'negative') {
        if (supported) return { target: -10, author: 0 };
        if (failed) return { target: +5, author: -5 };
        return { target: 0, author: 0 };
      }
      if (finalResult === 'positive') return { target: +5, author: -5 };
      return { target: 0, author: 0 };
    }
  }, [initialType, finalResult, reactionScore]);

  const targetId = (rumor as any).target_player_id;
  const target = targetId ? state.participants.find(p => p.id === targetId) : null;
  const author = state.participants.find(p => p.id === rumor.author_id);

  const apply = async () => {
    if (!sb) return;
    setBusy(true);
    const link = '/rumors';
    const dT = manualTarget ? Number(manualTarget) : auto.target;
    const dA = manualAuthor ? Number(manualAuthor) : auto.author;
    // Применяем репутацию
    if (target && dT !== 0) {
      await sb.from('participants').update({
        reputation: Math.max(0, Math.min(100, target.reputation + dT)),
      }).eq('id', target.id);
    }
    if (author && dA !== 0) {
      await sb.from('participants').update({
        reputation: Math.max(0, Math.min(100, author.reputation + dA)),
      }).eq('id', author.id);
    }
    // Закрываем слух
    await sb.from('rumors').update({
      status: 'closed',
      final_result: finalResult,
      reputation_delta_target: dT,
      reputation_delta_author: dA,
      close_comment: comment.trim() || null,
      closed_by_id: currentUser?.id ?? null,
      closed_at: new Date().toISOString(),
    }).eq('id', rumor.id);
    // События / уведомления
    await sb.from('events').insert({
      id: uid('ev'),
      type: 'rumor_closed',
      title: `Слух закрыт: ${finalResult === 'positive' ? '☆ положительный' : finalResult === 'negative' ? '✗ отрицательный' : 'нейтральный'}`,
      body: `${target?.display_name ?? ''}: цель ${dT > 0 ? '+' : ''}${dT}, автор ${dA > 0 ? '+' : ''}${dA}`,
      link_url: link,
      is_for_gm_only: false,
    });
    if (target) {
      await sb.from('notifications').insert({
        id: uid('n'),
        recipient_id: target.id,
        type: 'rumor_closed',
        title: 'Слух о вас закрыт',
        body: `Итог: ${finalResult === 'positive' ? 'положительный' : finalResult === 'negative' ? 'отрицательный' : 'нейтральный'}. Репутация ${dT > 0 ? '+' : ''}${dT}.`,
        link_url: link, is_read: false,
      });
    }
    if (author && author.id !== target?.id) {
      await sb.from('notifications').insert({
        id: uid('n'),
        recipient_id: author.id,
        type: 'rumor_closed',
        title: 'Ваш слух закрыт',
        body: `Итог: ${finalResult}. Ваша репутация ${dA > 0 ? '+' : ''}${dA}.`,
        link_url: link, is_read: false,
      });
    }
    setBusy(false);
    onClose();
  };

  const cancelRumor = async () => {
    if (!sb) return;
    if (!confirm('Отменить слух? Репутация не изменится.')) return;
    await sb.from('rumors').update({
      status: 'closed', final_result: 'neutral',
      reputation_delta_target: 0, reputation_delta_author: 0,
      close_comment: 'Слух отменён.',
      closed_by_id: currentUser?.id ?? null,
      closed_at: new Date().toISOString(),
    }).eq('id', rumor.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[55] flex items-end sm:items-center justify-center p-3">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative glass-strong w-full max-w-md p-4 max-h-[85vh] overflow-y-auto rounded-2xl space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-heading text-lg font-bold">⚙️ Закрытие слуха</h3>
          <button onClick={onClose} className="btn-icon">✕</button>
        </div>

        <div className="text-xs text-muted-foreground p-2 rounded bg-card/40">
          {target?.display_name ?? '?'} ← {author?.display_name ?? 'Аноним'}<br/>
          Тип: <b>{initialType === 'positive' ? 'положительный' : 'отрицательный'}</b> ·
          {' '}Реакция: 👍{likes} 👎{dislikes} (баланс {reactionScore > 0 ? '+' : ''}{reactionScore})
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-widest text-gold/70 mb-1 block">Итог</label>
          <div className="grid grid-cols-3 gap-1.5">
            {(['positive', 'neutral', 'negative'] as RumorFinal[]).map(f => (
              <button key={f} onClick={() => setFinalResult(f)}
                className={cn('px-2 py-2 rounded-lg text-xs font-bold border',
                  finalResult === f
                    ? f === 'positive' ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                      : f === 'negative' ? 'bg-red-500/15 border-red-500/50 text-red-300'
                      : 'bg-gold/15 border-gold/50 text-gold'
                    : 'bg-card/40 border-white/8')}>
                {f === 'positive' ? '☆ Полож.' : f === 'negative' ? '✗ Отриц.' : '— Нейтр.'}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-muted-foreground">Реп. цели (авто {auto.target > 0 ? '+' : ''}{auto.target})</label>
            <input value={manualTarget} onChange={e => setManualTarget(e.target.value)}
              placeholder={String(auto.target)} className="input-field text-sm font-mono" />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">Реп. автора (авто {auto.author > 0 ? '+' : ''}{auto.author})</label>
            <input value={manualAuthor} onChange={e => setManualAuthor(e.target.value)}
              placeholder={String(auto.author)} className="input-field text-sm font-mono" />
          </div>
        </div>

        <textarea value={comment} onChange={e => setComment(e.target.value)}
          placeholder="Комментарий Селестии (необязательно)..."
          className="input-field min-h-[60px] resize-none text-sm" />

        <div className="grid grid-cols-2 gap-2">
          <button onClick={cancelRumor} className="btn-danger text-xs">Отменить слух</button>
          <button onClick={apply} disabled={busy} className="btn-primary text-xs">
            {busy ? '...' : 'Применить и закрыть'}
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// Комментарии — оптимистичное обновление
// =====================================================================

function RumorCommentsModal({ rumor, onClose }: { rumor: Rumor; onClose: () => void }) {
  const { state, currentUser } = useStore();
  const [text, setText] = useState('');
  const [anon, setAnon] = useState(false);
  const [busy, setBusy] = useState(false);
  // Локальный state списка комментариев для оптимистичного обновления.
  const [localComments, setLocalComments] = useState(rumor.comments || []);
  const sb = getSupabase();

  // Если из стора пришли свежие комментарии — обновляем локальный список
  useEffect(() => {
    setLocalComments(rumor.comments || []);
  }, [rumor.id, rumor.comments?.length]);

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
    // 1) сразу добавляем в локальный state — пользователь видит коммент мгновенно
    const next = [...localComments, newComment];
    setLocalComments(next);
    setText('');
    // 2) пишем в БД
    const { error } = await sb.from('rumors').update({ comments: next }).eq('id', rumor.id);
    if (error) {
      // откатить
      setLocalComments(localComments);
      alert('Не удалось отправить комментарий: ' + error.message);
    }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-[55] flex items-end sm:items-center justify-center p-3">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative glass-strong w-full max-w-md p-4 max-h-[85vh] overflow-y-auto animate-slide-up rounded-2xl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-heading text-lg font-bold">💬 Комментарии · {localComments.length}</h3>
          <button onClick={onClose} className="btn-icon">✕</button>
        </div>
        <div className="text-xs text-muted-foreground mb-3 truncate">{rumor.title}</div>
        <div className="max-h-72 overflow-y-auto space-y-2 mb-3">
          {localComments.length === 0 ? (
            <p className="text-sm text-muted text-center py-4">Пока без комментариев.</p>
          ) : localComments.map(c => {
            const author = c.is_anonymous ? null : state.participants.find(p => p.id === c.participant_id);
            return (
              <div key={c.id} className="glass p-2.5 flex gap-2">
                {author ? <CharacterIcon participant={author} size="xs" ringless /> : (
                  <div className="w-7 h-7 rounded-full bg-card border border-white/10 flex items-center justify-center text-xs">?</div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold truncate">
                      {c.is_anonymous ? 'Аноним' : (author?.display_name || '—')}
                    </span>
                    <span className="text-[10px] text-muted">{timeAgo(c.created_at)}</span>
                  </div>
                  <p className="text-xs text-foreground/90 mt-0.5 whitespace-pre-line">{c.text}</p>
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
