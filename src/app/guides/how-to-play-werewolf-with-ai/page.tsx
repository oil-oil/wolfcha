import type { Metadata } from "next";
import Link from "next/link";
import { MarketingPageWrapper } from "@/components/seo/MarketingPageWrapper";
import { JsonLd } from "@/components/seo/JsonLd";
import { LandingHero } from "@/components/seo/landing/LandingHero";
import { LandingSection } from "@/components/seo/landing/LandingSection";
import { LandingFaq } from "@/components/seo/landing/LandingFaq";
import { LandingRelatedLinks } from "@/components/seo/landing/LandingRelatedLinks";
import { LandingAiSeats } from "@/components/seo/landing/LandingAiSeats";

export const metadata: Metadata = {
  title: "How to Play Werewolf with AI: Solo Play Guide | Wolfcha",
  description: "Learn how to play Werewolf with AI opponents online. Practice deduction, bluffing, voting, and role strategy in a solo Werewolf game without needing friends.",
  keywords: ["play werewolf with ai", "werewolf ai opponents", "solo werewolf", "werewolf practice", "ai werewolf game", "play werewolf online", "single player werewolf"],
  alternates: { canonical: "https://wolf-cha.com/guides/how-to-play-werewolf-with-ai" },
};

const aiSeats = [
  { seed: "alex_ai", name: "Alex", persona: "Analytical", modelLogo: "/models/deepseek.svg" },
  { seed: "morgan_ai", name: "Morgan", persona: "Aggressive", modelLogo: "/models/qwen.svg" },
  { seed: "casey_ai", name: "Casey", persona: "Cautious", modelLogo: "/models/gemini.svg" },
  { seed: "jordan_ai", name: "Jordan", persona: "Charismatic", modelLogo: "/models/kimi.svg" },
];

const faqItems = [
  { question: "How realistic are the AI players?", answer: "AI players have their own personalities, role goals, and table memory. They lie, accuse, defend, vote, and react to pressure like players at a real Werewolf table." },
  { question: "Can I choose my role?", answer: "Yes! You can select which role you want to play, or let the game randomly assign one for the full experience." },
  { question: "Is it good for practice?", answer: "Excellent for practice. Play as many games as you want, try different strategies, and learn without social pressure." },
  { question: "Do AI players cheat?", answer: "No! AI players only use information their role would have access to. Wolves don't know who other wolves are unless they're wolves themselves." },
];

const relatedLinks = [
  { href: "/guides/werewolf-rules", label: "Game Rules", description: "Learn the basics" },
  { href: "/guides/werewolf-for-beginners", label: "Beginner Guide", description: "Start here" },
  { href: "/werewolf-game-with-ai-opponents", label: "AI Opponents", description: "Why solo vs AI works" },
  { href: "/guides/seer-strategy", label: "Seer Strategy", description: "Master a role" },
];

export default function HowToPlayWithAIPage() {
  return (
    <MarketingPageWrapper>
      <JsonLd id="article-jsonld" data={{ "@context": "https://schema.org", "@type": "Article", headline: "How to Play Werewolf with AI" }} />
      <LandingHero title="How to Play Werewolf with AI" subtitle="SOLO PLAY GUIDE" description="No friends online? No problem. Play Werewolf anytime with AI opponents that speak, suspect, bluff, and vote. Each AI has its own personality, memory, and strategy." primaryCta={{ href: "/", label: "Start Playing" }} image={{ src: "/roles/seer.png", alt: "AI Werewolf" }} />
      
      <LandingSection id="why" title="Why Play with AI?" subtitle="Benefits of solo practice">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
            <div className="text-2xl mb-2">🕐</div>
            <h4 className="font-bold text-[var(--text-primary)] mb-2">Play Anytime</h4>
            <p className="text-sm text-[var(--text-secondary)]">No need to coordinate schedules or find 8+ players.</p>
          </div>
          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
            <div className="text-2xl mb-2">🎓</div>
            <h4 className="font-bold text-[var(--text-primary)] mb-2">Learn Safely</h4>
            <p className="text-sm text-[var(--text-secondary)]">Practice strategies without embarrassment or pressure.</p>
          </div>
          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
            <div className="text-2xl mb-2">🔄</div>
            <h4 className="font-bold text-[var(--text-primary)] mb-2">Unlimited Games</h4>
            <p className="text-sm text-[var(--text-secondary)]">Play as many rounds as you want to master any role.</p>
          </div>
          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
            <div className="text-2xl mb-2">🎭</div>
            <h4 className="font-bold text-[var(--text-primary)] mb-2">Unique AI Personalities</h4>
            <p className="text-sm text-[var(--text-secondary)]">Each AI has distinct playstyle - aggressive, cautious, analytical.</p>
          </div>
        </div>
      </LandingSection>

      <LandingSection id="ai-players" title="Meet the AI Players" subtitle="Your opponents await">
        <LandingAiSeats seats={aiSeats} />
      </LandingSection>

      <LandingSection id="how" title="How It Works" subtitle="Simple steps to start">
        <div className="space-y-4">
          <div className="flex gap-4 p-4 rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)]">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-gold)]/20 text-[var(--color-gold)] font-bold">1</div>
            <div><h4 className="font-bold text-[var(--text-primary)]">Choose Your Setup</h4><p className="text-sm text-[var(--text-secondary)]">Select player count (8-12) and your preferred role, or go random.</p></div>
          </div>
          <div className="flex gap-4 p-4 rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)]">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-gold)]/20 text-[var(--color-gold)] font-bold">2</div>
            <div><h4 className="font-bold text-[var(--text-primary)]">Start the Game</h4><p className="text-sm text-[var(--text-secondary)]">AI players are assigned roles and the game begins with Night 1.</p></div>
          </div>
          <div className="flex gap-4 p-4 rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)]">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-gold)]/20 text-[var(--color-gold)] font-bold">3</div>
            <div><h4 className="font-bold text-[var(--text-primary)]">Play Your Role</h4><p className="text-sm text-[var(--text-secondary)]">Use your abilities at night, discuss and vote during the day.</p></div>
          </div>
          <div className="flex gap-4 p-4 rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)]">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-gold)]/20 text-[var(--color-gold)] font-bold">4</div>
            <div><h4 className="font-bold text-[var(--text-primary)]">Win or Learn</h4><p className="text-sm text-[var(--text-secondary)]">Eliminate wolves or achieve wolf victory. Either way, you improve!</p></div>
          </div>
        </div>
      </LandingSection>

      <LandingSection id="faq" title="FAQ"><LandingFaq items={faqItems} /></LandingSection>
      
      <section className="mx-auto max-w-5xl px-6 py-14">
        <div className="rounded-2xl border border-[var(--color-gold)]/30 bg-gradient-to-r from-[var(--color-gold)]/10 to-transparent p-8 text-center">
          <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-4">Ready to Play?</h2>
          <p className="text-[var(--text-secondary)] mb-6">Start a game now - AI opponents are waiting!</p>
          <Link href="/" className="inline-block rounded-full bg-[var(--color-gold)] px-8 py-4 font-bold text-black">Play Werewolf with AI</Link>
        </div>
      </section>

      <LandingSection id="related" title="Related"><LandingRelatedLinks title="Learn More" links={relatedLinks} /></LandingSection>
    </MarketingPageWrapper>
  );
}
