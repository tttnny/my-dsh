import { createUserMessage } from '@deepseek-ai/dsh-llm';
import type { ContentBlock, ContextFormed } from '@deepseek-ai/dsh-llm';
import type { PreStepDecision } from '@deepseek-ai/dsh-agent';
import type { Session, UserMessage } from '@deepseek-ai/dsh-session';
import type { ToolExecution, ToolExecutionResult } from '@deepseek-ai/dsh-tools';
import type { Context } from '@deepseek-ai/cordis';

/**
 * 催办：模型连续多次根工具调用没有汇报时，在下一步之前注入一条提醒。
 *
 * 计数单位是**根调用**：原生模式下每次模型直接发起的调用各算一次，PTC 模式下
 * 只有 `run_code` 各算一次，程序内部的子调用不算——一个程序里的几十个子调用是
 * 同一个模型动作，算进去会让催办在一个程序之后就触发。
 *
 * 清零有四条路，计数键都是**会话**（`agent.session`）：
 * `notify_user` 无论根调用还是 PTC 子调用都清零，与计数单位无关；助手消息里写了
 * 散文正文也清零（开关见 `resetOnProse`）；新回合（`step === 1`）或用户插话也清零
 * ——回合边界取宿主给的 `step`，不按消息来源枚举。
 *
 * 会话关掉主动汇报时（`readEnabled` 为假）不催，计数也一并清零：重新打开时从零
 * 开始算，不会一开就催。
 *
 * 注入走 `agent/pre-step` 的 `enter.messages`：消息落进该步的 user 批次并被日志
 * 记录，来源不是 `user`，所以对话流里画成一行 context 而不是用户发言。
 */

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'notify-user-nudge': { kind: 'notify-user-nudge' } & ContextFormed;
  }
}

/** 注入消息的来源标记；`form: 'notice'` 让它在对话流里只占一行。 */
const NUDGE_SOURCE = { kind: 'notify-user-nudge' } as const;

/**
 * 催办正文：只给指令，不替模型写更新。
 * @param count - 距上次汇报的根工具调用次数。
 * @returns 注入给模型的那段话。
 */
export function renderNudge(count: number): string {
  return `You have gone ${String(count)} tool calls without a notify_user update — the user has seen no progress from you since. `
    + 'Send one now: a one-line title with what you have concluded so far, and a structured, chat-style message '
    + '(a well structured paragraph with a few bullet points, under ~1000 characters) with the details and what you will do next, '
    + 'batched with your next tool calls.';
}

/**
 * 一条助手消息里有没有散文。
 *
 * 只认非空白的 `text` 块：`reasoning` 是思考过程，不上屏，不算汇报。
 * @param content - 助手消息的内容块。
 * @returns 有可见正文时为真。
 */
export function hasProse(content: readonly ContentBlock[]): boolean {
  return content.some(block => block.type === 'text' && block.text.trim() !== '');
}

/** 一行摘要：context 行折叠时显示的那句。 */
export function nudgeSummary(count: number): string {
  return `${String(count)} tool calls without a notify_user update`;
}

/** 每个会话的催办状态机；纯内存，不碰 cordis。 */
export interface NudgeController {
  /** 模型汇报过了：清零。 */
  notify(session: Session): void;
  /** 模型写了一段散文回复：开关打开时清零。 */
  prose(session: Session): void;
  /** 一次根工具调用：计数 +1。 */
  toolCall(session: Session): void;
  /**
   * 一步开始前问一次要不要催。
   * @param session - 这一步所属的会话。
   * @param freshInput - 这一步是否重新计时：新回合的第一步，或收件箱里有用户插话。
   * @returns 要注入的消息；不催时 `null`。
   */
  step(session: Session, freshInput: boolean): UserMessage | null;
}

/** 造一个催办状态机要现读的三件事。 */
export interface NudgeOptions {
  /** 现读阈值；0 表示关闭。 */
  readThreshold: () => number;
  /** 现读「散文回复算不算汇报」。 */
  readProseResets: () => boolean;
  /** 现读这个会话是否开启主动汇报。 */
  readEnabled: (session: Session) => boolean;
}

/**
 * 造一个催办状态机。
 * @param options - 阈值与散文开关的现读函数。
 * @returns 状态机。
 */
export function createNudgeController(options: NudgeOptions): NudgeController {
  const counts = new WeakMap<Session, number>();

  return {
    notify(session) {
      counts.set(session, 0);
    },
    prose(session) {
      if (!options.readProseResets()) return;
      counts.set(session, 0);
    },
    toolCall(session) {
      counts.set(session, (counts.get(session) ?? 0) + 1);
    },
    step(session, freshInput) {
      // 关掉的会话不催，也不留计数：重新打开时从零开始，不会一开就催。
      if (!options.readEnabled(session)) {
        counts.set(session, 0);
        return null;
      }
      const threshold = options.readThreshold();
      if (freshInput || threshold <= 0) {
        counts.set(session, 0);
        return null;
      }
      const count = counts.get(session) ?? 0;
      if (count < threshold) return null;
      counts.set(session, 0);
      return createUserMessage({
        content: [{ type: 'text', text: renderNudge(count) }],
        source: { ...NUDGE_SOURCE, form: 'notice', summary: nudgeSummary(count) },
      });
    },
  };
}

/**
 * 判断一个会话是不是子代理的。
 * @param session - 待判定的会话。
 * @returns 子代理会话为真。
 */
function isSubagentSession(session: Session): boolean {
  return session.header.origin === 'subagent';
}

/**
 * 把状态机接到宿主的三条事件上。
 *
 * `tools/result` 是纯观察事件（无 `next`），只在结果落定后读一次：`notify_user` 清零，
 * 其余**根调用**计数。派发前就被取消的调用（`ABORTED_BEFORE_DISPATCH`）没真正执行，
 * 与旧口径一致、不计数。
 * `session/event` 是落盘后的 append 广播：`assistant/message` 带非空白正文时清零。
 * 失败、重试、取消的尝试落成 `assistant/attempt`，用户看不到，不清零。
 * `agent/pre-step` 在委托下游之后，只往 `enter` 决策的消息列表末尾追加一条；
 * 新回合与用户插话在这里清零。
 * @param ctx - 宿主插件上下文。
 * @param controller - 催办状态机。
 * @param toolName - 汇报工具的名字；结果事件里出现它时清零。
 */
export function installNudge(ctx: Context, controller: NudgeController, toolName: string): void {
  ctx.on('tools/result', (exec: Readonly<ToolExecution>, result: Readonly<ToolExecutionResult>): undefined => {
    // 取消发生在派发前：这次调用没有真正执行，不当作一次「没汇报的工具调用」。
    if (result.isError && result.error.info?.code === 'ABORTED_BEFORE_DISPATCH') return undefined;
    const session = exec.agent?.session;
    if (session !== undefined && !isSubagentSession(session)) {
      if (exec.name === toolName) controller.notify(session);
      else if (exec.parent === undefined) controller.toolCall(session);
    }
    return undefined;
  });

  ctx.on('session/event', (session, event): void => {
    if (isSubagentSession(session)) return;
    if (event.type !== 'assistant/message') return;
    if (!hasProse(event.data.message.content)) return;
    controller.prose(session);
  });

  ctx.on('agent/pre-step', async ({ agent, messages, step }, next): Promise<PreStepDecision> => {
    if (isSubagentSession(agent.session)) return next();
    const downstream = await next();
    // 只在真正进入这一步之后才动状态机：下游 reject 时这一步不成立，
    // 先清零会把这次催办吞掉。
    if (downstream.kind !== 'enter') return downstream;
    // 回合边界取宿主给的 `step`：第一步就是新回合，不论它由用户、定时提醒、
    // 队友消息还是 webhook 触发。用户插话（steer）落在回合中途，按来源单独认。
    const freshInput = step === 1 || messages.some((message) => message.source.kind === 'user');
    const notice = controller.step(agent.session, freshInput);
    if (notice === null) return downstream;
    return { ...downstream, messages: [...downstream.messages, notice] };
  });
}
