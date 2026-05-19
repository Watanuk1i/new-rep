// Глобальные типы приложения

export type ParticipantStatus = 'player' | 'pet' | 'master' | 'elite' | 'queen' | 'gm';

export interface Participant {
  id: string;
  user_id?: string | null;
  display_name: string;
  character_slug?: string | null;
  // Для иконки можно либо указать кастомный URL, либо выбрать сегмент из спрайт-листа
  custom_icon_url?: string | null;
  sprite_sheet?: 1 | 2 | 3 | null;
  sprite_y?: number | null; // px от верха листа
  sprite_size?: number | null; // размер квадрата (px), default 86
  balance: number; // в "ейнах"
  status: ParticipantStatus;
  reputation: number; // 0..100
  wins: number;
  losses: number;
  pet_owner_id?: string | null; // если status='pet'
  is_active: boolean;
}

export interface PariMarket {
  id: string;
  creator_id: string; // participant id
  is_anonymous: boolean;
  title: string;
  description?: string;
  options: PariOption[];
  bets: PariBet[];
  comments: PariComment[];
  commission_pct: number; // 0..30
  closes_on_day: 1 | 2 | 3 | 4 | 5;
  status: 'open' | 'awaiting_confirmation' | 'resolved' | 'cancelled';
  resolved_option_id?: string;
  created_at: number;
}

export interface PariOption {
  id: string;
  label: string;
  kind?: 'yes' | 'no' | 'custom';
}

export interface PariBet {
  id: string;
  market_id: string;
  option_id: string;
  participant_id: string;
  amount: number;
  created_at: number;
  payout?: number;
}

export interface PariComment {
  id: string;
  market_id: string;
  participant_id: string;
  text: string;
  created_at: number;
}

export interface Debt {
  id: string;
  debtor_id: string;
  creditor_id: string;
  amount: number;
  description?: string;
  due_day: 1 | 2 | 3 | 4;
  due_time?: string;
  status: 'active' | 'closed';
  created_at: number;
}

export interface SuperGame {
  id: string;
  title: string;
  type: string;
  description?: string;
  rules?: string;
  stakes?: string;
  status: 'scheduled' | 'live' | 'finished' | 'cancelled';
  participant_ids: string[];
  starts_at?: string;
  spectator_bets_enabled: boolean;
}

export interface AcademyEvent {
  id: string;
  type: 'big_game_start' | 'player_eliminated' | 'pet_assigned' | 'elite_promoted'
       | 'queen_announcement' | 'pari_created' | 'pari_resolved' | 'gm_alert' | 'custom';
  title: string;
  body?: string;
  link_url?: string;
  created_at: number;
  related_participant_id?: string;
  is_for_gm_only?: boolean;
}

export interface Rumor {
  id: string;
  author_id: string; // participant id
  is_anonymous: boolean;
  title: string;
  text: string;
  created_at: number;
  truth_level?: 'true' | 'false' | 'partial' | 'unknown';
}

export interface AppState {
  season: number;
  day: number; // 1..5
  participants: Participant[];
  pari: PariMarket[];
  debts: Debt[];
  superGames: SuperGame[];
  events: AcademyEvent[];
  rumors: Rumor[];
  challenges: GameChallenge[];
  currentUserId: string | null; // id of logged-in participant (or 'gm-host' / 'gm-queen')
}

export type Role = 'guest' | 'player' | 'queen' | 'gm';



// === Малые игры ===
export type MiniGameType = 'dice' | 'high_card' | 'roulette' | 'slots' | 'blackjack' | 'bluff_duel' | 'truth_or_bet';

export interface GameChallenge {
  id: string;
  game_type: MiniGameType;
  creator_id: string;
  opponent_id: string | null; // null = открытый вызов
  stake_amount: number;
  status: 'pending' | 'accepted' | 'declined' | 'finished' | 'cancelled';
  winner_id?: string | null;
  result_data?: any;
  created_at: number;
}
