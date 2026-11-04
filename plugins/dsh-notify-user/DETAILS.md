# @lynn123411/dsh-notify-user 详情

> 本文档是 [README.md](./README.md) 的补充：装配形态、配置项、计数口径、设计参照与验证。

## 装配形态

```sh
dsh plugin --profile web add @lynn123411/dsh-notify-user
```

这条命令把包名写进 profile 的 `dependencies` 与 `dsh.profile.bundles`，包内 `cordis.patch.yml` 随之插入一条 root loader entry（`id: dsh-notify-user`）。这一行同时承载两个半边：

- 宿主半边注册 `notify_user` 工具，并把催办状态机接到 `tools/post-execute` 与 `agent/pre-step` 两条事件上；
- 浏览器半边注册进度卡（`tool.call.toolview`，key 是 `notify_user`）与插件页配置卡（`plugins.bundle.config`，key 是包名）。

行 id 同时是配置命名空间：宿主 `Config` 与浏览器 `ctx.configForms.get('dsh-notify-user')` 读写的是同一份值。

## 配置项

| 字段 | 默认 | 范围 | 说明 |
| --- | --- | --- | --- |
| `nudgeAfter` | 8 | 0–100 | 连续多少次根工具调用没有汇报时催一次；0 关闭催办。 |
| `collapsible` | true | 布尔 | 进度卡标题旁带不带折叠键；带折叠键时正文仍默认展开，关掉后正文始终展开、不显示折叠键。 |

字段都标了 `.volatile()`：改它们不重挂这条 loader entry。催办状态机每次 `pre-step` 现读 `nudgeAfter`；进度卡通过 `tool.call.toolview` 注册项的 `inject` 拿到同一张配置表单并订阅，所以 `collapsible` 改完当前页面的卡片立刻跟着变。配置界面在宿主「插件」页本插件的详情页上；宿主没服务这份配置时卡片整块不出现。插件同时用 `ctx.settings.configure({ auto: false })` 关掉内核按 schema 自动生成的那份设置页。

## 计数口径

- 只数**根调用**：原生模式下是模型每次直接发起的调用（同一轮里的并行调用各算一次）；PTC 模式下是每次 `run_code`，程序内部的子调用不算。
- `notify_user` 无论根调用还是 PTC 子调用都清零。
- 新回合（`agent/pre-step` 的 `step === 1`，不论由用户、定时提醒、队友消息还是 webhook 触发）或用户插话（收件箱里有 `source.kind === 'user'` 的消息）清零。回合边界取宿主给的 `step`，不按消息来源枚举。
- 子代理会话不计数、不注入。
- 催办注入的是**指令**，不是替模型写正文；注入消息的来源是 `notify-user-nudge`、`form: 'notice'`，只进模型上下文，不占对话流正文。

## 设计参照

机制照 Kimi Code 的 `NotifyUser`（[`packages/agent-core-v2/src/features/notify`](https://github.com/MoonshotAI/kimi-code/tree/6974ac880d405d5565a2189925f3bef6daea6892/packages/agent-core-v2/src/features/notify)）：普通工具调用负责产出更新，独立的一层 reminder 在模型久不汇报时注入一条指令。阈值与计数口径按 DSH 的两种工具呈现方式调整。

## 已知现状

卡片优先读 `tool/result.meta`（原生调用）与 `tool/ptc-dispatch.meta`（PTC 子调用）；窗口截断或旧构建里没有 `meta` 时回退到 `call.argsRaw`。两条来路都来自会话日志，直播与重放画出来一样。

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
- `smoke-client.mjs`：按 Web shell 方式装载浏览器 bundle，断言两处座位注册、字典键集与「未声明服务读取会抛」的守卫。
- `test-nudge.mjs`：催办状态机的纯逻辑（阈值、清零、现读、按 agent 隔离）。
- `test-row-model.mjs`：进度卡数据视图的三条来路（`meta` / PTC 参数 / start 参数）与标题回退。
- `assert-lib-untracked.mjs`：`lib/` 是构建镜像，不入 git。
