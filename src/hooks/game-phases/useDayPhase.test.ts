/* eslint-disable @typescript-eslint/no-explicit-any -- 在离线 VM 中模拟 Hook 宿主，生产 Hook 和队列代码保持原样。 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { AsyncFlowController } from "@/lib/game-flow-controller";
import * as speechRequest from "@/lib/speech-request";
import { withTimeout } from "@/lib/request-timeout";

const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const deferred = () => {
  let resolve!: (value?: any) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<any>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};

function harness(tts = false) {
  const first = { playerId: "a", seat: 0, displayName: "A", alive: true, agentProfile: { modelRef: {} } };
  const second = { ...first, playerId: "b", seat: 1, displayName: "B" };
  let state: any = { gameId: "game", day: 1, phase: "DAY_SPEECH", currentSpeakerSeat: 0, speechRoundStartMessageIndex: 0, messages: [], players: [first, second] };
  const pending: any[] = [];
  const failures: any[] = [];
  const audio: string[] = [];
  const readiness = new Map<string, ReturnType<typeof deferred>>();
  const cleanups: Array<() => void> = [];
  const flow = new AsyncFlowController();
  let serial = 0;
  let organizingTimeout: (() => void) | undefined;
  const scheduleTimeout = (fn: () => void, ms: number) => {
    if (ms === 60000) organizingTimeout = fn;
    return setTimeout(fn, ms);
  };
  const requireMock = (id: string): any => {
    if (id === "react") return {
      useCallback: (fn: any) => fn, useRef: (value: any) => ({ current: value }),
      useState: (value: any) => [value, () => {}],
      useEffect: (fn: any) => { const cleanup = fn(); if (cleanup) cleanups.push(cleanup); },
    };
    if (id === "sonner") return { toast: { error: (_: string, options: any) => failures.push(options) } };
    if (id === "jotai") return { useAtom: () => [state, (next: any) => { state = next; }], useStore: () => ({ get: () => state }) };
    if (id === "next-intl") return { useTranslations: () => (key: string) => key };
    if (id === "@/store/game-machine") return { gameStateAtom: {} };
    if (id === "@/lib/game-master") return {
      getSpeechContextKey: () => "prompt",
      generateAISpeechSegmentsStream: (_state: any, _player: any, options: any) => {
        const waiting = deferred(); pending.push({ ...waiting, options }); return waiting.promise;
      },
    };
    if (id === "@/lib/speech-order") return { getNextSpeechSeat: () => null };
    if (id === "@/lib/game-constants") return { PHASE_CATEGORIES: { SPEECH_PHASES: ["DAY_SPEECH", "DAY_LAST_WORDS", "DAY_PK_SPEECH"] } };
    if (id === "@/lib/audio-manager") return { makeAudioTaskId: () => "audio", audioManager: {
      isEnabled: () => tts, addToQueue: (task: any) => audio.push(task.text),
      ensureReady: (task: any) => { if (!readiness.has(task.text)) readiness.set(task.text, deferred()); return readiness.get(task.text)!.promise; },
    } };
    if (id === "@/lib/voice-constants") return { resolveVoiceId: () => "voice" };
    if (id === "@/i18n/locale-store") return { getLocale: () => "zh" };
    if (id === "@/lib/llm") return { isGameSessionExpiredMessage: () => false };
    if (id === "@/lib/utils") return { generateUUID: () => `request-${++serial}` };
    if (id === "@/lib/speech-request") return speechRequest;
    if (id === "@/lib/request-timeout") return { withTimeout };
    throw new Error(`未配置依赖 ${id}`);
  };
  const load = (file: string) => {
    const source = readFileSync(file, "utf8");
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const loadedModule = { exports: {} as any };
    runInNewContext(`(function(require,module,exports){${code}\n})`, { setTimeout: scheduleTimeout, clearTimeout, AbortController, console })(requireMock, loadedModule, loadedModule.exports);
    return loadedModule.exports;
  };
  const dialogue = load("src/hooks/useDialogueManager.ts").useDialogueManager();
  const day = load("src/hooks/game-phases/useDayPhase.ts").useDayPhase(null, {
    ...dialogue, getToken: () => flow.getToken(), isTokenValid: (token: any) => token.isValid(), setAfterLastWords: () => {},
  });
  return { first, second, pending, failures, audio, readiness, flow, day, dialogue,
    timeout: () => organizingTimeout?.(),
    get state() { return state; }, setState(next: any) { state = next; },
    dispose() { cleanups.forEach((fn) => fn()); readiness.forEach((d) => d.resolve()); pending.forEach((p) => p.resolve([])); },
  };
}

test("A 的迟到流片段与完成事件不能进入 B 的遗言队列", async () => {
  const h = harness();
  try {
    const a = h.day.runAISpeech(h.state, h.first);
    h.setState({ ...h.state, phase: "DAY_LAST_WORDS", currentSpeakerSeat: 1 });
    const b = h.day.runAISpeech(h.state, h.second);
    h.pending[0].options.onSegmentReceived("A 旧发言", 0);
    h.pending[0].resolve(["A 旧发言"]);
    await a;
    assert.equal(h.pending[0].options.signal.aborted, true);
    const queue = h.dialogue.getSpeechQueue();
    assert.equal(queue.player.playerId, "b");
    assert.deepEqual([...queue.segments], []);
    assert.equal(queue.isFinalized, false);
    h.pending[1].options.onSegmentReceived("B 遗言", 0);
    h.pending[1].resolve(["B 遗言"]);
    await b;
    assert.deepEqual([...queue.segments], ["B 遗言"]);
    assert.equal(queue.isFinalized, true);
  } finally { h.dispose(); }
});

test("首段 TTS 延迟时保持字幕顺序、保留重复句，文本就绪后才结束队列", async () => {
  const h = harness(true);
  try {
    const running = h.day.runAISpeech(h.state, h.first);
    const receive = h.pending[0].options.onSegmentReceived;
    receive("不对。", 0); receive("继续听。", 1); receive("不对。", 2); receive("不对。", 2);
    h.pending[0].resolve(["不对。", "继续听。", "不对。"]);
    await tick();
    const queue = h.dialogue.getSpeechQueue();
    assert.deepEqual([...queue.segments], []);
    assert.equal(queue.isFinalized, false);
    h.readiness.get("不对。")!.resolve();
    await running;
    assert.deepEqual([...queue.segments], ["不对。", "继续听。", "不对。"]);
    assert.equal(queue.isFinalized, true);
    await tick(); h.readiness.get("继续听。")!.resolve(); await tick();
    assert.deepEqual(h.audio, ["不对。", "继续听。", "不对。"]);
  } finally { h.dispose(); }
});

test("已等待中的旧 TTS 返回时，不能追加到新角色字幕或音频", async () => {
  const h = harness(true);
  try {
    const a = h.day.runAISpeech(h.state, h.first);
    h.pending[0].options.onSegmentReceived("A 音频", 0);
    h.pending[0].resolve(["A 音频"]);
    await tick();
    h.setState({ ...h.state, phase: "DAY_LAST_WORDS", currentSpeakerSeat: 1 });
    const b = h.day.runAISpeech(h.state, h.second);
    h.readiness.get("A 音频")!.resolve(); await a;
    assert.deepEqual([...h.dialogue.getSpeechQueue().segments], []);
    assert.deepEqual(h.audio, []);
    h.pending[1].resolve([]); await b;
  } finally { h.dispose(); }
});

for (const mutation of ["gameId", "round", "devMutation", "token", "unmount"] as const) {
  test(`相同角色的旧请求在 ${mutation} 变化后失效，不能提交历史`, async () => {
    const h = harness();
    try {
      const running = h.day.runAISpeech(h.state, h.first);
      const request = h.dialogue.getSpeechQueue().request;
      if (mutation === "gameId") h.setState({ ...h.state, gameId: "new-game" });
      if (mutation === "round") h.setState({ ...h.state, speechRoundStartMessageIndex: 20 });
      if (mutation === "devMutation") h.setState({ ...h.state, devMutationId: 1 });
      if (mutation === "token") h.flow.interrupt();
      if (mutation === "unmount") h.dispose();
      h.pending[0].options.onSegmentReceived("失效消息", 0);
      h.pending[0].resolve([]); await running;
      assert.equal(request.isValid(), false);
      assert.deepEqual([...h.dialogue.getSpeechQueue().segments], []);
      assert.equal(h.dialogue.advanceSpeechQueue(), null);
    } finally { h.dispose(); }
  });
}


test("首段已收到但 TTS 尚未就绪时超时，仍给出可推进的兜底段落", async () => {
  const h = harness(true);
  try {
    const running = h.day.runAISpeech(h.state, h.first);
    h.pending[0].options.onSegmentReceived("等待语音的首段", 0);
    await tick();
    h.timeout();
    await running;
    const queue = h.dialogue.getSpeechQueue();
    assert.deepEqual([...queue.segments], ["dayPhase.timeout"]);
    assert.equal(queue.isFinalized, true);
    h.readiness.get("等待语音的首段")!.resolve();
    await tick();
    assert.deepEqual([...queue.segments], ["dayPhase.timeout"]);
    assert.deepEqual(h.audio, []);
  } finally { h.dispose(); }
});


test("发言恢复耗尽后停住推进，错误不作为角色台词，用户重试仍在同一发言轮次", async () => {
  const h = harness();
  try {
    const running = h.day.runAISpeech(h.state, h.first);
    h.pending[0].reject(new Error("公开发言格式恢复失败"));
    await running;
    assert.equal(h.day.isSpeechBlocked(), true);
    assert.deepEqual([...h.dialogue.getSpeechQueue().segments], []);
    assert.equal(h.failures.length, 1);
    h.failures[0].action.onClick();
    assert.equal(h.pending.length, 2);
    assert.equal(h.day.isSpeechBlocked(), false);
    h.pending[1].options.onSegmentReceived("重试后的公开发言", 0);
    h.pending[1].resolve(["重试后的公开发言"]);
    await tick();
    assert.deepEqual([...h.dialogue.getSpeechQueue().segments], ["重试后的公开发言"]);
  } finally { h.dispose(); }
});
