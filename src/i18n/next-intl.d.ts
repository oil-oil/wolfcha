import type { AppMessages } from "./messages";

declare module "next-intl" {
  interface AppConfig {
    Messages: AppMessages;
  }
}
