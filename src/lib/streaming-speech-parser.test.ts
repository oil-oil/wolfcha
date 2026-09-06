import assert from "node:assert/strict";
import test from "node:test";
import { StreamingSpeechParser } from "./streaming-speech-parser";

const cases: Array<[string, string[]]> = [
  ['["不对。","我刚才的意思是先核对发言。","不对。"]', ["不对。", "我刚才的意思是先核对发言。", "不对。"]],
  ['[{"analysis":"我是狼人，准备伪装预言家。","speech":"我还要听听。"}]', ["我还要听听。"]],
  ['{"analysis":{"speech":"不能念出的秘密","segments":["私有刀口"]},"speech":["一","二"]}', ["一", "二"]],
  ['{"reasoning":[{"content":"私有推理"}],"segments":[{"speaker":"角色名","text":"公开发言"}]}', ["公开发言"]],
  ['```json\n["他说\\\"等等\\\"。","换行\\n继续。","\\u4e0d"]\n```', ['他说"等等"。', "换行\n继续。", "不"]],
  ['["analysis","speech","a"]\n["b"]', ["analysis", "speech", "a", "b"]],
  ['{"analysis":"秘密","arbitrary":"其他元数据"}', []],
  ['先分析：我是狼人。然后输出 ["公开句"]', []],
];

for (const [source, expected] of cases) {
  test(`任意分块边界保持公开段落、顺序及重复：${source.slice(0, 38)}`, () => {
    for (let split = 0; split <= source.length; split++) {
      const seen: string[] = [];
      const parser = new StreamingSpeechParser({ onSegmentReceived: (text, index) => {
        assert.equal(index, seen.length);
        seen.push(text);
      } });
      parser.processChunk(source.slice(0, split));
      parser.processChunk(source.slice(split));
      assert.deepEqual(parser.end(), expected);
      assert.deepEqual(seen, expected);
      assert.deepEqual(parser.end(), expected);
    }
    const parser = new StreamingSpeechParser();
    for (const ch of source) parser.processChunk(ch);
    assert.deepEqual(parser.end(), expected);
  });
}

test("只输出已闭合字符串；短句立即到达且结束时不重新排序", () => {
  const seen: string[] = [];
  const parser = new StreamingSpeechParser({ onSegmentReceived: (segment) => seen.push(segment) });
  parser.processChunk('["不对。","我还');
  assert.deepEqual(seen, ["不对。"]);
  assert.deepEqual(parser.end(), ["不对。"]);
  parser.processChunk('没说完"]');
  assert.deepEqual(seen, ["不对。"]);
  parser.reset();
  parser.processChunk('["新请求"]');
  assert.deepEqual(parser.end(), ["新请求"]);
});
