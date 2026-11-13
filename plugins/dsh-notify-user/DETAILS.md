# @lynn123411/dsh-notify-user 详情

> 本文档是 [README.md](./README.md) 的补充：装配形态、节点投影、配置项、按会话开关、计数口径、设计参照与验证。

## 装配形态

```sh
dsh plugin --profile web add @lynn123411/dsh-notify-user
```

这条命令把包名写进 profile 的 `dependencies` 与 `dsh.profile.bundles`，包内 `cordis.patch.yml` 随之插入一条 root loader entry（`id: dsh-notify-user`）。这一行同时承载两个半边：

- 宿主半边注册 `notify_user` 工具，并把催办状态机接到 `tools/result`（纯观察）、`session/event`（助手消息落定）与 `agent/pre-step` 三条事件上；
- 浏览器半边注册对话节点定义、进度卡渲染器（`conversation.chat.node`，key 是 `notify-user`）、工具行兜底渲染（`tool.call.toolview`，key 是 `notify_user`）、菜单开关（`conversation.input.model.options`，id 是 `notify-user-enabled`）与插件页配置卡（`plugins.bundle.config`，key 是包名）。

行 id 同时是配置命名空间：宿主 `Config` 与浏览器 `ctx.configForms.get('dsh-notify-user')` 读写的是同一份值。

## 节点投影

`notify_user` 的每次调用在对话流里是一个 `notify-user` 节点，位置是 `process`：它站在步骤组外，客户端的分组逻辑遇到它就结束当前组，于是两次汇报之间的工具调用各自折成一个原生子折叠。

通用工具定义也会匹配同一次调用的全部事件，所以定义用 `exclusive` 认领它们，通用定义不再为这次调用建节点：

| 事件 | 认领条件 |
| --- | --- |
| `tool/call` | 工具名是 `notify_user` |
| `tool/result` | 追加写法，且 callId 在调用事件里见过 |
| `assistant/live-chunk` | 带工具名的增量与块结束事件 |
| `tool/ptc-dispatch-start` / `tool/ptc-dispatch` | 工具名是 `notify_user` |

结果事件不带工具名，只能按调用事件记下的 callId 认领；结果先到的上下文（窗口从调用中间开始加载）按结果事件补出节点。窗口里连调用事件都没有时认领不到，通用工具定义补建一条没有工具名的工具行，画成通用行——`tool.call.toolview` 的兜底只在通用定义拿得到工具名时生效（例如节点定义没注册上）。

认领是 target 级的：同一次调用的事件不再交给别的 chat 定义，回合过程的工具调用计数与助手行的流式块列表因此少这一次，两者都不上屏。

位置设成 `inline` 时不注册这份定义：通用工具定义建出工具行，`tool.call.toolview` 把卡片画在行里，卡片随组折叠。切换位置会重挂定义，对话流当场重排。

## 配置项

| 字段 | 默认 | 范围 | 说明 |
| --- | --- | --- | --- |
| `defaultEnabled` | true | 布尔 | 会话没有自己的选择时，主动汇报开不开。 |
| `sessionOverrides` | `{}` | 会话 id → 布尔 | 按会话的选择；只留与默认值不同的会话，切回默认值就删掉那条。 |
| `nudgeAfter` | 10 | 0–100 | 连续多少次根工具调用没有汇报时催一次；0 关闭催办。 |
| `resetOnProse` | true | 布尔 | 助手消息里写了正文（非空白 `text` 块）就清零计数；关掉后只在 `notify_user`、新回合或用户插话时清零。 |
| `collapsible` | true | 布尔 | 进度卡标题旁带不带折叠键；带折叠键时正文仍默认展开，关掉后正文始终展开、不显示折叠键。 |
| `cardPlacement` | `boundary` | `boundary` / `inline` | 进度卡位置：`boundary` 站在步骤组边界，`inline` 跟随工具行、随组折叠。 |

字段都标了 `.volatile()`：改它们不重挂这条 loader entry。催办状态机每次 `pre-step` 现读 `nudgeAfter` 与 `defaultEnabled`/`sessionOverrides`；进度卡与菜单开关通过注册项的 `inject` 拿到同一张配置表单并订阅，所以改完当前页面的卡片与开关立刻跟着变。配置界面在宿主「插件」页本插件的详情页上；宿主没服务这份配置时卡片整块不出现。插件同时用 `ctx.settings.configure({ auto: false })` 关掉内核按 schema 自动生成的那份设置页。

## 按会话开关

菜单里的「主动汇报」开关挂在 `conversation.input.model.options`（list，`id: notify-user-enabled`），与官方智能体团队开关同处一个菜单：排在模型与推理等级两格之后，整行悬停高亮，标签旁的信息按钮解释这个开关做什么。

**一个会话开不开**由 `enabledFor(sessionOverrides, defaultEnabled, sessionId)` 回答：会话有自己的记录就用它，否则用默认值。判定是纯函数，宿主与浏览器两半边共用 `src/shared/config.ts` 里那一份。

**选择存在插件配置里**，不存会话日志：`sessionOverrides` 是一个「会话 id → 布尔」的字典，只留与默认值不同的会话。切回默认值时客户端把那条删掉（`overridesAfterWrite`），所以字典不会随会话数一直长。

> 为什么不是官方团队插件那样「写进会话日志 + 读会话投影」：那条路要一个 typert Remote（宿主 `./typert` 产物 + 客户端描述符）。生成物归内核的构建流水线，第三方插件手写会跟着内核版本漂移。本插件只有一个布尔值要按会话存，改用已有的配置表单：客户端用 `form.set('sessionOverrides', …)` 写，宿主现读，两半边都不加新管线。

**关掉之后**两处一起变：催办状态机不催（`readEnabled` 为假时连计数也清零，重新打开从零开始，不会一开就催）；`notify_user` 工具用 `ctx.tools.register(def, { when })` 按会话收放，关掉的会话在这一步的声明与派发里都没有它。

**子代理会话里不画这一行**：催办本来就不进子代理，开关在那里没有作用。判定同时看当前会话快照的 `subagent` 与会话列表里的 `origin`。

**写入先重画、失败再退回**：点开关先按新值重画，写入交给设置表单排队；宿主拒收就退回宿主上的值，并通过菜单宿主的 `reportFailure` 报一次。写入在途时开关禁用，避免连点叠出两条互相覆盖的写入。

## 计数口径

- 只数**根调用**：原生模式下是模型每次直接发起的调用（同一轮里的并行调用各算一次）；PTC 模式下是每次 `run_code`，程序内部的子调用不算。
- `notify_user` 无论根调用还是 PTC 子调用都清零。
- 助手消息（`assistant/message`）里带非空白正文时清零，`resetOnProse` 关掉则不算；`reasoning` 块不算正文，失败、重试、取消的尝试（`assistant/attempt`）也不清零。
- 新回合（`agent/pre-step` 的 `step === 1`，不论由用户、定时提醒、队友消息还是 webhook 触发）或用户插话（收件箱里有 `source.kind === 'user'` 的消息）清零。回合边界取宿主给的 `step`，不按消息来源枚举。
- 子代理会话不计数、不注入。
- 会话关掉主动汇报时不计数、不注入，计数一并清零；重新打开从零开始算。
- 催办注入的是**指令**，不是替模型写正文；注入消息的来源是 `notify-user-nudge`、`form: 'notice'`，只进模型上下文，不占对话流正文。

## 设计参照

机制照 Kimi Code 的 `NotifyUser`（[`packages/agent-core-v2/src/features/notify`](https://github.com/MoonshotAI/kimi-code/tree/6974ac880d405d5565a2189925f3bef6daea6892/packages/agent-core-v2/src/features/notify)）：普通工具调用负责产出更新，独立的一层 reminder 在模型久不汇报时注入一条指令。阈值与计数口径按 DSH 的两种工具呈现方式调整。

菜单开关的形态照官方智能体团队开关（内核 `packages/client/ui-agent-team` 的 `TeamModeToggle`）：同一行结构、同一套悬停高亮与整行点击区。

进度卡的行首照宿主的 `DisclosureRow`：16px 图标框 + 6px 间距，标题文字因此落在行左边缘 +22px，与过程行、工具行的文字列同列；圆点居中放进那个图标框，正文竖线落在圆点圆心上（+8px），正文文字与标题同列。框宽跟随宿主的字号轴（`--dsh-content-font-delta`），改字号后仍对齐。卡片按行的左边缘定位，所以步骤组边界与跟随工具行两种位置、原生与 PTC 两种呈现方式都落在同一列上。

## 已知现状

节点数据优先读 `tool/result` 的 `meta`（原生调用）；PTC 子调用读 `tool/ptc-dispatch` 的 `meta`；没有 `meta` 的旧日志退回调用参数。三条来路都来自会话日志，直播与重放画出来一样。

## 开发副本

运行副本用 `link:` 连到本仓库目录（细则见仓库 `docs/rules/dev-copy.md`）：

```sh
cd ~/.dsh/profiles/web && pnpm add "link:<my-dsh 绝对路径>/plugins/dsh-notify-user" --offline
```

## 验证

```sh
cd plugins/dsh-notify-user && pnpm check
```

`check` 链上每一步：

- `typecheck`：`src` 的类型闸门。
- `smoke-host.mjs`：真 cordis + 真 `ToolRuntime`，断言配置形状、工具注册与执行、装配行，以及催办接线在真 `ctx.waterfall` 下的行为（满阈值注入、汇报/散文/新回合/用户插话/阈值 0 清零、只有思考块不清零、失败尝试不清零、散文开关关掉不清零、上下文注入不清零、PTC 子调用不计数、嵌套汇报清零、子代理不注入、下游拒绝时不追加），以及按会话开关（关掉的会话不催、默认关掉时新会话不催、显式打开的会话照常催、开关现读、关掉的会话里没有 `notify_user` 工具）。
- `smoke-client.mjs`：按 Web shell 方式装载浏览器 bundle，断言对话节点定义、位置切换会重挂定义、四处座位注册（进度卡、兜底行、菜单开关、配置卡）、字典键集与「未声明服务读取会抛」的守卫。
- `test-nudge.mjs`：催办状态机的纯逻辑（阈值、四条清零路径、阈值与散文开关现读、按会话隔离、散文判定、开关关掉时不催且计数清零、开关按会话现读）。
- `test-config.mjs`：按会话开关的纯逻辑（默认值、会话自己的选择优先、脏数据与原型键不算记录、写入时只留与默认值不同的会话、没有变化时返回同一个对象）。
- `test-render.mjs`：用真 react 把菜单开关画进 jsdom（默认值、写入规则、宿主拒收回退并报失败、写入在途禁用、子代理会话不画、配置不可用不画、锁住不可点）。
- `test-row-model.mjs`：进度卡数据视图的三条来路（`meta` / PTC 参数 / start 参数）与标题回退。
- `test-notify-node.mjs`：对话节点定义的认领范围、节点位置与卡片数据（原生调用、结果落定、流式增量与块结束、PTC 子调用、结果先到、没有正文时的兜底）。
- `assert-lib-untracked.mjs`：`lib/` 是构建镜像，不入 git。

浏览器里验收：打开跑过 `notify_user` 的会话，展开回合后进度卡应站在步骤组外、前后各有一条折叠组。DOM 判据是 `[data-chat-flow-kind="notify-user"]` 的节点不在 `[data-step-process-body]` 里，`[data-step-process]` 的组头成对出现在卡片之间。

按会话开关：打开模型与推理等级菜单，模型与推理等级两格之后应有「主动汇报」一行；关掉它之后当前会话不再出现催办提示，`notify_user` 也从下一步的工具清单里消失；切回插件页把「默认开启」关掉，新会话的菜单开关应当默认是关的。

实测（2026-11-06，运行中的 0.2.2-rc.1 实例）：本会话加载窗口内 6 张进度卡全部站在步骤组外（0 张落在 `[data-step-process-body]` 里），卡片之间成对出现 `[data-step-process]` 组头；展开回合后看到「进度卡 → 折叠组 → 进度卡」的形态。
