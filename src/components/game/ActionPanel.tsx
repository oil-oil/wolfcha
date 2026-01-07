"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { GameState, Player } from "@/types/game";
import { PaperPlaneTilt, CheckCircle, Eye, Skull, User } from "@phosphor-icons/react";
import { WolfIcon } from "@/components/icons/WolfIcon";
import { motion, AnimatePresence } from "framer-motion";

interface ActionPanelProps {
  gameState: GameState;
  humanPlayer: Player | null;
  onSendMessage: (content: string) => void;
  onVote: (targetSeat: number) => void;
  onNightAction: (targetSeat: number) => void;
  isWaitingForAI: boolean;
  selectedSeat: number | null;
  onSelectSeat: (seat: number | null) => void;
}

export function ActionPanel({
  gameState,
  humanPlayer,
  onSendMessage,
  onVote,
  onNightAction,
  isWaitingForAI,
  selectedSeat,
  onSelectSeat,
}: ActionPanelProps) {
  const [inputMessage, setInputMessage] = useState("");

  const handleSend = () => {
    if (inputMessage.trim()) {
      onSendMessage(inputMessage.trim());
      setInputMessage("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isHumanTurn = gameState.currentSpeakerSeat === humanPlayer?.seat;
  const alivePlayers = gameState.players.filter(
    (p) => p.alive && p.playerId !== humanPlayer?.playerId
  );

  const getPhaseDescription = () => {
    switch (gameState.phase) {
      case "LOBBY":
        return "等待开始游戏";
      case "SETUP":
        return "正在生成角色...";
      case "NIGHT_START":
        return "夜晚降临";
      case "NIGHT_SEER_ACTION":
        return humanPlayer?.role === "Seer" ? "请选择要查验的玩家" : "预言家正在查验...";
      case "NIGHT_WOLF_ACTION":
        return humanPlayer?.role === "Werewolf" ? "请选择要击杀的玩家" : "狼人正在行动...";
      case "NIGHT_RESOLVE":
        return "天亮了...";
      case "DAY_START":
        return "白天开始";
      case "DAY_SPEECH":
        return isHumanTurn ? "轮到你发言了！" : `${gameState.currentSpeakerSeat !== null ? gameState.currentSpeakerSeat + 1 : "?"}号正在发言...`;
      case "DAY_LAST_WORDS":
        return "遗言阶段";
      case "DAY_VOTE":
        return "请投票处决一名玩家";
      case "DAY_RESOLVE":
        return "处决结算中...";
      case "GAME_END":
        return gameState.winner === "village" ? "好人阵营胜利！" : "狼人阵营胜利！";
      default:
        return "";
    }
  };

  const renderPrivateInfo = () => {
    if (!humanPlayer) return null;

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Badge variant={humanPlayer.role === "Werewolf" ? "destructive" : "default"}>
            {humanPlayer.role === "Werewolf" ? "狼人" : 
             humanPlayer.role === "Seer" ? "预言家" : "村民"}
          </Badge>
          {!humanPlayer.alive && (
            <Badge variant="outline" className="text-destructive">
              <Skull size={12} className="mr-1" /> 已出局
            </Badge>
          )}
        </div>

        {humanPlayer.role === "Werewolf" && (
          <div className="text-sm">
            <span className="text-muted-foreground">狼队友: </span>
            {gameState.players
              .filter((p) => p.role === "Werewolf" && p.playerId !== humanPlayer.playerId)
              .map((p) => `${p.seat + 1}号(${p.displayName})`)
              .join(", ") || "无"}
          </div>
        )}

        {humanPlayer.role === "Seer" && gameState.nightActions.seerResult && (
          <motion.div 
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-sm"
          >
            <span className="text-muted-foreground">查验结果: </span>
            {gameState.nightActions.seerResult.targetSeat + 1}号 - 
            {gameState.nightActions.seerResult.isWolf ? " 狼人" : " 好人"}
          </motion.div>
        )}
      </div>
    );
  };

  const renderAction = () => {
    if (!humanPlayer?.alive) {
      return (
        <motion.div 
          key="dead"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="text-center text-muted-foreground py-4"
        >
          你已出局，正在观战...
        </motion.div>
      );
    }

    if (isWaitingForAI) {
      return (
        <motion.div 
          key="waiting"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="text-center py-4"
        >
          <div className="animate-pulse text-muted-foreground">
            AI 正在思考中...
          </div>
        </motion.div>
      );
    }

    if (gameState.phase === "DAY_SPEECH" && isHumanTurn) {
      return (
        <motion.div 
          key="speech"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="space-y-3"
        >
          <div className="flex gap-2">
            <Input
              placeholder="输入你的发言..."
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <Button onClick={handleSend} disabled={!inputMessage.trim()}>
              <PaperPlaneTilt size={16} weight="fill" />
            </Button>
          </div>
        </motion.div>
      );
    }

    if (gameState.phase === "DAY_VOTE") {
      return (
        <motion.div 
          key="vote"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="space-y-3"
        >
          <p className="text-sm text-muted-foreground">选择要投票处决的玩家:</p>
          <div className="grid grid-cols-2 gap-2">
            {alivePlayers.map((player) => (
              <Button
                key={player.playerId}
                variant={selectedSeat === player.seat ? "default" : "outline"}
                size="sm"
                onClick={() => onSelectSeat(player.seat)}
              >
                {player.seat + 1}号 {player.displayName}
              </Button>
            ))}
          </div>
          <AnimatePresence>
            {selectedSeat !== null && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
              >
                <Button 
                  className="w-full mt-2" 
                  onClick={() => {
                    onVote(selectedSeat);
                    onSelectSeat(null);
                  }}
                >
                  <CheckCircle size={16} weight="fill" className="mr-2" />
                  确认投票
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      );
    }

    if (gameState.phase === "NIGHT_SEER_ACTION" && humanPlayer.role === "Seer") {
      return (
        <motion.div 
          key="seer"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="space-y-3"
        >
          <p className="text-sm text-muted-foreground">选择要查验的玩家:</p>
          <div className="grid grid-cols-2 gap-2">
            {alivePlayers.map((player) => (
              <Button
                key={player.playerId}
                variant={selectedSeat === player.seat ? "default" : "outline"}
                size="sm"
                onClick={() => onSelectSeat(player.seat)}
              >
                {player.seat + 1}号 {player.displayName}
              </Button>
            ))}
          </div>
          <AnimatePresence>
            {selectedSeat !== null && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
              >
                <Button 
                  className="w-full mt-2"
                  onClick={() => {
                    onNightAction(selectedSeat);
                    onSelectSeat(null);
                  }}
                >
                  <Eye size={16} weight="fill" className="mr-2" />
                  确认查验
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      );
    }

    if (gameState.phase === "NIGHT_WOLF_ACTION" && humanPlayer.role === "Werewolf") {
      const villagers = gameState.players.filter(
        (p) => p.alive && p.alignment === "village"
      );
      return (
        <motion.div 
          key="wolf"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="space-y-3"
        >
          <p className="text-sm text-muted-foreground">选择要击杀的玩家:</p>
          <div className="grid grid-cols-2 gap-2">
            {villagers.map((player) => (
              <Button
                key={player.playerId}
                variant={selectedSeat === player.seat ? "default" : "outline"}
                size="sm"
                onClick={() => onSelectSeat(player.seat)}
              >
                {player.seat + 1}号 {player.displayName}
              </Button>
            ))}
          </div>
          <AnimatePresence>
            {selectedSeat !== null && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
              >
                <Button 
                  className="w-full mt-2"
                  variant="destructive"
                  onClick={() => {
                    onNightAction(selectedSeat);
                    onSelectSeat(null);
                  }}
                >
                  <Skull size={16} weight="fill" className="mr-2" />
                  确认击杀
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      );
    }

    return (
      <motion.div 
        key="idle"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="text-center text-muted-foreground py-4"
      >
        等待其他玩家行动...
      </motion.div>
    );
  };

  return (
    <Card className="h-full flex flex-col overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          <span>操作面板</span>
          <Badge variant="outline">
            第 {gameState.day} 天
          </Badge>
        </CardTitle>
        <motion.p 
          key={getPhaseDescription()}
          initial={{ opacity: 0, x: -5 }}
          animate={{ opacity: 1, x: 0 }}
          className="text-sm text-muted-foreground"
        >
          {getPhaseDescription()}
        </motion.p>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-4">
        {renderPrivateInfo()}
        <div className="border-t pt-4 flex-1">
          <AnimatePresence mode="wait">
            {renderAction()}
          </AnimatePresence>
        </div>
      </CardContent>
    </Card>
  );
}
