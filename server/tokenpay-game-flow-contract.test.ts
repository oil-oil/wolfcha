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
  assert.match(characterSource, /if \(isQuotaError\)[\s\S]*throw error/);
  assert.doesNotMatch(characterSource, /isCustomKeyEnabled\(\) && isQuotaError/);
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
