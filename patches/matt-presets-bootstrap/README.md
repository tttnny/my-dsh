# matt-presets-bootstrap — 三个 matt preset 的手工改动点说明

三个 matt preset（`matt-standard` / `matt-ptc` / `matt-cordis`）＝ **官方组合逐字** ＋ **Matt 的 25 个技能** ＋ **grilling 适配插件**（`ask_user_grilling`）。本文逐处说明相对官方材料**改了什么、改成什么样、为什么**，供不跑 `matt-presets-bootstrap.sh`、手工复现/维护时对照。仓库 `presets/matt-*/` 就是改好的成品，直接同步即用；以下改动点只在「从零组装 / DSH 升级后重打」时需要动手。

改动只发生在两类文件上：`agent.cordis.yml`（官方正文上加两处 MATT-ADD）与 `skills/grilling/SKILL.md`（本地适配，改动内容为中文）。`matt-standard` 与 `matt-cordis` 的 `grilling/SKILL.md` 完全相同；`matt-ptc` 的投递纪律整段按 PTC 形态表述（`run_code` 程序内 `tools.ask_user_grilling`，见 §二 示例二），PTC 措辞不进入非 PTC preset。persona 一行不改——grilling 纪律不写进 persona，而是下沉到技能正文的投递纪律段与插件工具描述（模型读到技能/工具时正好看到，比 system prompt 里的抽象禁令有效）。

## 零、当前基线

- 基底：DSH 0.1.3-alpha.2（dsh-launcher 安装）/ `@deepseek-ai/dsh-agent-presets` 0.1.3-alpha.2（2026-09-08 重打：`presets/matt-*/agent.cordis.yml` 与官方正文逐字一致，差异仅两处 MATT-ADD；官方正文位置：安装目录 `node_modules/.pnpm/@deepseek-ai+dsh-agent-presets@<ver>*/node_modules/@deepseek-ai/dsh-agent-presets/presets/{standard,ptc,cordis,minimal}/agent.cordis.yml`）。
- 本次同步掉的官方变化：`dsh-persona` 配置键 `text` → **`prefix`（必填）**——旧键被 schema 拒收（`$.prefix missing required value`），persona 行是组合首条 loader entry，挂载整份失败；官方同时把 `Your working directory is {{cwd}}.` 一句挪进新增的 **`suffix`** 行（suffix 渲染在 first-party guidance 之后），`prefix` 只留 `{{model}}` 首句。`ptc-cordis` 的 persona 为自写合成正文（无逐字官方基底），键形同样对齐：加 `suffix:` 行、`prefix` 首句去掉 cwd。
- 上一次同步（2026-09-04，基线 `@deepseek-ai/dsh-agent-presets` 0.1.2-rc.1 / DSH 2.0.5）：`ptc` 头注释改写；`ptc` 的 `tool-workflow` 改为 `disabled: true`（引擎留给 `ralph`，PTC 下不再另 publish 一个模型编排面）；fork 注释改写（issue #2124 表述）；`standard`/`ptc` 注释里的 `tool-subagent-report` 说明段与 plan-mode 尾句以官方正文为准。
- 标记补齐：两处 MATT-ADD 均带 `# MATT-ADD:` 标记行（`customSkillDirs` 块首行、`tool-ask-user-grilling` 行上三行注释）——升级 diff 时只应看到这两个块，多一行都是官方漂移。

## 一、`agent.cordis.yml`：两处 MATT-ADD

结构：官方正文逐字，加两处 MATT-ADD 插入块。

- **改动 ① `customSkillDirs`**：`- id: skill-filesystem` 段的 `name:` 行之后插入（**matt-cordis 官方自带此块，跳过**）。**原因**：25 个技能是 vendor 进 `skills/` 的额外目录，skill-filesystem 默认不扫它——不加此块模型根本发现不了、也调不到这些技能：

```yaml
  # MATT-ADD: discover the 25 vendored mattpocock skills shipped in ./skills/.
  config:
    customSkillDirs:
      - !!js "process.getBuiltinModule('node:url').fileURLToPath(new URL('skills/', baseUrl))"
```

- **改动 ② 普通工具区的插件工具行**：`- id: tool-skill` 块（`tool-skill` / `dsh-tool-skill`）之后插入。三份内容相同；`# MATT-ADD:` 标记是升级 diff 审查识别「预期差异」的依据，勿删：

```yaml
# MATT-ADD: deliver every grilling round through ask_user_grilling (one form
# call per round). Skills (incl. grilling) ship upstream-verbatim; the delivery
# discipline lives in this tool's description, not in persona or skill files.
- id: tool-ask-user-grilling
  name: '@lynn123411/dsh-ask-user-grilling'
```

**原因**：把 grilling 轮次的提问做成工具级硬约束——不调工具就投不出表单，比 persona 里的劝导可靠得多；该行放在 planning 组**之外**（普通工具区）即可，因为 `ask_user_grilling` 消费 host-plane 的 `userQuestions`/`subagents`、无 realm 依赖，也不提供任何 plan-mode 工具（共识达成后交还用户决定下一步）。

## 二、`skills/grilling/SKILL.md`：本地适配（成品全文）

上游文件（frontmatter + 三段英文正文）经本地适配后有两个版本：**示例一 = `matt-standard` / `matt-cordis`（原生投递）**，**示例二 = `matt-ptc`（PTC 投递形态——模型只见 `run_code`，投递纪律整段按 `run_code` 程序内的 `tools.ask_user_grilling` 表述）**。两版仅「投递纪律」段不同，其余完全一致。本地改动（以示例一标注 ①–③）：引导行保留上游英文 `Format a round like so:`；模板去 emoji、改为纯文本并把**选项独立成 `Options:` 块**（占位为英文，与上游同风格）；投递纪律段（**先散文预告本轮问题、再以一次表单调用投递同一轮**）；删除上游 "Don't block…" 一句。子代理停轮纪律已整段删除（见④），不属于本地改动。其余正文段落为上游英文原样、非改动。

**示例一（`matt-standard` / `matt-cordis`，原生投递）：**

````markdown
---
name: grilling
description: Grill the user relentlessly about a plan, decision, or idea. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phrases.
---

Interview the user relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled: the questions you can ask _now_ without guessing at answers you haven't heard yet. Ask the whole frontier in one round: number each question and give your recommended answer. Then wait for the user's answers before the next round.

Format a round like so:      # ①

```
Q1. **<question title>**: <question body, might be multiple paragraphs>

Options:
- A: <option A>
- B: <option B>
- C: <option C>

Recommended: <your recommended answer>

---

Q2. **<question title>**: <question body, might be multiple paragraphs>

Options:
- A: <option A>
- B: <option B>
- C: <option C>

Recommended: <your recommended answer>
```

> **DSH delivery：** 每一轮分两步投递：先在消息文本里**以散文预告这一轮的全部问题**（标题、正文、选项与推荐），在**同一回合内**紧接着把**同一轮**作为**一次** `ask_user_grilling` 调用发出，让用户在表单中作答：   # ②
> - 散文预告与工具投递必须**同一轮、一一对应**：预告里列出的问题、选项与推荐，投递时就发这一套，不得漏问、也不得在表单里另起一套或换一轮（轮末补充题由代码自动追加，不用你写，也不在预告里）。
> - （本 skill 的轮次内）强制使用 `ask_user_grilling` 而不使用普通的 `ask_user_question` 工具。

Each round the user answers reshapes the tree: settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a _later_ round, not this one.

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the environment (filesystem, tools, etc.), dispatch a sub-agent to find it; don't ask the user for anything you could look up yourself. The _decisions_ are the user's: put each to them and wait.   # ③

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed. Do not act on it until the user confirms you have reached a shared understanding.
````

**示例二（`matt-ptc`，PTC 投递形态）：**

````markdown
---
name: grilling
description: Grill the user relentlessly about a plan, decision, or idea. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phrases.
---

Interview the user relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled: the questions you can ask _now_ without guessing at answers you haven't heard yet. Ask the whole frontier in one round: number each question and give your recommended answer. Then wait for the user's answers before the next round.

Format a round like so:      # ①

```
Q1. **<question title>**: <question body, might be multiple paragraphs>

Options:
- A: <option A>
- B: <option B>
- C: <option C>

Recommended: <your recommended answer>

---

Q2. **<question title>**: <question body, might be multiple paragraphs>

Options:
- A: <option A>
- B: <option B>
- C: <option C>

Recommended: <your recommended answer>
```

> **DSH delivery：** 每一轮分两步投递：先在消息文本里**以散文预告这一轮的全部问题**（标题、正文、选项与推荐），在**同一回合内**紧接着再在 `run_code` 程序内用 `return await tools.ask_user_grilling({ questions: [...] })` 把**同一轮**作为**一次**调用投出，让用户在表单中作答：   # ②
> - 散文预告与投递必须**同一轮、一一对应**：预告里列出的问题、选项与推荐，投递时就发这一套，不得漏问、也不得在表单里另起一套或换一轮（轮末补充题由代码自动追加，不用你写，也不在预告里）。
> - （本 skill 的轮次内）强制使用 `tools.ask_user_grilling` 而不使用 `tools.ask_user_question`。

Each round the user answers reshapes the tree: settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a _later_ round, not this one.

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the environment (filesystem, tools, etc.), dispatch a sub-agent to find it; don't ask the user for anything you could look up yourself. The _decisions_ are the user's: put each to them and wait.   # ③

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed. Do not act on it until the user confirms you have reached a shared understanding.
````

**本地改动逐条说明**（①–③ 对应上文中标注；④为已删除项的说明；其余为上游英文原样、非改动）：

- **①** 上游格式块用 emoji 问号/箭头标记、且正文占位含 `including multiple choices`（诱导把选项塞进题干）；本改动把模板改写为纯文本并**把选项独立成 `Options:` 块**（`Qn.` 标题 / 正文占位不含选项 / `Options:` 列 A/B/C / `Recommended:`），引导行保留上游英文 `Format a round like so:`。**原因**：模板是模型最可能整段照抄的样例——emoji 会被抄进输出、『选项塞正文』的占位会诱导模型把 A/B/C 写进题干；选项独立成块后与投递字段一一对应，模型照模板组织即可。
- **②** 在格式块后新增旁注「**DSH delivery**」整段（中文）：轮次投递 = **先在消息文本里按模板以散文预告本轮全部问题（标题/正文/选项/推荐），在同一回合内紧接着把同一轮作为一次 `ask_user_grilling` 调用发出、让用户在表单中作答**；预告与投递必须**同一轮、一一对应**（不得另起一套；轮末补充题由代码自动追加，不计入一一对应）；（本 skill 轮次内）强制轮次提问走 `ask_user_grilling`、不用普通 `ask_user_question`。字段组织细节（title→`header`、body→`question`、选项→`options`、推荐加标记）不写进旁注，由模板与工具描述承载、让模型自行判断。**matt-ptc**：投递纪律整段按 PTC 形态表述（见上文示例二）——预告照常写在消息文本里，投递写成 `run_code` 程序内的 `tools.ask_user_grilling({ questions: [...] })`，禁用 `tools.ask_user_question`。**原因**：纯散文让用户拿到不可点击文本、丢失表单；纯工具又让用户看不到正文里的问题陈述——散文预告 + 工具表单各司其职，且必须成对出现；PTC 形态只属于 PTC preset，不进入非 PTC 版本。
- **③** 上游事实段含 "Don't block on it … ask the rest of the frontier now." 一句（鼓励先问其余轮次），**整句删除**；段末以 "The _decisions_ are the user's: put each to them and wait." 收尾。**原因**：`ask_user_grilling` 在子代理未结算时会整轮硬拒绝（`blocked: true`），先问也白问——上游句与闸门现实冲突，只能删上游句。停轮纪律不在 SKILL 里另写，撞闸时由工具报错现教（见④）。
- **④（已删除）** 事实段后的「**Sub-agent rounds**」旁注整段删除，不再写“派遣即列任务清单并 STOP、不轮询等结算、被拒同回合不重试”。**原因**：条件式写法（“一旦你派遣了子代理…”）仍有 priming 效应——模型本来没打算派，看见完整停轮程序会被诱导去派；上游事实段的 `dispatch a sub-agent` 是作者原话、保持不动，本段作为我们后加的纪律是唯一可删的诱导源。删除后停轮纪律只由 `ask_user_grilling` 的工具描述与 `blocked: true` 报错现教（“结束本回合等结算通知，同一回合不重试”），第一次撞闸多花一次工具调用，换零诱导。

## 三、其余文件（无本地改动或自写）

- `skills/` 其余 24 个技能：来自 [mattpocock/skills](https://github.com/mattpocock/skills) **原样 vendor，无改动**；matt-cordis 额外含 cordis 官方随附 2 技能（`cordis-plugin-development`、`editing-cordis-compositions`），同样原样随官方同步。**原因**：上游即权威来源，逐字复制可整体随上游替换、仓库侧零 diff 维护（grilling 是唯一有本地改动的例外）。
- `preset.yml`：自写两行 `name` / `description`。三份 `name` 分别为「Matt 标准 / Matt PTC 模式 / Matt 创造模式」；`description` 各写一句话，大意都是「官方组合（persona 零改动）＋ Matt 的 25 个技能 ＋ grilling 适配插件，共识后不自动进入 plan mode」（三份措辞各见实物：standard 强调先散文预告再表单投递，ptc 强调模型只见 run_code，cordis 强调随附技能与 tool-cordis）。**原因**：preset 名与说明显示在 DSH 的会话选择器上，需要用户可读的名称与一句话说明。

## 四、外部材料（非改动、需自带）

- 插件 `@lynn123411/dsh-ask-user-grilling`（只提供 `ask_user_grilling`，其精简的工具描述承载「grilling 轮次专用、先散文预告同一轮、再以工具投递表单、字段映射、勿自加收尾题、子代理闸门（`blocked` 现教停轮）」等工具必知项；多选与每题补充输入框是 UI 自动行为，刻意不写入描述，避免模型为规避多选影响出题）：**必须经注册安装**——`cd ~/.dsh/profiles/web && pnpm add @lynn123411/dsh-ask-user-grilling@<版本>`（写进 package.json 依赖），不要只手工拷贝进 `node_modules/@lynn123411/`：未注册的裸拷贝会在任何 pnpm 同步（如插件市场批量更新）时被当 extraneous 剪掉，而 roster 对每份 preset 做行可解析性健康检查（`unresolvableRows`），此插件一旦被剪，**引用它的三份 preset 会整体从模式选择里消失**（2026-09-08 实例：23:11 profile 同步剪掉手工拷贝的 0.2.1，三份 preset 全隐藏，`pnpm add` 回装后恢复）。仓库 `plugins/dsh-ask-user-grilling/` 是事实源（0.2.2 已发布；工作区现有未发布改点：工具描述重写与 schema 措辞，待下次发版）；如仓库含未发布改点，先发布再回装，勿回退到裸拷贝。**原因**：改动② 引用的正是这个包，不装则工具行解析失败；工具描述与技能旁注分工互补——投递纪律在旁注，停轮纪律只在工具描述（SKILL 侧已删，避免诱导），工具描述只留必知项。
- 25 个技能随 mattpocock/skills 上游更新。

## 五、何时重打

- **DSH 升级后**：官方 `standard/ptc/cordis` 组合更新 → 以新版官方正文覆盖仓库文件，按第一节重打两处 MATT-ADD（注意改动② 的锚点是 `tool-skill` 块，官方若改了该块结构则需手工定位）；matt-cordis 的两个 cordis 随附技能如有变，从官方 `cordis/skills/` 覆盖。**persona 行始终逐字取官方正文**——官方偶有键级改名（如 0.1.3-alpha.2 的 `text`→`prefix`、cwd 句拆入 `suffix`），不要保留仓库旧写法。
- **DSH 升级后（同进程共存）**：官方 `cordis` / `ptc-cordis` / `matt-cordis` 同进程互挂依赖 `dsh-tool-cordis` Host inspect 注册幂等补丁，每次升级/重装后需重跑 [`../patch-dsh-cordis-inspect-idempotent/`](../patch-dsh-cordis-inspect-idempotent/README.md)。注意 **dsh-launcher 布局**（`~/Library/Application Support/in.dsh-plug.dsh-launcher/versions/<ver>/`）不在脚本自动搜索路径内，且 `.pnpm` 嵌套比其 `find -maxdepth 6` 深一层——需把 `DSH_ROOT` 指到对应包的内层 `node_modules`（即 `<ver>/node_modules/.pnpm/@deepseek-ai+dsh-tool-cordis@*/node_modules`）运行一次。
- **Matt 技能上游更新后**：整体覆盖 25 个技能目录，再把对应 preset 的 `grilling/SKILL.md` 成品覆盖回 grilling——`matt-standard` 与 `matt-cordis` 用 §二 示例一；`matt-ptc` 用 §二 示例二（PTC 形态）。其余技能无本地改动。

仓库 `presets/matt-*/` 即上述改动后的成品；日常落地 = 装好插件后把三个目录（`agent.cordis.yml` + `preset.yml` + `skills/`，不含 README.md）同步到 `~/.dsh/.agent-presets/<id>/` 并重启 DSH。
