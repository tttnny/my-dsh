/**
 * @lynn123411/dsh-kimi-cu 的宿主半边。
 *
 * 做三件事：注册 `kimi_cu_status` 工具、把状态路由挂到 Connection 的 /api 通道、
 * 启动时做一次探测并在缺装时写一条带安装命令的 warning。MCP 连接本身不在这里，
 * 它由 patch 里那两条带平台守卫的 `dsh-mcp-client` 行负责。
 */

import { defineTool } from '@deepseek-ai/dsh-tools';
import type { Context } from '@deepseek-ai/cordis';
import type { HostConnectionHandle } from '@deepseek-ai/dsh-client-connection';

import { createStatusRoute } from './server/router.ts';
import { defaultStatusDetector } from './server/status.ts';

/** 稳定 Cordis loader 名：与 cordis.patch.yml 里那条根层行的 id 同字面量。 */
export const name = 'dsh-kimi-cu';

/** 只需要 tools：注册工具；Connection 走可选注入，没有 Web 载体时插件照常加载。 */
export const inject = ['tools'];

/** 模型看到的工具名。 */
const TOOL_NAME = 'kimi_cu_status';

/**
 * 插件本体。
 * @param ctx - 宿主插件上下文（`tools` 由 inject 声明）。
 */
export function apply(ctx: Context): void {
  const detect = defaultStatusDetector();

  ctx.tools.register(defineTool({
    name: TOOL_NAME,
    description: 'Check whether KimiCU (Kimi Computer Use) is installed and ready on this machine, and get the platform-specific install or repair steps. Call this when the mcp__kimi-cu__* tools are missing or a KimiCU call fails with a connection error.',
    parameters: {
      refresh: {
        type: 'boolean',
        description: 'Re-run detection instead of using the cached result.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          status: {
            type: 'string',
            description: 'JSON-encoded KimiCuStatus: platform, installed, path, version, doctor, mcp command, install plan and notes.',
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.status ?? '' }],
    },
    isConcurrencySafe: () => true,
    async execute(args) {
      const status = await detect(args.refresh === true);
      return { status: JSON.stringify(status) };
    },
  }));

  // 状态路由只读；Connection 的 /api 通道由 Web 载体组合，没有它时插件照常加载。
  ctx.inject(['connection'], (connectionCtx) => {
    const route = createStatusRoute(detect);
    const dispose = (connectionCtx as Context & { connection: HostConnectionHandle })
      .connection.fetch.register(route);
    return () => {
      void Promise.resolve(dispose()).catch(() => {});
    };
  });

  // 启动时探测一次：缺装或权限没就绪时把安装命令写进日志。不阻塞启动，失败静默。
  void detect()
    .then((status) => {
      if (!status.supported || status.installed) return;
      ctx.logger.warn(
        'KimiCU is not installed. Install it with: ' + (status.install?.command ?? ''),
      );
    })
    .catch(() => {});
}
