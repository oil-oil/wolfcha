"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useAtom } from "jotai";
import { useLocalStorageState } from "ahooks";
import { toast } from "sonner";
import {
  createInitialGameState,
  setupPlayers,
  addSystemMessage,
  addPlayerMessage,
  transitionPhase as rawTransitionPhase,
  checkWinCondition,
  killPlayer,
  tallyVotes,
  getNextAliveSeat,
  generateAISpeechSegments,
  generateAIVote,
  generateDailySummary,
  generateSeerAction,
  generateWolfAction,
  generateWolfChatMessage,
  generateGuardAction,
  generateWitchAction,
  generateHunterShoot,
  type WitchAction,
} from "@/lib/game-master";
import { generateCharacters } from "@/lib/character-generator";
import type { DevPreset, GameState, Player, Phase, Role } from "@/types/game";
import { SYSTEM_MESSAGES, UI_TEXT } from "@/lib/prompts";
import { gameStateAtom, isValidTransition } from "@/store/game-machine";

export interface DialogueState {
  speaker: string;
  text: string;
  isStreaming: boolean;
}

export function useGameLogic() {
  const apiKey = process.env.NEXT_PUBLIC_OPENROUTER_API_KEY || "";
  const [humanName, setHumanName] = useLocalStorageState<string>("wolfcha_human_name", {
    defaultValue: "",
  });
  const [apiKeyConfirmed, setApiKeyConfirmed] = useState(false);
  const [gameState, setGameState] = useAtom(gameStateAtom);
  const [isLoading, setIsLoading] = useState(false);
  const [isWaitingForAI, setIsWaitingForAI] = useState(false);
  const [currentDialogue, setCurrentDialogue] = useState<DialogueState | null>(null);
  const [inputText, setInputText] = useState("");
  const [showTable, setShowTable] = useState(false);
  const [waitingForNextRound, setWaitingForNextRound] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const pendingStartStateRef = useRef<GameState | null>(null);
  const hasContinuedAfterRevealRef = useRef(false);
  const afterLastWordsRef = useRef<((state: GameState) => Promise<void>) | null>(null);
  const nightContinueRef = useRef<((state: GameState) => Promise<void>) | null>(null);
  const gameStateRef = useRef<GameState>(gameState);
  const prevPhaseRef = useRef<Phase>(gameState.phase);
  const prevDayRef = useRef<number>(gameState.day);
  const prevDevMutationIdRef = useRef<number | undefined>(gameState.devMutationId);
  const flowTokenRef = useRef(0);
  const isResolvingVotesRef = useRef(false);
  const resolveVotesRef = useRef<(state: GameState) => Promise<void>>(async () => {});
  const maybeResolveVotesRef = useRef<(state: GameState) => Promise<void>>(async () => {});
  const continueNightAfterGuardRef = useRef<(state: GameState) => Promise<void>>(async () => {});
  const continueNightAfterWolfRef = useRef<(state: GameState) => Promise<void>>(async () => {});
  const continueNightAfterWitchRef = useRef<(state: GameState) => Promise<void>>(async () => {});
  
  // AI speech queue for press-to-advance
  const speechQueueRef = useRef<{
    segments: string[];
    currentIndex: number;
    player: Player;
    afterSpeech?: (s: GameState) => Promise<void>;
  } | null>(null);

  useEffect(() => {
    // 保持 ref 同步
    gameStateRef.current = gameState;

    // ====== Dev Mode 容错：仅当开发者修改标记变化时，清理内部临时状态 ======
    // 说明：正常游戏流程中 players.alive / nightActions / phase 都会频繁变化；
    // 若用“签名对比”会误伤正常推进。
    const prevDevMutationId = prevDevMutationIdRef.current;
    const devMutationId = gameState.devMutationId;
    const devMutated =
      typeof devMutationId === "number" &&
      (typeof prevDevMutationId !== "number" || devMutationId !== prevDevMutationId);

    const phaseChanged = prevPhaseRef.current !== gameState.phase;
    const dayChanged = prevDayRef.current !== gameState.day;
    const hardReset = phaseChanged || dayChanged || !!gameState.devPhaseJump;

    if (devMutated) {
      // Dev 跳转/修改：中断所有在途的异步推进流程，避免后台继续 setGameState 覆盖用户跳转。
      flowTokenRef.current += 1;
      pendingStartStateRef.current = null;
      hasContinuedAfterRevealRef.current = false;
      isResolvingVotesRef.current = false;

      // 无论是否硬重置，只要 Dev 修改触发了 flow 取消，都应清理等待状态，避免 UI 卡在“等待 AI/下一轮”。
      if (waitingForNextRound) setWaitingForNextRound(false);
      if (isWaitingForAI) setIsWaitingForAI(false);

      // 仅当发生“换天/换阶段/显式 devPhaseJump”时，才清理会影响用户继续操作的 refs/对话。
      // 否则（例如在动作面板修改当轮的 wolfTarget）保留这些状态，避免把游戏卡死。
      if (hardReset) {
        afterLastWordsRef.current = null;
        nightContinueRef.current = null;
        speechQueueRef.current = null;
        if (currentDialogue) setCurrentDialogue(null);
        if (inputText) setInputText("");
      }

      // Dev 动作编辑：可能中断了 runNightPhase 的后台推进。若关键数据已被用户补齐，则自动继续夜晚流程。
      // 注意：只在“软编辑”时尝试恢复，避免和显式跳转冲突。
      if (!hardReset) {
        const s = gameState;
        (async () => {
          // Night phases: if the required action is already set (possibly via Dev actions tab), continue.
          if (s.phase === "NIGHT_GUARD_ACTION") {
            const guard = s.players.find((p) => p.role === "Guard" && p.alive);
            if (!guard || s.nightActions.guardTarget !== undefined) {
              await continueNightAfterGuardRef.current(s);
            }
            return;
          }

          if (s.phase === "NIGHT_WOLF_ACTION") {
            if (s.nightActions.wolfTarget !== undefined) {
              await continueNightAfterWolfRef.current(s);
            }
            return;
          }

          if (s.phase === "NIGHT_WITCH_ACTION") {
            const witch = s.players.find((p) => p.role === "Witch" && p.alive);
            const usedAll = s.roleAbilities.witchHealUsed && s.roleAbilities.witchPoisonUsed;
            const decided = s.nightActions.witchSave !== undefined || s.nightActions.witchPoison !== undefined;
            if (!witch || usedAll || decided) {
              await continueNightAfterWitchRef.current(s);
            }
            return;
          }

          if (s.phase === "DAY_VOTE") {
            await maybeResolveVotesRef.current(s);
          }
        })();
      }
    }

    // 若阶段发生了非合法跳转，通常也是 Dev 面板造成；这里仅更新 ref，具体清理由 devMutationId 控制。
    prevPhaseRef.current = gameState.phase;
    prevDayRef.current = gameState.day;
    prevDevMutationIdRef.current = devMutationId;
  }, [gameState, currentDialogue, inputText, isWaitingForAI, waitingForNextRound]);

  const humanPlayer = gameState.players.find((p) => p.isHuman) || null;
  const isNight = gameState.phase.includes("NIGHT");
  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const transitionPhase = useCallback((state: GameState, newPhase: Phase): GameState => {
    if (!isValidTransition(state.phase, newPhase)) {
      console.warn(`[wolfcha] Invalid phase transition: ${state.phase} -> ${newPhase}`);
    }
    return rawTransitionPhase(state, newPhase);
  }, []);

  const maybeGenerateDailySummary = useCallback(async (state: GameState): Promise<GameState> => {
    if (!apiKey) return state;
    if (state.day <= 0) return state;
    if (state.dailySummaries?.[state.day]?.length) return state;
    if (!state.messages || state.messages.length === 0) return state;
    try {
      const summary = await generateDailySummary(apiKey, state);
      if (!summary || summary.length === 0) return state;
      return {
        ...state,
        dailySummaries: { ...state.dailySummaries, [state.day]: summary },
      };
    } catch {
      return state;
    }
  }, [apiKey]);

  const scrollToBottom = useCallback(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, []);

  const setDialogue = useCallback((speaker: string, text: string, isStreaming = false) => {
    setCurrentDialogue({ speaker, text, isStreaming });
  }, []);

  const clearDialogue = useCallback(() => {
    setCurrentDialogue(null);
  }, []);

  const randomDelay = (minMs: number, maxMs: number) => {
    const ms = Math.floor(minMs + Math.random() * (maxMs - minMs));
    return delay(ms);
  };

  const maybeResolveVotes = useCallback(async (state: GameState) => {
    if (isResolvingVotesRef.current) return;
    if (state.phase !== "DAY_VOTE") return;

    const aliveIds = state.players.filter((p) => p.alive).map((p) => p.playerId);
    const allVoted = aliveIds.every((id) => typeof state.votes[id] === "number");
    if (!allVoted) return;

    isResolvingVotesRef.current = true;
    try {
      await resolveVotesRef.current(state);
    } finally {
      isResolvingVotesRef.current = false;
    }
  }, []);

  useEffect(() => {
    maybeResolveVotesRef.current = maybeResolveVotes;
  }, [maybeResolveVotes]);

  // 开始游戏
  const startGame = useCallback(async (fixedRoles?: Role[], devPreset?: DevPreset) => {
    if (!apiKey) {
      setDialogue("系统", "缺少 OpenRouter API Key，请在环境变量 NEXT_PUBLIC_OPENROUTER_API_KEY 中配置", false);
      toast.error("缺少 OpenRouter API Key", {
        description: "请在 .env.local 设置 NEXT_PUBLIC_OPENROUTER_API_KEY，并重启 dev server",
      });
      setApiKeyConfirmed(false);
      return;
    }
    
    setIsLoading(true);
    try {
      const characters = await generateCharacters(apiKey, 9);
      const players = setupPlayers(characters, 0, humanName || "你", fixedRoles);
      
      let newState: GameState = {
        ...createInitialGameState(),
        players,
        phase: "NIGHT_START",
        day: 1,
      };

      newState = addSystemMessage(newState, SYSTEM_MESSAGES.gameStart);
      newState = addSystemMessage(newState, SYSTEM_MESSAGES.nightFall(1));
      // 首页开发者模式：应用预设场景（仅用于测试）
      if (devPreset === "MILK_POISON_TEST") {
        const newPlayers = newState.players.map((p, i) => {
          if (i === 0) return { ...p, role: "Guard" as Role, alignment: "village" as const, alive: true };
          if (i === 1) return { ...p, role: "Witch" as Role, alignment: "village" as const, alive: true };
          if (i === 2) return { ...p, role: "Werewolf" as Role, alignment: "wolf" as const, alive: true };
          if (i === 3) return { ...p, role: "Villager" as Role, alignment: "village" as const, alive: true };
          return { ...p, alive: true };
        });
        newState = {
          ...newState,
          players: newPlayers,
          phase: "NIGHT_WITCH_ACTION",
          day: 1,
          devMutationId: (newState.devMutationId ?? 0) + 1,
          devPhaseJump: { to: "NIGHT_WITCH_ACTION", ts: Date.now() },
          nightActions: {
            ...newState.nightActions,
            guardTarget: 3,
            wolfTarget: 3,
          },
          roleAbilities: {
            ...newState.roleAbilities,
            witchHealUsed: false,
            witchPoisonUsed: false,
            hunterCanShoot: true,
          },
        };
      } else if (devPreset === "LAST_WORDS_TEST") {
        const alivePlayers = newState.players.filter((p) => p.alive);
        const votes: Record<string, number> = {};
        alivePlayers.forEach((p) => {
          votes[p.playerId] = 0;
        });
        newState = {
          ...newState,
          phase: "DAY_VOTE",
          day: 1,
          devMutationId: (newState.devMutationId ?? 0) + 1,
          devPhaseJump: { to: "DAY_VOTE", ts: Date.now() },
          votes,
        };
      }

      setGameState(newState);
      setShowTable(true);

      // 若应用了预设，则 devPhaseJump 会自动推进，无需 role reveal 的 continue
      pendingStartStateRef.current = devPreset ? null : newState;
      hasContinuedAfterRevealRef.current = false;
    } catch (error) {
      const msg = String(error);
      if (msg.includes("OpenRouter API error: 401")) {
        toast.error("OpenRouter 401 Unauthorized", {
          description:
            "常见原因：1) 改了 .env.local 但没重启 next dev；2) key 带了引号/空格/换行；3) key 已失效。",
        });
      } else {
        toast.error("请求失败", { description: msg });
      }
      setDialogue("系统", `出错了: ${error}`, false);
    } finally {
      setIsLoading(false);
    }
  }, [apiKey, humanName]);

  const startLastWordsPhase = useCallback(
    async (state: GameState, seat: number, afterLastWords: (s: GameState) => Promise<void>) => {
      const token = flowTokenRef.current;
      const speaker = state.players.find((p) => p.seat === seat);
      if (!speaker) {
        await afterLastWords(state);
        return;
      }

      afterLastWordsRef.current = afterLastWords;
      // 清理残留状态，避免遗言阶段被"下一轮"按钮干扰
      setWaitingForNextRound(false);
      speechQueueRef.current = null;

      // 确保遗言发言者在状态里已标记为死亡
      let currentState = speaker.alive ? killPlayer(state, seat) : state;
      currentState = transitionPhase(currentState, "DAY_LAST_WORDS");
      currentState = { ...currentState, currentSpeakerSeat: seat };
      currentState = addSystemMessage(currentState, `请 ${seat + 1}号 ${speaker.displayName} 发表遗言`);
      setGameState(currentState);
      gameStateRef.current = currentState;

      if (speaker.isHuman) {
        setDialogue("主持人", `请你发表遗言（${seat + 1}号 ${speaker.displayName}）`, false);
        return;
      }

      if (flowTokenRef.current !== token) return;

      await runAISpeech(currentState, speaker, {
        afterSpeech: async (s) => {
          if (flowTokenRef.current !== token) return;
          const next = afterLastWordsRef.current;
          afterLastWordsRef.current = null;
          if (next) await next(s);
        },
      });
    },
    []
  );

  // 夜晚阶段 - 新流程: 守卫 -> 狼人 -> 女巫 -> 预言家
  const runNightPhase = useCallback(async (state: GameState) => {
    const token = flowTokenRef.current;
    let currentState = state;

    if (flowTokenRef.current !== token) return;

    // === 守卫行动 ===
    currentState = transitionPhase(currentState, "NIGHT_GUARD_ACTION");
    setGameState(currentState);

    const guard = currentState.players.find((p) => p.role === "Guard" && p.alive);
    if (guard) {
      if (guard.isHuman) {
        setDialogue("系统", UI_TEXT.waitingGuard, false);
        return;
      } else {
        setIsWaitingForAI(true);
        setDialogue("系统", UI_TEXT.guardActing, false);
        const guardTarget = await generateGuardAction(apiKey!, currentState, guard);
        if (flowTokenRef.current !== token) return;
        currentState = {
          ...currentState,
          nightActions: { ...currentState.nightActions, guardTarget },
        };
        setGameState(currentState);
        setIsWaitingForAI(false);
      }
    }

    await delay(800);

    if (flowTokenRef.current !== token) return;

    const wolves = currentState.players.filter((p) => p.role === "Werewolf" && p.alive);
    const humanWolf = wolves.find((w) => w.isHuman);

    // === 狼人私聊（仅 AI 狼）===
    currentState = transitionPhase(currentState, "NIGHT_WOLF_CHAT");
    setGameState(currentState);

    if (wolves.length > 0 && !humanWolf) {
      setIsWaitingForAI(true);
      setDialogue("系统", UI_TEXT.wolfActing, false);

      const wolfChatLog: string[] = [...(currentState.nightActions.wolfChatLog || [])];
      for (const wolf of wolves) {
        const msg = await generateWolfChatMessage(apiKey!, currentState, wolf, wolfChatLog);
        if (flowTokenRef.current !== token) return;
        const line = `${wolf.seat + 1}号${wolf.displayName}: ${msg}`;
        wolfChatLog.push(line);
      }

      currentState = {
        ...currentState,
        nightActions: { ...currentState.nightActions, wolfChatLog },
      };
      setGameState(currentState);
      setIsWaitingForAI(false);

      await delay(600);
    }

    if (flowTokenRef.current !== token) return;

    // === 狼人行动（出刀）===
    currentState = transitionPhase(currentState, "NIGHT_WOLF_ACTION");
    setGameState(currentState);

    if (humanWolf) {
      setDialogue("系统", UI_TEXT.waitingWolf, false);
      return;
    } else if (wolves.length > 0) {
      setIsWaitingForAI(true);
      setDialogue("系统", UI_TEXT.wolfActing, false);

      const wolfVotes: Record<string, number> = {};
      for (const wolf of wolves) {
        const targetSeat = await generateWolfAction(apiKey!, currentState, wolf, wolfVotes);
        if (flowTokenRef.current !== token) return;
        wolfVotes[wolf.playerId] = targetSeat;
      }

      const counts: Record<number, number> = {};
      for (const seat of Object.values(wolfVotes)) {
        counts[seat] = (counts[seat] || 0) + 1;
      }
      let chosenSeat = Object.values(wolfVotes)[0];
      let max = -1;
      for (const [seatStr, c] of Object.entries(counts)) {
        const seat = Number(seatStr);
        if (c > max) {
          max = c;
          chosenSeat = seat;
        }
      }

      currentState = {
        ...currentState,
        nightActions: { ...currentState.nightActions, wolfVotes, wolfTarget: chosenSeat },
      };
      setGameState(currentState);
      setIsWaitingForAI(false);
    }

    await delay(800);

    if (flowTokenRef.current !== token) return;

    // === 女巫行动 ===
    currentState = transitionPhase(currentState, "NIGHT_WITCH_ACTION");
    setGameState(currentState);

    const witch = currentState.players.find((p) => p.role === "Witch" && p.alive);
    const canWitchAct = witch && (!currentState.roleAbilities.witchHealUsed || !currentState.roleAbilities.witchPoisonUsed);

    if (witch && canWitchAct) {
      if (witch.isHuman) {
        setDialogue("系统", UI_TEXT.waitingWitch, false);
        return;
      } else {
        setIsWaitingForAI(true);
        setDialogue("系统", UI_TEXT.witchActing, false);
        const witchAction = await generateWitchAction(apiKey!, currentState, witch, currentState.nightActions.wolfTarget);
        if (flowTokenRef.current !== token) return;
        
        if (witchAction.type === "save") {
          currentState = {
            ...currentState,
            nightActions: { ...currentState.nightActions, witchSave: true },
            roleAbilities: { ...currentState.roleAbilities, witchHealUsed: true },
          };
        } else if (witchAction.type === "poison" && witchAction.target !== undefined) {
          currentState = {
            ...currentState,
            nightActions: { ...currentState.nightActions, witchPoison: witchAction.target },
            roleAbilities: { ...currentState.roleAbilities, witchPoisonUsed: true },
          };
        }
        setGameState(currentState);
        setIsWaitingForAI(false);
      }
    }

    await delay(800);

    // === 预言家行动 ===
    currentState = transitionPhase(currentState, "NIGHT_SEER_ACTION");
    setGameState(currentState);

    const seer = currentState.players.find((p) => p.role === "Seer" && p.alive);
    if (seer) {
      if (seer.isHuman) {
        setDialogue("系统", UI_TEXT.waitingSeer, false);
        return;
      } else {
        setIsWaitingForAI(true);
        setDialogue("系统", UI_TEXT.seerChecking, false);

        const targetSeat = await generateSeerAction(apiKey!, currentState, seer);
        if (flowTokenRef.current !== token) return;
        const targetPlayer = currentState.players.find((p) => p.seat === targetSeat);
        const isWolf = targetPlayer?.role === "Werewolf";

        const seerHistory = currentState.nightActions.seerHistory || [];
        currentState = {
          ...currentState,
          nightActions: { 
            ...currentState.nightActions, 
            seerTarget: targetSeat, 
            seerResult: { targetSeat, isWolf: isWolf || false },
            seerHistory: [...seerHistory, { targetSeat, isWolf: isWolf || false, day: currentState.day }],
          },
        };
        setGameState(currentState);
        setIsWaitingForAI(false);
      }
    }

    await delay(1000);
    if (flowTokenRef.current !== token) return;
    await resolveNight(currentState);
  }, [apiKey]);

  // 结算夜晚 - 考虑守卫保护和女巫药水
  const resolveNight = useCallback(async (state: GameState) => {
    const token = flowTokenRef.current;
    let currentState = transitionPhase(state, "NIGHT_RESOLVE");
    setGameState(currentState);

    const { wolfTarget, guardTarget, witchSave, witchPoison } = currentState.nightActions;
    let wolfKillSuccessful = false;
    let wolfVictim: Player | undefined;

    const deaths: Array<{ seat: number; reason: "wolf" | "poison" | "milk" }> = [];

    const prevNightRecord = (currentState.nightHistory || {})[currentState.day] || {};
    const existingPoisonDeath = prevNightRecord.deaths?.find((d) => d.reason === "poison");
    const poisonUsedDay = (() => {
      if (!currentState.roleAbilities.witchPoisonUsed) return null;
      for (const [dayStr, record] of Object.entries(currentState.nightHistory || {})) {
        if (record.witchPoison !== undefined) return Number(dayStr);
      }
      return null;
    })();
    const poisonUsedOnOtherDay = poisonUsedDay !== null && poisonUsedDay !== currentState.day;

    let shouldAnnouncePeacefulNight = true;

    // 狼人击杀判定
    if (wolfTarget !== undefined) {
      const isProtected = guardTarget === wolfTarget;
      const isSaved = witchSave === true;

      if (isProtected && isSaved) {
        // 毒奶规则：守卫守护刀口且女巫救人，刀口仍死亡
        shouldAnnouncePeacefulNight = false;
        currentState = killPlayer(currentState, wolfTarget);
        deaths.push({ seat: wolfTarget, reason: "milk" });
        const victim = currentState.players.find((p) => p.seat === wolfTarget);
        if (victim) {
          // 毒奶死亡的猎人不能开枪
          if (victim.role === "Hunter") {
            currentState = {
              ...currentState,
              roleAbilities: { ...currentState.roleAbilities, hunterCanShoot: false },
            };
          }
          currentState = addSystemMessage(
            currentState,
            SYSTEM_MESSAGES.playerMilkKilled(victim.seat + 1, victim.displayName)
          );
          setDialogue(
            "主持人",
            SYSTEM_MESSAGES.playerMilkKilled(victim.seat + 1, victim.displayName),
            false
          );
        }
      } else if (!isProtected && !isSaved) {
        // 被杀成功
        wolfKillSuccessful = true;
        shouldAnnouncePeacefulNight = false;
        currentState = killPlayer(currentState, wolfTarget);
        deaths.push({ seat: wolfTarget, reason: "wolf" });
        wolfVictim = currentState.players.find((p) => p.seat === wolfTarget);
        
        // 被狼杀的猎人可以开枪
        if (wolfVictim) {
          currentState = addSystemMessage(currentState, SYSTEM_MESSAGES.playerKilled(wolfVictim.seat + 1, wolfVictim.displayName));
          setDialogue("主持人", SYSTEM_MESSAGES.playerKilled(wolfVictim.seat + 1, wolfVictim.displayName), false);
        }
      }
    }

    // 女巫毒杀判定
    let poisonVictim: Player | undefined;
    if (witchPoison !== undefined && !poisonUsedOnOtherDay) {
      shouldAnnouncePeacefulNight = false;

      // 同一晚结算被重复触发时，避免重复播报毒杀信息
      if (existingPoisonDeath) {
        deaths.push(existingPoisonDeath);
      } else {
        currentState = killPlayer(currentState, witchPoison);
        deaths.push({ seat: witchPoison, reason: "poison" });
        poisonVictim = currentState.players.find((p) => p.seat === witchPoison);

        if (poisonVictim) {
          // 被毒死的猎人不能开枪
          currentState = {
            ...currentState,
            roleAbilities: { ...currentState.roleAbilities, hunterCanShoot: poisonVictim.role !== "Hunter" || currentState.roleAbilities.hunterCanShoot },
          };
          if (poisonVictim.role === "Hunter") {
            currentState = {
              ...currentState,
              roleAbilities: { ...currentState.roleAbilities, hunterCanShoot: false },
            };
          }
          currentState = addSystemMessage(currentState, SYSTEM_MESSAGES.playerPoisoned(poisonVictim.seat + 1, poisonVictim.displayName));
          setDialogue("主持人", SYSTEM_MESSAGES.playerPoisoned(poisonVictim.seat + 1, poisonVictim.displayName), false);
        }
      }
    }

    if (shouldAnnouncePeacefulNight) {
      currentState = addSystemMessage(currentState, SYSTEM_MESSAGES.peacefulNight);
      setDialogue("主持人", SYSTEM_MESSAGES.peacefulNight, false);
    }

    // 更新守卫的上一晚保护记录
    currentState = {
      ...currentState,
      nightActions: {
        ...currentState.nightActions,
        lastGuardTarget: guardTarget,
      },
    };

    // 记录当晚全场动作（供 DevTools 展示）
    currentState = {
      ...currentState,
      nightHistory: {
        ...(currentState.nightHistory || {}),
        [currentState.day]: {
          ...prevNightRecord,
          guardTarget: currentState.nightActions.guardTarget,
          wolfTarget: currentState.nightActions.wolfTarget,
          witchSave: currentState.nightActions.witchSave,
          witchPoison: poisonUsedOnOtherDay ? undefined : currentState.nightActions.witchPoison,
          seerTarget: currentState.nightActions.seerTarget,
          seerResult: currentState.nightActions.seerResult,
          deaths,
        },
      },
    };

    setGameState(currentState);

    // 检查猎人开枪（被狼杀死的猎人可以开枪，被毒死的不行）
    if (wolfKillSuccessful && wolfVictim?.role === "Hunter" && currentState.roleAbilities.hunterCanShoot) {
      await handleHunterDeath(currentState, wolfVictim);
      return;
    }

    const winner = checkWinCondition(currentState);
    if (winner) {
      await endGame(currentState, winner);
      return;
    }

    await delay(1200);
    if (flowTokenRef.current !== token) return;
    currentState = transitionPhase(currentState, "DAY_START");
    currentState = addSystemMessage(currentState, SYSTEM_MESSAGES.dayBreak);
    setGameState(currentState);

    await delay(800);
    if (flowTokenRef.current !== token) return;
    await startDayPhase(currentState);
  }, []);

  // 处理猎人死亡开枪
  // diedAtNight: true = 夜晚被杀，开枪后进入白天; false = 白天被处决，开枪后进入夜晚
  const handleHunterDeath = useCallback(async (state: GameState, hunter: Player, diedAtNight: boolean = true) => {
    const token = flowTokenRef.current;
    let currentState = transitionPhase(state, "HUNTER_SHOOT");
    setGameState(currentState);

    if (hunter.isHuman) {
      setDialogue("系统", UI_TEXT.hunterShoot, false);
      // 存储是否夜间死亡的信息，供后续使用
      (currentState as GameState & { _hunterDiedAtNight?: boolean })._hunterDiedAtNight = diedAtNight;
      return;
    }

    // AI猎人开枪
    setIsWaitingForAI(true);
    const targetSeat = await generateHunterShoot(apiKey!, currentState, hunter);
    setIsWaitingForAI(false);

    if (flowTokenRef.current !== token) return;

    if (targetSeat !== null) {
      currentState = killPlayer(currentState, targetSeat);
      const target = currentState.players.find((p) => p.seat === targetSeat);
      if (target) {
        currentState = addSystemMessage(currentState, SYSTEM_MESSAGES.hunterShoot(hunter.seat + 1, targetSeat + 1, target.displayName));
        setDialogue("主持人", SYSTEM_MESSAGES.hunterShoot(hunter.seat + 1, targetSeat + 1, target.displayName), false);
      }

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

    await delay(1200);
    if (flowTokenRef.current !== token) return;
    
    if (diedAtNight) {
      // 夜晚被杀 -> 进入白天
      currentState = transitionPhase(currentState, "DAY_START");
      currentState = addSystemMessage(currentState, SYSTEM_MESSAGES.dayBreak);
      setGameState(currentState);
      await delay(800);
      if (flowTokenRef.current !== token) return;
      await startDayPhase(currentState);
    } else {
      // 白天被处决 -> 进入夜晚
      currentState = await maybeGenerateDailySummary(currentState);
      if (flowTokenRef.current !== token) return;
      let nextState = { ...currentState, day: currentState.day + 1, nightActions: {} };
      nextState = transitionPhase(nextState, "NIGHT_START");
      nextState = addSystemMessage(nextState, SYSTEM_MESSAGES.nightFall(nextState.day));
      setGameState(nextState);
      await delay(1200);
      if (flowTokenRef.current !== token) return;
      await runNightPhase(nextState);
    }
  }, [apiKey, runNightPhase, maybeGenerateDailySummary]);

  // 白天阶段
  const startDayPhase = useCallback(async (state: GameState) => {
    const token = flowTokenRef.current;
    let currentState = transitionPhase(state, "DAY_SPEECH");
    currentState = addSystemMessage(currentState, SYSTEM_MESSAGES.dayDiscussion);
    
    const alivePlayers = currentState.players.filter((p) => p.alive);
    const startSeat = alivePlayers.length > 0
      ? alivePlayers[Math.floor(Math.random() * alivePlayers.length)].seat
      : null;
    const firstSpeaker = startSeat !== null
      ? alivePlayers.find((p) => p.seat === startSeat) || null
      : null;
    currentState = { ...currentState, daySpeechStartSeat: startSeat, currentSpeakerSeat: firstSpeaker?.seat ?? null };
    
    setDialogue("主持人", "请各位玩家依次发言", false);
    setGameState(currentState);

    await delay(1500);

    if (flowTokenRef.current !== token) return;

    if (firstSpeaker && !firstSpeaker.isHuman) {
      await runAISpeech(currentState, firstSpeaker);
    } else if (firstSpeaker?.isHuman) {
      setDialogue("提示", UI_TEXT.yourTurn, false);
    }
  }, []);

  // AI 发言（分段输出，需要用户按键推进）
  const runAISpeech = useCallback(async (
    state: GameState,
    player: Player,
    options?: { afterSpeech?: (s: GameState) => Promise<void> }
  ) => {
    const token = flowTokenRef.current;
    if (state.phase.includes("NIGHT")) {
      console.warn("[wolfcha] runAISpeech called during NIGHT phase:", state.phase);
      return;
    }

    if (flowTokenRef.current !== token) return;

    setIsWaitingForAI(true);
    setCurrentDialogue({ speaker: player.displayName, text: "（正在组织语言…）", isStreaming: false });

    let segments: string[] = [];
    try {
      segments = await generateAISpeechSegments(apiKey!, state, player);
    } catch (error) {
      segments = ["（话音被打断了）"];
    }

    if (flowTokenRef.current !== token) {
      setIsWaitingForAI(false);
      return;
    }

    // 初始化队列，显示第一条
    speechQueueRef.current = {
      segments,
      currentIndex: 0,
      player,
      afterSpeech: options?.afterSpeech,
    };

    if (segments.length > 0) {
      setCurrentDialogue({ speaker: player.displayName, text: segments[0], isStreaming: true });
    }
  }, [apiKey]);

  // 推进到下一句话（用户按 Enter/Right/点击 时调用）
  const advanceSpeech = useCallback(async (): Promise<{ finished: boolean; shouldAdvanceToNextSpeaker: boolean }> => {
    if (gameStateRef.current.phase.includes("NIGHT")) {
      // 夜晚：用于"查验结果"等需要玩家确认后再继续的流程
      const cont = nightContinueRef.current;
      if (cont) {
        nightContinueRef.current = null;
        clearDialogue();
        setIsWaitingForAI(false);
        setWaitingForNextRound(false);
        await cont(gameStateRef.current);
        return { finished: true, shouldAdvanceToNextSpeaker: false };
      }

      // 夜晚没有待确认的推进逻辑时，不做任何事，避免误触把提示清空
      return { finished: false, shouldAdvanceToNextSpeaker: false };
    }

    const queue = speechQueueRef.current;
    if (!queue) {
      // 没有队列，可能是等待下一轮
      return { finished: false, shouldAdvanceToNextSpeaker: false };
    }

    const { segments, currentIndex, player, afterSpeech } = queue;
    
    // 将当前句子添加到消息列表
    const currentSegment = segments[currentIndex];
    if (currentSegment) {
      const newState = addPlayerMessage(gameStateRef.current, player.playerId, currentSegment);
      setGameState(newState);
    }

    const nextIndex = currentIndex + 1;
    
    if (nextIndex < segments.length) {
      // 还有下一句，显示它
      speechQueueRef.current = { ...queue, currentIndex: nextIndex };
      setCurrentDialogue({ speaker: player.displayName, text: segments[nextIndex], isStreaming: true });
      return { finished: false, shouldAdvanceToNextSpeaker: false };
    } else {
      // 发言结束
      speechQueueRef.current = null;
      clearDialogue();
      setIsWaitingForAI(false);

      if (afterSpeech) {
        await afterSpeech(gameStateRef.current);
        return { finished: true, shouldAdvanceToNextSpeaker: false };
      }

      // 等待用户点击"下一轮"按钮
      setWaitingForNextRound(true);
      return { finished: true, shouldAdvanceToNextSpeaker: true };
    }
  }, [clearDialogue]);

  // 下一个发言者
  const moveToNextSpeaker = useCallback(async (state: GameState) => {
    // 遗言阶段不应该推进到下一个发言者
    if (state.phase !== "DAY_SPEECH") {
      console.warn("[wolfcha] moveToNextSpeaker called outside speech phase:", state.phase);
      return;
    }

    const overrideSeat = state.nextSpeakerSeatOverride;
    const usedOverride = typeof overrideSeat === "number";

    const nextSeat =
      typeof overrideSeat === "number" && state.players.some((p) => p.seat === overrideSeat && p.alive)
        ? overrideSeat
        : getNextAliveSeat(state, state.currentSpeakerSeat ?? -1);

    const startSeat = state.daySpeechStartSeat;
    if (nextSeat === null) {
      await startVotePhase(state);
      return;
    }

    // 绕一圈回到起点则结束发言，进入投票
    if (!usedOverride && startSeat !== null && nextSeat === startSeat) {
      await startVotePhase(state);
      return;
    }

    let currentState = { ...state, currentSpeakerSeat: nextSeat, nextSpeakerSeatOverride: null };
    setGameState(currentState);

    const nextPlayer = currentState.players.find((p) => p.seat === nextSeat);
    if (nextPlayer && !nextPlayer.isHuman) {
      await runAISpeech(currentState, nextPlayer);
    } else if (nextPlayer?.isHuman) {
      setDialogue("提示", UI_TEXT.yourTurn, false);
    }
  }, []);

  // 投票阶段
  const startVotePhase = useCallback(async (state: GameState) => {
    const token = flowTokenRef.current;
    let currentState = transitionPhase(state, "DAY_VOTE");
    currentState = { ...currentState, currentSpeakerSeat: null, nextSpeakerSeatOverride: null, votes: {} };
    currentState = addSystemMessage(currentState, SYSTEM_MESSAGES.voteStart);
    setDialogue("主持人", humanPlayer?.alive ? UI_TEXT.votePrompt : UI_TEXT.aiVoting, false);
    setGameState(currentState);
    gameStateRef.current = currentState;

    if (humanPlayer?.alive) {
      setDialogue("提示", UI_TEXT.clickToVote, false);
    }

    const aiPlayers = currentState.players.filter((p) => p.alive && !p.isHuman);
    for (const aiPlayer of aiPlayers) {
      if (gameStateRef.current.phase !== "DAY_VOTE") break;
      if (flowTokenRef.current !== token) return;
      setIsWaitingForAI(true);
      const latestState = gameStateRef.current;
      const targetSeat = await generateAIVote(apiKey!, latestState, aiPlayer);

      if (flowTokenRef.current !== token) return;

      if (gameStateRef.current.phase !== "DAY_VOTE") break;

      const nextState = {
        ...gameStateRef.current,
        votes: { ...gameStateRef.current.votes, [aiPlayer.playerId]: targetSeat },
      };
      setGameState(nextState);
      gameStateRef.current = nextState;
      await maybeResolveVotes(nextState);
    }
    setIsWaitingForAI(false);

    if (!humanPlayer?.alive) {
      await maybeResolveVotes(gameStateRef.current);
    }
  }, [apiKey, humanPlayer, maybeResolveVotes]);

  // 结算投票
  const resolveVotes = useCallback(async (state: GameState) => {
    const token = flowTokenRef.current;
    let currentState = transitionPhase(state, "DAY_RESOLVE");
    
    // 记录投票历史
    const currentVotes = { ...state.votes };
    const newHistory = { ...state.voteHistory, [state.day]: currentVotes };
    currentState = { ...currentState, voteHistory: newHistory };
    
    setGameState(currentState);

    const result = tallyVotes(currentState);

    const prevDayRecord = (currentState.dayHistory || {})[currentState.day] || {};
    if (result) {
      currentState = {
        ...currentState,
        dayHistory: {
          ...(currentState.dayHistory || {}),
          [currentState.day]: { ...prevDayRecord, executed: { seat: result.seat, votes: result.count }, voteTie: false },
        },
      };
    } else {
      currentState = {
        ...currentState,
        dayHistory: {
          ...(currentState.dayHistory || {}),
          [currentState.day]: { ...prevDayRecord, executed: undefined, voteTie: true },
        },
      };
    }

    setGameState(currentState);

    if (result) {
      currentState = killPlayer(currentState, result.seat);
      const executed = currentState.players.find((p) => p.seat === result.seat);
      currentState = addSystemMessage(currentState, SYSTEM_MESSAGES.playerExecuted(result.seat + 1, executed?.displayName || "", result.count));
      setDialogue("主持人", SYSTEM_MESSAGES.playerExecuted(result.seat + 1, executed?.displayName || "", result.count), false);
    } else {
      currentState = addSystemMessage(currentState, SYSTEM_MESSAGES.voteTie);
      setDialogue("主持人", SYSTEM_MESSAGES.voteTie, false);
    }

    setGameState(currentState);

    const winner = checkWinCondition(currentState);
    if (winner) {
      await endGame(currentState, winner);
      return;
    }

    const proceedToNight = async (s: GameState) => {
      if (flowTokenRef.current !== token) return;
      // 不阻塞 UI：先切到夜晚，再后台生成每日总结
      void maybeGenerateDailySummary(s)
        .then((summarized) => {
          setGameState((prev) => {
            if (prev.gameId !== summarized.gameId) return prev;
            return { ...prev, dailySummaries: summarized.dailySummaries };
          });
        })
        .catch(() => {
          // ignore
        });

      await delay(350);

      if (flowTokenRef.current !== token) return;

      let nextState = { ...s, day: s.day + 1, nightActions: {} };
      nextState = transitionPhase(nextState, "NIGHT_START");
      nextState = addSystemMessage(nextState, SYSTEM_MESSAGES.nightFall(nextState.day));
      setGameState(nextState);

      await delay(250);

      if (flowTokenRef.current !== token) return;
      await runNightPhase(nextState);
    };

    if (result) {
      const executedPlayer = currentState.players.find((p) => p.seat === result.seat);
      
      await delay(800);
      if (flowTokenRef.current !== token) return;
      await startLastWordsPhase(currentState, result.seat, async (s) => {
        // 检查被处决的是否是猎人（可以开枪）
        if (executedPlayer?.role === "Hunter" && s.roleAbilities.hunterCanShoot) {
          await handleHunterDeath(s, executedPlayer, false); // false = 白天被处决
          return;
        }
        
        // 再次检查胜负（猎人开枪可能改变局势）
        const winnerAfterLastWords = checkWinCondition(s);
        if (winnerAfterLastWords) {
          await endGame(s, winnerAfterLastWords);
          return;
        }
        
        await proceedToNight(s);
      });
      return;
    }

    await proceedToNight(currentState);
  }, [startLastWordsPhase, runNightPhase, setGameState, setDialogue, maybeGenerateDailySummary]);

  useEffect(() => {
    resolveVotesRef.current = resolveVotes;
  }, [resolveVotes]);

  // 游戏结束
  const endGame = useCallback(async (state: GameState, winner: "village" | "wolf") => {
    let currentState = transitionPhase(state, "GAME_END");
    currentState = { ...currentState, winner };

    const getRoleName = (role: string) => {
      switch (role) {
        case "Werewolf": return "狼人";
        case "Seer": return "预言家";
        case "Witch": return "女巫";
        case "Hunter": return "猎人";
        case "Guard": return "守卫";
        default: return "村民";
      }
    };
    const roleReveal = currentState.players
      .map((p) => `${p.seat + 1}号 ${p.displayName}: ${getRoleName(p.role)}`)
      .join(" | ");

    currentState = addSystemMessage(currentState, winner === "village" ? SYSTEM_MESSAGES.villageWin : SYSTEM_MESSAGES.wolfWin);
    currentState = addSystemMessage(currentState, `身份揭晓：${roleReveal}`);
    setDialogue("主持人", winner === "village" ? "好人阵营胜利，村庄恢复了和平" : "狼人阵营胜利，村庄陷入黑暗", false);

    setGameState(currentState);
  }, []);

  // 人类发言（不自动结束，可多次发言）
  const handleHumanSpeech = useCallback(async () => {
    if (!inputText.trim() || !humanPlayer) return;

    const s = gameStateRef.current;
    const isMyTurn = (s.phase === "DAY_SPEECH" || s.phase === "DAY_LAST_WORDS") && s.currentSpeakerSeat === humanPlayer.seat;
    if (!isMyTurn) return;

    const speech = inputText.trim();
    setInputText("");

    let currentState = addPlayerMessage(gameStateRef.current, humanPlayer.playerId, speech);
    setGameState(currentState);
  }, [inputText, humanPlayer]);

  // 人类结束发言 - 自动进入下一位
  const handleFinishSpeaking = useCallback(async () => {
    if (!humanPlayer) return;

    if (gameStateRef.current.phase === "DAY_LAST_WORDS") {
      const next = afterLastWordsRef.current;
      afterLastWordsRef.current = null;
      if (next) {
        await delay(500);
        await next(gameStateRef.current);
      }
      return;
    }

    // 直接进入下一位发言
    await delay(300);
    await moveToNextSpeaker(gameStateRef.current);
  }, [humanPlayer, moveToNextSpeaker]);

  // 下一轮按钮处理
  const handleNextRound = useCallback(async () => {
    // 遗言阶段不应该触发下一轮
    if (gameStateRef.current.phase !== "DAY_SPEECH") {
      return;
    }

    setWaitingForNextRound(false);
    await delay(300);
    await moveToNextSpeaker(gameStateRef.current);
  }, [moveToNextSpeaker]);

  // 人类投票
  const handleHumanVote = useCallback(async (targetSeat: number) => {
    if (!humanPlayer) return;

    const baseState = gameStateRef.current;
    if (baseState.phase !== "DAY_VOTE") return;

    const nextState: GameState = {
      ...baseState,
      votes: { ...baseState.votes, [humanPlayer.playerId]: targetSeat },
    };
    setGameState(nextState);
    gameStateRef.current = nextState;

    await delay(200);
    await maybeResolveVotes(nextState);
  }, [humanPlayer, maybeResolveVotes]);

  // 夜晚行动 - 支持所有角色
  const handleNightAction = useCallback(async (targetSeat: number, witchAction?: "save" | "poison" | "pass") => {
    if (!humanPlayer) return;
    if (!humanPlayer.alive && gameState.phase !== "HUNTER_SHOOT") return;

    let currentState = gameState;

    // === 守卫保护 ===
    if (gameState.phase === "NIGHT_GUARD_ACTION" && humanPlayer.role === "Guard") {
      if (currentState.nightActions.lastGuardTarget === targetSeat) {
        toast.error("守卫不能连续两晚守护同一人");
        return;
      }
      const targetPlayer = currentState.players.find((p) => p.seat === targetSeat);
      currentState = {
        ...currentState,
        nightActions: { ...currentState.nightActions, guardTarget: targetSeat },
      };
      setDialogue("系统", `你保护了 ${targetSeat + 1}号 ${targetPlayer?.displayName}`, false);
      setGameState(currentState);

      await delay(1000);
      // 继续狼人行动
      await continueNightAfterGuard(currentState);
    }
    // === 狼人击杀 ===
    else if (gameState.phase === "NIGHT_WOLF_ACTION" && humanPlayer.role === "Werewolf") {
      const targetPlayer = currentState.players.find((p) => p.seat === targetSeat);
      const wolves = currentState.players.filter((p) => p.role === "Werewolf" && p.alive);
      const wolfVotes: Record<string, number> = { ...(currentState.nightActions.wolfVotes || {}) };
      wolfVotes[humanPlayer.playerId] = targetSeat;

      currentState = {
        ...currentState,
        nightActions: { ...currentState.nightActions, wolfVotes },
      };
      setDialogue("系统", `你投票选择袭击 ${targetSeat + 1}号 ${targetPlayer?.displayName}，等待队友...`, false);
      setGameState(currentState);

      // AI狼人投票
      const aiWolves = wolves.filter((w) => !w.isHuman);
      if (aiWolves.length > 0) {
        setIsWaitingForAI(true);
        for (const w of aiWolves) {
          await randomDelay(500, 1200);
          const voteSeat = await generateWolfAction(apiKey!, currentState, w, wolfVotes);
          wolfVotes[w.playerId] = voteSeat;
          currentState = {
            ...currentState,
            nightActions: { ...currentState.nightActions, wolfVotes },
          };
          setGameState(currentState);
        }
        setIsWaitingForAI(false);
      }

      // 统计票数
      const counts: Record<number, number> = {};
      for (const seat of Object.values(wolfVotes)) {
        counts[seat] = (counts[seat] || 0) + 1;
      }
      let chosenSeat = Object.values(wolfVotes)[0];
      let max = -1;
      for (const [seatStr, c] of Object.entries(counts)) {
        const seat = Number(seatStr);
        if (c > max) { max = c; chosenSeat = seat; }
      }

      currentState = {
        ...currentState,
        nightActions: { ...currentState.nightActions, wolfVotes, wolfTarget: chosenSeat },
      };
      setGameState(currentState);

      await delay(800);
      await continueNightAfterWolf(currentState);
    }
    // === 女巫用药 ===
    else if (gameState.phase === "NIGHT_WITCH_ACTION" && humanPlayer.role === "Witch") {
      if (witchAction === "save" && !currentState.roleAbilities.witchHealUsed) {
        currentState = {
          ...currentState,
          nightActions: { ...currentState.nightActions, witchSave: true },
          roleAbilities: { ...currentState.roleAbilities, witchHealUsed: true },
        };
        setDialogue("系统", "你使用了解药", false);
      } else if (witchAction === "poison" && !currentState.roleAbilities.witchPoisonUsed) {
        const targetPlayer = currentState.players.find((p) => p.seat === targetSeat);
        currentState = {
          ...currentState,
          nightActions: { ...currentState.nightActions, witchPoison: targetSeat },
          roleAbilities: { ...currentState.roleAbilities, witchPoisonUsed: true },
        };
        setDialogue("系统", `你对 ${targetSeat + 1}号 ${targetPlayer?.displayName} 使用了毒药`, false);
      } else {
        setDialogue("系统", "你选择不使用药水", false);
      }
      setGameState(currentState);

      await delay(800);
      await continueNightAfterWitch(currentState);
    }
    // === 预言家查验 ===
    else if (gameState.phase === "NIGHT_SEER_ACTION" && humanPlayer.role === "Seer") {
      const targetPlayer = currentState.players.find((p) => p.seat === targetSeat);
      const isWolf = targetPlayer?.role === "Werewolf";
      const seerHistory = currentState.nightActions.seerHistory || [];

      currentState = {
        ...currentState,
        nightActions: { 
          ...currentState.nightActions, 
          seerTarget: targetSeat, 
          seerResult: { targetSeat, isWolf: isWolf || false },
          seerHistory: [...seerHistory, { targetSeat, isWolf: isWolf || false, day: currentState.day }],
        },
      };
      setDialogue("查验结果", `${targetSeat + 1}号 ${targetPlayer?.displayName} 是${isWolf ? "狼人" : "好人"}`, false);
      setGameState(currentState);

      // 关键：查验结果需要给玩家时间确认，避免被后续主持人消息覆盖
      nightContinueRef.current = async (s) => {
        await resolveNight(s);
      };
      return;
    }
    // === 猎人开枪 ===
    else if (gameState.phase === "HUNTER_SHOOT" && humanPlayer.role === "Hunter") {
      const diedAtNight = (currentState as any)._hunterDiedAtNight ?? true;
      if (targetSeat >= 0) {
        currentState = killPlayer(currentState, targetSeat);
        const target = currentState.players.find((p) => p.seat === targetSeat);
        if (target) {
          currentState = addSystemMessage(currentState, SYSTEM_MESSAGES.hunterShoot(humanPlayer.seat + 1, targetSeat + 1, target.displayName));
          setDialogue("主持人", SYSTEM_MESSAGES.hunterShoot(humanPlayer.seat + 1, targetSeat + 1, target.displayName), false);
        }

        const shot = { hunterSeat: humanPlayer.seat, targetSeat };
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

      await delay(1200);
      if (diedAtNight) {
        currentState = transitionPhase(currentState, "DAY_START");
        currentState = addSystemMessage(currentState, SYSTEM_MESSAGES.dayBreak);
        setGameState(currentState);

        await delay(800);
        await startDayPhase(currentState);
      } else {
        currentState = await maybeGenerateDailySummary(currentState);
        let nextState = { ...currentState, day: currentState.day + 1, nightActions: {} };
        nextState = transitionPhase(nextState, "NIGHT_START");
        nextState = addSystemMessage(nextState, SYSTEM_MESSAGES.nightFall(nextState.day));
        setGameState(nextState);
        await delay(1200);
        await runNightPhase(nextState);
      }
    }
  }, [apiKey, gameState, humanPlayer, resolveNight]);

  // 守卫行动后继续夜晚流程
  const continueNightAfterGuard = useCallback(async (state: GameState) => {
    const token = flowTokenRef.current;
    let currentState = transitionPhase(state, "NIGHT_WOLF_ACTION");
    setGameState(currentState);

    const wolves = currentState.players.filter((p) => p.role === "Werewolf" && p.alive);
    const humanWolf = wolves.find((w) => w.isHuman);

    if (humanWolf) {
      setDialogue("系统", UI_TEXT.waitingWolf, false);
      return;
    }

    if (wolves.length > 0) {
      setIsWaitingForAI(true);
      setDialogue("系统", UI_TEXT.wolfActing, false);
      const wolfVotes: Record<string, number> = {};
      for (const wolf of wolves) {
        const targetSeat = await generateWolfAction(apiKey!, currentState, wolf, wolfVotes);
        if (flowTokenRef.current !== token) return;
        wolfVotes[wolf.playerId] = targetSeat;
      }
      const counts: Record<number, number> = {};
      for (const seat of Object.values(wolfVotes)) {
        counts[seat] = (counts[seat] || 0) + 1;
      }
      let chosenSeat = Object.values(wolfVotes)[0];
      let max = -1;
      for (const [seatStr, c] of Object.entries(counts)) {
        if (c > max) { max = c; chosenSeat = Number(seatStr); }
      }
      currentState = { ...currentState, nightActions: { ...currentState.nightActions, wolfVotes, wolfTarget: chosenSeat } };
      setGameState(currentState);
      setIsWaitingForAI(false);
    }

    await delay(800);
    if (flowTokenRef.current !== token) return;
    await continueNightAfterWolf(currentState);
  }, [apiKey]);

  // 狼人行动后继续夜晚流程
  const continueNightAfterWolf = useCallback(async (state: GameState) => {
    const token = flowTokenRef.current;
    let currentState = transitionPhase(state, "NIGHT_WITCH_ACTION");
    setGameState(currentState);

    const witch = currentState.players.find((p) => p.role === "Witch" && p.alive);
    const canWitchAct = witch && (!currentState.roleAbilities.witchHealUsed || !currentState.roleAbilities.witchPoisonUsed);

    if (witch && canWitchAct) {
      if (witch.isHuman) {
        const wolfTarget = currentState.nightActions.wolfTarget;
        const canSeeVictim = !currentState.roleAbilities.witchHealUsed && wolfTarget !== undefined;
        const victim = canSeeVictim ? currentState.players.find((p) => p.seat === wolfTarget) : null;
        
        let dialogueText = "";
        if (canSeeVictim && victim) {
          dialogueText = `狼人袭击了 ${wolfTarget! + 1}号 ${victim.displayName}，是否使用药水？`;
        } else if (currentState.roleAbilities.witchHealUsed) {
          dialogueText = "解药已用，无法感知刀口。是否使用毒药？";
        } else {
          dialogueText = "今晚无人被袭击，是否使用毒药？";
        }
        setDialogue("系统", dialogueText, false);
        return;
      }
      setIsWaitingForAI(true);
      setDialogue("系统", UI_TEXT.witchActing, false);
      const witchAction = await generateWitchAction(apiKey!, currentState, witch, currentState.nightActions.wolfTarget);
      if (flowTokenRef.current !== token) return;
      if (witchAction.type === "save") {
        currentState = { ...currentState, nightActions: { ...currentState.nightActions, witchSave: true }, roleAbilities: { ...currentState.roleAbilities, witchHealUsed: true } };
      } else if (witchAction.type === "poison" && witchAction.target !== undefined) {
        currentState = { ...currentState, nightActions: { ...currentState.nightActions, witchPoison: witchAction.target }, roleAbilities: { ...currentState.roleAbilities, witchPoisonUsed: true } };
      }
      setGameState(currentState);
      setIsWaitingForAI(false);
    }

    await delay(800);
    if (flowTokenRef.current !== token) return;
    await continueNightAfterWitch(currentState);
  }, [apiKey]);

  // 女巫行动后继续夜晚流程
  const continueNightAfterWitch = useCallback(async (state: GameState) => {
    const token = flowTokenRef.current;
    let currentState = transitionPhase(state, "NIGHT_SEER_ACTION");
    setGameState(currentState);

    const seer = currentState.players.find((p) => p.role === "Seer" && p.alive);
    if (seer) {
      if (seer.isHuman) {
        setDialogue("系统", UI_TEXT.waitingSeer, false);
        return;
      }
      setIsWaitingForAI(true);
      setDialogue("系统", UI_TEXT.seerChecking, false);
      const targetSeat = await generateSeerAction(apiKey!, currentState, seer);
      if (flowTokenRef.current !== token) return;
      const targetPlayer = currentState.players.find((p) => p.seat === targetSeat);
      const isWolf = targetPlayer?.role === "Werewolf";
      const seerHistory = currentState.nightActions.seerHistory || [];
      currentState = {
        ...currentState,
        nightActions: { 
          ...currentState.nightActions, 
          seerTarget: targetSeat, 
          seerResult: { targetSeat, isWolf: isWolf || false },
          seerHistory: [...seerHistory, { targetSeat, isWolf: isWolf || false, day: currentState.day }],
        },
      };
      setGameState(currentState);
      setIsWaitingForAI(false);
    }

    await delay(1000);
    if (flowTokenRef.current !== token) return;
    await resolveNight(currentState);
  }, [apiKey, resolveNight]);

  useEffect(() => {
    continueNightAfterGuardRef.current = continueNightAfterGuard;
    continueNightAfterWolfRef.current = continueNightAfterWolf;
    continueNightAfterWitchRef.current = continueNightAfterWitch;
  }, [continueNightAfterGuard, continueNightAfterWolf, continueNightAfterWitch]);

  const prevDevPhaseJumpTsRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const payload = gameState.devPhaseJump;
    if (!payload) return;
    if (prevDevPhaseJumpTsRef.current === payload.ts) return;
    prevDevPhaseJumpTsRef.current = payload.ts;

    // 每次 devPhaseJump 都中断旧流程，避免并发推进串写状态
    flowTokenRef.current += 1;

    const to = payload.to;
    const s = gameStateRef.current;

    const clearMark = () => {
      setGameState((prev) => {
        if (!prev.devPhaseJump || prev.devPhaseJump.ts !== payload.ts) return prev;
        return { ...prev, devPhaseJump: undefined };
      });
    };

    (async () => {
      try {
        if (to === "NIGHT_START" || to === "NIGHT_GUARD_ACTION" || to === "NIGHT_WOLF_CHAT") {
          await runNightPhase(s);
          return;
        }

        if (to === "NIGHT_WOLF_ACTION") {
          await continueNightAfterGuard(s);
          return;
        }

        if (to === "NIGHT_WITCH_ACTION") {
          await continueNightAfterWolf(s);
          return;
        }

        if (to === "NIGHT_SEER_ACTION") {
          await continueNightAfterWitch(s);
          return;
        }

        if (to === "NIGHT_RESOLVE") {
          await resolveNight(s);
          return;
        }

        if (to === "DAY_START" || to === "DAY_SPEECH") {
          await startDayPhase(s);
          return;
        }

        if (to === "DAY_VOTE") {
          const aliveIds = s.players.filter((p) => p.alive).map((p) => p.playerId);
          const allVoted = aliveIds.every((id) => typeof s.votes[id] === "number");
          if (allVoted) {
            await resolveVotesRef.current(s);
            return;
          }

          // dev 跳转到投票阶段：初始化 votes，避免残留状态卡住 UI/结算逻辑
          await startVotePhase({ ...s, votes: {} });
          return;
        }

        if (to === "DAY_LAST_WORDS") {
          const token = flowTokenRef.current;
          const seat = s.currentSpeakerSeat ?? s.players.find((p) => !p.alive)?.seat ?? 0;
          await startLastWordsPhase(s, seat, async (after) => {
            const summarized = await maybeGenerateDailySummary(after);
            if (flowTokenRef.current !== token) return;
            let nextState = { ...summarized, day: summarized.day + 1, nightActions: {} };
            nextState = transitionPhase(nextState, "NIGHT_START");
            nextState = addSystemMessage(nextState, SYSTEM_MESSAGES.nightFall(nextState.day));
            setGameState(nextState);
            await delay(250);
            if (flowTokenRef.current !== token) return;
            await runNightPhase(nextState);
          });
          return;
        }

        if (to === "DAY_RESOLVE") {
          const aliveIds = s.players.filter((p) => p.alive).map((p) => p.playerId);
          const allVoted = aliveIds.every((id) => typeof s.votes[id] === "number");
          if (allVoted) {
            await resolveVotesRef.current(s);
            return;
          }
          await startVotePhase(s);
        }
      } finally {
        clearMark();
      }
    })();
  }, [
    gameState.devPhaseJump,
    maybeGenerateDailySummary,
    runNightPhase,
    resolveNight,
    setGameState,
    startDayPhase,
    startLastWordsPhase,
    startVotePhase,
    transitionPhase,
    continueNightAfterGuard,
    continueNightAfterWolf,
    continueNightAfterWitch,
  ]);

  const continueAfterRoleReveal = useCallback(async () => {
    const token = flowTokenRef.current;
    const pending = pendingStartStateRef.current;
    if (!pending) return;
    if (hasContinuedAfterRevealRef.current) return;

    hasContinuedAfterRevealRef.current = true;
    pendingStartStateRef.current = null;

    if (flowTokenRef.current !== token) return;
    await runNightPhase(pending);
  }, [runNightPhase]);

  // 重新开始
  const restartGame = useCallback(() => {
    setGameState(createInitialGameState());
    setCurrentDialogue(null);
    setInputText("");
    setShowTable(false);
    setApiKeyConfirmed(false);

    pendingStartStateRef.current = null;
    hasContinuedAfterRevealRef.current = false;
  }, []);

  return {
    // State
    apiKey: apiKey || "",
    humanName: humanName || "",
    setHumanName,
    apiKeyConfirmed,
    setApiKeyConfirmed,
    gameState,
    isLoading,
    isWaitingForAI,
    waitingForNextRound,
    currentDialogue,
    inputText,
    setInputText,
    showTable,
    logRef,
    humanPlayer,
    isNight,
    
    // Actions
    startGame,
    continueAfterRoleReveal,
    restartGame,
    handleHumanSpeech,
    handleFinishSpeaking,
    handleHumanVote,
    handleNightAction,
    handleNextRound,
    scrollToBottom,
    advanceSpeech,
  };
}
