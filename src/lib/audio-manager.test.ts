import assert from "node:assert/strict";
import test from "node:test";
import type { AudioTask } from "./audio-manager";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||= "audio-test-key";
const tick = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

async function setup() {
  const { AudioManager } = await import("./audio-manager");
  const manager = new AudioManager();
  manager.isEnabled = () => true;
  const internal = manager as unknown as { cache: Map<string, { blob: Blob }>; currentTask: AudioTask | null };
  const audios: FakeAudio[] = [];
  class FakeAudio {
    onended?: () => void;
    currentTime = 0;
    async play() { audios.push(this); }
    pause() {}
  }
  const originalAudio = globalThis.Audio;
  globalThis.Audio = FakeAudio as unknown as typeof Audio;
  const task = (id: string, playbackId: string): AudioTask => {
    internal.cache.set(id, { blob: new Blob([id]) });
    return { id, playbackId, text: id, voiceId: "voice", playerId: "player" };
  };
  return { manager, audios, task, internal, restore: () => { manager.clearQueue(); globalThis.Audio = originalAudio; } };
}

test("缓存相同语音但按段落分别播放，重放同一段落只入队一次", async () => {
  const h = await setup();
  try {
    h.manager.addToQueue(h.task("不对", "r:0"));
    h.manager.addToQueue(h.task("不对", "r:1"));
    h.manager.addToQueue(h.task("不对", "r:1"));
    await tick();
    assert.equal(h.audios.length, 1);
    h.audios[0].onended?.(); await tick();
    assert.equal(h.audios.length, 2);
    h.audios[1].onended?.(); await tick();
    assert.equal(h.audios.length, 2);
  } finally { h.restore(); }
});

test("清队列不会先启动下一条旧语音，失效任务不播放", async () => {
  const h = await setup();
  try {
    h.manager.addToQueue(h.task("当前", "a:0"));
    h.manager.addToQueue(h.task("旧队列", "a:1"));
    await tick();
    h.manager.clearQueue(); await tick();
    h.manager.addToQueue({ ...h.task("过期", "b:0"), isValid: () => false });
    await tick();
    assert.equal(h.audios.length, 1);
  } finally { h.restore(); }
});

test("旧 TTS 加载失败不能清掉已开始的新语音任务", async () => {
  const h = await setup();
  let rejectOld!: (error: Error) => void;
  h.manager.ensureReady = (task) => task.id === "旧加载"
    ? new Promise<void>((_, reject) => { rejectOld = reject; }) : Promise.resolve();
  try {
    h.manager.addToQueue(h.task("旧加载", "a:0"));
    h.manager.clearQueue();
    h.manager.addToQueue(h.task("新语音", "b:0"));
    await tick();
    rejectOld(new Error("旧 TTS 失败")); await tick();
    assert.equal(h.internal.currentTask?.playbackId, "b:0");
    assert.equal(h.audios.length, 1);
  } finally { h.restore(); }
});
