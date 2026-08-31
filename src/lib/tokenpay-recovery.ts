export const TOKENPAY_TOP_UP_REQUEST_EVENT = "wolfcha:tokenpay-top-up-request";
export const TOKENPAY_TOP_UP_RESULT_EVENT = "wolfcha:tokenpay-top-up-result";

export type TokenPayTopUpRequestDetail = {
  requestId: string;
};

type TokenPayTopUpResultDetail = TokenPayTopUpRequestDetail & {
  paid: boolean;
};

type ActiveRecovery = {
  requestId: string;
  promise: Promise<boolean>;
};

let activeRecovery: ActiveRecovery | null = null;

function createRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function readTokenPayRecoveryAction(
  response: Response,
): Promise<string | null> {
  const headerAction = response.headers.get("TokenDance-Recovery-Action");
  if (headerAction) return headerAction;

  try {
    const payload: unknown = await response.clone().json();
    if (
      payload &&
      typeof payload === "object" &&
      "recoveryAction" in payload &&
      typeof payload.recoveryAction === "string"
    ) {
      return payload.recoveryAction;
    }
  } catch {
    // Non-JSON protocol errors do not carry a structured recovery action.
  }
  return null;
}

export async function retryTokenPayRequestAfterTopUp(
  response: Response,
  retry: () => Promise<Response>,
): Promise<Response> {
  if (response.ok) return response;
  const recoveryAction = await readTokenPayRecoveryAction(response);
  if (recoveryAction !== "top_up_balance") return response;
  return await requestTokenPayTopUp() ? retry() : response;
}

export function getTokenPayTopUpRetryIndexes(results: unknown[]): number[] {
  return results.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const result = item as Record<string, unknown>;
    return result.ok !== true && result.recoveryAction === "top_up_balance"
      ? [index]
      : [];
  });
}

export function requestTokenPayTopUp(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (activeRecovery) return activeRecovery.promise;

  const requestId = createRequestId();
  const promise = new Promise<boolean>((resolve) => {
    const handleResult = (event: Event) => {
      const detail = (event as CustomEvent<TokenPayTopUpResultDetail>).detail;
      if (!detail || detail.requestId !== requestId) return;
      window.removeEventListener(TOKENPAY_TOP_UP_RESULT_EVENT, handleResult);
      resolve(detail.paid);
    };

    window.addEventListener(TOKENPAY_TOP_UP_RESULT_EVENT, handleResult);
    queueMicrotask(() => {
      window.dispatchEvent(
        new CustomEvent<TokenPayTopUpRequestDetail>(TOKENPAY_TOP_UP_REQUEST_EVENT, {
          detail: { requestId },
        }),
      );
    });
  });

  activeRecovery = { requestId, promise };
  void promise.finally(() => {
    if (activeRecovery?.requestId === requestId) activeRecovery = null;
  });
  return promise;
}

export function settleTokenPayTopUp(requestId: string, paid: boolean) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<TokenPayTopUpResultDetail>(TOKENPAY_TOP_UP_RESULT_EVENT, {
      detail: { requestId, paid },
    }),
  );
}
