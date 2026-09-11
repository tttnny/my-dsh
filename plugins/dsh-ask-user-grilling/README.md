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

**本地开发**：临时联调可将本目录复制到 `~/.dsh/profiles/web/node_modules/@lynn123411/dsh-ask-user-grilling/`（preset 的工具行会直接从 node_modules 解析），但裸拷贝是未注册状态：`pnpm install` / `dsh plugin add|remove` 等任何 profile 同步都会把它当 extraneous 清掉，并导致三份 matt preset 从模式选择里消失（roster 对每份 preset 做行可解析性健康检查，插件被剪即整份隐藏）——“被清重拷”只是重复踩坑。注意：**不要**把它加进 profile `package.json` 的 `dsh.profile.bundles`（bundle 层必须在包内声明 `dsh.bundle`，否则启动报错）。含未发布改点时调完即发版，再用 `pnpm add` 回装为注册版本。
