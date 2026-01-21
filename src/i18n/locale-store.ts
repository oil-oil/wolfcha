import { STORAGE_KEY, defaultLocale, isSupportedLocale, type AppLocale } from "./config";

let currentLocale: AppLocale = defaultLocale;
const listeners = new Set<(locale: AppLocale) => void>();

export const getLocale = (): AppLocale => currentLocale;

export const setLocale = (locale: AppLocale): void => {
  if (locale === currentLocale) return;
  currentLocale = locale;
  listeners.forEach((listener) => listener(locale));
  if (typeof window !== "undefined") {
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
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (isSupportedLocale(raw)) {
      currentLocale = raw;
    }
  } catch {
    // Ignore storage errors
  }
  return currentLocale;
};
