# Контекст проекта «Академия — Безумный Азарт»

## Кто я
Senior full-stack разработчик, помогаю **Watanuk1i** с ролевым игровым сайтом в стилистике **Danganronpa**.

## Актуальный репозиторий
- **GitHub**: `Watanuk1i/new-rep` → ветка `main`
- Старый репозиторий `Watanuk1i/het-get-hp` — **не используется**
- Деплой: **Vercel** (подключён к `main`)

## Стек технологий
- **Next.js 14** (App Router) + TypeScript + Tailwind CSS
- **Supabase** (PostgreSQL + Realtime) — единая БД для всех игроков
- Шрифт: **Montserrat**
- Mobile-first дизайн (приоритет — мобильные устройства)
- Тёмная тема: золото `#d4af37`, бордо `#8b1a1a`, бархат `#2d1a35`

## Архитектура
Сайт полностью работает через Supabase + Realtime-подписки.  
Все клиенты видят изменения друг друга в реальном времени.  
`localStorage` хранит только `user_id` для авто-логина.

## Структура проекта
```bash
src/
├── app/
│   ├── page.tsx                    # Главная (рейтинг + события)
│   ├── layout.tsx                  # StoreProvider + TopBar + SideNav + BottomNav
│   ├── login/page.tsx              # Вход + регистрация (выбор персонажа)
│   ├── participants/page.tsx       # Список игроков
│   ├── profile/[id]/page.tsx       # Профиль + питомцы
│   ├── games/                      # Вызовы, создание, игровые комнаты
│   ├── pari/                       # Пари с комментариями
│   ├── super-games/                # Супер игры
│   ├── debts/page.tsx              # Долги
│   ├── rumors/page.tsx             # Слухи
│   ├── notifications/page.tsx
│   ├── admin/page.tsx              # Админка GM/Queen
│   └── debug/page.tsx              # Диагностика Supabase
├── components/
│   ├── layout/...
│   ├── cards/ParticipantCard.tsx
│   └── ui/...
├── lib/
│   ├── store/                      # Zustand
│   ├── supabase/client.ts
│   └── utils.ts
supabase/migrations/
└── 002_full_schema.sql             # ЕДИНСТВЕННАЯ актуальная миграция
```

## Supabase таблицы (актуальные)
- `room_state`, `participants`, `challenges`, `pari`, `debts`, `super_games`, `events`, `notifications`, `rumors`, `content_blocks`, `history`

## Спецаккаунты (seed)
- **Ведущий (GM)**: `host` / `host_academy_2026` → `p-gm`
- **Селестия (Queen)**: `queen` / `queen_celestia_2026` → `p-queen`
- Персонажи `p-1`…`p-14` — для регистрации игроков

## Терминология проекта
- Валюта — **«ейн»**
- Статусы: Игрок, Питомец, Хозяин, Элита, Королева, Ведущий, Коллектор
- Большие игры = **Супер игры**

## Важные правила и пожелания
- **Mobile-first** — главный приоритет
- Шрифт только Montserrat
- Работать **только** в `Watanuk1i/new-rep`
- Не возвращать localStorage-стор
- Не использовать `@supabase/ssr` и `framer-motion`
- Между карточками — `space-y-3`

## Текущие задачи / баги
1. SQL ошибка `42601: VALUES lists must all be the same length` (seed)
2. Применить миграцию `002_full_schema.sql`
3. Исправить и запушить seed

## Перед применением миграции 002
```sql
DROP TABLE IF EXISTS audit_log, cast_applications, notifications, pet_relations, rumors, debts, super_game_events, super_game_participants, super_games, pari_bets, pari_options, pari_markets, game_actions, game_sessions, game_requests, balance_transactions, participants, characters, profiles, room_state, challenges, pari, events, content_blocks, history CASCADE;
```

## Что спрашивать в начале новой сессии
1. Применилась ли миграция `002_full_schema.sql`?
2. Что показывает страница `/debug`?
3. Есть ли новые ошибки?

---

**Файл актуален на 21.05.2026**
