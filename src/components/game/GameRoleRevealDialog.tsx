"use client";

import { motion } from "framer-motion";
import { ArrowClockwise } from "@phosphor-icons/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  WerewolfIcon,
  SeerIcon,
  VillagerIcon,
  WitchIcon,
  HunterIcon,
  GuardIcon,
} from "@/components/icons/FlatIcons";
import type { GameState, Player, Role } from "@/types/game";

// 柔和但可区分的背景色
const avatarBgColors = [
  'e8d5c4', 'd4e5d7', 'd5dce8', 'e8d4d9', 'ddd4e8',
  'd4e8e5', 'e8e4d4', 'd4d8e8', 'e5d4d4', 'dae8d4',
];

const getPlayerBgColor = (seed: string) => {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return avatarBgColors[Math.abs(hash) % avatarBgColors.length];
};

const dicebearUrl = (seed: string) =>
  `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(seed)}&backgroundColor=${getPlayerBgColor(seed)}`;

const getRoleIcon = (role: Role) => {
  switch (role) {
    case "Werewolf": return <WerewolfIcon size={14} />;
    case "Seer": return <SeerIcon size={14} />;
    case "Witch": return <WitchIcon size={14} />;
    case "Hunter": return <HunterIcon size={14} />;
    case "Guard": return <GuardIcon size={14} />;
    default: return <VillagerIcon size={14} />;
  }
};

const getRoleLabel = (role: Role) => {
  switch (role) {
    case "Werewolf": return "狼人";
    case "Seer": return "预言家";
    case "Witch": return "女巫";
    case "Hunter": return "猎人";
    case "Guard": return "守卫";
    default: return "村民";
  }
};

const getRoleBadgeClass = (role: Role) => {
  switch (role) {
    case "Werewolf": return "bg-[var(--color-wolf-bg)] text-[var(--color-wolf)]";
    case "Seer": return "bg-[var(--color-seer-bg)] text-[var(--color-seer)]";
    case "Witch": return "bg-[var(--color-witch-bg)] text-[var(--color-witch)]";
    case "Hunter": return "bg-[var(--color-hunter-bg)] text-[var(--color-hunter)]";
    case "Guard": return "bg-[var(--color-guard-bg)] text-[var(--color-guard)]";
    default: return "bg-[var(--color-villager-bg)] text-[var(--color-villager)]";
  }
};

interface GameRoleRevealDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gameState: GameState;
  onRestart: () => void;
}

export function GameRoleRevealDialog({
  open,
  onOpenChange,
  gameState,
  onRestart,
}: GameRoleRevealDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[var(--bg-card)] border-[var(--border-color)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {gameState.winner === "village" ? (
              <><VillagerIcon size={20} className="text-[var(--color-success)]" /> 好人阵营胜利</>
            ) : gameState.winner === "wolf" ? (
              <><WerewolfIcon size={20} className="text-[var(--color-wolf)]" /> 狼人阵营胜利</>
            ) : "游戏结束"}
          </DialogTitle>
          <DialogDescription>身份揭晓</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          <motion.div
            initial="hidden"
            animate="show"
            variants={{
              hidden: { opacity: 0 },
              show: {
                opacity: 1,
                transition: {
                  staggerChildren: 0.1
                }
              }
            }}
            className="space-y-2"
          >
            {gameState.players
              .slice()
              .sort((a, b) => a.seat - b.seat)
              .map((p) => (
                <motion.div
                  key={p.playerId}
                  variants={{
                    hidden: { opacity: 0, x: -20 },
                    show: { opacity: 1, x: 0 }
                  }}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[var(--bg-secondary)]"
                >
                  <img
                    src={dicebearUrl(p.playerId)}
                    alt={p.displayName}
                    className={`w-9 h-9 rounded-full ${p.alive ? "" : "grayscale opacity-50"}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate flex items-center gap-2">
                      <span className="text-[var(--text-muted)]">{p.seat + 1}号</span>
                      {p.displayName}
                      {p.isHuman && <span className="bg-[var(--color-accent)] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-sm uppercase tracking-wide">YOU</span>}
                    </div>
                    <div className="text-xs text-[var(--text-muted)]">{p.alive ? "存活" : "出局"}</div>
                  </div>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full uppercase tracking-wide ${getRoleBadgeClass(p.role)}`}>
                    {getRoleIcon(p.role)}
                    {getRoleLabel(p.role)}
                  </span>
                </motion.div>
              ))}
          </motion.div>
        </div>
        <DialogFooter>
          <button onClick={onRestart} className="inline-flex items-center justify-center gap-2 h-9 px-4 text-sm font-medium rounded-sm border-none cursor-pointer transition-all duration-150 bg-[var(--text-primary)] text-[var(--text-inverse)] hover:bg-black">
            <ArrowClockwise size={16} />
            重新开始
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
