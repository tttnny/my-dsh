# @lynn123411/dsh-ask-user-grilling

DSH 原生 `ask_user_question`（[`@deepseek-ai/dsh-tool-ask-user`](https://www.npmjs.com/package/@deepseek-ai/dsh-tool-ask-user)）的**表单呈现变体**：与原生共用同一条 `ctx.userQuestions` seam，工具描述与共有参数描述**与原生逐字相同**，差异在工具名、参数集（本插件没有 `multi_select`，一律强制多选；另多出可选参数 `number`（题号）、`detail`（正文）与 `recommended`（推荐））与输出 schema（多出 `rejected`、`violations`、`error` 三个字段）。答题界面仍是官方那一套——composer takeover 由 `ctx.userQuestions` seam 驱动、与工具名无关；transcript 里那一行由本插件的浏览器半边自己画，所以官方卡画不出来的东西（轮末补充题、`detail` 正文、被拒的违规清单）都在卡上。

> ⚠️ **装配是一个包两条行**：preset 工具行注册工具；profile `package.json` 的 `dsh.profile.bundles` 里还要有本包（包内 `cordis.patch.yml` 插入一条 `config.carrier: true` 的载体行，宿主半边在那条行下什么都不注册），浏览器才拿得到卡片。少了后一条，工具照常可用、transcript 那一行退回原始 JSON。

## 特性

- **ask_user_grilling**：与原生 `ask_user_question` 共用同一条 seam，工具描述与共有参数描述逐字相同，工具名与参数集不同。
  - **强制多选**：所有问题一律多选——schema 不提供 `multi_select` 参数，也就没有关闭开关。此行为刻意**不写入工具描述**（描述与原生逐字一致）：模型不知道只能多选，才不会为避免互斥选项而影响出题质量；
  - **题号并入标题**：可选参数 `number`（如 `"Q2"`）由代码并进 `header`，格式 `<number> · <header>`，只给一个时就是那一个值——散文预告里的 Q 编号与表单页标题因此能对上。`header` 已经以该题号开头时原样送出，不出现「`Q2 · Q2 · …`」这种重复前缀。界面半边画卡片时用的是同一份拼法（`src/contract.js`），两处不会各拼一套；
  - **正文交给 `detail`**：可选参数 `detail` 透传给 seam。界面侧把 `question` 渲染成无 markdown、不换行的标题，`detail` 才走 markdown 正文块——多段正文塞在 `question` 里会挤成一坨大标题并把选项区往下顶，所以题干留一句、正文进 `detail`；
  - **推荐标记归一化**：模型把推荐写成 `description` 末尾的「；推荐」、`label` 里的无括号写法，或直接给 `recommended: true`，都由本插件在投递前统一搬到 `label` 末尾的「（推荐）」。界面只按 `label` 末尾的括号写法判断，其他写法既不渲染徽标、标记还会原样显示成文字——搬到这里之后徽标才出现；回传答案时再把 `label` 还原成模型原本写的那一个，模型收到的仍是自己写的内容；
  - **轮末补充题**：每次调用由代码自动追加一道「这轮还有什么要补充或调整的吗？（无需补充）」，每题末尾的补充输入框则由 UI 自动渲染——两者都不依赖模型、也不写入描述，模型自加补充项只会与它们重复；
  - **送不进表单的入参就地拒绝**：`__grill_` 前缀的 id（该前缀归轮末补充题）、同一轮里重复的 id、空白题干、空白选项 label、同一题内归一化后同名的两个选项——这几种都在投递前返回 `rejected` + `violations`，让模型改完重调，而不是把空选项、歧义选项画到界面上。界面按 label 认选项，重名的两个选项用户根本分不开，还原答案时也只会留下最后一个；题干与选项的分工仍是引导，不做校验；
  - **同一条 seam**：直接调 `ctx.userQuestions.ask`，与原生工具走同一通道、行为一致。
- **transcript 卡片（本插件的浏览器半边）**：按 wire 工具名注册 `tool.call.toolview` 的自有 key，官方的 `ask_user_question` 那张卡不受影响。
  - 折叠行是「提问 · N/N 已回答」（等答时是「等待回答」，被拒/取消/中断各有自己的说法），展开是问答列表：题号与标题、题干、`detail` 走 markdown（与 composer 用同一个渲染器）、选中项与自由文本逐行、没答的标「未回答」；
  - 轮末补充题**不在调用参数里**（它是宿主追加的），所以官方卡的「问题↔答案逐 id 等长配对」必然失败、退回原始 JSON；这里按「结果里 argsRaw 没有的 id」把它单独列出来，题干取自 `src/contract.js` 的同一份常量；
  - `rejected` 的轮次画违规清单，取消与中断画说明加题目；调用失败画失败摘要；参数还在流式传输（`argsRaw` 解析不出来）时退回原始文本，不假装读懂了这一轮。

## 自检

`pnpm check`（= `pnpm build && pnpm test && pnpm assert:lib-untracked`）：

- `scripts/test-recommendation.mjs`：推荐标记的归一化；
- `scripts/test-card.mjs`：卡片模型（轮末补充题、`detail`、被拒、取消/中断、结果里多出来的 id、流式半截 JSON）；
- `scripts/smoke-host.mjs`：真 cordis `Context`、真 `ctx.tools`（工具经真工具表注册并取回）、真 `ctx.userQuestions`（`ask()` 真走服务校验与 waterfall），只有「人怎么答」是假应答者；逐条断言上面的转换与拒绝，另断言工具描述与共有参数描述仍与原生逐字相同、载体行的 config 门禁与 config 校验；
- `scripts/test-render.mjs`：用真 react 渲染构建出来的行组件，断言卡片的结构与文案（取词走真字典，缺键或缺参数即失败）；`ui-primitives` 是替身，真组件的外观在浏览器里看；
- `scripts/smoke-client.mjs`：按 Web shell 的方式加载构建出来的 `lib/client.js`（`window.__ModuleLoader__.load` 桩件），用带内核 inject 守卫的假上下文断言 `tool.call.toolview` 的 keyed 注册与字典，守住 `dsg-*` class 名在 JSX 与 CSS 之间不单边漂移，并核对客户端半边引的 ui-primitives 名字都在安装副本的导出表里。

自检要的内核包与界面侧副本是本插件的 devDependencies（与 `engines.dsh` 同版本），`pnpm install` 后离线可跑、不指向任何 DSH 安装副本；`scripts/recommended-label-rule.mjs` 抄着界面侧「哪个 label 算推荐」那条正则，`smoke-host.mjs` 断言它仍与安装副本逐字相同，并断言工具描述与共有参数描述仍与原生 `ask_user_question` 逐字相同，上游一改就当场失败。`src/` 是源码，`lib/` 是构建镜像、不入库（`pnpm build` 现打，`prepack` 在发布前打一次）。

## 安装

```bash
dsh plugin --profile web add @lynn123411/dsh-ask-user-grilling
```

已发布至 npm，供三个 matt 预设（`matt-standard` / `matt-ptc` / `matt-cordis`）使用：preset 的工具行直接消费本包，官方 `tool-ask-user` 行原位换成它。

**本地开发**：用 `link:`，不要拷贝——运行副本软链接到本仓库目录后，仓库里的文件就是“已安装内容”：`cd ~/.dsh/profiles/web && pnpm add "link:<my-dsh 绝对路径>/plugins/dsh-ask-user-grilling" --offline`，再在插件目录 `pnpm install && pnpm build`。本插件宿主半边 `import` 了 `@deepseek-ai/dsh-tools` 与 `@deepseek-ai/dsh-user-questions`；`link:` 插件的这些内核包由 DSH 自身路由供给（前提是 DSH 带 `--preserve-symlinks` 启动，启动器已默认带上——见仓库 `docs/rules/dev-copy.md`「内核包路由与 `--preserve-symlinks`」）。**不要**手工拷贝进 `node_modules/`：裸拷贝是未注册状态，`pnpm install` / `dsh plugin add|remove` 等任何 profile 同步都会把它当 extraneous 清掉，而 roster 对每份 preset 做行可解析性健康检查——插件一旦被剪，引用它的三份 matt preset 会整体从模式选择里消失。

**profile 侧两处登记，缺一不可**：

1. `dsh.profile.bundles` 里有 `@lynn123411/dsh-ask-user-grilling`。包内 `cordis.patch.yml` 会在 bundle 层插入一条 `id: lynn-ask-user-grilling-carrier`、`config: { carrier: true }` 的行；宿主半边在那条行下什么都不注册。这一条只为让 Web shell 服务本包的浏览器半边：客户端 bundle 只对 root loader 的 **enabled entry** 服务，而 preset 工具行是 `ctx.plugin` 直接挂的子树、不是 Loader entry。位置决定功能——少了它工具照常可用，只是 transcript 那一行退回原始 JSON；`carrier` 之外的 config 键或错类型当场抛，免得拼错的载体行静默把工具注册成 root layer 的全局工具。
2. preset 的组合里有工具行（`- id: tool-ask-user-grilling` / `name: '@lynn123411/dsh-ask-user-grilling'`）。preset 由组合包的 patch 声明，这一行放在 `@deepseek-ai/dsh-agent-preset` 的 `config.plugins` 里；工具与它的作用域由这一行注册。

改完 `src/` 必须重新 `pnpm build`：宿主半边与**新加入 profile bundle 层的这一行**要重启 DSH 实例（bundle 层在启动时组装）；已经在图里的客户端 bundle 由 `dsh-client-hmr` 轮询到改动后热换，页面自行重载，必要时硬刷新一次。
