#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const live = args.includes("--live");
const mock = args.includes("--mock") || !live;
const count = Number(readArg("--count") ?? "11");
const model = readArg("--model") ?? "google/gemini-3.1-flash-lite-preview";

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
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.join(process.cwd(), ".env"));
loadEnvFile(path.join(process.cwd(), ".env.local"));

const prompt = [
  `请生成 ${count} 位狼人杀 AI 玩家的隐藏沟通画像。`,
  "",
  "目标：让同一桌玩家的狼人杀熟练程度、词汇、发言长度、推理方式和压迫方式自然拉开差异。",
  "",
  "比例控制，但不要输出比例标签：",
  "- 约 20% 玩得少：少用术语，发言偏短，容易跟票或被强势发言影响。",
  "- 约 45% 普通桌游玩家：能解释站边，能抓明显矛盾，会少量使用狼人杀词汇。",
  "- 约 25% 经常玩：会盘票型、警徽流、关系链和前后发言变化。",
  "- 约 10% 很强：会控场、切割、做身份、压迫式追问，也懂得收敛锋芒。",
  "",
  "重要规则：",
  "- 禁用词：新手、普通、熟练、高手、顶尖、老玩家、等级、level、tier。",
  "- 不要在任何字段里输出禁用词，也不要输出“非常熟悉”“不太会玩”这种直接强弱评价。",
  "- 即使是在 mistakePattern、uncertaintyStyle、样例发言里，也不要用这些标签去描述别人。",
  "- 很强的玩家也不能写成完美玩家，不要写“几乎不会出错”“极其擅长一切”这类夸张设定。",
  "- 输出前自己检查一遍 JSON，如果出现禁用词，请改写成具体行为习惯。",
  "- 不要把玩家写成枚举值或模板名，要用自然语言描述。",
  "- 每个人的发言长度习惯必须不同：有人短促，有人中等，有人长篇，有人只在被点名时变长。",
  "- 每个人都要有一个 70 到 180 字的首日发言样例，样例必须体现他的画像。",
  "- 首日发言样例默认使用平民视角，不要自称预言家、女巫、猎人、守卫，也不要报验人。",
  "- 字段可以结构化，但字段值必须像真实设计说明，不要只写一个词。",
  "",
  "请只输出 JSON，不要 Markdown。格式：",
  JSON.stringify(
    {
      characters: [
        {
          seat: 1,
          displayName: "中文名",
          hiddenCommunicationProfile: {
            werewolfExperience: "自然语言描述，不写等级标签",
            vocabularyStyle: "自然语言描述术语使用习惯",
            reasoningStyle: "自然语言描述推理方式",
            speechLengthHabit: "自然语言描述平时多长、何时变长",
            pressureStyle: "自然语言描述如何追问或压人",
            uncertaintyStyle: "自然语言描述保守或果断的方式",
            mistakePattern: "自然语言描述常见误判或弱点",
            wolfDeceptionStyle: "自然语言描述如果是狼人会如何伪装",
            sampleDayOneSpeech: "首日发言样例",
          },
        },
      ],
    },
    null,
    2
  ),
].join("\n");

async function callGemini() {
  if (mock) return mockResponse();

  const apiKey = process.env.ZENMUX_API_KEY;
  if (!apiKey) {
    throw new Error("ZENMUX_API_KEY is missing. Add it to .env.local or pass --mock.");
  }

  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch("https://zenmux.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.9,
          max_tokens: Math.max(4000, count * 520),
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`ZenMux API error ${response.status}: ${text.slice(0, 800)}`);
      }

      const json = await response.json();
      const content = json?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) {
        throw new Error("Gemini returned an empty message.");
      }

      return parseJson(content);
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1200));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function parseJson(raw) {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  return JSON.parse(stripped);
}

function mockResponse() {
  return {
    characters: [
      {
        seat: 1,
        displayName: "林夏",
        hiddenCommunicationProfile: {
          werewolfExperience: "玩过一些朋友局，知道基本流程，但遇到多人对跳时容易先听强势的人。",
          vocabularyStyle: "很少主动说术语，只偶尔用跟票、划水这种口头词。",
          reasoningStyle: "先看谁说话奇怪，再慢慢补理由，关系链不会拉得很长。",
          speechLengthHabit: "通常两三句，只有被点名时才会解释更完整。",
          pressureStyle: "不太会压人，更多是小心追问一句。",
          uncertaintyStyle: "经常给自己留余地，不太敢拍死别人。",
          mistakePattern: "容易把强势归票当成可靠判断。",
          wolfDeceptionStyle: "如果是狼人，会跟着队友节奏说话，伪装比较生硬。",
          sampleDayOneSpeech: "我现在还没听出特别铁的点，2号说得挺凶，但6号的反应也不像完全没道理。我先想听后面几个人怎么说，别太早把票归死。",
        },
      },
    ],
  };
}

function evaluate(data) {
  const characters = Array.isArray(data?.characters) ? data.characters : [];
  const banned = /(新手|普通|熟练|高手|顶尖|老玩家|等级|level|tier|非常熟悉|不太会玩|几乎不会出错|极其擅长)/i;
  const roleLeak = /(我是预言家|作为预言家|我昨晚验|我是女巫|我是猎人|我是守卫|我查验)/;
  const profileTexts = characters.map((character) => JSON.stringify(character.hiddenCommunicationProfile ?? {}));
  const bannedHits = characters
    .map((character, index) => ({ seat: character.seat ?? index + 1, text: JSON.stringify(character) }))
    .filter((item) => banned.test(item.text))
    .map((item) => item.seat);

  const sampleLengths = characters.map((character) =>
    countChineseChars(character.hiddenCommunicationProfile?.sampleDayOneSpeech ?? "")
  );
  const roleLeakSeats = characters
    .filter((character) => roleLeak.test(character.hiddenCommunicationProfile?.sampleDayOneSpeech ?? ""))
    .map((character) => character.seat);
  const sampleSpread = Math.max(...sampleLengths, 0) - Math.min(...sampleLengths.filter((n) => n > 0), 0);
  const longDescriptions = profileTexts.filter((text) => countChineseChars(text) >= 160).length;

  return {
    characterCount: characters.length,
    noExplicitLevelLabels: bannedHits.length === 0,
    bannedLabelSeats: bannedHits,
    noRoleLeaksInSamples: roleLeakSeats.length === 0,
    roleLeakSeats,
    sampleSpeechSpread: sampleSpread,
    longEnoughProfiles: longDescriptions,
    sampleLengths,
  };
}

function countChineseChars(text) {
  return Array.from(String(text ?? "").replace(/\s+/g, "")).length;
}

function summarizeProfiles(data) {
  const characters = Array.isArray(data?.characters) ? data.characters : [];
  return characters.map((character) => {
    const profile = character.hiddenCommunicationProfile ?? {};
    return {
      seat: character.seat,
      displayName: character.displayName,
      experience: profile.werewolfExperience,
      lengthHabit: profile.speechLengthHabit,
      sampleChars: countChineseChars(profile.sampleDayOneSpeech),
      sample: profile.sampleDayOneSpeech,
    };
  });
}

async function run() {
  const data = await callGemini();
  const evaluation = evaluate(data);
  const output = {
    mode: mock ? "mock" : "live",
    model,
    generatedAt: new Date().toISOString(),
    prompt,
    evaluation,
    summary: summarizeProfiles(data),
    raw: data,
  };

  const outputDir = path.join(process.cwd(), "dry-runs");
  fs.mkdirSync(outputDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputPath = path.join(outputDir, `character-profiles-${stamp}.json`);
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  printReport(output, outputPath);
}

function printReport(output, outputPath) {
  console.log(`Dry-run mode: ${output.mode}`);
  console.log(`Model: ${output.model}`);
  console.log(`Output: ${outputPath}`);
  console.log("");
  console.log("Evaluation:");
  console.log(JSON.stringify(output.evaluation, null, 2));
  console.log("");
  console.log("Profile samples:");
  for (const item of output.summary.slice(0, 6)) {
    console.log(`#${item.seat} ${item.displayName}`);
    console.log(`经验：${item.experience}`);
    console.log(`长度：${item.lengthHabit}，样例 ${item.sampleChars} 字`);
    console.log(`样例：${item.sample}`);
    console.log("");
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
