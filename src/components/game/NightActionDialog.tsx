"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Eye, Skull, Shield, Drop, X, Crosshair, User } from "@phosphor-icons/react";
import {
  WerewolfIcon,
  SeerIcon,
  WitchIcon,
  GuardIcon,
  HunterIcon,
} from "@/components/icons/FlatIcons";
import type { GameState, Player, Phase, Role } from "@/types/game";

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

type WitchActionType = "save" | "poison" | "pass";

interface NightActionDialogProps {
  open: boolean;
  phase: Phase;
  gameState: GameState;
  humanPlayer: Player | null;
  onAction: (targetSeat: number, actionType?: WitchActionType) => void;
  onClose: () => void;
}

interface ActionConfig {
  title: string;
  description: string;
  icon: React.ReactNode;
  confirmText: string;
  buttonClass: string;
  getEligiblePlayers: (players: Player[], humanPlayer: Player) => Player[];
}

const getActionConfig = (phase: Phase, gameState: GameState): ActionConfig | null => {
  switch (phase) {
    case "NIGHT_SEER_ACTION":
      return {
        title: "预言家查验",
        description: "选择一名玩家查验其身份",
        icon: <SeerIcon size={24} />,
        confirmText: "确认查验",
        buttonClass: "bg-[var(--color-seer)] hover:bg-[#174a5a]",
        getEligiblePlayers: (players, hp) => 
          players.filter(p => p.alive && !p.isHuman),
      };
    case "NIGHT_WOLF_ACTION":
      return {
        title: "狼人击杀",
        description: "选择一名好人击杀",
        icon: <WerewolfIcon size={24} />,
        confirmText: "确认击杀",
        buttonClass: "bg-red-600 hover:bg-red-700",
        getEligiblePlayers: (players, hp) => 
          players.filter(p => p.alive && p.alignment === "village"),
      };
    case "NIGHT_GUARD_ACTION":
      return {
        title: "守卫保护",
        description: "选择一名玩家进行保护（不能连续保护同一人）",
        icon: <GuardIcon size={24} />,
        confirmText: "确认守护",
        buttonClass: "bg-green-600 hover:bg-green-700",
        getEligiblePlayers: (players, hp) => 
          players.filter(p => p.alive && p.seat !== gameState.nightActions.lastGuardTarget),
      };
    case "HUNTER_SHOOT":
      return {
        title: "猎人开枪",
        description: "选择一名玩家带走",
        icon: <HunterIcon size={24} />,
        confirmText: "确认开枪",
        buttonClass: "bg-orange-600 hover:bg-orange-700",
        getEligiblePlayers: (players, hp) => 
          players.filter(p => p.alive && !p.isHuman),
      };
    default:
      return null;
  }
};

export function NightActionDialog({
  open,
  phase,
  gameState,
  humanPlayer,
  onAction,
  onClose,
}: NightActionDialogProps) {
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);
  
  if (!humanPlayer) return null;
  
  const config = getActionConfig(phase, gameState);
  if (!config) return null;

  const eligiblePlayers = config.getEligiblePlayers(gameState.players, humanPlayer);

  const handleConfirm = () => {
    if (selectedSeat !== null) {
      onAction(selectedSeat);
      setSelectedSeat(null);
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="bg-[var(--bg-card)] border-[var(--border-color)] max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[var(--bg-secondary)] flex items-center justify-center">
              {config.icon}
            </div>
            <span>{config.title}</span>
          </DialogTitle>
          <DialogDescription>{config.description}</DialogDescription>
        </DialogHeader>

        <motion.div
          variants={{
            hidden: { opacity: 0 },
            show: {
              opacity: 1,
              transition: {
                staggerChildren: 0.05
              }
            }
          }}
          initial="hidden"
          animate="show"
          className="grid grid-cols-2 gap-2 py-4"
        >
          {eligiblePlayers.map((player) => (
            <motion.button
              key={player.playerId}
              variants={{
                hidden: { opacity: 0, scale: 0.9 },
                show: { opacity: 1, scale: 1 }
              }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setSelectedSeat(player.seat)}
              className={`
                p-3 rounded-lg border text-left transition-all flex items-center gap-3 cursor-pointer
                ${selectedSeat === player.seat
                  ? `${config.buttonClass} text-white border-transparent`
                  : "border-[var(--border-color)] bg-white hover:bg-[var(--bg-secondary)]"
                }
              `}
            >
              <img 
                src={dicebearUrl(player.playerId)} 
                alt={player.displayName}
                className="w-8 h-8 rounded-full"
              />
              <div>
                <div className="font-medium text-sm">{player.seat + 1}号</div>
                <div className="text-xs opacity-75 truncate">{player.displayName}</div>
              </div>
            </motion.button>
          ))}
        </motion.div>

        <div className="flex gap-2">
          <button onClick={onClose} className="inline-flex items-center justify-center h-10 text-sm font-medium rounded-sm cursor-pointer transition-all duration-150 bg-[var(--bg-secondary)] text-[var(--text-primary)] hover:bg-[var(--border-color)] flex-1">
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={selectedSeat === null}
            className={`inline-flex items-center justify-center h-10 text-sm font-medium rounded-sm cursor-pointer transition-all duration-150 text-white flex-1 ${config.buttonClass} ${selectedSeat === null ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            {config.confirmText}
            {selectedSeat !== null && ` ${selectedSeat + 1}号`}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// 女巫专用对话框
interface WitchActionDialogProps {
  open: boolean;
  gameState: GameState;
  humanPlayer: Player | null;
  onAction: (targetSeat: number, actionType: "save" | "poison" | "pass") => void;
  onClose: () => void;
}

export function WitchActionDialog({
  open,
  gameState,
  humanPlayer,
  onAction,
  onClose,
}: WitchActionDialogProps) {
  const [mode, setMode] = useState<"choose" | "poison">("choose");
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);
  
  if (!humanPlayer || humanPlayer.role !== "Witch") return null;

  const { witchHealUsed, witchPoisonUsed } = gameState.roleAbilities;
  const wolfTarget = gameState.nightActions.wolfTarget;
  const eligibleForPoison = gameState.players.filter(p => p.alive && !p.isHuman);

  const handleSave = () => {
    if (wolfTarget !== undefined) {
      onAction(wolfTarget, "save");
      onClose();
    }
  };

  const handlePoison = () => {
    if (selectedSeat !== null) {
      onAction(selectedSeat, "poison");
      setSelectedSeat(null);
      setMode("choose");
      onClose();
    }
  };

  const handlePass = () => {
    onAction(0, "pass");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) { setMode("choose"); onClose(); } }}>
      <DialogContent className="bg-[var(--bg-card)] border-[var(--border-color)] max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
              <WitchIcon size={24} className="text-purple-600" />
            </div>
            <span>女巫行动</span>
          </DialogTitle>
          <DialogDescription>
            {mode === "choose" ? "选择使用药水或跳过" : "选择毒药目标"}
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {mode === "choose" ? (
            <motion.div
              key="choose"
              initial="hidden"
              animate="show"
              exit={{ opacity: 0, x: -20 }}
              variants={{
                hidden: { opacity: 0, x: -20 },
                show: { 
                  opacity: 1, 
                  x: 0,
                  transition: { staggerChildren: 0.1 }
                }
              }}
              className="space-y-3 py-4"
            >
              {/* 解药选项 */}
              {wolfTarget !== undefined && !witchHealUsed && (
                <motion.button
                  variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
                  onClick={handleSave}
                  className="w-full p-4 rounded-lg border border-green-200 bg-green-50 hover:bg-green-100 flex items-center gap-3 transition-colors cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center text-white">
                    <Drop size={20} weight="fill" />
                  </div>
                  <div className="text-left">
                    <div className="font-medium text-green-800">使用解药</div>
                    <div className="text-sm text-green-600">
                      救 {wolfTarget + 1}号 {gameState.players.find(p => p.seat === wolfTarget)?.displayName}
                    </div>
                  </div>
                </motion.button>
              )}

              {wolfTarget !== undefined && witchHealUsed && (
                <motion.div 
                  variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
                  className="w-full p-4 rounded-lg border border-gray-200 bg-gray-50 flex items-center gap-3 opacity-50"
                >
                  <div className="w-10 h-10 rounded-full bg-gray-400 flex items-center justify-center text-white">
                    <Drop size={20} weight="fill" />
                  </div>
                  <div className="text-left">
                    <div className="font-medium text-gray-600">解药已用</div>
                    <div className="text-sm text-gray-500">
                      {wolfTarget + 1}号被狼人击杀
                    </div>
                  </div>
                </motion.div>
              )}

              {/* 毒药选项 */}
              {!witchPoisonUsed ? (
                <motion.button
                  variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
                  onClick={() => setMode("poison")}
                  className="w-full p-4 rounded-lg border border-purple-200 bg-purple-50 hover:bg-purple-100 flex items-center gap-3 transition-colors cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-full bg-purple-500 flex items-center justify-center text-white">
                    <Skull size={20} weight="fill" />
                  </div>
                  <div className="text-left">
                    <div className="font-medium text-purple-800">使用毒药</div>
                    <div className="text-sm text-purple-600">选择一名玩家毒杀</div>
                  </div>
                </motion.button>
              ) : (
                <motion.div 
                  variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
                  className="w-full p-4 rounded-lg border border-gray-200 bg-gray-50 flex items-center gap-3 opacity-50"
                >
                  <div className="w-10 h-10 rounded-full bg-gray-400 flex items-center justify-center text-white">
                    <Skull size={20} weight="fill" />
                  </div>
                  <div className="text-left">
                    <div className="font-medium text-gray-600">毒药已用</div>
                  </div>
                </motion.div>
              )}

              {/* 跳过选项 */}
              <motion.button
                variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
                onClick={handlePass}
                className="w-full p-4 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 flex items-center gap-3 transition-colors cursor-pointer"
              >
                <div className="w-10 h-10 rounded-full bg-gray-400 flex items-center justify-center text-white">
                  <X size={20} weight="bold" />
                </div>
                <div className="text-left">
                  <div className="font-medium text-gray-700">什么都不做</div>
                  <div className="text-sm text-gray-500">跳过本回合</div>
                </div>
              </motion.button>
            </motion.div>
          ) : (
            <motion.div
              key="poison"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="py-4"
            >
              <div className="grid grid-cols-2 gap-2 mb-4">
                {eligibleForPoison.map((player) => (
                  <motion.button
                    key={player.playerId}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setSelectedSeat(player.seat)}
                    className={`
                      p-3 rounded-lg border text-left transition-all flex items-center gap-3 cursor-pointer
                      ${selectedSeat === player.seat
                        ? "bg-purple-500 text-white border-transparent"
                        : "border-[var(--border-color)] bg-white hover:bg-[var(--bg-secondary)]"
                      }
                    `}
                  >
                    <img 
                      src={dicebearUrl(player.playerId)} 
                      alt={player.displayName}
                      className="w-8 h-8 rounded-full"
                    />
                    <div>
                      <div className="font-medium text-sm">{player.seat + 1}号</div>
                      <div className="text-xs opacity-75 truncate">{player.displayName}</div>
                    </div>
                  </motion.button>
                ))}
              </div>

              <div className="flex gap-2">
                <button onClick={() => setMode("choose")} className="inline-flex items-center justify-center h-10 text-sm font-medium rounded-sm cursor-pointer transition-all duration-150 bg-[var(--bg-secondary)] text-[var(--text-primary)] hover:bg-[var(--border-color)] flex-1">
                  返回
                </button>
                <button
                  onClick={handlePoison}
                  disabled={selectedSeat === null}
                  className={`inline-flex items-center justify-center gap-2 h-10 text-sm font-medium rounded-sm cursor-pointer transition-all duration-150 bg-[var(--color-danger)] text-white hover:bg-[#dc2626] flex-1 ${selectedSeat === null ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <Skull size={16} />
                  确认毒杀 {selectedSeat !== null && `${selectedSeat + 1}号`}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
