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
import { SYSTEM_MESSAGES } from "@/lib/game-texts";
import { DELAY_CONFIG, getRoleName } from "@/lib/game-constants";
import { delay, type FlowToken } from "@/lib/game-flow-controller";
import { playNarrator } from "@/lib/narrator-audio-player";

export interface SpecialEventsCallbacks {
  setDialogue: (speaker: string, text: string, isStreaming?: boolean) => void;
  setIsWaitingForAI: (waiting: boolean) => void;
  waitForUnpause: () => Promise<void>;
  isTokenValid: (token: FlowToken) => boolean;
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
  const [, setGameState] = useAtom(gameStateAtom);

  const { setDialogue, setIsWaitingForAI, waitForUnpause, isTokenValid } = callbacks;

  /** 处理猎人死亡开枪 */
  const handleHunterDeath = useCallback(async (
    state: GameState,
    hunter: Player,
    diedAtNight: boolean,
    token: FlowToken,
    afterHunter: (state: GameState) => Promise<void>
  ) => {
    let currentState = transitionPhase(state, "HUNTER_SHOOT");
    setGameState(currentState);

    if (hunter.isHuman) {
      // 存储是否夜间死亡的信息，供后续 handleNightAction 使用
      (currentState as GameState & { _hunterDiedAtNight?: boolean })._hunterDiedAtNight = diedAtNight;
      setGameState(currentState);
      setDialogue("系统", "你是猎人，请选择开枪目标（或放弃）", false);
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
        currentState = addSystemMessage(currentState, SYSTEM_MESSAGES.hunterShoot(hunter.seat + 1, targetSeat + 1, target.displayName));
        setDialogue("主持人", SYSTEM_MESSAGES.hunterShoot(hunter.seat + 1, targetSeat + 1, target.displayName), false);
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
    let currentState = transitionPhase(state, "GAME_END");
    currentState = { ...currentState, winner };

    const roleReveal = currentState.players
      .map((p) => `${p.seat + 1}号 ${p.displayName}: ${getRoleName(p.role)}`)
      .join(" | ");

    currentState = addSystemMessage(currentState, winner === "village" ? SYSTEM_MESSAGES.villageWin : SYSTEM_MESSAGES.wolfWin);
    currentState = addSystemMessage(currentState, `身份揭晓：${roleReveal}`);
    setDialogue("主持人", winner === "village" ? "好人阵营胜利，村庄恢复了和平" : "狼人阵营胜利，村庄陷入黑暗", false);

    setGameState(currentState);
    
    // 播放游戏结束语音
    await playNarrator(winner === "village" ? "villageWin" : "wolfWin");
  }, [setGameState, setDialogue]);

  /** 结算夜晚 */
  const resolveNight = useCallback(async (
    state: GameState,
    token: FlowToken,
    afterResolve: (state: GameState) => Promise<void>
  ) => {
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
    currentState = addSystemMessage(currentState, SYSTEM_MESSAGES.dayBreak);
    setGameState(currentState);
    setDialogue("主持人", SYSTEM_MESSAGES.dayBreak, false);

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
