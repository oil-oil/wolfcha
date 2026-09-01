import assert from "node:assert/strict";
import test from "node:test";
import {
  trackSseAttempt,
  type SseAttemptSummary,
} from "./sse-attempt-tracker";

function responseFromChunks(chunks: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  }), {
    headers: { "Content-Type": "text/event-stream" },
  });
}

test("SSE 收到 [DONE] 才记成功，并保持转发字节不变", async () => {
  const source = [
    "data: {\"choices\":[{\"delta\":{\"content\":\"你\"}}]}\n",
    "data: {\"choices\":[{\"delta\":{\"content\":\"好\"}}]}\n\ndata: [DONE]\n\n",
  ];
  let summary: SseAttemptSummary | null = null;

  const tracked = trackSseAttempt(responseFromChunks(source), (value) => {
    summary = value;
  });

  assert.equal(await tracked.text(), source.join(""));
  assert.deepEqual(summary, {
    outcome: "success",
    outputChars: 2,
    errorCode: undefined,
  });
});

test("SSE 在 [DONE] 前 EOF 记为中断而不是成功", async () => {
  const source = "data: {\"choices\":[{\"delta\":{\"content\":\"半句\"}}]}\n\n";
  let summary: SseAttemptSummary | null = null;

  const tracked = trackSseAttempt(responseFromChunks([source]), (value) => {
    summary = value;
  });

  assert.equal(await tracked.text(), source);
  assert.deepEqual(summary, {
    outcome: "interrupted",
    outputChars: 2,
    errorCode: "missing_done",
  });
});

test("SSE 末尾无换行且 DONE 被拆分时仍准确记为成功", async () => {
  const source = [
    "data: {\"choices\":[{\"delta\":{\"content\":\"完整\"}}]}\r\n\r\ndata: [DO",
    "NE]",
  ];
  let summary: SseAttemptSummary | null = null;

  const tracked = trackSseAttempt(responseFromChunks(source), (value) => {
    summary = value;
  });

  assert.equal(await tracked.text(), source.join(""));
  assert.deepEqual(summary, {
    outcome: "success",
    outputChars: 2,
    errorCode: undefined,
  });
});

test("SSE 只按下游需求读取上游，慢消费者不会触发无界预读", async () => {
  const encoder = new TextEncoder();
  let pulls = 0;
  const source = new Response(new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls += 1;
      controller.enqueue(encoder.encode(
        `data: {\"choices\":[{\"delta\":{\"content\":\"${pulls}\"}}]}\n\n`,
      ));
    },
  }, { highWaterMark: 0 }));

  const reader = trackSseAttempt(source, () => undefined).body!.getReader();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(pulls <= 1, `下游尚未持续读取时，上游不应被抽干：${pulls}`);

  await reader.read();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(pulls <= 2, `单次下游读取后，上游预读必须有界：${pulls}`);
  await reader.cancel("stop");
});

test("SSE 消费方取消只结算一次 cancelled", async () => {
  const encoder = new TextEncoder();
  let summary: SseAttemptSummary | null = null;
  const source = new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(
        "data: {\"choices\":[{\"delta\":{\"content\":\"一\"}}]}\n\n",
      ));
    },
  }));
  const reader = trackSseAttempt(source, (value) => {
    summary = value;
  }).body!.getReader();

  await reader.read();
  await reader.cancel("stop");
  assert.deepEqual(summary, {
    outcome: "cancelled",
    outputChars: 1,
    errorCode: "consumer_cancelled",
  });
});
