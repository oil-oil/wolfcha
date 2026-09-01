import assert from "node:assert/strict";
import test from "node:test";
import type { PrefetchedSpeech } from "./useDialogueManager";
import { isPrefetchCompatible } from "./useDialogueManager";

const prefetch: PrefetchedSpeech = {
  playerId: "p3",
  phase: "DAY_BADGE_SPEECH",
  day: 1,
  messageCount: 2,
  segments: ["发言"],
  isComplete: true,
  createdAt: 1,
};

test("只有上下文消息数完全一致时才复用 AI 预取发言", () => {
  assert.equal(
    isPrefetchCompatible(prefetch, {
      playerId: "p3",
      phase: "DAY_BADGE_SPEECH",
      day: 1,
      messageCount: 2,
    }),
    true
  );

  assert.equal(
    isPrefetchCompatible(prefetch, {
      playerId: "p3",
      phase: "DAY_BADGE_SPEECH",
      day: 1,
      messageCount: 3,
    }),
    false
  );
});
