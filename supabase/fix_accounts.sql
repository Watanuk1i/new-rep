-- ================================================================
-- FIX: пересоздать 16 участников Академии с правильными id/паролями
-- ================================================================
-- Запускать в Supabase SQL Editor разом, целиком.
-- Удалит ВСЕХ участников (и связанные pari/debts/notifications/history через CASCADE)
-- и заново засеет 16 базовых: p-gm, p-queen, p-1..p-14.
-- Используй когда логин host/queen не работает (значит id-шки кривые,
-- либо какое-то расхождение между схемой и сидом).

-- 1) Чистим
TRUNCATE participants RESTART IDENTITY CASCADE;

-- 2) Заново сеим 16 участников (9 колонок, 9 значений в каждой строке)
INSERT INTO participants (id, display_name, status, balance, reputation, sprite_sheet, sprite_y, password, is_registered) VALUES
  ('p-gm',    'Монокума',           'gm',     999999999, 100, NULL, NULL, 'host_academy_2026',   TRUE),
  ('p-queen', 'Селестия Люденберг', 'queen',  9500000,    95,    1,    0, 'queen_celestia_2026', TRUE),
  ('p-1',     'Макото Наэги',       'player', 1000000,    60,    1,   86, NULL, FALSE),
  ('p-2',     'Кёко Киригири',      'player', 1500000,    70,    2,   86, NULL, FALSE),
  ('p-3',     'Бьякуя Тогами',      'player', 2000000,    80,    3,   86, NULL, FALSE),
  ('p-4',     'Токо Фукава',        'player', 800000,     40,    1,  172, NULL, FALSE),
  ('p-5',     'Аой Асахина',        'player', 900000,     65,    2,  172, NULL, FALSE),
  ('p-6',     'Ясухиро Хагакуре',   'player', 600000,     35,    3,  172, NULL, FALSE),
  ('p-7',     'Сакура Огами',       'player', 1200000,    75,    1,  258, NULL, FALSE),
  ('p-8',     'Леон Кувата',        'player', 700000,     45,    2,  258, NULL, FALSE),
  ('p-9',     'Саяка Майзоно',      'player', 1100000,    70,    3,  258, NULL, FALSE),
  ('p-10',    'Чихиро Фуджисаки',   'player', 850000,     60,    1,  344, NULL, FALSE),
  ('p-11',    'Мондо Овада',        'player', 950000,     50,    2,  344, NULL, FALSE),
  ('p-12',    'Киётака Ишимару',    'player', 1050000,    65,    3,  344, NULL, FALSE),
  ('p-13',    'Хифуми Ямада',       'player', 500000,     30,    1,  430, NULL, FALSE),
  ('p-14',    'Джунко Эношима',     'player', 1500000,    60,    2,  430, NULL, FALSE);

-- 3) Чиним room_state (если строки нет)
INSERT INTO room_state (id, season, day) VALUES ('academy', 1, 1)
ON CONFLICT (id) DO NOTHING;

-- 3.5) Дать anon/authenticated явные права читать таблицы
--      (на случай если они были потеряны)
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
  TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public
  TO anon, authenticated, service_role;

-- 4) Сбрасываем PostgREST-кэш схемы
--    (убирает ошибку "Could not find the table 'public.X' in the schema cache")
NOTIFY pgrst, 'reload schema';

-- 5) Проверка: посмотри, что получилось
SELECT id, display_name, status,
       COALESCE(password, '(нет — любой пароль)') AS password,
       is_registered, balance
FROM participants
ORDER BY
  CASE status WHEN 'gm' THEN 0 WHEN 'queen' THEN 1 ELSE 2 END,
  id;
