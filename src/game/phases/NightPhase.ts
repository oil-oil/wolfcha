import type { GameState, Player, Phase } from "@/types/game";
import { GamePhase } from "../core/GamePhase";
import type { GameAction, GameContext, PromptResult } from "../core/types";
import {
  buildGameContext,
  buildDifficultyDecisionHint,
  getRoleText,
  getWinCondition,
} from "@/lib/prompt-utils";
import {
  addSystemMessage,
  generateGuardAction,
  generateSeerAction,
  generateWitchAction,
  generateWolfAction,
  transitionPhase as rawTransitionPhase,
} from "@/lib/game-master";
import { SYSTEM_MESSAGES, UI_TEXT } from "@/lib/game-texts";
import { DELAY_CONFIG, GAME_CONFIG } from "@/lib/game-constants";
import {
  computeUniqueTopSeat,
  delay,
  pickRandomFromTie,
  type FlowToken,
} from "@/lib/game-flow-controller";
import { playNarrator } from "@/lib/narrator-audio-player";

type NightPhaseRuntime = {
  token: FlowToken;
  setGameState: (value: GameState | ((prev: GameState) => GameState)) => void;
  setDialogue: (speaker: string, text: string, isStreaming?: boolean) => void;
  setIsWaitingForAI: (waiting: boolean) => void;
  waitForUnpause: () => Promise<void>;
  isTokenValid: (token: FlowToken) => boolean;
  onNightComplete: (state: GameState) => Promise<void>;
};

export class NightPhase extends GamePhase {
  async onEnter(_context: GameContext): Promise<void> {
    return;
  }

  getPrompt(context: GameContext, player: Player): PromptResult {
    const state = context.state;
    const extras = context.extras ?? {};

    switch (state.phase) {
      case "NIGHT_GUARD_ACTION":
        return this.buildGuardPrompt(state, player);
      case "NIGHT_WOLF_ACTION":
        return this.buildWolfPrompt(
          state,
          player,
          (extras.existingVotes as Record<string, number> | undefined) ?? {}
        );
      case "NIGHT_WITCH_ACTION":
        return this.buildWitchPrompt(
          state,
          player,
          extras.wolfTarget as number | undefined
        );
      case "NIGHT_SEER_ACTION":
        return this.buildSeerPrompt(state, player);
      default:
        return this.buildWolfPrompt(state, player, {});
    }
  }

  async handleAction(_context: GameContext, _action: GameAction): Promise<void> {
    const runtime = this.getRuntime(_context);
    if (!runtime) return;

    if (_action.type === "START_NIGHT") {
      await this.runNightPhase(_context.state, runtime);
      return;
    }
    if (_action.type === "CONTINUE_NIGHT_AFTER_GUARD") {
      await this.continueNightAfterGuard(_context.state, runtime);
      return;
    }
    if (_action.type === "CONTINUE_NIGHT_AFTER_WOLF") {
      await this.continueNightAfterWolf(_context.state, runtime);
      return;
    }
    if (_action.type === "CONTINUE_NIGHT_AFTER_WITCH") {
      await this.continueNightAfterWitch(_context.state, runtime);
      return;
    }
  }

  async onExit(_context: GameContext): Promise<void> {
    return;
  }

  private getRuntime(context: GameContext): NightPhaseRuntime | null {
    const raw = context.extras as NightPhaseRuntime | undefined;
    if (!raw) return null;
    if (!raw.setGameState || !raw.setDialogue || !raw.waitForUnpause || !raw.isTokenValid) return null;
    return raw;
  }

  private transitionPhase(state: GameState, newPhase: Phase): GameState {
    return rawTransitionPhase(state, newPhase);
  }

  private async runGuardAction(state: GameState, runtime: NightPhaseRuntime): Promise<GameState> {
    let currentState = this.transitionPhase(state, "NIGHT_GUARD_ACTION");
    currentState = addSystemMessage(currentState, SYSTEM_MESSAGES.guardActionStart);
    runtime.setGameState(currentState);

    const guard = currentState.players.find((p) => p.role === "Guard" && p.alive);

    if (guard) {
      if (guard.isHuman) {
        runtime.setDialogue("系统", UI_TEXT.waitingGuard, false);
      } else {
        runtime.setIsWaitingForAI(true);
        runtime.setDialogue("系统", UI_TEXT.guardActing, false);
      }

      await playNarrator("guardWake");

      if (guard.isHuman) {
        return currentState;
      }

      const guardTarget = await generateGuardAction(currentState, guard);
      await runtime.waitForUnpause();

      if (!runtime.isTokenValid(runtime.token)) return currentState;

      currentState = {
        ...currentState,
        nightActions: { ...currentState.nightActions, guardTarget },
      };
      runtime.setGameState(currentState);
      runtime.setIsWaitingForAI(false);

      await playNarrator("guardClose");
    }

    return currentState;
  }

  private async runWolfAction(state: GameState, runtime: NightPhaseRuntime): Promise<GameState> {
    let currentState = this.transitionPhase(state, "NIGHT_WOLF_ACTION");
    currentState = addSystemMessage(currentState, SYSTEM_MESSAGES.wolfActionStart);
    runtime.setGameState(currentState);

    const wolves = currentState.players.filter((p) => p.role === "Werewolf" && p.alive);

    if (wolves.length > 0) {
      const humanWolf = wolves.find((w) => w.isHuman);
      if (humanWolf) {
        runtime.setDialogue("系统", UI_TEXT.waitingWolf, false);
      } else {
        runtime.setIsWaitingForAI(true);
        runtime.setDialogue("系统", UI_TEXT.wolfActing, false);
      }

      await playNarrator("wolfWake");

      if (humanWolf) {
        return currentState;
      }

      let wolfVotes: Record<string, number> = {};
      try {
        for (let round = 1; round <= GAME_CONFIG.MAX_REVOTE_COUNT; round++) {
          wolfVotes = {};
          for (const wolf of wolves) {
            const targetSeat = await generateWolfAction(currentState, wolf, wolfVotes);
            await runtime.waitForUnpause();
            if (!runtime.isTokenValid(runtime.token)) return currentState;
            wolfVotes[wolf.playerId] = targetSeat;
          }

          const chosenSeat = computeUniqueTopSeat(wolfVotes);
          currentState = {
            ...currentState,
            nightActions: { ...currentState.nightActions, wolfVotes, wolfTarget: chosenSeat ?? undefined },
          };
          runtime.setGameState(currentState);

          if (chosenSeat !== null) break;
          await delay(600);
        }
      } catch (error) {
        console.error("[wolfcha] AI wolf vote failed:", error);
        const villagers = currentState.players.filter((p) => p.alive && p.alignment === "village");
        const fallbackSeat = villagers.length > 0
          ? villagers[Math.floor(Math.random() * villagers.length)].seat
          : 0;
        currentState = {
          ...currentState,
          nightActions: { ...currentState.nightActions, wolfVotes, wolfTarget: fallbackSeat },
        };
        runtime.setGameState(currentState);
      }

      if (currentState.nightActions.wolfTarget === undefined) {
        const fallbackSeat = pickRandomFromTie(wolfVotes);
        currentState = {
          ...currentState,
          nightActions: { ...currentState.nightActions, wolfVotes, wolfTarget: fallbackSeat },
        };
        runtime.setGameState(currentState);
      }

      runtime.setIsWaitingForAI(false);

      await playNarrator("wolfClose");
    }

    return currentState;
  }

  private async runWitchAction(state: GameState, runtime: NightPhaseRuntime): Promise<GameState> {
    let currentState = this.transitionPhase(state, "NIGHT_WITCH_ACTION");
    currentState = addSystemMessage(currentState, SYSTEM_MESSAGES.witchActionStart);
    runtime.setGameState(currentState);

    const witch = currentState.players.find((p) => p.role === "Witch" && p.alive);
    const canWitchAct = witch && (!currentState.roleAbilities.witchHealUsed || !currentState.roleAbilities.witchPoisonUsed);

    if (witch && canWitchAct) {
      if (witch.isHuman) {
        runtime.setDialogue("系统", UI_TEXT.waitingWitch, false);
      } else {
        runtime.setIsWaitingForAI(true);
        runtime.setDialogue("系统", UI_TEXT.witchActing, false);
      }

      await playNarrator("witchWake");

      if (witch.isHuman) {
        return currentState;
      }

      const witchAction = await generateWitchAction(currentState, witch, currentState.nightActions.wolfTarget);
      await runtime.waitForUnpause();

      if (!runtime.isTokenValid(runtime.token)) return currentState;

      if (witchAction.type === "save") {
        currentState = {
          ...currentState,
          nightActions: { ...currentState.nightActions, witchSave: true },
          roleAbilities: { ...currentState.roleAbilities, witchHealUsed: true },
        };
      } else if (witchAction.type === "poison" && witchAction.target !== undefined) {
        currentState = {
          ...currentState,
          nightActions: { ...currentState.nightActions, witchPoison: witchAction.target },
          roleAbilities: { ...currentState.roleAbilities, witchPoisonUsed: true },
        };
      }
      runtime.setGameState(currentState);
      runtime.setIsWaitingForAI(false);

      await playNarrator("witchClose");
    }

    return currentState;
  }

  private async runSeerAction(state: GameState, runtime: NightPhaseRuntime): Promise<GameState> {
    let currentState = this.transitionPhase(state, "NIGHT_SEER_ACTION");
    currentState = addSystemMessage(currentState, SYSTEM_MESSAGES.seerActionStart);
    runtime.setGameState(currentState);

    const seer = currentState.players.find((p) => p.role === "Seer" && p.alive);

    if (seer) {
      if (seer.isHuman) {
        runtime.setDialogue("系统", UI_TEXT.waitingSeer, false);
      } else {
        runtime.setIsWaitingForAI(true);
        runtime.setDialogue("系统", UI_TEXT.seerChecking, false);
      }

      await playNarrator("seerWake");

      if (seer.isHuman) {
        return currentState;
      }

      const targetSeat = await generateSeerAction(currentState, seer);
      if (!runtime.isTokenValid(runtime.token)) return currentState;

      const targetPlayer = currentState.players.find((p) => p.seat === targetSeat);
      const isWolf = targetPlayer?.role === "Werewolf";

      const seerHistory = currentState.nightActions.seerHistory || [];
      currentState = {
        ...currentState,
        nightActions: {
          ...currentState.nightActions,
          seerTarget: targetSeat,
          seerResult: { targetSeat, isWolf: isWolf || false },
          seerHistory: [...seerHistory, { targetSeat, isWolf: isWolf || false, day: currentState.day }],
        },
      };
      runtime.setGameState(currentState);
      runtime.setIsWaitingForAI(false);

      await playNarrator("seerClose");
    }

    return currentState;
  }

  private async runNightPhase(state: GameState, runtime: NightPhaseRuntime): Promise<void> {
    let currentState = state;

    currentState = await this.runGuardAction(currentState, runtime);
    if (!runtime.isTokenValid(runtime.token)) return;

    const guard = currentState.players.find((p) => p.role === "Guard" && p.alive);
    if (guard?.isHuman && currentState.nightActions.guardTarget === undefined) {
      return;
    }

    await delay(2000);
    await runtime.waitForUnpause();
    if (!runtime.isTokenValid(runtime.token)) return;

    currentState = await this.runWolfAction(currentState, runtime);
    if (!runtime.isTokenValid(runtime.token)) return;

    const humanWolf = currentState.players.find((p) => p.role === "Werewolf" && p.alive && p.isHuman);
    if (humanWolf && currentState.nightActions.wolfTarget === undefined) {
      return;
    }

    await delay(2000);
    await runtime.waitForUnpause();
    if (!runtime.isTokenValid(runtime.token)) return;

    currentState = await this.runWitchAction(currentState, runtime);
    if (!runtime.isTokenValid(runtime.token)) return;

    const witch = currentState.players.find((p) => p.role === "Witch" && p.alive);
    const canWitchAct = witch && (!currentState.roleAbilities.witchHealUsed || !currentState.roleAbilities.witchPoisonUsed);
    if (witch?.isHuman && canWitchAct) {
      const decided =
        currentState.nightActions.witchSave !== undefined ||
        currentState.nightActions.witchPoison !== undefined;
      if (!decided) return;
    }

    await delay(2000);
    await runtime.waitForUnpause();
    if (!runtime.isTokenValid(runtime.token)) return;

    currentState = await this.runSeerAction(currentState, runtime);
    if (!runtime.isTokenValid(runtime.token)) return;

    const seer = currentState.players.find((p) => p.role === "Seer" && p.alive);
    if (seer?.isHuman && currentState.nightActions.seerTarget === undefined) {
      return;
    }

    await delay(DELAY_CONFIG.DIALOGUE);
    await runtime.waitForUnpause();
    if (!runtime.isTokenValid(runtime.token)) return;

    await runtime.onNightComplete(currentState);
  }

  private async continueNightAfterGuard(state: GameState, runtime: NightPhaseRuntime): Promise<void> {
    let currentState = await this.runWolfAction(state, runtime);
    if (!runtime.isTokenValid(runtime.token)) return;

    const humanWolf = currentState.players.find((p) => p.role === "Werewolf" && p.alive && p.isHuman);
    if (humanWolf && currentState.nightActions.wolfTarget === undefined) {
      return;
    }

    await delay(2000);
    await runtime.waitForUnpause();
    if (!runtime.isTokenValid(runtime.token)) return;

    await this.continueNightAfterWolf(currentState, runtime);
  }

  private async continueNightAfterWolf(state: GameState, runtime: NightPhaseRuntime): Promise<void> {
    let currentState = await this.runWitchAction(state, runtime);
    if (!runtime.isTokenValid(runtime.token)) return;

    const witch = currentState.players.find((p) => p.role === "Witch" && p.alive);
    const canWitchAct = witch && (!currentState.roleAbilities.witchHealUsed || !currentState.roleAbilities.witchPoisonUsed);
    if (witch?.isHuman && canWitchAct) {
      const decided =
        currentState.nightActions.witchSave !== undefined ||
        currentState.nightActions.witchPoison !== undefined;
      if (!decided) return;
    }

    await delay(2000);
    await runtime.waitForUnpause();
    if (!runtime.isTokenValid(runtime.token)) return;

    await this.continueNightAfterWitch(currentState, runtime);
  }

  private async continueNightAfterWitch(state: GameState, runtime: NightPhaseRuntime): Promise<void> {
    let currentState = await this.runSeerAction(state, runtime);
    if (!runtime.isTokenValid(runtime.token)) return;

    const seer = currentState.players.find((p) => p.role === "Seer" && p.alive);
    if (seer?.isHuman && currentState.nightActions.seerTarget === undefined) {
      return;
    }

    await delay(2000);
    await runtime.waitForUnpause();
    if (!runtime.isTokenValid(runtime.token)) return;

    await runtime.onNightComplete(currentState);
  }

  private buildSeerPrompt(state: GameContext["state"], player: Player): PromptResult {
    const context = buildGameContext(state, player);
    const seerHistory = state.nightActions.seerHistory || [];
    const checkedSeats = seerHistory.map((h) => h.targetSeat);
    const difficultyHint = buildDifficultyDecisionHint(state.difficulty, player.role);

    const alivePlayers = state.players.filter(
      (p) => p.alive && p.playerId !== player.playerId
    );

    const uncheckedPlayers = alivePlayers.filter((p) => !checkedSeats.includes(p.seat));
    const alreadyChecked = alivePlayers.filter((p) => checkedSeats.includes(p.seat));

    const system = `【身份】
你是 ${player.seat + 1}号「${player.displayName}」
身份: 预言家（好人阵营）

${getWinCondition("Seer")}

${difficultyHint}

【任务】
夜晚查验阶段，选择一名玩家查验身份。
本环节只需要给出座位数字，不要分析，不要角色扮演。
${alreadyChecked.length > 0 ? `\n已查验过: ${alreadyChecked.map((p) => `${p.seat + 1}号`).join(", ")}（不建议重复查验）` : ""}

可选: ${uncheckedPlayers.length > 0 ? uncheckedPlayers.map((p) => `${p.seat + 1}号(${p.displayName})`).join(", ") : alivePlayers.map((p) => `${p.seat + 1}号(${p.displayName})`).join(", ")}
`;

    const user = `${context}

你要查验几号？

【格式】
只回复座位数字，如: 5
不要解释，不要输出多余文字，不要代码块`;

    return { system, user };
  }

  private buildWolfPrompt(
    state: GameContext["state"],
    player: Player,
    existingVotes: Record<string, number>
  ): PromptResult {
    const context = buildGameContext(state, player);
    const difficultyHint = buildDifficultyDecisionHint(state.difficulty, player.role);
    const villagers = state.players.filter((p) => p.alive && p.alignment === "village");
    const teammates = state.players.filter(
      (p) => p.role === "Werewolf" && p.playerId !== player.playerId && p.alive
    );

    const teammateVotesStr = teammates
      .map((t) => {
        const vote = existingVotes[t.playerId];
        if (vote === undefined) return null;
        const target = state.players.find((p) => p.seat === vote);
        return `- ${t.seat + 1}号(${t.displayName}) 想杀: ${vote + 1}号${target ? `(${target.displayName})` : ""}`;
      })
      .filter(Boolean)
      .join("\n");

    const system = `【身份】
你是 ${player.seat + 1}号「${player.displayName}」
身份: 狼人（坏人阵营）
${teammates.length > 0 ? `狼队友: ${teammates.map((t) => `${t.seat + 1}号 ${t.displayName}`).join(", ")}` : "你是唯一存活的狼人"}

${getWinCondition("Werewolf")}

${difficultyHint}

【任务】
夜晚击杀阶段，选择一名好人击杀。
本环节只需要给出座位数字，不要分析，不要角色扮演。
${teammateVotesStr ? `\n【队友意向】\n${teammateVotesStr}\n提示：建议跟随队友集火同一目标！` : ""}

可选: ${villagers.map((p) => `${p.seat + 1}号(${p.displayName})`).join(", ")}
`;

    const user = `${context}

你们要杀几号？

【格式】
只回复座位数字，如: 2
不要解释，不要输出多余文字，不要代码块`;

    return { system, user };
  }

  private buildGuardPrompt(state: GameContext["state"], player: Player): PromptResult {
    const context = buildGameContext(state, player);
    const alivePlayers = state.players.filter((p) => p.alive);
    const lastTarget = state.nightActions.lastGuardTarget;
    const difficultyHint = buildDifficultyDecisionHint(state.difficulty, player.role);

    const system = `【身份】
你是 ${player.seat + 1}号「${player.displayName}」
身份: 守卫（好人阵营）

${getWinCondition("Guard")}

${difficultyHint}

【任务】
夜晚守护阶段，选择一名玩家保护，使其今晚不被狼人杀害。
本环节只需要给出座位数字，不要分析，不要角色扮演。
注意：不能连续两晚保护同一人！
注意：若你守护了刀口且女巫同时使用解药救人，会触发“毒奶/奶穿”，刀口仍会死亡。

可选: ${alivePlayers
      .filter((p) => p.seat !== lastTarget)
      .map((p) => `${p.seat + 1}号(${p.displayName})`)
      .join(", ")}
${lastTarget !== undefined ? `\n上晚保护了${lastTarget + 1}号，今晚不能选` : ""}
`;

    const user = `${context}

你要保护几号？

【格式】
只回复座位数字，如: 3
不要解释，不要输出多余文字，不要代码块`;

    return { system, user };
  }

  private buildWitchPrompt(
    state: GameContext["state"],
    player: Player,
    wolfTarget: number | undefined
  ): PromptResult {
    const context = buildGameContext(state, player);
    const difficultyHint = buildDifficultyDecisionHint(state.difficulty, player.role);
    const alivePlayers = state.players.filter(
      (p) => p.alive && p.playerId !== player.playerId
    );

    const isWitchTheVictim = wolfTarget === player.seat;
    const canSave =
      !state.roleAbilities.witchHealUsed &&
      wolfTarget !== undefined &&
      !isWitchTheVictim;
    const canPoison = !state.roleAbilities.witchPoisonUsed;

    const victimInfo =
      wolfTarget !== undefined && !state.roleAbilities.witchHealUsed
        ? state.players.find((p) => p.seat === wolfTarget)
        : null;

    const system = `【身份】
你是 ${player.seat + 1}号「${player.displayName}」
身份: 女巫（好人阵营）

${getWinCondition("Witch")}

${difficultyHint}

【药水状态】
解药: ${state.roleAbilities.witchHealUsed ? "已使用" : "可用"}
毒药: ${state.roleAbilities.witchPoisonUsed ? "已使用" : "可用"}

【今晚情况】
${victimInfo ? `狼人袭击了 ${wolfTarget! + 1}号 ${victimInfo.displayName}` : state.roleAbilities.witchHealUsed ? "解药已用，无法感知刀口" : "今晚无人被袭击"}

【任务】
决定是否使用药水（每晚最多用一瓶）：
本环节只需要输出指令，不要分析，不要角色扮演。
${canSave ? `- 输入 "save" 使用解药救 ${wolfTarget! + 1}号` : isWitchTheVictim ? "- 女巫不可自救" : "- 解药已用完或无人被杀"}
${canPoison ? `- 输入 "poison X" 毒杀X号玩家（如 "poison 3"）` : "- 毒药已用完"}
- 输入 "pass" 不使用药水
注意：同一晚只能使用一瓶药水！
注意：若守卫守护了刀口且你同时使用解药救人，会触发"毒奶/奶穿"，刀口仍会死亡。

可毒目标: ${alivePlayers.map((p) => `${p.seat + 1}号`).join(", ")}
`;

    const user = `${context}

你要怎么做？

【格式】
回复: save / poison X / pass
只输出上述指令本身，不要解释，不要输出多余文字，不要代码块`;

    return { system, user };
  }
}
