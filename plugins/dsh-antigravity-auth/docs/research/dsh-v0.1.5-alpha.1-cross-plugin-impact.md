# DSH v0.1.5-alpha.1 对当前四插件的影响

核验日期：2026-09-08（America/Phoenix，部分核验时间为 UTC 2026-09-09）。范围为用户明确指定的 Codex、Antigravity、Tool Result Images UI、Settings Icons；评估当前本地 main，不等同于已发布 npm alpha.6 制品或现用 profile。

## 结论

**2026-09-09 补充实测：新发现上游 Connection 通用 RPC 注册失败，Codex/Antigravity Web 账户接口均返回 HTTP 405；真实 V3 agent-loop 复现 Antigravity system 丢失。两个 UI 插件的浏览器回归和 Codex 默认 Basic 压缩/restore/fork 已通过。完整结果、对照与边界见[运行验证报告](./dsh-v0.1.5-alpha.1-runtime-verification.md)。下文保留首次评估的原有测试结果。**

**不宜直接把现有四插件整体切到 DSH 0.1.5-alpha.1。Antigravity 有已复现的系统提示词丢失；Codex 的原生压缩/回放被现有兼容校验拒绝；两个 UI 插件影响较小。四者都需要更新支持声明和完成目标版本 gate。**

| 插件 | 当前本地版本 / main | 影响 | 建议 |
| --- | --- | --- | --- |
| dsh-codex-auth | 0.3.3-alpha.6 / 92ebda2 | 28 个 DSH peer 不接受目标；原生 compaction 拒绝挂载，Native replay 回退 Portable；恢复测试缺少新参数。普通 direct/prepared 请求能保留 V3 系统提示词 | 高验证工作量；完成 Session V3、pi-ai 0.85.1、压缩/恢复/回放验证后再扩展支持 |
| dsh-antigravity-auth | 0.1.4-alpha.6 / 8862efa | 18 个 DSH peer 不接受目标；模型请求过滤掉 messages 中的 system，只读取旧 options.system，正常 V3 loop 请求会丢失系统提示词 | 明确功能修复优先项，不能仅改版本范围 |
| dsh-ui-tool-result-images | 0.1.0-alpha.6 / c2df924 | 8 个 DSH peer 不接受目标；测试数据仍用 SurfaceOp.start/end，类型检查失败。生产构建与 4 项现有测试通过 | 低迁移风险；更新 V3 fixture、元数据并验证真实 Compact 展示 |
| dsh-ui-settings-icons | 0.1.3-alpha.6 / eac28f5 | 10 个 DSH peer 不接受目标；类型、14 项测试、构建通过。上游设置外壳仅重连文案变化，插件仍用旧文案 | 低迁移风险；更新元数据，顺带同步文案并做浏览器回归 |

## 最新版本的含义与取证基线

- 官方最新发布是预发布 [v0.1.5-alpha.1](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.5-alpha.1)，发布于 2026-09-08 16:16:04 UTC，tag 指向 [`5dda764ed3aa172535a7967b06ff95d9cbfe536a`](https://github.com/deepseek-ai/deepseek-harness/tree/5dda764ed3aa172535a7967b06ff95d9cbfe536a)。
- 实时查询 npm：`@deepseek-ai/dsh` 的 `alpha=0.1.5-alpha.1`，`latest=next=0.1.2-rc.1`。因此本次以最新 alpha 为目标，不把默认 latest 混同为最新 alpha。[registry](https://registry.npmjs.org/@deepseek-ai%2fdsh)
- 与上次不同，目标 DSH npm 包已经存在。测试所需 76 个不同 DSH 包的精确目标版本元数据全部可取；上游 `dsh-llm-pi-ai` 要求 pi-ai `^0.85.1`。[LLM adapter 元数据](https://registry.npmjs.org/@deepseek-ai%2fdsh-llm-pi-ai/0.1.5-alpha.1)
- 当前四插件原始 dev/lock 仍以 DSH 0.1.2-alpha.5 为开发基线，已记录的另一支持图是 0.1.3-alpha.1。评估包含这两次发布间的累计变化，而非只看最后一条 release note。
- 使用当前本地 `semver.satisfies('0.1.5-alpha.1', range)` 实测，64/64 个 DSH peer 均拒绝目标 prerelease。这里指支持契约不匹配；不声称所有包管理器都一定拒绝安装。强行忽略警告还可能解析出多个 DSH 版本。

更完整的上游契约与固定 commit 证据见 [上游研究](./dsh-v0.1.5-alpha.1-upstream-changes.md)。

## Antigravity：已复现的运行问题

V3 agent-loop 将系统提示词保存为 `system/message` 并放入 `GenerateOptions.messages`，实际构造请求时不再设置 `options.system`。未声明 `systemPromptUpdate: 'in-history'` 的适配器仍会收到规范化后的首条 system 消息，并不会回退到旧 options 字段。[请求构造](https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/core/agent-loop/src/agent.ts#L601-L617)、[规范化逻辑](https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/core/agent-loop/src/runtime-context.ts#L81-L102)

当前插件的两个转换入口都忽略 system role：`src/llm-adapter.ts:713` 的 filter，以及实际 Adapter 路径 `:728` 的 continue。`:783–785` 只从 `options.system` 构造 provider `systemInstruction`。这会丢掉 DSH 系统提示词；即便请求仍携带工具 schema 或插件追加的 provider 专用指令，也不能替代被丢掉的 DSH 指令。[当前 Adapter](https://github.com/suntianc/dsh-antigravity-auth/blob/8862efa47e33a36a90c10c7aa19e68ac7cc633cf/src/llm-adapter.ts#L710-L785)

隔离探针通过目标版真实 `LlmRuntime`、真实 `AntigravityAdapter`、官方 `createSystemMessage()` 构造输入，仅替换认证数据和 provider transport。没有接触真实账户或私有服务：

| 输入方式 | Gemini 3.7 Flash | Claude Opus 4.6 Thinking |
| --- | --- | --- |
| 旧 `options.system = marker` | marker 到达 provider body | marker 到达 provider body |
| V3 `messages = [system(marker), user]`，不设置 options.system | marker 丢失 | marker 丢失 |

补充测试 4 项中 2 项控制组通过、2 项 V3 断言失败。插件原有 254 项测试全部通过，因为现有系统提示词测试仍使用旧 options.system 输入；它们没有证明 V3 loop 路径正确。

修复应同时支持历史中的规范化 system 消息与 legacy one-shot options.system，保持完整内容、顺序与优先级。不要为了绕过转换而盲目声明 `in-history` 能力；该声明要求模型真正支持历史中任意位置更新系统提示词。

## Codex：普通模型请求与原生压缩需分别判断

`CodexAuthAdapter` 继承目标版公共 `PiAiAdapter` 并委托已安装 pi-ai provider 做转换。隔离新图固定 pi-ai 0.85.1，实际 direct 和 prepared 两条路径的 provider body 均保留 V3 system marker。现有普通模型请求、认证命令等测试也有通过证据；没有证据要求重写 OAuth 或把整个 Codex provider 判为不可用。

但原生能力有明确限制：

1. `src/runtime-compatibility.ts` 仅认可完整一致的 DSH 0.1.2-alpha.5、0.1.3-alpha.1；`src/compaction.ts:97` 又要求 pi-ai 0.84.4。实际在 0.1.5-alpha.1 / pi-ai 0.85.1 下构造 CodexCompactionEngine 会抛兼容性错误。[压缩校验](https://github.com/suntianc/dsh-codex-auth/blob/92ebda2a57c2c860517183b27b3b32fbeb485891/src/compaction.ts#L69-L111)
2. `isCodexNativeReplayRuntimeCompatible()` 同样不接受新图，已有 Native checkpoint 走 Portable 表示。不是静默宣称 Native 仍可用。[回放校验](https://github.com/suntianc/dsh-codex-auth/blob/92ebda2a57c2c860517183b27b3b32fbeb485891/src/native-checkpoint.ts#L29-L47)、[Portable 分支](https://github.com/suntianc/dsh-codex-auth/blob/92ebda2a57c2c860517183b27b3b32fbeb485891/src/native-checkpoint-replay.ts#L121-L140)
3. 目标版 `Session.fromRestore()` 需要第 5 个 `eventState` 参数。当前 `tests/dual-checkpoint.spec.ts:924,947,1011,1088` 和 live 测试文件 `:331` 仍传 4 个参数，导致 typecheck 失败；本轮没有执行 live 测试。[目标 Session API](https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/core/session/src/index.ts)
4. 完整原有测试运行结果为 189 通过、113 失败。失败集中在 compaction 挂载和依赖 Native replay 的预期，不应解释为 113 个独立缺陷。生产 Host/client 构建通过。

Session V3 还移除 header.system、引入 system head 的压缩保护、调整替换事件 envelope。扩展 gate 前应重新验证真实 V3 的手动/自动/overflow 压缩、Dual checkpoint、fork/resume、历史迁移、Native/Portable 转换和 pi-ai 0.85.1 的最终 payload；本轮保持生产 gate 不变。

## UI 与 Icon

### Tool Result Images

插件注册 `conversation.chat.node` 并调用 `renderMessageImages`；这两条公共接口仍存在。上游删除的是 `conversation.details.tool` 等 Detail 接口，插件没有消费它们。新版本支持模型回复里的本地路径图片，也不等同于本插件在回合结束后将 Tool result 图片提升到 Compact 主对话的行为。[插件入口](https://github.com/suntianc/dsh-ui-tool-result-images/blob/c2df9242c13f5dcf4a9e74974c83a9e42a03437b/src/client/index.tsx#L12-L21)、[保留的上游 slots](https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/client/ui-chat/src/client/contract/slots.ts#L175-L195)

原有 4 项测试和生产构建通过。typecheck 失败位于测试 fixture `tests/tool-result-images.client.spec.ts:218`：`{ op: 'replace', start, end }` 应适配成新 envelope 的 `startSeq/endSeq`。生产投影只接受 append Tool result，因此旧 fixture 目前即使字段失真也会被忽略；测试运行通过不等于 fixture 正确。

### Settings Icons

目标图的类型检查、14 项测试和生产构建通过。上游 settings slots、settings-general 注册和组件/样式实现与 0.1.3-alpha.1 相同；该目录唯一变化为 `locales.ts` 的重连提示：例如“连接中”改为“自动重连中”。插件自带 `src/client/locales.ts` 仍是旧文案，可在兼容升级中同步，属于体验差异。[上游设置外壳](https://github.com/deepseek-ai/deepseek-harness/tree/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/client/ui-settings-general/src/client)

首次评估未做新 Web 实测。后续隔离浏览器验证已覆盖图片折叠/重载/去重、设置开关、Escape 焦点恢复、图标展示与断线重连，见运行验证报告；没有启动或修改用户现用 Web。动态图标注册更新未另做浏览器覆盖。

## 没有命中当前生产代码的上游变更

- 四插件没有直接使用已删除的 `ctx.agent`、构造 `Inbox` 或调用其已移除公共方法。已有 `exec.agent`、`ctx.agents` 是不同的公开入口，不能因为名字相似就判为破坏。
- commands 的 Host 定义和执行代码在上游两个固定 tag 间相同；两个刚合并的 auth 命令测试在目标图有通过证据。保留当前账户授权策略和 command/done 去敏要求。
- Session format V3 的迁移由 Host 负责；插件不能自行修改用户日志。上游明确说明升级后的会话格式不能被旧版降级读取，这是 Host 升级的边界。[官方说明](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.5-alpha.1)

## 本轮验证方法与限制

四个独立 Git 仓库 root 和 canonical origin 均已核对；本地 main SHA 如上表。完整 origin 为 `git@github.com:suntianc/<插件名>.git`，本地根为 `/Users/suntc/project/dsh-plugins/<插件名>`。本任务来自跨四插件评估请求，不是新的 issue 实现；Codex/Antigravity main 分别包含已合并 PR #22/#25。

测试目录为 `/private/tmp/dsh-015-impact-67x0ftyf`。从每个 Git HEAD 归档创建副本，仅在副本中将 DSH 依赖/peer 及完整传递 peer 闭包固定为 0.1.5-alpha.1，Codex 的 pi-ai 固定为 0.85.1；然后 clean install（ignore-scripts），运行原有 check。源代码、已有测试和 gate 脚本保持原样。锁文件检查确认各副本只含目标 DSH 版本：Codex 73 包、Antigravity 31 包、UI 52 包、Icon 22 包，没有混入旧 prerelease 图。

| 验证 | Codex | Antigravity | UI Images | Icons |
| --- | --- | --- | --- | --- |
| 原有 check | typecheck 失败 | 到 package smoke 失败 | typecheck 失败 | 到 package smoke 失败 |
| 原有 tests | 189 通过 / 113 失败 | 254 通过 | 4 通过 | 14 通过 |
| 生产 build | 通过 | 通过 | 通过 | 通过 |
| 额外 V3 system 探针 | direct/prepared 共 2 通过 | 2 通过 / 2 失败 | 不适用 | 不适用 |

Antigravity/Icon 的 package smoke 失败是因为脚本仍限定旧验证版本/原始 peer 范围；该结果与实际 request bug 分开记录，不能把它描述成目标 graph 混版，也不能把这轮说成 full check 全通过。UI/Codex 的 check 早停后，单独运行其 tests/build 以区分测试契约和生产编译问题。没有为了得到绿灯而放宽生产 gate 或修改 npm 包。

证据文件位于上述临时目录：各插件的 `*-install.log`、`*-check.log`，Codex/UI 另有 `*-test.log`、`*-build.log`；补充探针为 `anti-v3-system-probe.log`、`codex-v3-system-probe.log`，对应副本 `tests/review-v3-system.spec.ts`；`registry-manifests.json` 和 `verification-receipt.json` 记录依赖元数据、SHA、版本与源文件一致性。

补充实测后的实施顺序：先处理独立上游 Connection 通用 RPC 阻塞（不能仅改插件依赖声明），并修 Antigravity 的 V3 system 输入转换并加运行路径回归；再完成 Codex V3/新版 pi-ai 的原生能力验证；同时完成两个 UI 插件的版本元数据、小范围 fixture/文案更新；最后运行四插件完整 gate 和隔离 Web 验证。

首次评估仅新增本报告与上游研究文档；后续补充了运行验证报告并更新本文。两轮均未修改四插件生产源码、已有测试、package.json 或 lockfile；未 commit、push、publish、部署、修改全局包/profile，也未执行真实 OAuth 或私有端点请求。
