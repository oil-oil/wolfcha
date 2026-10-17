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

test("缓冲 TTS 仅使用自有语音 Key，并按已配置的 Key 选择服务商", async () => {
  const h = await setup();
  const { makeAudioTaskId } = await import("./audio-manager");
  const originalFetch = globalThis.fetch;
  const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map<string, string>();
  const fakeWindow = new EventTarget() as EventTarget & { localStorage: Storage };
  Object.defineProperty(fakeWindow, "localStorage", {
    configurable: true,
    value: {
      get length() { return values.size; },
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => [...values.keys()][index] ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    } satisfies Storage,
  });
  Object.defineProperty(globalThis, "window", { configurable: true, value: fakeWindow });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: fakeWindow.localStorage,
  });

  const requests: Array<{ url: string; body?: string; headers: Headers }> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url === "/api/demo-config") return Response.json({ active: false });
    requests.push({ url, body: typeof init?.body === "string" ? init.body : undefined, headers: new Headers(init?.headers) });
    return new Response(new Uint8Array([1, 2, 3]));
  };

  const internals = h.manager as unknown as {
    fetchAndCache: (task: AudioTask) => Promise<void>;
    getDurationMs: (url: string) => Promise<number>;
  };
  internals.getDurationMs = async () => 0;

  try {
    assert.equal(makeAudioTaskId("voice", "台词", "tokendance"), "tokendance::voice::台词");
    assert.equal(makeAudioTaskId("voice", "台词"), "minimax::voice::台词");

    const task: AudioTask = {
      id: "custom-default",
      text: "请投 3 号",
      voiceId: "male-qn-jingying",
      playerId: "player",
    };
    await assert.rejects(internals.fetchAndCache(task), /requires your own/);
    assert.equal(requests.length, 0);

    values.set("wolfcha_model_source", "custom");
    values.set("wolfcha_model_source_explicit_v1", "true");
    values.set("wolfcha_tokendance_api_key", "user-tokendance-key");
    await internals.fetchAndCache(task);
    await internals.fetchAndCache({
      id: "tokendance-explicit",
      text: "我选择 5 号",
      voiceId: "male-qn-jingying",
      playerId: "player",
      ttsProvider: "minimax", // 没有 MiniMax Key 时使用已有的 TokenDance Key。
    });

    assert.equal(requests.length, 2);
    assert.equal(requests[0].url, "/api/tts");
    assert.deepEqual(JSON.parse(requests[0].body ?? "{}"), {
      text: "请投 3 号",
      voiceId: "male-qn-jingying",
      ttsProvider: "tokendance",
    });
    assert.equal(requests[0].headers.get("X-Tokendance-Api-Key"), "user-tokendance-key");
    assert.equal(JSON.parse(requests[1].body ?? "{}").ttsProvider, "tokendance");

    values.delete("wolfcha_tokendance_api_key");
    values.set("wolfcha_minimax_api_key", "user-minimax-key");
    values.set("wolfcha_minimax_group_id", "user-group");
    await internals.fetchAndCache({ ...task, id: "minimax-key", ttsProvider: "tokendance" });
    assert.equal(JSON.parse(requests[2].body ?? "{}").ttsProvider, "minimax");
    assert.equal(requests[2].headers.get("X-Minimax-Api-Key"), "user-minimax-key");
    assert.equal(requests[2].headers.get("X-Minimax-Group-Id"), "user-group");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindowDescriptor) {
      Object.defineProperty(globalThis, "window", originalWindowDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
    if (originalLocalStorageDescriptor) {
      Object.defineProperty(globalThis, "localStorage", originalLocalStorageDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, "localStorage");
    }
    h.restore();
  }
});
