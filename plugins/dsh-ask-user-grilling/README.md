# @lynn123411/dsh-ask-user-grilling

DSH 原生 `ask_user_question`（[`@deepseek-ai/dsh-tool-ask-user`](https://www.npmjs.com/package/@deepseek-ai/dsh-tool-ask-user)）的**表单呈现变体**：与原生共用同一条 `ctx.userQuestions` seam，工具描述与共有参数描述**与原生逐字相同**，差异在工具名、参数集（本插件没有 `multi_select`，一律强制多选；另多出可选参数 `number`（题号）、`detail`（正文）与 `recommended`（推荐））与输出 schema（多出 `rejected`、`violations`、`error` 三个字段）。原生模式下发给模型的工具定义只含名称、描述与参数，共有参数的提示词与原生一致；PTC 模式下 SDK 声明会带上输出 schema，模型看到的类型与原生不同。它可以直接顶替原生工具，本身不施加任何额外纪律或约束。

> ⚠️ **安装约束：本插件是 preset 工具行消费的 Cordis 插件，严禁加入 profile `package.json` 的 `dsh.profile.bundles`**（bundle 层必须在包内声明 `dsh.bundle`，本插件没有，加入会导致启动报错）。只需通过 `pnpm add` / `dsh plugin --profile web add` 进入 dependencies 即可，preset 的工具行会直接从 node_modules 解析本包。

## 特性

- **ask_user_grilling**：与原生 `ask_user_question` 共用同一条 seam，工具描述与共有参数描述逐字相同，工具名与参数集不同。
  - **强制多选**：所有问题一律多选——schema 不提供 `multi_select` 参数，也就没有关闭开关。此行为刻意**不写入工具描述**（描述与原生逐字一致）：模型不知道只能多选，才不会为避免互斥选项而影响出题质量；
  - **题号并入标题**：可选参数 `number`（如 `"Q2"`）由代码并进 `header`，格式 `<number> · <header>`，只给一个时就是那一个值——散文预告里的 Q 编号与表单页标题因此能对上。`header` 已经以该题号开头时原样送出，不出现「`Q2 · Q2 · …`」这种重复前缀；
  - **正文交给 `detail`**：可选参数 `detail` 透传给 seam。界面侧把 `question` 渲染成无 markdown、不换行的标题，`detail` 才走 markdown 正文块——多段正文塞在 `question` 里会挤成一坨大标题并把选项区往下顶，所以题干留一句、正文进 `detail`；
  - **推荐标记归一化**：模型把推荐写成 `description` 末尾的「；推荐」、`label` 里的无括号写法，或直接给 `recommended: true`，都由本插件在投递前统一搬到 `label` 末尾的「（推荐）」。界面只按 `label` 末尾的括号写法判断，其他写法既不渲染徽标、标记还会原样显示成文字——搬到这里之后徽标才出现；回传答案时再把 `label` 还原成模型原本写的那一个，模型收到的仍是自己写的内容；
  - **轮末补充题**：每次调用由代码自动追加一道「这轮还有什么要补充或调整的吗？（无需补充）」，每题末尾的补充输入框则由 UI 自动渲染——两者都不依赖模型、也不写入描述，模型自加补充项只会与它们重复；
  - **送不进表单的入参就地拒绝**：`__grill_` 前缀的 id（该前缀归轮末补充题）、同一轮里重复的 id、空白题干、空白选项 label、同一题内归一化后同名的两个选项——这几种都在投递前返回 `rejected` + `violations`，让模型改完重调，而不是把空选项、歧义选项画到界面上。界面按 label 认选项，重名的两个选项用户根本分不开，还原答案时也只会留下最后一个；题干与选项的分工仍是引导，不做校验；
  - **同一条 seam**：直接调 `ctx.userQuestions.ask`，与原生工具走同一通道、行为一致。

## 自检

`pnpm test`（= `node scripts/test-recommendation.mjs && node scripts/smoke-host.mjs`）：前者测推荐标记的归一化，后者用真 `defineTool` + 假 seam 跑 `execute()`，逐条断言上面的转换与拒绝。内核包（`@deepseek-ai/dsh-tools` / `@deepseek-ai/dsh-user-questions`）与界面侧副本从 DSH 运行副本 `~/.dsh/profiles/node_modules/` 解析（可用 `DSH_HOME` 改主目录）；`scripts/recommended-label-rule.mjs` 抄着界面侧「哪个 label 算推荐」那条正则，`smoke-host.mjs` 断言它仍与安装副本逐字相同，上游一改就当场失败。

## 安装

```bash
dsh plugin --profile web add @lynn123411/dsh-ask-user-grilling
```

已发布至 npm，供三个 matt 预设（`matt-standard` / `matt-ptc` / `matt-cordis`）使用（preset 的工具行直接消费本包）。

**本地开发**：用 `link:`，不要拷贝——运行副本软链接到本仓库目录后，仓库里的文件就是“已安装内容”，改完即生效、不必发版：`cd ~/.dsh/profiles/web && pnpm add "link:<my-dsh 绝对路径>/plugins/dsh-ask-user-grilling" --offline`。本插件宿主半边 `import` 了 `@deepseek-ai/dsh-tools` 与 `@deepseek-ai/dsh-user-questions`；`link:` 插件的这些内核包由 DSH 自身路由供给，**无需在仓库里备 `node_modules`**（前提是 DSH 带 `--preserve-symlinks` 启动，启动器已默认带上——见仓库 `docs/rules/dev-copy.md`「内核包路由与 `--preserve-symlinks`」）。**不要**手工拷贝进 `node_modules/`：裸拷贝是未注册状态，`pnpm install` / `dsh plugin add|remove` 等任何 profile 同步都会把它当 extraneous 清掉，而 roster 对每份 preset 做行可解析性健康检查——插件一旦被剪，引用它的三份 matt preset 会整体从模式选择里消失。也**不要**把它加进 profile `package.json` 的 `dsh.profile.bundles`（bundle 层必须在包内声明 `dsh.bundle`，否则启动报错）。
