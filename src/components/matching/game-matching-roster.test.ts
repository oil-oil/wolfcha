import assert from "node:assert/strict";
import test from "node:test";
import { createGameMatchingRoster } from "./game-matching-roster";
import { prepareMatchingPlayers } from "./matching-roster";
import { buildSimpleAvatarUrl } from "@/lib/avatar-config";
import { setLocale } from "@/i18n/locale-store";
import type { GeneratedCharacter } from "@/lib/character-generator";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||= "game-entry-test-key";
setLocale("zh");

test("actual all-AI setup preserves shuffled personas, assigned seats and random/custom avatars", async () => {
  const { setupPlayers } = await import("@/lib/game-master");
  for (const count of [6, 12]) {
    const characters: GeneratedCharacter[] = Array.from({ length: count }, (_, index) => ({
      displayName: `真实角色${index}`,
      ...(index === 2 ? { avatarSeed: " custom-character-avatar " } : {}),
      ...(index === 3 ? { avatarSeed: " \t " } : {}),
      ...(index === 4 ? { avatarSeed: "" } : {}),
      persona: { gender: index % 2 ? "female" : "male", age: 25 + index, mbti: "INTJ", voiceRules: [] },
    }));
    const playerIds = Array.from({ length: count }, (_, seat) => `random-player-id-${seat}`);
    const seatOrder = Array.from({ length: count }, (_, index) => count - index - 1);
    const players = setupPlayers(characters, -1, "", count, undefined, playerIds, characters.map(() => ({ provider: "tokendance", model: "test-model" })), seatOrder);
    const roster = createGameMatchingRoster("actual-round", [...players].reverse());
    const figures = prepareMatchingPlayers(roster);
    assert.equal(roster.playerCount, count);
    players.forEach((player, seat) => {
      const participant = roster.participants[seat];
      assert.equal(participant.playerId, player.playerId);
      assert.equal(participant.displayName, characters[seatOrder.indexOf(seat)].displayName);
      assert.equal(participant.avatarSeed, player.avatarSeed);
      assert.equal(participant.gender, player.agentProfile?.persona.gender);
      assert.equal(figures[seat].avatarUrl, buildSimpleAvatarUrl(player.avatarSeed ?? player.playerId, { gender: participant.gender }));
      assert.equal(figures[seat].figureUrl, buildSimpleAvatarUrl(player.avatarSeed ?? player.playerId, { gender: participant.gender, backgroundColor: "transparent" }));
      assert.equal(figures[seat].facing, seat < count / 2 ? "right" : "left");
      assert.deepEqual(Object.keys(participant).sort(), ["avatarSeed", "displayName", "gender", "playerId", "seat"]);
    });
    assert.ok(!JSON.stringify(roster).includes("test-model"));
    assert.ok(!JSON.stringify(roster).includes("alignment"));
    assert.ok(!JSON.stringify(roster).includes("playerMind"));
  }
});

test("human games preserve every randomly assigned seat and avatar without exposing roles", async () => {
  const { getRandomHumanSeat, setupPlayers } = await import("@/lib/game-master");
  for (const count of [6, 10, 12]) {
    for (let seat = 0; seat < count; seat++) {
      const humanSeat = getRandomHumanSeat(count, () => (seat + 0.25) / count);
      const characters: GeneratedCharacter[] = Array.from({ length: count - 1 }, (_, index) => ({
        displayName: `同桌${index + 1}`,
        persona: { gender: index % 2 ? "female" : "male", age: 25, mbti: "INTJ", voiceRules: [] },
      }));
      const playerIds = Array.from({ length: count }, (_, seat) => `human-round-${count}-${seat}`);
      const seatOrder = Array.from({ length: count }, (_, seat) => seat).filter((seat) => seat !== humanSeat).reverse();
      const players = setupPlayers(characters, humanSeat, "入场玩家", count, undefined, playerIds, characters.map(() => ({ provider: "zenmux", model: "test-model" })), seatOrder, "Seer");
      const roster = createGameMatchingRoster("human-round", players);
      const figures = prepareMatchingPlayers(roster);
      const human = players[humanSeat];
      const participant = roster.participants[humanSeat];
      const figure = figures[humanSeat];

      assert.equal(players.filter((player) => player.isHuman).length, 1);
      assert.equal(humanSeat, seat);
      assert.equal(human.agentProfile, undefined);
      assert.equal(human.role, "Seer");
      assert.equal(roster.participants.length, count);
      assert.equal(participant.playerId, human.playerId);
      assert.equal(participant.avatarSeed, human.avatarSeed);
      assert.equal(figure.avatarUrl, buildSimpleAvatarUrl(human.avatarSeed ?? human.playerId));
      assert.equal(figure.figureUrl, buildSimpleAvatarUrl(human.avatarSeed ?? human.playerId, { backgroundColor: "transparent" }));
      assert.equal(figure.facing, humanSeat < Math.ceil(count / 2) ? "right" : "left");
      assert.ok(!JSON.stringify(roster).includes("Seer"));
      assert.ok(!JSON.stringify(roster).includes("playerMind"));

    }
  }
});
