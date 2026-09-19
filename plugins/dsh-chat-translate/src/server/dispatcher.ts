import { describeError } from '../describe-error.ts';
import type {
  ITranslationAdapter,
  PluginConfig,
  ThinkBlockResult,
  TranslateItemResult,
} from './types.ts';
import type { ConfigManager } from './config.ts';
import { MAX_CONCURRENCY, THINK_CACHE_ENTRIES } from './config.ts';
import { LruDiskCache } from './cache.ts';
import type { KeyReader } from './credentials.ts';
import { BingWebAdapter } from './adapters/bing.ts';
import { OpenAiCompatibleAdapter } from './adapters/openai.ts';
import {
  ContentMaskingPipeline,
  MaskRestoreError,
  type MaskResult,
} from './pipeline/masking.ts';
import { findLegacyMaskTokens, hasMaskResidue } from './pipeline/mask-tokens.ts';
import {
  buildBatchPayload,
  createThinkBatchFormat,
  hasThinkBatchResidue,
  packPieces,
  splitBatchTranslation,
  splitOversizedBlock,
  THINK_MAX_OUTPUT_TOKENS,
} from './pipeline/think.ts';

type CircuitStateEnum = 'closed' | 'open' | 'half-open';

/** 思考正文的一个待翻译片段：所属块、块内序号、掩码文本与还原信息。 */
interface ThinkPiece {
  block: number;
  index: number;
  text: string;
  mask: MaskResult;
  /** 源文本本来就有、还原时必须放行的旧格式标记。 */
  legacy: Set<string>;
}

/** 片段在结果映射里的键。 */
function thinkPieceKey(piece: { block: number; index: number }): string {
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
  /** 思考正文译文的独立缓存池，与工具标题的池互不挤占。 */
  private thinkCache: LruDiskCache;
  private credentials: KeyReader;
  private masking = new ContentMaskingPipeline();
  private adapters = new Map<string, ITranslationAdapter>();
  private circuitStates = new Map<string, CircuitState>();
  private inFlightMap = new Map<string, Promise<TranslateItemResult>>();
  private activeCount = 0;
  private queue: Array<() => void> = [];
  /** 思考链请求的串行队列尾，保证同时最多一个在途请求。 */
  private thinkTail: Promise<void> = Promise.resolve();

  constructor(
    configManager: ConfigManager,
    cache: LruDiskCache,
    credentials?: KeyReader,
    thinkCache: LruDiskCache = new LruDiskCache(THINK_CACHE_ENTRIES, 'think-cache.json')
  ) {
    this.configManager = configManager;
    this.cache = cache;
    this.thinkCache = thinkCache;
    this.credentials = credentials ?? { getApiKey: () => '' };

    // AI channel first (primary), Bing second (fallback) — map iteration order
    // follows registration order, so computeChannels() yields ['openai', 'bing'].
    this.registerAdapter(new OpenAiCompatibleAdapter(this.credentials));
    this.registerAdapter(new BingWebAdapter());

    // Listen to config changes to wake up queue on concurrency increase
    this.configManager.onConfigChange(() => {
      this.processNext();
    });
  }

  private registerAdapter(adapter: ITranslationAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  /**
   * Decide which channels are active for the current config, in priority order.
   *
   * Truth table (user contract):
   *  - AI on + configured + Bing on        -> [openai, bing]  (AI first, Bing fallback)
   *  - AI on + NOT configured + Bing on    -> [bing]
   *  - AI on + NOT configured + Bing off   -> []              (no translation)
   *  - AI off + Bing on                    -> [bing]
   *  - AI off + Bing off                   -> []              (no translation)
   */
  private computeChannels(config: PluginConfig): string[] {
    const channels: string[] = [];
    for (const [id, adapter] of this.adapters) {
      if (id === 'openai') {
        if (
          config.aiEnabled &&
          config.baseUrl?.trim() &&
          config.model?.trim() &&
          this.credentials.getApiKey()
        ) {
          channels.push(id);
        }
        continue;
      }
      if (id === 'bing') {
        if (config.bingEnabled) channels.push(id);
        continue;
      }
      // Custom/test adapters honor their own availability.
      if (adapter.isAvailable(config)) channels.push(id);
    }
    return channels;
  }

  async translateBatch(
    texts: string[],
    forceRefresh = false
  ): Promise<TranslateItemResult[]> {
    return Promise.all(texts.map((t) => this.translateOne(t, forceRefresh)));
  }

  async translateOne(
    rawText: string,
    forceRefresh = false
  ): Promise<TranslateItemResult> {
    const text = rawText.trim();
    if (!text) {
      return { original: rawText, translated: rawText, channel: 'none', cached: true };
    }

    const config = this.configManager.getConfig();
    if (!config.enabled) {
      return { original: rawText, translated: rawText, channel: 'disabled', cached: true };
    }

    const cacheKey = text.toLowerCase();

    // 1. Check L1/L2 Cache
    if (!forceRefresh) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return { original: rawText, translated: cached, channel: 'cache', cached: true };
      }
    }

    // 2. In-flight Promise deduplication (only when not forceRefresh)
    if (!forceRefresh) {
      const inFlight = this.inFlightMap.get(cacheKey);
      if (inFlight) {
        return inFlight;
      }
    }

    // Mask code blocks, inline code, paths, urls, flags
    const { maskedText, unmask, legacyFragments } = this.masking.mask(text);
    // Retired-format tokens the source documented come back on purpose.
    const documentedLegacy = new Set(legacyFragments.map((fragment) => fragment.toLowerCase()));

    // 3. Queue task with concurrency limit
    const taskPromise = this.enqueueTask(async () => {
      const currentConfig = this.configManager.getConfig();
      const channels = this.computeChannels(currentConfig);

      for (const chId of channels) {
        const adapter = this.adapters.get(chId);
        if (!adapter || !adapter.isAvailable(currentConfig) || this.isCircuitOpen(chId)) {
          continue;
        }

        try {
          const timeout = chId === 'openai'
            ? currentConfig.aiTimeoutMs || 30000
            : currentConfig.timeoutMs || 2000;
          const abortCtrl = new AbortController();
          const timer = setTimeout(() => abortCtrl.abort(), timeout);

          let translatedMasked = '';
          try {
            translatedMasked = await adapter.translate(maskedText, abortCtrl.signal, currentConfig);
          } finally {
            clearTimeout(timer);
          }

          const cleaned = translatedMasked?.trim();
          if (cleaned && cleaned.length > 0) {
            // Restore every protected fragment. `unmask` throws when the engine
            // did not hand the whole token sequence back, and the leftover check
            // covers the same ground on the finished string; either way the
            // translation is discarded and the next channel is tried, so a
            // damaged placeholder is never rendered or cached.
            const finalTranslated = unmask(cleaned);
            // Retired-format tokens the source documented are content; anything
            // else token-shaped reaching the finished string is a leak.
            const legacyLeftovers = findLegacyMaskTokens(finalTranslated).filter(
              (fragment) => !documentedLegacy.has(fragment.toLowerCase())
            );
            if (hasMaskResidue(finalTranslated) || legacyLeftovers.length > 0) {
              this.recordFailure(chId);
              console.warn(
                `[dsh-chat-translate] channel ${chId} left a mask placeholder in the translation, discarding its result | text: ${text.slice(0, 60)}`
              );
              continue;
            }
            this.recordSuccess(chId);
            this.cache.set(cacheKey, finalTranslated);
            return {
              original: rawText,
              translated: finalTranslated,
              channel: chId,
              cached: false,
            };
          }
          // Empty result counts as a failure: it releases a half-open probe
          // flag (which would otherwise leak and permanently bypass the
          // channel) and feeds the circuit-breaker failure counter.
          this.recordFailure(chId);
          console.warn(
            `[dsh-chat-translate] channel ${chId} returned an empty translation | text: ${text.slice(0, 60)}`
          );
        } catch (err: any) {
          this.recordFailure(chId);
          const detail =
            err instanceof MaskRestoreError
              ? ` (protected fragments expected ${err.expectedCount}, restored ${err.foundCount})`
              : '';
          console.warn(
            `[dsh-chat-translate] channel ${chId} failed: ${describeError(err)}${detail} | text: ${text.slice(0, 60)}`
          );
          // Continue to next channel
        }
      }

      return { original: rawText, translated: rawText, channel: 'fallback', cached: false };
    });

    if (!forceRefresh) {
      this.inFlightMap.set(cacheKey, taskPromise);
    }

    try {
      return await taskPromise;
    } finally {
      if (!forceRefresh) {
        this.inFlightMap.delete(cacheKey);
      }
    }
  }

  /**
   * 翻译思考正文的块。整条链路与工具标题翻译分离：只走 AI 通道、独立串行
   * 队列、独立超时、独立缓存池，Bing 从不参与。
   *
   * 每个块先按输入上限切成片段，再各自掩码、相邻片段打包成一个请求；整批
   * 失败时退回逐片段单发，仍失败的片段保留原文。块内任一片段失败即整块不译，
   * 避免半中半英的段落。
   */
  async translateThinkBlocks(blocks: string[]): Promise<ThinkBlockResult[]> {
    const results: ThinkBlockResult[] = blocks.map((original) => ({
      original,
      translated: original,
      ok: false,
      cached: false,
      channel: 'none',
    }));

    const config = this.configManager.getConfig();
    if (!config.enabled || !config.thinkEnabled) return results;

    const adapter = this.adapters.get('openai');
    if (!adapter || !adapter.isAvailable(config) || this.isChannelCoolingDown('openai')) {
      return results;
    }

    const pieces: ThinkPiece[] = [];
    for (let block = 0; block < blocks.length; block++) {
      const text = (blocks[block] ?? '').trim();
      if (!text) continue;
      const cached = this.thinkCache.get(text.toLowerCase());
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
          legacy: new Set(mask.legacyFragments.map((fragment) => fragment.toLowerCase())),
        });
      }
    }

    const translated = new Map<string, string>();
    for (const batch of packPieces(pieces)) {
      const outcome = await this.runThinkSerial(() =>
        this.translateThinkBatch(adapter, batch, config)
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
      this.thinkCache.set(original.trim().toLowerCase(), finalText);
      results[block] = { original, translated: finalText, ok: true, cached: false, channel: 'openai' };
    }

    return results;
  }

  /**
   * 一整批一次请求；失败则该批逐片段单发重试一次，仍失败的片段直接放弃
   * （保留原文），不在界面上留提示。
   */
  private async translateThinkBatch(
    adapter: ITranslationAdapter,
    batch: ThinkPiece[],
    config: PluginConfig
  ): Promise<Map<string, string>> {
    try {
      return await this.requestThinkBatch(adapter, batch, config);
    } catch (err) {
      console.warn(
        `[dsh-chat-translate] think batch of ${batch.length} failed, retrying per block: ${describeError(err)}`
      );
    }

    const out = new Map<string, string>();
    for (const piece of batch) {
      try {
        for (const [key, value] of await this.requestThinkBatch(adapter, [piece], config)) {
          out.set(key, value);
        }
      } catch (err) {
        console.warn(
          `[dsh-chat-translate] think block ${piece.block} #${piece.index} failed, keeping the original: ${describeError(err)}`
        );
      }
    }
    return out;
  }

  /** 发出一次思考链请求并把结果还原成每个片段的最终译文。 */
  private async requestThinkBatch(
    adapter: ITranslationAdapter,
    batch: ThinkPiece[],
    config: PluginConfig
  ): Promise<Map<string, string>> {
    const timeout = config.thinkTimeoutMs || 600000;
    const abortCtrl = new AbortController();
    const timer = setTimeout(() => abortCtrl.abort(), timeout);
    let answers: string[];
    try {
      if (batch.length === 1) {
        answers = [
          await adapter.translate(batch[0]!.text, abortCtrl.signal, config, {
            maxTokens: THINK_MAX_OUTPUT_TOKENS,
            mode: 'plain',
          }),
        ];
      } else {
        const format = createThinkBatchFormat();
        const answer = await adapter.translate(
          buildBatchPayload(batch.map((piece) => piece.text), format),
          abortCtrl.signal,
          config,
          { maxTokens: THINK_MAX_OUTPUT_TOKENS, mode: 'blocks' }
        );
        const parts = splitBatchTranslation(answer, format, batch.length);
        if (parts === null) {
          throw new Error('think block markers did not survive the translation');
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
        throw new Error(`think block ${piece.block} #${piece.index} came back empty`);
      }
      if (hasThinkBatchResidue(answer)) {
        throw new Error('think translation left a block marker behind');
      }
      const finalText = piece.mask.unmask(answer);
      const leftovers = findLegacyMaskTokens(finalText).filter(
        (fragment) => !piece.legacy.has(fragment.toLowerCase())
      );
      if (hasMaskResidue(finalText) || leftovers.length > 0) {
        throw new Error('think translation left a mask placeholder behind');
      }
      out.set(thinkPieceKey(piece), finalText);
    });
    return out;
  }

  /** 串行执行器：同时最多一个在途请求，与工具标题的并发池完全独立。 */
  private runThinkSerial<T>(task: () => Promise<T>): Promise<T> {
    const next = this.thinkTail.then(task, task);
    this.thinkTail = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }

  /**
   * 只读判断某通道是否还在熔断冷却期。思考链翻译只借用这个判断避开已经
   * 出问题的服务，不改动熔断状态本身（那是工具标题通道的记账）。
   */
  private isChannelCoolingDown(channelId: string): boolean {
    const state = this.circuitStates.get(channelId);
    return state !== undefined && state.state === 'open' && Date.now() < state.openUntil;
  }

  async testChannel(channelId: string): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const adapter = this.adapters.get(channelId);
    const config = this.configManager.getConfig();
    if (!adapter) {
      return { ok: false, latencyMs: 0, error: `Channel ${channelId} not found` };
    }
    if (!adapter.isAvailable(config)) {
      return { ok: false, latencyMs: 0, error: `Channel ${channelId} is not configured or disabled` };
    }

    const testText = 'List files in current directory';
    const start = Date.now();
    try {
      const timeout = channelId === 'openai' ? Math.min(config.aiTimeoutMs || 30000, 30000) : 4000;
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

  private enqueueTask<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const exec = async () => {
        this.activeCount++;
        try {
          const result = await task();
          resolve(result);
        } catch (err) {
          reject(err);
        } finally {
          this.activeCount--;
          this.processNext();
        }
      };

      const maxConcurrency = Math.min(
        Math.max(this.configManager.getConfig().concurrency || 3, 1),
        MAX_CONCURRENCY
      );

      if (this.activeCount < maxConcurrency) {
        exec();
      } else {
        this.queue.push(exec);
      }
    });
  }

  private processNext(): void {
    const maxConcurrency = Math.min(
      Math.max(this.configManager.getConfig().concurrency || 3, 1),
      MAX_CONCURRENCY
    );

    while (this.queue.length > 0 && this.activeCount < maxConcurrency) {
      const next = this.queue.shift();
      if (next) {
        next();
      }
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
