import type { GameState } from "@/types/game";

/** 结算不等于公布。特殊技能换用其他阶段提示词时，也必须保留原来的可见性。 */
export function areNightResultsVisible(state: GameState, day = state.day): boolean {
  if (day > state.day) return false;
  if (day < state.day) return true;
  const announced = state.nightHistory?.[day]?.resultsAnnounced;
  if (announced !== undefined) return announced;
  // 兼容旧存档：第一天警上阶段先竞选，后公布死讯，包括平安夜。
  return !state.phase.startsWith("NIGHT_") && state.phase !== "DAY_START" &&
    !state.phase.startsWith("DAY_BADGE_") &&
    !(["DAY_PK_SPEECH", "WHITE_WOLF_KING_BOOM"].includes(state.phase) && state.pkSource === "badge");
}
