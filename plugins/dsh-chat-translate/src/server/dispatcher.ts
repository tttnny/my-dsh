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
  ContentMaskingPipeline,
  type MaskResult,
} from './pipeline/masking.ts';
import { hasMaskResidue } from './pipeline/mask-tokens.ts';
import {
  buildBatchPayload,
  createBatchFormat,
  hasBatchResidue,
  packPieces,
  splitBatchTranslation,
  splitOversizedBlock,
  REPLY_MAX_OUTPUT_TOKENS,
} from './pipeline/blocks.ts';

/**
 * The one and only channel id for the reply path: the adapter registry keys on
 * it, so a test can swap the adapter without the reply path losing track of
 * which adapter serves it.
 */
const CHANNEL_ID = 'openai';

/**
 * 内容级拒收：通道正常返回了响应，只是这份内容没通过校验（块标记或
 * ⟦…⟧ 占位符被改写、丢失）。它是失败分类账本的输入：这类败因记
 * `content`，其余一律 `transport`；线型映射单点在 server/types.ts 与
 * styles.ts 的 ProseMark。每行只跑首跑，失败等用户点击救活。
 */
class ContentRejectedError extends Error {}

/** 正文的一个待翻译片段：所属块、块内序号、掩码文本与还原信息。 */
interface ReplyPiece {
  block: number;
  index: number;
  text: string;
  mask: MaskResult;
}

/** 片段在结果映射里的键。 */
function replyPieceKey(piece: { block: number; index: number }): string {
  return `${piece.block}:${piece.index}`;
}

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

/** 块败因合成：缺失片段里只要不是清一色的 content，整块按 transport 报。 */
function blockFailReason(ledger: FailureLedger, block: number, total: number): ReplyFailReason {
  for (let index = 0; index < total; index++) {
    if (ledger.get(replyPieceKey({ block, index })) !== 'content') return 'transport';
  }
  return 'content';
}

export class TranslationDispatcher {
  private configManager: ConfigManager;
  private cache: LruDiskCache;
  private credentials: KeyReader;
  private masking = new ContentMaskingPipeline();
  private adapters = new Map<string, ITranslationAdapter>();
  /** 正文请求的串行队列尾，保证同时最多一个在途请求。 */
  private replyTail: Promise<void> = Promise.resolve();

  constructor(configManager: ConfigManager, cache: LruDiskCache, credentials?: KeyReader) {
    this.configManager = configManager;
    this.cache = cache;
    this.credentials = credentials ?? { getApiKey: () => '' };

    // 正文只有一条通道。map 仍按 id 索引，测试可以换成同 id 的假适配器。
    this.registerAdapter(new OpenAiCompatibleAdapter(this.credentials));
  }

  private registerAdapter(adapter: ITranslationAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  /**
   * 翻译回答正文的块：本次唯一的翻译入口。
   *
   * 每个块先按输入上限切成片段，再各自掩码、相邻片段打包成一个请求；整批失败
   * 时退回逐片段单发。调用方传进来的每个块要么整块译出、要么整块保持原文：
   * 任一片段缺失（含掩码还原不通过）都让该块作废，避免半中半英的段落；失败块
   * 带 `reason` 分类（见 {@link blockFailReason}），客户端据此画红实线或红虚线。
   * 每行只跑首跑一次，失败的救活由用户的点击发起。
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

  /** 通道可用之后的正文执行段：切块、打包、请求、拼装。 */
  private async serveReplyBlocks(
    blocks: string[],
    results: ReplyBlockResult[],
    adapter: ITranslationAdapter,
    config: PluginConfig
  ): Promise<ReplyBlockResult[]> {
    const pieces: ReplyPiece[] = [];
    for (let block = 0; block < blocks.length; block++) {
      const text = (blocks[block] ?? '').trim();
      if (!text) continue;
      const cached = this.cache.get(text.toLowerCase());
      if (cached) {
        results[block] = {
          original: blocks[block]!,
          translated: cached,
          ok: true,
          cached: true,
        };
        continue;
      }
      for (const [index, part] of splitOversizedBlock(text).entries()) {
        const mask = this.masking.mask(part);
        pieces.push({
          block,
          index,
          text: mask.maskedText,
          mask,
        });
      }
    }

    const ledger: FailureLedger = new Map();
    const translated = new Map<string, string>();
    for (const batch of packPieces(pieces)) {
      const outcome = await this.runReplySerial(() =>
        this.translateReplyBatch(adapter, batch, config, ledger)
      );
      for (const [key, value] of outcome) translated.set(key, value);
    }

    const totals = new Map<number, number>();
    for (const piece of pieces) totals.set(piece.block, (totals.get(piece.block) ?? 0) + 1);

    for (const [block, total] of totals) {
      const parts: string[] = [];
      let complete = true;
      for (let index = 0; index < total; index++) {
        const part = translated.get(`${block}:${index}`);
        if (part === undefined) {
          complete = false;
          break;
        }
        parts.push(part);
      }
      if (!complete) {
        results[block].reason = blockFailReason(ledger, block, total);
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
   * 的账本合成（任一尝试是传输伤 → transport；全部是内容拒收 → content）。
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

  /** 发出一次正文请求并把结果还原成每个片段的最终译文。 */
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
          buildBatchPayload(batch.map((piece) => piece.text), format),
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
      let finalText: string;
      try {
        finalText = piece.mask.unmask(answer);
      } catch (unmaskErr) {
        throw new ContentRejectedError(describeError(unmaskErr));
      }
      if (hasMaskResidue(finalText)) {
        throw new ContentRejectedError('reply translation left a mask placeholder behind');
      }
      out.set(replyPieceKey(piece), finalText);
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
