'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useStore } from '@/lib/store/StoreProvider';
import { cn } from '@/lib/utils';

const GAME_TYPES = [
  { type: 'card_ship', label: 'Карточный корабль', desc: 'Камень-Ножницы-Бумага, сделки и блеф', count: '8-14', rules: 'Резервная игра Бьякуи. Каждый игрок получает 9 карт (3 Камень, 3 Ножницы, 3 Бумага) и 3 звезды. Дуэли, рынок карт и звёзд. Победители делят банк.', isLive: true, hidden: true },
  { type: 'minority_rule', label: 'Правило меньшинства', desc: 'Голосуйте за меньшинство', count: '2-10', rules: 'Каждый раунд один из игроков задаёт вопрос «да/нет». Все живые голосуют. Кто в большинстве — выбывают, кто в меньшинстве — остаются. Не проголосовал — штраф 100k и выбыл. При ничьей никто не выбывает. Последний выживший забирает банк.', isLive: true },
  { type: 'nine_bullets', label: 'Комната девяти патронов', desc: '3 раунда, барабан, 9 мест', count: '7+', rules: '3 раунда. В каждом — Заряжающий, Стрелок и 5 Сидящих. Заряжающий тайно ставит 3 красных и 6 синих. Сидящие покупают места слепым аукционом, остальные — манекены. Стрелок может поменять две цели за 100k. Затем 9 выстрелов по местам. Деньги идут напрямую между игроками или через Казну (за манекенов).', isLive: true },
  { type: 'royal_roulette', label: 'Королевская рулетка', desc: 'Селестия + 4 игрока · 5 раундов', count: '5', rules: 'Личная игра Селестии. Селестия + 4 игрока. Взнос: 250k от игрока, 1M от Селестии — банк 2M.\n5 раундов: тайный выбор ставки (Безопасная / Рискованная / Королевская) и розыгрыш рулетки на 12 секторов.\nСектора: Безопасная (4), Рискованная (3), Королевская (2), Налог студсовета (2), Корона (1).\nСелестия не может выбирать Безопасную ставку и один раз за игру может посмотреть выбор одного игрока («Королевский взгляд»).\nПобеждает участник с наибольшей чистой прибылью — забирает банк.', isLive: true },
  { type: 'contraband', label: 'Контрабанда капитала', desc: 'Игра Кокичи · 2 команды · блеф и ложные следы', count: '6-8', rules: 'Куратор — Кокичи Ома. Финансовый контроль — Кируми. Взыскание — Мондо/Пеко. Наблюдатель — Селестия.\n2 команды по 3–4 игрока. 4 раунда. Сейф каждой команды: 2M.\nКаждый раунд: команда-отправитель выбирает Контрабандиста и сумму кейса (0/100k/200k/300k/400k). Команда-защитник — Таможенника, который пропускает или проверяет.\nКокичи может (1 раз за игру каждое):\n— Ложный след: публичная сомнительная подсказка перед решением Таможенника. Прав → +100k, ошибся → −100k.\n— Сомнение Таможенника: после решения, заставляет подтвердить или поменять.\n— Смена курьера: команда выбирает другого Контрабандиста. Кокичи платит 50k в Казну.\nКокичи не видит и не меняет сумму кейса. Победители команды +150k каждому, проигравшие −75k.', isLive: true },
  { type: 'debt_tower', label: 'Долговая башня Мондо', desc: '5 этажей · 3 двери · долг или риск', count: '4-8', rules: 'Куратор — Мондо, наблюдатель — Селестия. 4–8 игроков. Взнос 150k → банк.\n5 этажей. На каждом игрок тайно выбирает дверь:\n— Оплата: −50k, безопасно.\n— Риск: 50/50 +150k или −150k.\n— Долг: сейчас 0, но создаётся долг (1-й раз 100k, 2-й 200k … 5-й 500k). Кредитор — Казна, взыскатель — Мондо.\nПобеждает максимальный чистый результат (прибыль − потери − долги). Победитель забирает банк и получает статус «Кандидат в Элиту».', isLive: true },
  { type: 'debt_auction', label: 'Аукцион долгов', desc: 'Долги становятся товаром', count: 'все', rules: 'Куратор — Кируми. Взыскатель — Мондо, наблюдатель — Селестия.\nИз активных и просроченных долгов формируются лоты. Стартовая цена = 50% долга, цена самовыкупа должником = 70% долга. Шаг ставки 50k.\nПобедитель аукциона становится новым владельцем долга. Должник, выкупивший себя, закрывает долг (paid).', isLive: true },
  { type: 'elite_trial', label: 'Суд над Элитой', desc: 'Карточный судебный поединок', count: 'все', rules: 'Судья — Селестия. Цели суда: Джунко, Мондо, Кируми. Игроки делятся на Обвинение и Защиту.\nКаждая сторона собирает фонд (взносы). За 50k открывают случайную карту дела, за 100k покупают её. Каждая сторона может сыграть до 5 карт.\nКарты дают очки или применяют эффекты. При prosecution > defense Элита виновна и платит 1M в Казну. Иначе — оправдана и получает 500k компенсации (Защита побеждает при равенстве).', isLive: true },
  { type: 'elite_candidate_trial', label: 'Испытание кандидата', desc: 'Кандидат должен показать власть', count: '4-6', rules: 'Кандидат получает фонд испытания 1M от Селестии. К концу игры он должен вернуть 1.2M (или 1.3M в режиме harsh).\n3 раунда. В каждом кандидат выбирает один приказ:\n— Сбор взноса: 2 игрока должны заплатить 100k.\n— Рискованная сделка: 200k из фонда → 50/50 +400k или −200k.\n— Проверка верности: предложить игроку 100k или отказ за репутацию.\n— Наказание должника: должник платит 100k и долг −100k (или +20% и репутация).\n— Защита союзника: 150k из фонда защищают игрока от штрафа в раунде.\nПосле — финальное голосование участников. Если против большинство — провал. Иначе при достижении returnGoal — кандидат одобрен.', isLive: true },
  { type: 'rebellion', label: 'Совет бунта', desc: '5 раундов · 4 тайных действия', count: '6-12', rules: 'Селестия наблюдает. 6–12 игроков, 5 раундов.\nКаждый раунд игрок тайно выбирает одно действие:\n— Бунт: −100k, Фонд бунта +150k.\n— Предательство: +150k из Казны, Фонд −100k.\n— Нейтралитет: без изменений.\n— Сделка с Элитой: +250k из Казны, но при успехе бунта −500k штраф.\nЦель — собрать Фонд бунта ≥ 3M за 5 раундов. При успехе бунта Казна теряет 3M, лояльные бунтари (≥3 раз) +300k, сделочники −500k, частые предатели (≥2 раз) −300k. При провале — лояльные бунтари −300k, остальные сохраняют выплаты. Успех разблокирует «Трон Селестии».', isLive: true },
  { type: 'throne_celestia', label: 'Трон Селестии', desc: 'Финал сезона. Селестия vs Претендент', count: 'все', rules: 'Финальная супер-игра. Селестия (p-queen) против Претендента, остальные выбирают сторону или нейтралитет.\n10 раундов карт Император / Гражданин / Питомец. Финал — выбор итога.', isLive: true },
  { type: 'mini_red_black',  label: 'Малая · Красное/Чёрное', desc: 'Быстрая дуэль 1v1', count: '2', rules: 'Оба игрока ставят одинаковую сумму (10–100k). Тайно выбирают красное или чёрное, сайт раскрывает результат. Угадавший один — забирает банк (минус 5% Казне). Оба угадали или оба ошиблись — ставки возвращены.', isLive: true },
  { type: 'mini_blind_bid',  label: 'Малая · Слепая ставка',  desc: 'Жадность и блеф', count: '2-6', rules: '2–6 игроков. Каждый тайно выбирает сумму 10–100k и сразу платит её в Казну. Раскрытие — побеждает игрок с самой большой УНИКАЛЬНОЙ ставкой. Если уникальной нет — ставки возвращены. Победитель забирает банк минус 5% Казне.', isLive: true },
  { type: 'mini_liar_dice',  label: 'Малая · Лжец на кубиках', desc: 'Игра на блеф', count: '2-6', rules: 'Каждый игрок ставит 30–100k и получает 3 кубика, видит только свои. По очереди делают заявления типа «минимум N кубиков со значением X». Каждое следующее должно быть выше. Любой может сказать «Ложь» — кубики раскрываются. Если заявка ложная — проигрывает заявитель; если правдивая — обвинитель. Победитель забирает банк минус 5%.', isLive: true },
  { type: 'mini_despair_21', label: 'Малая · 21 отчаяния',    desc: 'Блекджек против дилера', count: '1-5', rules: 'До 5 игроков против дилера. Ставка 10–100k. Каждый берёт карты, цель — приблизиться к 21, не перебрав. Дилер добирает до 17. Победил дилера — получаешь ×2 ставки из Казны. Проиграл — ставка остаётся в Казне. Ничья — возврат.', isLive: true },
  { type: 'mini_ransom',     label: 'Малая · Выкупной стол',  desc: 'Шанс уменьшить долг', count: '1', rules: 'Создаются 3 закрытые карты: «Списать долг −50%», «Удвоить долг +50%», «Отложить долг». Хозяин/Мондо/Казна за 100k может убрать одну карту. Должник выбирает из оставшихся. Результат применяется к сумме долга или продлевает его срок.', isLive: true },
  { type: 'mini_joker',      label: 'Малая · Достать Джокера', desc: '3 режима · 2–6 игроков', count: '2-6', rules: '3 режима:\n— Быстрый: первый, кто вытянул Джокера, проигрывает; остальные делят банк после комиссии 5%.\n— Без бонусов: вытянувший Джокера выбывает, колода обновляется (10+1), играют до одного.\n— С бонусами: как «Без бонусов» + платные действия: пропустить ход 20k, подсказка 30k (показывает верхнюю карту), передача хода 30k.\nКолода: 10 обычных + 1 Джокер.', isLive: true },
  { type: 'collar', label: 'Игра ошейника', desc: 'Бой за свободу или ошейник', count: '2-4', rules: '2-4 игрока. Раунды на смекалку. Проигравший — Питомец.' },
  { type: 'rumor_pandemic', label: 'Пандемия слухов', desc: 'Кто запустит самый громкий слух', count: '5+', rules: 'Каждый день один слух. Голосование за самый правдоподобный.' },
  { type: 'musical_thrones', label: 'Музыкальные троны', desc: 'Не остаться без места', count: '4-8', rules: 'Очко тому, кто сядет на трон по сигналу.' },
  { type: 'smuggling', label: 'Контрабанда (старая)', desc: 'Резервный вариант', count: '3-6', rules: 'Игроки прячут предметы. Стража ищет.', hidden: true },
  { type: 'status_tower', label: 'Башня статуса', desc: 'Поднимайся по иерархии', count: '5-8', rules: 'Победитель раунда поднимается. Вершина — Элита.' },
  { type: 'mirror_lies', label: 'Зеркало лжи', desc: 'Угадай правду из лжи', count: '2-6', rules: 'Каждый говорит 3 вещи (1 ложь). Угадай.' },
  { type: 'hope_cage', label: 'Клетка надежды', desc: 'Выберись или сдайся', count: '1', rules: 'Психологическое испытание. Реальные ставки.' },
  { type: 'queen_throne', label: 'Трон Селестии (старая)', desc: 'Резервная', count: '3-5', rules: 'Резервная. Используйте throne_celestia.', hidden: true },
  { type: 'emperor', label: 'Император, гражданин, раб', desc: 'Карты решают иерархию', count: '4', rules: 'Карточная иерархия. Раб платит дань Императору.' },
];

export default function SuperGamesPage() {
  const { state, role, currentUser } = useStore();
  const [tab, setTab] = useState<'mine' | 'upcoming' | 'live' | 'archive' | 'catalog'>('upcoming');
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const isGm = role === 'gm';
  const myId = currentUser?.id ?? null;

  const myGames = state.superGames.filter(g =>
    !!myId && (g.participant_ids ?? []).includes(myId) &&
    g.status !== 'finished' && g.status !== 'cancelled');

  const filtered = state.superGames.filter(g => {
    if (tab === 'upcoming') return g.status === 'scheduled';
    if (tab === 'live') return g.status === 'live';
    if (tab === 'archive') return g.status === 'finished' || g.status === 'cancelled';
    if (tab === 'mine') return myGames.some(x => x.id === g.id);
    return false;
  });

  return (
    <div className="px-3 sm:px-4 py-4 max-w-2xl mx-auto space-y-4 animate-fade-in">
      <div className="relative glass-strong gold-border p-5 overflow-hidden">
        <div className="text-[10px] font-bold uppercase tracking-widest text-gold/70 mb-1">Главная сцена</div>
        <h1 className="font-heading text-2xl font-bold text-gradient-gold">Супер игры</h1>
        <p className="text-xs text-muted-foreground mt-1">События, за которыми наблюдает вся академия.</p>
      </div>

      {isGm && (
        <Link href="/admin?tab=super-games" className="btn-primary w-full text-sm">⚙️ Создать супер игру</Link>
      )}

      <div className="scroll-x">
        {([
          ...(myGames.length > 0 ? [{ key: 'mine', label: `Вы участвуете · ${myGames.length}`, icon: '🎯' }] : []),
          { key: 'upcoming', label: 'Скоро', icon: '📅' },
          { key: 'live', label: 'В эфире', icon: '🔴' },
          { key: 'archive', label: 'Архив', icon: '📜' },
          ...(isGm ? [{ key: 'catalog', label: 'Типы (GM)', icon: '📚' }] : []),
        ] as const).map(t => (
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

      {/* Типы игр (показываем только в табе catalog ведущему) */}
      {tab === 'catalog' && isGm && (
      <section>
        <div className="divider-ornate my-3">✦ Типы Больших Игр (GM) ✦</div>
        <div className="grid grid-cols-2 gap-2">
          {GAME_TYPES.filter(gt => !gt.hidden).map(gt => (
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
      )}

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
