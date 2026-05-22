'use client';

// Модалка перевода йен между игроками.
// Используется и как «свободный» перевод (recipient выбирается),
// и как «предвыбранный» (recipient передан из профиля/игры).

import { useEffect, useMemo, useState } from 'react';
import { useStore, uid } from '@/lib/store/StoreProvider';
import { CharacterIcon } from '@/components/ui/CharacterIcon';
import { Yen, YenIcon } from '@/components/ui/Yen';
import { cn, formatYenFull } from '@/lib/utils';
import { getSupabase } from '@/lib/supabase/client';
import { applyTransfer } from '@/lib/store/tx';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Получатель по умолчанию (например, из профиля) */
  recipientId?: string;
  /** Если перевод связан с конкретной игрой */
  relatedGameId?: string;
  /** Подсказка-комментарий по умолчанию */
  defaultComment?: string;
  onDone?: () => void;
}

const QUICK_AMOUNTS = [10_000, 50_000, 100_000, 500_000];

export function TransferModal({
  open,
  onClose,
  recipientId: initialRecipientId,
  relatedGameId,
  defaultComment = '',
  onDone,
}: Props) {
  const { state, currentUser, notify } = useStore();
  const sb = getSupabase();

  const [recipientId, setRecipientId] = useState(initialRecipientId || '');
  const [amount, setAmount] = useState<number>(10_000);
  const [comment, setComment] = useState(defaultComment);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Сбрасываем форму при открытии
  useEffect(() => {
    if (open) {
      setRecipientId(initialRecipientId || '');
      setAmount(10_000);
      setComment(defaultComment);
      setError(null);
      setBusy(false);
    }
  }, [open, initialRecipientId, defaultComment]);

  // Блок body scroll
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const candidates = useMemo(
    () => state.participants.filter(p =>
      p.status !== 'gm' && p.id !== currentUser?.id
    ),
    [state.participants, currentUser?.id],
  );

  const recipient = state.participants.find(p => p.id === recipientId);

  if (!open) return null;
  if (!currentUser) return null;

  const submit = async () => {
    setError(null);
    if (!recipientId) { setError('Укажите получателя'); return; }
    if (recipientId === currentUser.id) { setError('Нельзя переводить самому себе'); return; }
    if (!amount || amount <= 0) { setError('Сумма должна быть больше нуля'); return; }
    if (amount > currentUser.balance) { setError('Недостаточно средств'); return; }
    if (!comment.trim()) { setError('Комментарий обязателен'); return; }
    if (!sb) { setError('Нет связи с базой'); return; }
    if (!recipient) { setError('Получатель не найден'); return; }

    setBusy(true);

    // 1) Атомарный перевод через RPC: пишет history, при нехватке создаёт авто-долг.
    const tx = await applyTransfer(
      currentUser.id,
      recipient.id,
      amount,
      comment.trim(),
      '/transfers',
    );
    if (!tx.ok) {
      setError(tx.error || 'Не удалось выполнить перевод');
      setBusy(false);
      return;
    }

    // 2) Запись в transfers (отдельная таблица для ленты переводов)
    await sb.from('transfers').insert({
      id: uid('tr'),
      sender_id: currentUser.id,
      recipient_id: recipient.id,
      amount,
      comment: comment.trim(),
      related_game_id: relatedGameId || null,
    });

    // 3) Уведомление получателю
    await notify(recipient.id, {
      type: 'transfer_received',
      title: `${currentUser.display_name} перевёл вам ${formatYenFull(amount)} ейн`,
      body: comment.trim(),
      link_url: '/transfers',
    });

    setBusy(false);
    onDone?.();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-3"
      role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative glass-strong gold-border w-full max-w-md p-4 max-h-[88vh] overflow-y-auto rounded-2xl animate-slide-up">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-gold/70">💸 Перевод йен</div>
            <h2 className="font-heading text-xl font-bold text-gradient-gold leading-tight">
              Отправить ейны
            </h2>
          </div>
          <button onClick={onClose} className="btn-icon" aria-label="Закрыть">✕</button>
        </div>

        {/* Текущий баланс */}
        <div className="glass p-3 mb-3 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-widest text-muted">Ваш баланс</span>
          <Yen amount={currentUser.balance} full className="text-sm text-gold" iconClass="w-4 h-4" />
        </div>

        {/* Получатель */}
        {initialRecipientId && recipient ? (
          <div className="glass p-3 mb-3 flex items-center gap-3">
            <CharacterIcon participant={recipient} size="sm" />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-widest text-muted">Получатель</div>
              <div className="font-bold text-sm truncate">{recipient.display_name}</div>
            </div>
          </div>
        ) : (
          <div className="mb-3">
            <label className="text-[10px] font-bold uppercase tracking-widest text-gold mb-1 block">
              Получатель
            </label>
            <select
              value={recipientId}
              onChange={e => setRecipientId(e.target.value)}
              className="input-field"
            >
              <option value="">— выберите игрока —</option>
              {candidates.map(p => (
                <option key={p.id} value={p.id}>{p.display_name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Сумма */}
        <div className="mb-3">
          <label className="text-[10px] font-bold uppercase tracking-widest text-gold mb-1 block">
            Сумма (ейны)
          </label>
          <div className="flex items-center gap-2">
            <YenIcon className="w-5 h-5 shrink-0" />
            <input
              type="number"
              value={amount || ''}
              onChange={e => setAmount(Math.max(0, Number(e.target.value)))}
              className="input-field font-mono"
              min={1}
              max={currentUser.balance}
            />
          </div>
          <div className="grid grid-cols-4 gap-1.5 mt-2">
            {QUICK_AMOUNTS.map(v => (
              <button
                key={v}
                onClick={() => setAmount(v)}
                className={cn(
                  'px-2 py-2 text-[11px] rounded-lg border font-mono active:scale-95',
                  amount === v
                    ? 'bg-gold/15 border-gold/50 text-gold'
                    : 'bg-card/60 border-white/8',
                )}
              >
                {v >= 1e6 ? `${v / 1e6}M` : `${v / 1000}K`}
              </button>
            ))}
          </div>
        </div>

        {/* Комментарий */}
        <div className="mb-3">
          <label className="text-[10px] font-bold uppercase tracking-widest text-gold mb-1 block">
            Комментарий <span className="text-red-300 normal-case">*</span>
          </label>
          <textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="Например: «Покупка карты Камень в Карточном корабле»"
            className="input-field min-h-[64px] resize-none"
            maxLength={200}
          />
          <p className="text-[10px] text-muted mt-1">
            Комментарий обязателен и попадёт в историю обеих сторон.
          </p>
        </div>

        {error && (
          <div className="glass crimson-border p-2 mb-3 text-xs text-red-300 text-center">
            {error}
          </div>
        )}

        {/* Внутриигровой риск — напоминание */}
        <div className="text-[10px] text-muted leading-relaxed mb-3 bg-white/5 rounded-lg px-3 py-2 border border-white/5">
          ⚠️ Перевод не гарантирует встречного предмета. Если хотите безопасную сделку —
          используйте <b>Рынок игры</b>.
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button onClick={onClose} className="btn-secondary">Отмена</button>
          <button
            onClick={submit}
            disabled={busy}
            className={cn('btn-primary', busy && 'opacity-50')}
          >
            {busy ? '...' : '✓ Перевести'}
          </button>
        </div>
      </div>
    </div>
  );
}
