# grilling 技能：本机适配清单（上游 28 行 → 51 行）

`.agents/skills/grilling/SKILL.md` 的本地适配：上游那份 28 行正文，按本清单改动四处，得到文末的 51 行成品。frontmatter 与英文正文取上游逐字，只动这四处；另有**两处有意保持上游原样**，覆盖上游文件后不要顺手删改（见「两侧不动」）。

## 改动 ① 核心原则旁注（产品视角）

**位置**：frontier 段（`Work the tree in **rounds**…`）之后、`Format a round like so:` 之前。

**改成什么**：插入下面这段中文引用。

```markdown
> **核心原则：把沟通对象当产品负责人，只聊业务结果，不谈代码实现。**
>
> - **视角落点**：只确认**用户能感知的行为**（页面表现、交互体验、业务流程），屏蔽底层工程细节（接口、依赖库、实现模块）。
> - **语言脱敏**：问题中杜绝代码片段、文件路径及未经解释的专业黑话，统一用业务语言交流。
> - **技术翻译**：若底层选型影响重大，先讲**"对用户有什么影响"**，再确认**"业务上怎么取舍"**。
> - **决策呈现**：提供选项时，做**"效果对效果"**的直观对比，并明确标注各自的代价（如上线时间、性能折损、维护成本）。
```

**为什么**：答题人是决策者、不是实现者——工程视角的问题产品负责人答不了，答案也支撑不了设计树上的决定。旁注放在格式块之前，模型组装问题时先读到这一视角。

## 改动 ② 格式块第二例中文化

**位置**：`Format a round like so:` 后的围栏块，只换第二例。

**改成什么**：

```
❓ **Q2** - **<问题标题>**：<问题正文，可能包含多个段落，写各选项共用的背景>

➡️ <你的推荐答案>
```

**为什么**：中文会话要拿到中文标签。占位符里上游的「包括多个选项」改成了「写各选项共用的背景」——那句占位符本身就在教模型把选项写进正文，与本地「选项只进 `options`」相抵。第一例与整块形制留在上游形制上，升级覆盖后只需补这一例。

## 改动 ③ 投递纪律旁注（一步投递 + 字段落位 + 选项只进 `options`）

**位置**：格式块之后。

**改成什么**：新增下面这段正文与引用。

```markdown
上面那段格式里的东西**直接进表单**，但**选项只写进 `options`**（格式块第一例里 `including multiple choices` 那句是上游原文的措辞，选项不要跟着进正文）：`question` 写标题加一句正文、`number` 写 Q 编号、`recommended` 标出你推荐的那一项（推荐项在用户没动过那题时**默认就是勾上的**，所以只标你真心会选的）。

- `detail` 写展开的多段正文，**只写各选项共用的背景**：把某个选项的代价或理由在正文里再讲一遍，宿主会当场拒收——正文里那一遍与你写进 `options` 的那一遍会一起出现在页面上（一遍带选择器、一遍不带）。
- 每个选项自己的取舍写进它自己的 `description`，选项之间的对比在选项区里就读得出来。

> **每一轮只投一次表单，不写散文预告**：
>
> - 不要用消息正文把问题再说一遍：直接调一次 `grilling_form`，整轮问题作为一张表单投在对话记录里。
> - 这是本轮**唯一且最后**的调用——它一发出本轮就结束，同批别的调用会把本轮撑开。
> - 用户在对话区的表单里勾选、自填，点「导入输入框」写进他自己的输入框，再用原生发送键发出；他的作答会作为**下一条用户消息**到达，不要等它、也不要把表单当成已经有答案。
```

**为什么**：`grilling_form` 发完就 `exec.concludeTurn()` 结束本轮——正文若再把问题写一遍，用户看到的是重复且不可点的文本；一步投递让问题只存在于表单里、答案只存在于用户的下一条消息里，轮次边界干净。字段对应写进正文（界面把 `question` 渲染成无 markdown、不吃换行的标题，`detail` 才走 markdown 正文块）；而格式块本身把选项写在题干里，模型照抄进 `detail` 就会让同一批选项在页面上出现两遍，宿主行的入参校验按行首与选项标签同形来认它并拒收，技能正文则从源头说清该往哪写。代价（明知并接受）：认「同形条目」认的是**行首**，且别名（后面可以空一格）必须紧跟「名：解释」那一类分隔符——顿号与逗号不算，所以「甲，详情…」这种半角逗号写法会漏放；误拒的代价是模型改一轮重投。

## 改动 ④ 收尾段改写（会话结束的判定）

**位置**：上游收尾段 `The session is done when the frontier is empty… Do not act on it…`。

**改成什么**：

```markdown
> **会话结束的判定需要同时满足**：
>
> - **The frontier is empty**: every branch of the design tree visited, nothing left silently assumed.
> - 本会话派遣过的**每一个子代理都已结算**——只要还有一个没回来，`frontier` 空了也不作数，不得当成最终共识、不得向用户确认或据此行动；先等它结算（结果可能推翻已定下来的决定、需要重开一部分树）。
>
> Do not act on it until the user confirms you have reached a shared understanding.
```

**为什么**：等子代理只压在**收口闸门**上——未结算就不认共识、不向用户确认、不据此行动；结果可能推翻已定的决定、需要重开一部分树。轮次层面（这一轮问谁、何时问）仍只由 frontier 定义与事实段支配，正文不带派遣 / 等待的轮次纪律。文字级软纪律、无闸门拦截。

## 两侧不动（上游逐字）

- **格式块第一例**：`❓ **Q1** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>` 与整块形制取上游逐字。`including multiple choices` 照旧在，而这块正是模型最可能整段照抄的样例——所以 ③ 的正文段额外点名了这句上游措辞，本块自己不加定位句。
- **`Finding _facts_` 段**：含 `Don't block on it: a running exploration is an unsettled prerequisite, so only the questions downstream of it wait for the sub-agent to report; ask the rest of the frontier now.` 保留上游原文。它说的是一轮**之内**的时序（不必等探索回来才继续问，只有依赖该探索结果的问题才等），与 ④ 的整场**收口闸门**各管一层，两句不冲突。

## 成品全文（51 行）

````markdown
---
name: grilling
description: Grill the user relentlessly about a plan, decision, or idea. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phrases.
---

Interview the user relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled: the questions you can ask _now_ without guessing at answers you haven't heard yet. Ask the whole frontier in one round: number each question and give your recommended answer. Then wait for the user's answers before the next round.

> **核心原则：把沟通对象当产品负责人，只聊业务结果，不谈代码实现。**
>
> - **视角落点**：只确认**用户能感知的行为**（页面表现、交互体验、业务流程），屏蔽底层工程细节（接口、依赖库、实现模块）。
> - **语言脱敏**：问题中杜绝代码片段、文件路径及未经解释的专业黑话，统一用业务语言交流。
> - **技术翻译**：若底层选型影响重大，先讲**"对用户有什么影响"**，再确认**"业务上怎么取舍"**。
> - **决策呈现**：提供选项时，做**"效果对效果"**的直观对比，并明确标注各自的代价（如上线时间、性能折损、维护成本）。

Format a round like so:

```
❓ **Q1** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>

---

❓ **Q2** - **<问题标题>**：<问题正文，可能包含多个段落，写各选项共用的背景>

➡️ <你的推荐答案>
```

上面那段格式里的东西**直接进表单**，但**选项只写进 `options`**（格式块第一例里 `including multiple choices` 那句是上游原文的措辞，选项不要跟着进正文）：`question` 写标题加一句正文、`number` 写 Q 编号、`recommended` 标出你推荐的那一项（推荐项在用户没动过那题时**默认就是勾上的**，所以只标你真心会选的）。

- `detail` 写展开的多段正文，**只写各选项共用的背景**：把某个选项的代价或理由在正文里再讲一遍，宿主会当场拒收——正文里那一遍与你写进 `options` 的那一遍会一起出现在页面上（一遍带选择器、一遍不带）。
- 每个选项自己的取舍写进它自己的 `description`，选项之间的对比在选项区里就读得出来。

> **每一轮只投一次表单，不写散文预告**：
>
> - 不要用消息正文把问题再说一遍：直接调一次 `grilling_form`，整轮问题作为一张表单投在对话记录里。
> - 这是本轮**唯一且最后**的调用——它一发出本轮就结束，同批别的调用会把本轮撑开。
> - 用户在对话区的表单里勾选、自填，点「导入输入框」写进他自己的输入框，再用原生发送键发出；他的作答会作为**下一条用户消息**到达，不要等它、也不要把表单当成已经有答案。

Each round the user answers reshapes the tree: settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a _later_ round, not this one.

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the environment (filesystem, tools, etc.), dispatch a sub-agent to find it; don't ask the user for anything you could look up yourself. Don't block on it: a running exploration is an unsettled prerequisite, so only the questions downstream of it wait for the sub-agent to report; ask the rest of the frontier now. The _decisions_ are the user's: put each to them and wait.

> **会话结束的判定需要同时满足**：
>
> - **The frontier is empty**: every branch of the design tree visited, nothing left silently assumed.
> - 本会话派遣过的**每一个子代理都已结算**——只要还有一个没回来，`frontier` 空了也不作数，不得当成最终共识、不得向用户确认或据此行动；先等它结算（结果可能推翻已定下来的决定、需要重开一部分树）。
>
> Do not act on it until the user confirms you have reached a shared understanding.
````

落点是 `.agents/skills/grilling`：该目录被 `.gitignore` 忽略、不入库；别对它跑 skills update——`skills-lock.json` 里 `grilling` 有 `computedHash`，改过就对不上，update 会把这份适配覆盖回上游正文。
