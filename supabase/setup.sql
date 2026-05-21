-- =====================================================================
-- АКАДЕМИЯ — ПОЛНАЯ УСТАНОВКА БД ЗА ОДИН ПРОГОН
-- =====================================================================
-- Запускать в Supabase → SQL Editor целиком, одной кнопкой Run.
-- Что делает:
--  1) ДРОПАЕТ все наши таблицы (если были) — чистый сброс.
--  2) Создаёт схему заново.
--  3) Включает Realtime publication для всех таблиц.
--  4) Засеивает 16 участников с правильными id и паролями + room_state.
--  5) Перезагружает PostgREST schema cache.
-- В конце — SELECT который покажет все 16 участников.
-- =====================================================================

-- =========================================================
-- 1) ПОЛНЫЙ СБРОС
-- =========================================================
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
-- На случай артефактов от очень старой схемы:
DROP TABLE IF EXISTS characters       CASCADE;
DROP TABLE IF EXISTS profiles         CASCADE;

-- =========================================================
-- 2) СХЕМА
-- =========================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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

CREATE INDEX idx_challenges_status   ON challenges(status);
CREATE INDEX idx_challenges_creator  ON challenges(creator_id);
CREATE INDEX idx_challenges_opponent ON challenges(opponent_id);
CREATE INDEX idx_pari_status         ON pari(status);
CREATE INDEX idx_debts_status        ON debts(status);
CREATE INDEX idx_notifications_recipient ON notifications(recipient_id, is_read);
CREATE INDEX idx_history_participant ON history(participant_id, created_at DESC);
CREATE INDEX idx_events_created      ON events(created_at DESC);

-- =========================================================
-- 3) RLS отключаем (публичный доступ через anon)
-- =========================================================
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

-- =========================================================
-- 4) REALTIME publication (создаём если нет, иначе добавляем таблицы)
-- =========================================================
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

-- =========================================================
-- 5) ДАННЫЕ
-- =========================================================
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

-- =========================================================
-- 6) ПЕРЕЗАГРУЗКА КЭША POSTGREST
-- =========================================================
NOTIFY pgrst, 'reload schema';

-- =========================================================
-- ПРОВЕРКА: должно быть 16 строк, в т.ч. p-gm и p-queen
-- =========================================================
SELECT
  id,
  display_name,
  status,
  COALESCE(password, '(нет — любой пароль)') AS password,
  is_registered
FROM participants
ORDER BY
  CASE status WHEN 'gm' THEN 0 WHEN 'queen' THEN 1 ELSE 2 END,
  id;
