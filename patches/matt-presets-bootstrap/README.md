# matt-presets-bootstrap — 三个 matt preset 的改动点与重打说明

三个 matt preset（`matt-standard` / `matt-ptc` / `matt-cordis`）＝ **官方 0.2.0-rc.2 组合逐字** ＋ **Matt 的 26 个技能** ＋ **grilling 适配插件**（`grilling_form`；上游 `tool-ask-user` 行原样保留，旁边新增，见 §一「工具行」）。本文逐处说明相对官方材料**改了什么、改成什么样、为什么**；本目录为纯文档，由 AI 按本文执行。仓库 `presets/matt-*/` 就是改好的成品，装进 profile 即用；以下改动点只在「从零组装 / DSH 升级后重打」时需要动手。

改动只发生在两类文件上：`matt-<id>.patch.yml`（官方正文上一处包装行、一处插入、一处工具行新增）与 `skills/grilling/SKILL.md`（本地适配四处：核心原则旁注、格式块第二例中文化、投递旁注、收尾段改写；新增文字为中文）。`matt-standard` 与 `matt-cordis` 的 `grilling/SKILL.md` 完全相同；`matt-ptc` 只在投递旁注的第一条 bullet 上按 PTC 形态表述（`run_code` 程序内 `return await tools.grilling_form({...})`，见 §二 改动③），PTC 措辞不进入非 PTC preset。三份 persona 都逐字取官方——grilling 纪律不写进 persona，而是下沉到技能正文的旁注：模型读到技能时正好看到，比 system prompt 里的抽象禁令有效。插件不承载任何纪律：它只把整轮问题投成表单并结束本轮，纪律全在技能正文里。

## 零、当前基线

- 官方基底：**DSH 0.2.0-rc.2**。官方 preset 正文 = `@deepseek-ai/dsh-web-app` 包内的 `presets/{standard,ptc,cordis}.patch.yml`，包目录从本次运行的安装树里取：

  ```bash
  ls -d "<DSH 安装>/node_modules/.pnpm/@deepseek-ai+dsh-web-app@*/node_modules/@deepseek-ai/dsh-web-app"
  ```

  四份正文（`standard` / `ptc` / `minimal` / `cordis`）是唯一权威；本仓库只取其中三份派生，官方发新版就照新正文重打。
- **目录预设形态不存在**：`@deepseek-ai/dsh-agent-presets`、`<id>/agent.cordis.yml`、`~/.dsh/.agent-presets/` 在当前 DSH 全安装树里没有任何引用，也没有对应物——不写「复制到 preset 目录」的安装法。官方正文搬进 patch，并且**不带行内说明注释**——所以仓库成品也不携带。
- 每个 matt preset 是一个 **bundle 包**：

  ```
  presets/matt-<id>/
  ├── package.json          # @lynn123411/dsh-preset-matt-<id>，dsh.bundle.patch → ./matt-<id>.patch.yml
  ├── matt-<id>.patch.yml   # 一条 @deepseek-ai/dsh-agent-preset 插入行
  ├── skills/               # 26 个 mattpocock 技能
  └── README.md
  ```

- 成品与官方正文的差异**恰为** §一 清单；多一处都是官方漂移或漏派生。

## 一、逐处改动清单（相对官方 0.2.0-rc.2）

### 包装与身份（三份都有）

官方是一条插入行（`- insert:` → `@deepseek-ai/dsh-agent-preset` 行）。本仓库在同一位置改成：

- Loader 行 id：`preset-<id>` → `preset-matt-<id>`；
- `config.id`：`<id>` → `matt-<id>`；
- 补 `config.name` / `config.description`——原 `preset.yml` 的两行折进 AgentPreset Config（`preset.yml` 文件本身删除）；
- `config.order`：官方占 1（standard）/ 2（ptc）/ 3（minimal）/ 4（cordis），本仓库取 **11（matt-standard）/ 12（matt-ptc）/ 13（matt-cordis）**，不与官方及其他自建 preset 撞值。名册按 `order` 升序、再按 id 排序（`dsh-agent-preset-registry` 的 `list()`）。

`config.plugins` 整体取官方逐字，只叠加下面「技能目录」与「工具行」两处。

### 技能目录：`skill-filesystem` 的 `customSkillDirs`（MATT-ADD，`standard` / `ptc` 新增；`cordis` 官方自带，额外加本包一条）

在 `- id: skill-filesystem` 的 `name:` 行之后插入。**原因**：26 个技能是 vendor 进本包 `skills/` 的额外目录，skill-filesystem 默认不扫它——不加此块模型根本发现不了、也调不到这些技能：

```yaml
          - id: skill-filesystem
            name: '@deepseek-ai/dsh-skill-filesystem'
            # MATT-ADD: discover the 26 mattpocock skills shipped in this bundle's ./skills/.
            config:
              customSkillDirs:
                - !!js process.getBuiltinModule('node:path').join(process.getBuiltinModule('node:path').dirname(process.getBuiltinModule('node:module').createRequire(baseUrl).resolve('@lynn123411/dsh-preset-matt-standard/package.json')), 'skills')
```

`matt-ptc` 同形，只把包名换成 `@lynn123411/dsh-preset-matt-ptc`。

**为什么是这个表达式**：preset 行的子行挂载时 `baseUrl` 被设成 **profile 目录**（`dsh-agent-preset-registry` 的 `activate()`：`mountPreset(scope.ctx.extend({ baseUrl: record.context.baseUrl }), ...)`；`profile-boot` 注释也写明 include root 把 `baseUrl` 锚在 profile 目录）。所以 `new URL('skills/', baseUrl)` 这种相对写法会指向 `<profile>/skills/`——**必然落空**。可解析的资产必须从**已安装的包**里取：官方 cordis preset 的写法就是 `createRequire(baseUrl).resolve('<包>/package.json')` 再 `join(dirname(...), 'skills')`，本仓库三份都照抄这个形态，只是把包名换成自己的 bundle 包。

### 工具行：上游 `tool-ask-user` 原样保留，旁边新增 `tool-grilling-form`（MATT-ADD，三份都有）

在 `remaining model-facing rows` 组里，上游 `- id: tool-ask-user` 两行**一字不动**，只在它前面插入 `# MATT-ADD:` 注释、在它后面追加 `- id: tool-grilling-form` 两行。下面整块是**成品形状**（三份内容相同）：其中 `tool-ask-user` 那两行是照抄上游既有内容，**不要真的新增一遍**，本次新增的只有注释与 `tool-grilling-form` 两行。`# MATT-ADD:` 标记是升级 diff 审查识别「预期差异」的依据，勿删：

```yaml
          # MATT-ADD: tool-grilling-form sits beside the upstream tool-ask-user row, which
          # ships unchanged. Division of labour: the native one takes over the composer for
          # a single confirmation; the variant puts a whole grilling round into the
          # transcript as a form and ends the turn there, the user answering from the
          # native composer. Skills ship upstream-verbatim except grilling (local notes:
          # Chinese Q2 example, business-language framing, delivery, sub-agent settle gate;
          # see patches/matt-presets-bootstrap/README.md section 2).
          - id: tool-ask-user
            name: '@deepseek-ai/dsh-tool-ask-user'
          - id: tool-grilling-form
            name: '@lynn123411/dsh-ask-user-grilling'
```

**原因**：一行管一类提问，两行的作答通道互不争用。原生 `ask_user_question` 保留——它在输入框上方接管作答面板、阻塞等答案，适合一次简单确认，官方 plan-mode 正文点名的也是它（不再悬空）。新增的 `grilling_form` 只服务 grilling 轮：校验入参后 `exec.concludeTurn()` 当轮即结束，把整轮问题作为一张可交互表单投在对话记录的那条工具行里，用户在**原生输入框**里作答、答案作为下一条用户消息到达；它不接管输入框、不阻塞，因此与原生那条可以并存。该行放在 planning 组**之外**（普通工具区）即可，因为 `grilling_form` 只消费 `ctx.tools`、无 realm 依赖，也不提供任何 plan-mode 工具（共识达成后交还用户决定下一步）。

### matt-cordis 的两条额外处理

- **persona 逐字取官方短 persona**。官方 `cordis` 的 persona 与 `standard` 同一句（`prefix: >-\n  You are a coding agent powered by the {{model}} model.`），官方注释写明理由：工具描述与技能目录承载运行细节、preset 作者规则归技能。persona 行始终逐字取官方正文，不保留仓库自写的长篇身份——预设作者规则归随包技能，不归 persona。
- **`customSkillDirs` 两个条目**：本包 `skills/`（26 个 matt 技能）＋ 官方 `@deepseek-ai/dsh-agent-preset/skills`（官方 cordis 自带的 4 个：`agent-experience` / `cordis-composition-reference` / `cordis-plugin-development` / `editing-cordis-compositions`）。仓库**不 vendor** 这些 cordis 随附技能副本；技能正文随官方包走，仓库侧零 diff 维护。

## 二、`skills/grilling/SKILL.md`：本地适配四处

上游文件的 frontmatter 与英文正文原样保留，本地动手四处：① 核心原则旁注、② 格式块第二例中文化、③ 投递旁注、④ 收尾段改写。①③④ 为中文旁注（④ 块内保留上游两句英文），③ 另在引用前加一句字段对应正文，② 只把第二例换成中文。**格式块第一例与 `Finding _facts_` 段取上游逐字、本地不动**——这两处是有意保持的上游原样，重打时不要顺手删改（原因见 ③ 之后与 §六）。

- **改动 ① 核心原则旁注（产品视角）**：frontier 段（`Work the tree in **rounds**…`）之后、`Format a round like so:` 之前，插入一段中文引用：**把沟通对象当产品负责人，只聊业务结果，不谈代码实现**，四条 bullet——视角落点（只确认用户能感知的行为：页面表现、交互体验、业务流程；屏蔽底层工程细节：接口、依赖库、实现模块）、语言脱敏（杜绝代码片段、文件路径、未经解释的黑话）、技术翻译（底层选型影响重大时，先讲对用户的影响、再确认业务上的取舍）、决策呈现（「效果对效果」直观对比，并标注各自代价：上线时间、性能折损、维护成本）。**原因**：答题人是决策者、不是实现者——工程视角的问题产品负责人答不了，答案也支撑不了设计树上的决定；旁注放在格式块之前，模型组装问题时先读到这一视角。成品（三份 preset 相同）：

```markdown
> **核心原则：把沟通对象当产品负责人，只聊业务结果，不谈代码实现。**
>
> - **视角落点**：只确认**用户能感知的行为**（页面表现、交互体验、业务流程），屏蔽底层工程细节（接口、依赖库、实现模块）。
> - **语言脱敏**：问题中杜绝代码片段、文件路径及未经解释的专业黑话，统一用业务语言交流。
> - **技术翻译**：若底层选型影响重大，先讲**"对用户有什么影响"**，再确认**"业务上怎么取舍"**。
> - **决策呈现**：提供选项时，做**"效果对效果"**的直观对比，并明确标注各自的代价（如上线时间、性能折损、维护成本）。
```

- **改动 ② 格式块（第一例取上游逐字，第二例中文化）**：上游 `Format a round like so:` 之后那块两例同为英文、都带 `❓` / `➡️` 标记、题干占位含 `including multiple choices`。**第一例与整块形制取上游逐字、本地不动**；只把第二例换成中文（`❓ **Q2** - **<问题标题>**：<问题正文，可能包含多个段落，包括多个选项>` / `➡️ <你的推荐答案>`），让中文会话拿到中文标签。**原因**：中文第二例是这块唯一要保的东西；模板整体留在上游形制上，升级覆盖后只需补这一例。**代价（明知并接受）**：这块是模型最可能整段照抄的样例，选项写在题干里；字段落位由 ③ 新增的那句正文承担，本块不补定位句。该形制历史上出现过「整轮问题写成散文、表单一次都没投出」的事故（症状是人拿到不可点击的纯文本），本次不配检测手段，只按 §六 复查。成品（三份 preset 相同）：

```
❓ **Q1** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>

---

❓ **Q2** - **<问题标题>**：<问题正文，可能包含多个段落，包括多个选项>

➡️ <你的推荐答案>
```

- **改动 ③ 投递纪律旁注（一步投递 + 字段对应）**：格式块之后新增一句正文与一段引用（中文）。正文一句把格式块与表单字段对上：`question` 写标题加一句正文、`detail` 写展开的多段正文、`options` 写选项、`recommended` 标出推荐项、`number` 写 Q 编号——补上模板不示范字段落位的那块。引用段说清**每一轮只投一次表单、不写散文预告**，三条 bullet：① 不要用消息正文把问题再说一遍，直接调一次 `grilling_form`，整轮问题作为一张表单投在对话记录里；② 这是本轮**唯一且最后**的调用——它一发出本轮就结束，同批别的调用会把本轮撑开；③ 用户在对话区的表单里勾选、自填，点「导入输入框」写进他自己的输入框、再用原生发送键发出，作答作为**下一条用户消息**到达，不要等它、也不要把表单当成已经有答案。界面把 `question` 渲染成无 markdown、不吃换行的标题，`detail` 才走 markdown 正文块。**原因**：工具发完就 `exec.concludeTurn()` 结束本轮，正文若再把问题写一遍，用户看到的是重复且不可点的文本；一步投递让问题只存在于表单里、答案只存在于用户的下一条消息里，轮次边界干净。**代价（明知并接受）**：模板只示范标记与结构（第一例逐字取上游、第二例中文化），字段对应只由 ③ 的这句正文承担。

`matt-standard` / `matt-cordis` 的旁注全文（正文一句 + 引用段）：

```markdown
上面那段格式里的东西**直接进表单**：`question` 写标题加一句正文、`detail` 写展开的多段正文、`options` 写选项、`recommended` 标出你推荐的那一项、`number` 写 Q 编号。

> **每一轮只投一次表单，不写散文预告**：
>
> - 不要用消息正文把问题再说一遍：直接调一次 `grilling_form`，整轮问题作为一张表单投在对话记录里。
> - 这是本轮**唯一且最后**的调用——它一发出本轮就结束，同批别的调用会把本轮撑开。
> - 用户在对话区的表单里勾选、自填，点「导入输入框」写进他自己的输入框，再用原生发送键发出；他的作答会作为**下一条用户消息**到达，不要等它、也不要把表单当成已经有答案。
```

`matt-ptc` 只把第一条 bullet 换成：

```markdown
> - 不要用消息正文把问题再说一遍：在 `run_code` 程序内用一次 `return await tools.grilling_form({ questions: [...] })` 把整轮问题投成对话里的表单。
```

- **不再动的两处（上游逐字）**：`Finding _facts_ …` 段里的 `Don't block on it: a running exploration is an unsettled prerequisite, so only the questions downstream of it wait for the sub-agent to report; ask the rest of the frontier now.` **保留上游原文**——本地曾经删掉过、现已恢复。它说的是一轮**之内**的时序：不必等探索回来才继续问，只有依赖该探索结果的问题才等；收尾段那条（改动④）说的是整场会话的**收口闸门**：探索没结算就不认共识、不向用户确认、不据此行动。两句**各管一层**、不是相反指令——此前把它们判成冲突而删句的判断已撤回。与格式块第一例一样，重打时这处也**不要顺手删改**（见 §六）。

- **改动 ④ 收尾段改写（会话结束的判定）**：上游收尾段 `The session is done when the frontier is empty… Do not act on it…` 改写成一段中文引用：**会话结束的判定需要同时满足**两条——第一条保留上游原句（**The frontier is empty**: every branch of the design tree visited, nothing left silently assumed.），第二条新增（中文）：本会话派遣过的每一个子代理都已结算，只要还有一个没回来，`frontier` 空了也不作数、不得当成最终共识、不得向用户确认或据此行动，先等它结算（结果可能推翻已定下来的决定、需要重开一部分树）；块末逐字保留 `Do not act on it until the user confirms you have reached a shared understanding.`。三份 preset 同文（PTC 的特例只在 ③ 的投递第一条 bullet，本段一致）。**判据**：等子代理只压在**收口闸门**上——未结算就不认共识、不向用户确认、不据此行动；结果可能推翻已定的决定、需要重开一部分树。轮次层面（这一轮问谁、何时问）只由 frontier 定义与事实段支配，正文不带派遣/等待的轮次纪律。**边界**：文字级软纪律、无闸门拦截，纪律只写在旁注里、不写在插件上。成品：

```markdown
> **会话结束的判定需要同时满足**：
>
> - **The frontier is empty**: every branch of the design tree visited, nothing left silently assumed.
> - 本会话派遣过的**每一个子代理都已结算**——只要还有一个没回来，`frontier` 空了也不作数，不得当成最终共识、不得向用户确认或据此行动；先等它结算（结果可能推翻已定下来的决定、需要重开一部分树）。
>
> Do not act on it until the user confirms you have reached a shared understanding.
```

**其余英文正文不动**：格式块前后的英文段落均为上游逐字；本地在英文正文上的动作只有一处——改动④ 的收尾段改写（`Finding _facts_` 段与格式块第一例均回到上游逐字）。

## 三、其余文件

- `skills/` 的 26 个技能：来自 [mattpocock/skills](https://github.com/mattpocock/skills) **原样 vendor，无改动**；其中 `implement-spec` 上游归在 `skills/in-progress/`（beta、官方明确不随插件分发），本仓库按快照一并 vendor。grilling 是唯一有本地改动的例外。matt-cordis 的技能数与另两份相同（26）——cordis 随附的 4 个技能由官方 `@deepseek-ai/dsh-agent-preset/skills` 提供，不入库。
- `package.json`（bundle 声明）、`matt-<id>.patch.yml`（组合声明）、`README.md`：自写。`package.json` 与另三份 preset 同形态：`name` / `version` / `description` / `type` / `exports["./package.json"]` / `files`（`skills`、`matt-<id>.patch.yml`、`README.md`）/ `dependencies` / `license` / `keywords` / `repository.directory` / `engines.dsh`（写**大于等于当前版本**的 SemVer 范围，不写精确版本）/ `publishConfig` / `dsh.bundle.patch`。`dependencies` 只写 `config.plugins` 消费的仓库外插件（三份都是 `@lynn123411/dsh-ask-user-grilling`）：preset 行按 `name` 从声明它的那棵树解析，缺了它整行 `never started`、preset 带上诊断且不可选。**不声明 `peerDependencies`**：preset bundle 不编译、不 import 内核包，而 `config.plugins` 引用的内核包有几十个，挑几个当 peer 纯属任意；更要紧的是 pnpm 的 `auto-install-peers` 会去 registry 把它们物化回来，可能顶掉本机开发副本（本仓库硬约束 2 的同款事故）。

## 四、外部材料（非改动、需自带）

- 插件 `@lynn123411/dsh-ask-user-grilling`（grilling 轮的逐题盘问工具：校验入参后调 `exec.concludeTurn()` 结束本轮，把整轮问题作为一张**可交互表单**投在对话记录的那条工具行里；强制多选、可选题号参数 `number` 并进 `header`、可选正文参数 `detail` 交给界面的 markdown 正文位、推荐标记归一化；表单表示不了的入参就地返回 `rejected` + `violations` 且不结束本轮；表单底部一个「导入输入框」键把作答写进原生草稿，用户按原生发送键发出，作答作为下一条用户消息到达；transcript 那一行由本包自带的浏览器半边画）：**必须经注册安装、且列进 profile 的 bundle 层**。① 装包（`dsh plugin --profile web add @lynn123411/dsh-preset-matt-<id> @lynn123411/dsh-ask-user-grilling`，或 Plugin Manager `install_bundle`）；三份 preset 已把它声明为 `dependencies`，preset 行总可解析——但 bundle 层只按 profile 的**直接依赖**登记（`dsh-app-boot` 的 `readProfilePlugins` 读 profile 自己的 `package.json`），漏点名时工具照常可用、表单行退回原始 JSON。② 该包进 `dsh.profile.bundles`（包内 `cordis.patch.yml` 插入一条 `id: lynn-grilling-form-carrier`、`config.carrier: true` 的载体行，宿主半边在那条行下什么都不注册）；② 不可省：表单是客户端半边画的，而客户端 bundle 只对 root loader 的 **enabled entry** 服务，preset 工具行是直接挂的子树、不是 Loader entry。**不要手工拷贝进 `node_modules/@lynn123411/`**：未注册的裸拷贝会在任何 pnpm 同步时被当 extraneous 剪掉；roster 对每份 preset 做行可解析性健康检查，插件被剪后三份 preset 都带 `never started` 诊断、不可选。仓库 `plugins/dsh-ask-user-grilling/` 是事实源。
- 26 个技能随 mattpocock/skills 上游更新。

## 五、验证（2026-09-30 在 DSH 0.2.0-rc.2 实测）

`<DSH 安装>` 指本次运行中的安装目录（启动器布局下形如 `…/versions/0.2.0-rc.2`）：

```bash
DSH="<DSH 安装>/node_modules/@deepseek-ai/dsh/lib/bin.js"
```

1. **组合解析**（三份都 exit 0）：

   ```
   $ node "$DSH" --profile web --patch presets/matt-standard/matt-standard.patch.yml --dump-config > ./tmp/preset-dumps/matt-standard.yml
   exit=0 ; 2273 行
   # == /Users/tny/Desktop/work/my-dsh/presets/matt-standard/matt-standard.patch.yml
   # （节选，`description` 折行略）
   - id: preset-matt-standard
     name: '@deepseek-ai/dsh-agent-preset'
     config:
       id: matt-standard
       name: Matt 标准
       order: 11
   ```

   `matt-ptc` / `matt-cordis` 同样 exit 0（2279 / 2278 行）；`minimal-fs` 2100 行。行数随 profile 的插件状态浮动，判据是 exit 0 与上面这段头部，不是绝对行数。

2. **与官方结构等价**——把两份 patch 的行列表（缩进 10 的 `- id:` 行）逐一比对，只许出现「新增工具行」这一处差异：

   ```
   ### matt-standard vs standard.patch.yml
   ### only in official: (none)
   ### only in repo:     tool-grilling-form
   ### plugin rows official/repo: 19/20; order preserved: true
   ### matt-ptc vs ptc.patch.yml
   ### only in official: (none)
   ### only in repo:     tool-grilling-form
   ### plugin rows official/repo: 20/21; order preserved: true
   ### matt-cordis vs cordis.patch.yml
   ### only in official: (none)
   ### only in repo:     tool-grilling-form
   ### plugin rows official/repo: 20/21; order preserved: true
   ```

   归一化后 `diff -u` 只剩两处：`customSkillDirs` 插入块、`tool-grilling-form` 新增行。`ptc` / `cordis` 同（cordis 无插入、只有新增行 + `customSkillDirs` 多一条）。

3. **逐行深度比对**：解析两份 patch，把两处 MATT 改动归一化掉后，`config.plugins` 与官方 `JSON.stringify` 全等 → `true`（插件行数官方/仓库 = 19/20、20/21、20/21）。

4. **AgentPreset Config 校验**：用真的 `@deepseek-ai/dsh-agent-preset` schemastery `Config` 校验三份解析结果，全部通过；`plugins` = 20/21/21，`customSkillDirs` = 1/1/2，`order` = 11/12/13。

5. **`!!js` 表达式求值**（`--dump-config` 不求值 `!!js`，所以这条单独跑）：把 patch 里的 `!!js` 标量原文取出、以 `baseUrl = file://<profile 目录>/` 求值——三份各解析到本包 `skills/`（各 26 个 `SKILL.md` 目录），matt-cordis 第二条解析到官方包的 `skills/`（0.2.0-rc.2 起 4 个：`agent-experience` / `cordis-composition-reference` / `cordis-plugin-development` / `editing-cordis-compositions`）。

6. **包形态**：`cd presets/matt-<id> && npm pack --dry-run` 三份都 exit 0，各 79 个文件（`package.json` + `matt-<id>.patch.yml` + `README.md` + 26 个技能目录及其子文件）。

7. **真装载（0.2.0-rc.2 隔离 `DSH_HOME`）**：grilling 是 `dependencies` 里的仓库外插件，preset 行才解析得到；它在不在 profile 的 `dsh.profile.bundles` 决定 transcript 表单行走自带半边还是退回原始 JSON。三个流程：
   - 只装 preset（npm 包名，或本地 tarball 当 registry）：`broken: null`，grilling 作为传递依赖装进 profile，但**不进** `dsh.profile.bundles`（`readProfilePlugins` 只读 profile 的直接依赖）——工具可用，表单行退回原始 JSON；
   - 命令点名两个包：两个包都进 `bundles`，`broken: null`，grilling 行 `fiberState: 2`；
   - 开发副本（`link:`）只装 preset：`link:` 包的 `dependencies` 不被物化，工具行 `never started`（`broken: "tool-grilling-form (@lynn123411/dsh-ask-user-grilling): never started"`）——开发副本命令必须同样点名 `./plugins/dsh-ask-user-grilling`；点名后 `broken: null`、grilling 行 `fiberState: 2`。

   探针读 `agentPresets.list()` / `compositionInventory()` 与 `systemPrompt.assemble({ scope })`（后者的 `assembly.tools` 就是模型最终收到的 schema 数组）。隔离 `DSH_HOME` + `dsh plugin add` 五个 `link:` 目录，实测：

   - `list()`：四条官方 + `minimal-fs`(5) / `matt-standard`(11) / `matt-ptc`(12) / `matt-cordis`(13) 全部 `broken: null`；`compositionInventory()` 四份都 `broken: null`，行 `fiberState: 2`（`tool-pwsh` / 各 `disabled` 行为 `enabled:false`，非故障）。
   - `tool-grilling-form=up`（`@lynn123411/dsh-ask-user-grilling` 行 `fiberState: 2`）。
   - 模型可见目录：`matt-ptc` 只有 `["run_code"]`；`matt-cordis` 另有 `cordis_inspect_list` / `cordis_inspect_query` / `plugin_manager`；`minimal-fs` 是 `["edit","read","write"]`。
   - 技能目录（`skills.list({ scope })`）：三份 matt 各 26 个随包技能；`matt-cordis` 另含官方 4 个（`agent-experience` / `cordis-composition-reference` / `cordis-plugin-development` / `editing-cordis-compositions`）＝ 30 / 30 / 34 条（宿主 `~/.dsh/skills`、项目 `.agents/skills` 也并入，故总数高于随包数）。`minimal-fs` 不挂 skill-filesystem，技能目录为空。
   - `minimal-fs` 反向对照（同组合去掉 `tool-filter` 行）：模型可见目录变成 `["edit","read","read_image","write"]`——`read_image` 确实是这一行从 `system-prompt/assemble` 里移除的，不是它没注册。

   `--dump-config-schema` 对含 `@deepseek-ai/dsh-agent-preset` 的组合树一律 exit 1（报 `unrecognized Loader tree carrier`）——这是它对该行的既有局限：**把官方 `standard.patch.yml` 当 overlay 跑，stderr 与本次成品逐字相同**（4 条基线 + 每多一条 preset 行多 1 条），不是本仓库引入的问题。

8. **grilling 技能正文与上游逐字比对**（2026-09-30 核对，DSH 0.2.0-rc.2；上游取默认分支当日正文）：

   ```bash
   curl -sS -o ./tmp/grill-verify/upstream.md \
     https://raw.githubusercontent.com/mattpocock/skills/main/skills/productivity/grilling/SKILL.md
   for p in standard ptc cordis; do
     diff -u ./tmp/grill-verify/upstream.md presets/matt-$p/skills/grilling/SKILL.md
   done
   ```

   期望（三份同形）：`diff` 只输出 §二 的四处本地改动——① 产品视角中文引用、② 格式块第二例中文化、③ 一步投递的字段对应正文与中文引用、④ 收尾段改写；**格式块第一例与 `Finding _facts_` 段不出现在 diff 里**（即逐字取上游）。另 `diff` 三份之间只差 ③ 的第一条 bullet（PTC 形态）。不钉上游版本号：上游一改就重跑本步，历史不复现。

## 六、何时重打

- **DSH 升级后**：官方 `standard/ptc/cordis` 组合更新 → 取新版官方 `@deepseek-ai/dsh-web-app/presets/<id>.patch.yml` 覆盖 `matt-<id>.patch.yml`，再按 §一 重打「包装」「技能目录」「工具行」三处。「技能目录」的锚点是 `- id: skill-filesystem` 的 `name:` 行；「工具行」的锚点是 `remaining model-facing rows` 里的 `- id: tool-ask-user` 块——上游那两行原样保留，`# MATT-ADD:` 注释插在它之前、`tool-grilling-form` 两行追加在它之后，官方若改了这两处结构则需手工定位。**必须做全量 diff**：官方会在组合里新增工具行，只 diff 这两个改动块看不出来。
- **重打后的校验**：§五 第 2、3 条必须重跑——归一化 diff 只许出现「技能目录」与「工具行」，深度比对必须全等。`cordis` 的 persona 也随官方逐字覆盖。
- **官方 cordis 技能更新**：不需要动本仓库——matt-cordis 的 `customSkillDirs` 第二条指向官方 `@deepseek-ai/dsh-agent-preset/skills`，跟着 DSH 升级自动更新（0.2.0-rc.2 起该目录 4 个技能，多出 `agent-experience`）。
- **同进程与官方 `cordis` 共存**：Host inspect provider 由**宿主组合单点注册**（`dsh-web-app/cordis.patch.yml` 的 `cordis-inspect-providers` 行，`@deepseek-ai/dsh-tool-cordis/host`），per-preset 的 `tool-cordis` 行不再注册任何 provider，重复注册无从产生——**不需要任何幂等补丁**。判据：`--profile web --dump-config | grep -c "id: cordis-inspect-providers"` 期望 `1`；全安装树 `grep -rn "cordisInspect.register"` 应唯一命中 `dsh-tool-cordis/lib/types/host.js`。
- **Matt 技能上游更新后**：整体覆盖 26 个技能目录（上游 `skills/engineering` 18 个 + `skills/productivity` 7 个 + `skills/in-progress/implement-spec`），再把三份 preset 的 `skills/grilling/SKILL.md` 按 §二 重做——上游逐字 + 改动①②③④（`matt-ptc` 的投递旁注第一条 bullet 用 PTC 形态；改动② 只需把第二例换成中文，改动③ 的字段对应正文与引用段整套重写，改动④ 是改写收尾段、覆盖后要手工再写一遍）。**格式块第一例与 `Finding _facts_` 段有意保持上游原样**（见 §二「不再动的两处」）：覆盖上游文件后**不要**把这两处再删改，改完按 §五 第 8 条比对确认它们没进 diff。其余技能无本地改动。

仓库 `presets/matt-*/` 即上述改动后的成品；日常使用 = `dsh plugin --profile web add @lynn123411/dsh-preset-matt-<id> @lynn123411/dsh-ask-user-grilling` 装进 profile（本仓库开发副本改传 `./presets/matt-<id> ./plugins/dsh-ask-user-grilling`），重启 DSH 后在新建会话界面选择。
