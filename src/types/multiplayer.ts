import type { Alignment, DifficultyLevel, Phase, Role } from "@/types/game";

export type MultiplayerRoomStatus = "lobby" | "in_game" | "finished" | "closed";
export type MultiplayerMemberRole = "host" | "player" | "spectator";
export type MultiplayerPlayerKind = "human" | "ai";

export interface MultiplayerRoomSettings {
  playerCount: number;
  difficulty: DifficultyLevel;
  locale: "zh" | "en";
}

export interface MultiplayerRoomSummary {
  id: string;
  code: string;
  hostUserId: string;
  status: MultiplayerRoomStatus;
  phase: Phase;
  day: number;
  winner: Alignment | null;
  version: number;
  settings: MultiplayerRoomSettings;
  createdAt: string;
  startedAt: string | null;
}

export interface MultiplayerRoomMember {
  userId: string;
  displayName: string;
  role: MultiplayerMemberRole;
  seat: number | null;
  isReady: boolean;
  isConnected: boolean;
}

export interface MultiplayerPublicPlayer {
  seat: number;
  kind: MultiplayerPlayerKind;
  displayName: string;
  avatarSeed: string | null;
  alive: boolean;
  role: Role | null;
  alignment: Alignment | null;
}

export interface MultiplayerPrivateState {
  seat: number | null;
  role: Role | null;
  alignment: Alignment | null;
  wolfTeammates: Array<{ seat: number; displayName: string }>;
  allowedActions: MultiplayerGameCommand["type"][];
  eligibleTargets: number[];
  actionSubmitted: boolean;
  witchNightKill: number | null;
  witchHealAvailable: boolean;
  witchPoisonAvailable: boolean;
  seerHistory: Array<{ targetSeat: number; isWolf: boolean; day: number }>;
  wolfVotes: Record<string, number>;
}

export interface MultiplayerPublicState {
  phase: Phase;
  day: number;
  players: MultiplayerPublicPlayer[];
  messages: MultiplayerChatMessage[];
  currentSpeakerSeat: number | null;
  badge: { holderSeat: number | null; candidates: number[]; signupSeats: number[]; voteProgress: { submitted: number; total: number }; resultCounts: Record<string, number>; destroyed: boolean };
  voteProgress: { submitted: number; total: number; resultCounts: Record<string, number> };
  lastResult: string | null;
  winner: Alignment | null;
  pendingDeaths: Array<{ seat: number }>;
  /** 当前需要真人响应的回合截止时间；无真人待操作时为空。 */
  deadlineAt: string | null;
}

export interface MultiplayerLastResult {
  type: "night" | "badge" | "vote" | "hunter" | "boom" | "badge_transfer";
  day: number;
  deaths?: Array<{ seat: number; reason: "wolf" | "milk" | "poison" | "execution" | "boom" }>;
  targetSeat?: number | null;
  votes?: Record<string, number>;
}

export interface MultiplayerRoomView {
  room: MultiplayerRoomSummary;
  members: MultiplayerRoomMember[];
  publicState: MultiplayerPublicState;
  privateState: MultiplayerPrivateState;
  currentUserId: string;
}

export interface MultiplayerServerPlayer {
  seat: number;
  kind: MultiplayerPlayerKind;
  userId: string | null;
  displayName: string;
  avatarSeed: string | null;
  alive: boolean;
  role: Role | null;
  alignment: Alignment | null;
  aiProfile?: MultiplayerAiProfile;
}

export interface MultiplayerAiProfile {
  styleLabel: string;
  personality: string;
  reasoningStyle: string;
  riskStyle: string;
}

export interface MultiplayerServerState {
  phase: Phase;
  day: number;
  players: MultiplayerServerPlayer[];
  /** Monotonic optimistic-concurrency version. */
  version?: number;
  roomId?: string;
  seed?: string;
  messages?: MultiplayerChatMessage[];
  currentSpeakerSeat?: number | null;
  speechQueue?: number[];
  badge?: MultiplayerBadgeState;
  votes?: Record<string, number>;
  nightActions?: MultiplayerNightActions;
  roleAbilities?: MultiplayerRoleAbilities;
  seerHistory?: Array<{ targetSeat: number; isWolf: boolean; day: number }>;
  pkTargets?: number[];
  pkSource?: "badge" | "vote";
  pendingDeaths?: Array<{ seat: number; reason: "wolf" | "milk" | "poison" | "execution" | "boom" }>;
  pendingTrigger?: "hunter_shot" | "white_wolf_boom" | "badge_transfer" | null;
  queuedTrigger?: "hunter_shot" | "badge_transfer" | null;
  continuationPhase?: "DAY_START" | "NIGHT_START";
  lastWordsSeat?: number | null;
  gameSessionId?: string | null;
  /** 创建本局时实际占用额度的用户；房主转移不会修改此值。 */
  gameSessionOwnerId?: string | null;
  submittedSeats?: Record<string, number[]>;
  lastResult?: MultiplayerLastResult | null;
  winner: Alignment | null;
  processedCommandIds?: string[];
  messageSequence?: number;
  /** 用于识别同一等待回合，避免每次同步都重置计时。 */
  turnKey?: string | null;
  deadlineAt?: string | null;
}

export interface MultiplayerChatMessage {
  id: string;
  playerId: string | null;
  playerName: string;
  content: string;
  day: number;
  phase: Phase;
  isSystem?: boolean;
}

export interface MultiplayerBadgeState {
  holderSeat: number | null;
  candidates: number[];
  signup: Record<string, boolean>;
  votes: Record<string, number>;
  history: Record<number, Record<string, number>>;
  destroyed: boolean;
}

export interface MultiplayerNightActions {
  guardTarget?: number;
  lastGuardTarget?: number;
  wolfVotes: Record<string, number>;
  wolfTarget?: number;
  witchSave?: boolean;
  witchPoison?: number;
  seerTarget?: number;
  seerResult?: { targetSeat: number; isWolf: boolean };
}

export interface MultiplayerRoleAbilities {
  witchHealUsed: boolean;
  witchPoisonUsed: boolean;
  hunterCanShoot: boolean;
  idiotRevealed: boolean;
  whiteWolfKingBoomUsed: boolean;
}

export type MultiplayerGameCommand =
  | MultiplayerCommandBase & { type: "guard"; targetSeat: number | null }
  | MultiplayerCommandBase & { type: "wolf"; targetSeat: number | null }
  | MultiplayerCommandBase & { type: "witch"; save: boolean; poisonTargetSeat: number | null }
  | MultiplayerCommandBase & { type: "seer"; targetSeat: number }
  | MultiplayerCommandBase & { type: "badge_signup"; signup: boolean }
  | MultiplayerCommandBase & { type: "speech"; content: string }
  | MultiplayerCommandBase & { type: "badge_vote"; targetSeat: number }
  | MultiplayerCommandBase & { type: "day_vote"; targetSeat: number | null }
  | MultiplayerCommandBase & { type: "hunter_shot"; targetSeat: number | null }
  | MultiplayerCommandBase & { type: "badge_transfer"; targetSeat: number | null; destroy?: boolean }
  | MultiplayerCommandBase & { type: "white_wolf_boom"; targetSeat: number | null };

export interface MultiplayerCommandBase {
  commandId: string;
  roomId: string;
  expectedVersion: number;
}

export interface MultiplayerRoomError {
  code:
    | "AUTH_REQUIRED"
    | "ROOM_NOT_FOUND"
    | "ROOM_FULL"
    | "ROOM_CONFLICT"
    | "FORBIDDEN"
    | "INVALID_INPUT"
    | "AI_UNAVAILABLE"
    | "INTERNAL_ERROR";
  message: string;
}

export type MultiplayerRoomAck =
  | { ok: true; view: MultiplayerRoomView }
  | { ok: false; error: MultiplayerRoomError };

export interface CreateMultiplayerRoomInput {
  displayName: string;
  playerCount: number;
  difficulty: DifficultyLevel;
  locale: "zh" | "en";
}

export interface JoinMultiplayerRoomInput {
  code: string;
  displayName: string;
}

export interface MultiplayerClientToServerEvents {
  "room:create": (
    input: CreateMultiplayerRoomInput,
    callback: (result: MultiplayerRoomAck) => void
  ) => void;
  "room:join": (
    input: JoinMultiplayerRoomInput,
    callback: (result: MultiplayerRoomAck) => void
  ) => void;
  "room:resume": (
    input: { roomIdOrCode: string },
    callback: (result: MultiplayerRoomAck) => void
  ) => void;
  "room:ready": (
    input: { roomId: string; isReady: boolean; expectedVersion: number },
    callback: (result: MultiplayerRoomAck) => void
  ) => void;
  "room:start": (
    input: { roomId: string; expectedVersion: number; gameSessionId?: string | null },
    callback: (result: MultiplayerRoomAck) => void
  ) => void;
  "room:leave": (
    input: { roomId: string; expectedVersion: number },
    callback: (result: MultiplayerRoomAck) => void
  ) => void;
  "room:close": (
    input: { roomId: string; expectedVersion: number },
    callback: (result: MultiplayerRoomAck) => void
  ) => void;
  "game:command": (
    command: MultiplayerGameCommand,
    callback: (result: MultiplayerRoomAck) => void
  ) => void;
}

export interface MultiplayerServerToClientEvents {
  "room:view": (view: MultiplayerRoomView) => void;
  "room:error": (error: MultiplayerRoomError) => void;
}

export interface MultiplayerSocketData {
  userId: string;
  accessToken: string;
}
