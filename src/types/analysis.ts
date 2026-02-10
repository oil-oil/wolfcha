import type { Alignment, Role } from "./game";

export type NightEventType = "kill" | "save" | "poison" | "check" | "guard";
export type DayEventType = "exile" | "badge" | "hunter_shot";

export interface NightEvent {
  type: NightEventType;
  source: string;
  target: string;
  result?: string;
  blocked?: boolean;
}

export interface VoteRecord {
  voterSeat: number;
  targetSeat: number;
}

export interface DayEvent {
  type: DayEventType;
  target: string;
  voteCount?: number;
  votes?: VoteRecord[];
}

export interface PlayerSpeech {
  seat: number;
  content: string;
}

export interface DayPhase {
  type: "election" | "discussion" | "pk";
  summary?: string;
  speeches?: PlayerSpeech[];
  event?: DayEvent;
  hunterEvent?: DayEvent;
}

export interface TimelineEntry {
  day: number;
  summary: string;
  nightEvents: NightEvent[];
  dayEvents: DayEvent[];
  dayPhases?: DayPhase[];
  speeches?: PlayerSpeech[];
}

export interface PlayerAward {
  playerId: string;
  playerName: string;
  reason: string;
  avatar: string;
  role: Role;
}

export interface RadarStats {
  logic: number;
  speech: number;
  survival: number;
  skillOrHide: number;
  voteOrTicket: number;
}

export interface PersonalStats {
  role: Role;
  userName: string;
  avatar: string;
  alignment: Alignment;
  tags: string[];
  radarStats: RadarStats;
  highlightQuote: string;
  totalScore: number;
}

export interface PlayerReview {
  fromPlayerId: string;
  fromCharacterName: string;
  avatar: string;
  content: string;
  relation: "ally" | "enemy";
  role: Role;
}

export type DeathCause = "killed" | "exiled" | "poisoned" | "shot" | "milk";

export interface PlayerSnapshot {
  playerId: string;
  seat: number;
  name: string;
  avatar: string;
  role: Role;
  alignment: Alignment;
  isAlive: boolean;
  deathDay?: number;
  deathCause?: DeathCause;
  isSheriff?: boolean;
  isHumanPlayer?: boolean;
}

export interface RoundState {
  day: number;
  phase: "night" | "day";
  sheriffSeat?: number;
  aliveCount: { village: number; wolf: number };
  players: PlayerSnapshot[];
}

export interface GameAnalysisData {
  gameId: string;
  timestamp: number;
  duration: number;
  playerCount: number;
  result: "village_win" | "wolf_win";

  awards: {
    mvp: PlayerAward;
    svp: PlayerAward;
  };

  timeline: TimelineEntry[];

  players: PlayerSnapshot[];

  roundStates: RoundState[];

  personalStats: PersonalStats;

  reviews: PlayerReview[];
}

export const RADAR_LABELS_VILLAGE = [
  "逻辑严密",
  "发言清晰",
  "存活评分",
  "技能价值",
  "投票准确",
] as const;

export const RADAR_LABELS_WOLF = [
  "逻辑严密",
  "发言清晰",
  "存活评分",
  "隐匿程度",
  "冲票贡献",
] as const;
