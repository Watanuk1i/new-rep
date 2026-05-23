-- Таблица "Позвать на помощь" — игроки оставляют заявки, ведущий видит.
CREATE TABLE IF NOT EXISTS help_requests (
  id          TEXT PRIMARY KEY,
  author_id   TEXT NOT NULL,
  topic       TEXT NOT NULL,
  text        TEXT NOT NULL,
  status      TEXT DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  resolution  TEXT,
  resolved_by TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_help_requests_status ON help_requests(status);
CREATE INDEX IF NOT EXISTS idx_help_requests_author ON help_requests(author_id);

ALTER TABLE help_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_full_access ON help_requests;
CREATE POLICY anon_full_access ON help_requests
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE help_requests;
NOTIFY pgrst, 'reload schema';
