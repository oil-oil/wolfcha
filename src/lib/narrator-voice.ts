/**
 * 旁白语音配置和管理
 * 使用 MiniMax TTS 生成游戏旁白语音
 */

// 旁白音色 ID - Chinese (Mandarin)_Mature_Woman
export const NARRATOR_VOICE_ID = "Chinese (Mandarin)_Mature_Woman";

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

// 根据座位号获取出局语音 key
export const getPlayerDiedKey = (seat: number): NarratorTextKey | null => {
  const seatNumber = seat + 1; // seat 是 0-indexed
  if (seatNumber >= 1 && seatNumber <= 10) {
    return `playerDied${seatNumber}` as NarratorTextKey;
  }
  return null;
};

// 旁白音频文件路径映射
export const getNarratorAudioPath = (key: NarratorTextKey): string => {
  return `/audio/narrator/${key}.mp3`;
};

// 检查旁白音频是否存在（用于前端）
export const checkNarratorAudioExists = async (key: NarratorTextKey): Promise<boolean> => {
  try {
    const response = await fetch(getNarratorAudioPath(key), { method: "HEAD" });
    return response.ok;
  } catch {
    return false;
  }
};
