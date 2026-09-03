# matt-presets-bootstrap — 三个 matt preset 的手工改动点说明

三个 matt preset（`matt-standard` / `matt-ptc` / `matt-cordis`）＝ **官方组合逐字** ＋ **Matt 的 25 个技能** ＋ **grilling 适配插件**。本文逐处说明相对官方材料**改了什么、改成什么样**，供不跑 `matt-presets-bootstrap.sh`、手工复现/维护时对照。仓库 `presets/matt-*/` 就是改好的成品，直接同步即用；以下改动点只在「从零组装 / DSH 升级后重打」时需要动手。

改动只发生在两类文件上：`agent.cordis.yml`（官方正文上加两处 MATT-ADD + 文件头 banner 注释）与 `skills/grilling/SKILL.md`（5 处本地适配，三份 preset 逐字节相同）。persona 一行不改。

## 一、`agent.cordis.yml`：加 banner + 两处 MATT-ADD

结构：`文件头 banner 注释（新增） + 官方正文逐字 + 两处 MATT-ADD 插入块`。

- **banner**：官方首行之前新增一段自我描述注释（`# `matt-standard` = official ...`），说明本文件 = 官方组合逐字 + 哪些 MATT-ADD、grilling 纪律的载体位置、升级时如何重打。三份各自成文，升级重贴时从仓库现有文件/git 里整体保留或照写即可。
- **改动 ① `customSkillDirs`**：`- id: skill-filesystem` 段的 `name:` 行之后插入（**matt-cordis 官方自带此块，跳过**）：

```yaml
  # MATT-ADD: discover the 25 vendored mattpocock skills shipped in ./skills/.
  config:
    customSkillDirs:
      - !!js "process.getBuiltinModule('node:url').fileURLToPath(new URL('skills/', baseUrl))"
```

- **改动 ② planning 组内插件工具行**：plan-mode 段结尾（锚点行 `do not proceed with implementation.`）之后插入。matt-standard / matt-cordis 用「通用版」；matt-ptc 在通用注释后多两行 PTC 注释（下方代码块内已注明）——该行必须留在 planning 组内，`enter_plan_mode` 消费 realm 隔离的 `planMode` 服务：

```yaml
    # MATT-ADD: grilling adaptations (@lynn123411/dsh-ask-user-grilling).
    # `enter_plan_mode` consumes the realm-isolated `planMode` service, so this
    # row must live inside the planning group; `ask_user_grilling` consumes
    # host-plane `userQuestions`/`subagents`, reachable from within the realm.
    # ↓ 以下两行仅 matt-ptc 有（standard / cordis 删去）：
    # Under mode: ptc both tools are reached as `tools.<name>(...)` inside
    # `run_code` — see the grilling skill's DSH delivery note.
    - id: tool-ask-user-grilling
      name: '@lynn123411/dsh-ask-user-grilling'
```

## 二、`skills/grilling/SKILL.md`：5 处本地适配（成品全文）

上游文件（frontmatter + 三段正文）经 5 处改动后的**完整成品**如下，三份 preset 该文件逐字节相同、可互相覆盖。改动处以 ①–⑤ 标注在文后。

````markdown
---
name: grilling
description: Grill the user relentlessly about a plan, decision, or idea. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phrases.
---

Interview the user relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled: the questions you can ask _now_ without guessing at answers you haven't heard yet. Ask the whole frontier in one round: number each question and give your recommended answer. Then wait for the user's answers before the next round.

Format a round like so (plain-text markers, no emoji):      # ①

```
Q1. **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

Recommended: <your recommended answer>

---

Q2. **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

Recommended: <your recommended answer>
```

> **DSH delivery (local adaptation — keep when syncing from upstream):** the format above is the round's LOGICAL structure, never its delivery channel. Every round is delivered through the `ask_user_grilling` tool — this is mandatory, not a preference:   # ②
>
> - Send the WHOLE frontier as ONE `ask_user_grilling` call. Map the format element by element: the `Qn.` title → `header` (e.g. "Q1 — Priority"); question body → `question`; the A/B/C choices → `options`; the `Recommended:` answer → put that option FIRST and append "(Recommended)" to its label. A short facts preamble in the message text is fine (facts are your job — state what you found without asking); the QUESTIONS themselves never appear as prose.
> - Never use the plain `ask_user_question` tool for round questions, and never emit the `Qn.`/`Recommended:` round markdown as message text — the user would get unclickable prose and lose the form UI and the automatic round-end supplement.
> - Recovery: if you already emitted a prose round, do not apologize or rephrase in prose — immediately reissue the SAME round as ONE `ask_user_grilling` call with the mapping above.
> - In PTC presets (the model sees only `run_code`): deliver the round as `return await tools.ask_user_grilling({ questions: [...] })` inside a `run_code({ code, description })` program, with the program's own top-level `code` AND `description`; the same mapping applies.

Each round the user answers reshapes the tree: settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a _later_ round, not this one.

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the environment (filesystem, tools, etc.), dispatch a sub-agent to find it; don't ask the user for anything you could look up yourself. The _decisions_ are the user's: put each to them and wait.   # ③

> **Sub-agent rounds (local adaptation — overrides the upstream "don't block" guidance):** the moment you dispatch one or more sub-agents in a round, output each sub-agent's task list (what each one is going to find), then STOP: call no other tool, ask no question, and end your turn. Sub-agent settlement notifications wake you automatically — do not poll. Only after EVERY dispatched sub-agent has settled do you ask the frontier (including the questions that were not blocked). `ask_user_grilling` hard-refuses while background sub-agents are running (returns `blocked: true`) — if you are blocked, end your turn and wait; never retry within the same turn.   # ④

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed. Do not act on it until the user confirms you have reached a shared understanding.

> **Consensus → plan mode (local adaptation):** the moment the user confirms you have reached a shared understanding, call `enter_plan_mode` DIRECTLY (in PTC presets: `return await tools.enter_plan_mode()` inside a `run_code` program) — do not ask a separate "generate a plan or execute directly?" question, and do not start executing. Write the plan in plan mode and submit it with `exit_plan_mode`. The only exception: the user explicitly asked to skip the plan and execute directly.   # ⑤
````

**5 处改动逐条说明**（①–⑤ 对应上文中标注；上游文件无标注处的正文段落均未改动）：

- **①** 上游格式块用 emoji 问号/箭头标记；本改动把模板改写为纯文本 `Qn.` / `Recommended:`，并把模板上方说明行 `Format a round like so` 改为加注 `(plain-text markers, no emoji)`。
- **②** 在格式块后新增旁注「**DSH delivery**」整段（上文中 `> **DSH delivery …**` 及其 4 条 bullet，含 `(local adaptation — keep when syncing from upstream)` 标记）：格式只是轮次的逻辑结构、不是投递渠道——每轮必须整轮一次 `ask_user_grilling` 调用；逐项映射（`Qn.` 标题→`header`、正文→`question`、选项→`options`、`Recommended:` 答案→置首并加 "(Recommended)"）；事实前言允许以散文出现、问题本体绝不散文；误发散文轮→不道歉不改写，立即原样重发为一次工具调用；PTC 下经 `run_code` 程序内 `tools.ask_user_grilling`。
- **③** 上游事实段含 "Don't block on it … ask the rest of the frontier now." 一句（与 ④ 的停轮纪律冲突），**整句删除**；段末以 "The _decisions_ are the user's: put each to them and wait." 收尾。
- **④** 事实段后新增旁注「**Sub-agent rounds**」整段（含 `(local adaptation — overrides the upstream "don't block" guidance)` 标记）：派遣子代理即输出各代理任务清单并 STOP——本回合不再调任何工具、不再提问、结束回合；不轮询，等全部子代理结算通知自动唤醒；`ask_user_grilling` 在后台子代理运行时会硬拒绝（`blocked: true`），被拒就结束回合等待，绝不在同回合重试。
- **⑤** 结尾新增旁注「**Consensus → plan mode**」整段（含 `(local adaptation)` 标记）：用户确认共识后直接调 `enter_plan_mode`（PTC 下 `tools.enter_plan_mode()` 走 `run_code`），不再问「生成方案还是直接执行」；唯一例外是用户明确要求跳过方案直接执行。

## 三、其余文件（无本地改动或自写）

- `skills/` 其余 24 个技能：来自 [mattpocock/skills](https://github.com/mattpocock/skills) **原样 vendor，无改动**；matt-cordis 额外含 cordis 官方随附 2 技能（`cordis-plugin-development`、`editing-cordis-compositions`），同样原样随官方同步。
- `preset.yml`：自写两行 `name` / `description`。三份 `name` 分别为「Matt 标准 / Matt PTC 模式 / Matt 创造模式」；`description` 一句话说明「官方组合逐字（persona 零改动）＋ Matt 的 25 个技能 ＋ grilling 适配插件，纪律写在技能旁注与插件工具描述里」。

## 四、外部材料（非改动、需自带）

- 插件 `@lynn123411/dsh-ask-user-grilling`（提供 `ask_user_grilling` + `enter_plan_mode`，其工具描述本身也内置纪律文案）：npm 安装，或从本仓库 `plugins/` 同步到 `~/.dsh/profiles/web/node_modules/@lynn123411/`（本仓库是事实源，可能含未发布改点）。
- 25 个技能随 mattpocock/skills 上游更新。

## 五、何时重打

- **DSH 升级后**：官方 `standard/ptc/cordis` 组合更新 → 以新版官方正文覆盖仓库文件（保留文件头 banner），按第一节重打两处 MATT-ADD；matt-cordis 的两个 cordis 随附技能如有变，从官方 `cordis/skills/` 覆盖。
- **Matt 技能上游更新后**：整体覆盖 25 个技能目录，再以本仓库任一 `grilling/SKILL.md` 成品覆盖回 grilling（按第二节，其余技能无本地改动）。

仓库 `presets/matt-*/` 即上述改动后的成品；日常落地 = 装好插件后把三个目录（`agent.cordis.yml` + `preset.yml` + `skills/`，不含 README.md）同步到 `~/.dsh/.agent-presets/<id>/` 并重启 DSH。
