import assert from "node:assert/strict";
import test from "node:test";
import { advanceMultiplayerGame } from "@/multiplayer/engine";
import { MemoryRoomStore } from "./room-store";
import { RoomCoordinator } from "./room-coordinator";

test("最后狼人第二天遗言后的房间快照、历史与会话回合数一致，重发不会重复结算", async () => {
  const store = new MemoryRoomStore();
  const completed: Array<{ sessionId: string; winner: string; day: number }> = [];
  const coordinator = new RoomCoordinator({
    store,
    aiService: { async resolveAiTurns(state) { return advanceMultiplayerGame(state, { autoAi: false }); } },
    completeGameSession: async (sessionId, winner, day) => { completed.push({ sessionId, winner, day }); },
  });
  const created = await coordinator.create("last-wolf", { displayName: "末狼", playerCount: 8, difficulty: "normal", locale: "zh" });
  assert.ok(created.ok);
  const ready = await coordinator.ready("last-wolf", created.view.room.id, true, created.view.room.version);
  assert.ok(ready.ok);
  const started = await coordinator.start("last-wolf", created.view.room.id, ready.view.room.version);
  assert.ok(started.ok);
  const aggregate = await store.getRoom(created.view.room.id);
  assert.ok(aggregate?.room.serverState);
  const state = structuredClone(aggregate.room.serverState);
  const speaker = state.players.find((player) => player.userId === "last-wolf")!;
  for (const player of state.players) {
    player.alive = player.seat !== speaker.seat;
    player.role = player.seat === speaker.seat ? "Werewolf" : "Villager";
    player.alignment = player.seat === speaker.seat ? "wolf" : "village";
  }
  state.day = 2;
  state.phase = "DAY_LAST_WORDS";
  state.lastWordsSeat = speaker.seat;
  state.currentSpeakerSeat = speaker.seat;
  state.speechQueue = [speaker.seat];
  state.pendingTrigger = null;
  state.queuedTrigger = null;
  state.continuationPhase = "NIGHT_START";
  state.badge!.holderSeat = null;
  state.messages = [];
  state.gameSessionId = "terminal-day-unit-session";
  await store.transitionRoom(aggregate.room.id, aggregate.room.version, { phase: state.phase, day: 2, serverState: state });
  const before = await coordinator.viewFor(aggregate.room.id, "last-wolf");
  assert.ok(before);
  assert.ok(before.privateState.allowedActions.includes("speech"));
  const command = { type: "speech" as const, content: "第二天的最后遗言", commandId: "final-last-words", roomId: aggregate.room.id, expectedVersion: before.room.version };
  const sent = await coordinator.command("last-wolf", command);
  assert.ok(sent.ok);
  assert.equal(sent.view.room.status, "finished");
  assert.equal(sent.view.publicState.winner, "village");
  assert.equal(sent.view.publicState.day, 2);
  assert.ok(sent.view.publicState.messages.every((message) => message.day === 2));
  const persisted = await store.getRoom(aggregate.room.id);
  assert.equal(persisted?.room.day, 2);
  assert.equal(persisted?.room.serverState?.day, 2);
  assert.deepEqual(completed, [{ sessionId: state.gameSessionId, winner: "village", day: 2 }]);
  const repeated = await coordinator.command("last-wolf", command);
  assert.ok(repeated.ok);
  assert.equal(repeated.view.publicState.messages.filter((message) => message.content === command.content).length, 1);
  assert.equal(completed.length, 1);
});
