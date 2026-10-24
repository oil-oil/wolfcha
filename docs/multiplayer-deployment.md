# 多人模式部署

多人模式由两个独立常驻服务和一个 Supabase 项目组成。Web 与游戏服务必须使用同一提交发布。

## 服务

### Web

- 镜像：`Dockerfile`
- 健康检查：`/`
- 必填公开变量：`NEXT_PUBLIC_GAME_SERVER_URL`、Supabase URL 与 publishable key
- 这 3 个 `NEXT_PUBLIC_*` 变量必须作为 Docker build args 传入；它们会写入浏览器产物，不能只在容器启动时配置
- `NEXT_PUBLIC_GAME_SERVER_URL` 必须是浏览器可访问的 HTTPS 地址

### 游戏服务

- 镜像：`Dockerfile.game-server`
- 健康检查：`/health`
- 端口：`GAME_SERVER_PORT`，默认 `3011`
- 必填变量：`GAME_SERVER_CORS_ORIGIN`、Supabase URL、`SUPABASE_SERVICE_ROLE_KEY`，以及 ZenMux 或 TokenDance 的服务端密钥
- `GAME_SERVER_STORE` 必须为 `supabase`
- 当前部署的硬性拓扑是一个游戏服务实例。进程启动会从 Supabase 恢复进行中房间的回合定时器和 AI 推进；扩大实例数之前必须先接入 Socket.IO 跨实例适配器和分布式任务锁，不能直接横向扩容。
- `MULTIPLAYER_AI_RESPONSE_FORMAT` 默认 `json_object`；选定 ZenMux 模型并实测支持后可显式设为 `json_schema`，把当前合法目标和药水资格加入输出约束。已验证 ZenMux `google/gemini-2.5-flash-lite` 的非流式严格输出。TokenDance 和多动作特殊阶段继续使用 `json_object`；所有返回结果仍经过业务校验和有限重试，不能按模型名称推断支持情况。
- `MULTIPLAYER_AI_MAX_CONCURRENCY` 是单实例模型请求硬上限，建议从 `8` 起按供应商限流与延迟压测调整；`MULTIPLAYER_AI_MAX_QUEUE` 默认 `64`，超过后立即拒绝并由房间调度器稍后重试，防止流量峰值耗尽内存。
- AI 用量通过数据库 RPC 原子累加；`MULTIPLAYER_USAGE_TIMEOUT_MS` 默认 `1500`，统计故障超过该时间会被中止并记录告警，不占用模型并发槽或阻断牌局。
- 游戏服务每天调用数据库清扫 RPC，默认保留 30 天的已结束、已关闭和废弃大厅；`in_game` 房间不会被清理。可用 `GAME_SERVER_HISTORY_RETENTION_DAYS` 调整，最短 7 天。

## 数据库

发布前先在本地 Supabase 重放全部迁移和集成测试。线上迁移单独审批，Web 与游戏服务均不得在启动时自动修改数据库。

## 发布顺序

1. 在预发布 Supabase 执行迁移并运行数据库测试；开局的额度 claim 与房间状态转换、结束结算都由数据库事务保证原子性。
2. 发布游戏服务，确认 `/health` 返回成功。
3. 发布 Web，并将 `NEXT_PUBLIC_GAME_SERVER_URL` 指向游戏服务。
4. 用一名和两名真人分别完成整局测试，再切换生产流量。

任何环境都不得使用内存 Store、测试身份或客户端暴露的 service role key。

## AI 生命周期与本地验收（2026-10-23）

- 真人出局或短暂断线不等于退出：仍保留真人席位的成员可以观战并等待 AI 完成。最后一个真人主动退出、或超时转成 AI 后，房间关闭且停止后续 AI 请求；旧的全员观战进行中房在恢复检查时也会关闭。观战成员可以正常退出连接，不会重新取得角色。
- AI 每次只处理当前一批待行动者，然后落库并广播；不再先把连续多个阶段全部算完才更新页面。每名待行动者最多3次请求，8–12人房每批最多36次请求尝试。连续3批失败后把暂停计数保存在服务端 checkpoint，停止自动重试和行动计时；只有仍有席位的房主能经 `room:retry-ai` 明确请求重试。成功推进后清零连续失败计数。该限制是连续失败上限，不是整局总请求额度或供应商费用上限。
- 失败状态无法写入数据库时，本进程停止该房自动请求，不因存储故障反复请求模型；这类持久化故障恢复需运维核查，不能把它冒充已持久化的暂停。
- 日志只记录UTC时间、房间ID、版本、允许的错误码、连续失败次数、是否安排重试；不记录API密钥、认证头、提示词或模型正文。
- 准备状态是每个用户的绝对值，允许在大厅中基于最新版本重放，并且已有相同状态不增加版本；阶段行动仍保持严格CAS，不把游戏动作一并放宽。
- Vercel Analytics只在Vercel部署中加载。其他部署若要接入它，需先提供实际统计端点，不应在本地验收请求缺失的Vercel路径。多人外部头像加载失败时使用本地品牌头像兜底；上游失败仍可在Network里观察到。
- 前端开发首次编译的历史根因仍无确证。验收使用 `pnpm build` 生成的独立产物再启动专用端口，保留编译、请求和浏览器日志；不要在活动服务的构建目录运行覆盖式build，也不使用包含 `--kill-others` 的组合命令管理其他项目服务。
