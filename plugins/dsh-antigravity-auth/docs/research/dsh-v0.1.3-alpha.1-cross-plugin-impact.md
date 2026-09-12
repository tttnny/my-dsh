# DSH v0.1.3-alpha.1 对四个插件的影响

核验日期：2026-09-06（America/Phoenix；registry 查询时为 UTC 2026-09-07）。范围按用户最后指令限定为 Codex Auth、Antigravity Auth、Settings Icons、Tool Result Images，不包含 ACP 或其他项目。

> **发布状态更新（2026-09-07）：** 四插件已分别发布到 npm alpha 通道：Codex `0.3.3-alpha.6`、Antigravity `0.1.4-alpha.6`、Settings Icons `0.1.3-alpha.6`、Tool Result Images `0.1.0-alpha.6`。下文的版本未变、未提交、未发布和未安装描述均为相应评估/实施阶段的历史记录；当前版本与支持范围以各仓库 package.json、CHANGELOG 和 Release 为准。

> **实施更新：** 用户随后授权四插件升级验证与修复。下文初始评估保留为修改前记录，其中“未运行新宿主”“唯一新增文件”等描述仅指初始评估阶段。实际代码变更、双版本检查和隔离 Web 结果见文末“升级实施与验证”。目标 npm 包仍未发布；新支持属于未发布的插件源码更新。

## 初始评估结论（修改前）

**当前四个插件不能直接宣称支持 DSH `0.1.3-alpha.1`。共同阻断是版本约束和目标 npm 包尚未发布；源码风险集中在 Codex 的压缩与恢复。Settings Icons 的迁移面最小，Tool Result Images 仍有独立用途。**

| 插件 / 当前本地版本 | 直接影响 | 评估 |
| --- | --- | --- |
| `dsh-codex-auth@0.3.3-alpha.5` | 27 个 DSH peer 均不接受目标版本；实验性 compaction 精确版本检查拒绝目标；Native replay 检查返回 false；Session v2 与 token meter 改变，需要重验 checkpoint、自动压缩和恢复 | 四者中迁移与验证工作最多；不能仅放开 gate |
| `dsh-antigravity-auth@0.1.4-alpha.5` | 17 个 DSH peer 均不接受目标；主要 LLM/Settings/RPC 调用接缝保留；图片目录依赖 Session 历史，网络请求受新环境代理策略影响 | 中等回归面，未发现主要 Auth 入口的直接 API 破坏 |
| `dsh-ui-settings-icons@0.1.3-alpha.5` | 10 个 DSH peer 均不接受目标；对应官方 settings shell、settings、slots、renderer、store 源码未变 | 低源码风险，适合首先验证；尚非新宿主兼容证明 |
| `dsh-ui-tool-result-images@0.1.0-alpha.5` | 8 个 DSH peer 均不接受目标；durable Tool result 及节点接缝保留，但 Conversation 流式 settlement 实现改变 | 低至中等回归面；应保留并验证 Compact、重载和去重 |

本报告中“未变”来自完整官方 tag tarball 的字节/源码比较，“拒绝/false”来自实际执行本地 gate 并注入目标版本事实；不代表已在新宿主运行四个插件。

## 固定版本与安装边界

- 目标为官方 [dsh-v0.1.3-alpha.1 release](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.3-alpha.1)，发布于 2026-09-04 11:34:32 UTC，精确提交为 [`d347e703908d0406b7a7ef80e3a0e594d86b2215`](https://github.com/deepseek-ai/deepseek-harness/tree/d347e703908d0406b7a7ef80e3a0e594d86b2215)。
- 四个插件的实际开发基线均为 `0.1.2-alpha.5`。主要比较基线为 [`db6bdc3576c2d4e7c965e8e3ed0c2a731eed87f5`](https://github.com/deepseek-ai/deepseek-harness/tree/db6bdc3576c2d4e7c965e8e3ed0c2a731eed87f5)，并用官方 `0.1.2-rc.1` tag 补充核对 Auth 相关 API。
- 查询时 [CLI registry](https://registry.npmjs.org/@deepseek-ai%2fdsh) 的 `latest`/`next` 是 `0.1.2-rc.1`，`alpha` 是 `0.1.2-alpha.5`。[目标精确版本](https://registry.npmjs.org/@deepseek-ai%2fdsh/0.1.3-alpha.1) 返回 404。LLM、PiAi、Agent、Session、Settings、Credentials、Attachment、UI Settings、UI Attachment 的 registry 元数据也都没有 `0.1.3-alpha.1`。
- npm 缺失是当前发布状态，不是永久 API 障碍。评估此 tag 可在隔离源码构建图中进行，但不能把 GitHub 预发布误当成现成的 npm 升级。
- 本地使用 `semver.satisfies()` 实测：四插件全部 62 个 DSH peers 均拒绝 `0.1.3-alpha.1`。`^0.1.2-alpha.5` 不自动接受不同 base 的预发布版本；Codex 另有三个 exact `0.1.2-alpha.5` peers。迁移时应协调 peer/dev/lock 图，不应靠忽略 peer 告警拼接两条预发布线。

## Session 破坏性变更的实际命中范围

上游新增生命周期持有的 `SessionHandle`，底层 `agentLoop.create()` 改为异步，并以 Session 锁限制同一 Session 的进程持有者。日志格式从基线 v0 升为 v2，通过相邻 generation 迁移历史日志。上游还明确记录了历史 Session 加载的性能回退。[官方 release](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.3-alpha.1)

**四个插件的生产 `src/` 都没有直接使用 `agentLoop.create`、`sessionPersistence`、`SessionHandle` 或旧 `assistant/chunk`/`chunkrow/*` 事件。不能把底层持久化破坏性变更直接外推为四插件都无法加载。**

v2 仍保留 `assistant/message`，并非将它统一重命名；它新增必需的 `data.stream`，并增加无 surface message 的 `assistant/attempt`。旧 durable `assistant/chunk` 被移除；Web 用 transient `assistant/live-chunk`，随后以 settlement 替换。`tool/result` 的本插件消费字段仍保留。[Session 事件定义](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/core/session/src/types.ts#L286)

`Session.snapshotEvents()`、`requestHeader()` 仍存在。因此两个 Auth 插件现有图片历史扫描仍有对应公开入口。但 v2 restore 会校验 embedded stream 与 message/usage/replayState 一致，fork 的继承边界 marker 也调整；历史重载和 checkpoint 不能仅由旧内存事件测试证明。[Session 实现](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/core/session/src/index.ts#L288)

## Codex Auth

主要 OAuth/LLM 接缝没有变化：上游 `LlmAdapter`、`registerAdapter` 定义保留，PiAiAdapter 的 adapter/index/config 实现与 alpha.5 相同；Credentials 和 Settings 的所有 src 相同，pi-ai 依赖仍为 `^0.84.2`。此处没有发现必须重写认证逻辑的证据。[LLM 接缝](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/llm/llm/src/index.ts#L197)、[PiAiAdapter](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/llm/llm-pi-ai/src/adapter.ts#L219)

明确阻断在插件自己的兼容保护：

- `src/compaction.ts:69` 仅接受 DSH `0.1.2-alpha.5` 与 pi-ai `0.84.4`；构造实验性压缩引擎时执行检查（约 L268）。向真实函数注入目标版本后抛出 `codex-compaction requires DSH 0.1.2-alpha.5 ...`。
- `src/native-checkpoint.ts:29` 的 Native replay gate 同样限定 exact pair。基线输入返回 true，DSH 两项改为 `0.1.3-alpha.1`、pi-ai 保持 `0.84.4` 后返回 false。该结果意味着 Native replay 走不兼容处理/Portable 路径，不能概括成整个 Codex provider 无法使用。
- 上游 BasicCompaction/Compaction 的 src 未变，但 TokenMeter 已从旧 chunk 引用改为读取 embedded stream，并增加通用文件的请求文本计价。压缩触发阈值和成本估算仍需回归。[TokenMeter](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/llm/token-meter/src/index.ts#L312)
- `tests/compaction.spec.ts:103`、`tests/dual-checkpoint.spec.ts` 等现有 fixture 直接 append 的 `assistant/message` 没有 `stream`，不满足 v2 类型/恢复合同。迁移需更新为真实 settlement fixtures，不能只修改 gate 后重跑旧测试。

应重点验证 manual/automatic/overflow compaction、Native/Portable 双 checkpoint、取消和重试、fork/resume、旧日志迁移后的 replay 与图片引用，以及新的 TokenMeter 结果。对于 gate，先完成这些证据，再修改精确支持版本。

## Antigravity Auth

`src/llm-adapter.ts` 使用的 LlmAdapter 路由、`ToolCallId`、公开 `attributionHeaders()` 接缝仍保留；Settings namespace/section 注册方式不变。无需重新进行 alpha.5 迁移中已经完成的旧包拓扑/helper 替换。[LLM 源码](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/llm/llm/src/index.ts)、[Settings 源码](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/settings/settings/src/index.ts)

`src/media-admission.ts:241` 通过 `snapshotEvents()` 扫描 `user/message`、`assistant/message`、`tool/result`，这些入口和内容路径保留。应回归生成图片、`list_images`、会话图片作为编辑 reference、fork/resume 后的授权范围；目前没有发现必须改成新的 persistence API 的直接调用点。

两个 Auth 插件的账户 RPC 使用 `ctx.connection.rpc.handle(channel, handler)` 和插件自己的静态 loopback guard。上游本次 Connection 改动主要为 streaming upload route，增加 Fetch route `requestBody` 等字段；既有 `handle` 调用形态和所用 client ConnectionHandle 保留。没有新增证据允许解除现有仅显式 `127.0.0.1` Web bind 才到真实 dispatcher 的保护。[Connection RPC 定义](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/client/connection/src/rpc.ts#L133)

## Settings Icons

完整 alpha.5→目标 tag 比较中，以下上游 src 没有变化：`ui-settings-general`、`ui-settings`、`ui-slots`、`ui-renderer`、client `store`、client `modules`。插件关闭 stock `ui-settings-general` 并提供 settings 外壳的组合方式仍对应现有上游结构；图标能力没有被此次版本替代。[官方设置外壳](https://github.com/deepseek-ai/deepseek-harness/tree/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/client/ui-settings-general/src)

主要工作是协调依赖图、验证 packed Client loader，以及验证设置页打开/关闭、Escape 焦点恢复、连接重连、onboarding、`openSettingsDocument()` 和 Codex/Antigravity 图标。当前结论是低源码风险，不是已跑过新 Web 的兼容承诺。

## Tool Result Images

**继续保留。上游新增 `read_image` 工具卡图片展示，没有覆盖本插件“完成回合后仍在 Compact 主对话中展示图片”的全部用途。**

- 官方新增 registrant 以 `read_image` 为 keyed Tool view，支持顶层和 PTC 嵌套调用；本插件支持成功 Tool results 内的 raster images，不限定工具名，尤其包括生成图片。[read-image-row.tsx](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/client/ui-tool/src/client/tool/toolviews/read-image-row.tsx)
- 目标 `ChatNodeSeat` 仍会把完成回合中、最终答案之前的 process member 在 Compact 下隐藏。工具卡渲染变好并不会让它脱离该折叠范围。[ChatNodeSeat.tsx L62](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/client/ui-chat/src/client/chat/ChatNodeSeat.tsx#L62)
- 本插件在 `turn/end` 发布 image node，anchor 放在回合结束，保持独立展示。所用 `ConversationNodeDefinition` 合同字节未变，`renderMessageImages` 仍存在，新的 `loadImage` 是额外提供给 renderer 的 owner 能力。[Conversation 合同](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/client/ui-conversation/src/client/contract/conversation.ts)、[Chat slots](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/client/ui-chat/src/client/contract/slots.ts#L77)
- 已用 v2 形状的 `assistant/message`/`assistant/attempt` 和 transient live chunk 执行现有纯 projection：成功图片仍输出一次，anchor 位于 `turn/end`，live chunk 被忽略。此测试没有运行上游新 assembler、宿主或浏览器。
- 上游 ConversationAssembler 增加 `settleAssistant()`，需后续验证真实实时 settlement、历史窗口加载、刷新重放和 Compact 展示没有重复、遗漏或错位。[新 assembler](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/client/ui-conversation/src/client/conversation/assembler.ts#L251)

## 两个 Auth 插件共有的新行为

1. **环境代理实际改变出站路径。** CLI 在挂载插件前安装代理策略，使用 undici 全局 dispatcher。两个插件的 token refresh/usage 等实现默认使用全局 fetch，因此在设置代理环境变量时会受到影响；应覆盖无代理、有代理和 NO_PROXY 三类环境。loopback 按上游 policy 绕过，插件的 OAuth callback listener 本身仍是本地入站服务。[启动安装点](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/apps/cli/src/profile-boot.ts#L215)、[dispatcher 安装](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/util/http-proxy/src/install.ts#L158)、[loopback policy](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/util/http-proxy/src/policy.ts#L33)
2. **通用文件上传不要求 OAuth adapter 原生理解新 file block。** `ContentBlock` 新增 file，但标准 `ctx.llm` dispatch 在进入 adapter 前把 file（含 tool-result 中嵌套 file）转换为名称/大小/保存路径文本。直接绕过标准 dispatch 的测试调用则需另行考虑。[FileBlock 定义](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/llm/llm/src/types.ts#L84)、[dispatch 投影](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/llm/llm/src/index.ts#L1030)
3. **通用模型探测增强不替代插件自有发现逻辑。** 上游新增 models 对象、Anthropic 原生列表和容量字段兼容；Codex OAuth 不在这套可列举协议范围内，Antigravity 私有模型发现也不能据此删除。[discovery.ts](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/llm/llm-pi-ai/src/discovery.ts#L28)

## 建议迁移顺序与验收

先在隔离环境建立一致的目标源码/包图，按 **Settings Icons → Tool Result Images → Antigravity → Codex（基础 Auth 与实验压缩分别验收）** 推进。当前正式使用继续固定已验证的 alpha.5 组合。

每个实际修改的插件都需跑自己的 `pnpm run check`，并验 packed artifact/Client loader；随后在隔离 Web profile 验证设置页与图片显示。Codex 解除 gate 前必须补足 v2 真实日志、迁移和恢复证据。真实 OAuth、私有端点和用户 live profile 验证属于独立授权范围。

## 初始评估执行与交付记录（修改前）

本次是自然语言跨插件兼容评估，无 issue、无实现 fixed-point diff。四仓库均位于 `/Users/suntc/project/dsh-plugins`，实际 Git 顶层和 canonical origin 均核验匹配；任务开始时这四仓库均干净。

| 精确 local root | Canonical origin | Branch / 读取的 HEAD |
| --- | --- | --- |
| `/Users/suntc/project/dsh-plugins/dsh-antigravity-auth` | `git@github.com:suntianc/dsh-antigravity-auth.git` | `main` / `8b8c2fe6342b85022ede91c8fb0d999275338d1a` |
| `/Users/suntc/project/dsh-plugins/dsh-codex-auth` | `git@github.com:suntianc/dsh-codex-auth.git` | `main` / `0377fb37c23d6b61d7c292c4fd6d43003762f5a5` |
| `/Users/suntc/project/dsh-plugins/dsh-ui-settings-icons` | `git@github.com:suntianc/dsh-ui-settings-icons.git` | `main` / `a0ddbcd49dc31be64d6570ef5f4d4afc4135a9fd` |
| `/Users/suntc/project/dsh-plugins/dsh-ui-tool-result-images` | `git@github.com:suntianc/dsh-ui-tool-result-images.git` | `main` / `14b318846f64ce7734fc2d388fd1ff2e6a2592f8` |

已执行：CodeGraph 定位、相关生产代码/测试/元数据/指南审阅、官方 release/API/registry 读取、完整 tag 源码比较、62 个 peer 的 SemVer 实测、Codex 两种真实 gate 的显式版本输入实测、图片插件纯 projection 的 v2 形状 fixture。Node 默认 strip-only 不能处理现有 TS parameter property，随后使用 `--experimental-transform-types` 完成只读探针；该工具启动问题不属于 DSH 回归。

没有安装目标依赖或运行新宿主，因此没有新版本完整 check、package smoke 或实际浏览器结果。本次没有代码/release 变更，不以 alpha.5 的既有测试代替目标版本验证。

唯一新增工作区文件是本报告；四插件源码、package/lock、profile、全局安装和 DSH core 均未修改。网络操作仅为读取官方源码/发布元数据；没有 OAuth/私有服务探测、commit、tag、push、npm publish、GitHub Release 或部署。

## 升级实施与验证

用户以自然语言明确授权这四个插件的升级验证与修复；没有关联 issue。四仓库仍在上述精确 local root、canonical origin 和 `main` 分支，版本号不变，修改尚未提交。

### 实际变更

- 四插件的 DSH peer 均显式加入 `0.1.3-alpha.1` 支持。普通 peer 使用 `^0.1.2-alpha.5 || ^0.1.3-alpha.1`；Codex 实验依赖保留精确版本联合约束。普通开发依赖和锁文件仍为可安装的 `0.1.2-alpha.5`，不混用两个依赖图，不写入本机路径。
- Codex 的 compaction 和 Native replay gate 接受两套各自一致的 DSH 运行时，继续拒绝版本混搭和不符合要求的 pi-ai；pi-ai 仍固定 `0.84.4`。新增目标版本接受、混搭拒绝测试，先观察到旧实现失败，再修复。
- Codex 的 Session 测试通过共享 `assistantSettlement` 构建与消息一致的 v2 durable stream，覆盖压缩、Dual Checkpoint、恢复相关用例；图片插件补齐 v2 fixture。Codex 另修复了测试假 token 在跨秒时生成不同过期时间的偶发失败。
- 四插件增加 `scripts/dsh-compatibility.mjs`、`scripts/check-dsh-source.mjs`、`check:dsh-source` 命令以及 `docs/dsh-source-verification.md`；package smoke 同时识别 registry 与源码 tarball 锁记录并核对选定版本。脚本在独立临时副本安装完整依赖闭包，保存 tarball SHA-512 清单并执行 peer 检查和完整 check。
- 更新四插件中英文 README、CHANGELOG 的未发布条目，以及已有插件 AGENTS 的验证基线说明。Icons、Antigravity 和图片插件没有改动生产运行逻辑。Codex 生产修改仅在版本准入处。

各仓库共有改动为 `package.json`、README 中英文、CHANGELOG、package smoke、新验证脚本和文档。Codex 另改 `src/compaction.ts`、`src/native-checkpoint.ts`，新增 `src/runtime-compatibility.ts`、`tests/support/assistant-settlement.ts`，调整 compaction、dual-checkpoint、native-checkpoint 和 live/native-compaction 测试。图片插件另改 `tests/tool-result-images.client.spec.ts`；Antigravity 仓库保留本跨插件报告。

### 固定目标与复现

从官方 tag `dsh-v0.1.3-alpha.1`、commit `d347e703908d0406b7a7ef80e3a0e594d86b2215` 的完整源码构建 Host/Client libraries，并把 `packages/**`、`vendor/*` 的 264 个包打为 tarball。源码目录为 `/tmp/dsh-upstream-013/dsh-v0.1.3-alpha.1`，制品目录为 `/tmp/dsh-alpha13-packages`。没有修改上游源码、已安装的 DSH 或用户 profile。

每个插件目录分别执行：

```sh
pnpm run check
pnpm run check:dsh-source -- /tmp/dsh-alpha13-packages
```

完整 check 包含各仓库原有 lint、Host/Client typecheck、测试、构建、packed artifact smoke 与 publint；源码检查另执行 `pnpm peers check`。目标图检查使用真实构建包，不是只注入版本号绕过 gate。源制品构建步骤见各插件的 `docs/dsh-source-verification.md`。

最终完整检查结果：

| 插件 | npm alpha.5 完整 check | 目标源码 alpha.1 完整 check | 每套测试数 |
| --- | --- | --- | --- |
| Antigravity Auth | 通过 | 通过 | 213 |
| Codex Auth | 通过 | 通过 | 279 |
| Settings Icons | 通过 | 通过 | 14 |
| Tool Result Images | 通过 | 通过 | 4 |

两套图各 510 项测试通过。最终命令日志分别保存在 `/tmp/dsh-antigravity-auth-final-check.log`、`/tmp/dsh-codex-auth-final-check.log`、`/tmp/dsh-ui-settings-icons-final-check.log`、`/tmp/dsh-ui-tool-result-images-final-check.log`；每份日志结尾记录其隔离源码验证目录，目录旁的 `artifacts.json` 给出实际输入制品哈希。四仓库 `git diff --check` 均通过，锁文件均无改动。

### 隔离 Web 验证

另构建目标版本 Web，使用上游 `launchWebScaffold`、隔离 DSH home、四插件构建制品和 Chromium 执行 1 项组合测试，通过：

- 四个 Host/Client 插件共同加载；设置页显示 Antigravity 和 GPT Auth 入口及图标外壳。
- 打开 Antigravity 面板，Escape 关闭后焦点回到设置按钮；刷新后设置页仍可打开。
- 使用公共 Session API 创建并持久化 v2 会话，使用真实 attachment service 保存 PNG。会话包含工具调用、成功图片结果、最终回答和 `turn/end`。
- Compact 模式的工具过程保持折叠，回合末图片仍可见且浏览器确实加载了像素；刷新后仍恰好出现一次，无页面异常。

临时 Web harness、结果与截图位于 `/tmp/dsh-plugin-web-verification/`：`upgrade.spec.ts`、`vitest.config.ts`、`overlay.yml`、`result.log`、`icons.png`、`antigravity.png`、`compact-image.png`。这些是本机临时证据，不是仓库内新增的可移植浏览器测试。

### 验证边界与外部操作

本次证明固定官方源码版本上的离线套件、打包兼容和上述隔离 Web 行为。没有执行真实 OAuth、私有模型端点、真实代理/NO_PROXY 网络矩阵、真实账户压缩调用，也没有运行 `tests/live/native-compaction.live.ts`。Web 使用持久化 v2 fixture，不能据此宣称已验证真实模型流式重连、所有旧日志迁移或全部历史窗口场景。

网络操作包含官方发布元数据读取、源码和依赖下载。未 commit、tag、push、publish、部署或安装到现用 profile，未调整版本号或全局配置。目标 npm 包发布后仍需复核 registry 制品，才能把普通开发依赖和锁文件迁到目标 npm 图。
