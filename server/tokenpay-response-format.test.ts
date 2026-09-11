import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { applyTokenDanceResponseFormat } from "../src/lib/tokendance-response-format";

const schema = {
  type: "object",
  properties: { ok: { type: "boolean" } },
  required: ["ok"],
  additionalProperties: false,
};
const strictFormat = { type: "json_schema", json_schema: { name: "smoke", strict: true, schema } };

for (const model of ["deepseek-v4-flash-0731", "deepseek-v4.1-flash"]) {
  test(`${model} 将网关不支持的严格 Schema 转为 JSON，并保留结构要求`, () => {
    const messages = [{ role: "user", content: "返回结果" }];
    const body: Record<string, unknown> = { model, messages, stream: true };
    applyTokenDanceResponseFormat(body, strictFormat);
    assert.deepEqual(body.response_format, { type: "json_object" });
    const sentMessages = body.messages as Array<{ role: string; content: string }>;
    assert.equal(sentMessages[0].role, "system");
    assert.ok(sentMessages[0].content.includes(JSON.stringify(schema)));
    assert.deepEqual(sentMessages.slice(1), messages);
    assert.equal(messages.length, 1);
    assert.equal(body.stream, true);
  });
}

test("JSON 模式及其他模型参数保持原样", () => {
  for (const [model, format] of [
    ["deepseek-v4.1-flash", { type: "json_object" }],
    ["other-model", strictFormat],
  ] as const) {
    const messages = [{ role: "user", content: "返回 JSON" }];
    const body: Record<string, unknown> = { model, messages };
    applyTokenDanceResponseFormat(body, format);
    assert.equal(body.response_format, format);
    assert.equal(body.messages, messages);
  }
});

test("普通、流式和批量 TokenDance 请求共用格式适配入口", () => {
  const source = readFileSync("src/app/api/chat/route.ts", "utf8");
  assert.equal(source.match(/applyTokenDanceResponseFormat\(requestBody, response_format\)/g)?.length, 2);
});
