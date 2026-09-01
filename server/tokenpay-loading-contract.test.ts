import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const creditsSource = readFileSync("src/hooks/useCredits.ts", "utf8");
const tokenPaySource = readFileSync("src/hooks/useTokenPay.ts", "utf8");
const welcomeSource = readFileSync("src/components/game/WelcomeScreen.tsx", "utf8");

test("Supabase auth listener stays synchronous so session reads cannot deadlock", () => {
  assert.doesNotMatch(
    creditsSource,
    /onAuthStateChange\(\s*async\s*\(/,
  );
  assert.match(creditsSource, /deferAuthTask\(async \(\) =>/);
});

test("TokenPay loading paths always settle", () => {
  assert.match(tokenPaySource, /SESSION_TIMEOUT_MS\s*=\s*10_000/);
  assert.match(tokenPaySource, /REQUEST_TIMEOUT_MS\s*=\s*15_000/);
  assert.match(welcomeSource, /controller\.abort\(\), 12_000/);
  assert.doesNotMatch(welcomeSource, /if \(creditsLoading\) return;/);
});
