import { describeError } from '../describe-error.ts';
import type {
  ITranslationAdapter,
  PluginConfig,
  ReplyBlockResult,
} from './types.ts';
import type { ConfigManager } from './config.ts';
import { LruDiskCache } from './cache.ts';
import type { KeyReader } from './credentials.ts';
import { OpenAiCompatibleAdapter } from './adapters/openai.ts';
import {
  buildBatchPayload,
  createBatchFormat,
  packPieces,
  splitBatchTranslation,
  splitOversizedBlock,
  stripBatchMarkers,
  REPLY_MAX_OUTPUT_TOKENS,
} from './pipeline/blocks.ts';
import {
  linkCountsMatch,
  repairShape,
  restoreLinkTargets,
  splitMarkdownSegments,
} from './pipeline/segments.ts';

/**
 * The one and only channel id for the reply path: the adapter registry keys on
 * it, so a test can swap the adapter without the reply path losing track of
 * which adapter serves it.
 */
const CHANNEL_ID = 'openai';

/**
 * 正文的一个待翻译片段：所属块、块内片段序号，以及拆出来的头尾空白与核心文本
 * （`text` 即核心，与打包器的预算字段同名）。头尾空白由重装配原样拼回——模型
 * 爱吞行尾空行，段间距不能指望它带回；送模型与做形状核对的都只有 `text`。
 */
interface ReplyPiece {
  block: number;
  index: number;
  text: string;
  head: string;
  tail: string;
}

/** 片段在结果映射里的键。 */
function replyPieceKey(piece: { block: number; index: number }): string {
  return `${piece.block}:${piece.index}`;
}

/** 块的一个拼装部件：逐字保留段（代码围栏、纯空白段、片段头尾另存）或片段引用。 */
type BlockPart = { verbatim: string } | { piece: number };

/**
 * 片段失败账本：pieceKey → 一句技术细节（进悬停文案）。只有通道伤会留账——
 * 译文形状问题由修复、重掷、照收三层消化，不再是否决理由。从未记账的缺失
 * 兜底为「没译回来」，因为说不出细节时这就是最诚实的描述。
 */
type FailureLedger = Map<string, string>;

function recordLedgerFailure(ledger: FailureLedger, keys: readonly string[], detail: string): void {
  for (const key of keys) {
    if (!ledger.has(key)) ledger.set(key, detail);
  }
}

/** 块败因细节：取第一个说得出话的缺失片段。 */
function blockFailureDetail(ledger: FailureLedger, block: number, missing: readonly number[]): string {
  for (const index of missing) {
    const detail = ledger.get(replyPieceKey({ block, index }));
    if (detail !== undefined) return detail;
  }
  return 'no translation came back';
}

/** 把一段文本拆成 {head, core, tail}；core 为全空白时返回 null（整段逐字保留）。 */
function stripEdges(chunk: string): { core: string; head: string; tail: string } | null {
  const head = /^[ \t\r\n]*/.exec(chunk)![0];
  if (head.length >= chunk.length) return null;
  const body = chunk.slice(head.length);
  const tail = /[ \t\r\n]*$/.exec(body)![0];
  const core = body.slice(0, body.length - tail.length);
  return core === '' ? null : { core, head, tail };
}

export class TranslationDispatcher {
  private configManager: ConfigManager;
  private cache: LruDiskCache;
  private adapters = new Map<string, ITranslationAdapter>();
  /** 正文请求的串行队列尾，保证同时最多一个在途请求。 */
  private replyTail: Promise<void> = Promise.resolve();

  constructor(configManager: ConfigManager, cache: LruDiskCache, credentials?: KeyReader) {
    this.configManager = configManager;
    this.cache = cache;

    // 正文只有一条通道。map 仍按 id 索引，测试可以换成同 id 的假适配器。
    this.registerAdapter(new OpenAiCompatibleAdapter(credentials ?? { getApiKey: () => '' }));
  }

  private registerAdapter(adapter: ITranslationAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  /**
   * 翻译回答正文的块：本次唯一的翻译入口。
   *
   * 每个块先按 markdown 结构切成段：代码围栏与纯空白段**逐字保留、永不送
   * 模型**；散文段再按输入上限切片、各自成片段。相邻片段打包成一个请求；整批
   * 失败时退回逐片段单发。每个片段的译文过 `repairShape`（段落块对齐 + 前缀
   * 修回 + 空行重排）并通过链接目标回填才算修好。
   *
   * **形状问题不否决内容**：修不好的片段自动重掷一次；再修不好就照收模型的
   * 译文（链接数不等时不回填，其余原样）——原文一键可回，可读的译文优先于
   * 一根红线。失败只剩通道伤一种：超时、断流、空返回，红实线 + 悬停报细节，
   * 救活由用户的点击发起。
   *
   * 调用方传进来的每个块要么整块译出、要么整块保持原文：任一片段缺失都让该块
   * 作废，避免半中半英的段落；失败块带 `detail` 一句技术细节。每行只跑首跑
   * 一次，通道恢复后由点击救活。
   *
   * 客户端按与宿主同源的 4096 估算 token 切批，所以一个 markdown 块可能跨多次
   * 调用；每次调用都独立决定成败，不会出现「前一段已挂译文、后一段失败」的
   * 半截结果。
   */
  async translateReplyBlocks(blocks: string[]): Promise<ReplyBlockResult[]> {
    const results: ReplyBlockResult[] = blocks.map((original) => ({
      original,
      translated: original,
      ok: false,
      cached: false,
    }));

    const config = this.configManager.getConfig();
    if (!config.enabled) return results;

    // The channel id is fixed: the reply path has exactly one channel.
    const adapter = this.adapters.get(CHANNEL_ID);
    if (!adapter || !adapter.isAvailable(config)) return results;

    return this.serveReplyBlocks(blocks, results, adapter, config);
  }

  /** 通道可用之后的正文执行段：切段、打包、请求、拼装。 */
  private async serveReplyBlocks(
    blocks: string[],
    results: ReplyBlockResult[],
    adapter: ITranslationAdapter,
    config: PluginConfig
  ): Promise<ReplyBlockResult[]> {
    const pieces: ReplyPiece[] = [];
    const partsByBlock = new Map<number, BlockPart[]>();

    for (let block = 0; block < blocks.length; block++) {
      const raw = blocks[block] ?? '';
      if (raw.trim() === '') continue;
      const cached = this.cache.get(raw.trim().toLowerCase());
      if (cached) {
        results[block] = { original: raw, translated: cached, ok: true, cached: true };
        continue;
      }
      const parts: BlockPart[] = [];
      let count = 0;
      for (const segment of splitMarkdownSegments(raw)) {
        const edges = segment.kind === 'code' ? null : stripEdges(segment.text);
        if (edges === null) {
          // 代码围栏或纯空白段：逐字保留，不进请求。
          parts.push({ verbatim: segment.text });
          continue;
        }
        for (const chunk of splitOversizedBlock(segment.text)) {
          const pieceEdges = stripEdges(chunk);
          if (pieceEdges === null) {
            parts.push({ verbatim: chunk });
            continue;
          }
          parts.push({ piece: count });
          pieces.push({ block, index: count, text: pieceEdges.core, head: pieceEdges.head, tail: pieceEdges.tail });
          count += 1;
        }
      }
      partsByBlock.set(block, parts);
    }

    const ledger: FailureLedger = new Map();
    const translated = new Map<string, string>();
    for (const batch of packPieces(pieces)) {
      const outcome = await this.runReplySerial(() =>
        this.translateReplyBatch(adapter, batch, config, ledger)
      );
      for (const [key, value] of outcome) translated.set(key, value);
    }

    for (const block of partsByBlock.keys()) {
      const parts: string[] = [];
      const missing: number[] = [];
      for (const part of partsByBlock.get(block) ?? []) {
        if ('verbatim' in part) {
          parts.push(part.verbatim);
          continue;
        }
        const value = translated.get(replyPieceKey({ block, index: part.piece }));
        if (value === undefined) {
          missing.push(part.piece);
          continue;
        }
        parts.push(value);
      }
      if (missing.length > 0) {
        results[block].detail = blockFailureDetail(ledger, block, missing);
        continue;
      }
      // 全围栏块（零片段）也走到这里：拼回即原文，按「已是最终形态」记成功
      // 挂蓝线——与「模型原样返回也算翻过」同一语义，不另造第三种状态。
      const original = blocks[block]!;
      const finalText = parts.join('');
      this.cache.set(original.trim().toLowerCase(), finalText);
      results[block] = {
        original,
        translated: finalText,
        ok: true,
        cached: false,
      };
    }

    return results;
  }

  /**
   * 一整批一次请求；批内修不好的片段与整批的失败都退回逐片段单发。单发仍
   * 修不好的**照收**（见 {@link translateReplyBlocks}）——只有通道伤才让片段
   * 缺失，失败的片段不进缓存。
   *
   * 每次通道失败都记进片段账本（{@link FailureLedger}）：批请求的失败摊到
   * 批内每个片段，单发的失败只记该片段；块级细节由缺失片段的账本合成。
   */
  private async translateReplyBatch(
    adapter: ITranslationAdapter,
    batch: ReplyPiece[],
    config: PluginConfig,
    ledger: FailureLedger
  ): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const stragglers: ReplyPiece[] = [];
    try {
      const answers = await this.fetchReplyAnswers(adapter, batch, config);
      batch.forEach((piece, index) => {
        const answer = answers[index] ?? '';
        const repair = repairShape(piece.text, answer);
        if (repair.text !== null) {
          out.set(replyPieceKey(piece), this.assemble(piece, repair.text, true));
        } else {
          stragglers.push(piece);
        }
      });
    } catch (err) {
      recordLedgerFailure(ledger, batch.map((piece) => replyPieceKey(piece)), describeError(err));
      console.warn(
        `[dsh-chat-translate] reply batch of ${batch.length} failed, retrying per block: ${describeError(err)}`
      );
      stragglers.push(...batch);
    }

    for (const piece of stragglers) {
      const key = replyPieceKey(piece);
      if (out.has(key)) continue;
      let answer: string | null = null;
      // 修不好的形状自动重掷一次：弱模型的漂移是随机的，再问一次常常就齐了。
      // 通道伤不重掷——断了就断了，重试只是白烧流量，救活归用户的点击。
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          answer = (await this.fetchReplyAnswers(adapter, [piece], config))[0] ?? '';
        } catch (err) {
          if (answer === null) {
            recordLedgerFailure(ledger, [key], describeError(err));
            console.warn(
              `[dsh-chat-translate] reply block ${piece.block} #${piece.index} failed, keeping the original: ${describeError(err)}`
            );
          }
          break;
        }
        if (repairShape(piece.text, answer).text !== null) break;
      }
      if (answer === null) continue;
      const repair = repairShape(piece.text, answer);
      if (repair.text !== null) {
        out.set(key, this.assemble(piece, repair.text, true));
        continue;
      }
      // 第三层防线：照收。结构没修齐也展示模型的译文——链接数不等时不回填
      // （回填会把 URL 串到错的链接上），其余原样；读不顺还有原文一键可回。
      console.warn(
        `[dsh-chat-translate] reply block ${piece.block} #${piece.index} shape kept as the model wrote it: ${repair.error}`
      );
      out.set(key, this.assemble(piece, answer, linkCountsMatch(piece.text, answer)));
    }
    return out;
  }

  /** 片段的最终拼装：头尾空白 + （可选）链接回填 + 译文。 */
  private assemble(piece: ReplyPiece, text: string, restoreLinks: boolean): string {
    return piece.head + (restoreLinks ? restoreLinkTargets(piece.text, text) : text) + piece.tail;
  }

  /**
   * 发出一次正文请求，返回逐片段的裸答案（打包标记已剥除、首尾已 trim）。
   * 空返回与打包拆不回都按通道失败抛出——形状对不对在这里不算败因。
   */
  private async fetchReplyAnswers(
    adapter: ITranslationAdapter,
    batch: ReplyPiece[],
    config: PluginConfig
  ): Promise<string[]> {
    const timeout = config.aiTimeoutMs || 600000;
    const abortCtrl = new AbortController();
    const timer = setTimeout(() => abortCtrl.abort(), timeout);
    let answers: string[];
    try {
      if (batch.length === 1) {
        answers = [
          await adapter.translate(batch[0]!.text, abortCtrl.signal, config, {
            maxTokens: REPLY_MAX_OUTPUT_TOKENS,
            mode: 'plain',
          }),
        ];
      } else {
        const format = createBatchFormat();
        const answer = await adapter.translate(
          buildBatchPayload(
            batch.map((piece) => piece.text),
            format
          ),
          abortCtrl.signal,
          config,
          { maxTokens: REPLY_MAX_OUTPUT_TOKENS, mode: 'blocks' }
        );
        const parts = splitBatchTranslation(answer, format, batch.length);
        if (parts === null) {
          throw new Error('batch markers did not survive the answer');
        }
        answers = parts;
      }
    } catch (err) {
      // 超时打断的原始报错（AbortError 一类）说不出「超时」二字，就地换成
      // 能进悬停文案的说法。
      if (abortCtrl.signal.aborted) {
        throw new Error(`channel timed out after ${timeout}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    const stripped = answers.map((answer) => stripBatchMarkers(answer).trim());
    if (stripped.some((answer) => answer === '')) {
      throw new Error('translation came back empty');
    }
    return stripped;
  }

  /** 串行执行器：同时最多一个在途请求。 */
  private runReplySerial<T>(task: () => Promise<T>): Promise<T> {
    const next = this.replyTail.then(task, task);
    this.replyTail = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }

  /**
   * 通道探针：设置面板的「测试 AI 通道」按钮走这里。探测文本用一句英文正文，
   * 与真实请求同形；它一次请求都不写正文账本，正文的成败也不影响按钮。
   */
  async testChannel(channelId: string): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const adapter = this.adapters.get(channelId);
    const config = this.configManager.getConfig();
    if (!adapter) {
      return { ok: false, latencyMs: 0, error: `Channel ${channelId} not found` };
    }
    if (!adapter.isAvailable(config)) {
      return { ok: false, latencyMs: 0, error: `Channel ${channelId} is not configured or disabled` };
    }
    const testText = 'Here is what I changed.';
    const start = Date.now();
    try {
      const timeout = Math.min(config.aiTimeoutMs || 30000, 30000);
      const abortCtrl = new AbortController();
      const timer = setTimeout(() => abortCtrl.abort(), timeout);
      let res = '';
      try {
        res = await adapter.translate(testText, abortCtrl.signal, config);
      } finally {
        clearTimeout(timer);
      }

      const latencyMs = Date.now() - start;
      if (res && res.trim()) {
        return { ok: true, latencyMs };
      }
      return { ok: false, latencyMs, error: 'Empty translation returned' };
    } catch (err: any) {
      return { ok: false, latencyMs: Date.now() - start, error: describeError(err) };
    }
  }
}
