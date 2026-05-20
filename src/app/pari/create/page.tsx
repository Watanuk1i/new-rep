'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useStore, uid } from '@/lib/store/StoreProvider';
import { cn } from '@/lib/utils';
import { getSupabase } from '@/lib/supabase/client';

export default function CreatePariPage() {
  const { state, currentUser, addEvent } = useStore();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<'yesno' | 'custom'>('yesno');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [closesOnDay, setClosesOnDay] = useState(2);
  const [commission, setCommission] = useState(5);
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);
  const sb = getSupabase();

  const canSubmit = title.trim() && (kind === 'yesno' || options.filter(o => o.trim()).length >= 2);

  const submit = async () => {
    if (!canSubmit || !currentUser || !sb) return;
    setBusy(true);
    const opts = kind === 'yesno'
      ? [
          { id: uid('opt'), label: 'Да', kind: 'yes' as const },
          { id: uid('opt'), label: 'Нет', kind: 'no' as const },
        ]
      : options.filter(o => o.trim()).map(label => ({ id: uid('opt'), label, kind: 'custom' as const }));

    const id = uid('pari');
    const { error } = await sb.from('pari').insert({
      id, creator_id: currentUser.id, is_anonymous: anonymous,
      title: title.trim(), description: description.trim() || null,
      options: opts, bets: [], comments: [],
      commission_pct: commission, closes_on_day: closesOnDay, status: 'open',
    });
    if (error) { setBusy(false); alert(error.message); return; }

    // Уведомление всем
    const targets = state.participants.filter(p =>
      p.status !== 'gm' && p.id !== currentUser.id && p.is_active
    );
    if (targets.length > 0) {
      await sb.from('notifications').insert(targets.map(t => ({
        id: uid('n'),
        recipient_id: t.id,
        type: 'pari_new',
        title: 'Новое пари',
        body: title.trim().slice(0, 80),
        link_url: '/pari',
        is_read: false,
      })));
    }
    setBusy(false);
    router.push('/pari');
  };

  const updateOpt = (i: number, v: string) => {
    const arr = [...options]; arr[i] = v; setOptions(arr);
  };

  if (!currentUser) {
    return (
      <div className="px-4 py-12 text-center">
        <Link href="/login" className="btn-primary inline-flex">Войти</Link>
      </div>
    );
  }

  return (
    <div className="px-3 sm:px-4 py-4 max-w-md mx-auto space-y-4 animate-fade-in">
      <div className="glass p-4 space-y-3">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-gold mb-1 block">Заголовок пари</label>
          <input type="text" value={title} onChange={e => setTitle(e.target.value)}
            placeholder="Например: Чихиро признается до конца дня?" className="input-field" />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-muted mb-1 block">Описание (опц.)</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Контекст и условия..." className="input-field min-h-[80px] resize-none" />
        </div>
      </div>

      <div className="glass p-4 space-y-3">
        <label className="text-[10px] font-bold uppercase tracking-widest text-gold mb-1 block">Варианты ответа</label>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setKind('yesno')}
            className={cn('p-3 rounded-xl border text-center text-sm font-bold active:scale-95',
              kind === 'yesno' ? 'bg-gold/15 border-gold/50 text-gold' : 'bg-card/40 border-white/8')}>
            <div className="text-emerald-400">✓ Да</div>
            <div className="text-red-400">✗ Нет</div>
          </button>
          <button onClick={() => setKind('custom')}
            className={cn('p-3 rounded-xl border text-center text-sm font-bold active:scale-95',
              kind === 'custom' ? 'bg-gold/15 border-gold/50 text-gold' : 'bg-card/40 border-white/8')}>
            <div className="text-base">📝</div>
            <div>Свои варианты</div>
          </button>
        </div>

        {kind === 'custom' && (
          <div className="space-y-2 pt-2">
            {options.map((opt, i) => (
              <div key={i} className="flex gap-2">
                <div className="w-9 h-11 rounded-xl bg-card/60 border border-white/8 flex items-center justify-center text-xs font-bold text-gold/70 shrink-0">
                  {String.fromCharCode(65 + i)}
                </div>
                <input type="text" value={opt} onChange={e => updateOpt(i, e.target.value)}
                  placeholder={`Вариант ${i + 1}`} className="input-field flex-1" />
                {options.length > 2 && (
                  <button onClick={() => setOptions(options.filter((_, j) => j !== i))}
                    className="btn-icon text-red-400">✕</button>
                )}
              </div>
            ))}
            {options.length < 6 && (
              <button onClick={() => setOptions([...options, ''])}
                className="text-sm text-gold w-full py-2 rounded-xl border border-dashed border-gold/30 active:bg-gold/5">
                + Добавить вариант
              </button>
            )}
          </div>
        )}
      </div>

      <div className="glass p-4 space-y-4">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-gold mb-1 flex items-center justify-between">
            <span>День закрытия</span>
            <span className="font-mono text-sm normal-case tracking-normal">День {closesOnDay}</span>
          </label>
          <input type="number" min={1} max={99} value={closesOnDay}
            onChange={e => setClosesOnDay(Math.max(1, Math.min(99, Number(e.target.value))))}
            className="input-field font-mono" />
          <p className="text-[10px] text-muted mt-1">
            После наступления дня пари переходит в «Ожидание подтверждения» (ведущий или Селестия решит итог).
          </p>
        </div>

        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-gold mb-1 flex items-center justify-between">
            <span>Комиссия (вам)</span>
            <span className="font-mono text-sm normal-case tracking-normal">{commission}%</span>
          </label>
          <input type="range" min={0} max={30} step={1} value={commission}
            onChange={e => setCommission(Number(e.target.value))} className="w-full accent-gold" />
          <div className="flex justify-between text-[10px] text-muted mt-1">
            <span>0%</span><span>15%</span><span>30%</span>
          </div>
        </div>

        <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl bg-card/40 border border-white/8 active:bg-white/5">
          <input type="checkbox" checked={anonymous} onChange={e => setAnonymous(e.target.checked)}
            className="w-4 h-4 accent-gold" />
          <div className="flex-1">
            <div className="text-sm font-bold">Опубликовать анонимно</div>
            <div className="text-[10px] text-muted-foreground">Имя автора не покажется игрокам</div>
          </div>
        </label>
      </div>

      <button onClick={submit} disabled={!canSubmit || busy}
        className={cn('btn-primary w-full text-base', (!canSubmit || busy) && 'opacity-50')}>
        {busy ? 'Публикую...' : '💰 Опубликовать пари'}
      </button>
    </div>
  );
}
