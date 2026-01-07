"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { GameState } from "@/types/game";
import { Moon, Sun, Play, ArrowClockwise } from "@phosphor-icons/react";
import { WolfIcon } from "@/components/icons/WolfIcon";

interface GameHeaderProps {
  gameState: GameState;
  onStartGame: () => void;
  onRestartGame: () => void;
  isLoading: boolean;
}

export function GameHeader({
  gameState,
  onStartGame,
  onRestartGame,
  isLoading,
}: GameHeaderProps) {
  const isLobby = gameState.phase === "LOBBY";
  const isGameEnd = gameState.phase === "GAME_END";
  const isNight = gameState.phase.includes("NIGHT");

  return (
    <header className="border-b bg-card">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold flex items-center gap-2">
              <WolfIcon size={24} weight="bold" />
              Wolfcha
            </h1>
          {!isLobby && (
            <div className="flex items-center gap-2">
              <Badge variant={isNight ? "secondary" : "default"}>
                {isNight ? <Moon className="h-3 w-3 mr-1" /> : <Sun className="h-3 w-3 mr-1" />}
                第 {gameState.day} 天
              </Badge>
              <Badge variant="outline">
                {gameState.players.filter((p) => p.alive).length} / {gameState.players.length} 存活
              </Badge>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isLobby && (
            <Button onClick={onStartGame} disabled={isLoading}>
              {isLoading ? (
                <>
                  生成角色中...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  开始游戏
                </>
              )}
            </Button>
          )}
          {isGameEnd && (
            <Button onClick={onRestartGame} variant="outline">
              <ArrowClockwise size={16} className="mr-2" />
              重新开始
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
