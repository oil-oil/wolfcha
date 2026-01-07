"use client";

import { useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Moon, 
  Sun, 
  Skull, 
  Eye, 
  ChatCircle, 
  Users, 
  CheckCircle,
  Warning,
  Shield,
  Drop,
} from "@phosphor-icons/react";
import { WerewolfIcon, SeerIcon, WitchIcon, HunterIcon, GuardIcon, VillagerIcon } from "@/components/icons/FlatIcons";

export interface EventLogItem {
  id: string;
  type: "phase" | "action" | "death" | "vote" | "speech" | "system" | "result";
  icon?: React.ReactNode;
  title: string;
  description?: string;
  timestamp: number;
  day: number;
  isNight?: boolean;
}

interface EventLogProps {
  events: EventLogItem[];
  maxHeight?: number;
}

const eventColors: Record<EventLogItem["type"], string> = {
  phase: "var(--color-accent)",
  action: "var(--color-seer)",
  death: "var(--color-danger)",
  vote: "var(--color-warning)",
  speech: "var(--text-secondary)",
  system: "var(--text-muted)",
  result: "var(--color-success)",
};

export function EventLog({ events, maxHeight = 300 }: EventLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 py-4 text-sm text-[var(--text-muted)]">
        <ChatCircle size={20} className="text-[var(--text-muted)]" />
        <span>暂无事件</span>
      </div>
    );
  }

  return (
    <div 
      ref={scrollRef}
      className="overflow-y-auto space-y-1 p-2"
      style={{ maxHeight }}
    >
      <AnimatePresence initial={false} mode="popLayout">
        {events.map((event, index) => (
          <motion.div
            layout
            key={event.id}
            initial={{ opacity: 0, x: -20, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ 
              type: "spring", 
              stiffness: 500, 
              damping: 30,
              layout: { duration: 0.2 }
            }}
            className="flex items-start gap-2 p-2 rounded-md hover:bg-[var(--bg-secondary)] transition-colors"
          >
            <div 
              className="w-5 h-5 flex items-center justify-center shrink-0 mt-0.5"
              style={{ color: eventColors[event.type] }}
            >
              {event.icon || <ChatCircle size={14} />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-[var(--text-primary)]">{event.title}</div>
              {event.description && (
                <div className="text-xs text-[var(--text-muted)] mt-0.5">{event.description}</div>
              )}
            </div>
            <div className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] shrink-0">
              {event.isNight ? (
                <Moon size={10} className="text-indigo-400" />
              ) : (
                <Sun size={10} className="text-amber-400" />
              )}
              <span>D{event.day}</span>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// Helper function to create event log items from game events
export function createEventLogItem(
  type: EventLogItem["type"],
  title: string,
  options?: {
    description?: string;
    day?: number;
    isNight?: boolean;
    icon?: React.ReactNode;
  }
): EventLogItem {
  return {
    id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    title,
    description: options?.description,
    timestamp: Date.now(),
    day: options?.day || 1,
    isNight: options?.isNight,
    icon: options?.icon,
  };
}
