-- =====================================================================
-- МИГРАЦИЯ Слухи v2: цель + тип + закрытие Селестией
-- Запустить разово в Supabase SQL Editor. Идемпотентно.
-- =====================================================================

ALTER TABLE rumors
  ADD COLUMN IF NOT EXISTS target_player_id        TEXT,
  ADD COLUMN IF NOT EXISTS initial_type            TEXT
    CHECK (initial_type IS NULL OR initial_type IN ('positive', 'negative')),
  ADD COLUMN IF NOT EXISTS final_result            TEXT
    CHECK (final_result IS NULL OR final_result IN ('positive', 'negative', 'neutral')),
  ADD COLUMN IF NOT EXISTS reputation_delta_target INTEGER,
  ADD COLUMN IF NOT EXISTS reputation_delta_author INTEGER,
  ADD COLUMN IF NOT EXISTS close_comment           TEXT,
  ADD COLUMN IF NOT EXISTS closed_by_id            TEXT,
  ADD COLUMN IF NOT EXISTS closed_at               TIMESTAMPTZ;

-- Старые слухи: если был truth_level, проставим initial_type
UPDATE rumors
   SET initial_type = CASE
     WHEN truth_level = 'true' THEN 'positive'
     WHEN truth_level = 'false' THEN 'negative'
     ELSE 'positive'
   END
 WHERE initial_type IS NULL;

CREATE INDEX IF NOT EXISTS idx_rumors_target ON rumors(target_player_id);
CREATE INDEX IF NOT EXISTS idx_rumors_status ON rumors(status);

NOTIFY pgrst, 'reload schema';
