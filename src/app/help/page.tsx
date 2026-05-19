'use client';

import Link from 'next/link';

export default function HelpPage() {
  return (
    <div className="px-3 sm:px-4 py-4 max-w-2xl mx-auto space-y-4 animate-fade-in">
      <div className="glass-strong gold-border p-5">
        <div className="text-[10px] uppercase tracking-widest text-gold/70 mb-1">❔ Помощь</div>
        <h1 className="font-heading text-2xl font-bold text-gradient-gold">Как играть</h1>
        <p className="text-xs text-muted-foreground mt-1">Краткое руководство по Академии.</p>
      </div>

      <Section title="🎲 Как делать ставки" items={[
        'Зайдите в раздел «Пари» — там список открытых ставок.',
        'Нажмите на нужный вариант — откроется окно ставки.',
        'Введите сумму и подтвердите. Сумма сразу спишется.',
        'После закрытия дня пари переходит в «Ожидание подтверждения». Решает Селестия или Ведущий.',
      ]} />

      <Section title="🔗 Как стать или взять Питомца" items={[
        'Питомцами становятся через проигрыш в Большой игре или прямое соглашение.',
        'Хозяин получает право давать поручения в рамках границ.',
        'Условия выкупа определяет Хозяин и фиксирует Ведущий.',
      ]} />

      <Section title="👑 Как попасть в Элиту" items={[
        'Войти в Элиту можно через победу в специальной игре «Башня статуса».',
        'Также Селестия может назначить Элиту своим решением.',
        'Элита получает золотой статус и доступ к особым событиям.',
      ]} />

      <Section title="📜 Долги" items={[
        'Возьмите долг у любого игрока в разделе «Долги».',
        'Срок — 1-4 день. Закрыть может должник или кредитор.',
        'Просроченный долг = штраф репутации.',
      ]} />

      <Section title="📨 Связь с Ведущим" items={[
        'Если возникает спор — нажмите «Позвать Ведущего» в карточке игрока.',
        'Ведущий получит уведомление с указанием от кого и причиной.',
      ]} />

      <div className="glass p-4 text-center">
        <p className="text-sm text-muted-foreground mb-3">Не нашли ответ?</p>
        <Link href="/rules" className="btn-outline inline-flex">⚖️ Открыть правила</Link>
      </div>
    </div>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="glass p-4">
      <h3 className="section-title text-sm mb-2">{title}</h3>
      <ul className="space-y-2 text-sm text-muted-foreground">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-gold mt-0.5">▸</span>
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
