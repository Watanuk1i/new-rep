# Миграции Supabase

Последовательность накатывания SQL-миграций. Каждый файл идемпотентный — повторный запуск не сломает данные.

## Базовая установка (один раз на новый проект)

1. `setup.sql` — основные таблицы, RLS, RPC, seed участников
2. `patch_11_players.sql` — экономика под состав 11 игроков (Селестия + 3 Элиты + 7 игроков)

## Дополнения

3. `add_kirumi_togami_fund.sql` — добавляет Кируми (`p-15`) и Фонд Тогами (`p-togami-fund`)
4. `add_pekoyama.sql` — добавляет Пеко Пекояму (`p-peko`)
5. `add_incognito_dummies.sql` — три «Инкогнито» для добивания состава

## Системы v2/v3

6. `migration_loans_v2.sql` — таблицы кредитов Кируми, выплат и заметок взыскания
7. `migration_debt_games.sql` — таблицы «Игры на долг»

## Хотфиксы

8. `fix_minority_vote_alive.sql` — RPC `cast_minority_vote` проверяет `alive_ids` (закрывает дыру: выбывший игрок мог проголосовать через прямой RPC).

## Рекомендованный порядок для существующего проекта

```
1. setup.sql                       (если ещё не накатан)
2. patch_11_players.sql
3. add_kirumi_togami_fund.sql
4. add_pekoyama.sql
5. add_incognito_dummies.sql
6. migration_loans_v2.sql
7. migration_debt_games.sql
8. fix_minority_vote_alive.sql
```

После всех миграций сделать в SQL Editor:
```sql
NOTIFY pgrst, 'reload schema';
```

## Полный сброс

В админке `/admin?tab=treasury` есть кнопка «ПОЛНЫЙ СБРОС» с подтверждением «СБРОС». Она чистит динамические данные и пересоздаёт seed участников. SQL миграции не трогает.
