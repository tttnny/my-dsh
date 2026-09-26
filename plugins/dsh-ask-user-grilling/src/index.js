import { defineTool } from "@deepseek-ai/dsh-tools";
import "@deepseek-ai/dsh-user-questions";
import { RESERVED_ID_PREFIX, ROUND_END_QUESTION, isBlank, mergeNumberIntoHeader } from "./contract.js";
import { normalizeOption } from "./recommendation.js";

/**
 * @lynn123411/dsh-ask-user-grilling — a presentation variant of the native
 * `ask_user_question` (`@deepseek-ai/dsh-tool-ask-user`). Same capability seam
 * (ctx.userQuestions), the same tool description and the same descriptions for
 * the shared parameters verbatim; only the rendered form differs.
 *
 * ask_user_grilling:
 *   - forces multi-select on every question — the schema offers no opt-out
 *   - merges the optional `number` into the header as "<number> · <header>",
 *     so a form page carries the same Q-number the round announced in prose;
 *     a header that already opens with that number is sent as it is
 *   - passes the optional `detail` through to the seam: the client renders it as
 *     markdown under the question, while the question itself is a plain heading
 *     with no markdown and no line breaks, so a multi-paragraph body belongs in
 *     `detail`
 *   - normalizes the recommendation marker into the one form the client renders,
 *     a trailing "（推荐）" on the label: an explicit `recommended` flag, or a
 *     loose marker at the end of the label or the description, is moved there —
 *     the client reads only the label and accepts only the bracketed suffix
 *   - appends a round-end supplement question; per-question supplement goes
 *     through the built-in custom input ("Type your answer" / "输入你的答案"),
 *     so no extra per-question option is added (it would duplicate that field)
 *   - rejects what the form cannot carry: a question id under the reserved
 *     `__grill_` prefix, a duplicate question id, a blank question text, a blank
 *     option label, or two options of one question that end up with the same
 *     label (the client keys selection by label, so a collision cannot be
 *     restored or even clicked apart)
 *
 * Two rows mount this module. The preset tool row registers the tool (the
 * default). The profile bundle row, inserted by this package's
 * `cordis.patch.yml`, exists only so the Web client serves `lib/client.js` —
 * the browser bundle is served for an enabled Loader entry, and a preset row is
 * a directly plugged subtree rather than a Loader entry, so the package must be
 * in `dsh.profile.bundles` for its card to reach the page. That row passes
 * `config.carrier: true` and registers nothing; without it the tool would also
 * become a root-layer tool, visible to agents on every other preset.
 */
const name = "tool-ask-user-grilling";
const inject = ["tools", "userQuestions"];

/** 载体行认这一个键，认到就整行什么都不注册（浏览器半边的 servable entry，见文件头）。 */
const CONFIG_KEY = "carrier";

/**
 * 读这一行的 config。未知键与错类型当场抛：拼错的载体行会静默多注册一个全局工具，
 * 那比启动失败难查得多。
 * @param {unknown} config - loader 交给插件行的 config。
 * @returns {{ carrier: boolean }} 归一化后的配置。
 */
function readConfig(config) {
  if (config === undefined || config === null) return { carrier: false };
  if (typeof config !== "object" || Array.isArray(config)) {
    throw new TypeError(`${name}: config must be an object with an optional boolean "${CONFIG_KEY}"`);
  }
  const unknown = Object.keys(config).filter((key) => key !== CONFIG_KEY);
  if (unknown.length > 0) {
    throw new TypeError(`${name}: unknown config key(s) ${unknown.map((key) => JSON.stringify(key)).join(", ")}; the only accepted key is "${CONFIG_KEY}"`);
  }
  if (config[CONFIG_KEY] !== undefined && typeof config[CONFIG_KEY] !== "boolean") {
    throw new TypeError(`${name}: config.${CONFIG_KEY} must be a boolean`);
  }
  return { carrier: config[CONFIG_KEY] === true };
}

function apply(ctx, config) {
  if (readConfig(config).carrier) return;
  ctx.tools.register(defineTool({
    name: "ask_user_grilling",
    description: "Ask the user a concise question when you need confirmation, a choice, or missing information before proceeding.",
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
            number: {
              type: "string",
              description: "Optional question number, e.g. \"Q2\". Rendered before the header as \"Q2 · <header>\"; use the same Q-number you announced in the message text.",
            },
            detail: {
              type: "string",
              description: "Optional supporting body for this question. Rendered as markdown under the question, so put multi-paragraph context here and keep question to the one line that asks.",
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
                  recommended: {
                    type: "boolean",
                    description: "Set true on the option you recommend (alternative to the \"(Recommended)\" label suffix).",
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
            description: "Validation violations when rejected.",
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
      // 1. input validation: only what the form cannot represent at all. Stem /
      //    option separation stays guidance, NOT enforced: substring matching
      //    would reject legitimate stems (e.g. a stem that naturally mentions an
      //    option name), so no stem check may refuse a round — a bad stem is
      //    preferable to a false rejection.
      const violations = [];
      const seenIds = new Set();
      args.questions.forEach((question, questionIndex) => {
        const where = `Question ${questionIndex + 1} (id ${JSON.stringify(question.id)})`;
        if (typeof question.id === "string" && question.id.startsWith(RESERVED_ID_PREFIX)) {
          violations.push(`${where} uses the reserved prefix ${RESERVED_ID_PREFIX} (owned by the round-end supplement question)`);
        }
        if (typeof question.id === "string") {
          if (seenIds.has(question.id)) violations.push(`${where} repeats an id already used in this round; ids must be unique because the answer is keyed by id`);
          seenIds.add(question.id);
        }
        if (isBlank(question.question)) {
          violations.push(`${where} has an empty question text; write the question itself in question and its body in detail`);
        }
        const seenLabels = new Set();
        (question.options ?? []).forEach((option, optionIndex) => {
          const label = normalizeOption(option).label;
          if (isBlank(label)) {
            violations.push(`${where}, option ${optionIndex + 1} has an empty label; every option needs a label the user can read and pick`);
            return;
          }
          if (seenLabels.has(label)) {
            violations.push(`${where} has two options that render with the same label ${JSON.stringify(label)}; the form identifies a choice by its label, so make them differ`);
            return;
          }
          seenLabels.add(label);
        });
      });
      if (violations.length > 0) {
        return {
          rejected: true,
          violations,
          error: `${violations.length} violation(s) in this round: ids must be unique and must not use the reserved ${RESERVED_ID_PREFIX} prefix, question text must not be blank, and the options of one question must not share a label. Fix them and call this tool again.`,
          answers: [],
        };
      }

      // 2. transform: force multi-select; merge the optional number into the
      //    header; hand detail to the field the client renders as markdown; move
      //    the recommendation marker to the label suffix the client renders;
      //    per-question supplement is via the built-in custom input ("Type your
      //    answer"/"输入你的答案") — no extra option is added to avoid
      //    duplication with that field
      const labelRestore = new Map();
      const questions = args.questions.map((question) => {
        const header = mergeNumberIntoHeader(question.number, question.header);
        const restore = new Map();
        const options = (question.options ?? []).map((option) => {
          const normalized = normalizeOption(option);
          if (normalized.label !== normalized.originalLabel) {
            restore.set(normalized.label, normalized.originalLabel);
          }
          return {
            label: normalized.label,
            ...(normalized.description !== undefined ? { description: normalized.description } : {}),
          };
        });
        labelRestore.set(question.id, restore);
        return {
          id: question.id,
          question: question.question,
          ...(header !== "" ? { header } : {}),
          ...(isBlank(question.detail) ? {} : { detail: question.detail }),
          options,
          multiSelect: true,
        };
      });

      // 3. round-end supplement question — single "无需补充" option; supplement is via custom input, so no "I have something to add" option (duplicates that field)
      questions.push({
        ...ROUND_END_QUESTION,
        options: ROUND_END_QUESTION.options.map((option) => ({ ...option })),
        multiSelect: true,
      });

      // 4. ask through the userQuestions seam (UI renders from the service)
      const answer = await ctx.userQuestions.ask({
        questions,
        ...(exec.agent !== undefined ? { agent: exec.agent } : {}),
        signal: exec.signal,
      });
      return {
        answers: answer.answers.map((entry) => {
          const restore = labelRestore.get(entry.id);
          return {
            id: entry.id,
            selected: entry.selected.map((label) => restore?.get(label) ?? label),
            ...(entry.custom !== undefined ? { custom: entry.custom } : {}),
          };
        }),
      };
    },
  }));
}

export { apply, inject, name };
