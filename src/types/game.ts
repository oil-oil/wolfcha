export type Role = "Villager" | "Werewolf" | "Seer" | "Witch" | "Hunter" | "Guard";

export type DifficultyLevel = "easy" | "normal" | "hard";

export type SpeechDirection = "clockwise" | "counterclockwise";

export type DevPreset = "MILK_POISON_TEST" | "LAST_WORDS_TEST";

export interface StartGameOptions {
  fixedRoles?: Role[];
  devPreset?: DevPreset;
  difficulty?: DifficultyLevel;
  playerCount?: number;
  isGenshinMode?: boolean;
}

export type Phase =
  | "LOBBY"
  | "SETUP"
  | "NIGHT_START"
  | "NIGHT_GUARD_ACTION"   // 守卫保护
  | "NIGHT_WOLF_ACTION"    // 狼人出刀
  | "NIGHT_WITCH_ACTION"   // 女巫用药
  | "NIGHT_SEER_ACTION"    // 预言家查验
  | "NIGHT_RESOLVE"
  | "DAY_START"
  | "DAY_BADGE_SIGNUP"     // 警徽竞选报名
  | "DAY_BADGE_SPEECH"     // 警徽竞选发言
  | "DAY_BADGE_ELECTION"   // 警徽评选
  | "DAY_PK_SPEECH"        // PK发言
  | "DAY_SPEECH"
  | "DAY_LAST_WORDS"
  | "DAY_VOTE"
  | "DAY_RESOLVE"
  | "BADGE_TRANSFER"        // 警长移交警徽
  | "HUNTER_SHOOT"          // 猎人开枪
  | "GAME_END";

export type Alignment = "village" | "wolf";

 export interface GameScenario {
   id: string;
   title: string;
   description: string;
   rolesHint: string;
 }

export interface ModelRef {
  provider: "zenmux";
  model: string;
}

export interface Persona {
  styleLabel: string;
  voiceRules: string[];
  riskBias: "safe" | "balanced" | "aggressive";
  mbti: string;
  gender: "male" | "female" | "nonbinary";
  age: number;
  backgroundStory: string;
  voiceId?: string;
  relationships?: string[];
  logicStyle?: string;
  triggerTopics?: string[];
  socialHabit?: string;
  humorStyle?: string;
}

export interface AgentProfile {
  modelRef: ModelRef;
  persona: Persona;
}

export interface Player {
  playerId: string;
  seat: number;
  displayName: string;
  alive: boolean;
  role: Role;
  alignment: Alignment;
  isHuman: boolean;
  agentProfile?: AgentProfile;
}

export type GameEventType =
  | "GAME_START"
  | "ROLE_ASSIGNED"
  | "PHASE_CHANGED"
  | "CHAT_MESSAGE"
  | "SYSTEM_MESSAGE"
  | "NIGHT_ACTION"
  | "VOTE_CAST"
  | "PLAYER_DIED"
  | "GAME_END";

export interface GameEvent {
  id: string;
  ts: number;
  type: GameEventType;
  visibility: "public" | "private";
  visibleTo?: string[];
  payload: unknown;
}

export interface ChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  content: string;
  timestamp: number;
  day?: number;
  phase?: Phase;
  isSystem?: boolean;
  isStreaming?: boolean;
}

export interface GameState {
  gameId: string;
  phase: Phase;
  day: number;
  devMutationId?: number;
  devPhaseJump?: { to: Phase; ts: number };
  isPaused?: boolean;
  scenario?: GameScenario;
  isGenshinMode?: boolean;
  difficulty: DifficultyLevel;
  players: Player[];
  events: GameEvent[];
  messages: ChatMessage[];
  currentSpeakerSeat: number | null;
  nextSpeakerSeatOverride?: number | null;
  daySpeechStartSeat: number | null;
  speechDirection?: SpeechDirection;
  pkTargets?: number[];
  pkSource?: "badge" | "vote";
  badge: {
    holderSeat: number | null;
    candidates: number[];
    signup: Record<string, boolean>;
    votes: Record<string, number>;
    history: Record<number, Record<string, number>>;
    revoteCount: number;
  };
  votes: Record<string, number>;
  voteReasons?: Record<string, string>;
  lastVoteReasons?: Record<string, string>;
  voteHistory: Record<number, Record<string, number>>; // day -> { voterId -> targetSeat }
  nightHistory?: Record<
    number,
    {
      guardTarget?: number;
      wolfTarget?: number;
      witchSave?: boolean;
      witchPoison?: number;
      seerTarget?: number;
      seerResult?: { targetSeat: number; isWolf: boolean };
      deaths?: Array<{ seat: number; reason: "wolf" | "poison" | "milk" }>;
      hunterShot?: { hunterSeat: number; targetSeat: number };
    }
  >;
  dayHistory?: Record<
    number,
    {
      executed?: { seat: number; votes: number };
      voteTie?: boolean;
      hunterShot?: { hunterSeat: number; targetSeat: number };
    }
  >;
  dailySummaries: Record<number, string[]>; // day -> summary bullet list
  dailySummaryFacts: Record<number, DailySummaryFact[]>; // day -> structured facts
  nightActions: {
    guardTarget?: number;        // 守卫保护的目标
    lastGuardTarget?: number;    // 上一晚守卫保护的目标（不能连续保护同一人）
    wolfVotes?: Record<string, number>;
    wolfTarget?: number;         // 狼人出刀目标
    witchSave?: boolean;         // 女巫是否救人
    witchPoison?: number;        // 女巫毒谁
    seerTarget?: number;
    seerResult?: { targetSeat: number; isWolf: boolean };
    seerHistory?: Array<{ targetSeat: number; isWolf: boolean; day: number }>; // 查验历史
    pendingWolfVictim?: number;  // 待公布的狼人击杀目标（警长竞选后公布）
    pendingPoisonVictim?: number; // 待公布的女巫毒杀目标（警长竞选后公布）
  };
  // 角色能力使用记录
  roleAbilities: {
    witchHealUsed: boolean;      // 女巫解药是否已用
    witchPoisonUsed: boolean;    // 女巫毒药是否已用
    hunterCanShoot: boolean;     // 猎人是否能开枪（被毒死不能开枪）
  };
  winner: Alignment | null;
}

export interface DailySummaryFact {
  fact: string;
  day?: number;
  speakerSeat?: number | null;
  speakerName?: string;
  targetSeat?: number | null;
  targetName?: string;
  type?: "vote" | "claim" | "suspicion" | "defense" | "alignment" | "death" | "switch" | "other";
  evidence?: string;
}

export const AVAILABLE_MODELS: ModelRef[] = [
  { provider: "zenmux", model: "deepseek/deepseek-v3.2" },
  {provider:"zenmux",model:"google/gemini-3-flash-preview"},
  // { provider: "openrouter", model: "anthropic/claude-haiku-4.5" },
  // { provider: "openrouter", model: "minimax/minimax-m2.1" },
  {provider:"zenmux",model:"qwen/qwen3-235b-a22b-2507"},
  { provider: "zenmux", model: "moonshotai/kimi-k2-0905" },
  // { provider: "zenmux", model: "z-ai/glm-4.7-flashx" },
  // { provider: "zenmux", model: "qwen/qwen3-max" },
   { provider: "zenmux", model: "volcengine/doubao-seed-1.8" },
  // { provider: "zenmux", model: "google/gemini-2.5-flash-lite-preview-09-2025" },
  // {provider:"zenmux",model:"openai/gpt-5.2-chat"},
  // {provider:"zenmux",model:"anthropic/claude-sonnet-4.5"}
];

export const GENERATOR_MODEL = "google/gemini-2.5-flash-lite";
export const SUMMARY_MODEL = "google/gemini-3-flash-preview";