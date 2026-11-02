import { createUserMessage } from '@deepseek-ai/dsh-llm';
import type { ContextFormed } from '@deepseek-ai/dsh-llm';
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent';
import type { UserMessage } from '@deepseek-ai/dsh-session';
import type { PostToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools';
import type { Context } from '@deepseek-ai/cordis';

/**
 * 催办：模型连续多次根工具调用没有汇报时，在下一步之前注入一条提醒。
 *
 * 计数单位是**根调用**：原生模式下每次模型直接发起的调用各算一次，PTC 模式下
 * 只有 `run_code` 各算一次，程序内部的子调用不算——一个程序里的几十个子调用是
 * 同一个模型动作，算进去会让催办在一个程序之后就触发。
 *
 * `notify_user` 无论根调用还是 PTC 子调用都清零，与计数单位无关。
 *
 * 注入走 `agent/pre-step` 的 `enter.messages`：消息落进该步的 user 批次并被日志
 * 记录，来源不是 `user`，所以对话流里画成一行 context 而不是用户发言。
 */

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'notify-user-nudge': { kind: 'notify-user-nudge' } & ContextFormed;
  }
}

/** 汇报工具的名字：与 `src/index.ts` 注册的那条一致。 */
export const NUDGE_TOOL_NAME = 'notify_user';

/** 注入消息的来源标记；`form: 'notice'` 让它在对话流里只占一行。 */
const NUDGE_SOURCE = { kind: 'notify-user-nudge' } as const;

/**
 * 催办正文：只给指令，不替模型写更新。
 * @param count - 距上次汇报的根工具调用次数。
 * @returns 注入给模型的那段话。
 */
export function renderNudge(count: number): string {
  return `You have gone ${String(count)} tool calls without a notify_user update — the user has seen no progress from you since. `
    + 'Send one now: a one-line title with what you have concluded so far, and a short structured message '
    + '(one paragraph plus a few bullet points, under ~1000 characters) with the details and what you will do next. '
    + 'Call it together with your next tool call.';
}

/** 一行摘要：context 行折叠时显示的那句。 */
export function nudgeSummary(count: number): string {
  return `${String(count)} tool calls without a notify_user update`;
}

/** 每个 agent 的催办状态机；纯内存，不碰 cordis。 */
export interface NudgeController {
  /** 模型汇报过了：清零。 */
  notify(agent: object): void;
  /** 一次根工具调用：计数 +1。 */
  toolCall(agent: object): void;
  /**
   * 一步开始前问一次要不要催。
   * @param agent - 这一步的 agent。
   * @param hasUserMessage - 这一步的收件箱里有没有用户消息（新回合或用户插话）。
   * @returns 要注入的消息；不催时 `null`。
   */
  step(agent: object, hasUserMessage: boolean): UserMessage | null;
}

/**
 * 造一个催办状态机。
 * @param readThreshold - 现读阈值；0 表示关闭。
 * @returns 状态机。
 */
export function createNudgeController(readThreshold: () => number): NudgeController {
  const counts = new WeakMap<object, number>();

  return {
    notify(agent) {
      counts.set(agent, 0);
    },
    toolCall(agent) {
      counts.set(agent, (counts.get(agent) ?? 0) + 1);
    },
    step(agent, hasUserMessage) {
      const threshold = readThreshold();
      if (hasUserMessage || threshold <= 0) {
        counts.set(agent, 0);
        return null;
      }
      const count = counts.get(agent) ?? 0;
      if (count < threshold) return null;
      counts.set(agent, 0);
      return createUserMessage({
        content: [{ type: 'text', text: renderNudge(count) }],
        source: { ...NUDGE_SOURCE, form: 'notice', summary: nudgeSummary(count) },
      });
    },
  };
}

/**
 * 判断一个 agent 是不是子代理。
 * @param agent - 待判定的 agent。
 * @returns 子代理会话为真。
 */
export function isSubagent(agent: Agent): boolean {
  return agent.session.header.origin === 'subagent';
}

/**
 * 把状态机接到宿主的两条事件上。
 *
 * `tools/post-execute` 只观察、不改结果：`notify_user` 清零，其余**根调用**计数。
 * `agent/pre-step` 在委托下游之后，只往 `enter` 决策的消息列表末尾追加一条。
 * @param ctx - 宿主插件上下文。
 * @param controller - 催办状态机。
 */
export function installNudge(ctx: Context, controller: NudgeController): void {
  ctx.on('tools/post-execute', (exec: ToolExecution, _result, next): Promise<PostToolDecision> => {
    const agent = exec.agent;
    if (agent !== undefined && !isSubagent(agent)) {
      if (exec.name === NUDGE_TOOL_NAME) controller.notify(agent);
      else if (exec.parent === undefined) controller.toolCall(agent);
    }
    return next();
  });

  ctx.on('agent/pre-step', async ({ agent, messages }, next): Promise<PreStepDecision> => {
    if (isSubagent(agent)) return next();
    const downstream = await next();
    // 只在真正进入这一步之后才动状态机：下游 reject 时这一步不成立，
    // 先清零会把这次催办吞掉。
    if (downstream.kind !== 'enter') return downstream;
    const notice = controller.step(agent, messages.some((message) => message.source.kind === 'user'));
    if (notice === null) return downstream;
    return { ...downstream, messages: [...downstream.messages, notice] };
  });
}
