import type { Gender } from "@/lib/character-generator";

export interface CustomCharacter {
  id: string;
  user_id: string;
  display_name: string;
  gender: Gender;
  age: number;
  mbti: string;
  basic_info?: string;
  style_label?: string;
  avatar_seed?: string;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface CustomCharacterInput {
  display_name: string;
  gender: Gender;
  age: number;
  mbti: string;
  basic_info?: string;
  style_label?: string;
  avatar_seed?: string;
}

export const MAX_CUSTOM_CHARACTERS = 20;

export const MBTI_OPTIONS = [
  "", // Not set
  "INTJ", "INTP", "ENTJ", "ENTP",
  "INFJ", "INFP", "ENFJ", "ENFP",
  "ISTJ", "ISFJ", "ESTJ", "ESFJ",
  "ISTP", "ISFP", "ESTP", "ESFP",
] as const;

export const GENDER_OPTIONS: Gender[] = ["male", "female", "nonbinary"];

export const FIELD_LIMITS = {
  display_name: { min: 1, max: 20 },
  age: { min: 16, max: 70 },
  basic_info: { max: 200 },
  style_label: { max: 50 },
} as const;
