import { defineTool } from "@deepseek-ai/dsh-tools";
import { validateRound } from "./form-model.js";

/**
 * @lynn123411/dsh-ask-user-grilling — grilling 轮的逐题盘问工具。
 *
 * grilling_form 与原生 ask_user_question（@deepseek-ai/dsh-tool-ask-user）是两件事，
 * 分工写在自我介绍里：原生那条走 ctx.userQuestions seam、在输入框上方接管作答面板、
 * 阻塞等答案，适合一次简单确认；这一条不出文本、不阻塞，把整轮问题作为一张**可交互表单**
 * 投在对话记录的那条工具行里，自己立刻结束本轮。
 *
 * 一条调用只做三件事：
 *   - 校验入参（见 validateRound）：重复 id、空题干、空 label、同题归一化后重名 label，
 *     以及展开正文里把选项又列一遍（那会让页面上出现两遍选项，一遍带选择器一遍不带）
 *     命中即返回可修复的拒绝，且**不标记结束**，让模型改完重调；
 *   - 通过校验就标记本轮结束（exec.concludeTurn()）——本轮到此为止，不再等答案；
 *   - 返回一条 pending 声明：表单已展示、用户会在他自己的输入框里作答、那条发言随后作为
 *     下一条用户消息到达，别把它当成已回答、也别再写一遍题目。
 *
 * 表单本身由浏览器半边画（对话记录里按 wire 工具名注册的 tool.call.toolview 行），
 * 作答由用户点表单底部的「导入输入框」写进原生草稿、再用原生发送键发出。插件不碰输入框。
 *
 * 两条行挂同一个模块。preset 工具行注册工具（默认）。profile bundle 行由本包的
 * `cordis.patch.yml` 插入，只为让 Web client 服务 `lib/client.js`——浏览器 bundle 只对
 * enabled Loader entry 服务，而 preset 行是直接挂的子树；那条行传 `config.carrier: true`，
 * 什么都不注册，否则工具会以 root layer 身份对每一个 preset 的 agent 可见。
 */
const name = "tool-grilling-form";
const inject = ["tools"];

/** 载体行认这一个键，认到就整行什么都不注册（浏览器半边的 servable entry，见文件头）。 */
const CONFIG_KEY = "carrier";

/** 表单落库之后给模型的那段话：它必须知道本轮已经结束、答案会晚到、别当成已回答。 */
const PENDING_MESSAGE = "The form with this round's questions is now shown in the conversation and this turn has ended. The user has not answered yet: they answer in their own composer, and their answers arrive later as their next user message, one line per answered question (\"<title>: <chosen options / typed text>\"). Do not wait for it, do not treat this as an answer, and do not write the questions in prose as well.";

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
