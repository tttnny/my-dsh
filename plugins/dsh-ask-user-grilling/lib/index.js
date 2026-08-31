import { defineTool } from "@deepseek-ai/dsh-tools";
import "@deepseek-ai/dsh-user-questions";

/**
 * @lynn123411/dsh-ask-user-grilling — DSH delivery adaptations for grilling
 * rounds (mattpocock/skills). No skill file is modified; this package only
 * hardens how rounds are asked inside DSH.
 *
 * ask_user_grilling:
 *   - gate: refuses while background subagents are running (R1)
 *   - forces multi-select on every question (R2)
 *   - appends a per-question "✍️ 补充" option and a round-end question (R3)
 *   - rejects stems that contain option labels (R4)
 *
 * enter_plan_mode:
 *   - activates DSH plan mode for the current agent (planMode.set)
 */
const name = "tool-ask-user-grilling";
const inject = ["tools", "userQuestions"];

const SUPPLEMENT_OPTION = {
  label: "✍️ 补充",
  description: "勾选此项，并在回复中写下你对这个问题的补充。",
};

const ROUND_END_QUESTION = {
  id: "__grill_round_supplement__",
  question: "本轮还有什么要补充或调整的吗？",
  header: "本轮补充",
  options: [
    { label: "✓ 无补充" },
    { label: "✍️ 有补充（在回复中写明）", description: "勾选此项，并在回复中写下本轮的任何补充或调整。" },
  ],
  multiSelect: true,
};

function displayName(entry) {
  return entry.label ?? entry.id;
}

function apply(ctx) {
  ctx.tools.register(defineTool({
    name: "ask_user_grilling",
    description: "Ask the user a ROUND of grilling questions (decision-tree interview). Use for grilling sessions (grill-me / grill-with-docs / triage / wayfinder / architecture grilling): send ALL frontier questions of the current round in ONE call. The tool forces multi-select, appends a per-question '✍️ 补充' option, and appends a round-end supplement question automatically. If background subagents are running, this tool returns blocked — wait for them to finish, then call again. The question stem must contain ONLY the question itself; never repeat any option label inside the stem. Example of one round with two questions: questions: [{ id: 'q1', question: 'Which issue tracker?', options: [{ label: 'GitHub' }, { label: 'Local markdown' }] }, { id: 'q2', question: 'Any deadline?', options: [{ label: 'This week' }, { label: 'Next month' }] }].",
    parameters: {
      questions: {
        type: "array",
        required: true,
        description: "All frontier questions of the current round, each with a stable id, the question text (stem) and options.",
        items: {
          type: "object",
          additionalProperties: true,
          properties: {
            id: {
              type: "string",
              required: true,
              description: "Stable id for this question; echoed in the answer. Must NOT start with __grill_ (reserved prefix).",
            },
            question: {
              type: "string",
              required: true,
              description: "The question stem only — never include option text here.",
            },
            header: {
              type: "string",
              description: "Optional short heading for the question, such as \"Round 3\".",
            },
            options: {
              type: "array",
              description: "Choices to show the user. If you recommend one, put it first and append \"(Recommended)\" to that label.",
              items: {
                type: "object",
                additionalProperties: true,
                properties: {
                  label: {
                    type: "string",
                    required: true,
                    description: "Short user-facing option label.",
                  },
                  description: {
                    type: "string",
                    description: "One sentence explaining the tradeoff or impact.",
                  },
                },
              },
            },
          },
        },
      },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          blocked: {
            type: "boolean",
            description: "True when background subagents are running and the round was not asked.",
          },
          waiting: {
            type: "array",
            items: { type: "string" },
            description: "Running subagent display names when blocked.",
          },
          rejected: {
            type: "boolean",
            description: "True when the stem/option hygiene check failed and the round was not asked.",
          },
          violations: {
            type: "array",
            items: { type: "string" },
            description: "Stem/option violations when rejected.",
          },
          error: { type: "string" },
          answers: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                id: { type: "string", required: true },
                selected: { type: "array", required: true, items: { type: "string" } },
                custom: { type: "string" },
              },
            },
          },
        },
      },
      render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }],
    },
    async execute(args, exec) {
      // 1. gate: refuse while background subagents are running (R1)
      const subagents = ctx.get("subagents");
      const agent = exec.agent;
      const waiting = [];
      if (subagents !== undefined && agent !== undefined) {
        try {
          const entries = await subagents.listDescendants(agent.id, exec.signal);
          for (const entry of entries) {
            if (entry.kind === "child" && entry.activity === "running") waiting.push(displayName(entry));
          }
        } catch (error) {
          // Fail-closed: R1 says never enter the decision tree unless we know
          // no subagents are running. Only an aborted call (user cancelled)
          // propagates; any other listing failure blocks the round.
          if (exec.signal.aborted) throw error;
          console.error("ask_user_grilling: subagent listing failed: %o", error);
          return {
            blocked: true,
            waiting: [],
            error: "无法确认后台子代理状态（subagents 查询失败）。请稍后重新调用本工具。",
          };
        }
      }
      if (waiting.length > 0) {
        return {
          blocked: true,
          waiting,
          error: `后台仍有 ${waiting.length} 个子代理运行中（${waiting.join("、")}）。等待其全部完成后重新调用本工具。`,
        };
      }

      // 2. input validation on the ORIGINAL questions (R4): stem/option hygiene
      //    + reserved id prefix guard (the round-end question owns __grill_)
      const violations = [];
      for (const question of args.questions) {
        if (typeof question.id === "string" && question.id.startsWith("__grill_")) {
          violations.push(`问题 id「${question.id}」使用了保留前缀 __grill_`);
        }
        const stem = question.question ?? "";
        if (stem.includes(SUPPLEMENT_OPTION.label)) {
          violations.push(`题干「${stem}」包含保留选项「${SUPPLEMENT_OPTION.label}」`);
        }
        for (const option of question.options ?? []) {
          const label = option.label;
          if (typeof label === "string" && label.trim().length > 0 && stem.includes(label)) {
            violations.push(`题干「${stem}」包含选项「${label}」`);
          }
        }
      }
      if (violations.length > 0) {
        return {
          rejected: true,
          violations,
          error: "输入不符合要求：题干不得包含选项内容（选项只出现在选项列表里）；问题 id 不得使用保留前缀 __grill_。请修正后重新调用本工具。",
        };
      }

      // 3. transform: force multi-select (R2), append supplement option (R3)
      const questions = args.questions.map((question) => ({
        id: question.id,
        question: question.question,
        ...(question.header !== undefined ? { header: question.header } : {}),
        options: [
          ...(question.options ?? []).map((option) => ({
            label: option.label,
            ...(option.description !== undefined ? { description: option.description } : {}),
          })),
          SUPPLEMENT_OPTION,
        ],
        multiSelect: true,
      }));

      // 4. round-end supplement question (R3)
      questions.push(ROUND_END_QUESTION);

      // 5. ask through the userQuestions seam (UI renders from the service)
      const answer = await ctx.userQuestions.ask({
        questions,
        ...(exec.agent !== undefined ? { agent: exec.agent } : {}),
        signal: exec.signal,
      });
      return {
        answers: answer.answers.map((entry) => ({
          id: entry.id,
          selected: [...entry.selected],
          ...(entry.custom !== undefined ? { custom: entry.custom } : {}),
        })),
      };
    },
  }));

  ctx.tools.register(defineTool({
    name: "enter_plan_mode",
    description: "Enter plan mode for the current agent. Call it after the final round of a grilling session once the user has confirmed shared understanding, so a plan is written for review instead of executing directly. Plan mode ends via exit_plan_mode or the /plan off command.",
    parameters: {},
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          ok: { type: "boolean" },
          result: { type: "string" },
          error: { type: "string" },
        },
      },
      render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }],
    },
    async execute(_args, exec) {
      const planMode = ctx.get("planMode");
      if (planMode === undefined) return { ok: false, error: "planMode service unavailable" };
      const agent = exec.agent;
      if (agent === undefined) return { ok: false, error: "current agent unavailable" };
      const outcome = planMode.set(agent, true);
      // cancelled = an opposite pending selection was cleared and the logged
      // state already matches the requested active state — plan mode IS active.
      const ok = outcome === "committed" || outcome === "queued" || outcome === "cancelled" || outcome === "noop";
      return { ok, result: `plan mode ${outcome}` };
    },
  }));
}

export { apply, inject, name };
