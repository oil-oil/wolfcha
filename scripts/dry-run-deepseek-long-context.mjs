#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const repeat = Number(readArg("--repeat") ?? "2");
const models = (readArg("--models") ?? "deepseek-v4-pro,deepseek-v4-flash")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const thinkingModes = (readArg("--thinking") ?? "default,disabled,budget64,budget128")
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

const longContext = [
  "12人标准局，当前你是4号林野，平民。你不能知道任何未公开身份，只能根据公开信息发言。",
  "",
  "【首日警上】",
  "1号：不上警，认为第一天先听逻辑，不要急着站死。",
  "2号：上警强势发言，点7号和10号状态低，要求警徽流压7、10。",
  "3号：不上警，认为2号攻击面太散，像提前准备抗推位。",
  "5号：上警反打2号，说2号不该同时打这么多人，警徽流建议8、11。",
  "6号：支持2号，觉得2号敢打敢负责。",
  "7号：低输出，只说两个警上都不像真预言家。",
  "8号：很快支持2号，说2号敢聊敢打，可以带队。",
  "9号：质疑8号站边太快，没有独立判断。",
  "10号：被2号点名后只轻轻反问，没有反打。",
  "11号：帮8号说话，反打9号像是在借8号做身份。",
  "12号：建议大家重点看2号和5号的对立关系，不要只看语气。",
  "",
  "【警长 PK】",
  "2号和5号进入PK。2号说5号在拿自己做身份，5号说8号和11号围着2号太紧。",
  "投票：6、8、11投2号；1、9、12投5号；10弃票；7口头偏2号但理由很薄。5号最终拿到警徽。",
  "你上一轮发言：我还没完全打死2号，但8号秒站2号、11号立刻打9号，这两张牌需要拆开盘。警徽我更倾向5号，因为5号敢把关系链摊开。",
  "",
  "【首日归票】",
  "5号拿警徽后警徽流留8号、11号。2号说5号是在清理支持自己的好人牌。",
  "8号继续说5号装冷静，9号指出8号一直复读2号，没有独立逻辑。",
  "11号开始和8号轻微切割，说8号确实有点跟太紧，但同时继续打9号攻击欲重。",
  "10号提出7号一直低输出也该进票口。最终票口在7、8、10之间分散，没人出局。",
  "",
  "【夜1与第二天】",
  "夜里12号死亡，身份未公开。5号警长认为12号像站边好人被刀，警徽流改为8号、2号。",
  "2号跳预言家，说昨夜查9号是狼人，要求今天出9号。",
  "9号反跳预言家，说昨夜查8号是狼人，警徽流2号、11号。",
  "6号质疑9号为什么昨天不更强势保护5号。",
  "7号说两个预言家都不太信，但倾向出9号。",
  "8号被9号查杀后只喊9号悍跳狼，没有解释自己昨天为什么一直跟2号。",
  "10号说2号如果是真预言家，昨天攻击面太散解释不通。",
  "11号支持2号，说9号像被查杀后临时起跳。",
  "1号提醒大家看8号和11号昨天的关系链。",
  "3号说9号验8号能接上前一天逻辑。",
  "你上一轮发言：我倾向先出8号，不要直接在2号和9号之间赌预言家。8号这张牌是两边都绕不开的焦点，翻出来最能开视角。",
  "",
  "【第二天中盘】",
  "5号警长归票8号。2号反对，说出8等于让悍跳狼9号活过一天。",
  "6号动摇，觉得8号像狼但9号起跳时机危险。7号附和6号。",
  "8号强烈要求归票9号，还说5号警徽流在帮狼队。",
  "9号坚持自己是真预言家，要求女巫不要被8号带偏。",
  "10号暗示昨晚没有听见救药信息，怀疑女巫可能已经用过药。",
  "11号立刻打10号乱暗示身份，1号反压11号，问他为什么每次都替8号和2号转移压力。",
  "",
  "【第二天投票与翻牌】",
  "投票：1、3、4、5、9、10投8号；2、6、7、8、11投9号。",
  "8号出局，翻牌狼人。8号遗言说9号一定是狼，2号是真预言家。",
  "2号解释8号可能是倒钩狼，自己仍然是真预言家。",
  "9号说8号翻狼已经证明自己验人可信，明天优先看2号和11号。",
  "6号承认投错，但仍说9号不能完全放下。7号说自己只是求稳。11号说自己被8号骗了，愿意明天接受盘问。",
  "你上一轮发言：8号翻狼后，9号预言家面大幅上升。2号查杀9号这件事变得非常差，11号不能只用被骗洗白，7号跟错票也要继续听。",
  "",
  "【夜2与第三天】",
  "夜里5号警长死亡，警徽移交给9号。",
  "9号报验：2号是狼人，警徽流11号、7号。",
  "2号仍自称预言家，报验10号是好人，说9号狼队刀5号后抢警徽。",
  "1号说2号逻辑已经断裂，昨天还在保8号遗言。",
  "3号要求今天出2号，不要被2号继续拖轮次。",
  "6号说2号像狼，但担心9号拿到警徽后权力太大。",
  "7号说自己昨天投错只是因为9号跳得晚。",
  "10号说2号给自己金水像在拉票，自己不接受这个金水。",
  "11号改口站9号，说今天可以出2号，但希望明天别只盯自己。",
].join("\n");

const tasks = [
  {
    id: "long_speech",
    title: "长上下文自然发言",
    maxTokens: 520,
    messages: [
      {
        role: "system",
        content: [
          "你是狼人杀桌上的真人玩家。",
          "不要解释规则，不要复述全部背景，不要输出 JSON。",
          "你需要延续自己前几轮立场，说本轮发言正文。",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          longContext,
          "",
          "现在轮到4号林野发言。请输出120到220个汉字。",
          "要求：明确今天怎么归票；解释为什么不是先出11号或7号；保留后续顺位；语气像真实桌上玩家。",
        ].join("\n"),
      },
    ],
  },
  {
    id: "json_vote",
    title: "长上下文 JSON 投票",
    maxTokens: 320,
    responseFormat: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: "你是狼人杀投票决策助手。只输出 JSON，不要解释。",
      },
      {
        role: "user",
        content: [
          longContext,
          "",
          "请基于以上完整上下文输出：",
          '{"targetSeat": number, "confidence": 0到1, "reason": string, "backupSeat": number, "nextSuspects": number[]}',
          "注意：targetSeat 必须是今天最应该投出的玩家座位号。",
        ].join("\n"),
      },
    ],
  },
];

function thinkingPayload(mode) {
  if (mode === "default") return undefined;
  if (mode === "disabled") return { type: "disabled" };
  const match = /^budget(\d+)$/i.exec(mode);
  if (match) {
    return { type: "enabled", budget_tokens: Number(match[1]) };
  }
  throw new Error(`Unknown thinking mode: ${mode}`);
}

async function callModel(model, mode, task) {
  const baseUrl = process.env.TOKENDANCE_BASE_URL;
  const apiKey = process.env.TOKENDANCE_API_KEY;
  if (!baseUrl || !apiKey) throw new Error("TOKENDANCE_API_KEY or TOKENDANCE_BASE_URL is missing.");

  const requestBody = {
    model,
    messages: task.messages,
    temperature: 0.45,
    max_tokens: task.maxTokens,
    ...(thinkingPayload(mode) ? { thinking: thinkingPayload(mode) } : {}),
    ...(task.responseFormat ? { response_format: task.responseFormat } : {}),
  };

  const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const started = Date.now();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-App-Name": "Wolfcha Long Context Dry Run",
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
    return { ok: false, ms, error: text.slice(0, 800) };
  }
  const message = raw?.choices?.[0]?.message ?? {};
  const content = typeof message.content === "string" ? message.content.trim() : "";
  const reasoning = String(message.reasoning_content ?? message.reasoning ?? "");
  return {
    ok: true,
    ms,
    content,
    contentChars: charCount(content),
    reasoningChars: charCount(reasoning),
    usage: raw?.usage,
  };
}

function charCount(value) {
  return Array.from(String(value ?? "").replace(/\s+/g, "")).length;
}

async function run() {
  const repeats = Number.isFinite(repeat) && repeat > 0 ? Math.floor(repeat) : 1;
  const results = [];
  for (let round = 1; round <= repeats; round += 1) {
    for (const task of tasks) {
      for (const model of models) {
        for (const mode of thinkingModes) {
          const result = await callModel(model, mode, task);
          results.push({ round, taskId: task.id, title: task.title, model, thinkingMode: mode, result });
          const status = result.ok ? `${result.ms}ms / ${result.contentChars}字 / 思考${result.reasoningChars}字` : `FAIL ${result.ms}ms`;
          console.log(`${round} | ${task.id} | ${model} | ${mode} | ${status}`);
        }
      }
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    models,
    thinkingModes,
    repeat: repeats,
    tasks: tasks.map(({ id, title }) => ({ id, title })),
    results,
  };

  const outputDir = path.join(process.cwd(), "dry-runs");
  fs.mkdirSync(outputDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputPath = path.join(outputDir, `deepseek-long-context-${stamp}.json`);
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log("");
  console.log(`Output: ${outputPath}`);
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
