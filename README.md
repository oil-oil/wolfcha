<p align="right"><a href="./README.zh.md">简体中文</a></p>

![Wolfcha — Play Werewolf solo](assets/readme/hero-en.png)

<p align="center">
  <strong>You take one seat. AI players fill the rest.</strong><br />
  An AI-native Werewolf game for deduction, bluffing, and chaos on demand.
</p>

<p align="center">
  <a href="https://wolf-cha.com"><strong>Play online</strong></a>
  ·
  <a href="#local-development">Run locally</a>
  ·
  <a href="./README.zh.md">中文说明</a>
</p>

## One human. A table that talks back.

Wolfcha recreates the part of Werewolf that is hardest to schedule: a complete table of distinct players. Choose your role, enter an 8–12 seat game, and let the AI handle every other personality, secret, accusation, and vote.

| Characters first | Table-aware memory | Decisions with intent |
| --- | --- | --- |
| Each AI has a stable personality layered over a hidden game role. | Players follow speeches, votes, deaths, and changing suspicions. | They accuse, defend, bluff, follow, or hold back according to their faction goal. |

## What happens at the table

1. **Night falls** — Werewolves choose a target while special roles act on private information.
2. **The table speaks** — Every surviving player explains, suspects, misdirects, or pushes a read.
3. **Everyone votes** — The group turns conversation into a decision.
4. **The story changes** — New deaths and revealed information reshape the next round.

You can play as **Villager, Werewolf, White Wolf King, Seer, Witch, Hunter, Guard, or Idiot**. Conversations are generated in real time, so the same setup can produce a very different table.

## Built for atmosphere

- Retro visual direction with day/night eye-blink transitions.
- Lip-sync animation while characters speak.
- Dedicated role artwork for night actions.
- Optional AI voice playback and spectator mode.

## Project origin

Wolfcha was created at the **Watcha × ModelScope Global Hackathon**. The name combines **Wolf** with **Cha (猹)** — part Werewolf, part spectator watching a table of AI personalities collide.

## Local development

Requirements: Node.js and [pnpm](https://pnpm.io/).

```bash
git clone https://github.com/oil-oil/wolfcha.git
cd wolfcha
pnpm install
cp .env.example .env.local
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). Configure the providers you need in `.env.local`; the available variables are documented in [`.env.example`](./.env.example).

## Tech stack

[Next.js 16](https://nextjs.org/) · [TypeScript](https://www.typescriptlang.org/) · [Tailwind CSS 4](https://tailwindcss.com/) · [Jotai](https://jotai.org/) · [Radix UI](https://www.radix-ui.com/) · [Framer Motion](https://www.framer.com/motion/) · [Tiptap](https://tiptap.dev/)

## Sponsors

![TokenDance](public/sponsor/tokendance.svg)

- [TokenDance](https://tokendance.agent-universe.cn/) — core game flow, roleplay, and summaries
- [DashScope](https://bailian.console.aliyun.com/) — AI capability support
- [Watcha](https://watcha.cn/) — AI capability and showcase platform support

## Roadmap

- Better mobile play
- Post-game review and free chat
- Richer memory, bluffing, and table behavior
- Special mechanics such as time rewind and AI insight
- Multiplayer with friends and AI players
- Community ratings for standout AI personalities

## License

[MIT](./LICENSE)
