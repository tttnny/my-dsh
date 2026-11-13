/**
 * 安装位置解析：纯函数，宿主检测与 patch 里的平台表达式共用同一套规则。
 *
 * macOS 的二进制固定在 app 包里；Windows 的运行时默认装在
 * %LOCALAPPDATA%/Kimi Computer Use/kimi-cu.exe，KIMI_CU_WINDOWS_EXE 覆盖默认路径。
 * Windows 的公式必须与 cordis.patch.yml 里的表达式逐字一致；check-bundle 会逐 env 断言。
 */

import {
  DOCS_URL,
  DOCS_URL_EN,
  MACOS_BINARY,
  MACOS_INSTALL_COMMAND,
  WINDOWS_DIR_NAME,
  WINDOWS_EXE_NAME,
  WINDOWS_INSTALL_COMMAND,
  WINDOWS_LEGACY_DIR_NAME,
  type InstallPlan,
  type KimiCuPlatform,
} from '../shared/status.ts';

/** 解析所需的三样外部输入，测试里可以全部替身。 */
export interface ResolveInput {
  /** process.platform 的值。 */
  platform: string;
  /** process.env。 */
  env: Record<string, string | undefined>;
  /** 文件是否存在。 */
  exists: (path: string) => boolean;
}

/** 解析结果：检测状态与 MCP 行要用的命令。 */
export interface ResolvedInstall {
  platform: KimiCuPlatform;
  supported: boolean;
  installed: boolean;
  /** 实际找到的安装路径；没找到是 null。 */
  path: string | null;
  /** 插件里那条 MCP 行会用的命令。 */
  mcp: { command: string; args: string[] } | null;
  /** 当前平台的安装引导。 */
  install: InstallPlan | null;
  /** 机器可读的附注。 */
  notes: string[];
}

/**
 * 把 process.platform 归到三分类。
 * @param platform - process.platform。
 * @returns darwin / win32 / other。
 */
export function toPlatform(platform: string): KimiCuPlatform {
  if (platform === 'darwin') return 'darwin';
  if (platform === 'win32') return 'win32';
  return 'other';
}

/**
 * 当前平台的官方安装引导。
 * @param platform - 三分类平台。
 * @returns 安装计划；不支持的平台是 null。
 */
export function installPlan(platform: KimiCuPlatform): InstallPlan | null {
  if (platform === 'darwin') {
    return {
      command: MACOS_INSTALL_COMMAND,
      steps: ['install', 'grant-permissions', 'reload-plugin'],
      docsUrl: DOCS_URL,
      docsUrlEn: DOCS_URL_EN,
    };
  }
  if (platform === 'win32') {
    return {
      command: WINDOWS_INSTALL_COMMAND,
      steps: ['install', 'reload-plugin'],
      docsUrl: DOCS_URL,
      docsUrlEn: DOCS_URL_EN,
    };
  }
  return null;
}

/**
 * Windows 默认安装目录下的可执行文件；与 patch 表达式同一公式。
 * @param env - 环境变量。
 * @returns 路径；LOCALAPPDATA 缺失时是相对路径（与 patch 表达式一致）。
 */
function windowsPrimary(env: Record<string, string | undefined>): string {
  return (env.LOCALAPPDATA || '') + '\\' + WINDOWS_DIR_NAME + '\\' + WINDOWS_EXE_NAME;
}

/**
 * Windows 上插件会启动的 MCP 命令；与 patch 表达式同一公式。
 * @param env - 环境变量。
 * @returns 命令；KIMI_CU_WINDOWS_EXE 优先。
 */
function windowsMcpCommand(env: Record<string, string | undefined>): string {
  return (env.KIMI_CU_WINDOWS_EXE || '') || windowsPrimary(env);
}

/**
 * 解析当前平台的安装位置与 MCP 命令。
 * @param input - 平台、环境变量与文件存在性判定。
 * @returns 解析结果。
 */
export function resolveInstall(input: ResolveInput): ResolvedInstall {
  const platform = toPlatform(input.platform);

  if (platform === 'darwin') {
    const installed = input.exists(MACOS_BINARY);
    return {
      platform,
      supported: true,
      installed,
      path: installed ? MACOS_BINARY : null,
      mcp: { command: MACOS_BINARY, args: ['mcp', '-s', 'user'] },
      install: installPlan('darwin'),
      notes: [],
    };
  }

  if (platform === 'win32') {
    const base = input.env.LOCALAPPDATA || '';
    const primary = windowsPrimary(input.env);
    const legacy = base + '\\' + WINDOWS_LEGACY_DIR_NAME + '\\' + WINDOWS_EXE_NAME;
    const override = input.env.KIMI_CU_WINDOWS_EXE || '';
    const command = windowsMcpCommand(input.env);

    // 覆盖值存在时只用它：MCP 行启动的就是它，回退到别的路径会让状态与真实连接分叉。
    let path: string | null = null;
    if (override !== '') {
      path = input.exists(override) ? override : null;
    } else if (primary !== '' && input.exists(primary)) {
      path = primary;
    } else if (legacy !== '' && input.exists(legacy)) {
      path = legacy;
    }

    const notes: string[] = [];
    if (path !== null && path === legacy) notes.push('legacy-install');
    if (override !== '' && path === null) notes.push('override-missing');
    // 找到的运行时不是 MCP 行会启动的那个（旧目录安装）：状态不能报「本机检查通过」。
    if (path !== null && command !== '' && !input.exists(command)) notes.push('mcp-command-missing');

    const install = installPlan('win32');
    if (install !== null && notes.includes('legacy-install')) install.steps = [...install.steps, 'upgrade'];

    return {
      platform,
      supported: true,
      installed: path !== null,
      path,
      mcp: command === '' ? null : { command, args: ['mcp'] },
      install,
      notes,
    };
  }

  return {
    platform: 'other',
    supported: false,
    installed: false,
    path: null,
    mcp: null,
    install: null,
    notes: [],
  };
}
