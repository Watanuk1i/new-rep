-- Фикс безопасности: cast_minority_vote должна проверять,
-- что голосующий ещё жив (его id в alive_ids).
-- Без этой проверки выбывший игрок мог проголосовать через RPC напрямую.
--
-- Применить разово в Supabase SQL Editor.

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
     AND COALESCE(state->'round'->'votes' ? p_voter_id, FALSE) = FALSE
     AND EXISTS (
       SELECT 1
         FROM jsonb_array_elements_text(state->'alive_ids') AS x(id)
        WHERE x.id = p_voter_id
     );
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected > 0;
END;
$func$;

GRANT EXECUTE ON FUNCTION cast_minority_vote(TEXT,TEXT,TEXT)
  TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
