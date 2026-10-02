# 本局玩家名单驱动的匹配动效

`MatchingAnimation` 保留原来的 48 人 Notionists 行走人群，同时接收本局已确定的玩家名单。行走人群与参赛名单分别维护：开局的随机头像可以保持原来的生成方式。人物停住、移动到左右两列、成为圆形头像的全过程使用同一张 SVG，头像和座位始终使用本局传入的信息。组件只负责动画，可在归位结束后由调用方继续游戏流程。

本局头像已经在人群中时，原来那个人物会获得对应的角色 ID 和座位，继续保持当前位置；朝向需要调整时会原地转身。头像尚未出现时，先加载对应 SVG，再让人物从边缘错峰走进来。参赛人物沿原来的行走高度、大小和方向穿行约 3–5 秒，只在横向逐渐减速、收起原有的轻微行走起伏，再停在画面中部；不会刚进入可见区域就停住。停留时会参考已占用的位置，尽量错开，但允许自然的部分重叠，人物不会为了排队而换层或缩小。每位人物停稳后才计入人数；全部停稳后统一归位，背景人群淡出。其余人继续走动，不参与人数统计，也不会被选作替代角色。两位角色碰巧使用同一个头像时，仍保留各自的人物与座位。

预览地址：`/zh/matching-preview`。顶部保留三个小图标；“演示选项”支持 6–12 人局、导入本局 JSON 名单、模拟等待接口/接口返回、演示人群之外的随机头像和查看原版动画。导入名单会自动演示完整入场，其他按钮可逐位匹配或重新播放。示例名单仅在预览页创建；组件本身不创建虚构的补位玩家，也不调用真实游戏接口。

## 实际开局

普通模式的真人参与和全 AI 对局（现有观战模式）都已接入主页加载流程。真人固定在 1 号位（`seat = 0`），AI 随机分配其余座位；所有人一起沿用开局分配的头像入场，全部归位后才展示真人的身份牌，确认身份后继续游戏。预览页的“进入全 AI 对局”切换到普通观战模式并打开欢迎页；随后按原有登录、次数校验和开局流程进入游戏。使用模型图标的原神模式沿用原来的入场流程。

`useGameLogic.startGame` 在角色生成期间提供空名单，人群继续行走。`generateCharacters` 完成后，使用 `setupPlayers` 最终分配的角色，通过 `createGameMatchingRoster(gameId, players)` 提取公开外观字段。头像种子、性别、座位和自定义角色头像全部沿用游戏结果，不从人群重新抽头像，也不重新生成角色。

`GameMatchingEntrance` 用实际的 `PlayerCardCompact` 作为归位目标，卡片使用与人群相同的透明 SVG 和背景色。转场完成前保持 `LOBBY`；`GameEntryGate` 收到本局完成回调后才提交 `NIGHT_START`、播放旁白并启动 AI 行动。取消、换局或卸载会释放等待并使旧生成结果失效；图片加载失败会提示并返回欢迎页。加载过程中也可通过设置退出。

动画等待状态不写入存档；正在进行的对局刷新恢复时不会重新播放入场。桌面上转场终点与游戏左右栏对齐，移动端直接归位到游戏现有的底部玩家条。窗口跨越移动端断点时，飞行人物继续跟随当前座位的头像元素。归位后的卡片关闭重复的模糊、缩放出现动画，保留同一人物外观和朝向。

## 输入

```ts
import { MatchingAnimation, type MatchingRoster } from "@/components/matching";

const roster: MatchingRoster = {
  roundId: "ai-round-001",
  playerCount: 6,
  participants: [
    { playerId: "ai-1", displayName: "小猹", seat: 0, avatarSeed: "character-a", gender: "male" },
    { playerId: "ai-2", displayName: "阿麦", seat: 1, avatarSeed: "character-b", gender: "female" },
    { playerId: "ai-3", displayName: "晚风", seat: 2, avatarSeed: "character-c", gender: "nonbinary" },
    { playerId: "ai-4", displayName: "桃子", seat: 3, avatarSeed: "character-d", gender: "female" },
    { playerId: "ai-5", displayName: "北斗", seat: 4, avatarSeed: "character-e", gender: "male" },
    { playerId: "ai-6", displayName: "小满", seat: 5, avatarSeed: "character-f", gender: "female" },
  ],
};

// 放在已有顶部栏下面的、有明确高度的容器中。
<MatchingAnimation
  roster={roster}
  onComplete={(players) => {
    // 此时所有人物已归位；在这里继续调用方的游戏流程。
  }}
  onError={(message) => {
    // 处理名单格式或图片加载错误。
  }}
/>;
```

- `roundId`：本局的稳定标识。重新匹配/切换对局时更换它，上一局的图片加载、延时和转场回调会失效。
- `playerCount`：6–12 的整数。
- `participants`：接口尚未返回时传 `[]`，完整人群继续走动，同时显示等待球、滚动人数和接星星小游戏；名单返回后传完整的本局名单，对应人物停住、统一归位。
- `playerId`：唯一且稳定的角色 ID，动画按它识别人物。名字可以重复。
- `displayName`：座位卡片显示的角色名。
- `seat`：沿用实际游戏的 **0 起始座位**，必须完整覆盖 `0` 到 `playerCount - 1`。数组顺序可以任意。前 `ceil(playerCount / 2)` 位在左栏，人物朝右；其余在右栏，人物朝左。
- `avatarSeed`、`gender`：与实际角色卡片使用相同的头像种子和性别。未提供种子时沿用游戏的 `playerId` 回退规则。性别支持 `male`、`female`、`nonbinary`。

已有游戏角色可在调用方提取 `playerId`、`displayName`、`seat`、`avatarSeed`，并把 `agentProfile?.persona?.gender` 映射到顶层 `gender`。角色、阵营和私有推理不是动画所需的数据。`parseMatchingRoster(response)` 会校验输入并仅复制上述外观字段。

重复传入同一份名单、改变数组顺序或更新回调不会重播动画。同一个 `roundId` 下从空名单收到第一份完整名单时，已有的人群继续走动，对应人物被认领或从边缘补入。换局，或者修改已经确定的名单、头像、座位时会创建新的场景，避免在途中混用两份名单。无效人数、缺少角色、重复 ID/座位或越界座位会进入错误状态并触发 `onError`，不会自动随机补齐参赛名单。

## 可选的逐位就绪

不传 `readyPlayerIds` 时，完整名单中的角色都会自动入场。若名单已确定但 AI 仍在准备，传入就绪角色的 ID：

```tsx
<MatchingAnimation
  roster={roster}
  readyPlayerIds={readyIds} // 初始 []；按实际准备结果加入角色 ID。
  onProgress={(entered, total) => updateProgress(entered, total)}
  onPlayerArrived={(player) => markSeatArrived(player.seat)}
  onComplete={continueGame}
/>
```

人群继续走动，就绪的参赛角色沿原来的路线穿行、在画面中部横向减速停住；滚动数字只反映本局实际停稳人数。选中、减速、停留和飞入头像栏都沿用人物原来的前后遮挡关系。转场开始时锁定完整绘制顺序，错峰起飞、路径相交和人物先后到达都不会改变它；先到达的人物继续在原图层停留，全部归位后才在同一帧交给侧栏显示。已经越过可用停留位置的人物会继续走出边界，再以相同方向走入，保持原来的行走高度和大小，也不会换成其他角色。凑齐后最后一个数字保留 500 ms，再淡出等待状态、显示左右栏，并按行略微错峰沿曲线归位。归位过程中的缩小和圆形裁切使用实际头像位置，最后由相同图片接管显示。减少动态效果模式跳过走动、数字滚动和飞入。

`readyPlayerIds` 可包含重复 ID（会去重），不能包含其他局的角色。撤回已就绪 ID 会重新进入准备状态；业务层重新匹配应更换 `roundId`。

- `onReady()`：当前人群素材已可用；名单随后到达时，在对应头像完成加载后再次通知。调用方需同时检查名单是否已返回，再开放匹配操作。
- `onProgress(entered, total)`：实际停住人数变化，含初始零人数。
- `onPlayerArrived(player)`：单个角色完成归位，包含明确的 `id`、`seat`、`facing` 和外观字段。
- `onComplete(players)`：全部角色归位，每份本局名单至多触发一次。返回按座位排序的公开人物信息。
- `onError(message)`：名单校验或头像加载失败。错误时不会触发完成回调。
- `SeatsComponent`：可选的座位组件，接收 `MatchingSeatsProps`。通过 `onAvatarRef` 注册包含同一张人物 SVG 的头像元素，提供真实归位位置；游戏接入组件使用这个入口复用实际玩家卡片。

容器可以调整高度；组件处理尺寸变化、高分辨率屏幕、页面隐藏/恢复和卸载清理。不要在动画每一帧触发接口请求；直接更新名单和可选就绪 ID 即可。

## 原版与素材

`CrowdCanvas variant="original"` 保留给定源码的 105 人 Open Peeps 横向走动效果。`MatchingSeats` 与游戏共享玩家卡片样式、占位头像；预览与游戏共享 `GameTopBar` 和 `GameLoadingState`。等待时隐藏两栏，使用无边框的 `orb-rain` 接星星小游戏，只保留“玩家们正在入场...”文案。

匹配模式使用游戏现有的 DiceBear 头像服务，没有新增头像库。原版素材在 `/images/peeps/all-peeps.png`。复用免费动效时保留 Skiper UI 署名，`MatchingAnimation` 已包含它。参见 [素材署名](../../../public/images/peeps/README.md)。

验证名单、真实开局映射、原有行走轨迹和入场取消：`pnpm test:matching`。
