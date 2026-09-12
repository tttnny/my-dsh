# DSH `0.1.2-alpha.5` 对当前 Antigravity/Codex 插件的交叉影响

> 核验目标：官方 `dsh-v0.1.2-alpha.5`（提交 [`db6bdc3576c2d4e7c965e8e3ed0c2a731eed87f5`](https://github.com/deepseek-ai/deepseek-harness/tree/db6bdc3576c2d4e7c965e8e3ed0c2a731eed87f5)）、npm 的固定包元数据，以及本地当前 `dsh-antigravity-auth@0.1.3` 和 `dsh-codex-auth@0.3.2` 源码/`package.json`。比较基线为 [`dsh-v0.1.1-rc.2`](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.1-rc.2) 与本仓库的 [alpha.4 报告](./dsh-v0.1.2-alpha.4-cross-plugin-impact.md)。
>
> 边界：没有改动两个插件源码（本文件除外）、DSH core、global 或用户 profile；没有运行 OAuth、私有端点或 live profile；没有 commit/push/publish。`/tmp` 只用于只读 tag/worktree、固定 npm artifact、隔离依赖图、动态 import 与临时类型迁移验证。
>
> **2026-09-02 实施追记：** 下文“当前包”与失败矩阵描述的是评估时固定的两个已发布 artifacts。其后 `dsh-antigravity-auth` 本地开发树已按本报告完成 alpha.5 迁移；Codex 插件仍未改动。实施状态与新增边界见文末。

## 结论

**alpha.5 没有修复 alpha.4 已确认的任一阻断点；当前两个已发布包仍不能兼容地升级到 `@deepseek-ai/dsh@0.1.2-alpha.5`。** alpha.4→alpha.5 对所涉公开插件 API 没有源码改动，基本是全工作区版本提升以及 storage/session-projection-cache 的变更；因此不能把 alpha.5 当作已适配的候选版本。

| 当前包 | alpha.5 的实际状态 | 阻断层级 |
| --- | --- | --- |
| `dsh-antigravity-auth@0.1.3` | 不可作为 alpha.5 的满足 peer 的包安装；即便人为拼出图，Host 的 `CallId`、三个 settings helper 和旧 API 包依赖仍不匹配 | 安装/Loader 与 ESM named export |
| `dsh-codex-auth@0.3.2` | 同样 peer 不满足；Host LLM/Search/Image 的 settings helpers、旧 API 包依赖仍不匹配 | 安装/Loader 与 ESM named export |
| Codex `./compaction` 与 Native replay | 当前包的精确运行时 gates 必然拒绝/降级 alpha.5 + pi-ai `0.84.x` | 有意的 runtime gate，非类型错误 |

这里的“实际失败”包括默认 peer 安装失败、当前已发布 artifact 在强制 alpha.5 图中的逐入口 dynamic-import 失败，以及 Codex compatibility gates 的实际结果；不是只由元数据推断。“临时类型迁移可行”指在 `/tmp` 副本完成已知 API 替换后，两个插件的 Host/Client declaration builds 均在 alpha.5 图通过。它只界定源码迁移面，绝不是 Loader、runtime、安全或真实服务兼容证明。

## 固定一手来源与版本事实

- 官方 tag：[`dsh-v0.1.2-alpha.5`](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.2-alpha.5)，固定提交如上；[alpha.4→alpha.5 compare](https://github.com/deepseek-ai/deepseek-harness/compare/dsh-v0.1.2-alpha.4...dsh-v0.1.2-alpha.5)。
- 固定 registry metadata：[`@deepseek-ai/dsh@0.1.2-alpha.5`](https://registry.npmjs.org/@deepseek-ai/dsh/0.1.2-alpha.5)、[`@deepseek-ai/dsh-llm@0.1.2-alpha.5`](https://registry.npmjs.org/@deepseek-ai/dsh-llm/0.1.2-alpha.5)、[`@deepseek-ai/dsh-settings@0.1.2-alpha.5`](https://registry.npmjs.org/@deepseek-ai/dsh-settings/0.1.2-alpha.5)、[`@deepseek-ai/dsh-client-connection@0.1.2-alpha.5`](https://registry.npmjs.org/@deepseek-ai/dsh-client-connection/0.1.2-alpha.5)、[`@deepseek-ai/dsh-llm-pi-ai@0.1.2-alpha.5`](https://registry.npmjs.org/@deepseek-ai/dsh-llm-pi-ai/0.1.2-alpha.5)。已发布插件固定为 [`dsh-antigravity-auth@0.1.3`](https://registry.npmjs.org/dsh-antigravity-auth/0.1.3) 和 [`dsh-codex-auth@0.3.2`](https://registry.npmjs.org/dsh-codex-auth/0.3.2)。
- 已发布 DSH 根包的 alpha.5 依赖为 Cordis `^4.0.2` 与 Schemastery `^3.18.2`；pi adapter 依赖 pi-ai `^0.84.2`：[固定根包 registry metadata](https://registry.npmjs.org/@deepseek-ai/dsh/0.1.2-alpha.5)、[`llm-pi-ai/package.json`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-alpha.5/packages/llm/llm-pi-ai/package.json)。当前两插件仍声明 Cordis `^4.0.1`、Schemastery `^3.18.1`，Codex 仍声明 pi-ai `^0.82.1`（本地两个 `package.json`）。

## alpha.4 已确认阻断点：alpha.5 状态逐项核对

| alpha.4 已确认点 | alpha.5 是否修复 | alpha.5 一手证据与对当前包的含义 |
| --- | --- | --- |
| prerelease peers 不接受新 base prerelease | **否** | 当前 Antigravity DSH peers 是 `^0.1.1-rc.2`，Codex 多数是 `^0.1.1-rc.1`，而 alpha.5 是 `0.1.2-alpha.5`。用已安装 `semver` 实测两者均为 `false`。这先于插件运行；不能以忽略 peer warning 作为兼容性。 |
| `CallId` → `ToolCallId` | **否** | alpha.5 [`brand.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-alpha.5/packages/llm/llm/src/brand.ts#L27-L40) 只导出 `ToolCallId`；当前 Antigravity `src/llm-adapter.ts` 仍运行时导入/调用 `CallId`。因此该入口仍会遇到缺失 named export。Codex 本身不使用此旧名。 |
| 包级 `settingsNamespace()` / `installSettingsSection()` 删除 | **否** | alpha.5 [`settings/src/index.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-alpha.5/packages/settings/settings/src/index.ts#L419-L496) 将能力放在 `ctx.settings.register()` / `ctx.settings.installSection(owner, ...)`，而非包级导出；当前 Antigravity `src/search.ts`、`image.ts`、`video.ts` 与 Codex `src/index.ts`、`search.ts`、`image.ts`、`codex-context.ts` 仍从包根导入旧 helpers。这是运行时 ESM import 失败，不是仅 TypeScript 告警。 |
| `Session.events` 不再公开，须使用 snapshot | **否** | alpha.5 [`Session`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-alpha.5/packages/core/session/src/index.ts#L580-L617) 保留私有 snapshot cache、公开 `eventAt()`、`snapshotEvents()` 和 `ownEvents()`，没有公开 `.events`。当前 Antigravity `src/media-admission.ts`、Codex `src/image.ts` 与 `src/compaction.ts` 仍读取 `.events`。替换为 `snapshotEvents()` 是**临时类型迁移可行**的已知方向，但 fork/resume、顺序及 image authorization 尚未在 alpha.5 runtime 验证。 |
| `dsh-client-runtime` / `dsh-host-apiproxy` 包拓扑已移除 | **否** | alpha.5 官方 registry 对 `@deepseek-ai/dsh-client-runtime@0.1.2-alpha.5` 与 `@deepseek-ai/dsh-host-apiproxy@0.1.2-alpha.5` 都返回 `E404 No match found`。两插件的 `peerDependencies`、`devDependencies` 和 `dsh.client.inject` 仍列这些旧包；源码也分别从其 `/client`、`/api` 导入类型。这构成当前包的实际解析/loader 阻断。新 owner 仍是 Cordis `Context`、Connection 的 `ConnectionRpcResult`、Session 的 types、session-controller 的 client API、UI renderer 的 slots 和 UI settings 的 SettingsScope（参见 alpha.4 报告及 alpha.5 各 package export map）。 |
| Connection RPC 每 channel 的 `{ authority: 'loopback' }` 被移除 | **否** | alpha.5 [`HostConnectionRpc.handle`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-alpha.5/packages/client/connection/src/rpc.ts#L132-L156) 只收 `(channel, handler)`；当前两个 `src/index.ts` 都传第三参。JS 忽略额外参数，故删类型错误会削弱插件原本的 per-channel loopback 约束。Connection 仍在 prefix 级别作 Host/Origin trust 与 browser auth，且可配置 `trustedHosts`：[实现](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-alpha.5/packages/client/connection/src/index.ts#L69-L125)。没有公开证据表明 alpha.5 恢复了插件所需的逐 RPC loopback authority；这必须先做安全架构迁移，**尚未 runtime 验证**。 |
| Cordis/Schemastery 与 DSH 图必须协调升级 | **否** | alpha.5 升至 Cordis `^4.0.2`、Schemastery `^3.18.2`；当前包锁在 rc.2 开发图。虽小版本 ranges 未必单独制造类型错误，但任何适配必须整体更新 peer/dev/lock 图，不能混合 rc.2 和 alpha.5。临时 declaration build 已过，但**尚未以完成迁移的 packed plugin 图运行验证。** |
| Codex compaction/pi-ai 精确 gate | **否** | 当前 `src/compaction.ts` 把全部 DSH runtime packages 精确锁到 `0.1.1-rc.2`，pi-ai 锁到 `0.82.1`；alpha.5 官方 `llm-pi-ai` 要 `^0.84.2`。因此 `assertCodexCompactionCompatibility()` 在 alpha.5 图必抛，不是版本范围放宽即可修复。payload/SSE/WebSocket、Basic transaction 与 durable compaction 都**尚未 runtime 验证**。 |
| Codex native checkpoint replay 精确 gate | **否** | 当前 `src/native-checkpoint.ts` 仅在 dsh-llm、dsh-llm-pi-ai 都为 `0.1.1-rc.2` 且 pi-ai 为 `0.82.1` 时返回 true；alpha.5 + pi-ai `0.84.x` 必为 false。因此 Native replay 会有意走 Portable fallback/拒绝 native marker replay。codec、旧 checkpoint 的 read/fallback 与真实 replay **尚未 runtime 验证**。 |
| Client loader / metadata | **否** | alpha.5 client-modules 会解析 `package.json#dsh.client.inject` 与 `exports["./client"]`，格式非法会直接 throw：[loader](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-alpha.5/packages/client/modules/src/index.ts#L191-L234)。两插件 metadata 的 inject 图仍包含不发布的 `dsh-client-runtime`；且源 UI imports 仍指向该包。alpha.5 的 Connection 自身仍发布 `./client`，但这不能使旧 runtime entry 或旧 inject 图有效：[connection metadata](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-alpha.5/packages/client/connection/package.json#L16-L34)。 |

## alpha.4 → alpha.5 的新增插件相关变化

**没有发现新的直接插件 API/拓扑变更。** 对 LLM brand、Settings、Session、Connection、client renderer/slots/settings/tool、session controller、compaction 及 `llm-pi-ai` 等插件相关路径逐项比较后，alpha.4→alpha.5 仅修改各自 `package.json` 的版本字段，没有相关非 manifest 源码差异。完整官方 compare 的其他源码修改落在 storage、session-projection-cache、其文档/fixtures，以及自动生成的 Cordis API catalog；并不触及上述插件消费的运行时 API。

所有 DSH workspace 包仍整体从 alpha.4 递增到 alpha.5，故适配包必须用同一 alpha.5 图验证。alpha.5 的实质功能修复是 storage domain 新增 `compatibleVersions` 与派生数据的 `invalidRecords: 'backup-and-skip'`，[官方 spec](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-alpha.5/packages/storage/storage-domain/src/spec.ts#L48-L67)，由 session-projection-cache 用来兼容 rc.2 的 v3、alpha.3 的 v4 及 alpha.4 的 v5 缓存。这改善了宿主升级时的启动恢复和 SessionList 标题保留，但两个当前插件未直接导入该 subsystem，也不会修复它们的 Loader/API 阻断；它同样不能替代 Codex durable checkpoint/replay 的专门验证。[官方兼容性决策](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-alpha.5/.agents/notes/implemented/architecture/2026-09-02-projcache-cross-version-read-compat.md)

## alpha.5 隔离图的实际结果

默认自动 peer 安装 `@deepseek-ai/dsh@0.1.2-alpha.5`、`dsh-antigravity-auth@0.1.3` 与 `dsh-codex-auth@0.3.2` 失败为：

```text
ERR_PNPM_NO_MATCHING_VERSION: @deepseek-ai/dsh-settings@>=0.1.2 <0.2.0-0
```

关闭自动 peer 并显式提供 alpha.5 协调图后，当前发布包的 Host entries 实测如下：

```text
FAIL dsh-antigravity-auth          # @deepseek-ai/dsh-llm 缺少 CallId
FAIL dsh-antigravity-auth/search   # dsh-settings 缺少 installSettingsSection
FAIL dsh-antigravity-auth/image    # 同上
FAIL dsh-antigravity-auth/video    # 同上
FAIL dsh-codex-auth                # dsh-settings 缺少 settingsNamespace
FAIL dsh-codex-auth/search         # 同上
FAIL dsh-codex-auth/image          # 同上
OK   dsh-codex-auth/compaction     # 只代表模块可以 import
```

随后实际调用 Codex gate：`assertCodexCompactionCompatibility()` 抛出预期版本不匹配（收到全部 DSH `0.1.2-alpha.5` 与 pi-ai `0.84.4`），`isCodexNativeReplayRuntimeCompatible()` 返回 `false`。

复用 alpha.4 已知迁移并在临时副本中改指 alpha.5 依赖后，Antigravity 与 Codex 的 Host/Client declaration builds 四项均通过。首次 Antigravity typecheck 曾因测试图漏装 `@cortexkit/antigravity-auth-core` 失败；补齐当前插件既有依赖后通过，因此该次失败不属于 alpha.5 回归。

## 迁移面与建议

1. **当前发布包继续固定 rc.2。** 不能只放宽 peer range：这会掩盖已确认的 loader/ESM/API/security 与 Codex exact-gate 问题。
2. 适配分支应先替换旧包 topology、`CallId`、settings helpers、`.events` 和 client injection/import owners，再让 alpha.5 的完整 peer/dev/lock 图一致。
3. RPC 不应机械删除第三参；先选择并测试能够维持 Login/Status loopback-only 语义的公开 authorization seam。
4. Codex 在解除 compaction/native replay gates 前，必须用离线 fixture 验证 pi-ai `0.84.x` 的 provider payload、SSE/WebSocket、Basic/manual/automatic/overflow compaction、Portable fallback、旧 checkpoint read 和 native replay。没有这些证据只能保持 gate。
5. 用 packed artifact 的隔离 profile 验证所有 Host entries 与 `./client` loader、settings update/reset/redaction、fork/resume image catalog、loopback/non-loopback RPC 授权；真实 OAuth/private transport 仍需另行授权。

## 实际执行的验证

- 验证两本地仓库顶层与 origin：均为预期独立仓库；保留任务开始前已有的未跟踪 research 文档，只新增本报告。读取两个当前 `package.json`、两份 `cordis.patch.yml` 和相关 source usage。
- 在 `/tmp` 只读 clone/worktree 官方 tag，实际解析提交 `db6bdc3576c2d4e7c965e8e3ed0c2a731eed87f5`；比较 alpha.4→alpha.5，并确认受影响 API 路径没有非 manifest 源码差异。
- 运行 `npm view`/固定 tarball 检查；创建临时隔离依赖图，分别执行默认 peer 安装、强制协调图安装、当前发布包逐入口 dynamic import、Codex gates 与四项临时 declaration builds。没有安装到用户或 live profile。
- 实测 alpha.5 的 `dsh-client-runtime` 和 `dsh-host-apiproxy` 固定版本不存在；当前 rc peer ranges 与 pi-ai `^0.82.1` 均不接受目标版本。
- 本 follow-up 没有重跑 rc.2 的 `pnpm run check`，因为它不能证明 alpha.5；紧邻本评估前的同一工作树基线结果为 Antigravity 197/197、Codex 250/250 且两条 `check` 均退出 0。没有启动 DSH GUI/browser、OAuth 或 private endpoint。

## 2026-09-02 Antigravity 实施追记

`dsh-antigravity-auth` 本地开发树已经执行本报告中的迁移，已发布 npm artifact 仍保持原样，Codex 插件也没有改动：

- 直接 DSH peers 改为 `^0.1.2-alpha.5`，dev/lock 固定 exact alpha.5，并同步 Cordis `4.0.2`、Schemastery `3.18.2`；已移除 alpha.5 不存在的 `dsh-client-runtime` 与 `dsh-host-apiproxy`。
- Host/Client 源码已迁移 `ToolCallId`、Settings service method、Session snapshot accessor、`ConnectionRpcResult` 与 alpha.5 type-owner/client injection topology。
- alpha.5 没有替代旧逐 method loopback authority 的公开 seam，也没有 Host 侧 owner/carrier authority fact。插件使用独立 activation guard：只有明确的 `127.0.0.1` Web bind 才委托真实 dispatcher；缺失或其它 bind 对所有 endpoint 固定返回 value-free `loopback-required`，且不调用 auth/service。Client 的 `isLoopback` 只收敛 UI，不作为授权边界。未来若 DSH 提供 carrier-asserted `operatorLocal`/`privileged` capability，应以该 seam 替换静态 policy，并在此之前拒绝 owner-contained 自定义 carrier。
- 从空 `node_modules` 执行 frozen install 成功，随后 `pnpm peers check` 无问题；完整离线 `pnpm run check` 通过（25 个 test files、207 个 tests，并包含 lint、Host/Client typecheck、build、packed package smoke 与 publint）。
- 将本地 exact tarball 安装进 `/tmp` 的官方 `@deepseek-ai/dsh@0.1.2-alpha.5` 标准 Web profile 后，patch composition、完整 Host plugin-tree `--help` boot 及 packed Client module-loader factory 均通过。没有启动 Web server/browser，也没有安装到用户 profile、运行 OAuth/private endpoint、修改 DSH core，或 commit/push/publish。
