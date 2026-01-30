# AI Skill System Design Draft

## 1. 核心目标 (Core Objectives)

解决当前 AI 玩家存在的以下问题：
1.  **发言模版化**：缺乏多样性和针对性的战术行为。
2.  **策略不连贯**：例如第一天悍跳预言家，第二天突然忘记自己是预言家，或者发言逻辑前后矛盾。
3.  **缺乏高级战术**：如悍跳 (Fake Claim)、拉踩 (Step/Push)、递话 (Pass Info)、冲票 (Team Vote) 等。

通过引入 **Skill (技能/战术)** 系统，将复杂的战术行为封装为可复用、可持久化的模块。

---

## 2. 核心概念 (Core Concepts)

### 2.1 Skill (技能)
Skill 不仅是 RPG 游戏中的"技能"，更是 AI 的**战术意图 (Strategic Intent)**。
每个 Skill 包含：
-   **Trigger (触发条件)**：何时激活该战术（如：我是狼人 && 此时是警长竞选 && 还没有队友悍跳）。
-   **Persistence (持久化)**：战术状态是否跨回合保留（如：悍跳预言家是一个持续性的身份伪装）。
-   **Prompt Injection (提示词注入)**：技能激活时，向 LLM 注入的具体指令（System/User Prompt）。

### 2.2 SkillStore (技能仓库)
每个玩家 (`Player`) 身上携带一个 `SkillStore`，用于记录当前持有的技能及其状态。

---

## 3. 数据结构设计 (Data Structures)

### 3.1 Skill 定义
```typescript
type SkillType = 
  | "fake_seer_claim"   // 悍跳预言家
  | "aggressive_push"   // 强势拉踩
  | "low_profile"       // 划水/低调
  | "support_leader";   // 帮衬领袖/跟票

interface SkillDefinition {
  id: SkillType;
  name: string;
  description: string;
  
  // 优先级：当多个技能冲突时，高优先级覆盖低优先级
  priority: number; 
  
  // 互斥技能：例如不能同时"悍跳预言家"和"穿女巫衣服"（简化初期逻辑）
  conflictsWith?: SkillType[];
}
```

### 3.2 玩家技能状态
需要在 `Player` 或 `AgentProfile` 中增加字段：

```typescript
// src/types/game.ts

interface SkillState {
  id: SkillType;
  isActive: boolean;
  acquiredAtDay: number;
  
  // 技能的上下文数据
  // 例如：悍跳预言家需要记录"查杀/金水"的历史链条，防止逻辑崩盘
  context?: Record<string, any>; 
}

interface AgentProfile {
  // ... existing fields
  skills: Record<SkillType, SkillState>; // 持有的技能
}
```

---

## 4. 技能生命周期 (Lifecycle)

### 4.1 获取阶段 (Acquisition)
在游戏的关键节点（如：`DAY_START`, `NIGHT_START`, `DAY_BADGE_SIGNUP`），系统会遍历所有可用技能，检查 `Trigger Condition`。

**触发器示例 (伪代码)**：
```typescript
// 技能：悍跳预言家 (Fake Seer Claim)
const FakeSeerSkill: SkillLogic = {
  canAcquire: (player, gameState) => {
    if (player.role !== 'Werewolf') return false;
    if (gameState.day > 1) return false; // 通常首日悍跳
    // 简单的随机策略：30% 概率悍跳，或者如果没有其他队友悍跳
    const teammates = getTeammates(player, gameState);
    const hasJumpingTeammate = teammates.some(p => p.hasSkill('fake_seer_claim'));
    return !hasJumpingTeammate && Math.random() < 0.3;
  }
};
```

### 4.2 保持与遗忘 (Retention & Decay)
-   **Persistent (持久)**：如"悍跳"，一旦获得，除非战术放弃（如退水），否则一直持有。
-   **One-off (一次性)**：如"踩一下某个玩家"，发言后即失效。

### 4.3 提示词注入 (Injection)
在 `generateAISpeech` 阶段，PhaseManager 会读取玩家当前的 `Active Skills`，并生成相应的 Prompt 片段。

**Prompt 注入示例**：
```text
<strategy_override>
【重要战术指令】
你正在执行"悍跳预言家"战术。
1. 必须明确声称自己是预言家 (Seer)。
2. 不要暴露自己是狼人。
3. 你的查验记录如下（必须严格遵守）：
   - 第0晚：查验了 @Player3，是 金水 (Good)。
4. 攻击当前场上的其他预言家起跳者，指责他们是狼人。
</strategy_override>
```

---

## 5. 详细案例：悍跳预言家 (Fake Seer Jump)

**流程：**

1.  **Day 1 - Badge Signup (警上竞选)**
    *   **触发检测**：系统检测到狼人 A 符合悍跳条件。
    *   **状态更新**：给狼人 A 添加 `fake_seer_claim` 技能，并在 Context 中初始化 `fake_check_history` (伪造第一晚验人信息，如：发队友金水，或发后置位查杀)。
    *   **发言生成**：注入 Prompt，强制 AI 按照 Context 中的伪造信息起跳。

2.  **Day 1 - Day Speech (警下发言)**
    *   **持久化检测**：狼人 A 依然持有 `fake_seer_claim`。
    *   **状态更新**：无新动作，或者根据警徽流更新 Context。
    *   **发言生成**：注入 Prompt，继续维持预言家身份，要求大家把警徽给自己。

3.  **Day 2+**
    *   **状态更新**：每天晚上（或白天开始时），技能逻辑需要"生成"昨晚的伪造验人结果，并存入 Context。
    *   **发言生成**：注入 Prompt："昨晚你查验了 X 是 查杀/金水，请报出此信息。"

---

## 6. 系统架构调整建议 (System Architecture Changes)

建议在 `src/game/core/` 下新建 `skills/` 目录：

1.  `SkillRegistry.ts`: 注册所有可用技能。
2.  `SkillManager.ts`: 
    -   `evaluateSkills(player, gameState)`: 评估并分配技能。
    -   `getSkillPrompts(player)`: 获取当前激活技能的 Prompt。
3.  **Hooks Integration**:
    -   在 `GameMaster` 的 `startDay` 或 `enterPhase` 处调用 `evaluateSkills`。
    -   在 `PhaseManager.getPrompt` 中调用 `getSkillPrompts` 并合并到 System Prompt。

## 7. 待确认问题 (Open Questions)

1.  **状态存储位置**：是否直接存 `Player.agentProfile` 还是独立一个 `KnowledgeBase` 结构？
    *   *建议*：存 `Player.agentProfile` 比较简单，随 Player 传递。
2.  **技能冲突解决**：如果 AI 即使被注入了悍跳 Prompt，依然因为温度 (Temperature) 过高而胡言乱语怎么办？
    *   *建议*：使用 `<strategy>` XML 标签包裹强指令，并可能在 System Prompt 头部强调"必须优先执行策略指令"。
3.  **Context 复杂度**：伪造的查验链条需要逻辑自洽（不能查验死人，不能重复查验）。这部分逻辑写在 Skill 的 update 函数里。

---

请确认以上方案是否符合您的预期，或者有无需要调整的细节？
