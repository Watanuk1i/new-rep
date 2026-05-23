-- =====================================================================
-- МИГРАЦИЯ: Договоры через Кируми
-- =====================================================================
-- Запустить разово в Supabase SQL Editor. Идемпотентно.
-- =====================================================================

CREATE TABLE IF NOT EXISTS kirumi_contracts (
  id                       TEXT PRIMARY KEY,

  creator_id               TEXT NOT NULL,
  counterparty_id          TEXT NOT NULL,
  payer_id                 TEXT NOT NULL,
  receiver_id              TEXT NOT NULL,
  performer_id             TEXT NOT NULL,

  amount                   BIGINT NOT NULL,
  payment_mode             TEXT NOT NULL DEFAULT 'escrow'
    CHECK (payment_mode IN ('escrow', 'instant')),
  frozen_amount            BIGINT DEFAULT 0,

  obligation_text          TEXT NOT NULL,
  reason                   TEXT,
  comment                  TEXT,

  due_type                 TEXT DEFAULT 'days'
    CHECK (due_type IN ('end_of_round','end_of_game','end_of_next_big_game','days','manual')),
  due_days                 INT,
  due_at                   TIMESTAMPTZ,

  verifier_type            TEXT DEFAULT 'kirumi'
    CHECK (verifier_type IN ('kirumi','mondo','peko','celestia','host','auto')),
  verifier_id              TEXT,

  breach_consequence       TEXT DEFAULT 'refund_plus_50'
    CHECK (breach_consequence IN ('refund','refund_plus_50','create_debt','send_to_mondo')),

  commission_amount        BIGINT DEFAULT 0,
  commission_payer_mode    TEXT DEFAULT 'creator'
    CHECK (commission_payer_mode IN ('creator','counterparty','split','manual')),
  commission_creator_amount      BIGINT DEFAULT 0,
  commission_counterparty_amount BIGINT DEFAULT 0,

  status                   TEXT DEFAULT 'pending'
    CHECK (status IN ('draft','pending','counter_offer','active','completed','expired','breached','disputed','cancelled','rejected')),

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
CREATE POLICY anon_full_access ON kirumi_contracts
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE kirumi_contracts;
NOTIFY pgrst, 'reload schema';
