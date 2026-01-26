import { STORAGE_KEY, defaultLocale, type AppLocale } from "./config";

let currentLocale: AppLocale = defaultLocale;
const listeners = new Set<(locale: AppLocale) => void>();

const LOCALE_PREFIX = "/zh";

const hasZhPrefix = (pathname: string) => /^\/zh(\/|$)/.test(pathname);

const readLocaleFromStorage = (): AppLocale | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "zh" || raw === "en") return raw;
  } catch {
    // Ignore storage errors
  }
  return null;
};

const readLocaleFromCookie = (): AppLocale | null => {
  if (typeof document === "undefined") return null;
  try {
    const parts = document.cookie.split(";");
    for (const part of parts) {
      const [keyRaw, valueRaw] = part.split("=");
      const key = keyRaw?.trim();
      if (key !== STORAGE_KEY) continue;
      const value = (valueRaw ?? "").trim();
      if (value === "zh" || value === "en") return value;
    }
  } catch {
    // Ignore cookie errors
  }
  return null;
};

const stripLocalePrefix = (pathname: string) => {
  return pathname.replace(/^\/zh(\/|$)/, "/");
};

const applyLocaleToPathname = (pathname: string, locale: AppLocale) => {
  const normalized = stripLocalePrefix(pathname) || "/";
  if (locale === "zh") {
    return normalized === "/" ? LOCALE_PREFIX : `${LOCALE_PREFIX}${normalized}`;
  }
  return normalized;
};

const getLocaleFromPathname = (pathname: string): AppLocale => {
  return hasZhPrefix(pathname) ? "zh" : "en";
};

const resolvePreferredLocale = (): AppLocale => {
  if (typeof window !== "undefined") {
    try {
      const urlLocale = getLocaleFromPathname(window.location.pathname);
      if (urlLocale === "zh") return "zh";
    } catch {
      // Ignore URL errors
    }
  }

  const stored = readLocaleFromStorage();
  if (stored) return stored;

  const cookie = readLocaleFromCookie();
  if (cookie) return cookie;

  return currentLocale;
};

export const getLocale = (): AppLocale => {
  if (typeof window !== "undefined") {
    try {
      const preferred = resolvePreferredLocale();
      if (preferred !== currentLocale) currentLocale = preferred;
    } catch {
      // Ignore URL errors
    }
  }
  return currentLocale;
};

export const setLocale = (locale: AppLocale): void => {
  if (locale === currentLocale) return;
  currentLocale = locale;
  listeners.forEach((listener) => listener(locale));
  if (typeof window !== "undefined") {
    try {
      const url = new URL(window.location.href);
      const nextPath = applyLocaleToPathname(url.pathname, locale);
      if (nextPath !== url.pathname) {
        url.pathname = nextPath;
        window.history.pushState({}, "", url.toString());
      }
    } catch {
      // Ignore URL errors
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // Ignore storage errors
    }
    // Set cookie for middleware to read on next request
    try {
      document.cookie = `${STORAGE_KEY}=${locale};path=/;max-age=31536000;SameSite=Lax`;
    } catch {
      // Ignore cookie errors
    }
  }
};

export const subscribeLocale = (listener: (locale: AppLocale) => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const loadLocaleFromStorage = (): AppLocale => {
  if (typeof window === "undefined") return currentLocale;
  try {
    const preferred = resolvePreferredLocale();
    currentLocale = preferred;
  } catch {
    // Ignore storage errors
  }
  return currentLocale;
};
