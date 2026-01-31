import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketingPageWrapper } from "@/components/seo/MarketingPageWrapper";
import { JsonLd } from "@/components/seo/JsonLd";
import { LandingHero } from "@/components/seo/landing/LandingHero";
import { LandingSection } from "@/components/seo/landing/LandingSection";
import { LandingAiSeats } from "@/components/seo/landing/LandingAiSeats";
import { LandingDialogueExamples } from "@/components/seo/landing/LandingDialogueExamples";
import { LandingFaq } from "@/components/seo/landing/LandingFaq";
import { LandingRelatedLinks } from "@/components/seo/landing/LandingRelatedLinks";
import { LandingCta } from "@/components/seo/landing/LandingCta";
import {
  getRoleLandingData,
  roleLandingKeys,
  type RoleLandingKey,
} from "@/components/seo/landing/roleLandingData";

export const dynamicParams = false;

export function generateStaticParams() {
  return roleLandingKeys.map((role) => ({ role }));
}

function buildFaqJsonLd({
  url,
  items,
}: {
  url: string;
  items: Array<{ question: string; answer: string }>;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
    url,
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ role: RoleLandingKey }>;
}): Promise<Metadata> {
  const { role } = await params;
  const data = getRoleLandingData(role);
  if (!data) {
    return {};
  }

  const canonical = `https://wolf-cha.com/roles/${data.key}`;
  const title = `${data.roleName} Role Guide — AI Werewolf (Mafia) | Wolfcha`;

  return {
    title,
    description: data.heroDescription,
    alternates: {
      canonical,
    },
    openGraph: {
      title,
      description: data.heroDescription,
      url: canonical,
      type: "article",
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
}

export default async function RoleLandingPage({
  params,
}: {
  params: Promise<{ role: RoleLandingKey }>;
}) {
  const { role } = await params;
  const data = getRoleLandingData(role);

  if (!data) {
    notFound();
  }

  const canonical = `https://wolf-cha.com/roles/${data.key}`;

  const relatedHub = data.related.hub;
  const relatedCluster = data.related.cluster.filter((l) => l.href !== `/roles/${data.key}`);

  return (
    <MarketingPageWrapper>
      <JsonLd id={`faq-jsonld-${data.key}`} data={buildFaqJsonLd({ url: canonical, items: data.faqs })} />

      <LandingHero
        title={`${data.roleName} in AI Werewolf (Mafia)`}
        subtitle={data.tagline}
        description={data.heroDescription}
        primaryCta={{ href: "/", label: "Play now" }}
        secondaryCta={{ href: "/how-to-play", label: "How to play" }}
        image={data.image}
        aside={<LandingAiSeats seats={data.seats.slice(0, 6)} compact />}
      />

      <LandingSection
        id="overview"
        title={`${data.roleName} overview`}
        subtitle="What you can do at night, what you should do by day, and what winning looks like."
      >
        <div className="grid gap-6 md:grid-cols-3">
          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6">
            <div className="text-sm font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
              Ability
            </div>
            <div className="mt-3 text-[15px] leading-relaxed text-[var(--text-primary)]">{data.ability}</div>
          </div>
          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6">
            <div className="text-sm font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
              Night action
            </div>
            <div className="mt-3 text-[15px] leading-relaxed text-[var(--text-primary)]">{data.nightAction}</div>
          </div>
          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6">
            <div className="text-sm font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
              Win condition
            </div>
            <div className="mt-3 text-[15px] leading-relaxed text-[var(--text-primary)]">{data.winCondition}</div>
          </div>
        </div>
      </LandingSection>

      <LandingSection
        id="ai-seats"
        title="Example AI seats (what a table can feel like)"
        subtitle="Wolfcha is designed for solo play: each other seat is an AI opponent with a different style."
      >
        <LandingAiSeats seats={data.seats} />
      </LandingSection>

      <LandingSection
        id="strategy"
        title={`${data.roleName} strategy`}
        subtitle="A practical set of mistakes to avoid, and habits that win more games over time."
      >
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6">
            <div className="text-lg font-bold text-[var(--text-primary)]">Beginner mistakes</div>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-[var(--text-secondary)]">
              {data.beginnerMistakes.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6">
            <div className="text-lg font-bold text-[var(--text-primary)]">Advanced tips</div>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-[var(--text-secondary)]">
              {data.advancedTips.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6">
            <div className="text-lg font-bold text-[var(--text-primary)]">Solo vs AI notes</div>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-[var(--text-secondary)]">
              {data.aiBehaviorNotes.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        </div>
      </LandingSection>

      <LandingSection
        id="dialogue-examples"
        title="Dialogue examples"
        subtitle="These are realistic snippets of how AI opponents argue, pressure, and coordinate—tailored to this role."
      >
        <LandingDialogueExamples examples={data.dialogues} />
      </LandingSection>

      <LandingSection
        id="checklist"
        title="Quick checklist"
        subtitle="Use this as a pre-game reminder (or between day phases)."
      >
        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6">
          <ul className="list-disc space-y-2 pl-5 text-sm text-[var(--text-secondary)]">
            {data.checklist.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      </LandingSection>

      <LandingSection id="faq" title="FAQ" subtitle="Common questions players ask about this role in solo vs AI games.">
        <LandingFaq items={data.faqs} />
      </LandingSection>

      <LandingSection id="related" title="Related pages" subtitle="Keep exploring: hub pages for context, and other roles for matchups.">
        <div className="grid gap-10 lg:grid-cols-2">
          <LandingRelatedLinks title="Hub pages" links={relatedHub} />
          <LandingRelatedLinks title="More roles" links={relatedCluster} />
        </div>
      </LandingSection>

      <LandingCta
        title="Ready to play a solo Werewolf match with AI opponents?"
        description="Start a game in your browser. No party required — just you vs a table of AI personalities."
        primary={{ href: "/", label: "Play now" }}
        secondary={{ href: "/ai-werewolf", label: "What is AI Werewolf?" }}
      />
    </MarketingPageWrapper>
  );
}
