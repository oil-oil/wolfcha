export type DemoModePublicConfigSnapshot = {
  source: "database";
  enabled: boolean;
  active: boolean;
  startsAt: string | null;
  expiresAt: string | null;
  serverNow: string;
};

const DEMO_CONFIG_ENDPOINT = "/api/demo-config";

let cachedDemoModeConfig: DemoModePublicConfigSnapshot | null = null;
let inFlightDemoModeConfigRequest: Promise<DemoModePublicConfigSnapshot> | null = null;

export function getDefaultDemoModeConfigSnapshot(now: Date = new Date()): DemoModePublicConfigSnapshot {
  return {
    source: "database",
    enabled: false,
    active: false,
    startsAt: null,
    expiresAt: null,
    serverNow: now.toISOString(),
  };
}

export function getCachedDemoModeConfig(): DemoModePublicConfigSnapshot | null {
  return cachedDemoModeConfig;
}

export function setCachedDemoModeConfig(snapshot: DemoModePublicConfigSnapshot) {
  cachedDemoModeConfig = snapshot;
}

export function isCachedDemoModeActiveClient(): boolean {
  return cachedDemoModeConfig?.active ?? false;
}

export async function fetchDemoModeConfigClient(forceRefresh = false): Promise<DemoModePublicConfigSnapshot> {
  if (!forceRefresh && cachedDemoModeConfig) {
    return cachedDemoModeConfig;
  }

  if (!forceRefresh && inFlightDemoModeConfigRequest) {
    return inFlightDemoModeConfigRequest;
  }

  const request = fetch(DEMO_CONFIG_ENDPOINT, {
    method: "GET",
    cache: "no-store",
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to fetch demo config: ${response.status}`);
      }

      const payload = (await response.json()) as Partial<DemoModePublicConfigSnapshot>;
      const snapshot: DemoModePublicConfigSnapshot = {
        source: "database",
        enabled: payload.enabled === true,
        active: payload.active === true,
        startsAt: typeof payload.startsAt === "string" ? payload.startsAt : null,
        expiresAt: typeof payload.expiresAt === "string" ? payload.expiresAt : null,
        serverNow:
          typeof payload.serverNow === "string"
            ? payload.serverNow
            : new Date().toISOString(),
      };

      setCachedDemoModeConfig(snapshot);
      return snapshot;
    })
    .catch((error) => {
      console.error("[demo-config] Failed to fetch client config", error);
      const fallback = getDefaultDemoModeConfigSnapshot();
      setCachedDemoModeConfig(fallback);
      return fallback;
    })
    .finally(() => {
      if (inFlightDemoModeConfigRequest === request) {
        inFlightDemoModeConfigRequest = null;
      }
    });

  inFlightDemoModeConfigRequest = request;
  return request;
}
