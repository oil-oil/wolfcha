import type { MultiplayerGameCommand, MultiplayerRoomAck, MultiplayerRoomView } from "@/types/multiplayer";

/** A delayed acknowledgement must not rewind a newer broadcast from the same room. */
export function newestMultiplayerView(current: MultiplayerRoomView | null, incoming: MultiplayerRoomView): MultiplayerRoomView {
  if (current?.room.id === incoming.room.id && current.room.version > incoming.room.version) return current;
  return incoming;
}

export function canRetryMultiplayerCommand(before: MultiplayerRoomView | null, after: MultiplayerRoomView, command: MultiplayerGameCommand): boolean {
  if (!before || before.room.id !== command.roomId || before.room.version !== command.expectedVersion) return false;
  if (after.room.id !== before.room.id || after.currentUserId !== before.currentUserId || after.privateState.seat !== before.privateState.seat) return false;
  if (before.room.status !== "in_game" || after.room.status !== "in_game") return false;
  if (before.publicState.day !== after.publicState.day || before.publicState.phase !== after.publicState.phase) return false;
  if (before.publicState.currentSpeakerSeat !== after.publicState.currentSpeakerSeat || before.publicState.deadlineAt !== after.publicState.deadlineAt) return false;
  if (after.privateState.actionSubmitted || !after.privateState.allowedActions.includes(command.type)) return false;
  const target = "targetSeat" in command ? command.targetSeat : command.type === "witch" ? command.poisonTargetSeat : null;
  return target == null || after.privateState.eligibleTargets.includes(target);
}

interface CommandConnection {
  send: (command: MultiplayerGameCommand, callback: (ack: MultiplayerRoomAck) => void) => void;
  resume: (roomId: string, callback: (ack: MultiplayerRoomAck) => void) => void;
  /** Return the newest view, including broadcasts received before a delayed resume ACK. */
  receive: (view: MultiplayerRoomView) => MultiplayerRoomView;
  isActive: () => boolean;
  defer?: (callback: () => void, delayMs: number) => void;
}

/** Stagger the refresh, then retry once with the same ID and only in the original turn. */
export function sendMultiplayerCommandWithRecovery(
  command: MultiplayerGameCommand,
  before: MultiplayerRoomView | null,
  connection: CommandConnection,
  callback: (ack: MultiplayerRoomAck) => void,
): void {
  if (!connection.isActive()) return;
  connection.send(command, (result) => {
    if (!connection.isActive()) return;
    if (result.ok || result.error.code !== "ROOM_CONFLICT") {
      callback(result);
      return;
    }
    // Reading first and delaying the send would only make the recovered version stale.
    // Distinct seats spread concurrent voters' refreshes across a bounded 50–600 ms window.
    const retryDelayMs = 50 * (Math.min(11, Math.max(0, before?.privateState.seat ?? 0)) + 1);
    (connection.defer ?? setTimeout)(() => {
      if (!connection.isActive()) return;
      connection.resume(command.roomId, (refreshed) => {
        if (!connection.isActive()) return;
        if (!refreshed.ok) {
          callback(refreshed);
          return;
        }
        const latest = connection.receive(refreshed.view);
        if (!canRetryMultiplayerCommand(before, latest, command)) {
          callback({ ok: false, error: { code: "ROOM_CONFLICT", message: command.type === "speech" ? "发言回合已变化，本次发言未发送，请查看最新牌局" : "当前回合已变化，请根据最新牌局重新操作" } });
          return;
        }
        connection.send({ ...command, expectedVersion: latest.room.version }, (retried) => {
          if (connection.isActive()) callback(retried);
        });
      });
    }, retryDelayMs);
  });
}
