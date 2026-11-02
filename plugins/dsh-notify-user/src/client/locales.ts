/** 这个插件的字典命名空间：座位注册与 `locale.bind` 都用它。 */
export const NS = 'notifyUser';

/** 英文文案。 */
export const en = {
  'row.preparing': 'Sending update…',
  'row.fallbackTitle': 'Update',
  'markdown.copy': 'Copy',
  'markdown.copied': 'Copied',
  'markdown.footnotes': 'Footnotes',
  'config.threshold.label': 'Nudge after',
  'config.threshold.hint': 'Tool calls without an update before the model is nudged; 0 turns nudging off.',
  'config.threshold.unit': 'calls',
  'config.collapsible.label': 'Collapsible',
  'config.collapsible.hint': 'The update body starts expanded with a collapse button beside the title; turn it off to keep the body always expanded with no button.',
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
  'config.threshold.label': '催办阈值',
  'config.threshold.hint': '连续多少次工具调用没有汇报时催一次；0 关闭催办。',
  'config.threshold.unit': '次',
  'config.collapsible.label': '可折叠',
  'config.collapsible.hint': '进度卡正文默认展开，标题旁带一个折叠键；关掉后正文始终展开、不显示折叠键。',
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
