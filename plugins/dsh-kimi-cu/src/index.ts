/** KimiCU 的宿主入口。探测、工具、配置卡与 MCP 注册共用本机状态。 */

import { defineTool } from '@deepseek-ai/dsh-tools';
import type { Context } from '@deepseek-ai/cordis';
import type { HostConnectionHandle } from '@deepseek-ai/dsh-client-connection';

import type { KimiCuStatus } from './shared/status.ts';

import { createStatusRoute } from './server/router.ts';
import { createMcpConnection, type ComputerUse, type McpManager } from './server/mcp.ts';
import { toPlatform } from './server/resolve.ts';
import { defaultStatusDetector } from './server/status.ts';
import { createUpdater } from './server/update.ts';
import { createUpdateRoute } from './server/update-router.ts';
import { fetchManifestText, runUpgradeProcess } from './server/update-runtime.ts';

/** 稳定 Cordis loader 名：与 cordis.patch.yml 里那条根层行的 id 同字面量。 */
export const name = 'dsh-kimi-cu';

/** 只需要 tools：注册工具；Connection 走可选注入，没有 Web 载体时插件照常加载。 */
export const inject = ['tools'];

/** 模型看到的工具名。 */
const TOOL_NAME = 'kimi_cu_status';

/** 探测器签名：状态卡、工具与 MCP 注册共用同一份。 */
type Detector = (refresh?: boolean) => Promise<KimiCuStatus>;

/**
 * 插件本体。
 * @param ctx - 宿主插件上下文（`tools` 由 inject 声明）。
 * @param options - 可选注入；只给测试换探测器用，宿主调用时不传。
 */
export function apply(ctx: Context, options?: { detect?: Detector }): void {
  const detectBase = options?.detect ?? defaultStatusDetector();

  const mcp = createMcpConnection((message) => ctx.logger.warn(message));
  const detect: Detector = async (refresh) => {
    const status = await detectBase(refresh);
    if (refresh) await mcp.sync(status);
    return { ...status, mcpStatus: mcp.read() };
  };

  const updater = createUpdater({
    platform: toPlatform(process.platform),
    current: async (refresh) => {
      const status = await detectBase(refresh);
      return { path: status.path, version: status.version };
    },
    fetchManifest: fetchManifestText,
    runUpgrade: (input) => runUpgradeProcess({
      binaryPath: input.binaryPath,
      // Windows 的 upgrade 必须带目标版本；macOS 交给 KimiCU 自己判断。
      args: input.version === null ? ['upgrade'] : ['upgrade', input.version],
      onLine: input.onLine,
    }),
    reconnect: async () => mcp.restart(await detectBase()),
  });

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

  // Connection 的 /api 通道由 Web 载体组合，没有它时插件照常加载。
  ctx.inject(['connection'], (connectionCtx) => {
    const connection = (connectionCtx as Context & { connection: HostConnectionHandle }).connection;
    const disposers = [
      connection.fetch.register(createStatusRoute(detect)),
      connection.fetch.register(createUpdateRoute(updater)),
    ];
    return () => {
      for (const dispose of disposers) void Promise.resolve(dispose()).catch(() => {});
    };
  });

  const logFailure = (error: unknown): void => ctx.logger.warn('KimiCU MCP: ' + String(error));
  ctx.inject(['computerUse'], (injected) => {
    const registry = (injected as Context & { computerUse: ComputerUse }).computerUse;
    void mcp.setRegistry(registry).catch(logFailure);
    return () => mcp.setRegistry(undefined).catch(logFailure);
  });
  ctx.inject(['mcpManager'], (injected) => {
    const manager = (injected as Context & { mcpManager: McpManager }).mcpManager;
    void mcp.setManager(manager).catch(logFailure);
    return () => mcp.setManager(undefined).catch(logFailure);
  });

  // 启动时探测一次：缺装或权限没就绪时把安装命令写进日志。不阻塞启动，失败静默。
  void detectBase()
    .then(async (status) => {
      await mcp.sync(status);
      if (!status.supported || status.installed) return;
      ctx.logger.warn(
        'KimiCU is not installed. Install it with: ' + (status.install?.command ?? ''),
      );
    })
    .catch(() => {});
}
