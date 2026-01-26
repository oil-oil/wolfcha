import Script from "next/script";

interface JsonLdProps {
  data: object;
}

export function JsonLd({ data }: JsonLdProps) {
  return (
    <Script
      id="json-ld"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
      strategy="afterInteractive"
    />
  );
}

export function getGameJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "VideoGame",
    name: "Wolfcha - AI Werewolf Game",
    alternateName: ["AI Werewolf", "猹杀", "AI狼人杀"],
    description:
      "Play Werewolf with AI opponents. A single-player social deduction game featuring multiple AI models including DeepSeek, Qwen, Kimi, and Gemini. Experience immersive gameplay with voice acting and strategic reasoning.",
    url: "https://wolf-cha.com",
    image: "https://wolf-cha.com/og-image.png",
    genre: ["Social Deduction", "Strategy", "Party Game", "AI Game"],
    gamePlatform: ["Web Browser", "Mobile Browser"],
    applicationCategory: "Game",
    operatingSystem: "Any",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
    },
    author: {
      "@type": "Organization",
      name: "Wolfcha Team",
      url: "https://wolf-cha.com",
    },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.8",
      ratingCount: "150",
      bestRating: "5",
      worstRating: "1",
    },
    keywords:
      "AI werewolf, werewolf game online, play werewolf alone, single player werewolf, AI mafia game, LLM werewolf, social deduction game",
    inLanguage: ["en", "zh-CN"],
    numberOfPlayers: {
      "@type": "QuantitativeValue",
      minValue: 1,
      maxValue: 1,
    },
    playMode: "SinglePlayer",
  };
}

export function getWebsiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Wolfcha",
    alternateName: "AI Werewolf Game",
    url: "https://wolf-cha.com",
    description:
      "Play Werewolf with AI - The ultimate single-player social deduction experience powered by cutting-edge AI models.",
    potentialAction: {
      "@type": "PlayAction",
      target: "https://wolf-cha.com",
      name: "Play AI Werewolf",
    },
  };
}

export function getOrganizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Wolfcha",
    url: "https://wolf-cha.com",
    logo: "https://wolf-cha.com/logo.png",
    sameAs: ["https://github.com/oil-oil/wolfcha"],
    contactPoint: {
      "@type": "ContactPoint",
      email: "contact@wolf-cha.com",
      contactType: "customer support",
    },
  };
}

export function getFAQJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "What is AI Werewolf?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "AI Werewolf is a single-player version of the classic Werewolf (Mafia) social deduction game where you play against AI opponents powered by advanced language models like DeepSeek, Qwen, Kimi, and Gemini.",
        },
      },
      {
        "@type": "Question",
        name: "Can I play Werewolf alone?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes! Wolfcha allows you to play Werewolf completely solo. All other players are controlled by different AI models, each with unique personalities and strategies.",
        },
      },
      {
        "@type": "Question",
        name: "Which AI models are used in the game?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Wolfcha features multiple AI models including DeepSeek V3.2, Qwen3-235B, Kimi K2, Gemini 3 Flash, and ByteDance Seed 1.8. Each model brings different reasoning styles to the game.",
        },
      },
      {
        "@type": "Question",
        name: "Is Wolfcha free to play?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes, Wolfcha is free to play. You can start playing immediately by visiting wolf-cha.com.",
        },
      },
      {
        "@type": "Question",
        name: "What roles are available in the game?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "The game includes classic Werewolf roles: Werewolf, Seer, Witch, Hunter, Guard, and Villager. Role composition varies based on player count (8-12 players).",
        },
      },
    ],
  };
}

export function getHowToJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to Play AI Werewolf",
    description:
      "Learn how to play Werewolf with AI opponents in this single-player social deduction game.",
    image: "https://wolf-cha.com/og-image.png",
    totalTime: "PT15M",
    step: [
      {
        "@type": "HowToStep",
        name: "Enter Your Name",
        text: "Visit wolf-cha.com and enter your player name to begin.",
        position: 1,
      },
      {
        "@type": "HowToStep",
        name: "Choose Game Settings",
        text: "Select player count (8-12), difficulty level, and sound preferences.",
        position: 2,
      },
      {
        "@type": "HowToStep",
        name: "Receive Your Role",
        text: "You'll be assigned a random role: Werewolf, Seer, Witch, Hunter, Guard, or Villager.",
        position: 3,
      },
      {
        "@type": "HowToStep",
        name: "Play Night Phase",
        text: "Use your role abilities during the night phase. Werewolves kill, Seer checks, Witch uses potions, Guard protects.",
        position: 4,
      },
      {
        "@type": "HowToStep",
        name: "Day Discussion",
        text: "Discuss with AI players, share information, and identify suspicious behavior.",
        position: 5,
      },
      {
        "@type": "HowToStep",
        name: "Vote",
        text: "Vote to eliminate a suspected werewolf. The player with most votes is eliminated.",
        position: 6,
      },
      {
        "@type": "HowToStep",
        name: "Win the Game",
        text: "Villagers win by eliminating all werewolves. Werewolves win when they equal or outnumber villagers.",
        position: 7,
      },
    ],
  };
}
