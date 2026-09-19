import { randomTokenId } from './mask-tokens.ts';

/**
 * 思考正文翻译的请求预算。每次请求的输入估算 token 上限，与本地服务的
 * prefill 批次（MAX_NUM_BATCHED_TOKENS）保持同一量级；输出上限写进请求体的
 * max_tokens，避免长文本把剩余上下文全部花在生成上。
 */
export const THINK_MAX_INPUT_TOKENS = 4096;
export const THINK_MAX_OUTPUT_TOKENS = 8192;

/** 汉字与全角标点按一字一 token 计。 */
const CJK_CHAR = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3000-\u303f\uff00-\uffef]/;

/**
 * 保守估算一段文本占用的 token 数：汉字一字一 token，其余每三个字符一 token。
 * 实测本机 hy-mt2-1.8b 的英文语料约为每 3.3 字符一 token，这里取 3 作为上界，
 * 宁可把请求切得比实际需要更碎，也不让服务端收到超出预期的 prefill。
 */
export function estimateTokens(text: string): number {
  let cjk = 0;
  for (const char of text) {
    if (CJK_CHAR.test(char)) cjk += 1;
  }
  return cjk + Math.ceil((text.length - cjk) / 3);
}

/** 按捕获组分隔符切分，并让分隔符留在前一个片段末尾。 */
function splitKeepingSeparator(text: string, pattern: RegExp): string[] {
  const parts = text.split(pattern);
  const chunks: string[] = [];
  for (let index = 0; index < parts.length; index += 2) {
    const content = parts[index] ?? '';
    const separator = parts[index + 1] ?? '';
    if (content === '' && separator === '') continue;
    chunks.push(content + separator);
  }
  return chunks;
}

/** 按句末标点切分，作为空行与单行都切不开时的最后一档。 */
function sentenceChunks(text: string): string[] {
  const chunks = text.match(/[^.!?。！？\n]+[.!?。！？]*[ \t]*\n?/g);
  return chunks === null ? [text] : chunks.filter((chunk) => chunk.length > 0);
}

/** 单块内部找不到自然边界时的兜底：按估算 token 硬切。 */
function hardSlice(text: string, maxTokens: number): string[] {
  const out: string[] = [];
  let current = '';
  let tokens = 0;
  for (const char of text) {
    const cost = CJK_CHAR.test(char) ? 1 : 1 / 3;
    if (current !== '' && tokens + cost > maxTokens) {
      out.push(current);
      current = '';
      tokens = 0;
    }
    current += char;
    tokens += cost;
  }
  if (current !== '') out.push(current);
  return out;
}

/**
 * 把一个块切成不超过上限的片段：优先空行，其次单行，再次句末，最后硬切。
 * 片段按原顺序拼回即为该块的完整译文。
 */
export function splitOversizedBlock(
  text: string,
  maxTokens: number = THINK_MAX_INPUT_TOKENS
): string[] {
  if (estimateTokens(text) <= maxTokens) return [text];

  let chunks = splitKeepingSeparator(text, /(\n{2,})/);
  if (chunks.length <= 1) chunks = splitKeepingSeparator(text, /(\n)/);
  if (chunks.length <= 1) chunks = sentenceChunks(text);

  const out: string[] = [];
  let current = '';
  for (const chunk of chunks) {
    if (estimateTokens(chunk) > maxTokens) {
      if (current !== '') {
        out.push(current);
        current = '';
      }
      out.push(...hardSlice(chunk, maxTokens));
      continue;
    }
    if (current !== '' && estimateTokens(current + chunk) > maxTokens) {
      out.push(current);
      current = '';
    }
    current += chunk;
  }
  if (current !== '') out.push(current);
  return out;
}

/** 一个待翻译的片段：属于哪个块、块内第几段、以及该片段的掩码结果。 */
export interface ThinkPieceShell<TMask> {
  block: number;
  index: number;
  text: string;
  mask: TMask;
}

/** 把片段按原顺序打包成尽量少的请求，且每批不超过输入上限。 */
export function packPieces<T extends { text: string }>(
  pieces: T[],
  maxTokens: number = THINK_MAX_INPUT_TOKENS
): T[][] {
  const batches: T[][] = [];
  let current: T[] = [];
  let tokens = 0;
  for (const piece of pieces) {
    const cost = estimateTokens(piece.text);
    if (current.length > 0 && tokens + cost > maxTokens) {
      batches.push(current);
      current = [];
      tokens = 0;
    }
    current.push(piece);
    tokens += cost;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/**
 * 块分隔标记：`⟪<4 letters><index>⟫`。外括号刻意与掩码占位符的 ⟦⟧ 不同形，
 * 掩码残留检测（只认 ⟦⟧）因此不会把这个标记当成泄漏。
 */
export interface ThinkBatchFormat {
  id: string;
  token: (index: number) => string;
}

export function createThinkBatchFormat(): ThinkBatchFormat {
  const id = randomTokenId();
  return {
    id,
    token: (index: number) => `⟪${id}${index}⟫`,
  };
}

/** 标记出现在被翻译文本里的通用形状，不问 id。 */
const BATCH_TOKEN_PATTERN_SOURCE = '⟪([a-z]{4})(\\d+)⟫';

/** 每个片段以单独一行标记开头，段与段之间空一行。 */
export function buildBatchPayload(pieces: string[], format: ThinkBatchFormat): string {
  return pieces.map((text, index) => `${format.token(index)}\n${text}`).join('\n\n');
}

/**
 * 按标记把整批译文切回每个片段。
 *
 * 序号必须恰好出现一次、按 0..count-1 升序、每段非空，且不得混入其它批次
 * 的标记；任何一条不满足都返回 null，由调用方作废整批并退回单块重试。
 */
export function splitBatchTranslation(
  translated: string,
  format: ThinkBatchFormat,
  count: number
): string[] | null {
  const pattern = new RegExp(BATCH_TOKEN_PATTERN_SOURCE, 'gu');
  const found: Array<{ index: number; start: number; end: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(translated)) !== null) {
    if (match[1].toLowerCase() !== format.id.toLowerCase()) return null;
    const index = Number.parseInt(match[2] ?? '', 10);
    if (Number.isNaN(index)) return null;
    found.push({ index, start: match.index, end: match.index + match[0].length });
  }
  if (found.length !== count) return null;

  const parts: string[] = [];
  for (let index = 0; index < count; index++) {
    const entry = found[index]!;
    if (entry.index !== index) return null;
    const next = found[index + 1];
    const body = translated.slice(entry.end, next === undefined ? translated.length : next.start).trim();
    if (body === '') return null;
    parts.push(body);
  }
  return parts;
}

/** 翻译结果里是否还留着块标记（用于判定整批作废）。 */
export function hasThinkBatchResidue(text: string): boolean {
  return new RegExp(BATCH_TOKEN_PATTERN_SOURCE, 'u').test(text);
}
