# 开发者模式 (Dev Mode) 设计文档

为了方便开发调试和测试复杂的游戏逻辑（如毒奶、遗言、特定角色互动），我们需要一个开发者界面来完全控制游戏状态。

## 1. 功能概述

开发者模式将提供一个浮动面板或侧边栏，允许开发者：
- **查看实时状态**：以 JSON 或可视化方式查看当前 `GameState`。
- **配置游戏局**：强制设定每个座位的角色身份。
- **流程控制**：任意跳转游戏阶段（Phase）、天数（Day）。
- **玩家控制**：修改玩家存活状态、强制操作（代替 AI 发言、投票、使用技能）。
- **快速操作**：一键跳过发言等待、一键结算投票。

## 2. 入口与 UI 设计

### 2.1 入口
- 在游戏界面右下角添加一个半透明的 "Dev" 悬浮按钮。
- 点击按钮打开 "开发者控制台" (Sheet 或 Dialog)。
- **安全检查**：仅在 `NODE_ENV === 'development'` 或特定 URL 参数（如 `?dev=true`）下显示。

### 2.2 界面布局
控制台分为以下几个标签页 (Tabs)：
1.  **全局控制 (Global)**：阶段跳转、天数修改、游戏重置。
2.  **玩家管理 (Players)**：列表显示所有玩家，可编辑属性。
3.  **动作模拟 (Actions)**：模拟 AI 行为、强制触发事件。
4.  **状态检视 (Inspector)**：Raw JSON 查看器。

## 3. 详细功能设计

### 3.1 全局控制 (Global Control)
*   **阶段跳转 (Phase Jump)**：
    *   提供一个 `<Select>` 下拉框，列出 `src/types/game.ts` 中定义的所有 `Phase`。
    *   提供 "Jump" 按钮，点击调用 `setGameState` 直接修改 `phase`。
    *   *注意*：跳转可能会导致某些状态不一致（如跳过 Setup 导致没有角色），需提供 "Safe Jump"（尝试自动补全必要状态）或仅作为强制覆盖。
*   **天数修改**：`<Input type="number">` 修改 `state.day`。
*   **游戏流速**：
    *   "Pause/Resume"：暂停/恢复 AI 的自动推进（通过设置一个全局 `isPausedAtom` 拦截 `useGameLogic` 中的 `delay` 或副作用）。
    *   "Instant Mode"：将所有 `delay(ms)` 强制变为 `delay(0)`。

### 3.2 玩家管理 (Player Management)
以表格形式展示 9 名玩家：
*   **基本信息**：座位号、昵称、是否人类。
*   **角色编辑器**：下拉框修改 `role` (Villager, Werewolf, Seer, ...)。
*   **状态控制**：
    *   `alive`: Toggle 开关（复活/杀死）。
    *   `tags`: 标记状态（如 "查验:好人", "被毒" 等，这需要视 `GameState` 结构适配）。
*   **操作**：
    *   "Kill": 立即调用 `killPlayer` 逻辑（触发遗言等副作用）。
    *   "Revive": 复活玩家。

### 3.3 动作模拟 (Action Simulation)
允许开发者代替 AI 执行操作：
*   **强制发言**：选择一个 AI 玩家，输入文本，点击 "Speak"，强制该 AI 发送一条消息并推进发言队列。
*   **强制投票**：在投票阶段，强制指定某 AI 投给某人。
*   **强制夜间行动**：
    *   修改 `nightActions` 对象（如 `wolfTarget`, `guardTarget`）。
    *   例如：直接设置 `wolfTarget = 2`，模拟狼人刀了 3 号。

### 3.4 场景预设 (Scenario Presets)
提供一键设置特定测试场景的按钮：
*   **"毒奶测试"**：
    *   设置 P1=守卫, P2=女巫, P3=狼人, P4=村民。
    *   跳转到 `NIGHT_RESOLVE` 前夕。
    *   设置 `guardTarget=3`, `wolfTarget=3`, `witchSave=true`。
*   **"遗言测试"**：
    *   跳转到 `DAY_VOTE`。
    *   设置票数让 P1 出局。

## 4. 技术实现方案

### 4.1 状态管理
利用 Jotai 的原子性，直接读取和写入 `gameStateAtom`。

```typescript
// src/components/DevTools/DevConsole.tsx
import { useAtom } from "jotai";
import { gameStateAtom } from "@/store/game-machine";

export function DevConsole() {
  const [gameState, setGameState] = useAtom(gameStateAtom);
  
  const jumpToPhase = (phase: Phase) => {
    setGameState(prev => ({ ...prev, phase }));
  };
  
  const killPlayer = (seat: number) => {
    // 复用 existing logic 或手动 patch
    const newPlayers = [...gameState.players];
    newPlayers[seat] = { ...newPlayers[seat], alive: false };
    setGameState(prev => ({ ...prev, players: newPlayers }));
  };
  
  // ...
}
```

### 4.2 组件位置
在 `src/app/game/page.tsx` (或对应的 layout) 中引入 `<DevConsole />`。

### 4.3 必要的重构
为了支持"代替 AI 行动"，可能需要将 `useGameLogic` 中的部分逻辑提取出来，或者在 `useGameLogic` 中监听一个 "DevActionAtom"，当开发者触发操作时，`useGameLogic` 响应并执行对应逻辑（如发言推进）。

或者更简单地，开发者工具直接修改 `gameState` 数据（如直接向 `messages` 数组 push 消息），并手动更新 `currentSpeakerSeat`。

## 5. 开发计划

1.  **Phase 1: 基础控制**
    *   实现悬浮入口和面板骨架。
    *   实现 JSON 查看器。
    *   实现 Phase 跳转和 Day 修改。
2.  **Phase 2: 玩家编辑**
    *   实现玩家列表。
    *   实现修改 Role 和 Alive 状态。
3.  **Phase 3: 高级操作**
    *   实现强制发言（插入 Message）。
    *   实现预设场景（毒奶、多人遗言等）。

## 6. 注意事项
*   开发者工具的操作可能会产生非法的游戏状态（例如在 SETUP 阶段杀死玩家），使用时需知晓风险。
*   修改 `gameState` 后，某些依赖 `useEffect` 的自动逻辑（如 AI 自动发言）可能会被意外触发或打断，建议配合 "Pause AI" 功能使用。
