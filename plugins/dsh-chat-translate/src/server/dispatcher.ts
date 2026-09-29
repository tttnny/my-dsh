import { describeError } from '../describe-error.ts';
import type {
  ITranslationAdapter,
  PluginConfig,
  ReplyBlockResult,
  ReplyFailReason,
} from './types.ts';
import type { ConfigManager } from './config.ts';
import { LruDiskCache } from './cache.ts';
import type { KeyReader } from './credentials.ts';
import { OpenAiCompatibleAdapter } from './adapters/openai.ts';
import {
  buildBatchPayload,
  createBatchFormat,
  hasBatchResidue,
  packPieces,
  splitBatchTranslation,
  splitOversizedBlock,
  REPLY_MAX_OUTPUT_TOKENS,
} from './pipeline/blocks.ts';
import { restoreLinkTargets, shapeMismatch, splitMarkdownSegments } from './pipeline/segments.ts';

/**
 * The one and only channel id for the reply path: the adapter registry keys on
 * it, so a test can swap the adapter without the reply path losing track of
 * which adapter serves it.
 */
const CHANNEL_ID = 'openai';

/**
 * 形状拒收：通道正常返回了响应，只是这份内容没通过结构核对——逐行签名
 * （行数、缩进、块标记、表格竖线、链接个数）与原文不齐，或译文里还留着
 * `⟪…⟫` 块标记。这类败因记 `content`（红虚线），其余一律
 * `transport`（红实线）。每行只跑首跑，失败等用户点击救活。
 */
class ContentRejectedError extends Error {}

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
 * 片段败因账本：pieceKey → 败因。transport 是吸收态——通道伤过一次就按
 * transport 报，content 不再覆盖；从未记账的缺失同样按 transport 兜底
 * （说不清败因时「重试可能有用」是更诚实的默认）。
 */
type FailureLedger = Map<string, ReplyFailReason>;

/** 败因分类：只有对返回内容本身的拒收算 content，其余都说明通道受过伤。 */
function classifyReplyError(err: unknown): ReplyFailReason {
  return err instanceof ContentRejectedError ? 'content' : 'transport';
}

function recordLedgerFailure(
  ledger: FailureLedger,
  keys: readonly string[],
  reason: ReplyFailReason
): void {
  for (const key of keys) {
    if (reason === 'transport' || !ledger.has(key)) ledger.set(key, reason);
  }
}

/**
 * 块败因合成：只评判**缺失**的片段——成功译出的片段本就不记账，把「没留账」
 * 当 transport 判据会把「前段批成功、后段历次形状拒收」的多片段块误报成传输
 * 失败（超长块的切片几乎必然落进不同批，这是常见路径而非防御分支）。缺失片段
 * 里只要不是清一色的 content，整块按 transport 报；清一色 content 才记 content。
 */
function blockFailReason(ledger: FailureLedger, block: number, missing: readonly number[]): ReplyFailReason {
  for (const index of missing) {
    if (ledger.get(replyPieceKey({ block, index })) !== 'content') return 'transport';
  }
  return 'content';
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
   * 失败时退回逐片段单发。每个片段的译文要过形状核对（逐行结构签名与原文全
   * 等）并通过链接目标回填才算成立——「翻译后 markdown 语法没问题」由构造与
   * 核对保证，不向模型索要任何占位符。
   *
   * 调用方传进来的每个块要么整块译出、要么整块保持原文：任一片段缺失都让该块
   * 作废，避免半中半英的段落；失败块带 `reason` 分类（见 {@link blockFailReason}），
   * 客户端据此画红实线或红虚线。每行只跑首跑一次，失败的救活由用户的点击发起。
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
      reason: 'transport' as ReplyFailReason,
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
    const totals = new Map<number, number>();

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
      totals.set(block, count);
    }

    const ledger: FailureLedger = new Map();
    const translated = new Map<string, string>();
    for (const batch of packPieces(pieces)) {
      const outcome = await this.runReplySerial(() =>
        this.translateReplyBatch(adapter, batch, config, ledger)
      );
      for (const [key, value] of outcome) translated.set(key, value);
    }

    for (const [block, total] of totals) {
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
        results[block].reason = blockFailReason(ledger, block, missing);
        continue;
      }
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
   * 一整批一次请求；失败则该批逐片段单发重试一次，仍失败的片段直接放弃
   * （保留原文）——救活它的是用户的点击，不是后台流量。失败的片段不进缓存。
   *
   * 每次失败都按败因记进片段的分类账本（{@link FailureLedger}）：批请求的
   * 失败摊到批内每个片段，单发重试的失败只记该片段；块级 reason 由缺失片段
   * 的账本合成（任一尝试是传输伤 → transport；全部是形状拒收 → content）。
   */
  private async translateReplyBatch(
    adapter: ITranslationAdapter,
    batch: ReplyPiece[],
    config: PluginConfig,
    ledger: FailureLedger
  ): Promise<Map<string, string>> {
    const pieceKeys = batch.map((piece) => replyPieceKey(piece));
    try {
      return await this.requestReplyBatch(adapter, batch, config);
    } catch (err) {
      recordLedgerFailure(ledger, pieceKeys, classifyReplyError(err));
      console.warn(
        `[dsh-chat-translate] reply batch of ${batch.length} failed, retrying per block: ${describeError(err)}`
      );
    }

    const out = new Map<string, string>();
    for (const piece of batch) {
      try {
        for (const [key, value] of await this.requestReplyBatch(adapter, [piece], config)) {
          out.set(key, value);
        }
      } catch (err) {
        recordLedgerFailure(ledger, [replyPieceKey(piece)], classifyReplyError(err));
        console.warn(
          `[dsh-chat-translate] reply block ${piece.block} #${piece.index} failed, keeping the original: ${describeError(err)}`
        );
      }
    }
    return out;
  }

  /** 发出一次正文请求，并对每个片段的返回做形状核对与链接回填。 */
  private async requestReplyBatch(
    adapter: ITranslationAdapter,
    batch: ReplyPiece[],
    config: PluginConfig
  ): Promise<Map<string, string>> {
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
          throw new ContentRejectedError('reply block markers did not survive the translation');
        }
        answers = parts;
      }
    } finally {
      clearTimeout(timer);
    }

    const out = new Map<string, string>();
    batch.forEach((piece, index) => {
      const answer = (answers[index] ?? '').trim();
      if (!answer) {
        throw new Error(`reply block ${piece.block} #${piece.index} came back empty`);
      }
      if (hasBatchResidue(answer)) {
        throw new ContentRejectedError('reply translation left a block marker behind');
      }
      const mismatch = shapeMismatch(piece.text, answer);
      if (mismatch !== null) {
        throw new ContentRejectedError(
          `reply piece ${piece.block} #${piece.index} broke the markdown shape: ${mismatch}`
        );
      }
      out.set(replyPieceKey(piece), piece.head + restoreLinkTargets(piece.text, answer) + piece.tail);
    });
    return out;
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
