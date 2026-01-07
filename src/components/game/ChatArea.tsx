"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Streamdown } from "streamdown";
import type { ChatMessage, Player } from "@/types/game";
import { ChatCircle } from "@phosphor-icons/react";
import { motion, AnimatePresence } from "framer-motion";

interface ChatAreaProps {
  messages: ChatMessage[];
  players: Player[];
  humanPlayerId: string | null;
}

function MessageContent({ content, isStreaming }: { content: string; isStreaming?: boolean }) {
  return <Streamdown isAnimating={isStreaming}>{content}</Streamdown>;
}

export function ChatArea({ messages, players, humanPlayerId }: ChatAreaProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const getPlayerByName = (name: string) => {
    return players.find((p) => p.displayName === name);
  };

  return (
    <Card className="h-full flex flex-col">
      <div className="p-4 border-b">
        <h2 className="font-semibold text-lg flex items-center gap-2">
          <ChatCircle size={20} />
          对话记录
        </h2>
      </div>
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-4">
          <AnimatePresence initial={false}>
            {messages.map((message) => {
              const isSystem = message.isSystem;
              const isHuman = message.playerId === humanPlayerId;
              const player = getPlayerByName(message.playerName);

              if (isSystem) {
                return (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-center"
                  >
                    <div className="bg-muted px-4 py-2 rounded-lg text-sm text-muted-foreground max-w-[85%] text-center whitespace-pre-wrap">
                      {message.content}
                    </div>
                  </motion.div>
                );
              }

              return (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, x: isHuman ? 20 : -20, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  className={cn(
                    "flex gap-3",
                    isHuman && "flex-row-reverse"
                  )}
                >
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarFallback className={cn(
                      "text-sm font-bold",
                      isHuman ? "bg-primary text-primary-foreground" : "bg-secondary"
                    )}>
                      {message.playerName.slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div className={cn(
                    "flex flex-col max-w-[75%]",
                    isHuman && "items-end"
                  )}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-bold">
                        {player ? `${player.seat + 1}号 ` : ""}{message.playerName}
                      </span>
                      {player?.agentProfile && (
                        <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded">
                          {player.agentProfile.modelRef.model.split("/")[1]}
                        </span>
                      )}
                      {message.isStreaming && (
                        <span className="text-xs text-[var(--color-accent)] animate-pulse">输入中...</span>
                      )}
                    </div>
                    <div className={cn(
                      "rounded-lg px-4 py-2 text-sm leading-relaxed",
                      isHuman 
                        ? "bg-primary text-primary-foreground" 
                        : "bg-muted"
                    )}>
                      <MessageContent content={message.content} isStreaming={message.isStreaming} />
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </ScrollArea>
    </Card>
  );
}
