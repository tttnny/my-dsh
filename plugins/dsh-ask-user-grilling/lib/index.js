import { defineTool } from "@deepseek-ai/dsh-tools";
import "@deepseek-ai/dsh-user-questions";

/**
 * @lynn123411/dsh-ask-user-grilling — a presentation variant of the native
 * `ask_user_question` (`@deepseek-ai/dsh-tool-ask-user`). Same capability seam
 * (ctx.userQuestions) and the same tool/parameter descriptions verbatim; only
 * the rendered form differs.
 *
 * ask_user_grilling:
 *   - forces multi-select on every question — the schema offers no opt-out
 *   - appends a round-end supplement question; per-question supplement goes
 *     through the built-in custom input ("Type your answer" / "输入你的答案"),
 *     so no extra per-question option is added (it would duplicate that field)
 *   - rejects question ids using the reserved `__grill_` prefix, so the
 *     auto-appended question can never be shadowed
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

function apply(ctx) {
  ctx.tools.register(defineTool({
    name: "ask_user_grilling",
    description: "Ask the user a concise question when you need confirmation, a choice, or missing information before proceeding. Send one or more questions, each with a stable id that will be echoed in the answer.",
    parameters: {
      questions: {
        type: "array",
        required: true,
        description: "Questions to ask the user before continuing.",
        items: {
          type: "object",
          additionalProperties: true,
          properties: {
            id: {
              type: "string",
              required: true,
              description: "Stable id for this question; echoed in the answer.",
            },
            question: {
              type: "string",
              required: true,
              description: "The specific question to ask the user.",
            },
            header: {
              type: "string",
              description: "Optional short heading for the question, such as \"Confirm\" or \"Choose Mode\".",
            },
            options: {
              type: "array",
              description: "Optional choices to show the user. If you recommend one, put it first and append \"(Recommended)\" to that label.",
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
            description: "Human-readable error when rejected.",
          },
          answers: {
            type: "array",
            required: true,
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
                  description: "User-typed free text for this question, if any.",
                },
              },
            },
          },
        },
      },
      render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }],
    },
    async execute(args, exec) {
      // 1. input validation: reserved id prefix guard only (the round-end
      //    question owns __grill_). Stem/option separation is guidance, NOT
      //    enforced: substring matching would reject legitimate stems (e.g. a
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

      // 2. transform: force multi-select; per-question supplement is via the built-in custom input ("Type your answer"/"输入你的答案") — no extra option is added to avoid duplication with that field
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

      // 3. round-end supplement question — single "无需补充" option; supplement is via custom input, so no "I have something to add" option (duplicates that field)
      questions.push({
        ...ROUND_END_QUESTION,
        options: ROUND_END_QUESTION.options.map((option) => ({ ...option })),
      });

      // 4. ask through the userQuestions seam (UI renders from the service)
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
}

export { apply, inject, name };
