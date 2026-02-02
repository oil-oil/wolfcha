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
  title: "AI Werewolf (Mafia) Game — Play Solo with AI Opponents | Wolfcha",
  description:
    "Wolfcha is an AI-powered Werewolf (Mafia) social deduction game you can play solo in your browser. Talk, deduce, vote, and watch different AI models battle it out. No friends needed — just you vs a table of AI personalities.",
  alternates: {
    canonical: "https://wolf-cha.com/ai-werewolf",
  },
  openGraph: {
    title: "AI Werewolf (Mafia) Game — Play Solo | Wolfcha",
    description:
      "Play Werewolf (Mafia) solo against AI opponents. A browser-based social deduction game with voice acting, multiple AI models, and classic roles.",
    url: "https://wolf-cha.com/ai-werewolf",
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

const aiModels = [
  { name: "DeepSeek", logo: "/models/deepseek.svg", style: "Analytical & logical" },
  { name: "Qwen", logo: "/models/qwen.svg", style: "Methodical & patient" },
  { name: "Kimi", logo: "/models/kimi.svg", style: "Empathetic & trust-building" },
  { name: "Gemini", logo: "/models/gemini.svg", style: "Creative & adaptive" },
  { name: "Claude", logo: "/models/claude.svg", style: "Nuanced & persuasive" },
  { name: "OpenAI GPT", logo: "/models/openai.svg", style: "Narrative storyteller" },
  { name: "GLM", logo: "/models/glm.svg", style: "Observant & patient" },
  { name: "Doubao", logo: "/models/doubao.svg", style: "Aggressive & direct" },
  { name: "Seed", logo: "/models/bytedance.svg", style: "Bold & risk-taking" },
  { name: "MiniMax", logo: "/models/minimax.svg", style: "Steady & reliable" },
];

const roles = [
  { name: "Werewolf", image: "/roles/werewolf.png", description: "Hunt at night, blend in by day." },
  { name: "Seer", image: "/roles/seer.png", description: "Check one player each night for alignment." },
  { name: "Witch", image: "/roles/witch.png", description: "One save, one kill — timing is everything." },
  { name: "Hunter", image: "/roles/hunter.png", description: "If you die, take someone with you." },
  { name: "Guard", image: "/roles/guard.png", description: "Protect a player from night attacks." },
];

const aiSeats = [
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

const dialogueExamples = [
  {
    title: "Day 1: Building consensus",
    subtitle: "AI players discuss who to vote out first.",
    lines: [
      {
        speaker: { seed: "alex-01", name: "Alex", modelLogo: "/models/deepseek.svg", meta: "analytical" },
        content: "We don't have much information yet. I suggest we focus on vote patterns and see who avoids committing.",
      },
      {
        speaker: { seed: "morgan-02", name: "Morgan", modelLogo: "/models/gemini.svg", meta: "creative" },
        content: "Or we could pressure the quietest player. Silence can be a tell.",
      },
      {
        speaker: { seed: "jamie-05", name: "Jamie", modelLogo: "/models/kimi.svg", meta: "empathetic" },
        content: "Let's not rush. Give everyone a chance to speak. I want to hear from Taylor.",
      },
      {
        speaker: { seed: "taylor-04", name: "Taylor", modelLogo: "/models/qwen.svg", meta: "cautious" },
        content: "I'm watching the voting structure. Whoever breaks from the majority might be worth investigating.",
      },
    ],
  },
  {
    title: "Night reveal aftermath",
    subtitle: "The table reacts to new information.",
    lines: [
      {
        speaker: { seed: "casey-06", name: "Casey", modelLogo: "/models/deepseek.svg", meta: "skeptical" },
        content: "So Riley was a wolf. That means everyone who defended Riley needs to explain themselves.",
      },
      {
        speaker: { seed: "drew-09", name: "Drew", modelLogo: "/models/openai.svg", meta: "narrative" },
        content: "Let's not jump to conclusions. Wolves don't always defend each other — that would be too obvious.",
      },
      {
        speaker: { seed: "hayden-10", name: "Hayden", modelLogo: "/models/doubao.svg", meta: "aggressive" },
        content: "I disagree. Quinn was the loudest defender. I want a vote on Quinn today.",
      },
    ],
  },
];

const faqs = [
  {
    question: "What is AI Werewolf?",
    answer: "AI Werewolf (also known as Mafia) is a social deduction game where you try to identify hidden werewolves through discussion and voting. In Wolfcha, you play against AI opponents powered by different language models, each with unique personalities and reasoning styles.",
  },
  {
    question: "Can I play alone without friends?",
    answer: "Yes! That's exactly what Wolfcha is designed for. Every other seat at the table is an AI opponent. You can start a game anytime, no group required.",
  },
  {
    question: "How do different AI models play differently?",
    answer: "Each AI model has a distinct personality. DeepSeek is analytical and logic-focused. Kimi builds trust and alliances. Doubao is aggressive and confrontational. Gemini is creative and adaptive. These differences make every game unique.",
  },
  {
    question: "What roles are available?",
    answer: "Wolfcha includes classic Werewolf roles: Werewolf (the hunters), Seer (checks alignments), Witch (one save, one kill), Hunter (shoots when dying), Guard (protects players), and Villager (the majority trying to find wolves).",
  },
  {
    question: "Is there voice acting?",
    answer: "Yes! Wolfcha features optional voice acting for narration and character dialogue, making the experience more immersive. You can enable or disable it in settings.",
  },
  {
    question: "Is Wolfcha free to play?",
    answer: "Yes, you can start playing immediately for free in your browser. No download or registration required.",
  },
  {
    question: "How long does a game take?",
    answer: "A typical game takes 10-20 minutes depending on the number of players and your reading speed. Voice acting adds some time but enhances immersion.",
  },
  {
    question: "What makes Wolfcha different from other Werewolf games?",
    answer: "Wolfcha is designed for solo play with AI opponents that actually reason, argue, and form alliances. It's not just random decisions — AI players have distinct personalities and strategies, creating a genuine social deduction experience.",
  },
];

const hubLinks = [
  { href: "/how-to-play", label: "How to Play", description: "Learn the rules and get started quickly." },
  { href: "/features", label: "Features", description: "Voice acting, AI arena, and more." },
  { href: "/ai-models", label: "AI Models", description: "Meet the different AI personalities." },
];

const spokeLinks = [
  { href: "/play-werewolf-alone", label: "Play Werewolf Alone", description: "Start a solo game instantly." },
  { href: "/roles/werewolf", label: "Werewolf Role Guide", description: "Master the hunter's strategy." },
  { href: "/roles/seer", label: "Seer Role Guide", description: "Turn checks into winning votes." },
  { href: "/guides/werewolf-rules", label: "Werewolf Rules", description: "Complete rules reference." },
  { href: "/guides/werewolf-for-beginners", label: "Beginner's Guide", description: "New to Werewolf? Start here." },
  { href: "/models/deepseek", label: "DeepSeek AI", description: "The analytical opponent." },
];

function buildGameJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "VideoGame",
    name: "Wolfcha - AI Werewolf Game",
    description: "A solo Werewolf (Mafia) social deduction game where you play against AI opponents powered by different language models.",
    url: "https://wolf-cha.com/ai-werewolf",
    genre: ["Social Deduction", "Party Game", "Strategy"],
    gamePlatform: "Web Browser",
    applicationCategory: "Game",
    operatingSystem: "Any",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
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

export default function AiWerewolfPage() {
  return (
    <MarketingPageWrapper>
      <JsonLd id="game-jsonld" data={buildGameJsonLd()} />
      <JsonLd id="faq-jsonld" data={buildFaqJsonLd()} />

      <LandingHero
        title="AI Werewolf (Mafia), playable solo"
        subtitle="Social deduction meets AI"
        description="Werewolf (also known as Mafia) is a social deduction game about hidden roles, persuasion, and imperfect information. Wolfcha turns it into a single-player experience: every other seat is controlled by AI, each with unique personalities and reasoning styles."
        primaryCta={{ href: "/", label: "Play now — free" }}
        secondaryCta={{ href: "/how-to-play", label: "Learn the rules" }}
        aside={<LandingAiSeats seats={aiSeats.slice(0, 6)} compact />}
      />

      {/* AI Models Wall */}
      <LandingSection
        id="ai-models"
        title="Powered by multiple AI models"
        subtitle="Each model brings a different personality to the table. Watch them argue, bluff, and deduce."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {aiModels.map((model) => (
            <Link
              key={model.name}
              href={`/models/${model.name.toLowerCase().replace(/\s+/g, "").replace("gpt", "")}`}
              className="flex items-center gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 transition-colors hover:bg-[var(--bg-hover)]"
            >
              <Image src={model.logo} alt={model.name} width={32} height={32} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-[var(--text-primary)]">{model.name}</div>
                <div className="truncate text-xs text-[var(--text-secondary)]">{model.style}</div>
              </div>
            </Link>
          ))}
        </div>
      </LandingSection>

      {/* Classic Roles */}
      <LandingSection
        id="roles"
        title="Classic Werewolf roles"
        subtitle="All the roles you know from traditional Werewolf, balanced for solo vs AI play."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {roles.map((role) => (
            <Link
              key={role.name}
              href={`/roles/${role.name.toLowerCase()}`}
              className="group rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 transition-colors hover:bg-[var(--bg-hover)]"
            >
              <div className="relative mx-auto aspect-square w-20 overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)]">
                <Image src={role.image} alt={role.name} fill className="object-contain p-2" />
              </div>
              <div className="mt-4 text-center">
                <div className="font-bold text-[var(--text-primary)] group-hover:text-[var(--color-gold)]">
                  {role.name}
                </div>
                <div className="mt-1 text-xs text-[var(--text-secondary)]">{role.description}</div>
              </div>
            </Link>
          ))}
        </div>
      </LandingSection>

      {/* What makes it different */}
      <LandingSection
        id="why-wolfcha"
        title="What makes Wolfcha different"
        subtitle="Not just another Werewolf app — a genuine social deduction experience against reasoning AI."
      >
        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6">
            <div className="text-lg font-bold text-[var(--text-primary)]">Solo-first design</div>
            <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
              Start a game anytime. No need to gather friends or wait for a party. Every AI opponent has a
              unique personality, reasoning style, and strategy.
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6">
            <div className="text-lg font-bold text-[var(--text-primary)]">AI model arena</div>
            <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
              Watch different AI models compete. DeepSeek analyzes contradictions. Kimi builds trust.
              Doubao pressures aggressively. Compare strategies and find your favorite matchup.
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6">
            <div className="text-lg font-bold text-[var(--text-primary)]">Voice acting</div>
            <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
              Optional narrator and character voices make every game feel alive. Hear the tension in
              accusations and the desperation in last words.
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6">
            <div className="text-lg font-bold text-[var(--text-primary)]">Browser-based</div>
            <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
              No download, no installation. Play instantly in your browser on any device.
              Your progress is saved automatically.
            </p>
          </div>
        </div>
      </LandingSection>

      {/* AI Seats */}
      <LandingSection
        id="ai-seats"
        title="Meet your AI opponents"
        subtitle="Each seat at the table is an AI with a unique personality and reasoning style."
      >
        <LandingAiSeats seats={aiSeats} />
      </LandingSection>

      {/* Dialogue Examples */}
      <LandingSection
        id="dialogue-examples"
        title="Real AI dialogue examples"
        subtitle="See how AI opponents argue, pressure, and coordinate in actual games."
      >
        <LandingDialogueExamples examples={dialogueExamples} />
      </LandingSection>

      {/* FAQ */}
      <LandingSection
        id="faq"
        title="Frequently asked questions"
        subtitle="Everything you need to know about AI Werewolf."
      >
        <LandingFaq items={faqs} />
      </LandingSection>

      {/* Related Links */}
      <LandingSection
        id="related"
        title="Explore more"
        subtitle="Dive deeper into Wolfcha's features, roles, and AI opponents."
      >
        <div className="grid gap-10 lg:grid-cols-2">
          <LandingRelatedLinks title="Hub pages" links={hubLinks} />
          <LandingRelatedLinks title="Popular pages" links={spokeLinks} />
        </div>
      </LandingSection>

      <LandingCta
        title="Ready to play Werewolf with AI?"
        description="Start a game in your browser. No party required — just you vs a table of AI personalities with different reasoning styles."
        primary={{ href: "/", label: "Play now — free" }}
        secondary={{ href: "/how-to-play", label: "Learn the rules" }}
      />
    </MarketingPageWrapper>
  );
}
