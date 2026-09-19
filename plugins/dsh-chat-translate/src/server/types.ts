export interface PluginConfig {
  enabled: boolean;
  concurrency: number; // 1-100, default 3
  timeoutMs: number; // Bing channel timeout, default 2000
  aiTimeoutMs: number; // AI channel timeout, default 30000
  thinkTimeoutMs: number; // think-chain request timeout, default 600000
  aiEnabled: boolean; // AI (OpenAI-compatible) channel switch
  bingEnabled: boolean; // Bing web translation channel switch
  thinkEnabled: boolean; // think-chain translation switch; AI channel only
  baseUrl: string; // OpenAI-compatible base URL; empty = AI not configured
  model: string; // model name; empty = AI not configured
  targetLang: string; // target language, default 'zh-Hans'
}

export interface TranslateItemResult {
  original: string;
  translated: string;
  channel: string;
  cached: boolean;
}

export interface TranslateResponse {
  ok: boolean;
  results: TranslateItemResult[];
  error?: string;
}

/** Per-request knobs an adapter may honor; channels that cannot use them ignore the argument. */
export interface TranslateAdapterOptions {
  /** Generation cap written into the request body; omitted lets the server decide. */
  maxTokens?: number;
  /** Prompt family: one plain sentence, or a marked multi-part packing. */
  mode?: 'plain' | 'blocks';
}

export interface ITranslationAdapter {
  readonly id: string;
  readonly name: string;
  isAvailable(config: PluginConfig): boolean;
  translate(
    text: string,
    signal: AbortSignal,
    config: PluginConfig,
    options?: TranslateAdapterOptions
  ): Promise<string>;
}

/** One reasoning block's outcome, aligned by index with the request's block list. */
export interface ThinkBlockResult {
  original: string;
  translated: string;
  ok: boolean;
  cached: boolean;
  channel: string;
}
