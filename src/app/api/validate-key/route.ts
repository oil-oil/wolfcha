import { NextRequest, NextResponse } from "next/server";

const ZENMUX_API_URL = "https://zenmux.ai/api/v1/chat/completions";
const DASHSCOPE_CHAT_COMPLETIONS_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";

const VALIDATION_TIMEOUT_MS = 15000;

type Provider = "zenmux" | "dashscope";

interface ValidationResult {
  provider: Provider;
  valid: boolean;
  error?: string;
  errorCode?: string;
}

async function validateZenmuxKey(apiKey: string): Promise<ValidationResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT_MS);

  try {
    const response = await fetch(ZENMUX_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-4.1-nano",
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 1,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      return { provider: "zenmux", valid: true };
    }

    const errorText = await response.text().catch(() => "");
    let errorCode = "";
    let errorMessage = "";

    try {
      const errorJson = JSON.parse(errorText);
      errorCode = errorJson?.error?.code || errorJson?.code || "";
      errorMessage = errorJson?.error?.message || errorJson?.message || "";
    } catch {
      errorMessage = errorText;
    }

    if (response.status === 401 || response.status === 403) {
      return {
        provider: "zenmux",
        valid: false,
        error: "API Key 无效或已过期",
        errorCode: "invalid_key",
      };
    }

    if (response.status === 402 || response.status === 429) {
      const isQuotaError =
        errorCode.includes("insufficient") ||
        errorCode.includes("quota") ||
        errorCode.includes("balance") ||
        errorMessage.includes("insufficient") ||
        errorMessage.includes("quota") ||
        errorMessage.includes("余额");

      if (isQuotaError || response.status === 402) {
        return {
          provider: "zenmux",
          valid: false,
          error: "API Key 余额不足，请前往 zenmux.ai 充值",
          errorCode: "insufficient_quota",
        };
      }

      return {
        provider: "zenmux",
        valid: false,
        error: "请求频率超限，请稍后再试",
        errorCode: "rate_limit",
      };
    }

    return {
      provider: "zenmux",
      valid: false,
      error: `验证失败: ${response.status} - ${errorMessage || errorText}`,
      errorCode: "unknown",
    };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      return {
        provider: "zenmux",
        valid: false,
        error: "验证超时，请检查网络连接",
        errorCode: "timeout",
      };
    }
    return {
      provider: "zenmux",
      valid: false,
      error: `网络错误: ${String(error)}`,
      errorCode: "network_error",
    };
  }
}

async function validateDashscopeKey(apiKey: string): Promise<ValidationResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT_MS);

  try {
    const response = await fetch(DASHSCOPE_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "qwen-turbo",
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 1,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      return { provider: "dashscope", valid: true };
    }

    const errorText = await response.text().catch(() => "");
    let errorCode = "";
    let errorMessage = "";

    try {
      const errorJson = JSON.parse(errorText);
      errorCode = errorJson?.error?.code || errorJson?.code || "";
      errorMessage = errorJson?.error?.message || errorJson?.message || "";
    } catch {
      errorMessage = errorText;
    }

    if (response.status === 401 || response.status === 403) {
      return {
        provider: "dashscope",
        valid: false,
        error: "百炼 API Key 无效或已过期",
        errorCode: "invalid_key",
      };
    }

    if (response.status === 402 || response.status === 429) {
      const isQuotaError =
        errorCode.includes("insufficient") ||
        errorCode.includes("quota") ||
        errorCode.includes("Arrearage") ||
        errorMessage.includes("insufficient") ||
        errorMessage.includes("quota") ||
        errorMessage.includes("余额") ||
        errorMessage.includes("欠费");

      if (isQuotaError || response.status === 402) {
        return {
          provider: "dashscope",
          valid: false,
          error: "百炼 API Key 余额不足，请前往阿里云百炼控制台充值",
          errorCode: "insufficient_quota",
        };
      }

      return {
        provider: "dashscope",
        valid: false,
        error: "请求频率超限，请稍后再试",
        errorCode: "rate_limit",
      };
    }

    return {
      provider: "dashscope",
      valid: false,
      error: `验证失败: ${response.status} - ${errorMessage || errorText}`,
      errorCode: "unknown",
    };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      return {
        provider: "dashscope",
        valid: false,
        error: "验证超时，请检查网络连接",
        errorCode: "timeout",
      };
    }
    return {
      provider: "dashscope",
      valid: false,
      error: `网络错误: ${String(error)}`,
      errorCode: "network_error",
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    const zenmuxKey = request.headers.get("x-zenmux-api-key")?.trim() || "";
    const dashscopeKey = request.headers.get("x-dashscope-api-key")?.trim() || "";

    if (!zenmuxKey && !dashscopeKey) {
      return NextResponse.json(
        { error: "未提供任何 API Key", valid: false },
        { status: 400 }
      );
    }

    const results: ValidationResult[] = [];
    const validationPromises: Promise<ValidationResult>[] = [];

    if (zenmuxKey) {
      validationPromises.push(validateZenmuxKey(zenmuxKey));
    }
    if (dashscopeKey) {
      validationPromises.push(validateDashscopeKey(dashscopeKey));
    }

    const settled = await Promise.all(validationPromises);
    results.push(...settled);

    const hasValidKey = results.some((r) => r.valid);
    const errors = results.filter((r) => !r.valid);

    if (hasValidKey) {
      return NextResponse.json({
        valid: true,
        results,
      });
    }

    const primaryError = errors.find((e) => e.errorCode === "insufficient_quota") || errors[0];

    return NextResponse.json({
      valid: false,
      error: primaryError?.error || "API Key 验证失败",
      errorCode: primaryError?.errorCode || "unknown",
      results,
    });
  } catch (error) {
    return NextResponse.json(
      { error: String(error ?? "Unknown error"), valid: false },
      { status: 500 }
    );
  }
}
