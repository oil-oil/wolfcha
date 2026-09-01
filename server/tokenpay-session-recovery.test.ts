import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const apiAuthSource = readFileSync("src/lib/api-auth.ts", "utf8");
const gameMachineSource = readFileSync("src/store/game-machine.ts", "utf8");
const chatRouteSource = readFileSync("src/app/api/chat/route.ts", "utf8");
const ttsRouteSource = readFileSync("src/app/api/tts/route.ts", "utf8");
const audioManagerSource = readFileSync("src/lib/audio-manager.ts", "utf8");
const apiKeysSource = readFileSync("src/lib/api-keys.ts", "utf8");
const welcomeSource = readFileSync("src/components/game/WelcomeScreen.tsx", "utf8");

test("本地恢复与服务端授权共用同一个有效期", () => {
  assert.match(apiAuthSource, /GAME_SESSION_RESUME_WINDOW_MS/);
  assert.match(gameMachineSource, /GAME_SESSION_RESUME_WINDOW_MS/);
  assert.doesNotMatch(apiAuthSource, /4\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
});

test("对局授权失效与余额不足使用不同错误码", () => {
  for (const source of [chatRouteSource, ttsRouteSource]) {
    assert.match(source, /GAME_SESSION_EXPIRED_CODE/);
    assert.match(source, /GAME_SESSION_EXPIRED_MESSAGE/);
  }
  assert.doesNotMatch(
    chatRouteSource,
    /!hasAuthorizedSession\)[\s\S]{0,180}Insufficient credits/,
  );
});

test("TokenPay 无自有语音 Key 时不会调用项目 MiniMax", () => {
  assert.match(audioManagerSource, /resolveAiVoiceAvailability/);
  assert.match(audioManagerSource, /modelSource !== "project" && hasMinimaxKey\(\)/);
  assert.doesNotMatch(audioManagerSource, /X-TokenPay-Mode/);
  assert.doesNotMatch(ttsRouteSource, /hasAuthorizedActiveTokenPaySession/);
});

test("TokenPay 授权失效会同步存储、模型来源与页面连接状态", () => {
  assert.match(
    apiKeysSource,
    /setTokenPayConnected[\s\S]*MODEL_SOURCE_CHANGE_EVENT/,
  );
  assert.match(
    welcomeSource,
    /setTokenPayConnectedState\(isTokenPayConnected\(\)\)/,
  );
});
