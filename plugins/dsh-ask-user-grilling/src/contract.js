// 宿主半边与界面半边共用的纯契约：题目字段的拼法，加轮末补充题这一道由代码追加的题。
//
// 两处必须一致，所以只有这一份：表单页标题与 transcript 卡片标题都按
// mergeNumberIntoHeader 拼；界面按 id 认出轮末补充题，也按 ROUND_END_QUESTION 拿它的题干。
// 各写一份必然漂。

/** 轮末补充题的 id 前缀，同时是模型不得占用的保留前缀。 */
export const RESERVED_ID_PREFIX = '__grill_';

/**
 * 每次调用由代码追加在末尾的补充题。界面半边按 id 认出它，宿主半边把它送进 seam。
 * 选项数组的浅拷贝由宿主在投递前做（seam 侧不再改它，但别把这份常量交出去）。
 */
export const ROUND_END_QUESTION = Object.freeze({
  id: `${RESERVED_ID_PREFIX}round_supplement__`,
  question: '这轮还有什么要补充或调整的吗？',
  header: '轮末补充',
  options: Object.freeze([Object.freeze({ label: '无需补充' })]),
});

/**
 * 去掉首尾空白后是否为空。空串与纯空白都不值得送进表单。
 * @param {unknown} value - 待判定的值。
 * @returns {boolean} 非字符串或去空白后为空时为 true。
 */
export function isBlank(value) {
  return typeof value !== 'string' || value.trim() === '';
}

/**
 * 把题号并进标题：两者都给写作 `<number> · <header>`，只给一个就是那一个；
 * 标题已经以该题号开头时原样送出去（模型常自己写成 "Q2 · Deadline"）。
 * @param {string} [number] - 题号。
 * @param {string} [header] - 标题。
 * @returns {string} 交给界面的标题；两者都缺时为空串（调用方据此省略该字段）。
 */
export function mergeNumberIntoHeader(number, header) {
  const num = isBlank(number) ? undefined : number;
  const head = isBlank(header) ? undefined : header;
  if (num === undefined) return head ?? '';
  if (head === undefined) return num;
  return head.startsWith(num) ? head : `${num} · ${head}`;
}
