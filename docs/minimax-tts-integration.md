# MiniMax 语音合成 (TTS) 接入开发文档

## 1. 目标
为狼人杀游戏中的 AI 角色接入 MiniMax 语音合成能力，使 AI 发言时能够播放对应的中文语音，增强游戏沉浸感。语音播放需与 UI 上的“正在说话”状态（TalkingAvatar）同步。

## 2. 技术方案概览

### 2.1 架构设计
由于 MiniMax API 需要 API Key 和 Group ID 等敏感信息，且可能存在跨域问题，建议采用 **BFF (Backend for Frontend)** 模式，通过 Next.js API Route 转发请求。

1.  **前端 (Client)**:
    *   维护音频播放队列，确保语音按顺序播放。
    *   管理播放状态 (`isPlaying`)，驱动头像嘴型动画。
    *   请求 Next.js 内部 API 获取音频。
2.  **后端 (Next.js API Route)**:
    *   Endpoint: `/api/tts`
    *   职责: 接收文本和音色 ID，调用 MiniMax API，返回音频流 (MP3/PCM)。
    *   鉴权: 验证 MiniMax API Key 是否配置。
3.  **MiniMax API**:
    *   **Endpoint**: `https://api.minimaxi.chat/v1/t2a_v2` (T2A V2)
    *   **Model**: 
        *   `speech-01-turbo`: 极速模式，适合实时交互（推荐）。
        *   `speech-2.6-hd`: 高拟真模式，支持情感控制。
    *   **Input**: Text, Voice ID / Timbre ID
    *   **Output**: Audio Stream

### 2.2 数据流向
`GameMaster (生成发言)` -> `Frontend (接收消息)` -> `AudioQueue (加入队列)` -> `Request /api/tts` -> `MiniMax API` -> `Play Audio & Animate Avatar`

## 3. 详细设计

### 3.1 环境变量配置
在 `.env.local` 中添加：
```bash
MINIMAX_API_KEY=your_minimax_api_key
MINIMAX_GROUP_ID=your_minimax_group_id
MINIMAX_TTS_MODEL=speech-01-turbo # 可选: speech-2.6-hd
```

### 3.2 数据模型变更

#### A. 音色配置 (`src/lib/voice-constants.ts`)
创建一个常量文件，定义不同性别和性格对应的 MiniMax 音色 ID。

```typescript
export const VOICE_PRESETS = {
  male: [
    { id: "male-qn-qingse", name: "青涩男大学生", styles: ["calm", "balanced"] },
    { id: "male-qn-jingying", name: "精英男声", styles: ["logic", "aggressive"] },
    // ...更多预设
  ],
  female: [
    { id: "female-shaonv", name: "活力少女", styles: ["cheerful", "aggressive"] },
    { id: "female-yujie", name: "高冷御姐", styles: ["calm", "logic"] },
    // ...更多预设
  ]
};
```

#### B. 扩展 `Persona` 接口 (`src/types/game.ts`)
在 `Persona` 或 `AgentProfile` 中增加 `voiceId` 字段。

```typescript
export interface Persona {
  // ...现有字段
  voiceId?: string; // 分配的 MiniMax 音色 ID
}
```

### 3.3 模块开发步骤

#### Step 1: 角色生成逻辑升级 (`src/lib/character-generator.ts`)
在生成角色 Persona 后，根据角色的 `gender` 和 `styleLabel` (或随机) 从 `VOICE_PRESETS` 中选择一个合适的 `voiceId` 并赋值给角色。

#### Step 2: 实现后端 API (`src/app/api/tts/route.ts`)
实现一个 POST 接口：
*   **Request**: `{ text: string, voiceId: string }`
*   **Logic**:
    1.  校验参数。
    2.  构造 MiniMax T2A 请求（URL: `https://api.minimax.chat/v1/text_to_speech` 或对应版本的 endpoint）。
    3.  Header 中带上 `Authorization: Bearer ${MINIMAX_API_KEY}` 和 `GroupId`.
    4.  将 MiniMax 返回的音频流直接 pipe 给前端响应，或者转为 ArrayBuffer 返回。
*   **Response**: `audio/mpeg` 流。

#### Step 3: 前端音频管理器 (`src/lib/audio-manager.ts`)
创建一个单例或 Hook (`useAudioManager`) 来管理播放队列。
*   **Queue**: 存放待播放的 `{ text, voiceId, playerId }` 任务。
*   **Player**: 使用 `AudioContext` 或 HTML5 `Audio` 元素播放。
*   **Events**: 提供 `onPlayStart(playerId)` 和 `onPlayEnd(playerId)` 回调，用于外部同步 UI 状态。

#### Step 4: UI 集成 (`src/components/game/DialogArea.tsx`)
1.  监听 `gameState.messages` 的变化。
2.  当有新的 AI 消息（非系统消息、非自己）产生时，自动将其加入 `AudioManager` 的播放队列。
3.  利用 `AudioManager` 的回调，设置当前正在说话的玩家 ID (`currentTalkingPlayerId`)。
4.  将 `TalkingAvatar` 的 `isTalking` 属性绑定到 `currentTalkingPlayerId === player.id`。

## 4. 优化与注意事项

1.  **长文本处理**: 狼人杀发言可能较长，MiniMax 可能有长度限制。建议按标点符号分句请求，或者依赖 API 的长文本能力。为了体验，建议**流式播放**（一边接收音频数据一边播放），但这会增加前端开发复杂度。第一阶段可采用“获取完整音频后播放”。
2.  **并发控制**: 确保同一时间只有一个人在说话（音频队列的作用）。
3.  **缓存**: 对于相同的文本（如固定的系统提示音，如果有的话），可以进行浏览器端缓存。但狼人杀动态发言不需要缓存。
4.  **延迟优化**: AI 生成文本是流式的，TTS 也可以配合做流式。即：AI 生成第一句话 -> 立即请求 TTS -> 播放；同时 AI 继续生成第二句话。这需要改造 `GameMaster` 的流式输出逻辑与 TTS 的配合。
    *   *建议 Phase 1*: 等 AI 完整生成一句话（或整个发言）后再请求 TTS。
    *   *建议 Phase 2*: 配合 `streamdown` 或流式文本解析，做到句级实时 TTS。

## 5. 参考资料
*   MiniMax 开放平台文档: [https://platform.minimaxi.com/document/T2A%20V2](https://platform.minimaxi.com/document/T2A%20V2) (请根据最新官方文档调整 API Endpoint)

---
**后续行动**:
1.  获取有效的 MiniMax API Key。
2.  挑选合适的音色 ID 列表。
3.  按上述步骤进行代码实现。
