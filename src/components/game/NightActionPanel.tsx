"use client";

import { useState } from "react";
import type { Player, Role } from "@/types/game";
import { Eye, Skull, User } from "@phosphor-icons/react";
import { WolfIcon } from "@/components/icons/WolfIcon";
import { motion, AnimatePresence } from "framer-motion";

interface NightActionPanelProps {
  players: Player[];
  currentPlayerId: string;
  role: Role;
  onAction: (targetSeat: number) => void;
  disabled?: boolean;
}

export function NightActionPanel({
  players,
  currentPlayerId,
  role,
  onAction,
  disabled,
}: NightActionPanelProps) {
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);

  const eligiblePlayers = players.filter((p) => {
    if (!p.alive || p.playerId === currentPlayerId) return false;
    if (role === "Werewolf") {
      return p.alignment === "village";
    }
    return true;
  });

  const getActionConfig = () => {
    if (role === "Seer") {
      return {
        title: "预言家查验",
        description: "选择一名玩家查验其身份",
        icon: <Eye size={20} weight="fill" />,
        confirmText: "确认查验",
        buttonClass: "bg-[var(--color-seer)] hover:bg-[#174a5a]",
      };
    }
    return {
      title: "狼人击杀",
      description: "选择一名好人击杀",
      icon: <WolfIcon size={20} weight="fill" />,
      confirmText: "确认击杀",
      buttonClass: "bg-red-600 hover:bg-red-700",
    };
  };

  const config = getActionConfig();

  const handleConfirm = () => {
    if (selectedSeat !== null) {
      onAction(selectedSeat);
      setSelectedSeat(null);
    }
  };

  return (
    <div className="space-y-4">
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-secondary)]"
      >
        <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center">
          {config.icon}
        </div>
        <div>
          <div className="font-medium">{config.title}</div>
          <p className="text-sm text-[var(--text-muted)]">{config.description}</p>
        </div>
      </motion.div>

      <div className="grid grid-cols-2 gap-2">
        <AnimatePresence>
          {eligiblePlayers.map((player) => (
            <motion.button
              key={player.playerId}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setSelectedSeat(player.seat)}
              disabled={disabled}
              className={`
                p-3 rounded-lg border text-left transition-all
                ${selectedSeat === player.seat
                  ? role === "Seer"
                    ? "border-[var(--color-seer)] bg-[var(--color-seer)] text-white"
                    : "border-red-500 bg-red-500 text-white"
                  : "border-[var(--border-color)] bg-white hover:bg-[var(--bg-secondary)]"
                }
                ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
              `}
            >
              <div className="flex items-center gap-2">
                <User size={16} />
                <span className="font-medium">{player.seat + 1}号</span>
                <span className="text-sm truncate">{player.displayName}</span>
              </div>
            </motion.button>
          ))}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {selectedSeat !== null && (
          <motion.button
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            onClick={handleConfirm}
            disabled={disabled}
            className={`
              w-full py-3 px-4 rounded-lg text-white font-medium
              flex items-center justify-center gap-2 transition-colors
              ${config.buttonClass}
              ${disabled ? "opacity-50 cursor-not-allowed" : ""}
            `}
          >
            {role === "Seer" ? <Eye size={18} weight="fill" /> : <Skull size={18} weight="fill" />}
            {config.confirmText} {selectedSeat + 1}号
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
