# 智能跳阶与状态自愈功能需求规格说明书 (Smart Jump & State Self-Healing)

## 1. 概述
### 1.1 背景
在《Wolfcha》开发者模式中，用户可以跳过特定的游戏阶段或天数。然而，简单的阶段切换会导致数据不一致（如跳过了狼人出刀却进入了结算），导致游戏逻辑卡死或产生异常。

### 1.2 目标
实现一套独立于 UI 的状态管理逻辑，在发生非线性阶段跳转时：
- **前跳**：智能补全缺失的关键决策数据。
- **回溯**：物理擦除后续影响，还原环境状态。
- **跨天**：处理死亡、技能消耗等长效状态的同步。

## 2. 核心机制：智能跳转管理器 (SmartJumpManager)

### 2.1 阶段依赖分析
建立 `PhaseDependencyMap`，定义每个阶段所需的“前置必填数据”：
- `NIGHT_RESOLVE`: 需要 `wolfTarget`, `witchSave/Poison`, `guardTarget`。
- `DAY_RESOLVE`: 需要 `votes` 数据。
- `DAY_LAST_WORDS`: 需要明确的处决/死亡目标。

### 2.2 跳转方向判定逻辑
通过比较 `(day, phaseOrder)` 的二元组确定方向：
- `target < current`: 执行 **状态回滚 (Rollback)**。
- `target > current`: 执行 **任务补全 (Task Completion)**。

---

## 3. 详细功能逻辑

### 3.1 状态回滚 (Rollback) - 针对“已发生”阶段
当跳转回过去时，系统需执行“物理擦除”以保证因果链条重置：
- **数据清理**：
  - 重置 `gameState.votes` 为 `{}`。
  - 清理 `gameState.nightActions` 中除了持久性字段（如 `lastGuardTarget`）以外的所有实时选择。
- **重新决策触发**：
  - **示例**：若从“白天发言”跳回“狼人行动”，狼人需重新进行出刀选择，系统会清除原有的 `wolfTarget`。
- **历史擦除**：
  - 从 `nightHistory`, `dayHistory`, `voteHistory` 中删除 `targetPoint` 之后的所有键值对。
- **环境还原**：
  - **死者复活**：将所有在 `targetPoint` 之后死亡的玩家 `alive` 状态设为 `true`。
  - **技能刷新**：将在此之后消耗的 `witchHealUsed`, `witchPoisonUsed` 等设为 `false`。
- **日志与上下文物理过滤 (重点)**：
  - 根据时间戳或索引，从 `messages` 和 `events` 中物理删除不属于该时间点之前的内容。
  - **意义**：确保 AI 在后续生成对话时，不会携带“未来”的记忆（例如 AI 不会记得回滚前已经被处决过的玩家身份）。

### 3.2 任务补全 (Task Completion) - 针对“未发生”阶段
当跳向未来时，系统需确保逻辑链条完整，避免缺失关键变量导致结算崩溃：
- **缺失数据扫描**：
  - 自动识别当前点到目标点之间错过的所有 `actionType !== "none"` 的阶段。
- **补全策略配置**：
  - **Auto-Simulation (自动模拟)**：随机产生结果（如随机杀人）。
  - **Manual-Intervention (人工干预)**：跳转至下一天或跳过必经阶段时，若 `autoFill` 为 `false`，则弹出任务补全界面。
  - **示例**：直接跳转至下一天时，系统会提示：“请选择第一天的投票处决目标”，或者由系统按随机规则自动指定一名出局者。

### 3.3 跨天同步 (Day Synchronization)
- **跳转至下一天**：
  - 系统必须先执行 `resolveNight` 或 `resolveVotes` 的“快速模拟版”，生成历史快照，否则第二天无法获得“昨晚死亡情况”的文本。
- **跳转至上一天**：
  - 完整运行“物理擦除”逻辑，确保 `gameState.day` 与历史记录同步。

---

## 4. 技术实现方案

### 4.1 独立模块设计 (lib/SmartJumpManager.ts)
该模块应为一个纯函数集合，接收旧 `GameState`，返回修复后的新 `GameState`。
```typescript
export function applySmartJump(
  currentState: GameState, 
  target: { day: number; phase: Phase },
  options: { fillMode: 'auto' | 'manual' }
): GameState;
```

### 4.2 拦截器机制
在 `useGameLogic` 的 `setGameState` 或 `jumpToPhase` 入口处增加拦截：
1. 检测到是非线性跳转。
2. 调用 `SmartJumpManager` 计算目标状态。
3. 若需手动补全，阻塞转换并展示 UI 弹窗。
4. 获得数据后，一次性更新 `devMutationId` 触发全场状态重置。

---

## 5. UI/UX 设计要求
- **SmartJumpDialog**：
  - 简洁的列表形式。
  - “一键随机补全”按钮。
  - 状态冲突提示（如：你试图跳回昨天，但这将导致 2 名玩家复活，是否确认？）。

## 6. 验收标准
- **Case 1**: 从第 3 天白头发言跳回第 1 天夜晚，系统能正确复活所有玩家，且 AI 日志不再显示第 2、3 天的内容。
- **Case 2**: 在第 1 天夜晚开始时直接跳到第 2 天开始，系统弹出确认框询问“昨晚谁死了”，用户填完后游戏正常进入“昨晚死亡名单”宣布流程。
- **Case 3**: 在同日内，从投票跳回狼人杀人，`votes` 被清空，允许重新决策。
