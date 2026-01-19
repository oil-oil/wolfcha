"use client";

import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, HourglassSimple } from "@phosphor-icons/react";
import type { GameState, Player } from "@/types/game";

interface VotingProgressProps {
  gameState: GameState;
  humanPlayer: Player | null;
}

export function VotingProgress({ gameState, humanPlayer }: VotingProgressProps) {
  const alivePlayers = gameState.players.filter(p => p.alive);
  const isBadgeElection = gameState.phase === "DAY_BADGE_ELECTION";
  const votes = isBadgeElection ? gameState.badge.votes : gameState.votes;
  
  // 警长投票阶段，候选人不参与投票
  const candidates = gameState.badge.candidates || [];
  const eligibleVoters = isBadgeElection 
    ? alivePlayers.filter(p => !candidates.includes(p.seat))
    : alivePlayers;
  const totalVoters = eligibleVoters.length;
  const votedCount = Object.keys(votes).length;
  
  // 获取警长信息（用于计算1.5票）
  const sheriffSeat = gameState.badge.holderSeat;
  const sheriffPlayer = sheriffSeat !== null 
    ? gameState.players.find(p => p.seat === sheriffSeat && p.alive)
    : null;

  // 统计每个目标的票数（考虑警长1.5票权重，仅在非警长选举阶段）
  const voteTargets: Record<number, { voters: Player[], target: Player | undefined, voteCount: number }> = {};
  
  Object.entries(votes).forEach(([voterId, targetSeat]) => {
    const voter = gameState.players.find(p => p.playerId === voterId);
    const target = gameState.players.find(p => p.seat === targetSeat);
    
    // 警长的票在非警长选举阶段计算为1.5票
    const voteWeight = (!isBadgeElection && sheriffPlayer && voterId === sheriffPlayer.playerId) ? 1.5 : 1;
    
    if (!voteTargets[targetSeat]) {
      voteTargets[targetSeat] = { voters: [], target, voteCount: 0 };
    }
    if (voter) {
      voteTargets[targetSeat].voters.push(voter);
      voteTargets[targetSeat].voteCount += voteWeight;
    }
  });

  // 按票数排序
  const sortedTargets = Object.entries(voteTargets)
    .sort(([, a], [, b]) => b.voteCount - a.voteCount);

  return (
    <div className="wc-voting-progress space-y-3">
      {/* 进度条 */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-[var(--color-accent)]"
            initial={{ width: 0 }}
            animate={{ width: `${(votedCount / totalVoters) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
        <span className="text-xs text-[var(--text-muted)] whitespace-nowrap">
          {votedCount}/{totalVoters} 已投票
        </span>
      </div>

      {/* 投票详情 */}
      <div className="wc-voting-progress-list space-y-2 relative">
        <AnimatePresence mode="popLayout" initial={false}>
          {sortedTargets.length > 0 ? (
            sortedTargets.map(([targetSeat, { voters, target, voteCount }]) => (
              <motion.div
                layout
                key={targetSeat}
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
                className="wc-voting-progress-row flex items-center gap-2 p-2 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]"
              >
                <div className="flex items-center gap-1.5 min-w-[80px]">
                  <span className="text-sm font-bold text-[var(--color-danger)]">
                    {Number(targetSeat) + 1}号
                  </span>
                  <span className="text-xs text-[var(--text-secondary)] truncate max-w-[60px]">
                    {target?.displayName}
                  </span>
                </div>
                <div className="flex-1 flex items-center gap-1 flex-wrap">
                  <AnimatePresence mode="popLayout">
                    {voters.map((voter) => (
                      <motion.span
                        layout
                        key={voter.playerId}
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded ${
                          voter.isHuman 
                            ? "bg-[var(--color-accent)] text-white font-bold" 
                            : "bg-white border border-[var(--border-color)] text-[var(--text-secondary)]"
                        }`}
                      >
                        <CheckCircle size={10} weight="fill" />
                        {voter.seat + 1}号
                      </motion.span>
                    ))}
                  </AnimatePresence>
                </div>
                <motion.span 
                  layout
                  className="text-sm font-bold text-[var(--color-accent)] ml-auto"
                >
                  {voteCount % 1 === 0 ? voteCount : voteCount.toFixed(1)}票
                </motion.span>
              </motion.div>
            ))
          ) : (
            <motion.div
              key="waiting"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-center gap-2 py-3 text-sm text-[var(--text-muted)]"
            >
              <HourglassSimple size={16} className="animate-pulse" />
              等待投票中...
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 未投票玩家 */}
      {votedCount < totalVoters && votedCount > 0 && (
        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <span>等待中:</span>
          <div className="flex gap-1 flex-wrap">
            {eligibleVoters
              .filter(p => votes[p.playerId] === undefined)
              .map(p => (
                <span 
                  key={p.playerId} 
                  className={`px-1.5 py-0.5 rounded ${
                    p.isHuman 
                      ? "bg-[var(--color-accent-bg)] text-[var(--color-accent)] font-bold" 
                      : "bg-[var(--bg-hover)]"
                  }`}
                >
                  {p.seat + 1}号{p.isHuman ? "(你)" : ""}
                </span>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
