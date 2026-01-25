import { getI18n } from "@/i18n/translator";
import type { AppLocale } from "@/i18n/config";

export const SYSTEM_MESSAGES = {
  gameStart: "人到齐了，开始吧。",
  nightFall: (day: number) => `第 ${day} 夜，天黑请闭眼`,
  summarizingDay: "整理今日要点…",
  dayBreak: "天亮了，请睁眼",
  guardActionStart: "守卫请睁眼",
  wolfActionStart: "狼人请睁眼",
  witchActionStart: "女巫请睁眼",
  seerActionStart: "预言家请睁眼",
  peacefulNight: "昨晚平安无事",
  playerKilled: (seat: number, name: string) => `${seat}号 ${name} 昨晚出局`,
  playerMilkKilled: (seat: number, name: string) => `${seat}号 ${name} 昨晚被毒奶带走`,
  playerPoisoned: (seat: number, name: string) => `${seat}号 ${name} 昨晚中毒出局`,
  badgeSpeechStart: "警徽竞选开始，请候选人依次发言",
  badgeElectionStart: "开始警徽评选",
  badgeRevote: "警徽平票，重新投票",
  badgeElected: (seat: number, name: string, votes: number) => `警徽授予 ${seat}号 ${name}（${votes}票）`,
  dayDiscussion: "开始自由发言",
  voteStart: "发言结束，开始投票。",
  playerExecuted: (seat: number, name: string, votes: number) => `${seat}号 ${name} 以 ${votes} 票出局`,
  voteTie: "票数相同，今天无人出局",
  villageWin: "好人获胜。",
  wolfWin: "狼人获胜。",
  seerResult: (seat: number, isWolf: boolean) => `查验结果：${seat}号是${isWolf ? "狼人" : "好人"}`,
  wolfAttack: (seat: number, name: string) => `你们决定击杀：${seat}号 ${name}`,
  witchSave: "你使用了解药",
  witchPoison: (seat: number, name: string) => `你对 ${seat}号 ${name} 使用了毒药`,
  guardProtect: (seat: number, name: string) => `你守护了 ${seat}号 ${name}`,
  hunterShoot: (hunterSeat: number, targetSeat: number, targetName: string) => `${hunterSeat}号猎人开枪带走了 ${targetSeat}号 ${targetName}`,
  badgeTransferStart: (seat: number, name: string) => `${seat}号 ${name} 是警长，请选择移交警徽的对象或撕毁警徽`,
  badgeTransferred: (fromSeat: number, toSeat: number, toName: string) => `警徽移交给 ${toSeat}号 ${toName}`,
  badgeTorn: (seat: number, name: string) => `${seat}号 ${name} 选择撕毁警徽`,
};

export const getSystemMessages = (locale?: AppLocale) => {
  const { t } = getI18n(locale);
  return {
    gameStart: t("system.gameStart"),
    nightFall: (day: number) => t("system.nightFall", { day }),
    summarizingDay: t("system.summarizingDay"),
    dayBreak: t("system.dayBreak"),
    guardActionStart: t("system.guardActionStart"),
    wolfActionStart: t("system.wolfActionStart"),
    witchActionStart: t("system.witchActionStart"),
    seerActionStart: t("system.seerActionStart"),
    peacefulNight: t("system.peacefulNight"),
    playerKilled: (seat: number, name: string) => t("system.playerKilled", { seat, name }),
    playerMilkKilled: (seat: number, name: string) => t("system.playerMilkKilled", { seat, name }),
    playerPoisoned: (seat: number, name: string) => t("system.playerPoisoned", { seat, name }),
    badgeSpeechStart: t("system.badgeSpeechStart"),
    badgeElectionStart: t("system.badgeElectionStart"),
    badgeRevote: t("system.badgeRevote"),
    badgeElected: (seat: number, name: string, votes: number) => t("system.badgeElected", { seat, name, votes }),
    dayDiscussion: t("system.dayDiscussion"),
    voteStart: t("system.voteStart"),
    playerExecuted: (seat: number, name: string, votes: number) => t("system.playerExecuted", { seat, name, votes }),
    voteTie: t("system.voteTie"),
    villageWin: t("system.villageWin"),
    wolfWin: t("system.wolfWin"),
    seerResult: (seat: number, isWolf: boolean) => t("system.seerResult", { seat, result: isWolf ? t("alignments.wolf") : t("alignments.good") }),
    wolfAttack: (seat: number, name: string) => t("system.wolfAttack", { seat, name }),
    witchSave: t("system.witchSave"),
    witchPoison: (seat: number, name: string) => t("system.witchPoison", { seat, name }),
    guardProtect: (seat: number, name: string) => t("system.guardProtect", { seat, name }),
    hunterShoot: (hunterSeat: number, targetSeat: number, targetName: string) => t("system.hunterShoot", { hunterSeat, targetSeat, targetName }),
    badgeTransferStart: (seat: number, name: string) => t("system.badgeTransferStart", { seat, name }),
    badgeTransferred: (fromSeat: number, toSeat: number, toName: string) => t("system.badgeTransferred", { toSeat, toName }),
    badgeTorn: (seat: number, name: string) => t("system.badgeTorn", { seat, name }),
  };
};

export const getUiText = (locale?: AppLocale) => {
  const { t } = getI18n(locale);
  return {
    waitingSeer: t("ui.waitingSeer"),
    seerChecking: t("ui.seerChecking"),
    waitingWolf: t("ui.waitingWolf"),
    wolfActing: t("ui.wolfActing"),
    wolfCoordinating: t("ui.wolfCoordinating"),
    waitingWitch: t("ui.waitingWitch"),
    witchActing: t("ui.witchActing"),
    waitingGuard: t("ui.waitingGuard"),
    guardActing: t("ui.guardActing"),
    badgeVotePrompt: t("ui.badgeVotePrompt"),
    hunterShoot: t("ui.hunterShoot"),
    hunterAiming: t("ui.hunterAiming"),
    yourTurn: t("ui.yourTurn"),
    votePrompt: t("ui.votePrompt"),
    clickToVote: t("ui.clickToVote"),
    aiThinking: t("ui.aiThinking"),
    aiVoting: t("ui.aiVoting"),
    aiSpeaking: t("ui.aiSpeaking"),
    waitingAction: t("ui.waitingAction"),
    waitingOthers: t("ui.waitingOthers"),
    generatingRoles: t("ui.generatingRoles"),
    startGame: t("ui.startGame"),
    restart: t("ui.restart"),
    speechOrder: t("ui.speechOrder"),
  };
};

export const getSystemPatterns = (locale?: AppLocale) => {
  const { t } = getI18n(locale);
  return {
    nightFall: new RegExp(t("system.patterns.nightFall")),
    playerKilled: new RegExp(t("system.patterns.playerKilled")),
    playerPoisoned: new RegExp(t("system.patterns.playerPoisoned")),
    badgeElected: new RegExp(t("system.patterns.badgeElected")),
    badgeTransferred: new RegExp(t("system.patterns.badgeTransferred")),
    playerExecuted: new RegExp(t("system.patterns.playerExecuted")),
    voteTie: new RegExp(t("system.patterns.voteTie")),
  };
};
