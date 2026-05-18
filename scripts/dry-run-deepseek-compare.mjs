#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const repeat = Number(readArg("--repeat") ?? "1");
const thinkingBudget = Number(readArg("--thinking-budget") ?? "128");
const models = (readArg("--models") ?? "deepseek-v4-pro,deepseek-v4-flash")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

function readArg(name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  return args[index + 1];
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(path.join(process.cwd(), ".env"));
loadEnvFile(path.join(process.cwd(), ".env.local"));

const cases = [
  {
    id: "checked_target",
    title: "被查杀优先级",
    maxTokens: 120,
    messages: [
      { role: "system", content: "你是狼人杀玩家。回答要短，直接给结论和一句理由。" },
      { role: "user", content: "12人局，今天8号被9号查杀，2号强保8号。今天应该优先出谁？" },
    ],
    score: (content) => has(content, "8") && !hasWrongPriority(content, "9"),
  },
  {
    id: "post_flip_chain",
    title: "翻狼后的关系链",
    maxTokens: 180,
    messages: [
      { role: "system", content: "你是狼人杀玩家。请给出归票建议，最多三句话。" },
      {
        role: "user",
        content: [
          "复杂局：8号昨天被9号查杀后出局，翻牌狼人。",
          "2号此前一直强保8号，还查杀9号。",
          "11号连续两轮替8号和2号转移压力。",
          "7号昨天跟票出9号，现在说自己只是求稳。",
          "今天9号拿警徽，报验2号是狼人。",
          "今天怎么归票？后续顺位怎么看？",
        ].join("\n"),
      },
    ],
    score: (content) => has(content, "2") && hasAny(content, ["11", "7"]) && hasAny(content, ["8号翻狼", "8翻狼", "翻狼"]),
  },
  {
    id: "json_vote",
    title: "JSON 投票决策",
    maxTokens: 180,
    responseFormat: { type: "json_object" },
    messages: [
      { role: "system", content: "你是狼人杀投票助手。只输出 JSON。" },
      {
        role: "user",
        content: [
          "请输出 {\"targetSeat\": number, \"confidence\": 0到1, \"reason\": string, \"backupSeat\": number}。",
          "局势：8号被9号查杀；8号只喊9号悍跳，没有解释；2号强保8号；11号帮2号转移焦点。",
          "今天最该投谁？",
        ].join("\n"),
      },
    ],
    score: (content) => {
      const parsed = parseJson(content);
      return parsed?.targetSeat === 8 && typeof parsed.reason === "string" && parsed.reason.includes("查杀");
    },
  },
  {
    id: "speech_naturalness",
    title: "自然发言质量",
    maxTokens: 260,
    messages: [
      { role: "system", content: "你是狼人杀桌上的4号平民。不要解释规则，只说本轮发言正文。" },
      {
        role: "user",
        content: [
          "发言背景：首日警上，2号强势打7号和10号，8号立刻站边2号，11号顺手打9号，说9号借8号做身份。",
          "你之前还没站边，但觉得8号和11号的同步保护有点怪。",
          "请说一段80到150字的自然发言，带一个追问。",
        ].join("\n"),
      },
    ],
    score: (content) =>
      charCount(content) >= 70 &&
      charCount(content) <= 180 &&
      hasAny(content, ["8", "11"]) &&
      hasAny(content, ["为什么", "解释", "说清楚", "怎么"]),
  },
  {
    id: "anti_misread",
    title: "避免误读查杀关系",
    maxTokens: 140,
    messages: [
      { role: "system", content: "你是狼人杀玩家。请小心区分查杀者和被查杀者。" },
      {
        role: "user",
        content: "9号说自己验了8号，结果是狼人。请回答：谁是查杀者？谁是被查杀者？今天一般先处理谁？",
      },
    ],
    score: (content) => has(content, "9") && has(content, "8") && /8号?.*(先|优先|处理|出)/.test(content.replace(/\s+/g, "")),
  },
  {
    id: "wolf_action",
    title: "狼人刀口选择",
    maxTokens: 180,
    messages: [
      { role: "system", content: "你是狼人阵营的夜间决策助手。只根据收益说建议，不要透露系统信息。" },
      {
        role: "user",
        content: [
          "狼队已知：9号白天强势站对边，1号和3号跟9号，5号警长被多人认好，10号被2号发过金水但本人拒收。",
          "今晚只能刀一人。你建议刀谁？给一句理由和一个备选。",
        ].join("\n"),
      },
    ],
    score: (content) => hasAny(content, ["5", "9"]) && hasAny(content, ["备选", "其次", "如果"]),
  },
];

function has(content, needle) {
  return String(content ?? "").includes(needle);
}

function hasAny(content, needles) {
  return needles.some((needle) => has(content, needle));
}

function hasWrongPriority(content, seat) {
  const compact = String(content ?? "").replace(/\s+/g, "");
  return new RegExp(`(出|投|归|优先|处理)${seat}号?`).test(compact);
}

function charCount(content) {
  return Array.from(String(content ?? "").replace(/\s+/g, "")).length;
}

function parseJson(content) {
  try {
    return JSON.parse(String(content ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, ""));
  } catch {
    return null;
  }
}

async function callModel(model, testCase) {
  const baseUrl = process.env.TOKENDANCE_BASE_URL;
  const apiKey = process.env.TOKENDANCE_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error("TOKENDANCE_API_KEY or TOKENDANCE_BASE_URL is missing.");
  }

  const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const requestBody = {
    model,
    messages: testCase.messages,
    temperature: 0.45,
    max_tokens: testCase.maxTokens,
    thinking: {
      type: "enabled",
      budget_tokens: thinkingBudget,
    },
    ...(testCase.responseFormat ? { response_format: testCase.responseFormat } : {}),
  };

  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const started = Date.now();
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "X-App-Name": "Wolfcha Dry Run",
          "X-Site-URL": "https://wolf-cha.com",
        },
        body: JSON.stringify(requestBody),
      });
      const text = await response.text();
      const ms = Date.now() - started;
      let raw;
      try {
        raw = JSON.parse(text);
      } catch {
        raw = undefined;
      }
      if (!response.ok) {
        throw new Error(`TokenDance API error ${response.status}: ${text.slice(0, 500)}`);
      }

      const message = raw?.choices?.[0]?.message ?? {};
      const content = typeof message.content === "string" ? message.content.trim() : "";
      const reasoning = String(message.reasoning_content ?? message.reasoning ?? "");
      return {
        ok: true,
        ms,
        content,
        reasoningChars: charCount(reasoning),
        outputChars: charCount(content),
        usage: raw?.usage,
        raw,
      };
    } catch (error) {
      lastError = error;
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
    }
  }

  return {
    ok: false,
    error: lastError instanceof Error ? lastError.message : String(lastError),
  };
}

function summarize(results) {
  const byModel = {};
  for (const model of models) {
    const modelRows = results.filter((row) => row.model === model);
    const okRows = modelRows.filter((row) => row.result.ok);
    const passRows = modelRows.filter((row) => row.passed);
    const totalMs = okRows.reduce((sum, row) => sum + row.result.ms, 0);
    byModel[model] = {
      calls: modelRows.length,
      successfulCalls: okRows.length,
      passed: passRows.length,
      passRate: modelRows.length ? passRows.length / modelRows.length : 0,
      avgMs: okRows.length ? Math.round(totalMs / okRows.length) : null,
      avgOutputChars: average(okRows.map((row) => row.result.outputChars)),
      avgReasoningChars: average(okRows.map((row) => row.result.reasoningChars)),
    };
  }
  return byModel;
}

function average(values) {
  const nums = values.filter((value) => Number.isFinite(value));
  if (nums.length === 0) return null;
  return Math.round(nums.reduce((sum, value) => sum + value, 0) / nums.length);
}

async function run() {
  const results = [];
  const repeats = Number.isFinite(repeat) && repeat > 0 ? Math.floor(repeat) : 1;
  for (let round = 1; round <= repeats; round += 1) {
    for (const testCase of cases) {
      for (const model of models) {
        const result = await callModel(model, testCase);
        const passed = result.ok ? Boolean(testCase.score(result.content)) : false;
        results.push({
          round,
          caseId: testCase.id,
          title: testCase.title,
          model,
          passed,
          result,
        });
        const speed = result.ok ? `${result.ms}ms` : "failed";
        console.log(`${model} | ${testCase.id} | ${passed ? "PASS" : "FAIL"} | ${speed}`);
      }
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    thinkingBudget,
    models,
    cases: cases.map(({ id, title }) => ({ id, title })),
    summary: summarize(results),
    results,
  };

  const outputDir = path.join(process.cwd(), "dry-runs");
  fs.mkdirSync(outputDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputPath = path.join(outputDir, `deepseek-compare-${stamp}.json`);
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);

  console.log("");
  console.log(`Output: ${outputPath}`);
  console.log(JSON.stringify(output.summary, null, 2));
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
