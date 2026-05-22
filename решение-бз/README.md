# Решение проблем с базой

Папка с готовыми решениями типичных проблем проекта.

## Файлы

### `fix_database.sql`
Запусти в **Supabase → SQL Editor** если на `/debug` видишь:
```
Seed: p-gm и p-queen
❌ найдено 0/2 — id-шки в БД не совпадают с ожидаемыми
```
или сайт не видит игроков (`participants ✅ строк: 0`).

Скрипт:
- сбрасывает все наши таблицы
- создаёт схему заново
- выдаёт права роли `anon` (это критично!)
- засеивает 16 участников (p-gm, p-queen, p-1..p-14)
- настраивает Realtime publication
- сбрасывает PostgREST schema cache

После запуска — **Settings → General → Pause project** → подожди 30 сек → **Resume**.
Потом на сайте `/debug` → **Ctrl+F5**.

### `PROJECT_CONTEXT.md`
Полный контекст проекта для новой сессии чата. Прочитать до старта работы.

## Если после `fix_database.sql` всё равно «найдено 0/2»

Значит ENV в Vercel держит **publishable** ключ (`sb_publishable_*`), а нужен **legacy JWT** (`eyJ...`).

1. Supabase → **Settings → API → Project API Keys** → раздел **Legacy** → скопируй `anon public` (длинный JWT)
2. Vercel → **Settings → Environment Variables** → `NEXT_PUBLIC_SUPABASE_ANON_KEY` → Edit → вставь legacy JWT → Save
3. **Deployments → Redeploy** последнего коммита (без use cache)
4. На `/debug` строка «ENV: NEXT_PUBLIC_SUPABASE_ANON_KEY» должна стать `JWT anon (legacy)`, не `publishable`
