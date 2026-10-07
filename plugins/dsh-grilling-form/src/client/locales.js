/** 本插件表单行自己的文案字典。名字空间归本插件，复用别人的名字空间会在对方改键时静默失效。 */

/** 字典名字空间。 */
export const NS = 'grillingForm';

/** 简体中文（键集的事实来源）。 */
export const zh = {
  'row.progress': '这一轮 {total} 题 · 已填 {answered}',
  'row.closed': '本轮已过，仅供查看',
  'row.rejected': '入参被拒绝',
  'row.violations': '校验失败',
  'row.failed': '调用失败',
  'row.recommended': '推荐',
  'row.customLabel': '自填',
  'row.customPlaceholder': '选项不够用的话，在这里自己写一段',
  'row.import': '导入输入框',
  'row.fork': '从这里分叉',
  'row.inspect': '查看',
  'copy': '复制',
  'copied': '已复制',
  'markdown.footnotes': '脚注',
};

/** 英文，键集与中文逐条对齐。 */
export const en = {
  'row.progress': '{total} question(s) this round · {answered} filled',
  'row.closed': 'This round is over; the form is read-only',
  'row.rejected': 'Rejected before showing',
  'row.violations': 'Rejected input',
  'row.failed': 'Tool call failed',
  'row.recommended': 'Recommended',
  'row.customLabel': 'Your own answer',
  'row.customPlaceholder': 'Write your own answer here if the options do not cover it',
  'row.import': 'Import to composer',
  'row.fork': 'Branch from here',
  'row.inspect': 'Inspect',
  'copy': 'Copy',
  'copied': 'Copied',
  'markdown.footnotes': 'Footnotes',
};
