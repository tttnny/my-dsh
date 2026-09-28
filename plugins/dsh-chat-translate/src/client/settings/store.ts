import { describeError } from '../../describe-error.ts';
import { testServerChannel } from '../translate/api.ts';

export interface ClientSettingsState {
  enabled: boolean;
  aiTimeoutMs: number;
  baseUrl: string;
  model: string;
  /** 派生值：Key / Base URL / 模型齐全，正文才会被翻译。 */
  aiConfigured: boolean;
}

/** 正文单次请求超时的取值范围，与宿主半边保持一致。 */
export const AI_TIMEOUT_MIN = 500;
export const AI_TIMEOUT_MAX = 900000;

/** Profile entry id (== settings namespace) + credentials ref, mirroring the host constants. */
export const SETTINGS_NAMESPACE = 'dsh-chat-translate';
export const TRANSLATE_API_KEY_REF = 'TRANSLATE_API_KEY';

/**
 * One path-addressed edit, matching the wire shape the shared configuration
 * form's `mutate` accepts.
 */
export type SettingsPathOpLike =
  | { op: 'set'; path: string[]; value: unknown }
  | { op: 'unset'; path: string[] };

/**
 * Minimal structural shape of the DSH shared configuration form this store
 * rides on — `ConfigForm<T>` from @deepseek-ai/dsh-client-ui-settings, reached
 * as `ctx.configForms.get(<profile entry id>)`. Keeping it structural keeps
 * this bundle free of the settings package and lets tests inject fakes; the
 * real form is a structural superset (it also carries `base`, `user` and
 * `mode`).
 */
export interface ConfigFormLike {
  getSnapshot(): {
    /** `unavailable` when the Host does not serve this entry to this client. */
    status: 'loading' | 'ready' | 'unavailable';
    /** Resolved section: schema defaults, then composition base, then user layer. */
    value?: Record<string, unknown>;
    /** Whether the Host document accepts writes; memory mode never does. */
    writable: boolean;
    /** Namespace revision fencing the next write. */
    revision?: number;
  };
  subscribe(listener: () => void): () => void;
  /** One revision-fenced batch of path writes; resolves to Host acceptance. */
  mutate(ops: readonly SettingsPathOpLike[], expectedRevision?: number): Promise<unknown>;
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
  aiTimeoutMs: 600000,
  baseUrl: '',
  model: '',
  aiConfigured: false,
};

/**
 * Client settings store backed by this plugin's own configuration form.
 *
 * There is no localStorage overlay and no custom config HTTP endpoint: the
 * store derives from the bound `ConfigForm`, which mirrors the profile entry's
 * config section (schema defaults → composition base → user layer) and folds
 * every accepted write back, and each debounced flush commits its touched
 * fields as one `mutate` batch — one revision fence, serialized and persisted
 * by DSH. Without a bound form (unit tests) it degrades to an in-memory store
 * with the same semantics.
 */
class SettingsStore {
  private state: ClientSettingsState = { ...DEFAULT_STATE };
  private listeners = new Set<() => void>();
  private form: ConfigFormLike | null = null;
  private credentials: CredentialsRemoteLike | null = null;
  private unsubscribeForm: (() => void) | null = null;
  private keyConfigured = false;
  private writeTimer: number | null = null;
  private pendingFields = new Set<string>();

  /**
   * Bind the DSH services. Called once from the settings UI setup; re-binding
   * (e.g. after a reconnect) detaches the previous subscription first.
   */
  attach(form: ConfigFormLike | null, credentials: CredentialsRemoteLike | null): void {
    if (this.unsubscribeForm) {
      this.unsubscribeForm();
      this.unsubscribeForm = null;
    }
    this.form = form;
    this.credentials = credentials;
    if (form) {
      this.unsubscribeForm = form.subscribe(() => this.derive());
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

  /** Map the resolved section into client state and notify. */
  private derive(): void {
    if (!this.form) return;
    const snap = this.form.getSnapshot();
    const value = snap.value;
    if (!value || typeof value !== 'object') return;
    const next: ClientSettingsState = { ...this.state };
    if (typeof value.enabled === 'boolean') next.enabled = value.enabled;
    const timeout = value.aiTimeoutMs;
    if (typeof timeout === 'number' && Number.isFinite(timeout)) {
      next.aiTimeoutMs = Math.min(
        Math.max(Math.round(timeout), AI_TIMEOUT_MIN),
        AI_TIMEOUT_MAX
      );
    }
    if (typeof value.baseUrl === 'string') next.baseUrl = value.baseUrl;
    if (typeof value.model === 'string') next.model = value.model;
    this.applyState(next);
  }

  private applyState(next: ClientSettingsState): void {
    next.aiConfigured = Boolean(next.baseUrl && next.model && this.keyConfigured);
    this.state = next;
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
   * configuration form. Writes are trailing-debounced (300ms) so typing in the
   * baseUrl/model inputs collapses into a single queued mutation instead of
   * one write per keystroke — which would otherwise flash stale mirror values
   * back into the inputs between commits. A failed write makes the form reload
   * its mirror, which re-derives this store from the Host document
   * (conflict-safe recovery).
   */
  async update(partial: Partial<ClientSettingsState>): Promise<void> {
    let sanitizedTimeout = this.state.aiTimeoutMs;
    if (typeof partial.aiTimeoutMs === 'number' && Number.isFinite(partial.aiTimeoutMs)) {
      sanitizedTimeout = Math.min(
        Math.max(Math.round(partial.aiTimeoutMs), AI_TIMEOUT_MIN),
        AI_TIMEOUT_MAX
      );
    }
    const next: ClientSettingsState = {
      ...this.state,
      ...partial,
      aiTimeoutMs: sanitizedTimeout,
    };
    this.applyState(next);

    if (this.form) {
      const fields = ['enabled', 'aiTimeoutMs', 'baseUrl', 'model'] as const;
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
    if (!this.form) return;
    const fields = [...this.pendingFields];
    this.pendingFields.clear();
    if (fields.length === 0) return;
    const ops: SettingsPathOpLike[] = fields.map((field) => ({
      op: 'set',
      path: [field],
      value: this.state[field as keyof ClientSettingsState],
    }));
    await this.form.mutate(ops).catch(() => {});
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
    if (this.unsubscribeForm) {
      this.unsubscribeForm();
      this.unsubscribeForm = null;
    }
    this.form = null;
    this.credentials = null;
    this.listeners.clear();
  }
}

export const settingsStore = new SettingsStore();
