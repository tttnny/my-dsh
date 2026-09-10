/**
 * API-key access through the DSH `ctx.credentials` service.
 *
 * The service owns ~/.dsh/.credentials.yaml (refs section, 0600 perms, env
 * shadowing, cross-process locking). The pre-1.2 hand-rolled YAML parser is
 * gone: reads go through `resolve`, writes through `set`/`unset`, and the
 * host's `credentials/reference-updated` event keeps the sync cache warm.
 */

/** Refs key that holds the translation API key. */
export const TRANSLATE_API_KEY_REF = 'TRANSLATE_API_KEY';

/** The sync read face the hot translation path needs. */
export interface KeyReader {
  getApiKey(): string;
}

/** Minimal structural shape of the DSH `ctx.credentials` service. */
export interface CredentialsServiceLike {
  /** Resolve a ref to its stored/inherited value; undefined when absent. */
  resolve(ref: string): Promise<{ value: string; source?: string } | undefined>;
  /** Status-only view — never returns the plaintext value. */
  describe(ref: string): Promise<{ configured: boolean; source?: string; writable: boolean }>;
  /** Store a non-empty value under the ref. */
  set(ref: string, value: string): Promise<void>;
  /** Remove the ref from the document. */
  unset(ref: string): Promise<void>;
}

export class CredentialsReader implements KeyReader {
  private service: CredentialsServiceLike;
  private cachedKey = '';
  private refreshing: Promise<void> | null = null;

  constructor(service: CredentialsServiceLike) {
    this.service = service;
  }

  /** Load the API key once; safe to call multiple times. */
  async init(): Promise<void> {
    await this.refresh();
  }

  /**
   * Re-read the key from the credentials service. Used at startup and on
   * `credentials/reference-updated` events so an external edit or a write
   * from another surface takes effect immediately.
   */
  async refresh(): Promise<void> {
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      try {
        const resolved = await this.service.resolve(TRANSLATE_API_KEY_REF);
        this.cachedKey = (resolved?.value ?? '').trim();
      } catch (err) {
        console.warn('[dsh-chat-translate] Failed to resolve TRANSLATE_API_KEY:', err);
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }

  /** Synchronous cached read — the hot translation path stays sync. */
  getApiKey(): string {
    return this.cachedKey;
  }

  /**
   * Status-only view of the ref (plaintext never crosses the wire).
   *
   * @internal Test-only. The settings UI reads key status through the
   * `credentials` Remote API with its own client-side shape, so nothing in
   * `src/` calls this host-side method; only `scripts/test-*.mjs` do.
   */
  async describe(): Promise<{ configured: boolean; writable: boolean }> {
    try {
      const info = await this.service.describe(TRANSLATE_API_KEY_REF);
      return { configured: info.configured, writable: info.writable };
    } catch {
      return { configured: false, writable: false };
    }
  }

  /** Write (or clear) the ref through the DSH credentials service. */
  async setApiKey(apiKey: string): Promise<void> {
    const normalized = apiKey.trim();
    if (normalized) {
      await this.service.set(TRANSLATE_API_KEY_REF, normalized);
    } else {
      await this.service.unset(TRANSLATE_API_KEY_REF);
    }
    // The write committed: set the cache synchronously so the hot path never
    // reads a stale key even if a concurrent refresh() is still in flight,
    // then confirm from the service (which also fans reference-updated).
    this.cachedKey = normalized;
    await this.refresh();
  }
}
