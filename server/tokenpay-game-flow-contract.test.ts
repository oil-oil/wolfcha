import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const welcomeSource = readFileSync("src/components/game/WelcomeScreen.tsx", "utf8");
const characterSource = readFileSync("src/lib/character-generator.ts", "utf8");
const llmSource = readFileSync("src/lib/llm.ts", "utf8");
const tokenPayClientSource = readFileSync("src/lib/tokenpay-client.ts", "utf8");
const recoveryHostSource = readFileSync(
  "src/components/game/TokenPayRecoveryHost.tsx",
  "utf8",
);

test("a disconnected TokenPay selection cannot start a game", () => {
  assert.match(
    welcomeSource,
    /getModelSource\(\) === "tokenpay"[\s\S]*await refreshTokenPayConnection\(\)[\s\S]*if \(!connected\)[\s\S]*openTokenPayConnection\(false\)/,
  );
  assert.match(tokenPayClientSource, /loadTokenPayConnectionWithRetry/);
  assert.match(welcomeSource, /handleCreditFailure\(result\)/);
  assert.match(welcomeSource, /result\?\.recoveryAction === "reauthorize_api_key"/);
});

test("character generation is schema-constrained and single-pass", () => {
  assert.match(characterSource, /response_format: buildBaseProfilesResponseFormat\(count\)/);
  assert.match(characterSource, /type: "json_schema"/);
  assert.match(characterSource, /strict: true/);
  assert.doesNotMatch(characterSource, /cachedBaseProfiles|cachedPersonaBatches/);
  assert.doesNotMatch(characterSource, /for \(let attempt|runOnce\(/);
  assert.doesNotMatch(characterSource, /normalizeBaseProfile\(/);
});

test("character personas are generated as bounded JSON batches", () => {
  assert.match(characterSource, /CHARACTER_PERSONA_BATCH_SIZE = 3/);
  assert.match(characterSource, /CHARACTER_PERSONA_BATCH_MAX_TOKENS = 4200/);
  assert.match(characterSource, /Promise\.allSettled\(batchTasks\)/);
  assert.match(characterSource, /temperature: GAME_TEMPERATURE\.CHARACTER_PERSONA/);
  assert.match(characterSource, /每批只调用一次/);
  assert.match(characterSource, /仅作全局去重参考/);
});

test("TokenPay character generation never replays an ambiguous paid stream", () => {
  assert.match(characterSource, /response_format: buildPersonaBatchResponseFormat\(batchProfiles\)/);
  assert.match(llmSource, /if \(options\.response_format\?\.type === "json_schema"\) throw firstError/);
  assert.doesNotMatch(characterSource, /lastEmittedCharacters/);
  assert.doesNotMatch(characterSource, /CharacterBatchSchemaError/);
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
