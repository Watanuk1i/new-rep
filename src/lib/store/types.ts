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


// =====================================================================
// V2: Глобальные переводы йен и Большая игра «Карточный корабль»
// =====================================================================

export interface Transfer {
  id: string;
  sender_id: string;
  recipient_id: string;
  amount: number;
  comment: string;
  related_game_id?: string | null;
  created_at: string;
}

export type CardShipStatus =
  | 'scheduled'
  | 'collecting_stakes'
  | 'active'
  | 'finishing'
  | 'finished'
  | 'cancelled';

export interface CardShipGame {
  id: string;
  super_game_id?: string | null;
  status: CardShipStatus;
  entry_fee: number;
  bank: number;
  participant_ids: string[];
  winner_ids: string[];
  started_at?: string | null;
  finished_at?: string | null;
  created_at: string;
}

export type CardType = 'rock' | 'scissors' | 'paper';
export type CardShipPlayerStatus = 'active' | 'out_of_cards' | 'survived' | 'lost';

export interface CardShipState {
  id: string;
  game_id: string;
  player_id: string;
  rocks: number;
  scissors: number;
  papers: number;
  stars: number;
  cards_played: number;
  duels_count: number;
  status: CardShipPlayerStatus;
}

export type CardShipDuelStatus =
  | 'pending'
  | 'accepted'
  | 'revealed'
  | 'declined'
  | 'cancelled'
  | 'expired';

export interface CardShipDuel {
  id: string;
  game_id: string;
  challenger_id: string;
  opponent_id: string;
  status: CardShipDuelStatus;
  challenger_card?: CardType | null;
  opponent_card?: CardType | null;
  winner_id?: string | null;
  accept_deadline?: string | null;
  pick_deadline?: string | null;
  created_at: string;
  resolved_at?: string | null;
}

export type CardShipListingStatus = 'open' | 'sold' | 'cancelled';
export type CardShipItemType = 'card' | 'star';

export interface CardShipListing {
  id: string;
  game_id: string;
  seller_id: string;
  item_type: CardShipItemType;
  card_type?: CardType | null;
  price: number;
  status: CardShipListingStatus;
  buyer_id?: string | null;
  created_at: string;
  sold_at?: string | null;
}
