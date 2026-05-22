-- =====================================================================
-- МИГРАЦИЯ: Кредиты Кируми, Мондо-взыскание, Пеко-исполнение
-- =====================================================================
-- Запустить разово в Supabase SQL Editor.
-- Идемпотентно: повторный запуск не сломает данные.
-- =====================================================================

-- 1) Расширяем таблицу debts недостающими полями.
ALTER TABLE debts
  ADD COLUMN IF NOT EXISTS principal_amount BIGINT,
  ADD COLUMN IF NOT EXISTS interest_rate    NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source           TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_game_id   TEXT,
  ADD COLUMN IF NOT EXISTS collector_id     TEXT,
  ADD COLUMN IF NOT EXISTS executor_id      TEXT,
  ADD COLUMN IF NOT EXISTS collateral_text  TEXT,
  ADD COLUMN IF NOT EXISTS note             TEXT,
  ADD COLUMN IF NOT EXISTS paid_at          TIMESTAMPTZ;

-- Заполнить principal_amount = amount для старых долгов.
UPDATE debts SET principal_amount = amount
 WHERE principal_amount IS NULL;

-- 2) Расширяем перечень статусов.
-- Старые: requested, active, closed, declined, overdue, paid, auctioned, cancelled
-- Новые: + due_soon, collection, restructured, pet_candidate
-- В Postgres TEXT-колонка не имеет CHECK по умолчанию, добавим только если не существует.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'debts_status_check_v2'
  ) THEN
    ALTER TABLE debts
      ADD CONSTRAINT debts_status_check_v2
      CHECK (status IN (
        'requested','active','closed','declined','overdue','paid',
        'auctioned','cancelled','due_soon','collection',
        'restructured','pet_candidate'
      ));
  END IF;
END $$;

-- 3) Таблица заявок на кредит (LoanRequest).
CREATE TABLE IF NOT EXISTS loan_requests (
  id                  TEXT PRIMARY KEY,
  borrower_id         TEXT NOT NULL,
  requested_amount    BIGINT NOT NULL,
  reason              TEXT,
  requested_due_day   INT,
  comment             TEXT,

  status              TEXT DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','counter_offer','accepted','cancelled')),

  -- Контр-предложение от Кируми
  proposed_amount         BIGINT,
  proposed_interest_rate  NUMERIC(5,2),
  proposed_due_day        INT,
  collateral_text         TEXT,

  created_by_id TEXT,
  reviewed_by_id TEXT,
  resulting_debt_id TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loan_requests_status ON loan_requests(status);
CREATE INDEX IF NOT EXISTS idx_loan_requests_borrower ON loan_requests(borrower_id);

-- 4) Таблица выплат по долгу (DebtPayment).
CREATE TABLE IF NOT EXISTS debt_payments (
  id                TEXT PRIMARY KEY,
  debt_id           TEXT NOT NULL,
  payer_id          TEXT NOT NULL,
  amount            BIGINT NOT NULL,
  mondo_commission  BIGINT DEFAULT 0,
  peko_commission   BIGINT DEFAULT 0,
  owner_received    BIGINT DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_debt_payments_debt ON debt_payments(debt_id);

-- 5) Таблица заметок взыскания (Пеко / Мондо).
CREATE TABLE IF NOT EXISTS debt_collection_notes (
  id          TEXT PRIMARY KEY,
  debt_id     TEXT NOT NULL,
  author_id   TEXT NOT NULL,
  status      TEXT DEFAULT 'note'
    CHECK (status IN ('assigned','warned','refused','promised','partial_paid','report_sent','note')),
  text        TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_debt_notes_debt ON debt_collection_notes(debt_id);

-- 6) RLS: разрешаем чтение/запись anon (как и для остальных таблиц проекта).
ALTER TABLE loan_requests           ENABLE ROW LEVEL SECURITY;
ALTER TABLE debt_payments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE debt_collection_notes   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS anon_full_access ON loan_requests;
CREATE POLICY anon_full_access ON loan_requests
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS anon_full_access ON debt_payments;
CREATE POLICY anon_full_access ON debt_payments
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS anon_full_access ON debt_collection_notes;
CREATE POLICY anon_full_access ON debt_collection_notes
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 7) Realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE loan_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE debt_payments;
ALTER PUBLICATION supabase_realtime ADD TABLE debt_collection_notes;

-- 8) Reload schema
NOTIFY pgrst, 'reload schema';

-- Проверки
SELECT 'loan_requests' AS table, count(*) FROM loan_requests
UNION ALL SELECT 'debt_payments', count(*) FROM debt_payments
UNION ALL SELECT 'debt_collection_notes', count(*) FROM debt_collection_notes;
