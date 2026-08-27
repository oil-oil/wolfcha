import { getRoleConfiguration } from "@/lib/role-configuration";
import { isWolfRole, type Alignment, type Phase } from "@/types/game";
import type {
  MultiplayerBadgeState,
  MultiplayerChatMessage,
  MultiplayerGameCommand,
  MultiplayerLastResult,
  MultiplayerPrivateState,
  MultiplayerPublicState,
  MultiplayerRoleAbilities,
  MultiplayerRoomMember,
  MultiplayerRoomStatus,
  MultiplayerServerPlayer,
  MultiplayerServerState,
} from "@/types/multiplayer";

export interface MultiplayerAdvanceOptions {
  /** 服务端接入模型决策器时关闭，避免规则引擎伪造 AI 决策。 */
  autoAi?: boolean;
}

export interface PendingMultiplayerAiAction {
  seat: number;
  actions: MultiplayerGameCommand["type"][];
  eligibleTargets: number[];
}

type Trigger = NonNullable<MultiplayerServerState["pendingTrigger"]>;
type Death = NonNullable<MultiplayerServerState["pendingDeaths"]>[number];
const MAX_MULTIPLAYER_MESSAGES = 200;
const MAX_PROCESSED_COMMAND_IDS = 256;

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: string): () => number {
  let value = hashSeed(seed);
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], seed: string): T[] {
  const random = seededRandom(seed);
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

const AI_IDENTITIES = [
  { name: "沈砚", styleLabel: "冷静分析", personality: "克制、敏锐，不轻易站边", reasoningStyle: "优先核对发言矛盾与票型", riskStyle: "中低风险" },
  { name: "程野", styleLabel: "强势推进", personality: "果断、直接，愿意承担责任", reasoningStyle: "快速形成狼坑并推动投票", riskStyle: "高风险" },
  { name: "林雾", styleLabel: "细节观察", personality: "耐心、谨慎，擅长捕捉措辞变化", reasoningStyle: "逐轮记录立场和信息增量", riskStyle: "低风险" },
  { name: "顾川", styleLabel: "逻辑辩手", personality: "理性、自信，喜欢交叉质询", reasoningStyle: "用假设验证和反证排除身份", riskStyle: "中风险" },
  { name: "苏槐", styleLabel: "情绪识别", personality: "温和、共情，但对异常情绪敏感", reasoningStyle: "结合行为动机判断阵营", riskStyle: "中低风险" },
  { name: "周屿", styleLabel: "票型专家", personality: "沉稳、务实，重视可验证证据", reasoningStyle: "优先复盘投票关系和收益", riskStyle: "低风险" },
  { name: "许棠", styleLabel: "灵活博弈", personality: "机敏、善变，擅长制造信息差", reasoningStyle: "根据场上共识动态调整策略", riskStyle: "高风险" },
  { name: "陆遥", styleLabel: "平衡控场", personality: "稳定、公允，擅长梳理共识", reasoningStyle: "先归纳分歧再确定验证顺序", riskStyle: "中风险" },
  { name: "季白", styleLabel: "反直觉派", personality: "独立、警觉，不盲从多数", reasoningStyle: "重点检查过于顺滑的公共叙事", riskStyle: "中高风险" },
  { name: "唐岚", styleLabel: "信息整合", personality: "清晰、严谨，表达结构化", reasoningStyle: "综合身份信息、发言和票型", riskStyle: "中低风险" },
  { name: "江策", styleLabel: "心理博弈", personality: "外向、敏锐，擅长施压观察反应", reasoningStyle: "通过互动反馈修正判断", riskStyle: "高风险" },
  { name: "叶澄", styleLabel: "稳健推理", personality: "安静、可靠，坚持长期一致性", reasoningStyle: "比较多轮立场是否自洽", riskStyle: "低风险" },
] as const;

export function normalizeMultiplayerPlayerCount(value: number): number {
  if (!Number.isFinite(value)) return 8;
  return Math.min(12, Math.max(8, Math.round(value)));
}

export function buildStartedRoomState(
  members: MultiplayerRoomMember[],
  playerCount: number,
  seed: string,
): MultiplayerServerState {
  const capacity = normalizeMultiplayerPlayerCount(playerCount);
  const humans = members
    .filter((member) => member.role !== "spectator" && member.seat !== null)
    .sort((left, right) => (left.seat ?? 0) - (right.seat ?? 0));
  const occupied = new Set(humans.map((member) => member.seat));
  const players: MultiplayerServerPlayer[] = humans.map((member) => ({
    seat: member.seat as number,
    kind: "human",
    userId: member.userId,
    displayName: member.displayName,
    avatarSeed: `multiplayer-human-${hashSeed(`${seed}:${member.seat}:${member.userId}`).toString(16)}`,
    alive: true,
    role: null,
    alignment: null,
  }));

  for (let seat = 0; seat < capacity; seat += 1) {
    if (occupied.has(seat)) continue;
    const identity = AI_IDENTITIES[(hashSeed(seed) + seat) % AI_IDENTITIES.length];
    players.push({
      seat,
      kind: "ai",
      userId: null,
      displayName: identity.name,
      avatarSeed: `multiplayer-ai-${seed}-${seat}`,
      alive: true,
      role: null,
      alignment: null,
      aiProfile: {
        styleLabel: identity.styleLabel,
        personality: identity.personality,
        reasoningStyle: identity.reasoningStyle,
        riskStyle: identity.riskStyle,
      },
    });
  }

  const roles = shuffle(getRoleConfiguration(capacity), seed);
  const assigned = players
    .sort((left, right) => left.seat - right.seat)
    .map((player, index) => {
      const role = roles[index];
      const alignment: Alignment = isWolfRole(role) ? "wolf" : "village";
      return { ...player, role, alignment };
    });

  return {
    phase: "NIGHT_START",
    day: 1,
    players: assigned,
    version: 0,
    roomId: "",
    seed,
    messages: [],
    messageSequence: 0,
    currentSpeakerSeat: null,
    speechQueue: [],
    badge: emptyBadge(),
    votes: {},
    nightActions: { wolfVotes: {} },
    roleAbilities: defaultAbilities(),
    seerHistory: [],
    pkTargets: [],
    pendingDeaths: [],
    pendingTrigger: null,
    queuedTrigger: null,
    continuationPhase: "DAY_START",
    lastWordsSeat: null,
    submittedSeats: {},
    lastResult: null,
    winner: null,
    processedCommandIds: [],
  };
}

function emptyBadge(): MultiplayerBadgeState {
  return {
    holderSeat: null,
    candidates: [],
    signup: {},
    votes: {},
    history: {},
    destroyed: false,
  };
}

function defaultAbilities(): MultiplayerRoleAbilities {
  return {
    witchHealUsed: false,
    witchPoisonUsed: false,
    hunterCanShoot: true,
    idiotRevealed: false,
    whiteWolfKingBoomUsed: false,
  };
}

function ensureRuntime(state: MultiplayerServerState): void {
  state.version ??= 0;
  state.messages ??= [];
  state.messageSequence ??= state.messages.length;
  if (state.messages.length > MAX_MULTIPLAYER_MESSAGES) {
    state.messages.splice(0, state.messages.length - MAX_MULTIPLAYER_MESSAGES);
  }
  state.currentSpeakerSeat ??= null;
  state.speechQueue ??= [];
  state.badge ??= emptyBadge();
  state.votes ??= {};
  state.nightActions = { wolfVotes: {}, ...(state.nightActions ?? {}) };
  state.roleAbilities = { ...defaultAbilities(), ...(state.roleAbilities ?? {}) };
  state.seerHistory ??= [];
  state.pkTargets ??= [];
  state.pendingDeaths ??= [];
  state.pendingTrigger ??= null;
  state.queuedTrigger ??= null;
  state.continuationPhase ??= "DAY_START";
  state.lastWordsSeat ??= null;
  state.submittedSeats ??= {};
  state.lastResult ??= null;
  state.winner ??= null;
  state.processedCommandIds ??= [];
  if (state.processedCommandIds.length > MAX_PROCESSED_COMMAND_IDS) {
    state.processedCommandIds.splice(
      0,
      state.processedCommandIds.length - MAX_PROCESSED_COMMAND_IDS,
    );
  }
  state.turnKey ??= null;
  state.deadlineAt ??= null;
}

function cloneState(state: MultiplayerServerState): MultiplayerServerState {
  const cloned: MultiplayerServerState = structuredClone(state);
  ensureRuntime(cloned);
  return cloned;
}

function playerKey(player: MultiplayerServerPlayer): string {
  // AI 决策执行时会临时挂载合成 userId；规则状态必须始终使用稳定座位键，
  // 否则报名/票型写入后恢复 null userId 会导致阶段永远等待。
  return player.kind === "ai" ? `seat:${player.seat}` : player.userId ?? `seat:${player.seat}`;
}

function playerKeys(player: MultiplayerServerPlayer): string[] {
  return [...new Set([
    playerKey(player),
    player.userId,
    player.displayName,
    player.kind === "ai" ? `__multiplayer_ai__:${player.seat}` : null,
  ].filter((value): value is string => Boolean(value)))];
}

function playerRecordValue<T>(record: Record<string, T> | undefined, player: MultiplayerServerPlayer): T | undefined {
  if (!record) return undefined;
  for (const key of playerKeys(player)) {
    if (Object.prototype.hasOwnProperty.call(record, key)) return record[key];
  }
  return undefined;
}

function playerAt(state: MultiplayerServerState, seat: number | null | undefined) {
  return seat == null ? undefined : state.players.find((player) => player.seat === seat);
}

function actorFor(state: MultiplayerServerState, userId: string) {
  return state.players.find((player) => player.userId === userId);
}

function alive(state: MultiplayerServerState, seat: number): boolean {
  return Boolean(playerAt(state, seat)?.alive);
}

function alivePlayers(state: MultiplayerServerState): MultiplayerServerPlayer[] {
  return state.players.filter((player) => player.alive);
}

function submitted(state: MultiplayerServerState, player: MultiplayerServerPlayer): boolean {
  return Boolean(state.submittedSeats?.[state.phase]?.includes(player.seat));
}

function markSubmitted(state: MultiplayerServerState, player: MultiplayerServerPlayer): void {
  const seats = state.submittedSeats?.[state.phase] ?? [];
  state.submittedSeats![state.phase] = seats.includes(player.seat) ? seats : [...seats, player.seat];
}

function appendMessage(
  state: MultiplayerServerState,
  message: Omit<MultiplayerChatMessage, "id">,
): void {
  const id = `msg:${state.messageSequence!}`;
  state.messageSequence! += 1;
  state.messages!.push({ id, ...message });
  if (state.messages!.length > MAX_MULTIPLAYER_MESSAGES) state.messages!.shift();
}

function systemMessage(state: MultiplayerServerState, content: string): void {
  appendMessage(state, {
    playerId: null,
    playerName: "系统",
    content,
    day: state.day,
    phase: state.phase,
    isSystem: true,
  });
}

function playerMessage(state: MultiplayerServerState, player: MultiplayerServerPlayer, content: string): void {
  appendMessage(state, {
    playerId: `seat:${player.seat}`,
    playerName: player.displayName,
    content,
    day: state.day,
    phase: state.phase,
  });
}

function seatName(state: MultiplayerServerState, seat: number): string {
  const player = playerAt(state, seat);
  return player ? `${seat + 1}号 ${player.displayName}` : `${seat + 1}号`;
}

function setLastResult(state: MultiplayerServerState, result: MultiplayerLastResult, text: string): void {
  state.lastResult = result;
  systemMessage(state, text);
}

function readableLastResult(state: MultiplayerServerState): string | null {
  const result = state.lastResult;
  if (!result) return null;
  if (result.type === "night") {
    return result.deaths?.length
      ? `昨夜出局：${result.deaths.map((death) => seatName(state, death.seat)).join("、")}`
      : "昨夜平安夜";
  }
  if (result.type === "badge") {
    return result.targetSeat == null ? "警徽已销毁" : `${seatName(state, result.targetSeat)} 当选警长`;
  }
  if (result.type === "vote") {
    return result.targetSeat == null ? "放逐投票平票，无人出局" : `${seatName(state, result.targetSeat)} 被放逐`;
  }
  if (result.type === "hunter") {
    return result.targetSeat == null ? "猎人没有开枪" : `猎人开枪带走 ${seatName(state, result.targetSeat)}`;
  }
  if (result.type === "boom") {
    return result.targetSeat == null ? "白狼王发动自爆" : `白狼王自爆带走 ${seatName(state, result.targetSeat)}`;
  }
  return result.targetSeat == null ? "警徽已销毁" : `警徽移交给 ${seatName(state, result.targetSeat)}`;
}

/** 首日警徽流程结束前，夜间结果仍属于未公开信息。 */
function concealsFirstNightResult(state: MultiplayerServerState): boolean {
  return (
    [
      "DAY_START",
      "DAY_BADGE_SIGNUP",
      "DAY_BADGE_SPEECH",
      "DAY_PK_SPEECH",
      "DAY_BADGE_ELECTION",
    ].includes(state.phase) &&
    state.day === 1 &&
    state.badge?.holderSeat === null &&
    !state.badge?.destroyed &&
    ((state.pendingDeaths?.length ?? 0) > 0 || state.lastResult?.type === "night")
  );
}

function eligibleDayVoters(state: MultiplayerServerState): MultiplayerServerPlayer[] {
  return alivePlayers(state).filter((player) => {
    if (state.roleAbilities!.idiotRevealed && player.role === "Idiot") return false;
    if (state.pkSource === "vote" && state.pkTargets!.length && state.pkTargets!.includes(player.seat)) return false;
    return true;
  });
}

function eligibleBadgeVoters(state: MultiplayerServerState): MultiplayerServerPlayer[] {
  return alivePlayers(state).filter((player) => !state.badge!.candidates.includes(player.seat));
}

export function buildMultiplayerPublicState(
  state: MultiplayerServerState,
  revealRoles = false,
): MultiplayerPublicState {
  const concealNightDeaths = concealsFirstNightResult(state);
  const concealedSeats = new Set((state.pendingDeaths ?? []).map((death) => death.seat));
  const badgeVoters = eligibleBadgeVoters(state);
  const dayVoters = eligibleDayVoters(state);
  const badgeVoteActive = state.phase === "DAY_BADGE_ELECTION";
  const dayVoteActive = state.phase === "DAY_VOTE";
  const badgeSubmitted = badgeVoteActive
    ? badgeVoters.filter((player) => playerRecordValue(state.badge?.votes, player) !== undefined).length
    : 0;
  const voteSubmitted = dayVoteActive
    ? dayVoters.filter((player) => playerRecordValue(state.votes, player) !== undefined).length
    : 0;

  return {
    phase: state.phase,
    day: state.day,
    players: state.players.map((player) => ({
      seat: player.seat,
      kind: player.kind,
      displayName: player.displayName,
      avatarSeed: player.avatarSeed,
      // 兼容旧检查点：即使旧状态已提前标记死亡，公开投影也不能在首日警徽流程泄露。
      alive: concealNightDeaths && concealedSeats.has(player.seat) ? true : player.alive,
      role: revealRoles ? player.role : null,
      alignment: revealRoles ? player.alignment : null,
    })),
    messages: (state.messages ?? []).filter(
      (message) => !(concealNightDeaths && message.day === state.day && message.phase === "NIGHT_RESOLVE"),
    ),
    currentSpeakerSeat: state.currentSpeakerSeat ?? null,
    badge: {
      holderSeat: state.badge?.holderSeat ?? null,
      candidates: state.badge?.candidates ?? [],
      signupSeats: state.players
        .filter((player) => playerRecordValue(state.badge?.signup, player) === true)
        .map((player) => player.seat),
      voteProgress: { submitted: badgeSubmitted, total: badgeVoteActive ? badgeVoters.length : 0 },
      resultCounts: {},
      destroyed: state.badge?.destroyed ?? false,
    },
    voteProgress: { submitted: voteSubmitted, total: dayVoteActive ? dayVoters.length : 0, resultCounts: {} },
    lastResult: concealNightDeaths ? null : readableLastResult(state),
    winner: state.winner ?? null,
    pendingDeaths: concealNightDeaths
      ? []
      : (state.pendingDeaths ?? []).map((death) => ({ seat: death.seat })),
    deadlineAt: state.deadlineAt ?? null,
  };
}

export function projectMultiplayerState(
  state: MultiplayerServerState,
  viewerUserId: string,
  status: MultiplayerRoomStatus,
): { publicState: MultiplayerPublicState; privateState: MultiplayerPrivateState } {
  const viewer = state.players.find((player) => player.userId === viewerUserId) ?? null;
  return {
    publicState: buildMultiplayerPublicState(state, status === "finished"),
    privateState: {
      seat: viewer?.seat ?? null,
      role: viewer?.role ?? null,
      alignment: viewer?.alignment ?? null,
      wolfTeammates:
        viewer?.role && isWolfRole(viewer.role)
          ? state.players
              .filter(
                (player) =>
                  player.seat !== viewer.seat &&
                  player.role !== null &&
                  isWolfRole(player.role),
              )
              .map((player) => ({ seat: player.seat, displayName: player.displayName }))
          : [],
      allowedActions: allowedActions(state, viewer),
      eligibleTargets: eligibleTargets(state, viewer),
      actionSubmitted: viewer ? actionSubmitted(state, viewer) : false,
      witchNightKill:
        viewer?.role === "Witch" && state.phase === "NIGHT_WITCH_ACTION"
          ? state.nightActions?.wolfTarget ?? null
          : null,
      witchHealAvailable: viewer?.role === "Witch" && !state.roleAbilities?.witchHealUsed,
      witchPoisonAvailable: viewer?.role === "Witch" && !state.roleAbilities?.witchPoisonUsed,
      seerHistory: viewer?.role === "Seer" ? state.seerHistory ?? [] : [],
      wolfVotes:
        viewer?.role && isWolfRole(viewer.role)
          ? Object.fromEntries(
              Object.entries(state.nightActions?.wolfVotes ?? {}).map(([voterKey, target]) => {
                const voter = state.players.find((player) => playerKeys(player).includes(voterKey));
                return [`seat:${voter?.seat ?? "unknown"}`, target];
              }),
            )
          : {},
    },
  };
}

function actionSubmitted(state: MultiplayerServerState, viewer: MultiplayerServerPlayer): boolean {
  if (submitted(state, viewer)) return true;
  if (state.phase === "DAY_BADGE_SIGNUP") {
    return playerRecordValue(state.badge?.signup, viewer) !== undefined;
  }
  if (state.phase === "DAY_BADGE_ELECTION") {
    return playerRecordValue(state.badge?.votes, viewer) !== undefined;
  }
  if (state.phase === "DAY_VOTE") {
    return playerRecordValue(state.votes, viewer) !== undefined;
  }
  return false;
}

function isSpeechPhase(phase: Phase): boolean {
  return ["DAY_BADGE_SPEECH", "DAY_SPEECH", "DAY_PK_SPEECH", "DAY_LAST_WORDS"].includes(phase);
}

function allowedActions(
  state: MultiplayerServerState,
  viewer: MultiplayerServerPlayer | null,
): MultiplayerGameCommand["type"][] {
  if (!viewer || state.phase === "GAME_END") return [];
  const specialDeadAction = ["HUNTER_SHOOT", "BADGE_TRANSFER"].includes(state.phase);
  if (!viewer.alive && !specialDeadAction && state.phase !== "DAY_LAST_WORDS") return [];
  if (actionSubmitted(state, viewer)) return [];

  if (state.phase === "NIGHT_GUARD_ACTION" && viewer.role === "Guard") return ["guard"];
  if (state.phase === "NIGHT_WOLF_ACTION" && isWolfRole(viewer.role ?? undefined)) return ["wolf"];
  if (state.phase === "NIGHT_WITCH_ACTION" && viewer.role === "Witch") return ["witch"];
  if (state.phase === "NIGHT_SEER_ACTION" && viewer.role === "Seer") return ["seer"];
  if (state.phase === "DAY_BADGE_SIGNUP" && viewer.alive) return ["badge_signup"];
  if (isSpeechPhase(state.phase) && state.currentSpeakerSeat === viewer.seat) {
    if (
      state.phase !== "DAY_LAST_WORDS" &&
      viewer.role === "WhiteWolfKing" &&
      !state.roleAbilities?.whiteWolfKingBoomUsed
    ) {
      return ["speech", "white_wolf_boom"];
    }
    return ["speech"];
  }
  if (
    state.phase === "DAY_BADGE_ELECTION" &&
    eligibleBadgeVoters(state).some((player) => player.seat === viewer.seat)
  ) {
    return ["badge_vote"];
  }
  if (
    state.phase === "DAY_VOTE" &&
    eligibleDayVoters(state).some((player) => player.seat === viewer.seat)
  ) {
    return ["day_vote"];
  }
  if (state.phase === "HUNTER_SHOOT" && viewer.role === "Hunter") return ["hunter_shot"];
  if (state.phase === "BADGE_TRANSFER" && state.badge?.holderSeat === viewer.seat) {
    return ["badge_transfer"];
  }
  return [];
}

function eligibleTargets(
  state: MultiplayerServerState,
  viewer: MultiplayerServerPlayer | null,
): number[] {
  if (!viewer) return [];
  const otherLiving = alivePlayers(state)
    .filter((player) => player.seat !== viewer.seat)
    .map((player) => player.seat);
  if (state.phase === "NIGHT_GUARD_ACTION" && viewer.role === "Guard") {
    return alivePlayers(state)
      .map((player) => player.seat)
      .filter((seat) => seat !== state.nightActions?.lastGuardTarget);
  }
  if (state.phase === "NIGHT_WOLF_ACTION" && isWolfRole(viewer.role ?? undefined)) {
    return alivePlayers(state)
      .filter((player) => player.alignment !== "wolf")
      .map((player) => player.seat);
  }
  if (state.phase === "NIGHT_WITCH_ACTION" && viewer.role === "Witch") {
    return alivePlayers(state).map((player) => player.seat);
  }
  if (state.phase === "NIGHT_SEER_ACTION" && viewer.role === "Seer") return otherLiving;
  if (state.phase === "DAY_BADGE_ELECTION") return state.badge?.candidates ?? [];
  if (state.phase === "DAY_VOTE" && state.pkTargets?.length) return state.pkTargets;
  if (state.phase === "BADGE_TRANSFER") return otherLiving;
  if (state.phase === "HUNTER_SHOOT" || allowedActions(state, viewer).includes("white_wolf_boom")) {
    return otherLiving;
  }
  return otherLiving;
}

function commandTargetAllowed(
  state: MultiplayerServerState,
  actor: MultiplayerServerPlayer,
  seat: number | null,
  allowSelf = false,
): boolean {
  return seat === null || (alive(state, seat) && (allowSelf || seat !== actor.seat));
}

export function applyMultiplayerGameCommand(
  state: MultiplayerServerState,
  actorUserId: string,
  command: MultiplayerGameCommand,
  options: MultiplayerAdvanceOptions = {},
): MultiplayerServerState {
  const next = cloneState(state);
  const actor = actorFor(next, actorUserId);
  if (next.processedCommandIds!.includes(command.commandId)) throw new Error("DUPLICATE_COMMAND");
  if (command.roomId && next.roomId && command.roomId !== next.roomId) throw new Error("ROOM_CONFLICT");
  if (command.expectedVersion !== next.version) throw new Error("VERSION_CONFLICT");
  if (!actor) throw new Error("FORBIDDEN");
  if (!allowedActions(next, actor).includes(command.type)) throw new Error("FORBIDDEN");
  const invalid = (): never => {
    throw new Error("INVALID_INPUT");
  };

  switch (command.type) {
    case "guard": {
      if (
        command.targetSeat !== null &&
        (command.targetSeat === next.nightActions!.lastGuardTarget ||
          !commandTargetAllowed(next, actor, command.targetSeat, true))
      ) invalid();
      next.nightActions!.guardTarget = command.targetSeat ?? undefined;
      markSubmitted(next, actor);
      break;
    }
    case "wolf": {
      const target = command.targetSeat === null ? null : playerAt(next, command.targetSeat);
      if (
        !commandTargetAllowed(next, actor, command.targetSeat, true) ||
        (target !== null && target?.alignment === "wolf")
      ) invalid();
      next.nightActions!.wolfVotes[playerKey(actor)] = command.targetSeat ?? -1;
      markSubmitted(next, actor);
      break;
    }
    case "witch": {
      if (
        (command.save && next.roleAbilities!.witchHealUsed) ||
        (command.poisonTargetSeat !== null && next.roleAbilities!.witchPoisonUsed) ||
        !commandTargetAllowed(next, actor, command.poisonTargetSeat, true)
      ) invalid();
      next.nightActions!.witchSave = command.save;
      next.nightActions!.witchPoison = command.poisonTargetSeat ?? undefined;
      if (command.save) next.roleAbilities!.witchHealUsed = true;
      if (command.poisonTargetSeat !== null) next.roleAbilities!.witchPoisonUsed = true;
      markSubmitted(next, actor);
      break;
    }
    case "seer": {
      if (!commandTargetAllowed(next, actor, command.targetSeat)) invalid();
      const isWolf = isWolfRole(playerAt(next, command.targetSeat)?.role ?? undefined);
      next.nightActions!.seerTarget = command.targetSeat;
      next.nightActions!.seerResult = { targetSeat: command.targetSeat, isWolf };
      next.seerHistory!.push({ targetSeat: command.targetSeat, isWolf, day: next.day });
      markSubmitted(next, actor);
      break;
    }
    case "badge_signup": {
      next.badge!.signup[playerKey(actor)] = command.signup;
      markSubmitted(next, actor);
      break;
    }
    case "speech": {
      const content = command.content.trim().slice(0, 500);
      if (!content || next.currentSpeakerSeat !== actor.seat) invalid();
      playerMessage(next, actor, content);
      next.speechQueue = next.speechQueue!.filter((seat) => seat !== actor.seat);
      next.currentSpeakerSeat = next.speechQueue[0] ?? null;
      markSubmitted(next, actor);
      break;
    }
    case "badge_vote": {
      if (!next.badge!.candidates.includes(command.targetSeat)) invalid();
      next.badge!.votes[playerKey(actor)] = command.targetSeat;
      markSubmitted(next, actor);
      break;
    }
    case "day_vote": {
      if (
        command.targetSeat !== null &&
        (!commandTargetAllowed(next, actor, command.targetSeat) ||
          (next.pkTargets!.length > 0 && !next.pkTargets!.includes(command.targetSeat)))
      ) invalid();
      next.votes![playerKey(actor)] = command.targetSeat ?? -1;
      markSubmitted(next, actor);
      break;
    }
    case "hunter_shot": {
      if (!next.roleAbilities!.hunterCanShoot || !commandTargetAllowed(next, actor, command.targetSeat)) invalid();
      if (command.targetSeat !== null) kill(next, command.targetSeat, "execution");
      next.roleAbilities!.hunterCanShoot = false;
      setLastResult(
        next,
        { type: "hunter", day: next.day, targetSeat: command.targetSeat },
        command.targetSeat === null
          ? "猎人选择不开枪"
          : `猎人开枪带走了 ${seatName(next, command.targetSeat)}`,
      );
      if (command.targetSeat !== null && next.badge!.holderSeat === command.targetSeat) {
        next.queuedTrigger = "badge_transfer";
      }
      completeTrigger(next);
      break;
    }
    case "badge_transfer": {
      if (
        command.destroy
          ? command.targetSeat !== null
          : command.targetSeat === null || !commandTargetAllowed(next, actor, command.targetSeat)
      ) invalid();
      next.badge!.holderSeat = command.destroy ? null : command.targetSeat;
      next.badge!.destroyed = Boolean(command.destroy);
      setLastResult(
        next,
        { type: "badge_transfer", day: next.day, targetSeat: next.badge!.holderSeat },
        command.destroy
          ? "警徽已销毁"
          : `警徽移交给了 ${seatName(next, command.targetSeat as number)}`,
      );
      completeTrigger(next);
      break;
    }
    case "white_wolf_boom": {
      const targetSeat = command.targetSeat;
      if (targetSeat === null) throw new Error("INVALID_INPUT");
      const boomTargetSeat = targetSeat as number;
      if (
        next.roleAbilities!.whiteWolfKingBoomUsed ||
        !commandTargetAllowed(next, actor, boomTargetSeat)
      ) invalid();
      executeWhiteWolfBoom(next, actor, boomTargetSeat);
      break;
    }
  }

  next.processedCommandIds!.push(command.commandId);
  if (next.processedCommandIds!.length > MAX_PROCESSED_COMMAND_IDS) {
    next.processedCommandIds!.shift();
  }
  next.version = (next.version ?? 0) + 1;
  return advanceMultiplayerGame(next, options);
}

function kill(state: MultiplayerServerState, seat: number, reason: Death["reason"]): void {
  const player = playerAt(state, seat);
  if (!player?.alive) return;
  player.alive = false;
  if (!state.pendingDeaths!.some((death) => death.seat === seat)) {
    state.pendingDeaths!.push({ seat, reason });
  }
  if (player.role === "Hunter" && reason === "poison") {
    state.roleAbilities!.hunterCanShoot = false;
  }
}

function chooseAiTarget(
  state: MultiplayerServerState,
  actor: MultiplayerServerPlayer,
  candidates: number[],
  allowSelf = false,
): number | null {
  const valid = candidates.filter(
    (seat) => alive(state, seat) && (allowSelf || seat !== actor.seat),
  );
  if (!valid.length) return null;
  if (actor.alignment === "wolf") {
    return (
      valid.find((seat) => playerAt(state, seat)?.alignment !== "wolf") ??
      valid[0]
    );
  }
  return valid[0];
}

function topSeats(
  state: MultiplayerServerState,
  source: "badge" | "vote",
): { seats: number[]; votes: Record<string, number> } {
  const raw = source === "badge" ? state.badge!.votes : state.votes!;
  const counts: Record<string, number> = {};
  for (const [voterKey, target] of Object.entries(raw)) {
    const voter = state.players.find((player) => playerKeys(player).includes(voterKey));
    if (!voter?.alive || target < 0 || !alive(state, target)) continue;
    if (state.roleAbilities!.idiotRevealed && voter.role === "Idiot") continue;
    const weight = source === "vote" && voter.seat === state.badge!.holderSeat ? 1.5 : 1;
    counts[String(target)] = (counts[String(target)] ?? 0) + weight;
  }
  const highest = Math.max(0, ...Object.values(counts));
  return {
    seats: Object.entries(counts)
      .filter(([, count]) => count === highest && count > 0)
      .map(([seat]) => Number(seat))
      .sort((left, right) => left - right),
    votes: counts,
  };
}

function finishWinner(state: MultiplayerServerState): boolean {
  const wolves = state.players.filter((player) => player.alive && player.alignment === "wolf").length;
  const village = state.players.filter((player) => player.alive && player.alignment === "village").length;
  const winner: Alignment | null = wolves === 0 ? "village" : wolves >= village ? "wolf" : null;
  if (!winner) return false;
  state.winner = winner;
  state.phase = "GAME_END";
  state.currentSpeakerSeat = null;
  state.speechQueue = [];
  systemMessage(state, winner === "village" ? "好人阵营获胜" : "狼人阵营获胜");
  return true;
}

function inDeferredResolution(state: MultiplayerServerState): boolean {
  return (
    state.phase === "DAY_LAST_WORDS" ||
    state.phase === "HUNTER_SHOOT" ||
    state.phase === "BADGE_TRANSFER" ||
    state.phase === "WHITE_WOLF_KING_BOOM" ||
    state.pendingTrigger !== null
  );
}

function setTrigger(
  state: MultiplayerServerState,
  first: Trigger | null,
  queued: MultiplayerServerState["queuedTrigger"] = null,
): void {
  state.pendingTrigger = first;
  state.queuedTrigger = queued;
  if (first === "hunter_shot") state.phase = "HUNTER_SHOOT";
  if (first === "badge_transfer") state.phase = "BADGE_TRANSFER";
  if (first === "white_wolf_boom") state.phase = "WHITE_WOLF_KING_BOOM";
}

function continueCycle(state: MultiplayerServerState): void {
  state.pendingTrigger = null;
  state.queuedTrigger = null;
  state.lastWordsSeat = null;
  state.currentSpeakerSeat = null;
  state.speechQueue = [];
  if (state.continuationPhase === "DAY_START") {
    state.phase = "DAY_START";
    return;
  }
  state.day += 1;
  state.phase = "NIGHT_START";
}

function executeWhiteWolfBoom(
  state: MultiplayerServerState,
  whiteWolfKing: MultiplayerServerPlayer,
  targetSeat: number,
): void {
  state.roleAbilities!.whiteWolfKingBoomUsed = true;
  kill(state, whiteWolfKing.seat, "boom");
  kill(state, targetSeat, "boom");
  state.continuationPhase = "NIGHT_START";
  state.pendingTrigger = null;
  state.queuedTrigger = null;
  if (
    state.badge!.holderSeat === whiteWolfKing.seat ||
    state.badge!.holderSeat === targetSeat
  ) {
    state.badge!.holderSeat = null;
    state.badge!.destroyed = true;
  }
  setLastResult(
    state,
    { type: "boom", day: state.day, targetSeat },
    `白狼王自爆并带走了 ${seatName(state, targetSeat)}`,
  );
  const target = playerAt(state, targetSeat);
  if (target?.role === "Hunter" && state.roleAbilities!.hunterCanShoot) {
    state.pendingTrigger = "hunter_shot";
    state.phase = "HUNTER_SHOOT";
  } else {
    continueCycle(state);
  }
}

function completeTrigger(state: MultiplayerServerState): void {
  const next = state.queuedTrigger ?? null;
  state.queuedTrigger = null;
  state.pendingTrigger = next;
  if (next === "hunter_shot") {
    state.phase = "HUNTER_SHOOT";
    return;
  }
  if (next === "badge_transfer") {
    state.phase = "BADGE_TRANSFER";
    return;
  }
  continueCycle(state);
}

function resolveNight(state: MultiplayerServerState): void {
  const actions = state.nightActions!;
  const deaths: Death[] = [];
  const guarded = actions.wolfTarget !== undefined && actions.guardTarget === actions.wolfTarget;
  const saved = actions.wolfTarget !== undefined && actions.witchSave === true;
  const protectedByExactlyOne = guarded !== saved;
  if (
    actions.wolfTarget !== undefined &&
    alive(state, actions.wolfTarget) &&
    !protectedByExactlyOne
  ) {
    deaths.push({
      seat: actions.wolfTarget,
      reason: guarded && saved ? "milk" : "wolf",
    });
  }
  if (
    actions.witchPoison !== undefined &&
    alive(state, actions.witchPoison) &&
    !deaths.some((death) => death.seat === actions.witchPoison)
  ) {
    deaths.push({ seat: actions.witchPoison, reason: "poison" });
  }
  state.pendingDeaths = [];
  // 首日警徽报名/竞选发生在夜间死亡公布之前。此时只保存待公布结果，
  // 不改变存活状态、不写入夜间结果，也不触发猎人/警徽技能。
  const deferAnnouncement =
    state.day === 1 && state.badge!.holderSeat === null && !state.badge!.destroyed;
  state.nightActions!.lastGuardTarget = actions.guardTarget;
  if (deferAnnouncement) {
    state.pendingDeaths = deaths;
    setLastResult(
      state,
      { type: "night", day: state.day, deaths },
      deaths.length
        ? `天亮了，昨夜 ${deaths.map((death) => seatName(state, death.seat)).join("、")} 出局`
        : "天亮了，昨夜是平安夜",
    );
    state.continuationPhase = "DAY_START";
    state.phase = "DAY_START";
    return;
  }

  for (const death of deaths) kill(state, death.seat, death.reason);
  setLastResult(
    state,
    { type: "night", day: state.day, deaths },
    deaths.length
      ? `天亮了，昨夜 ${deaths.map((death) => seatName(state, death.seat)).join("、")} 出局`
      : "天亮了，昨夜是平安夜",
  );

  state.continuationPhase = "DAY_START";
  const deadHunter = deaths.some(
    (death) =>
      playerAt(state, death.seat)?.role === "Hunter" &&
      state.roleAbilities!.hunterCanShoot,
  );
  const deadSheriff =
    state.badge!.holderSeat !== null && !alive(state, state.badge!.holderSeat);
  if (deadHunter && deadSheriff) setTrigger(state, "hunter_shot", "badge_transfer");
  else if (deadHunter) setTrigger(state, "hunter_shot");
  else if (deadSheriff) setTrigger(state, "badge_transfer");
  else state.phase = "DAY_START";
}

function resolvePendingNightDeaths(state: MultiplayerServerState): void {
  const deaths = [...(state.pendingDeaths ?? [])];
  if (!deaths.length) return;

  state.phase = "DAY_SPEECH";
  state.messages = (state.messages ?? []).filter(
    (message) => !(message.day === state.day && message.phase === "NIGHT_RESOLVE"),
  );
  state.pendingDeaths = [];
  for (const death of deaths) kill(state, death.seat, death.reason);
  state.pendingDeaths = [];
  setLastResult(
    state,
    { type: "night", day: state.day, deaths },
    deaths.length
      ? `天亮了，昨夜 ${deaths.map((death) => seatName(state, death.seat)).join("、")} 出局`
      : "天亮了，昨夜是平安夜",
  );

  const deadHunter = deaths.some(
    (death) =>
      playerAt(state, death.seat)?.role === "Hunter" &&
      state.roleAbilities!.hunterCanShoot,
  );
  const deadSheriff =
    state.badge!.holderSeat !== null && !alive(state, state.badge!.holderSeat);
  if (deadHunter && deadSheriff) setTrigger(state, "hunter_shot", "badge_transfer");
  else if (deadHunter) setTrigger(state, "hunter_shot");
  else if (deadSheriff) setTrigger(state, "badge_transfer");
}

function autoNight(state: MultiplayerServerState, autoAi: boolean): boolean {
  if (state.phase === "NIGHT_GUARD_ACTION") {
    const guard = state.players.find((player) => player.alive && player.role === "Guard");
    if (!guard) {
      state.phase = "NIGHT_WOLF_ACTION";
      return true;
    }
    if (autoAi && guard.kind === "ai" && !submitted(state, guard)) {
      state.nightActions!.guardTarget =
        chooseAiTarget(
          state,
          guard,
          alivePlayers(state)
            .map((player) => player.seat)
            .filter((seat) => seat !== state.nightActions!.lastGuardTarget),
          true,
        ) ?? undefined;
      markSubmitted(state, guard);
    }
    if (!submitted(state, guard)) return false;
    state.nightActions!.lastGuardTarget = state.nightActions!.guardTarget;
    state.phase = "NIGHT_WOLF_ACTION";
    return true;
  }

  if (state.phase === "NIGHT_WOLF_ACTION") {
    const wolves = state.players.filter(
      (player) => player.alive && isWolfRole(player.role ?? undefined),
    );
    for (const wolf of wolves) {
      if (autoAi && wolf.kind === "ai" && !submitted(state, wolf)) {
        state.nightActions!.wolfVotes[playerKey(wolf)] =
          chooseAiTarget(
            state,
            wolf,
            alivePlayers(state).map((player) => player.seat),
            true,
          ) ?? -1;
        markSubmitted(state, wolf);
      }
    }
    if (wolves.some((wolf) => !submitted(state, wolf))) return false;
    const counts: Record<number, number> = {};
    for (const target of Object.values(state.nightActions!.wolfVotes)) {
      if (target >= 0) counts[target] = (counts[target] ?? 0) + 1;
    }
    const result = Object.entries(counts).sort(
      (left, right) => right[1] - left[1] || Number(left[0]) - Number(right[0]),
    )[0];
    state.nightActions!.wolfTarget = result ? Number(result[0]) : undefined;
    state.phase = "NIGHT_WITCH_ACTION";
    return true;
  }

  if (state.phase === "NIGHT_WITCH_ACTION") {
    const witch = state.players.find((player) => player.alive && player.role === "Witch");
    if (!witch) {
      state.phase = "NIGHT_SEER_ACTION";
      return true;
    }
    if (autoAi && witch.kind === "ai" && !submitted(state, witch)) {
      state.nightActions!.witchSave = false;
      state.nightActions!.witchPoison = undefined;
      markSubmitted(state, witch);
    }
    if (!submitted(state, witch)) return false;
    state.phase = "NIGHT_SEER_ACTION";
    return true;
  }

  if (state.phase === "NIGHT_SEER_ACTION") {
    const seer = state.players.find((player) => player.alive && player.role === "Seer");
    if (!seer) {
      state.phase = "NIGHT_RESOLVE";
      return true;
    }
    if (autoAi && seer.kind === "ai" && !submitted(state, seer)) {
      const target = chooseAiTarget(
        state,
        seer,
        alivePlayers(state).map((player) => player.seat),
      );
      if (target !== null) {
        const isWolf = isWolfRole(playerAt(state, target)?.role ?? undefined);
        state.nightActions!.seerTarget = target;
        state.nightActions!.seerResult = { targetSeat: target, isWolf };
        state.seerHistory!.push({ targetSeat: target, isWolf, day: state.day });
      }
      markSubmitted(state, seer);
    }
    if (!submitted(state, seer)) return false;
    state.phase = "NIGHT_RESOLVE";
    return true;
  }
  return false;
}

function setupSpeech(
  state: MultiplayerServerState,
  phase: "DAY_BADGE_SPEECH" | "DAY_SPEECH" | "DAY_PK_SPEECH",
): void {
  state.phase = phase;
  const aliveSeats = alivePlayers(state).map((player) => player.seat).sort((left, right) => left - right);
  if (phase === "DAY_BADGE_SPEECH" || phase === "DAY_PK_SPEECH") {
    const source = phase === "DAY_BADGE_SPEECH" ? state.badge!.candidates : state.pkTargets!;
    const allowed = new Set(source);
    state.speechQueue = aliveSeats.filter((seat) => allowed.has(seat));
  } else {
    state.speechQueue = resolveMultiplayerDaySpeechOrder(state, aliveSeats);
  }
  state.currentSpeakerSeat = state.speechQueue[0] ?? null;
}

function resolveMultiplayerDaySpeechOrder(
  state: MultiplayerServerState,
  aliveSeats: number[],
): number[] {
  if (!aliveSeats.length) return [];
  const sheriffSeat = state.badge!.holderSeat;
  const sheriffAlive = sheriffSeat !== null && aliveSeats.includes(sheriffSeat);
  let startSeat: number;

  if (sheriffAlive) {
    startSeat = nextSeatInDirection(aliveSeats, sheriffSeat, "clockwise", true) ?? aliveSeats[0];
  } else {
    const nightDeaths = state.lastResult?.type === "night" ? state.lastResult.deaths ?? [] : [];
    const deadSeat = nightDeaths[0]?.seat;
    startSeat =
      deadSeat === undefined
        ? aliveSeats[0]
        : nextSeatInDirection(aliveSeats, deadSeat, "clockwise", false) ?? aliveSeats[0];
  }

  const direction = sheriffAlive
    ? resolveMultiplayerSpeechDirection(aliveSeats, startSeat, sheriffSeat)
    : "clockwise";
  const order: number[] = [];
  let cursor: number | null = startSeat;
  for (let index = 0; index < aliveSeats.length; index += 1) {
    if (cursor === null || order.includes(cursor)) break;
    if (cursor !== sheriffSeat) order.push(cursor);
    cursor = nextSeatInDirection(aliveSeats, cursor, direction, true);
  }
  if (sheriffAlive) order.push(sheriffSeat);
  return order;
}

function nextSeatInDirection(
  seats: number[],
  currentSeat: number,
  direction: "clockwise" | "counterclockwise",
  excludeCurrent: boolean,
): number | null {
  if (!seats.length) return null;
  const currentIndex = seats.indexOf(currentSeat);
  if (currentIndex < 0) {
    if (direction === "clockwise") {
      return seats.find((seat) => seat > currentSeat) ?? seats[0];
    }
    return [...seats].reverse().find((seat) => seat < currentSeat) ?? seats[seats.length - 1];
  }
  const baseIndex = currentIndex < 0 ? (direction === "clockwise" ? -1 : seats.length) : currentIndex;
  const step = direction === "clockwise" ? 1 : -1;
  for (let offset = excludeCurrent ? 1 : 0; offset < seats.length + 1; offset += 1) {
    const index = (baseIndex + step * offset + seats.length * 2) % seats.length;
    const seat = seats[index];
    if (!excludeCurrent || seat !== currentSeat) return seat;
  }
  return null;
}

function resolveMultiplayerSpeechDirection(
  aliveSeats: number[],
  startSeat: number,
  sheriffSeat: number,
): "clockwise" | "counterclockwise" {
  const startIndex = aliveSeats.indexOf(startSeat);
  const sheriffIndex = aliveSeats.indexOf(sheriffSeat);
  if (startIndex < 0 || sheriffIndex < 0 || startIndex === sheriffIndex) return "clockwise";
  const total = aliveSeats.length;
  const clockwiseSteps = (sheriffIndex - startIndex + total) % total;
  const counterclockwiseSteps = (startIndex - sheriffIndex + total) % total;
  return clockwiseSteps >= counterclockwiseSteps ? "clockwise" : "counterclockwise";
}

function setupOrdinaryDaySpeech(state: MultiplayerServerState): void {
  if (state.pendingDeaths?.length) {
    // 正常夜晚结算已经执行过 kill；只有首日隐藏窗口中的目标仍存活时才需要在此公布。
    if (state.pendingDeaths.some((death) => alive(state, death.seat))) {
      resolvePendingNightDeaths(state);
    } else {
      state.pendingDeaths = [];
    }
    if (state.pendingTrigger) return;
  } else if (
    state.day === 1 &&
    state.messages?.some((message) => message.day === state.day && message.phase === "NIGHT_RESOLVE")
  ) {
    // 平安夜也属于首日警徽前的隐藏夜间信息；竞选结束后重新写入正式白天阶段。
    state.phase = "DAY_SPEECH";
    state.messages = (state.messages ?? []).filter(
      (message) => !(message.day === state.day && message.phase === "NIGHT_RESOLVE"),
    );
    setLastResult(
      state,
      { type: "night", day: state.day, deaths: [] },
      "天亮了，昨夜是平安夜",
    );
  }
  setupSpeech(state, "DAY_SPEECH");
}

function autoSpeech(state: MultiplayerServerState, autoAi: boolean): boolean {
  while (state.currentSpeakerSeat !== null) {
    const speaker = playerAt(state, state.currentSpeakerSeat);
    if (!speaker) {
      state.speechQueue = state.speechQueue!.filter((seat) => seat !== state.currentSpeakerSeat);
      state.currentSpeakerSeat = state.speechQueue[0] ?? null;
      continue;
    }
    if (speaker.kind === "human" || !autoAi) return false;
    const aliveWolves = state.players.filter(
      (player) => player.alive && player.role && isWolfRole(player.role),
    ).length;
    if (
      speaker.role === "WhiteWolfKing" &&
      state.phase !== "DAY_LAST_WORDS" &&
      state.day >= 2 &&
      aliveWolves <= 2 &&
      !state.roleAbilities!.whiteWolfKingBoomUsed
    ) {
      const target = chooseAiTarget(
        state,
        speaker,
        alivePlayers(state).map((player) => player.seat),
      );
      if (target !== null) {
        executeWhiteWolfBoom(state, speaker, target);
        return true;
      }
    }
    playerMessage(
      state,
      speaker,
      speaker.alignment === "wolf"
        ? "我先保留身份判断，重点看今天的发言和票型。"
        : "我会结合昨夜信息和发言矛盾来投票。",
    );
    state.speechQueue = state.speechQueue!.filter((seat) => seat !== speaker.seat);
    state.currentSpeakerSeat = state.speechQueue[0] ?? null;
  }
  return true;
}

function resolveBadgeElection(state: MultiplayerServerState): void {
  const result = topSeats(state, "badge");
  state.badge!.history[state.day] = { ...state.badge!.votes };
  if (result.seats.length === 1) {
    const winner = result.seats[0];
    state.badge!.holderSeat = winner;
    state.pkTargets = [];
    state.pkSource = undefined;
    setLastResult(
      state,
      { type: "badge", day: state.day, targetSeat: winner, votes: result.votes },
      `${seatName(state, winner)} 当选警长`,
    );
    setupOrdinaryDaySpeech(state);
    return;
  }
  if (state.pkSource !== "badge" && result.seats.length > 1) {
    state.pkTargets = result.seats;
    state.pkSource = "badge";
    state.badge!.candidates = result.seats;
    setupSpeech(state, "DAY_PK_SPEECH");
    return;
  }
  state.badge!.holderSeat = null;
  state.badge!.destroyed = true;
  state.pkTargets = [];
  state.pkSource = undefined;
  setLastResult(
    state,
    { type: "badge", day: state.day, targetSeat: null, votes: result.votes },
    "警徽投票再次平票，警徽销毁",
  );
  setupOrdinaryDaySpeech(state);
}

function startLastWords(state: MultiplayerServerState, victim: MultiplayerServerPlayer): void {
  const sheriff = state.badge!.holderSeat === victim.seat;
  const hunter = victim.role === "Hunter" && state.roleAbilities!.hunterCanShoot;
  state.continuationPhase = "NIGHT_START";
  state.pendingTrigger = sheriff ? "badge_transfer" : hunter ? "hunter_shot" : null;
  state.queuedTrigger = sheriff && hunter ? "hunter_shot" : null;
  state.lastWordsSeat = victim.seat;
  state.phase = "DAY_LAST_WORDS";
  state.speechQueue = [victim.seat];
  state.currentSpeakerSeat = victim.seat;
  systemMessage(state, `请 ${seatName(state, victim.seat)} 发表遗言`);
}

function finishLastWords(state: MultiplayerServerState): void {
  state.lastWordsSeat = null;
  state.currentSpeakerSeat = null;
  state.speechQueue = [];
  if (state.pendingTrigger === "badge_transfer") {
    state.phase = "BADGE_TRANSFER";
    return;
  }
  if (state.pendingTrigger === "hunter_shot") {
    state.phase = "HUNTER_SHOOT";
    return;
  }
  continueCycle(state);
}

function resolveDayVote(state: MultiplayerServerState): void {
  const result = topSeats(state, "vote");
  if (result.seats.length !== 1) {
    if (state.pkSource !== "vote" && result.seats.length > 1) {
      state.pkTargets = result.seats;
      state.pkSource = "vote";
      setupSpeech(state, "DAY_PK_SPEECH");
      return;
    }
    setLastResult(
      state,
      { type: "vote", day: state.day, targetSeat: null, votes: result.votes },
      "放逐投票平票，本轮无人出局",
    );
    state.pkTargets = [];
    state.pkSource = undefined;
    state.continuationPhase = "NIGHT_START";
    continueCycle(state);
    return;
  }

  const victim = playerAt(state, result.seats[0]);
  if (!victim) {
    state.continuationPhase = "NIGHT_START";
    continueCycle(state);
    return;
  }
  setLastResult(
    state,
    { type: "vote", day: state.day, targetSeat: victim.seat, votes: result.votes },
    `${seatName(state, victim.seat)} 被放逐`,
  );
  state.pkTargets = [];
  state.pkSource = undefined;
  if (victim.role === "Idiot" && !state.roleAbilities!.idiotRevealed) {
    state.roleAbilities!.idiotRevealed = true;
    systemMessage(state, `${seatName(state, victim.seat)} 翻牌为白痴，免于出局但失去投票权`);
    state.continuationPhase = "NIGHT_START";
    continueCycle(state);
    return;
  }
  kill(state, victim.seat, "execution");
  startLastWords(state, victim);
}

function autoSpecial(state: MultiplayerServerState, autoAi: boolean): boolean {
  if (state.phase === "HUNTER_SHOOT") {
    const hunter = state.players.find((player) => player.role === "Hunter");
    if (!hunter || hunter.kind === "human" || !autoAi) return false;
    const target = chooseAiTarget(
      state,
      hunter,
      alivePlayers(state).map((player) => player.seat),
    );
    if (target !== null) kill(state, target, "execution");
    state.roleAbilities!.hunterCanShoot = false;
    setLastResult(
      state,
      { type: "hunter", day: state.day, targetSeat: target },
      target === null ? "猎人没有开枪" : `猎人开枪带走了 ${seatName(state, target)}`,
    );
    if (target !== null && state.badge!.holderSeat === target) state.queuedTrigger = "badge_transfer";
    completeTrigger(state);
    return true;
  }
  if (state.phase === "BADGE_TRANSFER") {
    const sheriff = playerAt(state, state.badge!.holderSeat);
    if (!sheriff || sheriff.kind === "human" || !autoAi) return false;
    const target = alivePlayers(state)
      .sort((left, right) => left.seat - right.seat)
      .find((player) => player.seat !== sheriff.seat);
    state.badge!.holderSeat = target?.seat ?? null;
    state.badge!.destroyed = !target;
    setLastResult(
      state,
      { type: "badge_transfer", day: state.day, targetSeat: target?.seat ?? null },
      target ? `警徽移交给了 ${seatName(state, target.seat)}` : "警徽已销毁",
    );
    completeTrigger(state);
    return true;
  }
  return false;
}

export function advanceMultiplayerGame(
  input: MultiplayerServerState,
  options: MultiplayerAdvanceOptions = {},
): MultiplayerServerState {
  const state = cloneState(input);
  const autoAi = options.autoAi ?? false;
  for (let step = 0; step < 200; step += 1) {
    if (state.winner || state.phase === "GAME_END") break;
    if (!inDeferredResolution(state) && finishWinner(state)) break;

    if (state.phase === "NIGHT_START") {
      state.nightActions = { wolfVotes: {}, lastGuardTarget: state.nightActions?.lastGuardTarget };
      state.submittedSeats = {};
      state.pendingDeaths = [];
      state.currentSpeakerSeat = null;
      state.speechQueue = [];
      state.phase = state.players.some((player) => player.alive && player.role === "Guard")
        ? "NIGHT_GUARD_ACTION"
        : "NIGHT_WOLF_ACTION";
      systemMessage(state, `第 ${state.day} 天夜晚开始`);
      continue;
    }

    if (state.phase.startsWith("NIGHT_") && state.phase !== "NIGHT_RESOLVE") {
      if (autoNight(state, autoAi)) continue;
      break;
    }
    if (state.phase === "NIGHT_RESOLVE") {
      resolveNight(state);
      continue;
    }

    if (state.phase === "DAY_START") {
      state.submittedSeats = {};
      state.badge!.signup = {};
      state.badge!.candidates = [];
      state.badge!.votes = {};
      state.votes = {};
      state.pkTargets = [];
      state.pkSource = undefined;
      if (state.day === 1 && state.badge!.holderSeat === null && !state.badge!.destroyed) {
        state.phase = "DAY_BADGE_SIGNUP";
      } else {
        setupOrdinaryDaySpeech(state);
      }
      continue;
    }

    if (state.phase === "DAY_BADGE_SIGNUP") {
      for (const player of autoAi ? alivePlayers(state).filter((item) => item.kind === "ai") : []) {
        if (playerRecordValue(state.badge!.signup, player) === undefined) {
          state.badge!.signup[playerKey(player)] = (player.seat + state.day) % 3 === 0;
          markSubmitted(state, player);
        }
      }
      const waiting = alivePlayers(state).some(
        (player) => playerRecordValue(state.badge!.signup, player) === undefined,
      );
      if (waiting) break;
      state.badge!.candidates = [...new Set(
        alivePlayers(state)
          .filter((player) => playerRecordValue(state.badge!.signup, player) === true)
          .map((player) => player.seat),
      )].sort((left, right) => left - right);
      if (state.badge!.candidates.length) setupSpeech(state, "DAY_BADGE_SPEECH");
      else setupOrdinaryDaySpeech(state);
      continue;
    }

    if (isSpeechPhase(state.phase)) {
      const speechPhase = state.phase;
      if (!autoSpeech(state, autoAi)) break;
      if (state.phase !== speechPhase) continue;
      if (state.phase === "DAY_LAST_WORDS") {
        finishLastWords(state);
        continue;
      }
      if (state.phase === "DAY_BADGE_SPEECH") {
        state.badge!.votes = {};
        state.submittedSeats![state.phase] = [];
        state.phase = "DAY_BADGE_ELECTION";
      } else if (state.phase === "DAY_PK_SPEECH" && state.pkSource === "badge") {
        state.badge!.votes = {};
        state.submittedSeats!.DAY_BADGE_ELECTION = [];
        state.phase = "DAY_BADGE_ELECTION";
      } else {
        state.votes = {};
        state.submittedSeats!.DAY_VOTE = [];
        state.phase = "DAY_VOTE";
      }
      continue;
    }

    if (state.phase === "DAY_BADGE_ELECTION") {
      for (const player of autoAi ? eligibleBadgeVoters(state).filter((item) => item.kind === "ai") : []) {
        if (playerRecordValue(state.badge!.votes, player) === undefined) {
          state.badge!.votes[playerKey(player)] =
            chooseAiTarget(state, player, state.badge!.candidates) ??
            state.badge!.candidates[0];
          markSubmitted(state, player);
        }
      }
      if (
        eligibleBadgeVoters(state).some(
          (player) => playerRecordValue(state.badge!.votes, player) === undefined,
        )
      ) break;
      resolveBadgeElection(state);
      continue;
    }

    if (state.phase === "DAY_VOTE") {
      for (const player of autoAi ? eligibleDayVoters(state).filter((item) => item.kind === "ai") : []) {
        if (playerRecordValue(state.votes, player) === undefined) {
          const targets = state.pkTargets!.length
            ? state.pkTargets!
            : alivePlayers(state).map((item) => item.seat);
          state.votes![playerKey(player)] =
            chooseAiTarget(state, player, targets) ?? -1;
          markSubmitted(state, player);
        }
      }
      if (
        eligibleDayVoters(state).some(
          (player) => playerRecordValue(state.votes, player) === undefined,
        )
      ) break;
      resolveDayVote(state);
      continue;
    }

    if (state.phase === "HUNTER_SHOOT" || state.phase === "BADGE_TRANSFER") {
      if (autoSpecial(state, autoAi)) continue;
      break;
    }
    break;
  }

  return state;
}

/** 返回当前规则阶段中等待模型决策的 AI。 */
export function listPendingMultiplayerAiActions(
  input: MultiplayerServerState,
): PendingMultiplayerAiAction[] {
  const state = cloneState(input);
  return state.players
    .filter((player) => player.kind === "ai")
    .map((player) => ({
      seat: player.seat,
      actions: allowedActions(state, player),
      eligibleTargets: eligibleTargets(state, player),
    }))
    .filter((item) => item.actions.length > 0);
}

/**
 * 应用一条已经由模型生成并通过规则校验的 AI 指令。
 * AI 指令属于同一次房间事务，不单独推进房间 CAS 版本。
 */
export function applyMultiplayerAiCommand(
  input: MultiplayerServerState,
  seat: number,
  command: MultiplayerGameCommand,
): MultiplayerServerState {
  const state = cloneState(input);
  const actor = state.players.find((player) => player.seat === seat && player.kind === "ai");
  if (!actor) throw new Error("FORBIDDEN");
  const originalVersion = state.version ?? 0;
  const syntheticUserId = `__multiplayer_ai__:${seat}`;
  const aiCommandId = command.commandId || `ai:${state.day}:${state.phase}:${seat}`;
  actor.userId = syntheticUserId;
  const next = applyMultiplayerGameCommand(
    state,
    syntheticUserId,
    {
      ...command,
      roomId: state.roomId ?? command.roomId,
      expectedVersion: originalVersion,
      commandId: aiCommandId,
    },
    { autoAi: false },
  );
  const resolvedActor = next.players.find((player) => player.userId === syntheticUserId);
  if (resolvedActor) resolvedActor.userId = null;
  next.version = originalVersion;
  next.processedCommandIds = (next.processedCommandIds ?? []).filter(
    (commandId) => commandId !== aiCommandId,
  );
  return next;
}

function attachAiProfile(player: MultiplayerServerPlayer, seed: string): void {
  const identity = AI_IDENTITIES[(hashSeed(`${seed}:${player.seat}`) + player.seat) % AI_IDENTITIES.length];
  player.aiProfile ??= {
    styleLabel: identity.styleLabel,
    personality: identity.personality,
    reasoningStyle: identity.reasoningStyle,
    riskStyle: identity.riskStyle,
  };
}

/** 真人离开或超时后转为同座位 AI，角色与牌局信息保持不变。 */
export function takeOverMultiplayerPlayer(
  input: MultiplayerServerState,
  userId: string,
  reason: "left" | "timeout" = "left",
): MultiplayerServerState {
  const state = cloneState(input);
  const player = actorFor(state, userId);
  if (!player) return state;
  player.kind = "ai";
  player.userId = null;
  attachAiProfile(player, state.seed ?? state.roomId ?? "multiplayer");
  systemMessage(
    state,
    reason === "timeout"
      ? `${seatName(state, player.seat)} 操作超时，已由 AI 接管`
      : `${seatName(state, player.seat)} 已离开，座位由 AI 接管`,
  );
  return advanceMultiplayerGame(state, { autoAi: false });
}

/** 超时只切换托管身份，具体行动仍必须经过模型决策器。 */
export function takeOverTimedOutMultiplayerPlayers(
  input: MultiplayerServerState,
): MultiplayerServerState {
  let state = cloneState(input);
  const userIds = state.players
    .filter((player) => player.kind === "human" && player.userId && allowedActions(state, player).length > 0)
    .map((player) => player.userId as string);
  for (const userId of userIds) state = takeOverMultiplayerPlayer(state, userId, "timeout");
  return state;
}

/** 为真人待操作阶段设置稳定截止时间；同一阶段同步不会延长倒计时。 */
export function stampMultiplayerDeadline(
  input: MultiplayerServerState,
  now: Date,
  actionTimeoutMs = 90_000,
  speechTimeoutMs = 120_000,
): MultiplayerServerState {
  const state = cloneState(input);
  const waitingForHuman = state.players.some(
    (player) => player.kind === "human" && allowedActions(state, player).length > 0,
  );
  if (!waitingForHuman || state.phase === "GAME_END") {
    state.turnKey = null;
    state.deadlineAt = null;
    return state;
  }
  const turnKey = `${state.day}:${state.phase}:${state.currentSpeakerSeat ?? "all"}`;
  if (state.turnKey !== turnKey || !state.deadlineAt) {
    state.turnKey = turnKey;
    state.deadlineAt = new Date(
      now.getTime() + (isSpeechPhase(state.phase) ? speechTimeoutMs : actionTimeoutMs),
    ).toISOString();
  }
  return state;
}
