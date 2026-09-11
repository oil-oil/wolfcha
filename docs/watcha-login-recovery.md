# 观猹登录回调修复说明

## 问题与修复边界

线上已证实的根因是：`createUser` 返回 `email_exists` 后，旧回调通过 `listUsers` 只扫描前 1000 个用户，导致总用户数超过该上限时漏查目标账号。真实只读 Supabase Admin API 证据显示当前总用户数为 11070。`NextRequest.cookies` 是为了显式传入请求、提升回调可测试性而做的调整，不是已证实的线上故障根因。

本次修复将回调收敛为显式请求流程：从 `NextRequest.cookies` 读取并校验 state；交换 token、获取用户信息后只接受安全的正整数 `user_id`；`createUser` 仅允许 `email_exists` 或 `user_already_exists` 进入已存在用户分支；通过 `generateLink` 返回的 `data.user.id/email` 直接完成关联，校验邮箱和新用户 id；随后更新 metadata，并在每次身份校验成功后使用 `ignoreDuplicates: true` 幂等 upsert `user_credits`。已通过真实生产 Supabase OpenAPI 只读核对 schema：`referral_code` 为 NOT NULL 且无 default，`credits` 默认 1，`total_referrals` 默认 0，`created_at`/`updated_at` 默认 `now()`；因此每次插入 payload 都必须带 16 位大写 hex `referral_code`。缺失积分行会补入 1，已有余额和 `referral_code`（包括余额 42 的旧行）绝不覆盖，因此新建流程在 generateLink 或 metadata 中断后，下一次 `email_exists` 回调可以补齐积分。fixture 对缺少 `referral_code` 的积分 POST 返回 `23502`，防止测试漏掉必填字段。任何关联、metadata 或积分写入错误都失败返回，成功和异常路径都会清除 state cookie。

Supabase verify 重定向仍保持原有 URL 结构。阶段日志用于辅助排障，只记录阶段及安全的 code/status，不记录原始 error/message、token 或 access token。

## 回归覆盖

`server/watcha-oauth-callback.test.ts` 使用 fixture 环境变量后动态导入回调，并拦截全部 `fetch`：

- 已存在用户即使不在前 1000 名仍成功，且不会调用 `listUsers`；
- 新用户和老用户 metadata、关联 id、积分幂等补齐和 `ignoreDuplicates` 正确；
- 新建后 generateLink/metadata 中断，再以 `email_exists` 重试可补齐缺失积分；已有 42 余额始终保持 42；
- 新用户积分 payload 含合法 16 位大写 hex `referral_code`；旧行的 `referral_code` 与余额均保持不变；
- 非允许的 `createUser` 错误、非法 `user_id`、generateLink 错误/token 缺失、邮箱或 id 不匹配、metadata/积分错误都会失败；
- invalid state 不访问网络；成功和 catch 都校验 state cookie 清除；verify URL、错误日志和真实域名访问均受安全断言约束。

发布前验证：本地登录回归 10/10、原有支付与幂等回归 69/69、类型检查、Lint、生产构建及编译后 HTTP state 校验通过。以下命令只验证本地 fixture 回归；发布后仍须用真实观猹账号确认回跳及会话建立，不能用模拟测试替代线上验收。

```bash
NODE_OPTIONS=--conditions=react-server node_modules/.bin/tsx --test server/watcha-oauth-callback.test.ts
```
