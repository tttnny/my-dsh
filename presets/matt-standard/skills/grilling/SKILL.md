---
name: grilling
description: Grill the user relentlessly about a plan, decision, or idea. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phrases.
---

Interview the user relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled: the questions you can ask _now_ without guessing at answers you haven't heard yet. Ask the whole frontier in one round: number each question and give your recommended answer. Then wait for the user's answers before the next round.

Format a round like so:

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

> **DSH delivery：** 每一轮分两步投递：先在消息文本里按上面的模板**以散文预告这一轮的全部问题**（标题、正文与选项），紧接着把**同一轮**作为**一次** `ask_user_grilling` 调用发出，让用户在表单中作答：
>
> - 散文预告与工具投递必须**同一轮、一一对应**：预告里列出的问题与选项，投递时就发这一套，不得漏问、也不得在表单里另起一套或换一轮。
> - 强制使用`ask_user_grilling`而不使用普通的 `ask_user_question` 工具。

Each round the user answers reshapes the tree: settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a _later_ round, not this one.

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the environment (filesystem, tools, etc.), dispatch a sub-agent to find it; don't ask the user for anything you could look up yourself. The _decisions_ are the user's: put each to them and wait.

> **Sub-agent rounds：** 一旦你在某轮派遣了子代理，先输出每个子代理的任务清单（各自要去查什么），然后**停**：不再调用任何其他工具、不提问、结束本回合。子代理的结算通知会自动唤醒你——不要轮询。等**全部**已派遣子代理结算后，再问 frontier（包括未受阻的问题）。后台有子代理运行时 `ask_user_grilling` 会硬拒绝（返回 `blocked: true`）——若被拒就结束回合等待，绝不在同一回合内重试。

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed. Do not act on it until the user confirms you have reached a shared understanding.
