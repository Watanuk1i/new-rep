-- =====================================================================
-- АКАДЕМИЯ — МИГРАЦИЯ V2: ЭКОНОМИКА И БОЛЬШАЯ ИГРА «КАРТОЧНЫЙ КОРАБЛЬ»
-- =====================================================================
-- Запускать в Supabase Dashboard → SQL Editor целиком ПОСЛЕ setup.sql.
-- Файл аддитивный: ничего из существующих таблиц не трогает.
-- Создаёт:
--   1. transfers — глобальные переводы йен между игроками
--   2. card_ship_games — отдельная Большая игра «Карточный корабль»
--   3. card_ship_states — состояние каждого игрока внутри игры
--   4. card_ship_duels — дуэли камень-ножницы-бумага
--   5. card_ship_listings — рынок игры (карты и звёзды на продажу)
-- =====================================================================

-- 1) Глобальные переводы йен
DROP TABLE IF EXISTS transfers CASCADE;
CREATE TABLE transfers (
  id TEXT PRIMARY KEY,
  sender_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  recipient_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  amount BIGINT NOT NULL CHECK (amount > 0),
  comment TEXT NOT NULL,
  related_game_id TEXT,                 -- если перевод связан с игрой
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_transfers_sender ON transfers(sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transfers_recipient ON transfers(recipient_id, created_at DESC);

-- 2) Карточный корабль — игра
DROP TABLE IF EXISTS card_ship_listings CASCADE;
DROP TABLE IF EXISTS card_ship_duels CASCADE;
DROP TABLE IF EXISTS card_ship_states CASCADE;
DROP TABLE IF EXISTS card_ship_games CASCADE;

CREATE TABLE card_ship_games (
  id TEXT PRIMARY KEY,
  super_game_id TEXT REFERENCES super_games(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'collecting_stakes',
    -- scheduled | collecting_stakes | active | finishing | finished | cancelled
  entry_fee BIGINT NOT NULL DEFAULT 100000,
  bank BIGINT NOT NULL DEFAULT 0,
  participant_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  winner_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3) Состояние игрока в игре (карты, звёзды, статус)
CREATE TABLE card_ship_states (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES card_ship_games(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  rocks INT NOT NULL DEFAULT 3,
  scissors INT NOT NULL DEFAULT 3,
  papers INT NOT NULL DEFAULT 3,
  stars INT NOT NULL DEFAULT 3,
  cards_played INT NOT NULL DEFAULT 0,
  duels_count INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
    -- active | out_of_cards | survived | lost
  UNIQUE (game_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_card_ship_states_game ON card_ship_states(game_id);

-- 4) Дуэли
CREATE TABLE card_ship_duels (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES card_ship_games(id) ON DELETE CASCADE,
  challenger_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  opponent_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
    -- pending | accepted | revealed | declined | cancelled | expired
  challenger_card TEXT,                 -- rock | scissors | paper
  opponent_card TEXT,
  winner_id TEXT,
  accept_deadline TIMESTAMPTZ,
  pick_deadline TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_card_ship_duels_game ON card_ship_duels(game_id, created_at DESC);

-- 5) Рынок игры
CREATE TABLE card_ship_listings (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES card_ship_games(id) ON DELETE CASCADE,
  seller_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL,              -- card | star
  card_type TEXT,                       -- rock | scissors | paper (если item_type='card')
  price BIGINT NOT NULL CHECK (price > 0),
  status TEXT NOT NULL DEFAULT 'open',  -- open | sold | cancelled
  buyer_id TEXT REFERENCES participants(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sold_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_card_ship_listings_game ON card_ship_listings(game_id, created_at DESC);

-- 6) Полностью отключаем RLS — у нас бизнес-логика на клиенте, как и в setup.sql
ALTER TABLE transfers           DISABLE ROW LEVEL SECURITY;
ALTER TABLE card_ship_games     DISABLE ROW LEVEL SECURITY;
ALTER TABLE card_ship_states    DISABLE ROW LEVEL SECURITY;
ALTER TABLE card_ship_duels     DISABLE ROW LEVEL SECURITY;
ALTER TABLE card_ship_listings  DISABLE ROW LEVEL SECURITY;

-- 7) GRANTы для anon/authenticated/service_role
GRANT ALL ON ALL TABLES    IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

-- 8) Перезагрузить PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- =====================================================================
-- ПРОВЕРКА: должны быть видны 5 новых таблиц
-- =====================================================================
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'transfers',
    'card_ship_games', 'card_ship_states',
    'card_ship_duels', 'card_ship_listings'
  )
ORDER BY table_name;

-- =====================================================================
-- REALTIME: после прогона миграции
-- Supabase → Database → Replication → publication "supabase_realtime"
-- → Edit → включить галочки на новых таблицах.
-- =====================================================================
