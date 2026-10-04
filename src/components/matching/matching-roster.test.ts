import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSimpleAvatarUrl } from "@/lib/avatar-config";
import { createDemoRoster } from "./matching-fixtures";
import { buildMatchingCrowd, MATCHING_CROWD_PLAYERS } from "./matching-crowd";
import { getReadyPlayerIds, parseMatchingRoster, prepareMatchingPlayers } from "./matching-roster";

test("6–12 AI participants keep their supplied identity, avatar and seat regardless of response order", () => {
  for (let count = 6; count <= 12; count++) {
    const response = createDemoRoster(count, 1);
    const roster = parseMatchingRoster(response);
    const players = prepareMatchingPlayers(roster);
    assert.equal(players.length, count);
    for (let seat = 0; seat < count; seat++) {
      const source = response.participants.find((participant) => participant.seat === seat)!;
      const player = players[seat];
      assert.equal(player.id, source.playerId);
      assert.equal(player.name, source.displayName);
      assert.equal(player.seat, seat);
      assert.equal(player.facing, seat < Math.ceil(count / 2) ? "right" : "left");
      assert.equal(player.avatarUrl, buildSimpleAvatarUrl(source.avatarSeed!, { gender: source.gender }));
      const figure = new URL(player.figureUrl);
      assert.equal(figure.searchParams.get("backgroundColor"), "transparent");
      figure.searchParams.set("backgroundColor", new URL(player.avatarUrl).searchParams.get("backgroundColor")!);
      assert.equal(figure.toString(), player.avatarUrl);
    }
  }
});

test("repeated and reordered API responses have a stable animation identity", () => {
  const response = createDemoRoster(7, 1);
  const canonical = JSON.stringify(parseMatchingRoster(response));
  const reordered = {
    participants: [...response.participants].reverse().map((entry) => ({
      gender: entry.gender, avatarSeed: entry.avatarSeed, seat: entry.seat,
      displayName: entry.displayName, playerId: entry.playerId,
    })),
    playerCount: response.playerCount,
    roundId: response.roundId,
  };
  assert.equal(JSON.stringify(parseMatchingRoster(reordered)), canonical);
  assert.notEqual(JSON.stringify(parseMatchingRoster({ ...response, roundId: "next-round" })), canonical);
  const changedAppearance = structuredClone(response);
  changedAppearance.participants[0].avatarSeed = "changed-character";
  assert.notEqual(JSON.stringify(parseMatchingRoster(changedAppearance)), canonical);
});

test("public appearance is copied without game roles or private model information", () => {
  const response = createDemoRoster(6, 0);
  const roster = parseMatchingRoster({
    ...response,
    privateState: "private round state",
    participants: response.participants.map((entry) => ({
      ...entry, displayName: "同名角色", role: "Werewolf", alignment: "wolf",
      agentProfile: { playerMind: "private reasoning" },
    })),
  });
  assert.deepEqual(Object.keys(roster).sort(), ["participants", "playerCount", "roundId"]);
  assert.equal(new Set(roster.participants.map((participant) => participant.playerId)).size, 6);
  for (const participant of roster.participants) {
    assert.deepEqual(Object.keys(participant).sort(), ["avatarSeed", "displayName", "gender", "playerId", "seat"]);
  }
  const noSeed = parseMatchingRoster({ ...response, participants: response.participants.map((entry) => ({ ...entry, avatarSeed: undefined })) });
  assert.equal(noSeed.participants[0].avatarSeed, noSeed.participants[0].playerId);
});

test("incomplete, duplicate and out-of-range rosters cannot silently create substitute players", () => {
  const response = createDemoRoster(6, 0);
  assert.throws(() => parseMatchingRoster({ ...response, participants: response.participants.slice(1) }), /需要包含 6/);
  assert.throws(() => parseMatchingRoster({ ...response, playerCount: 5 }), /6–12/);
  assert.throws(() => parseMatchingRoster({ ...response, roundId: " " }), /roundId/);
  assert.throws(() => parseMatchingRoster({ ...response, participants: response.participants.map((entry) => ({ ...entry, playerId: "duplicate" })) }), /重复/);
  assert.throws(() => parseMatchingRoster({ ...response, participants: response.participants.map((entry) => ({ ...entry, seat: 0 })) }), /seat/);
  assert.throws(() => parseMatchingRoster({ ...response, participants: response.participants.map((entry, index) => ({ ...entry, seat: index + 1 })) }), /seat/);
});

test("readiness freezes only the supplied IDs, and an empty response remains waiting", () => {
  const response = parseMatchingRoster(createDemoRoster(8, 0));
  const waiting = parseMatchingRoster({ ...response, participants: [] });
  assert.deepEqual(prepareMatchingPlayers(waiting), []);
  assert.deepEqual(getReadyPlayerIds(waiting, ["not-yet-known"]), []);
  assert.deepEqual(getReadyPlayerIds(response), response.participants.map((participant) => participant.playerId));
  const chosen = [response.participants[6].playerId, response.participants[2].playerId];
  assert.deepEqual(getReadyPlayerIds(response, [...chosen, chosen[0]]), chosen);
  assert.deepEqual(getReadyPlayerIds(response, []), []);
  assert.throws(() => getReadyPlayerIds(response, ["different-round-player"]), /不在本局名单/);
});

test("the complete original crowd keeps walking even before the round's roster arrives", () => {
  const crowd = buildMatchingCrowd([]);
  assert.equal(crowd.length, 48);
  assert.equal(new Set(crowd.map((player) => player.id)).size, 48);
  assert.equal(new Set(crowd.map((player) => new URL(player.figureUrl).searchParams.get("seed"))).size, 48);
  assert.ok(crowd.every((player) => player.seat === undefined));
});

test("known avatars join the full crowd with their real IDs, without duplicate background copies", () => {
  const players = prepareMatchingPlayers(parseMatchingRoster(createDemoRoster(12, 0)));
  const crowd = buildMatchingCrowd(players);
  assert.equal(crowd.length, 48);
  assert.equal(crowd.filter((player) => player.seat !== undefined).length, 12);
  for (const player of players) {
    assert.equal(crowd.filter((entry) => entry.figureUrl === player.figureUrl).length, 1);
    assert.strictEqual(crowd.find((entry) => entry.id === player.id), player);
  }
});

test("arbitrary game-assigned avatars are included alongside all original crowd figures", () => {
  const roster = parseMatchingRoster({
    ...createDemoRoster(6, 0),
    participants: createDemoRoster(6, 0).participants.map((participant) => ({ ...participant, avatarSeed: `game-assigned-${participant.seat}` })),
  });
  const players = prepareMatchingPlayers(roster);
  const crowd = buildMatchingCrowd(players);
  assert.equal(crowd.length, 54);
  for (const figure of MATCHING_CROWD_PLAYERS) assert.ok(crowd.some((entry) => entry.figureUrl === figure.figureUrl));
  for (const player of players) assert.deepEqual(crowd.find((entry) => entry.id === player.id), { ...player, enterFromEdge: true });
});

test("shared avatars and ID collisions do not merge two participants or select a background figure", () => {
  const source = createDemoRoster(6, 0);
  const roster = parseMatchingRoster({ ...source, participants: source.participants.map((participant) => ({
    ...participant,
    ...(participant.seat === 5 ? { avatarSeed: "wolfcha-match-1", gender: "male" } : {}),
    ...(participant.seat === 2 ? { playerId: MATCHING_CROWD_PLAYERS[20].id } : {}),
  })) });
  const players = prepareMatchingPlayers(roster);
  const crowd = buildMatchingCrowd(players);
  assert.equal(crowd.length, 49);
  assert.equal(new Set(crowd.map((entry) => entry.id)).size, crowd.length);
  for (const player of players) {
    const figure = crowd.find((entry) => entry.id === player.id)!;
    assert.equal(figure.figureUrl, player.figureUrl);
    assert.equal(figure.seat, player.seat);
  }
  assert.equal(crowd.filter((entry) => entry.figureUrl === players[0].figureUrl && entry.seat !== undefined).length, 2);
  assert.ok(crowd.some((entry) => entry.figureUrl === MATCHING_CROWD_PLAYERS[20].figureUrl && entry.seat === undefined));
});
