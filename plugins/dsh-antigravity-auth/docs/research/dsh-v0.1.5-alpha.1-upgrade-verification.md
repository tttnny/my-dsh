# DSH 0.1.5-alpha.1 四插件升级适配与验证

验证日期：2026-09-09。任务来源：用户直接要求升级适配 Codex、Antigravity、工具结果图片与设置图标四个插件；没有指定 issue。本报告记录升级实现与提交、推送前的验证结果。

## 实现结果

- 开发依赖、完整 DSH peer 闭包、锁文件、最低 peer 基线与打包检查统一到 `0.1.5-alpha.1`。旧 DSH 用户继续使用旧插件版本；已发布 alpha.6 不包含本次适配。
- Codex 使用 pi-ai `0.85.1`，将实验性压缩和 Native 回放门禁收敛到准确的新依赖图。JSON restore 使用 V3 `detached` 事件所有权，保留 Portable、Dual、Native、fork／恢复与一次性 Turn Continuation 的既有约束。
- Antigravity 将 V3 系统消息文本传递到 Gemini／Claude 的 `systemInstruction`。单次调用的 `options.system` 先作为前置指令，之后按原顺序保留系统消息；没有声明未经实现的 `systemPromptUpdate: 'in-history'` 支持。
- 两个账号插件通过公开 `ctx.connection.fetch.register` 注册 `/api/codex-auth/*` 与 `/api/antigravity-auth/*`，客户端使用 `/api` 与带插件前缀的 endpoint。使用公开 Connection 请求 schema、响应 envelope，保留浏览器认证、Host/Origin 检查和静态 loopback guard，绕过该版本专用 `rpc.handle` 的 service owner/WebServer 依赖问题。没有修改 DSH 源码或替换共享 RPC interceptor。
- 图片插件迁移 V3 `SurfaceOp` 测试范围字段为 `startSeq`／`endSeq`；生产侧继续使用公开 Conversation 投影与标准 gallery。
- 设置图标插件跟随上游中英文自动重连文案，保留 keyed icon slot、Escape、焦点恢复、自动与手动重连。
- 四个插件的中英文 README、CHANGELOG Unreleased 与源码验证说明已更新。包版本号仍保留原值，未创建版本、tag 或 release。

## 仓库与固定点

每个仓库的 origin 和根目录均重新核对；工作区根目录不运行 Git。

| 本地根目录 | Canonical origin | 分支 / 基准 HEAD |
| --- | --- | --- |
| `/Users/suntc/project/dsh-plugins/dsh-codex-auth` | `git@github.com:suntianc/dsh-codex-auth.git` | `main` / `92ebda2a57c2c860517183b27b3b32fbeb485891` |
| `/Users/suntc/project/dsh-plugins/dsh-antigravity-auth` | `git@github.com:suntianc/dsh-antigravity-auth.git` | `main` / `8862efa47e33a36a90c10c7aa19e68ac7cc633cf` |
| `/Users/suntc/project/dsh-plugins/dsh-ui-tool-result-images` | `git@github.com:suntianc/dsh-ui-tool-result-images.git` | `main` / `c2df9242c13f5dcf4a9e74974c83a9e42a03437b` |
| `/Users/suntc/project/dsh-plugins/dsh-ui-settings-icons` | `git@github.com:suntianc/dsh-ui-settings-icons.git` | `main` / `eac28f55dbd1b907d8dee08c1148033b5b284665` |

## 验证矩阵

| 插件 | npm 基线 `pnpm run check` | 固定源码制品 `check:dsh-source` |
| --- | --- | --- |
| dsh-codex-auth | 21 文件、304 测试；完整 gate 通过 | 同样 304 测试；完整 gate 通过 |
| dsh-antigravity-auth | 30 文件、259 测试；完整 gate 通过 | 同样 259 测试；完整 gate 通过 |
| dsh-ui-tool-result-images | 3 文件、4 测试；完整 gate 通过 | 同样 4 测试；完整 gate 通过 |
| dsh-ui-settings-icons | 4 文件、14 测试；完整 gate 通过 | 同样 14 测试；完整 gate 通过 |

共 581 项仓库测试，在 npm 和源码制品两套独立环境中运行。完整 gate 包含 lint、类型检查、测试、构建、打包 smoke 与 publint；适用插件还包含 `pnpm peers check`。图片插件保留原有一条 `no-useless-spread` lint warning，未增加新的阻断诊断。

固定源码来自官方 `dsh-v0.1.5-alpha.1`，commit `5dda764ed3aa172535a7967b06ff95d9cbfe536a`。在 `/private/tmp/dsh-015-upstream-research/0.1.5-alpha.1` 使用冻结锁文件安装、运行 `pnpm run build:lib`，再将 packages/vendor 库打包到 `/private/tmp/dsh-015-source-packages`，四个插件各自运行隔离源码检查。未手改上游源码、node_modules 或生成产物。

新回归包括：

- 真实 Antigravity AgentLoop → Adapter → 模拟 provider HTTP body：Gemini 和 Claude 均保留持久系统提示词，旧单次调用控制场景也通过。
- Codex V3 system head → Dual compaction → JSON restore → public fork → Native replay：系统指令与 opaque Native 项保留，兼容回放不重复发送 Portable 摘要。原有手动、自动、溢出、取消、strict shrink、SSE/WebSocket/fallback、恢复与回放套件通过。
- 真实 Connection Host HTTP：已认证账号调用返回 200 与关联的 `server-response`；无 cookie 为 401，非可信 Origin 为 403；非法 JSON、错误 content type、method 不匹配被拒绝；注销路由后 404；all-interface guard 仍返回 `loopback-required` 且不触达账号 delegate。

## 打包后的真实浏览器验证

隔离目录：`/private/tmp/dsh-015-upgrade-web`。使用真实官方 `0.1.5-alpha.1` Host、Web 前端、Session persistence、attachments、Connection，以及四个本地打包插件；浏览器为 Chromium / Playwright。临时 DSH_HOME 和 XDG_DATA_HOME 与用户现用 profile 分离。

- 两个真实账号 status API 返回 200、`result.ok: true`；Antigravity 设置显示未登录状态并启用登录入口。Codex 故意配置 `/usr/bin/false` 作为 CLI，界面正确显示 `codex CLI not available`，未使用本机真实登录态。
- 一个真实 attachment 在同一工具结果中出现两次，折叠回合后 gallery 只展示一张，图片成功解码；展开、再次折叠与页面刷新后仍成立。
- 设置图标、设置分区、Escape 关闭与触发按钮焦点恢复正常。
- 模拟连接中断后显示新版 `Reconnecting automatically, reconnect now`，恢复联网并点击重连后连接恢复。
- 浏览器未捕获 page/console error，也没有 HTTP >= 400 响应。额外两个打包 Antigravity AgentLoop 模拟请求场景通过。最终 tarball 重新安装后，共 3 项集成检查全部通过，且制品 SHA-1 与当前源码哈希已再次核对。

关键本地证据：

- `/private/tmp/dsh-015-upgrade-web/final-artifacts/receipt.json`（最终 tarball SHA-1／integrity 与当前 src 文件哈希）
- `/private/tmp/dsh-015-upgrade-web/ui-receipt.json`
- `/private/tmp/dsh-015-upgrade-web/host-probes.json`
- `/private/tmp/dsh-015-upgrade-web/browser-errors.json`
- `/private/tmp/dsh-015-upgrade-web/browser-check.log`
- `/private/tmp/dsh-015-upgrade-web/{compact-image,icons,antigravity,codex,reconnecting}.png`
- `/private/tmp/<plugin>-015-check.log` 与 `/private/tmp/<plugin>-015-source-check.log`

## 实施与验证阶段的边界和外部动作

未进行真实 OAuth、真实账号登录／登出、私有模型或配额服务请求，未证明实际账号侧 Native compaction 成功。Provider 响应与凭据均为测试 fixture。浏览器验证覆盖未登录／CLI 不可用状态与非账号 UI 流程。

仅在临时验证环境安装 npm 依赖和本地 tarball。未修改现用 DSH profile、全局 DSH、用户配置或相邻插件；未 commit、tag、push、npm publish、GitHub Release，也未向外部协作者发送消息。

## 变更文件

下面包含本任务修改和前序研究留下的四插件升级报告。`docs/research/dsh-v0.1.5-alpha.1-{cross-plugin-impact,upstream-changes,runtime-verification}.md` 为本次实现前已存在的未跟踪研究文件，原内容保留。

### dsh-codex-auth

- `CHANGELOG.md`
- `README.md`
- `README.zh.md`
- `docs/adr/0008-fail-closed-account-rpc-on-alpha5.md`
- `docs/design.md`
- `docs/dsh-source-verification.md`
- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `scripts/check-dsh-source.mjs`
- `scripts/dsh-compatibility.mjs`
- `scripts/package-smoke.mjs`
- `src/compaction.ts`
- `src/index.ts`
- `src/native-checkpoint.ts`
- `src/rpc-contract.ts`
- `src/rpc.ts`
- `src/runtime-compatibility.ts`
- `tests/client-apply.client.spec.ts`
- `tests/compaction.spec.ts`
- `tests/dual-checkpoint.spec.ts`
- `tests/live/native-compaction.live.ts`
- `tests/native-checkpoint.spec.ts`
- `tests/rpc.spec.ts`
- `src/account-routes.ts`
- `tests/account-routes.spec.ts`

### dsh-antigravity-auth

- `AGENTS.md`
- `CHANGELOG.md`
- `README.md`
- `README.zh.md`
- `docs/dsh-source-verification.md`
- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `scripts/check-dsh-source.mjs`
- `scripts/dsh-compatibility.mjs`
- `src/index.ts`
- `src/llm-adapter.ts`
- `src/rpc-contract.ts`
- `src/rpc.ts`
- `tests/client-apply.client.spec.ts`
- `tests/lifecycle.spec.ts`
- `tests/rpc.spec.ts`
- `docs/research/dsh-v0.1.5-alpha.1-cross-plugin-impact.md`
- `docs/research/dsh-v0.1.5-alpha.1-runtime-verification.md`
- `docs/research/dsh-v0.1.5-alpha.1-upgrade-verification.md`
- `docs/research/dsh-v0.1.5-alpha.1-upstream-changes.md`
- `src/account-routes.ts`
- `tests/account-routes.spec.ts`
- `tests/agent-loop-system.spec.ts`

### dsh-ui-tool-result-images

- `AGENTS.md`
- `CHANGELOG.md`
- `README.md`
- `README.zh.md`
- `docs/dsh-source-verification.md`
- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `scripts/check-dsh-source.mjs`
- `scripts/dsh-compatibility.mjs`
- `tests/tool-result-images.client.spec.ts`

### dsh-ui-settings-icons

- `AGENTS.md`
- `CHANGELOG.md`
- `README.md`
- `README.zh.md`
- `docs/dsh-source-verification.md`
- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `scripts/check-dsh-source.mjs`
- `scripts/dsh-compatibility.mjs`
- `src/client/locales.ts`
- `tests/settings-root.client.spec.tsx`
