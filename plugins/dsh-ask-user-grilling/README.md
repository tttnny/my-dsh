# @lynn123411/dsh-ask-user-grilling

DSH 原生 `ask_user_question`（[`@deepseek-ai/dsh-tool-ask-user`](https://www.npmjs.com/package/@deepseek-ai/dsh-tool-ask-user)）的**表单呈现变体**：与原生共用同一条 `ctx.userQuestions` seam，工具描述与全部参数描述**与原生逐字相同**，只改表单本身的呈现——强制多选、并自动追加一道轮末补充题。因此它可以直接顶替原生工具而不带来任何提示词漂移，本身不施加任何额外纪律或约束。

> ⚠️ **安装约束：本插件是 preset 工具行消费的 Cordis 插件，严禁加入 profile `package.json` 的 `dsh.profile.bundles`**（bundle 层必须在包内声明 `dsh.bundle`，本插件没有，加入会导致启动报错）。只需通过 `pnpm add` / `dsh plugin --profile web add` 进入 dependencies 即可，preset 的工具行会直接从 node_modules 解析本包。

## 特性

- **ask_user_grilling**：与原生 `ask_user_question` 同形同名同描述，只改呈现。
  - **强制多选**：所有问题一律多选——schema 不提供 `multi_select` 参数，也就没有关闭开关。此行为刻意**不写入工具描述**（描述与原生逐字一致）：模型不知道只能多选，才不会为避免互斥选项而影响出题质量；
  - **轮末补充题**：每次调用由代码自动追加一道「这轮还有什么要补充或调整的吗？（无需补充）」，每题末尾的补充输入框则由 UI 自动渲染——两者都不依赖模型、也不写入描述，模型自加补充项只会与它们重复；
  - **id 前缀保护**：`__grill_` 开头的 id 会被拒绝（该前缀归自动追加的轮末补充题所有），保证两者不会撞 id；模型侧的 id 描述与原生一致，正常出题不会触发；
  - **同一条 seam**：直接调 `ctx.userQuestions.ask`，与原生工具走同一通道、行为一致。

## 安装

```bash
dsh plugin --profile web add @lynn123411/dsh-ask-user-grilling
```

已发布至 npm，供三个 matt 预设（`matt-standard` / `matt-ptc` / `matt-cordis`）使用（preset 的工具行直接消费本包）。

**本地开发**：用 `link:`，不要拷贝——运行副本软链接到本仓库目录后，仓库里的文件就是“已安装内容”，改完即生效、不必发版：`cd ~/.dsh/profiles/web && pnpm add "link:<my-dsh 绝对路径>/plugins/dsh-ask-user-grilling" --offline`。本插件宿主半边 `import` 了 `@deepseek-ai/dsh-tools` 与 `@deepseek-ai/dsh-user-questions`；`link:` 的插件沿**仓库路径**解析这些裸包名，故仓库根 `node_modules/@deepseek-ai/` 必须备好这两个包（指向当前 DSH 版本里的同一份，升级后需重指）——做法见仓库 `docs/rules/plugins.md` 第 3 条。**不要**手工拷贝进 `node_modules/`：裸拷贝是未注册状态，`pnpm install` / `dsh plugin add|remove` 等任何 profile 同步都会把它当 extraneous 清掉，而 roster 对每份 preset 做行可解析性健康检查——插件一旦被剪，引用它的三份 matt preset 会整体从模式选择里消失。也**不要**把它加进 profile `package.json` 的 `dsh.profile.bundles`（bundle 层必须在包内声明 `dsh.bundle`，否则启动报错）。
