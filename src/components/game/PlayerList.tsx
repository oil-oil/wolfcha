"use client";

import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Player, GameState } from "@/types/game";
import { Skull } from "@phosphor-icons/react";
import { motion, AnimatePresence } from "framer-motion";

interface PlayerListProps {
  players: Player[];
  currentSpeakerSeat: number | null;
  humanPlayerId: string | null;
  phase: GameState["phase"];
  onPlayerClick?: (player: Player) => void;
  selectedSeat?: number | null;
}

export function PlayerList({
  players,
  currentSpeakerSeat,
  humanPlayerId,
  phase,
  onPlayerClick,
  selectedSeat,
}: PlayerListProps) {
  const humanPlayer = players.find((p) => p.playerId === humanPlayerId);
  
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

  return (
    <Card className="h-full">
      <div className="p-4 border-b">
        <h2 className="font-semibold text-lg">玩家列表</h2>
        {humanPlayer && (
          <p className="text-sm text-muted-foreground mt-1">
            你的身份: <span className="font-medium text-foreground">
              {humanPlayer.role === "Werewolf" ? "狼人" : 
               humanPlayer.role === "Seer" ? "预言家" : "村民"}
            </span>
          </p>
        )}
      </div>
      <ScrollArea className="h-[calc(100%-80px)]">
        <div className="p-2 space-y-2">
          {players.map((player) => {
            const isCurrentSpeaker = player.seat === currentSpeakerSeat;
            const isHuman = player.playerId === humanPlayerId;
            const isSelected = player.seat === selectedSeat;
            const isClickable = player.alive && !!onPlayerClick;

            return (
              <motion.div
                layout
                key={player.playerId}
                initial={{ opacity: 0, x: -10 }}
                animate={{ 
                  opacity: player.alive ? 1 : 0.6,
                  x: 0,
                  scale: isCurrentSpeaker || isSelected ? 1.02 : 1,
                  backgroundColor: isCurrentSpeaker 
                    ? "var(--bg-highlight)" 
                    : isSelected 
                      ? "var(--bg-accent)" 
                      : "var(--bg-card)"
                }}
                whileHover={player.alive ? { scale: 1.02, backgroundColor: "var(--bg-secondary)" } : {}}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg transition-colors relative overflow-hidden",
                  !player.alive && "grayscale",
                  isClickable ? "cursor-pointer" : "cursor-default",
                  isCurrentSpeaker && "ring-2 ring-primary bg-primary/5",
                  isSelected && "ring-2 ring-accent-foreground bg-accent",
                  isHuman && "border-l-4 border-l-primary"
                )}
                onClick={() => isClickable && onPlayerClick?.(player)}
              >
                {/* 讲话状态的背景波纹效果 */}
                {isCurrentSpeaker && (
                  <motion.div
                    className="absolute inset-0 bg-primary/5"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0.1, 0.3, 0.1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                )}

                <div className="relative">
                  <Avatar className={cn(
                    "h-10 w-10 transition-all",
                    isCurrentSpeaker && "ring-2 ring-primary ring-offset-2"
                  )}>
                    <AvatarImage src={dicebearUrl(player.playerId)} alt={player.displayName} />
                    <AvatarFallback className={cn(
                      player.isHuman ? "bg-primary text-primary-foreground" : "bg-secondary"
                    )}>
                      {player.displayName[0]}
                    </AvatarFallback>
                  </Avatar>
                  {!player.alive && (
                    <motion.div 
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute -bottom-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 shadow-sm"
                    >
                      <Skull size={12} weight="fill" />
                    </motion.div>
                  )}
                </div>

                <div className="flex-1 min-w-0 z-10">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">
                      {player.seat + 1}号 {player.displayName}
                    </span>
                    {isHuman && (
                      <Badge variant="outline" className="text-xs bg-background/50">你</Badge>
                    )}
                  </div>
                  {player.agentProfile && (
                    <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                      {player.agentProfile.persona.styleLabel}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1 z-10">
                  <AnimatePresence>
                    {isCurrentSpeaker && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                      >
                        <Badge variant="default" className="text-xs animate-pulse">
                          发言中
                        </Badge>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            );
          })}
        </div>
      </ScrollArea>
    </Card>
  );
}
