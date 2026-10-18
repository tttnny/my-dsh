import { defineTool } from '@deepseek-ai/dsh-tools';
import { FORM_GATE_UNIT, GATE_KEY, QUESTION_TYPES, pendingFormOf, validateRound } from './form-model.js';

/**
 * @lynn123411/dsh-grilling-form — grilling 轮的逐题拷问工具。
 *
 * grilling_form 与原生 ask_user_question（@deepseek-ai/dsh-tool-ask-user）是两件事，
 * 分工写在自我介绍里：原生那条走 ctx.userQuestions seam、在输入框上方接管作答面板、
 * 阻塞等答案，适合一次简单确认；这一条不出文本、不阻塞，把整轮问题作为一张**可交互表单**
 * 投在对话流的轮次尾部，自己立刻结束本轮。
 *
 * 一条调用做三件事：
 *   - 校验入参（见 validateRound）：空题干、空选项文字、同一题里去掉推荐标记后同文的两个选项
 *     命中即返回可修复的拒绝，且**不标记结束**，让模型改完重调；
 *   - 闸门：会话里已经有一张投出去还没等到作答的表时，再调一次会被拦下——不投出、不结束本轮，
 *     返回那段说明（旧表问了什么 + 要更新就带 replace: true 重发）。闸门状态是**会话投影**
 *     里的一个单元（FORM_GATE_UNIT），从会话事件增量折叠出来，执行时同步读；宿主半边不读
 *     会话的事件日志（那条路已封给新调用）。投影服务不在的组合里这一层退化成不拦，工具照常注册。
 *   - 通过校验与闸门就标记本轮结束（exec.concludeTurn()）——本轮到此为止，不再等答案；
 *     并返回一条说明：表单已展示、用户会在他自己的输入框里作答。
 *
 * 表单本身由浏览器半边画：它挂在对话流的**轮次尾部**（工具行必被折进这一轮的「工作过程」，
 * 住那儿就看不见），那条按 wire 工具名注册的 tool.call.toolview 行按结果画被拦下的说明。
 * 作答由用户点表单底部的「导入输入框」写进原生草稿、再用原生发送键发出；表单旁边的
 * 「从这里分叉」按本轮结束点开一条新会话。插件不碰输入框。
 *
 * 半边只有一条行：本包 cordis.patch.yml 里那条根层 - id: tool-grilling-form 插入行，
 * 由 dsh plugin --profile web add 随 dsh.profile.bundles 一起并进 profile 层栈。宿主半边在
 * 那条行下注册工具——行在 root 层，工具因此落进全局层，每一个 preset 的 agent 都看得见它；
 * 同一行又正好是 root loader entry，client-modules 据此服务本包的浏览器半边（lib/client.js）。
 * 这条行不需要 config：它既注册工具，又承载浏览器半边。
 */
const name = 'tool-grilling-form';
const inject = ['tools'];

/** 表单落库之后给模型的那段话：它必须知道本轮已经结束、答案会晚到、别当成已回答。
 * 那段作答格式与块里的行形一一对应（题号独占一行、每项一行带「- 」），
 * 这里写成别的形状就会把模型引到一条实际不存在的格式上。 */
const SHOWN_MESSAGE = "The form with this round's questions is now shown in the conversation and this turn has ended. The user has not answered yet: they answer in their own composer, and their answers arrive later as their next user message, one block per round — a line with just the question number (\"1.\") and then one \"- \" line per chosen option or typed text. Do not wait for it, do not treat this as an answer, and do not write the questions in prose as well.";

/**
 * 会话投影服务里本插件用到的那两件。投影契约发布在 @deepseek-ai/dsh-session-projection，
 * 本包只在自检里挂那个真货；宿主这边按**实际读到的成员**就地声明，与浏览器半边对平台服务的做法一致
 * （少声明一个不报错，那一处静默失效，所以只声明真的读到的那两个）。
 * @typedef {object} SessionProjectionService
 * @property {(definition: unknown) => (() => void)} register 注册一个投影单元。
 * @property {(session: unknown, key: string) => unknown} stateOf 读一个单元的当前状态。
 */

/**
 * 校验这一行的 config：唯一的装配形态就是注册工具（同时承载浏览器半边），所以它不收任何键。
 * 拼错的键当场抛，免得静默写出一个什么都不注册的行。
 * @param {unknown} config - loader 交给插件行的 config。
 * @returns {void}
 */
function assertNoConfig(config) {
  if (config === undefined || config === null) return;
  if (typeof config !== 'object' || Array.isArray(config)) {
    throw new TypeError(name + ': config must be an object');
  }
  const unknown = Object.keys(config);
  if (unknown.length > 0) {
    throw new TypeError(name + ': unknown config key(s) ' + unknown.map((key) => JSON.stringify(key)).join(', ') + '; this row takes no config');
  }
}

/**
 * 有一张待答的表挡在中间时给模型的那段话：把旧表问了什么抄给它，再给它两条出路——
 * 这就是它要做的判断（更新旧表还是另问），别让它自己猜。
 *
 * 抄题干而不是抄整张表单：它需要的是「刚才问了什么」，好决定这批问题是不是同一批。
 * @param {import('./form-model.js').FormCall} pending - 还在等作答的那张表。
 * @returns {string} 拦下时的说明。
 */
function gateMessage(pending) {
  const asked = pending.questions.map((question, index) => (index + 1) + '. ' + question).join(' ');
  return "An earlier form is still waiting for the user's answer, so this round was not shown. It asked: "
    + asked
    + ' If these questions replace it, call again with replace: true — the earlier form turns read-only. If they are additional, stop now and ask them after the user has answered; do not write them as prose.';
}

/**
 * 插件本体：宿主半边注册 grilling_form 工具，并把闸门那个会话投影单元挂上。浏览器半边与它同挂
 * 一条 root loader 行（见上面的说明），所以这里没有 config、也不注册别的东西。
 * @param {import('@deepseek-ai/cordis').Context} ctx - 宿主插件上下文（tools 由本行的 inject 声明）。
 * @param {unknown} config - loader 交给插件行的 config；这一行不收任何键。
 * @returns {void}
 */
function apply(ctx, config) {
  assertNoConfig(config);
  // 投影服务是可选项，所以走 ctx.inject：它比本插件晚挂上、或中途换了一份时，cordis 会重跑这段
  // 回调把单元重新注册上——照着 apply 那一刻取一次，晚到的服务会让闸门永远不生效。
  // 注册的收尾挂在这个子上下文上：本插件卸下时单元跟着退掉。
  ctx.inject(['sessionProjections'], (scoped) => {
    scoped.effect(() => {
      // 这段回调只在服务就位时跑，所以这里它的存在是确定的。
      const projections = /** @type {SessionProjectionService} */ (scoped.get('sessionProjections'));
      return projections.register(FORM_GATE_UNIT);
    });
  });
  /** 那张投出去还没等到作答的表；**每次执行现取**服务（与注册同一份判据），
   * 拿不到投影或拿不到会话时按没有算（闸门少一层，工具照常投）。
   * @param {{ agent?: { session?: unknown } }} exec - 执行上下文；只有会话那一件是这里要的。
   * @returns {import('./form-model.js').FormCall|null} 待答的那张表。 */
  const pendingForm = (exec) => {
    const session = exec.agent === undefined ? undefined : exec.agent.session;
    const projections = /** @type {SessionProjectionService|undefined} */ (ctx.get('sessionProjections'));
    if (session === undefined || projections === undefined || typeof projections.stateOf !== 'function') return null;
    return pendingFormOf(projections.stateOf(session, GATE_KEY));
  };
  ctx.tools.register(defineTool({
    name: 'grilling_form',
    description: "Put this round's questions to the user as a form, then end your turn. Make it the round's only tool call.",
    parameters: {
      questions: {
        type: 'array',
        required: true,
        description: "This round's questions, in order.",
        items: {
          type: 'object',
          additionalProperties: true,
          properties: {
            question: {
              type: 'string',
              required: true,
              description: 'The question text.',
            },
            detail: {
              type: 'string',
              description: 'Longer explanation of the question.',
            },
            type: {
              type: 'string',
              enum: [...QUESTION_TYPES],
              description: 'How the question is answered: single, multi, or free.',
            },
            options: {
              type: 'array',
              description: 'The choices. If you recommend one, put it first and end its label with （推荐）.',
              items: {
                type: 'object',
                additionalProperties: true,
                properties: {
                  label: {
                    type: 'string',
                    required: true,
                    description: 'The option text.',
                  },
                  detail: {
                    type: 'string',
                    description: 'Longer explanation of the option.',
                  },
                },
              },
            },
          },
        },
      },
      replace: {
        type: 'boolean',
        description: 'Whether this round replaces the earlier unanswered form.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: {
            type: 'boolean',
            description: 'Whether the form was shown.',
          },
          message: {
            type: 'string',
            description: 'What happened.',
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(args, exec) {
      // 1. 入参校验：只留表单表示不了的三件事（见 validateRound）。被拒的这一轮**不结束**——
      //    模型必须能当场改一改重投。说明就是那几条违规，一条一行。
      const violations = validateRound(args.questions);
      if (violations.length > 0) return { ok: false, message: violations.join('\n') };

      // 2. 闸门：已经有一张表在等用户作答时，不带 replace 的重调不投出、也不结束本轮。
      const pending = pendingForm(exec);
      if (pending !== null && args.replace !== true) return { ok: false, message: gateMessage(pending) };

      // 3. 表单这就进对话流，而工具本身再没有什么要等的：标记本轮结束。终点是「这批结果落库、
      //    下一步的收件箱空了」之后，所以描述里要求它必须是本轮唯一且最后的调用。
      exec.concludeTurn();
      return { ok: true, message: SHOWN_MESSAGE };
    },
  }));
}

export { apply, inject, name };
