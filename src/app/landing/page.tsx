import type { Metadata } from "next";
import { LandingContent } from "./LandingContent";
import {
  JsonLd,
  getGameJsonLd,
  getWebsiteJsonLd,
  getFAQJsonLd,
  getHowToJsonLd,
} from "@/components/seo/JsonLd";

export const metadata: Metadata = {
  title: "Wolfcha - AI Werewolf Game | AI狼人杀 | Play Werewolf with AI Online",
  description:
    "Play Werewolf with AI opponents online for free. The ultimate single-player social deduction game featuring DeepSeek, Qwen, Kimi & Gemini AI models with voice acting. 免费在线AI狼人杀游戏，一个人也能玩！",
  keywords: [
    "AI werewolf",
    "AI werewolf game",
    "play werewolf alone",
    "single player werewolf",
    "werewolf game online",
    "AI mafia game",
    "social deduction game",
    "LLM werewolf",
    "werewolf with AI",
    "AI狼人杀",
    "狼人杀游戏",
    "单人狼人杀",
    "在线狼人杀",
    "AI狼人杀游戏",
    "一个人玩狼人杀",
    "免费狼人杀",
    "狼人杀单机",
    "AI对战狼人杀",
    "大模型狼人杀",
    "DeepSeek狼人杀",
    "Qwen狼人杀",
  ],
  alternates: {
    canonical: "https://wolf-cha.com/landing",
    languages: {
      "en": "https://wolf-cha.com/landing",
      "zh-CN": "https://wolf-cha.com/landing",
    },
  },
  openGraph: {
    title: "Wolfcha - AI Werewolf Game | AI狼人杀",
    description:
      "Play Werewolf with AI opponents. Single-player social deduction with DeepSeek, Qwen, Kimi & Gemini. 免费AI狼人杀，一个人也能玩！",
    url: "https://wolf-cha.com/landing",
    siteName: "Wolfcha",
    locale: "en_US",
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
  twitter: {
    card: "summary_large_image",
    title: "Wolfcha - AI Werewolf Game | AI狼人杀",
    description:
      "Play Werewolf with AI opponents. Single-player social deduction game. 免费AI狼人杀！",
    images: ["https://wolf-cha.com/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function LandingPage() {
  return (
    <>
      <JsonLd data={getGameJsonLd()} />
      <JsonLd data={getWebsiteJsonLd()} />
      <JsonLd data={getFAQJsonLd()} />
      <JsonLd data={getHowToJsonLd()} />
      <LandingContent />
    </>
  );
}
