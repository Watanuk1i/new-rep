-- =====================================================================
-- Migration v4 — Combined (полная финальная миграция)
-- =====================================================================
-- Объединяет:
-- 1. patch_11_players (актуальный состав 11 игроков)
-- 2. migration_economy_v3 (Фонд Тогами 20M, Кредитный резерв Кируми 6M)
-- 3. migration_kirumi_contracts (договоры через Кируми)
-- 4. migration_loans_v2 (кредиты Кируми, взыскание Мондо/Пеко)
-- 5. migration_help_requests (SOS-кнопка)
-- 6. migration_rumors_v2 (слухи v2)
-- 7. migration_debt_games (игры на долг)
-- 8. big_game_unlocks (новое: каталог открытых Больших игр)
-- 9. Новые системные пароли host/queen
-- 10. NOTIFY pgrst, 'reload schema'
--
-- Запускать одним блоком в Supabase SQL Editor.
-- Идемпотентно: можно запускать повторно.
-- =====================================================================

-- ========== 1. ОСНОВНОЙ СОСТАВ ==========

UPDATE participants
   SET display_name = 'Фонд Тогами',
       balance = 20000000,
       status = 'treasury',
       is_active = TRUE
 WHERE id = 'p-treasury';

INSERT INTO participants (id, display_name, status, balance, reputation, is_active, is_registered)
VALUES ('p-kirumi-fund', 'Кредитный резерв Кируми', 'collector', 6000000, 0, TRUE, FALSE)
ON CONFLICT (id) DO UPDATE SET balance = 6000000, status = 'collector', is_active = TRUE;

UPDATE participants
   SET balance = 5000000, reputation = 50, status = 'queen', is_active = TRUE,
       password = 'Crimson_Veil_2099'
 WHERE id = 'p-queen';

UPDATE participants
   SET password = 'Tw1light_Throne_94', is_active = TRUE
 WHERE id = 'p-gm';

UPDATE participants SET status = 'elite', balance = 2500000, reputation = 30, is_active = TRUE WHERE id = 'p-14';
UPDATE participants SET status = 'elite', balance = 2500000, reputation = 30, is_active = TRUE WHERE id = 'p-11';
UPDATE participants SET status = 'elite', balance = 2500000, reputation = 30, is_active = TRUE WHERE id = 'p-15';

INSERT INTO participants (id, display_name, status, balance, reputation, sprite_sheet, sprite_y, is_active, is_registered)
VALUES ('p-kokichi', 'Кокичи Ома', 'player', 1500000, 0, 1, 86, TRUE, FALSE)
ON CONFLICT (id) DO UPDATE SET balance = 1500000, status = 'player', is_active = TRUE;

INSERT INTO participants (id, display_name, status, balance, reputation, sprite_sheet, sprite_y, is_active, is_registered)
VALUES ('p-peko', 'Пеко Пекояма', 'player', 1500000, 0, 3, 516, TRUE, FALSE)
ON CONFLICT (id) DO UPDATE SET balance = 1500000, status = 'player', is_active = TRUE;

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

UPDATE participants SET balance = 1000000, status = 'player', is_active = TRUE WHERE id = 'p-8';

-- Макото Наэги — активный (по запросу владельца)
INSERT INTO participants (id, display_name, status, balance, reputation, sprite_sheet, sprite_y, is_active, is_registered)
VALUES ('p-1', 'Макото Наэги', 'player', 1000000, 30, 1, 86, TRUE, FALSE)
ON CONFLICT (id) DO UPDATE SET balance = 1000000, status = 'player', is_active = TRUE, display_name = 'Макото Наэги';

-- Маки Харукава — новый активный
INSERT INTO participants (id, display_name, status, balance, reputation, sprite_sheet, sprite_y, is_active, is_registered)
VALUES ('p-maki', 'Маки Харукава', 'player', 1000000, 20, 2, 86, TRUE, FALSE)
ON CONFLICT (id) DO UPDATE SET balance = 1000000, status = 'player', is_active = TRUE, display_name = 'Маки Харукава';

-- Один активный Инкогнито
INSERT INTO participants (id, display_name, status, balance, reputation, is_active, is_registered)
VALUES ('p-incog-1', 'Инкогнито', 'player', 1000000, 0, TRUE, FALSE)
ON CONFLICT (id) DO UPDATE SET is_active = TRUE, display_name = 'Инкогнито';

-- Прочие старые персонажи — inactive (Макото p-1 убран из списка)
UPDATE participants SET is_active = FALSE
 WHERE id IN ('p-2','p-3','p-4','p-5','p-6','p-7','p-9','p-10','p-12','p-13','p-togami-fund','p-incog-2','p-incog-3');

-- ========== 2. ДОГОВОРЫ КИРУМИ ==========

CREATE TABLE IF NOT EXISTS kirumi_contracts (
  id                       TEXT PRIMARY KEY,
  creator_id               TEXT NOT NULL,
  counterparty_id          TEXT NOT NULL,
  payer_id                 TEXT NOT NULL,
  receiver_id              TEXT NOT NULL,
  performer_id             TEXT NOT NULL,
  amount                   BIGINT NOT NULL,
  payment_mode             TEXT NOT NULL DEFAULT 'escrow' CHECK (payment_mode IN ('escrow', 'instant')),
  frozen_amount            BIGINT DEFAULT 0,
  obligation_text          TEXT NOT NULL,
  reason                   TEXT,
  comment                  TEXT,
  due_type                 TEXT DEFAULT 'days' CHECK (due_type IN ('end_of_round','end_of_game','end_of_next_big_game','days','manual')),
  due_days                 INT,
  due_at                   TIMESTAMPTZ,
  verifier_type            TEXT DEFAULT 'kirumi' CHECK (verifier_type IN ('kirumi','mondo','peko','celestia','host','auto')),
  verifier_id              TEXT,
  breach_consequence       TEXT DEFAULT 'refund_plus_50' CHECK (breach_consequence IN ('refund','refund_plus_50','create_debt','send_to_mondo')),
  commission_amount        BIGINT DEFAULT 0,
  commission_payer_mode    TEXT DEFAULT 'creator' CHECK (commission_payer_mode IN ('creator','counterparty','split','manual')),
  commission_creator_amount      BIGINT DEFAULT 0,
  commission_counterparty_amount BIGINT DEFAULT 0,
  status                   TEXT DEFAULT 'pending' CHECK (status IN ('draft','pending','counter_offer','active','completed','expired','breached','disputed','cancelled','rejected')),
  created_debt_id          TEXT,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW(),
  signed_at                TIMESTAMPTZ,
  completed_at             TIMESTAMPTZ,
  breached_at              TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_kc_creator       ON kirumi_contracts(creator_id);
CREATE INDEX IF NOT EXISTS idx_kc_counterparty  ON kirumi_contracts(counterparty_id);
CREATE INDEX IF NOT EXISTS idx_kc_status        ON kirumi_contracts(status);
ALTER TABLE kirumi_contracts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_full_access ON kirumi_contracts;
CREATE POLICY anon_full_access ON kirumi_contracts FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ========== 3. КРЕДИТЫ КИРУМИ V2 ==========

CREATE TABLE IF NOT EXISTS loan_requests (
  id TEXT PRIMARY KEY,
  borrower_id TEXT NOT NULL,
  requested_amount BIGINT NOT NULL,
  reason TEXT,
  requested_due_day INT,
  comment TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  proposed_amount BIGINT,
  proposed_interest_rate INT,
  proposed_due_day INT,
  collateral_text TEXT,
  reviewed_by_id TEXT,
  resulting_debt_id TEXT,
  created_by_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE loan_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_full_access ON loan_requests;
CREATE POLICY anon_full_access ON loan_requests FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS debt_payments (
  id TEXT PRIMARY KEY,
  debt_id TEXT NOT NULL,
  payer_id TEXT NOT NULL,
  amount BIGINT NOT NULL,
  paid_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE debt_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_full_access ON debt_payments;
CREATE POLICY anon_full_access ON debt_payments FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS debt_collection_notes (
  id TEXT PRIMARY KEY,
  debt_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  status TEXT NOT NULL,
  text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE debt_collection_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_full_access ON debt_collection_notes;
CREATE POLICY anon_full_access ON debt_collection_notes FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Дополнительные колонки в debts (если их нет)
DO $$ BEGIN
  ALTER TABLE debts ADD COLUMN IF NOT EXISTS principal_amount BIGINT;
  ALTER TABLE debts ADD COLUMN IF NOT EXISTS interest_rate INT;
  ALTER TABLE debts ADD COLUMN IF NOT EXISTS due_day INT;
  ALTER TABLE debts ADD COLUMN IF NOT EXISTS source TEXT;
  ALTER TABLE debts ADD COLUMN IF NOT EXISTS collateral_text TEXT;
  ALTER TABLE debts ADD COLUMN IF NOT EXISTS collector_id TEXT;
  ALTER TABLE debts ADD COLUMN IF NOT EXISTS executor_id TEXT;
  ALTER TABLE debts ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
  ALTER TABLE debts ADD COLUMN IF NOT EXISTS initiator TEXT;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ========== 4. РАЗБЛОКИРОВКА БОЛЬШИХ ИГР ==========

CREATE TABLE IF NOT EXISTS big_game_unlocks (
  type TEXT PRIMARY KEY,           -- minority_rule, nine_bullets, и т.д.
  unlocked BOOLEAN NOT NULL DEFAULT FALSE,
  unlocked_at TIMESTAMPTZ,
  unlocked_by TEXT
);
ALTER TABLE big_game_unlocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_full_access ON big_game_unlocks;
CREATE POLICY anon_full_access ON big_game_unlocks FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Добавляем все 9 типов с unlocked = false
INSERT INTO big_game_unlocks (type, unlocked) VALUES
  ('minority_rule', FALSE),
  ('nine_bullets', FALSE),
  ('contraband', FALSE),
  ('royal_roulette', FALSE),
  ('debt_tower', FALSE),
  ('debt_auction', FALSE),
  ('elite_trial', FALSE),
  ('elite_candidate_trial', FALSE),
  ('throne_celestia', FALSE)
ON CONFLICT (type) DO NOTHING;

-- ========== 5. SOS / HELP REQUESTS ==========

CREATE TABLE IF NOT EXISTS help_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  topic TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  reply TEXT,
  replied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE help_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_full_access ON help_requests;
CREATE POLICY anon_full_access ON help_requests FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ========== 5b. ИГРЫ НА ДОЛГ ==========

CREATE TABLE IF NOT EXISTS debt_games (
  id                   TEXT PRIMARY KEY,
  type                 TEXT NOT NULL,
  status               TEXT DEFAULT 'created',
  debt_id              TEXT,
  debtor_id            TEXT NOT NULL,
  opponent_type        TEXT NOT NULL,
  opponent_id          TEXT,
  initial_debt_amount  BIGINT DEFAULT 0,
  result_debt_amount   BIGINT,
  state                JSONB DEFAULT '{}'::jsonb,
  result               TEXT,
  requires_approval    BOOLEAN DEFAULT FALSE,
  approved_by_id       TEXT,
  rules_snapshot       TEXT,
  result_description   TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW(),
  finished_at          TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_debt_games_status ON debt_games(status);
CREATE INDEX IF NOT EXISTS idx_debt_games_debtor ON debt_games(debtor_id);
CREATE INDEX IF NOT EXISTS idx_debt_games_debt   ON debt_games(debt_id);
ALTER TABLE debt_games ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_full_access ON debt_games;
CREATE POLICY anon_full_access ON debt_games FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS debt_game_actions (
  id           TEXT PRIMARY KEY,
  debt_game_id TEXT NOT NULL,
  player_id    TEXT NOT NULL,
  action_type  TEXT NOT NULL,
  value        TEXT,
  amount       BIGINT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_debt_game_actions_game ON debt_game_actions(debt_game_id);
ALTER TABLE debt_game_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_full_access ON debt_game_actions;
CREATE POLICY anon_full_access ON debt_game_actions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ========== 6. РЕАЛТАЙМ ==========

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE kirumi_contracts;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE loan_requests;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE debt_payments;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE debt_collection_notes;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE big_game_unlocks;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE help_requests;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE debt_games;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE debt_game_actions;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';

-- ========== ПРОВЕРКА ==========
SELECT 'participants' AS table_name, count(*) FROM participants WHERE is_active = TRUE
UNION ALL SELECT 'kirumi_contracts', count(*) FROM kirumi_contracts
UNION ALL SELECT 'loan_requests', count(*) FROM loan_requests
UNION ALL SELECT 'big_game_unlocks (unlocked)', count(*) FROM big_game_unlocks WHERE unlocked = TRUE;
