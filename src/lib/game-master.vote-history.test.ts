import assert from "node:assert/strict";
import test from "node:test";
import { setLocale } from "@/i18n/locale-store";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||= "vote-history-test-key";
setLocale("zh");

test("日总结从竞选事件快照读取赢家，不被后续警徽移交覆盖", async () => {
  const [{ createInitialGameState, extractVoteDataFromDayMessages }, { getI18n }] = await Promise.all([
    import("./game-master"),
    import("@/i18n/translator"),
  ]);
  const state = createInitialGameState();
  state.day = 1;
  state.badge.holderSeat = 4;
  state.badge.electionWinners = { 1: 8 };
  const { t } = getI18n();
  const messages = [{
    id: "badge-vote-result",
    playerId: "system",
    playerName: "系统",
    timestamp: Date.now(),
    day: 1,
    phase: "DAY_BADGE_ELECTION" as const,
    isSystem: true,
    content: `[VOTE_RESULT]${JSON.stringify({
      title: t("badgePhase.voteDetailTitle"),
      results: [{ targetSeat: 8, voterSeats: [4], voteCount: 1 }],
    })}`,
  }];

  const voteData = extractVoteDataFromDayMessages(messages, state);

  assert.equal(voteData?.sheriff_election?.winner, 8);
  assert.deepEqual(voteData?.sheriff_election?.votes, { 8: [4] });
});

test("旧记录没有赢家快照时只按唯一最高票确定性推断", async () => {
  const [{ createInitialGameState, extractVoteDataFromDayMessages }, { getI18n }] = await Promise.all([
    import("./game-master"),
    import("@/i18n/translator"),
  ]);
  const state = createInitialGameState();
  state.day = 1;
  state.badge.holderSeat = 4;
  state.badge.electionWinners = undefined;
  const { t } = getI18n();
  const messages = [{
    id: "legacy-badge-vote-result",
    playerId: "system",
    playerName: "系统",
    timestamp: Date.now(),
    day: 1,
    phase: "DAY_BADGE_ELECTION" as const,
    isSystem: true,
    content: `[VOTE_RESULT]${JSON.stringify({
      title: t("badgePhase.voteDetailTitle"),
      results: [
        { targetSeat: 8, voterSeats: [1, 4], voteCount: 2 },
        { targetSeat: 2, voterSeats: [7], voteCount: 1 },
      ],
    })}`,
  }];

  const voteData = extractVoteDataFromDayMessages(messages, state);

  assert.equal(voteData?.sheriff_election?.winner, 8);
});

test("日总结输入把内部零基座位转换为公开座位号", async () => {
  const [{ createInitialGameState, formatDailySummaryTranscriptMessage }, { getI18n }] = await Promise.all([
    import("./game-master"),
    import("@/i18n/translator"),
  ]);
  const state = createInitialGameState();
  state.players = Array.from({ length: 9 }, (_, seat) => ({
    playerId: `p${seat}`,
    seat,
    displayName: `玩家${seat + 1}`,
    alive: true,
    role: "Villager" as const,
    alignment: "village" as const,
    isHuman: false,
  }));
  const { t } = getI18n();
  const message = {
    id: "day-vote-result",
    playerId: "system",
    playerName: "系统",
    timestamp: Date.now(),
    day: 2,
    phase: "DAY_RESOLVE" as const,
    isSystem: true,
    content: `[VOTE_RESULT]${JSON.stringify({
      title: t("votePhase.voteDetailTitle"),
      results: [{ targetSeat: 2, voterSeats: [1, 3, 5, 6, 7, 8], voteCount: 6.5 }],
    })}`,
  };

  const line = formatDailySummaryTranscriptMessage(message, state, "系统");

  assert.match(line ?? "", /3号 玩家3：6.5票/);
  assert.match(line ?? "", /2号 玩家2.*4号 玩家4.*6号 玩家6.*7号 玩家7.*8号 玩家8.*9号 玩家9/);
  assert.doesNotMatch(line ?? "", /\[1,3,5,6,7,8\]/);
  assert.doesNotMatch(line ?? "", /targetSeat/);
});
