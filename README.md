# Безумный Азарт Отчаяния — Академия

Игровой сайт-«арена» для DR-роли по мотивам Danganronpa: экономика на ейнах,
кредиты Кируми, игры на долг, большие игры, пари, слухи, договоры через Кируми.

## Стек

- **Next.js 14** (App Router) + TypeScript
- **Tailwind** (mobile-first, тёмная тема, золото `#d4af37`, бордо `#8b1a1a`)
- **Supabase** (PostgreSQL + Realtime, RLS открытый для anon-роли)
- **Vercel** — auto-deploy из `main`

## Запуск локально

```bash
npm install
cp .env.local.example .env.local   # вставить ключи Supabase
npm run dev
```

Откроется на http://localhost:3000.

## Миграции БД

См. [supabase/README.md](supabase/README.md). Минимум: запустить
`supabase/setup.sql` + `supabase/migration_full_v4.sql` в Supabase SQL Editor.

## Спецаккаунты

- **Ведущий (GM)**: логин `host` — `p-gm`
- **Селестия (Queen)**: логин `queen` — `p-queen`
- Остальные игроки регистрируются по имени персонажа с любым паролем.

## Структура

```
src/app/             — App Router pages (главная, игроки, админка, /super-games, /loans, /contracts, /games, /pari, /rumors, /togami…)
src/components/      — UI, карточки, комнаты больших и малых игр
src/lib/             — store, supabase client, transactions, типы, логика игр
supabase/            — SQL: setup + миграция v4
public/              — статика (логотип, спрайты)
```
