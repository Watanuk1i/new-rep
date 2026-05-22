-- Добавить Пеко Пекояму (p-peko) — исполнитель взыскания.
-- Запускать разово в Supabase SQL Editor. Идемпотентно.

INSERT INTO participants (
  id, display_name, status, balance, reputation,
  sprite_sheet, sprite_y, password, is_registered, is_active
) VALUES (
  'p-peko', 'Пеко Пекояма', 'player', 800000, 60,
  3, 516, NULL, FALSE, TRUE
)
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';

SELECT id, display_name, status, balance FROM participants WHERE id = 'p-peko';
