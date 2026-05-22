-- Дополнение к существующей БД: добавляет Кируми Тоджо и системный Фонд Тогами.
-- Запускать в Supabase SQL Editor. Идемпотентно: повторный запуск ничего не сломает.
-- Никакие существующие данные не удаляются.

-- 1) Кируми Тоджо (p-15)
INSERT INTO participants (
  id, display_name, status, balance, reputation,
  sprite_sheet, sprite_y, password, is_registered
) VALUES (
  'p-15', 'Кируми Тоджо', 'player', 1300000, 70,
  3, 430, NULL, FALSE
)
ON CONFLICT (id) DO NOTHING;

-- 2) Фонд Тогами (p-togami-fund) — системный аккаунт капитала Бьякуи.
-- Стартовый баланс 20 000 000.
INSERT INTO participants (
  id, display_name, status, balance, reputation,
  sprite_sheet, sprite_y, password, is_registered, is_active
) VALUES (
  'p-togami-fund', 'Фонд Тогами', 'collector', 20000000, 0,
  NULL, NULL, NULL, FALSE, TRUE
)
ON CONFLICT (id) DO NOTHING;

-- 3) Запись в историю о создании Фонда (только если фонд только что создался)
INSERT INTO history (id, participant_id, action, description, amount)
SELECT
  'h-togami-init',
  'p-togami-fund',
  'fund_created',
  'Создан Фонд Тогами со стартовым балансом 20 000 000',
  20000000
WHERE EXISTS (SELECT 1 FROM participants WHERE id = 'p-togami-fund')
ON CONFLICT (id) DO NOTHING;

-- 4) Reload schema cache
NOTIFY pgrst, 'reload schema';

-- Проверки
SELECT id, display_name, status, balance FROM participants
WHERE id IN ('p-15', 'p-togami-fund');
