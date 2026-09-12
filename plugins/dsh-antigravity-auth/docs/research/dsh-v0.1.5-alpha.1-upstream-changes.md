# DSH 0.1.5-alpha.1 上游公共契约变更核验

核验日期：2026-09-08。范围：为 Codex、Antigravity、工具结果图片 UI、Settings icons 四插件的只读兼容评估提供上游证据；本文件不替代四插件的实际类型检查、测试或运行验证。比较基线为 `dsh-v0.1.3-alpha.1`，目标为 `dsh-v0.1.5-alpha.1`。未修改插件实现、依赖或现用 profile。

## 版本固定点

- GitHub release `dsh-v0.1.5-alpha.1` 于 `2026-09-08T16:16:04Z` 发布；tag 直接指向 commit `5dda764ed3aa172535a7967b06ff95d9cbfe536a`。[官方 release](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.5-alpha.1)、[官方 tag API](https://api.github.com/repos/deepseek-ai/deepseek-harness/git/ref/tags/dsh-v0.1.5-alpha.1)
- npm `@deepseek-ai/dsh` 的 `alpha` 为 `0.1.5-alpha.1`，`latest` 和 `next` 仍为 `0.1.2-rc.1`；该 alpha 发布时间 `2026-09-08T15:57:30.560Z`。因此这里的“最新”是最新 alpha，不是默认 `latest`。[npm registry 元数据](https://registry.npmjs.org/@deepseek-ai%2fdsh)
- 该版本 npm tarball SHA-1 为 `5d008b33af044fcc726383112c36581f73138d2d`，integrity 为 `sha512-AUjywjrPnhXcAdAjRNgyQa1QCnplFTNYZ+XpR9uCZdbg2FiCb06pHyoDUB2Wxuddzid9D7pVwEiU1OTl4Oshsg==`。这里只核验 registry 元数据，不宣称验证了下载 tarball 的文件校验和。[版本元数据](https://registry.npmjs.org/@deepseek-ai%2fdsh/0.1.5-alpha.1)
- Release 的默认 changelog 从 `0.1.3-alpha.2` 起算，本次额外下载了 `0.1.3-alpha.1` 与目标 tag 的官方源码归档并直接比较，以覆盖当前插件已验证的旧目标。[完整比较](https://github.com/deepseek-ai/deepseek-harness/compare/dsh-v0.1.3-alpha.1...dsh-v0.1.5-alpha.1)

以下源码链接固定到目标 commit，历史删除项另附旧 tag 链接。

## 1. LLM 请求：首要兼容风险是系统提示词位置变化

`GenerateOptions.system` 没有删除，但它现在只为手工 one-shot 请求提供前置系统提示词。agent-loop 请求将提示词放进 `messages` 中的 `role: 'system'` 消息，`system` 留空。该变更既有类型文档也有实际构造代码：agent-loop 从 `session.deriveMessages()` 取得完整消息数组，构造请求时不再拷贝旧 header.system。[GenerateOptions 契约](https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/llm/llm/src/types.ts#L416-L436)、[实际请求构造](https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/core/agent-loop/src/agent.ts#L601-L617)

**对 Codex / Antigravity 的检查要求（推论）：** 必须验证 provider serializer 接受 `messages` 的 system role，并按对应 provider 的系统字段正确投影；只读 `options.system` 可能漏掉全部 loop 系统提示词。类型本身不一定报错，因为 Message 的 role 在旧版本就已允许 system。还需保留 one-shot `options.system` 路径，防止修复 loop 时破坏压缩、标题或插件手动调用。[Message role 与新 SystemMessage](https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/llm/llm/src/message.ts#L127-L161)、[上游 serializer 同时处理历史 system 和 options.system](https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/llm/llm-deepseek/src/serialize.ts#L299-L306)、[one-shot 前置 system](https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/llm/llm-deepseek/src/serialize.ts#L380-L391)

新增可选 `LlmResolvedModelInfo.systemPromptUpdate: 'in-history'`，表示模型将历史任意位置的最新 system 消息当作完整当前提示词。未声明时由 core 使用首条 system 的规范化方式；不能为通过兼容性检查就盲目声明支持。agent-loop 读取本次 prepared call 捕获的能力决定如何提交 `system/message`，不是使用旧 request/context 猜测。[能力定义](https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/llm/llm/src/types.ts#L339-L356)、[prepared-call 能力使用](https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/core/agent-loop/src/agent.ts#L358-L371)、[system 事件完整语义](https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/core/session/src/types.ts#L298-L312) [实际 normalize 实现](https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/core/agent-loop/src/runtime-context.ts#L81-L102)

`LlmAdapter` 抽象类方法本体相对旧 tag 没有变更；`ReplayEnvelope`、`StreamChunk` 原有成员也没有改名。流记录模块增加直接读取 compact records 的 helper，未删除旧 expand 路径。不能据此认定具体插件 replay 安全，但也没有“V3 统一替换 adapter replay 协议”的上游证据。[LlmAdapter](https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/llm/llm/src/index.ts#L200-L290)、[replay 与流协议](https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/llm/llm/src/types.ts#L359-L400)、[新增 stream helper](https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/llm/llm/src/assistant-stream.ts#L234-L460)

## 2. Session V3、迁移和压缩

`SESSION_FORMAT_VERSION` 从 2 升为 3；`EpochHeader.system` 删除；新增 surface 事件 `system/message`。`SurfaceOp` 的替换 envelope 从 `{ op: 'replace', start, end }` 改为 `{ op: 'replace', startSeq, endSeq }`，所有四类 surface 事件的 `surfaceOp` 都成为必填。仅普通类型检查不足以覆盖手写 JSON fixture、持久化恢复、fork 与 checkpoint。[格式版本](https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/core/session/src/types.ts#L85-L88)、[EpochHeader](https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/core/session/src/types.ts#L227-L240)、[SurfaceOp 与必填意图](https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/core/session/src/types.ts#L406-L456)

新 V3 原生输入显式拒绝仍携带 `header.system` 的 request/header，也拒绝旧替换字段。空 system 消息在 surface 中保留位置但不生成模型输入。[header 验证](https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/core/session/src/surface.ts#L139-L153)、[空消息投影](https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/core/session/src/surface.ts#L108-L116)

压缩不能消费 surface node 0 的 system head；只有新的 system/message 可恰好覆盖该 head，后续 system 节点可参与普通压缩。若插件把旧“首条 surface 即普通 user”假设写进压缩或 replay fixture，需要重新验证。compaction/summary 等 payload 中的 `shadowedRange.start/end` **没有随 envelope 一同改名**。[保护逻辑](https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/core/session/src/surface.ts#L399-L417)、[迁移 payload 坐标规则](https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/session/session-format-v2-to-v3/README.md#L76-L88)

官方迁移器插入 system 事件并重映射明确列出的事件引用；既有消息 ID、embedded assistant streams、opaque replay 数据、工具参数与结果保留其语义，不能直接把全部 session seq 视作不变。发布说明另明确升级恢复创建新日志、保留原文件，升级后格式不能供旧版本降级读取。这里是宿主会话格式边界，不是插件应自行迁移用户数据的授权。[迁移实现规范](https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/session/session-format-v2-to-v3/README.md#L54-L88)、[官方 release](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.5-alpha.1)

## 3. Agent 与 Inbox

`Context.agent` 声明与 accessor 删除；`AgentSetup` 回调新增显式 `agent` 参数；创建/恢复的 `parentAgent` 成为显式 runtime ownership 输入。`Inbox` 从 agent 包的可构造运行时类改为公开类型接口，使用 `agent.inbox`，公开接口不含 `hasPending` / `claim`。[新 Context/AgentSetup](https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/core/agent/src/index.ts#L26-L67)、[旧 Context.agent](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.3-alpha.1/packages/core/agent/src/index.ts#L27-L56)、[新 Inbox 接口](https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/core/agent/src/runtime-types.ts#L47-L100)、[agent.inbox](https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/core/agent/src/runtime-types.ts#L163-L174)

**相关性边界：** 只有实际读取 ctx.agent、构造 Inbox、调用被删方法或参与 Agent 创建的插件才命中；需要主报告对四插件使用点核验。仅凭 release 的 breaking-change 标签不能断言四个都坏。

## 4. 右侧 Sidebar 与 UI slot

原 `conversation.details.tool` single slot、`DetailsToolOwnerProps`、`DetailsSlotProps` 从 ui-chat 删除；`ChatNodeOwnerProps.selectedCallId` 同时删除。`openFile` 保留并增加可选 `options.line`；`conversation.chat.node` 和 `conversation.message.images` 保留。实际挂旧 details slot 的插件需要迁移；挂 chat node/images 的插件不能仅因为 Detail 被替换就判失败。[旧 details slot](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.3-alpha.1/packages/client/ui-chat/src/client/contract/slots.ts#L225-L235)、[新 ChatNode owner](https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/client/ui-chat/src/client/contract/slots.ts#L78-L95)、[保留的 chat/image slot](https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/client/ui-chat/src/client/contract/slots.ts#L175-L195)

`MessageImagesOwnerProps` 保持 `images/loadImage/align/compact` 形状。UI-conversation 另新增 header.corner slot，并改变 composer busy submit 注入契约；这些变化不能直接推断成工具结果图片损坏，需比对插件是否消费对应 props。[images owner](https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/client/ui-conversation/src/client/contract/slots.ts#L93-L111)、[header corner](https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/client/ui-conversation/src/client/contract/slots.ts#L141-L153)、[composer 注入](https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/client/ui-conversation/src/client/contract/slots.ts#L309-L326)

直接逐字节比较确认，下列与本次重点相关的上游文件从基线到目标完全相同：`ui-settings/src/client/contract/slots.ts`、`ui-settings-general/src/client/index.ts`。Settings 的 trigger/header/action/section 等 slot 因此没有本轮契约改名证据；新增右侧 Sidebar 并不等同于左侧 Settings 图标扩展失效。[Settings slots](https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/client/ui-settings/src/client/contract/slots.ts#L14-L90)、[Settings 注册](https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/client/ui-settings-general/src/client/index.ts#L146-L176)

## 5. Slash commands

`packages/interaction/commands/src/index.ts` 与 `src/types.ts` 两份文件相对基线逐字节相同。CommandDefinition/execute/CommandResult 及 command/run、command/done 持久化契约未发现改动；本轮主要变化是内置命令说明的客户端本地化。Codex、Antigravity 新增 auth 命令仍需在目标依赖图实际验证，但无“命令只剩终端可执行”或“结果不再落盘”的证据；必须继续保留各插件 Host 权限边界和结果去敏逻辑。[CommandDefinition](https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/interaction/commands/src/index.ts#L60-L110)、[execute](https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/interaction/commands/src/index.ts#L329-L384)、[command/done](https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/interaction/commands/src/types.ts#L91-L115)

## 验证方法和交付边界

- 本地文档落点：`/Users/suntc/project/dsh-plugins/dsh-antigravity-auth`；已核对 Git root 与 `git@github.com:suntianc/dsh-antigravity-auth.git` 一致。本研究来自用户跨四插件兼容评估请求，不对应新的 issue 实现。
- 通过 GitHub Release/Tag API、npm registry、官方两个 tag 源码归档核验；临时源码在 `/tmp/dsh-015-upstream-research`。归档无 CodeGraph 索引，工具明确返回未索引后使用文件差异和定点源码读取；未初始化索引。
- 本文件仅新增研究文档；未修改插件源码/lockfile、安装到 profile、调用账号/OAuth、提交、推送或发布。没有为本上游文档单独运行插件 package check；主报告应分别给出目标依赖图的实际验证结果。
