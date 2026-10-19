/**
 * API-key access through the DSH `ctx.credentials` service.
 *
 * The service owns ~/.dsh/.credentials.yaml (refs section, 0600 perms, env
 * shadowing, cross-process locking). This plugin only reads: writes go
 * through the browser's `credentials` Remote API, and the host's
 * `credentials/reference-updated` event keeps the sync cache warm.
 */

/** Refs key that holds the translation API key. */
export const TRANSLATE_API_KEY_REF = 'TRANSLATE_API_KEY';

/** The sync read face the hot translation path needs. */
export interface KeyReader {
  getApiKey(): string;
}

/** Minimal structural shape of the DSH `ctx.credentials` service: the read face. */
export interface CredentialsServiceLike {
  /** Resolve a ref to its stored/inherited value; undefined when absent. */
  resolve(ref: string): Promise<{ value: string; source?: string } | undefined>;
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
}
