-- =====================================================================
-- АКАДЕМИЯ — ЕДИНЫЙ SQL-ФАЙЛ ДЛЯ УСТАНОВКИ БД
-- =====================================================================
-- Запускать в Supabase Dashboard → SQL Editor целиком, кнопкой Run.
-- Делает за один проход:
--   1. Сбрасывает все таблицы и старые артефакты (включая V2-экономику).
--   2. Создаёт схему заново (включая Казну, Большие игры и Карточный корабль).
--   3. Включает RPC-функции для атомарных переводов / голосования / аукциона.
--   4. Выдаёт права anon/authenticated/service_role.
--   5. Засеивает room_state, 16 участников + Казну студсовета.
--   6. Перезагружает PostgREST schema cache.
-- В конце 4 SELECT-а для проверки.
-- =====================================================================

-- =====================================================================
-- 1) ПОЛНЫЙ СБРОС
-- =====================================================================
-- Сначала V2 (зависят от super_games / participants), потом базовые.
DROP TABLE IF EXISTS card_ship_listings CASCADE;
DROP TABLE IF EXISTS card_ship_duels    CASCADE;
DROP TABLE IF EXISTS card_ship_states   CASCADE;
DROP TABLE IF EXISTS card_ship_games    CASCADE;
DROP TABLE IF EXISTS transfers          CASCADE;

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

-- =====================================================================
-- 2) БАЗОВАЯ СХЕМА
-- =====================================================================
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
  entry_fee BIGINT NOT NULL DEFAULT 100000,
  bank BIGINT NOT NULL DEFAULT 0,
  winner_id TEXT REFERENCES participants(id) ON DELETE SET NULL,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
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

-- =====================================================================
-- 3) V2-СХЕМА: ГЛОБАЛЬНЫЕ ПЕРЕВОДЫ + БОЛЬШАЯ ИГРА «КАРТОЧНЫЙ КОРАБЛЬ»
-- =====================================================================

-- 3.1) Глобальные переводы йен между игроками
CREATE TABLE transfers (
  id TEXT PRIMARY KEY,
  sender_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  recipient_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  amount BIGINT NOT NULL CHECK (amount > 0),
  comment TEXT NOT NULL,
  related_game_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_transfers_sender    ON transfers(sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transfers_recipient ON transfers(recipient_id, created_at DESC);

-- 3.2) Карточный корабль — игра
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

-- 3.3) Состояние игрока в Карточном корабле
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

-- 3.4) Дуэли камень-ножницы-бумага
CREATE TABLE card_ship_duels (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES card_ship_games(id) ON DELETE CASCADE,
  challenger_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  opponent_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
    -- pending | accepted | revealed | declined | cancelled | expired
  challenger_card TEXT,
  opponent_card TEXT,
  winner_id TEXT,
  accept_deadline TIMESTAMPTZ,
  pick_deadline TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_card_ship_duels_game ON card_ship_duels(game_id, created_at DESC);

-- 3.5) Рынок Карточного корабля (карты и звёзды на продажу)
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

-- =====================================================================
-- 4) RLS off, GRANTs on. Это самое важное для anon-доступа с сайта.
--
-- ВАЖНО: дополнительно создаём политику anon_full_access на каждой таблице
-- как страховку. Если кто-то в Supabase Dashboard включит RLS обратно
-- (или сработает «Harden Data API» / автонастройка для новых таблиц),
-- доступ для anon/authenticated всё равно останется и сайт не отдаст [].
-- =====================================================================
DO $rls$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'room_state','participants','challenges','pari','debts','super_games',
    'events','notifications','rumors','content_blocks','history',
    'transfers','card_ship_games','card_ship_states','card_ship_duels','card_ship_listings'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- 1) RLS выключен — дефолт проекта.
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t);
    -- 2) Но политика всё равно есть на случай, если RLS включат обратно.
    EXECUTE format('DROP POLICY IF EXISTS anon_full_access ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY anon_full_access ON public.%I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)',
      t
    );
  END LOOP;
END
$rls$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES    IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

-- Принудительный reload PostgREST schema cache (исправляет ошибки 406/schema cache).
NOTIFY pgrst, 'reload schema';

-- =====================================================================
-- 5) ДАННЫЕ
-- =====================================================================
INSERT INTO room_state (id, season, day) VALUES ('academy', 1, 1);

INSERT INTO participants (id, display_name, status, balance, reputation, sprite_sheet, sprite_y, password, is_registered) VALUES
  ('p-gm',       'Монокума',           'gm',       999999999, 100, NULL, NULL, 'host_academy_2026',   TRUE),
  ('p-treasury', 'Казна студсовета',   'treasury', 50000000,  0,   NULL, NULL, NULL,                  FALSE),
  ('p-queen',    'Селестия Люденберг', 'queen',    9500000,   95,  1,    0,    'queen_celestia_2026', TRUE),
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
  ('p-14',    'Джунко Эношима',     'player', 1500000,    60,    2,  430, NULL, FALSE),
  ('p-15',    'Кируми Тоджо',       'player', 1300000,    70,    3,  430, NULL, FALSE);

-- =====================================================================
-- 6) RPC ФУНКЦИИ (ATOMIC)
-- =====================================================================

-- 6.1) apply_transfer: атомарный перевод между двумя участниками
-- При нехватке средств у плательщика автоматически создаётся запись в debts.
CREATE OR REPLACE FUNCTION apply_transfer(
  p_from   TEXT,
  p_to     TEXT,
  p_amount BIGINT,
  p_reason TEXT,
  p_link   TEXT DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql
AS $func$
DECLARE
  from_balance BIGINT;
  debt_id      TEXT;
  rand_suffix  TEXT;
BEGIN
  IF p_amount <= 0 THEN RETURN ''; END IF;
  IF p_from = p_to THEN RETURN ''; END IF;

  UPDATE participants SET balance = balance - p_amount
   WHERE id = p_from RETURNING balance INTO from_balance;
  IF from_balance IS NULL THEN
    RAISE EXCEPTION 'apply_transfer: участник % не найден', p_from;
  END IF;

  UPDATE participants SET balance = balance + p_amount WHERE id = p_to;

  IF from_balance < 0 THEN
    rand_suffix := substring(md5(random()::text || clock_timestamp()::text), 1, 8);
    debt_id := 'd-' || extract(epoch from clock_timestamp())::bigint || '-' || rand_suffix;
    INSERT INTO debts (id, debtor_id, creditor_id, amount, description, due_day, status, initiator)
    VALUES (debt_id, p_from, p_to, -from_balance, p_reason, 1, 'active', 'creditor');
  END IF;

  INSERT INTO history (id, participant_id, action, description, amount, link_url) VALUES
    ('h-' || extract(epoch from clock_timestamp())::bigint || '-' || substring(md5(random()::text), 1, 6),
     p_from, 'tx_out', p_reason, -p_amount, p_link),
    ('h-' || extract(epoch from clock_timestamp())::bigint || '-' || substring(md5(random()::text), 1, 8),
     p_to,   'tx_in',  p_reason,  p_amount, p_link);

  RETURN COALESCE(debt_id, '');
END;
$func$;

-- 6.2) cast_minority_vote: атомарный голос в правиле меньшинства
CREATE OR REPLACE FUNCTION cast_minority_vote(
  p_game_id TEXT, p_voter_id TEXT, p_choice TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
AS $func$
DECLARE affected INT;
BEGIN
  IF p_choice NOT IN ('yes','no') THEN
    RAISE EXCEPTION 'cast_minority_vote: choice должно быть yes или no';
  END IF;
  UPDATE super_games
     SET state = jsonb_set(state, ARRAY['round','votes',p_voter_id], to_jsonb(p_choice), true)
   WHERE id = p_game_id AND status = 'live'
     AND state->'round'->>'status' = 'open'
     AND COALESCE(state->'round'->'votes' ? p_voter_id, FALSE) = FALSE;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected > 0;
END;
$func$;

-- 6.3) place_seat_bid: атомарная ставка в слепом аукционе «Комнаты девяти патронов»
CREATE OR REPLACE FUNCTION place_seat_bid(
  p_game_id TEXT, p_round_idx INT, p_bidder_id TEXT, p_seat INT, p_amount BIGINT
) RETURNS BOOLEAN
LANGUAGE plpgsql
AS $func$
DECLARE affected INT;
BEGIN
  IF p_seat < 1 OR p_seat > 9 THEN RAISE EXCEPTION 'seat должен быть 1..9'; END IF;
  IF p_amount < 0 OR p_amount > 100000 THEN RAISE EXCEPTION 'amount должен быть 0..100000'; END IF;
  UPDATE super_games
     SET state = jsonb_set(
       state,
       ARRAY['rounds', p_round_idx::text, 'bids', p_bidder_id],
       jsonb_build_object('seat', p_seat, 'amount', p_amount),
       true
     )
   WHERE id = p_game_id AND status = 'live'
     AND state->'rounds'->p_round_idx->>'auction_status' = 'open'
     AND COALESCE(state->'rounds'->p_round_idx->'sitters_ids' ? p_bidder_id, FALSE) = TRUE
     AND COALESCE(state->'rounds'->p_round_idx->'bids' ? p_bidder_id, FALSE) = FALSE;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected > 0;
END;
$func$;

GRANT EXECUTE ON FUNCTION apply_transfer(TEXT,TEXT,BIGINT,TEXT,TEXT)    TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION cast_minority_vote(TEXT,TEXT,TEXT)            TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION place_seat_bid(TEXT,INT,TEXT,INT,BIGINT)      TO anon, authenticated, service_role;

-- =====================================================================
-- 7) Перезагрузить PostgREST schema cache
-- =====================================================================
NOTIFY pgrst, 'reload schema';

-- =====================================================================
-- 8) ПРОВЕРКИ. Должны вернуть:
--   (a) 16 участников (16 строк)
--   (b) anon_can_select = true, auth_can_select = true
--   (c) p-gm + p-queen + p-treasury (системные аккаунты)
--   (d) 5 V2-таблиц видны
-- =====================================================================
SELECT count(*) AS total_participants FROM participants;

SELECT
  has_table_privilege('anon',          'public.participants', 'SELECT') AS anon_can_select,
  has_table_privilege('authenticated', 'public.participants', 'SELECT') AS auth_can_select;

SELECT id, display_name, status, password, is_registered
FROM participants
WHERE id IN ('p-gm', 'p-queen', 'p-treasury')
ORDER BY id;

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
-- REALTIME (опционально, если нужны live-обновления на сайте):
--   Открой Supabase → Database → Replication → publication
--   "supabase_realtime" → нажми Edit → включи галочки на всех таблицах:
--   participants, challenges, pari, debts, super_games, events,
--   notifications, rumors, room_state, history, content_blocks,
--   transfers, card_ship_games, card_ship_states, card_ship_duels,
--   card_ship_listings.
-- Без этого сайт всё равно будет работать, просто без живых обновлений.
-- =====================================================================
