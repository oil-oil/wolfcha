import { createTranslator } from "next-intl";
import type { AppLocale } from "./config";
import { getLocale } from "./locale-store";
import { getMessages, type AppMessages } from "./messages";

export const getI18n = (locale?: AppLocale) => {
  const activeLocale = locale ?? getLocale();
  const messages = getMessages(activeLocale);
  const t = createTranslator<AppMessages>({ locale: activeLocale, messages });
  return { t, locale: activeLocale };
};
