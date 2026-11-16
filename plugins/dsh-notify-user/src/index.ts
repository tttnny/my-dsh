import { defineTool } from '@deepseek-ai/dsh-tools';
import type { ToolDefinition } from '@deepseek-ai/dsh-tools';
import type { Context } from '@deepseek-ai/cordis';
import type { Session } from '@deepseek-ai/dsh-session';
import type {} from '@deepseek-ai/dsh-settings';
import { isEnabledFor, nudgeAfterOf, type PluginConfig } from './config.js';
import { createNudgeController, installNudge } from './nudge.js';
import { NOTIFY_TOOL_NAME, SUMMARY_ONLY_FIELD } from './shared/config.js';
import { parseUpdate } from './client/row-model.js';

/**
 * @lynn123411/dsh-notify-user —— 模型在干活途中主动汇报进度，久不汇报就催一条。
 *
 * 宿主半边做三件事：注册 `notify_user` 工具、把催办状态机接到两条宿主事件上、
 * 声明本行的配置形状并关掉内核按 schema 自动生成的设置页（配置界面在浏览器
 * 半边的插件页卡片上）。浏览器半边与它同挂一条 root loader 行（见 cordis.patch.yml）。
 *
 * 主动汇报按会话开关：会话自己的选择优先，没有就用配置里的默认值。关掉的会话
 * 既不催，也不给它提供 `notify_user` 工具。
 */

/** 稳定 Cordis loader 名：与 cordis.patch.yml 那条行的 id、配置命名空间同字面量。 */
export const name = 'dsh-notify-user';

/** 只需要 tools：注册工具。催办接的是事件，不需要额外服务。 */
export const inject = ['tools'];

export { Config } from './config.js';

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * 配置的 volatile 字段被合并进运行中的插件时发出，只发给拥有它的 fiber。
     * 形状照抄 `@deepseek-ai/cordis-plugin-loader` 的 `lib/types/index.d.ts`。
     */
    'loader/volatile-update'(paths: readonly (readonly string[])[]): void;
  }
}

/** 标题参数的描述：两种模式共用。 */
const TITLE_PARAMETER = {
  type: 'string',
  description: "One line the user can take in at a glance: the conclusion or current phase, in the user's language, under 60 characters, plain text.",
} as const;

/** 正文参数的描述：只在不报摘要时出现。 */
const MESSAGE_PARAMETER = {
  type: 'string',
  required: true,
  description: "The details behind the title, without repeating it: a short paragraph plus a few bullet points of light Markdown, in the user's language, under 1000 characters.",
} as const;

/** 工具输出：两种模式共用。 */
const OUTPUT = {
  schema: {
    type: 'object' as const,
    additionalProperties: false,
    properties: {
      ok: {
        type: 'boolean' as const,
        description: 'Whether the update was recorded.',
      },
    },
  },
  render: () => [{ type: 'text' as const, text: 'Update shown in the conversation.' }],
  // 原生调用窗口截断后卡片仍能画；PTC 下内核把同一份 meta 写进 tool/ptc-dispatch。
  presentationMeta: (args: unknown) => {
    const update = parseUpdate(args);
    const meta: Record<string, string> = { message: update?.message ?? '' };
    if (update?.title !== undefined) meta['title'] = update.title;
    return meta;
  },
};

/** 正常模式的工具描述。 */
const DETAILED_DESCRIPTION = 'Send the user a short progress update without ending your turn. Use it when you have been working through several tool calls, when you finish a stage or change direction, or when you find something the user should know before you finish. Do not use it for the final answer: findings that belong in the reply still go in the reply.';

/** 只报摘要时的工具描述：只要一行标题。 */
const SUMMARY_ONLY_DESCRIPTION = 'Send the user a one-line progress update without ending your turn. Use it when you have been working through several tool calls, when you finish a stage or change direction, or when you find something the user should know before you finish. Write only the title: one line the user can take in at a glance. Do not use it for the final answer: findings that belong in the reply still go in the reply.';

/**
 * 造一份 `notify_user` 定义。
 * @param summaryOnly - 只报摘要时参数只剩标题、描述只要求一行。
 * @returns 这一次注册用的工具定义。
 */
function notifyTool(summaryOnly: boolean): ToolDefinition {
  return defineTool({
    name: NOTIFY_TOOL_NAME,
    description: summaryOnly ? SUMMARY_ONLY_DESCRIPTION : DETAILED_DESCRIPTION,
    parameters: summaryOnly
      ? { title: { ...TITLE_PARAMETER, required: true } }
      : { title: TITLE_PARAMETER, message: MESSAGE_PARAMETER },
    output: OUTPUT,
    isConcurrencySafe: () => true,
    async execute() {
      return { ok: true };
    },
  });
}

/**
 * 插件本体。
 * @param ctx - 宿主插件上下文（`tools` 由 inject 声明）。
 * @param config - 本行的配置；阈值每次现读，改配置不重挂插件。
 */
export function apply(ctx: Context, config: PluginConfig): void {
  /** 这个会话是否开启主动汇报；催办与工具可用性问的是同一个问题。 */
  const enabledIn = (session: Session): boolean => isEnabledFor(config, session.header.id);

  installNudge(ctx, createNudgeController({
    readThreshold: () => nudgeAfterOf(config),
    readProseResets: () => config.resetOnProse.get(),
    readSummaryOnly: () => config.summaryOnly.get(),
    readEnabled: enabledIn,
  }), NOTIFY_TOOL_NAME);

  // 会话关掉主动汇报时，这一步的声明与派发都没有这个工具。
  const registerTool = (): (() => void) => ctx.tools.register(notifyTool(config.summaryOnly.get()), {
    when: ({ agent }) => enabledIn(agent.session),
  });
  let disposeTool = registerTool();

  // 只报摘要只改工具面，不重挂插件：配置合并进来后换一份定义。
  ctx.on('loader/volatile-update', (paths) => {
    if (!paths.some(path => path[0] === SUMMARY_ONLY_FIELD)) return;
    disposeTool();
    disposeTool = registerTool();
  });

  // 配置界面在插件页的卡片上，关掉内核按 Config schema 自动生成的那份设置页。
  // 走可选注入：没有 settings 服务的组合照常加载，只是少一条策略。
  ctx.inject(['settings'], (scoped) => {
    scoped.effect(() => scoped.settings.configure({ auto: false }, ctx.fiber));
  });
}
