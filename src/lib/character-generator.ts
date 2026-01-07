import { generateJSON } from "./openrouter";
import { GENERATOR_MODEL, type Persona } from "@/types/game";
import { CHARACTER_GENERATION_PROMPT } from "./prompts";
import { aiLogger } from "./ai-logger";

export interface GeneratedCharacter {
  displayName: string;
  persona: Persona;
}

export interface GeneratedCharacters {
  characters: GeneratedCharacter[];
}

// 默认 persona 模板
const DEFAULT_PERSONAS: Persona[] = [
  { styleLabel: "直率", voiceRules: ["说话直接", "不喜欢绕弯子"], riskBias: "aggressive", backgroundStory: "互联网老玩家" },
  { styleLabel: "谨慎", voiceRules: ["喜欢分析", "常说'我觉得'"], riskBias: "safe", backgroundStory: "理工科学生" },
  { styleLabel: "随和", voiceRules: ["语气温和", "常用'哈哈'"], riskBias: "balanced", backgroundStory: "上班族" },
  { styleLabel: "热情", voiceRules: ["积极发言", "喜欢带节奏"], riskBias: "aggressive", backgroundStory: "游戏主播" },
  { styleLabel: "冷静", voiceRules: ["逻辑清晰", "很少用表情"], riskBias: "safe", backgroundStory: "程序员" },
  { styleLabel: "活泼", voiceRules: ["语气俏皮", "爱用表情包"], riskBias: "balanced", backgroundStory: "大学生" },
  { styleLabel: "老练", voiceRules: ["经验丰富", "喜欢总结"], riskBias: "balanced", backgroundStory: "狼人杀老手" },
  { styleLabel: "佛系", voiceRules: ["不争不抢", "常说'都行'"], riskBias: "safe", backgroundStory: "随缘玩家" },
  { styleLabel: "激进", voiceRules: ["敢冲敢打", "语速快"], riskBias: "aggressive", backgroundStory: "电竞选手" },
];

// 默认名字池
const DEFAULT_NAMES = [
  "小明不想上班", "阿强爱吃肉", "老王今天加班", "小红很开心",
  "大白兔奶糖", "睡不醒的猫", "佛系玩家007", "今天也要加油",
  "随便起个名", "不知道叫啥", "摸鱼达人", "肝帝本帝",
];

export async function generateCharacters(
  apiKey: string,
  count: number
): Promise<GeneratedCharacter[]> {
  const prompt = CHARACTER_GENERATION_PROMPT(count);
  const startTime = Date.now();

  try {
    const result = await generateJSON<GeneratedCharacters | GeneratedCharacter[] | string[]>(apiKey, {
      model: GENERATOR_MODEL,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.95,
    });

    let characters: GeneratedCharacter[];

    // 处理不同的返回格式
    if (result && typeof result === "object" && "characters" in result && Array.isArray(result.characters)) {
      // 正常格式: { characters: [...] }
      characters = result.characters;
    } else if (Array.isArray(result)) {
      // 模型返回了数组
      if (result.length > 0 && typeof result[0] === "string") {
        // 只返回了名字数组，需要补充 persona
        characters = (result as string[]).map((name, i) => ({
          displayName: name,
          persona: DEFAULT_PERSONAS[i % DEFAULT_PERSONAS.length],
        }));
      } else if (result.length > 0 && typeof result[0] === "object" && "displayName" in result[0]) {
        // 返回了角色对象数组但没有包装
        characters = result as GeneratedCharacter[];
      } else {
        throw new Error("Unexpected array format");
      }
    } else {
      throw new Error("Unexpected response format");
    }

    // 验证每个角色都有必要字段
    characters = characters.map((char, i) => ({
      displayName: char.displayName || DEFAULT_NAMES[i % DEFAULT_NAMES.length],
      persona: char.persona || DEFAULT_PERSONAS[i % DEFAULT_PERSONAS.length],
    }));

    aiLogger.log({
      type: "character_generation",
      request: { 
        model: GENERATOR_MODEL,
        messages: [{ role: "user", content: prompt }],
      },
      response: { 
        content: JSON.stringify(characters.map(c => c.displayName)), 
        duration: Date.now() - startTime 
      },
    });

    return characters;
  } catch (error) {
    console.error("Character generation failed, using fallback:", error);
    
    // 使用默认角色作为降级方案
    const fallbackCharacters: GeneratedCharacter[] = [];
    const shuffledNames = [...DEFAULT_NAMES].sort(() => Math.random() - 0.5);
    const shuffledPersonas = [...DEFAULT_PERSONAS].sort(() => Math.random() - 0.5);
    
    for (let i = 0; i < count; i++) {
      fallbackCharacters.push({
        displayName: shuffledNames[i % shuffledNames.length],
        persona: shuffledPersonas[i % shuffledPersonas.length],
      });
    }

    aiLogger.log({
      type: "character_generation",
      request: { 
        model: GENERATOR_MODEL,
        messages: [{ role: "user", content: prompt }],
      },
      response: { 
        content: JSON.stringify(fallbackCharacters.map(c => c.displayName)), 
        duration: Date.now() - startTime 
      },
      error: String(error),
    });

    return fallbackCharacters;
  }
}
