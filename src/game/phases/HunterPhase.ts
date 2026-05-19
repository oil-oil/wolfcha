import type { Player } from "@/types/game";
import { GamePhase } from "../core/GamePhase";
import type { GameContext, PromptResult, SystemPromptPart } from "../core/types";
import {
  buildGameContext,
  getRoleText,
  getWinCondition,
  buildSystemTextFromParts,
} from "@/lib/prompt-utils";
import { getI18n } from "@/i18n/translator";

export class HunterPhase extends GamePhase {
  async onEnter(): Promise<void> {
    return;
  }

  /**
   * 获取猎人的遗言内容（如果有的话）
   * 用于让开枪决策与遗言保持一致
   */
  private getHunterLastWords(context: GameContext, player: Player): string | null {
    const state = context.state;
    // 查找猎人在当天的遗言发言
    const lastWordsMessages = state.messages.filter(
      (m) => !m.isSystem && 
             m.playerId === player.playerId && 
             m.day === state.day &&
             m.phase === "DAY_LAST_WORDS"
    );
    
    if (lastWordsMessages.length === 0) return null;
    
    // 合并所有遗言内容
    return lastWordsMessages.map(m => m.content).join("\n");
  }

  /**
   * 从遗言中提取开枪意图
   */
  private extractShootIntentFromLastWords(lastWords: string): { targetSeat: number | null; hasIntent: boolean } {
    // 匹配常见的开枪表达模式
    const shootPatterns = [
      /开枪.*?(\d+)\s*号/,
      /带走.*?(\d+)\s*号/,
      /打.*?(\d+)\s*号/,
      /(\d+)\s*号.*?开枪/,
      /锁.*?(\d+)\s*号/,
    ];
    
    for (const pattern of shootPatterns) {
      const match = lastWords.match(pattern);
      if (match) {
        const seat = parseInt(match[1], 10);
        if (!isNaN(seat) && seat > 0) {
          return { targetSeat: seat - 1, hasIntent: true }; // 转换为0-indexed
        }
      }
    }
    
    // 检查是否有明确表示不开枪的意图
    if (lastWords.includes("不开枪") || lastWords.includes("pass") || lastWords.includes("放弃开枪")) {
      return { targetSeat: null, hasIntent: true };
    }
    
    return { targetSeat: null, hasIntent: false };
  }

  getPrompt(context: GameContext, player: Player): PromptResult {
    const { t } = getI18n();
    const state = context.state;
    const gameContext = buildGameContext(state, player);
    const alivePlayers = state.players.filter(
      (p) => p.alive && p.playerId !== player.playerId
    );

    // 获取猎人的遗言
    const lastWords = this.getHunterLastWords(context, player);
    const shootIntent = lastWords ? this.extractShootIntentFromLastWords(lastWords) : null;

    const cacheableContent = t("prompts.hunter.base", {
      seat: player.seat + 1,
      name: player.displayName,
      role: getRoleText(player.role),
      winCondition: getWinCondition("Hunter"),
    });
    const options = alivePlayers
      .map((p) => t("prompts.night.option", { seat: p.seat + 1, name: p.displayName }))
      .join(t("promptUtils.gameContext.listSeparator"));
    
    // 如果有遗言，在任务提示中包含遗言内容和开枪意图提示
    let lastWordsSection = "";
    if (lastWords) {
      lastWordsSection = t("prompts.hunter.lastWordsContext", { lastWords });
      if (shootIntent?.hasIntent) {
        if (shootIntent.targetSeat !== null) {
          const targetPlayer = alivePlayers.find(p => p.seat === shootIntent.targetSeat);
          if (targetPlayer) {
            lastWordsSection += "\n" + t("prompts.hunter.lastWordsIntentHint", { 
              seat: shootIntent.targetSeat + 1, 
              name: targetPlayer.displayName 
            });
          }
        } else {
          lastWordsSection += "\n" + t("prompts.hunter.lastWordsPassHint");
        }
      }
    }
    
    const dynamicContent = t("prompts.hunter.task", { options }) + lastWordsSection;
    const systemParts: SystemPromptPart[] = [
      { text: cacheableContent, cacheable: true, ttl: "1h" },
      { text: dynamicContent },
    ];
    const system = buildSystemTextFromParts(systemParts);

    const user = t("prompts.hunter.user", { context: gameContext });

    return { system, user, systemParts };
  }

  async handleAction(): Promise<void> {
    return;
  }

  async onExit(): Promise<void> {
    return;
  }
}
