import type { Gender } from "@/lib/character-generator";
import { createMatchingPlayer, type MatchedPlayer } from "./matching-characters";

/** Public appearance data supplied by the caller. Seats are zero-based. */
export interface MatchingParticipantInfo {
  playerId: string;
  displayName: string;
  seat: number;
  avatarSeed?: string;
  gender?: Gender;
}

export interface MatchingRoster {
  roundId: string;
  playerCount: number;
  /** Empty while awaiting data; otherwise the complete list for this round. */
  participants: readonly MatchingParticipantInfo[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Validate API data and copy only public appearance fields. */
export function parseMatchingRoster(value: unknown): MatchingRoster {
  if (!isRecord(value) || typeof value.roundId !== "string" || !value.roundId.trim()) {
    throw new Error("本局名单需要提供 roundId。");
  }
  const count = value.playerCount;
  if (typeof count !== "number" || !Number.isInteger(count) || count < 6 || count > 12) {
    throw new Error("playerCount 必须是 6–12 的整数。");
  }
  if (!Array.isArray(value.participants)) throw new Error("participants 必须是角色名单数组。");
  if (value.participants.length && value.participants.length !== count) {
    throw new Error(`本局名单需要包含 ${count} 位角色。等待接口时请传入空数组。`);
  }
  const ids = new Set<string>();
  const seats = new Set<number>();
  const participants = value.participants.map((entry): MatchingParticipantInfo => {
    if (!isRecord(entry) || typeof entry.playerId !== "string" || !entry.playerId.trim() ||
      typeof entry.displayName !== "string" || !entry.displayName.trim()) {
      throw new Error("每位角色都需要非空的 playerId 和 displayName。");
    }
    const playerId = entry.playerId.trim();
    const seat = entry.seat;
    if (ids.has(playerId)) throw new Error(`playerId 重复：${playerId}。`);
    if (typeof seat !== "number" || !Number.isInteger(seat) || seat < 0 || seat >= count || seats.has(seat)) {
      throw new Error(`seat 需要从 0 到 ${count - 1}，每个座位只能有一位角色。`);
    }
    if (entry.gender !== undefined && (typeof entry.gender !== "string" || !["male", "female", "nonbinary"].includes(entry.gender))) {
      throw new Error(`角色 ${playerId} 的 gender 不受支持。`);
    }
    if (entry.avatarSeed !== undefined && typeof entry.avatarSeed !== "string") {
      throw new Error(`角色 ${playerId} 的 avatarSeed 需要是字符串。`);
    }
    ids.add(playerId);
    seats.add(seat);
    return {
      playerId,
      displayName: entry.displayName.trim(),
      seat,
      avatarSeed: typeof entry.avatarSeed === "string" && entry.avatarSeed.trim() ? entry.avatarSeed.trim() : playerId,
      ...(entry.gender !== undefined ? { gender: entry.gender as Gender } : {}),
    };
  }).sort((a, b) => a.seat - b.seat);
  return { roundId: value.roundId.trim(), playerCount: count, participants };
}

export function prepareMatchingPlayers(roster: MatchingRoster): MatchedPlayer[] {
  const half = Math.ceil(roster.playerCount / 2);
  return roster.participants.map((participant) => ({
    ...createMatchingPlayer({
      id: participant.playerId,
      name: participant.displayName,
      avatarSeed: participant.avatarSeed,
      gender: participant.gender,
    }),
    seat: participant.seat,
    facing: participant.seat < half ? "right" : "left",
  }));
}

/** Omitted readiness means the complete API roster can enter automatically. */
export function getReadyPlayerIds(roster: MatchingRoster, readyPlayerIds?: readonly string[]): string[] {
  if (!roster.participants.length) return [];
  if (readyPlayerIds === undefined) return roster.participants.map((participant) => participant.playerId);
  if (!Array.isArray(readyPlayerIds)) throw new Error("readyPlayerIds 必须是角色 ID 数组。");
  const knownIds = new Set(roster.participants.map((participant) => participant.playerId));
  for (const id of readyPlayerIds) {
    if (!knownIds.has(id)) throw new Error(`准备就绪的角色 ${id} 不在本局名单中。`);
  }
  return [...new Set(readyPlayerIds)];
}
