export type Role = "Villager" | "Werewolf" | "Seer" | "Witch" | "Hunter" | "Guard";

export type Phase =
  | "LOBBY"
  | "SETUP"
  | "NIGHT_START"
  | "NIGHT_GUARD_ACTION"   // 守卫保护
  | "NIGHT_WOLF_CHAT"      // 狼人私聊
  | "NIGHT_WOLF_ACTION"    // 狼人出刀
  | "NIGHT_WITCH_ACTION"   // 女巫用药
  | "NIGHT_SEER_ACTION"    // 预言家查验
  | "NIGHT_RESOLVE"
  | "DAY_START"
  | "DAY_SPEECH"
  | "DAY_LAST_WORDS"
  | "DAY_VOTE"
  | "DAY_RESOLVE"
  | "HUNTER_SHOOT"          // 猎人开枪
  | "GAME_END";

export type Alignment = "village" | "wolf";

export interface ModelRef {
  provider: "openrouter";
  model: string;
}

export interface Persona {
  styleLabel: string;
  voiceRules: string[];
  riskBias: "safe" | "balanced" | "aggressive";
  backgroundStory: string;
  catchphrases?: string[];
  logicStyle?: "intuition" | "logic" | "chaos";
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
  isSystem?: boolean;
  isStreaming?: boolean;
}

export interface GameState {
  gameId: string;
  phase: Phase;
  day: number;
  players: Player[];
  events: GameEvent[];
  messages: ChatMessage[];
  currentSpeakerSeat: number | null;
  daySpeechStartSeat: number | null;
  votes: Record<string, number>;
  voteHistory: Record<number, Record<string, number>>; // day -> { voterId -> targetSeat }
  dailySummaries: Record<number, string[]>; // day -> summary bullet list
  nightActions: {
    guardTarget?: number;        // 守卫保护的目标
    lastGuardTarget?: number;    // 上一晚守卫保护的目标（不能连续保护同一人）
    wolfChatLog?: string[];      // 狼人私聊记录（仅狼人可见）
    wolfVotes?: Record<string, number>;
    wolfTarget?: number;         // 狼人出刀目标
    witchSave?: boolean;         // 女巫是否救人
    witchPoison?: number;        // 女巫毒谁
    seerTarget?: number;
    seerResult?: { targetSeat: number; isWolf: boolean };
    seerHistory?: Array<{ targetSeat: number; isWolf: boolean; day: number }>; // 查验历史
  };
  // 角色能力使用记录
  roleAbilities: {
    witchHealUsed: boolean;      // 女巫解药是否已用
    witchPoisonUsed: boolean;    // 女巫毒药是否已用
    hunterCanShoot: boolean;     // 猎人是否能开枪（被毒死不能开枪）
  };
  winner: Alignment | null;
}

export const AVAILABLE_MODELS: ModelRef[] = [
  // { provider: "openrouter", model: "google/gemini-3-flash-preview" },
  // { provider: "openrouter", model: "deepseek/deepseek-v3.2" },
  // { provider: "openrouter", model: "anthropic/claude-haiku-4.5" },
  // { provider: "openrouter", model: "qwen/qwen3-next-80b-a3b-instruct" },
  { provider: "openrouter", model: "moonshotai/kimi-k2-0905" },
  // { provider: "openrouter", model: "bytedance-seed/seed-1.6" },
];

export const GENERATOR_MODEL = "google/gemini-3-flash-preview";
