-- =====================================================================
-- Migration: Realtime check
-- =====================================================================
-- Гарантирует, что все таблицы участвуют в supabase_realtime publication
-- и что у анонимной роли есть полный доступ через RLS.
-- Запустить в Supabase SQL Editor если игры с взаимодействием в реальном
-- времени не обновляются у других игроков.
-- Идемпотентно.
-- =====================================================================

-- 1) Realtime publication для всех ключевых таблиц
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'participants','room_state','challenges','pari','debts','super_games',
    'events','notifications','rumors','history','transfers','content_blocks',
    'card_ship_games','card_ship_states','card_ship_duels','card_ship_listings',
    'kirumi_contracts','loan_requests','debt_payments','debt_collection_notes',
    'help_requests','debt_games','debt_game_actions','big_game_unlocks'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    EXCEPTION
      WHEN duplicate_object THEN NULL;  -- уже добавлено
      WHEN undefined_table THEN NULL;   -- таблицы нет — пропускаем
      WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;

-- 2) RLS — открываем полный доступ для anon/authenticated на всех таблицах
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'participants','room_state','challenges','pari','debts','super_games',
    'events','notifications','rumors','history','transfers','content_blocks',
    'card_ship_games','card_ship_states','card_ship_duels','card_ship_listings',
    'kirumi_contracts','loan_requests','debt_payments','debt_collection_notes',
    'help_requests','debt_games','debt_game_actions','big_game_unlocks'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS anon_full_access ON %I', t);
      EXECUTE format('CREATE POLICY anon_full_access ON %I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)', t);
    EXCEPTION
      WHEN undefined_table THEN NULL;  -- таблицы нет
      WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;

-- 3) REPLICA IDENTITY FULL — чтобы UPDATE приходили с полными old/new данными.
-- По умолчанию приходит только PK, что иногда ломает realtime payload в клиенте.
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'participants','super_games','challenges','pari','debts','rumors',
    'kirumi_contracts','loan_requests','debt_games','big_game_unlocks'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I REPLICA IDENTITY FULL', t);
    EXCEPTION
      WHEN undefined_table THEN NULL;
      WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;

-- 4) Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- ========== ПРОВЕРКА ==========
SELECT
  c.relname AS table_name,
  CASE WHEN p.pubname IS NULL THEN '✕' ELSE '✓' END AS realtime,
  CASE WHEN c.relreplident = 'f' THEN '✓ FULL' ELSE 'PK' END AS replica_identity
FROM pg_class c
LEFT JOIN pg_publication_rel pr ON pr.prrelid = c.oid
LEFT JOIN pg_publication p ON p.oid = pr.prpubid AND p.pubname = 'supabase_realtime'
WHERE c.relkind = 'r'
  AND c.relnamespace = 'public'::regnamespace
  AND c.relname IN (
    'participants','room_state','challenges','pari','debts','super_games',
    'events','notifications','rumors','history','transfers',
    'kirumi_contracts','loan_requests','debt_games','big_game_unlocks'
  )
ORDER BY c.relname;
