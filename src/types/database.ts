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
          model_used: string | null;
          user_agent: string | null;
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
          model_used?: string | null;
          user_agent?: string | null;
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
          model_used?: string | null;
          user_agent?: string | null;
          created_at?: string;
          ended_at?: string | null;
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
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
