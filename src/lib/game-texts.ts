import { getI18n } from "@/i18n/translator";
import type { AppLocale } from "@/i18n/config";

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

export const SYSTEM_MESSAGES_ZH_FALLBACK = getSystemMessages("zh");
export const SYSTEM_MESSAGES = getSystemMessages();

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

export const UI_TEXT = getUiText();

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
