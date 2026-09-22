import {
  getMinimaxApiKey,
  getMinimaxGroupId,
  getModelSource,
  getTokendanceApiKey,
  getTokendanceBaseUrl,
  hasMinimaxKey,
  hasTokendanceKey,
  resolveAiVoiceAvailability,
} from "@/lib/api-keys";
import { getAuthHeaders } from "@/lib/auth-headers";
import { gameSessionTracker } from "@/lib/game-session-tracker";

export type TtsProvider = "minimax" | "tokendance";

export interface AudioTask {
  id: string;
  playbackId?: string;
  isValid?: () => boolean;
  text: string;
  voiceId: string;
  playerId: string;
  ttsProvider?: TtsProvider;
}

export function makeAudioTaskId(voiceId: string, text: string, ttsProvider: TtsProvider = "minimax") {
  return `${ttsProvider}::${voiceId}::${text}`;
}

type PlayState = "idle" | "playing" | "loading";

export class AudioManager {
  private queue: AudioTask[] = [];
  private currentTask: AudioTask | null = null;
  private currentAudio: HTMLAudioElement | null = null;
  private state: PlayState = "idle";
  private cache = new Map<string, { blob: Blob; durationMs?: number }>();
  private inFlight = new Map<string, Promise<void>>();
  private enabled = false;

  private onPlayStart: ((playerId: string) => void) | null = null;
  private onPlayEnd: ((playerId: string) => void) | null = null;

  private async buildTtsHeaders(provider: TtsProvider): Promise<Record<string, string>> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    Object.assign(headers, await getAuthHeaders());
    const sessionId = gameSessionTracker.getSessionId();
    if (sessionId) headers["X-Game-Session-Id"] = sessionId;

    if (provider === "tokendance" && getModelSource() === "custom" && hasTokendanceKey()) {
      headers["X-Tokendance-Api-Key"] = getTokendanceApiKey();
      headers["X-Tokendance-Base-Url"] = getTokendanceBaseUrl();
    }

    // Project and TokenPay credentials stay on the server. User-supplied
    // credentials are sent only while custom keys are the active source.
    if (provider === "minimax" && getModelSource() === "custom" && hasMinimaxKey()) {
      headers["X-Minimax-Api-Key"] = getMinimaxApiKey();
      headers["X-Minimax-Group-Id"] = getMinimaxGroupId();
    }
    return headers;
  }

  setCallbacks(
    onPlayStart: (playerId: string) => void,
    onPlayEnd: (playerId: string) => void,
  ) {
    this.onPlayStart = onPlayStart;
    this.onPlayEnd = onPlayEnd;
  }

  getCachedDurationMs(taskId: string): number | undefined {
    return this.cache.get(taskId)?.durationMs;
  }

  isCached(taskId: string): boolean {
    return this.cache.has(taskId);
  }

  setEnabled(value: boolean) {
    if (this.enabled === value) return;
    this.enabled = value;
    if (!value) this.clearQueue();
    else this.processQueue();
  }

  isEnabled(): boolean {
    return this.enabled && resolveAiVoiceAvailability(
      getModelSource(),
      hasMinimaxKey(),
      hasTokendanceKey(),
    );
  }

  async ensureReady(task: AudioTask): Promise<void> {
    if (!this.isEnabled()) return;
    if (this.cache.has(task.id)) return;

    const existing = this.inFlight.get(task.id);
    if (existing) return existing;
    const promise = this.fetchAndCache(task).finally(() => this.inFlight.delete(task.id));
    this.inFlight.set(task.id, promise);
    return promise;
  }

  async prefetchTasks(tasks: AudioTask[], options?: { concurrency?: number }) {
    if (!this.isEnabled()) return;
    const concurrency = Math.max(1, options?.concurrency ?? 3);
    const pending = [...tasks];
    const workers = Array.from({ length: concurrency }, async () => {
      while (pending.length > 0) {
        const task = pending.shift();
        if (!task) return;
        await this.ensureReady(task);
      }
    });
    await Promise.all(workers);
  }

  private async fetchAndCache(task: AudioTask) {
    const ttsProvider = task.ttsProvider ?? "minimax";
    const response = await fetch("/api/tts", {
      method: "POST",
      headers: await this.buildTtsHeaders(ttsProvider),
      body: JSON.stringify({ text: task.text, voiceId: task.voiceId, ttsProvider }),
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
      const audio = new Audio();
      audio.preload = "metadata";
      const cleanup = () => {
        audio.onloadedmetadata = null;
        audio.onerror = null;
      };
      audio.onloadedmetadata = () => {
        const seconds = Number.isFinite(audio.duration) ? audio.duration : 0;
        cleanup();
        resolve(Math.max(0, Math.round(seconds * 1000)));
      };
      audio.onerror = () => {
        cleanup();
        resolve(0);
      };
      audio.src = objectUrl;
    });
  }

  addToQueue(task: AudioTask) {
    if (!this.isEnabled() || task.isValid?.() === false) return;
    const playbackId = task.playbackId ?? task.id;
    if (this.queue.some((item) => (item.playbackId ?? item.id) === playbackId)
      || (this.currentTask && (this.currentTask.playbackId ?? this.currentTask.id) === playbackId)) {
      return;
    }
    this.queue.push(task);
    this.processQueue();
  }

  stopCurrent() {
    if (this.currentAudio) {
      const url = this.currentAudio.src;
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      if (typeof url === "string" && url.startsWith("blob:")) URL.revokeObjectURL(url);
      this.currentAudio = null;
    }
    if (this.currentTask) {
      this.onPlayEnd?.(this.currentTask.playerId);
      this.currentTask = null;
    }
    this.state = "idle";
    this.processQueue();
  }

  clearQueue() {
    this.queue = [];
    this.stopCurrent();
  }

  clearCache() {
    this.cache.clear();
  }

  private async playCachedTask(task: AudioTask) {
    const cached = this.cache.get(task.id);
    if (!cached?.blob || this.currentTask !== task) throw new Error("TTS cache miss before playback");

    const url = URL.createObjectURL(cached.blob);
    const audio = new Audio(url);
    this.currentAudio = audio;
    audio.onloadedmetadata = () => {
      const existing = this.cache.get(task.id);
      if (!existing || (existing.durationMs ?? 0) > 0) return;
      const seconds = Number.isFinite(audio.duration) ? audio.duration : 0;
      if (seconds > 0) this.cache.set(task.id, { ...existing, durationMs: Math.round(seconds * 1000) });
    };
    audio.onended = () => this.onAudioEnded(task, url);
    audio.onerror = (event) => {
      console.error("Audio playback error:", event);
      this.onAudioEnded(task, url);
    };

    const startPlayback = async () => {
      if (this.currentTask !== task || task.isValid?.() === false) {
        this.onAudioEnded(task, url);
        return;
      }
      this.state = "playing";
      this.onPlayStart?.(task.playerId);
      await audio.play();
    };

    try {
      await startPlayback();
    } catch (error: unknown) {
      const errorLike = typeof error === "object" && error !== null
        ? error as { name?: unknown; message?: unknown }
        : null;
      const name = typeof errorLike?.name === "string" ? errorLike.name : "";
      const message = typeof errorLike?.message === "string" ? errorLike.message : String(error || "");
      const blocked = name === "NotAllowedError" || message.includes("user gesture") || message.includes("not allowed");
      if (!blocked) throw error;
      this.state = "idle";
      const resume = () => {
        window.removeEventListener("pointerdown", resume);
        window.removeEventListener("keydown", resume);
        if (this.currentTask !== task) return;
        void startPlayback().catch((resumeError) => {
          console.error("Audio resume error:", resumeError);
          this.onAudioEnded(task, url);
        });
      };
      window.addEventListener("pointerdown", resume);
      window.addEventListener("keydown", resume);
    }
  }

  private async processQueue() {
    if (!this.isEnabled() || this.state !== "idle") return;
    let task = this.queue.shift();
    while (task && task.isValid?.() === false) task = this.queue.shift();
    if (!task) return;

    this.currentTask = task;
    this.state = "loading";
    try {
      await this.ensureReady(task);
      await this.playCachedTask(task);
    } catch (error) {
      console.error("AudioManager error:", error);
      if (this.currentTask === task) {
        this.state = "idle";
        this.currentTask = null;
        this.processQueue();
      }
    }
  }

  private onAudioEnded(task: AudioTask, url: string) {
    URL.revokeObjectURL(url);
    if (this.currentTask !== task) return;
    this.onPlayEnd?.(task.playerId);
    this.currentTask = null;
    this.currentAudio = null;
    this.state = "idle";
    this.processQueue();
  }
}

export const audioManager = new AudioManager();
