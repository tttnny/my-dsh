# @lynn123411/dsh-grilling-form

grilling 轮的逐题盘问工具：把整轮问题作为一张**可交互表单**投在对话流的**轮次尾部**（没有折叠行、没有卡片壳，跟正文同处一层）投出即结束本轮；用户在表单里勾选、自填，点表单底部的「导入输入框」写进**原生输入框草稿**，再按原生发送键发出，作答随后作为**下一条用户消息**到达。它不出文本、不阻塞、不接管输入框，与原生 `ask_user_question`（[`@deepseek-ai/dsh-tool-ask-user`](https://www.npmjs.com/package/@deepseek-ai/dsh-tool-ask-user)）是两件事：原生那条在输入框上方接管作答面板、阻塞等答案，留给一次简单确认；本插件只负责 grilling 轮的逐题盘问。原生 `ask_user_question` 由官方组合照旧提供；`grilling_form` 由本包 `cordis.patch.yml` 的一条根层行注册（随 `dsh plugin add` 生效），因此对 profile 里每一个 preset 的 agent 都可见。

> ✅ **装配是一条命令一行**：`dsh plugin --profile web add @lynn123411/dsh-grilling-form` 装完即用。命令把包名写进 profile 的 `dependencies` 与 `dsh.profile.bundles`，包内 `cordis.patch.yml` 随之插入一条根层 `- id: tool-grilling-form` 行；这一条行同时做两件事——宿主半边在它下面注册 `grilling_form` 工具（root 层 ⇒ 落进全局层，profile 里每个 preset 的 agent 都看得见），而它本身又是 root loader entry，Web shell 据此服务本包的浏览器半边（客户端 bundle 只对 root loader 的 enabled entry 服务）。**profile 侧不需要任何手写补丁。**

## 特性

- **grilling_form**：一次调用只做三件事——校验入参；通过校验就 `exec.concludeTurn()` 标记本轮结束；返回 `{ pending: true, message }`，让模型知道表单已展示、答案会晚到、别把这次调用当成已回答、也别再把题目写一遍散文。入参不合格就返回 `rejected` + `violations` 且**不标记结束**，模型可在同一轮改完重调；总说明只报违规条数，规则由逐条 `violations` 自己说（摘要里再抄一份规则清单必然在加规则时漂）。
- **投出即结束本轮**：工具不等待答案、不接管输入框；描述与技能正文都要求它是本轮的**唯一且最后**一次调用（同一批里别的调用会把本轮撑开）。
- **入参校验只拦表单表示不了的东西**：同一轮里重复的 id、空白题干、空白选项 label、同一题里归一化后同名的两个选项、**展开正文里把选项又列了一遍**（那会让页面上出现两遍选项：一遍带选择器、一遍不带），以及**选项名里带顿号**（作答回填按顿号分项，带它的名字读不回来）——命中即就地拒绝；除此之外题干与选项的分工是引导，不做子串校验；id 是普通字符串，没有保留前缀。`questions` 不是数组由 `defineTool` 的入参校验拦住；直接调 `validateRound` 时它交回一条可读的违规而不是抛异常。
- **强制多选**：所有问题一律多选，schema 里没有 `multi_select` 开关；这一行为刻意不写进工具描述。
- **题号并入标题**：可选参数 `number`（如 `"Q2"`）由界面并进 `header`，格式 `<number> · <header>`，只给一个时就是那一个；`header` 已经以该题号开头就原样送出，不出现「`Q2 · Q2 · …`」这种重复前缀。拼法只有 `src/form-model.js` 一份，宿主与界面不会各拼一套。
- **正文只写共用的背景**：可选参数 `detail` 由表单按 markdown 渲染在题干下方，**只写各选项共用的背景**；某个选项自己的取舍写进它自己的 `description`。模型把选项连同代价在 `detail` 里再讲一遍时，行首会与某个选项标签同形，宿主当场拒收并让它改——这是「页面上只留带选择器的那一遍」的硬保证。认法：一行去掉列表符号与强调符号后，以选项标签的第一个分隔符之前那一段开头，紧随（可空一格）`：` `:` `·` `—` 这类「名：解释」分隔符或直接结束。顿号与逗号不算（正文里「甲、乙两种做法各有代价」这种共用背景不该被误拒），所以「甲，详情…」这种写法会漏放；误拒的代价是模型改一轮重投——这条规则写在工具的字段说明里，模型在调用前就读得到，不靠技能正文兜。
- **推荐标记归一化**：模型把推荐写成 `description` 末尾的「；推荐」、`label` 里的无括号写法，或直接给 `recommended: true`，都由 `src/recommendation.js` 统一搬到 label 末尾的「（推荐）」，界面按它画「推荐」徽标、不把标记原样显示成文字；导入文本与只读展示用不带后缀的干净文字，用户的消息不会把「（推荐）」发回去。
- **推荐项默认勾上**：标了推荐的选项在用户没动过那题时就是选中态，因此它一进页面就算作答——计数与导入按键都照它走。用户动过那题（包括把默认项取消掉）一律以他的为准；「取消过」与「没作答」分得开，靠的是持久化里那条空记录不会被清掉。
- **表单住在轮次尾部（本插件的浏览器半边）**：表挂在对话流的 `conversation.chat.turnTail` 上——与正文同处一层，不被这一轮的「工作过程」折叠吞掉（工具行必被折进过程区，住那儿得先展开才看得见）。不画折叠行，也不套卡片边框、背景、内边距与内部滚动，题目、选项、按钮像正文自己长出来的一段；整轮的进度缩成题目区顶上的一行小灰字「这一轮 N 题 · 已填 M」，冻结后是「本轮已过，仅供查看」。按 wire 工具名注册自有 key `grilling_form` 的那条工具行**保留**，但只在入参被拒时画违规清单、调用失败时说明失败——投出去的轮次它什么都不画，页面上不会同时出现两张表。表单本身是整轮题目——题号标题、题干、`detail` markdown、可多选的勾选项（推荐项带徽标）、每题一个自填 textarea。
- **没有提交键**：表单底部只有窄的「导入输入框」与「从这里分叉」两个按键，「导入输入框」把作答写进原生草稿（槽位标准属性 `inputActions.setDraft`）；发送权只在原生输入框的发送键上，插件不代发。导入文本是逐题一行「标题：选的项／自填的字」，整段包在 `【盘问作答】` / `【/盘问作答】` 之间；草稿里已有导入块就原地替换它，块外用户手打的字一个不动，没有块就放在最前面。
- **从这里分叉**：表单底部（「导入输入框」旁边）有一个「从这里分叉」，按**本轮结束点**分叉出一条新会话并直接打开它。子会话是新的会话 id、切点又落在用户回答之前，所以那边是一张全新的、可填的表（系统自带那个「从这一轮分叉」在 `grilling_form` 结尾的轮次上必然不可用：它要求本轮最后一条证据是助手的文字，本工具投出即结束本轮）。
- **只读即冻结**：这条调用之后记录里出现过用户发言（`kind` 为 `user` / `steering`、`seq` 更大）就算本轮过去，表单**停住**——勾选框与自填框按提交时的样子原样留着（锁住、文字还能选中复制），不再换成一行行答案；可填与冻结长得一个样。
- **冻结按实发消息重画**：冻结那一刻从用户**实际发出去的那条消息**里反解 `【盘问作答】…【/盘问作答】` 那段——标题按「题号并入的标题 → 题干 → id」认题，每一项先按该题选项的展示文字精确匹配、匹配不上的并进自填，块里没出现的题就是**没作答**（推荐默认不会被勾回来）；块缺失、起止行不配对、或一条都还原不出来时退回表单里最后那份（本地那份，含推荐默认）。代价是刻意的：选项名或自填内容本身含「、」时可能多算一项，换来的是不发隐藏协议、不改用户消息的形态。
- **界面上没有任何导入相关提示**：表单里只有题目、选项、自填、导入键与分叉键；没有输入框里的常驻提醒，也没有发送时的弹窗或发送键旁的提示（平台没有发送前的提交钩子，发送不会因为没导入而被提示或拦下）。
- **按会话持久化**：勾选与自填按会话 + `callId` 存进 `localStorage`（键 `dsh-grilling-form.<sessionId>`），刷新后恢复；一条「什么都没选」的记录也是记录（用户把这题清空了），不会被当成脏数据丢掉；storage 不可用或写不进去只让这一份活在内存里。
- **流式与失败不假装读懂**：参数还在流式传输（`argsRaw` 解析不出来）时工具行什么都不画（表在这一轮结束时出现在尾部）；结果形状不认识或调用失败，工具行给失败说明；被拒画违规清单且**不标记结束**本轮。
- **两条外部契约**：表能露在过程折叠之外，靠的是 `conversation.chat.turnTail` 这个公开槽位（核心包一改名单就可能失效）；浏览器半边另注入了会话服务与工作台服务（`sessions` / `uiWorkspace`）用于分叉——少声明一个，按仓库规则整条 entry 失败、插件从页面消失（见 `docs/rules/client-wiring.md`）。
- **与原生 `ask_user_question` 的分工**：原生那条管一次简单确认，本插件管 grilling 轮的逐题盘问。本工具与 https://github.com/tttnny/matt-skills 的 grilling 技能配合，分工按 seam 划：**技能正文只讲方法论与问题措辞，工具用法的机械细节（字段语义、哪些写法会被拒、作答块的形态）全部以本工具自述为准**——技能不随 npm 包发布，机械细节搬进工具自述后，它就不必跟着协议漂。「一轮只投一次表单、投出即结束」既是工具的运行时自述、也是技能方法论的一部分。`src/form-model.js` 的导入块常量旁留了一份「改协议时的联动点」清单（工具自述、三处测试里的字面量钉、两份 README、技能正文那句工具名），其中技能正文那一处没有任何测试看得见，只能靠清单提醒；新增写死协议字面量的测试或文档要补进那份清单。

## 自检

`pnpm check`（= `pnpm test && pnpm assert:lib-untracked`）；`pnpm test` 自己先构建一次，所以改了 `src/` 忘了构建也不会静默测到旧产物（一半脚本打 `src/`、另一半打构建产物 `lib/`）：

- `scripts/test-recommendation.mjs`：推荐标记的归一化——各种写法统一成 label 末尾的「（推荐）」、干净 label 与原始 label 各自保留，正常以「推荐」收尾的文字不误判；
- `scripts/test-form-model.mjs`：共用纯模型（题号并入标题、入参校验含「展开正文重述选项」的认法与不误伤、选项名带顿号、`questions` 不是数组时交回违规而不是抛、推荐项默认勾选与「取消过 ≠ 没作答」、导入文本与导入块的新增与原地替换、按轮次定位本轮那次调用、只读判定顺带交回那条用户发言、从发言文字反解作答表与「块里没有的题算没作答」、反解失败时退回本地那份、按会话持久化与脏数据清理）；
- `scripts/test-form-session.mjs`：表单会话内壳（`src/form-session.js`）的组合规则——推荐默认只叠在显示层、不落进 storage；勾选写穿并把用户自己那份交回调用方；取消默认后重建会话也不勾回来；自填与勾选独立；导入门禁与导入块的新增/原地替换；冻结按实发消息重画、写操作一律原样返回；反解拿不到时退回本地那份；按会话 + 轮次读回；
- `scripts/smoke-host.mjs`：真 cordis `Context`、真 `ctx.tools`（`ToolRuntime`：工具经它注册、再经它取回），执行上下文是假件、只记录 `concludeTurn` 有没有被喊——工具不再等答案，所以这条链上没有假应答者；断言导出身份 `tool-grilling-form` / `inject: ['tools']`、工具名 `grilling_form`、立即返回 `pending`（不带 `callId` / `answers`）、每一种入参拒绝且**不标记结束**、总说明只报条数而不抄规则清单、投出后那句提示的作答格式与真实格式一致、`__grill_` 前缀不再被拒、字段说明把三条规则讲给模型、缺字段或不给数组由 `defineTool` 拦住，以及包内 `cordis.patch.yml` 就是那条装配行（行 id 与宿主导出名同名、不带 `config`）与 config 校验（写任何键当场抛）；
- `scripts/test-render.mjs`：用真 react 静态渲染构建出来的两个注册项（`ui-primitives` 是替身，真组件外观在浏览器里看），断言表单画在轮次尾部（不折叠、没有卡片壳）、本轮没有这张表或被拒时什么都不画、推荐项默认勾上、取消后不勾回来、导入按键与禁用态、点导入写进草稿、点分叉用**本轮结束点**调用注入的动作、冻结那态画的是锁住的勾选框与只读自填框（不是一行行答案）、冻结按实发消息重画与退回本地那份、工具行只在被拒/失败时画东西，取词走真字典、缺键或缺参数即失败；
- `scripts/smoke-client.mjs`：按 Web shell 的方式加载构建出来的 `lib/client.js`（`window.__ModuleLoader__.load` 桩件），用带内核 inject 守卫的假上下文断言 `inject` 表、`conversation.chat.turnTail` 的列表注册（自有 id，注入面拿得到会话与工作台服务）、`tool.call.toolview` 的 keyed 注册与字典（守卫自带反例断言），并断言注入的分叉动作按切点调 `sessions.fork` 再 `uiWorkspace.openSession`；守住 `dsg-*` class 名在 JSX 与 CSS 之间不单边漂移，核对引到的 ui-primitives 名字都在安装副本的导出表里；
- `scripts/assert-lib-untracked.mjs`：`lib/` 是构建镜像，`git ls-files lib` 必须为空。

自检要的内核包（`cordis` / `dsh-tools` / `dsh-system-prompt`）与 `ui-primitives` 安装副本是本插件的 devDependencies（与 `engines.dsh` 同版本），`pnpm install` 后离线可跑、不指向任何 DSH 安装副本。`src/` 是源码，`lib/` 是构建镜像、不入库（`pnpm build` 现打，`prepack` 在发布前打一次）。

## 安装

```bash
dsh plugin --profile web add @lynn123411/dsh-grilling-form
```

已发布至 npm。上面的命令把本包写进 profile 的 `dependencies`，把包名登记进 `dsh.profile.bundles`，并因此让包内 `cordis.patch.yml` 那条 `- id: tool-grilling-form` 根层行进入组合——工具注册与浏览器半边都由这一条行承载，**装完即用，profile 侧不用手写任何补丁**。开发副本把包名换成仓库内路径（在仓库根执行，会记成 `link:`）。

**本地开发**：用 `link:`，不要拷贝——运行副本软链接到本仓库目录后，仓库里的文件就是“已安装内容”：`cd ~/.dsh/profiles/web && pnpm add "link:<my-dsh 绝对路径>/plugins/dsh-grilling-form" --offline`，再在插件目录 `pnpm install && pnpm build`。本插件宿主半边 `import` 了 `@deepseek-ai/dsh-tools`（不再依赖任何提问服务），浏览器半边 `import` 了 `@deepseek-ai/dsh-client-ui-primitives`；`link:` 插件的这些内核包由 DSH 自身路由供给（前提是 DSH 带 `--preserve-symlinks` 启动，启动器已默认带上——见仓库 `docs/rules/dev-copy.md`「内核包路由与 `--preserve-symlinks`」）。**不要**手工拷贝进 `node_modules/`：裸拷贝是未注册状态，`pnpm install` / `dsh plugin add|remove` 等任何 profile 同步都会把它当 extraneous 清掉。

**那一行做两件事**（包内 `cordis.patch.yml`，随 `dsh.profile.bundles` 生效）：

```yaml
- insert:
    - id: tool-grilling-form
      name: '@lynn123411/dsh-grilling-form'
```

- **工具**：宿主半边在这条行下注册 `grilling_form`。它在**根层**：注册进全局层后，profile 里每一个 preset 的 agent 都看得见它（子 scope 继承全局层；preset 自己同名的行会盖过全局那条，所以不需要幂等补丁）。**代价（明知并接受）**：全局层意味着「所有 preset 都看得见」，`minimal-fs` 那种「模型可见工具只有三件套」的 preset 也会多拿到 `grilling_form`；它由 `minimal-fs` 自己的 `tool-filter` 行移出模型可见目录，工具本身照旧注册。
- **浏览器半边**：这条行本身是 root loader **entry**，而客户端 bundle 只对 root loader 的 enabled entry 服务，Web shell 据此服务 `lib/client.js`。所以不需要额外的载体行——行本身既是工具行又是载体行。这一行**不写 `config`**：写了当场抛（`src/index.js` 的 `assertNoConfig`），免得拼错的行静默什么都不注册。

升级过来的 profile 若还留着旧装配那条手写的 `- id: tool-grilling-form` 行，**先删掉它，再 `dsh plugin remove`**：

- **留着不影响启动**：同一 id 的两行会被 loader 按 id 合成一条（`EntryGroup.update` 以 id 为键建 map），包不会被挂两遍，也不会报「already registered」。
- **但它会在卸载后变成悬空行**：`dsh plugin remove` 只摘包与 `dsh.profile.bundles` 条目，**不动 profile patch**，于是那行指向一个已不在的包，下次启动报 `failed to import` / `1 entry did not activate`（实例照常起，只是告警）。服务端/管理器的 `removeBundle` 还会因那行仍活着而直接拒删（`bundle-in-use`）。
- 所以：装完本包后那行就是多余的，删掉即可；要卸载这个插件时，**必须先删那行**。

验证（只组合、不装载）：

```bash
node "<DSH 安装>/node_modules/@deepseek-ai/dsh/lib/bin.js" --profile web --dump-config | grep -n tool-grilling-form
# 期望：命中本包 bundle 层那条插入行（且只有一条、不带 config）
```

改完 `src/` 必须重新 `pnpm build`：宿主半边要重启 DSH 实例才生效；已经在图里的客户端 bundle 由 `dsh-client-hmr` 轮询到改动后热换，页面自行重载，必要时硬刷新一次。
