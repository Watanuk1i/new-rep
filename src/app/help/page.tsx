'use client';

import { useStore } from '@/lib/store/StoreProvider';

const FALLBACK = [
  { title: '🎲 Как делать ставки', body: 'Зайдите в раздел «Пари» — выберите вариант → введите сумму → подтвердите.' },
  { title: '🔗 Как стать или взять Питомца', body: 'Через проигрыш в Большой игре или прямое соглашение. Условия выкупа определяет Хозяин.' },
  { title: '📜 Долги', body: 'Создайте запрос → вторая сторона подтверждает → деньги переводятся. Закрыть может любая сторона.' },
];

export default function HelpPage() {
  const { state } = useStore();
  const blocks = state.content.filter(c => c.page === 'help').sort((a, b) => a.sort_order - b.sort_order);
  const showFallback = blocks.length === 0;

  return (
    <div className="px-3 sm:px-4 py-4 max-w-2xl mx-auto space-y-4 animate-fade-in">
      <div className="glass-strong gold-border p-5">
        <div className="text-[10px] uppercase tracking-widest text-gold/70 mb-1">❔ Помощь</div>
        <h1 className="font-heading text-2xl font-bold text-gradient-gold">Как играть</h1>
        <p className="text-xs text-muted-foreground mt-1">Краткое руководство по Академии.</p>
      </div>

      {(showFallback ? FALLBACK : blocks).map((b, i) => (
        <div key={i} className="glass p-4">
          <h3 className="section-title text-sm mb-2">{b.title}</h3>
          <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">{b.body}</p>
        </div>
      ))}

      {showFallback && (
        <div className="glass p-3 text-xs text-muted-foreground">
          Ведущий может добавить свои блоки в админке (Контент).
        </div>
      )}
    </div>
  );
}
