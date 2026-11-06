# @lynn123411/dsh-notify-user 详情

> 本文档是 [README.md](./README.md) 的补充：装配形态、节点投影、配置项、计数口径、设计参照与验证。

## 装配形态

```sh
dsh plugin --profile web add @lynn123411/dsh-notify-user
```

这条命令把包名写进 profile 的 `dependencies` 与 `dsh.profile.bundles`，包内 `cordis.patch.yml` 随之插入一条 root loader entry（`id: dsh-notify-user`）。这一行同时承载两个半边：

- 宿主半边注册 `notify_user` 工具，并把催办状态机接到 `tools/result`（纯观察）与 `agent/pre-step` 两条事件上；
- 浏览器半边注册对话节点定义、进度卡渲染器（`conversation.chat.node`，key 是 `notify-user`）、工具行兜底渲染（`tool.call.toolview`，key 是 `notify_user`）与插件页配置卡（`plugins.bundle.config`，key 是包名）。

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

## 配置项

| 字段 | 默认 | 范围 | 说明 |
| --- | --- | --- | --- |
| `nudgeAfter` | 8 | 0–100 | 连续多少次根工具调用没有汇报时催一次；0 关闭催办。 |
| `collapsible` | true | 布尔 | 进度卡标题旁带不带折叠键；带折叠键时正文仍默认展开，关掉后正文始终展开、不显示折叠键。 |

字段都标了 `.volatile()`：改它们不重挂这条 loader entry。催办状态机每次 `pre-step` 现读 `nudgeAfter`；进度卡通过注册项的 `inject` 拿到同一张配置表单并订阅，所以 `collapsible` 改完当前页面的卡片立刻跟着变。配置界面在宿主「插件」页本插件的详情页上；宿主没服务这份配置时卡片整块不出现。插件同时用 `ctx.settings.configure({ auto: false })` 关掉内核按 schema 自动生成的那份设置页。

## 计数口径

- 只数**根调用**：原生模式下是模型每次直接发起的调用（同一轮里的并行调用各算一次）；PTC 模式下是每次 `run_code`，程序内部的子调用不算。
- `notify_user` 无论根调用还是 PTC 子调用都清零。
- 新回合（`agent/pre-step` 的 `step === 1`，不论由用户、定时提醒、队友消息还是 webhook 触发）或用户插话（收件箱里有 `source.kind === 'user'` 的消息）清零。回合边界取宿主给的 `step`，不按消息来源枚举。
- 子代理会话不计数、不注入。
- 催办注入的是**指令**，不是替模型写正文；注入消息的来源是 `notify-user-nudge`、`form: 'notice'`，只进模型上下文，不占对话流正文。

## 设计参照

机制照 Kimi Code 的 `NotifyUser`（[`packages/agent-core-v2/src/features/notify`](https://github.com/MoonshotAI/kimi-code/tree/6974ac880d405d5565a2189925f3bef6daea6892/packages/agent-core-v2/src/features/notify)）：普通工具调用负责产出更新，独立的一层 reminder 在模型久不汇报时注入一条指令。阈值与计数口径按 DSH 的两种工具呈现方式调整。

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
- `smoke-host.mjs`：真 cordis + 真 `ToolRuntime`，断言配置形状、工具注册与执行、装配行，以及催办接线在真 `ctx.waterfall` 下的行为（满阈值注入、汇报/新回合/用户插话/阈值 0 清零、上下文注入不清零、PTC 子调用不计数、嵌套汇报清零、子代理不注入、下游拒绝时不追加）。
- `smoke-client.mjs`：按 Web shell 方式装载浏览器 bundle，断言对话节点定义、三处座位注册、字典键集与「未声明服务读取会抛」的守卫。
- `test-nudge.mjs`：催办状态机的纯逻辑（阈值、清零、现读、按 agent 隔离）。
- `test-row-model.mjs`：进度卡数据视图的三条来路（`meta` / PTC 参数 / start 参数）与标题回退。
- `test-notify-node.mjs`：对话节点定义的认领范围、节点位置与卡片数据（原生调用、结果落定、流式增量与块结束、PTC 子调用、结果先到、没有正文时的兜底）。
- `assert-lib-untracked.mjs`：`lib/` 是构建镜像，不入 git。

浏览器里验收：打开跑过 `notify_user` 的会话，展开回合后进度卡应站在步骤组外、前后各有一条折叠组。DOM 判据是 `[data-chat-flow-kind="notify-user"]` 的节点不在 `[data-step-process-body]` 里，`[data-step-process]` 的组头成对出现在卡片之间。

实测（2026-11-06，运行中的 0.2.2-rc.1 实例）：本会话加载窗口内 6 张进度卡全部站在步骤组外（0 张落在 `[data-step-process-body]` 里），卡片之间成对出现 `[data-step-process]` 组头；展开回合后看到「进度卡 → 折叠组 → 进度卡」的形态。
