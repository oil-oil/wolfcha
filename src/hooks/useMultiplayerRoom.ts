"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type {
  CreateMultiplayerRoomInput,
  JoinMultiplayerRoomInput,
  MultiplayerRoomAck,
  MultiplayerRoomError,
  MultiplayerRoomView,
  MultiplayerGameCommand,
} from "@/types/multiplayer";
import { createMultiplayerSocket, type MultiplayerSocket } from "@/lib/multiplayer/socket";

export type MultiplayerConnectionStatus =
  | "idle"
  | "loading"
  | "connected"
  | "reconnecting"
  | "error";

export type MultiplayerAuthStatus = "loading" | "authenticated" | "unauthenticated";

interface UseMultiplayerRoomOptions {
  /** 动态房间页传入 code；连接成功后自动发送 room:resume。 */
  roomCode?: string;
}

interface ActionResult {
  ok: boolean;
  error?: MultiplayerRoomError;
}

export function useMultiplayerRoom(options: UseMultiplayerRoomOptions = {}) {
  const [view, setView] = useState<MultiplayerRoomView | null>(null);
  const [status, setStatus] = useState<MultiplayerConnectionStatus>("idle");
  const [error, setError] = useState<MultiplayerRoomError | null>(null);
  const [authStatus, setAuthStatus] = useState<MultiplayerAuthStatus>("loading");
  const [actionLoading, setActionLoading] = useState(false);
  const socketRef = useRef<MultiplayerSocket | null>(null);
  const connectingRef = useRef(false);
  const connectRef = useRef<((knownAccessToken?: string) => Promise<void>) | null>(null);
  const resumeCodeRef = useRef(options.roomCode);

  useEffect(() => {
    resumeCodeRef.current = options.roomCode;
  }, [options.roomCode]);

  const handleAck = useCallback((result: MultiplayerRoomAck): ActionResult => {
    if (!result.ok) {
      setError(result.error);
      return { ok: false, error: result.error };
    }
    setView(result.view);
    setError(null);
    setAuthStatus("authenticated");
    return { ok: true };
  }, []);

  useEffect(() => {
    let disposed = false;

    const connect = async (knownAccessToken?: string) => {
      if (connectingRef.current || socketRef.current) return;
      connectingRef.current = true;
      setStatus("loading");
      const { data, error: sessionError } = knownAccessToken
        ? { data: { session: { access_token: knownAccessToken } }, error: null }
        : await supabase.auth.getSession();
      if (disposed) return;
      if (sessionError || !data.session?.access_token) {
        setAuthStatus("unauthenticated");
        setStatus("idle");
        connectingRef.current = false;
        return;
      }
      setAuthStatus("authenticated");

      let socket: MultiplayerSocket;
      try {
        socket = createMultiplayerSocket(data.session.access_token);
      } catch (e) {
        setStatus("error");
        setError({ code: "INTERNAL_ERROR", message: e instanceof Error ? e.message : "无法连接多人服务" });
        connectingRef.current = false;
        return;
      }
      socketRef.current = socket;
      connectingRef.current = false;
      socket.on("connect", () => {
        setStatus("connected");
        setError(null);
        const code = resumeCodeRef.current;
        if (code) {
          socket.emit("room:resume", { roomIdOrCode: code }, handleAck);
        }
      });
      socket.on("disconnect", () => {
        if (!disposed) setStatus("reconnecting");
      });
      socket.io.on("reconnect_attempt", () => setStatus("reconnecting"));
      socket.io.on("reconnect", () => {
        setStatus("connected");
        setError(null);
      });
      socket.on("connect_error", (connectError) => {
        if (!disposed) {
          setStatus("error");
          setError({ code: "INTERNAL_ERROR", message: connectError.message || "多人服务连接失败" });
        }
      });
      socket.on("room:view", (nextView) => {
        setView(nextView);
        setError(null);
      });
      socket.on("room:error", (roomError) => setError(roomError));
      socket.connect();
    };
    connectRef.current = connect;

    const localTestToken = getLocalMultiplayerTestToken();
    void connect(localTestToken);
    let removeAuthListener: () => void = () => undefined;
    if (!localTestToken) {
      const authSubscription = supabase.auth.onAuthStateChange((_event, session) => {
        if (!session?.access_token) {
          socketRef.current?.disconnect();
          socketRef.current = null;
          setView(null);
          setAuthStatus("unauthenticated");
          setStatus("idle");
          return;
        }

        const socket = socketRef.current;
        if (!socket) {
          void connect(session.access_token);
          return;
        }

        socket.auth = { token: session.access_token };
        if (!socket.connected) socket.connect();
      });
      removeAuthListener = () => authSubscription.data.subscription.unsubscribe();
    }

    return () => {
      disposed = true;
      removeAuthListener();
      socketRef.current?.removeAllListeners();
      socketRef.current?.disconnect();
      socketRef.current = null;
      connectingRef.current = false;
      connectRef.current = null;
    };
  }, [handleAck]);

  const retryConnection = useCallback(() => {
    setError(null);
    const socket = socketRef.current;
    if (socket) {
      setStatus("reconnecting");
      socket.connect();
      return;
    }
    void connectRef.current?.();
  }, []);

  const request = useCallback(async (
    invoke: (socket: MultiplayerSocket, callback: (result: MultiplayerRoomAck) => void) => void,
  ): Promise<ActionResult> => {
    const socket = socketRef.current;
    if (!socket || !socket.connected) {
      const nextError: MultiplayerRoomError = { code: "INTERNAL_ERROR", message: "连接尚未就绪，请稍后重试" };
      setError(nextError);
      return { ok: false, error: nextError };
    }
    setActionLoading(true);
    try {
      const result = await new Promise<MultiplayerRoomAck>((resolve) => {
        let settled = false;
        const finish = (ack: MultiplayerRoomAck) => {
          if (settled) return;
          settled = true;
          socket.off("disconnect", onDisconnect);
          resolve(ack);
        };
        const onDisconnect = () => finish({
          ok: false,
          error: { code: "INTERNAL_ERROR", message: "连接中断，操作结果尚未确认；恢复连接后可以重试" },
        });
        socket.once("disconnect", onDisconnect);
        try {
          invoke(socket, finish);
        } catch (cause) {
          finish({
            ok: false,
            error: { code: "INTERNAL_ERROR", message: cause instanceof Error ? cause.message : "操作提交失败，请重试" },
          });
        }
      });
      return handleAck(result);
    } catch (cause) {
      const nextError: MultiplayerRoomError = {
        code: "INTERNAL_ERROR",
        message: cause instanceof Error ? cause.message : "操作提交失败，请重试",
      };
      setError(nextError);
      return { ok: false, error: nextError };
    } finally {
      setActionLoading(false);
    }
  }, [handleAck]);

  const createRoom = useCallback((input: CreateMultiplayerRoomInput) => {
    if (!input.displayName.trim() || input.displayName.trim().length > 24 || input.playerCount < 8 || input.playerCount > 12) {
      const nextError: MultiplayerRoomError = { code: "INVALID_INPUT", message: "请填写昵称（1-24 字）并选择 8-12 人" };
      setError(nextError);
      return Promise.resolve({ ok: false, error: nextError } as ActionResult);
    }
    return request((socket, callback) => socket.emit("room:create", { ...input, displayName: input.displayName.trim() }, callback));
  }, [request]);

  const joinRoom = useCallback((input: JoinMultiplayerRoomInput) => {
    const code = input.code.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,12}$/.test(code) || !input.displayName.trim() || input.displayName.trim().length > 24) {
      const nextError: MultiplayerRoomError = { code: "INVALID_INPUT", message: "请输入有效房间码和 1-24 字昵称" };
      setError(nextError);
      return Promise.resolve({ ok: false, error: nextError } as ActionResult);
    }
    return request((socket, callback) => socket.emit("room:join", { code, displayName: input.displayName.trim() }, callback));
  }, [request]);

  const resumeRoom = useCallback((roomIdOrCode: string) =>
    request((socket, callback) => socket.emit("room:resume", { roomIdOrCode }, callback)), [request]);

  const setReady = useCallback((isReady: boolean) => {
    if (!view) return Promise.resolve({ ok: false } as ActionResult);
    return request((socket, callback) => socket.emit("room:ready", { roomId: view.room.id, isReady, expectedVersion: view.room.version }, callback));
  }, [request, view]);

  const startRoom = useCallback((gameSessionId?: string | null) => {
    if (!view) return Promise.resolve({ ok: false } as ActionResult);
    return request((socket, callback) => socket.emit("room:start", { roomId: view.room.id, expectedVersion: view.room.version, gameSessionId }, callback));
  }, [request, view]);

  const leaveRoom = useCallback(() => {
    if (!view) return Promise.resolve({ ok: false } as ActionResult);
    return request((socket, callback) => socket.emit("room:leave", {
      roomId: view.room.id,
      expectedVersion: view.room.version,
    }, callback));
  }, [request, view]);

  const closeRoom = useCallback(() => {
    if (!view) return Promise.resolve({ ok: false } as ActionResult);
    return request((socket, callback) => socket.emit("room:close", {
      roomId: view.room.id,
      expectedVersion: view.room.version,
    }, callback));
  }, [request, view]);

  /** 提交游戏阶段动作；所有动作统一走 game:command 并携带版本号。 */
  const submitGameCommand = useCallback((command: MultiplayerGameCommand) => {
    return request((socket, callback) => socket.emit("game:command", command, callback));
  }, [request]);

  return {
    view,
    status,
    error,
    authStatus,
    authRequired: authStatus === "unauthenticated",
    actionLoading,
    retryConnection,
    createRoom,
    joinRoom,
    resumeRoom,
    setReady,
    startRoom,
    leaveRoom,
    closeRoom,
    submitGameCommand,
  };
}

function getLocalMultiplayerTestToken(): string | undefined {
  if (process.env.NEXT_PUBLIC_GAME_SERVER_TEST_MODE !== "true" || typeof window === "undefined") return undefined;
  const storageKey = "wolfcha_multiplayer_test_user";
  const queryUser = new URLSearchParams(window.location.search).get("__multiplayerUser");
  if (queryUser && /^[a-z0-9][a-z0-9-]{0,47}$/i.test(queryUser)) {
    window.sessionStorage.setItem(storageKey, queryUser);
  }
  const userId = window.sessionStorage.getItem(storageKey);
  return userId && /^[a-z0-9][a-z0-9-]{0,47}$/i.test(userId)
    ? `local-test:${userId}`
    : undefined;
}
