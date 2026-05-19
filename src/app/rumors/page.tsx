'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useStore } from '@/lib/store/StoreProvider';
import { CharacterIcon } from '@/components/ui/CharacterIcon';
import { cn, timeAgo, uid } from '@/lib/utils';

export default function RumorsPage() {
  const { state, currentUser, dispatch } = useStore();
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [anon, setAnon] = useState(false);

  const submit = () => {
    if (!currentUser || !title.trim() || !text.trim()) return;
    dispatch({
      type: 'add_rumor',
      rumor: {
        id: uid('r'),
        author_id: currentUser.id,
        is_anonymous: anon,
        title: title.trim(),
        text: text.trim(),
        truth_level: 'unknown',
        created_at: Date.now(),
      },
    });
    setTitle(''); setText(''); setAnon(false); setComposing(false);
  };

  return (
    <div className="px-3 sm:px-4 py-4 max-w-2xl mx-auto space-y-4 animate-fade-in">
      <div className="relative glass-strong p-5 overflow-hidden border border-purple-500/20">
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-purple-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="relative">
          <div className="text-[10px] font-bold uppercase tracking-widest text-purple-300/70 mb-1">👁️ Шёпот в коридорах</div>
          <h1 className="font-heading text-xl font-bold text-purple-200">Слухи Академии</h1>
          <p className="text-xs text-muted-foreground mt-1">Каждый шёпот меняет картину. Что из этого правда?</p>
        </div>
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
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Заголовок слуха..."
            className="input-field"
          />
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Текст слуха..."
            className="input-field min-h-[100px] resize-none"
          />
          <label className="flex items-center gap-3 p-3 rounded-xl bg-card/40 border border-white/8">
            <input type="checkbox" checked={anon} onChange={e => setAnon(e.target.checked)} className="w-4 h-4 accent-gold" />
            <span className="text-sm">Опубликовать анонимно</span>
          </label>
          <button onClick={submit} disabled={!title.trim() || !text.trim()} className="btn-primary w-full">
            🗣️ Опубликовать
          </button>
        </div>
      )}

      <div className="space-y-3">
        {state.rumors.length === 0 ? (
          <div className="glass p-6 text-center">
            <div className="text-3xl mb-2 opacity-30">👁️</div>
            <p className="text-sm text-muted-foreground">Слухов пока нет.</p>
          </div>
        ) : state.rumors.map(r => {
          const author = r.is_anonymous ? null : state.participants.find(p => p.id === r.author_id);
          return (
            <div key={r.id} className="glass p-4 border-l-4 border-purple-500/40">
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="font-heading font-bold text-base flex-1">{r.title}</h3>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{r.text}</p>
              <div className="mt-3 flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-1.5 text-muted">
                  {r.is_anonymous ? (
                    <>
                      <span className="w-5 h-5 rounded-full bg-card border border-white/10 flex items-center justify-center text-[10px]">?</span>
                      <span>Аноним</span>
                    </>
                  ) : author ? (
                    <>
                      <CharacterIcon participant={author} size="xs" ring={false} />
                      <span>{author.display_name}</span>
                    </>
                  ) : null}
                  <span>·</span>
                  <span>{timeAgo(r.created_at)}</span>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-300 border border-yellow-500/20 font-bold">
                  ???
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
