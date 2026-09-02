---
name: grilling
description: Grill the user relentlessly about a plan, decision, or idea. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phrases.
---

Interview the user relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled: the questions you can ask _now_ without guessing at answers you haven't heard yet. Ask the whole frontier in one round: number each question and give your recommended answer. Then wait for the user's answers before the next round.

Format a round like so (plain-text markers, no emoji):

```
Q1. **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

Recommended: <your recommended answer>

---

Q2. **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

Recommended: <your recommended answer>
```

> **DSH delivery (local adaptation — keep when syncing from upstream):** the format above is the round's LOGICAL structure, never its delivery channel. Every round is delivered through the `ask_user_grilling` tool — this is mandatory, not a preference:
>
> - Send the WHOLE frontier as ONE `ask_user_grilling` call. Map the format element by element: the `Qn.` title → `header` (e.g. "Q1 — Priority"); question body → `question`; the A/B/C choices → `options`; the `Recommended:` answer → put that option FIRST and append "(Recommended)" to its label. A short facts preamble in the message text is fine (facts are your job — state what you found without asking); the QUESTIONS themselves never appear as prose.
> - Never use the plain `ask_user_question` tool for round questions, and never emit the `Qn.`/`Recommended:` round markdown as message text — the user would get unclickable prose and lose the form UI and the automatic round-end supplement.
> - Recovery: if you already emitted a prose round, do not apologize or rephrase in prose — immediately reissue the SAME round as ONE `ask_user_grilling` call with the mapping above.
> - In PTC presets (the model sees only `run_code`): deliver the round as `return await tools.ask_user_grilling({ questions: [...] })` inside a `run_code({ code, description })` program, with the program's own top-level `code` AND `description`; the same mapping applies.

Each round the user answers reshapes the tree: settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a _later_ round, not this one.

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the environment (filesystem, tools, etc.), dispatch a sub-agent to find it; don't ask the user for anything you could look up yourself. The _decisions_ are the user's: put each to them and wait.

> **Sub-agent rounds (local adaptation — overrides the upstream "don't block" guidance):** the moment you dispatch one or more sub-agents in a round, output each sub-agent's task list (what each one is going to find), then STOP: call no other tool, ask no question, and end your turn. Sub-agent settlement notifications wake you automatically — do not poll. Only after EVERY dispatched sub-agent has settled do you ask the frontier (including the questions that were not blocked). `ask_user_grilling` hard-refuses while background sub-agents are running (returns `blocked: true`) — if you are blocked, end your turn and wait; never retry within the same turn.

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed. Do not act on it until the user confirms you have reached a shared understanding.

> **Consensus → plan mode (local adaptation):** the moment the user confirms you have reached a shared understanding, call `enter_plan_mode` DIRECTLY (in PTC presets: `return await tools.enter_plan_mode()` inside a `run_code` program) — do not ask a separate "generate a plan or execute directly?" question, and do not start executing. Write the plan in plan mode and submit it with `exit_plan_mode`. The only exception: the user explicitly asked to skip the plan and execute directly.
