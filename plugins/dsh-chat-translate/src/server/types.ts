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
 * Failure taxonomy for a reply block. Every failure draws the same solid red
 * line; this reason exists to pick the localized label of the hover text.
 * `transport` covers anything that says the channel was hurt (timeouts, HTTP
 * errors, broken streams, empty returns); `content` covers only rejections of
 * the returned text itself: the per-line markdown shape check (line counts,
 * indent on marker-free lines, block-marker class, table pipes, link counts)
 * did not match the source, or a ⟪…⟫ batch marker survived into the answer.
 * Rendering-equivalent drift (heading level, bullet char, list numbering or
 * indentation) is repaired by construction, never rejected. Both kinds stay
 * clickable: a manual re-run re-rolls the batch marker id and re-asks the
 * model, so a shape rejection may well pass next time.
 */
export type ReplyFailReason = 'transport' | 'content';

/** One reply block's outcome, aligned by index with the request's block list. */
export interface ReplyBlockResult {
  original: string;
  translated: string;
  ok: boolean;
  cached: boolean;
  /** Present only when `ok` is false; picks the hover-text label client-side. */
  reason?: ReplyFailReason;
  /**
   * Present only when `ok` is false: the technical one-liner behind the
   * localized label (e.g. `line count changed (12 -> 11)` or the expanded
   * fetch error). The client shows `label — detail`, dropping the tail when
   * no detail exists.
   */
  detail?: string;
}
