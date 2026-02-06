# 复盘报告信息结构

## 核心数据模型 `GameAnalysisData`

```typescript
interface GameAnalysisData {
  gameId: string;           // 游戏唯一标识
  timestamp: number;        // 时间戳
  duration: number;         // 游戏时长(秒)
  playerCount: number;      // 玩家人数
  result: "village_win" | "wolf_win";  // 游戏结果

  awards: {                 // 奖项
    mvp: PlayerAward;       // 最佳表现
    svp: PlayerAward;       // 虽败犹荣
  };

  timeline: TimelineEntry[];      // 时间线(每日事件)
  players: PlayerSnapshot[];      // 玩家快照列表
  roundStates: RoundState[];      // 回合状态列表
  personalStats: PersonalStats;   // 个人统计(当前用户)
  reviews: PlayerReview[];        // 玩家评价列表
}
```

---

## 个人统计 `PersonalStats`

```typescript
interface PersonalStats {
  role: Role;               // 角色: Werewolf | Seer | Witch | Hunter | Guard | Villager
  userName: string;         // 用户名
  avatar: string;           // 头像种子
  alignment: Alignment;     // 阵营: "village" | "wolf"
  tags: string[];           // 称号列表
  radarStats: RadarStats;   // 雷达图数据
  highlightQuote: string;   // 金句
  totalScore: number;       // 综合评分
}
```

### 雷达图数据 `RadarStats`

| 字段 | 好人阵营 | 狼人阵营 |
|------|----------|----------|
| `logic` | 逻辑严密 | 逻辑严密 |
| `speech` | 发言清晰 | 发言清晰 |
| `survival` | 存活评分 | 存活评分 |
| `skillOrHide` | 技能价值 | 隐匿程度 |
| `voteOrTicket` | 投票准确 | 冲票贡献 |

---

## 时间线 `TimelineEntry`

```typescript
interface TimelineEntry {
  day: number;                    // 天数
  summary: string;                // 当日摘要
  nightEvents: NightEvent[];      // 夜间事件
  dayEvents: DayEvent[];          // 白天事件
  dayPhases?: DayPhase[];         // 白天阶段(警长竞选/讨论/PK)
  speeches?: PlayerSpeech[];      // 发言记录
}
```

### 夜间事件 `NightEvent`

| type | 含义 |
|------|------|
| `kill` | 狼人击杀 |
| `save` | 女巫解药 |
| `poison` | 女巫毒药 |
| `check` | 预言家查验 |
| `guard` | 守卫守护 |

```typescript
interface NightEvent {
  type: NightEventType;
  source: string;       // 来源(座位号/角色)
  target: string;       // 目标(座位号)
  result?: string;      // 结果(如查验结果)
  blocked?: boolean;    // 是否被阻止
}
```

### 白天事件 `DayEvent`

| type | 含义 |
|------|------|
| `exile` | 放逐 |
| `badge` | 警长竞选 |
| `hunter_shot` | 猎人开枪 |

```typescript
interface DayEvent {
  type: DayEventType;
  target: string;           // 目标(座位号)
  voteCount?: number;       // 票数
  votes?: VoteRecord[];     // 投票详情
}
```

### 白天阶段 `DayPhase`

```typescript
interface DayPhase {
  type: "election" | "discussion" | "pk";  // 警长竞选 | 讨论 | PK
  summary?: string;                        // 阶段摘要
  speeches?: PlayerSpeech[];               // 发言记录
  event?: DayEvent;                        // 阶段结果事件
  hunterEvent?: DayEvent;                  // 猎人开枪事件
}
```

---

## 玩家快照 `PlayerSnapshot`

```typescript
interface PlayerSnapshot {
  playerId: string;
  seat: number;                 // 座位号(0-indexed)
  name: string;
  avatar: string;
  role: Role;
  alignment: Alignment;
  isAlive: boolean;
  deathDay?: number;            // 死亡天数
  deathCause?: DeathCause;      // 死亡原因
  isSheriff?: boolean;          // 是否警长
  isHumanPlayer?: boolean;      // 是否当前用户
}
```

### 死亡原因 `DeathCause`

| 值 | 含义 |
|----|------|
| `killed` | 被刀 |
| `exiled` | 被票 |
| `poisoned` | 被毒 |
| `shot` | 被枪 |
| `milk` | 毒奶(同守同救) |

---

## 回合状态 `RoundState`

```typescript
interface RoundState {
  day: number;                              // 天数(0=开局)
  phase: "night" | "day";                   // 阶段
  sheriffSeat?: number;                     // 警长座位
  aliveCount: { village: number; wolf: number };  // 存活人数
  players: PlayerSnapshot[];                // 当前回合玩家状态
}
```

---

## 玩家评价 `PlayerReview`

```typescript
interface PlayerReview {
  fromPlayerId: string;
  fromCharacterName: string;    // 评价者名称
  avatar: string;
  content: string;              // 评价内容
  relation: "ally" | "enemy";   // 与当前用户关系
  role: Role;
}
```

---

## 奖项 `PlayerAward`

```typescript
interface PlayerAward {
  playerId: string;
  playerName: string;
  reason: string;       // 获奖理由
  avatar: string;
  role: Role;
}
```

---

## 称号系统

### 称号分类

| 分类 | 称号列表 |
|------|----------|
| **预言家** | 洞悉之眼、初露锋芒、天妒英才 |
| **女巫** | 致命毒药、妙手回春、助纣为虐、误入歧途、药物冲突 |
| **守卫** | 铜墙铁壁、坚实盾牌、生锈盾牌、致命守护 |
| **猎人** | 一枪致命、擦枪走火、仁慈之枪 |
| **狼人** | 孤狼啸月、完美猎杀、演技大师、绝命赌徒、绝地反击、出师未捷、嗜血猎手、长夜难明 |
| **通用** | 明察秋毫、随波逐流、全场划水、待评估 |

### 称号获取条件

| 称号 | 条件 |
|------|------|
| 洞悉之眼 | 作为预言家查杀两只狼或以上 |
| 初露锋芒 | 作为预言家查杀一只狼 |
| 天妒英才 | 作为预言家首夜被刀 |
| 致命毒药 | 作为女巫毒死狼人 |
| 妙手回春 | 作为女巫救对人（救了好人） |
| 助纣为虐 | 作为女巫救错人（救了狼） |
| 误入歧途 | 作为女巫毒错人（毒了好人） |
| 药物冲突 | 同守同救导致奶穿 |
| 铜墙铁壁 | 作为守卫成功守卫两人或以上 |
| 坚实盾牌 | 作为守卫成功守卫一人 |
| 生锈盾牌 | 作为守卫从未成功守卫 |
| 致命守护 | 同守同救导致奶穿 |
| 一枪致命 | 作为猎人带走狼人 |
| 擦枪走火 | 作为猎人带走好人 |
| 仁慈之枪 | 作为猎人未开枪 |
| 孤狼啸月 | 狼队友全部出局仅自己存活获胜 |
| 完美猎杀 | 没有狼队友出局赢得胜利 |
| 演技大师 | 悍跳拿到警徽 |
| 绝命赌徒 | 首夜自刀骗药 |
| 绝地反击 | 被预言家查杀后抗推好人 |
| 出师未捷 | 被首验查杀 |
| 嗜血猎手 | 狼人阵营获胜 |
| 长夜难明 | 狼人阵营失败 |
| 明察秋毫 | 投票准确率≥50% |
| 随波逐流 | 投票准确率在35%~50%之间 |
| 全场划水 | 投票准确率≤35% |

---

## UI 组件结构

```
PostGameAnalysisPage
├── AnalysisHeader          // 顶部导航
├── OverviewCard            // 游戏概览(胜负、MVP/SVP)
├── PersonalStatsCard       // 个人统计(雷达图、称号、金句)
├── IdentityDashboard       // 局势回顾(玩家身份仪表盘)
├── TimelineReview          // 时间线回顾(每日事件)
├── PlayerReviews           // 玩家评价
├── AnalysisFooter          // 底部操作(分享、返回)
├── PlayerDetailModal       // 玩家详情弹窗
└── ShareModal              // 分享弹窗
    └── SharePoster         // 分享海报(radar/portrait两种模式)
```

---

## 数据流

1. **生成**: `generateGameAnalysis()` 从 `GameState` 生成 `GameAnalysisData`
2. **存储**: `gameAnalysisAtom` 使用 localStorage 持久化存储
3. **展示**: `PostGameAnalysisPage` 接收数据并渲染各组件
4. **分享**: `SharePoster` 生成可导出的海报图片
