/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
import { buildMultiplayerPublicState } from "@/multiplayer/engine";
import type { Alignment, Phase } from "@/types/game";
import type {
  MultiplayerRoomMember,
  MultiplayerRoomSettings,
  MultiplayerRoomStatus,
  MultiplayerServerState,
  MultiplayerPublicState,
} from "@/types/multiplayer";

export interface RoomRecord {
  id: string;
  code: string;
  hostUserId: string;
  status: MultiplayerRoomStatus;
  phase: Phase;
  day: number;
  winner: Alignment | null;
  version: number;
  settings: MultiplayerRoomSettings;
  createdAt: string;
  startedAt: string | null;
  serverState: MultiplayerServerState | null;
  /** 创建本局时实际占用额度的用户；房主转移不会修改此值。 */
  gameSessionOwnerId?: string | null;
  /** 客户端可见快照；可选以兼容旧调用方。 */
  publicState?: MultiplayerPublicState | null;
}

export interface RoomAggregate {
  room: RoomRecord;
  members: MultiplayerRoomMember[];
}

export interface RoomEvent {
  type: string;
  payload: unknown;
  actorUserId: string;
  visibility?: "public" | "private";
  visibleToUserIds?: string[];
}

export type RoomCommandEvent = Omit<RoomEvent, "actorUserId"> & { actorUserId?: string };

export type RoomStatePatch = Partial<Pick<RoomRecord, "status" | "phase" | "day" | "winner" | "startedAt" | "serverState" | "publicState" | "gameSessionOwnerId">>;

export interface ApplyCommandResult {
  version: number;
  duplicate: boolean;
}

export interface StartRoomResult {
  version: number;
  authorized: boolean;
}

interface StoredRoomEvent extends RoomEvent {
  version: number;
}

export interface RoomStore {
  createRoom(room: RoomRecord, member: MultiplayerRoomMember): Promise<RoomAggregate>;
  getRoom(roomIdOrCode: string): Promise<RoomAggregate | null>;
  listActiveRoomIds(): Promise<string[]>;
  purgeExpiredRooms?(retentionDays: number): Promise<number>;
  /** Supabase 实现用一个事务完成额度 claim 与 lobby → in_game；其他存储可不实现。 */
  startRoomAtomically?(
    roomId: string,
    expectedVersion: number,
    sessionId: string | null | undefined,
    userId: string,
    patch: RoomStatePatch,
    event: RoomEvent,
  ): Promise<StartRoomResult | null>;
  saveMember(
    roomId: string,
    member: MultiplayerRoomMember,
    expectedVersion: number,
    event: RoomEvent,
  ): Promise<number | null>;
  transitionRoom(
    roomId: string,
    expectedVersion: number,
    patch: RoomStatePatch,
    event: RoomEvent,
  ): Promise<number | null>;
  applyCommand(
    roomId: string,
    expectedVersion: number,
    commandId: string,
    actorUserId: string,
    patch: RoomStatePatch,
    event: RoomCommandEvent,
  ): Promise<ApplyCommandResult | null>;
  /** 在一个事务内把超时真人改为观战、更新房间快照并记录幂等 command。 */
  applyTimeout(
    roomId: string,
    expectedVersion: number,
    commandId: string,
    timedOutUserIds: string[],
    patch: RoomStatePatch,
    event: RoomCommandEvent,
  ): Promise<ApplyCommandResult | null>;
  leaveMember(
    roomId: string,
    userId: string,
    expectedVersion: number,
    patch: RoomStatePatch,
    event: RoomEvent,
  ): Promise<number | null>;
  setPresence(roomId: string, userId: string, connected: boolean): Promise<void>;
}

type AnyClient = {
  from(table: string): any;
  rpc(functionName: string, args: Record<string, unknown>): any;
};

/** Supabase-backed store. Table columns are intentionally plain objects so this remains compatible with generated DB typings. */
export class SupabaseRoomStore implements RoomStore {
  constructor(private readonly client: AnyClient = (require("@/lib/supabase-admin").supabaseAdmin as unknown as AnyClient)) {}

  async createRoom(room: RoomRecord, member: MultiplayerRoomMember): Promise<RoomAggregate> {
    const { data, error } = await this.client.rpc("create_multiplayer_room", {
      p_room_id: room.id,
      p_code: room.code,
      p_host_user_id: room.hostUserId,
      p_status: room.status,
      p_phase: room.phase,
      p_day: room.day,
      p_winner: room.winner,
      p_settings: room.settings,
      p_server_state: room.serverState,
      p_public_state: room.publicState ?? (room.serverState
        ? buildMultiplayerPublicState(room.serverState)
        : { phase: room.phase, day: room.day, players: [] }
      ),
      p_created_at: room.createdAt,
      p_started_at: room.startedAt,
      p_display_name: member.displayName,
      p_seat: member.seat,
      p_ready: member.isReady,
      p_connected: member.isConnected,
    });
    if (error) throw error;
    const result = firstRow(data);
    if (!result) throw new Error("create_multiplayer_room did not return a row");
    return { room: { ...room, version: Number(result.version) }, members: [member] };
  }

  async getRoom(roomIdOrCode: string): Promise<RoomAggregate | null> {
    const roomResult = isUuid(roomIdOrCode)
      ? await this.client.from("multiplayer_rooms").select("*").eq("id", roomIdOrCode).maybeSingle()
      : await this.client.from("multiplayer_rooms").select("*").eq("code", roomIdOrCode.toUpperCase()).maybeSingle();
    if (roomResult.error) throw roomResult.error;
    const roomData = roomResult.data;
    if (!roomData) return null;
    const membersResult = await this.client.from("multiplayer_members").select("*").eq("room_id", roomData.id).order("seat", { ascending: true });
    if (membersResult.error) throw membersResult.error;
    return { room: this.fromRoomRow(roomData), members: (membersResult.data ?? []).map(this.fromMemberRow) };
  }

  async listActiveRoomIds(): Promise<string[]> {
    const { data, error } = await this.client.from("multiplayer_rooms").select("id").eq("status", "in_game");
    if (error) throw error;
    return (data ?? []).map((row: { id: string }) => row.id);
  }

  async purgeExpiredRooms(retentionDays: number): Promise<number> {
    const { data, error } = await this.client.rpc("purge_multiplayer_history", {
      p_retention_days: retentionDays,
    });
    if (error) throw error;
    return Number(data ?? 0);
  }

  async startRoomAtomically(
    roomId: string,
    expectedVersion: number,
    sessionId: string | null | undefined,
    userId: string,
    patch: RoomStatePatch,
    event: RoomEvent,
  ): Promise<StartRoomResult | null> {
    const persistedPatch = patch.serverState && patch.publicState === undefined
      ? { ...patch, publicState: buildMultiplayerPublicState(patch.serverState) }
      : patch;
    const { data, error } = await this.client.rpc("start_multiplayer_room", {
      p_room_id: roomId,
      p_expected_version: expectedVersion,
      p_session_id: sessionId ?? null,
      p_user_id: userId,
      p_patch: persistedPatch,
      p_event_type: event.type,
      p_event_payload: event.payload,
    });
    if (error) throw error;
    const result = firstRow(data);
    return result ? { version: Number(result.version), authorized: Boolean(result.authorized) } : null;
  }

  async saveMember(roomId: string, member: MultiplayerRoomMember, expectedVersion: number, event: RoomEvent): Promise<number | null> {
    const { data, error } = await this.client.rpc("upsert_multiplayer_member", {
      p_room_id: roomId,
      p_expected_version: expectedVersion,
      p_actor_user_id: event.actorUserId,
      p_user_id: member.userId,
      p_display_name: member.displayName,
      p_role: member.role,
      p_seat: member.seat,
      p_ready: member.isReady,
      p_connected: member.isConnected,
      p_event_type: event.type,
      p_event_payload: event.payload,
    });
    if (error) throw error;
    const result = firstRow(data);
    return result ? Number(result.version) : null;
  }

  async transitionRoom(roomId: string, expectedVersion: number, patch: RoomStatePatch, event: RoomEvent): Promise<number | null> {
    const { data, error } = await this.client.rpc("transition_multiplayer_room", {
      p_room_id: roomId,
      p_expected_version: expectedVersion,
      p_actor_user_id: event.actorUserId,
      p_status: patch.status ?? null,
      p_phase: patch.phase ?? null,
      p_day: patch.day ?? null,
      p_winner: patch.winner ?? null,
      p_server_state: patch.serverState ?? null,
      p_public_state: patch.publicState ?? (patch.serverState ? buildMultiplayerPublicState(patch.serverState) : null),
      p_started_at: patch.startedAt ?? null,
      p_finished_at: null,
      p_event_type: event.type,
      p_event_payload: event.payload,
    });
    if (error) throw error;
    const result = firstRow(data);
    return result ? Number(result.version) : null;
  }

  async applyCommand(roomId: string, expectedVersion: number, commandId: string, actorUserId: string, patch: RoomStatePatch, event: RoomCommandEvent): Promise<ApplyCommandResult | null> {
    const persistedPatch = patch.serverState && patch.publicState === undefined
      ? { ...patch, publicState: buildMultiplayerPublicState(patch.serverState) }
      : patch;
    const { data, error } = await this.client.rpc("apply_multiplayer_command", {
      p_room_id: roomId,
      p_expected_version: expectedVersion,
      p_command_id: commandId,
      p_actor_user_id: actorUserId,
      p_patch: persistedPatch,
      p_event_type: event.type,
      p_event_payload: event.payload,
      p_event_visibility: event.visibility ?? "public",
      p_visible_to_user_ids: event.visibleToUserIds ?? null,
    });
    if (error) throw error;
    const result = firstRow(data);
    return result ? { version: Number(result.version), duplicate: Boolean(result.duplicate) } : null;
  }

  async applyTimeout(roomId: string, expectedVersion: number, commandId: string, timedOutUserIds: string[], patch: RoomStatePatch, event: RoomCommandEvent): Promise<ApplyCommandResult | null> {
    const persistedPatch = patch.serverState && patch.publicState === undefined
      ? { ...patch, publicState: buildMultiplayerPublicState(patch.serverState) }
      : patch;
    const { data, error } = await this.client.rpc("takeover_multiplayer_timeout", {
      p_room_id: roomId,
      p_expected_version: expectedVersion,
      p_command_id: commandId,
      p_actor_user_id: event.actorUserId,
      p_timed_out_user_ids: timedOutUserIds,
      p_patch: persistedPatch,
      p_event_type: event.type,
      p_event_payload: event.payload,
    });
    if (error) throw error;
    const result = firstRow(data);
    return result ? { version: Number(result.version), duplicate: Boolean(result.duplicate) } : null;
  }

  async leaveMember(roomId: string, userId: string, expectedVersion: number, patch: RoomStatePatch, event: RoomEvent): Promise<number | null> {
    const persistedPatch = patch.serverState && patch.publicState === undefined
      ? { ...patch, publicState: buildMultiplayerPublicState(patch.serverState) }
      : patch;
    const { data, error } = await this.client.rpc("leave_multiplayer_room", {
      p_room_id: roomId,
      p_user_id: userId,
      p_expected_version: expectedVersion,
      p_patch: persistedPatch,
      p_event_type: event.type,
      p_event_payload: event.payload,
    });
    if (error) throw error;
    const result = firstRow(data);
    return result ? Number(result.version) : null;
  }

  async setPresence(roomId: string, userId: string, connected: boolean): Promise<void> {
    const { error } = await this.client.from("multiplayer_members").update({ connected, last_seen_at: new Date().toISOString() }).eq("room_id", roomId).eq("user_id", userId);
    if (error) throw error;
  }

  private fromRoomRow(row: any): RoomRecord {
    return { id: row.id, code: row.code, hostUserId: row.host_user_id, status: row.status, phase: row.phase, day: Number(row.day ?? 1), winner: row.winner ?? null, version: Number(row.version ?? 0), settings: row.settings, createdAt: row.created_at, startedAt: row.started_at ?? null, serverState: row.server_state ?? null, publicState: row.public_state ?? null, gameSessionOwnerId: row.game_session_owner_id ?? row.server_state?.gameSessionOwnerId ?? null };
  }
  private fromMemberRow(row: any): MultiplayerRoomMember {
    return { userId: row.user_id, displayName: row.display_name, role: row.role, seat: row.seat === null || row.seat === undefined ? null : Number(row.seat), isReady: Boolean(row.ready), isConnected: Boolean(row.connected) };
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function firstRow(data: unknown): Record<string, unknown> | null {
  if (Array.isArray(data)) return (data[0] as Record<string, unknown> | undefined) ?? null;
  return data && typeof data === "object" ? data as Record<string, unknown> : null;
}

/** Deterministic in-memory store used by tests and local runs without Supabase tables. */
export class MemoryRoomStore implements RoomStore {
  private readonly rooms = new Map<string, RoomAggregate>();
  private readonly commands = new Map<string, ApplyCommandResult>();
  private readonly events = new Map<string, StoredRoomEvent[]>();
  async createRoom(room: RoomRecord, member: MultiplayerRoomMember) { const aggregate = { room, members: [member] }; this.rooms.set(room.id, aggregate); this.events.set(room.id, []); return this.clone(aggregate); }
  async getRoom(idOrCode: string) { const key = idOrCode.toUpperCase(); const found = [...this.rooms.values()].find(({ room }) => room.id === idOrCode || room.code === key); return found ? this.clone(found) : null; }
  async listActiveRoomIds() { return [...this.rooms.values()].filter(({ room }) => room.status === "in_game").map(({ room }) => room.id); }
  async purgeExpiredRooms() { return 0; }
  async saveMember(roomId: string, member: MultiplayerRoomMember, expectedVersion: number, event?: RoomEvent) { void event; const aggregate = this.rooms.get(roomId); if (!aggregate || aggregate.room.version !== expectedVersion) return null; const index = aggregate.members.findIndex((item) => item.userId === member.userId); if (index >= 0) aggregate.members[index] = { ...member }; else aggregate.members.push({ ...member }); aggregate.room.version += 1; return aggregate.room.version; }
  async transitionRoom(roomId: string, expectedVersion: number, patch: RoomStatePatch) { const found = this.rooms.get(roomId); if (!found || found.room.version !== expectedVersion) return null; found.room = { ...found.room, ...patch, version: expectedVersion + 1 }; return found.room.version; }
  async applyCommand(roomId: string, expectedVersion: number, commandId: string, actorUserId: string, patch: RoomStatePatch, event?: RoomCommandEvent): Promise<ApplyCommandResult | null> {
    const key = `${roomId}:${commandId}`;
    const prior = this.commands.get(key);
    if (prior) return { ...prior, duplicate: true };
    const found = this.rooms.get(roomId);
    if (!found || found.room.version !== expectedVersion) return null;
    const version = expectedVersion + 1;
    const persistedPatch = patch.serverState && patch.publicState === undefined
      ? { ...patch, publicState: buildMultiplayerPublicState(patch.serverState) }
      : patch;
    found.room = { ...found.room, ...persistedPatch, version };
    const result = { version, duplicate: false };
    this.commands.set(key, result);
    if (event) {
      const roomEvents = this.events.get(roomId) ?? [];
      roomEvents.push({ ...event, actorUserId, version });
      this.events.set(roomId, roomEvents);
    }
    return result;
  }
  async applyTimeout(roomId: string, expectedVersion: number, commandId: string, timedOutUserIds: string[], patch: RoomStatePatch, event: RoomCommandEvent): Promise<ApplyCommandResult | null> {
    const key = `${roomId}:${commandId}`;
    const prior = this.commands.get(key);
    if (prior) return { ...prior, duplicate: true };
    const found = this.rooms.get(roomId);
    if (!found || found.room.version !== expectedVersion) return null;
    const timedOut = new Set(timedOutUserIds);
    for (const member of found.members) {
      if (!timedOut.has(member.userId) || member.role === "spectator") continue;
      member.role = "spectator";
      member.seat = null;
      member.isReady = false;
      member.isConnected = false;
    }
    const activeMembers = found.members
      .filter((member) => member.role !== "spectator")
      .sort((left, right) => (left.seat ?? Number.MAX_SAFE_INTEGER) - (right.seat ?? Number.MAX_SAFE_INTEGER));
    if (activeMembers.length && !activeMembers.some((member) => member.userId === found.room.hostUserId)) {
      found.room.hostUserId = activeMembers[0].userId;
      for (const member of activeMembers) member.role = member.userId === found.room.hostUserId ? "host" : "player";
    }
    const persistedPatch = patch.serverState && patch.publicState === undefined
      ? { ...patch, publicState: buildMultiplayerPublicState(patch.serverState) }
      : patch;
    const version = expectedVersion + 1;
    found.room = { ...found.room, ...persistedPatch, version };
    const result = { version, duplicate: false };
    this.commands.set(key, result);
    const roomEvents = this.events.get(roomId) ?? [];
    roomEvents.push({ ...event, actorUserId: event.actorUserId ?? found.room.hostUserId, version });
    this.events.set(roomId, roomEvents);
    return result;
  }
  async leaveMember(roomId: string, userId: string, expectedVersion: number, patch: RoomStatePatch, event: RoomEvent) {
    const found = this.rooms.get(roomId);
    if (!found || found.room.version !== expectedVersion) return null;
    const leaving = found.members.find((member) => member.userId === userId && member.role !== "spectator");
    if (!leaving) return null;
    leaving.role = "spectator";
    leaving.seat = null;
    leaving.isReady = false;
    leaving.isConnected = false;
    const activeMembers = found.members
      .filter((member) => member.role !== "spectator")
      .sort((left, right) => (left.seat ?? Number.MAX_SAFE_INTEGER) - (right.seat ?? Number.MAX_SAFE_INTEGER));
    if (found.room.hostUserId === userId && activeMembers[0]) {
      activeMembers[0].role = "host";
      found.room.hostUserId = activeMembers[0].userId;
    }
    const status = activeMembers.length === 0 ? "closed" : patch.status;
    const persistedPatch = patch.serverState && patch.publicState === undefined
      ? { ...patch, publicState: buildMultiplayerPublicState(patch.serverState), ...(status ? { status } : {}) }
      : { ...patch, ...(status ? { status } : {}) };
    found.room = { ...found.room, ...persistedPatch, version: expectedVersion + 1 };
    const roomEvents = this.events.get(roomId) ?? [];
    roomEvents.push({ ...event, version: found.room.version });
    this.events.set(roomId, roomEvents);
    return found.room.version;
  }
  async setPresence(roomId: string, userId: string, connected: boolean) { const found = this.rooms.get(roomId); const member = found?.members.find((m) => m.userId === userId); if (member) member.isConnected = connected; }
  private clone(value: RoomAggregate): RoomAggregate { return structuredClone(value); }
}
