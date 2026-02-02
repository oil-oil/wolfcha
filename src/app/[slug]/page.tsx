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
  getSoloLandingData,
  soloLandingKeys,
  type SoloLandingData,
} from "@/components/seo/landing/soloLandingData";
import {
  getExperienceLandingData,
  experienceLandingKeys,
  type ExperienceLandingData,
} from "@/components/seo/landing/experienceLandingData";
import {
  getGameComparisonData,
  gameComparisonKeys,
  type GameComparisonData,
} from "@/components/seo/landing/gameComparisonData";

export const dynamicParams = false;

// Combine solo, experience, and game comparison landing keys
export function generateStaticParams() {
  const soloParams = soloLandingKeys.map((slug) => ({ slug }));
  const experienceParams = experienceLandingKeys.map((slug) => ({ slug }));
  const gameComparisonParams = gameComparisonKeys.map((slug) => ({ slug }));
  return [...soloParams, ...experienceParams, ...gameComparisonParams];
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

function buildHowToJsonLd({
  url,
  title,
  description,
  steps,
}: {
  url: string;
  title: string;
  description: string;
  steps: Array<{ step: string; description: string }>;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: title,
    description,
    url,
    step: steps.map((s, idx) => ({
      "@type": "HowToStep",
      position: idx + 1,
      name: s.step,
      text: s.description,
    })),
  };
}

function buildFeatureJsonLd({
  url,
  title,
  description,
}: {
  url: string;
  title: string;
  description: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title,
    description,
    url,
    isPartOf: {
      "@type": "WebSite",
      name: "Wolfcha",
      url: "https://wolf-cha.com",
    },
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  
  // Check for solo landing page
  const soloData = getSoloLandingData(slug);
  if (soloData) {
    const canonical = `https://wolf-cha.com/${soloData.slug}`;
    const title = `${soloData.title} — AI Werewolf (Mafia) Game | Wolfcha`;
    return {
      title,
      description: soloData.heroDescription,
      alternates: { canonical },
      openGraph: {
        title,
        description: soloData.heroDescription,
        url: canonical,
        type: "website",
        images: [{ url: "https://wolf-cha.com/og-image.png", width: 1200, height: 630, alt: "Wolfcha - AI Werewolf Game" }],
      },
    };
  }
  
  // Check for experience landing page
  const experienceData = getExperienceLandingData(slug);
  if (experienceData) {
    const canonical = `https://wolf-cha.com/${experienceData.slug}`;
    const title = `${experienceData.title} — AI Werewolf | Wolfcha`;
    return {
      title,
      description: experienceData.heroDescription,
      alternates: { canonical },
      openGraph: {
        title,
        description: experienceData.heroDescription,
        url: canonical,
        type: "website",
        images: [{ url: "https://wolf-cha.com/og-image.png", width: 1200, height: 630, alt: "Wolfcha - AI Werewolf Game" }],
      },
    };
  }

  // Check for game comparison landing page
  const gameComparisonData = getGameComparisonData(slug);
  if (gameComparisonData) {
    const canonical = `https://wolf-cha.com/${gameComparisonData.slug}`;
    const title = `${gameComparisonData.title} — Comparison | Wolfcha`;
    return {
      title,
      description: gameComparisonData.heroDescription,
      alternates: { canonical },
      openGraph: {
        title,
        description: gameComparisonData.heroDescription,
        url: canonical,
        type: "article",
        images: [{ url: "https://wolf-cha.com/og-image.png", width: 1200, height: 630, alt: "Wolfcha - AI Werewolf Game" }],
      },
    };
  }

  return {};
}

// Solo Landing Page Component
function SoloLandingPage({ data }: { data: SoloLandingData }) {
  const canonical = `https://wolf-cha.com/${data.slug}`;
  const relatedHub = data.related.hub;
  const relatedCluster = data.related.cluster.filter((l) => l.href !== `/${data.slug}`);

  return (
    <MarketingPageWrapper>
      <JsonLd id={`faq-jsonld-${data.key}`} data={buildFaqJsonLd({ url: canonical, items: data.faqs })} />
      <JsonLd
        id={`howto-jsonld-${data.key}`}
        data={buildHowToJsonLd({
          url: canonical,
          title: `How to ${data.title}`,
          description: data.heroDescription,
          steps: data.howItWorks,
        })}
      />

      <LandingHero
        title={data.title}
        subtitle={data.tagline}
        description={data.heroDescription}
        primaryCta={{ href: "/", label: "Play now — free" }}
        secondaryCta={{ href: "/how-to-play", label: "Learn the rules" }}
        aside={<LandingAiSeats seats={data.seats.slice(0, 6)} compact />}
      />

      <LandingSection
        id="problems-solved"
        title="Why solo Werewolf?"
        subtitle="Common reasons players choose Wolfcha over traditional group games."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.problemsSolved.map((problem) => (
            <div
              key={problem}
              className="flex items-start gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5"
            >
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-gold)] text-black">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="text-sm leading-relaxed text-[var(--text-secondary)]">{problem}</div>
            </div>
          ))}
        </div>
      </LandingSection>

      <LandingSection
        id="how-it-works"
        title="How it works"
        subtitle="Get from zero to playing in under a minute."
      >
        <div className="grid gap-4 md:grid-cols-5">
          {data.howItWorks.map((step, idx) => (
            <div
              key={step.step}
              className="relative rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5"
            >
              <div className="absolute -top-3 left-4 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-gold)] text-xs font-bold text-black">
                {idx + 1}
              </div>
              <div className="mt-2 text-[15px] font-bold text-[var(--text-primary)]">{step.step}</div>
              <div className="mt-2 text-sm text-[var(--text-secondary)]">{step.description}</div>
            </div>
          ))}
        </div>
      </LandingSection>

      <LandingSection
        id="unique-features"
        title="What makes Wolfcha different"
        subtitle="Features that set solo AI Werewolf apart from traditional play."
      >
        <div className="grid gap-6 md:grid-cols-2">
          {data.uniqueFeatures.map((feature) => (
            <div
              key={feature.title}
              className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6"
            >
              <div className="text-lg font-bold text-[var(--text-primary)]">{feature.title}</div>
              <div className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">{feature.description}</div>
            </div>
          ))}
        </div>
      </LandingSection>

      <LandingSection
        id="comparison"
        title="Traditional vs Wolfcha"
        subtitle="See how solo AI play compares to organizing a human game."
      >
        <div className="overflow-x-auto rounded-xl border border-[var(--border-color)]">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--border-color)] bg-[var(--bg-secondary)]">
              <tr>
                <th className="px-4 py-3 font-semibold text-[var(--text-primary)]">Feature</th>
                <th className="px-4 py-3 font-semibold text-[var(--text-secondary)]">Traditional</th>
                <th className="px-4 py-3 font-semibold text-[var(--color-gold)]">Wolfcha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-color)] bg-[var(--bg-card)]">
              {data.comparisonTable.map((row) => (
                <tr key={row.feature}>
                  <td className="px-4 py-3 font-medium text-[var(--text-primary)]">{row.feature}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{row.traditional}</td>
                  <td className="px-4 py-3 text-[var(--text-primary)]">{row.wolfcha}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </LandingSection>

      <LandingSection
        id="ai-seats"
        title="Meet your AI opponents"
        subtitle="Each seat at the table is an AI with a unique personality and reasoning style."
      >
        <LandingAiSeats seats={data.seats} />
      </LandingSection>

      <LandingSection
        id="dialogue-examples"
        title="Real dialogue examples"
        subtitle="See how AI opponents argue, pressure, and coordinate in actual games."
      >
        <LandingDialogueExamples examples={data.dialogues} />
      </LandingSection>

      <LandingSection id="faq" title="Frequently asked questions" subtitle="Common questions about playing Werewolf solo with AI.">
        <LandingFaq items={data.faqs} />
      </LandingSection>

      <LandingSection id="related" title="Explore more" subtitle="Hub pages for context, and related solo play options.">
        <div className="grid gap-10 lg:grid-cols-2">
          <LandingRelatedLinks title="Hub pages" links={relatedHub} />
          <LandingRelatedLinks title="More solo options" links={relatedCluster} />
        </div>
      </LandingSection>

      <LandingCta
        title="Ready to play Werewolf solo?"
        description="Start a game in your browser. No party required — just you vs a table of AI personalities."
        primary={{ href: "/", label: "Play now — free" }}
        secondary={{ href: "/ai-werewolf", label: "What is AI Werewolf?" }}
      />
    </MarketingPageWrapper>
  );
}

// Experience Landing Page Component
function ExperienceLandingPage({ data }: { data: ExperienceLandingData }) {
  const canonical = `https://wolf-cha.com/${data.slug}`;
  const relatedHub = data.related.hub;
  const relatedCluster = data.related.cluster.filter((l) => l.href !== `/${data.slug}`);

  return (
    <MarketingPageWrapper>
      <JsonLd id={`faq-jsonld-${data.key}`} data={buildFaqJsonLd({ url: canonical, items: data.faqs })} />
      <JsonLd
        id={`feature-jsonld-${data.key}`}
        data={buildFeatureJsonLd({
          url: canonical,
          title: data.title,
          description: data.heroDescription,
        })}
      />

      <LandingHero
        title={data.title}
        subtitle={data.tagline}
        description={data.heroDescription}
        primaryCta={{ href: "/", label: "Play now — free" }}
        secondaryCta={{ href: "/features", label: "All features" }}
        aside={<LandingAiSeats seats={data.seats} compact />}
      />

      {/* Feature Highlight */}
      <LandingSection
        id="feature-highlight"
        title={data.featureHighlight.title}
        subtitle={data.featureHighlight.description}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {data.featureHighlight.benefits.map((benefit) => (
            <div
              key={benefit}
              className="flex items-start gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5"
            >
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-gold)] text-black">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="text-sm leading-relaxed text-[var(--text-secondary)]">{benefit}</div>
            </div>
          ))}
        </div>
      </LandingSection>

      {/* When to Use */}
      <LandingSection
        id="when-to-use"
        title="When to use this mode"
        subtitle="Recommendations based on your situation."
      >
        <div className="grid gap-4 md:grid-cols-2">
          {data.whenToUse.map((item) => (
            <div
              key={item.scenario}
              className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5"
            >
              <div className="text-sm font-semibold text-[var(--text-primary)]">{item.scenario}</div>
              <div className="mt-2 text-sm text-[var(--text-secondary)]">{item.recommendation}</div>
            </div>
          ))}
        </div>
      </LandingSection>

      {/* Comparison Table */}
      <LandingSection
        id="comparison"
        title="With vs Without"
        subtitle="How this feature changes your experience."
      >
        <div className="overflow-x-auto rounded-xl border border-[var(--border-color)]">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--border-color)] bg-[var(--bg-secondary)]">
              <tr>
                <th className="px-4 py-3 font-semibold text-[var(--text-primary)]">Aspect</th>
                <th className="px-4 py-3 font-semibold text-[var(--color-gold)]">With Feature</th>
                <th className="px-4 py-3 font-semibold text-[var(--text-secondary)]">Without Feature</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-color)] bg-[var(--bg-card)]">
              {data.comparisonTable.map((row) => (
                <tr key={row.aspect}>
                  <td className="px-4 py-3 font-medium text-[var(--text-primary)]">{row.aspect}</td>
                  <td className="px-4 py-3 text-[var(--text-primary)]">{row.withFeature}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{row.withoutFeature}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </LandingSection>

      {/* Target Audience */}
      <LandingSection
        id="who-its-for"
        title="Who is this for?"
        subtitle="Players who benefit most from this experience."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {data.targetAudience.map((audience) => (
            <div
              key={audience}
              className="flex items-center gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-gold)] text-lg">
                👤
              </div>
              <div className="text-sm text-[var(--text-secondary)]">{audience}</div>
            </div>
          ))}
        </div>
      </LandingSection>

      {/* Dialogue Examples */}
      <LandingSection
        id="dialogue-examples"
        title="See it in action"
        subtitle="Example of how this feature affects gameplay."
      >
        <LandingDialogueExamples examples={data.dialogues} />
      </LandingSection>

      {/* FAQ */}
      <LandingSection id="faq" title="Frequently asked questions" subtitle="Common questions about this feature.">
        <LandingFaq items={data.faqs} />
      </LandingSection>

      {/* Related Links */}
      <LandingSection id="related" title="Explore more" subtitle="Hub pages and other experience options.">
        <div className="grid gap-10 lg:grid-cols-2">
          <LandingRelatedLinks title="Hub pages" links={relatedHub} />
          <LandingRelatedLinks title="More experiences" links={relatedCluster} />
        </div>
      </LandingSection>

      <LandingCta
        title="Try this experience now"
        description="Start a game and customize your settings for the perfect Werewolf experience."
        primary={{ href: "/", label: "Play now — free" }}
        secondary={{ href: "/features", label: "All features" }}
      />
    </MarketingPageWrapper>
  );
}

// Game Comparison Landing Page Component
function GameComparisonLandingPage({ data }: { data: GameComparisonData }) {
  const canonical = `https://wolf-cha.com/${data.slug}`;
  const relatedHub = data.related.hub;
  const relatedCluster = data.related.cluster.filter((l) => l.href !== `/${data.slug}`);

  return (
    <MarketingPageWrapper>
      <JsonLd id={`faq-jsonld-${data.key}`} data={buildFaqJsonLd({ url: canonical, items: data.faqs })} />
      <JsonLd
        id={`comparison-jsonld-${data.key}`}
        data={buildFeatureJsonLd({
          url: canonical,
          title: data.title,
          description: data.heroDescription,
        })}
      />

      <LandingHero
        title={data.title}
        subtitle={data.tagline}
        description={data.heroDescription}
        primaryCta={{ href: "/", label: "Play Wolfcha — free" }}
        secondaryCta={{ href: "/ai-werewolf", label: "What is AI Werewolf?" }}
        aside={<LandingAiSeats seats={data.seats} compact />}
      />

      {/* Comparison Intro */}
      <LandingSection
        id="comparison-intro"
        title="The comparison"
        subtitle={data.comparisonIntro}
      >
        <div className="overflow-x-auto rounded-xl border border-[var(--border-color)]">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--border-color)] bg-[var(--bg-secondary)]">
              <tr>
                <th className="px-4 py-3 font-semibold text-[var(--text-primary)]">Dimension</th>
                <th className="px-4 py-3 font-semibold text-[var(--color-gold)]">Wolfcha</th>
                <th className="px-4 py-3 font-semibold text-[var(--text-secondary)]">Other</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-color)] bg-[var(--bg-card)]">
              {data.comparisonTable.map((row) => (
                <tr key={row.dimension}>
                  <td className="px-4 py-3 font-medium text-[var(--text-primary)]">{row.dimension}</td>
                  <td className="px-4 py-3 text-[var(--text-primary)]">{row.wolfcha}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{row.other}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </LandingSection>

      {/* Wolfcha Advantages */}
      <LandingSection
        id="wolfcha-advantages"
        title="Why choose Wolfcha"
        subtitle="Key advantages of playing with AI opponents."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.wolfchaAdvantages.map((advantage) => (
            <div
              key={advantage}
              className="flex items-start gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5"
            >
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-gold)] text-black">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="text-sm leading-relaxed text-[var(--text-secondary)]">{advantage}</div>
            </div>
          ))}
        </div>
      </LandingSection>

      {/* When to Choose */}
      <LandingSection
        id="when-to-choose"
        title="Which should you choose?"
        subtitle="Recommendations based on your situation."
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-[var(--color-gold)] bg-[var(--bg-card)] p-6">
            <div className="text-lg font-bold text-[var(--color-gold)]">Choose Wolfcha if...</div>
            <ul className="mt-4 space-y-2">
              {data.whenToChooseWolfcha.map((reason) => (
                <li key={reason} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                  <span className="text-[var(--color-gold)]">✓</span> {reason}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6">
            <div className="text-lg font-bold text-[var(--text-primary)]">Choose other options if...</div>
            <ul className="mt-4 space-y-2">
              {data.whenToChooseOther.map((reason) => (
                <li key={reason} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                  <span className="text-[var(--text-muted)]">•</span> {reason}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </LandingSection>

      {/* Differentiator */}
      <LandingSection
        id="differentiator"
        title="The bottom line"
        subtitle="What makes Wolfcha unique."
      >
        <div className="rounded-xl border border-[var(--color-gold)] bg-[var(--glass-bg)] p-8 text-center">
          <p className="text-lg font-semibold leading-relaxed text-[var(--text-primary)]">
            {data.wolfchaDifferentiator}
          </p>
        </div>
      </LandingSection>

      {/* FAQ */}
      <LandingSection id="faq" title="Frequently asked questions" subtitle="Common questions about this comparison.">
        <LandingFaq items={data.faqs} />
      </LandingSection>

      {/* Related Links */}
      <LandingSection id="related" title="Explore more" subtitle="Hub pages and other comparisons.">
        <div className="grid gap-10 lg:grid-cols-2">
          <LandingRelatedLinks title="Hub pages" links={relatedHub} />
          <LandingRelatedLinks title="More comparisons" links={relatedCluster} />
        </div>
      </LandingSection>

      <LandingCta
        title="Try Wolfcha now"
        description="Experience AI-powered social deduction. No party needed — just you vs a table of AI personalities."
        primary={{ href: "/", label: "Play now — free" }}
        secondary={{ href: "/ai-werewolf", label: "What is AI Werewolf?" }}
      />
    </MarketingPageWrapper>
  );
}

export default async function DynamicLandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  
  // Check for solo landing page first
  const soloData = getSoloLandingData(slug);
  if (soloData) {
    return <SoloLandingPage data={soloData} />;
  }
  
  // Check for experience landing page
  const experienceData = getExperienceLandingData(slug);
  if (experienceData) {
    return <ExperienceLandingPage data={experienceData} />;
  }
  
  // Check for game comparison landing page
  const gameComparisonData = getGameComparisonData(slug);
  if (gameComparisonData) {
    return <GameComparisonLandingPage data={gameComparisonData} />;
  }

  notFound();
}
