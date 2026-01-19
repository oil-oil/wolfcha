/**
 * AI 模型配置参数
 * 用于统一管理不同场景下的模型温度（Temperature）和其他参数
 */

export const AI_TEMPERATURE = {
  // 严谨模式：用于 JSON 修复、数据提取、总结历史
  // 要求绝对的准确性和格式依从性
  STRICT: 0.1,

  // 逻辑模式：用于推理、分析、技能决策
  // 需要一定的灵活性来模拟人类思考，但核心逻辑不能崩坏
  LOGIC: 0.4,

  // 平衡模式：默认值
  BALANCED: 0.7,

  // 创意模式：用于发言、对话、遗言
  // 鼓励多样化的表达、语气词、情绪宣泄，模拟真人说话的“不完美感”
  // 提高此值可以解决“说话生硬”的问题
  CREATIVE: 1.1,

  // 狂野模式：用于角色生成、脑洞大开的场景
  // 追求极度的多样性和意想不到的结果
  WILD: 1.2,
} as const;

// 针对特定游戏行为的推荐配置
export const GAME_TEMPERATURE = {
  // 角色生成
  CHARACTER_GENERATION: AI_TEMPERATURE.WILD,
  CHARACTER_REPAIR: AI_TEMPERATURE.STRICT,

  // 游戏总结
  SUMMARY: AI_TEMPERATURE.STRICT,

  // 玩家发言 (用户最关心的部分)
  SPEECH: AI_TEMPERATURE.CREATIVE,
  
  // 玩家行动 (投票、技能)
  // 稍微提高一点点(0.4)，让“蠢萌”或“冲动”角色的行为有概率出现，
  // 但主要还是依靠 Prompt 中的逻辑来驱动
  ACTION: AI_TEMPERATURE.LOGIC,
} as const;
