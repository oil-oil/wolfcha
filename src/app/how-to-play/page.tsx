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
  title: "How to Play Werewolf (Mafia) Solo with AI | Rules & Guide | Wolfcha",
  description:
    "Learn how to play Werewolf (Mafia) solo in Wolfcha. Complete rules guide: get a role, act at night, discuss by day, and vote — all against AI opponents in your browser. Perfect for beginners.",
  alternates: {
    canonical: "https://wolf-cha.com/how-to-play",
  },
  openGraph: {
    title: "How to Play Werewolf with AI — Complete Guide | Wolfcha",
    description:
      "Learn how to play Werewolf (Mafia) solo against AI in your browser. Night actions, day discussion, voting, and winning strategies — simplified.",
    url: "https://wolf-cha.com/how-to-play",
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

const gameFlow = [
  {
    step: "1. Start a game",
    description: "Enter your name and start. You'll be assigned a random role from the available roles.",
    role: null,
    icon: "🎮",
  },
  {
    step: "2. Night phase begins",
    description: "The game starts at night. Werewolves choose a victim. Special roles like Seer, Witch, and Guard take their actions.",
    role: { name: "Werewolf", image: "/roles/werewolf.png" },
    icon: "🌙",
  },
  {
    step: "3. Dawn announcement",
    description: "The narrator announces who died (if anyone). This is when Witch saves and Hunter shots may trigger.",
    role: { name: "Witch", image: "/roles/witch.png" },
    icon: "🌅",
  },
  {
    step: "4. Day discussion",
    description: "All surviving players discuss. AI opponents share opinions, make accusations, and form alliances. This is where social deduction happens.",
    role: { name: "Seer", image: "/roles/seer.png" },
    icon: "☀️",
  },
  {
    step: "5. Voting",
    description: "Players vote to eliminate a suspect. Majority wins. The eliminated player's role is revealed.",
    role: { name: "Hunter", image: "/roles/hunter.png" },
    icon: "🗳️",
  },
  {
    step: "6. Win or continue",
    description: "Villagers win when all werewolves are eliminated. Werewolves win when they equal or outnumber villagers. If neither, return to night phase.",
    role: { name: "Guard", image: "/roles/guard.png" },
    icon: "🏆",
  },
];

const roleAbilities = [
  {
    name: "Werewolf",
    image: "/roles/werewolf.png",
    team: "Evil",
    nightAction: "Choose a player to eliminate each night (coordinates with other wolves).",
    dayGoal: "Blend in with villagers. Manipulate votes. Avoid detection.",
    winCondition: "Wolves equal or outnumber remaining villagers.",
  },
  {
    name: "Seer",
    image: "/roles/seer.png",
    team: "Good",
    nightAction: "Check one player to learn if they are Werewolf or Villager-aligned.",
    dayGoal: "Share information strategically. Build credibility. Guide votes.",
    winCondition: "All werewolves are eliminated.",
  },
  {
    name: "Witch",
    image: "/roles/witch.png",
    team: "Good",
    nightAction: "One antidote (save the night's victim) and one poison (kill any player). Each usable once.",
    dayGoal: "Use potions at the right time. Don't reveal your hand too early.",
    winCondition: "All werewolves are eliminated.",
  },
  {
    name: "Hunter",
    image: "/roles/hunter.png",
    team: "Good",
    nightAction: "None (passive role).",
    dayGoal: "Build reliable reads. If you die, your shot should eliminate a wolf.",
    winCondition: "All werewolves are eliminated.",
  },
  {
    name: "Guard",
    image: "/roles/guard.png",
    team: "Good",
    nightAction: "Protect one player from werewolf attack. Cannot protect the same player twice in a row.",
    dayGoal: "Predict wolf targets. Keep key players alive.",
    winCondition: "All werewolves are eliminated.",
  },
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
    title: "A Seer reveals information",
    subtitle: "Timing your reveal can change the game.",
    lines: [
      {
        speaker: { seed: "casey-06", name: "Casey", modelLogo: "/models/deepseek.svg", meta: "Seer claim" },
        content: "I'm claiming Seer. Night 1 I checked Riley — wolf. I've been waiting for the right moment to say this.",
      },
      {
        speaker: { seed: "riley-03", name: "Riley", modelLogo: "/models/claude.svg", meta: "defensive" },
        content: "That's convenient timing. Why didn't you say this yesterday when we were deciding who to vote?",
      },
      {
        speaker: { seed: "alex-01", name: "Alex", modelLogo: "/models/deepseek.svg", meta: "analytical" },
        content: "Let's think about this. If Casey is lying, that's a bold claim to make with no backup. If true, we have actionable information.",
      },
      {
        speaker: { seed: "jamie-05", name: "Jamie", modelLogo: "/models/kimi.svg", meta: "mediating" },
        content: "I want to hear Riley's defense before we vote. Riley, who do you suspect?",
      },
    ],
  },
  {
    title: "Voting pressure builds",
    subtitle: "The village must decide before night falls.",
    lines: [
      {
        speaker: { seed: "morgan-02", name: "Morgan", modelLogo: "/models/gemini.svg", meta: "urgent" },
        content: "We're running out of time. I'm locking my vote on Taylor. Who's with me?",
      },
      {
        speaker: { seed: "taylor-04", name: "Taylor", modelLogo: "/models/qwen.svg", meta: "defensive" },
        content: "What's your evidence? I've been consistent all game. Morgan's the one who switched positions twice.",
      },
      {
        speaker: { seed: "alex-01", name: "Alex", modelLogo: "/models/deepseek.svg", meta: "structured" },
        content: "Both have points. Let's list the contradictions: Taylor voted against confirmed good on Day 1. Morgan defended the first wolf we caught.",
      },
    ],
  },
];

const faqs = [
  {
    question: "How does solo Werewolf work in Wolfcha?",
    answer: "You play one seat at the table, and every other seat is controlled by AI. The AI opponents have unique personalities and reasoning styles — they discuss, form opinions, make accusations, and vote just like human players would.",
  },
  {
    question: "What role will I get?",
    answer: "Your role is assigned randomly at the start of each game. You might be a Werewolf trying to hide, a Seer gathering information, or any other role. Each game is different.",
  },
  {
    question: "How do I win as a Villager?",
    answer: "Work with other villagers (AI players) to identify and vote out all werewolves. Pay attention to contradictions, vote patterns, and who defends whom.",
  },
  {
    question: "How do I win as a Werewolf?",
    answer: "Blend in during day discussion. Avoid contradicting yourself. Manipulate votes to eliminate village-aligned players. Win when wolves equal or outnumber remaining villagers.",
  },
  {
    question: "What if I'm new to Werewolf?",
    answer: "Wolfcha is perfect for learning! The AI opponents are forgiving, and you can practice different strategies without the pressure of a live group. Start with the beginner's guide for tips.",
  },
  {
    question: "How long does a game take?",
    answer: "Typically 10-20 minutes. Games with 8 players are faster; 12-player games have more complexity. Voice acting adds immersion but increases time slightly.",
  },
  {
    question: "Can I skip the night phase?",
    answer: "Night phases are automatic for non-action roles. If you have an action (Seer check, Witch potion, Guard protection), you'll choose your target.",
  },
  {
    question: "What happens if I die?",
    answer: "If you're eliminated, you can watch the rest of the game play out. If you're the Hunter, you get to shoot one player before dying.",
  },
];

const hubLinks = [
  { href: "/ai-werewolf", label: "AI Werewolf (Hub)", description: "What Wolfcha is and why solo vs AI works." },
  { href: "/features", label: "Features", description: "Voice acting, AI arena, and more." },
  { href: "/ai-models", label: "AI Models", description: "Meet the different AI personalities." },
];

const guideLinks = [
  { href: "/guides/werewolf-rules", label: "Complete Rules", description: "Detailed rules reference." },
  { href: "/guides/werewolf-for-beginners", label: "Beginner's Guide", description: "New to Werewolf? Start here." },
  { href: "/guides/werewolf-night-phase", label: "Night Phase Guide", description: "What happens at night." },
  { href: "/guides/werewolf-day-phase", label: "Day Phase Guide", description: "Discussion and voting." },
  { href: "/guides/how-to-win-as-werewolf", label: "Win as Werewolf", description: "Evil team strategies." },
  { href: "/guides/how-to-win-as-villager", label: "Win as Villager", description: "Good team strategies." },
];

function buildHowToJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to Play Werewolf (Mafia) Solo with AI",
    description: "Learn how to play Werewolf solo against AI opponents in Wolfcha.",
    url: "https://wolf-cha.com/how-to-play",
    step: gameFlow.map((s, idx) => ({
      "@type": "HowToStep",
      position: idx + 1,
      name: s.step,
      text: s.description,
    })),
    totalTime: "PT15M",
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

export default function HowToPlayPage() {
  return (
    <MarketingPageWrapper>
      <JsonLd id="howto-jsonld" data={buildHowToJsonLd()} />
      <JsonLd id="faq-jsonld" data={buildFaqJsonLd()} />

      <LandingHero
        title="How to play Werewolf (Mafia) solo"
        subtitle="Learn in 5 minutes"
        description="Wolfcha turns the classic Werewolf (Mafia) party game into a single-player experience. You play one seat; every other seat is an AI opponent. Night actions, day discussion, voting — all the classic elements, no party required."
        primaryCta={{ href: "/", label: "Play now — free" }}
        secondaryCta={{ href: "/guides/werewolf-for-beginners", label: "Beginner's guide" }}
        aside={<LandingAiSeats seats={aiSeats} compact />}
      />

      {/* Game Flow */}
      <LandingSection
        id="game-flow"
        title="Game flow: from start to finish"
        subtitle="A typical Werewolf game follows this pattern. Each phase matters."
      >
        <div className="grid gap-4">
          {gameFlow.map((phase, idx) => (
            <div
              key={phase.step}
              className="grid items-center gap-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 md:grid-cols-12"
            >
              <div className="flex items-center gap-4 md:col-span-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--color-gold)] text-2xl">
                  {phase.icon}
                </div>
                <div className="font-bold text-[var(--text-primary)]">{phase.step}</div>
              </div>
              <div className="text-sm leading-relaxed text-[var(--text-secondary)] md:col-span-6">
                {phase.description}
              </div>
              <div className="flex justify-end md:col-span-2">
                {phase.role && (
                  <div className="relative h-14 w-14 overflow-hidden rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)]">
                    <Image src={phase.role.image} alt={phase.role.name} fill className="object-contain p-1" />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </LandingSection>

      {/* Role Abilities */}
      <LandingSection
        id="roles"
        title="Role abilities explained"
        subtitle="Each role has a unique power. Understanding them is key to winning."
      >
        <div className="grid gap-6">
          {roleAbilities.map((role) => (
            <div
              key={role.name}
              className="grid gap-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6 md:grid-cols-12"
            >
              <div className="flex items-start gap-4 md:col-span-3">
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)]">
                  <Image src={role.image} alt={role.name} fill className="object-contain p-2" />
                </div>
                <div>
                  <div className="font-bold text-[var(--text-primary)]">{role.name}</div>
                  <div className={`text-xs ${role.team === "Evil" ? "text-red-400" : "text-green-400"}`}>
                    {role.team} team
                  </div>
                </div>
              </div>
              <div className="space-y-2 md:col-span-9">
                <div>
                  <span className="text-xs font-semibold uppercase text-[var(--text-muted)]">Night action: </span>
                  <span className="text-sm text-[var(--text-secondary)]">{role.nightAction}</span>
                </div>
                <div>
                  <span className="text-xs font-semibold uppercase text-[var(--text-muted)]">Day goal: </span>
                  <span className="text-sm text-[var(--text-secondary)]">{role.dayGoal}</span>
                </div>
                <div>
                  <span className="text-xs font-semibold uppercase text-[var(--text-muted)]">Win condition: </span>
                  <span className="text-sm text-[var(--text-secondary)]">{role.winCondition}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          {roleAbilities.map((role) => (
            <Link
              key={role.name}
              href={`/roles/${role.name.toLowerCase()}`}
              className="rounded-full border border-[var(--border-color)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)]"
            >
              {role.name} guide →
            </Link>
          ))}
        </div>
      </LandingSection>

      {/* Solo vs AI Tips */}
      <LandingSection
        id="solo-tips"
        title="Tips for playing vs AI"
        subtitle="AI opponents are different from humans. Here's what to know."
      >
        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6">
            <div className="text-lg font-bold text-[var(--text-primary)]">AI tracks consistency</div>
            <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
              AI opponents remember what you said. Contradictions will be called out. Keep your story straight,
              especially if you're a wolf.
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6">
            <div className="text-lg font-bold text-[var(--text-primary)]">Different models, different styles</div>
            <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
              DeepSeek is analytical. Kimi builds trust. Doubao is aggressive. Learn the personalities to
              predict behavior and manipulate votes.
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6">
            <div className="text-lg font-bold text-[var(--text-primary)]">Vote structure matters</div>
            <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
              AI responds well to clear voting plans. If you're village, propose a vote structure.
              If you're wolf, create confusion about who should be voted.
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6">
            <div className="text-lg font-bold text-[var(--text-primary)]">Practice without pressure</div>
            <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
              Unlike human games, you can experiment freely. Try different strategies, learn from mistakes,
              and improve without social consequences.
            </p>
          </div>
        </div>
      </LandingSection>

      {/* Dialogue Examples */}
      <LandingSection
        id="dialogue-examples"
        title="Example discussions"
        subtitle="See how day phase discussions unfold with AI opponents."
      >
        <LandingDialogueExamples examples={dialogueExamples} />
      </LandingSection>

      {/* FAQ */}
      <LandingSection
        id="faq"
        title="Frequently asked questions"
        subtitle="Common questions about playing Werewolf solo."
      >
        <LandingFaq items={faqs} />
      </LandingSection>

      {/* Related Links */}
      <LandingSection
        id="related"
        title="Keep learning"
        subtitle="More guides and resources to improve your game."
      >
        <div className="grid gap-10 lg:grid-cols-2">
          <LandingRelatedLinks title="Hub pages" links={hubLinks} />
          <LandingRelatedLinks title="Strategy guides" links={guideLinks} />
        </div>
      </LandingSection>

      <LandingCta
        title="Ready to play?"
        description="Start a solo Werewolf game now. No party required — just you vs a table of AI personalities."
        primary={{ href: "/", label: "Play now — free" }}
        secondary={{ href: "/ai-werewolf", label: "What is AI Werewolf?" }}
      />
    </MarketingPageWrapper>
  );
}
