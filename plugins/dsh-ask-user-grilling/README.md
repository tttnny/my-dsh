# @lynn123411/dsh-ask-user-grilling

grilling 轮的逐题盘问工具：把整轮问题作为一张**可交互表单**投在对话记录的那条工具行里，投出即结束本轮；用户在表单里勾选、自填，点表单底部的「导入输入框」写进**原生输入框草稿**，再按原生发送键发出，作答随后作为**下一条用户消息**到达。它不出文本、不阻塞、不接管输入框，与原生 `ask_user_question`（[`@deepseek-ai/dsh-tool-ask-user`](https://www.npmjs.com/package/@deepseek-ai/dsh-tool-ask-user)）是两件事：原生那条在输入框上方接管作答面板、阻塞等答案，留给一次简单确认；本插件只负责 grilling 轮的逐题盘问。三个 `matt-*` preset 两行并存：原生 `- id: tool-ask-user` 行原样保留，旁边新增 `- id: tool-grilling-form` 行。

> ⚠️ **装配是一个包两条行**：preset 工具行注册工具；profile `package.json` 的 `dsh.profile.bundles` 里还要有本包（包内 `cordis.patch.yml` 插入一条 `id: lynn-grilling-form-carrier`、`config.carrier: true` 的载体行，宿主半边在那条行下什么都不注册），Web shell 才服务本包的浏览器半边。少了后一条，工具照常可用、transcript 那一行退回原始 JSON。

## 特性

- **grilling_form**：一次调用只做三件事——校验入参；通过校验就 `exec.concludeTurn()` 标记本轮结束；返回 `{ pending: true, message }`，让模型知道表单已展示、答案会晚到、别把这次调用当成已回答、也别再把题目写一遍散文。入参不合格就返回 `rejected` + `violations` 且**不标记结束**，模型可在同一轮改完重调。
- **投出即结束本轮**：工具不等待答案、不接管输入框；描述与技能正文都要求它是本轮的**唯一且最后**一次调用（同一批里别的调用会把本轮撑开）。
- **入参校验只拦表单表示不了的东西**：同一轮里重复的 id、空白题干、空白选项 label、同一题里归一化后同名的两个选项——命中即就地拒绝；题干与选项的分工仍是引导，不做子串校验；id 是普通字符串，没有保留前缀。
- **强制多选**：所有问题一律多选，schema 里没有 `multi_select` 开关；这一行为刻意不写进工具描述。
- **题号并入标题**：可选参数 `number`（如 `"Q2"`）由界面并进 `header`，格式 `<number> · <header>`，只给一个时就是那一个；`header` 已经以该题号开头就原样送出，不出现「`Q2 · Q2 · …`」这种重复前缀。拼法只有 `src/form-model.js` 一份，宿主与界面不会各拼一套。
- **正文交给 detail**：可选参数 `detail` 由表单按 markdown 渲染在题干下方；`question` 是标题加一句提问，多段正文放 `detail`。
- **推荐标记归一化**：模型把推荐写成 `description` 末尾的「；推荐」、`label` 里的无括号写法，或直接给 `recommended: true`，都由 `src/recommendation.js` 统一搬到 label 末尾的「（推荐）」，界面按它画「推荐」徽标、不把标记原样显示成文字；导入文本与只读展示用不带后缀的干净文字，用户的消息不会把「（推荐）」发回去。
- **表单行（本插件的浏览器半边）**：按 wire 工具名注册自有 key `grilling_form`，官方 `ask_user_question` 那张卡不受影响。折叠行标题「盘问」、摘要是「N/M 已填」，转只读后是「本轮已过，仅供查看」；展开是整轮题目——题号标题、题干、`detail` markdown、可多选的勾选项（推荐项带徽标）、每题一个自填 textarea。
- **没有提交键**：表单底部只有一个窄的「导入输入框」按键，把作答写进原生草稿（槽位标准属性 `inputActions.setDraft`）；发送权只在原生输入框的发送键上，插件不代发。导入文本是逐题一行「标题：选的项／自填的字」，整段包在 `【盘问作答】` / `【/盘问作答】` 之间；草稿里已有导入块就原地替换它，块外用户手打的字一个不动，没有块就放在最前面。
- **未导入提醒**：表单里填了东西而草稿里没有对应的导入块时，行上常驻一条提醒。平台没有发送前的提交钩子，「发送前拦截」做不到，提醒只能是提醒。
- **只读**：这条调用之后记录里出现过用户发言（`kind` 为 `user` / `steering`、`seq` 更大）就算本轮过去，表单转只读——内容留着给人看，不再可填、也不再进上下文。
- **按会话持久化**：勾选与自填按会话 + `callId` 存进 `localStorage`（键 `dsh-grilling-form.<sessionId>`），刷新后恢复；storage 不可用或写不进去只让这一份活在内存里。
- **流式与失败不假装读懂**：参数还在流式传输（`argsRaw` 解析不出来）时退回原始文本；结果形状不认识画调用失败；被拒画违规清单。
- **预设里的分工（`matt-standard` / `matt-ptc` / `matt-cordis`）**：原生 `ask_user_question` 管一次简单确认，本插件管 grilling 轮的逐题盘问；三份 preset 的 `description` 与 `skills/grilling/SKILL.md` 要求一轮只投一次表单、不写散文预告，`grilling_form` 就是该轮唯一且最后的调用（ptc 形态是 `run_code` 程序内的 `return await tools.grilling_form({...})`）。

## 自检

`pnpm check`（= `pnpm build && pnpm test && pnpm assert:lib-untracked`）：

- `scripts/test-recommendation.mjs`：推荐标记的归一化——各种写法统一成 label 末尾的「（推荐）」、干净 label 与原始 label 各自保留，正常以「推荐」收尾的文字不误判；
- `scripts/test-form-model.mjs`：共用纯模型（题号并入标题、入参校验、导入文本与导入块的新增与原地替换、未导入提醒、只读判定、按会话持久化与脏数据清理）；
- `scripts/smoke-host.mjs`：真 cordis `Context`、真 `ctx.tools`（`ToolRuntime`：工具经它注册、再经它取回），执行上下文是假件、只记录 `concludeTurn` 有没有被喊——工具不再等答案，所以这条链上没有假应答者；断言导出身份 `tool-grilling-form` / `inject: ['tools']`、工具名 `grilling_form`、立即返回 `pending`（不带 `callId` / `answers`）、每一种入参拒绝且**不标记结束**、`__grill_` 前缀不再被拒、缺字段由 `defineTool` 拦住，以及载体行什么都不注册与 config 校验（未知键、错类型当场抛）；
- `scripts/test-render.mjs`：用真 react 静态渲染构建出来的行组件（`ui-primitives` 是替身，真组件外观在浏览器里看），断言可交互与只读两态、导入按键与禁用态、未导入提醒、推荐徽标、被拒与失败、流式原始文本、默认展开，取词走真字典、缺键或缺参数即失败；
- `scripts/smoke-client.mjs`：按 Web shell 的方式加载构建出来的 `lib/client.js`（`window.__ModuleLoader__.load` 桩件），用带内核 inject 守卫的假上下文断言 `tool.call.toolview` 的 keyed 注册与字典（守卫自带反例断言），守住 `dsg-*` class 名在 JSX 与 CSS 之间不单边漂移，并核对引到的 ui-primitives 名字都在安装副本的导出表里；
- `scripts/assert-lib-untracked.mjs`：`lib/` 是构建镜像，`git ls-files lib` 必须为空。

自检要的内核包（`cordis` / `dsh-tools` / `dsh-system-prompt`）与 `ui-primitives` 安装副本是本插件的 devDependencies（与 `engines.dsh` 同版本），`pnpm install` 后离线可跑、不指向任何 DSH 安装副本。`src/` 是源码，`lib/` 是构建镜像、不入库（`pnpm build` 现打，`prepack` 在发布前打一次）。

## 安装

```bash
dsh plugin --profile web add @lynn123411/dsh-ask-user-grilling
```

已发布至 npm，供三个 matt 预设（`matt-standard` / `matt-ptc` / `matt-cordis`）使用：三份 preset 的 `config.plugins` 里，上游 `- id: tool-ask-user` 行原样保留，旁边新增 `- id: tool-grilling-form` 行消费本包。三份 preset 把本包声明为 `dependencies`（preset 行因此总可解析）；但 `dsh.profile.bundles` 只按 profile 的**直接依赖**登记，安装命令仍要点名本包：`dsh plugin --profile web add @lynn123411/dsh-preset-matt-<id> @lynn123411/dsh-ask-user-grilling`（开发副本同理带上 `./plugins/dsh-ask-user-grilling`；`link:` 包的 `dependencies` 不会被物化）。

**本地开发**：用 `link:`，不要拷贝——运行副本软链接到本仓库目录后，仓库里的文件就是“已安装内容”：`cd ~/.dsh/profiles/web && pnpm add "link:<my-dsh 绝对路径>/plugins/dsh-ask-user-grilling" --offline`，再在插件目录 `pnpm install && pnpm build`。本插件宿主半边 `import` 了 `@deepseek-ai/dsh-tools`（不再依赖任何提问服务），浏览器半边 `import` 了 `@deepseek-ai/dsh-client-ui-primitives`；`link:` 插件的这些内核包由 DSH 自身路由供给（前提是 DSH 带 `--preserve-symlinks` 启动，启动器已默认带上——见仓库 `docs/rules/dev-copy.md`「内核包路由与 `--preserve-symlinks`」）。**不要**手工拷贝进 `node_modules/`：裸拷贝是未注册状态，`pnpm install` / `dsh plugin add|remove` 等任何 profile 同步都会把它当 extraneous 清掉，而 roster 对每份 preset 做行可解析性健康检查——插件一旦被剪，引用它的三份 matt preset 会整体从模式选择里消失。

**profile 侧两处登记，缺一不可**：

1. `dsh.profile.bundles` 里有 `@lynn123411/dsh-ask-user-grilling`。包内 `cordis.patch.yml` 会在 bundle 层插入一条 `id: lynn-grilling-form-carrier`、`config: { carrier: true }` 的行；宿主半边在那条行下什么都不注册。这一条只为让 Web shell 服务本包的浏览器半边：客户端 bundle 只对 root loader 的 **enabled entry** 服务，而 preset 工具行是 `ctx.plugin` 直接挂的子树、不是 Loader entry。位置决定功能——少了它工具照常可用，只是 transcript 那一行退回原始 JSON；`carrier` 之外的 config 键或错类型当场抛，免得拼错的载体行静默把工具注册成 root layer 的全局工具。
2. preset 的组合里有工具行（`- id: tool-grilling-form` / `name: '@lynn123411/dsh-ask-user-grilling'`）。preset 由组合包的 patch 声明，这一行放在 `@deepseek-ai/dsh-agent-preset` 的 `config.plugins` 里；工具与它的作用域由这一行注册。

改完 `src/` 必须重新 `pnpm build`：宿主半边与**新加入 profile bundle 层的这一行**要重启 DSH 实例（bundle 层在启动时组装）；已经在图里的客户端 bundle 由 `dsh-client-hmr` 轮询到改动后热换，页面自行重载，必要时硬刷新一次。
