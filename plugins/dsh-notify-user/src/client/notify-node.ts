/**
 * notify_user 的对话节点定义：每次汇报在对话流里是一个声明了过程位置的节点。
 *
 * 位置写 `process`：节点站在步骤组外，客户端分组逻辑遇到它就结束当前组，
 * 于是两次汇报之间的工具调用各自成组，卡片本身不会被折进组里。
 *
 * 成功汇报用 `exclusive` 认领，免得进度卡旁再出现一条工具行。PTC 的失败结果也交给
 * 宿主通用定义，它可以把错误直接挂到父调用上。
 * 结果事件不带工具名，只能按调用事件记下的 callId 认领；装配器按 seq 顺序喂事件，
 * 结果到达时调用一定已经记下。这张表跨会话共用，按调用上限淘汰最早记下的一条。
 */

import type {
  ConversationMatch, ConversationMatchResult, ConversationNodeContext, ConversationNodeDefinition,
  ConversationStartMatch,
} from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { ChatNode } from '@deepseek-ai/dsh-client-ui-chat/client';
import { NOTIFY_TOOL_NAME } from '../shared/config.js';
import { failureOf, parseArgs, parseUpdate, type NotifyCardData, type Update } from './row-model.js';

/** 节点 kind，同时是 `conversation.chat.node` 座位的 key。 */
export const NOTIFY_NODE_KIND = 'notify-user';

/** 记住的调用上限；结果事件到达时调用一定已经记下，超出上限按最早记下的淘汰。 */
const MAX_REMEMBERED_CALLS = 4096;

/** 定义的状态：卡片数据加上节点的落点。 */
interface NotifyNodeState extends NotifyCardData {
  /** 持久事件的位置；只有流式事件时没有，此时不出节点。 */
  readonly anchorSeq?: number;
  /** 宿主接手 PTC 错误时，已发布过的节点必须按同一个 key 转成隐藏。 */
  readonly useNativeError?: true;
}

declare module '@deepseek-ai/dsh-client-ui-chat/client' {
  interface ChatNodeDataMap {
    /** 一次 notify_user 汇报。 */
    'notify-user': NotifyCardData;
  }
}

/**
 * 把一份汇报内容写进状态；标题缺省时不写这个键。
 * @param update - 汇报内容。
 * @param time - 事件时间。
 * @param settled - 调用是否已有结果。
 * @param anchorSeq - 持久事件的位置。
 * @returns 新状态。
 */
function stateOf(update: Update | null, time: number, settled: boolean, anchorSeq: number): NotifyNodeState {
  return {
    ...update === null ? { message: '' } : update,
    time,
    settled,
    anchorSeq,
  };
}

/**
 * 结果落定后的状态：meta 是权威内容；没有 meta（旧日志）时保留调用参数里读到的那份。
 * @param current - 落定前的状态。
 * @param update - 结果事件里读到的内容。
 * @returns 新状态。
 */
function settledState(current: NotifyNodeState, update: Update | null): NotifyNodeState {
  return {
    ...update ?? current,
    time: current.time,
    settled: true,
    ...current.anchorSeq === undefined ? {} : { anchorSeq: current.anchorSeq },
  };
}

/** 直接调用的结果足以判定失败；失败时忽略原先的汇报标题和正文。 */
function rootResultState(
  event: Extract<ConversationMatch['event'], { type: 'tool/result' }>,
  current?: NotifyNodeState,
): NotifyNodeState {
  if (event.data.message.isError) {
    return {
      ...stateOf(null, current?.time ?? event.time, true, current?.anchorSeq ?? event.seq),
      failure: failureOf(event.data.message.content, event.data.error),
    };
  }
  const update = parseUpdate(event.data.meta);
  return current === undefined ? stateOf(update, event.time, true, event.seq) : settledState(current, update);
}

/**
 * 结果先到的上下文（窗口从调用中间开始加载）没有 start，状态只能从结果事件补。
 * @param context - 当前上下文。
 * @returns 补出来的状态；读不到结果时 undefined。
 */
function fallbackState(context: ConversationNodeContext<NotifyNodeState>): NotifyNodeState | undefined {
  for (let index = context.matches.length - 1; index >= 0; index -= 1) {
    const event = context.matches[index].event;
    if (event.type === 'tool/result') return rootResultState(event);
    if (event.type === 'tool/ptc-dispatch') {
      if (event.data.isError) return undefined;
      return {
        ...parseUpdate(event.data.meta) ?? parseUpdate(event.data.arguments) ?? { message: '' },
        time: event.time,
        settled: true,
        anchorSeq: event.seq,
      };
    }
  }
  return undefined;
}

/**
 * 造一份定义。每份定义自带一张「见过的汇报调用」表，装配器按 seq 顺序喂事件，
 * 所以结果事件到达时调用一定已经记下。
 * @returns 可注册的对话节点定义。
 */
export function createNotifyDefinition(): ConversationNodeDefinition<NotifyNodeState> {
  const calls = new Set<string>();

  return {
    kind: NOTIFY_NODE_KIND,
    target: 'chat',

    match(event): ConversationMatchResult | null {
      switch (event.type) {
        case 'tool/call': {
          if (event.data.name !== NOTIFY_TOOL_NAME) return null;
          const callId = String(event.data.callId);
          if (calls.size >= MAX_REMEMBERED_CALLS) {
            const oldest = calls.values().next().value;
            if (oldest !== undefined) calls.delete(oldest);
          }
          calls.add(callId);
          return { id: callId, role: 'start', exclusive: true };
        }
        case 'tool/result': {
          if (event.surfaceOp !== 'append') return null;
          const callId = String(event.data.message.source.callId);
          return calls.has(callId) ? { id: callId, role: 'update', exclusive: true } : null;
        }
        case 'assistant/live-chunk': {
          const chunk = event.data.chunk;
          if (chunk.type === 'block-end' && chunk.block.type === 'tool-call' && chunk.block.name === NOTIFY_TOOL_NAME) {
            return { id: String(chunk.block.id), role: 'start', exclusive: true };
          }
          if (chunk.type === 'tool-call-delta' && chunk.name === NOTIFY_TOOL_NAME) {
            return { id: String(chunk.id), role: 'start', exclusive: true };
          }
          return null;
        }
        case 'tool/ptc-dispatch-start':
        case 'tool/ptc-dispatch': {
          if (event.data.name !== NOTIFY_TOOL_NAME) return null;
          if (event.type === 'tool/ptc-dispatch' && event.data.isError) {
            // PTC 结果本身有名字与父调用 id，宿主无需看到子调用开始事件就能画错误行。
            return { id: String(event.data.subCallId), role: 'update' };
          }
          return {
            id: String(event.data.subCallId),
            role: event.type === 'tool/ptc-dispatch-start' ? 'start' : 'update',
            exclusive: true,
          };
        }
        default:
          return null;
      }
    },

    start(_context: ConversationNodeContext<NotifyNodeState>, match: ConversationStartMatch): NotifyNodeState {
      const event = match.event;
      if (event.type === 'tool/call') return stateOf(parseArgs(event.data.arguments), event.time, false, event.seq);
      if (event.type === 'tool/ptc-dispatch-start') {
        return stateOf(parseUpdate(event.data.arguments), event.time, false, event.seq);
      }
      // 流式事件只用来占住 id，等持久调用事件到达后再出节点。
      return { message: '', time: event.time, settled: false };
    },

    update(
      context: ConversationNodeContext<NotifyNodeState> & { readonly state: NotifyNodeState },
      match: ConversationMatch,
    ): NotifyNodeState {
      const event = match.event;
      const current = context.state;
      if (event.type === 'tool/call') {
        return stateOf(parseArgs(event.data.arguments) ?? { message: current.message }, event.time, current.settled, event.seq);
      }
      if (event.type === 'tool/result') return rootResultState(event, current);
      if (event.type === 'tool/ptc-dispatch') {
        if (event.data.isError) return { ...current, useNativeError: true };
        return settledState(current, parseUpdate(event.data.meta) ?? parseUpdate(event.data.arguments));
      }
      return current;
    },

    buildViewNode(context: ConversationNodeContext<NotifyNodeState>): ChatNode<'notify-user'> | null {
      const state = context.state ?? fallbackState(context);
      if (state === undefined || state.anchorSeq === undefined) return null;
      const node: ChatNode<'notify-user'> = {
        key: context.key,
        id: context.id,
        kind: NOTIFY_NODE_KIND,
        target: 'chat',
        anchorSeq: state.anchorSeq,
        location: context.start?.location ?? context.matches[0]?.location ?? { kind: 'unresolved' },
        groupTree: state.failure === undefined ? 'process' : undefined,
        visibility: state.useNativeError ? 'hidden' : 'visible',
        data: {
          ...state.title === undefined ? {} : { title: state.title },
          message: state.message,
          time: state.time,
          settled: state.settled,
          ...state.failure === undefined ? {} : { failure: state.failure },
        },
      };
      return node;
    },
  };
}
