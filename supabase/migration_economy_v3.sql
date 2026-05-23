-- =====================================================================
-- Migration: Economy v3 (full rework)
-- По спеке claude_opus_full_economy_games_rules_rework.txt
-- - Фонд Тогами: 20 000 000 (p-treasury)
-- - Кредитный резерв Кируми: 6 000 000 (p-kirumi-fund)
-- - 11 активных игроков с новыми балансами
-- - Бьякуя (p-3): inactive
-- - Старые персонажи: inactive
-- =====================================================================

-- 1) Фонд Тогами (системный банк академии)
UPDATE participants
   SET display_name = 'Фонд Тогами',
       balance = 20000000,
       status = 'treasury',
       is_active = TRUE
 WHERE id = 'p-treasury';

-- 2) Кредитный резерв Кируми
INSERT INTO participants (id, display_name, status, balance, reputation, is_active, is_registered)
VALUES ('p-kirumi-fund', 'Кредитный резерв Кируми', 'collector', 6000000, 0, TRUE, FALSE)
ON CONFLICT (id) DO UPDATE
   SET display_name = EXCLUDED.display_name,
       balance      = 6000000,
       status       = 'collector',
       is_active    = TRUE;

-- 3) Селестия — Директор
UPDATE participants
   SET balance = 5000000, reputation = 50, status = 'queen', is_active = TRUE
 WHERE id = 'p-queen';

-- 4) Элита (3 человека)
UPDATE participants SET status = 'elite', balance = 2500000, reputation = 30, is_active = TRUE WHERE id = 'p-14'; -- Джунко
UPDATE participants SET status = 'elite', balance = 2500000, reputation = 30, is_active = TRUE WHERE id = 'p-11'; -- Мондо
UPDATE participants SET status = 'elite', balance = 2500000, reputation = 30, is_active = TRUE WHERE id = 'p-15'; -- Кируми

-- 5) Кокичи и Пеко — 1.5M
INSERT INTO participants (id, display_name, status, balance, reputation, sprite_sheet, sprite_y, is_active, is_registered)
VALUES ('p-kokichi', 'Кокичи Ома', 'player', 1500000, 0, 1, 86, TRUE, FALSE)
ON CONFLICT (id) DO UPDATE SET balance = 1500000, status = 'player', is_active = TRUE;

INSERT INTO participants (id, display_name, status, balance, reputation, sprite_sheet, sprite_y, is_active, is_registered)
VALUES ('p-peko', 'Пеко Пекояма', 'player', 1500000, 0, 3, 516, TRUE, FALSE)
ON CONFLICT (id) DO UPDATE SET balance = 1500000, status = 'player', is_active = TRUE;

-- 6) Остальные 5 игроков по 1M
INSERT INTO participants (id, display_name, status, balance, reputation, sprite_sheet, sprite_y, is_active, is_registered)
VALUES ('p-nagito', 'Нагито Комаэда', 'player', 1000000, 0, 2, 86, TRUE, FALSE)
ON CONFLICT (id) DO UPDATE SET balance = 1000000, status = 'player', is_active = TRUE;

INSERT INTO participants (id, display_name, status, balance, reputation, sprite_sheet, sprite_y, is_active, is_registered)
VALUES ('p-mikan', 'Микан Цумики', 'player', 1000000, 0, 3, 86, TRUE, FALSE)
ON CONFLICT (id) DO UPDATE SET balance = 1000000, status = 'player', is_active = TRUE;

INSERT INTO participants (id, display_name, status, balance, reputation, sprite_sheet, sprite_y, is_active, is_registered)
VALUES ('p-komaru', 'Комару Наэги', 'player', 1000000, 0, 2, 172, TRUE, FALSE)
ON CONFLICT (id) DO UPDATE SET balance = 1000000, status = 'player', is_active = TRUE;

INSERT INTO participants (id, display_name, status, balance, reputation, sprite_sheet, sprite_y, is_active, is_registered)
VALUES ('p-shuichi', 'Шуичи Сайхара', 'player', 1000000, 0, 3, 172, TRUE, FALSE)
ON CONFLICT (id) DO UPDATE SET balance = 1000000, status = 'player', is_active = TRUE;

UPDATE participants SET balance = 1000000, status = 'player', is_active = TRUE WHERE id = 'p-8'; -- Леон

-- 7) Бьякуя — inactive (по спеке: "если есть в базе, перевести в inactive/archived, но не удалять")
UPDATE participants SET is_active = FALSE WHERE id = 'p-3';

-- 8) Прочие старые персонажи — inactive (если они есть)
UPDATE participants SET is_active = FALSE
 WHERE id IN ('p-1','p-2','p-4','p-5','p-6','p-7','p-9','p-10','p-12','p-13');

-- 9) Архивный «p-togami-fund» (старый отдельный фонд) — inactive,
--    т.к. фонд теперь объединён с p-treasury.
UPDATE participants SET is_active = FALSE WHERE id = 'p-togami-fund';

-- 10) Reload schema cache
NOTIFY pgrst, 'reload schema';

-- Проверка: активный состав
SELECT id, display_name, status, balance, is_active
  FROM participants
 WHERE is_active = TRUE
 ORDER BY status, id;
