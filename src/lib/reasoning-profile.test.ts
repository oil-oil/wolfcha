import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ALL_MODELS, PLAYER_MODELS } from "@/types/game";
import {
  buildTokendanceThinking,
  normalizeReasoningProfile,
  resolveReasoning,
} from "./reasoning-profile";

test("内置玩家模型只在决策调用上开启低档思考，发言保持关闭", () => {
  const builtin = PLAYER_MODELS[0];
  assert.deepEqual(resolveReasoning(builtin, undefined, undefined), { enabled: false });
  assert.deepEqual(resolveReasoning(builtin, undefined, "decision"), { enabled: true, effort: "low" });
});

test("请求方不能自行指定思考量，未配置决策思考的模型沿用原配置", () => {
  const requested = { enabled: true, effort: "high" as const };
  const builtin = PLAYER_MODELS[0];
  assert.deepEqual(resolveReasoning(builtin, requested, undefined), { enabled: false });
  assert.deepEqual(resolveReasoning(builtin, requested, "decision"), { enabled: true, effort: "low" });

  const withoutDecision = ALL_MODELS.find((ref) => ref.reasoning && !ref.decisionReasoning);
  assert.ok(withoutDecision);
  assert.deepEqual(resolveReasoning(withoutDecision, requested, "decision"), withoutDecision.reasoning);
  assert.equal(normalizeReasoningProfile("speech"), undefined);
  assert.equal(normalizeReasoningProfile("decision"), "decision");
});

test("TokenDance 的档位通过 reasoning_effort 传递，不再换算成不生效的 budget_tokens", () => {
  assert.deepEqual(buildTokendanceThinking(undefined), {});
  assert.deepEqual(buildTokendanceThinking({ enabled: false }), { thinking: { type: "disabled" } });
  assert.deepEqual(buildTokendanceThinking({ enabled: true, effort: "low" }), {
    thinking: { type: "enabled" },
    reasoning_effort: "low",
  });
  assert.deepEqual(buildTokendanceThinking({ enabled: true, max_tokens: 800 }), {
    thinking: { type: "enabled", budget_tokens: 800 },
  });
});

test("普通与批量 TokenDance 请求共用同一套思考配置和超时入口", () => {
  const source = readFileSync("src/app/api/chat/route.ts", "utf8");
  assert.equal(source.match(/resolveReasoning\(modelRefOverride, reasoning, reasoningProfile\)/g)?.length, 2);
  assert.equal(source.match(/buildTokendanceThinking\(effectiveReasoning\)/g)?.length, 2);
  assert.equal(source.match(/controller\.abort\(\), providerTimeoutMs\)/g)?.length, 2);
  assert.doesNotMatch(source, /effortBudget/);
});
