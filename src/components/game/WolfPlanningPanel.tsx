"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Skull, HourglassSimple, CheckCircle, Target } from "@phosphor-icons/react";
import { WerewolfIcon } from "@/components/icons/FlatIcons";
import type { GameState, Player } from "@/types/game";
import { useTranslations } from "next-intl";

interface WolfPlanningPanelProps {
  gameState: GameState;
  humanPlayer: Player | null;
}

export function WolfPlanningPanel({ gameState, humanPlayer }: WolfPlanningPanelProps) {
  const t = useTranslations();
  const wolves = gameState.players.filter(p => p.role === "Werewolf" && p.alive);
  const wolfVotes = gameState.nightActions.wolfVotes || {};
  const votedCount = Object.keys(wolfVotes).length;

  // 统计每个目标的票数
  const voteTargets: Record<number, { voters: Player[], target: Player | undefined }> = {};
  
  Object.entries(wolfVotes).forEach(([voterId, targetSeat]) => {
    const voter = gameState.players.find(p => p.playerId === voterId);
    const target = gameState.players.find(p => p.seat === targetSeat);
    
    if (!voteTargets[targetSeat]) {
      voteTargets[targetSeat] = { voters: [], target };
    }
    if (voter) {
      voteTargets[targetSeat].voters.push(voter);
    }
  });

  // 按票数排序
  const sortedTargets = Object.entries(voteTargets)
    .sort(([, a], [, b]) => b.voters.length - a.voters.length);

  // 判断是否达成一致
  const isConsensus = sortedTargets.length === 1 && votedCount === wolves.length;

  return (
    <div className="wc-wolf-panel bg-[#1a1512] border border-[#3e2723] rounded-lg p-4 text-[#f0e6d2]">
      {/* 标题 */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 bg-[var(--color-wolf)] rounded-full flex items-center justify-center">
          <WerewolfIcon size={16} className="text-white" />
        </div>
        <div>
          <div className="text-sm font-bold">{t("wolfPlanning.title")}</div>
          <div className="text-xs text-[#a09080]">{t("wolfPlanning.subtitle")}</div>
        </div>
      </div>

      {/* 狼队友状态 */}
      <div className="mb-4">
        <div className="text-xs text-[#a09080] mb-2">{t("wolfPlanning.teammateStatus")}</div>
        <div className="flex flex-col sm:flex-row gap-2">
          {wolves.map(wolf => {
          const hasVoted = wolfVotes[wolf.playerId] !== undefined;
          const votedTarget = hasVoted 
            ? gameState.players.find(p => p.seat === wolfVotes[wolf.playerId])
            : null;
          
          return (
            <motion.div
              key={wolf.playerId}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className={`flex items-center gap-2 p-2 rounded flex-1 min-w-0 ${
                wolf.isHuman ? "bg-[#3e2723]" : "bg-[#2a201a]"
              }`}
            >
              <div className="w-6 h-6 bg-[var(--color-wolf)] rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                {wolf.seat + 1}
              </div>
              <span className="text-xs sm:text-sm flex-1 min-w-0 truncate">
                {wolf.isHuman ? t("common.you") : wolf.displayName}
              </span>
              {hasVoted ? (
                <span className="flex items-center gap-1 text-[10px] sm:text-xs text-green-400 shrink-0">
                  <CheckCircle size={12} weight="fill" />
                  <span className="font-bold">
                    {t("mentions.seatLabel", { seat: wolfVotes[wolf.playerId] + 1 })}
                  </span>
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[10px] sm:text-xs text-yellow-400 shrink-0">
                  <HourglassSimple size={12} className="animate-pulse" />
                  <span className="hidden sm:inline">{t("wolfPlanning.thinking")}</span>
                  <span className="sm:hidden">...</span>
                </span>
              )}
            </motion.div>
          );
        })}
        </div>
      </div>

      {/* 目标汇总 */}
      {sortedTargets.length > 0 && (
        <div className="border-t border-[#3e2723] pt-3">
          <div className="text-xs text-[#a09080] mb-2">{t("wolfPlanning.targetSummary")}</div>
          <AnimatePresence mode="popLayout">
            {sortedTargets.map(([targetSeat, { voters, target }]) => (
              <motion.div
                key={targetSeat}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`flex items-center gap-2 p-2 rounded mb-1 ${
                  isConsensus ? "bg-[var(--color-wolf)]/30 border border-[var(--color-wolf)]" : "bg-[#2a201a]"
                }`}
              >
                <Skull size={16} className="text-[var(--color-danger)]" />
                <span className="font-bold">{t("mentions.seatLabel", { seat: Number(targetSeat) + 1 })}</span>
                <span className="text-xs text-[#a09080] truncate">{target?.displayName}</span>
                <span className="ml-auto text-sm font-bold text-[var(--color-danger)]">
                  {t("wolfPlanning.votes", { count: voters.length })}
                </span>
              </motion.div>
            ))}
          </AnimatePresence>
          
          {isConsensus && (
            <div className="mt-2 text-center text-xs text-green-400 flex items-center justify-center gap-1">
              <CheckCircle size={12} weight="fill" />
              {t("wolfPlanning.consensus")}
            </div>
          )}
        </div>
      )}

      {/* 提示 */}
      {!wolfVotes[humanPlayer?.playerId || ""] && humanPlayer?.role === "Werewolf" && (
        <div className="mt-3 text-xs text-yellow-400 flex items-center gap-1">
          <Target size={12} />
          {t("wolfPlanning.hint")}
        </div>
      )}
    </div>
  );
}
