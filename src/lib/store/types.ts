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
  state: MinorityState | NineBulletsState | RoyalRouletteState | ContrabandState | Record<string, any>;
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

// ===== Королевская рулетка (4-я Большая игра) =====
export type RouletteBet = 'safe' | 'risky' | 'royal';
export type RouletteSector = 'safe' | 'risky' | 'royal' | 'tax' | 'crown';

export interface RoyalRouletteRound {
  number: number;                                // 1..5
  status: 'discussion' | 'choosing' | 'spinning' | 'resolved';
  bets: Record<string, RouletteBet>;             // participantId → bet
  celestia_viewed_player_id?: string | null;     // кого Селестия посмотрела «Королевским взглядом»
  celestia_view_seen_bet?: RouletteBet | null;   // что именно она увидела (видно только Селестии)
  result_sector?: RouletteSector | null;
  result_index?: number | null;                  // индекс сектора 0..11 — для синхронизации анимации
  deltas?: Record<string, number>;               // изменение баланса игрока за раунд
  treasury_delta?: number;
  resolved_at?: string;
}

export interface RoyalRouletteState {
  current_round: number;                          // 1..5
  rounds: RoyalRouletteRound[];                   // длина = current_round
  celestia_id: string;                            // обычно 'p-queen'
  celestia_privilege_used: boolean;
  fee_paid: Record<string, number>;               // взносы на старте
  net_profit: Record<string, number>;             // чистая прибыль за все раунды
  status:
    | 'scheduled'
    | 'collecting_stakes'
    | 'round_discussion'
    | 'choosing_bets'
    | 'spinning'
    | 'round_result'
    | 'finishing'
    | 'finished'
    | 'cancelled';
  winner_id?: string | null;
}

// ===== Контрабанда капитала (5-я Большая игра) =====
export type ContrabandTeam = 'north' | 'south';
export type InspectorAction = 'pass' | 'inspect';
export type ContrabandResult = 'passed' | 'caught' | 'underestimated' | 'empty_case_trap';

export interface ContrabandRound {
  number: number;                              // 1..7
  status:
    | 'selecting_smuggler'
    | 'choosing_amount'
    | 'selecting_inspector'
    | 'inspection_decision'
    | 'reveal'
    | 'round_result';
  smuggler_team: ContrabandTeam;
  smuggler_id?: string | null;
  smuggled_amount?: number | null;             // скрыто от Таможенника до раскрытия
  inspector_team: ContrabandTeam;
  inspector_id?: string | null;
  inspector_action?: InspectorAction | null;   // скрыто до раскрытия
  suspected_amount?: number | null;            // скрыто до раскрытия
  result?: ContrabandResult | null;
  north_score_delta?: number;
  south_score_delta?: number;
  smuggler_personal_delta?: number;
  inspector_personal_delta?: number;
  resolved_at?: string;
}

export interface ContrabandState {
  current_round: number;                       // 0..7
  rounds: ContrabandRound[];                   // длина = current_round
  north_team_ids: string[];
  south_team_ids: string[];
  north_captain_id?: string | null;
  south_captain_id?: string | null;
  north_score: number;
  south_score: number;
  /** История того, кто уже был Контрабандистом — чтобы каждый успел один раз. */
  smuggler_history: Record<ContrabandTeam, string[]>;
  status:
    | 'scheduled'
    | 'team_setup'
    | 'active'
    | 'selecting_smuggler'
    | 'choosing_amount'
    | 'selecting_inspector'
    | 'inspection_decision'
    | 'reveal'
    | 'round_result'
    | 'finished'
    | 'cancelled';
  winner_team?: ContrabandTeam | 'draw' | null;
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
