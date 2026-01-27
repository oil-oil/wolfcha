import { createTranslator } from "next-intl";
import type { AppLocale } from "./config";
import { getLocale } from "./locale-store";
import { getMessages, type AppMessages } from "./messages";

export const getI18n = (locale?: AppLocale) => {
  const activeLocale = locale ?? getLocale();
  const messages = getMessages(activeLocale);

  // Validate messages loaded correctly
  if (!messages || typeof messages !== "object" || Object.keys(messages).length === 0) {
    console.error("[i18n] Messages failed to load for locale:", activeLocale);
  }

  const rawT = createTranslator<AppMessages>({ locale: activeLocale, messages });

  // Wrap translator to detect missing translations (key returned as-is)
  const t: typeof rawT = ((key: string, values?: Record<string, unknown>) => {
    const result = rawT(key as Parameters<typeof rawT>[0], values as Parameters<typeof rawT>[1]);
    // If result equals the key, translation failed
    if (result === key && process.env.NODE_ENV !== "production") {
      console.warn("[i18n] Translation missing or failed for key:", key, "locale:", activeLocale);
    }
    return result;
  }) as typeof rawT;

  // Copy over raw method if it exists
  if ("raw" in rawT) {
    (t as typeof rawT & { raw: typeof rawT.raw }).raw = rawT.raw;
  }

  return { t, locale: activeLocale };
};
