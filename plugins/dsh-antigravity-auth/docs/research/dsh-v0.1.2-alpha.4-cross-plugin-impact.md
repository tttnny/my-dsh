# DSH `0.1.2-alpha.4` 对 Codex 与 Antigravity 插件的影响评估

> 核验日期：2026-09-02。目标宿主固定为 `@deepseek-ai/dsh@0.1.2-alpha.4`，当前插件固定为 `dsh-codex-auth@0.3.2` 与 `dsh-antigravity-auth@0.1.3`。本文只使用 DSH 官方 tag/源码、官方 npm 固定版本元数据和两个本地插件仓库。没有升级本机 DSH、没有修改任何 profile，也没有运行 OAuth 或私有端点。

## 结论

**有确定且阻断性的影响：不能只把宿主升级到 alpha.4 后继续使用当前两个发布包。**

| 当前发布包 | alpha.4 结果 | 主要阻断点 |
| --- | --- | --- |
| `dsh-antigravity-auth@0.1.3` | 不兼容，Host 入口立即失败 | `CallId` 已改名为 `ToolCallId`；三个 capability 入口还导入了已删除的 settings helpers |
| `dsh-codex-auth@0.3.2` | 不兼容，Host 主/Search/Image 入口立即失败 | `settingsNamespace` 与 `installSettingsSection` 已从包级 runtime exports 删除 |
| Codex `./compaction` 自定义 preset | 模块可以导入，但实例化前主动拒绝 | 精确兼容门固定 DSH `0.1.1-rc.2` 与 pi-ai `0.82.1`；alpha.4 使用 DSH alpha.4 与 pi-ai `^0.84.2` |

此外，两包的当前 DSH prerelease peer ranges（`^0.1.1-rc.1` / `^0.1.1-rc.2`）按 npm semver 规则均**不接受** `0.1.2-alpha.4`。新 profile 的自动 peer 安装可能在运行前就失败；旧 profile 强制升级或忽略 peer 后则会遇到上述 ESM named-export 错误。

`alpha.4` 也已经不是当前 alpha 通道：核验时 npm 的 `alpha` dist-tag 已指向 `0.1.2-alpha.5`，而 `latest` / `next` 仍为 `0.1.1-rc.2`。[官方 npm registry 元数据](https://registry.npmjs.org/@deepseek-ai/dsh)

## 上游固定点与方法

- 当前稳定开发基线：[`dsh-v0.1.1-rc.2`，提交 `b150a551…`](https://github.com/deepseek-ai/deepseek-harness/tree/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e)
- 目标 alpha：[`dsh-v0.1.2-alpha.4`，提交 `4e84901e…`](https://github.com/deepseek-ai/deepseek-harness/tree/4e84901e6471b79ec0338099867ebb4606d12bb5)
- 上游完整比较：[`dsh-v0.1.1-rc.2...dsh-v0.1.2-alpha.4`](https://github.com/deepseek-ai/deepseek-harness/compare/dsh-v0.1.1-rc.2...dsh-v0.1.2-alpha.4)
- 固定 npm 包：[`@deepseek-ai/dsh@0.1.2-alpha.4`](https://registry.npmjs.org/@deepseek-ai/dsh/0.1.2-alpha.4)、[`@deepseek-ai/dsh-llm@0.1.2-alpha.4`](https://registry.npmjs.org/@deepseek-ai/dsh-llm/0.1.2-alpha.4)、[`dsh-codex-auth@0.3.2`](https://registry.npmjs.org/dsh-codex-auth/0.3.2)、[`dsh-antigravity-auth@0.1.3`](https://registry.npmjs.org/dsh-antigravity-auth/0.1.3)

验证分三层进行：

1. 比较 rc.2 与 alpha.4 官方源码和固定 npm tarball；
2. 在 `/tmp` 创建隔离的 alpha.4 依赖图，安装两个当前 packed artifact；
3. 在临时源码副本中逐项做最小 API 迁移，再分别运行 Host/Client TypeScript build，以发现首个错误之后的后续迁移点。临时修改没有写回插件源码。

## 已确认的 breaking changes

### 1. DSH prerelease peer ranges不相容

当前 Antigravity 的直接 DSH peers 从 `^0.1.1-rc.2` 起，Codex 多数从 `^0.1.1-rc.1` 起且 compaction/token-meter 精确固定 `0.1.1-rc.2`。`semver.satisfies('0.1.2-alpha.4', '^0.1.1-rc.2')` 和 rc.1 对应结果均为 `false`：semver range 不会自动接受另一个 base version 的 prerelease。

隔离 profile 使用默认自动 peer 安装时，`pnpm install` 已实际失败为 `ERR_PNPM_NO_MATCHING_VERSION`；禁用自动 peer 后可以强制落图，但 `pnpm peers check` 报告两个插件的 DSH peers 未满足。因此“安装成功但忽略 warning”不能作为兼容证明。

### 2. LLM tool-call id：`CallId` → `ToolCallId`

rc.2 的 [`brand.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.1-rc.2/packages/llm/llm/src/brand.ts) 导出 `CallId`；alpha.4 的[对应文件](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-alpha.4/packages/llm/llm/src/brand.ts)改为 `ToolCallId`，`ToolCallBlock.id`、`ToolResultBlock.toolCallId` 与 `tool-call-delta.id` 同步改用新品牌。[alpha.4 LLM types](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-alpha.4/packages/llm/llm/src/types.ts)

这正是 Antigravity Issue #21 的第一处启动错误。`ReasoningEffortId`、`LlmAdapter`、`LlmError`、`resolveRetryPolicy` 和 `attributionHeaders()` 在 alpha.4 仍存在；本次没有发现这些符号的删除。

### 3. Settings helper 从包级函数移到 service method

alpha.4 已删除 `@deepseek-ai/dsh-settings` 的 runtime named exports：

- `settingsNamespace()`：改用由 API 泛型验证的普通 kebab-case 字符串；
- `installSettingsSection()`：改为 `ctx.inject(['settings'], settingsCtx => settingsCtx.settings.installSection(ctx, ...))`。

这是官方 alpha.4 [settings 实现](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-alpha.4/packages/settings/settings/src/index.ts)和[设置卡 cookbook](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-alpha.4/docs/cookbook/adding-a-settings-card.md)给出的新形式。当前两个插件都从包根导入旧 helper，所以不是仅需改类型的告警，而是确定的 ESM 加载失败。

### 4. `Session.events` 不再公开

alpha.4 将 append-only log 保持为私有字段，并提供公开的不可变 `session.snapshotEvents()` / `eventAt()` / `ownEvents()`。[alpha.4 Session 实现](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-alpha.4/packages/core/session/src/index.ts)

当前使用点：

- Antigravity：`src/media-admission.ts` 的 session image authorization/catalog；
- Codex：`src/image.ts` 的 session image catalog，以及 `src/compaction.ts` 的当前 compaction id 查找。

临时迁移为 `snapshotEvents()` 后这些源码可通过 alpha.4 类型检查，但仍需回归 fork/resume、顺序和 authorization 行为。

### 5. Client/API 包拓扑重构

rc.2 存在的 `packages/client/runtime` 与 `packages/host/apiproxy` 在 alpha.4 tag 中已经不存在；官方 npm 上也没有这两个包的 `0.1.2-alpha.4` 版本：

- [`@deepseek-ai/dsh-client-runtime` registry`](https://registry.npmjs.org/@deepseek-ai/dsh-client-runtime)
- [`@deepseek-ai/dsh-host-apiproxy` registry`](https://registry.npmjs.org/@deepseek-ai/dsh-host-apiproxy)

对应公开类型/服务被拆分到更窄的 owner：

- Client `Context`：`@deepseek-ai/cordis`；
- `SettingsScope`：`@deepseek-ai/dsh-client-ui-settings/client`；
- `ctx.sessions` / `ISessions`：`@deepseek-ai/dsh-api-session-controller/client`；
- `SessionId`：`@deepseek-ai/dsh-session/types`；
- `ctx.slots` 的 Context merge：`@deepseek-ai/dsh-client-ui-renderer/client`；
- Host/shared RPC result：`ConnectionRpcResult`，来自 `@deepseek-ai/dsh-client-connection`（Client-safe contract 可从 `./client` 引入）。[alpha.4 Connection package](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.2-alpha.4/packages/client/connection)

因此两个插件都要删除旧 peer/dev dependencies 和旧 imports，并重新核对 `package.json#dsh.client.inject`。Codex 应以 session controller 替换旧 runtime 注入；两个 UI 源码还要从 renderer/client 引入 `ctx.slots` 的类型声明并声明相应 peer/dev owner。renderer 本身由 Web shell 组装，不能仅凭类型 import 推断第三方包必须重复写进 client inject 列表。

### 6. RPC 的 per-channel loopback authority 被删除

rc.2 的 `connection.rpc.handle(channel, handler, { authority: 'loopback' })` 在 alpha.4 变为两个参数；`ConnectionRpcAuthority` 与 handler options 已删除。[alpha.4 RPC contract](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-alpha.4/packages/client/connection/src/rpc.ts)

alpha.4 仍对所有 Connection 路由执行 Host/Origin trust fence 与浏览器认证，但它允许 deployment 明确配置非 loopback `trustedHosts`；已没有 per-channel loopback 选择。[alpha.4 Connection Host](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-alpha.4/packages/client/connection/src/index.ts)

两个插件当前都依赖第三个参数来保证 Login/Status RPC 只接受 loopback。JavaScript 会静默忽略多余参数，所以仅删除类型错误会削弱现有安全约束。迁移必须先做架构决定，例如改用能检查 Request authority 的公开 exact-Fetch seam并同步改造客户端，而不能把“删掉第三参”当成完成。

### 7. 协调依赖图变化

alpha.4 的官方包图使用 Cordis `^4.0.2`、Schemastery `^3.18.2`；`@deepseek-ai/dsh-llm-pi-ai@0.1.2-alpha.4` 依赖 pi-ai `^0.84.2`。[alpha.4 llm-pi-ai package](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-alpha.4/packages/llm/llm-pi-ai/package.json)

两个插件必须将全部 DSH dev dependencies/lockfile作为一个协调图升级，不能保留 rc.2 与 alpha.4 混装。Codex 当前要求 pi-ai `^0.82.1`，该 range 不接受 `0.84.x`，并且 Native Checkpoint 明确把转换行为绑定到精确版本，因此不只是改 package range。

## 隔离运行结果

在强制提供 alpha.4 DSH packages 的隔离目录中，对当前发布 artifact逐入口执行动态 import：

```text
FAIL dsh-antigravity-auth
  @deepseek-ai/dsh-llm does not provide CallId
FAIL dsh-antigravity-auth/search
FAIL dsh-antigravity-auth/image
FAIL dsh-antigravity-auth/video
  @deepseek-ai/dsh-settings does not provide installSettingsSection

FAIL dsh-codex-auth
FAIL dsh-codex-auth/search
FAIL dsh-codex-auth/image
  @deepseek-ai/dsh-settings does not provide settingsNamespace

OK   dsh-codex-auth/compaction   # 仅模块 import
```

Codex compaction 的运行时门随后给出确定拒绝：

```text
requires DSH 0.1.1-rc.2 ... and pi-ai 0.82.1;
received DSH 0.1.2-alpha.4 ... and pi-ai 0.84.4
```

`isCodexNativeReplayRuntimeCompatible()` 同一图下返回 `false`。

## 分插件影响

### `dsh-antigravity-auth`

确定需要迁移：

1. `CallId` 改为 `ToolCallId`；
2. Search/Image/Video 三个 settings section 改为 service method；
3. session image catalog 改用 `snapshotEvents()`；
4. RPC result 类型迁至 Connection；
5. ClientContext/SettingsScope/slots owner imports 与 client inject 图迁移；
6. 删除 `dsh-client-runtime`、`dsh-host-apiproxy`，增加所需的新 owner package；
7. 重新设计 loopback-only RPC；
8. 全部 DSH peer/dev/lock、Cordis、Schemastery 升为同一 alpha.4 图。

在 `/tmp` 中完成 1–5 并临时删除 RPC 第三参后，Antigravity Host 与 Client declaration builds 都通过 alpha.4 类型检查。这说明纯 API 迁移是有界的，但**不证明**第 7 项安全语义、真实 Loader、浏览器、OAuth、Search/Image/Video 或 private transport 已兼容。

风险级别：**高（启动阻断 + auth transport policy 变化）**；除 RPC policy 外，代码改动量预计中等。

### `dsh-codex-auth`

确定需要迁移：

1. LLM/Search/Image 三个 settings section 和 namespace；
2. Image catalog 与 compaction event scan 改用 `snapshotEvents()`；
3. RPC result、ClientContext、SettingsScope、ToolCall view、sessions 与 slots owner imports；
4. client inject 图以 `dsh-api-session-controller` 替换旧 runtime，并为 renderer-owned slots 更新类型依赖；
5. 删除 `dsh-host-apiproxy`，处理 loopback-only RPC；
6. 全部 DSH peer/dev/lock与 pi-ai 图同步升级；
7. 对 pi-ai `0.84.x` 的 Codex provider payload callback、SSE/WebSocket、replay conversion重新审计；
8. 重新验证并更新 `CODEX_COMPACTION_COMPATIBILITY` 与 `CODEX_NATIVE_REPLAY_COMPATIBILITY`；必要时提升 codec generation并保留旧 checkpoint 的 Portable fallback。

在 `/tmp` 中完成通用 API/type迁移后，Codex Host 与 Client declaration builds 都能在 DSH alpha.4 + pi-ai `0.84.4` 上通过；这说明主 adapter 的公开类型形状仍可适配。但当前精确兼容门会阻止 custom compaction，Native replay会主动降级，因此必须用专门 fixture 验证 wire payload和 durable replay后才能放开。

风险级别：**很高（启动阻断 + exact-version compaction/replay contract + auth transport policy 变化）**。

## 建议

1. **当前最安全选择：继续固定 DSH `0.1.1-rc.2`。** 两个现有发布包及其 lockfile就是按该图验证的。
2. 如果 alpha.4 是为复现 Desktop Issue #21，可做两个独立适配分支，但应视为实验线，不能只放宽 peer range。
3. 若目标是长期升级，先确认是否应直接评估当前 `0.1.2-alpha.5` 或等待 rc；不要把 alpha.4 结果外推到 alpha.5。
4. 适配顺序建议：依赖/包拓扑 → runtime named exports/settings/session → client graph → RPC loopback policy decision → Codex pi-ai/native replay → 全量测试与 packed-profile smoke。
5. 在两个新包都可用前，不要原地升级唯一工作 profile；应使用隔离 profile做安装、启动和回滚演练。

## 本次已完成的验证

- 当前 rc.2 基线：`dsh-antigravity-auth` 的 `pnpm run check` 通过，23 个测试文件、197 个测试全部通过，package smoke 与 `publint` 通过。
- 当前 rc.2 基线：`dsh-codex-auth` 的 `pnpm run check` 以退出码 0 完成，14 个测试文件、250 个测试全部通过，package smoke 通过；`publint` 保留现有 `./client` CJS 文件使用 `.js` 扩展名的 warning。
- alpha.4 强制图：当前 packed artifacts 的逐入口 dynamic-import 结果如上，已复现两包的确定加载失败。
- alpha.4 临时源码迁移：两个插件的 Host 与 Client declaration builds 均通过；临时副本只用于界定迁移面，没有写回源码，也没有被当作 runtime 或安全验证。

## 必要验证矩阵

每个插件至少执行：

```text
pnpm install --frozen-lockfile
pnpm peers check
pnpm run check
```

另需从**实际 packed tarball**创建 alpha.4 隔离 profile并验证：

- 所有 Host entries 与 `./client` loader加载；
- settings 初始值、live update、reset、secret redaction；
- authenticated loopback可调用，trusted non-loopback不能调用 Login/Status endpoints；
- LLM text/tool-call/abort/retry/replay；
- session image authorization、fork/resume与 attachment read；
- Antigravity Search/Image/Video 的离线 transport fixtures；
- Codex SSE/WebSocket payload、Portable fallback、Native replay、manual/automatic/overflow compaction；
- package smoke 与 `publint`。

真实 OAuth、Antigravity/ChatGPT 私有请求和 live profile仍属于单独授权的验证边界。
