import { createHash, randomBytes, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  advanceMultiplayerGame,
  applyMultiplayerGameCommand,
  buildStartedRoomState,
  normalizeMultiplayerPlayerCount,
  listPendingMultiplayerAiActions,
  projectMultiplayerState,
  stampMultiplayerDeadline,
  takeOverMultiplayerPlayer,
  takeOverTimedOutMultiplayerPlayers,
} from "@/multiplayer/engine";
import type {
  CreateMultiplayerRoomInput,
  MultiplayerGameCommand,
  JoinMultiplayerRoomInput,
  MultiplayerRoomAck,
  MultiplayerRoomError,
  MultiplayerRoomMember,
  MultiplayerServerState,
  MultiplayerRoomView,
} from "@/types/multiplayer";
import { MultiplayerAiUnavailableError, type MultiplayerAiService } from "./ai-service";
import { MemoryRoomStore, type RoomAggregate, type RoomRecord, type RoomStore } from "./room-store";

export interface RoomCoordinatorOptions {
  store?: RoomStore;
  now?: () => Date;
  authorizeGameSession?: (userId: string, sessionId: string | null | undefined, roomId: string) => Promise<boolean>;
  aiService?: MultiplayerAiService & { isAvailable?: () => boolean | Promise<boolean> };
  completeGameSession?: (
    sessionId: string,
    winner: "wolf" | "village",
    day: number,
  ) => Promise<void>;
  releaseGameSession?: (userId: string, sessionId: string, roomId: string) => Promise<void>;
  actionTimeoutMs?: number;
  speechTimeoutMs?: number;
}

const error = (code: MultiplayerRoomError["code"], message: string): MultiplayerRoomAck => ({ ok: false, error: { code, message } });
const ok = (view: MultiplayerRoomView): MultiplayerRoomAck => ({ ok: true, view });

export class RoomCoordinator {
  readonly store: RoomStore;
  private readonly now: () => Date;
  private readonly authorizeGameSession?: RoomCoordinatorOptions["authorizeGameSession"];
  private readonly aiService?: MultiplayerAiService & { isAvailable?: () => boolean | Promise<boolean> };
  private readonly completeGameSession?: RoomCoordinatorOptions["completeGameSession"];
  private readonly releaseGameSession?: RoomCoordinatorOptions["releaseGameSession"];
  private readonly actionTimeoutMs: number;
  private readonly speechTimeoutMs: number;
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(options: RoomCoordinatorOptions = {}) {
    this.store = options.store ?? new MemoryRoomStore();
    this.now = options.now ?? (() => new Date());
    this.authorizeGameSession = options.authorizeGameSession;
    this.aiService = options.aiService;
    this.completeGameSession = options.completeGameSession;
    this.releaseGameSession = options.releaseGameSession;
    this.actionTimeoutMs = options.actionTimeoutMs ?? 90_000;
    this.speechTimeoutMs = options.speechTimeoutMs ?? 120_000;
  }

  async create(userId: string, input: CreateMultiplayerRoomInput): Promise<MultiplayerRoomAck> {
    const normalized = this.normalizeCreate(input); if (!normalized) return error("INVALID_INPUT", "房间参数无效");
    const id = randomUUID(); const createdAt = this.now().toISOString();
    const { displayName, ...settings } = normalized;
    const member: MultiplayerRoomMember = { userId, displayName, role: "host", seat: 0, isReady: false, isConnected: true };
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const room: RoomRecord = { id, code: await this.uniqueCode(), hostUserId: userId, status: "lobby", phase: "LOBBY", day: 1, winner: null, version: 0, settings, createdAt, startedAt: null, serverState: null, gameSessionOwnerId: null };
      try {
        const aggregate = await this.store.createRoom(room, member);
        return ok(this.view(aggregate, userId));
      } catch (cause) {
        if (!isRoomCodeConflict(cause) || attempt === 4) throw cause;
      }
    }
    throw new Error("ROOM_CODE_GENERATION_EXHAUSTED");
  }

  async join(userId: string, input: JoinMultiplayerRoomInput): Promise<MultiplayerRoomAck> {
    const normalized = this.normalizeJoin(input); if (!normalized) return error("INVALID_INPUT", "加入参数无效");
    const existing = await this.store.getRoom(normalized.code); if (!existing) return error("ROOM_NOT_FOUND", "房间不存在");
    return this.lock(existing.room.id, async () => {
      // A bounded CAS retry also makes duplicate joins from separate server workers
      // converge on the same member instead of allocating a second seat or failing.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const aggregate = await this.store.getRoom(existing.room.id);
        if (!aggregate) return error("ROOM_NOT_FOUND", "房间不存在");
        const current = aggregate.members.find((member) => member.userId === userId);
        if (aggregate.room.status !== "lobby" && !current) return error("ROOM_CONFLICT", "游戏已经开始");
        if (current && aggregate.room.status !== "lobby") {
          // Re-entering a running/finished/closed game restores presence only.
          // In particular, a timed-out spectator remains detached from game identity.
          await this.store.setPresence(aggregate.room.id, userId, true);
          const refreshed = await this.store.getRoom(aggregate.room.id);
          return refreshed ? ok(this.view(refreshed, userId)) : error("ROOM_NOT_FOUND", "房间不存在");
        }
        if (current && current.role !== "spectator" && current.seat !== null && current.isConnected && current.displayName === normalized.displayName) {
          return ok(this.view(aggregate, userId));
        }

        const capacity = normalizeMultiplayerPlayerCount(aggregate.room.settings.playerCount);
        const occupied = new Set(aggregate.members.filter((member) => member.role !== "spectator" && member.seat !== null).map((member) => member.seat));
        let member: MultiplayerRoomMember;
        let eventType: string;
        if (current) {
          current.displayName = normalized.displayName;
          current.isConnected = true;
          if (current.role === "spectator" || current.seat === null) {
            const seat = [...Array(capacity).keys()].find((candidate) => !occupied.has(candidate));
            if (seat === undefined) return error("ROOM_FULL", "房间已满");
            current.role = "player";
            current.seat = seat;
            current.isReady = false;
          }
          member = current;
          eventType = "member_rejoined";
        } else {
          const seat = [...Array(capacity).keys()].find((candidate) => !occupied.has(candidate));
          if (seat === undefined) return error("ROOM_FULL", "房间已满");
          member = { userId, displayName: normalized.displayName, role: "player", seat, isReady: false, isConnected: true };
          eventType = "member_joined";
        }
        const version = await this.store.saveMember(aggregate.room.id, member, aggregate.room.version, {
          type: eventType,
          payload: { userId, seat: member.seat },
          actorUserId: userId,
        });
        if (version !== null) {
          const refreshed = await this.store.getRoom(aggregate.room.id);
          return refreshed ? ok(this.view(refreshed, userId)) : error("INTERNAL_ERROR", "房间读取失败");
        }
        // A concurrent join may have committed this same user, or another member
        // may have consumed the candidate seat. Re-read and recalculate before failing.
      }
      return error("ROOM_CONFLICT", "房间状态已变化，请刷新");
    });
  }

  async resume(userId: string, roomIdOrCode: string): Promise<MultiplayerRoomAck> {
    const key = typeof roomIdOrCode === "string" ? roomIdOrCode.trim() : ""; if (!key) return error("INVALID_INPUT", "房间标识无效");
    const aggregate = await this.store.getRoom(key); if (!aggregate) return error("ROOM_NOT_FOUND", "房间不存在");
    const member = aggregate.members.find((item) => item.userId === userId); if (!member) return error("FORBIDDEN", "你不是该房间成员");
    if (aggregate.room.status === "lobby" && (member.role === "spectator" || member.seat === null)) {
      // Reuse join's locked re-read and CAS seat allocation. Do this before
      // acquiring resume's presence lock to avoid recursively locking the room.
      return this.join(userId, { code: aggregate.room.code, displayName: member.displayName });
    }
    return this.lock(aggregate.room.id, async () => { await this.store.setPresence(aggregate.room.id, userId, true); const current = await this.store.getRoom(aggregate.room.id); return current ? ok(this.view(current, userId)) : error("ROOM_NOT_FOUND", "房间不存在"); });
  }

  async ready(userId: string, roomId: string, isReady: boolean, expectedVersion: number): Promise<MultiplayerRoomAck> {
    if (!Number.isInteger(expectedVersion) || expectedVersion < 0) return error("INVALID_INPUT", "房间版本无效");
    return this.lock(roomId, async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const aggregate = await this.store.getRoom(roomId);
        if (!aggregate) return error("ROOM_NOT_FOUND", "房间不存在");
        if (aggregate.room.status !== "lobby" || expectedVersion > aggregate.room.version) return error("ROOM_CONFLICT", "房间状态已变化，请查看最新状态");
        const member = aggregate.members.find(item => item.userId === userId && item.role !== "spectator" && item.seat !== null);
        if (!member) return error("FORBIDDEN", "你当前没有玩家席位");
        if (member.isReady === isReady) return ok(this.view(aggregate, userId));
        // Readiness is an absolute per-user value. Unrelated members' updates can
        // safely rebase, while game commands retain their strict version checks.
        const version = await this.store.saveMember(roomId, { ...member, isReady }, aggregate.room.version, { type: "member_ready", payload: { userId }, actorUserId: userId });
        if (version !== null) {
          const current = await this.store.getRoom(roomId);
          return current ? ok(this.view(current, userId)) : error("ROOM_NOT_FOUND", "房间不存在");
        }
      }
      return error("ROOM_CONFLICT", "准备状态更新冲突，请重试");
    });
  }

  async start(userId: string, roomId: string, expectedVersion: number, gameSessionId?: string | null): Promise<MultiplayerRoomAck> {
    return this.lock(roomId, async () => {
      const aggregate = await this.store.getRoom(roomId); if (!aggregate) return error("ROOM_NOT_FOUND", "房间不存在");
      if (aggregate.room.version !== expectedVersion) return error("ROOM_CONFLICT", "房间状态已变化，请刷新");
      if (aggregate.room.hostUserId !== userId) return error("FORBIDDEN", "只有房主可以开始");
      if (aggregate.room.status !== "lobby") return error("ROOM_CONFLICT", "房间已开始");
      const humans = aggregate.members.filter((member) => member.role !== "spectator");
      if (humans.some((member) => !member.isReady)) return error("ROOM_CONFLICT", "仍有玩家未准备");
      const atomicStart = this.store.startRoomAtomically;
      if (!atomicStart && this.authorizeGameSession && !(await this.authorizeGameSession(userId, gameSessionId, roomId))) {
        return error("FORBIDDEN", "本局游戏额度未授权，请重新开始");
      }
      let state: MultiplayerServerState;
      try {
        if (!(await this.isAiAvailable())) throw new MultiplayerAiUnavailableError("AI_PROVIDER_NOT_CONFIGURED");
        state = this.prepareHumanState({
          ...buildStartedRoomState(aggregate.members, aggregate.room.settings.playerCount, aggregate.room.id),
          roomId,
          version: expectedVersion + 1,
          gameSessionId: gameSessionId ?? null,
          gameSessionOwnerId: gameSessionId ? userId : null,
        });
      } catch (cause) {
        if (!atomicStart && gameSessionId) await this.releaseClaim(userId, gameSessionId, roomId);
        if (cause instanceof MultiplayerAiUnavailableError) {
          return error("AI_UNAVAILABLE", "AI 服务暂时不可用，牌局尚未开始，请重试");
        }
        throw cause;
      }
      let version: number | null;
      try {
        const patch = { status: "in_game" as const, phase: state.phase, day: state.day, serverState: state, gameSessionOwnerId: state.gameSessionOwnerId ?? null, startedAt: this.now().toISOString() };
        const event = { type: "room_started", payload: { playerCount: state.players.length }, actorUserId: userId };
        if (atomicStart) {
          const started = await atomicStart.call(this.store, roomId, expectedVersion, gameSessionId, userId, patch, event);
          if (started && !started.authorized) return error("FORBIDDEN", "本局游戏额度未授权，请重新开始");
          version = started?.version ?? null;
        } else {
          version = await this.store.transitionRoom(roomId, expectedVersion, patch, event);
        }
      } catch (cause) {
        // RPC 响应丢失时事务可能已经提交；先读回确认，避免误释放额度并造成一局两用。
        try {
          const recovered = await this.store.getRoom(roomId);
          if (
            recovered?.room.status === "in_game" &&
            recovered.room.serverState?.gameSessionId === (gameSessionId ?? null)
          ) {
            return ok(this.view(recovered, userId));
          }
          if (!atomicStart && gameSessionId) await this.releaseClaim(userId, gameSessionId, roomId);
        } catch {
          // 状态未知时保留 claim；同房同 session 重试是幂等的，错误释放反而可能重复扣费。
        }
        throw cause;
      }
      if (version === null) {
        if (!atomicStart && gameSessionId) await this.releaseClaim(userId, gameSessionId, roomId);
        return error("ROOM_CONFLICT", "房间状态已变化，请刷新");
      }
      const current = await this.store.getRoom(roomId); return current ? ok(this.view(current, userId)) : error("INTERNAL_ERROR", "房间读取失败");
    });
  }

  async command(userId: string, command: MultiplayerGameCommand): Promise<MultiplayerRoomAck> {
    if (!command || typeof command.roomId !== "string" || typeof command.commandId !== "string") {
      return error("INVALID_INPUT", "游戏动作无效");
    }
    if (!command.commandId.trim() || command.commandId.length > 128 || !Number.isInteger(command.expectedVersion)) {
      return error("INVALID_INPUT", "游戏动作标识无效");
    }

    return this.lock(command.roomId, async () => {
      const aggregate = await this.store.getRoom(command.roomId);
      if (!aggregate) return error("ROOM_NOT_FOUND", "房间不存在");
      if (!aggregate.members.some((member) => member.userId === userId)) {
        return error("FORBIDDEN", "你不是该房间成员");
      }
      if (aggregate.room.serverState?.processedCommandIds?.includes(command.commandId)) {
        return ok(this.view(aggregate, userId));
      }
      if (aggregate.room.status !== "in_game" || !aggregate.room.serverState) {
        return error("ROOM_CONFLICT", "当前房间不接受游戏动作");
      }

      if (aggregate.room.version !== command.expectedVersion) {
        return error("ROOM_CONFLICT", "牌局状态已变化，请按最新状态重试");
      }
      let nextState;
      try {
        nextState = applyMultiplayerGameCommand(
          // The room CAS is authoritative, including older saves whose member updates drifted the inner version.
          { ...aggregate.room.serverState, version: aggregate.room.version },
          userId,
          command,
          { autoAi: false },
        );
        nextState = this.prepareHumanState(nextState);
      } catch (cause) {
        if (cause instanceof MultiplayerAiUnavailableError) {
          return error("AI_UNAVAILABLE", "AI 服务暂时不可用，本次操作未提交，请稍后重试");
        }
        const message = cause instanceof Error ? cause.message : "INVALID_INPUT";
        if (message === "VERSION_CONFLICT" || message === "ROOM_CONFLICT") {
          return error("ROOM_CONFLICT", "牌局状态已变化，请按最新状态重试");
        }
        if (message === "FORBIDDEN") return error("FORBIDDEN", "当前身份不能执行此动作");
        return error("INVALID_INPUT", "当前阶段不接受此动作或目标无效");
      }
      const finished = nextState.phase === "GAME_END" || nextState.winner !== null;
      const result = await this.store.applyCommand(
        aggregate.room.id,
        command.expectedVersion,
        command.commandId,
        userId,
        {
          status: finished ? "finished" : "in_game",
          phase: nextState.phase,
          day: nextState.day,
          winner: nextState.winner,
          serverState: nextState,
        },
        {
          type: finished ? "game_finished" : "game_command",
          payload: { commandType: command.type, phase: nextState.phase, day: nextState.day },
          visibility: "public",
        },
      );
      if (!result) return error("ROOM_CONFLICT", "牌局状态已变化，请按最新状态重试");
      if (finished) await this.completeSession(nextState);

      const current = await this.store.getRoom(aggregate.room.id);
      return current ? ok(this.view(current, userId)) : error("INTERNAL_ERROR", "房间读取失败");
    });
  }

  async leave(userId: string, roomId: string, expectedVersion: number): Promise<MultiplayerRoomAck> {
    return this.lock(roomId, async () => {
      const aggregate = await this.store.getRoom(roomId);
      if (!aggregate) return error("ROOM_NOT_FOUND", "房间不存在");
      const member = aggregate.members.find((item) => item.userId === userId);
      if (!member) return error("FORBIDDEN", "你不是该房间成员");
      if (member.role === "spectator") {
        await this.closeUnattendedRoom(aggregate);
        await this.store.setPresence(roomId, userId, false);
        const current = await this.store.getRoom(roomId);
        return current ? ok(this.view(current, userId)) : error("ROOM_NOT_FOUND", "房间不存在");
      }
      if (aggregate.room.version !== expectedVersion) return error("ROOM_CONFLICT", "房间状态已变化，请刷新");
      const remainingHumans = aggregate.members.filter(
        (item) => item.userId !== userId && item.role !== "spectator",
      );
      let state = aggregate.room.serverState;
      let status = aggregate.room.status;
      if (state && aggregate.room.status === "in_game") {
        state = takeOverMultiplayerPlayer(state, userId, "left");
        if (remainingHumans.length === 0) {
          status = "closed";
          state.deadlineAt = null;
          state.turnKey = null;
        } else {
          state = this.prepareHumanState(state);
        }
        state.version = expectedVersion + 1;
      } else if (remainingHumans.length === 0) {
        status = "closed";
      }
      const version = await this.store.leaveMember(
        roomId,
        userId,
        expectedVersion,
        {
          status,
          ...(state ? { phase: state.phase, day: state.day, winner: state.winner, serverState: state } : {}),
        },
        { type: "member_left", payload: { userId, seat: member.seat }, actorUserId: userId },
      );
      if (version === null) return error("ROOM_CONFLICT", "房间状态已变化，请刷新");
      if (status === "closed" && state?.gameSessionId) {
        await this.releaseClaim(aggregate.room.gameSessionOwnerId ?? state.gameSessionOwnerId ?? userId, state.gameSessionId, roomId);
      }
      const current = await this.store.getRoom(roomId);
      return current ? ok(this.view(current, userId)) : error("INTERNAL_ERROR", "房间读取失败");
    });
  }

  async close(userId: string, roomId: string, expectedVersion: number): Promise<MultiplayerRoomAck> {
    return this.lock(roomId, async () => {
      const aggregate = await this.store.getRoom(roomId);
      if (!aggregate) return error("ROOM_NOT_FOUND", "房间不存在");
      if (aggregate.room.version !== expectedVersion) return error("ROOM_CONFLICT", "房间状态已变化，请刷新");
      if (aggregate.room.hostUserId !== userId) return error("FORBIDDEN", "只有房主可以关闭房间");
      if (aggregate.room.status !== "lobby") return error("ROOM_CONFLICT", "游戏开始后请使用退出并托管");
      const version = await this.store.transitionRoom(
        roomId,
        expectedVersion,
        { status: "closed" },
        { type: "room_closed", payload: {}, actorUserId: userId },
      );
      if (version === null) return error("ROOM_CONFLICT", "房间状态已变化，请刷新");
      const current = await this.store.getRoom(roomId);
      return current ? ok(this.view(current, userId)) : error("INTERNAL_ERROR", "房间读取失败");
    });
  }

  async expireTurn(roomId: string, expectedVersion: number, turnKey: string): Promise<boolean> {
    return this.lock(roomId, async () => {
      const aggregate = await this.store.getRoom(roomId);
      const state = aggregate?.room.serverState;
      if (!aggregate || !state || aggregate.room.status !== "in_game") return false;
      if (aggregate.room.version !== expectedVersion || state.turnKey !== turnKey) return false;
      if (!state.deadlineAt || Date.parse(state.deadlineAt) > this.now().getTime()) return false;
      const next = turnKey.startsWith("ai:") ? this.prepareHumanState(state) : this.prepareHumanState(takeOverTimedOutMultiplayerPlayers(state));
      const timedOutUserIds = turnKey.startsWith("ai:")
        ? []
        : state.players
            .filter((player) => player.userId && !next.players.some((candidate) => candidate.userId === player.userId))
            .map((player) => player.userId as string);
      next.version = expectedVersion + 1;
      const finished = next.phase === "GAME_END" || next.winner !== null;
      const unattended = !finished && !this.hasHumanMember(aggregate, next);
      if (unattended) { next.deadlineAt = null; next.turnKey = null; }
      const status = finished ? "finished" : unattended ? "closed" : "in_game";
      const eventType = finished ? "game_finished" : unattended ? "room_closed" : "turn_expired";
      const result = turnKey.startsWith("ai:")
        ? await this.store.applyCommand(
        roomId,
        expectedVersion,
        `timeout:${turnKey}:${expectedVersion}`,
        aggregate.room.hostUserId,
        { status, phase: next.phase, day: next.day, winner: next.winner, serverState: next },
        { type: eventType, payload: { turnKey }, visibility: "public" },
      )
        : await this.store.applyTimeout(
          roomId,
          expectedVersion,
          `timeout:${turnKey}:${expectedVersion}`,
          timedOutUserIds,
          { status, phase: next.phase, day: next.day, winner: next.winner, serverState: next },
          { type: eventType, payload: { turnKey, timedOutUserIds, ...(unattended ? { reason: "no_human_members" } : {}) }, actorUserId: aggregate.room.hostUserId, visibility: "public" },
        );
      if (!result) return false;
      if (finished) await this.completeSession(next);
      if (unattended && next.gameSessionId) await this.releaseClaim(aggregate.room.gameSessionOwnerId ?? next.gameSessionOwnerId ?? aggregate.room.hostUserId, next.gameSessionId, roomId);
      return true;
    });
  }

  async deadlineFor(roomId: string): Promise<{
    version: number;
    turnKey: string;
    deadlineAt: string;
  } | null> {
    const aggregate = await this.store.getRoom(roomId);
    const state = aggregate?.room.serverState;
    if (!aggregate || aggregate.room.status !== "in_game" || !state?.turnKey || !state.deadlineAt || state.aiFailure?.count) return null;
    return { version: aggregate.room.version, turnKey: state.turnKey, deadlineAt: state.deadlineAt };
  }

  async disconnect(userId: string, roomId: string, stillConnected: boolean): Promise<void> { await this.lock(roomId, async () => { if (!stillConnected) await this.store.setPresence(roomId, userId, false); }); }

  /** 在真人动作已提交后独立推进 AI；失败不会回滚真人动作。 */
  async progressAi(roomId: string, signal?: AbortSignal): Promise<boolean> {
    if (signal?.aborted) return false;
    const snapshot = await this.lock(roomId, async () => {
      const current = await this.store.getRoom(roomId);
      if (current?.room.serverState && current.room.status === "in_game" && !this.hasHumanMember(current, current.room.serverState)) {
        await this.closeUnattendedRoom(current);
        return null;
      }
      return current;
    });
    const state = snapshot?.room.serverState;
    if (!snapshot) return (await this.store.getRoom(roomId))?.room.status === "closed";
    if (snapshot.room.status !== "in_game" || !state || state.aiFailure?.paused) return false;
    // 模型请求绝不能占用房间互斥锁；真人操作和离房必须可以立即按版本落库。
    const prepared = this.prepareHumanState(state);
    let resolved: MultiplayerServerState;
    try {
      if (listPendingMultiplayerAiActions(prepared).length) {
        if (!(await this.isAiAvailable())) throw new MultiplayerAiUnavailableError("AI_PROVIDER_NOT_CONFIGURED");
        resolved = await this.aiService!.resolveAiTurns(prepared, snapshot.room.settings.difficulty, signal);
      } else {
        resolved = prepared;
      }
    } catch (cause) {
      if (signal?.aborted) return false;
      let recorded: boolean;
      try {
        recorded = await this.lock(roomId, async () => {
          const current = await this.store.getRoom(roomId);
          if (!current?.room.serverState || current.room.status !== "in_game" || current.room.version !== snapshot.room.version) return false;
          const count = (current.room.serverState.aiFailure?.count ?? 0) + 1;
          const failed = structuredClone(current.room.serverState);
          failed.aiFailure = { count, paused: count >= 3, updatedAt: this.now().toISOString(), code: safeAiErrorCode(cause) };
          failed.deadlineAt = null; failed.turnKey = null; failed.version = current.room.version + 1;
          return (await this.store.transitionRoom(roomId, current.room.version, { serverState: failed }, { type: "ai_progress_failed", payload: { count, paused: count >= 3, code: failed.aiFailure.code }, actorUserId: current.room.hostUserId })) !== null;
        });
      } catch (persistenceCause) {
        throw new MultiplayerAiUnavailableError("AI_FAILURE_CHECKPOINT_FAILED", { cause: persistenceCause });
      }
      if (!recorded) return true; // Discard errors from a state a human has already changed.
      throw cause;
    }
    if (signal?.aborted) return false;
    const next = this.prepareHumanState({ ...resolved, aiFailure: undefined });
    // JSONB can reorder object keys. Compare persisted JSON values so an unchanged
    // human turn neither increments the version nor continuously reschedules AI.
    if (isDeepStrictEqual(JSON.parse(JSON.stringify(next)), JSON.parse(JSON.stringify({ ...state, aiFailure: undefined })))) return false;

    return this.lock(roomId, async () => {
      if (signal?.aborted) return false;
      const current = await this.store.getRoom(roomId);
      if (!current || current.room.status !== "in_game" || !current.room.serverState) return false;
      if (current.room.version !== snapshot.room.version) {
        // 真人已在模型计算期间推进版本；丢弃过期 AI 结果并通知调度器按最新状态重算。
        return true;
      }
      next.version = current.room.version + 1;
      const finished = next.phase === "GAME_END" || next.winner !== null;
      const result = await this.store.applyCommand(
        roomId,
        current.room.version,
        `ai:${current.room.version}:${state.turnKey ?? state.phase}`,
        current.room.hostUserId,
        { status: finished ? "finished" : "in_game", phase: next.phase, day: next.day, winner: next.winner, serverState: next },
        { type: finished ? "game_finished" : "ai_progressed", payload: { phase: next.phase, day: next.day }, actorUserId: current.room.hostUserId, visibility: "public" },
      );
      if (!result) return true;
      if (finished) await this.completeSession(next);
      return !result.duplicate;
    });
  }

  async aiProgressState(roomId: string): Promise<{ active: boolean; paused: boolean; failures: number; version: number | null }> {
    const aggregate = await this.store.getRoom(roomId);
    const state = aggregate?.room.serverState;
    const paused = Boolean(state?.aiFailure?.paused);
    return { active: Boolean(aggregate && state && aggregate.room.status === "in_game" && this.hasHumanMember(aggregate, state) && !paused), paused, failures: state?.aiFailure?.count ?? 0, version: aggregate?.room.version ?? null };
  }

  async retryAi(userId: string, roomId: string, expectedVersion: number): Promise<MultiplayerRoomAck> {
    return this.lock(roomId, async () => {
      const aggregate = await this.store.getRoom(roomId);
      if (!aggregate) return error("ROOM_NOT_FOUND", "房间不存在");
      if (aggregate.room.hostUserId !== userId || !aggregate.members.some(m => m.userId === userId && m.role !== "spectator" && m.seat !== null)) return error("FORBIDDEN", "只有房主可以重试 AI");
      if (aggregate.room.version !== expectedVersion || aggregate.room.status !== "in_game" || !aggregate.room.serverState?.aiFailure?.paused) return error("ROOM_CONFLICT", "请根据最新牌局状态重试");
      const state = this.prepareHumanState({ ...aggregate.room.serverState, aiFailure: undefined });
      state.version = expectedVersion + 1;
      const changed = await this.store.transitionRoom(roomId, expectedVersion, { serverState: state }, { type: "ai_retry_requested", payload: {}, actorUserId: userId });
      if (changed === null) return error("ROOM_CONFLICT", "房间状态已变化");
      const current = await this.store.getRoom(roomId);
      return current ? ok(this.view(current, userId)) : error("ROOM_NOT_FOUND", "房间不存在");
    });
  }

  private hasHumanMember(aggregate: RoomAggregate, state: MultiplayerServerState): boolean {
    // Death and temporary disconnection do not relinquish the right to watch AI finish.
    return state.players.some(p => p.kind === "human" && p.userId && aggregate.members.some(m => m.userId === p.userId && m.role !== "spectator" && m.seat === p.seat));
  }

  private async closeUnattendedRoom(aggregate: RoomAggregate): Promise<boolean> {
    const state = aggregate.room.serverState;
    if (aggregate.room.status !== "in_game" || !state || this.hasHumanMember(aggregate, state)) return false;
    const closed = { ...state, deadlineAt: null, turnKey: null, version: aggregate.room.version + 1 };
    const changed = await this.store.transitionRoom(aggregate.room.id, aggregate.room.version, { status: "closed", serverState: closed }, { type: "room_closed", payload: { reason: "no_human_members" }, actorUserId: aggregate.room.hostUserId });
    if (changed === null) return false;
    if (state.gameSessionId) await this.releaseClaim(aggregate.room.gameSessionOwnerId ?? state.gameSessionOwnerId ?? aggregate.room.hostUserId, state.gameSessionId, aggregate.room.id);
    return true;
  }

  async viewFor(roomId: string, userId: string): Promise<MultiplayerRoomView | null> { const aggregate = await this.store.getRoom(roomId); return aggregate ? this.view(aggregate, userId) : null; }
  async activeRoomIds(): Promise<string[]> { return this.store.listActiveRoomIds(); }
  async purgeHistory(retentionDays: number): Promise<number> { return this.store.purgeExpiredRooms?.(retentionDays) ?? 0; }
  async viewsFor(roomId: string, userIds: string[]): Promise<Map<string, MultiplayerRoomView>> {
    const aggregate = await this.store.getRoom(roomId);
    if (!aggregate) return new Map();
    return new Map([...new Set(userIds)].map((userId) => [userId, this.view(aggregate, userId)]));
  }
  async members(roomId: string): Promise<MultiplayerRoomMember[]> { const aggregate = await this.store.getRoom(roomId); return aggregate?.members ?? []; }

  private prepareHumanState(input: MultiplayerServerState): MultiplayerServerState {
    if (input.aiFailure?.count) return { ...advanceMultiplayerGame(input, { autoAi: false }), deadlineAt: null, turnKey: null };
    return stampMultiplayerDeadline(
      advanceMultiplayerGame(input, { autoAi: false }),
      this.now(),
      this.actionTimeoutMs,
      this.speechTimeoutMs,
    );
  }

  private async isAiAvailable(): Promise<boolean> {
    if (!this.aiService) return false;
    if (!this.aiService.isAvailable) return true;
    return Boolean(await this.aiService.isAvailable());
  }

  private async completeSession(state: MultiplayerServerState): Promise<void> {
    if (!state.gameSessionId || !state.winner || !this.completeGameSession) return;
    try {
      await this.completeGameSession(state.gameSessionId, state.winner, state.day);
    } catch (cause) {
      console.warn("[multiplayer] game session completion failed", cause);
    }
  }

  private async releaseClaim(userId: string, sessionId: string, roomId: string): Promise<void> {
    if (!this.releaseGameSession) return;
    try {
      await this.releaseGameSession(userId, sessionId, roomId);
    } catch (cause) {
      console.warn("[multiplayer] game session claim release failed", cause);
    }
  }

  private view(aggregate: RoomAggregate, userId: string): MultiplayerRoomView {
    const projected = aggregate.room.serverState
      ? projectMultiplayerState(aggregate.room.serverState, userId, aggregate.room.status)
      : {
          publicState: {
            phase: aggregate.room.phase,
            day: aggregate.room.day,
            players: [],
            messages: [],
            currentSpeakerSeat: null,
            badge: {
              holderSeat: null,
              candidates: [],
              signupSeats: [],
              voteProgress: { submitted: 0, total: 0 },
              resultCounts: {},
              destroyed: false,
            },
            voteProgress: { submitted: 0, total: 0, resultCounts: {} },
            lastResult: null,
            winner: null,
            pendingDeaths: [],
            deadlineAt: null,
          },
          privateState: {
            seat: aggregate.members.find((m) => m.userId === userId)?.seat ?? null,
            role: null,
            alignment: null,
            wolfTeammates: [],
            allowedActions: [],
            eligibleTargets: [],
            actionSubmitted: false,
            witchNightKill: null,
            witchHealAvailable: false,
            witchPoisonAvailable: false,
            seerHistory: [],
            wolfVotes: {},
          },
        };
    const state = aggregate.room.serverState;
    if (aggregate.room.status === "in_game" && state) {
      const failure = state.aiFailure;
      projected.publicState.aiProgress = failure?.count || listPendingMultiplayerAiActions(state).length
        ? { status: failure?.paused ? "paused" : failure?.count ? "retrying" : "waiting", failures: failure?.count ?? 0, maxAutomaticFailures: 3, updatedAt: failure?.updatedAt ?? null }
        : null;
    }
    const publicMemberId = (member: MultiplayerRoomMember) =>
      member.userId === userId
        ? userId
        : `member-${aggregate.room.id.slice(0, 8)}-${member.seat ?? `spectator-${createHash("sha256").update(`${aggregate.room.id}:${member.userId}`).digest("hex").slice(0, 12)}`}`;
    const members = aggregate.members.map((member) => ({
      ...member,
      userId: publicMemberId(member),
    }));
    // 超时导致所有真人都进入观战时，数据库为兼容非空 host 字段可能仍保留旧值；
    // 观战者绝不能因此被投影成房主。
    const host = aggregate.members.find((member) => member.userId === aggregate.room.hostUserId && member.role !== "spectator");
    const hostUserId = host ? publicMemberId(host) : `host-${aggregate.room.id.slice(0, 8)}`;
    return { room: { id: aggregate.room.id, code: aggregate.room.code, hostUserId, status: aggregate.room.status, phase: aggregate.room.phase, day: aggregate.room.day, winner: aggregate.room.winner, version: aggregate.room.version, settings: aggregate.room.settings, createdAt: aggregate.room.createdAt, startedAt: aggregate.room.startedAt }, members, ...projected, currentUserId: userId };
  }

  private lock<T>(key: string, action: () => Promise<T>): Promise<T> { const previous = this.locks.get(key) ?? Promise.resolve(); const current = previous.catch(() => undefined).then(action); this.locks.set(key, current); const cleanup = () => { if (this.locks.get(key) === current) this.locks.delete(key); }; void current.then(cleanup, cleanup); return current; }
  private async uniqueCode(): Promise<string> {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    for (;;) {
      const bytes = randomBytes(6);
      const code = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
      if (!(await this.store.getRoom(code))) return code;
    }
  }
  private normalizeCreate(input: CreateMultiplayerRoomInput): MultiplayerRoomSettingsWithName | null { if (!input || typeof input.displayName !== "string") return null; const displayName = normalizeName(input.displayName); const difficulty = input.difficulty; const locale = input.locale; const playerCount = Number(input.playerCount); if (!displayName || !Number.isInteger(playerCount) || playerCount < 8 || playerCount > 12 || !["easy", "normal", "hard"].includes(difficulty) || !["zh", "en"].includes(locale)) return null; return { displayName, playerCount, difficulty, locale }; }
  private normalizeJoin(input: JoinMultiplayerRoomInput): { code: string; displayName: string } | null { if (!input || typeof input.code !== "string" || typeof input.displayName !== "string") return null; const displayName = normalizeName(input.displayName); const code = input.code.trim().toUpperCase(); return displayName && /^[A-Z0-9]{4,12}$/.test(code) ? { code, displayName } : null; }
}

type MultiplayerRoomSettingsWithName = RoomRecord["settings"] & { displayName: string };
function normalizeName(value: string): string { return value.trim().replace(/\s+/g, " ").slice(0, 24); }
function isRoomCodeConflict(cause: unknown): boolean {
  if (!cause || typeof cause !== "object") return false;
  const record = cause as { code?: unknown; constraint?: unknown; message?: unknown };
  return record.code === "23505" && [record.constraint, record.message].some(
    (value) => typeof value === "string" && value.includes("multiplayer_rooms_code"),
  );
}

export function safeAiErrorCode(cause: unknown): string {
  const code = cause instanceof Error ? cause.message : "";
  return /^AI_[A-Z0-9_]{1,70}$/.test(code) ? code : "AI_PROGRESS_FAILED";
}
