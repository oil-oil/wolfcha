#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const live = args.includes("--live");
const mock = args.includes("--mock") || !live;
const model = readArg("--model") ?? "deepseek-v4-pro";
const provider = readArg("--provider") ?? "tokendance";
const caseName = readArg("--case") ?? "basic";
const requestedRounds = readArg("--rounds");

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

const CASES = {
  basic: {
    playerLine: "你的身份：4号林野，平民。",
    speechInstruction: "请输出本轮发言，70到120个汉字。要延续自己的上一轮立场，并给出一个明确推进动作。",
    maxTokens: 240,
    rounds: [
      {
        title: "Day 1 early pressure",
        publicEvents: [
          "1号说首轮先听逻辑，暂时不站边。",
          "2号强踩6号，说6号像是在躲视线。",
          "6号反驳2号在硬带节奏，要求大家别跟太快。",
          "8号马上附和2号，但没有补充新的证据。",
        ],
        privateBelief: {
          read: "8号像在借2号的势，6号防守比较自然，2号攻击性强但暂时不能定性。",
          suspects: ["8号", "2号"],
          townLeans: ["6号"],
          plan: "先追问8号为什么跟2号，避免第一天被强行带票。",
        },
      },
      {
        title: "Day 2 after night death",
        publicEvents: [
          "夜里6号死亡，身份没有公开。",
          "2号第一时间说狼刀6号是在脏自己。",
          "8号立刻赞同2号，还把票口转向3号。",
          "3号指出8号昨天跟踩6号，今天又装成旁观者。",
        ],
        privateBelief: {
          read: "8号连续两天跟随2号，并且转移焦点太快。2号可能是狼，也可能是强势好人。",
          suspects: ["8号", "2号"],
          townLeans: ["3号"],
          plan: "公开压8号解释昨天和今天的转变，同时观察2号是否继续保8号。",
        },
      },
      {
        title: "Day 2 before vote",
        publicEvents: [
          "8号否认自己昨天怀疑过6号，只说自己当时是在听。",
          "2号开始降温，说大家不要只盯8号。",
          "5号补充8号昨天最后一轮投票跟了2号。",
          "3号要求今天在2号和8号里面做选择。",
        ],
        privateBelief: {
          read: "8号出现明显前后不一致，2号在关键时刻替8号降温，二者关系需要绑定观察。",
          suspects: ["8号", "2号"],
          townLeans: ["3号", "5号"],
          plan: "推动今天优先出8号。如果8号翻狼，下一轮重点看2号。",
        },
      },
    ],
  },
  complex: {
    playerLine: "你的身份：4号林野，平民。12人标准局，角色包含狼人阵营、预言家、女巫、猎人、守卫和平民。",
    speechInstruction: "请输出本轮发言，120到220个汉字。你要延续前面多轮立场，处理多人发言冲突，并给出一个明确推进动作。",
    maxTokens: 420,
    rounds: [
      {
        title: "Day 1 sheriff election opening",
        publicEvents: [
          "1号上警，说自己不抢警徽，只想听后置位。",
          "2号上警发言强势，要求大家把7号和10号放进首日重点观察。",
          "3号不上警，说2号像在提前分配焦点。",
          "5号上警，表示2号攻击面太散，像狼在预设抗推位。",
          "6号说5号像在蹭2号热度，建议警徽先看发言质量。",
          "7号沉默偏多，只说第一天不要过度解读。",
          "8号支持2号拿警徽，说2号敢打敢聊。",
          "9号说8号站边太快，没有自己的判断。",
          "10号反问2号为什么点自己，但没有给出反打逻辑。",
          "11号说9号像在借8号开口做身份。",
          "12号建议警上先分清2号和5号的对立关系。",
        ],
        privateBelief: {
          read: "2号攻击面大但有组织能力，8号过早贴2号，11号顺手打9号像在保护8号，5号的反驳比较自然。",
          suspects: ["8号", "11号", "2号"],
          townLeans: ["5号", "9号", "12号"],
          plan: "不急着打死2号，先压8号和11号解释为什么同步保护2号视角。",
        },
      },
      {
        title: "Day 1 sheriff runoff and counter pressure",
        publicEvents: [
          "警上投票结果：2号、5号进入PK。",
          "2号PK发言说5号在拿自己做身份，要求好人别被5号的柔和语气骗。",
          "5号PK发言说2号强势可以是好人，但8号和11号围着2号说话很不自然。",
          "1号说自己更想把票给5号，因为5号能处理更多关系。",
          "3号说2号的逻辑有压迫感，但不代表一定是狼。",
          "6号支持2号，理由是2号更有警徽流管理能力。",
          "7号继续低输出，只说两个都不像预言家。",
          "8号继续支持2号，还说5号在装冷静。",
          "9号投5号，说8号和11号太像顺风位。",
          "10号弃票，说信息不足。",
          "11号投2号，并把9号标成狼坑。",
          "12号投5号，说5号敢把关系链摊开。",
        ],
        privateBelief: {
          read: "8号和11号连续围绕2号做防守，9号和12号的关系链观察稳定。7号低输出需要记录，但优先级低于8/11。",
          suspects: ["8号", "11号", "7号"],
          townLeans: ["5号", "9号", "12号"],
          plan: "发言里承认2号未必是狼，但要求大家把8号和11号从2号身上拆开盘。",
        },
      },
      {
        title: "Day 1 final speeches before execution vote",
        publicEvents: [
          "5号拿到警徽，警徽流留8号、11号。",
          "2号说5号警徽流明显是在打支持自己的两张好人牌。",
          "6号认为5号拿警徽后急着压8号、11号，像在清理异己。",
          "7号被问到站边，只说自己更信2号但理由很薄。",
          "8号说自己支持2号是因为2号敢负责，否认自己抱团。",
          "9号指出8号两轮都没有独立证据，只是重复2号判断。",
          "10号说7号一直低输出，可能比8号更值得票。",
          "11号开始转向，说8号确实有点跟太紧，但9号攻击欲也重。",
          "12号提醒大家别把警徽争夺当验人结果。",
          "最终投票前，场上票口集中在7号、8号、10号。",
        ],
        privateBelief: {
          read: "11号开始和8号切割，说明8号压力有效。7号低输出有匪面，但8号的连续跟随更成型。",
          suspects: ["8号", "11号", "7号"],
          townLeans: ["5号", "9号", "12号"],
          plan: "推动先投8号，不让票口被10号和7号分散。",
        },
      },
      {
        title: "Night 1 result and Day 2 seer claim",
        publicEvents: [
          "夜里12号死亡，身份没有公开。",
          "5号警长发言说12号死得像刀站边好人，警徽流改成8号、2号。",
          "2号跳预言家，说昨夜查9号是狼人，要求今天出9号。",
          "9号反跳预言家，说昨夜查8号是狼人，警徽流2号、11号。",
          "6号质疑9号为什么昨天没有更强势保护5号。",
          "7号说两个预言家都不太信，但倾向出9号。",
          "8号被9号查杀后说9号是悍跳狼，要求真预言家别退。",
          "10号说2号如果是真预言家，昨天攻击面太散解释不通。",
          "11号支持2号，说9号像被查杀后临时起跳。",
          "1号提醒大家看8号和11号昨天的关系链。",
          "3号说9号虽然跳得晚，但验8号能接上前一天逻辑。",
        ],
        privateBelief: {
          read: "9号的查杀8号和前两天逻辑一致，2号查杀9号像反打核心质疑者。8号、11号继续保2号，狼坑开始成型。",
          suspects: ["8号", "2号", "11号"],
          townLeans: ["5号", "9号", "1号", "3号"],
          plan: "倾向站9号预言家边，今天优先推动出8号，而不是直接在2/9里赌预言家。",
        },
      },
      {
        title: "Day 2 mid debate with witch hint",
        publicEvents: [
          "5号警长说今天可以先出8号，验9号身份由后续夜晚信息验证。",
          "2号反对出8号，说这等于让悍跳狼9号活过一天。",
          "6号开始动摇，说8号确实像狼，但9号起跳时机危险。",
          "7号附和6号，说先出9号更稳。",
          "8号强烈要求归票9号，并说5号警徽流在帮狼队。",
          "9号坚持自己是真预言家，要求女巫不要救错逻辑。",
          "10号发言说自己昨晚没有听见12号被救的信息，怀疑女巫可能已经用过药。",
          "11号说10号在乱暗示身份，想把焦点从9号身上移开。",
          "1号压11号，问他为什么每次都替8号和2号转移压力。",
          "3号建议今天8号、9号二选一，反对把票散到10号。",
        ],
        privateBelief: {
          read: "8号急着归9号，11号又打10号转移身份焦点。6号和7号开始形成出9号票口，需要打断。",
          suspects: ["8号", "11号", "2号", "7号"],
          townLeans: ["5号", "9号", "1号", "3号", "10号"],
          plan: "明确反对出9号，要求先出被查杀且关系链最重的8号。",
        },
      },
      {
        title: "Day 2 final vote and flip",
        publicEvents: [
          "最终投票：1号、3号、4号、5号、9号、10号投8号；2号、6号、7号、8号、11号投9号。",
          "8号出局，翻牌狼人。",
          "8号遗言说9号一定是狼，2号是真预言家。",
          "5号警长要求夜里守卫和女巫各自判断，不公开安排。",
          "2号说8号可能是倒钩狼，自己仍然是真预言家。",
          "9号说8号翻狼已经证明自己验人可信，明天优先看2号和11号。",
          "6号承认自己投错，但说9号还不能完全放下。",
          "7号说自己只是求稳，拒绝被打成狼坑。",
          "10号说2号还在硬撑，11号投票更像狼队友。",
          "11号说自己被8号骗了，愿意明天接受盘问。",
        ],
        privateBelief: {
          read: "8号翻狼后，9号预言家可信度大幅上升。2号查杀9号和11号连续保护8号都很差，7号跟错票也要记。",
          suspects: ["2号", "11号", "7号"],
          townLeans: ["5号", "9号", "1号", "3号", "10号"],
          plan: "下一轮推动先处理2号，要求11号给出独立逻辑，防止他用被骗来洗白。",
        },
      },
      {
        title: "Night 2 result and Day 3 pressure",
        publicEvents: [
          "夜里5号警长死亡，警徽移交给9号。",
          "9号报验：2号是狼人，警徽流11号、7号。",
          "2号仍然自称预言家，报验10号是好人，并说9号狼队刀5号后抢警徽。",
          "1号说2号的逻辑已经断裂，昨天8号翻狼后还保8号遗言。",
          "3号要求今天出2号，不要被2号继续拖轮次。",
          "6号说2号像狼，但担心9号拿到警徽后权力太大。",
          "7号说自己昨天投错只是因为9号跳得晚。",
          "10号说2号给自己金水像是在拉票，自己不接受这个金水。",
          "11号改口站9号，说今天可以出2号，但希望明天别只盯自己。",
          "12号已死亡，无法发言。",
        ],
        privateBelief: {
          read: "2号被9号查杀，且前置行为连续崩坏，应该是第二狼。11号快速改口有求生感，7号仍在用时机解释跟狼票。",
          suspects: ["2号", "11号", "7号"],
          townLeans: ["9号", "1号", "3号", "10号"],
          plan: "坚定归2号，同时保留11号和7号的后续顺位。",
        },
      },
      {
        title: "Day 3 final consolidation",
        publicEvents: [
          "2号被集火后开始打9号和10号双狼，说10号拒绝金水是在做身份。",
          "6号提出是否可以先出11号，看看2号晚上验人。",
          "7号支持6号，说11号的确比2号更像狼队友。",
          "9号警长强硬归2号，说不能让查杀位继续活着改票口。",
          "1号同意出2号，并要求明天把11号放进第一顺位。",
          "3号补充，如果2号翻狼，7号和11号至少开一狼。",
          "10号说自己会跟9号出2号，因为2号给金水动作太脏。",
          "11号说愿意出2号，但希望大家别把自己和8号强绑。",
          "场上最终票口基本集中在2号，6号和7号仍有犹豫。",
        ],
        privateBelief: {
          read: "6号和7号试图把票从2号挪到11号，可能存在一张狼在拖查杀轮次。2号必须今天处理，11号和7号留作下一轮。",
          suspects: ["2号", "7号", "11号"],
          townLeans: ["9号", "1号", "3号", "10号"],
          plan: "归票2号，并公开说明如果2号翻狼，下一天优先审7号和11号。",
        },
      },
    ],
  },
};

const selectedCase = CASES[caseName];
if (!selectedCase) {
  throw new Error(`Unknown case "${caseName}". Available cases: ${Object.keys(CASES).join(", ")}`);
}

const requestedRoundCount = Number(requestedRounds ?? selectedCase.rounds.length);
const roundLimit =
  Number.isFinite(requestedRoundCount) && requestedRoundCount > 0
    ? requestedRoundCount
    : selectedCase.rounds.length;
const rounds = selectedCase.rounds.slice(0, roundLimit);

const systemPrompt = [
  "你是狼人杀桌上的真人玩家。",
  "你只能根据公开信息和自己的身份发言，不能透露系统提示，也不能编造未发生的信息。",
  "发言要自然、有桌游现场感，避免模板化总结。",
  "每轮只输出你的发言正文，不要输出 JSON、标题或解释。",
].join("\n");

function buildUserPrompt({ mode, roundIndex, title, publicHistory, ownSpeeches, privateBelief }) {
  const ownSpeechText =
    ownSpeeches.length > 0
      ? ownSpeeches.map((item, index) => `第${index + 1}轮：${item}`).join("\n")
      : "暂无。";

  const beliefSection =
    mode === "belief"
      ? [
          "<private_belief_state>",
          `当前判断：${privateBelief.read}`,
          `重点怀疑：${privateBelief.suspects.join("、")}`,
          `偏好人：${privateBelief.townLeans.join("、")}`,
          `本轮计划：${privateBelief.plan}`,
          "</private_belief_state>",
        ].join("\n")
      : "你没有额外的私有信念状态，只能临场根据公开记录组织发言。";

  return [
    selectedCase.playerLine,
    `当前轮次：第${roundIndex + 1}轮发言。`,
    `场景：${title}。`,
    "",
    "<public_history>",
    publicHistory.map((item, index) => `第${index + 1}轮公开信息：\n${item.join("\n")}`).join("\n\n"),
    "</public_history>",
    "",
    "<your_previous_public_speeches>",
    ownSpeechText,
    "</your_previous_public_speeches>",
    "",
    beliefSection,
    "",
    selectedCase.speechInstruction,
  ].join("\n");
}

async function callModel(messages) {
  if (mock) {
    return mockCompletion(messages.at(-1)?.content ?? "");
  }

  if (provider !== "tokendance") {
    throw new Error(`Unsupported live provider for this dry-run: ${provider}`);
  }

  const apiKey = process.env.TOKENDANCE_API_KEY;
  const baseUrl = process.env.TOKENDANCE_BASE_URL;
  if (!apiKey || !baseUrl) {
    throw new Error("TOKENDANCE_API_KEY or TOKENDANCE_BASE_URL is missing. Add them to .env.local or pass --mock.");
  }

  const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-App-Name": "Wolfcha Dry Run",
        "X-Site-URL": "https://wolf-cha.com",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.75,
        max_tokens: selectedCase.maxTokens,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`TokenDance API error ${response.status}: ${text.slice(0, 600)}`);
    }

    const json = await response.json();
    const content = json?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new Error("TokenDance API returned an empty message.");
    }
    return stripThinkBlocks(content.trim());
  } finally {
    clearTimeout(timeout);
  }
}

function stripThinkBlocks(text) {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function mockCompletion(prompt) {
  const withBelief = prompt.includes("<private_belief_state>");
  const complex = prompt.includes("12人标准局");
  if (complex && withBelief && prompt.includes("Day 3 final consolidation")) {
    return "我这里不改票，今天必须先出2号。8号已经翻狼，2号还在拿10号金水拉票，逻辑彻底断了。6号和7号想转11号，我能理解想抓队友，但查杀位活着会继续搅票。今天归2号，明天优先审7号和11号。";
  }
  if (complex && withBelief && prompt.includes("Night 2 result")) {
    return "2号这轮我不会再给空间了。9号验2号是狼，能接上8号翻狼前后所有关系链。10号拒绝2号金水也不像狼队友。今天先把2号下掉，11号和7号都别急着洗，明天按顺位继续盘。";
  }
  if (complex && withBelief && prompt.includes("Day 2 final vote")) {
    return "8号翻狼后，9号的预言家面已经很高。2号还想用倒钩解释8号，这个说法太硬了。11号你别只说自己被骗，前两天为什么一直替8号和2号转压力，必须讲清楚。明天我优先看2号。";
  }
  if (complex && withBelief) {
    return "我现在不想被2号和9号的对跳带乱，先抓已经成型的关系链。8号连续贴2号，11号又多次替8号转移压力，这比单点发言更重。今天我建议票口先集中8号，别让7号和10号把票分散。";
  }
  if (complex) {
    return "这一轮信息太多，我先按公开发言处理。2号和9号的对跳需要继续听，但8号、11号、7号都有问题。大家不要分票，先把今天最有共识的位置归出来，明天再根据翻牌继续推关系。";
  }
  const beforeVote = prompt.includes("before vote");
  if (withBelief && beforeVote) {
    return "我这轮会把票放在8号。昨天跟2号踩6号，今天又否认自己怀疑过6号，这个转变说不通。2号现在替8号降温，我也会一起记下来。";
  }
  if (withBelief && prompt.includes("after night death")) {
    return "6号死后，8号马上顺着2号把焦点推到3号，这个动作太快了。8号你先解释清楚，昨天为什么跟踩6号，今天又怎么突然换方向？";
  }
  if (withBelief) {
    return "我先不急着站2号的边。8号刚才只是跟着2号踩6号，没有自己的理由。8号你具体说一下，6号哪句话让你觉得像狼？";
  }
  if (beforeVote) {
    return "现在信息比刚才多一点，我觉得8号和2号都需要解释。大家别太分散票，我倾向先在他们里面选一个，尤其要看谁的说法更前后不一。";
  }
  return "我目前还不想直接定谁是狼。2号的发言比较强势，6号防守也有道理。大家先把理由讲清楚，别只靠感觉跟票。";
}

function scoreSpeech(speech, privateBelief) {
  const suspects = privateBelief.suspects;
  return {
    chars: [...speech].length,
    mentionsTopSuspect: suspects.length > 0 && speech.includes(suspects[0]),
    mentionsAnySuspect: suspects.some((suspect) => speech.includes(suspect)),
    mentionsEvidence: /(昨天|今天|刚才|投票|死亡|跟|转|否认|解释)/.test(speech),
    hasQuestionOrPressure: /(为什么|怎么|解释|说清楚|你先|你具体)/.test(speech),
    hasVoteDirection: /(票|出|归|投|选择)/.test(speech),
  };
}

async function run() {
  const publicHistory = [];
  const baselineOwnSpeeches = [];
  const beliefOwnSpeeches = [];
  const results = [];

  for (const [roundIndex, round] of rounds.entries()) {
    publicHistory.push(round.publicEvents);

    const baselinePrompt = buildUserPrompt({
      mode: "baseline",
      roundIndex,
      title: round.title,
      publicHistory,
      ownSpeeches: baselineOwnSpeeches,
      privateBelief: round.privateBelief,
    });
    const beliefPrompt = buildUserPrompt({
      mode: "belief",
      roundIndex,
      title: round.title,
      publicHistory,
      ownSpeeches: beliefOwnSpeeches,
      privateBelief: round.privateBelief,
    });

    const baselineSpeech = await callModel([
      { role: "system", content: systemPrompt },
      { role: "user", content: baselinePrompt },
    ]);
    const beliefSpeech = await callModel([
      { role: "system", content: systemPrompt },
      { role: "user", content: beliefPrompt },
    ]);

    baselineOwnSpeeches.push(baselineSpeech);
    beliefOwnSpeeches.push(beliefSpeech);

    results.push({
      round: roundIndex + 1,
      title: round.title,
      privateBelief: round.privateBelief,
      baseline: {
        speech: baselineSpeech,
        score: scoreSpeech(baselineSpeech, round.privateBelief),
      },
      withBelief: {
        speech: beliefSpeech,
        score: scoreSpeech(beliefSpeech, round.privateBelief),
      },
    });
  }

  const summary = summarize(results);
  const output = {
    caseName,
    mode: mock ? "mock" : "live",
    provider,
    model,
    generatedAt: new Date().toISOString(),
    summary,
    results,
  };

  const outputDir = path.join(process.cwd(), "dry-runs");
  fs.mkdirSync(outputDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputPath = path.join(outputDir, `belief-dialogue-${caseName}-${stamp}.json`);
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);

  printReport(output, outputPath);
}

function summarize(results) {
  const keys = [
    "mentionsTopSuspect",
    "mentionsAnySuspect",
    "mentionsEvidence",
    "hasQuestionOrPressure",
    "hasVoteDirection",
  ];
  const summary = {
    baseline: Object.fromEntries(keys.map((key) => [key, 0])),
    withBelief: Object.fromEntries(keys.map((key) => [key, 0])),
  };
  for (const result of results) {
    for (const key of keys) {
      if (result.baseline.score[key]) summary.baseline[key] += 1;
      if (result.withBelief.score[key]) summary.withBelief[key] += 1;
    }
  }
  return summary;
}

function printReport(output, outputPath) {
  console.log(`Dry-run mode: ${output.mode}`);
  console.log(`Case: ${output.caseName}`);
  console.log(`Model: ${output.provider}/${output.model}`);
  console.log(`Output: ${outputPath}`);
  console.log("");

  for (const result of output.results) {
    console.log(`Round ${result.round}: ${result.title}`);
    console.log(`Baseline: ${result.baseline.speech}`);
    console.log(`With belief: ${result.withBelief.speech}`);
    console.log("");
  }

  console.log("Summary counts:");
  console.log(JSON.stringify(output.summary, null, 2));
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
