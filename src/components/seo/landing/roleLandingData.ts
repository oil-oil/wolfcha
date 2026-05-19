import type { LandingAiSeat } from "./LandingAiSeats";
import type { LandingDialogueExample } from "./LandingDialogueExamples";
import type { LandingFaqItem } from "./LandingFaq";
import type { LandingRelatedLink } from "./LandingRelatedLinks";

export type RoleLandingKey = "werewolf" | "seer" | "witch" | "hunter" | "guard";

export const roleLandingKeys: RoleLandingKey[] = ["werewolf", "seer", "witch", "hunter", "guard"];

export interface RoleLandingData {
  key: RoleLandingKey;
  roleName: string;
  tagline: string;
  heroDescription: string;
  image: { src: string; alt: string };
  ability: string;
  nightAction: string;
  winCondition: string;
  beginnerMistakes: string[];
  advancedTips: string[];
  aiBehaviorNotes: string[];
  checklist: string[];
  seats: LandingAiSeat[];
  dialogues: LandingDialogueExample[];
  faqs: LandingFaqItem[];
  related: {
    hub: LandingRelatedLink[];
    cluster: LandingRelatedLink[];
  };
}

const baseSeats: LandingAiSeat[] = [
  { seed: "alex-01", name: "Alex", persona: "calm, structured", modelLogo: "/models/deepseek.svg" },
  { seed: "morgan-02", name: "Morgan", persona: "humorous, quick to react", modelLogo: "/models/gemini.svg" },
  { seed: "riley-03", name: "Riley", persona: "aggressive, high pressure", modelLogo: "/models/claude.svg" },
  { seed: "taylor-04", name: "Taylor", persona: "cautious, detail-first", modelLogo: "/models/qwen.svg" },
  { seed: "jamie-05", name: "Jamie", persona: "empathetic, trust builder", modelLogo: "/models/kimi.svg" },
  { seed: "casey-06", name: "Casey", persona: "skeptical, logic heavy", modelLogo: "/models/deepseek.svg" },
  { seed: "skyler-07", name: "Skyler", persona: "observant, low talk", modelLogo: "/models/glm.svg" },
  { seed: "quinn-08", name: "Quinn", persona: "balanced, mediator", modelLogo: "/models/bytedance.svg" },
  { seed: "drew-09", name: "Drew", persona: "storyteller, persuasive", modelLogo: "/models/openai.svg" },
  { seed: "hayden-10", name: "Hayden", persona: "risk-taking, bold claims", modelLogo: "/models/doubao.svg" },
  { seed: "cameron-11", name: "Cameron", persona: "methodical, slow but steady", modelLogo: "/models/minimax.svg" },
  { seed: "jordan-12", name: "Jordan", persona: "quiet, late-game spike", modelLogo: "/models/qwen.svg" },
];

const hubLinks: LandingRelatedLink[] = [
  { href: "/ai-werewolf", label: "AI Werewolf (Hub)", description: "What Wolfcha is and why solo vs AI works." },
  { href: "/how-to-play", label: "How to Play", description: "A quick rules overview for solo play." },
  { href: "/werewolf-game-with-ai-opponents", label: "AI Opponents", description: "How AI players fill the table." },
  { href: "/features", label: "Features", description: "Voice acting, classic roles, and more." },
];

const clusterLinks: LandingRelatedLink[] = [
  { href: "/roles/werewolf", label: "Werewolf", description: "How to hunt at night and survive by day." },
  { href: "/roles/seer", label: "Seer", description: "Turn checks into credibility and votes." },
  { href: "/roles/witch", label: "Witch", description: "Two potions, one tempo decision." },
  { href: "/roles/hunter", label: "Hunter", description: "When you fall, take one with you." },
  { href: "/roles/guard", label: "Guard", description: "Protect the right seat at the right moment." },
];

export const roleLandingDataByKey: Record<RoleLandingKey, RoleLandingData> = {
  werewolf: {
    key: "werewolf",
    roleName: "Werewolf",
    tagline: "Hunt at night. Blend in by day.",
    heroDescription:
      "As the Werewolf, your goal is to control the table narrative. Wolfcha turns classic Werewolf into a solo experience: every other seat is an AI opponent, which means every claim and every vote has a measurable consequence.",
    image: { src: "/roles/werewolf.png", alt: "Werewolf role art" },
    ability: "Each night, coordinate a kill target with the wolf team (in solo mode: the game handles coordination).",
    nightAction: "At night, decide who to eliminate. During the day, explain, deflect, and push a vote that benefits the wolves.",
    winCondition: "Win when wolves equal or outnumber the remaining villagers.",
    beginnerMistakes: [
      "Over-explaining every detail and sounding too prepared.",
      "Hard-pushing one player too early with no table buy-in.",
      "Ignoring voting math (who can actually be eliminated today).",
      "Claiming a power role without a clear follow-up plan.",
    ],
    advancedTips: [
      "Use tempo: decide whether today is a ‘solve’ day or a ‘confuse’ day.",
      "Create two competing suspicion chains so the village splits.",
      "Track which AI players are consistent; eliminate the one who anchors consensus.",
      "Seed small, verifiable facts (even as a wolf) to gain trust, then cash it in later.",
    ],
    aiBehaviorNotes: [
      "Some models are ‘logic-first’: they punish contradictions hard.",
      "Some models are ‘social-first’: they follow leadership and confidence.",
      "Watch who reframes the narrative after new information—those seats are dangerous.",
    ],
    checklist: [
      "Pick a day persona: calm analyst, comedic deflector, or helpful teammate.",
      "Avoid being first to lock a vote unless you can justify it.",
      "Never contradict your own previous logic.",
      "When cornered, redirect to voting structure and alternatives.",
    ],
    seats: baseSeats,
    dialogues: [
      {
        title: "Day 1: soft pressure without committing",
        subtitle: "A wolf pushes uncertainty and avoids a hard solve.",
        lines: [
          {
            speaker: { seed: "alex-01", name: "Alex", modelLogo: "/models/deepseek.svg", meta: "calm" },
            content:
              "I’m not convinced we have enough to hard-vote yet. Let’s list contradictions first.",
          },
          {
            speaker: { seed: "drew-09", name: "Drew", modelLogo: "/models/openai.svg", meta: "persuasive" },
            content:
              "Agree. If we rush, we hand wolves a free mis-execution. Who sounded the most ‘scripted’ to you?",
          },
          {
            speaker: { seed: "riley-03", name: "Riley", modelLogo: "/models/claude.svg", meta: "aggressive" },
            content:
              "Taylor dodged specifics. That’s suspicious. I’m fine voting Taylor.",
          },
          {
            speaker: { seed: "taylor-04", name: "Taylor", modelLogo: "/models/qwen.svg", meta: "cautious" },
            content:
              "I didn’t dodge. I asked for ordering. If you’re confident, explain the exact contradiction.",
          },
        ],
      },
      {
        title: "Late game: the wolf sells a ‘clean solve’",
        subtitle: "A confident narrative can beat noisy evidence.",
        lines: [
          {
            speaker: { seed: "quinn-08", name: "Quinn", modelLogo: "/models/bytedance.svg", meta: "mediator" },
            content:
              "We have two candidates. If we’re wrong, wolves win. We need a clear reason.",
          },
          {
            speaker: { seed: "jamie-05", name: "Jamie", modelLogo: "/models/kimi.svg", meta: "empathetic" },
            content:
              "Casey’s logic changed after the last reveal. That’s a red flag.",
          },
          {
            speaker: { seed: "casey-06", name: "Casey", modelLogo: "/models/deepseek.svg", meta: "skeptical" },
            content:
              "It didn’t change—I updated based on info. But Skyler’s vote pattern is inconsistent.",
          },
          {
            speaker: { seed: "skyler-07", name: "Skyler", modelLogo: "/models/glm.svg", meta: "observant" },
            content:
              "My votes followed probabilities. Casey is pushing me only after being questioned.",
          },
        ],
      },
    ],
    faqs: [
      {
        question: "Can Werewolves coordinate in Wolfcha solo mode?",
        answer:
          "Yes—coordination is simulated by the game flow. You still choose targets and manage day discussion like a classic table.",
      },
      {
        question: "Is it better to claim a role as a Werewolf?",
        answer:
          "Sometimes. A role claim should always come with a plan: how it will survive checks, votes, and late-game contradictions.",
      },
      {
        question: "What’s the biggest giveaway for a wolf in AI games?",
        answer:
          "Inconsistency. Many AI opponents are strict about logic drift. Keep your story stable and your reasoning defensible.",
      },
      {
        question: "How do I win as a Werewolf more often?",
        answer:
          "Use tempo and voting structure. Don’t just ‘sound good’—aim to shape who gets eliminated and when.",
      },
      {
        question: "What should I track during day discussion?",
        answer:
          "Vote intentions, who changes their mind, and who anchors consensus. Those seats often decide the game.",
      },
      {
        question: "Can I play Werewolf for free?",
        answer: "Yes. You can start a game anytime from the homepage.",
      },
    ],
    related: {
      hub: hubLinks,
      cluster: clusterLinks,
    },
  },
  seer: {
    key: "seer",
    roleName: "Seer",
    tagline: "Turn one check into a table-winning vote.",
    heroDescription:
      "The Seer is the strongest information role—but only if you can convert knowledge into trust. In Wolfcha, AI opponents respond to consistent reasoning, well-timed reveals, and vote planning.",
    image: { src: "/roles/seer.png", alt: "Seer role art" },
    ability: "Each night, check one player to learn whether they are a Werewolf or Villager-aligned.",
    nightAction:
      "Choose a check target at night. In the day phase, reveal information strategically, and guide votes without getting eliminated early.",
    winCondition: "Win by helping villagers eliminate all werewolves.",
    beginnerMistakes: [
      "Revealing too early with no credibility built.",
      "Checking random targets instead of high-impact seats.",
      "Over-sharing details that create contradictions later.",
      "Not preparing a ‘if I die’ information path.",
    ],
    advancedTips: [
      "Check the most influential speaker, not the loudest speaker.",
      "Use staged reveals: claim ‘I have info’ before dumping the full list.",
      "When you find a wolf, make your vote plan explicit (who votes where).",
      "If you find a villager, use them as a credibility anchor.",
    ],
    aiBehaviorNotes: [
      "AI players weigh consistency: keep your check history coherent.",
      "Some models demand voting structure: give them a clear path.",
      "If you hard-claim, expect pressure tests—answer calmly.",
    ],
    checklist: [
      "Pick a night target with maximum information gain.",
      "Decide your reveal timing before day discussion starts.",
      "Record your checks (mentally) and never ‘forget’ details.",
      "Offer a vote plan, not only accusations.",
    ],
    seats: baseSeats,
    dialogues: [
      {
        title: "Day 2: revealing a checked wolf",
        subtitle: "A clean reveal with voting structure.",
        lines: [
          {
            speaker: { seed: "casey-06", name: "Casey", modelLogo: "/models/deepseek.svg", meta: "logic" },
            content:
              "I’m Seer. Night 1 I checked Riley: wolf. Today I want a direct vote on Riley.",
          },
          {
            speaker: { seed: "quinn-08", name: "Quinn", modelLogo: "/models/bytedance.svg", meta: "mediator" },
            content:
              "If that’s true, we need confirmation. Casey, why didn’t you say this yesterday?",
          },
          {
            speaker: { seed: "casey-06", name: "Casey", modelLogo: "/models/deepseek.svg", meta: "seer" },
            content:
              "I waited to see if anyone would slip. Now we’re past the ‘noise’ stage—time to execute.",
          },
          {
            speaker: { seed: "riley-03", name: "Riley", modelLogo: "/models/claude.svg", meta: "pressure" },
            content:
              "Convenient timing. I’m not wolf. If we’re doing claims, I’m Seer too.",
          },
        ],
      },
      {
        title: "When you check a villager",
        subtitle: "Using a confirmed good as an ally.",
        lines: [
          {
            speaker: { seed: "alex-01", name: "Alex", modelLogo: "/models/deepseek.svg", meta: "calm" },
            content:
              "If you’re Seer, give us one safe anchor. Who is ‘good’ from your checks?",
          },
          {
            speaker: { seed: "taylor-04", name: "Taylor", modelLogo: "/models/qwen.svg", meta: "seer" },
            content:
              "Night 1 checked Jamie: good. Jamie, I need you to help structure the vote today.",
          },
          {
            speaker: { seed: "jamie-05", name: "Jamie", modelLogo: "/models/kimi.svg", meta: "ally" },
            content:
              "Got it. I’ll back the vote plan. Let’s focus on who resisted giving clear reads.",
          },
        ],
      },
    ],
    faqs: [
      {
        question: "When should the Seer reveal in Wolfcha?",
        answer:
          "There’s no single rule. Reveal when it improves your faction’s voting power: either to execute a confirmed wolf, or to create a ‘confirmed good’ anchor.",
      },
      {
        question: "Who should I check at night?",
        answer:
          "High-impact seats: strong speakers, vote leaders, or players who shape consensus. Information is most valuable when it changes votes.",
      },
      {
        question: "How do I avoid dying early as Seer?",
        answer:
          "Don’t over-expose. Build credibility with consistent reasoning before you hard-claim, and avoid being the loudest target.",
      },
      {
        question: "What if someone counter-claims Seer?",
        answer:
          "Stay calm and use structure: compare claim timing, check history, and vote behavior. AI opponents respond well to clear contradictions.",
      },
      {
        question: "Does solo vs AI change Seer strategy?",
        answer:
          "Yes. AI is stricter about logic and contradictions—clean check history and vote planning matter more.",
      },
      {
        question: "Can I play immediately?",
        answer: "Yes—use the Play now button to start a game on the homepage.",
      },
    ],
    related: {
      hub: hubLinks,
      cluster: clusterLinks,
    },
  },
  witch: {
    key: "witch",
    roleName: "Witch",
    tagline: "Two potions. One perfect tempo swing.",
    heroDescription:
      "The Witch is about timing. Your antidote and poison can flip the game, but using them too early can hand wolves a clear plan. In Wolfcha, AI opponents react sharply to potion tempo.",
    image: { src: "/roles/witch.png", alt: "Witch role art" },
    ability: "You have one antidote (save) and one poison (kill), each usable once.",
    nightAction:
      "At night, decide whether to save the victim and whether to poison a target. During the day, manage information and avoid exposing potion choices.",
    winCondition: "Win by helping villagers eliminate all werewolves.",
    beginnerMistakes: [
      "Saving every night victim without considering tempo.",
      "Poisoning on weak reads.",
      "Revealing potion use and becoming the night kill target.",
      "Not thinking about how potion actions affect claims.",
    ],
    advancedTips: [
      "Use antidote to protect confirmed value (Seer, key speaker) rather than random seats.",
      "Poison should solve a high-confidence wolf or break a locked narrative.",
      "Treat potions as vote power: you can ‘create a day’ by saving.",
      "Keep your potion history consistent with public info.",
    ],
    aiBehaviorNotes: [
      "AI watches potion tempo: frequent saves increase suspicion.",
      "Some models will pressure you for ‘why now’—prepare a clean explanation.",
      "Poisoning a wrong target creates long-term trust damage.",
    ],
    checklist: [
      "Ask: does saving improve village voting power tomorrow?",
      "If poisoning: can I justify it with public reasoning?",
      "Avoid revealing potion usage unless it’s strategically required.",
      "Track whether your decisions imply someone is confirmed wolf/good.",
    ],
    seats: baseSeats,
    dialogues: [
      {
        title: "Potion tempo: why you didn’t save",
        subtitle: "Witch explains restraint to maintain long-term advantage.",
        lines: [
          {
            speaker: { seed: "jamie-05", name: "Jamie", modelLogo: "/models/kimi.svg", meta: "empathetic" },
            content:
              "If we had a Witch save last night, we’d be in a totally different spot. Why didn’t it happen?",
          },
          {
            speaker: { seed: "alex-01", name: "Alex", modelLogo: "/models/deepseek.svg", meta: "calm" },
            content:
              "A Witch save is not ‘mandatory’. It’s a resource. Saving blindly can make wolves’ plan easier.",
          },
          {
            speaker: { seed: "quinn-08", name: "Quinn", modelLogo: "/models/bytedance.svg", meta: "mediator" },
            content:
              "So today we focus on vote quality. Who avoided giving a clear read?",
          },
        ],
      },
      {
        title: "A high-confidence poison",
        subtitle: "Poison is used to break a locked bluff.",
        lines: [
          {
            speaker: { seed: "casey-06", name: "Casey", modelLogo: "/models/deepseek.svg", meta: "logic" },
            content:
              "Riley’s claim timeline doesn’t add up. If Witch poisons, we end this immediately.",
          },
          {
            speaker: { seed: "taylor-04", name: "Taylor", modelLogo: "/models/qwen.svg", meta: "cautious" },
            content:
              "Poison is irreversible. But if we’re certain, it saves a day of debate.",
          },
          {
            speaker: { seed: "riley-03", name: "Riley", modelLogo: "/models/claude.svg", meta: "pressure" },
            content:
              "You’re all overreacting. I’m just direct. That’s not a wolf tell.",
          },
        ],
      },
    ],
    faqs: [
      {
        question: "Should Witch always save the first night kill?",
        answer:
          "Not necessarily. Saving early may be correct, but sometimes keeping antidote preserves leverage and forces wolves to reveal patterns.",
      },
      {
        question: "When is the best time to poison?",
        answer:
          "When you can justify it with strong public reasoning or when it breaks a decisive wolf plan. Avoid ‘coin-flip’ poisons.",
      },
      {
        question: "Does the Witch need to reveal potions?",
        answer:
          "Only if it changes the vote. Otherwise, staying hidden reduces the chance of being targeted.",
      },
      {
        question: "How does solo vs AI affect Witch play?",
        answer:
          "AI players track tempo and consistency closely. A clean, explainable potion timeline matters more than dramatic hero plays.",
      },
      {
        question: "Can Witch win without using poison?",
        answer:
          "Yes. Sometimes the best poison is ‘not poisoning’ if the table can execute wolves through votes.",
      },
      {
        question: "Where do I start playing?",
        answer: "Go to the homepage and start a game—no setup required.",
      },
    ],
    related: {
      hub: hubLinks,
      cluster: clusterLinks,
    },
  },
  hunter: {
    key: "hunter",
    roleName: "Hunter",
    tagline: "If you fall, trade up.",
    heroDescription:
      "The Hunter is a threat of immediate punishment. Your best games are the ones where wolves never get a clean kill on you. In Wolfcha, AI opponents adjust their risk when a Hunter is alive.",
    image: { src: "/roles/hunter.png", alt: "Hunter role art" },
    ability: "If you are eliminated (vote or night kill), you may shoot and eliminate one player (rules follow the game prompt).",
    nightAction:
      "Hunter often has no night action. The key is day discussion: build a reliable read so your shot is high impact if you die.",
    winCondition: "Win by helping villagers eliminate all werewolves.",
    beginnerMistakes: [
      "Hard-claiming Hunter too early and becoming a target.",
      "Shooting emotionally instead of based on evidence.",
      "Not leaving clear ‘if I die, shoot X’ information.",
      "Over-focusing on being ‘right’ instead of building consensus.",
    ],
    advancedTips: [
      "Use implied threat: you don’t have to claim to influence wolves.",
      "Prepare a shot plan with two options (primary + backup).",
      "Coordinate with a likely Seer or confirmed good.",
      "If you must reveal, do it when it changes the vote structure.",
    ],
    aiBehaviorNotes: [
      "AI models often avoid killing a suspected Hunter; use that to stay alive.",
      "Some models will bait a Hunter shot—look for forced framing.",
      "A well-explained shot choice increases future trust in your reads.",
    ],
    checklist: [
      "Maintain a top-2 suspect list.",
      "If you die, shoot only with a defensible reason.",
      "Don’t reveal unless it improves village voting power.",
      "Track who pushes mis-executions aggressively.",
    ],
    seats: baseSeats,
    dialogues: [
      {
        title: "Hunter pressure without claiming",
        subtitle: "Using threat indirectly to slow wolves.",
        lines: [
          {
            speaker: { seed: "skyler-07", name: "Skyler", modelLogo: "/models/glm.svg", meta: "observant" },
            content:
              "If a Hunter exists, wolves can’t just delete a key speaker. So why is Riley pushing to silence Casey?",
          },
          {
            speaker: { seed: "riley-03", name: "Riley", modelLogo: "/models/claude.svg", meta: "aggressive" },
            content:
              "Because Casey’s claim is convenient. If you’re wrong, you lose.",
          },
          {
            speaker: { seed: "casey-06", name: "Casey", modelLogo: "/models/deepseek.svg", meta: "logic" },
            content:
              "Let’s vote based on contradictions, not volume. Riley changed position after one sentence.",
          },
        ],
      },
      {
        title: "A disciplined shot",
        subtitle: "Hunter chooses a target with public reasoning.",
        lines: [
          {
            speaker: { seed: "taylor-04", name: "Taylor", modelLogo: "/models/qwen.svg", meta: "cautious" },
            content:
              "If Hunter shoots, it must be the player who drove the misvote.",
          },
          {
            speaker: { seed: "alex-01", name: "Alex", modelLogo: "/models/deepseek.svg", meta: "calm" },
            content:
              "Agreed. The shot should punish narrative manipulation, not just suspicion.",
          },
        ],
      },
    ],
    faqs: [
      {
        question: "Should the Hunter reveal early?",
        answer:
          "Usually no. Reveal when it changes the vote structure or prevents a critical mis-execution.",
      },
      {
        question: "How do I choose a good shot target?",
        answer:
          "Pick a target based on public reasoning: vote patterns, contradictions, and who pushed the table into mistakes.",
      },
      {
        question: "Can I shoot if I’m poisoned?",
        answer:
          "Rules can vary by scenario; follow the in-game prompt. Some setups restrict shooting on certain death reasons.",
      },
      {
        question: "How does Hunter change wolf behavior?",
        answer:
          "Wolves must consider trade-offs. That extra risk slows down aggressive plans and buys villagers time.",
      },
      {
        question: "Is Hunter strong in solo vs AI?",
        answer:
          "Yes. AI opponents are sensitive to punishment mechanics; your presence influences their night-kill priorities.",
      },
      {
        question: "Where is the Play button?",
        answer: "You can start instantly from the homepage.",
      },
    ],
    related: {
      hub: hubLinks,
      cluster: clusterLinks,
    },
  },
  guard: {
    key: "guard",
    roleName: "Guard",
    tagline: "Protect the right seat—without exposing yourself.",
    heroDescription:
      "The Guard is about prediction. You rarely ‘solve’ by yourself, but you can keep the village’s strongest information alive. In Wolfcha, AI opponents adapt to protection patterns quickly.",
    image: { src: "/roles/guard.png", alt: "Guard role art" },
    ability: "Each night, protect one player from a werewolf attack (typically cannot protect the same player on consecutive nights).",
    nightAction:
      "Pick a protection target at night. During the day, stay consistent and avoid accidentally revealing your protection pattern.",
    winCondition: "Win by helping villagers eliminate all werewolves.",
    beginnerMistakes: [
      "Protecting the same ‘obvious’ target every night (often illegal anyway).",
      "Over-claiming Guard and becoming a clear target.",
      "Protecting low-impact seats while key roles die.",
      "Changing protection logic day-to-day with no explanation.",
    ],
    advancedTips: [
      "Protect the seat that will shape tomorrow’s vote, not only the Seer.",
      "Use protection to create information: a ‘failed kill’ changes probabilities.",
      "Avoid patterns; mix protection targets in a rational way.",
      "If you reveal, do it with a protection history that is consistent.",
    ],
    aiBehaviorNotes: [
      "AI wolves look for protection patterns; predictable guards get exploited.",
      "Some models interpret a saved player as ‘confirmed good’. Use that carefully.",
      "Protection success can shift the table into overconfidence—keep reasoning grounded.",
    ],
    checklist: [
      "Ask: who is most likely to be killed tonight?",
      "Avoid repeating targets if rules forbid it.",
      "Keep your protection logic consistent across days.",
      "Use protection outcomes to update vote priorities.",
    ],
    seats: baseSeats,
    dialogues: [
      {
        title: "Choosing who to protect",
        subtitle: "Guard prioritizes impact over sympathy.",
        lines: [
          {
            speaker: { seed: "alex-01", name: "Alex", modelLogo: "/models/deepseek.svg", meta: "analysis" },
            content:
              "If we assume wolves kill the strongest vote leader, protecting that seat buys us a whole day.",
          },
          {
            speaker: { seed: "jamie-05", name: "Jamie", modelLogo: "/models/kimi.svg", meta: "empathetic" },
            content:
              "So we protect whoever can turn info into consensus. That’s usually the calmest speaker.",
          },
        ],
      },
      {
        title: "After a failed kill",
        subtitle: "Protection success changes probabilities.",
        lines: [
          {
            speaker: { seed: "quinn-08", name: "Quinn", modelLogo: "/models/bytedance.svg", meta: "mediator" },
            content:
              "A no-death night implies protection or Witch save. That means wolves likely targeted a high-value seat.",
          },
          {
            speaker: { seed: "taylor-04", name: "Taylor", modelLogo: "/models/qwen.svg", meta: "cautious" },
            content:
              "So today we look at who benefited most from a ‘free day’ and who pushed misvotes anyway.",
          },
        ],
      },
    ],
    faqs: [
      {
        question: "Can the Guard protect the same player twice in a row?",
        answer:
          "Typically no, but exact rules can vary by scenario. Follow the in-game prompt for your match.",
      },
      {
        question: "Who should Guard protect first?",
        answer:
          "High-impact seats: the likely Seer, a confirmed good, or a player who can structure votes.",
      },
      {
        question: "Should Guard reveal their identity?",
        answer:
          "Only if it changes voting power or prevents a critical mis-execution. Otherwise, hidden protection is safer.",
      },
      {
        question: "How does solo vs AI change Guard play?",
        answer:
          "AI opponents learn patterns quickly. You must keep protection choices rational but not predictable.",
      },
      {
        question: "What does a peaceful night mean?",
        answer:
          "It often implies protection or a save. Use it to update probabilities and vote plans.",
      },
      {
        question: "How do I start a game?",
        answer: "Use the Play now CTA to jump to the game homepage.",
      },
    ],
    related: {
      hub: hubLinks,
      cluster: clusterLinks,
    },
  },
};

export function getRoleLandingData(role: string): RoleLandingData | null {
  if (role in roleLandingDataByKey) {
    return roleLandingDataByKey[role as RoleLandingKey];
  }
  return null;
}
