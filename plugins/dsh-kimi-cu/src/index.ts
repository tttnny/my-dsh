/**
 * @lynn123411/dsh-kimi-cu 的宿主半边。
 *
 * 做五件事：注册 `kimi_cu_status` 工具、把状态路由挂到 Connection 的 /api 通道、
 * 启动时做一次探测并在缺装时写一条带安装命令的 warning、占用宿主的桌面操作独占槽位、
 * 把 KimiCU 的 MCP 连接交给宿主的 `mcpManager` 注册。
 *
 * MCP 连接走管理器而不是 patch 里的静态行：命令由探测器给出，与状态卡、工具说的是
 * 同一份路径；管理器还统一提供状态、重启与探测。管理器不可用时插件照常加载，只是
 * 没有 `mcp__kimi-cu__*` 工具。
 *
 * 桌面操作是宿主的独占能力：官方 CUA 与 Cua Driver 都经 `computerUse.register()` 占位。
 * 本插件同样占位，否则两套后端会同时控制同一台机器而宿主看不见。占位失败就撤掉 MCP
 * 连接——模型拿不到 `mcp__kimi-cu__*`，比两套工具抢同一台机器安全。
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

/** 注册给 MCP 管理器的服务器名，同时是 `mcp__kimi-cu__*` 的工具命名空间。 */
const MCP_SERVER_NAME = 'kimi-cu';

/** 桌面操作独占槽位里本插件占的名字，出现在冲突诊断里。 */
const COMPUTER_USE_PROVIDER = 'kimi-cu';

/** KimiCU 的 js 里可能跑长循环；内核默认 60 秒就取消一次调用，这里留 5 分钟。 */
const MCP_TOOL_TIMEOUT_MS = 300_000;

/**
 * 管理器里本插件用到的那一面。
 *
 * 只写形状不引包：本插件不依赖 `@deepseek-ai/dsh-mcp-manager`，管理器缺失时整块
 * 注入不激活，插件其余部分照常工作。
 */
interface McpManagerFace {
  /**
   * 注册一个随插件生命周期存在的服务器。
   * @param name - 服务器名与工具命名空间。
   * @param entry - 传输方式、命令与预算。
   * @returns 撤销这次注册的函数。
   */
  register: (name: string, entry: {
    transport: 'stdio';
    command: string;
    args: string[];
    toolCallTimeoutMs: number;
  }) => () => void;
}

/**
 * 桌面操作独占槽位里本插件用到的那一面。
 *
 * 只写形状不引包：本插件不依赖 `@deepseek-ai/dsh-computer-use`，服务缺失时整块注入
 * 不激活，插件其余部分照常工作。
 */
interface ComputerUseFace {
  /**
   * 占用唯一的提供方槽位，直到返回的清理函数被调用。
   * @param name - 提供方名字，出现在冲突诊断里。
   * @returns 释放这次占位的函数。
   */
  register: (name: string) => () => Promise<void>;
}

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

  // MCP 连接交给管理器：命令取自同一次探测，平台不受支持时探测器给 null，这里就不注册。
  // 两个可选服务谁先到不确定，所以注册动作收进 syncMcp：条件齐了才动手，条件变了再算一次。
  let mcpCtx: (Context & { mcpManager: McpManagerFace }) | undefined;
  let disposeMcp: (() => void) | undefined;
  let desktopDenied = false;

  const syncMcp = async (): Promise<void> => {
    if (desktopDenied || mcpCtx === undefined || disposeMcp !== undefined) return;
    const status = await detect();
    // 探测是异步的，回来时条件可能已经变了，再判一次。
    if (desktopDenied || mcpCtx === undefined || disposeMcp !== undefined) return;
    if (status.mcp === null) return;
    disposeMcp = mcpCtx.mcpManager.register(MCP_SERVER_NAME, {
      transport: 'stdio',
      command: status.mcp.command,
      args: status.mcp.args,
      toolCallTimeoutMs: MCP_TOOL_TIMEOUT_MS,
    });
  };

  // 桌面操作是独占能力：先占位，占到了才有资格把工具交出去。
  ctx.inject(['computerUse'], (cuCtx) => {
    const registry = (cuCtx as Context & { computerUse: ComputerUseFace }).computerUse;
    let release: (() => Promise<void>) | undefined;
    try {
      release = registry.register(COMPUTER_USE_PROVIDER);
    } catch (error) {
      // 别的后端已经在控制桌面：撤掉自己的工具，别让两套后端抢同一台机器。
      desktopDenied = true;
      disposeMcp?.();
      disposeMcp = undefined;
      ctx.logger.warn(
        'KimiCU 没有占用桌面操作槽位（'
        + (error instanceof Error ? error.message : String(error))
        + '）；已停用 mcp__kimi-cu__* 工具，避免两套后端同时控制桌面。',
      );
      return () => {
        desktopDenied = false;
        void syncMcp().catch(() => {});
      };
    }
    void syncMcp().catch(() => {});
    return () => {
      void Promise.resolve(release?.()).catch(() => {});
    };
  });

  ctx.inject(['mcpManager'], (injectedCtx) => {
    mcpCtx = injectedCtx as Context & { mcpManager: McpManagerFace };
    void syncMcp().catch(() => {});
    return () => {
      mcpCtx = undefined;
      disposeMcp?.();
      disposeMcp = undefined;
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
