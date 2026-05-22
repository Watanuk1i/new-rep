-- Patch для актуального состава 11 человек (по ТЗ patch_11_players_economy_game2_bets).
-- Запускать в Supabase SQL Editor. Можно безопасно применять поверх старой БД.
-- Не удаляет лишних старых игроков, только деактивирует их через is_active = FALSE.

-- =====================================================================
-- 1. Ставим Бьякую и нескольких лишних в неактивных (если они есть).
--    Активный каст: 11 человек.
-- =====================================================================
UPDATE participants SET is_active = FALSE
WHERE id IN (
  'p-3',  -- Бьякуя Тогами (убран по ТЗ)
  'p-1',  -- Макото Наэги
  'p-2',  -- Кёко Киригири
  'p-7',  -- Сакура Огами
  'p-9',  -- Саяка Майзоно
  'p-10', -- Чихиро Фуджисаки
  'p-12', -- Киётака Ишимару
  'p-13'  -- Хифуми Ямада
);

-- =====================================================================
-- 2. Селестия — Директор студсовета.
-- =====================================================================
UPDATE participants SET balance = 5000000, reputation = 50, is_active = TRUE
WHERE id = 'p-queen';

-- =====================================================================
-- 3. Элита (3 человека): Джунко, Мондо, Кируми.
-- =====================================================================
UPDATE participants SET status = 'elite', balance = 3000000, reputation = 30, is_active = TRUE
WHERE id IN ('p-14', 'p-11', 'p-15');

-- =====================================================================
-- 4. 7 игроков/помощников. Если их в БД нет — создаём идемпотентно.
-- =====================================================================

-- Кокичи Ома
INSERT INTO participants (id, display_name, status, balance, reputation, sprite_sheet, sprite_y, password, is_registered, is_active)
VALUES ('p-kokichi', 'Кокичи Ома', 'player', 1200000, 0, 1, 86, NULL, FALSE, TRUE)
ON CONFLICT (id) DO UPDATE SET balance = 1200000, is_active = TRUE, status = 'player';

-- Нагито Комаэда
INSERT INTO participants (id, display_name, status, balance, reputation, sprite_sheet, sprite_y, password, is_registered, is_active)
VALUES ('p-nagito', 'Нагито Комаэда', 'player', 1000000, 0, 2, 86, NULL, FALSE, TRUE)
ON CONFLICT (id) DO UPDATE SET balance = 1000000, is_active = TRUE, status = 'player';

-- Микан Цумики
INSERT INTO participants (id, display_name, status, balance, reputation, sprite_sheet, sprite_y, password, is_registered, is_active)
VALUES ('p-mikan', 'Микан Цумики', 'player', 800000, 0, 3, 86, NULL, FALSE, TRUE)
ON CONFLICT (id) DO UPDATE SET balance = 800000, is_active = TRUE, status = 'player';

-- Пеко Пекояма
INSERT INTO participants (id, display_name, status, balance, reputation, sprite_sheet, sprite_y, password, is_registered, is_active)
VALUES ('p-peko', 'Пеко Пекояма', 'player', 1000000, 0, 1, 172, NULL, FALSE, TRUE)
ON CONFLICT (id) DO UPDATE SET balance = 1000000, is_active = TRUE, status = 'player';

-- Комару Наэги
INSERT INTO participants (id, display_name, status, balance, reputation, sprite_sheet, sprite_y, password, is_registered, is_active)
VALUES ('p-komaru', 'Комару Наэги', 'player', 1000000, 0, 2, 172, NULL, FALSE, TRUE)
ON CONFLICT (id) DO UPDATE SET balance = 1000000, is_active = TRUE, status = 'player';

-- Шуичи Сайхара
INSERT INTO participants (id, display_name, status, balance, reputation, sprite_sheet, sprite_y, password, is_registered, is_active)
VALUES ('p-shuichi', 'Шуичи Сайхара', 'player', 1000000, 0, 3, 172, NULL, FALSE, TRUE)
ON CONFLICT (id) DO UPDATE SET balance = 1000000, is_active = TRUE, status = 'player';

-- Леон Кувата (уже есть как p-8 — оставляем активным)
UPDATE participants SET balance = 1000000, status = 'player', is_active = TRUE WHERE id = 'p-8';

-- Ясухиро Хагакуре (p-6) — оставим активным как опционального запасного
UPDATE participants SET is_active = TRUE WHERE id = 'p-6';
-- Токо Фукава (p-4) — деактивируем
UPDATE participants SET is_active = FALSE WHERE id = 'p-4';

-- =====================================================================
-- 5. Аой Асахина (p-5) — оставим активным как 11-го, или деактивируем.
--    По ТЗ: 7 игроков/помощников. Список:
--    Кокичи, Нагито, Микан, Пеко, Комару, Шуичи, Леон.
--    Поэтому p-5 деактивируем. Вы можете включить вручную.
-- =====================================================================
UPDATE participants SET is_active = FALSE WHERE id = 'p-5';
UPDATE participants SET is_active = FALSE WHERE id = 'p-6';

-- =====================================================================
-- 6. Казна студсовета: 15M (было 50M в seed)
-- =====================================================================
UPDATE participants SET balance = 15000000 WHERE id = 'p-treasury';

-- =====================================================================
-- 7. Фонд Тогами: ставим в неактивных, если Бьякуи нет в активе.
-- =====================================================================
UPDATE participants SET balance = 8000000, is_active = FALSE
WHERE id = 'p-togami-fund';

-- Создаём, если фонда ещё нет
INSERT INTO participants (id, display_name, status, balance, reputation, sprite_sheet, sprite_y, password, is_registered, is_active)
VALUES ('p-togami-fund', 'Фонд Тогами', 'collector', 8000000, 0, NULL, NULL, NULL, FALSE, FALSE)
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- 8. Кредитный резерв Кируми (как отдельный системный аккаунт).
-- =====================================================================
INSERT INTO participants (id, display_name, status, balance, reputation, sprite_sheet, sprite_y, password, is_registered, is_active)
VALUES ('p-kirumi-fund', 'Кредитный резерв Кируми', 'collector', 8000000, 0, NULL, NULL, NULL, FALSE, TRUE)
ON CONFLICT (id) DO UPDATE SET balance = 8000000, is_active = TRUE;

-- =====================================================================
-- 9. Болванчики «Инкогнито» (3 шт, идемпотентно).
-- =====================================================================
INSERT INTO participants (id, display_name, status, balance, reputation, sprite_sheet, sprite_y, password, is_registered, is_active) VALUES
  ('p-incog-1', 'Инкогнито', 'player', 1000000, 0, NULL, NULL, NULL, FALSE, TRUE),
  ('p-incog-2', 'Инкогнито', 'player', 1000000, 0, NULL, NULL, NULL, FALSE, TRUE),
  ('p-incog-3', 'Инкогнито', 'player', 1000000, 0, NULL, NULL, NULL, FALSE, TRUE)
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- 10. Reload schema cache
-- =====================================================================
NOTIFY pgrst, 'reload schema';

-- Проверка
SELECT id, display_name, status, balance, is_active
FROM participants
WHERE is_active = TRUE
ORDER BY status, id;
