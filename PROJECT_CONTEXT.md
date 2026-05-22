# Контекст проекта «Академия — Безумный Азарт»

## Кто я
Senior full-stack разработчик, помогаю **Watanuk1i** с ролевым игровым сайтом в стилистике **Danganronpa**.

## Актуальный репозиторий
- **GitHub**: `Watanuk1i/new-rep` → ветка `main` (унифицированная)
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
`localStorage` хранит только `user_id` для авто-логина и кэш состояния (academy-cache-v1, версия 3).

## Структура проекта
```bash
src/
├── app/
│   ├── page.tsx                    # Главная (рейтинг + события)
│   ├── layout.tsx                  # StoreProvider + TopBar + SideNav + BottomNav
│   ├── login/page.tsx              # Вход + регистрация (выбор персонажа)
│   ├── participants/page.tsx       # Список игроков
│   ├── profile/[id]/page.tsx       # Профиль + питомцы + кнопка перевода йен
│   ├── games/                      # Вызовы, создание, игровые комнаты (turn-based)
│   ├── pari/                       # Пари с комментариями
│   ├── super-games/                # Супер игры (диспетчер + комнаты live-игр)
│   ├── transfers/page.tsx          # ЛЕНТА ПЕРЕВОДОВ ЙЕН
│   ├── debts/page.tsx              # Долги (включая долги Казне)
│   ├── rumors/page.tsx             # Слухи
│   ├── notifications/page.tsx
│   ├── history/page.tsx            # Личная история (с поддержкой переводов и Карточного корабля)
│   ├── admin/page.tsx              # Админка GM/Queen + вкладка Казны + создание Карточного корабля
│   └── debug/page.tsx              # Диагностика Supabase
├── components/
│   ├── layout/             (TopBar / SideNav / BottomNav)
│   ├── cards/              (ParticipantCard)
│   ├── super-games/        (MinorityRoom, NineBulletsRoom, Revolver)  ← Большая игра 1+2
│   ├── cardship/           (CardShipBoard)                            ← Большая игра 3
│   ├── economy/            (TransferModal)                            ← модалка перевода йен
│   └── ui/                 (Yen, CharacterIcon, ToastHost)
├── lib/
│   ├── store/StoreProvider.tsx     # Глобальный стор (Supabase + Realtime + кэш)
│   ├── store/types.ts              # Все типы
│   ├── store/tx.ts                 # Атомарные транзакции через RPC apply_transfer
│   ├── cardship/logic.ts           # Чистая логика Карточного корабля
│   ├── supabase/client.ts
│   └── utils.ts
supabase/
└── setup.sql                       # ЕДИНСТВЕННЫЙ SQL-файл — DROP+CREATE+SEED+RPC всё в одном
```

## Supabase таблицы (16 таблиц, актуально)
**Базовые (11):**
- `room_state`, `participants`, `challenges`, `pari`, `debts`, `super_games`, `events`, `notifications`, `rumors`, `content_blocks`, `history`

**V2 (экономика и Карточный корабль):**
- `transfers` — глобальные переводы йен между игроками
- `card_ship_games` — Большая игра «Карточный корабль»
- `card_ship_states` — состояние игрока в игре (карты + звёзды)
- `card_ship_duels` — дуэли камень-ножницы-бумага
- `card_ship_listings` — рынок карт и звёзд

## RPC-функции (атомарные)
- `apply_transfer(from, to, amount, reason, link)` — единая точка входа для денежных операций. Авто-долг при нехватке.
- `cast_minority_vote(game_id, voter_id, choice)` — голос в Правиле меньшинства.
- `place_seat_bid(game_id, round_idx, bidder_id, seat, amount)` — слепая ставка в Комнате девяти патронов.

## Большие игры (3 типа реализованы как live-комнаты)
1. **Правило меньшинства** (`minority_rule`) — `MinorityRoom`
2. **Комната девяти патронов** (`nine_bullets`) — `NineBulletsRoom` + `Revolver`
3. **Карточный корабль** (`card_ship`) — `CardShipBoard` + `cardship/logic.ts`

## Спецаккаунты (seed)
- **Ведущий (GM)**: `host` / `host_academy_2026` → `p-gm`
- **Селестия (Queen)**: `queen` / `queen_celestia_2026` → `p-queen`
- **Казна студсовета**: `p-treasury` (системный аккаунт без логина)
- Персонажи `p-1`…`p-14` — для регистрации игроков

## Терминология проекта
- Валюта — **«ейн»**
- Статусы: Игрок, Питомец, Хозяин, Элита, Королева, Ведущий, Коллектор, **Казна**
- Большие игры = **Супер игры**

## Важные правила и пожелания
- **Mobile-first** — главный приоритет
- Шрифт только Montserrat
- Работать **только** в `Watanuk1i/new-rep`
- Не использовать `@supabase/ssr` и `framer-motion`
- Между карточками — `space-y-3`
- Все денежные операции — через `apply_transfer` RPC (через хелперы `chargeToTreasury`, `payoutFromTreasury`, `transferBetweenPlayers` в `src/lib/store/tx.ts`)

## Установка БД
1. Открой Supabase → SQL Editor
2. Запусти целиком файл `supabase/setup.sql` кнопкой Run
3. Проверь, что 4 финальных SELECT-а вернули:
   - 16 строк в participants
   - anon_can_select = true
   - 3 системных аккаунта (p-gm, p-queen, p-treasury)
   - 5 V2-таблиц видны
4. (Опционально) Открой Database → Replication → publication "supabase_realtime" → включи галочки на всех 16 таблицах для live-обновлений

## Что спрашивать в начале новой сессии
1. Применился ли `setup.sql`? (страница `/debug` это покажет)
2. Включён ли Realtime для всех 16 таблиц?
3. Есть ли новые ошибки на конкретных страницах?

---

**Файл актуален на 22.05.2026 — после унификации всех веток**
