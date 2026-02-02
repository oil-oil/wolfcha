import { MetadataRoute } from "next";
import { roleLandingKeys } from "@/components/seo/landing/roleLandingData";
import { soloLandingKeys } from "@/components/seo/landing/soloLandingData";
import { modelLandingKeys } from "@/components/seo/landing/modelLandingData";
import { modelComparisonKeys } from "@/components/seo/landing/modelComparisonData";
import { experienceLandingKeys } from "@/components/seo/landing/experienceLandingData";
import { gameComparisonKeys } from "@/components/seo/landing/gameComparisonData";

// Guide pages for SEO (18 individual guides + index)
const guidePages = [
  "", // guides index
  "werewolf-rules",
  "werewolf-night-phase",
  "werewolf-day-phase",
  "werewolf-for-beginners",
  "seer-strategy",
  "witch-strategy",
  "hunter-strategy",
  "guard-strategy",
  "how-to-win-as-werewolf",
  "how-to-win-as-villager",
  "common-werewolf-mistakes",
  "how-to-spot-a-liar",
  "how-to-bluff",
  "how-to-build-trust",
  "how-to-control-the-vote",
  "werewolf-vs-mafia",
  "social-deduction-games",
  "how-to-play-werewolf-with-ai",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://wolf-cha.com";
  const lastModified = new Date();

  return [
    // Home
    {
      url: baseUrl,
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${baseUrl}/landing`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.95,
    },
    // Hub pages
    {
      url: `${baseUrl}/ai-werewolf`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/how-to-play`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.85,
    },
    {
      url: `${baseUrl}/ai-models`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/features`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    // Roles index page
    {
      url: `${baseUrl}/roles`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    // Role landing pages (5)
    ...roleLandingKeys.map((role) => ({
      url: `${baseUrl}/roles/${role}`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.75,
    })),
    // Guide pages (19)
    ...guidePages.map((guide) => ({
      url: guide ? `${baseUrl}/guides/${guide}` : `${baseUrl}/guides`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: guide ? 0.7 : 0.8,
    })),
    // Solo landing pages (10)
    ...soloLandingKeys.map((slug) => ({
      url: `${baseUrl}/${slug}`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.75,
    })),
    // Model landing pages (10)
    ...modelLandingKeys.map((model) => ({
      url: `${baseUrl}/models/${model}`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    // Model comparison pages (10)
    ...modelComparisonKeys.map((comparison) => ({
      url: `${baseUrl}/models/${comparison}`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.65,
    })),
    // Experience landing pages (8)
    ...experienceLandingKeys.map((slug) => ({
      url: `${baseUrl}/${slug}`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    // Game comparison pages (8)
    ...gameComparisonKeys.map((slug) => ({
      url: `${baseUrl}/${slug}`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.65,
    })),
  ];
}
