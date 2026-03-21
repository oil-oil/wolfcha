export type Role = "Villager" | "Werewolf" | "Seer" | "Witch" | "Hunter" | "Guard" | "Idiot" | "WhiteWolfKing";

/** Check if a role belongs to the wolf team (used for seer checks, wolf actions, etc.) */
export function isWolfRole(role: string | undefined): boolean {
  return role === "Werewolf" || role === "WhiteWolfKing";
}

export type DifficultyLevel = "easy" | "normal" | "hard";

export type SpeechDirection = "clockwise" | "counterclockwise";

export type DevPreset = "MILK_POISON_TEST" | "LAST_WORDS_TEST";

export interface CustomCharacterData {
  id: string;
  display_name: string;
  gender: "male" | "female" | "nonbinary";
  age: number;
  mbti: string;
  basic_info?: string;
  style_label?: string;
  avatar_seed?: string;
}

export interface StartGameOptions {
  fixedRoles?: Role[];
  devPreset?: DevPreset;
  difficulty?: DifficultyLevel;
  playerCount?: number;
  isGenshinMode?: boolean;
  isSpectatorMode?: boolean;
  customCharacters?: CustomCharacterData[];
  preferredRole?: Role;
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
  | "WHITE_WOLF_KING_BOOM"  // 白狼王自爆
  | "GAME_END";

export type Alignment = "village" | "wolf";

 export interface GameScenario {
   id: string;
   title: string;
   description: string;
   rolesHint: string;
 }

export interface ModelRef {
  provider: "zenmux" | "dashscope" | "newapi";
  model: string;
  /** Override call-time temperature for this model (e.g. some models only support 1) */
  temperature?: number;
  /** Override call-time reasoning/thinking for this model (e.g. some models must enable it) */
  reasoning?: { enabled: boolean, exclude?: boolean,effort?: "minimal" | "low" | "medium" | "high" };
}

export interface Persona {
  styleLabel?: string;
  voiceRules: string[];
  mbti: string;
  gender: "male" | "female" | "nonbinary";
  age: number;
  basicInfo?: string;
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
  avatarSeed?: string;
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
  isLastWords?: boolean;  // Flag for last words (遗言) messages
}

export interface GameState {
  gameId: string;
  phase: Phase;
  day: number;
  startTime?: number;
  devMutationId?: number;
  devPhaseJump?: { to: Phase; ts: number };
  isPaused?: boolean;
  scenario?: GameScenario;
  isGenshinMode?: boolean;
  isSpectatorMode?: boolean;
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
    allVotes: Record<string, number>;
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
      whiteWolfKingBoom?: { boomSeat: number; targetSeat: number };
      idiotRevealed?: { seat: number };
    }
  >;
  dailySummaries: Record<number, string[]>; // day -> summary bullet list
  dailySummaryFacts: Record<number, DailySummaryFact[]>; // day -> structured facts
  dailySummaryVoteData?: Record<number, DailySummaryVoteData>;
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
    idiotRevealed: boolean;      // 白痴是否已翻牌（翻牌后失去投票权但不死）
    whiteWolfKingBoomUsed: boolean; // 白狼王是否已自爆
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

/** Structured vote data extracted from [VOTE_RESULT] to preserve "who voted for whom" for later days. */
export interface DailySummaryVoteData {
  sheriff_election?: { winner: number; votes: Record<string, number[]> };
  execution_vote?: { eliminated: number; votes: Record<string, number[]> };
}

// Shared model IDs
export const MODEL_IDS = {
  zenmux: {
    geminiFlashLite: "google/gemini-3.1-flash-lite-preview",
    geminiFlashPreview: "google/gemini-3-flash-preview",
    deepseek: "deepseek/deepseek-v3.2",
    gpt52Chat: "openai/gpt-5.2-chat",
    claudeHaiku45: "anthropic/claude-haiku-4.5",
    claudeSonnet45: "anthropic/claude-sonnet-4.5",
    claudeOpus45: "anthropic/claude-opus-4.5",
    grok4: "x-ai/grok-4",
    glm47: "z-ai/glm-4.7",
    minimaxM21: "minimax/minimax-m2.1",
  },
  dashscope: {
    qwenFlash: "qwen-flash",
    deepseek: "deepseek-v3.2",
  },
  newapi: {
    gemini3FlashPreview: "gemini-3-flash-preview",
    gemini3ProPreview: "gemini-3-pro-preview",
  },
} as const;

export const DEFAULT_MODEL_CONFIG = {
  generator: MODEL_IDS.zenmux.geminiFlashLite,
  summary: MODEL_IDS.zenmux.geminiFlashLite,
  review: MODEL_IDS.zenmux.geminiFlashPreview,
  validation: {
    zenmux: MODEL_IDS.zenmux.geminiFlashLite,
    dashscope: MODEL_IDS.dashscope.deepseek,
  },
} as const;

// Models for summary & character generation
export const GENERATOR_MODEL = DEFAULT_MODEL_CONFIG.generator;
export const SUMMARY_MODEL = DEFAULT_MODEL_CONFIG.summary;
export const REVIEW_MODEL = DEFAULT_MODEL_CONFIG.review;
export const ZENMUX_VALIDATION_MODEL = DEFAULT_MODEL_CONFIG.validation.zenmux;
export const DASHSCOPE_VALIDATION_MODEL = DEFAULT_MODEL_CONFIG.validation.dashscope;

export const BUILTIN_PLAYER_MODELS: ModelRef[] = [
  // { provider: "zenmux", model: MODEL_IDS.zenmux.deepseek },
  // { provider: "zenmux", model: MODEL_IDS.zenmux.kimiK2 },
  // { provider: "zenmux", model: MODEL_IDS.zenmux.qwen3Max },
  // { provider: "zenmux", model: MODEL_IDS.zenmux.doubaoSeed },
  // { provider: "newapi", model: MODEL_IDS.newapi.gemini3FlashPreview }, // agent-wiki 服务挂了，临时注释
  { provider: "dashscope", model: MODEL_IDS.dashscope.qwenFlash },
  { provider: "dashscope", model: MODEL_IDS.dashscope.deepseek },

];

// Default built-in models exposed to the app when custom key is not enabled.
// This list includes system defaults plus the small built-in player pool.
export const AVAILABLE_MODELS: ModelRef[] = [
  // { provider: "newapi", model: MODEL_IDS.newapi.gemini3FlashPreview }, // agent-wiki 服务挂了，临时注释
  { provider: "dashscope", model: MODEL_IDS.dashscope.qwenFlash },
  { provider: "dashscope", model: MODEL_IDS.dashscope.deepseek },

  // { provider: "dashscope", model: MODEL_IDS.dashscope.qwenFlash },
  // ...BUILTIN_PLAYER_MODELS,
  // { provider: "zenmux", model: MODEL_IDS.zenmux.geminiFlashLite },
  // { provider: "zenmux", model: MODEL_IDS.zenmux.geminiFlashPreview },
];

// Built-in project-key models that the server may call internally.
// These are intentionally not exposed in the custom-key model selector.
export const PROJECT_MODELS: ModelRef[] = [
  ...AVAILABLE_MODELS,
  // { provider: "newapi", model: MODEL_IDS.newapi.gemini3FlashPreview }, // agent-wiki 服务挂了，临时注释
  { provider: "dashscope", model: MODEL_IDS.dashscope.qwenFlash },
  { provider: "dashscope", model: MODEL_IDS.dashscope.deepseek },
  // Generator / summary / review system models (zenmux)
  { provider: "zenmux", model: MODEL_IDS.zenmux.geminiFlashLite },
  { provider: "zenmux", model: MODEL_IDS.zenmux.geminiFlashPreview },
];

// User-selectable models when custom key is enabled.
export const ALL_MODELS: ModelRef[] = [
  { provider: "dashscope", model: MODEL_IDS.dashscope.qwenFlash },
  { provider: "dashscope", model: MODEL_IDS.dashscope.deepseek },
  { provider: "zenmux", model: MODEL_IDS.zenmux.geminiFlashLite },
  { provider: "zenmux", model: MODEL_IDS.zenmux.deepseek },
  { provider: "zenmux", model: MODEL_IDS.zenmux.geminiFlashPreview },
  { provider: "zenmux", model: MODEL_IDS.zenmux.gpt52Chat },
  { provider: "zenmux", model: MODEL_IDS.zenmux.claudeHaiku45 },
  { provider: "zenmux", model: MODEL_IDS.zenmux.claudeSonnet45 },
  { provider: "zenmux", model: MODEL_IDS.zenmux.claudeOpus45 },
  { provider: "zenmux", model: MODEL_IDS.zenmux.grok4 },
  { provider: "zenmux", model: MODEL_IDS.zenmux.glm47, temperature: 1, reasoning: { enabled: false } },
  { provider: "zenmux", model: MODEL_IDS.zenmux.minimaxM21, temperature: 1, reasoning: { enabled: false } },
];

// Models not allowed for in-game players (summary & generation only)
export const NON_PLAYER_MODELS: string[] = [GENERATOR_MODEL, SUMMARY_MODEL, REVIEW_MODEL];

export function filterPlayerModels(models: ModelRef[]): ModelRef[] {
  return models.filter((ref) => !NON_PLAYER_MODELS.includes(ref.model));
}

// Built-in player model pool used when custom key is disabled.
export const PLAYER_MODELS: ModelRef[] = BUILTIN_PLAYER_MODELS;
