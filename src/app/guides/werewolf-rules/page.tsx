import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { MarketingPageWrapper } from "@/components/seo/MarketingPageWrapper";
import { JsonLd } from "@/components/seo/JsonLd";
import { LandingHero } from "@/components/seo/landing/LandingHero";
import { LandingSection } from "@/components/seo/landing/LandingSection";
import { LandingFaq } from "@/components/seo/landing/LandingFaq";
import { LandingRelatedLinks } from "@/components/seo/landing/LandingRelatedLinks";
import { LandingAiSeats } from "@/components/seo/landing/LandingAiSeats";

export const metadata: Metadata = {
  title: "Werewolf Game Rules: Complete Official Guide for Beginners | Wolfcha",
  description:
    "Master Werewolf (Mafia) game rules with our comprehensive guide. Learn night phases, day voting, role abilities, win conditions, and advanced strategies. Play solo against AI or with friends.",
  keywords: [
    "werewolf rules",
    "werewolf game rules",
    "how to play werewolf",
    "mafia game rules",
    "werewolf night phase",
    "werewolf day phase",
    "werewolf roles",
    "social deduction game rules",
  ],
  alternates: {
    canonical: "https://wolf-cha.com/guides/werewolf-rules",
  },
  openGraph: {
    title: "Werewolf Game Rules: Complete Official Guide | Wolfcha",
    description:
      "Learn the complete rules of Werewolf (Mafia) - night phases, day voting, role abilities, and winning strategies. Perfect for beginners and experienced players.",
    url: "https://wolf-cha.com/guides/werewolf-rules",
    type: "article",
    images: [
      {
        url: "https://wolf-cha.com/og-image.png",
        width: 1200,
        height: 630,
        alt: "Werewolf Game Rules Guide",
      },
    ],
  },
};

const articleJsonLd = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "Werewolf Game Rules: Complete Official Guide for Beginners",
  description:
    "Master Werewolf (Mafia) game rules with our comprehensive guide covering night phases, day voting, role abilities, and winning strategies.",
  image: "https://wolf-cha.com/og-image.png",
  author: {
    "@type": "Organization",
    name: "Wolfcha",
    url: "https://wolf-cha.com",
  },
  publisher: {
    "@type": "Organization",
    name: "Wolfcha",
    logo: {
      "@type": "ImageObject",
      url: "https://wolf-cha.com/logo.png",
    },
  },
  datePublished: "2024-01-15",
  dateModified: new Date().toISOString().split("T")[0],
  mainEntityOfPage: {
    "@type": "WebPage",
    "@id": "https://wolf-cha.com/guides/werewolf-rules",
  },
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "How many players do you need to play Werewolf?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Traditional Werewolf requires 7-15 players plus a moderator. However, with Wolfcha, you can play solo against AI opponents with 8-12 total players in a game.",
      },
    },
    {
      "@type": "Question",
      name: "What is the difference between Werewolf and Mafia?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Werewolf and Mafia are essentially the same game with different themes. Mafia uses a crime family theme while Werewolf uses a supernatural village theme. The core mechanics - hidden roles, night kills, and day voting - are identical.",
      },
    },
    {
      "@type": "Question",
      name: "How do Werewolves win the game?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Werewolves win when they equal or outnumber the remaining villagers. For example, if there are 2 werewolves and 2 villagers left, the werewolves win because they have achieved parity.",
      },
    },
    {
      "@type": "Question",
      name: "What happens if a Werewolf is voted out during the day?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "When a Werewolf is eliminated through voting, their role is typically revealed. The game continues to the next night phase. The village team is one step closer to victory.",
      },
    },
    {
      "@type": "Question",
      name: "Can the Seer check the same player twice?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes, the Seer can check any living player each night, including ones they've checked before. However, this is usually inefficient since you already know that player's alignment.",
      },
    },
  ],
};

const sampleSeats = [
  { seed: "alex_wolf", name: "Alex", persona: "Strategic Thinker", modelLogo: "/models/deepseek.svg" },
  { seed: "morgan_seer", name: "Morgan", persona: "Analytical Mind", modelLogo: "/models/qwen.svg" },
  { seed: "riley_witch", name: "Riley", persona: "Cautious Player", modelLogo: "/models/gemini.svg" },
  { seed: "jordan_hunter", name: "Jordan", persona: "Bold Aggressor", modelLogo: "/models/kimi.svg" },
  { seed: "casey_guard", name: "Casey", persona: "Protective Nature", modelLogo: "/models/claude.svg" },
  { seed: "taylor_vill", name: "Taylor", persona: "Social Butterfly", modelLogo: "/models/glm.svg" },
];

const faqItems = [
  {
    question: "How many players do you need to play Werewolf?",
    answer:
      "Traditional Werewolf requires 7-15 players plus a moderator. However, with Wolfcha, you can play solo against AI opponents with 8-12 total players in a game. This makes it perfect for practicing strategies or enjoying the game when you can't gather a group.",
  },
  {
    question: "What is the difference between Werewolf and Mafia?",
    answer:
      "Werewolf and Mafia are essentially the same game with different themes. Mafia (created in 1986) uses a crime family theme, while Werewolf (introduced in 1997) uses a supernatural village theme. The core mechanics - hidden roles, night kills, and day voting - are identical. Many players use the terms interchangeably.",
  },
  {
    question: "How do Werewolves win the game?",
    answer:
      "Werewolves win when they equal or outnumber the remaining villagers. For example, if there are 2 werewolves and 2 villagers left, the werewolves win because they have achieved parity and can control the vote.",
  },
  {
    question: "What happens when you're eliminated?",
    answer:
      "When eliminated (by voting or night kill), your role is revealed and you can no longer participate in the game. In some variants, eliminated players can give 'last words' before being removed. You cannot communicate with living players after elimination.",
  },
  {
    question: "Can the Seer check the same player twice?",
    answer:
      "Yes, the Seer can check any living player each night, including ones they've checked before. However, this is usually inefficient since you already know that player's alignment. It's better to gather new information.",
  },
  {
    question: "What if there's a tie during voting?",
    answer:
      "Tie-handling varies by ruleset. Common approaches include: no elimination (the tied players survive), a runoff vote between tied players, or the Sheriff/Mayor breaks the tie. In Wolfcha, tied players enter a PK (player kill) speech round before a revote.",
  },
  {
    question: "Can Werewolves kill each other?",
    answer:
      "Yes, Werewolves can technically target their own teammates, though it's almost never strategically beneficial. This might be used as an extreme gambit to appear innocent, but it significantly hurts the wolf team's chances.",
  },
  {
    question: "How long does a typical game last?",
    answer:
      "A typical Werewolf game lasts 15-45 minutes depending on player count and experience level. Games with 8 players tend to be shorter (15-25 minutes), while 12-player games with experienced players can extend to 45 minutes or more.",
  },
];

const relatedLinks = [
  { href: "/guides/werewolf-night-phase", label: "Night Phase Guide", description: "Master the crucial night actions" },
  { href: "/guides/werewolf-day-phase", label: "Day Phase Guide", description: "Win through discussion and voting" },
  { href: "/guides/seer-strategy", label: "Seer Strategy", description: "How to use your checks effectively" },
  { href: "/guides/how-to-win-as-werewolf", label: "Werewolf Strategy", description: "Deception and manipulation tactics" },
  { href: "/how-to-play", label: "Quick Start Guide", description: "Get playing in 5 minutes" },
  { href: "/werewolf-game-with-ai-opponents", label: "AI Opponents", description: "Meet your AI table" },
];

export default function WerewolfRulesPage() {
  return (
    <MarketingPageWrapper>
      <JsonLd id="article-jsonld" data={articleJsonLd} />
      <JsonLd id="faq-jsonld" data={faqJsonLd} />

      <LandingHero
        title="Werewolf Game Rules: The Complete Guide"
        subtitle="OFFICIAL RULES & STRATEGY"
        description="Werewolf (also known as Mafia) is the ultimate social deduction party game. Hidden roles, strategic deception, and heated debates make every game unique. Learn the rules, master the strategies, and become the most cunning player at the table."
        primaryCta={{ href: "/", label: "Play Now Free" }}
        secondaryCta={{ href: "/how-to-play", label: "Quick Start" }}
        image={{ src: "/roles/werewolf.png", alt: "Werewolf character" }}
        aside={<LandingAiSeats seats={sampleSeats.slice(0, 4)} compact />}
      />

      {/* Game Overview Section */}
      <LandingSection
        id="overview"
        title="What is Werewolf?"
        subtitle="A social deduction game where villagers must identify hidden werewolves before it's too late"
      >
        <div className="prose prose-invert max-w-none">
          <p className="text-[var(--text-secondary)] leading-relaxed text-lg">
            Werewolf is a party game for 7-15+ players that pits an informed minority (the werewolves) against an uninformed majority (the villagers). Created by Dimitry Davidoff in 1986 as &quot;Mafia,&quot; the game gained its werewolf theme in 1997 and has since become one of the world&apos;s most popular social deduction games.
          </p>
          
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/20">
                  <span className="text-xl">🐺</span>
                </div>
                <h3 className="text-lg font-bold text-[var(--text-primary)]">The Werewolf Team</h3>
              </div>
              <p className="text-[var(--text-secondary)] text-sm leading-relaxed">
                Werewolves know each other&apos;s identities and secretly kill one villager each night. Their goal is to eliminate villagers until werewolves equal or outnumber the remaining players. They must blend in during day discussions to avoid detection.
              </p>
            </div>

            <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/20">
                  <span className="text-xl">👥</span>
                </div>
                <h3 className="text-lg font-bold text-[var(--text-primary)]">The Village Team</h3>
              </div>
              <p className="text-[var(--text-secondary)] text-sm leading-relaxed">
                Villagers don&apos;t know anyone&apos;s role at the start. They must use discussion, deduction, and special role abilities to identify the werewolves. The village wins by eliminating all werewolves through the daily voting process.
              </p>
            </div>
          </div>
        </div>
      </LandingSection>

      {/* Core Game Flow */}
      <LandingSection
        id="game-flow"
        title="How the Game Works"
        subtitle="Werewolf alternates between night (secret actions) and day (public discussion and voting)"
      >
        <div className="space-y-8">
          {/* Night Phase */}
          <div className="rounded-xl border border-[var(--border-color)] bg-gradient-to-r from-indigo-950/50 to-purple-950/50 p-6 md:p-8">
            <div className="flex items-center gap-4 mb-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-500/30 border border-indigo-400/30">
                <span className="text-2xl">🌙</span>
              </div>
              <div>
                <h3 className="text-xl font-bold text-[var(--text-primary)]">Night Phase</h3>
                <p className="text-sm text-indigo-300">When darkness falls, special roles act in secret</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg bg-[var(--bg-card)] p-4 border border-[var(--border-color)]">
                <div className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-2">Step 1</div>
                <div className="font-semibold text-[var(--text-primary)] mb-1">Guard Protects</div>
                <p className="text-xs text-[var(--text-secondary)]">The Guard chooses one player to protect from werewolf attack (cannot protect the same player twice in a row)</p>
              </div>
              <div className="rounded-lg bg-[var(--bg-card)] p-4 border border-[var(--border-color)]">
                <div className="text-xs font-bold text-red-400 uppercase tracking-wider mb-2">Step 2</div>
                <div className="font-semibold text-[var(--text-primary)] mb-1">Werewolves Kill</div>
                <p className="text-xs text-[var(--text-secondary)]">Werewolves silently agree on one victim. If multiple wolves, they must reach consensus.</p>
              </div>
              <div className="rounded-lg bg-[var(--bg-card)] p-4 border border-[var(--border-color)]">
                <div className="text-xs font-bold text-green-400 uppercase tracking-wider mb-2">Step 3</div>
                <div className="font-semibold text-[var(--text-primary)] mb-1">Witch Acts</div>
                <p className="text-xs text-[var(--text-secondary)]">The Witch can save the victim with her antidote or poison another player. Each potion can only be used once per game.</p>
              </div>
              <div className="rounded-lg bg-[var(--bg-card)] p-4 border border-[var(--border-color)]">
                <div className="text-xs font-bold text-yellow-400 uppercase tracking-wider mb-2">Step 4</div>
                <div className="font-semibold text-[var(--text-primary)] mb-1">Seer Checks</div>
                <p className="text-xs text-[var(--text-secondary)]">The Seer chooses one player and learns their true alignment (werewolf or villager).</p>
              </div>
            </div>
          </div>

          {/* Day Phase */}
          <div className="rounded-xl border border-[var(--border-color)] bg-gradient-to-r from-amber-950/50 to-orange-950/50 p-6 md:p-8">
            <div className="flex items-center gap-4 mb-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/30 border border-amber-400/30">
                <span className="text-2xl">☀️</span>
              </div>
              <div>
                <h3 className="text-xl font-bold text-[var(--text-primary)]">Day Phase</h3>
                <p className="text-sm text-amber-300">Survivors discuss, debate, and vote to eliminate suspects</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg bg-[var(--bg-card)] p-4 border border-[var(--border-color)]">
                <div className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-2">Step 1</div>
                <div className="font-semibold text-[var(--text-primary)] mb-1">Death Announcement</div>
                <p className="text-xs text-[var(--text-secondary)]">The moderator announces who died during the night. Their role may or may not be revealed depending on rules.</p>
              </div>
              <div className="rounded-lg bg-[var(--bg-card)] p-4 border border-[var(--border-color)]">
                <div className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-2">Step 2</div>
                <div className="font-semibold text-[var(--text-primary)] mb-1">Sheriff Election</div>
                <p className="text-xs text-[var(--text-secondary)]">On Day 1, players can run for Sheriff. The Sheriff&apos;s vote counts as 1.5 votes and they can transfer the badge upon death.</p>
              </div>
              <div className="rounded-lg bg-[var(--bg-card)] p-4 border border-[var(--border-color)]">
                <div className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-2">Step 3</div>
                <div className="font-semibold text-[var(--text-primary)] mb-1">Discussion Round</div>
                <p className="text-xs text-[var(--text-secondary)]">Each player speaks in order, sharing information, accusations, and defenses. This is where the real game happens!</p>
              </div>
              <div className="rounded-lg bg-[var(--bg-card)] p-4 border border-[var(--border-color)]">
                <div className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-2">Step 4</div>
                <div className="font-semibold text-[var(--text-primary)] mb-1">Voting</div>
                <p className="text-xs text-[var(--text-secondary)]">Players vote to eliminate one person. The player with the most votes is eliminated. Ties may trigger a runoff.</p>
              </div>
            </div>
          </div>
        </div>
      </LandingSection>

      {/* Roles Section */}
      <LandingSection
        id="roles"
        title="Standard Roles in Werewolf"
        subtitle="Each role has unique abilities that shape the game's strategic landscape"
      >
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Werewolf */}
          <div className="group rounded-xl border border-red-500/30 bg-gradient-to-b from-red-950/30 to-transparent p-6 transition-all hover:border-red-500/50">
            <div className="flex items-center gap-4 mb-4">
              <div className="relative h-16 w-16 overflow-hidden rounded-lg border border-red-500/30">
                <Image src="/roles/werewolf.png" alt="Werewolf" fill className="object-cover" />
              </div>
              <div>
                <div className="text-xs font-bold text-red-400 uppercase tracking-wider">Evil Team</div>
                <h3 className="text-lg font-bold text-[var(--text-primary)]">Werewolf</h3>
              </div>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              The core antagonists. Werewolves know each other and choose one victim to kill each night. They must deceive the village during the day to survive.
            </p>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-red-400">⚔️</span>
                <span className="text-[var(--text-secondary)]">Night: Kill one player (group decision)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-red-400">🎭</span>
                <span className="text-[var(--text-secondary)]">Day: Blend in and misdirect suspicion</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-red-400">🏆</span>
                <span className="text-[var(--text-secondary)]">Win: Equal or outnumber villagers</span>
              </div>
            </div>
          </div>

          {/* Seer */}
          <div className="group rounded-xl border border-yellow-500/30 bg-gradient-to-b from-yellow-950/30 to-transparent p-6 transition-all hover:border-yellow-500/50">
            <div className="flex items-center gap-4 mb-4">
              <div className="relative h-16 w-16 overflow-hidden rounded-lg border border-yellow-500/30">
                <Image src="/roles/seer.png" alt="Seer" fill className="object-cover" />
              </div>
              <div>
                <div className="text-xs font-bold text-yellow-400 uppercase tracking-wider">Village Team</div>
                <h3 className="text-lg font-bold text-[var(--text-primary)]">Seer</h3>
              </div>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              The village&apos;s most powerful information gatherer. Each night, the Seer learns one player&apos;s true alignment, but must share this info carefully.
            </p>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-yellow-400">🔮</span>
                <span className="text-[var(--text-secondary)]">Night: Check one player&apos;s alignment</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-yellow-400">📢</span>
                <span className="text-[var(--text-secondary)]">Day: Share information strategically</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-yellow-400">⚠️</span>
                <span className="text-[var(--text-secondary)]">Risk: High-priority target for wolves</span>
              </div>
            </div>
          </div>

          {/* Witch */}
          <div className="group rounded-xl border border-green-500/30 bg-gradient-to-b from-green-950/30 to-transparent p-6 transition-all hover:border-green-500/50">
            <div className="flex items-center gap-4 mb-4">
              <div className="relative h-16 w-16 overflow-hidden rounded-lg border border-green-500/30">
                <Image src="/roles/witch.png" alt="Witch" fill className="object-cover" />
              </div>
              <div>
                <div className="text-xs font-bold text-green-400 uppercase tracking-wider">Village Team</div>
                <h3 className="text-lg font-bold text-[var(--text-primary)]">Witch</h3>
              </div>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              A powerful role with two one-time-use potions. The antidote saves the wolf&apos;s victim, while the poison eliminates any player of her choice.
            </p>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-green-400">💚</span>
                <span className="text-[var(--text-secondary)]">Antidote: Save tonight&apos;s victim (once)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-green-400">💀</span>
                <span className="text-[var(--text-secondary)]">Poison: Kill any player (once)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-green-400">⏰</span>
                <span className="text-[var(--text-secondary)]">Timing: Save potions for critical moments</span>
              </div>
            </div>
          </div>

          {/* Hunter */}
          <div className="group rounded-xl border border-orange-500/30 bg-gradient-to-b from-orange-950/30 to-transparent p-6 transition-all hover:border-orange-500/50">
            <div className="flex items-center gap-4 mb-4">
              <div className="relative h-16 w-16 overflow-hidden rounded-lg border border-orange-500/30">
                <Image src="/roles/hunter.png" alt="Hunter" fill className="object-cover" />
              </div>
              <div>
                <div className="text-xs font-bold text-orange-400 uppercase tracking-wider">Village Team</div>
                <h3 className="text-lg font-bold text-[var(--text-primary)]">Hunter</h3>
              </div>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              A vengeful role that gets the last laugh. When eliminated by voting or wolf attack, the Hunter can immediately shoot and kill one player.
            </p>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-orange-400">🔫</span>
                <span className="text-[var(--text-secondary)]">Trigger: Activated upon death</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-orange-400">🎯</span>
                <span className="text-[var(--text-secondary)]">Action: Choose any player to eliminate</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-orange-400">❌</span>
                <span className="text-[var(--text-secondary)]">Exception: Cannot shoot if poisoned</span>
              </div>
            </div>
          </div>

          {/* Guard */}
          <div className="group rounded-xl border border-blue-500/30 bg-gradient-to-b from-blue-950/30 to-transparent p-6 transition-all hover:border-blue-500/50">
            <div className="flex items-center gap-4 mb-4">
              <div className="relative h-16 w-16 overflow-hidden rounded-lg border border-blue-500/30">
                <Image src="/roles/guard.png" alt="Guard" fill className="object-cover" />
              </div>
              <div>
                <div className="text-xs font-bold text-blue-400 uppercase tracking-wider">Village Team</div>
                <h3 className="text-lg font-bold text-[var(--text-primary)]">Guard</h3>
              </div>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              The village&apos;s protective shield. Each night, the Guard chooses one player to protect from the werewolf attack, but cannot guard the same person consecutively.
            </p>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-blue-400">🛡️</span>
                <span className="text-[var(--text-secondary)]">Night: Protect one player from wolves</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-blue-400">🔄</span>
                <span className="text-[var(--text-secondary)]">Rule: Cannot guard same person twice in a row</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-blue-400">✅</span>
                <span className="text-[var(--text-secondary)]">Can protect self or others</span>
              </div>
            </div>
          </div>

          {/* Villager */}
          <div className="group rounded-xl border border-gray-500/30 bg-gradient-to-b from-gray-950/30 to-transparent p-6 transition-all hover:border-gray-500/50">
            <div className="flex items-center gap-4 mb-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-gray-500/30 bg-gray-800/50">
                <span className="text-3xl">👤</span>
              </div>
              <div>
                <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">Village Team</div>
                <h3 className="text-lg font-bold text-[var(--text-primary)]">Villager</h3>
              </div>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              The backbone of the village. While Villagers have no special abilities, their votes and deduction skills are crucial to identifying werewolves.
            </p>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-gray-400">🗳️</span>
                <span className="text-[var(--text-secondary)]">Power: One vote during eliminations</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-400">🧠</span>
                <span className="text-[var(--text-secondary)]">Strength: Observation and deduction</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-400">🤝</span>
                <span className="text-[var(--text-secondary)]">Goal: Support confirmed village roles</span>
              </div>
            </div>
          </div>
        </div>
      </LandingSection>

      {/* Win Conditions */}
      <LandingSection
        id="win-conditions"
        title="Victory Conditions"
        subtitle="Understanding how each team wins is essential for strategic play"
      >
        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-xl border border-blue-500/30 bg-[var(--bg-card)] p-8">
            <div className="flex items-center gap-4 mb-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-500/20">
                <span className="text-3xl">🏘️</span>
              </div>
              <div>
                <h3 className="text-xl font-bold text-[var(--text-primary)]">Village Victory</h3>
                <p className="text-sm text-blue-400">Good triumphs over evil</p>
              </div>
            </div>
            <p className="text-[var(--text-secondary)] mb-4">
              The village team wins when <strong className="text-[var(--text-primary)]">all werewolves have been eliminated</strong>. This can happen through:
            </p>
            <ul className="space-y-2 text-sm text-[var(--text-secondary)]">
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1">•</span>
                <span>Day voting - Successfully identifying and eliminating werewolves</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1">•</span>
                <span>Witch&apos;s poison - Killing a werewolf with the poison potion</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1">•</span>
                <span>Hunter&apos;s shot - Shooting the last werewolf upon death</span>
              </li>
            </ul>
          </div>

          <div className="rounded-xl border border-red-500/30 bg-[var(--bg-card)] p-8">
            <div className="flex items-center gap-4 mb-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/20">
                <span className="text-3xl">🐺</span>
              </div>
              <div>
                <h3 className="text-xl font-bold text-[var(--text-primary)]">Werewolf Victory</h3>
                <p className="text-sm text-red-400">Darkness consumes the village</p>
              </div>
            </div>
            <p className="text-[var(--text-secondary)] mb-4">
              Werewolves win when they <strong className="text-[var(--text-primary)]">equal or outnumber the remaining villagers</strong>. Examples:
            </p>
            <ul className="space-y-2 text-sm text-[var(--text-secondary)]">
              <li className="flex items-start gap-2">
                <span className="text-red-400 mt-1">•</span>
                <span>2 wolves vs 2 villagers = Wolf victory (parity achieved)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-400 mt-1">•</span>
                <span>1 wolf vs 1 villager = Wolf victory (equal numbers)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-400 mt-1">•</span>
                <span>3 wolves vs 2 villagers = Wolf victory (outnumbered)</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6">
          <h4 className="text-lg font-bold text-[var(--text-primary)] mb-4">Standard Game Configuration</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-color)]">
                  <th className="py-3 px-4 text-left text-[var(--text-secondary)] font-semibold">Players</th>
                  <th className="py-3 px-4 text-left text-[var(--text-secondary)] font-semibold">Werewolves</th>
                  <th className="py-3 px-4 text-left text-[var(--text-secondary)] font-semibold">Seer</th>
                  <th className="py-3 px-4 text-left text-[var(--text-secondary)] font-semibold">Witch</th>
                  <th className="py-3 px-4 text-left text-[var(--text-secondary)] font-semibold">Hunter</th>
                  <th className="py-3 px-4 text-left text-[var(--text-secondary)] font-semibold">Guard</th>
                  <th className="py-3 px-4 text-left text-[var(--text-secondary)] font-semibold">Villagers</th>
                </tr>
              </thead>
              <tbody className="text-[var(--text-primary)]">
                <tr className="border-b border-[var(--border-color)]/50">
                  <td className="py-3 px-4 font-medium">8 players</td>
                  <td className="py-3 px-4 text-red-400">3</td>
                  <td className="py-3 px-4 text-yellow-400">1</td>
                  <td className="py-3 px-4 text-green-400">1</td>
                  <td className="py-3 px-4 text-orange-400">1</td>
                  <td className="py-3 px-4 text-gray-500">—</td>
                  <td className="py-3 px-4">2</td>
                </tr>
                <tr className="border-b border-[var(--border-color)]/50">
                  <td className="py-3 px-4 font-medium">9 players</td>
                  <td className="py-3 px-4 text-red-400">3</td>
                  <td className="py-3 px-4 text-yellow-400">1</td>
                  <td className="py-3 px-4 text-green-400">1</td>
                  <td className="py-3 px-4 text-orange-400">1</td>
                  <td className="py-3 px-4 text-gray-500">—</td>
                  <td className="py-3 px-4">3</td>
                </tr>
                <tr className="border-b border-[var(--border-color)]/50">
                  <td className="py-3 px-4 font-medium">10 players</td>
                  <td className="py-3 px-4 text-red-400">3</td>
                  <td className="py-3 px-4 text-yellow-400">1</td>
                  <td className="py-3 px-4 text-green-400">1</td>
                  <td className="py-3 px-4 text-orange-400">1</td>
                  <td className="py-3 px-4 text-blue-400">1</td>
                  <td className="py-3 px-4">3</td>
                </tr>
                <tr className="border-b border-[var(--border-color)]/50">
                  <td className="py-3 px-4 font-medium">11 players</td>
                  <td className="py-3 px-4 text-red-400">4</td>
                  <td className="py-3 px-4 text-yellow-400">1</td>
                  <td className="py-3 px-4 text-green-400">1</td>
                  <td className="py-3 px-4 text-orange-400">1</td>
                  <td className="py-3 px-4 text-blue-400">1</td>
                  <td className="py-3 px-4">3</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-medium">12 players</td>
                  <td className="py-3 px-4 text-red-400">4</td>
                  <td className="py-3 px-4 text-yellow-400">1</td>
                  <td className="py-3 px-4 text-green-400">1</td>
                  <td className="py-3 px-4 text-orange-400">1</td>
                  <td className="py-3 px-4 text-blue-400">1</td>
                  <td className="py-3 px-4">4</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </LandingSection>

      {/* Sheriff Badge System */}
      <LandingSection
        id="sheriff"
        title="The Sheriff Badge System"
        subtitle="An important mechanic that adds strategic depth to the game"
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <div className="rounded-xl border border-[var(--color-gold)]/30 bg-[var(--bg-card)] p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-gold)]/20">
                  <span className="text-2xl">⭐</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[var(--text-primary)]">Sheriff Powers</h3>
                  <p className="text-xs text-[var(--color-gold)]">Leadership with responsibility</p>
                </div>
              </div>
              
              <ul className="space-y-3 text-sm text-[var(--text-secondary)]">
                <li className="flex items-start gap-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-gold)]/10 text-xs font-bold text-[var(--color-gold)]">1</div>
                  <span><strong className="text-[var(--text-primary)]">Weighted Vote:</strong> The Sheriff&apos;s vote counts as 1.5 votes during elimination, giving them significant influence.</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-gold)]/10 text-xs font-bold text-[var(--color-gold)]">2</div>
                  <span><strong className="text-[var(--text-primary)]">Badge Transfer:</strong> When the Sheriff dies, they can pass the badge to any living player, or destroy it.</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-gold)]/10 text-xs font-bold text-[var(--color-gold)]">3</div>
                  <span><strong className="text-[var(--text-primary)]">Speaking Order:</strong> The Sheriff often decides who speaks first and the direction of speeches.</span>
                </li>
              </ul>
            </div>
          </div>

          <div>
            <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6">
              <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4">Sheriff Election Process</h3>
              
              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-sm font-bold text-indigo-400">1</div>
                  <div>
                    <div className="font-semibold text-[var(--text-primary)]">Candidacy</div>
                    <p className="text-sm text-[var(--text-secondary)]">After the first night, players can choose to run for Sheriff. Running is optional.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-sm font-bold text-indigo-400">2</div>
                  <div>
                    <div className="font-semibold text-[var(--text-primary)]">Campaign Speeches</div>
                    <p className="text-sm text-[var(--text-secondary)]">Candidates give speeches explaining why they should be Sheriff and may share role information.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-sm font-bold text-indigo-400">3</div>
                  <div>
                    <div className="font-semibold text-[var(--text-primary)]">Vote</div>
                    <p className="text-sm text-[var(--text-secondary)]">All players vote. The candidate with the most votes becomes Sheriff. Ties may trigger runoffs.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </LandingSection>

      {/* Strategy Tips */}
      <LandingSection
        id="strategy"
        title="Essential Strategy Tips"
        subtitle="Pro tips to improve your Werewolf gameplay"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🎯</span>
              <h4 className="font-bold text-[var(--text-primary)]">For Villagers</h4>
            </div>
            <ul className="space-y-2 text-sm text-[var(--text-secondary)]">
              <li>• Pay attention to voting patterns - wolves often protect each other</li>
              <li>• Note who accuses whom and watch for suspicious defenses</li>
              <li>• Don&apos;t reveal your role too early unless necessary</li>
              <li>• Trust verified information from Seer over gut feelings</li>
              <li>• Watch for players who stay quiet during key discussions</li>
            </ul>
          </div>

          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🐺</span>
              <h4 className="font-bold text-[var(--text-primary)]">For Werewolves</h4>
            </div>
            <ul className="space-y-2 text-sm text-[var(--text-secondary)]">
              <li>• Don&apos;t be afraid to throw a teammate under the bus if necessary</li>
              <li>• Participate actively - being too quiet is suspicious</li>
              <li>• Build trust by making accurate observations early</li>
              <li>• Target the Seer as soon as you suspect who they are</li>
              <li>• Create confusion by fake-claiming a village role</li>
            </ul>
          </div>

          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🔮</span>
              <h4 className="font-bold text-[var(--text-primary)]">For Seers</h4>
            </div>
            <ul className="space-y-2 text-sm text-[var(--text-secondary)]">
              <li>• Don&apos;t reveal yourself too early - gather information first</li>
              <li>• Check suspicious players, not confirmed villagers</li>
              <li>• When you reveal, have multiple check results ready</li>
              <li>• Consider the Sheriff position for protection</li>
              <li>• Leave breadcrumbs if you suspect you&apos;ll be killed</li>
            </ul>
          </div>

          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🧪</span>
              <h4 className="font-bold text-[var(--text-primary)]">For Witches</h4>
            </div>
            <ul className="space-y-2 text-sm text-[var(--text-secondary)]">
              <li>• Save your antidote for key village roles if possible</li>
              <li>• Don&apos;t use poison unless you&apos;re confident about the target</li>
              <li>• First night save is often worth it to gain information</li>
              <li>• Your potions become more valuable as the game progresses</li>
              <li>• Coordinate with Seer if they&apos;ve revealed a wolf</li>
            </ul>
          </div>
        </div>
      </LandingSection>

      {/* FAQ Section */}
      <LandingSection
        id="faq"
        title="Frequently Asked Questions"
        subtitle="Common questions about Werewolf game rules and mechanics"
      >
        <LandingFaq items={faqItems} />
      </LandingSection>

      {/* Play with AI CTA */}
      <section className="mx-auto max-w-5xl px-6 py-14">
        <div className="rounded-2xl border border-[var(--color-gold)]/30 bg-gradient-to-r from-[var(--color-gold)]/10 to-transparent p-8 md:p-12">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <h2 className="font-serif text-2xl font-bold text-[var(--text-primary)] md:text-3xl">
                Ready to Practice These Rules?
              </h2>
              <p className="mt-3 text-[var(--text-secondary)] max-w-xl">
                Play Werewolf solo against AI opponents in Wolfcha. No friends needed, no waiting for a group. 
                Start a game in seconds and master the rules with unlimited practice.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href="/"
                className="rounded-full bg-[var(--color-gold)] px-8 py-4 text-center font-bold text-black hover:bg-[var(--color-gold-dark)] whitespace-nowrap"
              >
                Play Free Now
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Related Links */}
      <LandingSection id="related" title="Continue Learning" subtitle="Explore more guides to improve your Werewolf skills">
        <LandingRelatedLinks title="Related Guides" links={relatedLinks} />
      </LandingSection>
    </MarketingPageWrapper>
  );
}
