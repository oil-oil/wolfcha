import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(join(process.cwd(), "src/app/api/game-sessions/route.ts"), "utf8");
const createBlock = source.slice(
  source.indexOf('if (payload.action === "create")'),
  source.indexOf('if (payload.action === "update")'),
);
const updateBlock = source.slice(source.indexOf('if (payload.action === "update")'));

test("游戏会话更新写入生命周期和起止时间，不接收客户端 AI 统计", () => {
  assert.match(updateBlock, /lifecycle_status: payload\.lifecycleStatus/);
  assert.match(createBlock, /started_at: nowIso/);
  assert.match(updateBlock, /ended_at: isTerminal \? nowIso : null/);
  assert.match(updateBlock, /canTransitionLifecycle/);
  assert.match(updateBlock, /\.eq\("lifecycle_status", currentStatus\)/);
  assert.match(updateBlock, /Game session changed concurrently/);
  assert.doesNotMatch(source, /recordGameSessionEvent/);
  for (const field of [
    "aiCallsCount",
    "aiInputChars",
    "aiOutputChars",
    "aiPromptTokens",
    "aiCompletionTokens",
  ]) {
    assert.doesNotMatch(updateBlock, new RegExp(`\\b${field}\\b`));
  }
});
