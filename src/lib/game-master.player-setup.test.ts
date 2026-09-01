import assert from "node:assert/strict";
import test from "node:test";
import { setLocale } from "@/i18n/locale-store";
import type { ModelRef, Role } from "@/types/game";
import type { GeneratedCharacter } from "./character-generator";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||= "player-setup-test-key";
setLocale("zh");

const modelRef: ModelRef = { provider: "tokendance", model: "player-setup-test" };

const makeCharacters = (count: number): GeneratedCharacter[] =>
  Array.from({ length: count }, (_, index) => ({
    displayName: `AI角色${index + 1}`,
    persona: {
      voiceRules: [],
      mbti: "INTJ",
      gender: "female" as const,
      age: 20 + index,
    },
  }));

test("随机值会覆盖每个合法人类座位且不会越界", async () => {
  const { getRandomHumanSeat } = await import("./game-master");

  for (let seat = 0; seat < 10; seat++) {
    assert.equal(getRandomHumanSeat(10, () => (seat + 0.25) / 10), seat);
  }
  assert.equal(getRandomHumanSeat(10, () => -1), 0);
  assert.equal(getRandomHumanSeat(10, () => 1), 9);
  assert.equal(getRandomHumanSeat(10, () => Number.NaN), 0);
});

test("任意人类座位都只占一席，AI角色与模型映射不串位", async () => {
  const { setupPlayers } = await import("./game-master");
  const playerCount = 10;
  const characters = makeCharacters(playerCount - 1);
  const fixedRoles: Role[] = [
    "Seer",
    "Werewolf",
    "Witch",
    "Villager",
    "Hunter",
    "Werewolf",
    "Guard",
    "Villager",
    "WhiteWolfKing",
    "Villager",
  ];
  const seedPlayerIds = Array.from({ length: playerCount }, (_, seat) => `fixed-player-${seat}`);

  for (let humanSeat = 0; humanSeat < playerCount; humanSeat++) {
    const aiSeats = Array.from({ length: playerCount }, (_, seat) => seat)
      .filter((seat) => seat !== humanSeat)
      .reverse();
    const players = setupPlayers(
      characters,
      humanSeat,
      "真人玩家",
      playerCount,
      fixedRoles,
      seedPlayerIds,
      characters.map(() => modelRef),
      aiSeats
    );

    assert.equal(players.length, playerCount);
    assert.deepEqual(players.map((player) => player.seat), Array.from({ length: playerCount }, (_, seat) => seat));
    assert.deepEqual(players.filter((player) => player.isHuman).map((player) => player.seat), [humanSeat]);
    assert.equal(players[humanSeat].displayName, "真人玩家");
    assert.equal(players[humanSeat].role, fixedRoles[humanSeat]);

    aiSeats.forEach((seat, characterIndex) => {
      assert.equal(players[seat].displayName, characters[characterIndex].displayName);
      assert.equal(players[seat].agentProfile?.modelRef.model, modelRef.model);
      assert.equal(players[seat].playerId, seedPlayerIds[seat]);
    });
  }
});

test("随机到任意座位时仍会把玩家偏好身份放在真人座位", async () => {
  const { setupPlayers } = await import("./game-master");
  const playerCount = 10;
  const characters = makeCharacters(playerCount - 1);

  for (let humanSeat = 0; humanSeat < playerCount; humanSeat++) {
    const players = setupPlayers(
      characters,
      humanSeat,
      "真人玩家",
      playerCount,
      undefined,
      undefined,
      characters.map(() => modelRef),
      undefined,
      "Seer"
    );

    assert.equal(players[humanSeat].isHuman, true);
    assert.equal(players[humanSeat].role, "Seer");
  }
});

test("观战模式仍然是全 AI，随机真人座位逻辑不会占用任何席位", async () => {
  const { setupPlayers } = await import("./game-master");
  const playerCount = 10;
  const characters = makeCharacters(playerCount);
  const aiSeatOrder = Array.from({ length: playerCount }, (_, seat) => seat).reverse();
  const players = setupPlayers(
    characters,
    -1,
    "",
    playerCount,
    undefined,
    undefined,
    characters.map(() => modelRef),
    aiSeatOrder
  );

  assert.equal(players.filter((player) => player.isHuman).length, 0);
  aiSeatOrder.forEach((seat, characterIndex) => {
    assert.equal(players[seat].displayName, characters[characterIndex].displayName);
  });
});
