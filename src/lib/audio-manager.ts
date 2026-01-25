import { getMinimaxApiKey, getMinimaxGroupId, hasMinimaxKey, isCustomKeyEnabled } from "@/lib/api-keys";

export interface AudioTask {
  id: string; // unique message id
  text: string;
  voiceId: string;
  playerId: string;
}

export function makeAudioTaskId(voiceId: string, text: string) {
  return `${voiceId}::${text}`;
}

type PlayState = "idle" | "playing" | "loading";

class AudioManager {
  private queue: AudioTask[] = [];
  private currentTask: AudioTask | null = null;
  private currentAudio: HTMLAudioElement | null = null;
  private state: PlayState = "idle";
  private cache = new Map<string, { blob: Blob; durationMs?: number }>();
  private enabled = isCustomKeyEnabled() && hasMinimaxKey();
  
  // Callbacks
  private onPlayStart: ((playerId: string) => void) | null = null;
  private onPlayEnd: ((playerId: string) => void) | null = null;

  constructor() {
    // binding if needed
  }

  private buildTtsHeaders(): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (!isCustomKeyEnabled()) return headers;
    const apiKey = getMinimaxApiKey();
    const groupId = getMinimaxGroupId();
    if (apiKey) headers["X-Minimax-Api-Key"] = apiKey;
    if (groupId) headers["X-Minimax-Group-Id"] = groupId;
    return headers;
  }

  setCallbacks(
    onPlayStart: (playerId: string) => void,
    onPlayEnd: (playerId: string) => void
  ) {
    this.onPlayStart = onPlayStart;
    this.onPlayEnd = onPlayEnd;
  }

  getCachedDurationMs(taskId: string): number | undefined {
    return this.cache.get(taskId)?.durationMs;
  }

  setEnabled(value: boolean) {
    if (this.enabled === value) return;
    this.enabled = value;
    if (!value) {
      this.clearQueue();
    } else {
      this.processQueue();
    }
  }

  async prefetchTasks(tasks: AudioTask[], options?: { concurrency?: number }) {
    if (!this.enabled) return;
    const concurrency = Math.max(1, options?.concurrency ?? 3);
    const queue = [...tasks];
    const workers = Array.from({ length: concurrency }, async () => {
      while (queue.length > 0) {
        const t = queue.shift();
        if (!t) return;
        await this.prefetchTask(t);
      }
    });
    await Promise.all(workers);
  }

  private async prefetchTask(task: AudioTask) {
    if (this.cache.has(task.id)) return;
    if (!isCustomKeyEnabled() || !hasMinimaxKey()) {
      this.setEnabled(false);
      return;
    }

    const response = await fetch("/api/tts", {
      method: "POST",
      headers: this.buildTtsHeaders(),
      body: JSON.stringify({ text: task.text, voiceId: task.voiceId }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`TTS request failed: ${response.status} ${body.slice(0, 600)}`);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    try {
      const durationMs = await this.getDurationMs(url);
      this.cache.set(task.id, { blob, durationMs });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  private async getDurationMs(objectUrl: string): Promise<number> {
    return await new Promise((resolve) => {
      const a = new Audio();
      a.preload = "metadata";

      const cleanup = () => {
        a.onloadedmetadata = null;
        a.onerror = null;
      };

      a.onloadedmetadata = () => {
        const sec = Number.isFinite(a.duration) ? a.duration : 0;
        cleanup();
        resolve(Math.max(0, Math.round(sec * 1000)));
      };
      a.onerror = () => {
        cleanup();
        resolve(0);
      };

      a.src = objectUrl;
    });
  }

  // 添加任务到队列
  addToQueue(task: AudioTask) {
    if (!this.enabled) return;
    // 简单的去重：如果队列里已经有这个ID，就不加了
    if (this.queue.some(t => t.id === task.id) || this.currentTask?.id === task.id) {
      return;
    }
    this.queue.push(task);
    this.processQueue();
  }

  // 立即停止当前播放（用于跳过/截断）
  stopCurrent() {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }
    if (this.currentTask) {
      this.onPlayEnd?.(this.currentTask.playerId);
      this.currentTask = null;
    }
    this.state = "idle";
    // 停止后尝试播放下一个
    this.processQueue();
  }

  // 清空整个队列（用于重置/新的一天）
  clearQueue() {
    this.stopCurrent();
    this.queue = [];
  }

  clearCache() {
    this.cache.clear();
  }

  private async processQueue() {
    if (!this.enabled) return;
    if (this.state !== "idle") return;
    if (this.queue.length === 0) return;
    if (!isCustomKeyEnabled() || !hasMinimaxKey()) {
      this.setEnabled(false);
      return;
    }

    const task = this.queue.shift();
    if (!task) return;

    this.currentTask = task;
    this.state = "loading";

    try {
      let blob = this.cache.get(task.id)?.blob;
      if (!blob) {
        // 1. 请求音频
        const response = await fetch("/api/tts", {
          method: "POST",
          headers: this.buildTtsHeaders(),
          body: JSON.stringify({
            text: task.text,
            voiceId: task.voiceId,
          }),
        });

        if (!response.ok) {
          const body = await response.text().catch(() => "");
          throw new Error(`TTS request failed: ${response.status} ${body.slice(0, 600)}`);
        }

        blob = await response.blob();
        this.cache.set(task.id, { blob });
      }

      const url = URL.createObjectURL(blob);

      // 检查此时是否已经被切歌了（例如在加载过程中用户按了跳过）
      if (this.currentTask !== task) {
        URL.revokeObjectURL(url);
        return;
      }

      // 2. 播放音频
      const audio = new Audio(url);
      this.currentAudio = audio;

      audio.onloadedmetadata = () => {
        const existing = this.cache.get(task.id);
        if (!existing) return;
        if (typeof existing.durationMs === "number" && existing.durationMs > 0) return;
        const sec = Number.isFinite(audio.duration) ? audio.duration : 0;
        if (sec > 0) {
          this.cache.set(task.id, { ...existing, durationMs: Math.round(sec * 1000) });
        }
      };
      
      audio.onended = () => {
        this.onAudioEnded(task, url);
      };

      audio.onerror = (e) => {
        console.error("Audio playback error:", e);
        this.onAudioEnded(task, url);
      };

      const startPlayback = async () => {
        this.state = "playing";
        this.onPlayStart?.(task.playerId);
        await audio.play();
      };

      try {
        await startPlayback();
      } catch (e: any) {
        const name = e?.name || "";
        const msg = String(e?.message || e || "");
        const isBlocked = name === "NotAllowedError" || msg.includes("user gesture") || msg.includes("not allowed");
        if (!isBlocked) throw e;

        this.state = "idle";
        const resume = () => {
          window.removeEventListener("pointerdown", resume);
          window.removeEventListener("keydown", resume);
          if (this.currentTask !== task) return;
          void startPlayback().catch((err) => {
            console.error("Audio resume error:", err);
            this.onAudioEnded(task, url);
          });
        };
        window.addEventListener("pointerdown", resume);
        window.addEventListener("keydown", resume);
      }

    } catch (error) {
      console.error("AudioManager error:", error);
      // 发生错误，结束当前任务，继续下一个
      this.state = "idle";
      this.currentTask = null;
      this.processQueue();
    }
  }

  private onAudioEnded(task: AudioTask, url: string) {
    URL.revokeObjectURL(url);
    if (this.currentTask === task) {
      this.onPlayEnd?.(task.playerId);
      this.currentTask = null;
      this.currentAudio = null;
      this.state = "idle";
      this.processQueue();
    }
  }
}

// Singleton instance
export const audioManager = new AudioManager();
