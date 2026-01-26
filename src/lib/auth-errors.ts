import { getI18n } from "@/i18n/translator";

export const authErrorTranslations: Record<string, string> = {
  "Invalid login credentials": "authErrors.invalidLogin",
  "Email not confirmed": "authErrors.emailNotConfirmed",
  "User already registered": "authErrors.userAlreadyRegistered",
  "Password should be at least 6 characters": "authErrors.passwordTooShort",
  "Unable to validate email address: invalid format": "authErrors.invalidEmail",
  "Signup requires a valid password": "authErrors.signupRequiresPassword",
  "To signup, please provide your email": "authErrors.signupRequiresEmail",
  "Email rate limit exceeded": "authErrors.emailRateLimit",
  "For security purposes, you can only request this after": "authErrors.rateLimitWait",
  "Email link is invalid or has expired": "authErrors.emailLinkInvalid",
  "Token has expired or is invalid": "authErrors.tokenInvalid",
  "New password should be different from the old password": "authErrors.samePassword",
  "Auth session missing": "authErrors.sessionMissing",
  "User not found": "authErrors.userNotFound",
};

export function translateAuthError(message: string): string {
  const { t } = getI18n();
  if (authErrorTranslations[message]) {
    return t(authErrorTranslations[message] as Parameters<typeof t>[0]);
  }

  for (const [key, translation] of Object.entries(authErrorTranslations)) {
    if (message.includes(key)) {
      const secondsMatch = message.match(/after (\d+) seconds?/);
      if (secondsMatch) {
        return t("authErrors.rateLimitSeconds", { seconds: secondsMatch[1] });
      }
      return t(translation as Parameters<typeof t>[0]);
    }
  }

  return message;
}
