"use client";

import { motion } from "framer-motion";
import { CheckCircle } from "@phosphor-icons/react";
import type { Player } from "@/types/game";
import { buildSimpleAvatarUrl } from "@/lib/avatar-config";

interface VoteResultData {
  targetSeat: number;
  targetName: string;
  voterSeats: number[];
  voteCount: number;
}

interface VoteResultCardProps {
  title: string;
  results: VoteResultData[];
  players: Player[];
  isNight?: boolean;
}

export function VoteResultCard({ title, results, players, isNight = false }: VoteResultCardProps) {
  return (
    <div className={`wc-vote-result-card rounded-lg border ${isNight ? 'border-white/10 bg-black/20' : 'border-[var(--border-color)] bg-[var(--bg-secondary)]'} p-4 my-3`}>
      {/* 标题 */}
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-[var(--border-color)]">
        <CheckCircle size={18} weight="fill" className="text-[var(--color-accent)]" />
        <span className="text-sm font-semibold text-[var(--text-primary)]">{title}</span>
      </div>

      {/* 投票结果列表 */}
      <div className="space-y-2.5">
        {results.map((result, index) => {
          const target = players.find(p => p.seat === result.targetSeat);
          
          return (
            <motion.div
              key={result.targetSeat}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className={`wc-vote-result-row flex items-center gap-3 p-2.5 rounded-lg ${
                isNight 
                  ? 'bg-white/5 border border-white/10' 
                  : 'bg-white border border-[var(--border-color)]'
              }`}
            >
              {/* 得票者信息 */}
              <div className="wc-vote-result-target flex items-center gap-2 min-w-[100px]">
                {target && (
                  <img
                    src={buildSimpleAvatarUrl(target.playerId, { gender: target.agentProfile?.persona?.gender })}
                    alt={target.displayName}
                    className="w-7 h-7 rounded-full"
                  />
                )}
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-[var(--color-danger)]">
                    {result.targetSeat + 1}号
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)] leading-tight">
                    {result.targetName}
                  </span>
                </div>
              </div>

              {/* 投票者列表 */}
              <div className="wc-vote-result-voters flex-1 flex items-center gap-1.5 flex-wrap">
                {result.voterSeats.map((voterSeat) => {
                  const voter = players.find(p => p.seat === voterSeat);
                  return (
                    <motion.div
                      key={voterSeat}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 25 }}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                        voter?.isHuman
                          ? 'bg-[var(--color-accent)] text-white'
                          : isNight
                          ? 'bg-white/10 text-white/80 border border-white/20'
                          : 'bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border-color)]'
                      }`}
                    >
                      {voter && (
                        <img
                          src={buildSimpleAvatarUrl(voter.playerId, { gender: voter.agentProfile?.persona?.gender })}
                          alt={voter.displayName}
                          className="w-3.5 h-3.5 rounded-full"
                        />
                      )}
                      <span>{voterSeat + 1}号</span>
                    </motion.div>
                  );
                })}
              </div>

              {/* 票数统计 */}
              <div className="wc-vote-result-count flex items-center justify-center min-w-[50px]">
                <span className="text-base font-bold text-[var(--color-accent)]">
                  {result.voteCount % 1 === 0 ? result.voteCount : result.voteCount.toFixed(1)}票
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
