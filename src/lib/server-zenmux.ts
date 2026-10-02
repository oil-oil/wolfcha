import "server-only";

import { EnvHttpProxyAgent, ProxyAgent, type Dispatcher } from "undici";

export const ZENMUX_CHAT_COMPLETIONS_URL = "https://zenmux.ai/api/v1/chat/completions";

let cachedDispatcher: { config: string; dispatcher: Dispatcher } | undefined;

function getDispatcher(): Dispatcher {
  // Node fetch does not inherit the macOS system proxy. Configure the server
  // explicitly; a ZenMux-specific proxy also leaves domestic providers alone.
  const proxy = process.env.ZENMUX_PROXY_URL?.trim() || "";
  const httpProxy = (process.env.http_proxy ?? process.env.HTTP_PROXY)?.trim() || "";
  const httpsProxy = (process.env.https_proxy ?? process.env.HTTPS_PROXY)?.trim() || "";
  const noProxy = (process.env.no_proxy ?? process.env.NO_PROXY)?.trim() || "";
  const config = JSON.stringify([proxy, httpProxy, httpsProxy, noProxy]);

  if (cachedDispatcher?.config === config) return cachedDispatcher.dispatcher;

  const dispatcher = proxy
    ? new ProxyAgent({ uri: proxy, connectTimeout: 60_000 })
    : new EnvHttpProxyAgent({ httpProxy, httpsProxy, noProxy, connectTimeout: 60_000 });
  const previous = cachedDispatcher;
  cachedDispatcher = { config, dispatcher };
  void previous?.dispatcher.close().catch(() => {});
  return dispatcher;
}

export function fetchZenmux(init: RequestInit): Promise<Response> {
  const options: RequestInit & { dispatcher: Dispatcher } = {
    ...init,
    dispatcher: getDispatcher(),
  };
  return fetch(ZENMUX_CHAT_COMPLETIONS_URL, options);
}
