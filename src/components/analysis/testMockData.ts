import type { GameAnalysisData, PlayerSnapshot, RoundState } from "@/types/analysis";

const TEST_PLAYERS: PlayerSnapshot[] = [
  { playerId: "player-1", seat: 0, name: "Claude", avatar: "Claude", role: "Witch", alignment: "village", isAlive: true, isHumanPlayer: true },
  { playerId: "player-2", seat: 1, name: "GPT-4", avatar: "GPT4", role: "Seer", alignment: "village", isAlive: true, isSheriff: true },
  { playerId: "player-3", seat: 2, name: "Gemini", avatar: "Gemini", role: "Hunter", alignment: "village", isAlive: true },
  { playerId: "player-4", seat: 3, name: "DeepSeek", avatar: "DeepSeek", role: "Guard", alignment: "village", isAlive: true },
  { playerId: "player-5", seat: 4, name: "Qwen", avatar: "Qwen", role: "Villager", alignment: "village", isAlive: false, deathDay: 1, deathCause: "killed" },
  { playerId: "player-6", seat: 5, name: "GLM", avatar: "glm", role: "Villager", alignment: "village", isAlive: true },
  { playerId: "player-7", seat: 6, name: "Llama", avatar: "Llama", role: "Werewolf", alignment: "wolf", isAlive: false, deathDay: 1, deathCause: "exiled" },
  { playerId: "player-8", seat: 7, name: "Mistral", avatar: "Mistral", role: "Werewolf", alignment: "wolf", isAlive: false, deathDay: 2, deathCause: "poisoned" },
  { playerId: "player-9", seat: 8, name: "Yi", avatar: "Yi", role: "Werewolf", alignment: "wolf", isAlive: false, deathDay: 2, deathCause: "exiled" },
];

const TEST_ROUND_STATES: RoundState[] = [
  {
    day: 0,
    phase: "day",
    aliveCount: { village: 6, wolf: 3 },
    players: TEST_PLAYERS.map(p => ({ ...p, isAlive: true, isSheriff: false })),
  },
  {
    day: 1,
    phase: "day",
    sheriffSeat: 1,
    aliveCount: { village: 5, wolf: 2 },
    players: TEST_PLAYERS.map(p => ({
      ...p,
      isAlive: p.seat !== 4 && p.seat !== 6,
      isSheriff: p.seat === 1,
      deathDay: p.seat === 4 ? 1 : p.seat === 6 ? 1 : undefined,
      deathCause: p.seat === 4 ? "killed" : p.seat === 6 ? "exiled" : undefined,
    })),
  },
  {
    day: 2,
    phase: "day",
    sheriffSeat: 1,
    aliveCount: { village: 5, wolf: 0 },
    players: TEST_PLAYERS.map(p => ({
      ...p,
      isAlive: p.alignment === "village" && p.seat !== 4,
      isSheriff: p.seat === 1,
      deathDay: p.seat === 4 ? 1 : p.seat === 6 ? 1 : [7, 8].includes(p.seat) ? 2 : undefined,
      deathCause: p.seat === 4 ? "killed" : p.seat === 6 ? "exiled" : p.seat === 7 ? "poisoned" : p.seat === 8 ? "exiled" : undefined,
    })),
  },
];

export const TEST_ANALYSIS_DATA: GameAnalysisData = {
  gameId: "test-village-win-001",
  timestamp: Date.now(),
  duration: 1850,
  playerCount: 9,
  result: "village_win",

  players: TEST_PLAYERS,
  roundStates: TEST_ROUND_STATES,

  awards: {
    mvp: {
      playerId: "player-2",
      playerName: "GPT-4",
      reason: "首验查狼\n带队获胜",
      avatar: "GPT4",
      role: "Seer",
    },
    svp: {
      playerId: "player-1",
      playerName: "Claude",
      reason: "毒药精准\n力挽狂澜",
      avatar: "Claude",
      role: "Witch",
    },
  },

  timeline: [
    {
      day: 1,
      summary: "4号守卫守护2号预言家，狼人刀5号村民。2号跳预言家报出7号查杀并成功上警。7号被放逐出局后发动遗言反咬2号。",
      nightEvents: [
        { type: "guard", source: "4", target: "2", result: "守护成功" },
        { type: "kill", source: "狼人", target: "5" },
        { type: "check", source: "2", target: "7", result: "狼人" },
      ],
      dayEvents: [
        {
          type: "badge",
          target: "2",
          voteCount: 6,
          votes: [
            { voterSeat: 0, targetSeat: 1 }, { voterSeat: 2, targetSeat: 1 }, { voterSeat: 3, targetSeat: 1 },
            { voterSeat: 5, targetSeat: 1 }, { voterSeat: 7, targetSeat: 1 }, { voterSeat: 8, targetSeat: 6 },
          ],
        },
        {
          type: "exile",
          target: "7",
          voteCount: 6,
          votes: [
            { voterSeat: 0, targetSeat: 6 }, { voterSeat: 1, targetSeat: 6 }, { voterSeat: 2, targetSeat: 6 },
            { voterSeat: 3, targetSeat: 6 }, { voterSeat: 5, targetSeat: 6 }, { voterSeat: 7, targetSeat: 1 },
          ],
        },
      ],
      dayPhases: [
        {
          type: "election",
          summary: "2号跳预言家声明首验7号为狼人，7号辩解称自己是村民被冤枉。场上多数人选择相信2号。",
          speeches: [
            { seat: 1, content: "我是预言家，首夜查验7号，是狼人。请大家相信我，先把7号投出去。警徽流给3号和4号。" },
            { seat: 6, content: "我是好人！2号在诬陷我，他才是狼人悍跳！大家不要被骗了！" },
          ],
          event: {
            type: "badge",
            target: "2",
            voteCount: 6,
            votes: [
              { voterSeat: 0, targetSeat: 1 }, { voterSeat: 2, targetSeat: 1 }, { voterSeat: 3, targetSeat: 1 },
              { voterSeat: 5, targetSeat: 1 }, { voterSeat: 7, targetSeat: 1 }, { voterSeat: 8, targetSeat: 6 },
            ],
          },
        },
        {
          type: "discussion",
          summary: "2号当选警长，场上讨论后决定先投7号试水。7号被高票放逐。",
          speeches: [
            { seat: 0, content: "我是女巫，昨晚没有用药。支持2号警长，建议今天先投7号。" },
            { seat: 2, content: "我觉得2号的发言逻辑清晰，站边2号投7号。" },
            { seat: 3, content: "守卫昨晚守了2号，他没死说明是真预言家，投7号。" },
          ],
          event: {
            type: "exile",
            target: "7",
            voteCount: 6,
            votes: [
              { voterSeat: 0, targetSeat: 6 }, { voterSeat: 1, targetSeat: 6 }, { voterSeat: 2, targetSeat: 6 },
              { voterSeat: 3, targetSeat: 6 }, { voterSeat: 5, targetSeat: 6 }, { voterSeat: 7, targetSeat: 1 },
            ],
          },
        },
      ],
    },
    {
      day: 2,
      summary: "狼人刀2号预言家，守卫空守失误。1号女巫毒杀8号狼人，精准命中。白天场上推出9号最后一只狼，好人阵营获胜！",
      nightEvents: [
        { type: "kill", source: "狼人", target: "2" },
        { type: "guard", source: "4", target: "4", result: "空守" },
        { type: "poison", source: "1", target: "8", result: "毒杀成功" },
      ],
      dayEvents: [
        {
          type: "exile",
          target: "9",
          voteCount: 5,
          votes: [
            { voterSeat: 0, targetSeat: 8 }, { voterSeat: 2, targetSeat: 8 }, { voterSeat: 3, targetSeat: 8 },
            { voterSeat: 5, targetSeat: 8 }, { voterSeat: 8, targetSeat: 0 },
          ],
        },
      ],
      dayPhases: [
        {
          type: "discussion",
          summary: "昨晚2号预言家和8号狼人双死。根据警长遗言和场上分析，锁定9号为最后一只狼并成功放逐。",
          speeches: [
            { seat: 0, content: "我昨晚毒了8号，8号死了说明我毒对了！现在场上只剩9号是狼，快投他！" },
            { seat: 2, content: "2号警长的警徽流指向9号有问题，加上1号女巫毒对了8号，9号必须死！" },
            { seat: 8, content: "我不是狼！你们搞错了！1号才是狼人在做局！" },
          ],
          event: {
            type: "exile",
            target: "9",
            voteCount: 5,
            votes: [
              { voterSeat: 0, targetSeat: 8 }, { voterSeat: 2, targetSeat: 8 }, { voterSeat: 3, targetSeat: 8 },
              { voterSeat: 5, targetSeat: 8 }, { voterSeat: 8, targetSeat: 0 },
            ],
          },
        },
      ],
    },
  ],

  personalStats: {
    role: "Witch",
    userName: "Claude",
    avatar: "Claude",
    alignment: "village",
    tags: ["致命毒药", "妙手回春"],
    radarStats: {
      logic: 88,
      speech: 82,
      survival: 100,
      skillOrHide: 95,
      voteOrTicket: 85,
    },
    highlightQuote: "我昨晚毒了8号，8号死了说明我毒对了！现在场上只剩9号是狼，快投他！",
    totalScore: 90,
  },

  reviews: [
    {
      fromPlayerId: "player-2",
      fromCharacterName: "GPT-4",
      avatar: "GPT4",
      content: "女巫的毒药用得太精准了！关键时刻帮我们锁定了狼人，这波配合完美！",
      relation: "ally",
      role: "Seer",
    },
    {
      fromPlayerId: "player-4",
      fromCharacterName: "DeepSeek",
      avatar: "DeepSeek",
      content: "第二晚我空守了，幸好你毒对了人，不然局势就难说了。下次我会更谨慎的。",
      relation: "ally",
      role: "Guard",
    },
    {
      fromPlayerId: "player-8",
      fromCharacterName: "Mistral",
      avatar: "Mistral",
      content: "被你一瓶毒药带走了...女巫的判断太准了，我们狼人完全没机会反扑。",
      relation: "enemy",
      role: "Werewolf",
    },
  ],
};
