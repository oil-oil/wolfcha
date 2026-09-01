export type SseAttemptOutcome = "success" | "cancelled" | "interrupted" | "error";

export interface SseAttemptSummary {
  outcome: SseAttemptOutcome;
  outputChars: number;
  errorCode?: string;
}

type FinishHandler = (summary: SseAttemptSummary) => void | Promise<void>;

/**
 * 原样转发 SSE，同时只从副本中提取最小统计信息。
 * 只有收到协议级 [DONE] 才算成功；EOF、读取异常与消费方取消分别记账。
 */
export function trackSseAttempt(response: Response, onFinish: FinishHandler): Response {
  const body = response.body;
  if (!body) {
    void Promise.resolve(onFinish({
      outcome: "error",
      outputChars: 0,
      errorCode: "missing_response_body",
    })).catch(() => undefined);
    return new Response(null, { status: response.status, headers: response.headers });
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let outputChars = 0;
  let finishPromise: Promise<void> | null = null;

  const finish = (outcome: SseAttemptOutcome, errorCode?: string): Promise<void> => {
    if (!finishPromise) {
      finishPromise = Promise.resolve(onFinish({ outcome, outputChars, errorCode }))
        .catch(() => undefined);
    }
    return finishPromise;
  };

  const inspectLine = (line: string): boolean => {
    if (!line.startsWith("data:")) return false;
    const data = line.slice(5).trimStart();
    if (data.trim() === "[DONE]") return true;

    try {
      const payload = JSON.parse(data) as {
        choices?: Array<{ delta?: { content?: unknown } }>;
      };
      const delta = payload.choices?.[0]?.delta?.content;
      if (typeof delta === "string") outputChars += delta.length;
    } catch {
      // 统计解析失败不能改变返回给调用方的原始 SSE 字节。
    }
    return false;
  };

  const inspectChunk = (chunk: Uint8Array): boolean => {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    return lines.some(inspectLine);
  };

  const inspectTail = (): boolean => {
    buffer += decoder.decode();
    const tail = buffer;
    buffer = "";
    return tail !== "" && inspectLine(tail);
  };

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await reader.read();
        if (next.done) {
          const sawDone = inspectTail();
          await finish(sawDone ? "success" : "interrupted", sawDone ? undefined : "missing_done");
          controller.close();
          return;
        }

        const sawDone = inspectChunk(next.value);
        controller.enqueue(next.value);
        if (!sawDone) return;

        await finish("success");
        await reader.cancel().catch(() => undefined);
        controller.close();
      } catch (error) {
        const code = error instanceof DOMException && error.name === "AbortError"
          ? "aborted"
          : "stream_error";
        await finish("interrupted", code);
        controller.error(error);
      }
    },
    async cancel(reason) {
      const code = reason instanceof Error ? reason.name : "consumer_cancelled";
      await Promise.all([
        finish("cancelled", code),
        reader.cancel(reason).catch(() => undefined),
      ]);
    },
  });

  return new Response(stream, { status: response.status, headers: response.headers });
}
