[English](./README.md) | [简体中文](./README.zh.md)

# Wolfcha

<div align="center">
  <img src="public/logo.png" alt="Wolfcha Logo" width="240" />
  <h3>Play Werewolf with AI — a full table, no party required</h3>
  <p>
    <a href="https://wolf-cha.com">Play Online (wolf-cha.com)</a>
  </p>
</div>

## 🙏 Sponsors

![TokenDance Banner](public/sponsor/tokendance.svg)

Current sponsors:

*   [TokenDance](https://tokendance.agent-universe.cn/) - Powers the core game flow, roleplay, and summary features
*   [Dashscope](https://bailian.console.aliyun.com/) - Provides AI capability support
*   [Watcha](https://watcha.cn/) - Provides AI capability and showcase platform support

---

> **Note**: This project was born at the **"Watcha + ModelScope Global Hackathon"** as an AI-native game.
> 
> "Wolfcha" combines Wolf (Werewolf) + Cha (猹, a character from Chinese literature). It's a nod to the hackathon host while also capturing the fun of watching AI characters interact — like spectating a show.

## 📖 Background

After graduating, getting 8-12 people together for a proper Werewolf game became nearly impossible. While Werewolf is fundamentally a social game, its core appeal — logical deduction, verbal sparring, and reading between the lines — remains captivating even without the social element.

To enjoy Werewolf anytime, anywhere, we built this **AI-powered version**. As the name suggests, every player except you (Seer, Witch, Hunter, Guard, Werewolves, etc.) is controlled by AI.

## ✨ Core Features

### 1. Dual-Layer AI Roleplay
Thanks to the growing context windows and instruction-following capabilities of large language models (LLMs), we've implemented a sophisticated dual-layer roleplay system:
*   **Layer 1**: The AI plays a "virtual player" with a unique personality and background.
*   **Layer 2**: This virtual player then takes on a Werewolf role (e.g., Seer) and speaks, bluffs, and reasons based on the game state.

Every conversation is generated in real-time, full of unpredictability and fun.

### 2. AI Opponents That Actually Play
**This is Werewolf you can play alone, with a full table of AI players.**

Each AI player has a stable personality, role perspective, memory, and faction goal. They follow speeches, vote history, deaths, and pressure at the table, then decide whether to accuse, defend, bluff, follow, or hold back.

### 3. Immersive Retro Experience
While we don't have a professional art team, we've crafted a polished UI/UX:
*   **Retro Design Style**: Clean layouts with vintage color palettes.
*   **Dynamic Interactions**:
    *   Eye-blink transitions for day/night changes.
    *   Character lip-sync animations during speech.
    *   Unique character portraits for special roles during night actions.

## 🧭 Roadmap

We're continuing to improve:
*   **Mobile Optimization**: Play seamlessly on any device.
*   **Flexible Player Count**: Support 8-12 player custom games.
*   **Post-Game Review / Chat**: Reflect on strategies and memorable moments.
*   **Special Abilities**: Unique mechanics like time rewind and AI insight.
*   **Smarter AI Players**: Richer memory, stronger bluffing, and more varied table behavior.
*   **Multiplayer Mode**: Play with friends alongside AI characters.
*   **Character Ratings**: Upvote standout AI personalities to find the most convincing Werewolf players.

## 🛠️ Tech Stack

Built with modern web technologies:

*   **Framework**: [Next.js 16](https://nextjs.org/) (App Router)
*   **Language**: [TypeScript](https://www.typescriptlang.org/)
*   **Styling**: [Tailwind CSS 4](https://tailwindcss.com/)
*   **UI Components**: [Radix UI](https://www.radix-ui.com/), [Lucide React](https://lucide.dev/)
*   **State Management**: [Jotai](https://jotai.org/) 
*   **Editor**: [Tiptap](https://tiptap.dev/) (For rich text interactions)
*   **Animations**: [Framer Motion](https://www.framer.com/motion/)
*   **Avatar Generation**: [DiceBear](https://www.dicebear.com/) (Notionists style)
*   **AI Integration**: [TokenDance](https://tokendance.agent-universe.cn/) (Unified interface for LLMs)

## 🚀 Local Development

To run this project locally:

1.  **Clone the repository**

```bash
git clone https://github.com/oil-oil/wolfcha.git
cd wolfcha
```

2.  **Install dependencies**

```bash
# Using pnpm (recommended)
pnpm install

# Or using npm
npm install
```

3.  **Configure environment variables**

You'll need to set up API keys (TokenDance, etc.) for full functionality. Refer to `.env.example` and create your `.env.local`.

4.  **Start the development server**

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📄 License

MIT
