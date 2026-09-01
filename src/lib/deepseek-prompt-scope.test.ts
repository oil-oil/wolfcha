import assert from "node:assert/strict";
import test from "node:test";
import {
  applyDeepSeekPromptScope,
  DEEPSEEK_STABLE_PREFIX_MARKER,
} from "./deepseek-prompt-scope";

test("工具调用不注入 AI 玩家上下文", () => {
  const messages = [{ role: "user", content: "生成九个角色画像" }];
  const result = applyDeepSeekPromptScope(messages, "utility");

  assert.deepEqual(result, messages);
  assert.equal(JSON.stringify(result).includes(DEEPSEEK_STABLE_PREFIX_MARKER), false);
});

test("真实玩法调用才注入稳定玩家上下文", () => {
  const result = applyDeepSeekPromptScope(
    [
      { role: "system", content: "你是 4 号玩家。" },
      { role: "user", content: "请发言。" },
    ],
    "gameplay",
  ) as Array<{ role: string; content: string }>;

  assert.match(result[0].content, new RegExp(DEEPSEEK_STABLE_PREFIX_MARKER));
  assert.match(result[0].content, /你是 4 号玩家/);
  assert.equal(result.length, 2);
});

test("重复处理玩法消息不会重复注入前缀", () => {
  const once = applyDeepSeekPromptScope(
    [{ role: "system", content: "你是 4 号玩家。" }],
    "gameplay",
  );
  const twice = applyDeepSeekPromptScope(once, "gameplay");

  const content = String((twice[0] as { content?: unknown }).content ?? "");
  assert.equal(content.split(DEEPSEEK_STABLE_PREFIX_MARKER).length - 1, 1);
});
