export interface PluginConfig {
  enabled: boolean; // master switch for reply-body translation
  aiTimeoutMs: number; // AI request timeout for one packed reply batch
  baseUrl: string; // OpenAI-compatible base URL; empty = AI not configured
  model: string; // model name; empty = AI not configured
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

/** One reply block's outcome, aligned by index with the request's block list. */
export interface ReplyBlockResult {
  original: string;
  translated: string;
  ok: boolean;
  cached: boolean;
  channel: string;
}
