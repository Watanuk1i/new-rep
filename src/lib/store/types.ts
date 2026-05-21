// Типы для Supabase-стора. Совпадают с колонками таблиц БД.

export type ParticipantStatus = 'player' | 'pet' | 'master' | 'elite' | 'queen' | 'gm' | 'collector';
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
  created_at: string;
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
