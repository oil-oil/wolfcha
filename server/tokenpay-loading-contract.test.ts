import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const creditsSource = readFileSync("src/hooks/useCredits.ts", "utf8");
const tokenPaySource = readFileSync("src/hooks/useTokenPay.ts", "utf8");
const tokenPayClientSource = readFileSync("src/lib/tokenpay-client.ts", "utf8");
const welcomeSource = readFileSync("src/components/game/WelcomeScreen.tsx", "utf8");
const creditsSourceFile = readFileSync("src/hooks/useCredits.ts", "utf8");
const authHeadersSource = readFileSync("src/lib/auth-headers.ts", "utf8");
const demoConfigSource = readFileSync("src/lib/demo-config.ts", "utf8");
const sessionTrackerSource = readFileSync("src/lib/game-session-tracker.ts", "utf8");

test("Supabase auth listener stays synchronous so session reads cannot deadlock", () => {
  assert.doesNotMatch(
    creditsSource,
    /onAuthStateChange\(\s*async\s*\(/,
  );
  assert.match(creditsSource, /deferAuthTask\(async \(\) =>/);
});

test("TokenPay loading paths always settle", () => {
  assert.match(tokenPayClientSource, /SESSION_TIMEOUT_MS\s*=\s*10_000/);
  assert.match(tokenPayClientSource, /REQUEST_TIMEOUT_MS\s*=\s*15_000/);
  assert.match(tokenPayClientSource, /CONNECTION_RETRY_DELAYS_MS\s*=\s*\[0, 300, 1_000\]/);
  assert.match(welcomeSource, /loadTokenPayConnectionWithRetry\(userId\)/);
  assert.match(welcomeSource, /window\.addEventListener\("focus", refresh\)/);
  assert.doesNotMatch(welcomeSource, /if \(creditsLoading\) return;/);
  assert.match(tokenPaySource, /finally \{[\s\S]*setConnectionLoading\(false\)/);
});

test("game start dependencies have bounded waits", () => {
  assert.match(creditsSourceFile, /fetchWithTimeout\("\/api\/credits\/consume"/);
  assert.match(authHeadersSource, /AUTH_SESSION_TIMEOUT_MS\s*=\s*10_000/);
  assert.match(demoConfigSource, /DEMO_CONFIG_TIMEOUT_MS\s*=\s*10_000/);
  assert.match(sessionTrackerSource, /SESSION_API_TIMEOUT_MS\s*=\s*15_000/);
});
