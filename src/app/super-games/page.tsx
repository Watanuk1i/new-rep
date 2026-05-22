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
  { type: 'contraband', label: 'Контрабанда капитала', desc: 'Командная игра. 2×7. 7 раундов', count: '14', rules: 'Куратор — Бьякуя. 2 команды по 7: Северный банк и Южный банк. 7 раундов.\nКаждый раунд: одна команда отправляет Контрабандиста (тайно выбирает сумму 0–500k), другая — Таможенника, который пропускает или проверяет, называя сумму подозрения.\nЕсли Таможенник назвал ≥ реальной — поймал, его команда получает сумму на счёт; меньше — Контрабандист прошёл и потерянный кейс на 0 + проверка = ловушка пустого кейса.\nЛичные комиссии 10% Контрабандисту/Таможеннику и штрафы 100k за ошибку — через Казну.\nПобедители команды +200k каждому, проигравшие −100k каждому.', isLive: true },
  { type: 'debt_tower', label: 'Долговая башня Мондо', desc: '5 этажей · 3 двери · долг или риск', count: '4-8', rules: 'Куратор — Мондо, наблюдатель — Селестия. 4–8 игроков. Взнос 150k → банк.\n5 этажей. На каждом игрок тайно выбирает дверь:\n— Оплата: −50k, безопасно.\n— Риск: 50/50 +150k или −150k.\n— Долг: сейчас 0, но создаётся долг (1-й раз 100k, 2-й 200k … 5-й 500k). Кредитор — Казна, взыскатель — Мондо.\nПобеждает максимальный чистый результат (прибыль − потери − долги). Победитель забирает банк и получает статус «Кандидат в Элиту».', isLive: true },
  { type: 'debt_auction', label: 'Аукцион долгов', desc: 'Долги становятся товаром', count: 'все', rules: 'Куратор — Кредитор Элиты, взыскатель — Мондо, наблюдатель — Селестия.\nИз активных и просроченных долгов формируются лоты. Стартовая цена = 50% долга, цена самовыкупа должником = 70% долга. Шаг ставки 50k.\nПобедитель аукциона становится новым владельцем долга. Должник, выкупивший себя, закрывает долг (paid).\nСпецдействия (по 1 разу):\n— Мондо: коллекторская надбавка +20% к одному лоту до открытия.\n— Кредитор: срочный заём ≤500k любому игроку, к возврату ×1.2.\n— Селестия: «Рука студсовета» — Казна перебивает текущую ставку (+100k) и забирает лот.', isLive: true },
  { type: 'elite_trial', label: 'Суд над Элитой', desc: 'Карточный судебный поединок', count: 'все', rules: 'Судья — Селестия. Игроки делятся на Обвинение и Защиту.\nКаждая сторона собирает фонд (взносы). За 50k открывают случайную карту дела, за 100k покупают её. Каждая сторона может сыграть до 5 карт.\nКарты дают очки за свою сторону или применяют эффекты (фальшивка/двойной агент/ненадёжный свидетель и т.п.).\nПри prosecution > defense Элита виновна и платит 1M в Казну. Иначе — оправдана и получает 500k компенсации (Защита побеждает при равенстве).', isLive: true },
  { type: 'rebellion', label: 'Совет бунта', desc: '5 раундов · 4 тайных действия', count: '6-12', rules: 'Селестия наблюдает. 6–12 игроков, 5 раундов.\nКаждый раунд игрок тайно выбирает одно действие:\n— Бунт: −100k, Фонд бунта +150k.\n— Предательство: +150k из Казны, Фонд −100k.\n— Нейтралитет: без изменений.\n— Сделка с Элитой: +250k из Казны, но при успехе бунта −500k штраф.\nЦель — собрать Фонд бунта ≥ 3M за 5 раундов. При успехе бунта Казна теряет 3M, лояльные бунтари (≥3 раз) +300k, сделочники −500k, частые предатели (≥2 раз) −300k. При провале — лояльные бунтари −300k, остальные сохраняют выплаты. Успех разблокирует «Трон Селестии».', isLive: true },
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
