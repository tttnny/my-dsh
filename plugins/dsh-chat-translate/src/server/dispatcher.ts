import { describeError } from '../describe-error.ts';
import type { ITranslationAdapter, PluginConfig, TranslateItemResult } from './types.ts';
import type { ConfigManager } from './config.ts';
import { MAX_CONCURRENCY } from './config.ts';
import type { LruDiskCache } from './cache.ts';
import type { KeyReader } from './credentials.ts';
import { BingWebAdapter } from './adapters/bing.ts';
import { OpenAiCompatibleAdapter } from './adapters/openai.ts';
import { ContentMaskingPipeline } from './pipeline/masking.ts';

type CircuitStateEnum = 'closed' | 'open' | 'half-open';

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
  private inFlightMap = new Map<string, Promise<TranslateItemResult>>();
  private activeCount = 0;
  private queue: Array<() => void> = [];

  constructor(configManager: ConfigManager, cache: LruDiskCache, credentials?: KeyReader) {
    this.configManager = configManager;
    this.cache = cache;
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
    const { maskedText, unmask } = this.masking.mask(text);

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
            const finalTranslated = unmask(cleaned);
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
          console.warn(
            `[dsh-chat-translate] channel ${chId} failed: ${describeError(err)} | text: ${text.slice(0, 60)}`
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
