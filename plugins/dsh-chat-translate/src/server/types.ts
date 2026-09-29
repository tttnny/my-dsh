export interface PluginConfig {
  enabled: boolean; // master switch for reply-body translation
  aiTimeoutMs: number; // AI request timeout for one packed reply batch
  baseUrl: string; // OpenAI-compatible base URL; empty = AI not configured
  model: string; // model name; empty = AI not configured
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

/**
 * One reply block's outcome, aligned by index with the request's block list.
 * Failure means the channel was hurt (timeout, HTTP error, broken stream,
 * empty return) — the answer's markdown shape is never a failure reason:
 * drift is repaired by construction, re-rolled once, or accepted as written
 * (the original stays one click away). `detail` carries the technical
 * one-liner for the hover text.
 */
export interface ReplyBlockResult {
  original: string;
  translated: string;
  ok: boolean;
  cached: boolean;
  /**
   * Present only when `ok` is false: the technical one-liner behind the
   * localized label (e.g. `channel timed out after 20000ms` or the expanded
   * fetch error). The client shows `label — detail`, dropping the tail when
   * no detail exists.
   */
  detail?: string;
}
