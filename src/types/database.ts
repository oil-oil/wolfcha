export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      user_credits: {
        Row: {
          id: string;
          credits: number;
          referral_code: string;
          referred_by: string | null;
          total_referrals: number;
          last_daily_bonus_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          credits?: number;
          referral_code: string;
          referred_by?: string | null;
          total_referrals?: number;
          last_daily_bonus_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          credits?: number;
          referral_code?: string;
          referred_by?: string | null;
          total_referrals?: number;
          last_daily_bonus_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      referral_records: {
        Row: {
          id: string;
          referrer_id: string;
          referred_id: string;
          referral_code: string;
          credits_granted: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          referrer_id: string;
          referred_id: string;
          referral_code: string;
          credits_granted?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          referrer_id?: string;
          referred_id?: string;
          referral_code?: string;
          credits_granted?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      campaign_daily_quota: {
        Row: {
          id: string;
          user_id: string;
          campaign_code: string;
          quota_date: string;
          granted_quota: number;
          consumed_quota: number;
          expires_at: string;
          claimed_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          campaign_code: string;
          quota_date: string;
          granted_quota?: number;
          consumed_quota?: number;
          expires_at: string;
          claimed_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          campaign_code?: string;
          quota_date?: string;
          granted_quota?: number;
          consumed_quota?: number;
          expires_at?: string;
          claimed_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      demo_config: {
        Row: {
          id: string;
          enabled: boolean;
          starts_at: string | null;
          expires_at: string | null;
          updated_at: string;
          updated_by: string | null;
          notes: string | null;
        };
        Insert: {
          id: string;
          enabled?: boolean;
          starts_at?: string | null;
          expires_at?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          notes?: string | null;
        };
        Update: {
          id?: string;
          enabled?: boolean;
          starts_at?: string | null;
          expires_at?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          notes?: string | null;
        };
        Relationships: [];
      };
      sponsor_clicks: {
        Row: {
          id: string;
          sponsor_id: string;
          ref: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          sponsor_id: string;
          ref?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          sponsor_id?: string;
          ref?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      redemption_codes: {
        Row: {
          id: string;
          code: string;
          credits_amount: number;
          is_redeemed: boolean;
          redeemed_by: string | null;
          redeemed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          credits_amount?: number;
          is_redeemed?: boolean;
          redeemed_by?: string | null;
          redeemed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          credits_amount?: number;
          is_redeemed?: boolean;
          redeemed_by?: string | null;
          redeemed_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      redemption_records: {
        Row: {
          id: string;
          user_id: string;
          code: string;
          credits_granted: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          code: string;
          credits_granted: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          code?: string;
          credits_granted?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      game_sessions: {
        Row: {
          id: string;
          user_id: string;
          player_count: number;
          difficulty: string | null;
          winner: "wolf" | "villager" | null;
          completed: boolean;
          rounds_played: number;
          duration_seconds: number | null;
          ai_calls_count: number;
          ai_input_chars: number;
          ai_output_chars: number;
          ai_prompt_tokens: number;
          ai_completion_tokens: number;
          used_custom_key: boolean;
          credit_authorized: boolean;
          model_used: string | null;
          user_email: string | null;
          region: string | null;
          last_activity_at: string;
          created_at: string;
          ended_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          player_count: number;
          difficulty?: string | null;
          winner?: "wolf" | "villager" | null;
          completed?: boolean;
          rounds_played?: number;
          duration_seconds?: number | null;
          ai_calls_count?: number;
          ai_input_chars?: number;
          ai_output_chars?: number;
          ai_prompt_tokens?: number;
          ai_completion_tokens?: number;
          used_custom_key?: boolean;
          credit_authorized?: boolean;
          model_used?: string | null;
          user_email?: string | null;
          region?: string | null;
          last_activity_at?: string;
          created_at?: string;
          ended_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          player_count?: number;
          difficulty?: string | null;
          winner?: "wolf" | "villager" | null;
          completed?: boolean;
          rounds_played?: number;
          duration_seconds?: number | null;
          ai_calls_count?: number;
          ai_input_chars?: number;
          ai_output_chars?: number;
          ai_prompt_tokens?: number;
          ai_completion_tokens?: number;
          used_custom_key?: boolean;
          credit_authorized?: boolean;
          model_used?: string | null;
          user_email?: string | null;
          region?: string | null;
          last_activity_at?: string;
          created_at?: string;
          ended_at?: string | null;
        };
        Relationships: [];
      };
      multiplayer_rooms: {
        Row: {
          id: string;
          code: string;
          host_user_id: string;
          game_session_owner_id: string | null;
          status: "lobby" | "in_game" | "finished" | "closed";
          phase: string;
          day: number;
          winner: "village" | "wolf" | null;
          version: number;
          settings: Json;
          server_state: Json | null;
          public_state: Json | null;
          created_at: string;
          updated_at: string;
          started_at: string | null;
          finished_at: string | null;
        };
        Insert: {
          id?: string;
          code: string;
          host_user_id: string;
          game_session_owner_id?: string | null;
          status?: "lobby" | "in_game" | "finished" | "closed";
          phase?: string;
          day?: number;
          winner?: "village" | "wolf" | null;
          version?: number;
          settings?: Json;
          server_state?: Json | null;
          public_state?: Json | null;
          created_at?: string;
          updated_at?: string;
          started_at?: string | null;
          finished_at?: string | null;
        };
        Update: {
          id?: string;
          code?: string;
          host_user_id?: string;
          game_session_owner_id?: string | null;
          status?: "lobby" | "in_game" | "finished" | "closed";
          phase?: string;
          day?: number;
          winner?: "village" | "wolf" | null;
          version?: number;
          settings?: Json;
          server_state?: Json | null;
          public_state?: Json | null;
          created_at?: string;
          updated_at?: string;
          started_at?: string | null;
          finished_at?: string | null;
        };
        Relationships: [];
      };
      multiplayer_members: {
        Row: {
          room_id: string;
          user_id: string;
          display_name: string;
          role: "host" | "player" | "spectator";
          seat: number | null;
          ready: boolean;
          connected: boolean;
          created_at: string;
          updated_at: string;
          last_seen_at: string | null;
        };
        Insert: {
          room_id: string;
          user_id: string;
          display_name: string;
          role?: "host" | "player" | "spectator";
          seat?: number | null;
          ready?: boolean;
          connected?: boolean;
          created_at?: string;
          updated_at?: string;
          last_seen_at?: string | null;
        };
        Update: {
          room_id?: string;
          user_id?: string;
          display_name?: string;
          role?: "host" | "player" | "spectator";
          seat?: number | null;
          ready?: boolean;
          connected?: boolean;
          created_at?: string;
          updated_at?: string;
          last_seen_at?: string | null;
        };
        Relationships: [];
      };
      multiplayer_events: {
        Row: {
          id: string;
          room_id: string;
          version: number;
          type: string;
          visibility: "public" | "private";
          visible_to_user_ids: string[] | null;
          actor_user_id: string | null;
          payload: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          version: number;
          type: string;
          visibility?: "public" | "private";
          visible_to_user_ids?: string[] | null;
          actor_user_id?: string | null;
          payload?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          room_id?: string;
          version?: number;
          type?: string;
          visibility?: "public" | "private";
          visible_to_user_ids?: string[] | null;
          actor_user_id?: string | null;
          payload?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      multiplayer_commands: {
        Row: {
          room_id: string;
          command_id: string;
          expected_version: number;
          result_version: number;
          actor_user_id: string | null;
          created_at: string;
        };
        Insert: {
          room_id: string;
          command_id: string;
          expected_version: number;
          result_version: number;
          actor_user_id?: string | null;
          created_at?: string;
        };
        Update: {
          room_id?: string;
          command_id?: string;
          expected_version?: number;
          result_version?: number;
          actor_user_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      multiplayer_game_session_claims: {
        Row: {
          session_id: string;
          room_id: string;
          user_id: string;
          claimed_at: string;
          expires_at: string;
          released_at: string | null;
        };
        Insert: {
          session_id: string;
          room_id: string;
          user_id: string;
          claimed_at?: string;
          expires_at?: string;
          released_at?: string | null;
        };
        Update: {
          session_id?: string;
          room_id?: string;
          user_id?: string;
          claimed_at?: string;
          expires_at?: string;
          released_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      sponsor_click_stats: {
        Row: {
          sponsor_id: string;
          total_clicks: number;
          active_days: number;
          last_click_at: string | null;
        };
      };
    };
    Functions: {
      create_multiplayer_room: {
        Args: {
          p_room_id: string;
          p_code: string;
          p_host_user_id: string;
          p_status: string;
          p_phase: string;
          p_day: number;
          p_winner: string | null;
          p_settings: Json;
          p_server_state: Json | null;
          p_public_state: Json | null;
          p_created_at: string | null;
          p_started_at: string | null;
          p_display_name: string;
          p_seat: number | null;
          p_ready: boolean;
          p_connected: boolean;
        };
        Returns: {
          room_id: string;
          version: number;
        }[];
      };
      upsert_multiplayer_member: {
        Args: {
          p_room_id: string;
          p_expected_version: number;
          p_actor_user_id: string | null;
          p_user_id: string;
          p_display_name: string;
          p_role: string;
          p_seat: number | null;
          p_ready: boolean;
          p_connected: boolean;
          p_event_type: string | null;
          p_event_payload: Json | null;
        };
        Returns: {
          version: number;
        }[];
      };
      transition_multiplayer_room: {
        Args: {
          p_room_id: string;
          p_expected_version: number;
          p_actor_user_id: string | null;
          p_status: string | null;
          p_phase: string | null;
          p_day: number | null;
          p_winner: string | null;
          p_server_state: Json | null;
          p_public_state: Json | null;
          p_started_at: string | null;
          p_finished_at: string | null;
          p_event_type: string | null;
          p_event_payload: Json | null;
        };
        Returns: {
          version: number;
        }[];
      };
      apply_multiplayer_command: {
        Args: {
          p_room_id: string;
          p_expected_version: number;
          p_command_id: string;
          p_actor_user_id: string | null;
          p_patch: Json;
          p_event_type: string | null;
          p_event_payload: Json | null;
          p_event_visibility?: "public" | "private";
          p_visible_to_user_ids?: string[] | null;
        };
        Returns: {
          version: number;
          duplicate: boolean;
        }[];
      };
      takeover_multiplayer_timeout: {
        Args: {
          p_room_id: string;
          p_expected_version: number;
          p_command_id: string;
          p_actor_user_id: string | null;
          p_timed_out_user_ids: string[];
          p_patch: Json;
          p_event_type: string | null;
          p_event_payload: Json | null;
        };
        Returns: {
          version: number;
          duplicate: boolean;
        }[];
      };
      start_multiplayer_room: {
        Args: {
          p_room_id: string;
          p_expected_version: number;
          p_session_id: string;
          p_user_id: string;
          p_patch: Json;
          p_event_type: string | null;
          p_event_payload: Json | null;
        };
        Returns: {
          version: number;
          authorized: boolean;
        }[];
      };
      purge_multiplayer_history: {
        Args: { p_retention_days?: number };
        Returns: number;
      };
      increment_multiplayer_ai_usage: {
        Args: {
          p_session_id: string;
          p_calls: number;
          p_input_chars: number;
          p_output_chars: number;
          p_prompt_tokens: number;
          p_completion_tokens: number;
        };
        Returns: boolean;
      };
      claim_multiplayer_game_session: {
        Args: {
          p_session_id: string;
          p_user_id: string;
          p_room_id: string;
        };
        Returns: boolean;
      };
      release_multiplayer_game_session: {
        Args: {
          p_session_id: string;
          p_user_id: string;
          p_room_id: string;
        };
        Returns: boolean;
      };
      leave_multiplayer_room: {
        Args: {
          p_room_id: string;
          p_user_id: string;
          p_expected_version: number;
          p_patch: Json;
          p_event_type: string | null;
          p_event_payload: Json | null;
        };
        Returns: { version: number }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
