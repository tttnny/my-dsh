# DSH 0.1.5-alpha.1：四插件运行与浏览器补充验证

核验日期：2026-09-09，America/Phoenix。承接用户“帮我测试验证一下吧”，对[影响评估](./dsh-v0.1.5-alpha.1-cross-plugin-impact.md)补做真实宿主、浏览器和模型运行路径验证。此次任务是测试和诊断，没有实施兼容修复。

## 结果

**当前四插件组合仍不能直接作为已兼容 DSH 0.1.5-alpha.1 交付。新发现的共同阻塞是上游 Connection 通用 RPC 注册失败，导致两个认证插件的 Web 账户接口返回 HTTP 405。Antigravity 的 V3 系统提示词丢失也已通过真实 agent-loop 复现。**

| 项目 | 本次实际结果 |
| --- | --- |
| Codex / Antigravity Host 主插件 | 主插件已激活，服务可见；两者账户 RPC 子 fiber 均失败。主插件加载成功不能代表其子功能全部可用 |
| 两个认证插件的 Web 账户状态 | 失败。已认证的真实浏览器与直接 HTTP POST 均得到 405；直接探针未正确携带 cookie，不能作为已认证请求证据 |
| Antigravity V3 系统提示词 | Gemini 3.7 Flash、Claude Opus 4.6 Thinking 均丢失。日志和适配器输入中存在提示词，最终 provider body 中不存在 |
| Codex 原生压缩 | 当前兼容 gate 拒绝挂载，保持原有保护；没有绕过 gate 验证 Native/Dual 能力 |
| Codex 默认 Basic 压缩 | 通过。真实 Basic 引擎和 Codex/pi-ai 适配器完成模拟压缩；系统提示词和 Portable 摘要经 JSON restore、公开 SessionStore fork 后仍进入请求 |
| Tool Result Images | 浏览器通过：同一 Tool result 重复两次的附件只提升一张；实际图片解码成功；Compact 可见；展开/折叠和刷新后仍正确 |
| Settings Icons | 浏览器通过：设置开关、分区与图标展示、Escape 关闭及焦点恢复、刷新、断线提示、手动重连后恢复。重连提示仍是旧文案 `Connecting, restart now` |

## 新发现：上游 Connection 通用 RPC 注册失败

真实 HTTP 与浏览器均观察到：

- `POST /antigravity-auth/status` → `405`。
- `POST /codex-auth/status` → `405`。
- 浏览器额外调用 `POST /codex-auth/usage` → `405`。

Antigravity 页面状态为空，登录按钮禁用；Codex 页面能显示“Not logged in”，但状态读取实际上失败，因此不能把这个 UI 文案当作成功读到了未登录状态。这里没有点击登录或运行 OAuth。

Loader 主条目均有 fiber，`llm`、`attachments`、`connection`、`webServer` 和 `antigravityAuth` 服务都存在。但展开实际 Cordis registry 后，两条账户 RPC 子 fiber 的状态均为 FAILED，错误为：

```text
Error: cannot get property "webServer" without inject
```

具体堆栈到达上游 `HostConnectionService.register()` 内的 `owner.effect(() => owner.webServer.register(route))`。路由没有注册，POST 落入 frontend-static 的非 GET/HEAD fallback，得到 405。

上游从 0.1.3-alpha.1 到 0.1.5-alpha.1 将 Connection 的顶层 `inject` 从 `['webServer', 'credentials']` 改成 `['credentials']`，只在嵌套 `ctx.inject(['webServer'])` 中挂载 `/api`。通用 RPC 注册实现却保持原样，仍从原服务上下文访问 `webServer`。证据见固定版本[Connection 入口](https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/client/connection/src/index.ts#L69)、[通用 RPC 注册](https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/client/connection/src/rpc-host.ts#L156-L188)。

隔离对照验证：

1. 调用方仅声明 `connection`：注册失败，错误相同。
2. 调用方同时声明 `connection` 和 `webServer`：仍失败，错误相同。仅修改两个插件的依赖声明不足以解决。
3. 在新的临时 Context 中，通过公开 `HostConnectionService` 构造入口，使其**所属上下文**声明 `webServer`，同一通用 RPC 注册成功，实际 HTTP POST 返回 `200` 和预期 marker。此控制组仅使用本地模拟认证对象，不代表实际账户授权；已认证的产品状态证据来自真实浏览器。直接探针误用了 scaffold 未导出的 `cookieHeader`，实际没有有效 cookie；最终适配验证已改用公开 `hostFetch()`，并确认认证成功后的 200 响应。

因此将它记录为上游兼容阻塞。此次没有修改 DSH core、已安装包或生产插件，也没有用非公开路由绕过。后续需独立的上游修复任务，保留 carrier-neutral Connection、Web 路由生命周期与认证检查，再回归插件账户 RPC。不能简单恢复一个全局强制 WebServer 依赖而破坏 terminal 组合。

## 405 是否由 PR #22 / #25 引入：合并前后实测

针对用户追问，额外从两个 merge commit 的第一父提交归档完整源码，在临时目录固定同一目标依赖图并重新构建；将合并前与合并后制品分别加载进同一个 DSH 0.1.5-alpha.1 宿主测试方案。仅调整临时测试依赖元数据，未改源码、开发仓库 HEAD 或现用 profile。

| 插件 | 合并前 main | 合并后 main | 合并前 status | 合并后 status |
| --- | --- | --- | --- | --- |
| Codex PR #22 | `ea5fd1a8fbcdd7e89398e4e33586c486a4694325` | `92ebda2a57c2c860517183b27b3b32fbeb485891` | HTTP 405 | HTTP 405 |
| Antigravity PR #25 | `664cf03e8a50c6ae2deeccb6b600c6303ad56c39` | `8862efa47e33a36a90c10c7aa19e68ac7cc633cf` | HTTP 405 | HTTP 405 |

两组直接 POST 探针均未正确携带宿主 cookie；独立记录的账户 RPC 子 fiber 都报同一个 `cannot get property "webServer" without inject`。合并前制品通过明确的文件 URL 加载，receipt 记录实际 Loader 入口，避免误测仍安装的合并后版本。

**结论：本次 405 不是这两个 PR 引入的回归；回退这两个 PR，在该 DSH 版本下仍会遇到相同故障。** 两个 PR 之前已经采用相同的通用 RPC 注册方式。结合上节的上游源码差异和所属上下文对照，故障应归因于目标版上游 Connection 注册路径的兼容回归。

此次追加的 2 项归因对照均通过；它们断言的是“合并前后均复现同一故障”，不代表账户功能通过。原始正确性断言仍保持失败。

证据目录：`/private/tmp/dsh-015-impact-67x0ftyf/pre-pr-verification`；测试和日志在 `web-verification/pr-attribution.spec.ts`、`pr-attribution.log`、`pr-before-receipt.json`、`pr-after-receipt.json`。复现：在前述 web-verification 目录执行 `pnpm exec vitest run pr-attribution.spec.ts`。

## Antigravity：完整 V3 loop 到 provider body

测试使用目标版本实际 `LlmRuntime`、`SessionStore`、`SessionProjectionRegistry`、`SystemPrompt`、`ToolRuntime`、`AgentRegistry` 和 `AgentLoop`，并加载当前构建的真实 `AntigravityAdapter`。仅认证对象与 provider transport 使用模拟数据。

通过 `SystemPrompt.personaPrefix` 注入 marker，创建 Agent，调用 `followup()` 并等待 `whenIdle()`。两个模型都得到同一证据链：

| 观测点 | Gemini / Claude |
| --- | --- |
| 持久化事件 `system/message` 含 marker | 是 |
| 实际适配器请求 `messages` 含 marker | 是 |
| 请求存在旧 `options.system` | 否，符合新 loop 行为 |
| 发出 provider body 数量 | 各 1 次，全部由模拟 transport 接收 |
| provider body 含 marker | 否，正确性断言失败 |

这把前次手工 V3 输入探针补强为真实 loop 触发路径。应修插件的 system 消息转换，并同时保留 legacy one-shot 行为；此次没有实施修复。

## Codex：验证通过的范围

在独立插件副本中，目标 DSH 图及 pi-ai 0.85.1 保持一致，生产源文件、原测试和 gate 不变。

- 构造 Codex 自定义原生压缩引擎：如预期抛出兼容性错误。该测试验证保护仍在，不算 Native 功能通过。
- 用目标版本默认 `BasicCompactionEngine`、真实 `CodexAuthAdapter`、模拟 SSE/provider transport 执行一次手动压缩。压缩前加入标准 V3 `system/message`，成功产生 Portable 摘要。
- 将事件和 header JSON 序列化后，以新 API 的第 5 参数 `eventState='detached'` 恢复会话，再通过公开 SessionStore fork。恢复与 fork 两条请求都保留 system marker 和 Portable 摘要，且没有 `compaction_trigger`。

尚未证明：Codex 自定义 Native/Dual checkpoint、自动/overflow 压缩、Native 恢复/回放或真实模型服务。不能据此放宽生产兼容 gate。

## 环境、可复现证据与检查边界

四个开发根均重新核对，分支均为 `main`：

| 插件 / 本地根 | canonical origin | 固定 HEAD |
| --- | --- | --- |
| `/Users/suntc/project/dsh-plugins/dsh-codex-auth` | `git@github.com:suntianc/dsh-codex-auth.git` | `92ebda2a57c2c860517183b27b3b32fbeb485891` |
| `/Users/suntc/project/dsh-plugins/dsh-antigravity-auth` | `git@github.com:suntianc/dsh-antigravity-auth.git` | `8862efa47e33a36a90c10c7aa19e68ac7cc633cf` |
| `/Users/suntc/project/dsh-plugins/dsh-ui-tool-result-images` | `git@github.com:suntianc/dsh-ui-tool-result-images.git` | `c2df9242c13f5dcf4a9e74974c83a9e42a03437b` |
| `/Users/suntc/project/dsh-plugins/dsh-ui-settings-icons` | `git@github.com:suntianc/dsh-ui-settings-icons.git` | `eac28f55dbd1b907d8dee08c1148033b5b284665` |

本次没有新的 issue 实现；Codex/Antigravity 当前 main 分别包含 PR #22/#25，但本次不把所有发现归因于这些 PR。

宿主安装目录为 `/private/tmp/dsh-015-impact-67x0ftyf/web-verification`。使用 npm 的目标版宿主和已发布前端，以目标 tag 的官方无密钥 Web scaffold 组合真实 base/web patches；scaffold 仅调整到 npm 包的路径和安装 anchor。四插件从前次目标依赖图下生成的本地构建制品安装，**不等同于 npm 上已有 alpha.6 制品已经支持目标版本**。235 个不同 DSH 包全部为 `0.1.5-alpha.1`，Codex 使用 pi-ai `0.85.1`；未出现缺失/冲突 peer 警告。测试框架统一至 vitest 4.1.8，以匹配上游 session-snapshot 的要求。

浏览器为独立 headless Chromium，临时 profile、持久化路径、DSH_HOME、技能目录和 Antigravity 数据目录均隔离。没有读取真实 Codex auth.json；Codex 命令被配置为 `/usr/bin/false`，没有启动它。禁用真实默认 provider 请求和会话遥测，UI fixture 不发模型请求。真实账户、现用 profile 和全局安装未被测试或修改。

`source-consistency.json` 确认：四插件副本的全部原有 `src/`、`tests/`、`scripts/` 与其固定 Git HEAD 字节一致，宿主安装的 `lib/` 与副本构建结果一致。临时新增探针不属于这些原有文件。

最终补充测试共 **9 项：5 通过、4 个正确性断言失败**。失败是保留的复现信号，没有改成“期望错误”来宣称功能通过：

| 测试文件 | 结果 | 内容 |
| --- | --- | --- |
| `web-verification/upgrade.spec.ts` | 1 通过 | UI 交互回归；明确记录已知账户 405，不宣称账户流程通过 |
| `web-verification/account-rpc.spec.ts` | 2 通过 / 2 失败 | 两个账户 HTTP 正确性断言失败；调用方依赖与服务所属上下文对照通过 |
| `web-verification/agent-loop.spec.ts` | 2 失败 | Gemini、Claude 最终 system marker 断言失败 |
| `dsh-codex-auth/tests/review-v3-portable.spec.ts` | 2 通过 | 原生 gate 保护；Basic 压缩、restore、fork 与请求内容 |

复现命令：

```sh
cd /private/tmp/dsh-015-impact-67x0ftyf/web-verification
pnpm exec vitest run upgrade.spec.ts agent-loop.spec.ts account-rpc.spec.ts

cd /private/tmp/dsh-015-impact-67x0ftyf/dsh-codex-auth
pnpm exec vitest run tests/review-v3-portable.spec.ts
```

证据文件：`final-verification.log`、`account-rpc-receipt.json`、两个 `*-loop.json`、`runtime-graph.json`、`source-consistency.json`、`host-entries.json`、`host-fibers.json`、`host-probes.json`、`browser-errors.json`、`ui-receipt.json`；截图为 `icons.png`、`antigravity.png`、`codex.png`、`compact-image.png`、`reconnecting.png`。Codex 额外探针日志在上一级 `codex-v3-portable-probe.log`。

原有全量 package check 的失败边界仍以影响评估为准，此次没有修改源代码而重跑所有包 gate，也没有把局部测试称为 full check 通过。

正式工作区本次新增本验证报告、更新影响评估；已有上游研究文档保留。四插件生产源码、已有测试、package.json、lockfile 均未修改。没有 commit、tag、push、publish、部署、现用 profile 安装或配置修改，也没有发送外部 issue/PR 评论。
