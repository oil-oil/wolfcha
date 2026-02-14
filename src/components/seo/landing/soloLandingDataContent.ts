import type { SoloLandingData, SoloLandingKey } from "./soloLandingData";
import { baseSeats, hubLinks, soloClusterLinks } from "./soloLandingData";

export const soloLandingDataByKey: Record<SoloLandingKey, SoloLandingData> = {
  "play-werewolf-alone": {
    key: "play-werewolf-alone",
    slug: "play-werewolf-alone",
    title: "Play Werewolf Alone",
    tagline: "No party required. Just you and 11 AI opponents.",
    heroDescription:
      "Want to play Werewolf but don't have a group? Wolfcha lets you experience the full social deduction game solo. Every other seat at the table is an AI opponent with a distinct personality, reasoning style, and agenda. Start a game in seconds—no scheduling, no waiting.",
    problemsSolved: [
      "No friends available to play right now",
      "Can't gather enough people for a full game (8–12 players)",
      "Different time zones make scheduling impossible",
      "Want to practice strategies before playing with humans",
      "Just want a quick game without social coordination",
    ],
    howItWorks: [
      { step: "Open Wolfcha", description: "No download, no account required. Works in any modern browser." },
      { step: "Choose your settings", description: "Pick game speed, voice acting preferences, and role distribution." },
      { step: "Get assigned a role", description: "You might be a Villager, Werewolf, Seer, Witch, Hunter, or Guard." },
      { step: "Play day and night phases", description: "Discuss, vote, and use abilities just like a real game." },
      { step: "Win or learn", description: "Every game is a complete experience with winners and losers." },
    ],
    uniqueFeatures: [
      { title: "Real AI reasoning", description: "Each AI opponent uses a different large language model with unique personality traits." },
      { title: "Full voice acting", description: "Optional narrator and character voices bring the game to life." },
      { title: "Authentic game flow", description: "Night actions, day discussions, voting, and eliminations—just like tabletop." },
      { title: "No waiting", description: "Games start instantly. No lobby, no matchmaking queue." },
    ],
    comparisonTable: [
      { feature: "Players needed", traditional: "8–12 humans", wolfcha: "Just you" },
      { feature: "Setup time", traditional: "10–30 minutes", wolfcha: "30 seconds" },
      { feature: "Scheduling", traditional: "Coordinate calendars", wolfcha: "Play anytime" },
      { feature: "Game length", traditional: "30–60 minutes", wolfcha: "15–30 minutes" },
      { feature: "Learning curve", traditional: "Need patient friends", wolfcha: "Practice vs AI" },
    ],
    seats: baseSeats,
    dialogues: [
      {
        title: "Day 1: AI players debate suspicions",
        subtitle: "Watch how different AI personalities approach the same evidence.",
        lines: [
          { speaker: { seed: "alex-01", name: "Alex", modelLogo: "/models/deepseek.svg", meta: "calm" }, content: "I want to hear from everyone before we vote. Who has concrete observations?" },
          { speaker: { seed: "riley-03", name: "Riley", modelLogo: "/models/claude.svg", meta: "aggressive" }, content: "Morgan was too quiet. That's suspicious. In my experience, wolves hide early." },
          { speaker: { seed: "morgan-02", name: "Morgan", modelLogo: "/models/gemini.svg", meta: "defensive" }, content: "I was observing, not hiding. Being loud Day 1 with no info is just noise." },
          { speaker: { seed: "jamie-05", name: "Jamie", modelLogo: "/models/kimi.svg", meta: "mediator" }, content: "Let's not rush. What matters is who contradicts themselves later." },
        ],
      },
      {
        title: "Late game: A critical vote",
        subtitle: "When it's down to the wire, every argument matters.",
        lines: [
          { speaker: { seed: "taylor-04", name: "Taylor", modelLogo: "/models/qwen.svg", meta: "analytical" }, content: "If we vote wrong today, wolves win. We need to trace back every claim." },
          { speaker: { seed: "casey-06", name: "Casey", modelLogo: "/models/deepseek.svg", meta: "logic" }, content: "Drew's story changed after the Seer reveal. That's the clearest signal." },
          { speaker: { seed: "drew-09", name: "Drew", modelLogo: "/models/openai.svg", meta: "persuasive" }, content: "I updated based on new information. That's rational, not suspicious." },
        ],
      },
    ],
    faqs: [
      { question: "Is playing Werewolf alone actually fun?", answer: "Yes! The AI opponents have distinct personalities and reasoning styles. They argue, form alliances, and make mistakes—just like human players." },
      { question: "How long does a solo game take?", answer: "Typically 15–30 minutes depending on your reading speed and game settings." },
      { question: "Do I need to create an account?", answer: "No account required. You can start playing immediately." },
      { question: "Can I choose my role?", answer: "Roles are assigned randomly to maintain game balance and surprise." },
      { question: "What if I don't know the rules?", answer: "Wolfcha includes guidance and the AI narrator helps you through each phase." },
      { question: "Is it free to play?", answer: "Yes, basic play is free." },
    ],
    related: { hub: hubLinks, cluster: soloClusterLinks.filter((l) => l.href !== "/play-werewolf-alone") },
  },

  "play-werewolf-with-ai": {
    key: "play-werewolf-with-ai",
    slug: "play-werewolf-with-ai",
    title: "Play Werewolf with AI",
    tagline: "AI opponents that actually think, argue, and bluff.",
    heroDescription:
      "Wolfcha puts you at a table with AI players powered by state-of-the-art language models. Each AI has a unique personality—some are aggressive accusers, others are careful analysts, and some are skilled manipulators. Experience Werewolf with opponents who actually reason.",
    problemsSolved: [
      "Human players can be unpredictable or frustrating",
      "Want consistent, challenging opponents",
      "Curious how AI handles social deduction",
      "Need practice partners always available",
      "Interested in comparing AI reasoning styles",
    ],
    howItWorks: [
      { step: "Launch a game", description: "Click Play and you're in. No setup required." },
      { step: "Meet your AI opponents", description: "Each seat is filled by an AI with a name, avatar, and personality." },
      { step: "Play through phases", description: "Night actions → Day discussion → Voting → Elimination." },
      { step: "Read the room", description: "AI players form opinions, change their minds, and coordinate." },
      { step: "Discover who wins", description: "Villagers or Werewolves—the better strategy prevails." },
    ],
    uniqueFeatures: [
      { title: "Multiple AI models", description: "DeepSeek, Gemini, Qwen, Claude, and more—each with different reasoning." },
      { title: "Personality system", description: "AI players are calm, aggressive, empathetic, skeptical, or any mix." },
      { title: "Adaptive difficulty", description: "AI opponents adjust to game state and player behavior." },
      { title: "Transparent reasoning", description: "Watch AI players explain their logic in natural dialogue." },
    ],
    comparisonTable: [
      { feature: "Opponent quality", traditional: "Varies by group", wolfcha: "Consistently challenging" },
      { feature: "Availability", traditional: "When friends are free", wolfcha: "24/7" },
      { feature: "Toxicity", traditional: "Sometimes", wolfcha: "Never" },
      { feature: "Learning opportunity", traditional: "Limited feedback", wolfcha: "See AI reasoning" },
      { feature: "Game variety", traditional: "Same group dynamics", wolfcha: "Different AI each game" },
    ],
    seats: baseSeats,
    dialogues: [
      {
        title: "Different AI models, different approaches",
        subtitle: "See how various models interpret the same situation.",
        lines: [
          { speaker: { seed: "casey-06", name: "Casey", modelLogo: "/models/deepseek.svg", meta: "analytical" }, content: "Based on voting patterns, there's high probability the wolves are in seats 3, 7, or 9." },
          { speaker: { seed: "jamie-05", name: "Jamie", modelLogo: "/models/kimi.svg", meta: "intuitive" }, content: "Numbers aside, Morgan's tone changed after the accusation. That tells me something." },
          { speaker: { seed: "drew-09", name: "Drew", modelLogo: "/models/openai.svg", meta: "narrative" }, content: "Let's step back. Who benefits if we vote Casey today? That's the real question." },
        ],
      },
      {
        title: "AI coordination (or lack thereof)",
        subtitle: "Wolves trying to coordinate without revealing themselves.",
        lines: [
          { speaker: { seed: "riley-03", name: "Riley", modelLogo: "/models/claude.svg", meta: "wolf" }, content: "I think we should focus on Taylor. The Seer claim was too convenient." },
          { speaker: { seed: "skyler-07", name: "Skyler", modelLogo: "/models/glm.svg", meta: "wolf" }, content: "Agreed. Taylor's timing was suspicious. I'm voting that way." },
          { speaker: { seed: "quinn-08", name: "Quinn", modelLogo: "/models/bytedance.svg", meta: "villager" }, content: "Wait—Riley and Skyler agreeing this fast? That's unusual." },
        ],
      },
    ],
    faqs: [
      { question: "Which AI models power the opponents?", answer: "Wolfcha uses DeepSeek, Gemini, Qwen, Claude, and others. Each model brings different reasoning patterns." },
      { question: "Can AI opponents actually bluff?", answer: "Yes! AI wolves will claim innocent roles, misdirect suspicion, and coordinate eliminations." },
      { question: "How do AI personalities work?", answer: "Each AI is assigned traits like calm, aggressive, empathetic. These influence how they communicate and vote." },
      { question: "Do AI players remember previous games?", answer: "Each game is independent. AI players don't remember past games." },
      { question: "Can I see what the AI is thinking?", answer: "AI reasoning is expressed through natural dialogue in real-time." },
      { question: "Is the AI too easy or too hard?", answer: "The AI is designed to be challenging but beatable." },
    ],
    related: { hub: hubLinks, cluster: soloClusterLinks.filter((l) => l.href !== "/play-werewolf-with-ai") },
  },

  "werewolf-game-with-ai-opponents": {
    key: "werewolf-game-with-ai-opponents",
    slug: "werewolf-game-with-ai-opponents",
    title: "Werewolf Game with AI Opponents",
    tagline: "A full table of intelligent adversaries, ready when you are.",
    heroDescription:
      "Experience the classic Werewolf (Mafia) game against 11 AI opponents. Each opponent has unique reasoning patterns, communication styles, and strategic tendencies. No human coordination needed—just open Wolfcha and start playing.",
    problemsSolved: [
      "Need 8–12 players for a proper game",
      "Human players cancel or flake",
      "Game nights are hard to schedule",
      "Want to play at unusual hours",
      "Prefer consistent challenge over social drama",
    ],
    howItWorks: [
      { step: "Open the game", description: "Browser-based, instant load, no installation." },
      { step: "Configure your match", description: "Choose game speed and optional voice features." },
      { step: "Receive your role", description: "Random assignment keeps every game fresh." },
      { step: "Engage in discussion", description: "Read AI arguments, make your case, influence votes." },
      { step: "See the outcome", description: "Win or lose, learn from how the game unfolded." },
    ],
    uniqueFeatures: [
      { title: "12-player experience", description: "Full table simulation with you as one of twelve seats." },
      { title: "Diverse AI behaviors", description: "Aggressive, passive, analytical, emotional—AI opponents vary." },
      { title: "Real social deduction", description: "AI players form suspicions, alliances, and betrayals." },
      { title: "No toxic players", description: "AI opponents are challenging but never rude or unfair." },
    ],
    comparisonTable: [
      { feature: "Player count", traditional: "Need 8–12 humans", wolfcha: "Always 12 (you + 11 AI)" },
      { feature: "Game availability", traditional: "When group is free", wolfcha: "Instant, anytime" },
      { feature: "Social pressure", traditional: "Can be stressful", wolfcha: "Play at your pace" },
      { feature: "Consistency", traditional: "Varies by group", wolfcha: "Reliable AI behavior" },
      { feature: "Practice value", traditional: "Limited", wolfcha: "Excellent for skill building" },
    ],
    seats: baseSeats,
    dialogues: [
      {
        title: "Opening arguments",
        subtitle: "Day 1 with no information—pure social reads.",
        lines: [
          { speaker: { seed: "alex-01", name: "Alex", modelLogo: "/models/deepseek.svg", meta: "methodical" }, content: "Day 1 is mostly noise. Let's focus on who speaks with too much certainty." },
          { speaker: { seed: "hayden-10", name: "Hayden", modelLogo: "/models/doubao.svg", meta: "bold" }, content: "Wolves are usually quiet ones. Morgan hasn't said anything useful yet." },
          { speaker: { seed: "morgan-02", name: "Morgan", modelLogo: "/models/gemini.svg", meta: "defensive" }, content: "I'm listening and observing. Hayden seems eager to point fingers without evidence." },
        ],
      },
      {
        title: "A Seer reveal",
        subtitle: "Information enters the game and changes everything.",
        lines: [
          { speaker: { seed: "taylor-04", name: "Taylor", modelLogo: "/models/qwen.svg", meta: "claiming Seer" }, content: "I'm Seer. Night 1 I checked Riley: Werewolf. I'm asking for an immediate vote." },
          { speaker: { seed: "riley-03", name: "Riley", modelLogo: "/models/claude.svg", meta: "counter-claim" }, content: "Convenient timing. I'm actually Seer. Taylor is trying to eliminate the real info role." },
          { speaker: { seed: "quinn-08", name: "Quinn", modelLogo: "/models/bytedance.svg", meta: "analyzing" }, content: "Two Seer claims. We need check histories and vote patterns before deciding." },
        ],
      },
    ],
    faqs: [
      { question: "How many AI opponents will I face?", answer: "You play against 11 AI opponents, making a full 12-player table." },
      { question: "Are AI opponents smart enough to be challenging?", answer: "Yes. AI opponents are powered by advanced language models that can reason, bluff, and adapt." },
      { question: "Can AI opponents coordinate as wolves?", answer: "AI wolves will subtly support each other and coordinate eliminations." },
      { question: "Do AI opponents vote randomly?", answer: "No. AI votes are based on reasoning about who is most likely to be a wolf." },
      { question: "What roles can AI opponents have?", answer: "All roles: Villagers, Werewolves, Seers, Witches, Hunters, Guards." },
      { question: "How do I get better?", answer: "Pay attention to AI reasoning. Note what arguments work and what backfires." },
    ],
    related: { hub: hubLinks, cluster: soloClusterLinks.filter((l) => l.href !== "/werewolf-game-with-ai-opponents") },
  },

  "mafia-game-solo": {
    key: "mafia-game-solo",
    slug: "mafia-game-solo",
    title: "Solo Mafia Game",
    tagline: "The classic party game, playable alone.",
    heroDescription:
      "Mafia (also known as Werewolf) is one of the greatest social deduction games ever created. But gathering 8–12 people is hard. Wolfcha solves this by letting you play the full Mafia experience solo, against AI opponents who argue, bluff, and vote just like humans.",
    problemsSolved: [
      "Love Mafia but can't find players",
      "Party game with no party available",
      "Want the Mafia experience without hosting",
      "Curious about the game but have no group",
      "Miss playing Mafia and want a quick fix",
    ],
    howItWorks: [
      { step: "Load Wolfcha", description: "Works in any browser, no app download needed." },
      { step: "Start a game", description: "One click to launch a full 12-player Mafia match." },
      { step: "Get your role", description: "Mafia member, Civilian, or a special role like Detective." },
      { step: "Survive the nights", description: "Mafia kills at night; town debates and votes by day." },
      { step: "Find the truth", description: "Eliminate all Mafia or outlast the town." },
    ],
    uniqueFeatures: [
      { title: "Classic Mafia rules", description: "Town vs Mafia, night kills, day lynching—all the core mechanics." },
      { title: "Werewolf variant", description: "We use Werewolf terminology, but it's the same game Mafia fans love." },
      { title: "Special roles", description: "Detective (Seer), Doctor (Guard), and more add strategic depth." },
      { title: "AI that bluffs", description: "Mafia AI will lie, deflect, and manipulate—just like human players." },
    ],
    comparisonTable: [
      { feature: "Game type", traditional: "Party game", wolfcha: "Solo browser game" },
      { feature: "Minimum players", traditional: "8 humans", wolfcha: "1 (you)" },
      { feature: "Hosting effort", traditional: "Significant", wolfcha: "None" },
      { feature: "Rule enforcement", traditional: "Manual (moderator)", wolfcha: "Automatic" },
      { feature: "Game length", traditional: "30–90 minutes", wolfcha: "15–30 minutes" },
    ],
    seats: baseSeats,
    dialogues: [
      {
        title: "Classic Mafia discussion",
        subtitle: "The town debates who to trust.",
        lines: [
          { speaker: { seed: "drew-09", name: "Drew", modelLogo: "/models/openai.svg", meta: "townie" }, content: "Last night's kill was targeted. The Mafia went for someone vocal." },
          { speaker: { seed: "casey-06", name: "Casey", modelLogo: "/models/deepseek.svg", meta: "analytical" }, content: "Or they wanted us to think that. Random kills can look targeted in hindsight." },
          { speaker: { seed: "skyler-07", name: "Skyler", modelLogo: "/models/glm.svg", meta: "quiet" }, content: "I've been watching vote patterns. Riley switched targets twice. Why?" },
        ],
      },
      {
        title: "Mafia under pressure",
        subtitle: "A suspected Mafia member defends themselves.",
        lines: [
          { speaker: { seed: "jamie-05", name: "Jamie", modelLogo: "/models/kimi.svg", meta: "accuser" }, content: "Hayden, your defense doesn't add up. You claimed to be watching Casey." },
          { speaker: { seed: "hayden-10", name: "Hayden", modelLogo: "/models/doubao.svg", meta: "mafia" }, content: "I said I was observing Casey's behavior, not protecting them." },
          { speaker: { seed: "alex-01", name: "Alex", modelLogo: "/models/deepseek.svg", meta: "judge" }, content: "We need to decide. If Hayden flips Mafia, we're on track." },
        ],
      },
    ],
    faqs: [
      { question: "Is this the same as traditional Mafia?", answer: "Yes! Core gameplay is identical. We use Werewolf terminology, but mechanics are the same." },
      { question: "What's the difference between Mafia and Werewolf?", answer: "Same game with different themes. Mafia uses crime theme; Werewolf uses village/horror theme." },
      { question: "Can I play as Mafia?", answer: "Roles are assigned randomly. Sometimes you'll be Mafia, sometimes town." },
      { question: "How does night phase work solo?", answer: "The game handles night actions automatically and shows you results." },
      { question: "Is there a moderator?", answer: "The game acts as an automated moderator. Rules are enforced automatically." },
      { question: "Can I play with friends too?", answer: "Currently designed for solo play against AI. Multiplayer may come later." },
    ],
    related: { hub: hubLinks, cluster: soloClusterLinks.filter((l) => l.href !== "/mafia-game-solo") },
  },

  "social-deduction-game-single-player": {
    key: "social-deduction-game-single-player",
    slug: "social-deduction-game-single-player",
    title: "Single Player Social Deduction Game",
    tagline: "Deduction, bluffing, and strategy—no group required.",
    heroDescription:
      "Social deduction games like Werewolf, Mafia, and Among Us are built around reading people and managing information. Wolfcha brings this experience to single player by surrounding you with AI opponents who reason, suspect, and scheme.",
    problemsSolved: [
      "Love social deduction but play alone",
      "Among Us requires lobbies and wait times",
      "Want deep deduction without party coordination",
      "Interested in how AI handles social games",
      "Need a thinking game that's not chess or puzzles",
    ],
    howItWorks: [
      { step: "Choose Wolfcha", description: "A social deduction game designed for one player." },
      { step: "Face AI opponents", description: "11 AI players with distinct personalities and strategies." },
      { step: "Deduce and deceive", description: "Use information, voting, and discussion to win." },
      { step: "Experience the genre", description: "All the tension of multiplayer, none of the coordination." },
      { step: "Improve over time", description: "Learn patterns, refine strategy, win more games." },
    ],
    uniqueFeatures: [
      { title: "True social deduction", description: "Not a puzzle game—real AI opponents with hidden roles." },
      { title: "Information management", description: "What you reveal, when you reveal it, matters." },
      { title: "Bluffing and misdirection", description: "Deceive AI opponents just like you would humans." },
      { title: "Reading AI behavior", description: "Learn to spot AI tells and reasoning patterns." },
    ],
    comparisonTable: [
      { feature: "Genre", traditional: "Multiplayer social deduction", wolfcha: "Single player social deduction" },
      { feature: "Examples", traditional: "Among Us, Secret Hitler, Mafia", wolfcha: "Wolfcha (AI Werewolf)" },
      { feature: "Player requirement", traditional: "4–12 humans", wolfcha: "Just you" },
      { feature: "Social skill practice", traditional: "High", wolfcha: "High (vs AI)" },
      { feature: "Replayability", traditional: "Depends on group", wolfcha: "Unlimited" },
    ],
    seats: baseSeats,
    dialogues: [
      {
        title: "Information asymmetry",
        subtitle: "The core of social deduction—who knows what?",
        lines: [
          { speaker: { seed: "taylor-04", name: "Taylor", modelLogo: "/models/qwen.svg", meta: "Seer" }, content: "I have information that could change this game. But revealing too early makes me a target." },
          { speaker: { seed: "riley-03", name: "Riley", modelLogo: "/models/claude.svg", meta: "suspicious" }, content: "Vague claims like that are exactly what wolves do. Put up or shut up." },
          { speaker: { seed: "jamie-05", name: "Jamie", modelLogo: "/models/kimi.svg", meta: "supportive" }, content: "Give Taylor space. Forcing a reveal helps wolves more than town." },
        ],
      },
      {
        title: "Vote manipulation",
        subtitle: "Social deduction is about influencing collective decisions.",
        lines: [
          { speaker: { seed: "drew-09", name: "Drew", modelLogo: "/models/openai.svg", meta: "persuader" }, content: "Here's what I propose: we test Jordan today. Low info, high suspicion. Safe." },
          { speaker: { seed: "jordan-12", name: "Jordan", modelLogo: "/models/qwen.svg", meta: "defensive" }, content: "Safe for whom? If I'm town, you've wasted a day." },
          { speaker: { seed: "quinn-08", name: "Quinn", modelLogo: "/models/bytedance.svg", meta: "mediator" }, content: "Drew makes a point, but so does Jordan. We need more before voting." },
        ],
      },
    ],
    faqs: [
      { question: "What makes this a social deduction game?", answer: "Players have hidden roles with conflicting goals. Deduction, persuasion, and deception determine the winner." },
      { question: "How is this different from puzzle games?", answer: "Puzzle games have fixed solutions. Social deduction is dynamic—outcomes depend on persuasion and adapting." },
      { question: "Can AI opponents really bluff?", answer: "Yes. AI wolves lie, deflect suspicion, and coordinate kills. They play to win." },
      { question: "Is this like Among Us?", answer: "Similar genre, different format. Among Us adds action; Wolfcha is pure discussion and voting." },
      { question: "How long is a game?", answer: "15–30 minutes typically. Shorter than most multiplayer social deduction." },
      { question: "Will I get better at social deduction?", answer: "Absolutely. Playing against AI helps you recognize patterns that transfer to human games." },
    ],
    related: { hub: hubLinks, cluster: soloClusterLinks.filter((l) => l.href !== "/social-deduction-game-single-player") },
  },

  "werewolf-game-no-friends": {
    key: "werewolf-game-no-friends",
    slug: "werewolf-game-no-friends",
    title: "Werewolf Game No Friends Needed",
    tagline: "Finally play Werewolf without organizing a party.",
    heroDescription:
      "You've heard Werewolf is amazing. But you need 8–12 friends who are free at the same time, and that's impossible to arrange. Wolfcha removes the social barrier—play the complete Werewolf experience solo, against AI opponents who provide a genuine challenge.",
    problemsSolved: [
      "Don't have a gaming group",
      "Friends aren't into social deduction games",
      "Moved to a new city and lost your game night crew",
      "Introverted and prefer solo experiences",
      "Just want to play without coordination overhead",
    ],
    howItWorks: [
      { step: "Forget scheduling", description: "No group chat, no polls, no cancellations." },
      { step: "Open Wolfcha", description: "Browser-based, instant access, no barriers." },
      { step: "Play a real game", description: "11 AI opponents, full rules, authentic experience." },
      { step: "Learn and improve", description: "No judgment, no pressure, play at your own pace." },
      { step: "Enjoy whenever", description: "Morning, night, 5 minutes or 30—your choice." },
    ],
    uniqueFeatures: [
      { title: "No social overhead", description: "Skip the group chat logistics. Just play." },
      { title: "Consistent availability", description: "AI opponents never cancel or arrive late." },
      { title: "Judgment-free zone", description: "Make mistakes, learn, improve—no one judges you." },
      { title: "Complete experience", description: "Same game you'd play with friends, just with AI." },
    ],
    comparisonTable: [
      { feature: "Friends required", traditional: "8–12", wolfcha: "0" },
      { feature: "Scheduling", traditional: "Coordinate calendars", wolfcha: "None" },
      { feature: "Cancellation risk", traditional: "High", wolfcha: "Zero" },
      { feature: "Social anxiety", traditional: "Can be a factor", wolfcha: "Not applicable" },
      { feature: "Game quality", traditional: "Depends on group", wolfcha: "Consistently good" },
    ],
    seats: baseSeats,
    dialogues: [
      {
        title: "A welcoming table",
        subtitle: "AI opponents are challenging but never toxic.",
        lines: [
          { speaker: { seed: "jamie-05", name: "Jamie", modelLogo: "/models/kimi.svg", meta: "friendly" }, content: "Welcome to the game! Don't worry if you're new—we figure things out together." },
          { speaker: { seed: "alex-01", name: "Alex", modelLogo: "/models/deepseek.svg", meta: "helpful" }, content: "I'll explain my reasoning as we go. Feel free to follow along." },
          { speaker: { seed: "morgan-02", name: "Morgan", modelLogo: "/models/gemini.svg", meta: "encouraging" }, content: "Every game is a learning experience. Let's see what happens!" },
        ],
      },
      {
        title: "Competitive but fair",
        subtitle: "AI opponents play to win, but they're never mean.",
        lines: [
          { speaker: { seed: "riley-03", name: "Riley", modelLogo: "/models/claude.svg", meta: "direct" }, content: "I think you made a mistake yesterday. Your vote didn't align with your stated read." },
          { speaker: { seed: "casey-06", name: "Casey", modelLogo: "/models/deepseek.svg", meta: "analytical" }, content: "That's worth discussing. It could be a slip, or intentional misdirection." },
          { speaker: { seed: "quinn-08", name: "Quinn", modelLogo: "/models/bytedance.svg", meta: "fair" }, content: "Let's hear the explanation before we draw conclusions." },
        ],
      },
    ],
    faqs: [
      { question: "Is this really as good as playing with friends?", answer: "Different, but equally engaging. AI opponents provide consistent challenge and interesting dynamics." },
      { question: "I'm introverted—is this for me?", answer: "Absolutely. No voice chat, no video, no social pressure. Play at your own pace." },
      { question: "What if I make mistakes?", answer: "That's how you learn! AI opponents won't mock you. Every game is a fresh start." },
      { question: "Can I pause mid-game?", answer: "The game is turn-based with no time pressure. Take breaks whenever you need." },
      { question: "Will this help me play with humans later?", answer: "Yes! You'll learn the rules, develop strategies, and build confidence." },
      { question: "Is there any social interaction?", answer: "You read AI dialogue and make decisions. It feels social but doesn't require real-time human interaction." },
    ],
    related: { hub: hubLinks, cluster: soloClusterLinks.filter((l) => l.href !== "/werewolf-game-no-friends") },
  },

  "practice-werewolf-online": {
    key: "practice-werewolf-online",
    slug: "practice-werewolf-online",
    title: "Practice Werewolf Online",
    tagline: "Sharpen your skills before game night.",
    heroDescription:
      "Want to get better at Werewolf before playing with your group? Wolfcha is the perfect practice environment. Play against AI opponents who use real strategies, learn role mechanics, and develop your deduction skills—all without pressure.",
    problemsSolved: [
      "New to Werewolf and want to learn",
      "Know the rules but want to improve strategy",
      "Trying a new role and want practice",
      "Preparing for a game night or tournament",
      "Want to experiment with unconventional plays",
    ],
    howItWorks: [
      { step: "Identify your goal", description: "Learning rules? Mastering a role? Testing strategies?" },
      { step: "Play games", description: "Each 15–30 minute game gives you reps and experience." },
      { step: "Observe AI behavior", description: "Watch how effective arguments and strategies play out." },
      { step: "Try new approaches", description: "Experiment without consequences—it's practice." },
      { step: "Transfer to real games", description: "Apply what you've learned with human players." },
    ],
    uniqueFeatures: [
      { title: "No-stakes learning", description: "Make mistakes freely. No rank or reputation to protect." },
      { title: "Rapid repetition", description: "Play 10 games in a day if you want. No waiting." },
      { title: "Role-specific practice", description: "Focus on mastering Seer, Witch, or any role." },
      { title: "Strategy testing", description: "Try risky plays and see what happens." },
    ],
    comparisonTable: [
      { feature: "Learning mode", traditional: "Trial by fire", wolfcha: "Safe practice space" },
      { feature: "Feedback speed", traditional: "One game per session", wolfcha: "Many games per hour" },
      { feature: "Experimentation", traditional: "Risky (affects rep)", wolfcha: "Consequence-free" },
      { feature: "Rule clarification", traditional: "Ask friends", wolfcha: "Game enforces rules" },
      { feature: "Availability", traditional: "When group meets", wolfcha: "Always" },
    ],
    seats: baseSeats,
    dialogues: [
      {
        title: "Learning Seer reveals",
        subtitle: "Practice the timing and framing of information drops.",
        lines: [
          { speaker: { seed: "taylor-04", name: "Taylor", modelLogo: "/models/qwen.svg", meta: "practicing" }, content: "I'm going to try revealing my Seer info early today. Let's see how the table reacts." },
          { speaker: { seed: "riley-03", name: "Riley", modelLogo: "/models/claude.svg", meta: "skeptical" }, content: "Day 1 Seer claim? That's bold. You better have something concrete." },
          { speaker: { seed: "alex-01", name: "Alex", modelLogo: "/models/deepseek.svg", meta: "observing" }, content: "I'm listening. An early claim can work if the information is strong." },
        ],
      },
      {
        title: "Testing wolf strategies",
        subtitle: "What happens if you push a false accusation hard?",
        lines: [
          { speaker: { seed: "drew-09", name: "Drew", modelLogo: "/models/openai.svg", meta: "wolf practice" }, content: "I'm certain Casey is a wolf. The voting pattern is too convenient. Vote now." },
          { speaker: { seed: "casey-06", name: "Casey", modelLogo: "/models/deepseek.svg", meta: "defending" }, content: "What pattern? Show your work. Accusations without evidence are worthless." },
          { speaker: { seed: "jamie-05", name: "Jamie", modelLogo: "/models/kimi.svg", meta: "mediating" }, content: "Drew, you're pushing hard. Is this based on logic or are you rushing us?" },
        ],
      },
    ],
    faqs: [
      { question: "How does practicing here help with real games?", answer: "You'll internalize rules, develop pattern recognition, and build confidence. Skills transfer directly." },
      { question: "Can I practice specific roles?", answer: "Roles are randomly assigned, but you'll play every role eventually through repeated play." },
      { question: "How many games should I play to improve?", answer: "Even 5–10 games will noticeably improve understanding. Serious improvement comes from 50+ games." },
      { question: "Are AI opponents a good benchmark?", answer: "AI opponents use logical reasoning and strategic play. Excellent for learning fundamentals." },
      { question: "Should I focus on winning or learning?", answer: "Both. Try to win, but also experiment. The best learning happens when you understand why." },
      { question: "Is there a tutorial mode?", answer: "The game includes guidance and an optional narrator who explains the flow." },
    ],
    related: { hub: hubLinks, cluster: soloClusterLinks.filter((l) => l.href !== "/practice-werewolf-online") },
  },

  "learn-werewolf-strategy": {
    key: "learn-werewolf-strategy",
    slug: "learn-werewolf-strategy",
    title: "Learn Werewolf Strategy",
    tagline: "Master the game through AI-powered practice.",
    heroDescription:
      "Werewolf rewards strategic thinking, social awareness, and information management. Wolfcha is the best way to learn these skills—play against AI opponents who demonstrate effective strategies, then develop your own through practice.",
    problemsSolved: [
      "Know the rules but lose consistently",
      "Don't understand why good players win",
      "Want to learn without embarrassing yourself",
      "Need repetition to develop intuition",
      "Looking for a structured way to improve",
    ],
    howItWorks: [
      { step: "Play and observe", description: "Watch how AI opponents argue, vote, and reveal information." },
      { step: "Identify patterns", description: "Notice what works and what backfires in discussions." },
      { step: "Experiment yourself", description: "Try different approaches and see the results." },
      { step: "Develop intuition", description: "Over time, you'll read situations faster and more accurately." },
      { step: "Win more games", description: "Strategy knowledge translates to victory." },
    ],
    uniqueFeatures: [
      { title: "AI as teachers", description: "Observe how AI models reason through complex social situations." },
      { title: "Repetition without fatigue", description: "Play as many games as you need to internalize strategies." },
      { title: "Every role, every faction", description: "Learn village strategy, wolf strategy, and power role strategy." },
      { title: "Feedback through outcomes", description: "Wins and losses tell you what works." },
    ],
    comparisonTable: [
      { feature: "Learning method", traditional: "Figure it out live", wolfcha: "Practice and observe" },
      { feature: "Teacher", traditional: "Experienced friends", wolfcha: "AI reasoning on display" },
      { feature: "Mistakes", traditional: "Embarrassing", wolfcha: "Private learning" },
      { feature: "Repetition", traditional: "Limited by group", wolfcha: "Unlimited games" },
      { feature: "Strategy depth", traditional: "Varies by group", wolfcha: "Consistently strategic AI" },
    ],
    seats: baseSeats,
    dialogues: [
      {
        title: "Village strategy: building consensus",
        subtitle: "How the village wins through coordination.",
        lines: [
          { speaker: { seed: "alex-01", name: "Alex", modelLogo: "/models/deepseek.svg", meta: "leader" }, content: "We need a plan. Each give your top suspect and why. Then we compare." },
          { speaker: { seed: "jamie-05", name: "Jamie", modelLogo: "/models/kimi.svg", meta: "supportive" }, content: "Good structure. I'm most suspicious of Hayden. The timing was off." },
          { speaker: { seed: "taylor-04", name: "Taylor", modelLogo: "/models/qwen.svg", meta: "analytical" }, content: "I had Hayden third. My top is Riley—the vote switch was wolf-like." },
        ],
      },
      {
        title: "Wolf strategy: creating doubt",
        subtitle: "How wolves survive through confusion.",
        lines: [
          { speaker: { seed: "riley-03", name: "Riley", modelLogo: "/models/claude.svg", meta: "wolf" }, content: "Everyone's so certain about Alex's Seer claim. But what if Alex is the wolf?" },
          { speaker: { seed: "drew-09", name: "Drew", modelLogo: "/models/openai.svg", meta: "wolf" }, content: "Interesting. Alex has pushed hard all game. Wolves sometimes hide in plain sight." },
          { speaker: { seed: "casey-06", name: "Casey", modelLogo: "/models/deepseek.svg", meta: "village" }, content: "Wait, are we doubting Alex? The claim has been consistent." },
        ],
      },
    ],
    faqs: [
      { question: "What strategies should I learn first?", answer: "Start with basics: when to speak, how to vote, when to reveal. Then learn role-specific strategies." },
      { question: "How do I know if a strategy is working?", answer: "Track your win rate over multiple games. If you're winning more, your strategy is improving." },
      { question: "Can I learn wolf strategy without being a wolf?", answer: "Yes—observe AI wolves when you're village. Note their arguments and deflections." },
      { question: "Is there one best strategy?", answer: "No. Werewolf is dynamic. The best strategy depends on role, game state, and other players." },
      { question: "How long until I'm good?", answer: "You'll feel comfortable after 10–20 games. True mastery takes hundreds of games." },
      { question: "Should I read strategy guides?", answer: "Guides help, but experience is more valuable. Play games, then read to understand." },
    ],
    related: { hub: hubLinks, cluster: soloClusterLinks.filter((l) => l.href !== "/learn-werewolf-strategy") },
  },

  "werewolf-game-browser": {
    key: "werewolf-game-browser",
    slug: "werewolf-game-browser",
    title: "Werewolf Game in Browser",
    tagline: "No download. No app. Just open and play.",
    heroDescription:
      "Wolfcha runs entirely in your web browser. No installation, no app store, no waiting. Open the site, click Play, and you're in a full Werewolf game with 11 AI opponents. Works on desktop, tablet, and mobile.",
    problemsSolved: [
      "Don't want to download another app",
      "Limited storage on your device",
      "Want to play on multiple devices",
      "Need a game that works anywhere",
      "Prefer web-based experiences",
    ],
    howItWorks: [
      { step: "Open your browser", description: "Chrome, Safari, Firefox, Edge—any modern browser works." },
      { step: "Visit Wolfcha", description: "Type the URL or click a link." },
      { step: "Click Play", description: "No account required. No setup wizard." },
      { step: "Game loads instantly", description: "Optimized for fast load times." },
      { step: "Play anywhere", description: "Same experience on any device." },
    ],
    uniqueFeatures: [
      { title: "Zero installation", description: "No download, no app store, no permissions." },
      { title: "Cross-platform", description: "Desktop, laptop, tablet, phone—all supported." },
      { title: "Always up-to-date", description: "Web apps update automatically. Always the latest version." },
      { title: "Instant access", description: "Bookmark it and you're one click from a game." },
    ],
    comparisonTable: [
      { feature: "Installation", traditional: "Download app (100MB+)", wolfcha: "None" },
      { feature: "Updates", traditional: "Manual or auto-download", wolfcha: "Automatic (web)" },
      { feature: "Device switching", traditional: "Install on each device", wolfcha: "Just open browser" },
      { feature: "Storage used", traditional: "Varies (often 100MB+)", wolfcha: "Minimal (cached)" },
      { feature: "Offline play", traditional: "Sometimes", wolfcha: "Requires internet" },
    ],
    seats: baseSeats,
    dialogues: [
      {
        title: "Quick break gaming",
        subtitle: "Perfect for short sessions.",
        lines: [
          { speaker: { seed: "alex-01", name: "Alex", modelLogo: "/models/deepseek.svg", meta: "game start" }, content: "Game starting. Let's make this a good one—focused and efficient." },
          { speaker: { seed: "morgan-02", name: "Morgan", modelLogo: "/models/gemini.svg", meta: "ready" }, content: "I've got 20 minutes. Let's play smart and see who wins." },
          { speaker: { seed: "jamie-05", name: "Jamie", modelLogo: "/models/kimi.svg", meta: "engaged" }, content: "Perfect. A quick game to reset the brain. Let's go." },
        ],
      },
      {
        title: "Seamless experience",
        subtitle: "Browser gaming done right.",
        lines: [
          { speaker: { seed: "taylor-04", name: "Taylor", modelLogo: "/models/qwen.svg", meta: "impressed" }, content: "I can't believe this runs in a browser. The UI is clean and responsive." },
          { speaker: { seed: "casey-06", name: "Casey", modelLogo: "/models/deepseek.svg", meta: "agreeing" }, content: "No lag, no crashes. Just smooth gameplay. That's rare for browser games." },
        ],
      },
    ],
    faqs: [
      { question: "What browsers are supported?", answer: "All modern browsers: Chrome, Firefox, Safari, Edge, Opera." },
      { question: "Does it work on mobile?", answer: "Yes! The interface is responsive and works on phones and tablets." },
      { question: "Do I need a powerful computer?", answer: "No. The game is optimized for low resource usage." },
      { question: "Is there input lag?", answer: "Minimal. The game is turn-based with no real-time requirements." },
      { question: "Can I play offline?", answer: "No—the AI opponents require server processing. Internet needed." },
      { question: "Is my progress saved?", answer: "Optional account creation enables progress tracking." },
    ],
    related: { hub: hubLinks, cluster: soloClusterLinks.filter((l) => l.href !== "/werewolf-game-browser") },
  },

  "free-werewolf-game-online": {
    key: "free-werewolf-game-online",
    slug: "free-werewolf-game-online",
    title: "Free Werewolf Game Online",
    tagline: "Play unlimited games at no cost.",
    heroDescription:
      "Wolfcha offers free access to the complete Werewolf experience. No paywall, no premium-only features for core gameplay, no ads interrupting your game. Just open the site and start playing against AI opponents—as many games as you want.",
    problemsSolved: [
      "Don't want to pay for a casual game",
      "Hate pay-to-win mechanics",
      "Tired of ads interrupting gameplay",
      "Want to try before any commitment",
      "Looking for free entertainment that's quality",
    ],
    howItWorks: [
      { step: "Visit Wolfcha", description: "No payment information required." },
      { step: "Play immediately", description: "Full game access from the start." },
      { step: "No limits", description: "Play as many games as you want." },
      { step: "Optional support", description: "Premium features for those who want to support development." },
      { step: "Always free core", description: "Basic play remains free forever." },
    ],
    uniqueFeatures: [
      { title: "No paywalls", description: "Core gameplay is completely free. No 'energy' systems." },
      { title: "No ads during play", description: "Your game isn't interrupted by advertisements." },
      { title: "Full game access", description: "All roles, all AI opponents, full experience—free." },
      { title: "Fair premium model", description: "Optional extras for supporters, but free users get the real game." },
    ],
    comparisonTable: [
      { feature: "Base price", traditional: "Varies ($0–$30)", wolfcha: "Free" },
      { feature: "Ads", traditional: "Often", wolfcha: "No in-game ads" },
      { feature: "Pay-to-win", traditional: "Sometimes", wolfcha: "Never" },
      { feature: "Energy/lives system", traditional: "Common", wolfcha: "None" },
      { feature: "Full experience", traditional: "Often requires purchase", wolfcha: "Free" },
    ],
    seats: baseSeats,
    dialogues: [
      {
        title: "Free and full-featured",
        subtitle: "No restrictions on gameplay.",
        lines: [
          { speaker: { seed: "alex-01", name: "Alex", modelLogo: "/models/deepseek.svg", meta: "welcoming" }, content: "Welcome to the game. Full access—no restrictions, no catches." },
          { speaker: { seed: "jamie-05", name: "Jamie", modelLogo: "/models/kimi.svg", meta: "encouraging" }, content: "Play as many games as you want. Learn, practice, have fun." },
          { speaker: { seed: "morgan-02", name: "Morgan", modelLogo: "/models/gemini.svg", meta: "honest" }, content: "There are optional premium features, but you're not missing anything essential." },
        ],
      },
      {
        title: "Quality without cost",
        subtitle: "Free doesn't mean low quality.",
        lines: [
          { speaker: { seed: "casey-06", name: "Casey", modelLogo: "/models/deepseek.svg", meta: "impressed" }, content: "I've played paid games worse than this. How is this free?" },
          { speaker: { seed: "drew-09", name: "Drew", modelLogo: "/models/openai.svg", meta: "explaining" }, content: "Good design doesn't require a big budget. Just focus and craft." },
          { speaker: { seed: "quinn-08", name: "Quinn", modelLogo: "/models/bytedance.svg", meta: "appreciative" }, content: "I'm glad this exists. More games should respect players like this." },
        ],
      },
    ],
    faqs: [
      { question: "Is it really free?", answer: "Yes. Play unlimited games without paying. No tricks, no hidden costs." },
      { question: "How does Wolfcha make money?", answer: "Optional premium features and supporter tiers for those who want extras or want to support development." },
      { question: "Will free features ever become paid?", answer: "Core gameplay will always be free. We're committed to that." },
      { question: "Are there ads?", answer: "No ads interrupt your gameplay. We believe ads ruin the experience." },
      { question: "What do premium features include?", answer: "Extra voice options, themes, and supporter badges. Nothing that affects gameplay balance." },
      { question: "Is this too good to be true?", answer: "We want to make Werewolf accessible to everyone. Free play is the foundation." },
    ],
    related: { hub: hubLinks, cluster: soloClusterLinks.filter((l) => l.href !== "/free-werewolf-game-online") },
  },

  "online-werewolf-game": {
    key: "online-werewolf-game",
    slug: "online-werewolf-game",
    title: "Online Werewolf Game",
    tagline: "Play classic Werewolf online with AI opponents anytime.",
    heroDescription:
      "Looking for an online Werewolf game that starts instantly and still feels strategic? Wolfcha gives you the full social deduction loop in your browser: hidden roles, day debates, night actions, and tense final votes. You play as one seat, while 11 AI players handle the rest.",
    problemsSolved: [
      "Want an online Werewolf game without organizing a group",
      "Need quick matches you can start any time",
      "Prefer browser play over app installation",
      "Want social deduction depth, not random outcomes",
      "Need a game that works on both desktop and mobile",
    ],
    howItWorks: [
      { step: "Open Wolfcha in your browser", description: "No installation or launcher needed." },
      { step: "Start a new online match", description: "Game setup takes seconds." },
      { step: "Receive your role", description: "Villager, Werewolf, Seer, Witch, Hunter, or Guard." },
      { step: "Play day/night cycles", description: "Debate, vote, and use role abilities like a real Werewolf table." },
      { step: "Queue another round", description: "Jump straight into your next match." },
    ],
    uniqueFeatures: [
      { title: "Always-on online lobby", description: "No waiting for enough human players." },
      { title: "Full 12-seat simulation", description: "You plus 11 AI opponents with distinct personalities." },
      { title: "Serious deduction gameplay", description: "AI players reason about claims, votes, and contradictions." },
      { title: "Optional voice mode", description: "Enable narration and AI voices for immersion." },
    ],
    comparisonTable: [
      { feature: "Start time", traditional: "Wait for players", wolfcha: "Instant online start" },
      { feature: "Player availability", traditional: "Depends on friends", wolfcha: "Always available" },
      { feature: "Platform", traditional: "Often app-based", wolfcha: "Browser-first" },
      { feature: "Match quality", traditional: "Can be chaotic", wolfcha: "Consistent AI logic" },
      { feature: "Practice value", traditional: "Low repetition", wolfcha: "Unlimited repeatable practice" },
    ],
    seats: baseSeats,
    dialogues: [
      {
        title: "Classic online day discussion",
        subtitle: "AI opponents pressure each other based on vote logic.",
        lines: [
          { speaker: { seed: "alex-01", name: "Alex", modelLogo: "/models/deepseek.svg", meta: "structured" }, content: "Before voting, let's list who changed their read the fastest and why." },
          { speaker: { seed: "riley-03", name: "Riley", modelLogo: "/models/claude.svg", meta: "aggressive" }, content: "Morgan is hedging too much. That looks like wolf positioning to me." },
          { speaker: { seed: "morgan-02", name: "Morgan", modelLogo: "/models/gemini.svg", meta: "defensive" }, content: "Or I'm avoiding a blind vote. Certainty without evidence is the bigger red flag." },
        ],
      },
      {
        title: "Late-game online tension",
        subtitle: "One wrong vote ends the game.",
        lines: [
          { speaker: { seed: "casey-06", name: "Casey", modelLogo: "/models/deepseek.svg", meta: "logical" }, content: "If Jamie is town, Riley's push yesterday makes no sense. Follow the chain." },
          { speaker: { seed: "jamie-05", name: "Jamie", modelLogo: "/models/kimi.svg", meta: "calm" }, content: "I can be wrong, but I'm not hiding. Ask me anything before we lock votes." },
          { speaker: { seed: "taylor-04", name: "Taylor", modelLogo: "/models/qwen.svg", meta: "deciding" }, content: "All right. Last call. We vote based on consistency, not volume." },
        ],
      },
    ],
    faqs: [
      { question: "Is this a real online Werewolf game?", answer: "Yes. Wolfcha includes full Werewolf mechanics: hidden roles, day discussion, night actions, and voting." },
      { question: "Can I play online without friends?", answer: "Yes. You play solo against 11 AI opponents, so no group setup is needed." },
      { question: "How long is one online match?", answer: "Most games take around 15-30 minutes depending on settings and reading speed." },
      { question: "Does it run on mobile browsers?", answer: "Yes. Wolfcha is optimized for modern mobile and desktop browsers." },
      { question: "Is this browser game free?", answer: "Yes, the core experience is free to play." },
      { question: "Can I improve at Werewolf by playing online here?", answer: "Absolutely. Repeated matches help you practice reads, claims, and vote control." },
    ],
    related: { hub: hubLinks, cluster: soloClusterLinks.filter((l) => l.href !== "/online-werewolf-game") },
  },

  "werewolf-game-online-free": {
    key: "werewolf-game-online-free",
    slug: "werewolf-game-online-free",
    title: "Werewolf Game Online Free",
    tagline: "Free online Werewolf matches with full AI gameplay.",
    heroDescription:
      "Wolfcha is a free online Werewolf game where you can play unlimited rounds in your browser. No download, no mandatory account, no match queue. Start a game immediately and face AI opponents who bluff, accuse, and adapt like real players.",
    problemsSolved: [
      "Need a free Werewolf game that still feels complete",
      "Don't want ad-heavy or paywalled social deduction apps",
      "Want quick, repeatable matches for practice",
      "Prefer browser-based games over app installs",
      "Need a low-friction way to test Werewolf strategies",
    ],
    howItWorks: [
      { step: "Open the free online game page", description: "Works directly in your browser." },
      { step: "Click Play", description: "No payment or subscription required for core play." },
      { step: "Join a full AI table", description: "You + 11 AI players with different styles." },
      { step: "Play full Werewolf rules", description: "Day discussion, night powers, eliminations, and win conditions." },
      { step: "Replay instantly", description: "Run back-to-back games to practice." },
    ],
    uniqueFeatures: [
      { title: "Free core gameplay", description: "Unlimited matches at no cost." },
      { title: "No download required", description: "Browser access on desktop and mobile." },
      { title: "No queue time", description: "AI opponents are always ready." },
      { title: "Competitive deduction depth", description: "AI reasoning creates meaningful decisions every match." },
    ],
    comparisonTable: [
      { feature: "Cost to start", traditional: "Often paid or gated", wolfcha: "Free" },
      { feature: "Ads during match", traditional: "Common", wolfcha: "No in-game ad interruption" },
      { feature: "Game access", traditional: "Limited daily plays", wolfcha: "Unlimited core rounds" },
      { feature: "Setup friction", traditional: "Install + sign-up", wolfcha: "Open and play" },
      { feature: "Match consistency", traditional: "Varies", wolfcha: "Stable AI-driven quality" },
    ],
    seats: baseSeats,
    dialogues: [
      {
        title: "Free game, serious deduction",
        subtitle: "No paywall doesn't mean shallow gameplay.",
        lines: [
          { speaker: { seed: "casey-06", name: "Casey", modelLogo: "/models/deepseek.svg", meta: "analysis" }, content: "If Hayden is wolf, this voting split is exactly what they want. Don't rush." },
          { speaker: { seed: "hayden-10", name: "Hayden", modelLogo: "/models/doubao.svg", meta: "pressure" }, content: "You're overthinking. The simplest read is Taylor. Vote now." },
          { speaker: { seed: "quinn-08", name: "Quinn", modelLogo: "/models/bytedance.svg", meta: "mediator" }, content: "Let's test both claims before deciding. We still have information to extract." },
        ],
      },
      {
        title: "Replay and improve",
        subtitle: "Players use free rounds to sharpen fundamentals.",
        lines: [
          { speaker: { seed: "alex-01", name: "Alex", modelLogo: "/models/deepseek.svg", meta: "coach" }, content: "Same setup, new table dynamics. Great for practicing vote timing." },
          { speaker: { seed: "jamie-05", name: "Jamie", modelLogo: "/models/kimi.svg", meta: "encouraging" }, content: "I lost last game, but now I can test a different Seer reveal strategy." },
          { speaker: { seed: "drew-09", name: "Drew", modelLogo: "/models/openai.svg", meta: "reflective" }, content: "That's why free replays matter. Iteration beats one lucky game." },
        ],
      },
    ],
    faqs: [
      { question: "Is this werewolf game online free forever?", answer: "Core gameplay is free, including full matches against AI opponents." },
      { question: "Do I need to register to play free games?", answer: "No. You can start playing immediately in your browser." },
      { question: "Are free players limited in match count?", answer: "No hard cap on core matches. You can replay to practice." },
      { question: "Does free mode remove important roles?", answer: "No. Classic roles and core mechanics remain available." },
      { question: "Is the free version still challenging?", answer: "Yes. AI opponents still bluff, reason, and adapt like in paid-quality strategy games." },
      { question: "Can I play free games on phone?", answer: "Yes, the game is mobile-friendly and browser-based." },
    ],
    related: { hub: hubLinks, cluster: soloClusterLinks.filter((l) => l.href !== "/werewolf-game-online-free") },
  },

  "mafia-werewolf-game-online": {
    key: "mafia-werewolf-game-online",
    slug: "mafia-werewolf-game-online",
    title: "Mafia Werewolf Game Online",
    tagline: "Play the Mafia/Werewolf social deduction format online, solo.",
    heroDescription:
      "Mafia and Werewolf are two names for the same hidden-role party game. Wolfcha brings that format online for solo players: no host needed, no waiting room, and no scheduling. You still get all the essentials: deception, vote pressure, and high-stakes endgames.",
    problemsSolved: [
      "Searching for Mafia-style Werewolf gameplay online",
      "Can't gather a full party for classic Mafia nights",
      "Need practice in bluffing and suspicion reads",
      "Want the genre without toxic voice lobbies",
      "Prefer instant browser sessions over long setup",
    ],
    howItWorks: [
      { step: "Open Wolfcha online", description: "No app installation required." },
      { step: "Start a Mafia/Werewolf match", description: "You join a 12-seat game instantly." },
      { step: "Play your hidden role", description: "Town, wolf, and power-role dynamics are preserved." },
      { step: "Debate and vote", description: "Push narratives, challenge claims, and read contradictions." },
      { step: "Review and improve", description: "Replay often to sharpen deception and deduction." },
    ],
    uniqueFeatures: [
      { title: "Mafia + Werewolf familiarity", description: "Terminology differs, mechanics stay classic." },
      { title: "Solo-ready online format", description: "All opponents are AI, available 24/7." },
      { title: "No host required", description: "Rules and phase transitions are automated." },
      { title: "Strategic AI personalities", description: "Each seat reasons differently, creating fresh table dynamics." },
    ],
    comparisonTable: [
      { feature: "Required players", traditional: "8-12 humans", wolfcha: "1 human + 11 AI" },
      { feature: "Moderator needs", traditional: "Human host", wolfcha: "Built-in game flow" },
      { feature: "Start delay", traditional: "Often long", wolfcha: "Immediate" },
      { feature: "Lobby toxicity", traditional: "Possible", wolfcha: "None" },
      { feature: "Practice frequency", traditional: "Occasional", wolfcha: "Anytime, unlimited" },
    ],
    seats: baseSeats,
    dialogues: [
      {
        title: "Mafia-style pressure play",
        subtitle: "Classic accusation chains and counter-claims.",
        lines: [
          { speaker: { seed: "riley-03", name: "Riley", modelLogo: "/models/claude.svg", meta: "accusing" }, content: "Casey is controlling too much narrative. That's exactly how wolves hide in plain sight." },
          { speaker: { seed: "casey-06", name: "Casey", modelLogo: "/models/deepseek.svg", meta: "counter" }, content: "Or it's how town solves games. Show one contradiction instead of a vibe read." },
          { speaker: { seed: "morgan-02", name: "Morgan", modelLogo: "/models/gemini.svg", meta: "reading room" }, content: "Riley's push feels performative. I'm not voting Casey without stronger evidence." },
        ],
      },
      {
        title: "Endgame decision",
        subtitle: "One elimination decides town vs wolves.",
        lines: [
          { speaker: { seed: "taylor-04", name: "Taylor", modelLogo: "/models/qwen.svg", meta: "seer claim" }, content: "I checked Alex last night: town. That means the final wolf is between Drew and Hayden." },
          { speaker: { seed: "drew-09", name: "Drew", modelLogo: "/models/openai.svg", meta: "defense" }, content: "Convenient check when pressure is on me. Look at Hayden's voting history instead." },
          { speaker: { seed: "hayden-10", name: "Hayden", modelLogo: "/models/doubao.svg", meta: "pushing" }, content: "Drew is redirecting. If town misvotes here, we lose. Decide now." },
        ],
      },
    ],
    faqs: [
      { question: "Is Mafia and Werewolf the same game?", answer: "They are closely related versions of the same social deduction formula: hidden factions, day voting, and deception." },
      { question: "Can I play Mafia-style Werewolf online solo?", answer: "Yes. Wolfcha is designed for solo matches against AI opponents." },
      { question: "Do I need a host or moderator?", answer: "No. The game handles phases, role actions, and results automatically." },
      { question: "Is this competitive enough for practice?", answer: "Yes. The AI table provides repeatable pressure scenarios for improving reads and bluff timing." },
      { question: "How long does an online Mafia/Werewolf game take?", answer: "Typical sessions are around 15-30 minutes." },
      { question: "Is it beginner-friendly?", answer: "Yes. New players can learn safely, while advanced players can iterate strategies quickly." },
    ],
    related: { hub: hubLinks, cluster: soloClusterLinks.filter((l) => l.href !== "/mafia-werewolf-game-online") },
  },
};
