-- =====================================================================
-- МИГРАЦИЯ: Игры на долг (debt-games)
-- =====================================================================
-- Запустить разово в Supabase SQL Editor. Идемпотентно.
--
-- Каждая игра привязана к конкретному долгу из таблицы debts.
-- state хранится как JSONB и содержит специфические поля игры.
-- =====================================================================

CREATE TABLE IF NOT EXISTS debt_games (
  id                   TEXT PRIMARY KEY,
  type                 TEXT NOT NULL
    CHECK (type IN (
      'three_seals',
      'collection_dice',
      'black_note',
      'last_payment',
      'delay_game',
      'kirumi_ransom_table'
    )),

  status               TEXT DEFAULT 'created'
    CHECK (status IN (
      'created','waiting_approval','approved','active','resolving','finished','cancelled'
    )),

  debt_id              TEXT,         -- FK на debts.id (мягкая)
  debtor_id            TEXT NOT NULL,
  opponent_type        TEXT NOT NULL
    CHECK (opponent_type IN ('kirumi','mondo','peko','owner','pet_owner','treasury','celestia')),
  opponent_id          TEXT,

  initial_debt_amount  BIGINT DEFAULT 0,
  result_debt_amount   BIGINT,

  state                JSONB DEFAULT '{}'::jsonb,

  result               TEXT
    CHECK (result IS NULL OR result IN (
      'debt_reduced','debt_increased','debt_unchanged','debt_paid',
      'due_extended','pet_candidate','buyout_reduced','buyout_increased',
      'transferred_to_mondo','requires_approval','cancelled'
    )),

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

-- Лог действий внутри игры (выборы карт, броски кубиков и т.п.)
CREATE TABLE IF NOT EXISTS debt_game_actions (
  id           TEXT PRIMARY KEY,
  debt_game_id TEXT NOT NULL,
  player_id    TEXT NOT NULL,
  action_type  TEXT NOT NULL
    CHECK (action_type IN (
      'choose_card','roll_dice','choose_risk','make_payment',
      'approve','reject','apply_result','note'
    )),
  value        TEXT,
  amount       BIGINT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_debt_game_actions_game ON debt_game_actions(debt_game_id);

-- RLS
ALTER TABLE debt_games        ENABLE ROW LEVEL SECURITY;
ALTER TABLE debt_game_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS anon_full_access ON debt_games;
CREATE POLICY anon_full_access ON debt_games
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS anon_full_access ON debt_game_actions;
CREATE POLICY anon_full_access ON debt_game_actions
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE debt_games;
ALTER PUBLICATION supabase_realtime ADD TABLE debt_game_actions;

NOTIFY pgrst, 'reload schema';

SELECT 'debt_games' AS table, count(*) FROM debt_games
UNION ALL SELECT 'debt_game_actions', count(*) FROM debt_game_actions;
