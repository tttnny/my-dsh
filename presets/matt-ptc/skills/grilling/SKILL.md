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
> - 不要用消息正文把问题再说一遍：在 `run_code` 程序内用一次 `return await tools.grilling_form({ questions: [...] })` 把整轮问题投成对话里的表单。
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
