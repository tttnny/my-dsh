# @lynn123411/dsh-subagent-judge-dispatch 详情

> 本文档是 [README.md](./README.md) 的补充：装配形态、开发副本与验证。

## 装配形态

装进 profile 一条命令即可，在 profile 里不用手写任何补丁：

```bash
dsh plugin --profile web add @lynn123411/dsh-subagent-judge-dispatch
```

这条命令把包名写进 profile 的 `dependencies`，并登记进 `dsh.profile.bundles`；包内 `cordis.patch.yml` 随之插入一条根层行：

```yaml
- insert:
    - id: dsh-subagent-judge-dispatch
      name: '@lynn123411/dsh-subagent-judge-dispatch'
```

这条行同时承载两个半边：宿主半边在那条行下注册插件本体，浏览器半边由 Web shell 按 root loader 的 enabled entry 依据 `dsh.client` 声明服务 `lib/client.js`。行不写 `config`——配置一律经插件页的卡片读写，避免出现第二处真相。

宿主半边声明的服务（`inject`）：`credentials`、`sessions`、`sessionTitle`；`connection` 经 `ctx.inject` 取，取不到时插件照常加载、只是没有那三条读取通道；`settings` 同样经 `ctx.inject` 取，用来声明本条目不走宿主自动生成的设置页。

客户端半边声明的服务（`dsh.client.inject`）：`@deepseek-ai/dsh-client-locale`、`@deepseek-ai/dsh-client-ui-settings`、`@deepseek-ai/dsh-client-ui-plugin-manager`、`@deepseek-ai/dsh-client-ui-renderer`、`@deepseek-ai/dsh-client-ui-primitives`、`@deepseek-ai/dsh-api-remotes`。少声明一个不会报错，只会让插件在页面里消失。

配置卡片的 key 是**包名**，卡片读写的命名空间是**本插件 Loader 行的 id**（同一个字面量 `dsh-subagent-judge-dispatch`）——两者是不同的字面量，写歪一个的症状是配置永远不出现。

## 判断与改写

- **插手位置**：宿主的 `agent/request` 瀑布。注册在根层上下文，所以每个代理的每次请求都会经过；插件自己用 `subagentDepth`（会话头里的 `delegationDepth` 与运行时 `options.subagentDepth` 取较大者）筛出子代理。
- **判断次数**：按子代理 id 记住已判过的，一个跑十步的子代理只问一次。
- **任务文字**：只读子代理自己产生的那段事件——先取它自己最后一条 `subagent/descriptor` 的 `label`（就是派工时写的一句话描述），没有时取它自己的头一条用户消息正文。**不能从日志开头读**：fork 出来的子代理，日志前缀是父代理已完成的回合，从开头读会把祖先的标签和父对话的第一条消息送给判断模型。
- **判断协议**：`POST` 到页面填的地址，请求体 `{ model, state: { message }, questions }`；`questions` 只有一个 `task_type`，类型是 `choice`，`criteria` 就是你的类型清单（键是编号、值是你写的描述），答复取被选中选项的编号。
- **写入铁律**：模型、强度、提供方三项一起写。`resolveChildAgentOptions` 在「换了模型但没给强度」时会删掉继承来的强度，所以三项必须同进同出。
- **兜底**：任何失败都一个字段都不写，把宿主解析好的那个调用配置按身份原样退回——不是「把主代理的值再写一遍」，而是根本不碰它。这是 `decideRewrite` 返回 `none`、`applyDecision` 原样返回入参所保证的。

## 开发副本

运行副本用 `link:` 连到本仓库目录，改完即生效（细则见仓库 `docs/rules/dev-copy.md`）：

```bash
cd ~/.dsh/profiles/web && pnpm add "link:<my-dsh 绝对路径>/plugins/dsh-subagent-judge-dispatch" --offline
cd <my-dsh 绝对路径>/plugins/dsh-subagent-judge-dispatch && pnpm install && pnpm build
```

客户端半边改完刷新页面即生效，必要时硬刷新一次；宿主半边要重启 DSH 实例（loader 只在启动时装载）。

## 验证

在包目录跑一条链：

```bash
cd plugins/dsh-subagent-judge-dispatch && pnpm check
```

`check` = `typecheck` + `build` + 三个自检 + `assert:lib-untracked`：

- **`scripts/test-decision.mjs`** 打的是 `src/`（Node 直接跑 `.ts`），守判断与改写这条纯逻辑：失败时**按身份**退回同一个对象（不是深比较——深比较会放过「复制一份再写回原值」这种仍然算覆盖的写法）、三项同写、残缺行不生效、答复读取的三种形状与七种空答复、四种失败原因各自的归类、超时不重试、日志留 20 条且读出来是副本、编号按位置从 1 连着。
- **`scripts/smoke-host.mjs`** 起真 cordis `Context`，把 `agent/request` 瀑布按宿主的方式跑一遍（`await next()` 拿到解析好的配置，再把返回值交给断言）：主代理不被判断、同一子代理只判一次、两个开关各自的短路、发送出去的请求体形状、没有描述时取任务正文、fork 子代理只读自己的事件、判断过的记忆有上限。
- **`scripts/smoke-client.mjs`** 按 Web shell 的方式装载 `lib/client.js`（`window.__ModuleLoader__.load` 桩件），喂假 cordis 服务：断言卡片注册进 `plugins.bundle.config`、key 是包名、走 `slots.inject`、读本插件自己的命名空间与宿主那份「子代理可选用哪些模型」设置、以宿主在服务本条目为挂载条件、样式表在 `apply()` 追加一次且没写死色值，以及 zh/en 键集一致。它的守卫带反例断言（「守卫拒绝未声明的服务读取」必须抛），否则那一串绿灯是假的。

`lib/` 是构建镜像，`assert:lib-untracked` 判它没被 git 跟踪。

要肉眼确认页面上的形态，用仓库的 `node tools/verify-client.mjs dsh-subagent-judge-dispatch --needle '<你新写的文案>'`。
