# Безумный Азарт Отчаяния

Полноценный мобильно-ориентированный сайт для ролевой игры «Безумный Азарт Отчаяния» — элитная академия Хоуп Пик, где статус, свобода и влияние решаются через азартные игры.

## Стек

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS (тёмная тема, casino vibe)
- Supabase (PostgreSQL + Realtime)
- Mobile-first дизайн с PWA-поддержкой

## Быстрый старт

### 1. Клонировать репозиторий

```bash
git clone https://github.com/Watanuk1i/new-rep.git
cd new-rep
```

### 2. Установить зависимости

```bash
npm install
```

### 3. Создать `.env.local`

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 4. Применить SQL

В **Supabase Dashboard → SQL Editor** скопировать целиком файл `supabase/setup.sql` и нажать Run. Файл сам:

1. Сбрасывает все старые таблицы (DROP CASCADE).
2. Создаёт 16 актуальных таблиц.
3. Включает RPC-функции для атомарных переводов и live-игр.
4. Выдаёт права anon/authenticated/service_role.
5. Сидит room_state, 16 участников и Казну студсовета.
6. Выводит 4 проверочных SELECT-а в конце.

### 5. (Опционально) Включить Realtime

В **Supabase → Database → Replication → publication "supabase_realtime"** → Edit → включить галочки на всех 16 таблицах.

### 6. Локальный запуск

```bash
npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000).

---

## Аватарки персонажей

Каждый персонаж берёт картинку либо из спрайт-листов (`public/sprites/sheet1.png`, `sheet2.png`, `sheet3.png`) по координатам `sprite_y`/`sprite_x`/`sprite_size`, либо из `custom_icon_url`. Настройка — во вкладке «Иконки» админки.

---

## Структура проекта

```
new-rep/
├── src/
│   ├── app/                          # Страницы (Next.js App Router)
│   │   ├── page.tsx                  # Главная — панель академии
│   │   ├── participants/             # Рейтинг + карточки игроков
│   │   ├── profile/[id]/             # Профиль + кнопка перевода йен
│   │   ├── games/                    # Малые игры (turn-based 2-player)
│   │   │   ├── create/               # Создание вызова
│   │   │   └── play/[type]/          # Игровые комнаты
│   │   ├── pari/                     # Пари с комментариями
│   │   ├── super-games/              # Супер игры (диспетчер + live-комнаты)
│   │   ├── transfers/                # Лента переводов йен
│   │   ├── debts/                    # Долги (включая долги Казне)
│   │   ├── rumors/                   # Слухи академии
│   │   ├── notifications/            # Уведомления
│   │   ├── history/                  # Личная история
│   │   ├── admin/                    # Админка GM/Queen + Казна + Создание Карточного корабля
│   │   └── debug/                    # Диагностика Supabase
│   ├── components/
│   │   ├── layout/                   # TopBar + BottomNav + SideNav
│   │   ├── cards/                    # ParticipantCard
│   │   ├── super-games/              # MinorityRoom + NineBulletsRoom + Revolver
│   │   ├── cardship/                 # CardShipBoard (Большая игра «Карточный корабль»)
│   │   ├── economy/                  # TransferModal (модалка перевода йен)
│   │   └── ui/                       # CharacterIcon + Yen + ToastHost
│   └── lib/
│       ├── store/StoreProvider.tsx   # Глобальный стор (Supabase + Realtime + кэш)
│       ├── store/types.ts            # Все типы
│       ├── store/tx.ts               # Атомарные транзакции через apply_transfer RPC
│       ├── cardship/logic.ts         # Чистая логика Карточного корабля
│       ├── supabase/client.ts        # Клиент Supabase (browser)
│       └── utils.ts                  # cn, formatYen, isPlayer, спрайт-листы
├── supabase/
│   └── setup.sql                     # ЕДИНСТВЕННЫЙ SQL — всё в одном файле
├── public/
│   ├── avatars/, sprites/            # Аватарки и спрайт-листы
│   └── manifest.json                 # PWA manifest
├── 3game/                            # Дизайн-доки Карточного корабля + переводов
├── package.json
├── next.config.js
├── tailwind.config.ts
└── tsconfig.json
```

## Возможности

- **Mobile-first UI** — нижняя навигация, тач-таргеты 48px+, drawer для меню.
- **PWA-готовность** — manifest, viewport, safe-area для iPhone notch.
- **16 участников + Казна студсовета** в seed-е, готовы к регистрации.
- **9 малых игр** — Кости, Карта, Рулетка, Слоты, 21 очко, Блеф, Правда, Найди пару, Найди джокера. Все turn-based на двоих с ready-фазой.
- **Система пари** — динамические коэффициенты, комиссия создателя, комментарии.
- **3 живые Большие игры** (live-комнаты с realtime-обновлениями):
  1. **Правило меньшинства** (`minority_rule`) — голосование, штрафы, банк победителю.
  2. **Комната девяти патронов** (`nine_bullets`) — 3 раунда, барабан, слепой аукцион мест.
  3. **Карточный корабль** (`card_ship`) — Камень-Ножницы-Бумага + дуэли + рынок карт и звёзд.
- **Переводы йен** между игроками с обязательным комментарием.
- **Казна студсовета** — системный кошелёк для взносов, штрафов, выплат против манекенов.
- **Уведомления** — поддержано ≈25 типов, real-time через Supabase Realtime.
- **Админка ведущего** — 12 вкладок: Обзор, Сезон/День, Объявления, Игроки, Аккаунты, Пари, Супер игры, Казна, Долги, Слухи, Иконки, Контент.
- **localStorage-кэш** — мгновенный первый рендер, версия `academy-cache-v1` v3.

---

## База данных (Supabase / PostgreSQL)

**16 таблиц:**

| Таблица | Описание |
|---------|----------|
| `room_state` | Сезон + день академии |
| `participants` | 16 участников + Казна |
| `challenges` | Вызовы на малые игры |
| `pari` | Рынки пари (со ставками и комментариями в JSONB) |
| `debts` | Долги (включая долги Казне) |
| `super_games` | Супер игры (с `state` JSONB для live-комнат) |
| `events` | Лента событий академии |
| `notifications` | Личные уведомления |
| `rumors` | Слухи (с голосами в JSONB) |
| `content_blocks` | Контент страниц help/rules |
| `history` | Личная история действий |
| `transfers` | **V2:** Глобальные переводы йен |
| `card_ship_games` | **V2:** Карточный корабль |
| `card_ship_states` | **V2:** Состояние игрока в Карточном корабле |
| `card_ship_duels` | **V2:** Дуэли камень-ножницы-бумага |
| `card_ship_listings` | **V2:** Рынок карт и звёзд |

**RPC-функции (атомарные):**
- `apply_transfer(from, to, amount, reason, link)` — единая точка входа для денежных операций. Авто-долг при нехватке.
- `cast_minority_vote(game_id, voter_id, choice)` — голос в Правиле меньшинства.
- `place_seat_bid(game_id, round_idx, bidder_id, seat, amount)` — слепая ставка в Комнате девяти патронов.

---

## Спецаккаунты

- **Ведущий (GM)**: `host` / `host_academy_2026` → `p-gm`
- **Селестия (Queen)**: `queen` / `queen_celestia_2026` → `p-queen`
- **Казна студсовета**: `p-treasury` (системный, без логина)
- Персонажи `p-1` … `p-14` — для регистрации игроков (любой пароль до регистрации).

---

## Лицензия

Проект для проведения ролевой игры. Все персонажи принадлежат Spike Chunsoft / Kazutaka Kodaka.
