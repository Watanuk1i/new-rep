export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          display_name: string;
          role: 'player' | 'gm' | 'admin' | 'spectator';
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
      };
      characters: {
        Row: {
          id: string;
          name: string;
          slug: string;
          source: string;
          role_type: 'hope' | 'logic' | 'chaos' | 'strength' | 'social' | 'weak_link' | 'elite' | 'gm' | 'service';
          access_level: 'free' | 'gm_only' | 'service';
          description: string | null;
          avatar_url: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['characters']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['characters']['Insert']>;
      };
      participants: {
        Row: {
          id: string;
          user_id: string | null;
          character_id: string;
          display_name: string;
          balance: number;
          status: ParticipantStatus;
          owner_participant_id: string | null;
          pet_badge_type: string | null;
          hope_score: number;
          despair_score: number;
          madness_score: number;
          reputation_score: number;
          wins: number;
          losses: number;
          is_active: boolean;
          is_blocked: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['participants']['Row'], 'id' | 'created_at' | 'updated_at' | 'wins' | 'losses'>;
        Update: Partial<Database['public']['Tables']['participants']['Insert']>;
      };
      balance_transactions: {
        Row: {
          id: string;
          participant_id: string;
          amount: number;
          type: TransactionType;
          description: string | null;
          related_entity_type: string | null;
          related_entity_id: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['balance_transactions']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['balance_transactions']['Insert']>;
      };
      game_requests: {
        Row: {
          id: string;
          game_type: GameType;
          creator_id: string;
          opponent_id: string | null;
          is_open_challenge: boolean;
          stake_type: StakeType;
          stake_amount: number;
          stake_description: string | null;
          visibility: 'public' | 'private' | 'participants_only';
          status: 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled';
          expires_at: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['game_requests']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['game_requests']['Insert']>;
      };
      game_sessions: {
        Row: {
          id: string;
          request_id: string | null;
          game_type: string;
          status: 'waiting' | 'in_progress' | 'finished' | 'cancelled';
          participant_a_id: string;
          participant_b_id: string | null;
          stake_type: string;
          stake_amount: number;
          rules_snapshot: Json | null;
          game_state: Json;
          result_json: Json | null;
          winner_id: string | null;
          created_at: string;
          finished_at: string | null;
        };
        Insert: Omit<Database['public']['Tables']['game_sessions']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['game_sessions']['Insert']>;
      };
      game_actions: {
        Row: {
          id: string;
          session_id: string;
          participant_id: string | null;
          action_type: string;
          payload_json: Json | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['game_actions']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['game_actions']['Insert']>;
      };
      pari_markets: {
        Row: {
          id: string;
          creator_id: string;
          title: string;
          description: string | null;
          status: PariStatus;
          creator_fee_percent: number;
          academy_fee_percent: number;
          min_bet: number;
          resolution_type: 'gm' | 'automatic' | 'vote' | 'judge';
          judge_id: string | null;
          resolved_option_id: string | null;
          closes_at: string;
          resolves_at: string;
          created_at: string;
          resolved_at: string | null;
        };
        Insert: Omit<Database['public']['Tables']['pari_markets']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['pari_markets']['Insert']>;
      };
      pari_options: {
        Row: {
          id: string;
          market_id: string;
          label: string;
          sort_order: number;
        };
        Insert: Omit<Database['public']['Tables']['pari_options']['Row'], 'id'>;
        Update: Partial<Database['public']['Tables']['pari_options']['Insert']>;
      };
      pari_bets: {
        Row: {
          id: string;
          market_id: string;
          option_id: string;
          participant_id: string;
          amount: number;
          potential_odds_at_bet_time: number | null;
          status: 'active' | 'won' | 'lost' | 'refunded';
          payout_amount: number | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['pari_bets']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['pari_bets']['Insert']>;
      };
      super_games: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          game_type: string;
          status: 'scheduled' | 'live' | 'finished' | 'cancelled';
          starts_at: string | null;
          rules_text: string | null;
          stakes_text: string | null;
          spectator_bets_enabled: boolean;
          created_by: string | null;
          created_at: string;
          finished_at: string | null;
        };
        Insert: Omit<Database['public']['Tables']['super_games']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['super_games']['Insert']>;
      };
      super_game_participants: {
        Row: {
          id: string;
          super_game_id: string;
          participant_id: string;
          role_in_game: string | null;
          score: number;
          status: 'active' | 'eliminated' | 'winner' | 'loser';
        };
        Insert: Omit<Database['public']['Tables']['super_game_participants']['Row'], 'id'>;
        Update: Partial<Database['public']['Tables']['super_game_participants']['Insert']>;
      };
      super_game_events: {
        Row: {
          id: string;
          super_game_id: string;
          event_type: string;
          title: string | null;
          description: string | null;
          payload_json: Json | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['super_game_events']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['super_game_events']['Insert']>;
      };
      debts: {
        Row: {
          id: string;
          debtor_id: string;
          creditor_id: string | null;
          title: string;
          description: string | null;
          amount: number | null;
          status: 'active' | 'paid' | 'cancelled' | 'expired';
          is_public: boolean;
          due_at: string | null;
          related_game_id: string | null;
          created_by: string | null;
          created_at: string;
          closed_at: string | null;
        };
        Insert: Omit<Database['public']['Tables']['debts']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['debts']['Insert']>;
      };
      pet_relations: {
        Row: {
          id: string;
          pet_id: string;
          owner_id: string;
          status: 'active' | 'released' | 'transferred';
          terms_text: string | null;
          ransom_amount: number | null;
          ransom_text: string | null;
          started_at: string;
          ended_at: string | null;
          created_by: string | null;
        };
        Insert: Omit<Database['public']['Tables']['pet_relations']['Row'], 'id' | 'started_at'>;
        Update: Partial<Database['public']['Tables']['pet_relations']['Insert']>;
      };
      rumors: {
        Row: {
          id: string;
          title: string;
          text: string;
          truth_level: 'true' | 'false' | 'partial' | 'unknown';
          visibility: 'public' | 'gm_only' | 'target_only';
          target_participant_id: string | null;
          day_number: number | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['rumors']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['rumors']['Insert']>;
      };
      notifications: {
        Row: {
          id: string;
          recipient_profile_id: string | null;
          recipient_participant_id: string | null;
          title: string;
          body: string | null;
          type: string;
          link_url: string | null;
          is_read: boolean;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['notifications']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['notifications']['Insert']>;
      };
      audit_log: {
        Row: {
          id: string;
          actor_profile_id: string | null;
          action: string;
          entity_type: string | null;
          entity_id: string | null;
          before_json: Json | null;
          after_json: Json | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['audit_log']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['audit_log']['Insert']>;
      };
      cast_applications: {
        Row: {
          id: string;
          player_name: string;
          contact: string;
          character_1_id: string | null;
          character_2_id: string | null;
          character_3_id: string | null;
          experience: string | null;
          play_style: string | null;
          pet_readiness: 'yes' | 'no' | 'temporary' | null;
          boundaries: string | null;
          comment: string | null;
          status: 'pending' | 'approved' | 'rejected';
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['cast_applications']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['cast_applications']['Insert']>;
      };
    };
  };
}

export type ParticipantStatus = 'free' | 'pet' | 'master' | 'elite' | 'celestia' | 'gm';
export type GameType = 'dice' | 'high_card' | 'roulette' | 'slots' | 'blackjack' | 'bluff_duel' | 'truth_or_bet';
export type StakeType = 'points' | 'debt' | 'secret' | 'pet_temp' | 'service' | 'challenge_right';
export type TransactionType = 'game_win' | 'game_loss' | 'bet_win' | 'bet_loss' | 'admin_adjustment' | 'fee' | 'transfer' | 'debt_payment' | 'penalty' | 'creator_fee' | 'academy_fee';
export type PariStatus = 'draft' | 'open' | 'closed' | 'awaiting_resolution' | 'resolved' | 'cancelled';

export type Character = Database['public']['Tables']['characters']['Row'];
export type Participant = Database['public']['Tables']['participants']['Row'];
export type GameSession = Database['public']['Tables']['game_sessions']['Row'];
export type PariMarket = Database['public']['Tables']['pari_markets']['Row'];
export type SuperGame = Database['public']['Tables']['super_games']['Row'];
export type Notification = Database['public']['Tables']['notifications']['Row'];
