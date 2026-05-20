'use client';

import { useStore } from '@/lib/store/StoreProvider';

const FALLBACK = [
  { title: '⚖️ Ставки и условия', body: 'Все условия фиксируются до старта. Изменить нельзя.' },
  { title: '🔗 Питомцы', body: 'Игровая роль, не способ унижать игрока. Условия выкупа определяет Хозяин.' },
  { title: '🛡️ Честная игра', body: 'Все случайные исходы — серверная генерация. Подделка результатов = штраф.' },
];

export default function RulesPage() {
  const { state } = useStore();
  const blocks = state.content.filter(c => c.page === 'rules').sort((a, b) => a.sort_order - b.sort_order);
  const showFallback = blocks.length === 0;

  return (
    <div className="px-3 sm:px-4 py-4 max-w-2xl mx-auto space-y-4 animate-fade-in">
      <div className="glass-strong gold-border p-5">
        <div className="text-[10px] uppercase tracking-widest text-gold/70 mb-1">⚖️ Кодекс</div>
        <h1 className="font-heading text-2xl font-bold text-gradient-gold">Правила Академии</h1>
        <p className="text-xs text-muted-foreground mt-1">Соблюдение — основа игры. Нарушение — наказуемо.</p>
      </div>

      {(showFallback ? FALLBACK : blocks).map((b, i) => (
        <div key={i} className="glass p-4">
          <h3 className="section-title text-sm mb-2">{b.title}</h3>
          <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">{b.body}</p>
        </div>
      ))}

      {showFallback && (
        <div className="glass p-3 text-xs text-muted-foreground">
          Ведущий может добавить свои правила в админке (Контент).
        </div>
      )}
    </div>
  );
}
