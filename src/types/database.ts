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
          start_request_id: string | null;
          start_request_fingerprint: string | null;
          start_request_source: "demo" | "external" | "spring_quota" | "project_credit" | null;
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
          start_request_id?: string | null;
          start_request_fingerprint?: string | null;
          start_request_source?: "demo" | "external" | "spring_quota" | "project_credit" | null;
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
          start_request_id?: string | null;
          start_request_fingerprint?: string | null;
          start_request_source?: "demo" | "external" | "spring_quota" | "project_credit" | null;
          last_activity_at?: string;
          created_at?: string;
          ended_at?: string | null;
        };
        Relationships: [];
      };
      custom_characters: {
        Row: {
          id: string;
          user_id: string;
          display_name: string;
          gender: string;
          age: number;
          mbti: string;
          basic_info: string | null;
          style_label: string | null;
          avatar_seed: string | null;
          is_deleted: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          display_name: string;
          gender: string;
          age: number;
          mbti: string;
          basic_info?: string | null;
          style_label?: string | null;
          avatar_seed?: string | null;
          is_deleted?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          display_name?: string;
          gender?: string;
          age?: number;
          mbti?: string;
          basic_info?: string | null;
          style_label?: string | null;
          avatar_seed?: string | null;
          is_deleted?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      payment_transactions: {
        Row: {
          id: string;
          user_id: string;
          stripe_session_id: string;
          stripe_payment_intent_id: string | null;
          amount_cents: number;
          currency: string;
          quantity: number;
          credits_added: number;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          stripe_session_id: string;
          stripe_payment_intent_id?: string | null;
          amount_cents: number;
          currency: string;
          quantity: number;
          credits_added: number;
          status: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          stripe_session_id?: string;
          stripe_payment_intent_id?: string | null;
          amount_cents?: number;
          currency?: string;
          quantity?: number;
          credits_added?: number;
          status?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      tokenpay_connections: {
        Row: {
          user_id: string;
          encrypted_api_key: string;
          key_fingerprint: string;
          status: "connected" | "reauthorize_required";
          connected_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          encrypted_api_key: string;
          key_fingerprint: string;
          status?: "connected" | "reauthorize_required";
          connected_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          encrypted_api_key?: string;
          key_fingerprint?: string;
          status?: "connected" | "reauthorize_required";
          connected_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      tokenpay_oauth_flows: {
        Row: {
          state_hash: string;
          user_id: string;
          encrypted_code_verifier: string;
          expires_at: string;
          consumed_at: string | null;
          created_at: string;
        };
        Insert: {
          state_hash: string;
          user_id: string;
          encrypted_code_verifier: string;
          expires_at: string;
          consumed_at?: string | null;
          created_at?: string;
        };
        Update: {
          state_hash?: string;
          user_id?: string;
          encrypted_code_verifier?: string;
          expires_at?: string;
          consumed_at?: string | null;
          created_at?: string;
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
        Relationships: [];
      };
    };
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
