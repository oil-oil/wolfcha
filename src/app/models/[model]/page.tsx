import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MarketingPageWrapper } from "@/components/seo/MarketingPageWrapper";
import { JsonLd } from "@/components/seo/JsonLd";
import { LandingHero } from "@/components/seo/landing/LandingHero";
import { LandingSection } from "@/components/seo/landing/LandingSection";
import { LandingDialogueExamples } from "@/components/seo/landing/LandingDialogueExamples";
import { LandingFaq } from "@/components/seo/landing/LandingFaq";
import { LandingRelatedLinks } from "@/components/seo/landing/LandingRelatedLinks";
import { LandingCta } from "@/components/seo/landing/LandingCta";
import {
  getModelLandingData,
  modelLandingKeys,
  type ModelLandingKey,
} from "@/components/seo/landing/modelLandingData";
import {
  getModelComparisonData,
  modelComparisonKeys,
  type ModelComparisonKey,
} from "@/components/seo/landing/modelComparisonData";

export const dynamicParams = false;

// Generate params for both single model pages and comparison pages
export function generateStaticParams() {
  const singleModelParams = modelLandingKeys.map((model) => ({ model }));
  const comparisonParams = modelComparisonKeys.map((comparison) => ({ model: comparison }));
  return [...singleModelParams, ...comparisonParams];
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

function buildSoftwareAppJsonLd({
  url,
  name,
  description,
}: {
  url: string;
  name: string;
  description: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: `${name} AI in Wolfcha`,
    description,
    url,
    applicationCategory: "Game",
    operatingSystem: "Web Browser",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
  };
}

function buildComparisonJsonLd({
  url,
  modelA,
  modelB,
  description,
}: {
  url: string;
  modelA: string;
  modelB: string;
  description: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    name: `${modelA} vs ${modelB} in Werewolf`,
    description,
    url,
    articleSection: "AI Model Comparison",
    about: [
      { "@type": "Thing", name: modelA },
      { "@type": "Thing", name: modelB },
    ],
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ model: string }>;
}): Promise<Metadata> {
  const { model } = await params;
  
  // Check if it's a comparison page
  const comparisonData = getModelComparisonData(model);
  if (comparisonData) {
    const canonical = `https://wolf-cha.com/models/${comparisonData.key}`;
    const title = `${comparisonData.modelA.name} vs ${comparisonData.modelB.name} — AI Werewolf Comparison | Wolfcha`;
    
    return {
      title,
      description: comparisonData.heroDescription,
      alternates: { canonical },
      openGraph: {
        title,
        description: comparisonData.heroDescription,
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
  
  // Single model page
  const data = getModelLandingData(model);
  if (!data) {
    return {};
  }

  const canonical = `https://wolf-cha.com/models/${data.key}`;
  const title = `${data.displayName} AI in Werewolf — Personality & Play Style | Wolfcha`;

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

// Comparison Page Component
function ModelComparisonPage({ data }: { data: NonNullable<ReturnType<typeof getModelComparisonData>> }) {
  const canonical = `https://wolf-cha.com/models/${data.key}`;
  
  return (
    <MarketingPageWrapper>
      <JsonLd id={`faq-jsonld-${data.key}`} data={buildFaqJsonLd({ url: canonical, items: data.faqs })} />
      <JsonLd
        id={`comparison-jsonld-${data.key}`}
        data={buildComparisonJsonLd({
          url: canonical,
          modelA: data.modelA.name,
          modelB: data.modelB.name,
          description: data.heroDescription,
        })}
      />

      <LandingHero
        title={data.title}
        subtitle={data.tagline}
        description={data.heroDescription}
        primaryCta={{ href: "/", label: "Play now — free" }}
        secondaryCta={{ href: "/ai-models", label: "All AI models" }}
      />

      {/* Model Overview Cards */}
      <LandingSection
        id="models-overview"
        title="The contenders"
        subtitle="Two AI models with distinct approaches to Werewolf."
      >
        <div className="grid gap-6 lg:grid-cols-2">
          {[data.modelA, data.modelB].map((model) => (
            <Link
              key={model.key}
              href={`/models/${model.key}`}
              className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6 transition-colors hover:bg-[var(--bg-hover)]"
            >
              <div className="flex items-center gap-4">
                <Image src={model.logo} alt={model.name} width={48} height={48} />
                <div>
                  <div className="text-xl font-bold text-[var(--text-primary)]">{model.name}</div>
                  <div className="text-sm text-[var(--text-muted)]">{model.company}</div>
                </div>
              </div>
              <div className="mt-4 text-sm font-medium text-[var(--color-gold)]">{model.style}</div>
              <div className="mt-4">
                <div className="text-xs font-semibold uppercase text-[var(--text-muted)]">Strengths</div>
                <ul className="mt-2 space-y-1">
                  {model.strengths.map((s) => (
                    <li key={s} className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                      <span className="text-green-500">✓</span> {s}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-4">
                <div className="text-xs font-semibold uppercase text-[var(--text-muted)]">Best roles</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {model.bestRoles.map((role) => (
                    <span
                      key={role}
                      className="rounded-full bg-[var(--bg-secondary)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)]"
                    >
                      {role}
                    </span>
                  ))}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </LandingSection>

      {/* Comparison Table */}
      <LandingSection
        id="comparison"
        title="Head-to-head comparison"
        subtitle="How they differ across key dimensions."
      >
        <div className="overflow-x-auto rounded-xl border border-[var(--border-color)]">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--border-color)] bg-[var(--bg-secondary)]">
              <tr>
                <th className="px-4 py-3 font-semibold text-[var(--text-primary)]">Trait</th>
                <th className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Image src={data.modelA.logo} alt={data.modelA.name} width={20} height={20} />
                    <span className="font-semibold text-[var(--text-primary)]">{data.modelA.name}</span>
                  </div>
                </th>
                <th className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Image src={data.modelB.logo} alt={data.modelB.name} width={20} height={20} />
                    <span className="font-semibold text-[var(--text-primary)]">{data.modelB.name}</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-color)] bg-[var(--bg-card)]">
              {data.comparisonTable.map((row) => (
                <tr key={row.trait}>
                  <td className="px-4 py-3 font-medium text-[var(--text-primary)]">{row.trait}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{row.modelA}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{row.modelB}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </LandingSection>

      {/* Same Scenario Dialogues */}
      <LandingSection
        id="same-scenario"
        title="Same scenario, different responses"
        subtitle="See how each model reacts to identical situations."
      >
        <LandingDialogueExamples examples={data.sameScenarioDialogues} />
      </LandingSection>

      {/* Verdict */}
      <LandingSection
        id="verdict"
        title="Which should you choose?"
        subtitle="Recommendations based on your playstyle."
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6">
            <div className="flex items-center gap-3">
              <Image src={data.modelA.logo} alt={data.modelA.name} width={32} height={32} />
              <div className="text-lg font-bold text-[var(--text-primary)]">Choose {data.modelA.name} if...</div>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-[var(--text-secondary)]">{data.verdict.pickA}</p>
          </div>
          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6">
            <div className="flex items-center gap-3">
              <Image src={data.modelB.logo} alt={data.modelB.name} width={32} height={32} />
              <div className="text-lg font-bold text-[var(--text-primary)]">Choose {data.modelB.name} if...</div>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-[var(--text-secondary)]">{data.verdict.pickB}</p>
          </div>
        </div>
        <div className="mt-6 rounded-xl border border-[var(--color-gold)] bg-[var(--glass-bg)] p-6">
          <div className="text-lg font-bold text-[var(--color-gold)]">The bottom line</div>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">{data.verdict.summary}</p>
        </div>
      </LandingSection>

      {/* FAQ */}
      <LandingSection
        id="faq"
        title="Frequently asked questions"
        subtitle={`Common questions about ${data.modelA.name} vs ${data.modelB.name}.`}
      >
        <LandingFaq items={data.faqs} />
      </LandingSection>

      {/* Related Links */}
      <LandingSection id="related" title="Explore more" subtitle="Individual model profiles and other comparisons.">
        <div className="grid gap-10 lg:grid-cols-2">
          <LandingRelatedLinks title="Hub pages" links={data.related.hub} />
          <LandingRelatedLinks title="Other models" links={data.related.models} />
        </div>
      </LandingSection>

      <LandingCta
        title="See these models compete"
        description={`Start a game and watch ${data.modelA.name} and ${data.modelB.name} argue, bluff, and deduce in real-time.`}
        primary={{ href: "/", label: "Play now — free" }}
        secondary={{ href: "/ai-models", label: "Compare all models" }}
      />
    </MarketingPageWrapper>
  );
}

// Single Model Page Component
function SingleModelPage({ data }: { data: NonNullable<ReturnType<typeof getModelLandingData>> }) {
  const canonical = `https://wolf-cha.com/models/${data.key}`;
  const relatedHub = data.related.hub;
  const relatedModels = data.related.models.filter((l) => l.href !== `/models/${data.key}`);

  return (
    <MarketingPageWrapper>
      <JsonLd id={`faq-jsonld-${data.key}`} data={buildFaqJsonLd({ url: canonical, items: data.faqs })} />
      <JsonLd
        id={`software-jsonld-${data.key}`}
        data={buildSoftwareAppJsonLd({
          url: canonical,
          name: data.displayName,
          description: data.heroDescription,
        })}
      />

      <LandingHero
        title={`${data.displayName} in AI Werewolf`}
        subtitle={data.tagline}
        description={data.heroDescription}
        primaryCta={{ href: "/", label: "Play now — free" }}
        secondaryCta={{ href: "/ai-models", label: "All AI models" }}
        image={{ src: data.logo, alt: `${data.displayName} logo` }}
      />

      <LandingSection
        id="personality"
        title="Personality profile"
        subtitle={`How ${data.displayName} approaches social deduction games.`}
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6">
            <div className="flex items-center gap-3">
              <Image src={data.logo} alt={data.displayName} width={40} height={40} />
              <div>
                <div className="text-lg font-bold text-[var(--text-primary)]">{data.displayName}</div>
                <div className="text-sm text-[var(--text-secondary)]">{data.company}</div>
              </div>
            </div>
            <div className="mt-5 space-y-4">
              {data.personalityTraits.map((trait) => (
                <div key={trait.trait}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-[var(--text-primary)]">{trait.trait}</span>
                    <span className="text-[var(--text-muted)]">{trait.strength}/5</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--bg-secondary)]">
                    <div
                      className="h-full rounded-full bg-[var(--color-gold)]"
                      style={{ width: `${(trait.strength / 5) * 100}%` }}
                    />
                  </div>
                  <div className="mt-1 text-xs text-[var(--text-muted)]">{trait.description}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6">
              <div className="text-lg font-bold text-[var(--text-primary)]">Play style</div>
              <div className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">{data.playStyle}</div>
            </div>
            <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6">
              <div className="text-lg font-bold text-[var(--text-primary)]">Recommended roles</div>
              <div className="mt-3 space-y-3">
                {data.recommendedRoles.map((rec) => (
                  <div key={rec.role} className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-gold)] text-xs font-bold text-black">
                      ★
                    </div>
                    <div>
                      <div className="text-sm font-medium text-[var(--text-primary)]">{rec.role}</div>
                      <div className="text-xs text-[var(--text-secondary)]">{rec.reason}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </LandingSection>

      <LandingSection
        id="strengths-weaknesses"
        title="Strengths & weaknesses"
        subtitle={`What makes ${data.displayName} effective—and where it struggles.`}
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6">
            <div className="flex items-center gap-2 text-lg font-bold text-green-500">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Strengths
            </div>
            <ul className="mt-4 space-y-2">
              {data.strengths.map((s) => (
                <li key={s} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />
                  {s}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6">
            <div className="flex items-center gap-2 text-lg font-bold text-red-400">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Weaknesses
            </div>
            <ul className="mt-4 space-y-2">
              {data.weaknesses.map((w) => (
                <li key={w} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
                  {w}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </LandingSection>

      <LandingSection
        id="dialogue-examples"
        title="Dialogue examples"
        subtitle={`See how ${data.displayName} communicates during actual Werewolf games.`}
      >
        <LandingDialogueExamples examples={data.dialogues} />
      </LandingSection>

      <LandingSection id="faq" title="Frequently asked questions" subtitle={`Common questions about ${data.displayName} in Wolfcha.`}>
        <LandingFaq items={data.faqs} />
      </LandingSection>

      <LandingSection id="related" title="Explore more" subtitle="Hub pages and other AI model profiles.">
        <div className="grid gap-10 lg:grid-cols-2">
          <LandingRelatedLinks title="Hub pages" links={relatedHub} />
          <LandingRelatedLinks title="Other models" links={relatedModels.slice(0, 6)} />
        </div>
      </LandingSection>

      <LandingCta
        title={`Ready to play against ${data.displayName}?`}
        description="Start a game and see how this AI model reasons, argues, and plays Werewolf."
        primary={{ href: "/", label: "Play now — free" }}
        secondary={{ href: "/ai-models", label: "Compare all models" }}
      />
    </MarketingPageWrapper>
  );
}

export default async function ModelPage({
  params,
}: {
  params: Promise<{ model: string }>;
}) {
  const { model } = await params;
  
  // Check if it's a comparison page first
  const comparisonData = getModelComparisonData(model);
  if (comparisonData) {
    return <ModelComparisonPage data={comparisonData} />;
  }
  
  // Then check for single model page
  const modelData = getModelLandingData(model);
  if (modelData) {
    return <SingleModelPage data={modelData} />;
  }

  notFound();
}
