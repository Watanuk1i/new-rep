'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useStore } from '@/lib/store/StoreProvider';
import { cn } from '@/lib/utils';
import { BIG_GAMES, getBigGame, type BigGameTemplate } from '@/lib/superGames/catalog';
import { BigGameInfo } from '@/components/super-games/BigGameInfo';

// Мини-игры для дополнительного списка (по запросу пользователя — в конце страницы).
const MINI_GAMES = [
  { type: 'liars_bar',       label: '🍷 Бар лжецов',          desc: 'Карты, заявления, обвинения, револьвер. 2–6 игроков.', count: '2-6', rules: 'Каждый платит входную ставку (50–300k) → банк. Колода 6A+6K+6Q+2J. Карта стола — Туз/Король/Дама. В свой ход кладёте 1–3 карты закрыто и заявляете «N карт стола». Любой может обвинить во лжи. Если ложь раскрыта — лжец проходит револьверную проверку (1/6, 1/5, 1/4...). Если обвинение ошибочное — обвинитель. Шанс выбыть растёт с каждой проверкой. Последний за столом забирает банк. Долги не создаются.' },
  { type: 'mini_red_black',  label: 'Малая · Красное/Чёрное', desc: 'Быстрая дуэль 1v1', count: '2', rules: 'Оба игрока ставят 10–100k. Тайно выбирают красное или чёрное, сайт раскрывает результат. Угадавший один — забирает банк (минус 5% Казне). Оба угадали или оба ошиблись — ставки возвращены.' },
  { type: 'mini_blind_bid',  label: 'Малая · Слепая ставка',  desc: 'Жадность и блеф', count: '2-6', rules: '2–6 игроков. Каждый тайно выбирает 10–100k и сразу платит в Казну. Побеждает игрок с самой большой УНИКАЛЬНОЙ ставкой. Если уникальной нет — возврат. Победитель забирает банк минус 5% Казне.' },
  { type: 'mini_liar_dice',  label: 'Малая · Лжец на кубиках', desc: 'Игра на блеф', count: '2-6', rules: 'Каждый ставит 30–100k и получает 3 кубика. По очереди заявляют «минимум N кубиков со значением X». Каждое следующее выше. Сказал «Ложь» — раскрытие. Заявитель не прав → проиграл; правдиво → проиграл обвинитель.' },
  { type: 'mini_despair_21', label: 'Малая · 21 отчаяния',    desc: 'Блекджек против дилера', count: '1-5', rules: 'До 5 игроков против дилера. Ставка 10–100k. Цель — приблизиться к 21. Дилер добирает до 17. Победил → ×2 ставки. Проиграл → потеря. Ничья → возврат.' },
  { type: 'mini_ransom',     label: 'Малая · Выкупной стол',  desc: 'Шанс уменьшить долг', count: '1', rules: '3 закрытые карты: «Списать −50%», «Удвоить +50%», «Отложить долг». Хозяин/Мондо за 100k убирает одну. Должник тянет из оставшихся.' },
  { type: 'mini_joker',      label: 'Малая · Достать Джокера', desc: '3 режима', count: '2-6', rules: '3 режима: Быстрый, Без бонусов, С бонусами (платные действия: пропустить ход 20k, подсказка 30k, передача хода 30k). Колода: 10 обычных + 1 Джокер.' },
];

// Резервные игры (не из 9 основных). Скрыты по умолчанию.
const ALT_GAMES = [
  { type: 'card_ship', label: 'Карточный корабль', desc: 'Камень-Ножницы-Бумага, сделки и блеф', count: '8-14', rules: 'Резервная игра. Каждый игрок получает 9 карт (3 Камень, 3 Ножницы, 3 Бумага) и 3 звезды. Дуэли, рынок карт и звёзд. Победители делят банк.' },
  { type: 'collar', label: 'Игра ошейника', desc: 'Бой за свободу или ошейник', count: '2-4', rules: 'Раунды на смекалку. Проигравший — Питомец.' },
];

export default function SuperGamesPage() {
  const { state, role, currentUser } = useStore();
  const [tab, setTab] = useState<'mine' | 'upcoming' | 'live' | 'archive'>('upcoming');
  const [selectedType, setSelectedType] = useState<string | null>(null);
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

  const selectedBig = selectedType ? getBigGame(selectedType) : null;
  const selectedMini = selectedType ? MINI_GAMES.find(m => m.type === selectedType) : null;

  return (
    <div className="px-3 sm:px-4 py-4 max-w-2xl mx-auto space-y-4 animate-fade-in">
      <div className="relative glass-strong gold-border p-5 overflow-hidden">
        <div className="text-[10px] font-bold uppercase tracking-widest text-gold/70 mb-1">Главная сцена</div>
        <h1 className="font-heading text-2xl font-bold text-gradient-gold">Супер игры</h1>
        <p className="text-xs text-muted-foreground mt-1">События, за которыми наблюдает вся академия.</p>
      </div>

      <div className="scroll-x">
        {([
          ...(myGames.length > 0 ? [{ key: 'mine', label: `Вы участвуете · ${myGames.length}`, icon: '🎯' }] : []),
          { key: 'upcoming', label: 'Скоро', icon: '📅' },
          { key: 'live', label: 'В эфире', icon: '🔴' },
          { key: 'archive', label: 'Архив', icon: '📜' },
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
          const gt = getBigGame(g.type);
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
                          {gt.curatorName && <span className="ml-1.5">· куратор: {gt.curatorName}</span>}
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

      {/* 9 Больших игр — порядок по спецификации */}
      <section>
        <div className="divider-ornate my-3">✦ Девять Больших игр ✦</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {BIG_GAMES.map((gt, idx) => (
            <button key={gt.type} onClick={() => setSelectedType(gt.type)}
              className="glass p-3 text-left active:scale-95 relative gold-border">
              <span className="absolute top-1 right-1 text-[9px] font-bold uppercase tracking-wider text-amber-300 bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 rounded-md">
                #{idx + 1}
              </span>
              <div className="font-bold text-sm leading-tight pr-8">{gt.label}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{gt.description}</div>
              <div className="text-[10px] text-gold mt-1">👤 {gt.curatorName}</div>
            </button>
          ))}
        </div>
      </section>

      {/* Малые игры — отдельным списком */}
      <section>
        <div className="divider-ornate my-3">⊹ Малые игры ⊹</div>
        <div className="grid grid-cols-2 gap-2">
          {MINI_GAMES.map(gt => (
            <button key={gt.type} onClick={() => setSelectedType(gt.type)}
              className="glass p-3 text-left active:scale-95">
              <div className="font-bold text-xs leading-tight">{gt.label}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{gt.desc}</div>
              <div className="text-[10px] text-gold mt-1">👥 {gt.count}</div>
            </button>
          ))}
        </div>
      </section>

      {/* Раскрытие выбранной большой игры */}
      {selectedBig && (
        <div className="fixed inset-0 z-[55] flex items-end sm:items-center justify-center p-3">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setSelectedType(null)} />
          <div className="relative glass-strong w-full max-w-md p-4 max-h-[85vh] overflow-y-auto rounded-2xl animate-slide-up space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="font-heading text-xl font-bold flex-1">{selectedBig.label}</h3>
              {selectedBig.isLive && (
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-md">live</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground italic">{selectedBig.description}</p>
            <BigGameInfo game={selectedBig} />
            <button onClick={() => setSelectedType(null)} className="btn-secondary w-full">Понятно</button>
          </div>
        </div>
      )}

      {/* Раскрытие выбранной малой игры */}
      {selectedMini && (
        <div className="fixed inset-0 z-[55] flex items-end sm:items-center justify-center p-3">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setSelectedType(null)} />
          <div className="relative glass-strong w-full max-w-md p-4 max-h-[85vh] overflow-y-auto rounded-2xl animate-slide-up space-y-3">
            <h3 className="font-heading text-xl font-bold">{selectedMini.label}</h3>
            <p className="text-xs text-muted-foreground">{selectedMini.desc}</p>
            <div className="text-[10px] uppercase tracking-widest text-gold/70">Правила</div>
            <p className="text-sm whitespace-pre-line">{selectedMini.rules}</p>
            <div className="text-[10px] uppercase tracking-widest text-gold/70">Участников: {selectedMini.count}</div>
            <p className="text-[11px] text-emerald-300/80 bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-2">
              ✓ Малые игры не создают долги. Ставка возможна только если у игрока есть деньги.
            </p>
            <button onClick={() => setSelectedType(null)} className="btn-secondary w-full">Понятно</button>
          </div>
        </div>
      )}
    </div>
  );
}

// BigGameInfo вынесен в отдельный модуль c:\nre-dep-dv2\src\components\super-games\BigGameInfo.tsx
// чтобы Next.js мог парсить page.tsx без посторонних экспортов.
