// 推荐标记的归一化。
//
// 客户端（@deepseek-ai/dsh-client-ui-user-questions 的 parseRecommendedLabel）
// 只有一个判定依据：option.label 必须以半角或全角的括号推荐字样收尾；option.description
// 完全不参与。模型经常把推荐写成 description 末尾的「；推荐」，或者写成 label 里不带
// 括号的形式，于是徽标不渲染、标记原样显示成文字。
//
// 这里在题目交给 ctx.userQuestions.ask 之前把标记统一搬到 label 末尾的「（推荐）」，
// 客户端就能认出并渲染徽标。显式字段 recommended 是另一条更明确的信号，优先于文字。

const MARKER = 'recommended|推荐';
// 半角/全角圆括号与方括号/方头括号
const BRACKETED_MARKER = `[（(【\\[]\\s*(?:${MARKER})\\s*[）)】\\]]`;
// 无括号写法必须由分隔符引出，否则「查看推荐」这种正常文字会被误判
const SEPARATOR = '；;，,、:：\\-—';
const TRAILING_PUNCTUATION = '。.！!？?；;，,、~～\\s';

const BRACKETED_SUFFIX = new RegExp(`[\\s]*[${SEPARATOR}]?\\s*${BRACKETED_MARKER}[${TRAILING_PUNCTUATION}]*$`, 'i');
const BARE_SUFFIX = new RegExp(`[\\s]*[${SEPARATOR}]\\s*(?:${MARKER})[${TRAILING_PUNCTUATION}]*$`, 'i');

/** 供测试核对客户端规则的推荐标记后缀；客户端只认 label 末尾的这两种括号写法。 */
export const RECOMMENDED_LABEL_SUFFIX = '（推荐）';

/**
 * 去掉文本末尾的推荐标记。
 * @param {string} text - label 或 description 原文。
 * @returns {{ text: string, found: boolean }} 去掉标记后的文本，以及是否找到标记。
 */
export function stripRecommendationMarker(text) {
  if (typeof text !== 'string') return { text, found: false };
  const match = BRACKETED_SUFFIX.exec(text) ?? BARE_SUFFIX.exec(text);
  if (match === null) return { text, found: false };
  return { text: text.slice(0, match.index).replace(/\s+$/, ''), found: true };
}

/**
 * 把一个 option 归一化成客户端能渲染的形式。
 * @param {{ label: string, description?: string, recommended?: boolean }} option - 模型给的选项。
 * @returns {{ originalLabel: string, label: string, description?: string, recommended: boolean }}
 *   交给界面时用 label/description；回传答案时用 originalLabel 还原模型原本写的 label。
 */
export function normalizeOption(option) {
  const label = stripRecommendationMarker(option.label);
  const description = option.description === undefined ? undefined : stripRecommendationMarker(option.description);
  const recommended = option.recommended === true || label.found || (description !== undefined && description.found);
  const cleanLabel = label.text;
  return {
    originalLabel: option.label,
    label: recommended ? `${cleanLabel}${RECOMMENDED_LABEL_SUFFIX}` : cleanLabel,
    description: description === undefined ? undefined : description.text,
    recommended,
  };
}
