import { describeError } from '../../describe-error.ts';
import { chatTranslateObserver } from '../translate/observer.ts';
import { testServerChannel } from '../translate/api.ts';

export interface ClientSettingsState {
  enabled: boolean;
  concurrency: number;
  aiEnabled: boolean;
  bingEnabled: boolean;
  baseUrl: string;
  model: string;
  aiConfigured: boolean;
}

/** Settings namespace + credentials ref, mirroring the host constants. */
export const SETTINGS_NAMESPACE = 'dsh-chat-translate';
export const TRANSLATE_API_KEY_REF = 'TRANSLATE_API_KEY';

/**
 * Minimal structural shapes of the DSH browser services this store rides on:
 * `settingsScope` (from @deepseek-ai/dsh-client-ui-settings) and the
 * `credentials` Remote namespace. Keeping them structural keeps this bundle
 * free of host-service imports and lets tests inject fakes.
 */
export interface SettingsScopeLike {
  getSnapshot(): {
    status: string;
    value?: Record<string, unknown>;
    writable: boolean;
  };
  subscribe(listener: () => void): () => void;
  set(field: string, value: unknown): Promise<unknown>;
  unset(field: string): Promise<unknown>;
}

/** Shape of every DSH client Remote call: {ok, value} / {ok, error} wrapper. */
export type RemoteResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code?: string; message: string; details?: unknown } };

export interface CredentialsRemoteLike {
  describe(
    refs: string[]
  ): Promise<RemoteResult<Record<string, { configured: boolean; source?: string; writable: boolean }>>>;
  set(ref: string, value: string): Promise<RemoteResult<void>>;
  unset(ref: string): Promise<RemoteResult<void>>;
}

const DEFAULT_STATE: ClientSettingsState = {
  enabled: true,
  concurrency: 3,
  aiEnabled: true,
  bingEnabled: true,
  baseUrl: '',
  model: '',
  aiConfigured: false,
};

/**
 * Client settings store backed by the DSH settings namespace.
 *
 * Since 1.2 there is no localStorage overlay and no custom config HTTP
 * endpoint: the store derives from the bound `settingsScope` (which mirrors
 * the host document and folds every write answer back), and writes go
 * through `scope.set` — serialized, revision-checked, persisted by DSH.
 * Without a bound scope (e.g. non-loopback pages, unit tests) it degrades to
 * an in-memory store with the same semantics DSH itself uses for memory
 * persistence.
 */
class SettingsStore {
  private state: ClientSettingsState = { ...DEFAULT_STATE };
  private listeners = new Set<() => void>();
  private scope: SettingsScopeLike | null = null;
  private credentials: CredentialsRemoteLike | null = null;
  private unsubscribeScope: (() => void) | null = null;
  private keyConfigured = false;
  private writeTimer: number | null = null;
  private pendingFields = new Set<string>();

  /**
   * Bind the DSH services. Called once from the settings UI setup; re-binding
   * (e.g. after a reconnect) detaches the previous subscription first.
   */
  attach(scope: SettingsScopeLike | null, credentials: CredentialsRemoteLike | null): void {
    if (this.unsubscribeScope) {
      this.unsubscribeScope();
      this.unsubscribeScope = null;
    }
    this.scope = scope;
    this.credentials = credentials;
    if (scope) {
      this.unsubscribeScope = scope.subscribe(() => this.derive());
      this.derive();
    }
    void this.refreshKeyStatus();
  }

  getState(): ClientSettingsState {
    return { ...this.state };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Map the resolved namespace value into client state and notify. */
  private derive(): void {
    if (!this.scope) return;
    const snap = this.scope.getSnapshot();
    const value = snap.value;
    if (!value || typeof value !== 'object') return;
    const next: ClientSettingsState = { ...this.state };
    if (typeof value.enabled === 'boolean') next.enabled = value.enabled;
    const c = value.concurrency;
    if (typeof c === 'number' && Number.isFinite(c)) {
      next.concurrency = Math.min(Math.max(Math.round(c), 1), 100);
    }
    if (typeof value.aiEnabled === 'boolean') next.aiEnabled = value.aiEnabled;
    if (typeof value.bingEnabled === 'boolean') next.bingEnabled = value.bingEnabled;
    if (typeof value.baseUrl === 'string') next.baseUrl = value.baseUrl;
    if (typeof value.model === 'string') next.model = value.model;
    this.applyState(next);
  }

  private applyState(next: ClientSettingsState): void {
    next.aiConfigured = Boolean(next.baseUrl && next.model && this.keyConfigured);
    const enabledChanged = next.enabled !== this.state.enabled;
    this.state = next;
    if (enabledChanged) {
      try {
        chatTranslateObserver.setEnabled(this.state.enabled);
      } catch {}
    }
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {}
    }
  }

  /** Pull the key's status-only view and re-derive aiConfigured. */
  private async refreshKeyStatus(): Promise<void> {
    if (!this.credentials) return;
    try {
      const res = await this.credentials.describe([TRANSLATE_API_KEY_REF]);
      if (!res.ok) return;
      const info = res.value[TRANSLATE_API_KEY_REF];
      const configured = Boolean(info?.configured);
      if (configured !== this.keyConfigured) {
        this.keyConfigured = configured;
        this.applyState({ ...this.state });
      }
    } catch {
      // Credentials surface unavailable — keep the last known status.
    }
  }

  /**
   * Optimistically apply locally, then persist each touched field through the
   * settings scope. Writes are trailing-debounced (300ms) so typing in the
   * baseUrl/model inputs collapses into a single queued mutation instead of
   * one write per keystroke — which would otherwise flash stale mirror values
   * back into the inputs between commits. A failed write makes the scope
   * reload its mirror, which re-derives this store from the host document
   * (conflict-safe recovery).
   */
  async update(partial: Partial<ClientSettingsState>): Promise<void> {
    let sanitizedConcurrency = this.state.concurrency;
    if (typeof partial.concurrency === 'number' && Number.isFinite(partial.concurrency)) {
      sanitizedConcurrency = Math.min(Math.max(Math.round(partial.concurrency), 1), 100);
    }
    const next: ClientSettingsState = {
      ...this.state,
      ...partial,
      concurrency: sanitizedConcurrency,
    };
    this.applyState(next);

    if (this.scope) {
      const fields = ['enabled', 'concurrency', 'aiEnabled', 'bingEnabled', 'baseUrl', 'model'] as const;
      for (const field of fields) {
        if (partial[field] !== undefined) {
          this.pendingFields.add(field);
        }
      }
      this.scheduleWrite();
    }
  }

  private scheduleWrite(): void {
    if (this.writeTimer !== null || typeof window === 'undefined') return;
    this.writeTimer = window.setTimeout(() => {
      this.writeTimer = null;
      void this.flushWrite();
    }, 300);
  }

  private async flushWrite(): Promise<void> {
    if (!this.scope) return;
    const fields = [...this.pendingFields];
    this.pendingFields.clear();
    const writes: Promise<unknown>[] = [];
    for (const field of fields) {
      writes.push(this.scope.set(field, this.state[field as keyof ClientSettingsState]));
    }
    await Promise.all(writes).catch(() => {});
  }

  async testChannel(channel: string): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    return testServerChannel(channel);
  }

  /** Write (or clear) the API key through the credentials Remote API. */
  async saveApiKey(apiKey: string): Promise<{ ok: boolean; error?: string }> {
    if (!this.credentials) {
      return { ok: false, error: '凭据服务不可用（非回环页面）' };
    }
    try {
      const key = apiKey.trim();
      // Remote calls resolve with {ok:false} instead of rejecting on refusal
      // (e.g. env-shadowed refs), so the .ok check decides the outcome.
      const res = key
        ? await this.credentials.set(TRANSLATE_API_KEY_REF, key)
        : await this.credentials.unset(TRANSLATE_API_KEY_REF);
      if (!res.ok) {
        return { ok: false, error: res.error?.message || '保存失败' };
      }
      await this.refreshKeyStatus();
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: describeError(err) };
    }
  }

  dispose(): void {
    if (this.writeTimer !== null && typeof window !== 'undefined') {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }
    this.pendingFields.clear();
    if (this.unsubscribeScope) {
      this.unsubscribeScope();
      this.unsubscribeScope = null;
    }
    this.scope = null;
    this.credentials = null;
    this.listeners.clear();
  }
}

export const settingsStore = new SettingsStore();
