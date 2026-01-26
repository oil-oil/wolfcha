export const STORAGE_KEY = "wolfcha.locale";

export const supportedLocales = ["zh", "en"] as const;
export type AppLocale = (typeof supportedLocales)[number];

export const defaultLocale: AppLocale = "en";

export const localeLabels: Record<AppLocale, string> = {
  zh: "中文",
  en: "English",
};

export const localeToHtmlLang: Record<AppLocale, string> = {
  zh: "zh-CN",
  en: "en",
};

export const isSupportedLocale = (value?: string | null): value is AppLocale => {
  return supportedLocales.includes(value as AppLocale);
};
