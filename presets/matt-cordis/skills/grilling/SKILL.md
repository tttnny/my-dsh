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
Q1. **<question title>**: <question body, might be multiple paragraphs>

Options:
- A: <option A>
- B: <option B>
- C: <option C>

Recommended: <your recommended answer>

---

Q2. **<问题标题>**: <问题正文，可能包含多个段落>

选项:
- A: <选项 A>
- B: <选项 B>
- C: <选项 C>

推荐: <您的推荐答案>
```

> **每一轮分两步投递**：
>
> - 先在消息文本里**以散文预告这一轮的全部问题**（标题、正文、选项与推荐）。
> - 在**同一回合内**紧接着把**同一轮**作为**一次** `ask_user_grilling` 调用发出，让用户在表单中作答（散文预告与工具投递必须**同一轮、一一对应**）。

Each round the user answers reshapes the tree: settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a _later_ round, not this one.

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the environment (filesystem, tools, etc.), dispatch a sub-agent to find it; don't ask the user for anything you could look up yourself. The _decisions_ are the user's: put each to them and wait.

> **会话结束的判定需要同时满足**：
>
> - **The frontier is empty**: every branch of the design tree visited, nothing left silently assumed.
> - 本会话派遣过的**每一个子代理都已结算**——只要还有一个没回来，`frontier` 空了也不作数，不得当成最终共识、不得向用户确认或据此行动；先等它结算（结果可能推翻已定下来的决定、需要重开一部分树）。
>
> Do not act on it until the user confirms you have reached a shared understanding.
