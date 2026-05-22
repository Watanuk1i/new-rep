'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useStore } from '@/lib/store/StoreProvider';
import { cn } from '@/lib/utils';

const GAME_TYPES = [
  { type: 'card_ship', label: 'Карточный корабль', desc: 'Камень-Ножницы-Бумага, сделки и блеф', count: '8-14', rules: 'Каждый игрок получает 9 карт (3 Камень, 3 Ножницы, 3 Бумага) и 3 звезды.\nЦель: к концу игры — 0 карт в руке и минимум 3 звезды.\nВ дуэли: тайный выбор → раскрытие → победитель забирает звезду у проигравшего, обе карты сгорают.\nДополнительно — рынок игры: можно продавать и покупать карты и звёзды за ейны.\nВыжившие делят банк поровну.', isLive: true },
  { type: 'minority_rule', label: 'Правило меньшинства', desc: 'Голосуйте за меньшинство', count: '2-10', rules: 'Каждый раунд один из игроков задаёт вопрос «да/нет». Все живые голосуют. Кто в большинстве — выбывают, кто в меньшинстве — остаются. Не проголосовал — штраф 100k и выбыл. При ничьей никто не выбывает. Последний выживший забирает банк.', isLive: true },
  { type: 'nine_bullets', label: 'Комната девяти патронов', desc: '3 раунда, барабан, 9 мест', count: '7+', rules: '3 раунда. В каждом — Заряжающий, Стрелок и 5 Сидящих. Заряжающий тайно ставит 3 красных и 6 синих. Сидящие покупают места слепым аукционом, остальные — манекены. Стрелок может поменять две цели за 100k. Затем 9 выстрелов по местам. Деньги идут напрямую между игроками или через Казну (за манекенов).', isLive: true },
  { type: 'royal_roulette', label: 'Королевская рулетка', desc: 'Селестия + 4 игрока · 5 раундов', count: '5', rules: 'Личная игра Селестии. Селестия + 4 игрока. Взнос: 250k от игрока, 1M от Селестии — банк 2M.\n5 раундов: тайный выбор ставки (Безопасная / Рискованная / Королевская) и розыгрыш рулетки на 12 секторов.\nСектора: Безопасная (4), Рискованная (3), Королевская (2), Налог студсовета (2), Корона (1).\nСелестия не может выбирать Безопасную ставку и один раз за игру может посмотреть выбор одного игрока («Королевский взгляд»).\nПобеждает участник с наибольшей чистой прибылью — забирает банк.', isLive: true },
  { type: 'collar', label: 'Игра ошейника', desc: 'Бой за свободу или ошейник', count: '2-4', rules: '2-4 игрока. Раунды на смекалку. Проигравший — Питомец.' },
  { type: 'rumor_pandemic', label: 'Пандемия слухов', desc: 'Кто запустит самый громкий слух', count: '5+', rules: 'Каждый день один слух. Голосование за самый правдоподобный.' },
  { type: 'musical_thrones', label: 'Музыкальные троны', desc: 'Не остаться без места', count: '4-8', rules: 'Очко тому, кто сядет на трон по сигналу.' },
  { type: 'smuggling', label: 'Контрабанда', desc: 'Пронеси и не попадись', count: '3-6', rules: 'Игроки прячут предметы. Стража ищет.' },
  { type: 'status_tower', label: 'Башня статуса', desc: 'Поднимайся по иерархии', count: '5-8', rules: 'Победитель раунда поднимается. Вершина — Элита.' },
  { type: 'mirror_lies', label: 'Зеркало лжи', desc: 'Угадай правду из лжи', count: '2-6', rules: 'Каждый говорит 3 вещи (1 ложь). Угадай.' },
  { type: 'hope_cage', label: 'Клетка надежды', desc: 'Выберись или сдайся', count: '1', rules: 'Психологическое испытание. Реальные ставки.' },
  { type: 'queen_throne', label: 'Трон Селестии', desc: 'Свержение королевы', count: '3-5', rules: 'Только с разрешения Селестии. Победитель занимает трон.' },
  { type: 'emperor', label: 'Император, гражданин, раб', desc: 'Карты решают иерархию', count: '4', rules: 'Карточная иерархия. Раб платит дань Императору.' },
];

export default function SuperGamesPage() {
  const { state, role } = useStore();
  const [tab, setTab] = useState<'upcoming' | 'live' | 'archive'>('upcoming');
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const isAdmin = role === 'gm' || role === 'queen' || role === 'collector';

  const filtered = state.superGames.filter(g => {
    if (tab === 'upcoming') return g.status === 'scheduled';
    if (tab === 'live') return g.status === 'live';
    return g.status === 'finished' || g.status === 'cancelled';
  });

  return (
    <div className="px-3 sm:px-4 py-4 max-w-2xl mx-auto space-y-4 animate-fade-in">
      <div className="relative glass-strong gold-border p-5 overflow-hidden">
        <div className="text-[10px] font-bold uppercase tracking-widest text-gold/70 mb-1">Главная сцена</div>
        <h1 className="font-heading text-2xl font-bold text-gradient-gold">Супер игры</h1>
        <p className="text-xs text-muted-foreground mt-1">События, за которыми наблюдает вся академия.</p>
      </div>

      {isAdmin && (
        <Link href="/admin?tab=super-games" className="btn-primary w-full text-sm">⚙️ Создать супер игру</Link>
      )}

      <div className="scroll-x">
        {[
          { key: 'upcoming', label: 'Скоро', icon: '📅' },
          { key: 'live', label: 'В эфире', icon: '🔴' },
          { key: 'archive', label: 'Архив', icon: '📜' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className={cn('tab-pill', tab === t.key ? 'tab-pill-active' : 'tab-pill-inactive')}>
            <span>{t.icon}</span><span>{t.label}</span>
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="glass p-8 text-center">
            <div className="text-4xl mb-2 opacity-30">🏟️</div>
            <p className="text-sm text-muted-foreground">Ничего нет.</p>
          </div>
        ) : filtered.map(g => {
          const gt = GAME_TYPES.find(t => t.type === g.type);
          return (
            <Link key={g.id} href={`/super-games/${g.id}`}>
              <div className="glass-strong gold-border overflow-hidden active:scale-[0.99]">
                <div className="h-1 bg-gradient-to-r from-gold-light via-gold to-gold-dark" />
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-heading text-lg font-bold text-gold">{g.title}</h3>
                      {gt && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {gt.label}
                          {gt.isLive && <span className="ml-1.5 text-amber-300">· интерактив</span>}
                        </div>
                      )}
                    </div>
                    <span className={cn('status-badge border shrink-0',
                      g.status === 'live' ? 'bg-red-500/15 text-red-300 border-red-500/30 animate-pulse-gold' :
                      g.status === 'scheduled' ? 'bg-blue-500/15 text-blue-300 border-blue-500/30' :
                      'bg-gray-500/15 text-gray-400 border-gray-500/30'
                    )}>
                      {g.status === 'live' ? 'В эфире' : g.status === 'scheduled' ? 'Скоро' : 'Завершено'}
                    </span>
                  </div>
                  {g.description && <p className="text-xs text-muted-foreground mb-2">{g.description}</p>}
                  {g.stakes && (
                    <div className="text-xs text-gold/90 bg-gold/5 border border-gold/20 rounded-lg px-2.5 py-1.5 mb-2">
                      💰 {g.stakes}
                    </div>
                  )}
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>👥 {(g.participant_ids || []).length} участн.</span>
                    {g.starts_at && <span>{new Date(g.starts_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Типы игр */}
      <section>
        <div className="divider-ornate my-3">✦ Типы Больших Игр ✦</div>
        <div className="grid grid-cols-2 gap-2">
          {GAME_TYPES.map(gt => (
            <button key={gt.type} onClick={() => setSelectedType(gt.type)}
              className={cn('glass p-3 text-left active:scale-95 relative',
                gt.isLive && 'gold-border')}>
              {gt.isLive && (
                <span className="absolute top-1 right-1 text-[9px] font-bold uppercase tracking-wider text-amber-300 bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 rounded-md">
                  live
                </span>
              )}
              <div className="font-bold text-sm leading-tight pr-9">{gt.label}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{gt.desc}</div>
              <div className="text-[10px] text-gold mt-1">👥 {gt.count}</div>
            </button>
          ))}
        </div>
      </section>

      {selectedType && (
        <div className="fixed inset-0 z-[55] flex items-end sm:items-center justify-center p-3">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setSelectedType(null)} />
          <div className="relative glass-strong w-full max-w-md p-4 max-h-[85vh] overflow-y-auto rounded-2xl animate-slide-up">
            {(() => {
              const t = GAME_TYPES.find(g => g.type === selectedType)!;
              return (
                <>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-heading text-xl font-bold flex-1">{t.label}</h3>
                    {t.isLive && (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-md">
                        live
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">{t.desc}</p>
                  <div className="text-[10px] uppercase tracking-widest text-gold/70 mb-1">Правила</div>
                  <p className="text-sm whitespace-pre-line mb-3">{t.rules}</p>
                  <div className="text-[10px] uppercase tracking-widest text-gold/70 mb-1">Участников</div>
                  <p className="text-sm mb-4">{t.count}</p>
                  <button onClick={() => setSelectedType(null)} className="btn-secondary w-full">Понятно</button>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
