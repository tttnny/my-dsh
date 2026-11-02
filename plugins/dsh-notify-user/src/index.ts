import { defineTool } from '@deepseek-ai/dsh-tools';
import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-settings';
import { nudgeAfterOf, type PluginConfig } from './config.js';
import { createNudgeController, installNudge, NUDGE_TOOL_NAME } from './nudge.js';
import { parseUpdate } from './client/row-model.js';

/**
 * @lynn123411/dsh-notify-user —— 模型在干活途中主动汇报进度，久不汇报就催一条。
 *
 * 宿主半边做三件事：注册 `notify_user` 工具、把催办状态机接到两条宿主事件上、
 * 声明本行的配置形状并关掉内核按 schema 自动生成的设置页（配置界面在浏览器
 * 半边的插件页卡片上）。浏览器半边与它同挂一条 root loader 行（见 cordis.patch.yml）。
 */

/** 稳定 Cordis loader 名：与 cordis.patch.yml 那条行的 id、配置命名空间同字面量。 */
export const name = 'dsh-notify-user';

/** 只需要 tools：注册工具。催办接的是事件，不需要额外服务。 */
export const inject = ['tools'];

export { Config } from './config.js';

/**
 * 插件本体。
 * @param ctx - 宿主插件上下文（`tools` 由 inject 声明）。
 * @param config - 本行的配置；阈值每次现读，改配置不重挂插件。
 */
export function apply(ctx: Context, config: PluginConfig): void {
  installNudge(ctx, createNudgeController(() => nudgeAfterOf(config)));

  ctx.tools.register(defineTool({
    name: NUDGE_TOOL_NAME,
    description: 'Send the user a short progress update without ending your turn. Use it when you have been working through several tool calls, when you finish a stage or change direction, or when you find something the user should know before you finish. Do not use it for the final answer: findings that belong in the reply still go in the reply.',
    parameters: {
      title: {
        type: 'string',
        description: "One line the user can take in at a glance: the conclusion or current phase, in the user's language, under 60 characters, plain text.",
      },
      message: {
        type: 'string',
        required: true,
        description: "The details behind the title, without repeating it: a short paragraph plus a few bullet points of light Markdown, in the user's language, under 1000 characters.",
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: {
            type: 'boolean',
            description: 'Whether the update was recorded.',
          },
        },
      },
      render: () => [{ type: 'text', text: 'Update shown in the conversation.' }],
      // 原生调用窗口截断后卡片仍能画；PTC 下内核把同一份 meta 写进 tool/ptc-dispatch。
      presentationMeta: (args) => {
        const update = parseUpdate(args);
        const meta: Record<string, string> = { message: update?.message ?? '' };
        if (update?.title !== undefined) meta['title'] = update.title;
        return meta;
      },
    },
    isConcurrencySafe: () => true,
    async execute() {
      return { ok: true };
    },
  }));

  // 配置界面在插件页的卡片上，关掉内核按 Config schema 自动生成的那份设置页。
  // 走可选注入：没有 settings 服务的组合照常加载，只是少一条策略。
  ctx.inject(['settings'], (scoped) => {
    scoped.effect(() => scoped.settings.configure({ auto: false }, ctx.fiber));
  });
}
