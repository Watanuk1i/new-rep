-- =====================================================================
-- МИГРАЦИЯ 003: Казна студсовета + Большие игры (minority_rule, nine_bullets)
-- =====================================================================
-- Безопасно запускать поверх уже развёрнутой БД (всё IF NOT EXISTS / OR REPLACE).
-- В Supabase Dashboard → SQL Editor → Run.
-- =====================================================================

-- 1) Новые колонки в super_games
ALTER TABLE super_games
  ADD COLUMN IF NOT EXISTS entry_fee BIGINT NOT NULL DEFAULT 100000,
  ADD COLUMN IF NOT EXISTS bank      BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS winner_id TEXT,
  ADD COLUMN IF NOT EXISTS state     JSONB  NOT NULL DEFAULT '{}'::jsonb;

-- FK на participants для winner_id (если ещё нет)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'super_games_winner_id_fkey'
  ) THEN
    ALTER TABLE super_games
      ADD CONSTRAINT super_games_winner_id_fkey
      FOREIGN KEY (winner_id) REFERENCES participants(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 2) Создание/обновление участника p-treasury (Казна студсовета)
INSERT INTO participants (
  id, display_name, status, balance, reputation,
  sprite_sheet, sprite_y, password, is_registered, is_active
) VALUES (
  'p-treasury', 'Казна студсовета', 'treasury', 50000000, 0,
  NULL, NULL, NULL, FALSE, TRUE
)
ON CONFLICT (id) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      status       = 'treasury';

-- 3) RPC: apply_transfer — атомарный перевод между двумя участниками
--    с автоматическим созданием долга при нехватке средств у плательщика.
--    Возвращает id созданного долга (или пустую строку, если долг не нужен).
CREATE OR REPLACE FUNCTION apply_transfer(
  p_from   TEXT,
  p_to     TEXT,
  p_amount BIGINT,
  p_reason TEXT,
  p_link   TEXT DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  from_balance BIGINT;
  debt_id      TEXT;
  rand_suffix  TEXT;
BEGIN
  IF p_amount <= 0 THEN
    RETURN '';
  END IF;
  IF p_from = p_to THEN
    RETURN '';
  END IF;

  -- Списание у плательщика (баланс может уйти в минус)
  UPDATE participants
     SET balance = balance - p_amount
   WHERE id = p_from
   RETURNING balance INTO from_balance;

  IF from_balance IS NULL THEN
    RAISE EXCEPTION 'apply_transfer: участник % не найден', p_from;
  END IF;

  -- Зачисление получателю
  UPDATE participants
     SET balance = balance + p_amount
   WHERE id = p_to;

  -- Если плательщик ушёл в минус — создаём долг на величину овердрафта
  IF from_balance < 0 THEN
    rand_suffix := substring(md5(random()::text || clock_timestamp()::text), 1, 8);
    debt_id := 'd-' || extract(epoch from clock_timestamp())::bigint || '-' || rand_suffix;
    INSERT INTO debts (id, debtor_id, creditor_id, amount, description, due_day, status, initiator)
    VALUES (debt_id, p_from, p_to, -from_balance, p_reason, 1, 'active', 'creditor');
  END IF;

  -- История обеим сторонам
  INSERT INTO history (id, participant_id, action, description, amount, link_url)
  VALUES
    ('h-' || extract(epoch from clock_timestamp())::bigint || '-' || substring(md5(random()::text), 1, 6),
     p_from, 'tx_out', p_reason, -p_amount, p_link),
    ('h-' || extract(epoch from clock_timestamp())::bigint || '-' || substring(md5(random()::text), 1, 8),
     p_to,   'tx_in',  p_reason,  p_amount, p_link);

  RETURN COALESCE(debt_id, '');
END;
$$;

GRANT EXECUTE ON FUNCTION apply_transfer(TEXT, TEXT, BIGINT, TEXT, TEXT)
  TO anon, authenticated, service_role;

-- 4) RPC: cast_minority_vote — атомарное добавление голоса в state.round.votes
--    Не пускает голосовать второй раз и в закрытом раунде.
CREATE OR REPLACE FUNCTION cast_minority_vote(
  p_game_id  TEXT,
  p_voter_id TEXT,
  p_choice   TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  affected INT;
BEGIN
  IF p_choice NOT IN ('yes','no') THEN
    RAISE EXCEPTION 'cast_minority_vote: choice должно быть yes или no';
  END IF;

  UPDATE super_games
     SET state = jsonb_set(
       state,
       ARRAY['round','votes',p_voter_id],
       to_jsonb(p_choice),
       true
     )
   WHERE id = p_game_id
     AND status = 'live'
     AND state->'round'->>'status' = 'open'
     AND COALESCE(state->'round'->'votes' ? p_voter_id, FALSE) = FALSE;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION cast_minority_vote(TEXT, TEXT, TEXT)
  TO anon, authenticated, service_role;

-- 5) RPC: place_seat_bid — атомарная ставка в слепом аукционе мест
--    для «Комнаты девяти патронов». Один игрок — одна ставка за раунд.
CREATE OR REPLACE FUNCTION place_seat_bid(
  p_game_id   TEXT,
  p_round_idx INT,
  p_bidder_id TEXT,
  p_seat      INT,
  p_amount    BIGINT
) RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  affected INT;
BEGIN
  IF p_seat < 1 OR p_seat > 9 THEN
    RAISE EXCEPTION 'place_seat_bid: seat должен быть 1..9';
  END IF;
  IF p_amount < 0 OR p_amount > 100000 THEN
    RAISE EXCEPTION 'place_seat_bid: amount должен быть 0..100000';
  END IF;

  UPDATE super_games
     SET state = jsonb_set(
       state,
       ARRAY['rounds', p_round_idx::text, 'bids', p_bidder_id],
       jsonb_build_object('seat', p_seat, 'amount', p_amount),
       true
     )
   WHERE id = p_game_id
     AND status = 'live'
     AND state->'rounds'->p_round_idx->>'auction_status' = 'open'
     AND COALESCE(state->'rounds'->p_round_idx->'sitters_ids' ? p_bidder_id, FALSE) = TRUE
     AND COALESCE(state->'rounds'->p_round_idx->'bids' ? p_bidder_id, FALSE) = FALSE;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION place_seat_bid(TEXT, INT, TEXT, INT, BIGINT)
  TO anon, authenticated, service_role;

-- 6) Перезагрузить PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- 7) Проверки
SELECT id, display_name, status, balance FROM participants WHERE id = 'p-treasury';
SELECT column_name FROM information_schema.columns
 WHERE table_name = 'super_games'
   AND column_name IN ('entry_fee','bank','winner_id','state');
SELECT proname FROM pg_proc WHERE proname IN ('apply_transfer','cast_minority_vote','place_seat_bid');
