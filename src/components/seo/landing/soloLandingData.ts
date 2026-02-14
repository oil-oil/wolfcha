import type { LandingAiSeat } from "./LandingAiSeats";
import type { LandingDialogueExample } from "./LandingDialogueExamples";
import type { LandingFaqItem } from "./LandingFaq";
import type { LandingRelatedLink } from "./LandingRelatedLinks";

export type SoloLandingKey =
  | "play-werewolf-alone"
  | "play-werewolf-with-ai"
  | "werewolf-game-with-ai-opponents"
  | "mafia-game-solo"
  | "social-deduction-game-single-player"
  | "werewolf-game-no-friends"
  | "practice-werewolf-online"
  | "learn-werewolf-strategy"
  | "werewolf-game-browser"
  | "free-werewolf-game-online"
  | "online-werewolf-game"
  | "werewolf-game-online-free"
  | "mafia-werewolf-game-online";

export const soloLandingKeys: SoloLandingKey[] = [
  "play-werewolf-alone",
  "play-werewolf-with-ai",
  "werewolf-game-with-ai-opponents",
  "mafia-game-solo",
  "social-deduction-game-single-player",
  "werewolf-game-no-friends",
  "practice-werewolf-online",
  "learn-werewolf-strategy",
  "werewolf-game-browser",
  "free-werewolf-game-online",
  "online-werewolf-game",
  "werewolf-game-online-free",
  "mafia-werewolf-game-online",
];

export interface SoloLandingData {
  key: SoloLandingKey;
  slug: string;
  title: string;
  tagline: string;
  heroDescription: string;
  problemsSolved: string[];
  howItWorks: Array<{ step: string; description: string }>;
  uniqueFeatures: Array<{ title: string; description: string }>;
  comparisonTable: Array<{ feature: string; traditional: string; wolfcha: string }>;
  seats: LandingAiSeat[];
  dialogues: LandingDialogueExample[];
  faqs: LandingFaqItem[];
  related: {
    hub: LandingRelatedLink[];
    cluster: LandingRelatedLink[];
  };
}

export const baseSeats: LandingAiSeat[] = [
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

export const hubLinks: LandingRelatedLink[] = [
  { href: "/ai-werewolf", label: "AI Werewolf (Hub)", description: "What Wolfcha is and why solo vs AI works." },
  { href: "/how-to-play", label: "How to Play", description: "A quick rules overview for solo play." },
  { href: "/ai-models", label: "AI Models", description: "The model arena and how different models behave." },
  { href: "/features", label: "Features", description: "Voice acting, classic roles, and more." },
];

export const soloClusterLinks: LandingRelatedLink[] = [
  { href: "/play-werewolf-alone", label: "Play Werewolf Alone", description: "Start a solo game instantly." },
  { href: "/play-werewolf-with-ai", label: "Play with AI", description: "AI opponents that actually reason." },
  { href: "/mafia-game-solo", label: "Solo Mafia Game", description: "Classic Mafia, no party required." },
  { href: "/werewolf-game-no-friends", label: "No Friends Needed", description: "Perfect for solo players." },
  { href: "/practice-werewolf-online", label: "Practice Online", description: "Sharpen your skills vs AI." },
  { href: "/free-werewolf-game-online", label: "Free Online Game", description: "Play for free in your browser." },
  { href: "/online-werewolf-game", label: "Online Werewolf Game", description: "Play in browser with zero setup." },
  { href: "/werewolf-game-online-free", label: "Werewolf Game Online Free", description: "Free matches without downloads." },
  { href: "/mafia-werewolf-game-online", label: "Mafia Werewolf Game Online", description: "Mafia + Werewolf style solo mode." },
];

export function getSoloLandingData(key: string): SoloLandingData | null {
  // Lazy import to avoid circular dependency
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { soloLandingDataByKey } = require("./soloLandingDataContent");
  if (key in soloLandingDataByKey) {
    return soloLandingDataByKey[key as SoloLandingKey];
  }
  return null;
}
