import type { LandingAiSeat } from "./LandingAiSeats";
import type { LandingFaqItem } from "./LandingFaq";
import type { LandingRelatedLink } from "./LandingRelatedLinks";

export type GameComparisonKey =
  | "werewolf-vs-town-of-salem"
  | "werewolf-vs-among-us"
  | "werewolf-vs-secret-hitler"
  | "social-deduction-games-like-werewolf"
  | "party-games-like-werewolf"
  | "best-werewolf-game-online"
  | "werewolf-game-alternatives"
  | "ai-party-games";

export const gameComparisonKeys: GameComparisonKey[] = [
  "werewolf-vs-town-of-salem",
  "werewolf-vs-among-us",
  "werewolf-vs-secret-hitler",
  "social-deduction-games-like-werewolf",
  "party-games-like-werewolf",
  "best-werewolf-game-online",
  "werewolf-game-alternatives",
  "ai-party-games",
];

export interface GameComparisonData {
  key: GameComparisonKey;
  slug: string;
  title: string;
  tagline: string;
  heroDescription: string;
  comparisonIntro: string;
  comparisonTable: Array<{ dimension: string; wolfcha: string; other: string }>;
  wolfchaAdvantages: string[];
  whenToChooseWolfcha: string[];
  whenToChooseOther: string[];
  wolfchaDifferentiator: string;
  seats: LandingAiSeat[];
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
];

const hubLinks: LandingRelatedLink[] = [
  { href: "/ai-werewolf", label: "AI Werewolf (Hub)", description: "What Wolfcha is and why solo vs AI works." },
  { href: "/how-to-play", label: "How to Play", description: "A quick rules overview for solo play." },
  { href: "/features", label: "Features", description: "Voice acting, AI arena, and more." },
  { href: "/ai-models", label: "AI Models", description: "Meet the AI personalities." },
];

const comparisonClusterLinks: LandingRelatedLink[] = [
  { href: "/werewolf-vs-town-of-salem", label: "vs Town of Salem", description: "Text-based social deduction." },
  { href: "/werewolf-vs-among-us", label: "vs Among Us", description: "Task-based deduction." },
  { href: "/werewolf-vs-secret-hitler", label: "vs Secret Hitler", description: "Political deception game." },
  { href: "/social-deduction-games-like-werewolf", label: "Similar Games", description: "Other social deduction games." },
  { href: "/best-werewolf-game-online", label: "Best Online Werewolf", description: "Top options compared." },
  { href: "/ai-party-games", label: "AI Party Games", description: "Games you can play solo with AI." },
];

export const gameComparisonDataByKey: Record<GameComparisonKey, GameComparisonData> = {
  "werewolf-vs-town-of-salem": {
    key: "werewolf-vs-town-of-salem",
    slug: "werewolf-vs-town-of-salem",
    title: "Werewolf vs Town of Salem",
    tagline: "Classic social deduction showdown",
    heroDescription:
      "Town of Salem and Werewolf share DNA — both are social deduction games about hidden roles. But they differ in platform, pacing, and solo options. Here's how Wolfcha compares for players who want Werewolf-style gameplay.",
    comparisonIntro:
      "Town of Salem is a browser-based social deduction game with Mafia-style mechanics. It's been popular for years with a dedicated community. Wolfcha takes the classic Werewolf formula and adds AI opponents for solo play.",
    comparisonTable: [
      { dimension: "Solo play", wolfcha: "Yes — designed for solo vs AI", other: "No — requires other players" },
      { dimension: "Player count", wolfcha: "8-12 (all AI except you)", other: "7-15 (all human)" },
      { dimension: "Wait time", wolfcha: "Instant — start anytime", other: "Queue times vary" },
      { dimension: "Voice acting", wolfcha: "Yes — optional immersive audio", other: "Text-only" },
      { dimension: "Role variety", wolfcha: "Classic roles (Seer, Witch, etc.)", other: "Many unique roles" },
      { dimension: "AI opponents", wolfcha: "Multiple AI models with personalities", other: "Human players only" },
      { dimension: "Platform", wolfcha: "Browser, mobile-friendly", other: "Browser, Steam" },
      { dimension: "Cost", wolfcha: "Free to play", other: "Free with premium options" },
    ],
    wolfchaAdvantages: [
      "Play anytime without waiting for other players",
      "AI opponents with distinct personalities",
      "Voice acting for immersive experience",
      "No toxic players or griefing",
      "Practice strategies risk-free",
    ],
    whenToChooseWolfcha: [
      "You want to play alone or practice",
      "You prefer voice acting and atmosphere",
      "You want instant games without queue times",
      "You're learning Werewolf mechanics",
    ],
    whenToChooseOther: [
      "You want to play with real humans",
      "You prefer many unique roles",
      "You enjoy competitive ranked play",
      "You want a large community",
    ],
    wolfchaDifferentiator: "Solo play with AI opponents that actually reason and argue — not random decisions.",
    seats: baseSeats,
    faqs: [
      { question: "Is Wolfcha like Town of Salem?", answer: "Both are social deduction games, but Wolfcha is designed for solo play with AI opponents. Town of Salem requires human players." },
      { question: "Which has more roles?", answer: "Town of Salem has more unique roles. Wolfcha focuses on classic Werewolf roles (Seer, Witch, Hunter, Guard) with deep AI behavior." },
      { question: "Can I play Town of Salem alone?", answer: "No. Town of Salem requires other human players. Wolfcha is built for solo play." },
      { question: "Which is better for beginners?", answer: "Wolfcha — you can practice without pressure from competitive players or wait times." },
      { question: "Does Wolfcha have ranked play?", answer: "Not currently. Wolfcha focuses on the solo experience with AI opponents." },
      { question: "Is there voice chat?", answer: "Town of Salem is text-only. Wolfcha has optional voice acting for AI dialogue and narration." },
    ],
    related: {
      hub: hubLinks,
      cluster: comparisonClusterLinks.filter((l) => l.href !== "/werewolf-vs-town-of-salem"),
    },
  },

  "werewolf-vs-among-us": {
    key: "werewolf-vs-among-us",
    slug: "werewolf-vs-among-us",
    title: "Werewolf vs Among Us",
    tagline: "Social deduction: classic vs modern",
    heroDescription:
      "Among Us popularized social deduction for a new generation. But how does it compare to classic Werewolf? If you love Among Us's core loop, Wolfcha offers a different flavor — pure dialogue and deduction without tasks.",
    comparisonIntro:
      "Among Us combines social deduction with task-based gameplay. Players complete tasks while imposters sabotage and kill. Werewolf (Wolfcha) is pure social deduction — no tasks, just discussion, voting, and deception.",
    comparisonTable: [
      { dimension: "Gameplay focus", wolfcha: "Pure social deduction", other: "Tasks + social deduction" },
      { dimension: "Solo play", wolfcha: "Yes — AI opponents", other: "No — requires players" },
      { dimension: "Discussion depth", wolfcha: "Deep dialogue with AI", other: "Brief discussions between tasks" },
      { dimension: "Movement", wolfcha: "None — table-based", other: "Move around the map" },
      { dimension: "Evidence", wolfcha: "Verbal claims and logic", other: "Visual evidence (seeing kills)" },
      { dimension: "Voice acting", wolfcha: "Yes — optional", other: "Player voice chat" },
      { dimension: "Game length", wolfcha: "10-30 minutes", other: "5-15 minutes" },
      { dimension: "Platform", wolfcha: "Browser", other: "PC, mobile, console" },
    ],
    wolfchaAdvantages: [
      "Play alone anytime — no friends needed",
      "Deep discussion and reasoning",
      "AI opponents with distinct personalities",
      "Focus on deduction, not tasks",
      "Classic Werewolf roles and abilities",
    ],
    whenToChooseWolfcha: [
      "You prefer pure social deduction",
      "You want deep discussions and arguments",
      "You don't have friends online to play with",
      "You enjoy the classic Werewolf format",
    ],
    whenToChooseOther: [
      "You enjoy the task-based gameplay",
      "You want to play with friends",
      "You prefer visual, movement-based games",
      "You like shorter, faster rounds",
    ],
    wolfchaDifferentiator: "Pure social deduction with AI that actually argues and reasons — no tasks, just deception and logic.",
    seats: baseSeats,
    faqs: [
      { question: "Is Wolfcha like Among Us?", answer: "Both are social deduction, but Among Us has tasks and movement. Wolfcha is pure discussion and voting." },
      { question: "Can I play Among Us alone?", answer: "Not really — it requires other players. Wolfcha is designed for solo play with AI." },
      { question: "Which has deeper discussions?", answer: "Wolfcha. Among Us discussions are brief between tasks. Wolfcha is entirely discussion-based." },
      { question: "Is there any movement in Wolfcha?", answer: "No. Wolfcha is a table-based discussion game. Among Us has maps you move through." },
      { question: "Which is better for quick games?", answer: "Among Us is faster (5-15 min). Wolfcha games are 10-30 minutes for deeper discussion." },
      { question: "Can I practice for Among Us with Wolfcha?", answer: "Yes! The core skills — lying, detecting lies, building consensus — transfer well." },
    ],
    related: {
      hub: hubLinks,
      cluster: comparisonClusterLinks.filter((l) => l.href !== "/werewolf-vs-among-us"),
    },
  },

  "werewolf-vs-secret-hitler": {
    key: "werewolf-vs-secret-hitler",
    slug: "werewolf-vs-secret-hitler",
    title: "Werewolf vs Secret Hitler",
    tagline: "Hidden roles with different mechanics",
    heroDescription:
      "Secret Hitler adds policy-passing and government mechanics to social deduction. If you enjoy the political intrigue of Secret Hitler, Wolfcha offers a different experience — classic Werewolf roles with AI opponents.",
    comparisonIntro:
      "Secret Hitler is a board game where fascists try to pass fascist policies while liberals try to stop them. Werewolf (Wolfcha) uses night kills and special powers instead of policy mechanics.",
    comparisonTable: [
      { dimension: "Core mechanic", wolfcha: "Night kills + special powers", other: "Policy passing + government" },
      { dimension: "Solo play", wolfcha: "Yes — AI opponents", other: "No — requires 5-10 players" },
      { dimension: "Information reveal", wolfcha: "Role abilities (Seer checks)", other: "Policy results, power grants" },
      { dimension: "Player elimination", wolfcha: "Yes — players die", other: "Optional (assassination)" },
      { dimension: "Discussion style", wolfcha: "Free-form accusations", other: "Government proposals" },
      { dimension: "Game length", wolfcha: "15-30 minutes", other: "30-45 minutes" },
      { dimension: "Physical components", wolfcha: "None — browser-based", other: "Board, cards, envelopes" },
      { dimension: "AI opponents", wolfcha: "Yes — multiple personalities", other: "No" },
    ],
    wolfchaAdvantages: [
      "Play alone without gathering a group",
      "No physical setup required",
      "Faster games with instant start",
      "AI opponents that actually reason",
      "Classic Werewolf abilities",
    ],
    whenToChooseWolfcha: [
      "You want to play solo",
      "You prefer classic Werewolf mechanics",
      "You don't have a game night group",
      "You want voice acting and atmosphere",
    ],
    whenToChooseOther: [
      "You have 5-10 friends available",
      "You enjoy the policy/government mechanic",
      "You prefer physical board games",
      "You like longer, more strategic games",
    ],
    wolfchaDifferentiator: "Classic Werewolf mechanics with AI opponents — play the deduction game anytime, no group needed.",
    seats: baseSeats,
    faqs: [
      { question: "How is Wolfcha different from Secret Hitler?", answer: "Different mechanics: Wolfcha uses night kills and special powers; Secret Hitler uses policy passing and government roles." },
      { question: "Which is more strategic?", answer: "Both are strategic. Secret Hitler has more structured decisions (policies, government). Wolfcha has more free-form discussion." },
      { question: "Can I play Secret Hitler online?", answer: "Yes, on some platforms with other players. But Wolfcha is designed for solo play with AI." },
      { question: "Which is better for parties?", answer: "Secret Hitler is designed for groups. Wolfcha is designed for solo play." },
      { question: "Do skills transfer between them?", answer: "Somewhat. Both require reading people and managing information. The specific mechanics differ." },
      { question: "Is Wolfcha a board game?", answer: "No. Wolfcha is a browser-based video game with AI opponents." },
    ],
    related: {
      hub: hubLinks,
      cluster: comparisonClusterLinks.filter((l) => l.href !== "/werewolf-vs-secret-hitler"),
    },
  },

  "social-deduction-games-like-werewolf": {
    key: "social-deduction-games-like-werewolf",
    slug: "social-deduction-games-like-werewolf",
    title: "Social Deduction Games Like Werewolf",
    tagline: "Find your next favorite deception game",
    heroDescription:
      "Love Werewolf? The social deduction genre has many options — from Among Us to Secret Hitler to One Night Ultimate. Here's how Wolfcha fits in and why it's unique: solo play with AI opponents.",
    comparisonIntro:
      "Social deduction games share a core loop: hidden roles, discussion, and voting. But they differ in mechanics, player counts, and platforms. Wolfcha is the only one designed for solo play with AI.",
    comparisonTable: [
      { dimension: "Werewolf (Classic)", wolfcha: "✓ Classic roles, AI opponents", other: "Requires 7+ players" },
      { dimension: "Among Us", wolfcha: "Pure discussion (no tasks)", other: "Tasks + discussion" },
      { dimension: "Town of Salem", wolfcha: "Instant start, voice acting", other: "Queue times, text-only" },
      { dimension: "Secret Hitler", wolfcha: "Night abilities, no cards", other: "Policy mechanics" },
      { dimension: "One Night Ultimate", wolfcha: "Multi-round games", other: "Single round" },
      { dimension: "The Resistance", wolfcha: "Individual roles/abilities", other: "Team-based missions" },
      { dimension: "Blood on the Clocktower", wolfcha: "Simple rules, quick games", other: "Complex, storyteller-based" },
      { dimension: "Mafia", wolfcha: "AI opponents, any time", other: "Same as Werewolf, needs group" },
    ],
    wolfchaAdvantages: [
      "Only social deduction game designed for solo play",
      "AI opponents with distinct personalities",
      "No waiting for other players",
      "Voice acting and immersive audio",
      "Classic Werewolf mechanics",
    ],
    whenToChooseWolfcha: [
      "You want to play alone",
      "You love classic Werewolf/Mafia",
      "You can't gather a group",
      "You want to practice deduction skills",
    ],
    whenToChooseOther: [
      "You have a group available",
      "You want specific mechanics (tasks, policies, etc.)",
      "You prefer physical board games",
      "You want competitive multiplayer",
    ],
    wolfchaDifferentiator: "The only social deduction game where you can play solo against AI that actually reasons and argues.",
    seats: baseSeats,
    faqs: [
      { question: "What makes Wolfcha different from other social deduction games?", answer: "Wolfcha is designed for solo play. AI opponents have distinct personalities and actually reason — not random behavior." },
      { question: "Can I practice for other games with Wolfcha?", answer: "Yes! Core skills like reading lies, building trust, and managing information transfer to all social deduction games." },
      { question: "Is Wolfcha like One Night Ultimate Werewolf?", answer: "Similar theme, different format. One Night is a single round. Wolfcha has multiple day/night cycles like classic Werewolf." },
      { question: "What if I don't have friends who play social deduction?", answer: "That's exactly why Wolfcha exists. Play anytime with AI opponents." },
      { question: "Is Wolfcha competitive?", answer: "It can be! You're trying to win against AI opponents. But it's also great for casual practice." },
      { question: "Which social deduction game is best?", answer: "Depends on your situation. For solo play, Wolfcha. For groups, among the others based on your preferred mechanics." },
    ],
    related: {
      hub: hubLinks,
      cluster: comparisonClusterLinks.filter((l) => l.href !== "/social-deduction-games-like-werewolf"),
    },
  },

  "party-games-like-werewolf": {
    key: "party-games-like-werewolf",
    slug: "party-games-like-werewolf",
    title: "Party Games Like Werewolf",
    tagline: "Deception and deduction for any occasion",
    heroDescription:
      "Werewolf is a party game classic — but what if you don't have a party? Wolfcha brings the Werewolf experience to solo play. Here's how it compares to other party games and when to choose each.",
    comparisonIntro:
      "Party games with hidden roles and deception are hugely popular. Most require groups; Wolfcha lets you enjoy the core experience alone.",
    comparisonTable: [
      { dimension: "Players needed", wolfcha: "1 (you vs AI)", other: "Usually 5-15" },
      { dimension: "Setup time", wolfcha: "Instant — browser", other: "Varies (cards, apps, etc.)" },
      { dimension: "Game length", wolfcha: "10-30 minutes", other: "10-60 minutes" },
      { dimension: "Voice acting", wolfcha: "Yes — immersive audio", other: "Human voices only" },
      { dimension: "Replayability", wolfcha: "High — AI personalities vary", other: "High — different players" },
      { dimension: "Social interaction", wolfcha: "With AI opponents", other: "With humans" },
      { dimension: "Availability", wolfcha: "Any time, any place", other: "When group is available" },
      { dimension: "Learning curve", wolfcha: "Low — helpful hints", other: "Varies by game" },
    ],
    wolfchaAdvantages: [
      "No party needed — play solo anytime",
      "AI opponents with personalities",
      "Instant start in your browser",
      "Voice acting for atmosphere",
      "Practice without social pressure",
    ],
    whenToChooseWolfcha: [
      "You're alone and want to play",
      "You want to practice before a party",
      "You don't have a regular game group",
      "You enjoy solo gaming",
    ],
    whenToChooseOther: [
      "You have friends gathered",
      "You want human interaction",
      "You're hosting a party",
      "You prefer physical games",
    ],
    wolfchaDifferentiator: "All the fun of a party game, playable alone with AI opponents that think and argue.",
    seats: baseSeats,
    faqs: [
      { question: "Can Wolfcha replace party Werewolf?", answer: "For solo practice, yes. For actual parties with friends, play the real thing! Wolfcha is for when you're alone." },
      { question: "Is it as fun as playing with humans?", answer: "Different fun. AI opponents are consistent and strategic. Human games have unpredictability and social dynamics." },
      { question: "Can I learn Werewolf from Wolfcha?", answer: "Yes! Wolfcha teaches all the mechanics. You'll be ready for human games." },
      { question: "Is Wolfcha good for introverts?", answer: "Perfect for introverts who enjoy deduction games but find parties draining." },
      { question: "Can I play Wolfcha at a party?", answer: "You could, but it's designed for solo play. For parties, use classic Werewolf cards or apps." },
      { question: "What other party games can I play alone?", answer: "Not many! Most party games require groups. Wolfcha is unique in offering solo social deduction." },
    ],
    related: {
      hub: hubLinks,
      cluster: comparisonClusterLinks.filter((l) => l.href !== "/party-games-like-werewolf"),
    },
  },

  "best-werewolf-game-online": {
    key: "best-werewolf-game-online",
    slug: "best-werewolf-game-online",
    title: "Best Werewolf Game Online",
    tagline: "Find the right online Werewolf for you",
    heroDescription:
      "Looking for the best way to play Werewolf online? Options range from multiplayer platforms to AI-based solo experiences. Here's how they compare and why Wolfcha stands out for solo players.",
    comparisonIntro:
      "Online Werewolf options include multiplayer sites, apps, and solo experiences. The best choice depends on whether you have other players available.",
    comparisonTable: [
      { dimension: "Town of Salem", wolfcha: "Solo with AI", other: "Multiplayer with humans" },
      { dimension: "Wolvesville", wolfcha: "Browser-based", other: "Mobile app" },
      { dimension: "Discord Bots", wolfcha: "No setup needed", other: "Requires Discord server" },
      { dimension: "BlankmediaGames", wolfcha: "AI opponents", other: "Human players" },
      { dimension: "Tabletop Simulator", wolfcha: "Free, instant", other: "Paid, needs group" },
      { dimension: "Wolfcha", wolfcha: "Solo + AI + voice", other: "(This is Wolfcha)" },
    ],
    wolfchaAdvantages: [
      "Only option for true solo play",
      "AI opponents with distinct personalities",
      "Voice acting and narration",
      "No queue times or waiting",
      "Free and browser-based",
    ],
    whenToChooseWolfcha: [
      "You want to play alone",
      "You want instant games",
      "You prefer voice acting",
      "You're learning or practicing",
    ],
    whenToChooseOther: [
      "You want to play with humans",
      "You prefer competitive ranked play",
      "You have friends online",
      "You want a large community",
    ],
    wolfchaDifferentiator: "The only online Werewolf where you can play solo with AI that actually thinks and argues.",
    seats: baseSeats,
    faqs: [
      { question: "What's the best Werewolf game online?", answer: "Depends on your needs. For solo play: Wolfcha. For multiplayer: Town of Salem or Wolvesville." },
      { question: "Can I play Werewolf online without other people?", answer: "Only with Wolfcha. All other online options require human players." },
      { question: "Is Wolfcha free?", answer: "Yes! Free to play in your browser. No download or registration required." },
      { question: "Which has the best AI?", answer: "Wolfcha is the only one with AI opponents that reason and argue. Others use human players only." },
      { question: "Can I play Werewolf on mobile?", answer: "Wolfcha works on mobile browsers. Wolvesville is a dedicated mobile app for multiplayer." },
      { question: "Is online Werewolf as good as in-person?", answer: "Different experience. Online lacks physical presence but allows play anytime. Wolfcha adds voice acting for atmosphere." },
    ],
    related: {
      hub: hubLinks,
      cluster: comparisonClusterLinks.filter((l) => l.href !== "/best-werewolf-game-online"),
    },
  },

  "werewolf-game-alternatives": {
    key: "werewolf-game-alternatives",
    slug: "werewolf-game-alternatives",
    title: "Werewolf Game Alternatives",
    tagline: "Options for every situation",
    heroDescription:
      "Can't play classic Werewolf? There are alternatives for every situation — from solo AI games to quick mobile apps. Here's a complete guide to Werewolf alternatives and where Wolfcha fits.",
    comparisonIntro:
      "Whether you're missing players, want a different flavor, or need something portable, there's a Werewolf alternative. Wolfcha is the best option for solo play.",
    comparisonTable: [
      { dimension: "Problem: No players", wolfcha: "✓ AI opponents", other: "Still need players" },
      { dimension: "Problem: No time", wolfcha: "✓ Quick 10-min games", other: "Often longer" },
      { dimension: "Problem: No setup", wolfcha: "✓ Browser instant play", other: "Cards/apps needed" },
      { dimension: "Problem: Learning", wolfcha: "✓ Practice with AI", other: "Learn by failing" },
      { dimension: "Problem: Atmosphere", wolfcha: "✓ Voice acting", other: "Text-only usually" },
      { dimension: "Problem: Toxic players", wolfcha: "✓ AI only", other: "Human behavior varies" },
    ],
    wolfchaAdvantages: [
      "Solves the 'no players' problem",
      "Quick games for busy schedules",
      "No toxic players or griefing",
      "Voice acting for atmosphere",
      "Practice without judgment",
    ],
    whenToChooseWolfcha: [
      "You don't have enough players",
      "You want to practice privately",
      "You prefer solo gaming",
      "You want instant, no-setup games",
    ],
    whenToChooseOther: [
      "You have a group ready",
      "You want human unpredictability",
      "You prefer different mechanics",
      "You want competitive ranking",
    ],
    wolfchaDifferentiator: "The alternative for when you can't get a group together — real Werewolf gameplay with AI.",
    seats: baseSeats,
    faqs: [
      { question: "What's the best Werewolf alternative for solo play?", answer: "Wolfcha. It's designed specifically for solo play with AI opponents that reason and argue." },
      { question: "Are there Werewolf apps I can play alone?", answer: "Most Werewolf apps require human players. Wolfcha is browser-based and works solo." },
      { question: "Can One Night Ultimate Werewolf be played solo?", answer: "Not really — it's designed for groups. Wolfcha is the solo alternative." },
      { question: "Is Wolfcha good for practice?", answer: "Excellent! Practice strategies and roles without social pressure before playing with humans." },
      { question: "What if I just want to watch?", answer: "Wolfcha lets you play or spectate. Watch AI opponents argue and deduce." },
      { question: "Are there any truly single-player social deduction games?", answer: "Wolfcha is essentially unique in this space. Most social deduction requires human players." },
    ],
    related: {
      hub: hubLinks,
      cluster: comparisonClusterLinks.filter((l) => l.href !== "/werewolf-game-alternatives"),
    },
  },

  "ai-party-games": {
    key: "ai-party-games",
    slug: "ai-party-games",
    title: "AI Party Games — Play Alone",
    tagline: "Party games you can enjoy solo with AI",
    heroDescription:
      "Love party games but don't always have a party? AI-powered games let you enjoy social experiences alone. Wolfcha brings Werewolf's social deduction to solo play with AI opponents that think and argue.",
    comparisonIntro:
      "AI is changing gaming — including party games. Wolfcha represents a new category: party-style games designed for solo play with intelligent AI opponents.",
    comparisonTable: [
      { dimension: "Social deduction", wolfcha: "✓ Full Werewolf experience", other: "Usually requires humans" },
      { dimension: "AI intelligence", wolfcha: "Multiple AI models, distinct personalities", other: "Varies widely" },
      { dimension: "Conversation", wolfcha: "Real dialogue and arguments", other: "Often scripted" },
      { dimension: "Replayability", wolfcha: "High — AI behavior varies", other: "Often repetitive" },
      { dimension: "Learning curve", wolfcha: "Low — helpful hints", other: "Varies" },
      { dimension: "Atmosphere", wolfcha: "Voice acting, narration", other: "Usually text-only" },
    ],
    wolfchaAdvantages: [
      "AI opponents that actually reason",
      "Multiple AI personalities per game",
      "Voice acting for immersion",
      "Classic party game mechanics",
      "True social deduction experience",
    ],
    whenToChooseWolfcha: [
      "You want social deduction alone",
      "You enjoy AI-powered games",
      "You love Werewolf/Mafia",
      "You want voice acting",
    ],
    whenToChooseOther: [
      "You prefer other party game types",
      "You want human opponents",
      "You prefer physical board games",
      "You want different mechanics",
    ],
    wolfchaDifferentiator: "A party game you can play alone — with AI opponents that argue, deceive, and reason like humans.",
    seats: baseSeats,
    faqs: [
      { question: "Can AI really replace party game opponents?", answer: "For many games, not yet. Wolfcha's AI is specifically designed for social deduction and provides a genuine experience." },
      { question: "Is it lonely playing with AI?", answer: "Surprisingly not! Wolfcha's AI opponents have personalities and create engaging interactions." },
      { question: "Will there be more AI party games?", answer: "Likely! AI gaming is growing. Wolfcha is pioneering solo social deduction." },
      { question: "How smart is the AI?", answer: "Very capable for Werewolf. AI tracks statements, catches contradictions, and coordinates effectively." },
      { question: "Is it as fun as human opponents?", answer: "Different fun. AI is more consistent and strategic. Humans are more unpredictable." },
      { question: "What other AI games exist?", answer: "AI Dungeon, Character.AI, and others. Wolfcha is unique for structured party game mechanics." },
    ],
    related: {
      hub: hubLinks,
      cluster: comparisonClusterLinks.filter((l) => l.href !== "/ai-party-games"),
    },
  },
};

export function getGameComparisonData(key: string): GameComparisonData | null {
  if (key in gameComparisonDataByKey) {
    return gameComparisonDataByKey[key as GameComparisonKey];
  }
  return null;
}
