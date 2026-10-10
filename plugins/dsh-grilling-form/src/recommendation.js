// 推荐标记的归一化。
//
// 模型写推荐的方式五花八门：description 末尾的「；推荐」、label 里不带括号的写法、方括号、
// 或干脆给一个 recommended: true 字段。界面只认一种形式——label 末尾的「（推荐）」后缀，
// 于是徽标不渲染、标记原样显示成文字。
//
// 这里把标记统一搬到 label 末尾的「（推荐）」，界面就能一次认出来。显式字段 recommended
// 是另一条更明确的信号，优先于文字。
//
// 归一化后的 label 同时是**选项的身份**：宿主按它查同题内重名、界面按它存勾选。所以除了
// 这个带后缀的 label，还给出 cleanLabel（不含后缀的展示文字）——徽标由界面自己画，导入
// 到输入框的作答也用 cleanLabel，模型写的推荐标记不会跟着用户的消息发回去。

const MARKER = 'recommended|推荐';
// 半角/全角圆括号与方括号/方头括号
const BRACKETED_MARKER = `[（(【\\[]\\s*(?:${MARKER})\\s*[）)】\\]]`;
// 无括号写法必须由分隔符引出，否则「查看推荐」这种正常文字会被误判
const SEPARATOR = '；;，,、:：\\-—';
const TRAILING_PUNCTUATION = '。.！!？?；;，,、~～\\s';

const BRACKETED_SUFFIX = new RegExp(`[\\s]*[${SEPARATOR}]?\\s*${BRACKETED_MARKER}[${TRAILING_PUNCTUATION}]*$`, 'i');
const BARE_SUFFIX = new RegExp(`[\\s]*[${SEPARATOR}]\\s*(?:${MARKER})[${TRAILING_PUNCTUATION}]*$`, 'i');

/** 界面上推荐选项的标记后缀；也是归一化后 label 的收尾。 */
export const RECOMMENDED_LABEL_SUFFIX = '（推荐）';

/**
 * 去掉文本末尾的推荐标记。
 * @param {string} text - label 或 description 原文。
 * @returns {{ text: string, found: boolean }} 去掉标记后的文本，以及是否找到标记。
 */
function stripRecommendationMarker(text) {
  if (typeof text !== 'string') return { text, found: false };
  const match = BRACKETED_SUFFIX.exec(text) ?? BARE_SUFFIX.exec(text);
  if (match === null) return { text, found: false };
  return { text: text.slice(0, match.index).replace(/\s+$/, ''), found: true };
}

/**
 * 把一个 option 归一化成界面能渲染的形式。
 * @param {{ label: string, description?: string, recommended?: boolean }} option - 模型给的选项。
 * @returns {{ originalLabel: string, label: string, cleanLabel: string, description?: string, recommended: boolean }}
 *   label 是选项身份（带「（推荐）」后缀，宿主按它查重、界面按它存勾选）；cleanLabel 是给
 *   用户看的文字（recommended 为 true 时由界面另画徽标）；originalLabel 是模型原本写的 label。
 */
export function normalizeOption(option) {
  const label = stripRecommendationMarker(option.label);
  const description = option.description === undefined ? undefined : stripRecommendationMarker(option.description);
  const recommended = option.recommended === true || label.found || (description !== undefined && description.found);
  const cleanLabel = label.text;
  return {
    originalLabel: option.label,
    label: recommended ? `${cleanLabel}${RECOMMENDED_LABEL_SUFFIX}` : cleanLabel,
    cleanLabel,
    description: description === undefined ? undefined : description.text,
    recommended,
  };
}
