"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  PaperPlaneTilt,
  CheckCircle,
  CaretRight,
  X,
  Skull,
  Drop,
  Eye,
  Shield,
  Crosshair,
  FastForward,
} from "@phosphor-icons/react";
import { ArrowClockwise } from "@phosphor-icons/react";
import {
  WerewolfIcon,
  VillagerIcon,
  VoteIcon,
} from "@/components/icons/FlatIcons";
import type { GameState, Player, Phase } from "@/types/game";

type WitchActionType = "save" | "poison" | "pass";

interface BottomActionPanelProps {
  gameState: GameState;
  humanPlayer: Player | null;
  selectedSeat: number | null;
  inputText: string;
  isWaitingForAI: boolean;
  waitingForNextRound: boolean;
  onInputChange: (text: string) => void;
  onSendMessage: () => void;
  onFinishSpeaking: () => void;
  onConfirmAction: () => void;
  onCancelSelection: () => void;
  onNightAction: (seat: number, actionType?: WitchActionType) => void;
  onNextRound: () => void;
  onRestart: () => void;
}

export function BottomActionPanel({
  gameState,
  humanPlayer,
  selectedSeat,
  inputText,
  isWaitingForAI,
  waitingForNextRound,
  onInputChange,
  onSendMessage,
  onFinishSpeaking,
  onConfirmAction,
  onCancelSelection,
  onNightAction,
  onNextRound,
  onRestart,
}: BottomActionPanelProps) {
  const phase = gameState.phase;
  const showTurnPrompt =
    !!humanPlayer?.alive &&
    (phase === "DAY_SPEECH" || phase === "DAY_LAST_WORDS") &&
    gameState.currentSpeakerSeat === humanPlayer?.seat;

  return (
    <div className="min-h-[40px] flex items-center justify-center w-full">
      <AnimatePresence mode="wait">
        {/* 下一轮按钮 - 优先级最高 */}
        {waitingForNextRound && (phase === "DAY_SPEECH" || phase === "DAY_LAST_WORDS") && (
          <motion.div
            key="next-round"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex justify-center w-full"
          >
            <button
              onClick={onNextRound}
              className="inline-flex items-center justify-center gap-2 h-10 px-8 text-sm font-medium rounded cursor-pointer bg-[var(--color-accent)] text-white hover:bg-[#a07608] transition-all"
            >
              <FastForward size={18} weight="fill" />
              下一位发言
            </button>
          </motion.div>
        )}

        {/* 发言输入区域 */}
        {!(waitingForNextRound && (phase === "DAY_SPEECH" || phase === "DAY_LAST_WORDS")) && 
         (phase === "DAY_SPEECH" || phase === "DAY_LAST_WORDS") && 
         gameState.currentSpeakerSeat === humanPlayer?.seat && (
          <motion.div
            key="speech-input"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col gap-2 w-full"
          >
            {showTurnPrompt && (
              <div className="w-full">
                <div className="w-full px-3 py-2 rounded-md border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-primary)]">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <span className="w-2 h-2 rounded-full bg-[var(--color-accent)] animate-pulse" />
                      {phase === "DAY_LAST_WORDS" ? "轮到你发表遗言" : "轮到你发言"}
                    </div>
                    <div className="text-xs text-[var(--text-muted)]">
                      Enter 发送
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-2 w-full items-center">
            <input
              type="text"
              value={inputText}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSendMessage()}
              placeholder={phase === "DAY_LAST_WORDS" ? "留下遗言..." : "请输入发言..."}
              className="flex-1 h-10 px-3 text-sm bg-[var(--bg-card)] border border-[var(--border-color)] rounded focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-bg)] transition-all"
              autoFocus
            />
            <button 
              onClick={onSendMessage} 
              className="inline-flex items-center justify-center w-9 h-9 rounded cursor-pointer bg-[var(--color-accent)] text-white hover:bg-[#a07608] disabled:opacity-50 disabled:cursor-not-allowed transition-all shrink-0" 
              disabled={!inputText.trim()}
              title="发送"
            >
              <PaperPlaneTilt size={18} weight="fill" />
            </button>
            <div className="w-px h-8 bg-[var(--border-color)] mx-1" />
            <button 
              onClick={onFinishSpeaking} 
              className="inline-flex items-center justify-center gap-1.5 h-9 px-3 text-sm font-medium rounded cursor-pointer bg-[var(--bg-secondary)] text-[var(--text-primary)] hover:bg-[var(--border-color)] transition-all shrink-0"
              title="结束发言"
            >
              <CheckCircle size={16} />
              <span>结束</span>
            </button>
            </div>
          </motion.div>
        )}

        {/* 选择确认 (投票/夜间行动) */}
        {(() => {
          const isCorrectRoleForPhase = 
            (phase === "DAY_VOTE" && humanPlayer?.alive) ||
            (phase === "NIGHT_SEER_ACTION" && humanPlayer?.role === "Seer" && humanPlayer?.alive) ||
            (phase === "NIGHT_WOLF_ACTION" && humanPlayer?.role === "Werewolf" && humanPlayer?.alive) ||
            (phase === "NIGHT_GUARD_ACTION" && humanPlayer?.role === "Guard" && humanPlayer?.alive) ||
            (phase === "HUNTER_SHOOT" && humanPlayer?.role === "Hunter");

          if (isCorrectRoleForPhase && selectedSeat !== null && !isWaitingForAI) {
            return (
              <motion.div
                key="action-confirm"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex gap-2 w-full items-center"
              >
                <button onClick={onCancelSelection} className="inline-flex items-center justify-center h-10 text-sm font-medium rounded-sm cursor-pointer transition-all duration-150 bg-[var(--bg-secondary)] text-[var(--text-primary)] hover:bg-[var(--border-color)] flex-1">
                  取消
                </button>
                
                {phase === "DAY_VOTE" && (
                  <button onClick={onConfirmAction} className="inline-flex items-center justify-center h-10 text-base font-medium rounded-sm border-none cursor-pointer transition-all duration-150 bg-[var(--text-primary)] text-[var(--text-inverse)] hover:bg-black flex-[2]">
                    <VoteIcon size={18} className="mr-1" />
                    确认投票: {selectedSeat + 1} 号
                  </button>
                )}
                
                {phase === "NIGHT_SEER_ACTION" && (
                  <button onClick={onConfirmAction} className="inline-flex items-center justify-center h-10 text-base font-medium rounded-sm border-none cursor-pointer transition-all duration-150 bg-[var(--color-seer)] text-white hover:bg-[#174a5a] flex-[2]">
                    <Eye size={18} weight="fill" className="mr-1" />
                    确认查验: {selectedSeat + 1} 号
                  </button>
                )}
                
                {phase === "NIGHT_WOLF_ACTION" && (
                  <button onClick={onConfirmAction} className="inline-flex items-center justify-center h-10 text-base font-medium rounded-sm border-none cursor-pointer transition-all duration-150 bg-[var(--color-danger)] text-white hover:bg-[#dc2626] flex-[2]">
                    <Skull size={18} weight="fill" className="mr-1" />
                    确认击杀: {selectedSeat + 1} 号
                  </button>
                )}
                
                {phase === "NIGHT_GUARD_ACTION" && (
                  <button onClick={onConfirmAction} className="inline-flex items-center justify-center h-10 text-base font-medium rounded-sm border-none cursor-pointer transition-all duration-150 bg-[var(--color-success)] text-white hover:bg-[#059669] flex-[2]">
                    <Shield size={18} weight="fill" className="mr-1" />
                    确认守护: {selectedSeat + 1} 号
                  </button>
                )}

                {phase === "HUNTER_SHOOT" && (
                  <button onClick={onConfirmAction} className="inline-flex items-center justify-center h-10 text-base font-medium rounded-sm border-none cursor-pointer transition-all duration-150 bg-[var(--color-warning)] text-white hover:bg-[#b45309] flex-[2]">
                    <Crosshair size={18} weight="fill" className="mr-1" />
                    确认开枪: {selectedSeat + 1} 号
                  </button>
                )}
              </motion.div>
            );
          }
          return null;
        })()}

        {/* 女巫行动面板 */}
        {phase === "NIGHT_WITCH_ACTION" && humanPlayer?.role === "Witch" && !isWaitingForAI && (
          selectedSeat !== null ? (
            <motion.div
              key="witch-poison-confirm"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col gap-2 w-full"
            > 
              <div className="flex items-center justify-between px-2 text-sm">
                 <span>确认对 <span className="text-[var(--color-danger)] font-bold">{selectedSeat + 1}号</span> 使用毒药?</span>
              </div>
              <div className="flex gap-2">
                <button onClick={onCancelSelection} className="inline-flex items-center justify-center h-10 text-sm font-medium rounded-sm cursor-pointer transition-all duration-150 bg-[var(--bg-secondary)] text-[var(--text-primary)] hover:bg-[var(--border-color)] flex-1">取消</button>
                <button 
                  onClick={() => onNightAction(selectedSeat, "poison")} 
                  className="inline-flex items-center justify-center gap-2 h-10 text-sm font-medium rounded-sm border-none cursor-pointer transition-all duration-150 bg-[var(--color-danger)] text-white hover:bg-[#dc2626] disabled:opacity-50 disabled:cursor-not-allowed flex-1"
                  disabled={gameState.roleAbilities.witchPoisonUsed}
                >
                  <Skull size={16} />
                  确认毒杀
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="witch-actions"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex items-center gap-2 w-full"
            > 
              {gameState.nightActions.wolfTarget !== undefined && (
                <button 
                  onClick={() => onNightAction(gameState.nightActions.wolfTarget!, "save")}
                  disabled={gameState.roleAbilities.witchHealUsed}
                  className="inline-flex items-center justify-center gap-2 h-10 text-sm font-medium rounded-sm border-none cursor-pointer transition-all duration-150 bg-[var(--color-success)] text-white hover:bg-[#059669] disabled:opacity-50 disabled:cursor-not-allowed flex-1"
                >
                  <Drop size={18} weight="fill" />
                  救 {gameState.nightActions.wolfTarget + 1}号
                </button>
              )}
              
              <div className="flex-1 flex items-center justify-center h-10 bg-[var(--bg-card)] rounded-md border border-[var(--border-color)] text-[var(--text-muted)] text-xs px-2">
                {gameState.roleAbilities.witchPoisonUsed ? (
                  <span>毒药已耗尽</span>
                ) : (
                  <span className="flex items-center gap-1">
                    <CaretRight size={14} /> 点击头像用毒
                  </span>
                )}
              </div>

              <button 
                onClick={() => onNightAction(0, "pass")}
                className="inline-flex items-center justify-center gap-2 h-10 text-sm font-medium rounded-sm cursor-pointer transition-all duration-150 bg-[var(--bg-secondary)] text-[var(--text-primary)] hover:bg-[var(--border-color)] flex-1"
              >
                <X size={16} />
                跳过
              </button>
            </motion.div>
          )
        )}

        {/* 游戏结束 */}
        {phase === "GAME_END" && (
          <motion.div
            key="game-end"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex flex-col items-center gap-3"
          >
            <div className={`flex items-center gap-2 px-3.5 py-2.5 rounded-md text-sm ${gameState.winner === "village" ? "bg-[var(--color-success-bg)] text-[var(--color-success)]" : "bg-[var(--color-accent-bg)] text-[var(--color-accent)]"}`}>
              {gameState.winner === "village" ? (
                <><VillagerIcon size={18} /> 好人阵营胜利！</>
              ) : (
                <><WerewolfIcon size={18} className="text-[var(--color-wolf)]" /> 狼人阵营胜利！</>
              )}
            </div>
            <button onClick={onRestart} className="inline-flex items-center justify-center gap-2 h-9 px-4 text-sm font-medium rounded-sm border-none cursor-pointer transition-all duration-150 bg-[var(--text-primary)] text-[var(--text-inverse)] hover:bg-black">
              <ArrowClockwise size={16} />
              重新开始
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
