/**
 * Demo Mode guest identity helpers.
 *
 * Demo Mode enablement is controlled by database configuration and should be
 * read through `demo-config` modules, not from this file.
 */

const GUEST_ID_STORAGE_KEY = "wolfcha_guest_id";
const GUEST_ID_PREFIX = "guest_";

function generateFingerprint(): string {
  const components: string[] = [];

  if (typeof navigator !== "undefined") {
    components.push(navigator.userAgent);
    components.push(navigator.language);
    components.push(String(navigator.hardwareConcurrency || ""));
    components.push(String(navigator.maxTouchPoints || ""));
  }

  if (typeof screen !== "undefined") {
    components.push(`${screen.width}x${screen.height}`);
    components.push(String(screen.colorDepth));
  }

  if (typeof Intl !== "undefined") {
    components.push(Intl.DateTimeFormat().resolvedOptions().timeZone || "");
  }

  const raw = components.join("|");
  return hashString(raw);
}

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  const hex = (hash >>> 0).toString(16).padStart(8, "0");
  return hex;
}

export function getGuestId(): string {
  if (typeof window === "undefined") return "";

  const stored = localStorage.getItem(GUEST_ID_STORAGE_KEY);
  if (stored && stored.startsWith(GUEST_ID_PREFIX)) {
    return stored;
  }

  const fingerprint = generateFingerprint();
  const guestId = `${GUEST_ID_PREFIX}${fingerprint}`;
  localStorage.setItem(GUEST_ID_STORAGE_KEY, guestId);
  return guestId;
}

export function clearGuestId(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(GUEST_ID_STORAGE_KEY);
}

export function readGuestIdFromStorage(): string | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(GUEST_ID_STORAGE_KEY);
  if (stored && stored.startsWith(GUEST_ID_PREFIX)) {
    return stored;
  }
  return null;
}

export function isGuestUser(userId: string): boolean {
  return userId.startsWith(GUEST_ID_PREFIX);
}
