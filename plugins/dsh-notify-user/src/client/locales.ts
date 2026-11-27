/** 这个插件的字典命名空间：座位注册与 `locale.bind` 都用它。 */
export const NS = 'notifyUser';

/** 英文文案。 */
export const en = {
  'row.preparing': 'Sending update…',
  'row.failed': 'Could not send update',
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
  'config.threshold.hint': 'Tool calls without an update before the model is nudged; 0 turns nudging off and leaves the update tool available.',
  'config.threshold.unit': 'calls',
  'config.resetOnProse.label': 'Reset on prose',
  'config.resetOnProse.hint': 'Any assistant reply with text counts as an update and resets the count; turn it off to reset only on a successful update, a new turn, or a user message.',
  'config.reportMode.label': 'Update format',
  'config.reportMode.hint': 'Summary only: the model writes one line and the card shows just the title; structured body: the model writes a title and a body.',
  'config.reportMode.structured': 'Structured body',
  'config.reportMode.summary': 'Summary only',
  'config.summaryRender.label': 'Summary display',
  'config.summaryRender.hint': 'Card shows the dot and time; prose renders as a plain paragraph like an assistant reply.',
  'config.summaryRender.card': 'Card',
  'config.summaryRender.prose': 'Prose',
  'config.bodyMode.label': 'Body display',
  'config.bodyMode.hint': 'Always expanded has no toggle; collapsed expands from the dot; expanded shows the body right away.',
  'config.bodyMode.always': 'Always expanded',
  'config.bodyMode.collapsed': 'Collapsed',
  'config.bodyMode.expanded': 'Expanded',
  'config.showTime.label': 'Show time',
  'config.showTime.hint': 'Shows when the update was sent at the right end of the title row; turn it off to keep just the dot and the title.',
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
  'row.failed': '汇报失败',
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
  'config.threshold.hint': '连续多少次工具调用没有汇报时催一次；0 关闭催办，仍可主动汇报。',
  'config.threshold.unit': '次',
  'config.resetOnProse.label': '散文回复清零',
  'config.resetOnProse.hint': '模型在助手消息里写了正文就算汇报过，计数清零；关掉后只在汇报成功、新回合或用户插话时清零。',
  'config.reportMode.label': '汇报形态',
  'config.reportMode.hint': '只报摘要时模型只写一行标题，卡片只显示标题行；结构化正文时模型写标题与正文。',
  'config.reportMode.structured': '结构化正文',
  'config.reportMode.summary': '只报摘要',
  'config.summaryRender.label': '摘要呈现',
  'config.summaryRender.hint': '进度卡带圆点与时间；散文按普通段落渲染，看起来像助手写的正文。',
  'config.summaryRender.card': '进度卡',
  'config.summaryRender.prose': '散文',
  'config.bodyMode.label': '正文显示',
  'config.bodyMode.hint': '始终展开没有折叠键；默认收起时点圆点展开；默认展开直接看到正文。',
  'config.bodyMode.always': '始终展开',
  'config.bodyMode.collapsed': '默认收起',
  'config.bodyMode.expanded': '默认展开',
  'config.showTime.label': '显示时间',
  'config.showTime.hint': '标题行右侧显示这条汇报的时间；关掉后标题行只剩圆点与标题。',
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
