import assert from "node:assert/strict";
import test, { before } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { messagesByLocale } from "@/i18n/messages";
import type { GameState, Player } from "@/types/game";

let createInitialGameState: typeof import("@/lib/game-master").createInitialGameState;
let DialogArea: typeof import("./DialogArea").DialogArea;
before(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  ({ createInitialGameState } = await import("@/lib/game-master"));
  ({ DialogArea } = await import("./DialogArea"));
});

const human: Player = { playerId: "hunter", seat: 8, displayName: "玩家", isHuman: true, alive: false, role: "Hunter", alignment: "village" };
const target: Player = { ...human, playerId: "target", seat: 2, displayName: "目标", isHuman: false, alive: true, role: "Villager" };
const prompt = "你已被淘汰，请选择一个头像，开枪带走一名玩家";
const stale = "轮到你了，开始发言吧";

function dialog(state: Partial<GameState> = {}, overrides: Partial<Parameters<typeof DialogArea>[0]> = {}, locale: "zh" | "en" = "zh") {
  const gameState = { ...createInitialGameState(), day: 1, phase: "HUNTER_SHOOT" as const, players: [human, target], ...state };
  return renderToStaticMarkup(<NextIntlClientProvider locale={locale} timeZone="UTC" now={new Date(0)} messages={messagesByLocale[locale]}>
    <DialogArea gameState={gameState} humanPlayer={gameState.players.find(p => p.isHuman) ?? null} currentDialogue={{ speaker: "系统", text: stale, isStreaming: false }} displayedText={stale} isTyping={false} {...overrides} />
  </NextIntlClientProvider>);
}

test("only an eliminated human hunter eligible to shoot receives the phase prompt instead of stale speech", () => {
  const html = dialog();
  assert.match(html, new RegExp(prompt));
  assert.match(html, /data-hunter-choose-target="true"/);
  assert.doesNotMatch(html, new RegExp(stale));
  assert.match(html, /不开枪/);
  const waiting = dialog({}, { waitingForNextRound: true });
  assert.match(waiting, new RegExp(prompt), "a stale next-round hint cannot replace the pending shot");
  assert.match(dialog({}, {}, "en"), /You have been eliminated/);
});

test("alive, poisoned, other-role and other-phase players never receive the eliminated hunter prompt", () => {
  const initial = createInitialGameState();
  for (const state of [
    { players: [{ ...human, alive: true }, target] },
    { roleAbilities: { ...initial.roleAbilities, hunterCanShoot: false }, nightHistory: { 1: { deaths: [{ seat: human.seat, reason: "poison" as const }] } } },
    { players: [{ ...human, role: "Villager" as const }, target] },
    { phase: "DAY_LAST_WORDS" as const },
  ]) assert.doesNotMatch(dialog(state), new RegExp(prompt));
});

test("selecting a hunter target keeps the existing confirmation and shooting or changing phases clears the prompt", () => {
  const selected = dialog({}, { selectedSeat: target.seat });
  assert.doesNotMatch(selected, new RegExp(prompt));
  assert.match(selected, /确认/);
  for (const history of [
    { dayHistory: { 1: { hunterShot: { hunterSeat: human.seat, targetSeat: target.seat } } } },
    { nightHistory: { 1: { hunterShot: { hunterSeat: human.seat, targetSeat: target.seat } } } },
  ]) assert.doesNotMatch(dialog(history), /data-hunter-choose-target/);
  assert.doesNotMatch(dialog({ phase: "NIGHT_START" }), /data-hunter-choose-target/);
  assert.match(dialog(), /data-hunter-choose-target/, "a fresh replay can choose again");
});

test("a pending hunter action is visible even when no prior dialogue exists", () => {
  assert.match(dialog({}, { currentDialogue: null, displayedText: "" }), new RegExp(prompt));
});
