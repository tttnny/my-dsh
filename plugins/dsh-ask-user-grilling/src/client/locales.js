/** 本插件卡片自己的文案字典。名字空间归本插件，复用别人的名字空间会在对方改键时静默失效。 */

/** 字典名字空间。 */
export const NS = 'askGrilling';

/** 简体中文（键集的事实来源）。 */
export const zh = {
  'row.title': '提问',
  'row.waiting': '等待回答',
  'row.answered': '{answered}/{total} 已回答',
  'row.skipped': '未回答',
  'row.rejected': '入参被拒绝',
  'row.cancelled': '已取消',
  'row.cancelledDetail': '本轮已取消，未提交回答。',
  'row.interrupted': '已中断',
  'row.interruptedDetail': '本轮已中断，未提交回答。',
  'row.failed': '调用失败',
  'row.violations': '校验失败',
  'row.inspect': '查看',
  'copy': '复制',
  'copied': '已复制',
  'markdown.footnotes': '脚注',
};

/** 英文，键集与中文逐条对齐。 */
export const en = {
  'row.title': 'Ask question',
  'row.waiting': 'waiting for the answer',
  'row.answered': '{answered}/{total} answered',
  'row.skipped': 'Not answered',
  'row.rejected': 'Rejected before asking',
  'row.cancelled': 'cancelled',
  'row.cancelledDetail': 'This round was cancelled before answers were submitted.',
  'row.interrupted': 'interrupted',
  'row.interruptedDetail': 'This round was interrupted before answers were submitted.',
  'row.failed': 'Tool call failed',
  'row.violations': 'Rejected input',
  'row.inspect': 'Inspect',
  'copy': 'Copy',
  'copied': 'Copied',
  'markdown.footnotes': 'Footnotes',
};
