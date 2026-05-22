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
  status: 'requested' | 'active' | 'closed' | 'declined' | 'overdue' | 'paid' | 'auctioned' | 'cancelled';
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
  state: MinorityState | NineBulletsState | RoyalRouletteState | ContrabandState | DebtTowerState | DebtAuctionState | RebellionState | EliteTrialState | ThroneState | MiniGameRedBlackState | MiniGameBlindBidState | MiniGameLiarDiceState | MiniGameDespair21State | MiniGameRansomState | JokerDrawState | Record<string, any>;
  created_at: string;
}

// ===== Правило меньшинства =====
export interface MinorityRound {
  number: number;
  asked_id: string | null;
  started_at: string;
  duration_sec: number;
  votes: Record<string, 'yes' | 'no'>;
  status: 'pending_open' | 'open' | 'closed';
  /** Текст вопроса, который задал ведущий/выбранный игрок (показывается в таймере). */
  question?: string | null;
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

// ===== Долговая башня Мондо (6-я Большая игра) =====
export type DoorChoice = 'payment' | 'risk' | 'debt';
export type RiskResult = 'success' | 'fail';

export interface DebtTowerChoice {
  player_id: string;
  choice: DoorChoice;
  /** Заполняется только после раскрытия этажа. */
  risk_result?: RiskResult | null;
  money_delta?: number;
  debt_created?: number;
  debt_id?: string | null;
}

export interface DebtTowerFloor {
  number: number;                              // 1..5
  status: 'selection' | 'revealed' | 'resolved';
  choices: Record<string, DebtTowerChoice>;    // playerId → choice
  resolved_at?: string;
}

export interface DebtTowerPlayerState {
  total_profit: number;
  total_loss: number;
  total_debt: number;
  debt_choice_count: number;
  clean_result: number;
}

export interface DebtTowerState {
  current_floor: number;                       // 0..5
  total_floors: number;                        // = 5
  floors: DebtTowerFloor[];                    // длина = current_floor
  fee_paid: Record<string, number>;
  scores: Record<string, DebtTowerPlayerState>;
  status:
    | 'scheduled'
    | 'collecting_stakes'
    | 'floor_selection'
    | 'floor_reveal'
    | 'floor_result'
    | 'finishing'
    | 'finished'
    | 'cancelled';
  winner_id?: string | null;
  winner_is_candidate_for_elite?: boolean;
}

// ===== Аукцион долгов (7-я Большая игра) =====
export type DebtAuctionLotStatus =
  | 'pending'
  | 'open'
  | 'closed'
  | 'sold'
  | 'bought_by_debtor'
  | 'cancelled'
  | 'returned';

export interface DebtAuctionBid {
  id: string;
  bidder_id: string;
  amount: number;
  created_at: string;
}

export interface DebtAuctionLot {
  id: string;
  debt_id: string;
  debtor_id: string;
  current_owner_id: string;
  collector_id?: string | null;
  debt_amount: number;
  start_price: number;
  buyout_for_debtor: number;
  current_bid: number;
  current_bidder_id?: string | null;
  bids: DebtAuctionBid[];
  status: DebtAuctionLotStatus;
  /** Суффикс «применён» для разовой надбавки Мондо. */
  mondo_markup_applied: boolean;
  opened_at?: string;
  closed_at?: string;
}

export interface DebtAuctionState {
  curator_id: string;          // 'p-collector' (Кредитор Элиты) или назначенный
  collector_id: string;        // Мондо = 'p-11'
  observer_id: string;         // Селестия = 'p-queen'
  lots: DebtAuctionLot[];
  current_lot_id?: string | null;
  mondo_markup_used: boolean;
  creditor_loan_used: boolean;
  celestia_treasury_hand_used: boolean;
  status:
    | 'scheduled'
    | 'preparing_lots'
    | 'active'
    | 'lot_open'
    | 'bidding'
    | 'lot_closed'
    | 'finished'
    | 'cancelled';
}

// ===== Совет бунта (8-я Большая игра) =====
export type RebellionAction = 'rebellion' | 'betrayal' | 'neutral' | 'elite_deal';

export interface RebellionRound {
  number: number;                              // 1..5
  status: 'choice' | 'revealed' | 'resolved';
  choices: Record<string, RebellionAction>;    // playerId → action (тайно до reveal)
  rebellion_count?: number;
  betrayal_count?: number;
  neutral_count?: number;
  elite_deal_count?: number;
  fund_delta?: number;
  fund_after_round?: number;
  resolved_at?: string;
}

export interface RebellionPlayerCounts {
  rebellion: number;
  betrayal: number;
  neutral: number;
  elite_deal: number;
  total_money_delta: number;
}

export interface RebellionState {
  current_round: number;                       // 0..5
  total_rounds: number;                        // = 5
  rounds: RebellionRound[];
  rebellion_fund: number;
  rebellion_goal: number;
  reveal_mode: 'public_names' | 'numbers_only';
  player_counts: Record<string, RebellionPlayerCounts>;
  result?: 'rebellion_success' | 'rebellion_failed' | null;
  throne_unlocked?: boolean;
  status:
    | 'scheduled'
    | 'participant_setup'
    | 'active'
    | 'round_choice'
    | 'round_reveal'
    | 'round_result'
    | 'finishing'
    | 'finished'
    | 'cancelled';
}

// ===== Суд над Элитой (9-я Большая игра) =====
export type EliteTrialSide = 'prosecution' | 'defense';
export type EliteTrialCardSide = 'prosecution' | 'defense' | 'neutral' | 'dangerous';
export type EliteTrialCardEffect =
  | 'add_points' | 'subtract_points' | 'block_card'
  | 'random_bonus_or_penalty' | 'switch_side' | 'no_effect';
export type EliteTrialCardStatus = 'hidden' | 'revealed' | 'owned' | 'played' | 'blocked';

export interface EliteTrialCard {
  id: string;
  title: string;
  side: EliteTrialCardSide;
  points: number;
  effect_type: EliteTrialCardEffect;
  description: string;
  status: EliteTrialCardStatus;
  owner_side?: EliteTrialSide | null;
  played_at?: string;
  played_by_side?: EliteTrialSide | null;
  effect_note?: string | null;
}

export interface EliteTrialFundContribution {
  id: string;
  player_id: string;
  side: EliteTrialSide;
  amount: number;
  created_at: string;
}

export interface EliteTrialState {
  judge_id: string;                  // 'p-queen'
  target_elite_id: string;
  prosecution_player_ids: string[];
  defense_player_ids: string[];
  accusation_text: string;
  defense_text: string;
  prosecution_fund: number;
  defense_fund: number;
  prosecution_score: number;
  defense_score: number;
  cards: EliteTrialCard[];
  contributions: EliteTrialFundContribution[];
  verdict?: 'elite_guilty' | 'elite_acquitted' | null;
  status:
    | 'scheduled'
    | 'target_selection'
    | 'side_setup'
    | 'accusation_setup'
    | 'defense_setup'
    | 'evidence_market'
    | 'trial'
    | 'verdict'
    | 'finished'
    | 'cancelled';
}

// ===== Трон Селестии (финальная супер-игра) =====
export type ThroneCard = 'emperor' | 'citizen' | 'pet';
export type ThroneSide = 'celestia' | 'challenger';
export type ThronePhase = 'first_half' | 'second_half' | 'sudden_death';
export type ThroneAdvantageType = 'peek_card' | 'change_card' | 'replay_loss' | 'block_celestia_privilege';
export type CelestiaPrivilegeAction = 'peek_card' | 'force_replay' | 'block_card';

export interface ThroneRound {
  number: number;
  phase: ThronePhase;
  /** Доступные карты на момент раунда (после сжигания использованных). */
  celestia_deck: ThroneCard[];
  challenger_deck: ThroneCard[];
  celestia_card?: ThroneCard | null;
  challenger_card?: ThroneCard | null;
  status: 'card_selection' | 'advantage_phase' | 'reveal' | 'resolved';
  winner?: 'celestia' | 'challenger' | 'draw' | null;
  celestia_used_advantage?: ThroneAdvantageType | null;
  challenger_used_advantage?: ThroneAdvantageType | null;
  /** Если Селестия использовала привилегию — какое именно действие. */
  celestia_privilege_action?: CelestiaPrivilegeAction | null;
  /** Если Селестия посмотрела/заблокировала карту, какая. */
  celestia_peeked_card?: ThroneCard | null;
  challenger_blocked_card?: ThroneCard | null;
  resolved_at?: string;
}

export interface ThroneFundContribution {
  id: string;
  player_id: string;
  side: ThroneSide;
  amount: number;
  created_at: string;
}

export interface ThroneAdvantagePurchase {
  id: string;
  side: ThroneSide;
  advantage_type: ThroneAdvantageType;
  cost: number;
  used_in_round?: number | null;
  created_at: string;
}

export interface ThroneState {
  celestia_id: string;                                 // 'p-queen'
  challenger_id: string;
  celestia_supporter_ids: string[];
  challenger_supporter_ids: string[];
  neutral_ids: string[];
  celestia_fund: number;
  challenger_fund: number;
  celestia_score: number;
  challenger_score: number;
  current_round: number;                                // 0..10+ (sudden death продолжает счёт)
  total_rounds: number;                                 // = 10
  rounds: ThroneRound[];
  contributions: ThroneFundContribution[];
  purchases: ThroneAdvantagePurchase[];
  celestia_privilege_used: boolean;
  /** Если Претендент купил блок привилегии на следующий раунд. */
  block_celestia_next_round: boolean;
  /** Замена карты Селестией / Претендентом — флаг, сколько раз использовано (правил без лимита нет, но мы трекаем). */
  replay_used_celestia: boolean;
  replay_used_challenger: boolean;
  winner?: ThroneSide | null;
  final_outcome?: 'celestia_wins' | 'new_director' | 'rebellion_wins' | null;
  status:
    | 'scheduled'
    | 'challenger_setup'
    | 'side_selection'
    | 'fund_collection'
    | 'active'
    | 'card_selection'
    | 'advantage_phase'
    | 'reveal'
    | 'round_result'
    | 'sudden_death'
    | 'final_choice'
    | 'finished'
    | 'cancelled';
}

// ===== Малые игры (быстрые мини-игры из ТЗ) =====
export type MiniGameKind =
  | 'mini_red_black'
  | 'mini_blind_bid'
  | 'mini_liar_dice'
  | 'mini_despair_21'
  | 'mini_ransom';

export interface MiniGameRedBlackState {
  stake: number;
  fee_paid: Record<string, number>;
  /** participantId → 'red' | 'black' */
  choices: Record<string, 'red' | 'black'>;
  result?: 'red' | 'black' | null;
  winner_ids?: string[];
  status: 'waiting_players' | 'active' | 'revealing' | 'finished' | 'cancelled';
}
export interface MiniGameBlindBidState {
  fee_paid: Record<string, number>;
  /** Тайные суммы 10–100k. */
  bids: Record<string, number>;
  status: 'waiting_players' | 'active' | 'revealing' | 'finished' | 'cancelled';
  winner_id?: string | null;
}
export interface MiniGameLiarDiceState {
  stake: number;
  fee_paid: Record<string, number>;
  /** Кубики игроков 3 шт., скрыты до раскрытия. */
  dice: Record<string, number[]>;
  /** Очерёдность ходов — порядок объявлений. */
  turn_order: string[];
  current_turn_idx: number;
  /** Текущая заявка. */
  claim?: { count: number; face: number; player_id: string } | null;
  /** Кто сказал «Ложь!» — после этого раскрытие. */
  liar_caller_id?: string | null;
  status: 'waiting_players' | 'active' | 'revealing' | 'finished' | 'cancelled';
  winner_id?: string | null;
}
export interface MiniGameDespair21State {
  stake: number;
  fee_paid: Record<string, number>;
  hands: Record<string, number[]>;
  stand: Record<string, boolean>;
  dealer_hand: number[];
  status: 'waiting_players' | 'active' | 'revealing' | 'finished' | 'cancelled';
  results?: Record<string, 'win' | 'lose' | 'push'> | null;
}
export interface MiniGameRansomState {
  /** Фиксированный долг, который разыгрывается. */
  debt_id: string;
  debt_amount_initial: number;
  /** Сторона хозяина/Мондо/Казны — может убрать одну карту. */
  remover_id?: string | null;
  removed_card_index?: number | null;
  /** Перемешанные карты — хранятся в скрытом порядке. */
  cards_order: ('cancel_half' | 'double' | 'postpone')[];
  /** Должник выбирает индекс среди НЕубранных карт. */
  picked_card_index?: number | null;
  picked_card?: 'cancel_half' | 'double' | 'postpone' | null;
  new_debt_amount?: number;
  postponed?: boolean;
  status: 'waiting_remove' | 'waiting_pick' | 'finished' | 'cancelled';
}

// ===== Достать Джокера (mini_joker, 3 режима) =====
export type JokerDrawMode = 'quick' | 'long' | 'advanced';
export type JokerDrawCard = 'normal' | 'joker';

export interface JokerDrawAction {
  id: string;
  player_id: string;
  action_type: 'draw' | 'skip' | 'hint' | 'pass_request' | 'pass_accept' | 'pass_decline';
  target_player_id?: string | null;
  card_result?: JokerDrawCard | null;
  risk_percent?: number;
  risk_level?: 'low' | 'medium' | 'high';
  money_delta?: number;
  player_eliminated?: boolean;
  created_at: string;
}

export interface JokerDrawState {
  mode: JokerDrawMode;
  stake: number;
  fee_paid: Record<string, number>;
  bank: number;
  treasury_fee: number;
  payout_bank: number;
  /** Текущая колода (1 джокер + сколько обычных осталось). */
  deck: JokerDrawCard[];
  turn_order: string[];
  current_idx: number;          // индекс в turn_order
  eliminated_ids: string[];
  skip_used_ids: string[];
  /** Покупки подсказок: playerId → массив значений шанса в момент покупки. */
  hint_uses: Record<string, number>;
  /** Топ-карта на момент покупки подсказки (показывается только купившему до его следующего тяга). */
  hint_revealed_top?: Record<string, JokerDrawCard | null>;
  /** Запрос на передачу хода. */
  pending_pass_from?: string | null;
  pending_pass_to?: string | null;
  actions: JokerDrawAction[];
  winner_ids: string[];
  loser_ids: string[];
  status: 'waiting_players' | 'active' | 'finished' | 'cancelled';
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
