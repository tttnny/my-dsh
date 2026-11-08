/** 这个插件的字典命名空间：卡片注册与 locale.bind 都用它。 */
export const NS = 'kimiCu';

/** 英文文案。 */
export const en = {
  'status.loading': 'Checking KimiCU…',
  'status.error': "Couldn't read the KimiCU status.",
  'status.retry': 'Retry',
  'status.recheck': 'Check again',
  'status.unsupported': 'This plugin supports macOS and Windows only; no KimiCU connection starts on this platform.',
  'status.missing.title': 'KimiCU is not installed',
  'status.missing.hint': 'Install the official runtime, then check again.',
  'status.notReady.title': 'KimiCU is installed but not ready',
  'status.notReady.hint': 'Fix the failed checks below, then check again.',
  'status.ready.title': 'KimiCU is ready',
  'status.ready.hint': 'If the model cannot see the mcp__kimi-cu__* tools, turn this plugin off and on again on the Plugins page, or restart DSH.',
  'status.copy': 'Copy command',
  'status.copied': 'Copied',
  'status.copyFailed': 'Copy failed; select the command manually.',
  'status.docs': 'Official docs',
  'status.version': 'Version',
  'status.path': 'Path',
  'step.install': 'Install the official KimiCU runtime.',
  'step.grant-permissions': 'In System Settings, grant Accessibility and Screen Recording to KimiCU.',
  'step.reload-plugin': 'Turn this plugin off and on again on the Plugins page, or restart DSH.',
  'step.upgrade': 'Upgrade KimiCU to 0.3.8 or later.',
  'note.legacy-install': 'An older KimiCU install was found; upgrade it so the MCP row can use the new path.',
  'note.override-missing': 'KIMI_CU_WINDOWS_EXE points to a file that does not exist; fix the path or unset it.',
  'note.mcp-command-missing': 'The MCP row will launch a file that does not exist; upgrade KimiCU or point KIMI_CU_WINDOWS_EXE at the installed kimi-cu.exe.',
  'note.detection-failed': 'Detection failed; see the error and try again.',
  'check.accessibility': 'Accessibility',
  'check.screen-recording': 'Screen Recording',
  'check.skylight': 'SkyLight post-to-pid',
  'check.bg-input': 'Background input',
  'check.signed-keyboard': 'Signed keyboard',
  'check.mcp': 'MCP server',
  'fix.macos': 'Open System Settings → Privacy & Security and enable Accessibility and Screen Recording for KimiCU.',
  'fix.windows': 'KimiCU needs the same privilege level as the target app; use its control panel to enable administrator mode when needed.',
  'doctor.failed': 'doctor reported a failure',
  'doctor.notRun': 'doctor was not run',
};

/** 中文文案。键集与英文逐一对齐（smoke-client 会查这一条）。 */
export const zh = {
  'status.loading': '正在检测 KimiCU…',
  'status.error': '读不到 KimiCU 的状态。',
  'status.retry': '重试',
  'status.recheck': '重新检测',
  'status.unsupported': '本插件只支持 macOS 与 Windows；当前平台不会启动 KimiCU 连接。',
  'status.missing.title': '未检测到 KimiCU',
  'status.missing.hint': '先安装官方运行时，再回来重新检测。',
  'status.notReady.title': '已安装 KimiCU，但还没就绪',
  'status.notReady.hint': '按下面失败的检查项修复，再重新检测。',
  'status.ready.title': 'KimiCU 已就绪',
  'status.ready.hint': '如果模型看不到 mcp__kimi-cu__* 工具，请在插件页把本插件关一次再开一次，或重启 DSH。',
  'status.copy': '复制命令',
  'status.copied': '已复制',
  'status.copyFailed': '复制失败，请手动选择命令。',
  'status.docs': '官方文档',
  'status.version': '版本',
  'status.path': '路径',
  'step.install': '安装官方 KimiCU 运行时。',
  'step.grant-permissions': '在系统设置里为 KimiCU 开启辅助功能与屏幕录制。',
  'step.reload-plugin': '在插件页把本插件关一次再开一次，或重启 DSH。',
  'step.upgrade': '把 KimiCU 升级到 0.3.8 或更新版本。',
  'note.legacy-install': '检测到旧版 KimiCU 安装目录；升级后 MCP 行才能用上新路径。',
  'note.override-missing': 'KIMI_CU_WINDOWS_EXE 指向的文件不存在；改路径或去掉它。',
  'note.mcp-command-missing': 'MCP 行要启动的文件不存在；升级 KimiCU，或把 KIMI_CU_WINDOWS_EXE 指向已安装的 kimi-cu.exe。',
  'note.detection-failed': '检测失败；看错误信息后重试。',
  'check.accessibility': '辅助功能',
  'check.screen-recording': '屏幕录制',
  'check.skylight': 'SkyLight post-to-pid',
  'check.bg-input': '后台输入',
  'check.signed-keyboard': '签名键盘',
  'check.mcp': 'MCP 服务',
  'fix.macos': '打开系统设置 → 隐私与安全性，为 KimiCU 开启辅助功能与屏幕录制。',
  'fix.windows': 'KimiCU 需要与目标应用同级的权限；需要时在它的控制面板里开启管理员模式。',
  'doctor.failed': 'doctor 报告了失败',
  'doctor.notRun': 'doctor 没有跑起来',
};

/** 字典的键集；座位注册的 locale 选项靠它给组件里的 t 定型。 */
export type KimiCuKey = keyof typeof en;

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** 本插件的文案命名空间。 */
    kimiCu: KimiCuKey;
  }
}
