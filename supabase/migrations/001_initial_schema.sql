-- ============================================================
-- БЕЗУМНЫЙ АЗАРТ ОТЧАЯНИЯ - Database Schema
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- PROFILES (extends Supabase auth.users)
-- ============================================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('player', 'gm', 'admin', 'spectator')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- CHARACTERS CATALOG
-- ============================================================
CREATE TABLE characters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL DEFAULT 'Danganronpa',
  role_type TEXT NOT NULL CHECK (role_type IN ('hope', 'logic', 'chaos', 'strength', 'social', 'weak_link', 'elite', 'gm', 'service')),
  access_level TEXT NOT NULL DEFAULT 'free' CHECK (access_level IN ('free', 'gm_only', 'service')),
  description TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- PARTICIPANTS (active game participants)
-- ============================================================
CREATE TABLE participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  character_id UUID NOT NULL REFERENCES characters(id),
  display_name TEXT NOT NULL,
  balance INTEGER NOT NULL DEFAULT 1000,
  status TEXT NOT NULL DEFAULT 'free' CHECK (status IN ('free', 'pet', 'master', 'elite', 'celestia', 'gm')),
  owner_participant_id UUID REFERENCES participants(id) ON DELETE SET NULL,
  pet_badge_type TEXT,
  hope_score INTEGER NOT NULL DEFAULT 50,
  despair_score INTEGER NOT NULL DEFAULT 0,
  madness_score INTEGER NOT NULL DEFAULT 0,
  reputation_score INTEGER NOT NULL DEFAULT 50,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- BALANCE TRANSACTIONS
-- ============================================================
CREATE TABLE balance_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  participant_id UUID NOT NULL REFERENCES participants(id),
  amount INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('game_win', 'game_loss', 'bet_win', 'bet_loss', 'admin_adjustment', 'fee', 'transfer', 'debt_payment', 'penalty', 'creator_fee', 'academy_fee')),
  description TEXT,
  related_entity_type TEXT,
  related_entity_id UUID,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- GAME REQUESTS
-- ============================================================
CREATE TABLE game_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_type TEXT NOT NULL CHECK (game_type IN ('dice', 'high_card', 'roulette', 'slots', 'blackjack', 'bluff_duel', 'truth_or_bet')),
  creator_id UUID NOT NULL REFERENCES participants(id),
  opponent_id UUID REFERENCES participants(id),
  is_open_challenge BOOLEAN NOT NULL DEFAULT FALSE,
  stake_type TEXT NOT NULL DEFAULT 'points' CHECK (stake_type IN ('points', 'debt', 'secret', 'pet_temp', 'service', 'challenge_right')),
  stake_amount INTEGER NOT NULL DEFAULT 100,
  stake_description TEXT,
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private', 'participants_only')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'cancelled')),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- GAME SESSIONS
-- ============================================================
CREATE TABLE game_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id UUID REFERENCES game_requests(id),
  game_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'in_progress', 'finished', 'cancelled')),
  participant_a_id UUID NOT NULL REFERENCES participants(id),
  participant_b_id UUID REFERENCES participants(id),
  stake_type TEXT NOT NULL DEFAULT 'points',
  stake_amount INTEGER NOT NULL DEFAULT 100,
  rules_snapshot JSONB,
  game_state JSONB DEFAULT '{}',
  result_json JSONB,
  winner_id UUID REFERENCES participants(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

-- ============================================================
-- GAME ACTIONS (log of each move)
-- ============================================================
CREATE TABLE game_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  participant_id UUID REFERENCES participants(id),
  action_type TEXT NOT NULL,
  payload_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- PARI MARKETS (betting markets)
-- ============================================================
CREATE TABLE pari_markets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  creator_id UUID NOT NULL REFERENCES participants(id),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'closed', 'awaiting_resolution', 'resolved', 'cancelled')),
  creator_fee_percent NUMERIC(4,2) NOT NULL DEFAULT 3.00 CHECK (creator_fee_percent >= 0 AND creator_fee_percent <= 5),
  academy_fee_percent NUMERIC(4,2) NOT NULL DEFAULT 1.00 CHECK (academy_fee_percent >= 0 AND academy_fee_percent <= 5),
  min_bet INTEGER NOT NULL DEFAULT 10,
  resolution_type TEXT NOT NULL DEFAULT 'gm' CHECK (resolution_type IN ('gm', 'automatic', 'vote', 'judge')),
  judge_id UUID REFERENCES participants(id),
  resolved_option_id UUID,
  closes_at TIMESTAMPTZ NOT NULL,
  resolves_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- ============================================================
-- PARI OPTIONS
-- ============================================================
CREATE TABLE pari_options (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  market_id UUID NOT NULL REFERENCES pari_markets(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Add FK for resolved_option_id
ALTER TABLE pari_markets ADD CONSTRAINT fk_resolved_option 
  FOREIGN KEY (resolved_option_id) REFERENCES pari_options(id);

-- ============================================================
-- PARI BETS
-- ============================================================
CREATE TABLE pari_bets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  market_id UUID NOT NULL REFERENCES pari_markets(id),
  option_id UUID NOT NULL REFERENCES pari_options(id),
  participant_id UUID NOT NULL REFERENCES participants(id),
  amount INTEGER NOT NULL CHECK (amount > 0),
  potential_odds_at_bet_time NUMERIC(8,4),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'won', 'lost', 'refunded')),
  payout_amount INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SUPER GAMES (Big Games)
-- ============================================================
CREATE TABLE super_games (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  game_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'finished', 'cancelled')),
  starts_at TIMESTAMPTZ,
  rules_text TEXT,
  stakes_text TEXT,
  spectator_bets_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

-- ============================================================
-- SUPER GAME PARTICIPANTS
-- ============================================================
CREATE TABLE super_game_participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  super_game_id UUID NOT NULL REFERENCES super_games(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES participants(id),
  role_in_game TEXT DEFAULT 'player',
  score INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'eliminated', 'winner', 'loser'))
);

-- ============================================================
-- SUPER GAME EVENTS (live log)
-- ============================================================
CREATE TABLE super_game_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  super_game_id UUID NOT NULL REFERENCES super_games(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  title TEXT,
  description TEXT,
  payload_json JSONB,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- DEBTS
-- ============================================================
CREATE TABLE debts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  debtor_id UUID NOT NULL REFERENCES participants(id),
  creditor_id UUID REFERENCES participants(id),
  title TEXT NOT NULL,
  description TEXT,
  amount INTEGER,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paid', 'cancelled', 'expired')),
  is_public BOOLEAN NOT NULL DEFAULT TRUE,
  due_at TIMESTAMPTZ,
  related_game_id UUID REFERENCES game_sessions(id),
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

-- ============================================================
-- PET RELATIONS
-- ============================================================
CREATE TABLE pet_relations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pet_id UUID NOT NULL REFERENCES participants(id),
  owner_id UUID NOT NULL REFERENCES participants(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'released', 'transferred')),
  terms_text TEXT,
  ransom_amount INTEGER,
  ransom_text TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id)
);

-- ============================================================
-- RUMORS
-- ============================================================
CREATE TABLE rumors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  truth_level TEXT NOT NULL DEFAULT 'unknown' CHECK (truth_level IN ('true', 'false', 'partial', 'unknown')),
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'gm_only', 'target_only')),
  target_participant_id UUID REFERENCES participants(id),
  day_number INTEGER,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_profile_id UUID REFERENCES profiles(id),
  recipient_participant_id UUID REFERENCES participants(id),
  title TEXT NOT NULL,
  body TEXT,
  type TEXT NOT NULL,
  link_url TEXT,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- AUDIT LOG
-- ============================================================
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_profile_id UUID REFERENCES profiles(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  before_json JSONB,
  after_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- CAST APPLICATIONS
-- ============================================================
CREATE TABLE cast_applications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_name TEXT NOT NULL,
  contact TEXT NOT NULL,
  character_1_id UUID REFERENCES characters(id),
  character_2_id UUID REFERENCES characters(id),
  character_3_id UUID REFERENCES characters(id),
  experience TEXT,
  play_style TEXT,
  pet_readiness TEXT CHECK (pet_readiness IN ('yes', 'no', 'temporary')),
  boundaries TEXT,
  comment TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_participants_status ON participants(status);
CREATE INDEX idx_participants_balance ON participants(balance DESC);
CREATE INDEX idx_participants_active ON participants(is_active);
CREATE INDEX idx_game_sessions_status ON game_sessions(status);
CREATE INDEX idx_pari_markets_status ON pari_markets(status);
CREATE INDEX idx_notifications_recipient ON notifications(recipient_participant_id, is_read);
CREATE INDEX idx_balance_transactions_participant ON balance_transactions(participant_id);
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_super_games_status ON super_games(status);
CREATE INDEX idx_debts_debtor ON debts(debtor_id, status);
CREATE INDEX idx_pet_relations_active ON pet_relations(status) WHERE status = 'active';

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read all, update own
CREATE POLICY "profiles_read_all" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Participants: everyone can read active
CREATE POLICY "participants_read" ON participants FOR SELECT USING (true);

-- Notifications: users see their own
CREATE POLICY "notifications_own" ON notifications FOR SELECT 
  USING (recipient_profile_id = auth.uid());
CREATE POLICY "notifications_update_own" ON notifications FOR UPDATE 
  USING (recipient_profile_id = auth.uid());

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Update balance and create transaction
CREATE OR REPLACE FUNCTION update_balance(
  p_participant_id UUID,
  p_amount INTEGER,
  p_type TEXT,
  p_description TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL,
  p_related_entity_type TEXT DEFAULT NULL,
  p_related_entity_id UUID DEFAULT NULL
) RETURNS void AS $$
BEGIN
  UPDATE participants SET balance = balance + p_amount, updated_at = NOW()
  WHERE id = p_participant_id;
  
  INSERT INTO balance_transactions (participant_id, amount, type, description, created_by, related_entity_type, related_entity_id)
  VALUES (p_participant_id, p_amount, p_type, p_description, p_created_by, p_related_entity_type, p_related_entity_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Resolve pari market and distribute payouts
CREATE OR REPLACE FUNCTION resolve_pari(
  p_market_id UUID,
  p_winning_option_id UUID,
  p_resolved_by UUID DEFAULT NULL
) RETURNS void AS $$
DECLARE
  v_market pari_markets%ROWTYPE;
  v_total_pool INTEGER;
  v_creator_fee INTEGER;
  v_academy_fee INTEGER;
  v_payout_pool INTEGER;
  v_winning_pool INTEGER;
  v_bet RECORD;
BEGIN
  SELECT * INTO v_market FROM pari_markets WHERE id = p_market_id;
  
  IF v_market.status != 'closed' AND v_market.status != 'awaiting_resolution' THEN
    RAISE EXCEPTION 'Market is not ready for resolution';
  END IF;
  
  -- Calculate total pool
  SELECT COALESCE(SUM(amount), 0) INTO v_total_pool FROM pari_bets WHERE market_id = p_market_id AND status = 'active';
  
  -- Calculate fees
  v_creator_fee := FLOOR(v_total_pool * v_market.creator_fee_percent / 100);
  v_academy_fee := FLOOR(v_total_pool * v_market.academy_fee_percent / 100);
  v_payout_pool := v_total_pool - v_creator_fee - v_academy_fee;
  
  -- Calculate winning pool
  SELECT COALESCE(SUM(amount), 0) INTO v_winning_pool 
  FROM pari_bets WHERE market_id = p_market_id AND option_id = p_winning_option_id AND status = 'active';
  
  -- Pay creator fee
  IF v_creator_fee > 0 THEN
    PERFORM update_balance(v_market.creator_id, v_creator_fee, 'creator_fee', 'Комиссия создателя пари: ' || v_market.title, p_resolved_by, 'pari_market', p_market_id);
  END IF;
  
  -- Distribute payouts to winners
  IF v_winning_pool > 0 THEN
    FOR v_bet IN 
      SELECT * FROM pari_bets WHERE market_id = p_market_id AND option_id = p_winning_option_id AND status = 'active'
    LOOP
      DECLARE
        v_payout INTEGER;
      BEGIN
        v_payout := FLOOR(v_bet.amount::NUMERIC / v_winning_pool * v_payout_pool);
        UPDATE pari_bets SET status = 'won', payout_amount = v_payout WHERE id = v_bet.id;
        PERFORM update_balance(v_bet.participant_id, v_payout, 'bet_win', 'Выигрыш пари: ' || v_market.title, p_resolved_by, 'pari_market', p_market_id);
      END;
    END LOOP;
  END IF;
  
  -- Mark losers
  UPDATE pari_bets SET status = 'lost' WHERE market_id = p_market_id AND option_id != p_winning_option_id AND status = 'active';
  
  -- Update market
  UPDATE pari_markets SET status = 'resolved', resolved_option_id = p_winning_option_id, resolved_at = NOW() WHERE id = p_market_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cancel pari and refund all bets
CREATE OR REPLACE FUNCTION cancel_pari(p_market_id UUID, p_cancelled_by UUID DEFAULT NULL) RETURNS void AS $$
DECLARE
  v_bet RECORD;
BEGIN
  FOR v_bet IN SELECT * FROM pari_bets WHERE market_id = p_market_id AND status = 'active'
  LOOP
    UPDATE pari_bets SET status = 'refunded' WHERE id = v_bet.id;
    PERFORM update_balance(v_bet.participant_id, v_bet.amount, 'bet_loss', 'Возврат ставки (пари отменено)', p_cancelled_by, 'pari_market', p_market_id);
  END LOOP;
  
  UPDATE pari_markets SET status = 'cancelled' WHERE id = p_market_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
