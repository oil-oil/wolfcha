"use client";

import { useCallback } from "react";
import { useAtom } from "jotai";
import type { GameState, Player, Alignment } from "@/types/game";
import { gameStateAtom } from "@/store/game-machine";
import {
  transitionPhase,
  addSystemMessage,
  killPlayer,
  checkWinCondition,
  generateHunterShoot,
} from "@/lib/game-master";
import { getSystemMessages } from "@/lib/game-texts";
import { getI18n } from "@/i18n/translator";
import { DELAY_CONFIG, getRoleName } from "@/lib/game-constants";
import { delay, type FlowToken } from "@/lib/game-flow-controller";
import { playNarrator } from "@/lib/narrator-audio-player";
import { gameStatsTracker } from "@/hooks/useGameStats";
import { gameSessionTracker } from "@/lib/game-session-tracker";

export interface SpecialEventsCallbacks {
  setDialogue: (speaker: string, text: string, isStreaming?: boolean) => void;
  setIsWaitingForAI: (waiting: boolean) => void;
  waitForUnpause: () => Promise<void>;
  isTokenValid: (token: FlowToken) => boolean;
  getAccessToken: () => string | null;
}

export interface SpecialEventsActions {
  handleHunterDeath: (state: GameState, hunter: Player, diedAtNight: boolean, token: FlowToken, afterHunter: (state: GameState) => Promise<void>) => Promise<void>;
  handleHumanHunterShoot: (targetSeat: number, diedAtNight: boolean) => Promise<GameState>;
  endGame: (state: GameState, winner: Alignment) => Promise<void>;
  resolveNight: (state: GameState, token: FlowToken, afterResolve: (state: GameState) => Promise<void>) => Promise<void>;
}

/**
 * 特殊事件 Hook
 * 负责管理猎人开枪、游戏结束、夜晚结算等特殊流程
 */
export function useSpecialEvents(
  callbacks: SpecialEventsCallbacks
): SpecialEventsActions {
  const getTexts = () => {
    const { t } = getI18n();
    return {
      t,
      systemMessages: getSystemMessages(),
      speakerHost: t("speakers.host"),
      speakerSystem: t("speakers.system"),
    };
  };
  const [, setGameState] = useAtom(gameStateAtom);

  const { setDialogue, setIsWaitingForAI, waitForUnpause, isTokenValid, getAccessToken } = callbacks;

  /** 处理猎人死亡开枪 */
  const handleHunterDeath = useCallback(async (
    state: GameState,
    hunter: Player,
    diedAtNight: boolean,
    token: FlowToken,
    afterHunter: (state: GameState) => Promise<void>
  ) => {
    const texts = getTexts();
    let currentState = transitionPhase(state, "HUNTER_SHOOT");
    setGameState(currentState);

    if (hunter.isHuman) {
      // 存储是否夜间死亡的信息，供后续 handleNightAction 使用
      (currentState as GameState & { _hunterDiedAtNight?: boolean })._hunterDiedAtNight = diedAtNight;
      setGameState(currentState);
      setDialogue(texts.speakerSystem, texts.t("specialEvents.hunterPrompt"), false);
      return;
    }

    // AI 猎人开枪
    setIsWaitingForAI(true);
    const targetSeat = await generateHunterShoot(currentState, hunter);
    setIsWaitingForAI(false);

    if (!isTokenValid(token)) return;

    if (targetSeat !== null) {
      currentState = killPlayer(currentState, targetSeat);
      const target = currentState.players.find((p) => p.seat === targetSeat);
      if (target) {
        currentState = addSystemMessage(currentState, texts.systemMessages.hunterShoot(hunter.seat + 1, targetSeat + 1, target.displayName));
        setDialogue(texts.speakerHost, texts.systemMessages.hunterShoot(hunter.seat + 1, targetSeat + 1, target.displayName), false);
      }

      // 记录猎人开枪
      const shot = { hunterSeat: hunter.seat, targetSeat };
      if (diedAtNight) {
        const prevNightRecord = (currentState.nightHistory || {})[currentState.day] || {};
        currentState = {
          ...currentState,
          nightHistory: {
            ...(currentState.nightHistory || {}),
            [currentState.day]: { ...prevNightRecord, hunterShot: shot },
          },
        };
      } else {
        const prevDayRecord = (currentState.dayHistory || {})[currentState.day] || {};
        currentState = {
          ...currentState,
          dayHistory: {
            ...(currentState.dayHistory || {}),
            [currentState.day]: { ...prevDayRecord, hunterShot: shot },
          },
        };
      }
      setGameState(currentState);
    }

    const winner = checkWinCondition(currentState);
    if (winner) {
      await endGame(currentState, winner);
      return;
    }

    await delay(DELAY_CONFIG.LONG);
    await waitForUnpause();
    if (!isTokenValid(token)) return;

    await afterHunter(currentState);
  }, [ setGameState, setDialogue, setIsWaitingForAI, waitForUnpause, isTokenValid]);

  /** 人类猎人开枪 */
  const handleHumanHunterShoot = useCallback(async (
    targetSeat: number,
    diedAtNight: boolean
  ): Promise<GameState> => {
    // 这个函数返回更新后的状态，由主 hook 处理后续流程
    return {} as GameState; // 占位，实际逻辑在主 hook 中
  }, []);

  /** 游戏结束 */
  const endGame = useCallback(async (state: GameState, winner: Alignment) => {
    const texts = getTexts();
    let currentState = transitionPhase(state, "GAME_END");
    currentState = { ...currentState, winner };

    const roleReveal = currentState.players
      .map((p) => texts.t("specialEvents.roleRevealItem", { seat: p.seat + 1, name: p.displayName, role: getRoleName(p.role) }))
      .join(" | ");

    currentState = addSystemMessage(currentState, winner === "village" ? texts.systemMessages.villageWin : texts.systemMessages.wolfWin);
    currentState = addSystemMessage(currentState, texts.t("specialEvents.roleRevealLine", { list: roleReveal }));
    setDialogue(texts.speakerHost, winner === "village" ? texts.t("specialEvents.villageWinLine") : texts.t("specialEvents.wolfWinLine"), false);

    setGameState(currentState);
    
    // 更新游戏会话数据（前端直接调用 Supabase）
    const winnerType = winner === "village" ? "villager" : "wolf";
    gameSessionTracker.end(winnerType, true).catch((err) => {
      console.error("[game-session] Failed to end:", err);
    });
    
    // 播放游戏结束语音
    await playNarrator(winner === "village" ? "villageWin" : "wolfWin");
  }, [setGameState, setDialogue]);

  /** 结算夜晚 */
  const resolveNight = useCallback(async (
    state: GameState,
    token: FlowToken,
    afterResolve: (state: GameState) => Promise<void>
  ) => {
    const texts = getTexts();
    let currentState = transitionPhase(state, "NIGHT_RESOLVE");
    setGameState(currentState);

    const { wolfTarget, guardTarget, witchSave, witchPoison } = currentState.nightActions;
    let wolfKillSuccessful = false;
    let wolfVictimSeat: number | undefined;
    let poisonVictimSeat: number | undefined;

    // 狼人击杀判定
    if (wolfTarget !== undefined) {
      const isProtected = guardTarget === wolfTarget;
      const isSaved = witchSave === true;

      // If both guard and witch save are applied, the victim still dies (milk/guard overlap).
      if ((isProtected && isSaved) || (!isProtected && !isSaved)) {
        wolfKillSuccessful = true;
        wolfVictimSeat = wolfTarget;
      }
    }

    // 女巫毒杀判定
    if (witchPoison !== undefined) {
      poisonVictimSeat = witchPoison;
    }

    // 更新状态
    currentState = {
      ...currentState,
      nightActions: {
        ...currentState.nightActions,
        lastGuardTarget: guardTarget,
        pendingWolfVictim: wolfKillSuccessful ? wolfVictimSeat : undefined,
        pendingPoisonVictim: poisonVictimSeat,
      },
    };

    // 记录夜晚历史
    currentState = {
      ...currentState,
      nightHistory: {
        ...(currentState.nightHistory || {}),
        [currentState.day]: {
          guardTarget: currentState.nightActions.guardTarget,
          wolfTarget: currentState.nightActions.wolfTarget,
          witchSave: currentState.nightActions.witchSave,
          witchPoison: currentState.nightActions.witchPoison,
          seerTarget: currentState.nightActions.seerTarget,
          seerResult: currentState.nightActions.seerResult,
        },
      },
    };

    setGameState(currentState);

    await delay(DELAY_CONFIG.LONG);
    await waitForUnpause();
    if (!isTokenValid(token)) return;

    currentState = transitionPhase(currentState, "DAY_START");
    currentState = addSystemMessage(currentState, texts.systemMessages.dayBreak);
    setGameState(currentState);
    setDialogue(texts.speakerHost, texts.systemMessages.dayBreak, false);

    // 天亮时同步游戏进度到数据库
    gameSessionTracker.syncProgress().catch(() => {});

    // 播放旁白语音
    await playNarrator("dayBreak");

    await delay(DELAY_CONFIG.MEDIUM);
    await waitForUnpause();
    if (!isTokenValid(token)) return;

    await afterResolve(currentState);
  }, [setGameState, setDialogue, waitForUnpause, isTokenValid]);

  return {
    handleHunterDeath,
    handleHumanHunterShoot,
    endGame,
    resolveNight,
  };
}
