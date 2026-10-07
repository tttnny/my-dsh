import { defineTool } from "@deepseek-ai/dsh-tools";
import { validateRound } from "./form-model.js";

/**
 * @lynn123411/dsh-grilling-form — grilling 轮的逐题盘问工具。
 *
 * grilling_form 与原生 ask_user_question（@deepseek-ai/dsh-tool-ask-user）是两件事，
 * 分工写在自我介绍里：原生那条走 ctx.userQuestions seam、在输入框上方接管作答面板、
 * 阻塞等答案，适合一次简单确认；这一条不出文本、不阻塞，把整轮问题作为一张**可交互表单**
 * 投在对话流的轮次尾部，自己立刻结束本轮。
 *
 * 一条调用只做三件事：
 *   - 校验入参（见 validateRound）：重复 id、空题干、空 label、同题归一化后重名 label，
 *     以及展开正文里把选项又列一遍（那会让页面上出现两遍选项，一遍带选择器一遍不带）
 *     命中即返回可修复的拒绝，且**不标记结束**，让模型改完重调；
 *   - 通过校验就标记本轮结束（exec.concludeTurn()）——本轮到此为止，不再等答案；
 *   - 返回一条 pending 声明：表单已展示、用户会在他自己的输入框里作答、那条发言随后作为
 *     下一条用户消息到达，别把它当成已回答、也别再写一遍题目。
 *
 * 表单本身由浏览器半边画：它挂在对话流的**轮次尾部**（工具行必被折进这一轮的「工作过程」，
 * 住那儿就看不见），那条按 wire 工具名注册的 `tool.call.toolview` 行只服务入参被拒的轮次。
 * 作答由用户点表单底部的「导入输入框」写进原生草稿、再用原生发送键发出；表单旁边的
 * 「从这里分叉」按本轮结束点开一条新会话。插件不碰输入框。
 *
 * 半边只有一条行：本包 `cordis.patch.yml` 里那条根层 `- id: tool-grilling-form` 插入行，
 * 由 `dsh plugin --profile web add` 随 dsh.profile.bundles 一起并进 profile 层栈。宿主半边在
 * 那条行下注册工具——行在 root 层，工具因此落进全局层，每一个 preset 的 agent 都看得见它；
 * 同一行又正好是 root loader entry，client-modules 据此服务本包的浏览器半边（`lib/client.js`）。
 * 这条行不需要 config：它既注册工具，又承载浏览器半边。
 */
const name = "tool-grilling-form";
const inject = ["tools"];

/** 表单落库之后给模型的那段话：它必须知道本轮已经结束、答案会晚到、别当成已回答。 */
const PENDING_MESSAGE = "The form with this round's questions is now shown in the conversation and this turn has ended. The user has not answered yet: they answer in their own composer, and their answers arrive later as their next user message, one line per answered question (\"<title>: <chosen options / typed text>\"). Do not wait for it, do not treat this as an answer, and do not write the questions in prose as well.";

/**
 * 这一行不接受 config：唯一的装配形态就是注册工具（同时承载浏览器半边）。
 * 拼错的键当场抛，免得静默写出一个什么都不注册的行。
 * @param {unknown} config - loader 交给插件行的 config。
 * @returns {void}
 */
function readConfig(config) {
  if (config === undefined || config === null) return;
  if (typeof config !== "object" || Array.isArray(config)) {
    throw new TypeError(`${name}: config must be an object`);
  }
  const unknown = Object.keys(config);
  if (unknown.length > 0) {
    throw new TypeError(`${name}: unknown config key(s) ${unknown.map((key) => JSON.stringify(key)).join(", ")}; this row takes no config`);
  }
}

function apply(ctx, config) {
  readConfig(config);
  ctx.tools.register(defineTool({
    name: "grilling_form",
    description: "Put this round's grilling questions to the user as a form in the conversation, then end your turn. The user answers it in their own composer and their answers arrive as their next user message. Use it only for a round of per-question grilling, and make it the only and final tool call of the round: it ends the turn, so anything else in the same batch keeps the turn open.",
    parameters: {
      questions: {
        type: "array",
        required: true,
        description: "The round's questions, in the order the user should read them.",
        items: {
          type: "object",
          additionalProperties: true,
          properties: {
            id: {
              type: "string",
              required: true,
              description: "Stable id for this question; the form keys the user's answer by it.",
            },
            question: {
              type: "string",
              required: true,
              description: "The specific question to ask the user. Keep it to the one line that asks; put any longer body in detail.",
            },
            header: {
              type: "string",
              description: "Optional short heading for the question, such as \"Confirm\" or \"Choose Mode\".",
            },
            number: {
              type: "string",
              description: "Optional question number, e.g. \"Q2\". The form renders it before the header as \"Q2 · <header>\".",
            },
            detail: {
              type: "string",
              description: "Optional supporting body for this question, rendered as markdown under the question. Use it only for what all the options share; a line that begins like one of the option labels is rejected, because the options would then be printed twice (once as prose, once as choices).",
            },
            options: {
              type: "array",
              description: "Optional choices the form shows for this question. If you recommend one, put it first and either append \"（推荐）\" to its label or set its recommended flag.",
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
                    description: "Set true on the option you recommend (alternative to appending \"（推荐）\" to its label). A recommended option is checked by default in the form, so mark only what you would pick yourself.",
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
            description: "True when input validation failed and no form was shown.",
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
          pending: {
            type: "boolean",
            description: "True when the form is displayed and this turn has ended; the user has not answered yet.",
          },
          message: {
            type: "string",
            description: "What this pending round means for you.",
          },
        },
      },
      render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }],
    },
    async execute(args, exec) {
      // 1. input validation: only what the form cannot represent at all. A rejected round is
      //    NOT concluded — the model must be able to fix it and call again this same turn.
      const violations = validateRound(args.questions);
      if (violations.length > 0) {
        return {
          rejected: true,
          violations,
          error: `${violations.length} violation(s) in this round: ids must be unique, question text must not be blank, and the options of one question must not share a label. Fix them and call this tool again.`,
        };
      }

      // 2. the form is now on its way into the transcript, and this tool has nothing left to
      //    wait for: mark the turn concluded. The end point is "after this batch's results are
      //    recorded and the next-step inbox is empty", which is why the description and the
      //    skill body both demand that this be the only and final call of the round.
      exec.concludeTurn();
      return { pending: true, message: PENDING_MESSAGE };
    },
  }));
}

export { apply, inject, name };
