"use client";

import type { Player, GameState } from "@/types/game";
import { Eye, User, Skull, Users } from "@phosphor-icons/react";
import { WolfIcon } from "@/components/icons/WolfIcon";

interface RoleInfoCardProps {
  player: Player;
  gameState: GameState;
}

export function RoleInfoCard({ player, gameState }: RoleInfoCardProps) {
  const getRoleIcon = () => {
    switch (player.role) {
      case "Werewolf":
        return <WolfIcon size={24} weight="fill" />;
      case "Seer":
        return <Eye size={24} weight="fill" />;
      default:
        return <User size={24} weight="fill" />;
    }
  };

  const getRoleName = () => {
    switch (player.role) {
      case "Werewolf":
        return "狼人";
      case "Seer":
        return "预言家";
      default:
        return "村民";
    }
  };

  const getRoleDescription = () => {
    switch (player.role) {
      case "Werewolf":
        return "每晚选择一名玩家击杀";
      case "Seer":
        return "每晚可查验一名玩家身份";
      default:
        return "通过讨论找出狼人";
    }
  };

  const getTeammates = () => {
    if (player.role !== "Werewolf") return null;
    const teammates = gameState.players.filter(
      (p) => p.role === "Werewolf" && p.playerId !== player.playerId
    );
    return teammates;
  };

  const getSeerResult = () => {
    if (player.role !== "Seer" || !gameState.nightActions.seerResult) return null;
    const result = gameState.nightActions.seerResult;
    const target = gameState.players.find((p) => p.seat === result.targetSeat);
    return { target, isWolf: result.isWolf };
  };

  const teammates = getTeammates();
  const seerResult = getSeerResult();

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-md p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-12 h-12 rounded-full bg-[var(--bg-secondary)] flex items-center justify-center">
          {getRoleIcon()}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-lg">{getRoleName()}</span>
            {!player.alive && (
              <span className="text-xs px-2 py-0.5 bg-[var(--danger)] text-white rounded flex items-center gap-1">
                <Skull size={12} />
                已出局
              </span>
            )}
          </div>
          <p className="text-sm text-[var(--text-muted)]">{getRoleDescription()}</p>
        </div>
      </div>

      {/* 狼队友信息 */}
      {teammates && teammates.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[var(--border-color)]">
          <div className="flex items-center gap-2 text-sm text-[var(--text-muted)] mb-2">
            <Users size={14} />
            <span>狼队友</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {teammates.map((t) => (
              <span
                key={t.playerId}
                className="text-sm px-2 py-1 bg-[var(--bg-secondary)] rounded flex items-center gap-1"
              >
                <WolfIcon size={14} />
                {t.seat + 1}号 {t.displayName}
                {!t.alive && <Skull size={12} className="text-[var(--danger)]" />}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 预言家查验结果 */}
      {seerResult && (
        <div className="mt-3 pt-3 border-t border-[var(--border-color)]">
          <div className="flex items-center gap-2 text-sm text-[var(--text-muted)] mb-2">
            <Eye size={14} />
            <span>查验记录</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`text-sm px-2 py-1 rounded flex items-center gap-1 ${
                seerResult.isWolf
                  ? "bg-red-100 text-red-700"
                  : "bg-green-100 text-green-700"
              }`}
            >
              {seerResult.isWolf ? <WolfIcon size={14} /> : <User size={14} />}
              {seerResult.target?.seat! + 1}号 {seerResult.target?.displayName}:
              {seerResult.isWolf ? " 狼人" : " 好人"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
