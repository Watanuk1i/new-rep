// Типы для Supabase-стора. Совпадают с колонками таблиц БД.

export type ParticipantStatus = 'player' | 'pet' | 'master' | 'elite' | 'queen' | 'gm' | 'collector' | 'treasury';
export type Role = 'guest' | 'player' | 'queen' | 'gm' | 'collector';

export interface Participant {
  id: string;
  display_name: string;
  character_slug?: string | null;
  custom_icon_url?: string | null;
  sprite_sheet?: number | null;
  sprite_y?: number | null;
  sprite_x?: number | null;
  sprite_size?: number | null;
  balance: number;
  status: ParticipantStatus;
  reputation: number;
  wins: number;
  losses: number;
  pet_owner_id?: string | null;
  is_active: boolean;
  password?: string | null;
  is_registered?: boolean;
  created_at?: string;
}

export type MiniGameType = 'dice' | 'high_card' | 'roulette' | 'slots' | 'blackjack' | 'bluff_duel' | 'truth_or_bet' | 'find_pair' | 'find_joker';

export interface GameChallenge {
  id: string;
  game_type: MiniGameType;
  creator_id: string;
  opponent_id: string | null;
  stake_amount: number;
  status: 'pending' | 'accepted' | 'finished' | 'cancelled';
  winner_id?: string | null;
  result_data?: any;
  created_at: string;
}

export interface PariOption {
  id: string;
  label: string;
  kind?: 'yes' | 'no' | 'custom';
}

export interface PariBet {
  id: string;
  option_id: string;
  participant_id: string;
  amount: number;
  created_at: number;
}

export interface PariComment {
  id: string;
  participant_id: string;
  is_anonymous?: boolean;
  text: string;
  created_at: number;
}

export interface PariMarket {
  id: string;
  creator_id: string;
  is_anonymous: boolean;
  title: string;
  description?: string | null;
  options: PariOption[];
  bets: PariBet[];
  comments: PariComment[];
  commission_pct: number;
  closes_on_day: number;
  status: 'open' | 'awaiting_confirmation' | 'resolved' | 'cancelled';
  resolved_option_id?: string | null;
  created_at: string;
}

export interface Debt {
  id: string;
  debtor_id: string;
  creditor_id: string;
  amount: number;
  description?: string | null;
  due_day: number;
  status: 'requested' | 'active' | 'closed' | 'declined';
  initiator: 'debtor' | 'creditor';
  created_at: string;
}

export interface SuperGame {
  id: string;
  title: string;
  type: string;
  description?: string | null;
  rules?: string | null;
  stakes?: string | null;
  status: 'scheduled' | 'live' | 'finished' | 'cancelled';
  participant_ids: string[];
  starts_at?: string | null;
  spectator_bets_enabled: boolean;
  entry_fee: number;
  bank: number;
  winner_id?: string | null;
  state: MinorityState | NineBulletsState | Record<string, any>;
  created_at: string;
}

// ===== Правило меньшинства =====
export interface MinorityRound {
  number: number;
  asked_id: string | null;
  started_at: string;
  duration_sec: number;
  votes: Record<string, 'yes' | 'no'>;
  status: 'open' | 'closed';
}
export interface MinorityHistoryEntry {
  number: number;
  asked_id: string | null;
  votes: Record<string, 'yes' | 'no'>;
  minority: 'yes' | 'no' | 'tie';
  eliminated: string[];
  penalties: Record<string, number>; // кто и сколько доп. внёс в банк за неучастие
}
export interface MinoritySpectatorBet {
  id: string;
  spectator_id: string;
  on_id: string;
  amount: number;
  created_at: number;
}
export interface MinorityState {
  alive_ids: string[];
  fee_paid: Record<string, number>;
  round: MinorityRound | null;
  history: MinorityHistoryEntry[];
  spectator_bets: MinoritySpectatorBet[];
}

// ===== Комната девяти патронов =====
export type Bullet = 'red' | 'blue';
export type Occupant = string | 'dummy' | null; // id игрока, 'dummy' (манекен), либо null до аукциона

export interface NineBulletsBid {
  seat: number;     // 1..9
  amount: number;   // 0..100000
}
export interface NineBulletsShot {
  seat: number;          // 1..9
  bullet: Bullet;
  target: Occupant;
  delta_shooter: number;
  delta_target: number;  // 0 если манекен (вместо манекена — Казна)
  delta_treasury: number;
}
export interface NineBulletsRound {
  n: number;                      // 1..3
  loader_id: string;
  shooter_id: string;
  sitters_ids: string[];          // 5 игроков
  chamber: Bullet[];              // 9 элементов, после зарядки. Скрывать в UI до фазы выстрелов.
  start_pos: number;              // 0..8
  bids: Record<string, NineBulletsBid>;
  auction_status: 'pending' | 'open' | 'resolved';
  seats: { idx: number; occupant: Occupant; bid?: number }[];  // 9 мест, idx=1..9
  shooter_swap: { a: number; b: number; paid: boolean } | { skipped: true } | null;
  shots: NineBulletsShot[];
  shots_revealed: number;         // 0..9
  hits_on_sitters: number;        // итог раунда
  loader_payout: number;          // итог раунда (отриц = штраф)
  status: 'role_selection' | 'loading' | 'seat_auction' | 'shooter_swap' | 'shooting' | 'round_result';
}
export interface NineBulletsState {
  current_round: number;          // 1..3
  rounds: NineBulletsRound[];     // длина = current_round (или 3 если игра finished)
  status:
    | 'scheduled'
    | 'role_selection'
    | 'loading'
    | 'seat_auction'
    | 'shooter_swap'
    | 'shooting'
    | 'round_result'
    | 'finished';
  // история ролей: чтобы не выбирать стрелка/заряжающего два раунда подряд
  role_history: { round: number; loader_id: string; shooter_id: string; sitters_ids: string[] }[];
}

export interface AcademyEvent {
  id: string;
  type: string; // big_game_start | queen_announcement | rumor_new | day_change | season_change | custom | gm_alert
  title: string;
  body?: string | null;
  link_url?: string | null;
  related_participant_id?: string | null;
  is_for_gm_only: boolean;
  created_at: string;
}

export interface Notification {
  id: string;
  recipient_id: string;
  type: string;
  title: string;
  body?: string | null;
  link_url?: string | null;
  is_read: boolean;
  created_at: string;
}

export interface RumorVote { participant_id: string; }
export interface Rumor {
  id: string;
  author_id: string;
  is_anonymous: boolean;
  title: string;
  text: string;
  truth_level?: 'true' | 'false' | 'partial' | 'unknown' | null;
  status: 'active' | 'closed';
  closes_on_day?: number | null;
  comments: PariComment[];
  votes: { true: RumorVote[]; false: RumorVote[] };
  created_at: string;
}

export interface ContentBlock {
  id: string;
  page: 'help' | 'rules';
  title: string;
  body: string;
  sort_order: number;
  updated_at: string;
}

export interface HistoryEntry {
  id: string;
  participant_id: string;
  action: string;
  description?: string | null;
  amount?: number | null;
  link_url?: string | null;
  created_at: string;
}

export interface RoomState {
  id: string;
  season: number;
  day: number;
  updated_at: string;
}
