import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const chatRouteSource = readFileSync("src/app/api/chat/route.ts", "utf8");

test("聊天流函数时长覆盖完整角色生成的真实长输出", () => {
  const match = chatRouteSource.match(/export const maxDuration\s*=\s*(\d+)/);
  assert.ok(match, "聊天 Route 必须显式声明 Vercel maxDuration");
  assert.ok(Number(match[1]) >= 300, "maxDuration 至少应为 300 秒，避免 60 秒截断流式 JSON");
});
