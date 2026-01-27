"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  CaretRight,
  X,
  Skull,
  Drop,
  Eye,
  Shield,
  Crosshair,
} from "@phosphor-icons/react";
import { ArrowClockwise } from "@phosphor-icons/react";
import {
  WerewolfIcon,
  VillagerIcon,
  VoteIcon,
} from "@/components/icons/FlatIcons";
import type { GameState, Player, Phase } from "@/types/game";
import { useTranslations } from "next-intl";

type WitchActionType = "save" | "poison" | "pass";

interface BottomActionPanelProps {
  gameState: GameState;
  humanPlayer: Player | null;
  selectedSeat: number | null;
  isWaitingForAI: boolean;
  isNight?: boolean;
  onConfirmAction: () => void;
  onCancelSelection: () => void;
  onNightAction: (seat: number, actionType?: WitchActionType) => void;
  onRestart: () => void;
}

export function BottomActionPanel({
  gameState,
  humanPlayer,
  selectedSeat,
  isWaitingForAI,
  isNight = false,
  onConfirmAction,
  onCancelSelection,
  onNightAction,
  onRestart,
}: BottomActionPanelProps) {
  const t = useTranslations();
  const phase = gameState.phase;

  const neutralButtonClass = isNight
    ? "bg-white/10 text-white/80 hover:bg-white/15"
    : "bg-[var(--bg-secondary)] text-[var(--text-primary)] hover:bg-[var(--border-color)]";

  const neutralCardClass = isNight
    ? "bg-white/5 border border-white/10 text-white/70"
    : "bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-muted)]";

  return (
    <div className="wc-bottom-action-panel min-h-[40px] flex items-center justify-center w-full">
      <AnimatePresence mode="wait">
        {/* 选择确认 (投票/夜间行动) */}
        {(() => {
          const isCorrectRoleForPhase = 
            (phase === "DAY_VOTE" && humanPlayer?.alive) ||
            (phase === "DAY_BADGE_ELECTION" && humanPlayer?.alive) ||
            (phase === "NIGHT_SEER_ACTION" && humanPlayer?.role === "Seer" && humanPlayer?.alive && gameState.nightActions.seerTarget === undefined) ||
            (phase === "NIGHT_WOLF_ACTION" && humanPlayer?.role === "Werewolf" && humanPlayer?.alive) ||
            (phase === "NIGHT_GUARD_ACTION" && humanPlayer?.role === "Guard" && humanPlayer?.alive) ||
            (phase === "HUNTER_SHOOT" && humanPlayer?.role === "Hunter");

          if (
            isCorrectRoleForPhase &&
            selectedSeat !== null &&
            ((phase === "DAY_VOTE" || phase === "DAY_BADGE_ELECTION") || !isWaitingForAI)
          ) {
            return (
              <motion.div
                key="action-confirm"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="wc-bottom-action-row flex gap-2 w-full items-center"
              >
                <button onClick={onCancelSelection} className={`inline-flex items-center justify-center h-10 text-sm font-medium rounded-sm cursor-pointer active:scale-[0.98] transition-all duration-150 flex-1 ${neutralButtonClass}`}>
                  {t("bottomAction.cancel")}
                </button>
                
                {phase === "DAY_VOTE" && (
                  <button onClick={onConfirmAction} className="inline-flex items-center justify-center h-10 text-base font-medium rounded-sm border-none cursor-pointer active:scale-[0.98] transition-all duration-150 bg-[var(--text-primary)] text-[var(--text-inverse)] hover:bg-black flex-[2]">
                    <VoteIcon size={18} className="mr-1" />
                    {t("bottomAction.confirmVote", { seat: selectedSeat + 1 })}
                  </button>
                )}
                
                {phase === "DAY_BADGE_ELECTION" && (
                  <button onClick={onConfirmAction} className="inline-flex items-center justify-center h-10 text-base font-medium rounded-sm border-none cursor-pointer active:scale-[0.98] transition-all duration-150 bg-[var(--color-gold)] text-[var(--bg-dark)] hover:bg-[#b8860b] flex-[2]">
                    <VoteIcon size={18} className="mr-1" />
                    {t("bottomAction.confirmVote", { seat: selectedSeat + 1 })}
                  </button>
                )}
                
                {phase === "NIGHT_SEER_ACTION" && (
                  <button onClick={onConfirmAction} className="inline-flex items-center justify-center h-10 text-base font-medium rounded-sm border-none cursor-pointer active:scale-[0.98] transition-all duration-150 bg-[var(--color-seer)] text-white hover:bg-[#174a5a] flex-[2]">
                    <Eye size={18} weight="fill" className="mr-1" />
                    {t("bottomAction.confirmSeer", { seat: selectedSeat + 1 })}
                  </button>
                )}
                
                {phase === "NIGHT_WOLF_ACTION" && (
                  <button onClick={onConfirmAction} className="inline-flex items-center justify-center h-10 text-base font-medium rounded-sm border-none cursor-pointer active:scale-[0.98] transition-all duration-150 bg-[var(--color-danger)] text-white hover:bg-[#dc2626] flex-[2]">
                    <Skull size={18} weight="fill" className="mr-1" />
                    {t("bottomAction.confirmWolf", { seat: selectedSeat + 1 })}
                  </button>
                )}
                
                {phase === "NIGHT_GUARD_ACTION" && (
                  <button onClick={onConfirmAction} className="inline-flex items-center justify-center h-10 text-base font-medium rounded-sm border-none cursor-pointer active:scale-[0.98] transition-all duration-150 bg-[var(--color-success)] text-white hover:bg-[#059669] flex-[2]">
                    <Shield size={18} weight="fill" className="mr-1" />
                    {t("bottomAction.confirmGuard", { seat: selectedSeat + 1 })}
                  </button>
                )}

                {phase === "HUNTER_SHOOT" && (
                  <button onClick={onConfirmAction} className="inline-flex items-center justify-center h-10 text-base font-medium rounded-sm border-none cursor-pointer active:scale-[0.98] transition-all duration-150 bg-[var(--color-warning)] text-white hover:bg-[#b45309] flex-[2]">
                    <Crosshair size={18} weight="fill" className="mr-1" />
                    {t("bottomAction.confirmHunter", { seat: selectedSeat + 1 })}
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
              className="wc-witch-action-row flex flex-col gap-2 w-full"
            > 
              <div className="flex items-center justify-between px-2 text-sm">
                 <span>{t("bottomAction.confirmPoison", { seat: selectedSeat + 1 })}</span>
              </div>
              <div className="flex gap-2">
                <button onClick={onCancelSelection} className={`inline-flex items-center justify-center h-10 text-sm font-medium rounded-sm cursor-pointer active:scale-[0.98] transition-all duration-150 flex-1 ${neutralButtonClass}`}>
                  {t("bottomAction.cancel")}
                </button>
                <button 
                  onClick={() => onNightAction(selectedSeat, "poison")} 
                  className="inline-flex items-center justify-center gap-2 h-10 text-sm font-medium rounded-sm border-none cursor-pointer active:scale-[0.98] transition-all duration-150 bg-[var(--color-danger)] text-white hover:bg-[#dc2626] disabled:opacity-50 disabled:cursor-not-allowed flex-1"
                  disabled={gameState.roleAbilities.witchPoisonUsed}
                >
                  <Skull size={16} />
                  {t("bottomAction.confirmPoisonAction")}
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="witch-actions"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="wc-witch-action-row flex items-center gap-2 w-full"
            > 
              {gameState.nightActions.wolfTarget !== undefined && (
                <button 
                  onClick={() => onNightAction(gameState.nightActions.wolfTarget!, "save")}
                  disabled={gameState.roleAbilities.witchHealUsed}
                  className="inline-flex items-center justify-center gap-2 h-10 text-sm font-medium rounded-sm border-none cursor-pointer active:scale-[0.98] transition-all duration-150 bg-[var(--color-success)] text-white hover:bg-[#059669] disabled:opacity-50 disabled:cursor-not-allowed flex-1"
                >
                  <Drop size={18} weight="fill" />
                  {t("bottomAction.saveTarget", { seat: gameState.nightActions.wolfTarget + 1 })}
                </button>
              )}
              
              <div className={`flex-1 flex items-center justify-center h-10 rounded-md text-xs px-2 ${neutralCardClass}`}>
                {gameState.roleAbilities.witchPoisonUsed ? (
                  <span>{t("bottomAction.poisonUsed")}</span>
                ) : (
                  <span className="flex items-center gap-1">
                    <CaretRight size={14} /> {t("bottomAction.clickToPoison")}
                  </span>
                )}
              </div>

              <button 
                onClick={() => onNightAction(0, "pass")}
                className={`inline-flex items-center justify-center gap-2 h-10 text-sm font-medium rounded-sm cursor-pointer active:scale-[0.98] transition-all duration-150 flex-1 ${neutralButtonClass}`}
              >
                <X size={16} />
                {t("bottomAction.pass")}
              </button>
            </motion.div>
          )
        )}

        {/* 猎人弃枪 */}
        {phase === "HUNTER_SHOOT" && humanPlayer?.role === "Hunter" && !isWaitingForAI && selectedSeat === null && (
          <motion.div
            key="hunter-pass"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="wc-bottom-action-row flex gap-2 w-full items-center"
          >
            <button
              onClick={onConfirmAction}
              className={`inline-flex items-center justify-center gap-2 h-10 text-sm font-medium rounded-sm cursor-pointer active:scale-[0.98] transition-all duration-150 flex-1 ${neutralButtonClass}`}
            >
              <X size={16} />
              {t("bottomAction.pass")}
            </button>
          </motion.div>
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
                <><VillagerIcon size={18} /> {t("bottomAction.gameEnd.villageWin")}</>
              ) : (
                <><WerewolfIcon size={18} className="text-[var(--color-wolf)]" /> {t("bottomAction.gameEnd.wolfWin")}</>
              )}
            </div>
            <button onClick={onRestart} className="inline-flex items-center justify-center gap-2 h-9 px-4 text-sm font-medium rounded-sm border-none cursor-pointer active:scale-[0.98] transition-all duration-150 bg-[var(--text-primary)] text-[var(--text-inverse)] hover:bg-black">
              <ArrowClockwise size={16} />
              {t("bottomAction.restart")}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
