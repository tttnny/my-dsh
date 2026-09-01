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
 *   - appends a round-end supplement question (R3) — per-question supplement is
 *     via the built-in custom input ("Type your answer" / "输入你的答案"), no
 *     extra per-question "Supplement" option to avoid duplication with that
 *     field (see image.png issue: checkbox + input were redundant)
 *   - stem/option separation is guidance only — never rejects stems (R4
 *     relaxed: substring checks false-positive on legitimate stems)
 *
 * enter_plan_mode:
 *   - activates DSH plan mode for the current agent (planMode.set)
 */
const name = "tool-ask-user-grilling";
const inject = ["tools", "userQuestions"];

const ROUND_END_QUESTION = {
  id: "__grill_round_supplement__",
  question: "这轮还有什么要补充或调整的吗？",
  header: "轮末补充",
  options: [
    { label: "无需补充" },
  ],
  multiSelect: true,
};

function displayName(entry) {
  return entry.label ?? entry.id;
}

function apply(ctx) {
  ctx.tools.register(defineTool({
    name: "ask_user_grilling",
    description: "Ask the user a ROUND of grilling questions (decision-tree interview). Use ONLY for grilling rounds: the `grilling` skill (including its `grill-me` and `grill-with-docs` wrappers) and the grilling phases inside `triage`, `wayfinder` and `improve-codebase-architecture` — send ALL frontier questions of the current round in ONE call. Never use this tool for non-grilling questions: one-off selection/confirmation questions and the interview flows of `to-questionnaire` (its \"Grill the send\" interview is NOT a grilling round), `setup-matt-pocock-skills`, `wizard`, `teach`, `prototype`, `diagnosing-bugs`, `code-review`, `research` and the \"Quiz the user\" iteration of `to-tickets` keep using the plain ask_user_question tool — and so do the one-off questions inside `triage`, `wayfinder` and `improve-codebase-architecture` themselves (candidate picks, \"how they'd like to proceed\", bucket picks, brief-writing confirmations, spec-seam checks). Number each question in the round so the user can refer to it by number. For every question, give your recommended answer: put the option you recommend first and append \"(Recommended)\" to its label; if your recommendation is not an option (open question or synthesis), state it briefly in the question text. Multi-select is a form-level detail, not a design constraint: design each question as single- or multi-choice per its content, and single-choice questions are normal; the form always lets the user select one or more options, and conflicting multi-selections are resolved with one disambiguation question in the next round. The form is forced multi-select only because that is what surfaces the built-in custom input (\"Type your answer\" / \"输入你的答案\") for per-question supplements — never add your own \"Supplement\"/\"补充\" option to any question; the custom input covers that. A round-end supplement question (\"这轮还有什么要补充或调整的吗？\") with a single \"无需补充\" option is appended automatically to every round — never add your own catch-all/\"anything else?\" question; if its custom input contains new material, treat it as user input that reshapes the tree and ask a further round. The session is final only when the supplement is empty AND the user has confirmed shared understanding. If background subagents are running, this tool returns blocked — do NOT retry within the same turn: end your turn and wait; the settlement notice will wake you automatically, then call again. (While the gate is closed, this overrides the grilling skill's \"ask the rest of the frontier now\" guidance.) Keep the question stem to the question itself, without repeating option labels (style guidance only — stems are never rejected, and stems MAY carry the multi-paragraph context the question needs). The final plan-vs-execute confirmation after the last round is a one-off confirmation question — use the plain ask_user_question tool for it. Example of one round with two questions: questions: [{ id: 'q1', question: 'Which issue tracker?', options: [{ label: 'GitHub (Recommended)' }, { label: 'Local markdown' }] }, { id: 'q2', question: 'Any deadline?', options: [{ label: 'This week (Recommended)' }, { label: 'Next month' }] }].",
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
              description: "The question stem — option text belongs in options (style guidance, not enforced; stems may carry the multi-paragraph context the question needs).",
            },
            header: {
              type: "string",
              description: "Optional short heading, e.g. \"Q2 — Deadline\". Number each question in the round so the user can refer to it by number.",
            },
            options: {
              type: "array",
              description: "Choices to show the user. Mark the option you recommend by putting it first and appending \"(Recommended)\" to its label — every question gets one recommended answer.",
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
            description: "True when input validation failed and the round was not asked.",
          },
          violations: {
            type: "array",
            items: { type: "string" },
            description: "Validation violations when rejected (reserved id prefix only).",
          },
          error: {
            type: "string",
            description: "Human-readable error when blocked or rejected.",
          },
          answers: {
            type: "array",
            description: "One entry per question, in the order asked.",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                id: {
                  type: "string",
                  required: true,
                  description: "The question id you supplied.",
                },
                selected: {
                  type: "array",
                  required: true,
                  items: { type: "string" },
                  description: "Labels of the options the user picked (may be empty if skipped).",
                },
                custom: {
                  type: "string",
                  description: "Free text the user typed in the built-in custom input, if any.",
                },
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
            error: "Cannot confirm background subagent status (subagents query failed). End your turn and wait; call this tool again in a later turn.",
          };
        }
      }
      if (waiting.length > 0) {
        return {
          blocked: true,
          waiting,
          error: `Still ${waiting.length} subagent(s) running (${waiting.join(", ")}). End your turn and wait — the settlement notice will wake you automatically, then call again.`,
        };
      }

      // 2. input validation: reserved id prefix guard only (the round-end
      //    question owns __grill_). Stem/option separation (R4) is guidance,
      //    NOT enforced: substring matching rejected legitimate stems (e.g. a
      //    stem that naturally mentions an option name), so no stem check may
      //    refuse a round — a bad stem is preferable to a false rejection.
      const violations = [];
      for (const question of args.questions) {
        if (typeof question.id === "string" && question.id.startsWith("__grill_")) {
          violations.push(`Question id "${question.id}" uses the reserved prefix __grill_`);
        }
      }
      if (violations.length > 0) {
        return {
          rejected: true,
          violations,
          error: "Question ids must not use the reserved prefix __grill_ (reserved for the round-end supplement question). Fix the ids and call this tool again.",
        };
      }

      // 3. transform: force multi-select (R2); per-question supplement is via the built-in custom input ("Type your answer"/"输入你的答案") — no extra option is added to avoid duplication with that field
      const questions = args.questions.map((question) => ({
        id: question.id,
        question: question.question,
        ...(question.header !== undefined ? { header: question.header } : {}),
        options: [
          ...(question.options ?? []).map((option) => ({
            label: option.label,
            ...(option.description !== undefined ? { description: option.description } : {}),
          })),
        ],
        multiSelect: true,
      }));

      // 4. round-end supplement question (R3) — single "无需补充" option; supplement is via custom input, so no "I have something to add" option (duplicates that field)
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
    description: "Enter plan mode for the current agent. Call it ONLY after the final round of a grilling session, once the user has confirmed shared understanding AND you have asked them (with the plain ask_user_question tool) whether they want an execution plan or direct execution — call it only if they chose the plan; if they chose direct execution, skip it. Never call it mid-grilling or outside a grilling session. Plan mode ends via exit_plan_mode or the /plan off command.",
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
