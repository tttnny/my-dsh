/** 本插件表单行自己的文案字典。名字空间归本插件，复用别人的名字空间会在对方改键时静默失效。 */

/** 字典名字空间。 */
export const NS = 'grillingForm';

/** 简体中文（键集的事实来源）。 */
export const zh = {
  'row.frozenSummary': '本轮已过 · {total} 题 · 已填 {answered}',
  'row.unanswered': '本轮没有通过表单作答',
  'row.rejected': '入参被拒绝',
  'row.violations': '校验失败',
  'row.failed': '调用失败',
  'row.recommended': '推荐',
  'row.customLabel': '自填',
  'row.customPlaceholder': '选项不够用的话，在这里自己写一段',
  'row.import': '导入输入框',
  'row.imported': '已导入',
  'row.updateImport': '更新输入框',
  'row.importDisabled': '先在上面勾选或自填',
  'row.fork': '从这里分叉',
  'row.forkFailed': '分叉失败，请重试',
  'row.inspect': '查看',
  'copy': '复制',
  'copied': '已复制',
  'markdown.footnotes': '脚注',
};

/** 英文，键集与中文逐条对齐。 */
export const en = {
  'row.frozenSummary': 'Round over · {total} question(s) · {answered} answered',
  'row.unanswered': 'This round was answered without the form',
  'row.rejected': 'Rejected before showing',
  'row.violations': 'Rejected input',
  'row.failed': 'Tool call failed',
  'row.recommended': 'Recommended',
  'row.customLabel': 'Your own answer',
  'row.customPlaceholder': 'Write your own answer here if the options do not cover it',
  'row.import': 'Import to composer',
  'row.imported': 'Imported',
  'row.updateImport': 'Update composer',
  'row.importDisabled': 'Pick or write an answer above first',
  'row.fork': 'Branch from here',
  'row.forkFailed': 'Branch failed; try again',
  'row.inspect': 'Inspect',
  'copy': 'Copy',
  'copied': 'Copied',
  'markdown.footnotes': 'Footnotes',
};
