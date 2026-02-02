import type { LandingDialogueExample } from "./LandingDialogueExamples";
import type { LandingFaqItem } from "./LandingFaq";
import type { LandingRelatedLink } from "./LandingRelatedLinks";

export type ModelComparisonKey =
  | "deepseek-vs-qwen"
  | "deepseek-vs-claude"
  | "claude-vs-gemini"
  | "qwen-vs-kimi"
  | "gemini-vs-openai"
  | "deepseek-vs-gemini"
  | "claude-vs-openai"
  | "kimi-vs-gemini"
  | "doubao-vs-seed"
  | "qwen-vs-claude";

export const modelComparisonKeys: ModelComparisonKey[] = [
  "deepseek-vs-qwen",
  "deepseek-vs-claude",
  "claude-vs-gemini",
  "qwen-vs-kimi",
  "gemini-vs-openai",
  "deepseek-vs-gemini",
  "claude-vs-openai",
  "kimi-vs-gemini",
  "doubao-vs-seed",
  "qwen-vs-claude",
];

export interface ModelInfo {
  key: string;
  name: string;
  logo: string;
  company: string;
  style: string;
  strengths: string[];
  weaknesses: string[];
  bestRoles: string[];
}

export interface ModelComparisonData {
  key: ModelComparisonKey;
  modelA: ModelInfo;
  modelB: ModelInfo;
  title: string;
  tagline: string;
  heroDescription: string;
  comparisonTable: Array<{ trait: string; modelA: string; modelB: string }>;
  sameScenarioDialogues: LandingDialogueExample[];
  verdict: {
    pickA: string;
    pickB: string;
    summary: string;
  };
  faqs: LandingFaqItem[];
  related: {
    hub: LandingRelatedLink[];
    models: LandingRelatedLink[];
  };
}

const modelProfiles: Record<string, ModelInfo> = {
  deepseek: {
    key: "deepseek",
    name: "DeepSeek",
    logo: "/models/deepseek.svg",
    company: "DeepSeek AI",
    style: "Analytical, logic-focused",
    strengths: ["Catches contradictions", "Structured arguments", "Vote pattern analysis"],
    weaknesses: ["Can be rigid", "Misses social cues", "Predictable patterns"],
    bestRoles: ["Seer", "Villager"],
  },
  qwen: {
    key: "qwen",
    name: "Qwen",
    logo: "/models/qwen.svg",
    company: "Alibaba Cloud",
    style: "Methodical, patient",
    strengths: ["Long-term strategy", "Patient analysis", "Vote coordination"],
    weaknesses: ["Slow to act", "Overly cautious", "Misses early opportunities"],
    bestRoles: ["Guard", "Villager"],
  },
  kimi: {
    key: "kimi",
    name: "Kimi",
    logo: "/models/kimi.svg",
    company: "Moonshot AI",
    style: "Empathetic, trust-building",
    strengths: ["Alliance building", "Social reads", "Conflict mediation"],
    weaknesses: ["Too trusting", "Avoids confrontation", "Can be manipulated"],
    bestRoles: ["Villager", "Seer"],
  },
  gemini: {
    key: "gemini",
    name: "Gemini",
    logo: "/models/gemini.svg",
    company: "Google",
    style: "Creative, adaptive",
    strengths: ["Creative plays", "Adaptive strategy", "Novel arguments"],
    weaknesses: ["Inconsistent", "Overcomplicates", "Confuses allies"],
    bestRoles: ["Werewolf", "Witch"],
  },
  claude: {
    key: "claude",
    name: "Claude",
    logo: "/models/claude.svg",
    company: "Anthropic",
    style: "Nuanced, persuasive",
    strengths: ["Multiple perspectives", "Nuanced reasoning", "Fair-minded"],
    weaknesses: ["Indecisive", "Over-explains", "Too much benefit of doubt"],
    bestRoles: ["Seer", "Guard"],
  },
  openai: {
    key: "openai",
    name: "OpenAI GPT",
    logo: "/models/openai.svg",
    company: "OpenAI",
    style: "Narrative, dramatic",
    strengths: ["Compelling speeches", "Narrative framing", "Memorable moments"],
    weaknesses: ["Style over substance", "Misses logical details", "Prioritizes story"],
    bestRoles: ["Werewolf", "Seer"],
  },
  doubao: {
    key: "doubao",
    name: "Doubao",
    logo: "/models/doubao.svg",
    company: "ByteDance",
    style: "Aggressive, confrontational",
    strengths: ["Direct pressure", "Forces reactions", "Dominates discussion"],
    weaknesses: ["Alienates allies", "Pushes wrong targets", "Draws attention"],
    bestRoles: ["Hunter", "Villager"],
  },
  seed: {
    key: "seed",
    name: "Seed",
    logo: "/models/bytedance.svg",
    company: "ByteDance",
    style: "Bold, risk-taking",
    strengths: ["Decisive action", "Game momentum", "Confident claims"],
    weaknesses: ["Overconfident", "High-risk backfires", "Draws fire"],
    bestRoles: ["Hunter", "Werewolf"],
  },
};

const hubLinks: LandingRelatedLink[] = [
  { href: "/ai-models", label: "AI Models (Hub)", description: "Overview of all AI models in Wolfcha." },
  { href: "/ai-werewolf", label: "AI Werewolf", description: "What Wolfcha is and how it works." },
  { href: "/how-to-play", label: "How to Play", description: "Rules and mechanics overview." },
];

function getModelLinks(excludeKeys: string[]): LandingRelatedLink[] {
  return Object.values(modelProfiles)
    .filter((m) => !excludeKeys.includes(m.key))
    .slice(0, 6)
    .map((m) => ({
      href: `/models/${m.key}`,
      label: m.name,
      description: m.style,
    }));
}

export const modelComparisonDataByKey: Record<ModelComparisonKey, ModelComparisonData> = {
  "deepseek-vs-qwen": {
    key: "deepseek-vs-qwen",
    modelA: modelProfiles.deepseek,
    modelB: modelProfiles.qwen,
    title: "DeepSeek vs Qwen in Werewolf",
    tagline: "Analytical precision vs methodical patience",
    heroDescription:
      "Two of the most logic-focused AI models face off in Werewolf. DeepSeek catches contradictions immediately; Qwen builds cases over multiple days. Which approach wins more games?",
    comparisonTable: [
      { trait: "Analysis style", modelA: "Immediate, reactive", modelB: "Long-term, patient" },
      { trait: "Aggression", modelA: "Low-medium", modelB: "Low" },
      { trait: "Trust building", modelA: "Through logic", modelB: "Through consistency" },
      { trait: "Risk tolerance", modelA: "Conservative", modelB: "Very conservative" },
      { trait: "Best phase", modelA: "Day 1-2 analysis", modelB: "Late game coordination" },
      { trait: "Wolf detection", modelA: "Contradiction-based", modelB: "Pattern-based" },
    ],
    sameScenarioDialogues: [
      {
        title: "Same scenario: Catching a suspicious vote",
        subtitle: "How each model reacts to the same situation.",
        lines: [
          {
            speaker: { seed: "casey-06", name: "Casey (DeepSeek)", modelLogo: "/models/deepseek.svg", meta: "analytical" },
            content: "Wait — Taylor voted against the confirmed villager yesterday, then defended them today. That's a direct contradiction. Explain.",
          },
          {
            speaker: { seed: "taylor-04", name: "Taylor (Qwen)", modelLogo: "/models/qwen.svg", meta: "patient" },
            content: "I've been tracking vote patterns for three days. There's a consistent thread: every time we get close to voting Drew, someone changes the subject. Four times now.",
          },
        ],
      },
      {
        title: "Same scenario: Building a vote coalition",
        subtitle: "Different approaches to consensus.",
        lines: [
          {
            speaker: { seed: "alex-01", name: "Alex (DeepSeek)", modelLogo: "/models/deepseek.svg", meta: "structured" },
            content: "Let's be systematic. Three suspects, ranked by contradiction count: Riley (3), Morgan (2), Skyler (1). I vote Riley.",
          },
          {
            speaker: { seed: "jordan-12", name: "Jordan (Qwen)", modelLogo: "/models/qwen.svg", meta: "coordinating" },
            content: "We have majority if we commit. I need three confirmations before I lock my vote. Alex, Jamie, Casey — are you in?",
          },
        ],
      },
    ],
    verdict: {
      pickA: "Choose DeepSeek if you want immediate feedback on logical mistakes. DeepSeek punishes contradictions fast.",
      pickB: "Choose Qwen if you prefer a slower, more strategic game. Qwen excels at multi-day vote planning.",
      summary: "DeepSeek is the detective; Qwen is the chess player. Both are formidable — the best choice depends on your playstyle.",
    },
    faqs: [
      { question: "Which model is harder to beat?", answer: "DeepSeek if you make logical mistakes; Qwen if you can't think long-term. Both require clean, consistent play." },
      { question: "Which is better at catching wolves?", answer: "DeepSeek catches wolves through immediate contradictions. Qwen catches wolves through voting pattern analysis over multiple days." },
      { question: "Which makes a better wolf?", answer: "Both are dangerous wolves. DeepSeek wolves are consistent; Qwen wolves plan ahead. Neither makes many mistakes." },
      { question: "Can I play against both in the same game?", answer: "Yes! Wolfcha randomly assigns AI models to seats. You might face both DeepSeek and Qwen at the same table." },
      { question: "Which model is more fun?", answer: "DeepSeek creates tense, quick confrontations. Qwen creates strategic, slow-burn games. It depends on what you enjoy." },
    ],
    related: {
      hub: hubLinks,
      models: getModelLinks(["deepseek", "qwen"]),
    },
  },

  "deepseek-vs-claude": {
    key: "deepseek-vs-claude",
    modelA: modelProfiles.deepseek,
    modelB: modelProfiles.claude,
    title: "DeepSeek vs Claude in Werewolf",
    tagline: "Logic-first vs nuanced persuasion",
    heroDescription:
      "DeepSeek demands logical consistency; Claude considers multiple perspectives. One catches contradictions; the other builds consensus through fair-minded analysis.",
    comparisonTable: [
      { trait: "Analysis style", modelA: "Binary logic", modelB: "Nuanced weighing" },
      { trait: "Aggression", modelA: "Low-medium", modelB: "Low" },
      { trait: "Trust building", modelA: "Through evidence", modelB: "Through fairness" },
      { trait: "Risk tolerance", modelA: "Conservative", modelB: "Conservative" },
      { trait: "Best phase", modelA: "Contradiction hunting", modelB: "Persuasion and consensus" },
      { trait: "Wolf detection", modelA: "Strict logic gates", modelB: "Behavioral patterns" },
    ],
    sameScenarioDialogues: [
      {
        title: "Same scenario: Evaluating a suspicious player",
        subtitle: "Logic vs nuance in action.",
        lines: [
          {
            speaker: { seed: "casey-06", name: "Casey (DeepSeek)", modelLogo: "/models/deepseek.svg", meta: "logical" },
            content: "The math is simple. Riley defended the wolf, then changed position after exposure. That's wolf behavior. Vote Riley.",
          },
          {
            speaker: { seed: "riley-03", name: "Riley (Claude)", modelLogo: "/models/claude.svg", meta: "nuanced" },
            content: "There are two readings here. Either Taylor made an honest mistake, or it was calculated. Let me walk through both before we vote.",
          },
        ],
      },
      {
        title: "Same scenario: Persuading the table",
        subtitle: "Different paths to the same goal.",
        lines: [
          {
            speaker: { seed: "alex-01", name: "Alex (DeepSeek)", modelLogo: "/models/deepseek.svg", meta: "direct" },
            content: "Three contradictions. Three. No villager makes that many mistakes. Drew is wolf.",
          },
          {
            speaker: { seed: "riley-03", name: "Riley (Claude)", modelLogo: "/models/claude.svg", meta: "persuasive" },
            content: "I understand why some trust Drew — the Day 1 analysis was helpful. But look at what happened since: every vote pushed village toward mistakes.",
          },
        ],
      },
    ],
    verdict: {
      pickA: "Choose DeepSeek if you want clear, binary feedback. DeepSeek tells you exactly what went wrong.",
      pickB: "Choose Claude if you prefer thoughtful analysis. Claude acknowledges complexity before deciding.",
      summary: "DeepSeek is the strict judge; Claude is the fair mediator. Both are effective, but Claude is more forgiving of ambiguity.",
    },
    faqs: [
      { question: "Which model is more forgiving?", answer: "Claude gives more benefit of the doubt. DeepSeek punishes every logical slip." },
      { question: "Which makes better arguments?", answer: "DeepSeek arguments are cleaner; Claude arguments are more persuasive. Different strengths." },
      { question: "Which is better as a wolf?", answer: "Claude wolves are dangerous because they seem fair and reasonable. DeepSeek wolves are consistent but predictable." },
      { question: "Which model cooperates better?", answer: "Claude actively builds coalitions. DeepSeek cooperates if your logic aligns." },
      { question: "Which creates more interesting games?", answer: "Claude creates nuanced debates; DeepSeek creates logical puzzles. Both are engaging." },
    ],
    related: {
      hub: hubLinks,
      models: getModelLinks(["deepseek", "claude"]),
    },
  },

  "claude-vs-gemini": {
    key: "claude-vs-gemini",
    modelA: modelProfiles.claude,
    modelB: modelProfiles.gemini,
    title: "Claude vs Gemini in Werewolf",
    tagline: "Thoughtful nuance vs creative chaos",
    heroDescription:
      "Claude considers every angle before acting; Gemini throws unexpected plays that change the game. One builds consensus; the other breaks expectations.",
    comparisonTable: [
      { trait: "Analysis style", modelA: "Multi-perspective", modelB: "Creative reframing" },
      { trait: "Aggression", modelA: "Low", modelB: "Medium-variable" },
      { trait: "Trust building", modelA: "Through fairness", modelB: "Through unpredictability" },
      { trait: "Risk tolerance", modelA: "Low", modelB: "High" },
      { trait: "Best phase", modelA: "Building consensus", modelB: "Breaking deadlocks" },
      { trait: "Wolf detection", modelA: "Pattern analysis", modelB: "Creative reframing" },
    ],
    sameScenarioDialogues: [
      {
        title: "Same scenario: Breaking a deadlock",
        subtitle: "Nuance vs creativity in a stuck game.",
        lines: [
          {
            speaker: { seed: "riley-03", name: "Riley (Claude)", modelLogo: "/models/claude.svg", meta: "thoughtful" },
            content: "We're split 4-4. Let me present both cases fairly, then we vote on which argument is stronger.",
          },
          {
            speaker: { seed: "morgan-02", name: "Morgan (Gemini)", modelLogo: "/models/gemini.svg", meta: "creative" },
            content: "What if we don't vote today? Force the wolves to make a move tonight without knowing our reads.",
          },
        ],
      },
      {
        title: "Same scenario: Reacting to new information",
        subtitle: "Measured vs explosive responses.",
        lines: [
          {
            speaker: { seed: "riley-03", name: "Riley (Claude)", modelLogo: "/models/claude.svg", meta: "measured" },
            content: "This changes things, but let's not overreact. We need to integrate this with what we already know.",
          },
          {
            speaker: { seed: "morgan-02", name: "Morgan (Gemini)", modelLogo: "/models/gemini.svg", meta: "pivoting" },
            content: "Forget everything I said before. This reveal changes the entire game. New theory: the wolves are the quiet ones.",
          },
        ],
      },
    ],
    verdict: {
      pickA: "Choose Claude if you prefer predictable, fair games. Claude creates stable, logical environments.",
      pickB: "Choose Gemini if you want chaos and surprises. Gemini keeps you on your toes.",
      summary: "Claude is the stable anchor; Gemini is the wild card. Claude wins through consistency; Gemini wins through unpredictability.",
    },
    faqs: [
      { question: "Which is more predictable?", answer: "Claude is highly predictable — fair-minded and logical. Gemini is deliberately unpredictable." },
      { question: "Which makes better allies?", answer: "Claude is a reliable ally. Gemini might surprise you with unexpected moves." },
      { question: "Which is scarier as a wolf?", answer: "Gemini wolves are terrifying because you never know what they'll do. Claude wolves are subtle manipulators." },
      { question: "Which creates more fun games?", answer: "Gemini creates chaotic, memorable games. Claude creates strategic, satisfying games. Depends on your mood." },
      { question: "Which handles pressure better?", answer: "Claude stays calm under pressure. Gemini might pivot dramatically — which could be brilliant or disastrous." },
    ],
    related: {
      hub: hubLinks,
      models: getModelLinks(["claude", "gemini"]),
    },
  },

  "qwen-vs-kimi": {
    key: "qwen-vs-kimi",
    modelA: modelProfiles.qwen,
    modelB: modelProfiles.kimi,
    title: "Qwen vs Kimi in Werewolf",
    tagline: "Strategic patience vs empathetic alliance",
    heroDescription:
      "Two patient models with different approaches: Qwen builds strategic plans; Kimi builds trust networks. One plays the game; the other plays the players.",
    comparisonTable: [
      { trait: "Analysis style", modelA: "Strategic planning", modelB: "Social reading" },
      { trait: "Aggression", modelA: "Low", modelB: "Very low" },
      { trait: "Trust building", modelA: "Through consistency", modelB: "Through empathy" },
      { trait: "Risk tolerance", modelA: "Very low", modelB: "Low" },
      { trait: "Best phase", modelA: "Multi-day strategy", modelB: "Alliance forming" },
      { trait: "Wolf detection", modelA: "Vote patterns", modelB: "Social tells" },
    ],
    sameScenarioDialogues: [
      {
        title: "Same scenario: Building a coalition",
        subtitle: "Strategy vs empathy in alliance building.",
        lines: [
          {
            speaker: { seed: "taylor-04", name: "Taylor (Qwen)", modelLogo: "/models/qwen.svg", meta: "strategic" },
            content: "We need three reliable votes. I've tracked behavior — Alex and Casey are consistent. Let's formalize this alliance.",
          },
          {
            speaker: { seed: "jamie-05", name: "Jamie (Kimi)", modelLogo: "/models/kimi.svg", meta: "warm" },
            content: "Alex, I noticed we've been thinking similarly. Want to share notes? Two heads are better than one.",
          },
        ],
      },
      {
        title: "Same scenario: Handling conflict",
        subtitle: "Different approaches to table tension.",
        lines: [
          {
            speaker: { seed: "jordan-12", name: "Jordan (Qwen)", modelLogo: "/models/qwen.svg", meta: "analytical" },
            content: "The argument between Riley and Casey doesn't change the math. Let's focus on who benefits from this chaos.",
          },
          {
            speaker: { seed: "jamie-05", name: "Jamie (Kimi)", modelLogo: "/models/kimi.svg", meta: "mediating" },
            content: "Let's slow down. Both of you have points. Riley, explain your evidence. Casey, you'll get a chance to respond.",
          },
        ],
      },
    ],
    verdict: {
      pickA: "Choose Qwen if you want a strategic challenge. Qwen rewards long-term planning and consistency.",
      pickB: "Choose Kimi if you enjoy social dynamics. Kimi creates games about trust and relationships.",
      summary: "Qwen plays chess; Kimi plays poker. Both are patient, but their victories come from different angles.",
    },
    faqs: [
      { question: "Which is more social?", answer: "Kimi is highly social and relationship-focused. Qwen is strategic but less personally engaging." },
      { question: "Which is easier to ally with?", answer: "Kimi is easier — it actively seeks connections. Qwen cooperates but on strategic terms." },
      { question: "Which is scarier as a wolf?", answer: "Kimi wolves betray deep trust at critical moments. Qwen wolves execute multi-day plans. Both are dangerous." },
      { question: "Which suits aggressive players?", answer: "Neither — both are patient. If you're aggressive, try Doubao or Seed instead." },
      { question: "Which creates warmer games?", answer: "Kimi creates genuinely warm, relationship-driven games. Qwen is more detached and strategic." },
    ],
    related: {
      hub: hubLinks,
      models: getModelLinks(["qwen", "kimi"]),
    },
  },

  "gemini-vs-openai": {
    key: "gemini-vs-openai",
    modelA: modelProfiles.gemini,
    modelB: modelProfiles.openai,
    title: "Gemini vs OpenAI GPT in Werewolf",
    tagline: "Creative chaos vs narrative drama",
    heroDescription:
      "Two creative models with different flavors: Gemini throws unexpected plays; GPT crafts compelling stories. One breaks patterns; the other builds narratives.",
    comparisonTable: [
      { trait: "Analysis style", modelA: "Creative reframing", modelB: "Narrative construction" },
      { trait: "Aggression", modelA: "Variable", modelB: "Medium" },
      { trait: "Trust building", modelA: "Through intrigue", modelB: "Through storytelling" },
      { trait: "Risk tolerance", modelA: "High", modelB: "Medium" },
      { trait: "Best phase", modelA: "Breaking deadlocks", modelB: "Dramatic reveals" },
      { trait: "Wolf detection", modelA: "Pattern disruption", modelB: "Story inconsistencies" },
    ],
    sameScenarioDialogues: [
      {
        title: "Same scenario: Making an accusation",
        subtitle: "Creative vs narrative approaches.",
        lines: [
          {
            speaker: { seed: "morgan-02", name: "Morgan (Gemini)", modelLogo: "/models/gemini.svg", meta: "creative" },
            content: "Everyone's focused on who's lying. Wrong question. Ask: who benefits from this chaos? That's where the wolves are.",
          },
          {
            speaker: { seed: "drew-09", name: "Drew (GPT)", modelLogo: "/models/openai.svg", meta: "dramatic" },
            content: "I've been holding this back because the timing wasn't right. But now it is. Night 1, I checked Morgan. Wolf.",
          },
        ],
      },
      {
        title: "Same scenario: Defending yourself",
        subtitle: "Different defensive styles.",
        lines: [
          {
            speaker: { seed: "morgan-02", name: "Morgan (Gemini)", modelLogo: "/models/gemini.svg", meta: "pivoting" },
            content: "Interesting that you're accusing me right after I suggested a new approach. Trying to shut down creative thinking?",
          },
          {
            speaker: { seed: "drew-09", name: "Drew (GPT)", modelLogo: "/models/openai.svg", meta: "narrative" },
            content: "Let me tell you a story. Every wolf I've seen plays exactly like you're playing now. The confidence, the deflection. It's a pattern.",
          },
        ],
      },
    ],
    verdict: {
      pickA: "Choose Gemini if you want unpredictable, rule-breaking games. Gemini keeps you guessing.",
      pickB: "Choose GPT if you enjoy dramatic, story-driven games. GPT creates memorable moments.",
      summary: "Gemini is the improviser; GPT is the storyteller. Both are creative, but in very different ways.",
    },
    faqs: [
      { question: "Which is more entertaining?", answer: "Both are highly entertaining. Gemini surprises; GPT creates drama. Depends on your preference." },
      { question: "Which is more consistent?", answer: "GPT is more consistent in style. Gemini is deliberately inconsistent." },
      { question: "Which makes better speeches?", answer: "GPT speeches are more polished and memorable. Gemini speeches are more unexpected." },
      { question: "Which is better at bluffing?", answer: "Both are excellent bluffers. Gemini through chaos; GPT through narrative conviction." },
      { question: "Which creates more memorable games?", answer: "Both create memorable games — Gemini through wild moments, GPT through dramatic arcs." },
    ],
    related: {
      hub: hubLinks,
      models: getModelLinks(["gemini", "openai"]),
    },
  },

  "deepseek-vs-gemini": {
    key: "deepseek-vs-gemini",
    modelA: modelProfiles.deepseek,
    modelB: modelProfiles.gemini,
    title: "DeepSeek vs Gemini in Werewolf",
    tagline: "Rigid logic vs creative flexibility",
    heroDescription:
      "The ultimate clash of styles: DeepSeek's analytical precision versus Gemini's creative chaos. One demands consistency; the other thrives on disruption.",
    comparisonTable: [
      { trait: "Analysis style", modelA: "Strict logic", modelB: "Creative reframing" },
      { trait: "Aggression", modelA: "Low-medium", modelB: "Variable" },
      { trait: "Trust building", modelA: "Through evidence", modelB: "Through intrigue" },
      { trait: "Risk tolerance", modelA: "Very low", modelB: "High" },
      { trait: "Best phase", modelA: "Evidence analysis", modelB: "Breaking stalemates" },
      { trait: "Wolf detection", modelA: "Contradiction counting", modelB: "Pattern disruption" },
    ],
    sameScenarioDialogues: [
      {
        title: "Same scenario: Responding to confusion",
        subtitle: "Order vs chaos in uncertain situations.",
        lines: [
          {
            speaker: { seed: "casey-06", name: "Casey (DeepSeek)", modelLogo: "/models/deepseek.svg", meta: "structured" },
            content: "Let's cut through the noise. List the facts: who claimed what, who voted how. Then we find contradictions.",
          },
          {
            speaker: { seed: "morgan-02", name: "Morgan (Gemini)", modelLogo: "/models/gemini.svg", meta: "creative" },
            content: "Everyone's stuck on the same data. What if the wolves WANT us analyzing this? Let's do something unexpected.",
          },
        ],
      },
      {
        title: "Same scenario: Facing a counter-claim",
        subtitle: "Different approaches to conflict.",
        lines: [
          {
            speaker: { seed: "alex-01", name: "Alex (DeepSeek)", modelLogo: "/models/deepseek.svg", meta: "logical" },
            content: "Two Seer claims. One is lying. Compare the check histories. The one with contradictions is the wolf.",
          },
          {
            speaker: { seed: "morgan-02", name: "Morgan (Gemini)", modelLogo: "/models/gemini.svg", meta: "unconventional" },
            content: "Two Seer claims? Perfect. Let's not vote either today. Make them both prove it over multiple nights.",
          },
        ],
      },
    ],
    verdict: {
      pickA: "Choose DeepSeek if you want a logical, structured game. DeepSeek rewards careful, consistent play.",
      pickB: "Choose Gemini if you want to practice adapting to chaos. Gemini tests your flexibility.",
      summary: "DeepSeek is the physics exam; Gemini is the improv show. Both test different skills.",
    },
    faqs: [
      { question: "Which is harder to predict?", answer: "Gemini is deliberately unpredictable. DeepSeek is highly predictable — which is its own challenge." },
      { question: "Which catches wolves better?", answer: "DeepSeek through logic; Gemini through disrupting wolf plans. Different but both effective." },
      { question: "Which is more frustrating to play against?", answer: "DeepSeek if you make mistakes; Gemini if you like order. Depends on your playstyle." },
      { question: "Which makes a scarier wolf?", answer: "DeepSeek wolves are airtight. Gemini wolves are chaotic. Both are dangerous for different reasons." },
      { question: "Can they work together?", answer: "Yes! A table with both creates interesting dynamics — logic vs creativity in real-time." },
    ],
    related: {
      hub: hubLinks,
      models: getModelLinks(["deepseek", "gemini"]),
    },
  },

  "claude-vs-openai": {
    key: "claude-vs-openai",
    modelA: modelProfiles.claude,
    modelB: modelProfiles.openai,
    title: "Claude vs OpenAI GPT in Werewolf",
    tagline: "Nuanced analysis vs narrative persuasion",
    heroDescription:
      "Two persuasion powerhouses with different approaches: Claude builds cases through fair analysis; GPT builds cases through compelling stories. Both are convincing — in different ways.",
    comparisonTable: [
      { trait: "Analysis style", modelA: "Multi-perspective", modelB: "Narrative framing" },
      { trait: "Aggression", modelA: "Low", modelB: "Medium" },
      { trait: "Trust building", modelA: "Through fairness", modelB: "Through storytelling" },
      { trait: "Risk tolerance", modelA: "Low", modelB: "Medium" },
      { trait: "Best phase", modelA: "Building consensus", modelB: "Dramatic reveals" },
      { trait: "Wolf detection", modelA: "Pattern analysis", modelB: "Story inconsistencies" },
    ],
    sameScenarioDialogues: [
      {
        title: "Same scenario: Making a case",
        subtitle: "Analysis vs narrative in persuasion.",
        lines: [
          {
            speaker: { seed: "riley-03", name: "Riley (Claude)", modelLogo: "/models/claude.svg", meta: "balanced" },
            content: "I understand why some defend Taylor. The reasoning was helpful early. But the pattern since then consistently hurt village. Let's weigh both sides.",
          },
          {
            speaker: { seed: "drew-09", name: "Drew (GPT)", modelLogo: "/models/openai.svg", meta: "narrative" },
            content: "Every game has a turning point. Ours was when Taylor started defending the first wolf. That's when the story became clear.",
          },
        ],
      },
      {
        title: "Same scenario: Responding to accusation",
        subtitle: "Different defensive rhetoric.",
        lines: [
          {
            speaker: { seed: "riley-03", name: "Riley (Claude)", modelLogo: "/models/claude.svg", meta: "measured" },
            content: "I hear the accusation. Let me address each point fairly, then you can judge whether it holds up.",
          },
          {
            speaker: { seed: "drew-09", name: "Drew (GPT)", modelLogo: "/models/openai.svg", meta: "dramatic" },
            content: "This is exactly what wolves do — accuse the person getting closest to the truth. You can deny it, but the story tells itself.",
          },
        ],
      },
    ],
    verdict: {
      pickA: "Choose Claude if you want fair, balanced debates. Claude creates civilized, thoughtful games.",
      pickB: "Choose GPT if you want dramatic, memorable moments. GPT creates games that feel like stories.",
      summary: "Claude is the debate moderator; GPT is the playwright. Both are persuasive, but through different means.",
    },
    faqs: [
      { question: "Which is more persuasive?", answer: "Both are highly persuasive. Claude through logic and fairness; GPT through narrative and emotion." },
      { question: "Which creates better games?", answer: "Claude creates thoughtful games; GPT creates dramatic games. Both are excellent." },
      { question: "Which is better at manipulation?", answer: "GPT manipulates through narrative framing. Claude is more straightforward." },
      { question: "Which handles conflict better?", answer: "Claude mediates conflict. GPT uses conflict for dramatic effect." },
      { question: "Which is more fun?", answer: "GPT is more theatrical; Claude is more intellectual. Depends on what you enjoy." },
    ],
    related: {
      hub: hubLinks,
      models: getModelLinks(["claude", "openai"]),
    },
  },

  "kimi-vs-gemini": {
    key: "kimi-vs-gemini",
    modelA: modelProfiles.kimi,
    modelB: modelProfiles.gemini,
    title: "Kimi vs Gemini in Werewolf",
    tagline: "Trust network vs creative disruption",
    heroDescription:
      "Two unconventional models: Kimi wins through relationships; Gemini wins through unexpected plays. One builds trust; the other breaks patterns.",
    comparisonTable: [
      { trait: "Analysis style", modelA: "Social reading", modelB: "Creative reframing" },
      { trait: "Aggression", modelA: "Very low", modelB: "Variable" },
      { trait: "Trust building", modelA: "Through empathy", modelB: "Through intrigue" },
      { trait: "Risk tolerance", modelA: "Low", modelB: "High" },
      { trait: "Best phase", modelA: "Alliance building", modelB: "Breaking deadlocks" },
      { trait: "Wolf detection", modelA: "Social tells", modelB: "Pattern disruption" },
    ],
    sameScenarioDialogues: [
      {
        title: "Same scenario: Approaching a new ally",
        subtitle: "Warmth vs intrigue in alliance building.",
        lines: [
          {
            speaker: { seed: "jamie-05", name: "Jamie (Kimi)", modelLogo: "/models/kimi.svg", meta: "warm" },
            content: "Alex, I've noticed we think similarly. Want to coordinate? I trust your reads.",
          },
          {
            speaker: { seed: "morgan-02", name: "Morgan (Gemini)", modelLogo: "/models/gemini.svg", meta: "intriguing" },
            content: "Alex, everyone's playing the same game. I have an idea that could flip everything. Interested?",
          },
        ],
      },
      {
        title: "Same scenario: Handling betrayal",
        subtitle: "Emotional vs tactical responses.",
        lines: [
          {
            speaker: { seed: "jamie-05", name: "Jamie (Kimi)", modelLogo: "/models/kimi.svg", meta: "hurt" },
            content: "I trusted you. That trust is broken now. I won't forget this, and neither will the table.",
          },
          {
            speaker: { seed: "morgan-02", name: "Morgan (Gemini)", modelLogo: "/models/gemini.svg", meta: "adapting" },
            content: "Interesting move. Didn't see that coming. Okay, new game. Everyone recalculate.",
          },
        ],
      },
    ],
    verdict: {
      pickA: "Choose Kimi if you enjoy relationship-driven games. Kimi creates emotional, trust-based dynamics.",
      pickB: "Choose Gemini if you want unpredictable, innovative games. Gemini keeps you adapting.",
      summary: "Kimi plays hearts; Gemini plays minds. Both are unconventional, but in opposite directions.",
    },
    faqs: [
      { question: "Which is harder to read?", answer: "Gemini is deliberately unpredictable. Kimi is readable but manipulates through trust." },
      { question: "Which makes better friends?", answer: "Kimi is a better friend — warm and supportive. Gemini is more of a wildcard ally." },
      { question: "Which is more dangerous?", answer: "Kimi wolves betray deep trust. Gemini wolves create chaos. Different dangers." },
      { question: "Which suits new players?", answer: "Kimi is more forgiving and supportive. Gemini can be confusing for newcomers." },
      { question: "Which creates warmer games?", answer: "Kimi creates warm, relationship-focused games. Gemini creates exciting but less personal games." },
    ],
    related: {
      hub: hubLinks,
      models: getModelLinks(["kimi", "gemini"]),
    },
  },

  "doubao-vs-seed": {
    key: "doubao-vs-seed",
    modelA: modelProfiles.doubao,
    modelB: modelProfiles.seed,
    title: "Doubao vs Seed in Werewolf",
    tagline: "Confrontational aggression vs bold risk-taking",
    heroDescription:
      "Two aggressive models with different flavors: Doubao pressures through confrontation; Seed pressures through bold claims. Both create high-intensity games.",
    comparisonTable: [
      { trait: "Analysis style", modelA: "Direct pressure", modelB: "Bold accusations" },
      { trait: "Aggression", modelA: "Very high", modelB: "Very high" },
      { trait: "Trust building", modelA: "Through dominance", modelB: "Through confidence" },
      { trait: "Risk tolerance", modelA: "High", modelB: "Very high" },
      { trait: "Best phase", modelA: "Forced reactions", modelB: "Early accusations" },
      { trait: "Wolf detection", modelA: "Pressure testing", modelB: "Gut instinct" },
    ],
    sameScenarioDialogues: [
      {
        title: "Same scenario: Opening accusation",
        subtitle: "Pressure vs confidence in early game.",
        lines: [
          {
            speaker: { seed: "hayden-10", name: "Hayden (Doubao)", modelLogo: "/models/doubao.svg", meta: "aggressive" },
            content: "Taylor, straight answer: why did you vote against the confirmed villager? No excuses, just explain.",
          },
          {
            speaker: { seed: "quinn-08", name: "Quinn (Seed)", modelLogo: "/models/bytedance.svg", meta: "bold" },
            content: "I'm calling it now: Taylor is a wolf. The hesitation on Day 1 was a tell. Let's vote.",
          },
        ],
      },
      {
        title: "Same scenario: Doubling down",
        subtitle: "Different ways to maintain pressure.",
        lines: [
          {
            speaker: { seed: "hayden-10", name: "Hayden (Doubao)", modelLogo: "/models/doubao.svg", meta: "relentless" },
            content: "You still haven't answered the question. Evasion is a wolf tell. Answer or I'm calling for the vote.",
          },
          {
            speaker: { seed: "quinn-08", name: "Quinn (Seed)", modelLogo: "/models/bytedance.svg", meta: "confident" },
            content: "If I'm wrong, vote me tomorrow. But I'm confident enough to bet my reputation on this. Taylor is wolf.",
          },
        ],
      },
    ],
    verdict: {
      pickA: "Choose Doubao if you want relentless pressure. Doubao never lets up.",
      pickB: "Choose Seed if you want bold, high-stakes games. Seed makes big swings.",
      summary: "Doubao is the interrogator; Seed is the gambler. Both create intense games, but with different energy.",
    },
    faqs: [
      { question: "Which is more intimidating?", answer: "Doubao is more intimidating — relentless and confrontational. Seed is confident but less personal." },
      { question: "Which takes bigger risks?", answer: "Seed takes bigger swings. Doubao is aggressive but more calculated." },
      { question: "Which handles pushback better?", answer: "Doubao doubles down on pressure. Seed commits and accepts consequences." },
      { question: "Which creates more chaos?", answer: "Both create chaos. Doubao through conflict; Seed through bold moves." },
      { question: "Which is harder to beat?", answer: "Doubao if you crack under pressure; Seed if you can't handle momentum shifts." },
    ],
    related: {
      hub: hubLinks,
      models: getModelLinks(["doubao", "seed"]),
    },
  },

  "qwen-vs-claude": {
    key: "qwen-vs-claude",
    modelA: modelProfiles.qwen,
    modelB: modelProfiles.claude,
    title: "Qwen vs Claude in Werewolf",
    tagline: "Strategic patience vs nuanced persuasion",
    heroDescription:
      "Two thoughtful, low-aggression models: Qwen plans across days; Claude weighs every perspective. Both are patient, but one focuses on strategy, the other on fairness.",
    comparisonTable: [
      { trait: "Analysis style", modelA: "Strategic planning", modelB: "Multi-perspective" },
      { trait: "Aggression", modelA: "Low", modelB: "Low" },
      { trait: "Trust building", modelA: "Through consistency", modelB: "Through fairness" },
      { trait: "Risk tolerance", modelA: "Very low", modelB: "Low" },
      { trait: "Best phase", modelA: "Multi-day coordination", modelB: "Persuasion and consensus" },
      { trait: "Wolf detection", modelA: "Vote patterns", modelB: "Behavioral analysis" },
    ],
    sameScenarioDialogues: [
      {
        title: "Same scenario: Planning the next vote",
        subtitle: "Strategy vs fairness in decision-making.",
        lines: [
          {
            speaker: { seed: "taylor-04", name: "Taylor (Qwen)", modelLogo: "/models/qwen.svg", meta: "strategic" },
            content: "If we vote Riley today and it's wrong, we still have majority tomorrow. The math works. Let's execute.",
          },
          {
            speaker: { seed: "riley-03", name: "Riley (Claude)", modelLogo: "/models/claude.svg", meta: "thoughtful" },
            content: "Let me present the case for and against Riley fairly. Then we vote on the stronger argument.",
          },
        ],
      },
      {
        title: "Same scenario: Integrating new information",
        subtitle: "Different approaches to updates.",
        lines: [
          {
            speaker: { seed: "jordan-12", name: "Jordan (Qwen)", modelLogo: "/models/qwen.svg", meta: "adjusting" },
            content: "This changes my Day 3 plan. Adjusting target priority. New voting order: Drew, then Morgan.",
          },
          {
            speaker: { seed: "riley-03", name: "Riley (Claude)", modelLogo: "/models/claude.svg", meta: "integrating" },
            content: "Interesting. This adds a third possibility I hadn't considered. Let me revise my read before we vote.",
          },
        ],
      },
    ],
    verdict: {
      pickA: "Choose Qwen if you want a strategic, chess-like game. Qwen rewards multi-day thinking.",
      pickB: "Choose Claude if you want thoughtful, fair debates. Claude creates civilized games.",
      summary: "Qwen is the strategist; Claude is the diplomat. Both are patient, but Qwen plays to win while Claude plays to understand.",
    },
    faqs: [
      { question: "Which is more strategic?", answer: "Qwen is more overtly strategic, planning multiple days ahead. Claude is thoughtful but less structured." },
      { question: "Which is more fair?", answer: "Claude actively strives for fairness. Qwen is consistent but focused on winning." },
      { question: "Which cooperates better?", answer: "Both cooperate well. Qwen through structured alliances; Claude through fair-minded consensus." },
      { question: "Which creates longer games?", answer: "Both tend toward longer, more thoughtful games. Neither rushes." },
      { question: "Which is harder to read?", answer: "Neither is particularly hard to read. Both are transparent in their reasoning." },
    ],
    related: {
      hub: hubLinks,
      models: getModelLinks(["qwen", "claude"]),
    },
  },
};

export function getModelComparisonData(key: string): ModelComparisonData | null {
  if (key in modelComparisonDataByKey) {
    return modelComparisonDataByKey[key as ModelComparisonKey];
  }
  return null;
}
