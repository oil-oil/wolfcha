"use client";

import { NextIntlClientProvider } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { defaultLocale, localeToHtmlLang, type AppLocale } from "./config";
import { getMessages } from "./messages";
import { loadLocaleFromStorage, setLocale as setLocaleStore, subscribeLocale } from "./locale-store";

type I18nProviderProps = {
  children: React.ReactNode;
};

export function I18nProvider({ children }: I18nProviderProps) {
  const [locale, setLocale] = useState<AppLocale>(defaultLocale);

  useEffect(() => {
    const stored = loadLocaleFromStorage();
    if (stored !== locale) {
      setLocale(stored);
    }
  }, [locale]);

  useEffect(() => {
    const unsubscribe = subscribeLocale((next) => setLocale(next));
    return unsubscribe;
  }, []);

  useEffect(() => {
    setLocaleStore(locale);
    if (typeof document !== "undefined") {
      document.documentElement.lang = localeToHtmlLang[locale];
    }
  }, [locale]);

  const messages = useMemo(() => getMessages(locale), [locale]);

  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Shanghai">
      {children}
    </NextIntlClientProvider>
  );
}
