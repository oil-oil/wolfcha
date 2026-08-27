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
