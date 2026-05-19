# Безумный Азарт Отчаяния

Полноценный мобильно-ориентированный сайт для ролевой игры «Безумный Азарт Отчаяния» — элитная академия Хоуп Пик, где статус, свобода и влияние решаются через азартные игры.

## Стек

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS (тёмная тема, casino vibe)
- Supabase (PostgreSQL + Auth + Realtime)
- Mobile-first дизайн с PWA-поддержкой

## Быстрый деплой на Vercel (5 минут)

### 1. Скачайте/клонируйте репозиторий

```bash
git clone https://github.com/Watanuk1i/het-get-hp.git
cd het-get-hp
```

### 2. Установите зависимости

```bash
npm install
```

### 3. (опционально) Настройте Supabase

Если хотите подключить базу прямо сейчас — скопируйте `.env.local.example` → `.env.local` и заполните:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

> Без них сайт всё равно соберётся и запустится — будут показываться демо-данные.

### 4. Соберите и задеплойте

```bash
npm run build
vercel build --prod
vercel deploy --prebuilt --prod
```

Готово. Vercel выдаст URL — открывайте на телефоне.

> Перед первым `vercel deploy` нужно выполнить `vercel login` (один раз) и `vercel link` (один раз — привязать папку к проекту Vercel).

---

## Локальный запуск для разработки

```bash
npm install
npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000)

---

## Подключение Supabase (полная функциональность)

### 1. Создайте проект

[supabase.com](https://supabase.com) → New project

### 2. Примените миграции

В **SQL Editor** Supabase выполните по очереди:

1. Содержимое `supabase/migrations/001_initial_schema.sql`
2. Содержимое `supabase/seed.sql`

Это создаст 19 таблиц, RLS-политики, функции расчёта пари, 50 персонажей и 16 стартовых участников.

### 3. Заберите ключи

Supabase → **Settings → API**:

- `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
- `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role` → `SUPABASE_SERVICE_ROLE_KEY` (секретный, только для серверной части)

### 4. Добавьте их в Vercel

**Project Settings → Environment Variables** → добавить три переменные → Redeploy.

---

## Аватарки персонажей

Положите PNG-файлы в `public/avatars/` с именами вида:

- `makoto-naegi.png`
- `kyoko-kirigiri.png`
- `byakuya-togami.png`
- `celestia-ludenberg.png`
- ... (все слаги в `supabase/seed.sql`)

Если файла нет — показывается красивая золотая заглушка с инициалами.

---

## Структура проекта

```
het-get-hp/
├── src/
│   ├── app/                    # Страницы (Next.js App Router)
│   │   ├── page.tsx            # Главная — панель академии
│   │   ├── participants/       # Рейтинг + карточки игроков
│   │   ├── profile/[id]/       # Профиль с шкалами
│   │   ├── games/              # Малые игры
│   │   │   ├── create/         # Многошаговая форма создания
│   │   │   └── play/[type]/    # Игровые комнаты
│   │   ├── pari/               # Пари с коэффициентами
│   │   ├── super-games/        # Большие игры + live
│   │   ├── notifications/      # Уведомления
│   │   ├── admin/              # Панель ведущего
│   │   ├── apply/              # Заявка на каст (4 шага)
│   │   ├── rules/              # Правила (accordion)
│   │   ├── rumors/             # Слухи академии
│   │   ├── debts/              # Долги
│   │   └── api/games/play/     # Серверная генерация результатов
│   ├── components/
│   │   ├── layout/             # TopBar + BottomNav (mobile)
│   │   ├── cards/              # ParticipantCard
│   │   └── ui/                 # Avatar, общие
│   ├── lib/
│   │   ├── supabase/           # Клиенты (browser, server, service)
│   │   ├── game-engine/        # Логика игр (server-side)
│   │   ├── betting/            # Расчёт пари
│   │   └── notifications/      # Шаблоны уведомлений
│   └── types/database.ts       # TypeScript типы БД
├── supabase/
│   ├── migrations/001_*.sql    # Полная SQL схема
│   └── seed.sql                # 50 персонажей + 16 участников
├── public/
│   ├── avatars/                # Аватарки персонажей
│   └── manifest.json           # PWA manifest
├── package.json
├── next.config.js
├── tailwind.config.ts
└── tsconfig.json
```

## Возможности

### Реализовано
- ✅ **Mobile-first UI** — нижняя навигация, тач-таргеты 48px+, drawer для дополнительных пунктов
- ✅ **PWA-готовность** — manifest, viewport, safe-area для iPhone notch
- ✅ **16 участников** + **50 персонажей** в каталоге (seed)
- ✅ **7 малых игр** с серверной генерацией результата (Кости, Карта, Рулетка, Слоты, 21 очко, Блеф, Правда)
- ✅ **Система пари** — динамические коэффициенты, комиссия создателя
- ✅ **Большие игры** — live-просмотр, лог событий, зрительские ставки
- ✅ **Уведомления** — 22 типа, real-time ready (Supabase Realtime)
- ✅ **Полная админка ведущего** — 11 разделов
- ✅ **Заявка на каст** — мастер из 4 шагов
- ✅ **Шкалы** надежды/отчаяния/безумия для каждого участника

### Готово к подключению
- 🔌 Supabase Auth (логин/регистрация)
- 🔌 Supabase Realtime (push-уведомления, live-игры)
- 🔌 Storage для аватарок

---

## База данных (Supabase / PostgreSQL)

| Таблица | Описание |
|---------|----------|
| `profiles` | Юзеры (extends auth.users) |
| `characters` | Каталог 50 персонажей |
| `participants` | 16 активных участников |
| `balance_transactions` | Все изменения баланса |
| `game_requests` | Вызовы на игры |
| `game_sessions` | Игровые сессии |
| `game_actions` | Лог ходов |
| `pari_markets` | Рынки пари |
| `pari_options` | Варианты ответа |
| `pari_bets` | Ставки игроков |
| `super_games` | Большие игры |
| `super_game_participants` | Участники Big Game |
| `super_game_events` | Live-лог |
| `debts` | Долги |
| `pet_relations` | Связи Питомец-Хозяин |
| `rumors` | Слухи |
| `notifications` | Уведомления |
| `audit_log` | Журнал всех действий |
| `cast_applications` | Заявки на каст |

**Серверные функции:**
- `update_balance()` — атомарное обновление + транзакция
- `resolve_pari()` — автоматическое распределение выигрыша
- `cancel_pari()` — возврат всех ставок

---

## Лицензия

Проект для проведения ролевой игры. Все персонажи принадлежат Spike Chunsoft / Kazutaka Kodaka.
