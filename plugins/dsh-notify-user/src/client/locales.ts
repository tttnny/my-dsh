/** 这个插件的字典命名空间：座位注册与 `locale.bind` 都用它。 */
export const NS = 'notifyUser';

/** 英文文案。 */
export const en = {
  'row.preparing': 'Sending update…',
  'row.fallbackTitle': 'Update',
  'markdown.copy': 'Copy',
  'markdown.copied': 'Copied',
  'markdown.footnotes': 'Footnotes',
  'toggle.label': 'Proactive updates',
  'toggle.description': 'The model reports progress while it works. Turn it off and this session stops nudging it to report and no longer offers it the reporting tool.',
  'toggle.infoLabel': 'About proactive updates',
  'toggle.failed': "Couldn't save the setting; try again.",
  'config.defaultEnabled.label': 'On by default',
  'config.defaultEnabled.hint': 'New sessions start with proactive updates on; change a single session in the model and reasoning menu.',
  'config.threshold.label': 'Nudge after',
  'config.threshold.hint': 'Tool calls without an update before the model is nudged; 0 turns nudging off.',
  'config.threshold.unit': 'calls',
  'config.resetOnProse.label': 'Reset on prose',
  'config.resetOnProse.hint': 'Any assistant reply with text counts as an update and resets the count; turn it off to reset only on notify_user, a new turn, or a user message.',
  'config.collapsible.label': 'Collapsible',
  'config.collapsible.hint': 'The update body starts expanded with a collapse button beside the title; turn it off to keep the body always expanded with no button.',
  'config.placement.label': 'Card placement',
  'config.placement.hint': 'At the step-group boundary, tool calls between two updates fold into their own sub-folds; following the tool row, the card folds with the group.',
  'config.placement.boundary': 'Step-group boundary',
  'config.placement.inline': 'Follow tool row',
  'config.write.failed': "Couldn't save; change it again to retry.",
  'config.unavailable': 'This configuration is unavailable right now.',
};

/** 中文文案。键集与英文逐一对齐（smoke-client 会查这一条）。 */
export const zh = {
  'row.preparing': '正在汇报…',
  'row.fallbackTitle': '更新',
  'markdown.copy': '复制',
  'markdown.copied': '已复制',
  'markdown.footnotes': '脚注',
  'toggle.label': '主动汇报',
  'toggle.description': '模型在干活途中向你汇报进度。关掉后这个会话不再催它汇报，也不再向它提供汇报工具。',
  'toggle.infoLabel': '关于主动汇报',
  'toggle.failed': '没保存上，请重试。',
  'config.defaultEnabled.label': '默认开启',
  'config.defaultEnabled.hint': '新会话默认打开主动汇报；单个会话的开关在模型与推理等级菜单里。',
  'config.threshold.label': '催办阈值',
  'config.threshold.hint': '连续多少次工具调用没有汇报时催一次；0 关闭催办。',
  'config.threshold.unit': '次',
  'config.resetOnProse.label': '散文回复清零',
  'config.resetOnProse.hint': '模型在助手消息里写了正文就算汇报过，计数清零；关掉后只在 notify_user、新回合或用户插话时清零。',
  'config.collapsible.label': '可折叠',
  'config.collapsible.hint': '进度卡正文默认展开，标题旁带一个折叠键；关掉后正文始终展开、不显示折叠键。',
  'config.placement.label': '进度卡位置',
  'config.placement.hint': '放在步骤组边界时，两次汇报之间的工具调用各自折成一个子折叠；跟随工具行时，卡片随工具行一起折进组里。',
  'config.placement.boundary': '步骤组边界',
  'config.placement.inline': '跟随工具行',
  'config.write.failed': '没写进去，再改一次试试。',
  'config.unavailable': '这份配置现在读不到。',
};

/** 字典的键集；座位注册的 `locale` 选项靠它给组件里的 `t` 定型。 */
export type NotifyKey = keyof typeof en;

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** 本插件的文案命名空间。 */
    notifyUser: NotifyKey;
  }
}
