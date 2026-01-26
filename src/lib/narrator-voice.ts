/**
 * 旁白语音配置和管理
 * 使用 MiniMax TTS 生成游戏旁白语音
 */

import type { AppLocale } from "./voice-constants";

// 旁白音色 ID - Chinese
export const NARRATOR_VOICE_ID = "Chinese (Mandarin)_Mature_Woman";

// 旁白音色 ID - English
export const NARRATOR_VOICE_ID_EN = "Serene_Woman";

// 旁白语音文本定义
export const NARRATOR_TEXTS = {
  // 夜晚阶段
  nightFall: "天黑请闭眼",
  guardWake: "守卫请睁眼",
  guardClose: "守卫请闭眼",
  wolfWake: "狼人请睁眼",
  wolfClose: "狼人请闭眼",
  witchWake: "女巫请睁眼",
  witchClose: "女巫请闭眼",
  seerWake: "预言家请睁眼",
  seerClose: "预言家请闭眼",
  
  // 白天阶段
  dayBreak: "天亮了，请睁眼",
  peacefulNight: "昨晚是平安夜",
  discussionStart: "开始自由发言",
  voteStart: "发言结束，开始投票",
  
  // 警徽阶段
  badgeSpeechStart: "警徽竞选开始",
  badgeElectionStart: "开始警徽评选",
  
  // 出局播报 (1-10号玩家)
  playerDied1: "1号玩家出局",
  playerDied2: "2号玩家出局",
  playerDied3: "3号玩家出局",
  playerDied4: "4号玩家出局",
  playerDied5: "5号玩家出局",
  playerDied6: "6号玩家出局",
  playerDied7: "7号玩家出局",
  playerDied8: "8号玩家出局",
  playerDied9: "9号玩家出局",
  playerDied10: "10号玩家出局",
  
  // 结果公布
  villageWin: "好人获胜",
  wolfWin: "狼人获胜",
} as const;

export type NarratorTextKey = keyof typeof NARRATOR_TEXTS;

// English Narrator Texts
export const NARRATOR_TEXTS_EN: Record<NarratorTextKey, string> = {
  // Night phases
  nightFall: "Night has fallen, please close your eyes",
  guardWake: "Guard, please open your eyes",
  guardClose: "Guard, please close your eyes",
  wolfWake: "Werewolves, please open your eyes",
  wolfClose: "Werewolves, please close your eyes",
  witchWake: "Witch, please open your eyes",
  witchClose: "Witch, please close your eyes",
  seerWake: "Seer, please open your eyes",
  seerClose: "Seer, please close your eyes",
  
  // Day phases
  dayBreak: "Dawn has broken, please open your eyes",
  peacefulNight: "Last night was peaceful",
  discussionStart: "Discussion begins",
  voteStart: "Discussion ends, voting begins",
  
  // Badge phases
  badgeSpeechStart: "Sheriff election begins",
  badgeElectionStart: "Sheriff voting begins",
  
  // Player elimination (1-10)
  playerDied1: "Player 1 has been eliminated",
  playerDied2: "Player 2 has been eliminated",
  playerDied3: "Player 3 has been eliminated",
  playerDied4: "Player 4 has been eliminated",
  playerDied5: "Player 5 has been eliminated",
  playerDied6: "Player 6 has been eliminated",
  playerDied7: "Player 7 has been eliminated",
  playerDied8: "Player 8 has been eliminated",
  playerDied9: "Player 9 has been eliminated",
  playerDied10: "Player 10 has been eliminated",
  
  // Results
  villageWin: "The village wins",
  wolfWin: "The werewolves win",
};

// Get narrator voice ID by locale
export const getNarratorVoiceId = (locale: AppLocale = "zh"): string => {
  return locale === "en" ? NARRATOR_VOICE_ID_EN : NARRATOR_VOICE_ID;
};

// Get narrator text by locale
export const getNarratorText = (key: NarratorTextKey, locale: AppLocale = "zh"): string => {
  return locale === "en" ? NARRATOR_TEXTS_EN[key] : NARRATOR_TEXTS[key];
};

// 根据座位号获取出局语音 key
export const getPlayerDiedKey = (seat: number): NarratorTextKey | null => {
  const seatNumber = seat + 1; // seat 是 0-indexed
  if (seatNumber >= 1 && seatNumber <= 10) {
    return `playerDied${seatNumber}` as NarratorTextKey;
  }
  return null;
};

// 旁白音频文件路径映射 (支持多语言)
export const getNarratorAudioPath = (key: NarratorTextKey, locale: AppLocale = "zh"): string => {
  return `/audio/narrator/${locale}/${key}.mp3`;
};

// 检查旁白音频是否存在（用于前端）
export const checkNarratorAudioExists = async (key: NarratorTextKey, locale: AppLocale = "zh"): Promise<boolean> => {
  try {
    const response = await fetch(getNarratorAudioPath(key, locale), { method: "HEAD" });
    return response.ok;
  } catch {
    return false;
  }
};
