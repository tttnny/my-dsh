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
 * 2. `lineSignature`：一行 markdown 的结构签名——块记号的**类别**（标题 h、
 *    引用 q、无序列表 l、有序列表 n）、无记号行的缩进宽、表格竖线数、链接个数。
 *    记号的层级、字符、序号与列表缩进不进签名——渲染等价的漂移交给 repairShape
 *    修回，而不是把整块长回答一票否决。真破渲染的仍是：正文行并拢/拆开、表格
 *    列错位、记号整个丢（列表变段落）、链接丢没、无记号行缩进漂移（变代码块）。
 * 3. `restoreLinkTargets`：链接按出现序对齐后，把原文的 URL 逐个拼回译文——
 *    模型只译 `[文字]`，`(URL)` 由构造保住。个数不等在签名核对里已经出局。
 *    引用式定义行 `[id]: URL` 同账：计数进签名、目标由回填保住。
 * 4. `repairShape`：核对与修形一次过——空行漂移按原文布局重排（弱模型最爱
 *    吞空行，非空行签名对得上就不算破损），行首「前导空白 + 块记号」逐行换
 *    回原文同款（`##`→`###`、`-`→`*`、序号、引用深度、列表缩进的漂移就此
 *    消失）。修不了才回报错误行与理由，进 content 败因的悬停文案。
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

/** 形状核对的只读错误视图：repairShape 的 error 侧。null = 可成立。 */
export function shapeMismatch(original: string, translated: string): string | null {
  return repairShape(original, translated).error;
}

export interface ShapeRepair {
  /** 修好的文本：原文骨架（空行布局 + 行首前缀）+ 译文正文；null = 修不了。 */
  text: string | null;
  /** 修不了时的一句理由，直接进悬停文案。 */
  error: string | null;
}

function isBlankLine(line: string): boolean {
  return line.trim() === '';
}

function indentWidth(line: string): number {
  return (/^[ \t]*/.exec(line) ?? [''])[0].replace(/\t/g, '  ').length;
}

/**
 * 结构行 = 不可重排的行：带块记号（标题/引用/列表）、含竖线（表格行）、
 * 引用式定义行、缩进 >3 的缩进代码。其余非空行是散文行——软换行对渲染
 * 不可见，译文爱并成一行还是拆成几行都随它。
 */
function isStructuralLine(line: string): boolean {
  if (isBlankLine(line)) return false;
  return (
    LINE_SHAPE_PREFIX.test(line) ||
    line.includes('|') ||
    LINK_DEF_LINE.test(line) ||
    indentWidth(line) > 3
  );
}

/** 连续非空行 = 一个段落块；块的数量与顺序就是 markdown 的骨架。 */
function paragraphBlocks(text: string): string[][] {
  const blocks: string[][] = [];
  let cur: string[] | null = null;
  for (const line of text.split('\n')) {
    if (isBlankLine(line)) {
      if (cur !== null) blocks.push(cur);
      cur = null;
    } else {
      (cur ??= []).push(line);
    }
  }
  if (cur !== null) blocks.push(cur);
  return blocks;
}

function blockLinks(block: readonly string[]): number {
  let n = 0;
  for (const line of block) {
    n += (line.match(LINK_SPAN) ?? []).length + (LINK_DEF_LINE.test(line) ? 1 : 0);
  }
  return n;
}

/** 单行修形：签名核对已保证两侧同角色，把译文行首换成原文同款前缀。 */
function spliceLineShape(want: string, got: string): string {
  const w = LINE_SHAPE_PREFIX.exec(want);
  if (w === null) return got;
  const g = LINE_SHAPE_PREFIX.exec(got);
  if (g === null || markerClass((w[1] ?? '').trim()) !== markerClass((g[1] ?? '').trim())) {
    return got;
  }
  return `${w[0]}${got.slice(g[0].length)}`;
}

/**
 * 形状修复：核对与修形一次过，能修的绝不成败因。骨架按**段落块**对齐——
 * 1. 块数必须相等（模型把两段并拢、或把一段劈开，才是真破损）；空行布局
 *    一律取原文——模型吞空行、多空行都被重排消化。
 * 2. 块内**结构行**逐一对齐（记号类别、表格竖线数、链接个数、缩进代码的
 *    缩进），行首前缀修回原文同款：`##`→`###`、`-`→`*`、序号、引用深度、
 *    列表缩进的漂移就此消失。
 * 3. 块内**散文行自由重排**：弱模型把硬折行的英文段落译成一整行中文是常态，
 *    软换行渲染无感；只查整块的链接总数不丢——重排吞不掉 `[文字](URL)`。
 * 4. 块首行的结构/散文属性不得互换：段落被并进列表项（或反之）是渲染破损。
 */
export function repairShape(original: string, translated: string): ShapeRepair {
  const wantLines = original.split('\n');
  const gotLines = translated.split('\n');
  const wantBlocks = paragraphBlocks(original);
  let gotBlocks = paragraphBlocks(translated);
  if (wantBlocks.length !== gotBlocks.length) {
    // 空行漂移改了块数：非空行若逐行签名 1:1 对得上，按原文的非空行位重排。
    const wantFilled = wantLines.filter((line) => !isBlankLine(line));
    const gotFilled = gotLines.filter((line) => !isBlankLine(line));
    if (wantFilled.length !== gotFilled.length) {
      return { text: null, error: `line count changed (${wantLines.length} -> ${gotLines.length})` };
    }
    for (let index = 0; index < wantFilled.length; index++) {
      const sw = lineSignature(wantFilled[index] ?? '');
      const sg = lineSignature(gotFilled[index] ?? '');
      if (sw !== sg) {
        return { text: null, error: `structure changed at line ${index + 1} (${sw} -> ${sg})` };
      }
    }
    let cursor = 0;
    gotBlocks = wantBlocks.map((block) => block.map(() => gotFilled[cursor++] ?? ''));
  }
  // 逐块核对 + 修形。hint 是原文行标游标，指向当前块首行。
  const repaired: string[][] = [];
  let hint = 0;
  for (let index = 0; index < wantBlocks.length; index++) {
    const wb = wantBlocks[index]!;
    const gb = gotBlocks[index] ?? [];
    while (hint < wantLines.length && wantLines[hint] !== wb[0]) hint++;
    const start = hint + 1;
    const wStruct = wb.filter(isStructuralLine);
    const gStruct = gb.filter(isStructuralLine);
    if (wStruct.length !== gStruct.length) {
      return { text: null, error: `structure changed at line ${start} (markers ${wStruct.length} -> ${gStruct.length})` };
    }
    if (isStructuralLine(wb[0] ?? '') !== isStructuralLine(gb[0] ?? '')) {
      return { text: null, error: `structure changed at line ${start} (block start swapped)` };
    }
    if (blockLinks(wb) !== blockLinks(gb)) {
      return { text: null, error: `structure changed at line ${start} (links ${blockLinks(wb)} -> ${blockLinks(gb)})` };
    }
    for (let k = 0; k < wStruct.length; k++) {
      const sw = lineSignature(wStruct[k] ?? '');
      const sg = lineSignature(gStruct[k] ?? '');
      if (sw !== sg) {
        return { text: null, error: `structure changed at line ${start} (${sw} -> ${sg})` };
      }
    }
    let cursor = 0;
    repaired.push(
      gb.map((line) => {
        if (!isStructuralLine(line)) return line;
        return spliceLineShape(wStruct[cursor++] ?? line, line);
      })
    );
    hint += wb.length;
  }
  // 重装配：空行布局取原文，正文块按序放修好的译文行。
  const out: string[] = [];
  let bi = 0;
  let inBlock = false;
  for (const line of wantLines) {
    if (isBlankLine(line)) {
      inBlock = false;
      out.push(line);
      continue;
    }
    if (!inBlock) {
      out.push(...(repaired[bi++] ?? [line]));
      inBlock = true;
    }
  }
  return { text: out.join('\n'), error: null };
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
 * 两侧链接总数是否相等——回填的前置条件：等数才谈得上按出现序对齐；
 * 不等时回填会把原文 URL 串到错的链接上，宁可不回填。
 */
export function linkCountsMatch(a: string, b: string): boolean {
  return blockLinks(a.split('\n')) === blockLinks(b.split('\n'));
}

/**
 * 只修形不核对的旧口：转手 repairShape——行首前缀修回与空行重排都在那里。
 * 修不了时原样返回（调用方自己先看 repairShape 的 error）。
 */
export function restoreLineShapes(original: string, translated: string): string {
  return repairShape(original, translated).text ?? translated;
}
