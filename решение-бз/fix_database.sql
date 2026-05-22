-- =====================================================================
-- ПОЛНАЯ ПОЧИНКА БД ЗА ОДИН ПРОГОН
-- =====================================================================
-- Запускать в Supabase Dashboard → SQL Editor целиком, кнопкой Run.
-- Используй когда:
--  - на /debug пишет "Seed: p-gm и p-queen ❌ найдено 0/2"
--  - сайт не видит игроков (participants строк: 0)
--  - не получается выбрать персонажа при регистрации
--
-- После запуска: Supabase → Settings → General → Pause project → 30 сек → Resume.
-- Потом на сайте /debug → Ctrl+F5.
-- =====================================================================

-- 1) ПОЛНЫЙ СБРОС
DROP TABLE IF EXISTS history          CASCADE;
DROP TABLE IF EXISTS notifications    CASCADE;
DROP TABLE IF EXISTS rumors           CASCADE;
DROP TABLE IF EXISTS events           CASCADE;
DROP TABLE IF EXISTS super_games      CASCADE;
DROP TABLE IF EXISTS debts            CASCADE;
DROP TABLE IF EXISTS pari             CASCADE;
DROP TABLE IF EXISTS challenges       CASCADE;
DROP TABLE IF EXISTS content_blocks   CASCADE;
DROP TABLE IF EXISTS participants     CASCADE;
DROP TABLE IF EXISTS room_state       CASCADE;
DROP TABLE IF EXISTS characters       CASCADE;
DROP TABLE IF EXISTS profiles         CASCADE;

-- 2) СХЕМА
CREATE TABLE room_state (
  id TEXT PRIMARY KEY DEFAULT 'academy',
  season INT NOT NULL DEFAULT 1,
  day INT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE participants (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  character_slug TEXT,
  custom_icon_url TEXT,
  sprite_sheet INT,
  sprite_y INT,
  sprite_size INT DEFAULT 86,
  sprite_x INT DEFAULT 0,
  balance BIGINT NOT NULL DEFAULT 1000000,
  status TEXT NOT NULL DEFAULT 'player',
  reputation INT NOT NULL DEFAULT 50,
  wins INT NOT NULL DEFAULT 0,
  losses INT NOT NULL DEFAULT 0,
  pet_owner_id TEXT REFERENCES participants(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  password TEXT,
  is_registered BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE challenges (
  id TEXT PRIMARY KEY,
  game_type TEXT NOT NULL,
  creator_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  opponent_id TEXT REFERENCES participants(id) ON DELETE SET NULL,
  stake_amount BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  winner_id TEXT REFERENCES participants(id) ON DELETE SET NULL,
  result_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE pari (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  is_anonymous BOOLEAN NOT NULL DEFAULT FALSE,
  title TEXT NOT NULL,
  description TEXT,
  options JSONB NOT NULL,
  bets JSONB NOT NULL DEFAULT '[]'::jsonb,
  comments JSONB NOT NULL DEFAULT '[]'::jsonb,
  commission_pct INT NOT NULL DEFAULT 5,
  closes_on_day INT NOT NULL DEFAULT 2,
  status TEXT NOT NULL DEFAULT 'open',
  resolved_option_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE debts (
  id TEXT PRIMARY KEY,
  debtor_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  creditor_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  amount BIGINT NOT NULL,
  description TEXT,
  due_day INT NOT NULL DEFAULT 2,
  status TEXT NOT NULL DEFAULT 'requested',
  initiator TEXT NOT NULL DEFAULT 'debtor',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE super_games (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT,
  rules TEXT,
  stakes TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',
  participant_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  starts_at TEXT,
  spectator_bets_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link_url TEXT,
  related_participant_id TEXT,
  is_for_gm_only BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  recipient_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link_url TEXT,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE rumors (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  is_anonymous BOOLEAN NOT NULL DEFAULT FALSE,
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  truth_level TEXT DEFAULT 'unknown',
  status TEXT NOT NULL DEFAULT 'active',
  closes_on_day INT,
  comments JSONB NOT NULL DEFAULT '[]'::jsonb,
  votes JSONB NOT NULL DEFAULT '{"true":[],"false":[]}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE content_blocks (
  id TEXT PRIMARY KEY,
  page TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE history (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  description TEXT,
  amount BIGINT,
  link_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3) RLS off + GRANTs (САМОЕ ВАЖНОЕ для anon-доступа!)
ALTER TABLE room_state      DISABLE ROW LEVEL SECURITY;
ALTER TABLE participants    DISABLE ROW LEVEL SECURITY;
ALTER TABLE challenges      DISABLE ROW LEVEL SECURITY;
ALTER TABLE pari            DISABLE ROW LEVEL SECURITY;
ALTER TABLE debts           DISABLE ROW LEVEL SECURITY;
ALTER TABLE super_games     DISABLE ROW LEVEL SECURITY;
ALTER TABLE events          DISABLE ROW LEVEL SECURITY;
ALTER TABLE notifications   DISABLE ROW LEVEL SECURITY;
ALTER TABLE rumors          DISABLE ROW LEVEL SECURITY;
ALTER TABLE content_blocks  DISABLE ROW LEVEL SECURITY;
ALTER TABLE history         DISABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES    IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

-- 4) Realtime publication
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime FOR TABLE
      participants, challenges, pari, debts, super_games,
      events, notifications, rumors, room_state, history, content_blocks;
  ELSE
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE participants;   EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE challenges;     EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE pari;           EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE debts;          EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE super_games;    EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE events;         EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE notifications;  EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE rumors;         EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE room_state;     EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE history;        EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE content_blocks; EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;

-- 5) ДАННЫЕ — 16 участников
INSERT INTO room_state (id, season, day) VALUES ('academy', 1, 1);

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

-- 6) Сброс PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- =====================================================================
-- ПРОВЕРКИ — должны вернуть:
--   total_participants = 16
--   anon_can_select    = true
--   2 строки: p-gm и p-queen
-- =====================================================================
SELECT count(*) AS total_participants FROM participants;

SELECT
  has_table_privilege('anon',          'public.participants', 'SELECT') AS anon_can_select,
  has_table_privilege('authenticated', 'public.participants', 'SELECT') AS auth_can_select;

SELECT id, display_name, status, password, is_registered
FROM participants
WHERE id IN ('p-gm', 'p-queen');
