import { describeError } from '../../describe-error.ts';
import { DEFAULT_PROMPT, isDefaultPrompt, resolvePrompt } from '../../prompt.ts';
import { testServerChannel } from '../translate/api.ts';

/**
 * This plugin's configuration page state: what the Host serves, what the reader
 * has staged on the page, and what a save would do.
 *
 * There is no optimistic write and no debounce. Every control stages its edit
 * in a draft; the live configuration changes only when the reader presses
 * **保存**, and the whole batch crosses the wire as one revision-fenced write.
 * That is what keeps a half-typed Base URL from reaching the translation path
 * mid-edit, and it is why the reply renderer reads only the committed values:
 * a draft never changes what is already on screen.
 *
 * The API Key is staged the same way but written through the credentials
 * Remote on the same save, so the key and the rest of the settings commit as
 * one gesture.
 *
 * The prompt is staged like any text control, with one twist: the control shows
 * the *effective* instruction, so an untouched plugin displays the built-in
 * default in full. Saving that exact text clears the field again, which keeps
 * "empty means the built-in default" true in the stored document.
 */

/** Resolved config as the Host serves it, plus the derived readiness flag. */
export interface CommittedConfig {
  enabled: boolean;
  aiTimeoutMs: number;
  baseUrl: string;
  model: string;
  /** The configured instruction; empty means the built-in default is in force. */
  prompt: string;
  /** Derived: Key / Base URL / model all present, so prose would be translated. */
  aiConfigured: boolean;
}

/** One staged text control. */
export interface DraftField {
  /** What the control shows. */
  text: string;
  /** Whether the draft differs from the committed value. */
  dirty: boolean;
  /** Whether the draft is not a value this field accepts (blocks saving). */
  invalid: boolean;
}

/** The channel probe run by one save: what the settings page reports. */
export interface ProbeState {
  running: boolean;
  ok?: boolean;
  message?: string;
}

/** Everything the page renders. */
export interface SettingsPageState {
  /** False while the Host does not serve this plugin's config entry. */
  available: boolean;
  /** Whether the Host document accepts writes. */
  writable: boolean;
  /** The committed configuration the translation path actually uses. */
  committed: CommittedConfig;
  baseUrl: DraftField;
  model: DraftField;
  aiTimeoutMs: DraftField;
  /**
   * The instruction draft. Holds the effective text (the reader's prompt, or the
   * built-in default shown in full when they wrote none), so the control never
   * looks empty on a fresh plugin.
   */
  prompt: DraftField;
  /**
   * Write-only control. Blank until typed; `dirty` records that the reader has
   * typed into it, because a secret is never echoed back — an untouched blank
   * draft means "leave the key alone", while a blank draft the reader produced
   * means "clear it".
   */
  apiKey: { text: string; dirty: boolean };
  /** Whether the drafts differ from what has been committed. */
  dirty: boolean;
  /** Whether any draft is invalid, which blocks the save. */
  invalid: boolean;
  saving: boolean;
  /** The last save did not land: drafts stay for correction. */
  saveFailed: boolean;
  /** Probe from the last save; undefined until a save ran. */
  probe?: ProbeState;
}

/** Profile entry id (== settings namespace) + credentials ref. */
export const SETTINGS_NAMESPACE = 'dsh-chat-translate';
export const TRANSLATE_API_KEY_REF = 'TRANSLATE_API_KEY';

/** 正文单次请求超时的取值范围，与宿主半边保持一致。 */
export const AI_TIMEOUT_MIN = 500;
export const AI_TIMEOUT_MAX = 900000;

/** One path-addressed edit, matching the wire shape the form's `mutate` accepts. */
export type SettingsPathOpLike =
  | { op: 'set'; path: string[]; value: unknown }
  | { op: 'unset'; path: string[] };

/**
 * Minimal structural shape of the DSH shared configuration form this store
 * rides on — reached as `ctx.configForms.get(<profile entry id>)`. Keeping it
 * structural keeps this bundle testable with fakes; the real form is a
 * structural superset.
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

const DEFAULT_CONFIG: CommittedConfig = {
  enabled: true,
  aiTimeoutMs: 600000,
  baseUrl: '',
  model: '',
  prompt: '',
  aiConfigured: false,
};

/**
 * Parse one timeout draft.
 *
 * @param text - the draft as typed.
 * @returns the committed value, `null` when the draft is empty (which clears the
 * field, so the resolved default takes over), or `undefined` when the draft is
 * not a number this field accepts. An out-of-range value is refused rather than
 * silently pulled into range: a save that quietly stores something other than
 * what the page shows is worse than one that asks the reader to fix it.
 */
export function parseTimeout(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return undefined;
  const rounded = Math.round(parsed);
  return rounded < AI_TIMEOUT_MIN || rounded > AI_TIMEOUT_MAX ? undefined : rounded;
}

/**
 * The configuration page's own store: committed reads for the whole client,
 * plus the drafts and the save that this page alone owns.
 *
 * `update` is the surface for controls outside the page — the composer dock
 * toggle writes the master switch straight through, which is the one place a
 * click takes effect without a save.
 */
class SettingsStore {
  private state: SettingsPageState = {
    available: false,
    writable: false,
    committed: { ...DEFAULT_CONFIG },
    baseUrl: { text: '', dirty: false, invalid: false },
    model: { text: '', dirty: false, invalid: false },
    aiTimeoutMs: { text: '', dirty: false, invalid: false },
    prompt: { text: '', dirty: false, invalid: false },
    apiKey: { text: '', dirty: false },
    dirty: false,
    invalid: false,
    saving: false,
    saveFailed: false,
  };
  private listeners = new Set<() => void>();
  private form: ConfigFormLike | null = null;
  private credentials: CredentialsRemoteLike | null = null;
  private unsubscribeForm: (() => void) | null = null;
  private keyConfigured = false;
  /**
   * 上一次播种时的那份已保存值。每次宿主通知都重算已保存值，但**只有值真变了
   * 的字段**才重新播种：读者正在改别的字段时，一次与草稿无关的提交（比如拨一下
   * 输入框下方的「译」胶囊）不该把没保存的草稿冲掉。
   */
  private seeded: CommittedConfig | null = null;

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
    // 换了一份配置面（重新连接、页面重挂载）就是另一份文档：上一份的已保存值
    // 不能拿来判断「这个字段变没变」，否则新文档会沿用旧草稿。
    this.seeded = null;
    if (form) {
      this.unsubscribeForm = form.subscribe(() => this.deriveCommitted());
      this.deriveCommitted();
    }
    void this.refreshKeyStatus();
  }

  getState(): SettingsPageState {
    return this.state;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Map the Host's resolved section into committed state and notify. */
  private deriveCommitted(): void {
    const form = this.form;
    if (!form) return;
    const snap = form.getSnapshot();
    const value = snap.value;
    if (!value || typeof value !== 'object') return;
    // Rebuilt from the resolved section over the schema defaults on every read:
    // a field the reader cleared comes back as its default, never as the value
    // that used to be there.
    const committed: CommittedConfig = { ...DEFAULT_CONFIG };
    if (typeof value.enabled === 'boolean') committed.enabled = value.enabled;
    const timeout = value.aiTimeoutMs;
    // The Host is the authority on what it accepted; a value outside the
    // schema bounds is still clamped here so a rogue document cannot widen the
    // timeout this client reports. A *draft* outside the bounds is refused
    // instead (see {@link parseTimeout}) — the reader gets to fix it.
    if (typeof timeout === 'number' && Number.isFinite(timeout)) {
      committed.aiTimeoutMs = Math.min(Math.max(Math.round(timeout), AI_TIMEOUT_MIN), AI_TIMEOUT_MAX);
    }
    if (typeof value.baseUrl === 'string') committed.baseUrl = value.baseUrl;
    if (typeof value.model === 'string') committed.model = value.model;
    if (typeof value.prompt === 'string') committed.prompt = value.prompt;
    committed.aiConfigured = Boolean(committed.baseUrl && committed.model && this.keyConfigured);
    this.state = {
      ...this.state,
      available: snap.status === 'ready',
      writable: snap.writable,
      committed,
    };
    this.seedDrafts();
  }

  /**
   * Seed the controls from what the Host serves, and mark the seeded ones clean.
   *
   * A field is reseeded only when its committed value moved since the last seed:
   * an unrelated commit (the composer's translation pill writes `enabled`) must
   * not throw away a draft the reader is in the middle of.
   */
  private seedDrafts(): void {
    const committed = this.state.committed;
    const prev = this.seeded;
    const changed = (field: keyof CommittedConfig): boolean =>
      prev === null || prev[field] !== committed[field];
    const stages = this.state;
    this.state = {
      ...stages,
      baseUrl: changed('baseUrl')
        ? { text: committed.baseUrl, dirty: false, invalid: false }
        : stages.baseUrl,
      model: changed('model')
        ? { text: committed.model, dirty: false, invalid: false }
        : stages.model,
      aiTimeoutMs: changed('aiTimeoutMs')
        ? { text: String(committed.aiTimeoutMs), dirty: false, invalid: false }
        : stages.aiTimeoutMs,
      // 提示词输入框显示「生效的那份」：读者没写过就整段显示内置默认。
      prompt: changed('prompt')
        ? { text: resolvePrompt(committed.prompt), dirty: false, invalid: false }
        : stages.prompt,
    };
    this.seeded = committed;
    this.recomputeGate();
  }

  /** Rebuild every draft's dirty/invalid flags against the committed values. */
  private deriveDrafts(): void {
    const committed = this.state.committed;
    const stages = this.state;
    const timeout = parseTimeout(stages.aiTimeoutMs.text);
    this.state = {
      ...stages,
      baseUrl: {
        text: stages.baseUrl.text,
        dirty: stages.baseUrl.text.trim() !== committed.baseUrl.trim(),
        invalid: false,
      },
      model: {
        text: stages.model.text,
        dirty: stages.model.text.trim() !== committed.model.trim(),
        invalid: false,
      },
      aiTimeoutMs: {
        text: stages.aiTimeoutMs.text,
        dirty:
          (timeout === null ? '' : timeout === undefined ? stages.aiTimeoutMs.text : String(timeout)) !==
          String(committed.aiTimeoutMs),
        invalid: timeout === undefined,
      },
      // 与「生效的那份」比：空着与一字不差地写着默认，在这一格上是同一件事。
      prompt: {
        text: stages.prompt.text,
        dirty: resolvePrompt(stages.prompt.text) !== resolvePrompt(committed.prompt),
        invalid: false,
      },
    };
    this.recomputeGate();
  }

  /** Fold dirty/invalid from every draft into the page-level flags. */
  private recomputeGate(): void {
    const s = this.state;
    const fields = [s.baseUrl, s.model, s.aiTimeoutMs, s.prompt];
    this.state = {
      ...s,
      dirty: fields.some((field) => field.dirty) || s.apiKey.dirty,
      invalid: fields.some((field) => field.invalid),
    };
    this.notify();
  }

  /**
   * Stage one text control. The draft is local: nothing leaves this page until
   * a save, so a half-typed Base URL never reaches the translation path.
   */
  draft(field: 'baseUrl' | 'model' | 'aiTimeoutMs' | 'prompt' | 'apiKey', text: string): void {
    this.state = {
      ...this.state,
      [field]: field === 'apiKey' ? { text, dirty: true } : { ...this.state[field], text },
      saveFailed: false,
    };
    this.deriveDrafts();
  }

  /**
   * Put the built-in instruction back into the draft.
   *
   * Restoring is intentionally a draft edit like typing: nothing is written
   * until the reader saves, so the button beside the field behaves exactly like
   * the field itself.
   */
  restoreDefaultPrompt(): void {
    this.draft('prompt', DEFAULT_PROMPT);
  }

  /**
   * The master switch, written straight through: the composer dock pill and the
   * page's own switch are two entries into one state, and the pill has no save
   * button to press.
   */
  async setEnabled(enabled: boolean): Promise<void> {
    this.state = { ...this.state, committed: { ...this.state.committed, enabled } };
    this.notify();
    const form = this.form;
    if (!form || !this.state.writable) return;
    await form.mutate([{ op: 'set', path: ['enabled'], value: enabled }]).catch(() => {});
  }

  /**
   * Put the prompt box back to rest: show the instruction actually in force.
   *
   * A reader who clears the box, or types the default back word for word, has
   * staged no change — the effective prompt is still the default. Leaving the
   * box blank in that state would contradict what the card promises (the box
   * always shows what the model receives), so it is filled in again. Called when
   * a save lands and when the reader leaves the editing state.
   */
  settlePromptDraft(): void {
    if (!isDefaultPrompt(this.state.prompt.text)) return;
    this.state = {
      ...this.state,
      prompt: { text: resolvePrompt(this.state.committed.prompt), dirty: false, invalid: false },
    };
    this.recomputeGate();
  }

  /**
   * Write every staged edit as one revision-fenced batch, then probe the
   * channel and report what the probe found.
   *
   * The probe runs after the save lands, never before it: a probe against
   * values the Host has not accepted would report on a configuration nobody
   * has. A refused write keeps every draft so the reader can correct it.
   *
   * @returns nothing; the outcome is published through {@link getState}.
   */
  async save(): Promise<void> {
    if (this.state.saving) return;
    if (this.state.invalid) return;
    const form = this.form;
    // 读者碰过 Key 这一格才谈得上写它：密钥从不回显，所以「空草稿」有两种意思——
    // 没碰过是「别动它」，碰过又清空是「清掉它」。
    const keyTouched = this.state.apiKey.dirty;
    if (!this.state.dirty) return;
    if (!form && !keyTouched) return;
    if (!this.state.writable && !keyTouched) return;

    const ops: SettingsPathOpLike[] = [];
    const baseUrl = this.state.baseUrl.text.trim();
    const model = this.state.model.text.trim();
    const timeout = parseTimeout(this.state.aiTimeoutMs.text);
    if (baseUrl !== this.state.committed.baseUrl.trim()) {
      ops.push(baseUrl === '' ? { op: 'unset', path: ['baseUrl'] } : { op: 'set', path: ['baseUrl'], value: baseUrl });
    }
    if (model !== this.state.committed.model.trim()) {
      ops.push(model === '' ? { op: 'unset', path: ['model'] } : { op: 'set', path: ['model'], value: model });
    }
    if (timeout === null) {
      // 空着保存 = 清除该项：写 unset，让它回落到 schema 默认；值本来就等于默认
      // 时不必写一条什么也不改变的记录。
      if (this.state.committed.aiTimeoutMs !== DEFAULT_CONFIG.aiTimeoutMs) {
        ops.push({ op: 'unset', path: ['aiTimeoutMs'] });
      }
    } else if (typeof timeout === 'number' && timeout !== this.state.committed.aiTimeoutMs) {
      ops.push({ op: 'set', path: ['aiTimeoutMs'], value: timeout });
    }
    // 提示词：一字不差等于内置默认时写 unset，把「空着 = 用默认」这条规则留在
    // 配置文档里；空着保存同样等于回到默认。与已保存值逐字比，不动它就不写记录。
    const prompt = this.state.prompt.text.trim();
    const committedPrompt = this.state.committed.prompt.trim();
    if (isDefaultPrompt(prompt)) {
      if (committedPrompt !== '') ops.push({ op: 'unset', path: ['prompt'] });
    } else if (prompt !== committedPrompt) {
      ops.push({ op: 'set', path: ['prompt'], value: prompt });
    }

    this.state = { ...this.state, saving: true, saveFailed: false, probe: undefined };
    this.notify();

    let landed = true;
    if (ops.length > 0 && form) {
      landed = await form
        .mutate(ops, form.getSnapshot().revision)
        .then(() => true)
        .catch(() => false);
    }
    if (landed && keyTouched) {
      landed = (await this.saveApiKey(this.state.apiKey.text)).ok;
    }
    if (!landed) {
      this.state = { ...this.state, saving: false, saveFailed: true };
      this.notify();
      return;
    }

    // Committed now; keep the key draft blank (a secret is never echoed back).
    this.state = {
      ...this.state,
      saving: false,
      saveFailed: false,
      apiKey: { text: '', dirty: false },
      probe: { running: true },
    };
    this.settlePromptDraft();
    this.notify();
    const probe = await testServerChannel('openai');
    this.state = {
      ...this.state,
      probe: { running: false, ok: probe.ok, message: probe.error },
    };
    this.deriveDrafts();
  }

  /** Pull the key's status-only view and re-derive readiness. */
  async refreshKeyStatus(): Promise<void> {
    if (!this.credentials) return;
    try {
      const res = await this.credentials.describe([TRANSLATE_API_KEY_REF]);
      if (!res.ok) return;
      const info = res.value[TRANSLATE_API_KEY_REF];
      this.keyConfigured = Boolean(info?.configured);
      this.deriveCommitted();
    } catch {
      // Credentials surface unavailable — keep the last known status.
    }
  }

  /**
   * Write (or clear) the API key through the credentials Remote API.
   *
   * @param apiKey - the staged key; a blank value clears the ref, because the
   * save only reaches here for a draft the reader actually produced.
   * @returns whether the credentials surface accepted the write.
   */
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
    if (this.unsubscribeForm) {
      this.unsubscribeForm();
      this.unsubscribeForm = null;
    }
    this.form = null;
    this.credentials = null;
    this.listeners.clear();
  }

  private notify(): void {
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch {}
    }
  }
}

export const settingsStore = new SettingsStore();
