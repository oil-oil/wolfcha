"use client";

import { useState, useCallback, useRef } from "react";
import { useLocalStorageState } from "ahooks";
import { toast } from "sonner";
import {
  createInitialGameState,
  setupPlayers,
  addSystemMessage,
  addPlayerMessage,
  transitionPhase,
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
import type { GameState, Player } from "@/types/game";
import { SYSTEM_MESSAGES, UI_TEXT } from "@/lib/prompts";

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
  const [gameState, setGameState] = useState<GameState>(createInitialGameState());
  const [isLoading, setIsLoading] = useState(false);
  const [isWaitingForAI, setIsWaitingForAI] = useState(false);
  const [currentDialogue, setCurrentDialogue] = useState<DialogueState | null>(null);
  const [inputText, setInputText] = useState("");
  const [showTable, setShowTable] = useState(false);
  const [waitingForNextRound, setWaitingForNextRound] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const afterLastWordsRef = useRef<((state: GameState) => Promise<void>) | null>(null);

  const humanPlayer = gameState.players.find((p) => p.isHuman) || null;
  const isNight = gameState.phase.includes("NIGHT");
  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

  // 开始游戏
  const startGame = useCallback(async () => {
    if (!apiKey) {
      setDialogue("系统", "缺少 OpenRouter API Key，请在环境变量 NEXT_PUBLIC_OPENROUTER_API_KEY 中配置", false);
      toast.error("缺少 OpenRouter API Key", {
        description: "请在 .env.local 设置 NEXT_PUBLIC_OPENROUTER_API_KEY，并重启 dev server",
      });
      return;
    }
    
    setIsLoading(true);
    try {
      const characters = await generateCharacters(apiKey, 9);
      const players = setupPlayers(characters, 0, humanName || "你");
      
      let newState: GameState = {
        ...createInitialGameState(),
        players,
        phase: "NIGHT_START",
        day: 1,
      };

      newState = addSystemMessage(newState, SYSTEM_MESSAGES.gameStart);
      newState = addSystemMessage(newState, SYSTEM_MESSAGES.nightFall(1));
      setGameState(newState);
      setShowTable(true);

      await delay(1500);
      await runNightPhase(newState);
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
      const speaker = state.players.find((p) => p.seat === seat);
      if (!speaker) {
        await afterLastWords(state);
        return;
      }

      afterLastWordsRef.current = afterLastWords;
      let currentState = transitionPhase(state, "DAY_LAST_WORDS");
      currentState = { ...currentState, currentSpeakerSeat: seat };
      currentState = addSystemMessage(currentState, `请 ${seat + 1}号 ${speaker.displayName} 发表遗言`);
      setGameState(currentState);

      if (speaker.isHuman) {
        setDialogue("主持人", `请你发表遗言（${seat + 1}号 ${speaker.displayName}）`, false);
        return;
      }

      await runAISpeech(currentState, speaker, {
        afterSpeech: async (s) => {
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
    let currentState = state;

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
        currentState = {
          ...currentState,
          nightActions: { ...currentState.nightActions, guardTarget },
        };
        setGameState(currentState);
        setIsWaitingForAI(false);
      }
    }

    await delay(800);

    const wolves = currentState.players.filter((p) => p.role === "Werewolf" && p.alive);
    const humanWolf = wolves.find((w) => w.isHuman);

    // === 狼人私聊（仅 AI 狼）===
    currentState = transitionPhase(currentState, "NIGHT_WOLF_CHAT");
    setGameState(currentState);

    if (wolves.length > 0 && !humanWolf) {
      setIsWaitingForAI(true);
      setDialogue("系统", "狼人正在私聊...", false);

      const wolfChatLog: string[] = [...(currentState.nightActions.wolfChatLog || [])];
      for (const wolf of wolves) {
        const msg = await generateWolfChatMessage(apiKey!, currentState, wolf, wolfChatLog);
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

    // === 狼人行动（出刀）===
    currentState = transitionPhase(currentState, "NIGHT_WOLF_ACTION");
    setGameState(currentState);

    if (humanWolf) {
      setDialogue("系统", UI_TEXT.waitingWolf, false);
      return;
    } else if (wolves.length > 0) {
      setIsWaitingForAI(true);
      setDialogue("系统", "狼人正在商量今晚的目标...", false);

      const wolfVotes: Record<string, number> = {};
      for (const wolf of wolves) {
        const targetSeat = await generateWolfAction(apiKey!, currentState, wolf, wolfVotes);
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
    await resolveNight(currentState);
  }, [apiKey]);

  // 结算夜晚 - 考虑守卫保护和女巫药水
  const resolveNight = useCallback(async (state: GameState) => {
    let currentState = transitionPhase(state, "NIGHT_RESOLVE");
    setGameState(currentState);

    const { wolfTarget, guardTarget, witchSave, witchPoison } = currentState.nightActions;
    let wolfKillSuccessful = false;
    let wolfVictim: Player | undefined;

    let shouldAnnouncePeacefulNight = true;

    // 狼人击杀判定
    if (wolfTarget !== undefined) {
      const isProtected = guardTarget === wolfTarget;
      const isSaved = witchSave === true;

      if (!isProtected && !isSaved) {
        // 被杀成功
        wolfKillSuccessful = true;
        shouldAnnouncePeacefulNight = false;
        currentState = killPlayer(currentState, wolfTarget);
        wolfVictim = currentState.players.find((p) => p.seat === wolfTarget);
        
        // 被狼杀的猎人不能开枪（正常死亡可以）
        // 但如果是被毒死的猎人则不能开枪
        if (wolfVictim) {
          currentState = addSystemMessage(currentState, SYSTEM_MESSAGES.playerKilled(wolfVictim.seat + 1, wolfVictim.displayName));
          setDialogue("主持人", SYSTEM_MESSAGES.playerKilled(wolfVictim.seat + 1, wolfVictim.displayName), false);
        }
      }
    }

    // 女巫毒杀判定
    let poisonVictim: Player | undefined;
    if (witchPoison !== undefined) {
      shouldAnnouncePeacefulNight = false;
      currentState = killPlayer(currentState, witchPoison);
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
    currentState = transitionPhase(currentState, "DAY_START");
    currentState = addSystemMessage(currentState, SYSTEM_MESSAGES.dayBreak);
    setGameState(currentState);

    await delay(800);
    await startDayPhase(currentState);
  }, []);

  // 处理猎人死亡开枪
  // diedAtNight: true = 夜晚被杀，开枪后进入白天; false = 白天被处决，开枪后进入夜晚
  const handleHunterDeath = useCallback(async (state: GameState, hunter: Player, diedAtNight: boolean = true) => {
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

    if (targetSeat !== null) {
      currentState = killPlayer(currentState, targetSeat);
      const target = currentState.players.find((p) => p.seat === targetSeat);
      if (target) {
        currentState = addSystemMessage(currentState, SYSTEM_MESSAGES.hunterShoot(hunter.seat + 1, targetSeat + 1, target.displayName));
        setDialogue("主持人", SYSTEM_MESSAGES.hunterShoot(hunter.seat + 1, targetSeat + 1, target.displayName), false);
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
      // 夜晚被杀 -> 进入白天
      currentState = transitionPhase(currentState, "DAY_START");
      currentState = addSystemMessage(currentState, SYSTEM_MESSAGES.dayBreak);
      setGameState(currentState);
      await delay(800);
      await startDayPhase(currentState);
    } else {
      // 白天被处决 -> 进入夜晚
      currentState = await maybeGenerateDailySummary(currentState);
      let nextState = { ...currentState, day: currentState.day + 1, nightActions: {} };
      nextState = transitionPhase(nextState, "NIGHT_START");
      nextState = addSystemMessage(nextState, SYSTEM_MESSAGES.nightFall(nextState.day));
      setGameState(nextState);
      await delay(1200);
      await runNightPhase(nextState);
    }
  }, [apiKey, runNightPhase, maybeGenerateDailySummary]);

  // 白天阶段
  const startDayPhase = useCallback(async (state: GameState) => {
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

    if (firstSpeaker && !firstSpeaker.isHuman) {
      await runAISpeech(currentState, firstSpeaker);
    } else if (firstSpeaker?.isHuman) {
      setDialogue("提示", UI_TEXT.yourTurn, false);
    }
  }, []);

  // AI 发言（分段输出）
  const runAISpeech = useCallback(async (
    state: GameState,
    player: Player,
    options?: { afterSpeech?: (s: GameState) => Promise<void> }
  ) => {
    setIsWaitingForAI(true);
    setCurrentDialogue({ speaker: player.displayName, text: "（正在组织语言…）", isStreaming: false });

    let segments: string[] = [];
    try {
      segments = await generateAISpeechSegments(apiKey!, state, player);
    } catch (error) {
      segments = ["（发言出错）"];
    }

    // 逐条显示并添加到消息列表
    let currentState = state;
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      
      // 显示当前正在说的话
      setCurrentDialogue({ speaker: player.displayName, text: segment, isStreaming: true });
      
      // 模拟打字时间
      await delay(Math.min(segment.length * 50, 1500));
      
      // 添加到消息列表
      currentState = addPlayerMessage(currentState, player.playerId, segment);
      setGameState(currentState);
      
      // 段落之间的停顿
      if (i < segments.length - 1) {
        setCurrentDialogue({ speaker: player.displayName, text: "...", isStreaming: true });
        await randomDelay(800, 1500);
      }
    }

    clearDialogue();
    setIsWaitingForAI(false);

    if (options?.afterSpeech) {
      await options.afterSpeech(currentState);
      return;
    }

    // 等待用户点击"下一轮"按钮
    setWaitingForNextRound(true);
  }, [apiKey, clearDialogue]);

  // 下一个发言者
  const moveToNextSpeaker = useCallback(async (state: GameState) => {
    const nextSeat = getNextAliveSeat(state, state.currentSpeakerSeat ?? -1);

    const startSeat = state.daySpeechStartSeat;
    if (nextSeat === null) {
      await startVotePhase(state);
      return;
    }

    // 绕一圈回到起点则结束发言，进入投票
    if (startSeat !== null && nextSeat === startSeat) {
      await startVotePhase(state);
      return;
    }

    let currentState = { ...state, currentSpeakerSeat: nextSeat };
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
    let currentState = transitionPhase(state, "DAY_VOTE");
    currentState = { ...currentState, currentSpeakerSeat: null, votes: {} };
    currentState = addSystemMessage(currentState, SYSTEM_MESSAGES.voteStart);
    setDialogue("主持人", UI_TEXT.votePrompt, false);
    setGameState(currentState);

    const aiPlayers = currentState.players.filter((p) => p.alive && !p.isHuman);
    for (const aiPlayer of aiPlayers) {
      setIsWaitingForAI(true);
      const targetSeat = await generateAIVote(apiKey!, currentState, aiPlayer);
      currentState = { ...currentState, votes: { ...currentState.votes, [aiPlayer.playerId]: targetSeat } };
      setGameState(currentState);
    }
    setIsWaitingForAI(false);

    if (humanPlayer?.alive) {
      setDialogue("提示", UI_TEXT.clickToVote, false);
    } else {
      await resolveVotes(currentState);
    }
  }, [apiKey, humanPlayer]);

  // 结算投票
  const resolveVotes = useCallback(async (state: GameState) => {
    let currentState = transitionPhase(state, "DAY_RESOLVE");
    
    // 记录投票历史
    const currentVotes = { ...state.votes };
    const newHistory = { ...state.voteHistory, [state.day]: currentVotes };
    currentState = { ...currentState, voteHistory: newHistory };
    
    setGameState(currentState);

    const result = tallyVotes(currentState);

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
      await delay(1600);

      const summarizedState = await maybeGenerateDailySummary(s);
      let nextState = { ...summarizedState, day: summarizedState.day + 1, nightActions: {} };
      nextState = transitionPhase(nextState, "NIGHT_START");
      nextState = addSystemMessage(nextState, SYSTEM_MESSAGES.nightFall(nextState.day));
      setGameState(nextState);

      await delay(1200);
      await runNightPhase(nextState);
    };

    if (result) {
      const executedPlayer = currentState.players.find((p) => p.seat === result.seat);
      
      await delay(800);
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

    const speech = inputText.trim();
    setInputText("");

    let currentState = addPlayerMessage(gameState, humanPlayer.playerId, speech);
    setGameState(currentState);
  }, [inputText, humanPlayer, gameState]);

  // 人类结束发言 - 自动进入下一位
  const handleFinishSpeaking = useCallback(async () => {
    if (!humanPlayer) return;

    if (gameState.phase === "DAY_LAST_WORDS") {
      const next = afterLastWordsRef.current;
      afterLastWordsRef.current = null;
      if (next) {
        await delay(500);
        await next(gameState);
      }
      return;
    }

    // 直接进入下一位发言
    await delay(300);
    await moveToNextSpeaker(gameState);
  }, [humanPlayer, gameState, moveToNextSpeaker]);

  // 下一轮按钮处理
  const handleNextRound = useCallback(async () => {
    setWaitingForNextRound(false);
    await delay(300);
    await moveToNextSpeaker(gameState);
  }, [gameState, moveToNextSpeaker]);

  // 人类投票
  const handleHumanVote = useCallback(async (targetSeat: number) => {
    if (!humanPlayer) return;

    let currentState = {
      ...gameState,
      votes: { ...gameState.votes, [humanPlayer.playerId]: targetSeat },
    };
    setGameState(currentState);

    await delay(500);
    await resolveVotes(currentState);
  }, [humanPlayer, gameState, resolveVotes]);

  // 夜晚行动 - 支持所有角色
  const handleNightAction = useCallback(async (targetSeat: number, witchAction?: "save" | "poison" | "pass") => {
    if (!humanPlayer) return;
    if (!humanPlayer.alive && gameState.phase !== "HUNTER_SHOOT") return;

    let currentState = gameState;

    // === 守卫保护 ===
    if (gameState.phase === "NIGHT_GUARD_ACTION" && humanPlayer.role === "Guard") {
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

      await delay(1500);
      await resolveNight(currentState);
    }
    // === 猎人开枪 ===
    else if (gameState.phase === "HUNTER_SHOOT" && humanPlayer.role === "Hunter") {
      if (targetSeat >= 0) {
        currentState = killPlayer(currentState, targetSeat);
        const target = currentState.players.find((p) => p.seat === targetSeat);
        if (target) {
          currentState = addSystemMessage(currentState, SYSTEM_MESSAGES.hunterShoot(humanPlayer.seat + 1, targetSeat + 1, target.displayName));
          setDialogue("主持人", SYSTEM_MESSAGES.hunterShoot(humanPlayer.seat + 1, targetSeat + 1, target.displayName), false);
        }
        setGameState(currentState);
      }

      const winner = checkWinCondition(currentState);
      if (winner) {
        await endGame(currentState, winner);
        return;
      }

      await delay(1200);
      currentState = transitionPhase(currentState, "DAY_START");
      currentState = addSystemMessage(currentState, SYSTEM_MESSAGES.dayBreak);
      setGameState(currentState);

      await delay(800);
      await startDayPhase(currentState);
    }
  }, [apiKey, gameState, humanPlayer, resolveNight]);

  // 守卫行动后继续夜晚流程
  const continueNightAfterGuard = useCallback(async (state: GameState) => {
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
    await continueNightAfterWolf(currentState);
  }, [apiKey]);

  // 狼人行动后继续夜晚流程
  const continueNightAfterWolf = useCallback(async (state: GameState) => {
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
      if (witchAction.type === "save") {
        currentState = { ...currentState, nightActions: { ...currentState.nightActions, witchSave: true }, roleAbilities: { ...currentState.roleAbilities, witchHealUsed: true } };
      } else if (witchAction.type === "poison" && witchAction.target !== undefined) {
        currentState = { ...currentState, nightActions: { ...currentState.nightActions, witchPoison: witchAction.target }, roleAbilities: { ...currentState.roleAbilities, witchPoisonUsed: true } };
      }
      setGameState(currentState);
      setIsWaitingForAI(false);
    }

    await delay(800);
    await continueNightAfterWitch(currentState);
  }, [apiKey]);

  // 女巫行动后继续夜晚流程
  const continueNightAfterWitch = useCallback(async (state: GameState) => {
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
    await resolveNight(currentState);
  }, [apiKey, resolveNight]);

  // 重新开始
  const restartGame = useCallback(() => {
    setGameState(createInitialGameState());
    setCurrentDialogue(null);
    setInputText("");
    setShowTable(false);
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
    restartGame,
    handleHumanSpeech,
    handleFinishSpeaking,
    handleHumanVote,
    handleNightAction,
    handleNextRound,
    scrollToBottom,
  };
}
