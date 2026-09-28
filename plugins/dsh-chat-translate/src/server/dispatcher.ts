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
  ContentMaskingPipeline,
  MaskRestoreError,
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

type CircuitStateEnum = 'closed' | 'open' | 'half-open';

/**
 * The one and only channel id for the reply path. Both the adapter registry and
 * the circuit-breaker ledger key on it, so a test can swap the adapter without
 * the breaker losing track of which channel it is accounting for.
 */
const CHANNEL_ID = 'openai';

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

interface CircuitState {
  state: CircuitStateEnum;
  failureCount: number;
  openUntil: number;
  probeInFlight: boolean; // single-flight guard for half-open probes
}

export class TranslationDispatcher {
  private configManager: ConfigManager;
  private cache: LruDiskCache;
  private credentials: KeyReader;
  private masking = new ContentMaskingPipeline();
  private adapters = new Map<string, ITranslationAdapter>();
  private circuitStates = new Map<string, CircuitState>();
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
   * 任一片段缺失（含掩码还原不通过）都让该块作废，避免半中半英的段落。
   *
   * 客户端按 2048 估算 token 分块，所以一个 markdown 块可能跨多次调用；每次
   * 调用都独立决定成败，不会出现「前一段已挂译文、后一段失败」的半截结果。
   */
  async translateReplyBlocks(blocks: string[]): Promise<ReplyBlockResult[]> {
    const results: ReplyBlockResult[] = blocks.map((original) => ({
      original,
      translated: original,
      ok: false,
      cached: false,
      channel: 'none',
    }));

    const config = this.configManager.getConfig();
    if (!config.enabled) return results;

    // The channel id is fixed: the reply path has exactly one channel, and the
    // circuit is accounted under that id whatever adapter object serves it.
    const adapter = this.adapters.get(CHANNEL_ID);
    if (!adapter || !adapter.isAvailable(config)) return results;

    // The breaker gate: a cooling channel is skipped outright, and while
    // half-open only the single in-flight probe may pass — everyone else is
    // refused, so a flapping service gets exactly one trial request.
    if (this.isCircuitOpen(CHANNEL_ID)) return results;

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
          channel: 'cache',
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

    const translated = new Map<string, string>();
    for (const batch of packPieces(pieces)) {
      const outcome = await this.runReplySerial(() =>
        this.translateReplyBatch(adapter, batch, config)
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
      if (!complete) continue;
      const original = blocks[block]!;
      const finalText = parts.join('');
      this.cache.set(original.trim().toLowerCase(), finalText);
      results[block] = {
        original,
        translated: finalText,
        ok: true,
        cached: false,
        channel: CHANNEL_ID,
      };
    }

    return results;
  }

  /**
   * 一整批一次请求；失败则该批逐片段单发重试一次，仍失败的片段直接放弃
   * （保留原文），不在界面上留提示。失败的片段不进缓存，因此下一次滚回视口
   * 时会自然重试。
   *
   * 熔断记账按「批」算：一次批请求失败记一次，逐片段重试失败再各记一次。
   */
  private async translateReplyBatch(
    adapter: ITranslationAdapter,
    batch: ReplyPiece[],
    config: PluginConfig
  ): Promise<Map<string, string>> {
    try {
      const outcome = await this.requestReplyBatch(adapter, batch, config);
      this.recordSuccess(CHANNEL_ID);
      return outcome;
    } catch (err) {
      this.recordFailure(CHANNEL_ID);
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
        this.recordFailure(CHANNEL_ID);
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
          throw new Error('reply block markers did not survive the translation');
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
        throw new Error('reply translation left a block marker behind');
      }
      const finalText = piece.mask.unmask(answer);
      if (hasMaskResidue(finalText)) {
        throw new Error('reply translation left a mask placeholder behind');
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
   * 与真实请求同形。
   *
   * 探针是用户主动发起的连通性检查，因此不写也不读熔断账本：连点几次测试
   * 不该把正文翻译挡在冷却期外，正文的失败也不该让按钮变哑。
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

  private isCircuitOpen(channelId: string): boolean {
    let state = this.circuitStates.get(channelId);
    if (!state) return false;

    if (state.state === 'open') {
      if (Date.now() >= state.openUntil) {
        // Timeout elapsed -> transition to half-open; the first caller becomes
        // the single in-flight probe.
        state.state = 'half-open';
        state.probeInFlight = true;
        return false;
      }
      return true;
    }

    if (state.state === 'half-open') {
      // Single-flight: exactly one probe may run at a time, all others wait.
      if (state.probeInFlight) return true;
      state.probeInFlight = true;
      return false;
    }

    return false;
  }

  private recordSuccess(channelId: string): void {
    const state = this.circuitStates.get(channelId);
    if (state) {
      state.state = 'closed';
      state.failureCount = 0;
      state.openUntil = 0;
      state.probeInFlight = false;
    }
  }

  private recordFailure(channelId: string): void {
    let state = this.circuitStates.get(channelId);
    if (!state) {
      state = { state: 'closed', failureCount: 0, openUntil: 0, probeInFlight: false };
      this.circuitStates.set(channelId, state);
    }

    if (state.state === 'half-open') {
      // Probe failed -> trip back to open for 30s
      state.state = 'open';
      state.failureCount = 3;
      state.openUntil = Date.now() + 30000;
      state.probeInFlight = false;
      return;
    }

    state.failureCount++;
    if (state.failureCount >= 3) {
      state.state = 'open';
      state.openUntil = Date.now() + 30000; // Open circuit for 30 seconds
    }
  }
}
