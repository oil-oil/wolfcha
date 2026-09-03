import assert from "node:assert/strict";
import { test } from "node:test";

// 纯函数导入（不触发 localStorage 访问路径）
import {
  joinProviderUrl,
  normalizeBaseUrl,
} from "./custom-providers";

test("joinProviderUrl 保留调用方给的完整 API 根路径", () => {
  assert.equal(
    joinProviderUrl("https://api.deepseek.com/v1", "chat/completions"),
    "https://api.deepseek.com/v1/chat/completions",
  );
  assert.equal(
    joinProviderUrl("https://open.bigmodel.cn/api/paas/v4", "chat/completions"),
    "https://open.bigmodel.cn/api/paas/v4/chat/completions",
  );
});

test("joinProviderUrl 对裸域名自动补 /v1", () => {
  assert.equal(
    joinProviderUrl("https://api.example.com", "chat/completions"),
    "https://api.example.com/v1/chat/completions",
  );
  assert.equal(
    joinProviderUrl("https://api.example.com/", "models"),
    "https://api.example.com/v1/models",
  );
});

test("joinProviderUrl 去掉末尾斜杠且不重复拼接路径分隔符", () => {
  assert.equal(
    joinProviderUrl("https://api.example.com/v1/", "audio/speech"),
    "https://api.example.com/v1/audio/speech",
  );
});

test("joinProviderUrl 拒绝空地址和非 http(s) 协议", () => {
  assert.equal(joinProviderUrl("", "chat/completions"), null);
  assert.equal(joinProviderUrl("   ", "chat/completions"), null);
  assert.equal(joinProviderUrl("ftp://files.example.com", "chat/completions"), null);
  assert.equal(joinProviderUrl("not a url", "chat/completions"), null);
});

test("normalizeBaseUrl 去除首尾空白与末尾斜杠", () => {
  assert.equal(normalizeBaseUrl("  https://api.example.com/v1/  "), "https://api.example.com/v1");
  assert.equal(normalizeBaseUrl("https://api.example.com"), "https://api.example.com");
});
