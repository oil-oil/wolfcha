import { STORAGE_KEY, defaultLocale, type AppLocale } from "./config";

let currentLocale: AppLocale = defaultLocale;
const listeners = new Set<(locale: AppLocale) => void>();

const LOCALE_PREFIX = "/zh";

const hasZhPrefix = (pathname: string) => /^\/zh(\/|$)/.test(pathname);

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

export const getLocale = (): AppLocale => {
  if (typeof window !== "undefined") {
    try {
      const urlLocale = getLocaleFromPathname(window.location.pathname);
      if (urlLocale !== currentLocale) {
        currentLocale = urlLocale;
      }
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
  }
};

export const subscribeLocale = (listener: (locale: AppLocale) => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const loadLocaleFromStorage = (): AppLocale => {
  if (typeof window === "undefined") return currentLocale;
  try {
    const urlLocale = getLocaleFromPathname(window.location.pathname);
    currentLocale = urlLocale;
  } catch {
    // Ignore storage errors
  }
  return currentLocale;
};
