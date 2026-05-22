-- 3 болванчика «Инкогнито» — игроки-заглушки для роли мест/манекенов и
-- наполнения состава. Идемпотентно. Не трогает существующие данные.

INSERT INTO participants (
  id, display_name, status, balance, reputation,
  sprite_sheet, sprite_y, password, is_registered, is_active
) VALUES
  ('p-incog-1', 'Инкогнито', 'player', 1000000, 0, NULL, NULL, NULL, FALSE, TRUE),
  ('p-incog-2', 'Инкогнито', 'player', 1000000, 0, NULL, NULL, NULL, FALSE, TRUE),
  ('p-incog-3', 'Инкогнито', 'player', 1000000, 0, NULL, NULL, NULL, FALSE, TRUE)
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';

SELECT id, display_name, status, balance FROM participants
WHERE id LIKE 'p-incog-%';
