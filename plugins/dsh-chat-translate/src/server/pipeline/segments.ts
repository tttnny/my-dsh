/**
 * 结构重装配：正文块的 markdown 按结构切开，代码围栏逐字保留，散文段送模型，
 * 回来后**按原结构拼回**——「翻译后 markdown 语法没问题」由构造与形状核对保证：
 * 模型从来见不到占位符，也就谈不上带不带回。
 *
 * 三件事：
 * 1. `splitMarkdownSegments`：把块切成 code / prose 段的有序清单，拼接恒等于原文。
 *    code 段（``` 或 ~~~ 围栏，含未闭合的到块尾）永不送模型；4 空格缩进代码不
 *    单独识别（聊天正文里几乎不出现，无记号行的行首缩进由形状签名兜住，
 *    记号行的缩进则随前缀修回）。
 * 2. `lineSignatures`：一行 markdown 的结构签名——块记号的**类别**（标题 h、
 *    引用 q、无序列表 l、有序列表 n）、无记号行的缩进宽、表格竖线数、链接个数。
 *    段译文与原段逐行对签名，任何一行不齐即形状不符（content 败因）。反引号的
 *    增减**不拦**：行内代码是样式不是骨架，拦它只会把能看的译文打成红线；
 *    记号的层级、字符、序号与列表缩进同样**不拦**（`##`→`###`、`-`→`*`、
 *    `1.`→`2.`、`>`→`>>`）——它们是渲染等价的漂移，交给 restoreLineShapes
 *    修回，而不是把整块长回答一票否决。真破渲染的仍是：行合并/拆开、表格列
 *    错位、记号整个丢（列表变段落）、链接丢没、无记号行缩进漂移（变代码块）。
 * 3. `restoreLinkTargets`：链接按出现序对齐后，把原文的 URL 逐个拼回译文——
 *    模型只译 `[文字]`，`(URL)` 由构造保住。个数不等在签名核对里已经出局。
 *    引用式定义行 `[id]: URL` 同账：计数进签名、目标由回填保住。
 * 4. `restoreLineShapes`：过了签名的译文逐行把「前导空白 + 块记号」拼回原文
 *    同款——类别核对保证两侧同角色，前缀修回让标题层级、列表符号、序号、
 *    引用深度与列表缩进的漂移在成品里根本不存在。
 */

export interface MarkdownSegment {
  readonly kind: 'prose' | 'code';
  readonly text: string;
}

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;
// \r 容忍：CRLF 正文的闭合围栏行以 \r\n 结束，不容它会把 ``` 之后整块误判成
// 「未闭合到块尾」逐字保留——散文没送模型还无人报警（审查实测的坑）。
const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})[ \t]*\r?$/;

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

// 行首形状前缀（全匹配 = 前导空白 + 块记号，捕获组 = 记号本体）：嵌套列表的
// 缩进记号行也认——签名按类别放行，缩进随前缀一起修回。
const LINE_SHAPE_PREFIX = /^[ \t]*(#{1,6}[ \t]|>+[ \t]?|[-*+][ \t]|\d{1,3}[.)][ \t])/;
// 链接目标允许一层平衡括号（CommonMark 裸目标规则），捕获组取到完整 URL。
const LINK_SPAN = /\[[^\]]*\]\(((?:[^()]|\([^()]*\))*)\)/g;
// 引用式定义行 `[id]: URL`：与内联链接同账——计数进签名、目标由回填保住。
const LINK_DEF_LINE = /^( {0,3}\[[^\]]+\]:[ \t]*)(\S+)([ \t]*\r?)$/;

/** 记号类别：标题 h、引用 q、无序列表 l、有序列表 n；层级与字符不进类别。 */
function markerClass(marker: string): string {
  if (marker === '') return '';
  const head = marker[0]!;
  if (head === '#') return 'h';
  if (head === '>') return 'q';
  if (head === '-' || head === '*' || head === '+') return 'l';
  return 'n';
}

/**
 * 一行的结构签名；两行签名相等 ⇔ 结构角色相等。
 * 反引号不在签名里：行内代码是样式不是骨架，增减一对不破渲染（点原文一键
 * 可回），拦它只会把能看的译文打成红线。行尾 \r 同样不进签名——模型把
 * CRLF 归一成 LF 是渲染无感的改写，不该拦。块记号只认类别：`##`→`###`、
 * `-`→`*`、序号与引用深度的漂移由 restoreLineShapes 拼回原样，不值得拒收
 * 整块；记号行的缩进也不进签名（它属于会被修回的前缀），无记号行的缩进仍是
 * 硬判据——凭空多出四个空格会把段落变成代码块。
 */
function lineSignature(line: string): string {
  const marker = LINE_SHAPE_PREFIX.exec(line)?.[1]?.trim() ?? '';
  const cls = markerClass(marker);
  const indent =
    cls === '' ? (/^[ \t]*/.exec(line) ?? [''])[0].replace(/\t/g, '  ').length : 'i';
  const pipes = (line.match(/\|/g) ?? []).length;
  const links = (line.match(LINK_SPAN) ?? []).length + (LINK_DEF_LINE.test(line) ? 1 : 0);
  return `${indent}|${cls}|${pipes}|${links}`;
}

/** 逐行结构签名；行数不同在比较处即判不符。 */
function lineSignatures(text: string): string[] {
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
 * 把原文的链接目标逐个拼回译文：内联 `[文字](URL)` 与引用式定义行 `[id]: URL`
 * 都算——两侧已按签名核对确认等数，按出现序对齐，译文只贡献 `[文字]` 与排版。
 */
export function restoreLinkTargets(original: string, translated: string): string {
  const urls: string[] = [];
  for (const match of original.matchAll(LINK_SPAN)) urls.push(match[1] ?? '');
  let out = translated;
  if (urls.length > 0) {
    let cursor = 0;
    out = out.replace(LINK_SPAN, (span: string) => {
      // 目标段的开括号锚在 `]` 之后：URL 里带括号时 lastIndexOf('(') 会咬进
      // URL 内部，把回填变成拼接。
      const open = span.indexOf('(', span.lastIndexOf(']'));
      const close = span.lastIndexOf(')');
      const url = urls[cursor++] ?? '';
      return `${span.slice(0, open + 1)}${url}${span.slice(close)}`;
    });
  }
  const defs: string[] = [];
  for (const line of original.split('\n')) {
    const def = LINK_DEF_LINE.exec(line);
    if (def) defs.push(def[2] ?? '');
  }
  if (defs.length > 0) {
    let cursor = 0;
    out = out
      .split('\n')
      .map((line: string) => {
        const def = LINK_DEF_LINE.exec(line);
        if (!def) return line;
        return `${def[1] ?? ''}${defs[cursor++] ?? def[2] ?? ''}${def[3] ?? ''}`;
      })
      .join('\n');
  }
  return out;
}

/**
 * 逐行把「前导空白 + 块记号」拼回原文同款：签名核对已保证两侧行数相等、
 * 记号类别一致，这里把译文每行的行首前缀换成原文的——标题层级（`##`→`###`）、
 * 列表符号（`-`→`*`）、序号（`2.`→`1.`）、引用深度（`>`→`>>`）与列表缩进
 * 这些渲染等价的漂移就此消失，成品永远带着原文的骨架。记号之后的正文一字
 * 不动；原文行没有记号前缀时整行原样。
 */
export function restoreLineShapes(original: string, translated: string): string {
  const want = original.split('\n');
  const got = translated.split('\n');
  if (want.length !== got.length) return translated;
  return got
    .map((line, index) => {
      const w = LINE_SHAPE_PREFIX.exec(want[index] ?? '');
      if (w === null) return line;
      const g = LINE_SHAPE_PREFIX.exec(line);
      if (g === null) return line;
      // 类别不等时不动手——真到这一步是签名核对放行的边界（如无记号行），
      // 修回只会覆盖模型的内容，越权。
      if (markerClass((w[1] ?? '').trim()) !== markerClass((g[1] ?? '').trim())) return line;
      return `${w[0]}${line.slice(g[0].length)}`;
    })
    .join('\n');
}
