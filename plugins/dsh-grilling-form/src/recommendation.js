// 推荐标记的识别。
//
// 模型写推荐的方式五花八门：末尾带括号的「（推荐）」、不带括号的「；推荐」、方括号、英文写法，
// 而且一段文字末尾可能连着写几种（`（推荐）(Recommended)`）。这里只做两件事：认出来，以及把
// 标记从选项文字里剥干净。剥掉之后剩下的那段文字就是**选项身份**——界面照它渲染、存勾选、
// 画徽标，导入文本照它写回；所以用户的消息里不会跟着模型写的任何一段标记。

const MARKER = 'recommended|推荐';
// 半角/全角圆括号与方括号/方头括号
const BRACKETED_MARKER = `[（(【\\[]\\s*(?:${MARKER})\\s*[）)】\\]]`;
// 无括号写法必须由分隔符引出，否则「查看推荐」这种正常文字会被误判
const SEPARATOR = '；;，,、:：\\-—';
const TRAILING_PUNCTUATION = '。.！!？?；;，,、~～\\s';

const BRACKETED_SUFFIX = new RegExp(`[\\s]*[${SEPARATOR}]?\\s*${BRACKETED_MARKER}[${TRAILING_PUNCTUATION}]*$`, 'i');
const BARE_SUFFIX = new RegExp(`[\\s]*[${SEPARATOR}]\\s*(?:${MARKER})[${TRAILING_PUNCTUATION}]*$`, 'i');

/**
 * 把一个 option 归一化成界面能渲染的形式。
 *
 * 入参是 `unknown`：这是模型输出的入口（宿主从调用参数读、界面从 argsRaw 读），
 * 没验过形状就得逐字段判，而不是先声明成验过的样子。
 * @param {unknown} option - 模型给的选项。
 * @returns {{ label: string, recommended: boolean }} label 是选项身份也是展示文字（标记已剥掉）；
 *   recommended 为 true 时界面另画徽标并默认勾上。label 不是字符串时给空串——它在本包的唯一
 *   后果是「空 label」，由入参校验拒掉，不会变成 undefined 混进别的形状里。
 *   description 是给这个选项的一句补充说明，去掉首尾空白；没写、空白、不是字符串时**没有这个键**
 *   （界面据此决定画不画那一行）。
 */
export function normalizeOption(option) {
  const record = typeof option === 'object' && option !== null && !Array.isArray(option)
    ? /** @type {Record<string, unknown>} */ (option)
    : {};
  const label = stripRecommendationMarker(record.label);
  const description = readExplanation(record.description);
  return {
    label: typeof label.text === 'string' ? label.text : '',
    recommended: label.found,
    ...description === undefined ? {} : { description },
  };
}

/**
 * 归一化一段补充说明：去掉首尾空白，空白或不是字符串都算没写。
 * @param {unknown} value - 模型写的补充说明文字。
 * @returns {string|undefined} 去掉首尾空白之后的那段文字；没写时 undefined。
 */
export function readExplanation(value) {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text === '' ? undefined : text;
}

/**
 * 去掉文本末尾的推荐标记，**一直剥到末尾不再是标记为止**。
 *
 * 模型会把中英两种写法连着写在一段末尾（`（推荐）(Recommended)`），剥一段还剩一段；剩下那段
 * 既会显示在选项文字里、跟插件画的徽标重复，也让它与只写一段的同文选项不再同一身份，同文校验
 * 于是漏过去——而选项身份正是回填时认出用户勾了哪一项的依据。
 * @param {unknown} text - label 原文。
 * @returns {{ text: unknown, found: boolean }} 去掉全部标记后的文本，以及是否找到过标记。
 */
function stripRecommendationMarker(text) {
  if (typeof text !== 'string') return { text, found: false };
  let remaining = text;
  let found = false;
  for (;;) {
    const match = BRACKETED_SUFFIX.exec(remaining) ?? BARE_SUFFIX.exec(remaining);
    if (match === null) break;
    found = true;
    remaining = remaining.slice(0, match.index).replace(/\s+$/, '');
  }
  return { text: remaining, found };
}
