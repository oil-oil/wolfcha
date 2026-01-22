/**
 * AI 调用日志系统
 * 记录所有 AI 调用用于复盘
 */

import type { LLMMessage } from "./llm";
import { generateUUID } from "./utils";

export interface AILogEntry {
  id: string;
  timestamp: number;
  type: "speech" | "vote" | "badge_vote" | "badge_transfer" | "seer_action" | "wolf_action" | "guard_action" | "witch_action" | "hunter_shoot" | "character_generation" | "daily_summary" | "wolf_chat";
  request: {
    model: string;
    messages: LLMMessage[];
    temperature?: number;
    player?: {
      playerId: string;
      displayName: string;
      seat: number;
      role: string;
    };
  };
  response: {
    content: string;
    duration: number;
    raw?: string; // Original raw response content before processing
    rawResponse?: string; // Full API response object as JSON string
    finishReason?: string; // finish_reason from API response
    parsed?: unknown; // Parsed/structured result
  };
  error?: string;
}

class AILogger {
  private shouldPrint(): boolean {
    return process.env.NODE_ENV !== "production";
  }

  async log(entry: Omit<AILogEntry, "id" | "timestamp">) {
    const fullEntry: AILogEntry = {
      ...entry,
      id: generateUUID(),
      timestamp: Date.now(),
    };

    this.printToConsole(fullEntry);
    await this.saveToServer(fullEntry);

    return fullEntry;
  }

  private async saveToServer(entry: AILogEntry) {
    try {
      await fetch("/api/ai-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      });
    } catch (e) {
      if (this.shouldPrint()) {
        console.error("Failed to save AI log to server:", e);
      }
    }
  }

  private printToConsole(entry: AILogEntry) {
    if (!this.shouldPrint()) return;

    const typeColors: Record<string, string> = {
      speech: "#4CAF50",
      vote: "#2196F3",
      badge_vote: "#B8860B",
      badge_transfer: "#DAA520",
      seer_action: "#9C27B0",
      wolf_action: "#f44336",
      wolf_chat: "#8D6E63",
      guard_action: "#00BCD4",
      witch_action: "#E91E63",
      hunter_shoot: "#FF5722",
      character_generation: "#FF9800",
      daily_summary: "#795548",
    };

    const color = typeColors[entry.type] || "#666";
    
    console.groupCollapsed(
      `%c[AI] ${entry.type.toUpperCase()}`,
      `color: ${color}; font-weight: bold;`,
      entry.request.player?.displayName || "System",
      `(${entry.response.duration}ms)`
    );
    
    console.log("Model:", entry.request.model);
    console.log("Messages:", entry.request.messages);
    console.log("Response:", entry.response.content);
    if (entry.response.raw && entry.response.raw !== entry.response.content) {
      console.log("Raw Response:", entry.response.raw);
    }
    if (entry.response.parsed) {
      console.log("Parsed Result:", entry.response.parsed);
    }
    console.log("Duration:", `${entry.response.duration}ms`);
    if (entry.error) {
      console.error("Error:", entry.error);
    }
    console.groupEnd();
  }

  async getLogs(): Promise<AILogEntry[]> {
    try {
      const res = await fetch("/api/ai-log");
      const data = await res.json();
      return data.logs || [];
    } catch (e) {
      if (this.shouldPrint()) {
        console.error("Failed to get AI logs:", e);
      }
      return [];
    }
  }

  async clearLogs() {
    try {
      await fetch("/api/ai-log", { method: "DELETE" });
    } catch (e) {
      if (this.shouldPrint()) {
        console.error("Failed to clear AI logs:", e);
      }
    }
  }
}

export const aiLogger = new AILogger();
