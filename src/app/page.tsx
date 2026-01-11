"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import {
  Users,
  NotePencil,
  X,
  Eye,
  Skull,
  Shield,
  Drop,
  Crosshair,
  PawPrint,
} from "@phosphor-icons/react";
import {
  WerewolfIcon,
  NightIcon,
  DayIcon,
  SpeechIcon,
  TimerIcon,
  SeerIcon,
  WitchIcon,
  HunterIcon,
  GuardIcon,
  VillagerIcon,
} from "@/components/icons/FlatIcons";
import { useTypewriter } from "@/hooks/useTypewriter";
import { useGameLogic } from "@/hooks/useGameLogic";
import type { Player } from "@/types/game";
import { PHASE_CONFIGS } from "@/store/game-machine";

// Components
import { WelcomeScreen } from "@/components/game/WelcomeScreen";
import { PlayerCardCompact } from "@/components/game/PlayerCardCompact";
import { DialogArea } from "@/components/game/DialogArea";
import { BottomActionPanel } from "@/components/game/BottomActionPanel";
import { Notebook } from "@/components/game/Notebook";
import { GameBackground } from "@/components/game/GameBackground";
import { PlayerDetailModal } from "@/components/game/PlayerDetailModal";
import { RoleRevealOverlay } from "@/components/game/RoleRevealOverlay";

const RITUAL_CUE_DURATION_SECONDS = 2.2;

function getRitualCueFromSystemMessage(content: string): { title: string; subtitle?: string } | null {
  const text = content.trim();
  if (text === "人到齐了，开始吧。") return { title: "开局" };
  if (/^第\s*\d+\s*夜，天黑请闭眼$/.test(text)) return { title: text };
  if (text === "守卫请睁眼") return { title: text };
  if (text === "狼人请睁眼") return { title: text };
  if (text === "女巫请睁眼") return { title: text };
  if (text === "预言家请睁眼") return { title: text };
  if (text === "昨晚平安无事") return { title: "昨晚平安无事" };
  if (/^\d+号\s+.+\s+昨晚出局$/.test(text)) return { title: text };
  if (/^\d+号\s+.+\s+昨晚中毒出局$/.test(text)) return { title: text };
  if (text === "天亮了，请睁眼") return { title: "天亮了，请睁眼" };
  if (text === "警徽竞选开始，请各位玩家依次发言") return { title: "警徽竞选开始", subtitle: "请各位玩家依次发言" };
  if (text === "开始警徽评选") return { title: text };
  if (text === "警徽平票，重新投票") return { title: text };
  if (/^\s*警徽授予\s*\d+号\s+.+（\d+票）\s*$/.test(text)) return { title: text };
  if (text === "开始自由发言") return { title: "开始自由发言" };
  if (text === "发言结束，开始投票。") return { title: text };
  if (/^\d+号\s+.+\s+以\s+\d+\s+票出局$/.test(text)) return { title: text };
  if (text === "票数相同，今天无人出局") return { title: text };
  return null;
}

// ============ 工具函数 ============

// ============ 主组件 ============

export default function Home() {
  const {
    apiKey,
    humanName,
    setHumanName,
    apiKeyConfirmed,
    setApiKeyConfirmed,
    gameState,
    isLoading,
    isWaitingForAI,
    currentDialogue,
    inputText,
    setInputText,
    showTable,
    humanPlayer,
    isNight,
    startGame,
    continueAfterRoleReveal,
    restartGame,
    handleHumanSpeech,
    handleFinishSpeaking,
    handleHumanVote,
    handleNightAction,
    handleNextRound,
    waitingForNextRound,
    scrollToBottom,
    advanceSpeech,
  } = useGameLogic();

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", isNight ? "dark" : "light");
  }, [isNight]);

  // UI 状态
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);
  const [isNotebookOpen, setIsNotebookOpen] = useState(false);
  const [detailPlayer, setDetailPlayer] = useState<Player | null>(null);
  const [isRoleRevealOpen, setIsRoleRevealOpen] = useState(false);
  const [hasShownRoleReveal, setHasShownRoleReveal] = useState(false);
  
  // 流式显示玩家入场
  const [revealedPlayerCount, setRevealedPlayerCount] = useState(0);

  // 当进入召唤页面时，逐个显示玩家
  useEffect(() => {
    if (!showTable && gameState.players.length > 0 && revealedPlayerCount < gameState.players.length) {
      const timer = setTimeout(() => {
        setRevealedPlayerCount(prev => prev + 1);
      }, 400 + Math.random() * 300); // 每个玩家间隔400-700ms
      return () => clearTimeout(timer);
    }
  }, [showTable, gameState.players.length, revealedPlayerCount]);

  // 重置时清空显示数量
  useEffect(() => {
    if (gameState.players.length === 0) {
      const t = window.setTimeout(() => {
        setRevealedPlayerCount(0);
      }, 0);
      return () => window.clearTimeout(t);
    }
  }, [gameState.players.length]);

  // 阶段切换时清理选择状态
  useEffect(() => {
    const t = window.setTimeout(() => {
      setSelectedSeat(null);
    }, 0);
    return () => window.clearTimeout(t);
  }, [gameState.phase]);

  const [ritualCue, setRitualCue] = useState<{ id: string; title: string; subtitle?: string } | null>(null);
  const [lastRitualMessageId, setLastRitualMessageId] = useState<string | null>(null);
  const ritualCueQueueRef = useRef<Array<{ id: string; title: string; subtitle?: string }>>([]);

  useEffect(() => {
    const lastSystem = [...gameState.messages].reverse().find((m) => m.isSystem);
    if (!lastSystem) return;
    if (lastSystem.id && lastSystem.id === lastRitualMessageId) return;
    const cue = getRitualCueFromSystemMessage(lastSystem.content);
    if (!cue) return;

    queueMicrotask(() => {
      setLastRitualMessageId(lastSystem.id || null);
      const next = { id: lastSystem.id || String(Date.now()), title: cue.title, subtitle: cue.subtitle };
      if (ritualCue) {
        ritualCueQueueRef.current.push(next);
        return;
      }
      setRitualCue(next);
    });
  }, [gameState.messages, lastRitualMessageId, ritualCue]);

  // Typewriter effect
  const { displayedText, isTyping } = useTypewriter({
    text: currentDialogue?.text || "",
    speed: 25,
    enabled: !!currentDialogue?.isStreaming,
  });

  // Enter/Right key to advance AI speech or move to next round
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isRoleRevealOpen) return;

      // Enter or Right arrow to advance
      if ((e.key === "Enter" && !e.shiftKey) || e.key === "ArrowRight") {
        // 当AI在发言时（有currentDialogue），按键推进下一句
        if (currentDialogue) {
          e.preventDefault();
          Promise.resolve(advanceSpeech()).then((r) => {
            if (r?.shouldAdvanceToNextSpeaker) {
              handleNextRound();
            }
          });
          return;
        }
        
        // 等待下一轮时，按键进入下一轮
        if (waitingForNextRound) {
          e.preventDefault();
          handleNextRound();
        }
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentDialogue, waitingForNextRound, advanceSpeech, handleNextRound, isRoleRevealOpen]);

  const handleAdvanceDialogue = useCallback(async () => {
    if (isRoleRevealOpen) return;

    if (currentDialogue) {
      const r = await advanceSpeech();
      if (r?.shouldAdvanceToNextSpeaker) {
        await handleNextRound();
      }
      return;
    }

    if (waitingForNextRound) {
      await handleNextRound();
    }
  }, [advanceSpeech, currentDialogue, handleNextRound, isRoleRevealOpen, waitingForNextRound]);

  useEffect(() => {
    if (!showTable) return;
    if (!humanPlayer) return;
    if (hasShownRoleReveal) return;
    if (gameState.phase !== "NIGHT_START") return;
    const t = window.setTimeout(() => {
      setIsRoleRevealOpen(true);
      setHasShownRoleReveal(true);
    }, 380);
    return () => window.clearTimeout(t);
  }, [showTable, humanPlayer, hasShownRoleReveal, gameState.phase]);

  // API Key 检查
  useEffect(() => {
    if (!apiKeyConfirmed) return;
    if (!apiKey) {
      toast.error("缺少 OpenRouter API Key", {
        description: "请在 .env.local 设置 NEXT_PUBLIC_OPENROUTER_API_KEY，并重启 dev server",
      });
    }
  }, [apiKeyConfirmed, apiKey]);


  useEffect(() => {
    scrollToBottom();
  }, [gameState.messages, scrollToBottom]);

  useEffect(() => {
    if (showTable) return;
    queueMicrotask(() => {
      setIsRoleRevealOpen(false);
      setHasShownRoleReveal(false);
    });
  }, [showTable]);

  // ============ 交互逻辑 ============

  // 判断是否可以点击座位（使用状态机配置）
  const canClickSeat = useCallback((player: Player): boolean => {
    if (isRoleRevealOpen) return false;
    if (!humanPlayer) return false;
    if (
      gameState.phase === "NIGHT_WITCH_ACTION" &&
      humanPlayer.role === "Witch" &&
      gameState.roleAbilities.witchPoisonUsed
    ) {
      return false;
    }
    const config = PHASE_CONFIGS[gameState.phase];
    return config.canSelectPlayer(humanPlayer, player, gameState);
  }, [humanPlayer, gameState, isRoleRevealOpen]);

  const handleSeatClick = useCallback((player: Player) => {
    if (isRoleRevealOpen) return;
    if (
      humanPlayer &&
      gameState.phase === "NIGHT_WITCH_ACTION" &&
      humanPlayer.role === "Witch" &&
      gameState.roleAbilities.witchPoisonUsed
    ) {
      toast("毒药已用过了", {
        description: "今晚只能选择救人，或直接跳过。",
      });
      return;
    }
    if (!canClickSeat(player)) return;
    setSelectedSeat(prev => prev === player.seat ? null : player.seat);
  }, [canClickSeat, isRoleRevealOpen, humanPlayer, gameState.phase, gameState.roleAbilities.witchPoisonUsed]);

  const confirmSelectedSeat = useCallback(async () => {
    if (isRoleRevealOpen) return;
    if (selectedSeat === null) return;
    
    const phase = gameState.phase;
    if (phase === "DAY_VOTE" || phase === "DAY_BADGE_ELECTION") {
      await handleHumanVote(selectedSeat);
    } else if (
      phase === "NIGHT_SEER_ACTION" ||
      phase === "NIGHT_WOLF_ACTION" ||
      phase === "NIGHT_GUARD_ACTION" ||
      phase === "HUNTER_SHOOT"
    ) {
      await handleNightAction(selectedSeat);
    }
    setSelectedSeat(null);
  }, [selectedSeat, gameState.phase, handleHumanVote, handleNightAction, isRoleRevealOpen]);

  const handleNightActionConfirm = useCallback(async (targetSeat: number, actionType?: "save" | "poison" | "pass") => {
    if (isRoleRevealOpen) return;
    await handleNightAction(targetSeat, actionType);
    setSelectedSeat(null);
  }, [handleNightAction, isRoleRevealOpen]);

  // 玩家列表（包含人类玩家）
  const allPlayers = useMemo(() => {
    return gameState.players;
  }, [gameState.players]);

  const leftPlayers = useMemo(() => allPlayers.slice(0, Math.ceil(allPlayers.length / 2)), [allPlayers]);
  const rightPlayers = useMemo(() => allPlayers.slice(Math.ceil(allPlayers.length / 2)), [allPlayers]);

  // 获取阶段描述
  const getPhaseDescription = useCallback(() => {
    const config = PHASE_CONFIGS[gameState.phase];
    if (config.humanDescription) {
      return config.humanDescription(humanPlayer, gameState);
    }
    return config.description;
  }, [gameState, humanPlayer]);

  const needsHumanAction = useMemo(() => {
    return PHASE_CONFIGS[gameState.phase].requiresHumanInput(humanPlayer, gameState);
  }, [gameState.phase, humanPlayer, gameState]);

  const showWaitingIndicator = isWaitingForAI && !needsHumanAction;

  const renderPhaseIcon = () => {
    switch (gameState.phase) {
      case "NIGHT_SEER_ACTION":
        return <Eye size={14} />;
      case "NIGHT_WOLF_ACTION":
        return <Skull size={14} />;
      case "NIGHT_GUARD_ACTION":
        return <Shield size={14} />;
      case "NIGHT_WITCH_ACTION":
        return <Drop size={14} />;
      case "HUNTER_SHOOT":
        return <Crosshair size={14} />;
      case "DAY_SPEECH":
        return <SpeechIcon size={14} />;
      case "DAY_BADGE_ELECTION":
        return <Users size={14} />;
      case "DAY_VOTE":
        return <Users size={14} />;
      default:
        return isNight ? <NightIcon size={14} /> : <DayIcon size={14} />;
    }
  };

  // ============ 渲染 ==========

  // API Key 输入界面
  const isWelcomeStage = !apiKeyConfirmed;

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-transparent">
      <GameBackground isNight={isNight} />

      <AnimatePresence mode="wait" initial={false}>
        {isWelcomeStage ? (
          <motion.div
            key="welcome-stage"
            initial={{ opacity: 0, y: 10, filter: "blur(10px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -10, filter: "blur(10px)" }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="h-full w-full"
          >
            <WelcomeScreen
              humanName={humanName}
              setHumanName={setHumanName}
              onStart={async () => {
                if (!apiKey) {
                  await startGame();
                  return;
                }
                setApiKeyConfirmed(true);
                await startGame();
              }}
              isLoading={isLoading}
            />
          </motion.div>
        ) : (
          <motion.div
            key="game-stage"
            initial={{ opacity: 0, y: 10, filter: "blur(10px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -10, filter: "blur(10px)" }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="h-full w-full flex flex-col overflow-hidden"
          >
            <AnimatePresence>
              {ritualCue && !isRoleRevealOpen && showTable && (
                <motion.div
                  key={`ritual-${ritualCue.id}`}
                  className="fixed inset-0 z-[55] pointer-events-none flex items-center justify-center"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.22 }}
                >
                  <motion.div
                    initial={{ opacity: 0, y: 12, scale: 0.995, filter: "blur(10px)" }}
                    animate={{
                      opacity: [0, 1, 1, 0],
                      y: [12, 0, 0, -10],
                      scale: [0.995, 1, 1, 0.995],
                      filter: ["blur(10px)", "blur(0px)", "blur(0px)", "blur(12px)"],
                    }}
                    transition={{ duration: RITUAL_CUE_DURATION_SECONDS, times: [0, 0.15, 0.82, 1], ease: "easeInOut" }}
                    onAnimationComplete={() => {
                      const finishedId = ritualCue.id;
                      setRitualCue(null);
                      window.setTimeout(() => {
                        const queued = ritualCueQueueRef.current;
                        const next = queued.shift();
                        if (next) {
                          setRitualCue((current) => (current ? current : next));
                          return;
                        }
                        setLastRitualMessageId((current) => (current === finishedId ? null : current));
                      }, 0);
                    }}
                    className="relative px-10 py-6 text-center"
                  >
                    <div
                      className="absolute inset-0 -z-10"
                      style={{
                        background:
                          "radial-gradient(circle at 50% 50%, rgba(184,134,11,0.18) 0%, rgba(184,134,11,0.10) 35%, rgba(0,0,0,0) 70%)",
                        filter: "blur(0.5px)",
                      }}
                    />

                    <motion.div
                      className="mx-auto h-px w-40"
                      initial={{ opacity: 0, scaleX: 0.75 }}
                      animate={{ opacity: 1, scaleX: 1 }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                      style={{ background: "linear-gradient(90deg, transparent, rgba(184,134,11,0.55), transparent)" }}
                    />

                    <div
                      className="mt-4 text-2xl md:text-3xl font-black tracking-tight font-serif text-[var(--text-primary)]"
                      style={{
                        textShadow:
                          "0 2px 14px rgba(0,0,0,0.35), 0 0 22px rgba(184,134,11,0.22)",
                      }}
                    >
                      {ritualCue.title}
                    </div>

                    {ritualCue.subtitle && (
                      <div
                        className="mt-2 text-sm text-[var(--text-secondary)]"
                        style={{ textShadow: "0 2px 10px rgba(0,0,0,0.30)" }}
                      >
                        {ritualCue.subtitle}
                      </div>
                    )}

                    <motion.div
                      className="mx-auto mt-4 h-px w-40"
                      initial={{ opacity: 0, scaleX: 0.75 }}
                      animate={{ opacity: 1, scaleX: 1 }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                      style={{ background: "linear-gradient(90deg, transparent, rgba(184,134,11,0.35), transparent)" }}
                    />
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {humanPlayer && (
              <RoleRevealOverlay
                open={isRoleRevealOpen}
                player={humanPlayer}
                phase={gameState.phase}
                onContinue={async () => {
                  setIsRoleRevealOpen(false);
                  await continueAfterRoleReveal();
                }}
              />
            )}

            {/* 顶部栏 - 参考 style-unification-preview.html */}
            <div className="wc-topbar shrink-0 transition-all duration-300">
              {/* 左侧: Logo + 标题 */}
              <div className="wc-topbar__title">
                <WerewolfIcon size={22} className="text-[var(--color-blood)]" />
                <span>WOLFCHA</span>
              </div>

              {/* 中间: 游戏信息 */}
              <div className="wc-topbar__info">
                <div className="wc-topbar__item">
                  <span className="text-xs uppercase tracking-wider opacity-60">Day</span>
                  <span className="font-serif text-lg font-bold">{String(gameState.day).padStart(2, '0')}</span>
                </div>
                <div className="wc-topbar__item">
                  <span className="text-xs uppercase tracking-wider opacity-60">Alive</span>
                  <span className="font-serif text-lg font-bold">{gameState.players.filter((p) => p.alive).length}/{gameState.players.length}</span>
                </div>
                {gameState.badge.holderSeat !== null && (
                  <div className="wc-topbar__item">
                    <span className="text-xs uppercase tracking-wider opacity-60">警徽</span>
                    <span className="font-serif text-lg font-bold text-[var(--color-gold)]">{gameState.badge.holderSeat + 1}号</span>
                  </div>
                )}
                {/* 阶段徽章 */}
                <div className="wc-phase-badge">
                  <span className="opacity-90">{renderPhaseIcon()}</span>
                  <span>{getPhaseDescription()}</span>
                  {showWaitingIndicator && (
                    <span className="flex items-center gap-1 ml-1">
                      <motion.span animate={{ scale: [1, 1.25, 1] }} transition={{ repeat: Infinity, duration: 0.7, delay: 0 }} className="w-1.5 h-1.5 rounded-full bg-current" />
                      <motion.span animate={{ scale: [1, 1.25, 1] }} transition={{ repeat: Infinity, duration: 0.7, delay: 0.15 }} className="w-1.5 h-1.5 rounded-full bg-current" />
                      <motion.span animate={{ scale: [1, 1.25, 1] }} transition={{ repeat: Infinity, duration: 0.7, delay: 0.3 }} className="w-1.5 h-1.5 rounded-full bg-current" />
                    </span>
                  )}
                  {needsHumanAction && (
                    <span className="flex items-center gap-1.5 font-semibold text-xs px-2 py-0.5 rounded-full ml-1 bg-[var(--color-gold)]/20 text-[var(--color-gold)]">
                      <span className="w-1.5 h-1.5 bg-current rounded-full animate-pulse" />
                      轮到你
                    </span>
                  )}
                </div>
              </div>

              {/* 右侧: 玩家角色 */}
              <div className="wc-topbar__item">
                <span className="text-xs uppercase tracking-wider opacity-60">Role</span>
                <span className="font-bold text-[var(--color-gold)]">{humanPlayer?.role || "?"}</span>
              </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
              <div className="flex-1 flex flex-col bg-transparent min-h-0 overflow-hidden">
                <AnimatePresence mode="wait" initial={false}>
                  {!showTable ? (
                    <motion.div
                      key="summoning-screen"
                      initial={{ opacity: 0, y: 12, filter: "blur(10px)" }}
                      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                      exit={{ opacity: 0, y: -10, filter: "blur(10px)" }}
                      transition={{ duration: 0.45, ease: "easeOut" }}
                      className="flex flex-col items-center justify-center h-full"
                    >
                      {/* 召唤等待 - 参考 waiting-preview.html */}
                      <div className="wc-contract-paper wc-contract-paper--summoning">
                        <div className="wc-contract-borders" aria-hidden="true" />
                        
                        <div className="h-full flex flex-col items-center pt-6">
                          {/* 顶部状态 */}
                          <div className="text-center z-10">
                            <div className="wc-summoning-status">Summoning Players</div>
                            <div className="text-[var(--color-wolf)] font-bold font-serif text-lg mt-2 flex items-center gap-2 justify-center">
                              <span>{revealedPlayerCount}</span> / {gameState.players.length}
                            </div>
                          </div>

                          {/* 中间魔法阵 */}
                          <div className="wc-summoning-circle">
                            <div className="wc-circle-ring wc-circle-ring--1" />
                            <div className="wc-circle-ring wc-circle-ring--2" />
                            <div className="wc-circle-ring wc-circle-ring--3" />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <PawPrint weight="fill" size={36} className="text-[var(--color-wolf)] opacity-20 animate-pulse" />
                            </div>
                          </div>

                          {/* 玩家列表 - 流式显示 */}
                          <div className="wc-player-slots">
                            {Array.from({ length: gameState.players.length }).map((_, index) => {
                              const player = gameState.players[index];
                              const isRevealed = index < revealedPlayerCount;
                              const isMe = player?.playerId === humanPlayer?.playerId;
                              
                              return (
                                <div
                                  key={index}
                                  className={`wc-player-slot ${isRevealed ? "wc-player-slot--revealed" : ""}`}
                                >
                                  {isRevealed && player ? (
                                    <>
                                      <motion.div
                                        className="wc-slot-avatar"
                                        initial={{ scale: 0, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        transition={{ type: "spring", stiffness: 300 }}
                                        style={{ backgroundColor: `hsl(${(index * 40) % 360}, 30%, 35%)` }}
                                      />
                                      <motion.span
                                        className="wc-slot-name"
                                        initial={{ opacity: 0, y: 5 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.15 }}
                                      >
                                        {isMe ? `${player.displayName} (You)` : player.displayName}
                                      </motion.span>
                                    </>
                                  ) : (
                                    <span className="text-xs opacity-30">Waiting...</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          {/* 底部提示 */}
                          <div className="mt-auto pb-6 text-center">
                            <div className="text-xs opacity-50 italic">
                              {revealedPlayerCount < gameState.players.length 
                                ? "正在召唤玩家入场..." 
                                : isLoading 
                                  ? "正在准备玩家身份，请稍等..." 
                                  : "所有玩家已就位，即将开始..."}
                            </div>
                          </div>
                        </div>

                        <div className="wc-corner-mark" aria-hidden="true">
                          <WerewolfIcon size={30} className="text-[var(--color-wolf)] opacity-30" />
                        </div>
                      </div>
              </motion.div>
            ) : (
              <motion.div
                key="table-screen"
                initial={{ opacity: 0, y: 10, filter: "blur(10px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -10, filter: "blur(10px)" }}
                transition={{ duration: 0.45, ease: "easeOut" }}
                className="flex-1 flex flex-col min-h-0 overflow-hidden"
              >
                {/* 主布局 - 严格对齐 style-unification-preview.html */}
                <div className="flex-1 flex gap-5 px-5 py-5 overflow-hidden w-full justify-center min-h-0">
                  {/* 左侧玩家卡片 - 240px宽度 */}
                  <div className="w-[240px] flex flex-col gap-3 shrink-0 min-h-0 overflow-y-auto overflow-x-visible scrollbar-hide py-1 px-1 -mx-1">
                    <AnimatePresence>
                      {leftPlayers.map((player, index) => {
                        const checkResult =
                          humanPlayer?.role === "Seer"
                            ? gameState.nightActions.seerHistory?.find((h) => h.targetSeat === player.seat)
                            : undefined;
                        const seerResult = checkResult ? (checkResult.isWolf ? "wolf" : "good") : null;

                        return (
                          <PlayerCardCompact
                            key={player.playerId}
                            player={player}
                            isSpeaking={gameState.currentSpeakerSeat === player.seat}
                            canClick={canClickSeat(player)}
                            isSelected={selectedSeat === player.seat}
                            onClick={() => handleSeatClick(player)}
                            onDetailClick={() => setDetailPlayer(player)}
                            animationDelay={index * 0.05}
                            isNight={isNight}
                            humanPlayer={humanPlayer}
                            seerCheckResult={seerResult}
                            isBadgeHolder={gameState.badge.holderSeat === player.seat}
                          />
                        );
                      })}
                    </AnimatePresence>
                  </div>

                  {/* 中间区域：对话 */}
                  <div className="flex-1 flex flex-col min-w-0 min-h-0 h-full max-w-[1000px] overflow-hidden">
                    <div className="flex-1 overflow-hidden relative min-h-0">
                      <DialogArea
                        gameState={gameState}
                        humanPlayer={humanPlayer}
                        currentDialogue={currentDialogue}
                        displayedText={displayedText}
                        isTyping={isTyping}
                        onAdvanceDialogue={currentDialogue ? advanceSpeech : handleNextRound}
                        isHumanTurn={(gameState.phase === "DAY_SPEECH" || gameState.phase === "DAY_LAST_WORDS" || gameState.phase === "DAY_BADGE_SPEECH") && gameState.currentSpeakerSeat === humanPlayer?.seat && !waitingForNextRound}
                        waitingForNextRound={waitingForNextRound}
                        inputText={inputText}
                        onInputChange={setInputText}
                        onSendMessage={handleHumanSpeech}
                        onFinishSpeaking={handleFinishSpeaking}
                        selectedSeat={selectedSeat}
                        isWaitingForAI={isWaitingForAI}
                        onConfirmAction={confirmSelectedSeat}
                        onCancelSelection={() => setSelectedSeat(null)}
                        onNightAction={handleNightActionConfirm}
                        onRestart={restartGame}
                      />
                    </div>
                  </div>

                  {/* 右侧玩家卡片 - 240px宽度 */}
                  <div className="w-[240px] flex flex-col gap-3 shrink-0 min-h-0 overflow-y-auto overflow-x-visible scrollbar-hide py-1 px-1 -mx-1">
                    <AnimatePresence>
                      {rightPlayers.map((player, index) => {
                        const checkResult =
                          humanPlayer?.role === "Seer"
                            ? gameState.nightActions.seerHistory?.find((h) => h.targetSeat === player.seat)
                            : undefined;
                        const seerResult = checkResult ? (checkResult.isWolf ? "wolf" : "good") : null;

                        return (
                          <PlayerCardCompact
                            key={player.playerId}
                            player={player}
                            isSpeaking={gameState.currentSpeakerSeat === player.seat}
                            canClick={canClickSeat(player)}
                            isSelected={selectedSeat === player.seat}
                            onClick={() => handleSeatClick(player)}
                            onDetailClick={() => setDetailPlayer(player)}
                            animationDelay={index * 0.05}
                            humanPlayer={humanPlayer}
                            seerCheckResult={seerResult}
                            isBadgeHolder={gameState.badge.holderSeat === player.seat}
                          />
                        );
                      })}
                    </AnimatePresence>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* 笔记本悬浮按钮 - 参考 style-unification-preview.html */}
      <button
        onClick={() => setIsNotebookOpen((v) => !v)}
        className="wc-notebook-fab"
        title={isNotebookOpen ? "关闭笔记" : "打开笔记"}
        type="button"
      >
        {isNotebookOpen ? <X size={24} /> : <NotePencil size={24} />}
      </button>

      <AnimatePresence>
        {isNotebookOpen && (
          <motion.div
            key="notebook-panel"
            initial={{ opacity: 0, x: 24, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 24, y: 12, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="fixed bottom-20 right-5 z-50 w-[360px] h-[480px] max-h-[70vh]"
          >
            <div className="h-full rounded-lg overflow-hidden border shadow-2xl glass-panel glass-panel--strong">
              <Notebook />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 玩家详情弹窗 */}
      <PlayerDetailModal
        player={detailPlayer}
        isOpen={detailPlayer !== null}
        onClose={() => setDetailPlayer(null)}
        humanPlayer={humanPlayer}
      />

          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
