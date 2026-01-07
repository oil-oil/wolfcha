"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import {
  Play,
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

// ============ 工具函数 ============

const dicebearUrl = (seed: string) =>
  `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(seed)}&backgroundColor=f1f5f9`;

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

  // UI 状态
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);
  const [isNotebookOpen, setIsNotebookOpen] = useState(false);
  const [detailPlayer, setDetailPlayer] = useState<Player | null>(null);

  // Typewriter effect
  const { displayedText, isTyping } = useTypewriter({
    text: currentDialogue?.text || "",
    speed: 25,
    enabled: !!currentDialogue?.isStreaming,
  });

  // Enter/Right key to advance AI speech or move to next round
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Enter or Right arrow to advance
      if ((e.key === "Enter" && !e.shiftKey) || e.key === "ArrowRight") {
        // 当AI在发言时（有currentDialogue），按键推进下一句
        if (currentDialogue) {
          e.preventDefault();
          advanceSpeech();
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
  }, [currentDialogue, waitingForNextRound, advanceSpeech, handleNextRound]);

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

  // ============ 交互逻辑 ============

  // 判断是否可以点击座位（使用状态机配置）
  const canClickSeat = useCallback((player: Player): boolean => {
    if (!humanPlayer) return false;
    const config = PHASE_CONFIGS[gameState.phase];
    return config.canSelectPlayer(humanPlayer, player, gameState);
  }, [humanPlayer, gameState]);

  const handleSeatClick = useCallback((player: Player) => {
    if (!canClickSeat(player)) return;
    setSelectedSeat(prev => prev === player.seat ? null : player.seat);
  }, [canClickSeat]);

  const confirmSelectedSeat = useCallback(async () => {
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
  }, [selectedSeat, gameState.phase, handleHumanVote, handleNightAction]);

  const handleNightActionConfirm = useCallback(async (targetSeat: number, actionType?: "save" | "poison" | "pass") => {
    await handleNightAction(targetSeat, actionType);
    setSelectedSeat(null);
  }, [handleNightAction]);

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

  // ============ 渲染 ============

  // API Key 输入界面
  if (!apiKeyConfirmed) {
    return (
      <WelcomeScreen 
        humanName={humanName}
        setHumanName={setHumanName}
        onStart={async () => {
          setApiKeyConfirmed(true);
          await startGame();
        }}
        isLoading={isLoading}
      />
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[var(--bg-main)]">
      {/* 顶部状态栏 */}
      <div className={`flex items-center justify-between px-8 h-14 shrink-0 border-b transition-all duration-300 font-serif ${isNight ? "bg-[#1a1512] text-[#f0e6d2] border-[#3e2723]" : "bg-white text-[var(--text-primary)] border-[var(--border-color)]"}`}>
        <div className="flex items-center gap-3 text-xl font-bold tracking-tight">
          <WerewolfIcon size={24} className={isNight ? "text-indigo-300" : "text-[var(--color-wolf)]"} />
          <span>Wolfcha</span>
        </div>
        <div className="flex items-center gap-6 text-sm font-medium">
          <div className="flex items-center gap-1.5">
            {isNight ? (
              <NightIcon size={16} className="text-indigo-300" />
            ) : (
              <DayIcon size={16} className="text-amber-500" />
            )}
            <span>第 {gameState.day} 天</span>
          </div>
          <div className="h-4 w-px bg-current opacity-20" />
          <div className="flex items-center gap-1.5">
            <Users size={16} />
            <span>{gameState.players.filter((p) => p.alive).length}/{gameState.players.length}</span>
          </div>
          <div className="h-4 w-px bg-current opacity-20" />
          <div className={`text-sm font-semibold px-3 py-1 rounded flex items-center gap-2 ${isNight ? "bg-white/15 text-white border border-white/10" : "bg-[var(--bg-hover)]"}`}>
            <span className="opacity-90">{renderPhaseIcon()}</span>
            <span>{getPhaseDescription()}</span>

            {showWaitingIndicator && (
              <span className="flex items-center gap-1 ml-1 opacity-80">
                <motion.span
                  animate={{ scale: [1, 1.25, 1] }}
                  transition={{ repeat: Infinity, duration: 0.7, delay: 0 }}
                  className={`w-1.5 h-1.5 rounded-full ${isNight ? "bg-indigo-300" : "bg-[var(--color-accent)]"}`}
                />
                <motion.span
                  animate={{ scale: [1, 1.25, 1] }}
                  transition={{ repeat: Infinity, duration: 0.7, delay: 0.15 }}
                  className={`w-1.5 h-1.5 rounded-full ${isNight ? "bg-indigo-300" : "bg-[var(--color-accent)]"}`}
                />
                <motion.span
                  animate={{ scale: [1, 1.25, 1] }}
                  transition={{ repeat: Infinity, duration: 0.7, delay: 0.3 }}
                  className={`w-1.5 h-1.5 rounded-full ${isNight ? "bg-indigo-300" : "bg-[var(--color-accent)]"}`}
                />
              </span>
            )}

            {needsHumanAction && (
              <span className={`flex items-center gap-1.5 font-semibold text-xs px-2 py-0.5 rounded-full ml-1 ${isNight ? "text-yellow-400 bg-yellow-400/15" : "text-[var(--color-accent)] bg-[var(--color-accent)]/10"}`}>
                <span className="w-1.5 h-1.5 bg-current rounded-full animate-pulse" />
                等待你
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 主内容区域 */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col bg-[var(--bg-main)]">
          {!showTable ? (
            /* 开始游戏界面 */
            <div className="flex flex-col items-center justify-center h-full gap-6">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-20 h-20 rounded-3xl bg-[var(--color-wolf-bg)] flex items-center justify-center"
              >
                <WerewolfIcon size={40} className="text-[var(--color-wolf)]" />
              </motion.div>
              <h2 className="text-2xl font-semibold">准备开始游戏</h2>
              <p className="text-sm text-[var(--text-secondary)] max-w-xs text-center">10人局 · 3狼人 · 预言家 · 女巫 · 猎人 · 守卫 · 3村民</p>
              <button
                onClick={startGame}
                disabled={isLoading}
                className="inline-flex items-center justify-center gap-2 h-12 px-7 text-base font-medium rounded bg-[var(--color-accent)] text-white hover:bg-[#a07608] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isLoading ? (
                  <>
                    <TimerIcon size={20} className="animate-spin" />
                    生成角色中...
                  </>
                ) : (
                  <>
                    <Play size={20} weight="fill" />
                    开始游戏
                  </>
                )}
              </button>
            </div>
          ) : (
            <>
              {/* 新布局：左侧玩家 | 中间对话 | 右侧玩家 */}
              <div className="flex-1 flex gap-4 px-6 py-5 overflow-hidden w-full justify-center">
                {/* 左侧玩家卡片 */}
                <div className="w-[220px] flex flex-col gap-2.5 shrink-0 pr-2">
                  <AnimatePresence>
                    {leftPlayers.map((player, index) => {
                      const checkResult =
                        humanPlayer?.role === "Seer"
                          ? gameState.nightActions.seerHistory?.find(
                              (h) => h.targetSeat === player.seat
                            )
                          : undefined;
                      const seerResult = checkResult
                        ? checkResult.isWolf
                          ? "wolf"
                          : "good"
                        : null;

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

                {/* 中间对话区域 - 简化容器 */}
                <div className="flex-1 flex flex-col min-w-0 min-h-0 h-full max-w-[1000px] overflow-hidden">
                  {/* 头部：玩家身份标签 - Glass Panel 风格 */}
                  {humanPlayer && (
                    <div className="flex items-center justify-between px-4 py-2 mb-2">
                      <div className="glass-panel px-3 py-1.5 rounded-full flex items-center gap-2 text-sm" style={{ background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(8px)' }}>
                        <SpeechIcon size={14} className="opacity-60" />
                        <span className="font-medium text-[var(--text-primary)]">{humanPlayer.displayName}</span>
                        <span className={`flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${
                          humanPlayer.role === "Werewolf" 
                            ? "text-[var(--color-wolf)] bg-[var(--color-wolf-bg)]" 
                            : "text-[var(--color-accent)] bg-[var(--color-accent-bg)]"
                        }`}>
                          {humanPlayer.role === "Werewolf" && <WerewolfIcon size={12} />}
                          {humanPlayer.role === "Seer" && <SeerIcon size={12} />}
                          {humanPlayer.role === "Witch" && <WitchIcon size={12} />}
                          {humanPlayer.role === "Hunter" && <HunterIcon size={12} />}
                          {humanPlayer.role === "Guard" && <GuardIcon size={12} />}
                          {humanPlayer.role === "Villager" && <VillagerIcon size={12} />}
                          {humanPlayer.role === "Werewolf" ? "狼人" :
                           humanPlayer.role === "Seer" ? "预言家" :
                           humanPlayer.role === "Witch" ? "女巫" :
                           humanPlayer.role === "Hunter" ? "猎人" :
                           humanPlayer.role === "Guard" ? "守卫" : "村民"}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* 对话内容 */}
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
                    />
                  </div>

                  {/* 底部操作面板 - 仅在需要时显示 */}
                  {(selectedSeat !== null || 
                    (gameState.phase === "NIGHT_WITCH_ACTION" && humanPlayer?.role === "Witch" && !isWaitingForAI) ||
                    gameState.phase === "GAME_END") && (
                    <div className="px-4 py-3">
                      <div className="glass-panel rounded-2xl px-4 py-2" style={{ background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.5)', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>
                        <BottomActionPanel
                          gameState={gameState}
                          humanPlayer={humanPlayer}
                          selectedSeat={selectedSeat}
                          isWaitingForAI={isWaitingForAI}
                          onConfirmAction={confirmSelectedSeat}
                          onCancelSelection={() => setSelectedSeat(null)}
                          onNightAction={handleNightActionConfirm}
                          onRestart={restartGame}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* 右侧面板：玩家 */}
                <div className="w-[220px] flex flex-col gap-2.5 shrink-0 pl-2">
                    <AnimatePresence>
                      {rightPlayers.map((player, index) => {
                         const checkResult = humanPlayer?.role === "Seer" 
                          ? gameState.nightActions.seerHistory?.find(h => h.targetSeat === player.seat)
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
            </>
          )}
        </div>
      </div>

      {/* 笔记本 Dock */}
      <div className="fixed bottom-5 right-5 z-50">
        <button
          onClick={() => setIsNotebookOpen((v) => !v)}
          className={`inline-flex items-center justify-center w-12 h-12 rounded-full shadow-lg border cursor-pointer transition-all ${isNight ? "bg-[#1a1512] text-[#f0e6d2] border-[#3e2723]" : "bg-[var(--bg-card)] text-[var(--text-primary)] border-[var(--border-color)]"}`}
          title={isNotebookOpen ? "关闭笔记" : "打开笔记"}
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
            <div className={`h-full rounded-lg overflow-hidden border shadow-2xl ${isNight ? "bg-[#1a1512] border-[#3e2723]" : "bg-[var(--bg-card)] border-[var(--border-color)]"}`}>
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
    </div>
  );
}
