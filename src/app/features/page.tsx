import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { MarketingPageWrapper } from "@/components/seo/MarketingPageWrapper";
import { JsonLd } from "@/components/seo/JsonLd";
import { LandingHero } from "@/components/seo/landing/LandingHero";
import { LandingSection } from "@/components/seo/landing/LandingSection";
import { LandingAiSeats } from "@/components/seo/landing/LandingAiSeats";
import { LandingDialogueExamples } from "@/components/seo/landing/LandingDialogueExamples";
import { LandingFaq } from "@/components/seo/landing/LandingFaq";
import { LandingRelatedLinks } from "@/components/seo/landing/LandingRelatedLinks";
import { LandingCta } from "@/components/seo/landing/LandingCta";

export const metadata: Metadata = {
  title: "Features — AI Werewolf Game with Voice Acting | Wolfcha",
  description:
    "Explore Wolfcha features: solo social deduction gameplay, multi-model AI arena, immersive voice acting, classic Werewolf roles, and instant browser-based play. No download required.",
  alternates: {
    canonical: "https://wolf-cha.com/features",
  },
  openGraph: {
    title: "Wolfcha Features — AI Werewolf Game",
    description:
      "Solo play, multi-model AI arena, voice acting, classic roles, and instant browser play — built for modern social deduction.",
    url: "https://wolf-cha.com/features",
    type: "website",
    images: [
      {
        url: "https://wolf-cha.com/og-image.png",
        width: 1200,
        height: 630,
        alt: "Wolfcha - AI Werewolf Game",
      },
    ],
  },
};

const coreFeatures = [
  {
    title: "Solo-first gameplay",
    description: "Start a game anytime. Every other player is AI, with unique personalities and playstyles. No need to gather friends or wait for a party.",
    icon: "👤",
    details: [
      "Play instantly — no waiting for others",
      "AI opponents with distinct reasoning styles",
      "Perfect for practice or quick games",
      "Available 24/7, anywhere you have a browser",
    ],
  },
  {
    title: "AI model arena",
    description: "Watch different AI models compete. DeepSeek analyzes contradictions. Kimi builds trust. Doubao pressures aggressively. Compare strategies.",
    icon: "🤖",
    details: [
      "Multiple AI models with unique personalities",
      "Different reasoning and arguing styles",
      "Models learn and adapt during games",
      "Compare which models you play best against",
    ],
  },
  {
    title: "Immersive voice acting",
    description: "Optional narrator and character voices make every game feel alive. Hear the tension in accusations and the desperation in last words.",
    icon: "🎙️",
    details: [
      "Professional narrator for game events",
      "Character voices for AI opponents",
      "Multiple voice styles available",
      "Fully optional — text mode also available",
    ],
  },
  {
    title: "Classic Werewolf roles",
    description: "Werewolf, Seer, Witch, Hunter, Guard, Villager — all the roles you know from traditional Werewolf, balanced for solo vs AI play.",
    icon: "🐺",
    details: [
      "5 special roles + Villager",
      "Authentic night actions and abilities",
      "Role-specific strategies for AI games",
      "Balanced for 8-12 player games",
    ],
  },
  {
    title: "Browser-based",
    description: "No download, no installation. Play instantly in your browser on any device. Your progress is saved automatically.",
    icon: "🌐",
    details: [
      "Works on desktop, tablet, and mobile",
      "No app store, no updates to manage",
      "Automatic save and continue",
      "Fast loading, optimized performance",
    ],
  },
  {
    title: "Free to play",
    description: "Start playing immediately for free. No credit card, no signup required for basic play.",
    icon: "🎁",
    details: [
      "Instant start, no registration",
      "Full game experience included",
      "Optional premium features",
      "No ads during gameplay",
    ],
  },
];

const aiModels = [
  { name: "DeepSeek", logo: "/models/deepseek.svg", personality: "Analytical, logic-focused, catches contradictions" },
  { name: "Qwen", logo: "/models/qwen.svg", personality: "Methodical, patient, long-term strategist" },
  { name: "Kimi", logo: "/models/kimi.svg", personality: "Empathetic, trust-building, alliance-focused" },
  { name: "Gemini", logo: "/models/gemini.svg", personality: "Creative, adaptive, unconventional plays" },
  { name: "Claude", logo: "/models/claude.svg", personality: "Nuanced, persuasive, fair-minded" },
  { name: "OpenAI GPT", logo: "/models/openai.svg", personality: "Narrative-driven, dramatic, memorable" },
  { name: "GLM", logo: "/models/glm.svg", personality: "Observant, patient, speaks when it matters" },
  { name: "Doubao", logo: "/models/doubao.svg", personality: "Aggressive, confrontational, direct" },
  { name: "Seed", logo: "/models/bytedance.svg", personality: "Bold, risk-taking, high-stakes plays" },
  { name: "MiniMax", logo: "/models/minimax.svg", personality: "Steady, reliable, consistent" },
];

const roles = [
  { name: "Werewolf", image: "/roles/werewolf.png", ability: "Hunt at night, deceive by day" },
  { name: "Seer", image: "/roles/seer.png", ability: "Check one player each night" },
  { name: "Witch", image: "/roles/witch.png", ability: "One save potion, one kill potion" },
  { name: "Hunter", image: "/roles/hunter.png", ability: "Shoot when eliminated" },
  { name: "Guard", image: "/roles/guard.png", ability: "Protect one player each night" },
];

const aiSeats = [
  { seed: "alex-01", name: "Alex", persona: "calm, structured", modelLogo: "/models/deepseek.svg" },
  { seed: "morgan-02", name: "Morgan", persona: "humorous, quick to react", modelLogo: "/models/gemini.svg" },
  { seed: "riley-03", name: "Riley", persona: "aggressive, high pressure", modelLogo: "/models/claude.svg" },
  { seed: "taylor-04", name: "Taylor", persona: "cautious, detail-first", modelLogo: "/models/qwen.svg" },
  { seed: "jamie-05", name: "Jamie", persona: "empathetic, trust builder", modelLogo: "/models/kimi.svg" },
  { seed: "casey-06", name: "Casey", persona: "skeptical, logic heavy", modelLogo: "/models/deepseek.svg" },
];

const dialogueExamples = [
  {
    title: "Voice acting brings characters to life",
    subtitle: "Hear distinct personalities in every line.",
    lines: [
      {
        speaker: { seed: "alex-01", name: "Alex", modelLogo: "/models/deepseek.svg", meta: "calm voice" },
        content: "Let's examine the evidence systematically. Taylor voted against the confirmed villager twice. That's statistically significant.",
      },
      {
        speaker: { seed: "hayden-10", name: "Hayden", modelLogo: "/models/doubao.svg", meta: "aggressive voice" },
        content: "Enough analysis! We've debated for three rounds. I'm calling the vote. Taylor — guilty or innocent?",
      },
      {
        speaker: { seed: "jamie-05", name: "Jamie", modelLogo: "/models/kimi.svg", meta: "warm voice" },
        content: "I understand the urgency, but let's give Taylor one more chance to explain. Taylor, help us understand.",
      },
    ],
  },
  {
    title: "AI models show distinct personalities",
    subtitle: "Different reasoning styles create dynamic games.",
    lines: [
      {
        speaker: { seed: "casey-06", name: "Casey (DeepSeek)", modelLogo: "/models/deepseek.svg", meta: "analytical" },
        content: "The probability of Riley being wolf is 73% based on vote alignment patterns.",
      },
      {
        speaker: { seed: "morgan-02", name: "Morgan (Gemini)", modelLogo: "/models/gemini.svg", meta: "creative" },
        content: "Forget probabilities. What if we're all overthinking? The quietest player hasn't said a word about suspects.",
      },
      {
        speaker: { seed: "drew-09", name: "Drew (GPT)", modelLogo: "/models/openai.svg", meta: "narrative" },
        content: "There's a story here. Riley defended the first wolf, then changed when exposed. Classic arc of a wolf protecting a partner.",
      },
    ],
  },
];

const faqs = [
  {
    question: "Is Wolfcha free to play?",
    answer: "Yes! You can start playing immediately for free in your browser. No registration required for basic play. Premium features are available for enhanced experience.",
  },
  {
    question: "Do I need to download anything?",
    answer: "No. Wolfcha runs entirely in your browser. Works on desktop, tablet, and mobile. Just visit the site and start playing.",
  },
  {
    question: "How does voice acting work?",
    answer: "Voice acting is optional. When enabled, a narrator reads game events, and AI characters speak their dialogue. You can toggle it on/off in settings. Multiple voice styles are available.",
  },
  {
    question: "What AI models are available?",
    answer: "Wolfcha features multiple AI models including DeepSeek, Qwen, Kimi, Gemini, Claude, OpenAI GPT, GLM, Doubao, Seed, and MiniMax. Each has a distinct personality and reasoning style.",
  },
  {
    question: "Can I choose which AI models to play against?",
    answer: "The game automatically assigns AI models to create diverse tables. Different combinations create different dynamics, keeping each game fresh.",
  },
  {
    question: "What roles are included?",
    answer: "Wolfcha includes classic Werewolf roles: Werewolf, Seer, Witch, Hunter, Guard, and Villager. Each role has authentic abilities balanced for solo vs AI play.",
  },
  {
    question: "How long does a game take?",
    answer: "Typically 10-20 minutes depending on player count and whether voice acting is enabled. Quick games with 8 players, longer strategic games with 12.",
  },
  {
    question: "Is my progress saved?",
    answer: "Yes. Your game state is saved automatically. You can close the browser and continue later. Statistics and achievements are also tracked.",
  },
];

const hubLinks = [
  { href: "/ai-werewolf", label: "AI Werewolf (Hub)", description: "What Wolfcha is and why solo vs AI works." },
  { href: "/how-to-play", label: "How to Play", description: "Learn the rules and get started." },
  { href: "/ai-models", label: "AI Models", description: "Meet the different AI personalities." },
];

const featureLinks = [
  { href: "/play-werewolf-alone", label: "Play Alone", description: "Start a solo game instantly." },
  { href: "/werewolf-game-browser", label: "Browser Game", description: "No download required." },
  { href: "/free-werewolf-game-online", label: "Free to Play", description: "Start without registration." },
  { href: "/roles/seer", label: "Seer Role", description: "Master the information game." },
  { href: "/models/deepseek", label: "DeepSeek AI", description: "The analytical opponent." },
  { href: "/guides/werewolf-rules", label: "Complete Rules", description: "Detailed rules reference." },
];

function buildSoftwareJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Wolfcha - AI Werewolf Game",
    description: "A solo Werewolf (Mafia) social deduction game with AI opponents, voice acting, and multiple AI models.",
    url: "https://wolf-cha.com/features",
    applicationCategory: "GameApplication",
    operatingSystem: "Any",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    featureList: [
      "Solo gameplay against AI",
      "Multiple AI model personalities",
      "Voice acting and narration",
      "Classic Werewolf roles",
      "Browser-based, no download",
      "Free to play",
    ],
  };
}

function buildFaqJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

export default function FeaturesPage() {
  return (
    <MarketingPageWrapper>
      <JsonLd id="software-jsonld" data={buildSoftwareJsonLd()} />
      <JsonLd id="faq-jsonld" data={buildFaqJsonLd()} />

      <LandingHero
        title="Wolfcha Features"
        subtitle="Everything you need for solo Werewolf"
        description="Wolfcha is built for players who love deduction and dialogue, but don't always have a group available. It's the Werewolf (Mafia) party game reimagined as a solo experience with AI opponents, voice acting, and instant browser play."
        primaryCta={{ href: "/", label: "Play now — free" }}
        secondaryCta={{ href: "/how-to-play", label: "Learn the rules" }}
        aside={<LandingAiSeats seats={aiSeats} compact />}
      />

      {/* Core Features Grid */}
      <LandingSection
        id="core-features"
        title="Core features"
        subtitle="What makes Wolfcha the best way to play Werewolf solo."
      >
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {coreFeatures.map((feature) => (
            <div
              key={feature.title}
              className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--bg-secondary)] text-2xl">
                  {feature.icon}
                </div>
                <div className="text-lg font-bold text-[var(--text-primary)]">{feature.title}</div>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-[var(--text-secondary)]">
                {feature.description}
              </p>
              <ul className="mt-4 space-y-2">
                {feature.details.map((detail) => (
                  <li key={detail} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                    <span className="mt-1 text-[var(--color-gold)]">✓</span>
                    <span>{detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </LandingSection>

      {/* AI Model Arena */}
      <LandingSection
        id="ai-arena"
        title="AI model arena"
        subtitle="10 different AI models, each with a unique personality and reasoning style."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {aiModels.map((model) => (
            <Link
              key={model.name}
              href={`/models/${model.name.toLowerCase().replace(/\s+/g, "").replace("gpt", "")}`}
              className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 transition-colors hover:bg-[var(--bg-hover)]"
            >
              <div className="flex items-center gap-3">
                <Image src={model.logo} alt={model.name} width={28} height={28} />
                <div className="font-semibold text-[var(--text-primary)]">{model.name}</div>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-[var(--text-secondary)]">
                {model.personality}
              </p>
            </Link>
          ))}
        </div>
        <div className="mt-6 text-center">
          <Link
            href="/ai-models"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--border-color)] px-5 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)]"
          >
            Explore all AI models →
          </Link>
        </div>
      </LandingSection>

      {/* Voice Acting */}
      <LandingSection
        id="voice-acting"
        title="Immersive voice acting"
        subtitle="Optional narrator and character voices bring every game to life."
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-gold)] text-xl">
                🎙️
              </div>
              <div className="text-lg font-bold text-[var(--text-primary)]">Narrator voice</div>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-[var(--text-secondary)]">
              A professional narrator guides the game: announcing night phases, deaths, reveals, and
              dramatic moments. Sets the atmosphere and keeps the pace.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-[var(--text-secondary)]">
              <li>• "Night falls on the village..."</li>
              <li>• "The village has voted. [Player] has been eliminated."</li>
              <li>• "Dawn breaks. A body was found..."</li>
            </ul>
          </div>
          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-gold)] text-xl">
                💬
              </div>
              <div className="text-lg font-bold text-[var(--text-primary)]">Character voices</div>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-[var(--text-secondary)]">
              Each AI opponent speaks with a distinct voice matching their personality. Hear the
              tension in accusations, the logic in analysis, the warmth in alliance offers.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-[var(--text-secondary)]">
              <li>• Calm, measured tones for analytical players</li>
              <li>• Aggressive, urgent voices for confrontational styles</li>
              <li>• Warm, supportive voices for trust-builders</li>
            </ul>
          </div>
        </div>
      </LandingSection>

      {/* Classic Roles */}
      <LandingSection
        id="roles"
        title="Classic Werewolf roles"
        subtitle="All the roles you know, balanced for solo vs AI play."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {roles.map((role) => (
            <Link
              key={role.name}
              href={`/roles/${role.name.toLowerCase()}`}
              className="group rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 text-center transition-colors hover:bg-[var(--bg-hover)]"
            >
              <div className="relative mx-auto h-16 w-16 overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)]">
                <Image src={role.image} alt={role.name} fill className="object-contain p-2" />
              </div>
              <div className="mt-3 font-bold text-[var(--text-primary)] group-hover:text-[var(--color-gold)]">
                {role.name}
              </div>
              <div className="mt-1 text-xs text-[var(--text-secondary)]">{role.ability}</div>
            </Link>
          ))}
        </div>
        <div className="mt-6 text-center">
          <Link
            href="/roles"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--border-color)] px-5 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)]"
          >
            Explore all role guides →
          </Link>
        </div>
      </LandingSection>

      {/* Dialogue Examples */}
      <LandingSection
        id="dialogue-examples"
        title="See features in action"
        subtitle="Voice acting and AI personalities create memorable moments."
      >
        <LandingDialogueExamples examples={dialogueExamples} />
      </LandingSection>

      {/* FAQ */}
      <LandingSection
        id="faq"
        title="Frequently asked questions"
        subtitle="Common questions about Wolfcha features."
      >
        <LandingFaq items={faqs} />
      </LandingSection>

      {/* Related Links */}
      <LandingSection
        id="related"
        title="Explore more"
        subtitle="Dive deeper into Wolfcha's game and AI arena."
      >
        <div className="grid gap-10 lg:grid-cols-2">
          <LandingRelatedLinks title="Hub pages" links={hubLinks} />
          <LandingRelatedLinks title="Feature highlights" links={featureLinks} />
        </div>
      </LandingSection>

      <LandingCta
        title="Experience all features now"
        description="Start a solo Werewolf game with voice acting, AI opponents, and classic roles. No download, no registration, no party required."
        primary={{ href: "/", label: "Play now — free" }}
        secondary={{ href: "/how-to-play", label: "Learn the rules" }}
      />
    </MarketingPageWrapper>
  );
}
