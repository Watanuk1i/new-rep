'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

const SECTIONS = [
  { id: '1', icon: '⚖️', title: 'Ставки и условия', text: 'Ставки имеют чёткие условия до начала. Условия не меняются после старта.' },
  { id: '2', icon: '📜', title: 'Долги и обязательства', text: 'Долг — кодекс чести. Отказ от выплаты — позор и штраф.' },
  { id: '3', icon: '🔗', title: 'Питомцы', text: 'Это игровая механика, а не унижение игрока. Условия выкупа определяются Хозяином.' },
  { id: '4', icon: '👑', title: 'Элита и Королева', text: 'Статусы Элита и Королева присваивает только Ведущий.', danger: false },
  { id: '5', icon: '🎭', title: 'Отыгрыш персонажа', text: 'Отыгрывайте характер. Спокойное «ну ладно» при потере статуса — нарушение духа игры.' },
  { id: '6', icon: '🛡️', title: 'Честная игра', text: 'Все бросы — серверные. Подделка результатов = штраф.' },
  { id: '7', icon: '💰', title: 'Пари', text: '• Условия не редактируются после первой ставки\n• Варианты ответа фиксируются\n• Срок закрытия — день\n• Решает Селестия или Ведущий\n• Все действия в журнале' },
];

export default function RulesPage() {
  const [openId, setOpenId] = useState<string | null>('1');

  return (
    <div className="px-3 sm:px-4 py-4 max-w-2xl mx-auto space-y-4 animate-fade-in">
      <div className="glass-strong gold-border p-5">
        <div className="text-[10px] uppercase tracking-widest text-gold/70 mb-1">⚖️ Кодекс</div>
        <h1 className="font-heading text-2xl font-bold text-gradient-gold">Правила Академии</h1>
        <p className="text-xs text-muted-foreground mt-1">Соблюдение — основа игры. Нарушение — наказуемо.</p>
      </div>

      <div className="space-y-2">
        {SECTIONS.map(s => {
          const open = openId === s.id;
          return (
            <div key={s.id} className={cn('glass overflow-hidden', open && 'gold-border')}>
              <button
                onClick={() => setOpenId(open ? null : s.id)}
                className="w-full p-4 flex items-center gap-3 text-left active:scale-[0.99]"
              >
                <div className="w-9 h-9 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center text-lg shrink-0">
                  {s.icon}
                </div>
                <div className="flex-1">
                  <div className="text-[10px] uppercase tracking-widest text-muted">Правило {s.id}</div>
                  <h3 className="font-heading font-bold text-base leading-tight">{s.title}</h3>
                </div>
                <svg className={cn('w-4 h-4 text-muted transition-transform', open && 'rotate-180')} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {open && (
                <div className="px-4 pb-4 animate-fade-in">
                  <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">{s.text}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
