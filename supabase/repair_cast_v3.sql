-- =====================================================================
-- РЕМОНТ КАСТА v3
-- Гарантирует наличие всех канонических участников и убирает Фонд Тогами
-- из видимого состава игроков (он остаётся как системный аккаунт).
-- Запустить разово в Supabase SQL Editor.
-- =====================================================================

-- 1) Убедиться, что есть все ключевые участники
INSERT INTO participants (id, display_name, status, balance, reputation, sprite_sheet, sprite_y, password, is_registered, is_active) VALUES
  ('p-gm',         'Монокума',            'gm',       999999999, 100, NULL,  NULL, 'host_academy_2026', TRUE,  TRUE),
  ('p-treasury',   'Фонд Тогами',         'treasury', 15000000,  0,   NULL,  NULL, NULL,                FALSE, TRUE),
  ('p-queen',      'Селестия Люденберг',  'queen',    5000000,   50,  3,     86,   'queen_celestia_2026', TRUE, TRUE),
  ('p-1',          'Макото Наэги',        'player',   1000000,   60,  3,     0,    NULL, FALSE, FALSE),
  ('p-2',          'Кёко Киригири',       'player',   1500000,   70,  1,     86,   NULL, FALSE, FALSE),
  ('p-3',          'Бьякуя Тогами',       'player',   2000000,   80,  2,     86,   NULL, FALSE, FALSE),
  ('p-4',          'Токо Фукава',         'player',   800000,    40,  1,     172,  NULL, FALSE, FALSE),
  ('p-5',          'Аой Асахина',         'player',   900000,    65,  2,     172,  NULL, FALSE, FALSE),
  ('p-6',          'Ясухиро Хагакуре',    'player',   600000,    35,  3,     172,  NULL, FALSE, FALSE),
  ('p-7',          'Сакура Огами',        'player',   1200000,   75,  1,     258,  NULL, FALSE, FALSE),
  ('p-8',          'Леон Кувата',         'player',   1000000,   45,  2,     258,  NULL, FALSE, TRUE),
  ('p-9',          'Саяка Майзоно',       'player',   1100000,   70,  3,     258,  NULL, FALSE, FALSE),
  ('p-10',         'Чихиро Фуджисаки',    'player',   850000,    60,  1,     344,  NULL, FALSE, FALSE),
  ('p-11',         'Мондо Овада',         'elite',    3000000,   30,  2,     344,  NULL, FALSE, TRUE),
  ('p-12',         'Киётака Ишимару',     'player',   1050000,   65,  3,     344,  NULL, FALSE, FALSE),
  ('p-13',         'Хифуми Ямада',        'player',   500000,    30,  1,     430,  NULL, FALSE, FALSE),
  ('p-14',         'Джунко Эношима',      'elite',    3000000,   30,  2,     430,  NULL, FALSE, TRUE),
  ('p-15',         'Кируми Тоджо',        'elite',    3000000,   30,  3,     430,  NULL, FALSE, TRUE),
  ('p-kokichi',    'Кокичи Ома',          'player',   1200000,   0,   3,     516,  NULL, FALSE, TRUE),
  ('p-nagito',     'Нагито Комаэда',      'player',   1000000,   0,   3,     516,  NULL, FALSE, TRUE),
  ('p-mikan',      'Микан Цумики',        'player',   800000,    0,   3,     516,  NULL, FALSE, TRUE),
  ('p-peko',       'Пеко Пекояма',        'player',   1000000,   0,   3,     516,  NULL, FALSE, TRUE),
  ('p-komaru',     'Комару Наэги',        'player',   1000000,   0,   3,     0,    NULL, FALSE, TRUE),
  ('p-shuichi',    'Шуичи Сайхара',       'player',   1000000,   0,   3,     0,    NULL, FALSE, TRUE),
  ('p-incog-1',    'Инкогнито',           'player',   1000000,   0,   3,     0,    NULL, FALSE, TRUE),
  ('p-incog-2',    'Инкогнито',           'player',   1000000,   0,   3,     0,    NULL, FALSE, TRUE),
  ('p-incog-3',    'Инкогнито',           'player',   1000000,   0,   3,     0,    NULL, FALSE, TRUE)
ON CONFLICT (id) DO NOTHING;

-- 2) Если Фонд Тогами как отдельный игрок (p-togami-fund) был создан — переводим в системный
-- статус, чтобы он не отображался в списках игроков, но баланс не теряем (объединяем с p-treasury).
DO $$
DECLARE fund_balance BIGINT;
BEGIN
  SELECT balance INTO fund_balance FROM participants WHERE id = 'p-togami-fund';
  IF FOUND THEN
    UPDATE participants
       SET balance = balance + COALESCE(fund_balance, 0)
     WHERE id = 'p-treasury';
    UPDATE participants
       SET status = 'treasury', is_active = FALSE
     WHERE id = 'p-togami-fund';
  END IF;
END $$;

-- 3) Аналогично — кредитный резерв Кируми не должен висеть в списке.
UPDATE participants
   SET status = 'treasury', is_active = FALSE
 WHERE id IN ('p-kirumi-fund', 'p-kirumi-reserve');

-- 4) Перезагрузка кэша
NOTIFY pgrst, 'reload schema';

SELECT id, display_name, status, balance, is_active FROM participants ORDER BY id;
