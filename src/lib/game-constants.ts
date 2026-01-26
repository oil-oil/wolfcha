/**
 * 游戏常量配置
 * 遵循 DRY 原则，统一管理所有魔法数字和配置项
 */

/** 游戏基础配置 */
export const GAME_CONFIG = {
  /** 总玩家数 */
  TOTAL_PLAYERS: 10,
  /** 狼人数量 */
  WOLF_COUNT: 3,
  /** 最大重投次数（投票/狼人出刀） */
  MAX_REVOTE_COUNT: 3,
  /** 警长竞选最大重投次数 */
  MAX_BADGE_REVOTE_COUNT: 4,
} as const;

/** 延迟时间配置（毫秒） */
export const DELAY_CONFIG = {
  /** 短延迟 - 状态切换 */
  SHORT: 300,
  /** 中等延迟 - 阶段过渡 */
  MEDIUM: 800,
  /** 长延迟 - 重要事件 */
  LONG: 1200,
  /** 对话显示延迟 */
  DIALOGUE: 900,
  /** 夜晚结算延迟 */
  NIGHT_RESOLVE: 1000,
  /** 开局显示桌面延迟 */
  SHOW_TABLE: 2400,
  /** AI 随机延迟范围 */
  AI_MIN: 500,
  AI_MAX: 1200,
} as const;

/** 角色配置 */
export const ROLE_CONFIG = {
  /** 10人局角色配置 */
  STANDARD_ROLES: [
    "Werewolf", "Werewolf", "Werewolf",
    "Seer",
    "Witch",
    "Hunter",
    "Guard",
    "Villager", "Villager", "Villager",
  ] as const,
} as const;

/** 阶段分类 */
export const PHASE_CATEGORIES = {
  NIGHT_PHASES: [
    "NIGHT_START",
    "NIGHT_GUARD_ACTION",
    "NIGHT_WOLF_ACTION",
    "NIGHT_WITCH_ACTION",
    "NIGHT_SEER_ACTION",
    "NIGHT_RESOLVE",
  ] as const,
  DAY_PHASES: [
    "DAY_START",
    "DAY_BADGE_SIGNUP",
    "DAY_BADGE_SPEECH",
    "DAY_BADGE_ELECTION",
    "DAY_PK_SPEECH",
    "DAY_SPEECH",
    "DAY_LAST_WORDS",
    "DAY_VOTE",
    "DAY_RESOLVE",
  ] as const,
  SPEECH_PHASES: ["DAY_SPEECH", "DAY_LAST_WORDS", "DAY_BADGE_SPEECH", "DAY_PK_SPEECH"] as const,
  SPECIAL_PHASES: ["BADGE_TRANSFER", "HUNTER_SHOOT", "GAME_END"] as const,
} as const;

import { getI18n } from "@/i18n/translator";

/** 获取角色名称（国际化） */
export function getRoleName(role: string): string {
  const { t } = getI18n();
  switch (role) {
    case "Werewolf":
      return t("roles.werewolf");
    case "Seer":
      return t("roles.seer");
    case "Witch":
      return t("roles.witch");
    case "Hunter":
      return t("roles.hunter");
    case "Guard":
      return t("roles.guard");
    default:
      return t("roles.villager");
  }
}
