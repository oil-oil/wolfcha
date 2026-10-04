import type { MatchingRoster } from "./matching-roster";

const DEMO_NAMES = ["小猹", "阿麦", "林间晚风", "桃子", "北斗", "橘子汽水", "阿白", "月半", "松果", "小满", "长夜", "不晚"];

/** Preview-only assigned AI roster; the background crowd is maintained separately. */
export function createDemoRoster(playerCount: number, round: number): MatchingRoster {
  return {
    roundId: `preview-${round}`,
    playerCount,
    // Intentionally unsorted: identity and destination must follow seat, not index.
    participants: Array.from({ length: playerCount }, (_, seat) => ({
      playerId: `wolfcha-ai-${seat + 1}`,
      displayName: DEMO_NAMES[seat],
      seat,
      avatarSeed: `wolfcha-match-${seat + 1}`,
      gender: seat % 2 ? "female" as const : "male" as const,
    })).reverse(),
  };
}
