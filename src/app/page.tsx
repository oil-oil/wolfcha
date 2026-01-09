"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
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
import type { DevPreset, Player, Role } from "@/types/game";
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
import { DevConsole, DevModeButton } from "@/components/DevTools";

function getRitualCueFromSystemMessage(content: string): { title: string; subtitle?: string } | null {
  const text = content.trim();
  if (text === "人到齐了，开始吧。") return { title: "开局" };
  if (/^第\s*\d+\s*夜，天黑请闭眼$/.test(text)) return { title: text };
  if (text === "昨晚平安无事") return { title: "昨晚平安无事" };
  if (text === "天亮了，请睁眼") return { title: "天亮了，请睁眼" };
  if (text === "开始自由发言") return { title: "开始自由发言" };
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
  const [isDevConsoleOpen, setIsDevConsoleOpen] = useState(false);
  const [detailPlayer, setDetailPlayer] = useState<Player | null>(null);
  const [isRoleRevealOpen, setIsRoleRevealOpen] = useState(false);
  const [hasShownRoleReveal, setHasShownRoleReveal] = useState(false);

  const [ritualCue, setRitualCue] = useState<{ id: string; title: string; subtitle?: string } | null>(null);
  const [lastRitualMessageId, setLastRitualMessageId] = useState<string | null>(null);

  useEffect(() => {
    const lastSystem = [...gameState.messages].reverse().find((m) => m.isSystem);
    if (!lastSystem) return;
    if (lastSystem.id && lastSystem.id === lastRitualMessageId) return;
    const cue = getRitualCueFromSystemMessage(lastSystem.content);
    if (!cue) return;

    setLastRitualMessageId(lastSystem.id || null);
    setRitualCue({ id: lastSystem.id || String(Date.now()), title: cue.title, subtitle: cue.subtitle });
  }, [gameState.messages, lastRitualMessageId]);

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
    setIsRoleRevealOpen(false);
    setHasShownRoleReveal(false);
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
  }, [canClickSeat, isRoleRevealOpen]);

  const confirmSelectedSeat = useCallback(async () => {
    if (isRoleRevealOpen) return;
    if (selectedSeat === null) return;
    
    const phase = gameState.phase;
    if (phase === "DAY_VOTE") {
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
              onStart={async (fixedRoles?: Role[], devPreset?: DevPreset) => {
                if (!apiKey) {
                  await startGame(fixedRoles, devPreset);
                  return;
                }
                setApiKeyConfirmed(true);
                await startGame(fixedRoles, devPreset);
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
              {ritualCue && !isRoleRevealOpen && (
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
                    transition={{ duration: 1.15, times: [0, 0.18, 0.62, 1], ease: "easeInOut" }}
                    onAnimationComplete={() => {
                      setRitualCue((current) => {
                        if (!current) return null;
                        return current.id === ritualCue.id ? null : current;
                      });
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

            <div className="flex items-center justify-between px-8 h-14 shrink-0 transition-all duration-300 font-serif glass-panel glass-panel--weak glass-topbar rounded-none text-[var(--topbar-text)]">
              <div className="flex items-center gap-3 text-xl font-bold tracking-tight">
                <WerewolfIcon size={24} className="text-[var(--color-wolf)]" />
                <span>Wolfcha</span>
              </div>
              <div className="flex items-center gap-6 text-sm font-medium">
                <div className="flex items-center gap-1.5">
                  {isNight ? <NightIcon size={16} className="text-[var(--color-accent)]" /> : <DayIcon size={16} className="text-[var(--color-accent)]" />}
                  <span>第 {gameState.day} 天</span>
                </div>
                <div className="h-4 w-px bg-current opacity-20" />
                <div className="flex items-center gap-1.5">
                  <Users size={16} />
                  <span>{gameState.players.filter((p) => p.alive).length}/{gameState.players.length}</span>
                </div>
                <div className="h-4 w-px bg-current opacity-20" />
                <div className="text-sm font-semibold px-3 py-1 rounded flex items-center gap-2 glass-panel glass-panel--weak shadow-none">
                  <span className="opacity-90">{renderPhaseIcon()}</span>
                  <span>{getPhaseDescription()}</span>

                  {showWaitingIndicator && (
                    <span className="flex items-center gap-1 ml-1 opacity-80">
                      <motion.span
                        animate={{ scale: [1, 1.25, 1] }}
                        transition={{ repeat: Infinity, duration: 0.7, delay: 0 }}
                        className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)]"
                      />
                      <motion.span
                        animate={{ scale: [1, 1.25, 1] }}
                        transition={{ repeat: Infinity, duration: 0.7, delay: 0.15 }}
                        className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)]"
                      />
                      <motion.span
                        animate={{ scale: [1, 1.25, 1] }}
                        transition={{ repeat: Infinity, duration: 0.7, delay: 0.3 }}
                        className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)]"
                      />
                    </span>
                  )}

                  {needsHumanAction && (
                    <span className="flex items-center gap-1.5 font-semibold text-xs px-2 py-0.5 rounded-full ml-1 text-[var(--color-accent)] bg-[var(--color-accent)]/12">
                      <span className="w-1.5 h-1.5 bg-current rounded-full animate-pulse" />
                      轮到你
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
              <div className="flex-1 flex flex-col bg-transparent min-h-0 overflow-hidden">
                <AnimatePresence mode="wait" initial={false}>
                  {!showTable ? (
                    <motion.div
                      key="invite-screen"
                      initial={{ opacity: 0, y: 12, filter: "blur(10px)" }}
                      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                      exit={{ opacity: 0, y: -10, filter: "blur(10px)" }}
                      transition={{ duration: 0.45, ease: "easeOut" }}
                      className="flex flex-col items-center justify-center h-full gap-6"
                    >
                      <div className="glass-panel glass-panel--strong rounded-3xl p-1 w-full max-w-md">
                        <div className="glass-panel glass-panel--weak shadow-none rounded-[22px] p-6">
                          <div className="flex items-center justify-between">
                            <div className="text-xs font-bold tracking-wider uppercase text-[var(--text-muted)]">入场准备</div>
                            <div className="text-xs text-[var(--text-secondary)]">请稍候</div>
                          </div>

                          <div className="mt-6 flex items-center justify-center">
                            <div className="relative w-44 h-44">
                              <motion.div
                                className="absolute inset-0 rounded-full"
                                style={{
                                  background:
                                    "radial-gradient(circle at 50% 50%, rgba(184,134,11,0.22) 0%, rgba(184,134,11,0.10) 35%, rgba(0,0,0,0) 70%)",
                                }}
                                animate={{ scale: [0.98, 1.04, 0.98], opacity: [0.75, 1, 0.75] }}
                                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                              />

                              <motion.div
                                className="absolute inset-3 rounded-full"
                                style={{
                                  background:
                                    "conic-gradient(from 90deg, rgba(184,134,11,0.0), rgba(184,134,11,0.55), rgba(184,134,11,0.0))",
                                  filter: "blur(0.2px)",
                                }}
                                animate={{ rotate: 360 }}
                                transition={{ duration: 6.5, repeat: Infinity, ease: "linear" }}
                              />

                              <motion.div
                                className="absolute inset-7 rounded-full border"
                                style={{ borderColor: "rgba(44, 24, 16, 0.10)", background: "rgba(0,0,0,0.08)" }}
                                animate={{ rotate: -360 }}
                                transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                              />

                              <div className="absolute inset-0 flex items-center justify-center">
                                <div className="glass-panel glass-panel--weak shadow-none rounded-3xl w-20 h-20 flex items-center justify-center">
                                  <WerewolfIcon size={38} className="text-[var(--color-wolf)]" />
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="mt-6 text-center">
                            <div className="text-lg font-bold text-[var(--text-primary)]">正在邀请其他玩家入场…</div>
                            <div className="mt-2 text-sm text-[var(--text-secondary)]">正在准备玩家信息与身份，请稍等。</div>
                            <div className="mt-4 inline-flex items-center gap-2 text-xs text-[var(--text-muted)]">
                              <motion.span
                                className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)]"
                                animate={{ scale: [1, 1.35, 1], opacity: [0.45, 1, 0.45] }}
                                transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }}
                              />
                              <motion.span
                                className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)]"
                                animate={{ scale: [1, 1.35, 1], opacity: [0.45, 1, 0.45] }}
                                transition={{ duration: 0.9, repeat: Infinity, delay: 0.18, ease: "easeInOut" }}
                              />
                              <motion.span
                                className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)]"
                                animate={{ scale: [1, 1.35, 1], opacity: [0.45, 1, 0.45] }}
                                transition={{ duration: 0.9, repeat: Infinity, delay: 0.36, ease: "easeInOut" }}
                              />
                              <span>准备中</span>
                            </div>
                          </div>
                        </div>
                      </div>

                {!isLoading && (
                  <button
                    onClick={restartGame}
                    className="inline-flex items-center justify-center gap-2 h-10 px-5 text-sm font-medium rounded border border-[var(--border-color)] bg-white/70 hover:bg-white transition-all cursor-pointer"
                  >
                    返回入场页
                  </button>
                )}
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
                {/* 新布局：左侧玩家 | 中间对话 | 右侧玩家 */}
                <div className="flex-1 flex gap-4 px-6 py-5 overflow-hidden w-full justify-center min-h-0">
                  {/* 左侧玩家卡片 */}
                  <div className="w-[220px] flex flex-col gap-2.5 shrink-0 pr-2 min-h-0 overflow-hidden">
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
                          />
                        );
                      })}
                    </AnimatePresence>
                  </div>

                  {/* 中间区域：对话 */}
                  <div className="flex-1 flex flex-col min-w-0 min-h-0 h-full max-w-[1000px] overflow-hidden">
                    {humanPlayer && (
                      <div className="flex items-center justify-between px-4 py-2 mb-2">
                        <div className="glass-panel glass-panel--weak shadow-none px-3 py-1.5 rounded-full flex items-center gap-2 text-sm">
                          <SpeechIcon size={14} className="opacity-60" />
                          <span className="font-semibold">你是</span>
                          <span className="font-bold text-[var(--color-accent)]">
                            {humanPlayer.role === "Werewolf"
                              ? "狼人"
                              : humanPlayer.role === "Seer"
                                ? "预言家"
                                : humanPlayer.role === "Witch"
                                  ? "女巫"
                                  : humanPlayer.role === "Hunter"
                                    ? "猎人"
                                    : humanPlayer.role === "Guard"
                                      ? "守卫"
                                      : "村民"}
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="flex-1 overflow-hidden relative min-h-0">
                      <DialogArea
                        gameState={gameState}
                        humanPlayer={humanPlayer}
                        currentDialogue={currentDialogue}
                        displayedText={displayedText}
                        isTyping={isTyping}
                        onAdvanceDialogue={currentDialogue ? advanceSpeech : handleNextRound}
                        isHumanTurn={(gameState.phase === "DAY_SPEECH" || gameState.phase === "DAY_LAST_WORDS") && gameState.currentSpeakerSeat === humanPlayer?.seat && !waitingForNextRound}
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

                  {/* 右侧玩家卡片 */}
                  <div className="w-[220px] flex flex-col gap-2.5 shrink-0 pl-2 min-h-0 overflow-hidden">
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

      {/* 笔记本 Dock */}
      <div className="fixed bottom-5 right-5 z-50">
        <button
          onClick={() => setIsNotebookOpen((v) => !v)}
          className="inline-flex items-center justify-center w-12 h-12 rounded-full border cursor-pointer transition-all glass-panel glass-panel--weak"
          title={isNotebookOpen ? "关闭笔记" : "打开笔记"}
          type="button"
        >
          {isNotebookOpen ? <X size={18} /> : <NotePencil size={18} />}
        </button>
      </div>

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

      {/* 开发者模式 */}
      <DevModeButton onClick={() => setIsDevConsoleOpen(true)} />
      <DevConsole isOpen={isDevConsoleOpen} onClose={() => setIsDevConsoleOpen(false)} />

          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
