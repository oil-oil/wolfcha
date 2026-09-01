import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const welcomeSource = readFileSync("src/components/game/WelcomeScreen.tsx", "utf8");
const characterSource = readFileSync("src/lib/character-generator.ts", "utf8");
const llmSource = readFileSync("src/lib/llm.ts", "utf8");
const recoveryHostSource = readFileSync(
  "src/components/game/TokenPayRecoveryHost.tsx",
  "utf8",
);

test("a disconnected TokenPay selection cannot start a game", () => {
  assert.match(
    welcomeSource,
    /getModelSource\(\) === "tokenpay"[\s\S]*!\(tokenPayConnected \|\| isTokenPayConnected\(\)\)[\s\S]*openTokenPayConnection\(false\)/,
  );
  assert.match(welcomeSource, /handleCreditFailure\(result\)/);
  assert.match(welcomeSource, /result\?\.recoveryAction === "reauthorize_api_key"/);
});

test("character generation reuses the paid base-profile stage", () => {
  assert.match(characterSource, /let cachedBaseProfiles: BaseProfile\[\] \| null = null/);
  assert.match(characterSource, /cachedBaseProfiles = baseProfiles/);
  assert.match(characterSource, /if \(isQuotaError \|\| modelSource === "tokenpay"\)[\s\S]*throw error/);
  assert.doesNotMatch(characterSource, /isCustomKeyEnabled\(\) && isQuotaError/);
});

test("character personas are generated as bounded JSON batches", () => {
  assert.match(characterSource, /CHARACTER_PERSONA_BATCH_SIZE = 3/);
  assert.match(characterSource, /CHARACTER_PERSONA_BATCH_MAX_TOKENS = 4200/);
  assert.match(characterSource, /Promise\.allSettled\(batchTasks\)/);
  assert.match(characterSource, /temperature: GAME_TEMPERATURE\.CHARACTER_PERSONA/);
  assert.match(characterSource, /cachedPersonaBatches/);
  assert.match(characterSource, /仅作全局去重参考/);
});

test("TokenPay character generation never replays an ambiguous paid stream", () => {
  assert.match(characterSource, /const maxAttempts = modelSource === "tokenpay" \? 1 : 2/);
  assert.match(characterSource, /isQuotaError \|\| modelSource === "tokenpay"/);
  assert.match(characterSource, /lastEmittedCharacters\.get\(index\) === character/);
  assert.doesNotMatch(characterSource, /\(two-stage generation\)/);
});

test("TokenPay avoids ambiguous automatic request replay", () => {
  assert.match(llmSource, /TOKENPAY_RETRYABLE_STATUS = new Set\(\[429\]\)/);
  assert.match(llmSource, /if \(modelSource === "tokenpay" \|\| attempt === maxAttempts\) break/);
  assert.match(llmSource, /STREAM_IDLE_TIMEOUT_MS = 45_000/);
  assert.match(llmSource, /finally \{[\s\S]*await reader\.cancel\(\)/);
});

test("recharge recovery settles when its UI disappears", () => {
  assert.match(
    recoveryHostSource,
    /settleTokenPayTopUp\(requestId, false\)/,
  );
});
