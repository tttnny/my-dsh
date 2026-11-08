/**
 * 宿主与浏览器半边共用的状态形状、路由与常量。
 *
 * 这里只放类型与字面量：宿主用它产出状态，卡片用它渲染；两边不共享运行时代码。
 */

/** 当前平台的三分类：只支持 macOS 与 Windows，其余归到 other。 */
export type KimiCuPlatform = 'darwin' | 'win32' | 'other';

/** 安装引导里的步骤，卡片负责本地化。 */
export type InstallStep = 'install' | 'grant-permissions' | 'reload-plugin' | 'upgrade';

/** `doctor` 的一项检查。 */
export interface DoctorCheck {
  /** 机器可读的检查 id，卡片据此挑文案。 */
  id: string;
  /** `doctor` 原始输出里的标签，未知项直接显示它。 */
  label: string;
  /** 这一项是否通过。 */
  ok: boolean;
}

/** 一次 `doctor` 的结果。 */
export interface DoctorReport {
  /** 是否真的跑过 `doctor`。 */
  ran: boolean;
  /** 所有已知检查是否都通过。 */
  ok: boolean;
  /** 解析出来的检查项。 */
  checks: DoctorCheck[];
  /** 原始输出，排障用。 */
  raw: string;
  /** 跑不起来或超时时的错误文本。 */
  error?: string;
}

/** 当前平台的安装引导。 */
export interface InstallPlan {
  /** 官方安装命令，原样展示给用户复制。 */
  command: string;
  /** 安装步骤。 */
  steps: InstallStep[];
  /** 中文文档地址。 */
  docsUrl: string;
  /** 英文文档地址。 */
  docsUrlEn: string;
}

/** 一次检测的完整结果。 */
export interface KimiCuStatus {
  platform: KimiCuPlatform;
  /** 当前平台是否受支持。 */
  supported: boolean;
  /** 是否找到了可用的 KimiCU 可执行文件。 */
  installed: boolean;
  /** 找到的安装路径；没找到是 null。 */
  path: string | null;
  /** 版本号；读不出来是 null。 */
  version: string | null;
  doctor: DoctorReport;
  /** 插件里那条 MCP 行会用的命令；不支持当前平台时是 null。 */
  mcp: { command: string; args: string[] } | null;
  /** 当前平台的安装引导；不支持当前平台时是 null。 */
  install: InstallPlan | null;
  /** 机器可读的附注，例如 `legacy-install`。 */
  notes: string[];
  /** 检测完成的时间戳（毫秒）。 */
  checkedAt: number;
}

/** 状态路由：卡片走 Connection 的 `/api` 通道读它。 */
export const STATUS_ROUTE_PATH = '/api/dsh-kimi-cu/status';

/** macOS 的 KimiCU 命令行在 app 包里，不是 PATH 上的命令。 */
export const MACOS_BINARY = '/Applications/KimiCU.app/Contents/MacOS/kimi-cu';

/** Windows 运行时的可执行文件名。 */
export const WINDOWS_EXE_NAME = 'kimi-cu.exe';

/** Windows 0.3.8 起的新安装目录名。 */
export const WINDOWS_DIR_NAME = 'Kimi Computer Use';

/** Windows 旧安装目录名，安装器会建 junction 兼容。 */
export const WINDOWS_LEGACY_DIR_NAME = 'KimiCU';

/** macOS 官方安装命令。 */
export const MACOS_INSTALL_COMMAND = 'curl -fsSL https://cdn.kimi.com/kimi-computer-use/latest/setup_macos.sh | bash';

/** Windows 官方安装命令。 */
export const WINDOWS_INSTALL_COMMAND = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Invoke-RestMethod \'https://cdn.kimi.com/kimi-computer-use-windows/latest/setup_windows.ps1\' | Invoke-Expression"';

/** 中文官方文档。 */
export const DOCS_URL = 'https://www.kimi.com/code/docs/kimi-code-cli/customization/plugins.html';

/** 英文官方文档。 */
export const DOCS_URL_EN = 'https://www.kimi.com/code/docs/en/kimi-code-cli/customization/plugins.html';
