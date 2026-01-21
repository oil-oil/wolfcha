"use client";

import { useCallback, useEffect, useState } from "react";
import type { AppLocale } from "./config";
import { getLocale, loadLocaleFromStorage, setLocale, subscribeLocale } from "./locale-store";

export function useAppLocale() {
  const [locale, setLocaleState] = useState<AppLocale>(() => getLocale());

  useEffect(() => {
    const stored = loadLocaleFromStorage();
    if (stored !== locale) {
      setLocaleState(stored);
    }
  }, [locale]);

  useEffect(() => {
    const unsubscribe = subscribeLocale((next) => setLocaleState(next));
    return unsubscribe;
  }, []);

  const updateLocale = useCallback((nextLocale: AppLocale) => {
    setLocale(nextLocale);
  }, []);

  return { locale, setLocale: updateLocale };
}
