import type { GameState, Player, Phase } from "@/types/game";
import { GamePhase } from "../core/GamePhase";
import type { GameAction, GameContext, PromptResult, SystemPromptPart } from "../core/types";
import {
  buildGameContext,
  buildDifficultyDecisionHint,
  getRoleText,
  getWinCondition,
  buildSystemTextFromParts,
} from "@/lib/prompt-utils";
import {
  addSystemMessage,
  generateGuardAction,
  generateSeerAction,
  generateWitchAction,
  generateWolfAction,
  transitionPhase as rawTransitionPhase,
} from "@/lib/game-master";
import { getSystemMessages, getUiText } from "@/lib/game-texts";
import { DELAY_CONFIG, GAME_CONFIG } from "@/lib/game-constants";
import {
  computeUniqueTopSeat,
  delay,
  pickRandomFromTie,
  type FlowToken,
} from "@/lib/game-flow-controller";
import { playNarrator } from "@/lib/narrator-audio-player";
import { getI18n } from "@/i18n/translator";

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
    const { t } = getI18n();
    const speakerSystem = t("speakers.system");
    const systemMessages = getSystemMessages();
    const uiText = getUiText();
    const guard = state.players.find((p) => p.role === "Guard" && p.alive);
    if (!guard) return state;
    let currentState = this.transitionPhase(state, "NIGHT_GUARD_ACTION");
    currentState = addSystemMessage(currentState, systemMessages.guardActionStart);
    runtime.setGameState(currentState);

    if (guard) {
      if (guard.isHuman) {
        runtime.setDialogue(speakerSystem, uiText.waitingGuard, false);
      } else {
        runtime.setIsWaitingForAI(true);
        runtime.setDialogue(speakerSystem, uiText.guardActing, false);
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
    const { t } = getI18n();
    const speakerSystem = t("speakers.system");
    const systemMessages = getSystemMessages();
    const uiText = getUiText();
    let currentState = this.transitionPhase(state, "NIGHT_WOLF_ACTION");
    currentState = addSystemMessage(currentState, systemMessages.wolfActionStart);
    runtime.setGameState(currentState);

    const wolves = currentState.players.filter((p) => p.role === "Werewolf" && p.alive);

    if (wolves.length > 0) {
      const humanWolf = wolves.find((w) => w.isHuman);
      if (humanWolf) {
        runtime.setDialogue(speakerSystem, uiText.waitingWolf, false);
      } else {
        runtime.setIsWaitingForAI(true);
        runtime.setDialogue(speakerSystem, uiText.wolfActing, false);
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
    const { t } = getI18n();
    const speakerSystem = t("speakers.system");
    const systemMessages = getSystemMessages();
    const uiText = getUiText();
    const witch = state.players.find((p) => p.role === "Witch" && p.alive);
    const canWitchAct = witch && (!state.roleAbilities.witchHealUsed || !state.roleAbilities.witchPoisonUsed);
    if (!witch || !canWitchAct) return state;
    let currentState = this.transitionPhase(state, "NIGHT_WITCH_ACTION");
    currentState = addSystemMessage(currentState, systemMessages.witchActionStart);
    runtime.setGameState(currentState);

    if (witch && canWitchAct) {
      if (witch.isHuman) {
        runtime.setDialogue(speakerSystem, uiText.waitingWitch, false);
      } else {
        runtime.setIsWaitingForAI(true);
        runtime.setDialogue(speakerSystem, uiText.witchActing, false);
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
    const { t } = getI18n();
    const speakerSystem = t("speakers.system");
    const systemMessages = getSystemMessages();
    const uiText = getUiText();
    const seer = state.players.find((p) => p.role === "Seer" && p.alive);
    if (!seer) return state;
    let currentState = this.transitionPhase(state, "NIGHT_SEER_ACTION");
    currentState = addSystemMessage(currentState, systemMessages.seerActionStart);
    runtime.setGameState(currentState);

    if (seer) {
      if (seer.isHuman) {
        runtime.setDialogue(speakerSystem, uiText.waitingSeer, false);
      } else {
        runtime.setIsWaitingForAI(true);
        runtime.setDialogue(speakerSystem, uiText.seerChecking, false);
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
    const { t } = getI18n();
    const context = buildGameContext(state, player);
    const seerHistory = state.nightActions.seerHistory || [];
    const checkedSeats = seerHistory.map((h) => h.targetSeat);
    const difficultyHint = buildDifficultyDecisionHint(state.difficulty, player.role);

    const alivePlayers = state.players.filter(
      (p) => p.alive && p.playerId !== player.playerId
    );

    const uncheckedPlayers = alivePlayers.filter((p) => !checkedSeats.includes(p.seat));
    const alreadyChecked = alivePlayers.filter((p) => checkedSeats.includes(p.seat));

    const checkedList = alreadyChecked
      .map((p) => t("promptUtils.gameContext.seatLabel", { seat: p.seat + 1 }))
      .join(t("promptUtils.gameContext.listSeparator"));
    const optionsList = (uncheckedPlayers.length > 0 ? uncheckedPlayers : alivePlayers)
      .map((p) => t("prompts.night.option", { seat: p.seat + 1, name: p.displayName }))
      .join(t("promptUtils.gameContext.listSeparator"));

    const cacheableContent = t("prompts.night.seer.base", {
      seat: player.seat + 1,
      name: player.displayName,
      role: getRoleText("Seer"),
      winCondition: getWinCondition("Seer"),
      difficultyHint,
    });

    const dynamicContent = t("prompts.night.seer.task", {
      checkedLine: alreadyChecked.length > 0 ? t("prompts.night.seer.checkedLine", { list: checkedList }) : "",
      options: optionsList,
    });

    const systemParts: SystemPromptPart[] = [
      { text: cacheableContent, cacheable: true, ttl: "1h" },
      { text: dynamicContent },
    ];
    const system = buildSystemTextFromParts(systemParts);

    const user = t("prompts.night.seer.user", { context });

    return { system, user, systemParts };
  }

  private buildWolfPrompt(
    state: GameContext["state"],
    player: Player,
    existingVotes: Record<string, number>
  ): PromptResult {
    const { t } = getI18n();
    const context = buildGameContext(state, player);
    const difficultyHint = buildDifficultyDecisionHint(state.difficulty, player.role);
    // 狼人可以刀任何存活玩家（包括队友和自己），但通常刀好人
    const alivePlayers = state.players.filter((p) => p.alive);
    const teammates = state.players.filter(
      (p) => p.role === "Werewolf" && p.playerId !== player.playerId && p.alive
    );

    const teammateVotesStr = teammates
      .map((teammate) => {
        const vote = existingVotes[teammate.playerId];
        if (vote === undefined) return null;
        const target = state.players.find((p) => p.seat === vote);
        return t("prompts.night.wolf.voteLine", {
          seat: teammate.seat + 1,
          name: teammate.displayName,
          targetSeat: vote + 1,
          targetName: target ? t("prompts.night.optionName", { name: target.displayName }) : "",
        });
      })
      .filter(Boolean)
      .join("\n");

    const identitySection = t("prompts.night.wolf.base", {
      seat: player.seat + 1,
      name: player.displayName,
      role: getRoleText("Werewolf"),
    });
    const teammateLine = teammates.length > 0
      ? t("prompts.night.wolf.teammates", {
        list: teammates
          .map((teammate) =>
            t("promptUtils.gameContext.seatName", { seat: teammate.seat + 1, name: teammate.displayName })
          )
          .join(t("promptUtils.gameContext.listSeparator")),
      })
      : t("prompts.night.wolf.solo");
    const cacheableRules = t("prompts.night.wolf.rules", {
      winCondition: getWinCondition("Werewolf"),
      difficultyHint,
    });
    const teammateVotesSection = teammateVotesStr
      ? t("prompts.night.wolf.teammateVotes", { lines: teammateVotesStr })
      : "";
    const taskSection = t("prompts.night.wolf.task", {
      teammateVotesSection,
      options: alivePlayers
        .map((p) => t("prompts.night.option", { seat: p.seat + 1, name: p.displayName }))
        .join(t("promptUtils.gameContext.listSeparator")),
    });

    const systemParts: SystemPromptPart[] = [
      { text: identitySection, cacheable: true, ttl: "1h" },
      { text: teammateLine },
      { text: cacheableRules, cacheable: true, ttl: "1h" },
      { text: taskSection },
    ];
    const system = buildSystemTextFromParts(systemParts);

    const user = t("prompts.night.wolf.user", { context });

    return { system, user, systemParts };
  }

  private buildGuardPrompt(state: GameContext["state"], player: Player): PromptResult {
    const { t } = getI18n();
    const context = buildGameContext(state, player);
    const alivePlayers = state.players.filter((p) => p.alive);
    const lastTarget = state.nightActions.lastGuardTarget;
    const difficultyHint = buildDifficultyDecisionHint(state.difficulty, player.role);

    const cacheableContent = t("prompts.night.guard.base", {
      seat: player.seat + 1,
      name: player.displayName,
      role: getRoleText("Guard"),
      winCondition: getWinCondition("Guard"),
      difficultyHint,
    });
    const options = alivePlayers
      .filter((p) => p.seat !== lastTarget)
      .map((p) => t("prompts.night.option", { seat: p.seat + 1, name: p.displayName }))
      .join(t("promptUtils.gameContext.listSeparator"));
    const lastTargetLine =
      lastTarget !== undefined ? t("prompts.night.guard.lastTarget", { seat: lastTarget + 1 }) : "";
    const dynamicContent = t("prompts.night.guard.task", {
      options,
      lastTargetLine,
    });
    const systemParts: SystemPromptPart[] = [
      { text: cacheableContent, cacheable: true, ttl: "1h" },
      { text: dynamicContent },
    ];
    const system = buildSystemTextFromParts(systemParts);

    const user = t("prompts.night.guard.user", { context });

    return { system, user, systemParts };
  }

  private buildWitchPrompt(
    state: GameContext["state"],
    player: Player,
    wolfTarget: number | undefined
  ): PromptResult {
    const { t } = getI18n();
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

    const cacheableContent = t("prompts.night.witch.base", {
      seat: player.seat + 1,
      name: player.displayName,
      role: getRoleText("Witch"),
      winCondition: getWinCondition("Witch"),
      difficultyHint,
    });
    const statusHeal = state.roleAbilities.witchHealUsed
      ? t("promptUtils.gameContext.used")
      : t("promptUtils.gameContext.available");
    const statusPoison = state.roleAbilities.witchPoisonUsed
      ? t("promptUtils.gameContext.used")
      : t("promptUtils.gameContext.available");
    const tonightInfo = victimInfo
      ? t("prompts.night.witch.victimLine", { seat: wolfTarget! + 1, name: victimInfo.displayName })
      : state.roleAbilities.witchHealUsed
        ? t("prompts.night.witch.noSense")
        : t("prompts.night.witch.noAttack");
    const saveLine = canSave
      ? t("prompts.night.witch.saveOption", { seat: wolfTarget! + 1 })
      : isWitchTheVictim
        ? t("prompts.night.witch.noSelfSave")
        : t("prompts.night.witch.noSave");
    const poisonLine = canPoison ? t("prompts.night.witch.poisonOption") : t("prompts.night.witch.noPoison");
    const poisonTargets = alivePlayers
      .map((p) => t("promptUtils.gameContext.seatLabel", { seat: p.seat + 1 }))
      .join(t("promptUtils.gameContext.listSeparator"));
    const dynamicContent = t("prompts.night.witch.task", {
      healStatus: statusHeal,
      poisonStatus: statusPoison,
      tonightInfo,
      saveLine,
      poisonLine,
      poisonTargets,
    });
    const systemParts: SystemPromptPart[] = [
      { text: cacheableContent, cacheable: true, ttl: "1h" },
      { text: dynamicContent },
    ];
    const system = buildSystemTextFromParts(systemParts);

    const user = t("prompts.night.witch.user", { context });

    return { system, user, systemParts };
  }
}
