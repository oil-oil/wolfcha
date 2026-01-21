export const authErrorTranslations: Record<string, string> = {
  "Invalid login credentials": "邮箱或密码错误",
  "Email not confirmed": "邮箱尚未验证，请检查邮箱并点击确认链接",
  "User already registered": "该邮箱已注册，请直接登录",
  "Password should be at least 6 characters": "密码长度至少为 6 位",
  "Unable to validate email address: invalid format": "邮箱格式不正确",
  "Signup requires a valid password": "请输入有效的密码",
  "To signup, please provide your email": "请输入邮箱地址",
  "Email rate limit exceeded": "请求过于频繁，请稍后再试",
  "For security purposes, you can only request this after": "出于安全考虑，请稍后再试",
  "Email link is invalid or has expired": "邮箱链接已失效或过期，请重新获取",
  "Token has expired or is invalid": "验证已过期，请重新操作",
  "New password should be different from the old password": "新密码不能与旧密码相同",
  "Auth session missing": "登录已过期，请重新登录",
  "User not found": "用户不存在",
};

export function translateAuthError(message: string): string {
  if (authErrorTranslations[message]) {
    return authErrorTranslations[message];
  }

  for (const [key, translation] of Object.entries(authErrorTranslations)) {
    if (message.includes(key)) {
      const secondsMatch = message.match(/after (\d+) seconds?/);
      if (secondsMatch) {
        return `出于安全考虑，请 ${secondsMatch[1]} 秒后再试`;
      }
      return translation;
    }
  }

  return message;
}
