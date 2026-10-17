import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { NextRequest, NextResponse } from "next/server";
import ts from "typescript";

const nodeRequire = createRequire(import.meta.url);

// Run the actual handlers with only authentication and upstream I/O replaced.
// Server keys remain configured to catch accidental billing fallbacks.
function loadRoute(provider = "tokendance", authenticated = true) {
  const calls: Array<{ url: string; headers: Headers }> = [];
  const path = "src/app/api/tts/route.ts";
  const code = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const loaded = { exports: {} as { POST: (request: NextRequest) => Promise<Response> } };
  const requireMock = (id: string): unknown => {
    if (id === "next/server") return { NextResponse };
    if (id === "@/lib/api-auth") return {
      authenticateRequest: async () => authenticated
        ? { user: { id: "test-user" } }
        : { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) },
    };
    if (id === "@/lib/voice-constants") return {
      DEFAULT_VOICE_ID: { male: "male-voice", female: "female-voice" },
    };
    if (id === "node:https") return {
      request: (options: { hostname: string; path: string; headers: Record<string, string> }, onResponse: (response: EventEmitter) => void) => {
        calls.push({ url: `https://${options.hostname}${options.path}`, headers: new Headers(options.headers) });
        return Object.assign(new EventEmitter(), {
          setTimeout() {}, write() {},
          end() {
            const response = Object.assign(new EventEmitter(), { statusCode: 200, headers: { "content-type": "application/json" } });
            onResponse(response);
            response.emit("data", Buffer.from(JSON.stringify({
              base_resp: { status_code: 0 }, data: { audio: Buffer.from("ID3test-audio").toString("hex") },
            })));
            response.emit("end");
          },
        });
      },
    };
    if (id.startsWith("node:")) return nodeRequire(id);
    throw new Error(`Unexpected dependency: ${id}`);
  };
  const upstreamFetch: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), headers: new Headers(init?.headers) });
    return Response.json({ base_resp: { status_code: 0 }, data: { audio: Buffer.from("ID3test-audio").toString("hex") } });
  };
  runInNewContext(`(function(require,module,exports){${code}\n})`, {
    Buffer, Uint8Array, ArrayBuffer, AbortSignal, ReadableStream, Response,
    setTimeout, clearTimeout, console, fetch: upstreamFetch,
    process: { env: {
      TOKENDANCE_API_KEY: "platform-tokendance-key",
      MINIMAX_API_KEY: "platform-minimax-key",
      MINIMAX_GROUP_ID: "platform-group",
    } },
  })(requireMock, loaded, loaded.exports);
  const request = (headers: Record<string, string> = {}, body: Record<string, unknown> = {}) => loaded.exports.POST(
    new NextRequest("http://localhost/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Game-Session-Id": "paid-game", ...headers },
      body: JSON.stringify({ text: "请投 3 号", voiceId: "voice", ttsProvider: provider, ...body }),
    }),
  );
  return { request, calls };
}

test("所有语音服务商均拒绝无自有 Key 的请求，即使平台已配置 Key 且请求携带对局 ID", async () => {
  for (const provider of ["tokendance", "minimax"]) {
    const h = loadRoute(provider);
    for (const body of [{ ttsProvider: undefined }, { ttsProvider: provider }]) {
      const response = await h.request({}, body);
      assert.equal(response.status, 403);
      assert.equal((await response.json()).code, "tts_custom_key_required");
    }
    assert.equal(h.calls.length, 0);
  }
});

test("不匹配、空白和不完整的自有凭据不会触发平台 Key 回退", async () => {
  for (const [provider, headers, status] of [
    ["tokendance", { "X-Minimax-Api-Key": "user-key", "X-Minimax-Group-Id": "group" }, 403],
    ["tokendance", { "X-Tokendance-Api-Key": "   " }, 403],
    ["minimax", { "X-Minimax-Api-Key": "user-key" }, 400],
    ["minimax", { "X-Minimax-Group-Id": "group" }, 400],
  ] as const) {
    const h = loadRoute(provider);
    assert.equal((await h.request(headers)).status, status);
    assert.equal(h.calls.length, 0);
  }
});

test("所有服务商的缓冲合成只转发用户凭据，并返回音频二进制", async () => {
  for (const [provider, header, contentType] of [
    ["tokendance", "X-Tokendance-Api-Key", "audio/mpeg"],
    ["minimax", "X-Minimax-Api-Key", "audio/mpeg"],
  ]) {
    const h = loadRoute(provider);
    const response = await h.request({ [header]: "user-tts-key", "X-Minimax-Group-Id": "user-group" });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), contentType);
    assert.ok((await response.arrayBuffer()).byteLength > 0);
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].headers.get("authorization"), "Bearer user-tts-key");
    if (provider === "minimax") {
      assert.equal(h.calls[0].headers.get("GroupId"), "user-group");
      assert.equal(new URL(h.calls[0].url).searchParams.get("GroupId"), "user-group");
    }
  }
});

test("自有 Key 请求仍需要登录鉴权", async () => {
  const h = loadRoute("tokendance", false);
  assert.equal((await h.request({ "X-Tokendance-Api-Key": "user-key" })).status, 401);
  assert.equal(h.calls.length, 0);
});
