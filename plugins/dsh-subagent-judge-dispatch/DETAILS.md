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

客户端半边有两层声明，两层都要写（见 `docs/rules/client-wiring.md`）：

- **cordis 服务名**（`src/client/index.ts` 的 `inject`）：`slots`、`configForms`、`remote`、`remote.session`、`remote.credentials`、`locale`。`remote.session` 读模型目录，`remote.credentials` 写判断密钥。
- **插件契约包名**（`package.json` 的 `dsh.client.inject`）：`@deepseek-ai/dsh-client-locale`、`@deepseek-ai/dsh-client-ui-settings`、`@deepseek-ai/dsh-client-ui-plugin-manager`、`@deepseek-ai/dsh-client-ui-renderer`、`@deepseek-ai/dsh-client-ui-primitives`。

少声明一个不会报错，只会让插件在页面里消失。

配置卡片的 key 是**包名**，卡片读写的命名空间是**本插件 Loader 行的 id**（同一个字面量 `dsh-subagent-judge-dispatch`）——两者是不同的字面量，写歪一个的症状是配置永远不出现。

## 判断与改写

- **插手位置**：宿主的 `agent/request` 瀑布。注册在根层上下文，所以每个代理的每次请求都会经过；插件自己用 `subagentDepth`（会话头里的 `delegationDepth` 与运行时 `options.subagentDepth` 取较大者）筛出子代理。
- **判断次数**：按子代理 id 记住已判过的，一个跑十步的子代理只问一次。
- **任务文字**：只读子代理自己产生的那段事件——先取它自己最后一条 `subagent/descriptor` 的 `label`（就是派工时写的一句话描述），没有时取它自己的头一条用户消息正文。**不能从日志开头读**：fork 出来的子代理，日志前缀是父代理已完成的回合，从开头读会把祖先的标签和父对话的第一条消息送给判断模型。
- **判断协议**：`POST` 到页面填的地址，请求体 `{ model, state: { message }, questions }`；`questions` 只有一个 `task_type`，类型是 `choice`，`criteria` 就是你的类型清单（键是编号、值是你写的描述），答复取被选中选项的编号。
- **写入铁律**：模型、强度、提供方三项一起写。`resolveChildAgentOptions` 在「换了模型但没给强度」时会删掉继承来的强度，所以三项必须同进同出。
- **兜底**：任何失败都一个字段都不写，把宿主解析好的那个调用配置按身份原样退回——不是「把主代理的值再写一遍」，而是根本不碰它。这是 `decideRewrite` 返回 `none`、`applyDecision` 原样返回入参所保证的。

## 配置卡片

- **试通不依赖类型清单**：连通性检查问的是「这个地址与模型能不能答」，所以它自己带一个选项发给判断服务，与读者写没写类型无关——清单是判断时才需要的输入，拿它当能不能测的前提，会让空清单的读者以为服务坏了。返回的原因是连通性本身：`unconfigured`（地址或模型没填）、`unreachable`、`timeout`、`unmatched`。
- **两节各存各的**：判断服务（含两个开关、端点、判断模型、密钥）与任务类型清单各有一个保存按钮，各写自己那几个字段。类型清单那一节的描述空着或两条重了时，只有它自己的保存会拒绝并弹窗说明；判断服务那一节照常能存。保存失败的提示也按节归位，不会跑到另一节下面去。
- **保存按下之后**：密钥先写，再写设置。密钥没写进去就不再动设置；设置被宿主拒绝（共享配置表单 resolve `false` 是拒绝，不是异常）时页面必须报没存上，不能显示成已保存。
- **草稿按字段保留**：宿主每次发布配置，只有读者改过、且改动与「本页上次看到的已提交值」不同的那一项才留在页面上，其余跟着宿主走。按整节保留会让一次保存把读者没碰过的字段写回去，等于撤掉别的页面刚做的改动。
- **放弃改动只丢草稿**：放弃判断服务那一节，只清掉还没交出去的文本与那几项设置；密钥已经存进凭据文件，页面因此不会改口说「还没有密钥」。
- **试通与预览跟着判断服务那一节走**：两个按钮放在这一节保存行的右端，左边写下去、右边查这一份。试通不落盘（它只是问一句），预览要求先把改动保存下来——两者都在标题栏下面，而不是标题那一行：那里是整节的标题，不是一套设置的出口。
- **最近判断是一张六列表**：结果（`类型 3` / `未判成`）、选择（`供应商 · 模型 · 强度`）、主代理、子代理、时间、耗时。结果在最左，读者扫一眼先看「判成了没有」；没判成的原因不在格子里展开，悬停才说——那一列宽度是给编号留的。放不下的格子截断，气泡用宿主的 `Tooltip`（原生 `title` 键盘够不到）。
- **点一行看的是这段提示词**：弹窗里只有这次真正发给判断模型的请求体，任务文字也在里面。结果、选择、主代理这几项行上已经有了，弹窗不再各列一遍。这条请求体由发出请求的那一处格式化后原样存进日志，页面没有第二次拼装的机会——`scripts/smoke-host.mjs` 断言日志里那一段与发出去的请求体同值。
- **密钥固定引用**：引用名是插件自己的常量 `SUBAGENT_JUDGE_API_KEY`，不是页面填的字段——读者只要把密钥贴进来，不必知道什么是凭据引用。密钥值交给凭据服务之后立刻从页面状态里清掉，`scripts/test-card.mjs` 有一条断言守着它不出现在状态里。密钥格与上面两格同宽；页面没有凭据通道（非回环地址）时，输入框与「删掉密钥」都禁用，并有一行字说明原因。

## 开发副本

运行副本用 `link:` 连到本仓库目录，改完即生效（细则见仓库 `docs/rules/dev-copy.md`）：

```bash
cd ~/.dsh/profiles/web && pnpm add "link:<my-dsh 绝对路径>/plugins/dsh-subagent-judge-dispatch" --offline
cd <my-dsh 绝对路径>/plugins/dsh-subagent-judge-dispatch && pnpm install && pnpm build
```

客户端半边改完刷新页面即生效，必要时强制刷新一次；宿主半边改完要触发一次 profile 重新组合——在插件页或 `plugin_manager` 里把本插件关一次再开一次，不必重启进程。

## 验证

在包目录跑一条链：

```bash
cd plugins/dsh-subagent-judge-dispatch && pnpm check
```

`check` = `typecheck` + `build` + 五个自检 + `assert:lib-untracked`：

- **`scripts/test-decision.mjs`** 打的是 `src/`（Node 直接跑 `.ts`），守判断与改写这条纯逻辑：失败时**按身份**退回同一个对象（不是深比较——深比较会放过「复制一份再写回原值」这种仍然算覆盖的写法）、三项同写、残缺行不生效、答复读取的三种形状与七种空答复、四种失败原因各自的归类、超时不重试、日志留 20 条且读出来是副本、编号按位置从 1 连着。它还守着「判断带回的提示词就是发出去的那一段」：成功、失败、没发出请求三种情形各一条。
- **`scripts/smoke-host.mjs`** 起真 cordis `Context`，把 `agent/request` 瀑布按宿主的方式跑一遍（`await next()` 拿到解析好的配置，再把返回值交给断言）：主代理不被判断、同一子代理只判一次、两个开关各自的短路、发送出去的请求体形状、没有描述时取任务正文、fork 子代理只读自己的事件、判断过的记忆有上限。它另起一个挂着 `connection` 的实例，从日志路由读回那一行，断言 `prompt` 与真正发出去的请求体同值——判断成功与判断失败各一条。
- **`scripts/smoke-client.mjs`** 按 Web shell 的方式装载 `lib/client.js`（`window.__ModuleLoader__.load` 桩件），喂假 cordis 服务：断言卡片注册进 `plugins.bundle.config`、key 是包名、走 `slots.inject`、读本插件自己的命名空间与宿主那份「子代理可选用哪些模型」设置、以宿主在服务本条目为挂载条件、样式表在 `apply()` 追加一次且没写死色值，以及 zh/en 键集一致。它的守卫带反例断言（「守卫拒绝未声明的服务读取」必须抛），否则那一串绿灯是假的。

- **`scripts/test-card.mjs`** 打的是 `src/`，守配置卡片这层状态机：两节各存各的、清单没填全不挡端点、宿主回 `false` 算没存上、密钥跟着判断服务那次保存一起写且写的是固定引用名、密钥值从不进页面状态、草稿按字段保留（宿主改了一项而我在改另一项时，保存只写我改的那一项），以及「选择」一列把三项连成一段且不留悬空的分隔点。
- **`scripts/test-render.mjs`** 用真 react 把卡片画进 jsdom：试通与预览在判断服务那一节的保存行里、标题栏不再有按钮，日志表是六列且顺序固定，结果写「类型 3」/「未判成」，选择是连成的一段，没判成的原因挂在宿主的 `Tooltip` 上而不是原生 `title`，弹窗里只有那段提示词且不把行上的栏目再列一遍。`ui-primitives` 走替身（真组件是浏览器 ESM、带 `.css` 导入，Node 里跑不起来），所以它验的是本插件的视图结构，外观与浮层定位要在真浏览器里看。

`lib/` 是构建镜像，`assert:lib-untracked` 判它没被 git 跟踪。

要肉眼确认页面上的形态，用仓库的 `node tools/verify-client.mjs dsh-subagent-judge-dispatch --needle '<你新写的文案>'`。
