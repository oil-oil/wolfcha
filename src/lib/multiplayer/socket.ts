import { io, type Socket } from "socket.io-client";
import type {
  MultiplayerClientToServerEvents,
  MultiplayerServerToClientEvents,
} from "@/types/multiplayer";

export type MultiplayerSocket = Socket<
  MultiplayerServerToClientEvents,
  MultiplayerClientToServerEvents
>;

function isLoopbackHostname(hostname: string): boolean {
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(
    hostname.toLowerCase(),
  );
}

/**
 * 本地服务通过局域网地址打开时，Socket 也必须连接到同一台主机，
 * 不能继续指向访问者设备自己的 localhost。
 */
export function resolveMultiplayerServerUrl(
  configuredUrl: string | undefined,
  pageHostname?: string,
): string {
  if (!configuredUrl) throw new Error("多人游戏服务暂未配置，请稍后再试");
  const url = new URL(configuredUrl);
  if (
    pageHostname &&
    isLoopbackHostname(url.hostname) &&
    !isLoopbackHostname(pageHostname)
  ) {
    url.hostname = pageHostname;
  }
  return url.toString().replace(/\/$/, "");
}

/** 创建多人游戏 socket。token 只放在 handshake auth，不进入 URL 或日志。 */
export function createMultiplayerSocket(accessToken: string): MultiplayerSocket {
  const url = resolveMultiplayerServerUrl(
    process.env.NEXT_PUBLIC_GAME_SERVER_URL,
    typeof window === "undefined" ? undefined : window.location.hostname,
  );

  const socket = io(url, {
    autoConnect: false,
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 800,
    reconnectionDelayMax: 8000,
    auth: { token: accessToken },
  });
  return socket as MultiplayerSocket;
}
