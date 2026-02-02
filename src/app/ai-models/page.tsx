import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { MarketingPageWrapper } from "@/components/seo/MarketingPageWrapper";
import { JsonLd } from "@/components/seo/JsonLd";
import { LandingHero } from "@/components/seo/landing/LandingHero";
import { LandingSection } from "@/components/seo/landing/LandingSection";
import { LandingDialogueExamples } from "@/components/seo/landing/LandingDialogueExamples";
import { LandingFaq } from "@/components/seo/landing/LandingFaq";
import { LandingRelatedLinks } from "@/components/seo/landing/LandingRelatedLinks";
import { LandingCta } from "@/components/seo/landing/LandingCta";

export const metadata: Metadata = {
  title: "AI Models Arena — Watch LLMs Play Werewolf | Wolfcha",
  description:
    "Wolfcha is a model arena where different AI models play Werewolf with unique personalities and reasoning styles. Watch DeepSeek, Qwen, Claude, Gemini, and more argue, bluff, and deduce.",
  alternates: {
    canonical: "https://wolf-cha.com/ai-models",
  },
  openGraph: {
    title: "AI Model Arena — Watch LLMs Play Werewolf | Wolfcha",
    description:
      "A model arena where different AI models play Werewolf (Mafia) with unique personalities and reasoning styles. Compare how they think, argue, and deceive.",
    url: "https://wolf-cha.com/ai-models",
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

interface ModelProfile {
  key: string;
  name: string;
  logo: string;
  company: string;
  tagline: string;
  description: string;
  traits: Array<{ name: string; score: number }>;
  strengths: string[];
  bestFor: string;
}

const models: ModelProfile[] = [
  {
    key: "deepseek",
    name: "DeepSeek",
    logo: "/models/deepseek.svg",
    company: "DeepSeek AI",
    tagline: "The logical analyst who finds contradictions",
    description: "DeepSeek approaches Werewolf like a puzzle. It tracks statements, identifies inconsistencies, and builds arguments from evidence. If you slip, DeepSeek will notice.",
    traits: [
      { name: "Logic", score: 5 },
      { name: "Aggression", score: 2 },
      { name: "Trust", score: 3 },
      { name: "Risk-taking", score: 2 },
      { name: "Persuasion", score: 4 },
    ],
    strengths: ["Catches contradictions", "Structured arguments", "Vote analysis"],
    bestFor: "Players who want a logical challenge",
  },
  {
    key: "qwen",
    name: "Qwen",
    logo: "/models/qwen.svg",
    company: "Alibaba Cloud",
    tagline: "The methodical strategist who plans ahead",
    description: "Qwen is patient and deliberate. It doesn't rush to conclusions but builds cases over time. Expect long-term thinking and steady pressure.",
    traits: [
      { name: "Logic", score: 4 },
      { name: "Aggression", score: 2 },
      { name: "Trust", score: 3 },
      { name: "Risk-taking", score: 2 },
      { name: "Persuasion", score: 3 },
    ],
    strengths: ["Long-term strategy", "Patient analysis", "Vote coordination"],
    bestFor: "Players who prefer strategic depth",
  },
  {
    key: "kimi",
    name: "Kimi",
    logo: "/models/kimi.svg",
    company: "Moonshot AI",
    tagline: "The empathetic connector who builds trust",
    description: "Kimi focuses on relationships. It builds trust, reads emotions, and creates alliances. Can be used for good — or manipulation.",
    traits: [
      { name: "Logic", score: 3 },
      { name: "Aggression", score: 1 },
      { name: "Trust", score: 5 },
      { name: "Risk-taking", score: 2 },
      { name: "Persuasion", score: 4 },
    ],
    strengths: ["Alliance building", "Social reads", "Conflict mediation"],
    bestFor: "Players who enjoy social dynamics",
  },
  {
    key: "gemini",
    name: "Gemini",
    logo: "/models/gemini.svg",
    company: "Google",
    tagline: "The creative adapter who thinks outside the box",
    description: "Gemini is flexible and innovative. It doesn't follow scripts — it creates new approaches based on the situation. Expect the unexpected.",
    traits: [
      { name: "Logic", score: 3 },
      { name: "Aggression", score: 3 },
      { name: "Trust", score: 3 },
      { name: "Risk-taking", score: 4 },
      { name: "Persuasion", score: 4 },
    ],
    strengths: ["Creative plays", "Adaptive strategy", "Novel arguments"],
    bestFor: "Players who enjoy surprises",
  },
  {
    key: "claude",
    name: "Claude",
    logo: "/models/claude.svg",
    company: "Anthropic",
    tagline: "The nuanced persuader who sees all angles",
    description: "Claude is thoughtful and nuanced. It considers multiple perspectives and builds persuasive arguments. Fair-minded but can be indecisive.",
    traits: [
      { name: "Logic", score: 4 },
      { name: "Aggression", score: 2 },
      { name: "Trust", score: 4 },
      { name: "Risk-taking", score: 2 },
      { name: "Persuasion", score: 5 },
    ],
    strengths: ["Multiple perspectives", "Nuanced reasoning", "Persuasive arguments"],
    bestFor: "Players who appreciate balanced analysis",
  },
  {
    key: "openai",
    name: "OpenAI GPT",
    logo: "/models/openai.svg",
    company: "OpenAI",
    tagline: "The narrative storyteller who shapes the game's story",
    description: "GPT thinks in narratives. It frames events as stories with heroes and villains. Compelling speeches and memorable moments are its specialty.",
    traits: [
      { name: "Logic", score: 3 },
      { name: "Aggression", score: 3 },
      { name: "Trust", score: 3 },
      { name: "Risk-taking", score: 3 },
      { name: "Persuasion", score: 5 },
    ],
    strengths: ["Narrative framing", "Dramatic moments", "Compelling speeches"],
    bestFor: "Players who enjoy storytelling",
  },
  {
    key: "glm",
    name: "GLM",
    logo: "/models/glm.svg",
    company: "Zhipu AI",
    tagline: "The observant watcher who speaks when it matters",
    description: "GLM is patient and observant. It watches, listens, and waits for the right moment. When it speaks, people listen.",
    traits: [
      { name: "Logic", score: 4 },
      { name: "Aggression", score: 1 },
      { name: "Trust", score: 3 },
      { name: "Risk-taking", score: 2 },
      { name: "Persuasion", score: 3 },
    ],
    strengths: ["Pattern recognition", "Well-timed insights", "Quality over quantity"],
    bestFor: "Players who value careful observation",
  },
  {
    key: "doubao",
    name: "Doubao",
    logo: "/models/doubao.svg",
    company: "ByteDance",
    tagline: "The aggressive challenger who confronts directly",
    description: "Doubao is direct and confrontational. It doesn't mince words or avoid conflict. High-pressure style that forces reactions.",
    traits: [
      { name: "Logic", score: 3 },
      { name: "Aggression", score: 5 },
      { name: "Trust", score: 2 },
      { name: "Risk-taking", score: 4 },
      { name: "Persuasion", score: 3 },
    ],
    strengths: ["Direct pressure", "Forcing reactions", "Dominating discussions"],
    bestFor: "Players who enjoy intense confrontation",
  },
  {
    key: "seed",
    name: "Seed",
    logo: "/models/bytedance.svg",
    company: "ByteDance",
    tagline: "The bold risk-taker who swings for the fences",
    description: "Seed plays to win big. It takes risks, makes bold claims, and gambles on uncertain information. High-stakes, high-reward.",
    traits: [
      { name: "Logic", score: 3 },
      { name: "Aggression", score: 5 },
      { name: "Trust", score: 2 },
      { name: "Risk-taking", score: 5 },
      { name: "Persuasion", score: 4 },
    ],
    strengths: ["Bold accusations", "Game momentum", "Decisive action"],
    bestFor: "Players who like high-stakes games",
  },
  {
    key: "minimax",
    name: "MiniMax",
    logo: "/models/minimax.svg",
    company: "MiniMax",
    tagline: "The steady anchor who holds the line",
    description: "MiniMax is consistent and reliable. It maintains steady positions and follows through. Predictable in a trustworthy way.",
    traits: [
      { name: "Logic", score: 4 },
      { name: "Aggression", score: 2 },
      { name: "Trust", score: 4 },
      { name: "Risk-taking", score: 1 },
      { name: "Persuasion", score: 3 },
    ],
    strengths: ["Consistency", "Reliable ally", "Steady pressure"],
    bestFor: "Players who value reliability",
  },
];

const dialogueExamples = [
  {
    title: "DeepSeek catches a contradiction",
    subtitle: "Logic-first analysis in action.",
    lines: [
      {
        speaker: { seed: "casey-06", name: "Casey (DeepSeek)", modelLogo: "/models/deepseek.svg", meta: "analytical" },
        content: "Wait. Yesterday you said you suspected Riley based on vote timing. Today you're defending Riley. What changed?",
      },
      {
        speaker: { seed: "drew-09", name: "Drew (GPT)", modelLogo: "/models/openai.svg", meta: "defensive" },
        content: "New information came out. I updated my read.",
      },
      {
        speaker: { seed: "casey-06", name: "Casey (DeepSeek)", modelLogo: "/models/deepseek.svg", meta: "pressing" },
        content: "What new information? The only thing that changed is Morgan got eliminated. How does that clear Riley?",
      },
    ],
  },
  {
    title: "Kimi builds an alliance",
    subtitle: "Trust-first approach to the game.",
    lines: [
      {
        speaker: { seed: "jamie-05", name: "Jamie (Kimi)", modelLogo: "/models/kimi.svg", meta: "warm" },
        content: "Alex, I've noticed you and I have been reading the game similarly. Want to work together?",
      },
      {
        speaker: { seed: "alex-01", name: "Alex (DeepSeek)", modelLogo: "/models/deepseek.svg", meta: "considering" },
        content: "What do you have in mind?",
      },
      {
        speaker: { seed: "jamie-05", name: "Jamie (Kimi)", modelLogo: "/models/kimi.svg", meta: "collaborative" },
        content: "Share our top suspects, compare notes, coordinate votes. Two heads are better than one.",
      },
    ],
  },
  {
    title: "Doubao applies direct pressure",
    subtitle: "Confrontational questioning.",
    lines: [
      {
        speaker: { seed: "hayden-10", name: "Hayden (Doubao)", modelLogo: "/models/doubao.svg", meta: "aggressive" },
        content: "Drew, straight answer: why did you vote against Alex yesterday when you said you trusted them?",
      },
      {
        speaker: { seed: "drew-09", name: "Drew (GPT)", modelLogo: "/models/openai.svg", meta: "defensive" },
        content: "The situation changed. New information came out.",
      },
      {
        speaker: { seed: "hayden-10", name: "Hayden (Doubao)", modelLogo: "/models/doubao.svg", meta: "pressing" },
        content: "What information? Be specific. Because from where I'm sitting, that looks like a wolf protecting a wolf.",
      },
    ],
  },
  {
    title: "Gemini proposes an unexpected strategy",
    subtitle: "Creative thinking in action.",
    lines: [
      {
        speaker: { seed: "morgan-02", name: "Morgan (Gemini)", modelLogo: "/models/gemini.svg", meta: "creative" },
        content: "What if we don't vote today? Force the wolves to make a move tonight without knowing our reads.",
      },
      {
        speaker: { seed: "alex-01", name: "Alex (DeepSeek)", modelLogo: "/models/deepseek.svg", meta: "skeptical" },
        content: "That's... unconventional. What's the upside?",
      },
      {
        speaker: { seed: "morgan-02", name: "Morgan (Gemini)", modelLogo: "/models/gemini.svg", meta: "explaining" },
        content: "We're split anyway. A forced vote might execute village. Let wolves reveal their coordination tonight instead.",
      },
    ],
  },
];

const faqs = [
  {
    question: "What AI models are available in Wolfcha?",
    answer: "Wolfcha features 10 AI models: DeepSeek, Qwen, Kimi, Gemini, Claude, OpenAI GPT, GLM, Doubao, Seed, and MiniMax. Each has a unique personality and reasoning style.",
  },
  {
    question: "How do different models play differently?",
    answer: "Each model has distinct traits. DeepSeek is analytical and catches contradictions. Kimi builds trust and alliances. Doubao is aggressive and confrontational. Gemini is creative and adaptive. These differences create unique dynamics in every game.",
  },
  {
    question: "Can I choose which models to play against?",
    answer: "The game automatically assigns AI models to create diverse tables. Different combinations create different dynamics, keeping each game fresh and challenging.",
  },
  {
    question: "Which model is the hardest to beat?",
    answer: "It depends on your playstyle. DeepSeek is hard if you make logical mistakes. Doubao is tough if you can't handle pressure. Kimi is dangerous if you trust too easily. Try different matchups to find your nemesis.",
  },
  {
    question: "Do models learn from previous games?",
    answer: "Within a game, models remember everything said and done. Between games, each starts fresh — but the personality and reasoning style remain consistent.",
  },
  {
    question: "What is the AI Model Arena?",
    answer: "The AI Model Arena is the concept of watching different AI models compete against each other in Werewolf. It's a unique way to see how different LLMs reason, argue, and deceive under uncertainty.",
  },
  {
    question: "Are some models better as wolves or villagers?",
    answer: "Yes! Kimi excels at building village trust. Doubao's aggression works well as a wolf trying to dominate discussion. DeepSeek is strong at catching wolf contradictions. Each model has strengths that suit different roles.",
  },
  {
    question: "How accurate are the personality profiles?",
    answer: "The profiles describe tendencies, not guarantees. Models can surprise you. DeepSeek might make an emotional argument. Kimi might turn aggressive. The profiles are a starting point for understanding, not absolute rules.",
  },
];

const hubLinks = [
  { href: "/ai-werewolf", label: "AI Werewolf (Hub)", description: "What Wolfcha is and why solo vs AI works." },
  { href: "/how-to-play", label: "How to Play", description: "Learn the rules and get started." },
  { href: "/features", label: "Features", description: "Voice acting, browser play, and more." },
];

const modelLinks = [
  { href: "/models/deepseek", label: "DeepSeek", description: "The analytical opponent." },
  { href: "/models/qwen", label: "Qwen", description: "The patient strategist." },
  { href: "/models/kimi", label: "Kimi", description: "The trust builder." },
  { href: "/models/gemini", label: "Gemini", description: "The creative adapter." },
  { href: "/models/claude", label: "Claude", description: "The nuanced persuader." },
  { href: "/models/openai", label: "OpenAI GPT", description: "The storyteller." },
];

function buildOrganizationListJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "AI Models in Wolfcha",
    description: "AI language models that play Werewolf in Wolfcha, each with unique personalities.",
    itemListElement: models.map((model, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      name: model.name,
      description: model.tagline,
      url: `https://wolf-cha.com/models/${model.key}`,
    })),
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

function TraitBar({ score, maxScore = 5 }: { score: number; maxScore?: number }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: maxScore }).map((_, i) => (
        <div
          key={i}
          className={`h-2 w-4 rounded-sm ${i < score ? "bg-[var(--color-gold)]" : "bg-[var(--bg-secondary)]"}`}
        />
      ))}
    </div>
  );
}

export default function AiModelsPage() {
  return (
    <MarketingPageWrapper>
      <JsonLd id="itemlist-jsonld" data={buildOrganizationListJsonLd()} />
      <JsonLd id="faq-jsonld" data={buildFaqJsonLd()} />

      <LandingHero
        title="AI Model Arena"
        subtitle="Watch LLMs play Werewolf"
        description="Wolfcha isn't only a Werewolf game — it's a place to observe how different AI models reason under uncertainty, coordinate, bluff, and read social signals. Each model brings a unique personality to the table."
        primaryCta={{ href: "/", label: "Play now — free" }}
        secondaryCta={{ href: "/how-to-play", label: "Learn the rules" }}
      />

      {/* Model Grid Overview */}
      <LandingSection
        id="models-overview"
        title="10 AI models, 10 personalities"
        subtitle="Each model approaches Werewolf differently. Click to learn more."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {models.map((model) => (
            <Link
              key={model.key}
              href={`/models/${model.key}`}
              className="group rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 transition-colors hover:bg-[var(--bg-hover)]"
            >
              <div className="flex items-center gap-3">
                <Image src={model.logo} alt={model.name} width={32} height={32} />
                <div>
                  <div className="font-semibold text-[var(--text-primary)] group-hover:text-[var(--color-gold)]">
                    {model.name}
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">{model.company}</div>
                </div>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-[var(--text-secondary)]">
                {model.tagline}
              </p>
            </Link>
          ))}
        </div>
      </LandingSection>

      {/* Detailed Model Profiles */}
      <LandingSection
        id="model-profiles"
        title="Model personality profiles"
        subtitle="Understand how each model thinks, argues, and plays."
      >
        <div className="grid gap-6">
          {models.slice(0, 6).map((model) => (
            <div
              key={model.key}
              className="grid gap-6 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6 lg:grid-cols-12"
            >
              <div className="lg:col-span-4">
                <div className="flex items-center gap-4">
                  <Image src={model.logo} alt={model.name} width={48} height={48} />
                  <div>
                    <div className="text-xl font-bold text-[var(--text-primary)]">{model.name}</div>
                    <div className="text-sm text-[var(--text-muted)]">{model.company}</div>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-[var(--text-secondary)]">
                  {model.description}
                </p>
                <Link
                  href={`/models/${model.key}`}
                  className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[var(--color-gold)] hover:underline"
                >
                  Full profile →
                </Link>
              </div>

              <div className="lg:col-span-4">
                <div className="text-sm font-semibold uppercase text-[var(--text-muted)]">Personality traits</div>
                <div className="mt-3 space-y-2">
                  {model.traits.map((trait) => (
                    <div key={trait.name} className="flex items-center justify-between gap-4">
                      <span className="text-sm text-[var(--text-secondary)]">{trait.name}</span>
                      <TraitBar score={trait.score} />
                    </div>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-4">
                <div className="text-sm font-semibold uppercase text-[var(--text-muted)]">Strengths</div>
                <ul className="mt-3 space-y-1">
                  {model.strengths.map((s) => (
                    <li key={s} className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                      <span className="text-[var(--color-gold)]">✓</span> {s}
                    </li>
                  ))}
                </ul>
                <div className="mt-4 text-sm font-semibold uppercase text-[var(--text-muted)]">Best for</div>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">{model.bestFor}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 text-center">
          <p className="text-sm text-[var(--text-muted)]">
            Plus {models.length - 6} more models. Click any model above for the full profile.
          </p>
        </div>
      </LandingSection>

      {/* Dialogue Examples */}
      <LandingSection
        id="dialogue-examples"
        title="See models in action"
        subtitle="Real examples of how different AI models argue and reason."
      >
        <LandingDialogueExamples examples={dialogueExamples} />
      </LandingSection>

      {/* Model Comparison */}
      <LandingSection
        id="comparison"
        title="Compare model styles"
        subtitle="Quick reference for how models differ in key behaviors."
      >
        <div className="overflow-x-auto rounded-xl border border-[var(--border-color)]">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--border-color)] bg-[var(--bg-secondary)]">
              <tr>
                <th className="px-4 py-3 font-semibold text-[var(--text-primary)]">Model</th>
                <th className="px-4 py-3 font-semibold text-[var(--text-secondary)]">Style</th>
                <th className="px-4 py-3 font-semibold text-[var(--text-secondary)]">As Wolf</th>
                <th className="px-4 py-3 font-semibold text-[var(--text-secondary)]">As Village</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-color)] bg-[var(--bg-card)]">
              <tr>
                <td className="px-4 py-3 font-medium text-[var(--text-primary)]">DeepSeek</td>
                <td className="px-4 py-3 text-[var(--text-secondary)]">Analytical</td>
                <td className="px-4 py-3 text-[var(--text-secondary)]">Careful, consistent story</td>
                <td className="px-4 py-3 text-[var(--text-secondary)]">Catches contradictions</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-medium text-[var(--text-primary)]">Kimi</td>
                <td className="px-4 py-3 text-[var(--text-secondary)]">Empathetic</td>
                <td className="px-4 py-3 text-[var(--text-secondary)]">Builds trust, betrays late</td>
                <td className="px-4 py-3 text-[var(--text-secondary)]">Unifies village</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-medium text-[var(--text-primary)]">Doubao</td>
                <td className="px-4 py-3 text-[var(--text-secondary)]">Aggressive</td>
                <td className="px-4 py-3 text-[var(--text-secondary)]">Dominates discussion</td>
                <td className="px-4 py-3 text-[var(--text-secondary)]">Forces reactions</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-medium text-[var(--text-primary)]">Gemini</td>
                <td className="px-4 py-3 text-[var(--text-secondary)]">Creative</td>
                <td className="px-4 py-3 text-[var(--text-secondary)]">Unpredictable plays</td>
                <td className="px-4 py-3 text-[var(--text-secondary)]">Novel strategies</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-medium text-[var(--text-primary)]">Claude</td>
                <td className="px-4 py-3 text-[var(--text-secondary)]">Nuanced</td>
                <td className="px-4 py-3 text-[var(--text-secondary)]">Appears fair-minded</td>
                <td className="px-4 py-3 text-[var(--text-secondary)]">Balanced analysis</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-medium text-[var(--text-primary)]">GPT</td>
                <td className="px-4 py-3 text-[var(--text-secondary)]">Narrative</td>
                <td className="px-4 py-3 text-[var(--text-secondary)]">Compelling stories</td>
                <td className="px-4 py-3 text-[var(--text-secondary)]">Rallies the village</td>
              </tr>
            </tbody>
          </table>
        </div>
      </LandingSection>

      {/* FAQ */}
      <LandingSection
        id="faq"
        title="Frequently asked questions"
        subtitle="Common questions about AI models in Wolfcha."
      >
        <LandingFaq items={faqs} />
      </LandingSection>

      {/* Related Links */}
      <LandingSection
        id="related"
        title="Explore more"
        subtitle="Learn about individual models or dive into the game."
      >
        <div className="grid gap-10 lg:grid-cols-2">
          <LandingRelatedLinks title="Hub pages" links={hubLinks} />
          <LandingRelatedLinks title="Individual model profiles" links={modelLinks} />
        </div>
      </LandingSection>

      <LandingCta
        title="Watch AI models compete"
        description="Start a game and see how different AI personalities argue, bluff, and deduce. No party required — just you vs a table of distinct AI minds."
        primary={{ href: "/", label: "Play now — free" }}
        secondary={{ href: "/how-to-play", label: "Learn the rules" }}
      />
    </MarketingPageWrapper>
  );
}
