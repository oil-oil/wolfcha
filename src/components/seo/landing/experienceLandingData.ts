import type { LandingAiSeat } from "./LandingAiSeats";
import type { LandingDialogueExample } from "./LandingDialogueExamples";
import type { LandingFaqItem } from "./LandingFaq";
import type { LandingRelatedLink } from "./LandingRelatedLinks";

export type ExperienceLandingKey =
  | "voice-acting-werewolf-game"
  | "werewolf-game-with-narrator"
  | "text-based-werewolf-game"
  | "quick-werewolf-game"
  | "immersive-werewolf-experience"
  | "casual-werewolf-game"
  | "competitive-werewolf-mode"
  | "beginner-friendly-werewolf";

export const experienceLandingKeys: ExperienceLandingKey[] = [
  "voice-acting-werewolf-game",
  "werewolf-game-with-narrator",
  "text-based-werewolf-game",
  "quick-werewolf-game",
  "immersive-werewolf-experience",
  "casual-werewolf-game",
  "competitive-werewolf-mode",
  "beginner-friendly-werewolf",
];

export interface ExperienceLandingData {
  key: ExperienceLandingKey;
  slug: string;
  title: string;
  tagline: string;
  heroDescription: string;
  featureHighlight: {
    title: string;
    description: string;
    benefits: string[];
  };
  whenToUse: Array<{ scenario: string; recommendation: string }>;
  comparisonTable: Array<{ aspect: string; withFeature: string; withoutFeature: string }>;
  targetAudience: string[];
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
];

const hubLinks: LandingRelatedLink[] = [
  { href: "/ai-werewolf", label: "AI Werewolf (Hub)", description: "What Wolfcha is and why solo vs AI works." },
  { href: "/how-to-play", label: "How to Play", description: "A quick rules overview for solo play." },
  { href: "/features", label: "Features", description: "All Wolfcha features explained." },
  { href: "/ai-models", label: "AI Models", description: "Meet the AI personalities." },
];

const experienceClusterLinks: LandingRelatedLink[] = [
  { href: "/voice-acting-werewolf-game", label: "Voice Acting", description: "Immersive audio experience." },
  { href: "/werewolf-game-with-narrator", label: "With Narrator", description: "Story-driven gameplay." },
  { href: "/text-based-werewolf-game", label: "Text-Based", description: "Pure reading experience." },
  { href: "/quick-werewolf-game", label: "Quick Games", description: "Fast 10-minute sessions." },
  { href: "/immersive-werewolf-experience", label: "Immersive Mode", description: "Full cinematic experience." },
  { href: "/casual-werewolf-game", label: "Casual Play", description: "Relaxed, low-pressure games." },
];

export const experienceLandingDataByKey: Record<ExperienceLandingKey, ExperienceLandingData> = {
  "voice-acting-werewolf-game": {
    key: "voice-acting-werewolf-game",
    slug: "voice-acting-werewolf-game",
    title: "Werewolf Game with Voice Acting",
    tagline: "Hear your AI opponents argue, accuse, and defend",
    heroDescription:
      "Wolfcha brings Werewolf to life with professional voice acting. Every AI opponent speaks their dialogue aloud, creating an immersive experience where you hear the tension in accusations and the desperation in last words.",
    featureHighlight: {
      title: "Full voice acting for AI characters",
      description:
        "Each AI opponent has a distinct voice that matches their personality. Hear the calm analysis of a logical player, the aggressive pressure of a confrontational opponent, or the warm mediation of a trust-builder.",
      benefits: [
        "Distinct voices for each AI personality",
        "Emotional delivery that conveys tension",
        "Professional quality audio",
        "Optional — can be disabled for quiet play",
      ],
    },
    whenToUse: [
      { scenario: "You want maximum immersion", recommendation: "Enable voice acting for a cinematic experience." },
      { scenario: "You're multitasking", recommendation: "Voice lets you follow the game while doing other things." },
      { scenario: "You prefer reading", recommendation: "Disable voice for a faster, text-only experience." },
      { scenario: "You're in a public place", recommendation: "Use headphones or switch to text mode." },
    ],
    comparisonTable: [
      { aspect: "Immersion", withFeature: "High — feels like a real table", withoutFeature: "Medium — reading only" },
      { aspect: "Speed", withFeature: "Slower — audio takes time", withoutFeature: "Faster — read at your pace" },
      { aspect: "Atmosphere", withFeature: "Dramatic, cinematic", withoutFeature: "Focused, efficient" },
      { aspect: "Accessibility", withFeature: "Great for audio learners", withoutFeature: "Better for visual learners" },
    ],
    targetAudience: [
      "Players who want immersive experiences",
      "Audio learners who prefer listening",
      "Anyone wanting a more dramatic game",
      "Players who multitask while gaming",
    ],
    seats: baseSeats.slice(0, 6),
    dialogues: [
      {
        title: "Voice brings accusations to life",
        subtitle: "Hear the tension in every word.",
        lines: [
          {
            speaker: { seed: "hayden-10", name: "Hayden", modelLogo: "/models/doubao.svg", meta: "aggressive voice" },
            content: "I've been watching you all game, Taylor. Every vote, every deflection. You're the wolf. ADMIT IT.",
          },
          {
            speaker: { seed: "taylor-04", name: "Taylor", modelLogo: "/models/qwen.svg", meta: "calm voice" },
            content: "Your aggression doesn't make me guilty. Let's examine the facts calmly instead of shouting.",
          },
          {
            speaker: { seed: "jamie-05", name: "Jamie", modelLogo: "/models/kimi.svg", meta: "warm voice" },
            content: "Both of you, please. We're all on the same side here. Let's work together to find the truth.",
          },
        ],
      },
    ],
    faqs: [
      { question: "How do I enable voice acting?", answer: "Voice acting is enabled by default. You can toggle it in Settings > Audio > Voice Acting." },
      { question: "Can I adjust the voice speed?", answer: "Currently, voices play at natural speed. Text mode lets you read at your own pace." },
      { question: "Are there different voice options?", answer: "Each AI personality has its own distinct voice. The voices match their character traits." },
      { question: "Does voice acting slow down the game?", answer: "Yes, slightly. Each line takes time to speak. Text mode is faster for quick games." },
      { question: "Can I use voice with auto-advance?", answer: "Yes! Auto-advance waits for each voice line to complete before moving on." },
      { question: "What languages are voices available in?", answer: "Currently English voices are available. The game supports both English and Chinese text." },
    ],
    related: {
      hub: hubLinks,
      cluster: experienceClusterLinks.filter((l) => l.href !== "/voice-acting-werewolf-game"),
    },
  },

  "werewolf-game-with-narrator": {
    key: "werewolf-game-with-narrator",
    slug: "werewolf-game-with-narrator",
    title: "Werewolf Game with Narrator",
    tagline: "A narrator guides every phase of the game",
    heroDescription:
      "Experience Werewolf the classic way — with a narrator who announces phases, reveals deaths, and builds tension. Wolfcha's narrator creates atmosphere while keeping the game flowing smoothly.",
    featureHighlight: {
      title: "Professional narrator guidance",
      description:
        "A narrator announces each game phase, reveals what happened during the night, and creates dramatic moments. Like having a game master who never makes mistakes.",
      benefits: [
        "Clear phase announcements",
        "Dramatic death reveals",
        "Consistent pacing",
        "Atmospheric storytelling",
      ],
    },
    whenToUse: [
      { scenario: "You're new to Werewolf", recommendation: "The narrator helps you understand what's happening." },
      { scenario: "You want atmosphere", recommendation: "Narrator creates dramatic tension throughout the game." },
      { scenario: "You prefer fast games", recommendation: "Skip narration for quicker rounds." },
      { scenario: "You're practicing strategy", recommendation: "Narrator-free mode lets you focus on analysis." },
    ],
    comparisonTable: [
      { aspect: "Game clarity", withFeature: "Very clear — narrator explains everything", withoutFeature: "Clear — text prompts guide you" },
      { aspect: "Atmosphere", withFeature: "High — dramatic storytelling", withoutFeature: "Lower — functional gameplay" },
      { aspect: "Game length", withFeature: "Longer — narration takes time", withoutFeature: "Shorter — no waiting" },
      { aspect: "Learning curve", withFeature: "Easier — narrator guides you", withoutFeature: "Steeper — learn by doing" },
    ],
    targetAudience: [
      "New players learning the game",
      "Players who enjoy storytelling",
      "Anyone wanting a classic Werewolf feel",
      "Players who like guided experiences",
    ],
    seats: baseSeats.slice(0, 6),
    dialogues: [
      {
        title: "The narrator sets the scene",
        subtitle: "Dramatic phase transitions.",
        lines: [
          {
            speaker: { seed: "narrator-01", name: "Narrator", modelLogo: "/models/openai.svg", meta: "dramatic" },
            content: "Night falls on the village. Close your eyes and listen... somewhere in the darkness, werewolves are choosing their next victim.",
          },
          {
            speaker: { seed: "narrator-01", name: "Narrator", modelLogo: "/models/openai.svg", meta: "suspenseful" },
            content: "Dawn breaks. The village gathers... and a body is found. Alex did not survive the night.",
          },
        ],
      },
    ],
    faqs: [
      { question: "Who is the narrator?", answer: "The narrator is an AI voice that guides the game, announces phases, and creates atmosphere." },
      { question: "Can I skip narrator lines?", answer: "Yes, you can click to skip individual narrator lines or disable narration entirely." },
      { question: "Is the narrator always the same?", answer: "The narrator has a consistent voice and style, but the content adapts to each game's events." },
      { question: "Does narration affect gameplay?", answer: "Narration is purely atmospheric — it doesn't change the rules or AI behavior." },
      { question: "Can I have narrator without character voices?", answer: "Yes! You can enable narrator-only mode in audio settings." },
      { question: "How do I disable the narrator?", answer: "Go to Settings > Audio > Narrator and toggle it off." },
    ],
    related: {
      hub: hubLinks,
      cluster: experienceClusterLinks.filter((l) => l.href !== "/werewolf-game-with-narrator"),
    },
  },

  "text-based-werewolf-game": {
    key: "text-based-werewolf-game",
    slug: "text-based-werewolf-game",
    title: "Text-Based Werewolf Game",
    tagline: "Pure reading, no audio — play at your own pace",
    heroDescription:
      "Prefer reading over listening? Wolfcha's text mode delivers the full Werewolf experience without audio. Read AI dialogue at your own pace, in any environment, with no headphones required.",
    featureHighlight: {
      title: "Silent, reading-focused gameplay",
      description:
        "All dialogue appears as text. No voices, no narrator audio — just pure reading. Perfect for quiet environments, fast players, or anyone who prefers text-based games.",
      benefits: [
        "Read at your own speed",
        "Play in any environment",
        "No headphones needed",
        "Faster game sessions",
      ],
    },
    whenToUse: [
      { scenario: "You're in a quiet environment", recommendation: "Text mode needs no audio at all." },
      { scenario: "You read faster than speaking", recommendation: "Skip audio and read at your pace." },
      { scenario: "You want immersion", recommendation: "Consider enabling voice acting instead." },
      { scenario: "You're on mobile data", recommendation: "Text mode uses less bandwidth than audio." },
    ],
    comparisonTable: [
      { aspect: "Speed", withFeature: "Fast — read at your pace", withoutFeature: "Slower — wait for audio" },
      { aspect: "Environment", withFeature: "Anywhere — no sound needed", withoutFeature: "Needs quiet or headphones" },
      { aspect: "Immersion", withFeature: "Lower — functional focus", withoutFeature: "Higher — atmospheric audio" },
      { aspect: "Data usage", withFeature: "Lower — no audio streaming", withoutFeature: "Higher — audio data" },
    ],
    targetAudience: [
      "Fast readers",
      "Players in quiet environments",
      "Anyone on limited data",
      "Players who prefer efficiency over atmosphere",
    ],
    seats: baseSeats.slice(0, 6),
    dialogues: [
      {
        title: "Text dialogue flows quickly",
        subtitle: "Read and respond at your pace.",
        lines: [
          {
            speaker: { seed: "casey-06", name: "Casey", modelLogo: "/models/deepseek.svg", meta: "text" },
            content: "I've tracked three contradictions in Taylor's statements. That's statistically significant.",
          },
          {
            speaker: { seed: "taylor-04", name: "Taylor", modelLogo: "/models/qwen.svg", meta: "text" },
            content: "Which contradictions? List them specifically. I'll address each one.",
          },
          {
            speaker: { seed: "morgan-02", name: "Morgan", modelLogo: "/models/gemini.svg", meta: "text" },
            content: "While you two argue, who's watching the quiet players?",
          },
        ],
      },
    ],
    faqs: [
      { question: "How do I enable text-only mode?", answer: "Go to Settings > Audio and disable both Voice Acting and Narrator." },
      { question: "Can I still see all dialogue?", answer: "Yes! All AI dialogue appears as text, exactly as with audio enabled." },
      { question: "Is text mode faster?", answer: "Yes, significantly. You read faster than voices speak, and there's no waiting for audio." },
      { question: "Does text mode change the AI behavior?", answer: "No. AI opponents behave identically — only the presentation changes." },
      { question: "Can I switch mid-game?", answer: "Yes! Toggle audio settings anytime during gameplay." },
      { question: "Are there accessibility benefits?", answer: "Yes. Text mode works well with screen readers and is fully accessible." },
    ],
    related: {
      hub: hubLinks,
      cluster: experienceClusterLinks.filter((l) => l.href !== "/text-based-werewolf-game"),
    },
  },

  "quick-werewolf-game": {
    key: "quick-werewolf-game",
    slug: "quick-werewolf-game",
    title: "Quick Werewolf Game",
    tagline: "10-minute games for busy schedules",
    heroDescription:
      "Short on time? Wolfcha's quick mode delivers complete Werewolf games in 10-15 minutes. Smaller player counts, faster pacing, and optional auto-advance let you enjoy social deduction during a coffee break.",
    featureHighlight: {
      title: "Optimized for short sessions",
      description:
        "Smaller tables (8 players), text-mode by default, and streamlined phases create games that fit into any schedule. Full Werewolf experience, condensed timing.",
      benefits: [
        "Complete games in 10-15 minutes",
        "Smaller 8-player tables",
        "Auto-advance option",
        "Text mode for speed",
      ],
    },
    whenToUse: [
      { scenario: "You have limited time", recommendation: "Quick mode fits games into breaks." },
      { scenario: "You want practice rounds", recommendation: "Fast games let you practice more strategies." },
      { scenario: "You want depth", recommendation: "Choose larger tables for more complex games." },
      { scenario: "You're a beginner", recommendation: "Quick games are great for learning basics." },
    ],
    comparisonTable: [
      { aspect: "Game length", withFeature: "10-15 minutes", withoutFeature: "20-30 minutes" },
      { aspect: "Table size", withFeature: "8 players (quick)", withoutFeature: "10-12 players (full)" },
      { aspect: "Complexity", withFeature: "Streamlined", withoutFeature: "Full strategic depth" },
      { aspect: "Practice value", withFeature: "High — more games per hour", withoutFeature: "Moderate — deeper per game" },
    ],
    targetAudience: [
      "Busy players with limited time",
      "Beginners learning the game",
      "Anyone wanting quick practice",
      "Players on mobile during commutes",
    ],
    seats: baseSeats.slice(0, 6),
    dialogues: [
      {
        title: "Quick games still have drama",
        subtitle: "Condensed but complete experience.",
        lines: [
          {
            speaker: { seed: "alex-01", name: "Alex", modelLogo: "/models/deepseek.svg", meta: "efficient" },
            content: "Day 2. We've lost one. My top suspect is Riley based on the vote split yesterday.",
          },
          {
            speaker: { seed: "riley-03", name: "Riley", modelLogo: "/models/claude.svg", meta: "quick" },
            content: "That's a reach. I voted with the majority. Look at who benefited from the outcome.",
          },
        ],
      },
    ],
    faqs: [
      { question: "How do I start a quick game?", answer: "Choose 8 players in game setup. Smaller tables play faster." },
      { question: "What roles are in quick games?", answer: "All roles are available. The game adjusts role distribution for smaller tables." },
      { question: "Can I enable voice in quick mode?", answer: "Yes, but voice adds time. Text mode is faster for quick games." },
      { question: "Are quick games easier?", answer: "Similar difficulty, but fewer players means fewer interactions to track." },
      { question: "How many quick games can I play per hour?", answer: "Typically 4-6 complete games per hour in quick mode." },
      { question: "Is quick mode good for learning?", answer: "Yes! Faster iteration lets you practice more strategies." },
    ],
    related: {
      hub: hubLinks,
      cluster: experienceClusterLinks.filter((l) => l.href !== "/quick-werewolf-game"),
    },
  },

  "immersive-werewolf-experience": {
    key: "immersive-werewolf-experience",
    slug: "immersive-werewolf-experience",
    title: "Immersive Werewolf Experience",
    tagline: "Full cinematic atmosphere with voice and narration",
    heroDescription:
      "For the ultimate Werewolf experience, enable everything: voice acting, narrator, and atmospheric pacing. Wolfcha becomes a cinematic social deduction thriller where every accusation feels real.",
    featureHighlight: {
      title: "Maximum atmosphere mode",
      description:
        "Voice acting + narrator + natural pacing creates an experience that feels like a movie. Every phase has weight. Every accusation has emotion. Every reveal has impact.",
      benefits: [
        "Full voice acting for all characters",
        "Dramatic narrator throughout",
        "Atmospheric pacing",
        "Cinematic reveals and deaths",
      ],
    },
    whenToUse: [
      { scenario: "You want the best experience", recommendation: "Immersive mode is Wolfcha at its finest." },
      { scenario: "You have time to spare", recommendation: "Immersive games take longer but feel more complete." },
      { scenario: "You're short on time", recommendation: "Quick mode is better for busy schedules." },
      { scenario: "You're in a quiet space with headphones", recommendation: "Perfect conditions for immersive play." },
    ],
    comparisonTable: [
      { aspect: "Atmosphere", withFeature: "Maximum — cinematic feel", withoutFeature: "Functional — efficient play" },
      { aspect: "Game length", withFeature: "25-40 minutes", withoutFeature: "15-25 minutes" },
      { aspect: "Emotional impact", withFeature: "High — feels dramatic", withoutFeature: "Lower — strategic focus" },
      { aspect: "Required setup", withFeature: "Headphones recommended", withoutFeature: "Play anywhere" },
    ],
    targetAudience: [
      "Players seeking maximum immersion",
      "Story-driven gamers",
      "Those with time for longer sessions",
      "Players who enjoy atmospheric games",
    ],
    seats: baseSeats,
    dialogues: [
      {
        title: "Immersive reveals hit different",
        subtitle: "When every line has voice and weight.",
        lines: [
          {
            speaker: { seed: "narrator-01", name: "Narrator", modelLogo: "/models/openai.svg", meta: "dramatic" },
            content: "The village falls silent as the accusation hangs in the air. All eyes turn to the accused...",
          },
          {
            speaker: { seed: "casey-06", name: "Casey", modelLogo: "/models/deepseek.svg", meta: "intense voice" },
            content: "I've held this back long enough. I'm Seer. And I checked Riley on Night 1. Wolf.",
          },
          {
            speaker: { seed: "riley-03", name: "Riley", modelLogo: "/models/claude.svg", meta: "shocked voice" },
            content: "That's... that's a lie. I'm not wolf. If we're doing claims, I'm Seer too.",
          },
        ],
      },
    ],
    faqs: [
      { question: "How do I enable immersive mode?", answer: "Enable both Voice Acting and Narrator in Settings > Audio. Choose larger tables for more depth." },
      { question: "How long are immersive games?", answer: "Typically 25-40 minutes depending on table size and how quickly you read/act." },
      { question: "Is immersive mode the 'best' way to play?", answer: "It's the most atmospheric way. Quick text mode is better for practice and time-limited play." },
      { question: "Do I need good speakers?", answer: "Headphones are recommended for the best immersive experience." },
      { question: "Can I pause immersive games?", answer: "Yes! The game saves automatically. Return anytime." },
      { question: "Is immersive mode good for beginners?", answer: "Yes — the narrator helps guide new players through phases." },
    ],
    related: {
      hub: hubLinks,
      cluster: experienceClusterLinks.filter((l) => l.href !== "/immersive-werewolf-experience"),
    },
  },

  "casual-werewolf-game": {
    key: "casual-werewolf-game",
    slug: "casual-werewolf-game",
    title: "Casual Werewolf Game",
    tagline: "Relaxed play with no pressure",
    heroDescription:
      "Not every game needs to be competitive. Wolfcha's casual mode is about enjoying the social deduction experience without stress. Take your time, experiment with strategies, and have fun.",
    featureHighlight: {
      title: "Low-pressure social deduction",
      description:
        "Casual mode emphasizes enjoyment over optimization. AI opponents are engaging but not punishing. Make mistakes, learn, and enjoy the story that unfolds.",
      benefits: [
        "Relaxed pacing — no rush",
        "Forgiving AI opponents",
        "Focus on fun over winning",
        "Great for unwinding",
      ],
    },
    whenToUse: [
      { scenario: "You want to relax", recommendation: "Casual mode is low-stress entertainment." },
      { scenario: "You're learning", recommendation: "Casual lets you experiment without pressure." },
      { scenario: "You want a challenge", recommendation: "Try competitive mode instead." },
      { scenario: "You're playing to unwind", recommendation: "Perfect for casual end-of-day gaming." },
    ],
    comparisonTable: [
      { aspect: "Stress level", withFeature: "Low — relaxed atmosphere", withoutFeature: "Higher — competitive pressure" },
      { aspect: "AI aggression", withFeature: "Moderate — engaging but fair", withoutFeature: "Higher — punishing mistakes" },
      { aspect: "Learning value", withFeature: "High — safe to experiment", withoutFeature: "Different — learn by failing" },
      { aspect: "Intensity", withFeature: "Moderate — enjoyable", withoutFeature: "High — demanding" },
    ],
    targetAudience: [
      "Players who want to relax",
      "Beginners learning the game",
      "Anyone seeking low-stress gaming",
      "Players unwinding after work",
    ],
    seats: baseSeats.slice(0, 6),
    dialogues: [
      {
        title: "Casual games still have drama",
        subtitle: "Fun without the pressure.",
        lines: [
          {
            speaker: { seed: "jamie-05", name: "Jamie", modelLogo: "/models/kimi.svg", meta: "friendly" },
            content: "I'm not sure who to vote for, but I trust Alex's read. What do you think?",
          },
          {
            speaker: { seed: "alex-01", name: "Alex", modelLogo: "/models/deepseek.svg", meta: "helpful" },
            content: "My gut says Taylor, but I could be wrong. Let's hear more before we decide.",
          },
        ],
      },
    ],
    faqs: [
      { question: "What makes casual mode different?", answer: "Casual mode emphasizes enjoyment. AI opponents are engaging but less punishing." },
      { question: "Can I still win in casual mode?", answer: "Absolutely! Casual affects atmosphere, not game rules. Winning is just as possible." },
      { question: "Is casual mode easier?", answer: "Slightly. AI opponents are less aggressive about exploiting mistakes." },
      { question: "Should beginners start with casual?", answer: "Yes! Casual is great for learning without frustration." },
      { question: "Can I switch to competitive later?", answer: "Yes. Each game, you can choose your preferred style." },
      { question: "Does casual mode have voice acting?", answer: "Yes! All audio features work in casual mode." },
    ],
    related: {
      hub: hubLinks,
      cluster: experienceClusterLinks.filter((l) => l.href !== "/casual-werewolf-game"),
    },
  },

  "competitive-werewolf-mode": {
    key: "competitive-werewolf-mode",
    slug: "competitive-werewolf-mode",
    title: "Competitive Werewolf Mode",
    tagline: "Test your skills against challenging AI",
    heroDescription:
      "Ready for a real challenge? Competitive mode features AI opponents that punish every mistake. They catch contradictions, exploit weaknesses, and coordinate effectively. Only the best strategies win.",
    featureHighlight: {
      title: "Maximum AI challenge",
      description:
        "Competitive AI opponents play to win. They track every statement, punish contradictions immediately, and coordinate votes effectively. This is Werewolf for serious players.",
      benefits: [
        "Highly skilled AI opponents",
        "Immediate punishment for mistakes",
        "Effective wolf coordination",
        "True strategic challenge",
      ],
    },
    whenToUse: [
      { scenario: "You want a challenge", recommendation: "Competitive mode tests your best strategies." },
      { scenario: "You're practicing for human games", recommendation: "Competitive AI mimics skilled human play." },
      { scenario: "You're a beginner", recommendation: "Start with casual mode to learn basics first." },
      { scenario: "You enjoy intense games", recommendation: "Competitive delivers tension and stakes." },
    ],
    comparisonTable: [
      { aspect: "Difficulty", withFeature: "High — punishes mistakes", withoutFeature: "Moderate — more forgiving" },
      { aspect: "AI coordination", withFeature: "Strong — wolves work together", withoutFeature: "Moderate — less optimized" },
      { aspect: "Learning value", withFeature: "High — exposes weaknesses", withoutFeature: "Moderate — gentler feedback" },
      { aspect: "Intensity", withFeature: "High — every decision matters", withoutFeature: "Lower — more relaxed" },
    ],
    targetAudience: [
      "Experienced players seeking challenge",
      "Competitive gamers",
      "Players preparing for human matches",
      "Anyone who enjoys hard games",
    ],
    seats: baseSeats,
    dialogues: [
      {
        title: "Competitive AI catches everything",
        subtitle: "No mistake goes unpunished.",
        lines: [
          {
            speaker: { seed: "casey-06", name: "Casey", modelLogo: "/models/deepseek.svg", meta: "sharp" },
            content: "You said you trusted Alex yesterday. Today you voted against them. Explain the contradiction.",
          },
          {
            speaker: { seed: "taylor-04", name: "Taylor", modelLogo: "/models/qwen.svg", meta: "precise" },
            content: "Adding to that: this is the third time your stated position didn't match your vote. The pattern is clear.",
          },
        ],
      },
    ],
    faqs: [
      { question: "How hard is competitive mode?", answer: "Very challenging. AI opponents play at a high level and punish mistakes immediately." },
      { question: "Is competitive mode frustrating?", answer: "It can be! But it's also deeply satisfying when you win against tough opponents." },
      { question: "Should I start with competitive?", answer: "Not recommended. Learn basics in casual mode first, then graduate to competitive." },
      { question: "Do wolves coordinate better in competitive?", answer: "Yes. Wolf AI opponents work together more effectively in competitive mode." },
      { question: "Is competitive mode good practice?", answer: "Excellent practice. Competitive AI mimics skilled human players." },
      { question: "Can I track my competitive win rate?", answer: "Yes. Statistics are tracked and displayed on your profile." },
    ],
    related: {
      hub: hubLinks,
      cluster: experienceClusterLinks.filter((l) => l.href !== "/competitive-werewolf-mode"),
    },
  },

  "beginner-friendly-werewolf": {
    key: "beginner-friendly-werewolf",
    slug: "beginner-friendly-werewolf",
    title: "Beginner-Friendly Werewolf",
    tagline: "Learn the game with helpful AI",
    heroDescription:
      "New to Werewolf? Wolfcha's beginner mode teaches you as you play. Helpful hints, patient AI opponents, and guided gameplay let you learn the rules naturally without pressure.",
    featureHighlight: {
      title: "Learn while playing",
      description:
        "Beginner mode includes contextual hints, explains game mechanics as they happen, and features patient AI opponents who give you time to think. Perfect first experience.",
      benefits: [
        "Contextual hints during gameplay",
        "Mechanics explained as they happen",
        "Patient, forgiving AI",
        "No pressure to perform",
      ],
    },
    whenToUse: [
      { scenario: "You've never played Werewolf", recommendation: "Start here to learn the basics." },
      { scenario: "You know the rules", recommendation: "Skip to casual or quick mode." },
      { scenario: "You're teaching someone", recommendation: "Beginner mode is perfect for new players." },
      { scenario: "You want to review basics", recommendation: "Good for refreshing rusty knowledge." },
    ],
    comparisonTable: [
      { aspect: "Learning support", withFeature: "High — hints and explanations", withoutFeature: "None — learn by doing" },
      { aspect: "AI patience", withFeature: "Very patient — time to think", withoutFeature: "Normal pacing" },
      { aspect: "Complexity", withFeature: "Simplified — core mechanics focus", withoutFeature: "Full — all mechanics active" },
      { aspect: "Challenge", withFeature: "Low — designed to teach", withoutFeature: "Variable — based on mode" },
    ],
    targetAudience: [
      "Complete beginners",
      "Players new to social deduction",
      "Anyone wanting a refresher",
      "Players teaching friends",
    ],
    seats: baseSeats.slice(0, 6),
    dialogues: [
      {
        title: "Beginner mode helps you learn",
        subtitle: "Guidance when you need it.",
        lines: [
          {
            speaker: { seed: "hint-01", name: "Game Hint", modelLogo: "/models/openai.svg", meta: "helpful" },
            content: "Tip: As a Villager, pay attention to who defends whom. Wolves often protect each other.",
          },
          {
            speaker: { seed: "jamie-05", name: "Jamie", modelLogo: "/models/kimi.svg", meta: "friendly" },
            content: "I think Taylor might be suspicious, but I'm not sure. What do you think?",
          },
        ],
      },
    ],
    faqs: [
      { question: "What hints does beginner mode provide?", answer: "Role-specific tips, voting guidance, and explanations of game events as they happen." },
      { question: "Can I disable hints?", answer: "Yes! Toggle hints off in Settings when you're ready for unassisted play." },
      { question: "Is beginner mode too easy?", answer: "It's designed to teach, not challenge. Graduate to casual or competitive when ready." },
      { question: "How long should I play beginner mode?", answer: "Until you understand all roles and basic strategy — usually 3-5 games." },
      { question: "Does beginner mode have all roles?", answer: "Yes. All roles are included, with explanations of each ability." },
      { question: "Can experienced players use beginner mode?", answer: "Sure! It's also good for trying new strategies without pressure." },
    ],
    related: {
      hub: hubLinks,
      cluster: experienceClusterLinks.filter((l) => l.href !== "/beginner-friendly-werewolf"),
    },
  },
};

export function getExperienceLandingData(key: string): ExperienceLandingData | null {
  if (key in experienceLandingDataByKey) {
    return experienceLandingDataByKey[key as ExperienceLandingKey];
  }
  return null;
}
