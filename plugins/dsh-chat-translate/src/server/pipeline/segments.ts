/**
 * 结构重装配：正文块的 markdown 按结构切开，代码围栏逐字保留，散文段送模型，
 * 回来后**按原结构拼回**——「翻译后 markdown 语法没问题」由构造与形状核对保证，
 * 不再靠向模型索要 ⟦…⟧ 占位符并核对它是否原样带回。
 *
 * 三件事：
 * 1. `splitMarkdownSegments`：把块切成 code / prose 段的有序清单，拼接恒等于原文。
 *    code 段（``` 或 ~~~ 围栏，含未闭合的到块尾）永不送模型；4 空格缩进代码不
 *    单独识别（聊天正文里几乎不出现，行首缩进由形状签名兜住）。
 * 2. `lineSignatures`：一行 markdown 的结构签名——缩进宽、块标记（标题/引用/
 *    列表符）、表格竖线数、链接个数。段译文与原段逐行对签名，任何一行不齐即
 *    形状不符（content 败因）。反引号的增减**不拦**：行内代码是样式不是骨架，
 *    拦它只会把能看的译文打成红线；真破渲染的是行合并/拆开、表格列错位、
 *    列表变段落、链接丢没。
 * 3. `restoreLinkTargets`：链接按出现序对齐后，把原文的 URL 逐个拼回译文——
 *    模型只译 `[文字]`，`(URL)` 由构造保住。个数不等在签名核对里已经出局。
 */

export interface MarkdownSegment {
  readonly kind: 'prose' | 'code';
  readonly text: string;
}

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;
const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;

/** CommonMark 的闭合围栏：同种字符、不短于开头。 */
function closesFence(open: string, line: string): boolean {
  const close = FENCE_CLOSE.exec(line);
  if (!close) return false;
  const marker = close[1] ?? '';
  return marker[0] === open[0] && marker.length >= open.length;
}

/**
 * 把块切成有序段清单；`segments.map(s => s.text).join('') === text` 恒成立。
 * 每段带着自己行尾的换行结束（段与段之间不存在丢失的分隔符），所以散文段的
 * 头尾空白天然包含段间距，重装配逐字拼得回。
 */
export function splitMarkdownSegments(text: string): MarkdownSegment[] {
  const segments: MarkdownSegment[] = [];
  const lines = text.split('\n');
  let start = 0;
  let offset = 0;
  let fence: string | null = null;
  let kind: 'prose' | 'code' = 'prose';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const last = i === lines.length - 1;
    const lineEnd = offset + line.length + (last ? 0 : 1);
    if (fence === null) {
      const open = FENCE_OPEN.exec(line);
      if (open) {
        if (offset > start) segments.push({ kind: 'prose', text: text.slice(start, offset) });
        start = offset;
        kind = 'code';
        fence = open[1] ?? '```';
      }
    } else if (closesFence(fence, line)) {
      segments.push({ kind: 'code', text: text.slice(start, lineEnd) });
      start = lineEnd;
      kind = 'prose';
      fence = null;
    }
    offset = lineEnd;
  }
  if (text.length > start) segments.push({ kind, text: text.slice(start) });
  return segments;
}

const BLOCK_MARKER = /^(#{1,6}[ \t]|>+[ \t]?|[-*+][ \t]|\d{1,3}[.)][ \t])/;
const LINK_SPAN = /\[[^\]]*\]\(([^)]*)\)/g;

/**
 * 一行的结构签名；两行签名相等 ⇔ 结构角色相等。
 * 反引号不在签名里：行内代码是样式不是骨架，增减一对不破渲染（点原文一键
 * 可回），拦它只会把能看的译文打成红线。
 */
export function lineSignature(line: string): string {
  const indent = (/^[ \t]*/.exec(line) ?? [''])[0].replace(/\t/g, '  ').length;
  const marker = BLOCK_MARKER.exec(line)?.[1]?.trim() ?? '';
  const pipes = (line.match(/\|/g) ?? []).length;
  const links = (line.match(LINK_SPAN) ?? []).length;
  return `${indent}|${marker}|${pipes}|${links}`;
}

/** 逐行结构签名；行数不同在比较处即判不符。 */
export function lineSignatures(text: string): string[] {
  return text.split('\n').map(lineSignature);
}

/** 形状核对：逐行签名全等。返回 null = 通过，否则给出不符的行号说明。 */
export function shapeMismatch(original: string, translated: string): string | null {
  const want = lineSignatures(original);
  const got = lineSignatures(translated);
  if (want.length !== got.length) {
    return `line count changed (${want.length} -> ${got.length})`;
  }
  for (let index = 0; index < want.length; index++) {
    if (want[index] !== got[index]) {
      return `structure changed at line ${index + 1} (${want[index]} -> ${got[index]})`;
    }
  }
  return null;
}

/**
 * 把原文的链接目标逐个拼回译文：两侧链接已按签名核对确认等数，按出现序对齐，
 * 译文只贡献 `[文字]` 与括号外的排版。
 */
export function restoreLinkTargets(original: string, translated: string): string {
  const urls: string[] = [];
  for (const match of original.matchAll(LINK_SPAN)) urls.push(match[1] ?? '');
  if (urls.length === 0) return translated;
  let cursor = 0;
  return translated.replace(LINK_SPAN, (span: string) => {
    const open = span.lastIndexOf('(');
    const close = span.lastIndexOf(')');
    const url = urls[cursor++] ?? '';
    return `${span.slice(0, open + 1)}${url}${span.slice(close)}`;
  });
}
