/**
 * The configuration card's own state: what the Host serves, what the reader has
 * staged, and what a save would do.
 *
 * Three rules live here rather than in the component, because each is the kind
 * of thing a render pass must not be trusted with:
 *
 * - A row's sequence number is positional (`1..n`) and is never stored. Duplicate
 *   numbers are therefore impossible by construction rather than by validation.
 * - The two sections save separately. The judgement service and the task-type
 *   list are edited at different times and fail differently, so one save for both
 *   would let a half-finished description block a change to the endpoint.
 * - A save that did not land is reported as such. The shared configuration form
 *   answers `false` for a refusal, which is not a rejection: treating it as
 *   success would show a saved page over a document the Host never accepted.
 *
 * The model and effort options come from the Host's own "models subagents may
 * choose" setting and the adapter catalogue, so the plugin never keeps a second
 * list that could drift from it. The judgement key is write-only over the DSH
 * credentials service, which is why no key value is ever part of this state.
 */

import { isSelectableRow } from '../../server/judge-prompt.ts';
import { JUDGE_API_KEY_REF, type CredentialsRemoteLike } from '../../server/credentials.ts';

export { JUDGE_API_KEY_REF };
export type { CredentialsRemoteLike };

/** One type row as the page edits it; `id` is derived, never stored. */
export interface TypeRowDraft {
  description: string;
  provider: string;
  model: string;
  effort: string;
}

/** One selectable model and the efforts it declares. */
export interface ModelOption {
  provider: string;
  model: string;
  /** Display name from the adapter catalogue, when it advertises one. */
  label: string;
  /** Effort ids this exact route declares, in catalogue order. */
  efforts: string[];
}

/** One log row as the Host serves it. */
export interface LogRow {
  typeId: number | null;
  provider: string;
  model: string;
  effort: string;
  reason?: string;
  at: number;
  latencyMs: number;
  parentTitle: string;
  childLabel: string;
  /** The exact request body that went to the judge; '' when none went out. */
  prompt: string;
}

/** Which of the two sections a save writes. */
export type Section = 'judge' | 'rows';

/** What the page shows about the judgement key; never its value. */
export interface KeyState {
  /** Staged key text; blank until the reader types one. */
  text: string;
  /** Whether the Host reports a stored key under the reference. */
  configured: boolean;
  /** Whether the credentials document accepts writes. */
  writable: boolean;
  /**
   * Whether this page has no credentials channel at all — a non-loopback page
   * is served without the namespace, and a field that cannot be written should
   * say so before the reader types into it.
   */
  unavailable: boolean;
  saving: boolean;
  failed: boolean;
  /** The credentials service's own message for a refused write, or ''. */
  error: string;
  /** What the last landed key write did, or '' when none has landed. */
  landed: '' | 'saved' | 'cleared';
}

/** The card's whole state. */
export interface PageState {
  available: boolean;
  writable: boolean;
  /** Whether the model-rewrite switch is on. */
  enabled: boolean;
  /** Whether the log switch is on. */
  logEnabled: boolean;
  endpointUrl: string;
  judgeModel: string;
  rows: TypeRowDraft[];
  /** Model options read from the Host's allowlist plus the adapter catalogue. */
  models: ModelOption[];
  /** Whether the adapter catalogue was read; false means the effort column is free text. */
  catalogRead: boolean;
  /** Persisted values, for computing dirtiness and reverting. */
  committed: {
    enabled: boolean;
    logEnabled: boolean;
    endpointUrl: string;
    judgeModel: string;
    rows: TypeRowDraft[];
  };
  /** Whether the judgement service section holds edits a save would write. */
  judgeDirty: boolean;
  /** Whether the task-type list holds edits a save would write. */
  rowsDirty: boolean;
  /** Whether either section holds edits, for the preview's own notice. */
  dirty: boolean;
  /** A reason the task-type drafts cannot be saved; '' when they can. */
  rowsInvalid: string;
  /** Which section a save is crossing the wire for, or '' when none is. */
  saving: Section | '';
  /** Which section's last save did not land, or '' when none failed. */
  saveFailed: Section | '';
  /** The Host's own message for the last refused write, or ''. */
  saveError: string;
  /** The judgement key's write-only state. */
  key: KeyState;
  /** Runtime log rows, newest first. */
  log: LogRow[];
  logLoaded: boolean;
  logFailed: boolean;
}

/** Defaults mirroring the Host schema, so an unserved page still renders. */
export const DEFAULT_ENDPOINT_URL = 'http://127.0.0.1:3425/v1/systemone';
export const DEFAULT_JUDGE_MODEL = 'future-jev/jev-latest';

/** Profile entry id (== settings namespace). */
export const SETTINGS_NAMESPACE = 'dsh-subagent-judge-dispatch';

/** The Host's own allowlist namespace, which the card reads for model options. */
export const ALLOWED_MODELS_NAMESPACE = 'subagent-model-selection-settings';

/** One path-addressed edit, matching the wire shape the form's `mutate` accepts. */
export type SettingsPathOpLike =
  | { op: 'set'; path: string[]; value: unknown }
  | { op: 'unset'; path: string[] };

/** Minimal structural shape of the DSH shared configuration form. */
export interface ConfigFormLike {
  getSnapshot(): {
    status: 'loading' | 'ready' | 'unavailable';
    value?: Record<string, unknown>;
    writable: boolean;
    revision?: number;
  };
  subscribe(listener: () => void): () => void;
  mutate(ops: readonly SettingsPathOpLike[], expectedRevision?: number): Promise<boolean>;
}

/** The `remote.session` face the model catalogue is read through. */
export interface SessionRemoteLike {
  modelCatalog(): Promise<
    | { ok: true; value: { groups: readonly { id: string; name: string; models: readonly { id: string; name: string; reasoning?: { efforts: readonly { id: string }[] } }[] }[] } }
    | { ok: false; error: { message: string } }
  >;
}

/**
 * The Host's three runtime reads.
 *
 * They are plain Fetch calls on this plugin's own routes rather than a Remote
 * namespace: the routes ride Connection's authenticated `/api` transport, which
 * is the same channel the page is already served over.
 */
export interface DispatchRemoteLike {
  log(): Promise<LogRow[]>;
  preview(): Promise<string | null>;
  probe(): Promise<{ ok: boolean; latencyMs: number; reason?: string }>;
}

/** The three route paths, shared with the Host half by literal. */
export const LOG_ROUTE_PATH = '/api/dsh-subagent-judge-dispatch/log';
export const PREVIEW_ROUTE_PATH = '/api/dsh-subagent-judge-dispatch/preview';
export const PROBE_ROUTE_PATH = '/api/dsh-subagent-judge-dispatch/probe';

/** Decode a response body, treating an unreadable one as absent. */
async function readJson(response: Response): Promise<any> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/** The real Host reads, over this plugin's own routes. */
export function createDispatchRemote(): DispatchRemoteLike {
  return {
    async log(): Promise<LogRow[]> {
      try {
        const response = await fetch(LOG_ROUTE_PATH);
        if (!response.ok) return [];
        const body = await readJson(response);
        return Array.isArray(body?.entries) ? (body.entries as LogRow[]) : [];
      } catch {
        return [];
      }
    },
    async preview(): Promise<string | null> {
      try {
        const response = await fetch(PREVIEW_ROUTE_PATH);
        if (!response.ok) return null;
        const body = await readJson(response);
        return typeof body?.preview === 'string' ? body.preview : null;
      } catch {
        return null;
      }
    },
    async probe(): Promise<{ ok: boolean; latencyMs: number; reason?: string }> {
      try {
        const response = await fetch(PROBE_ROUTE_PATH, { method: 'POST' });
        if (!response.ok) return { ok: false, latencyMs: 0, reason: 'unreachable' };
        const body = await readJson(response);
        if (body === null || typeof body !== 'object') return { ok: false, latencyMs: 0, reason: 'unreachable' };
        return {
          ok: body.ok === true,
          latencyMs: typeof body.latencyMs === 'number' ? body.latencyMs : 0,
          ...typeof body.reason === 'string' ? { reason: body.reason } : {},
        };
      } catch {
        return { ok: false, latencyMs: 0, reason: 'unreachable' };
      }
    },
  };
}

/**
 * Read one row from a stored document value, tolerating a partial record.
 * @param value - one entry of the stored `rows` array.
 * @returns the row's four text fields, each defaulted to ''.
 */
export function readRow(value: unknown): TypeRowDraft {
  const record = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const text = (key: string): string => (typeof record[key] === 'string' ? (record[key] as string) : '');
  return {
    description: text('description'),
    provider: text('provider'),
    model: text('model'),
    effort: text('effort'),
  };
}

/**
 * The three route fields of one log row as a single scanned value.
 *
 * The list shows one "choice" cell rather than three, because provider, model
 * and effort are read together — "which route did this child run on". The three
 * are joined with the same middle dot the model menu uses, and a blank field is
 * dropped rather than left as a dangling separator on a fallback row that kept
 * only a partially known inherited route.
 *
 * @param row - the provider, model and effort to join.
 * @returns the joined text, or '' when all three are blank.
 */
export function describeChoice(row: Pick<LogRow, 'provider' | 'model' | 'effort'>): string {
  return [row.provider, row.model, row.effort]
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .join(' · ');
}

/**
 * Stable identity for one exact provider/model route.
 *
 * The separator is a NUL, which cannot appear in a provider or model id, so the
 * join and the split can never disagree. Both live here rather than at the call
 * sites: encoding and decoding are one concept and must not drift apart.
 *
 * @param provider - provider id.
 * @param model - model id.
 * @returns the composite key.
 */
export function routeKey(provider: string, model: string): string {
  return `${provider}\0${model}`;
}

/**
 * Split a composite route key back into its two ids.
 * @param key - a value produced by {@link routeKey}.
 * @returns the provider and model, both '' when the key is malformed.
 */
export function splitRouteKey(key: string): { provider: string; model: string } {
  const at = key.indexOf('\0');
  if (at < 0) return { provider: '', model: '' };
  return { provider: key.slice(0, at), model: key.slice(at + 1) };
}

/**
 * Pair the Host's allowlist with the adapter catalogue.
 *
 * The allowlist decides which routes may be offered; the catalogue supplies each
 * route's display name and the effort ids it declares. A route the allowlist
 * names but the catalogue no longer advertises is kept, so a stored row never
 * becomes uneditable merely because an adapter went away.
 *
 * @param allowed - the Host's `allowedModels` entries.
 * @param groups - catalogue provider groups.
 * @returns the options to render, in allowlist order.
 */
export function buildModelOptions(
  allowed: readonly { provider?: unknown; model?: unknown }[],
  groups: readonly { id: string; models: readonly { id: string; name: string; reasoning?: { efforts: readonly { id: string }[] } }[] }[],
): ModelOption[] {
  const byRoute = new Map<string, { label: string; efforts: string[] }>();
  for (const group of groups) {
    for (const model of group.models) {
      byRoute.set(routeKey(group.id, model.id), {
        label: model.name,
        efforts: (model.reasoning?.efforts ?? []).map((effort) => effort.id),
      });
    }
  }
  const options: ModelOption[] = [];
  const seen = new Set<string>();
  for (const entry of allowed) {
    const provider = typeof entry.provider === 'string' ? entry.provider : '';
    const model = typeof entry.model === 'string' ? entry.model : '';
    if (provider === '' || model === '') continue;
    const key = routeKey(provider, model);
    if (seen.has(key)) continue;
    seen.add(key);
    const found = byRoute.get(key);
    options.push({
      provider,
      model,
      label: found?.label ?? model,
      efforts: found?.efforts ?? [],
    });
  }
  return options;
}

/**
 * The reason the task-type drafts cannot be saved, or '' when they can.
 *
 * A duplicate description is refused because the description is the criterion
 * the judge reads: two identical criteria would make the answer ambiguous and
 * the log unreadable. An empty description is refused for the same reason — a
 * row the judge cannot tell apart from any other.
 *
 * @param rows - the staged rows.
 * @param t - the page's translator, so the message is localized.
 * @returns the reason text, or ''.
 */
export function validateRows(rows: readonly TypeRowDraft[], t: (key: string) => string): string {
  const seen = new Set<string>();
  for (const row of rows) {
    const description = row.description.trim();
    if (description === '') return t('save.emptyDescription');
    if (seen.has(description)) return t('save.duplicateDescription');
    seen.add(description);
  }
  return '';
}

/** A key nothing is staged for and nothing is known about. */
function emptyKey(): KeyState {
  return {
    text: '', configured: false, writable: false, unavailable: false,
    saving: false, failed: false, error: '', landed: '',
  };
}

/**
 * The read/write face of the Host document plus the runtime reads.
 *
 * Every control stages into this store and only a section's own save writes, so
 * a half-typed endpoint can never reach a delegation, and a half-written type
 * list can never be stored behind the reader's back.
 */
export class DispatchCardStore {
  private state: PageState = {
    available: false,
    writable: false,
    enabled: true,
    logEnabled: true,
    endpointUrl: DEFAULT_ENDPOINT_URL,
    judgeModel: DEFAULT_JUDGE_MODEL,
    rows: [],
    models: [],
    catalogRead: false,
    committed: {
      enabled: true,
      logEnabled: true,
      endpointUrl: DEFAULT_ENDPOINT_URL,
      judgeModel: DEFAULT_JUDGE_MODEL,
      rows: [],
    },
    judgeDirty: false,
    rowsDirty: false,
    dirty: false,
    rowsInvalid: '',
    saving: '',
    saveFailed: '',
    saveError: '',
    key: emptyKey(),
    log: [],
    logLoaded: false,
    logFailed: false,
  };

  private listeners = new Set<() => void>();
  private form: ConfigFormLike | null = null;
  private allowedForm: ConfigFormLike | null = null;
  private session: SessionRemoteLike | null = null;
  private remote: DispatchRemoteLike | null = null;
  private credentials: CredentialsRemoteLike | null = null;
  private offForm: (() => void) | null = null;
  private offAllowed: (() => void) | null = null;
  private translate: (key: string) => string = (key) => key;

  /** Bind the Host services; re-binding detaches the previous subscriptions. */
  attach(options: {
    form: ConfigFormLike | null;
    allowedForm: ConfigFormLike | null;
    session: SessionRemoteLike | null;
    remote: DispatchRemoteLike | null;
    credentials: CredentialsRemoteLike | null;
    t: (key: string) => string;
  }): void {
    this.offForm?.();
    this.offAllowed?.();
    this.form = options.form;
    this.allowedForm = options.allowedForm;
    this.session = options.session;
    this.remote = options.remote;
    this.credentials = options.credentials;
    this.translate = options.t;
    this.state = {
      ...this.state,
      key: { ...this.state.key, unavailable: options.credentials === null },
    };
    if (this.form !== null) {
      this.offForm = this.form.subscribe(() => this.deriveCommitted());
      this.deriveCommitted();
    }
    if (this.allowedForm !== null) {
      this.offAllowed = this.allowedForm.subscribe(() => void this.loadModels());
      void this.loadModels();
    }
    void this.refreshKeyStatus();
  }

  getState(): PageState {
    return this.state;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Read the Host's allowlist and the adapter catalogue into the model options. */
  async loadModels(): Promise<void> {
    const allowedValue = this.allowedForm?.getSnapshot().value;
    const allowed = Array.isArray(allowedValue?.allowedModels)
      ? (allowedValue.allowedModels as { provider?: unknown; model?: unknown }[])
      : [];
    let groups: readonly { id: string; models: readonly { id: string; name: string; reasoning?: { efforts: readonly { id: string }[] } }[] }[] = [];
    let catalogRead = false;
    if (this.session !== null) {
      try {
        const response = await this.session.modelCatalog();
        if (response.ok) {
          groups = response.value.groups;
          catalogRead = true;
        }
      } catch {
        // Handled by the flag below.
      }
    }
    // Whether the effort column may offer a fixed list. When the catalogue could
    // not be read the column falls back to free text rather than going
    // unavailable: an empty list would otherwise disable the effort cell on
    // every row, and a table where no row can be completed is a table that
    // silently stops judging anything.
    this.state = { ...this.state, models: buildModelOptions(allowed, groups), catalogRead };
    this.notify();
  }

  /** Read the status-only view of the judgement key. */
  async refreshKeyStatus(): Promise<void> {
    if (this.credentials === null) return;
    try {
      const response = await this.credentials.describe([JUDGE_API_KEY_REF]);
      if (!response.ok) return;
      const info = response.value[JUDGE_API_KEY_REF];
      this.state = {
        ...this.state,
        key: {
          ...this.state.key,
          configured: info?.configured === true,
          writable: info?.writable === true,
        },
      };
      this.notify();
    } catch {
      // The key stays "not configured": the status is an enrichment, and a
      // failed read must not claim a key that may not be there.
    }
  }

  /**
   * Map the Host's resolved section into committed state and re-seed the drafts.
   *
   * Drafts are held FIELD BY FIELD, against the value this page last saw
   * committed. Holding a whole section instead would make a save write back a
   * field the reader never touched — reverting a change another page made to it —
   * while holding nothing would discard input mid-typing every time the Host
   * publishes.
   */
  private deriveCommitted(): void {
    const snapshot = this.form?.getSnapshot();
    const value = snapshot?.value;
    if (value === undefined) return;
    const rows = Array.isArray(value.rows) ? (value.rows as unknown[]).map(readRow) : [];
    const committed = {
      enabled: typeof value.enabled === 'boolean' ? value.enabled : true,
      logEnabled: typeof value.logEnabled === 'boolean' ? value.logEnabled : true,
      endpointUrl: typeof value.endpointUrl === 'string' ? value.endpointUrl : DEFAULT_ENDPOINT_URL,
      judgeModel: typeof value.judgeModel === 'string' ? value.judgeModel : DEFAULT_JUDGE_MODEL,
      rows,
    };
    /** Whether the reader's staged value still differs from what this page last saw committed. */
    const staged = <T>(current: T, previously: T): boolean => current !== previously;
    const before = this.state.committed;
    this.state = {
      ...this.state,
      available: snapshot?.status === 'ready',
      writable: snapshot?.writable ?? false,
      committed,
      enabled: staged(this.state.enabled, before.enabled) ? this.state.enabled : committed.enabled,
      logEnabled: staged(this.state.logEnabled, before.logEnabled) ? this.state.logEnabled : committed.logEnabled,
      endpointUrl: staged(this.state.endpointUrl, before.endpointUrl) ? this.state.endpointUrl : committed.endpointUrl,
      judgeModel: staged(this.state.judgeModel, before.judgeModel) ? this.state.judgeModel : committed.judgeModel,
      rows: JSON.stringify(this.state.rows) !== JSON.stringify(before.rows) ? this.state.rows : committed.rows,
    };
    this.recompute();
  }

  /** Recompute per-section dirtiness and the row validation against committed values. */
  private recompute(): void {
    const committed = this.state.committed;
    const judgeDirty =
      this.state.enabled !== committed.enabled ||
      this.state.logEnabled !== committed.logEnabled ||
      this.state.endpointUrl !== committed.endpointUrl ||
      this.state.judgeModel !== committed.judgeModel ||
      this.state.key.text.trim() !== '';
    const rowsDirty = JSON.stringify(this.state.rows) !== JSON.stringify(committed.rows);
    this.state = {
      ...this.state,
      judgeDirty,
      rowsDirty,
      dirty: judgeDirty || rowsDirty,
      rowsInvalid: validateRows(this.state.rows, this.translate),
    };
    this.notify();
  }

  /** Stage one top-level field. */
  field(key: 'endpointUrl' | 'judgeModel', value: string): void {
    this.state = { ...this.state, [key]: value, saveFailed: '' };
    this.recompute();
  }

  /** Stage one switch. */
  toggle(key: 'enabled' | 'logEnabled', value: boolean): void {
    this.state = { ...this.state, [key]: value, saveFailed: '' };
    this.recompute();
  }

  /** Stage the judgement key. The value stays in this draft until a save. */
  key(text: string): void {
    this.state = { ...this.state, key: { ...this.state.key, text, failed: false, error: '', landed: '' } };
    this.recompute();
  }

  /** Stage one cell of one row. */
  cell(index: number, key: keyof TypeRowDraft, value: string): void {
    const rows = this.state.rows.map((row, at) => (at === index ? { ...row, [key]: value } : row));
    // Choosing a model drops an effort that model does not declare, so a save can
    // never carry an effort the selected route cannot run.
    this.state = {
      ...this.state,
      rows: key === 'model' ? this.reconcileEffort(rows, index) : rows,
      saveFailed: '',
    };
    this.recompute();
  }

  /** Drop an effort the freshly selected model does not declare. */
  private reconcileEffort(rows: TypeRowDraft[], index: number): TypeRowDraft[] {
    const row = rows[index];
    if (row === undefined) return rows;
    const option = this.state.models.find(
      (candidate) => candidate.provider === row.provider && candidate.model === row.model,
    );
    if (option === undefined || option.efforts.length === 0) return rows;
    if (row.effort !== '' && !option.efforts.includes(row.effort)) {
      return rows.map((candidate, at) => (at === index ? { ...candidate, effort: '' } : candidate));
    }
    return rows;
  }

  /** Append an empty row. */
  addRow(): void {
    this.state = { ...this.state, rows: [...this.state.rows, { description: '', provider: '', model: '', effort: '' }], saveFailed: '' };
    this.recompute();
  }

  /** Append a ready-made entry; the effort hint is not filled in. */
  addPreset(description: string): void {
    this.state = { ...this.state, rows: [...this.state.rows, { description, provider: '', model: '', effort: '' }], saveFailed: '' };
    this.recompute();
  }

  /** Delete one row; the remaining rows renumber themselves. */
  removeRow(index: number): void {
    this.state = { ...this.state, rows: this.state.rows.filter((_row, at) => at !== index), saveFailed: '' };
    this.recompute();
  }

  /** Discard one section's drafts back to the committed values. */
  revert(section: Section): void {
    const committed = this.state.committed;
    this.state = section === 'judge'
      ? {
        ...this.state,
        enabled: committed.enabled,
        logEnabled: committed.logEnabled,
        endpointUrl: committed.endpointUrl,
        judgeModel: committed.judgeModel,
        // 只清掉「还没交出去的那段文本」。密钥已经存在凭据文件里，放弃这一节的
        // 设置草稿不该让页面改口说「还没有密钥」——那是另一处的状态。
        key: { ...this.state.key, text: '', failed: false, error: '', landed: '' },
        saveFailed: '',
      }
      : { ...this.state, rows: committed.rows, saveFailed: '' };
    this.recompute();
  }

  /**
   * Write one section's staged edits as one revision-fenced batch.
   *
   * The judgement section also writes a typed key, so naming the endpoint and
   * giving it its credential is one gesture rather than two. The type rows are
   * written whole rather than diffed: the array is one value, and a positional
   * number is derived from it, so a partial write could momentarily renumber the
   * list under a reader mid-save.
   *
   * @param section - which section's drafts to write.
   */
  async save(section: Section): Promise<void> {
    if (this.state.saving !== '') return;
    const form = this.form;
    if (form === null || !this.state.writable) return;
    if (section === 'rows' && (this.state.rowsInvalid !== '' || !this.state.rowsDirty)) return;
    if (section === 'judge' && !this.state.judgeDirty) return;

    const ops: SettingsPathOpLike[] = [];
    if (section === 'judge') {
      if (this.state.endpointUrl !== this.state.committed.endpointUrl) {
        ops.push({ op: 'set', path: ['endpointUrl'], value: this.state.endpointUrl });
      }
      if (this.state.judgeModel !== this.state.committed.judgeModel) {
        ops.push({ op: 'set', path: ['judgeModel'], value: this.state.judgeModel });
      }
      if (this.state.enabled !== this.state.committed.enabled) {
        ops.push({ op: 'set', path: ['enabled'], value: this.state.enabled });
      }
      if (this.state.logEnabled !== this.state.committed.logEnabled) {
        ops.push({ op: 'set', path: ['logEnabled'], value: this.state.logEnabled });
      }
    } else if (JSON.stringify(this.state.rows) !== JSON.stringify(this.state.committed.rows)) {
      ops.push({ op: 'set', path: ['rows'], value: this.state.rows.map((row) => ({ ...row })) });
    }

    this.state = { ...this.state, saving: section, saveFailed: '', saveError: '' };
    this.notify();

    // The key goes first: a document write the Host refuses leaves the key in
    // place, while a key that landed with a refused endpoint is still a landed
    // key. Either way the reader is told which part did not take.
    const typedKey = section === 'judge' ? this.state.key.text.trim() : '';
    let failure = '';
    let keyLanded: '' | 'saved' | 'cleared' = '';
    if (typedKey !== '') {
      const result = await this.writeKey(typedKey);
      if (result.ok) keyLanded = 'saved';
      else failure = result.error;
    }
    if (failure === '' && ops.length > 0) {
      try {
        const landed = await form.mutate(ops, form.getSnapshot().revision);
        // `false` is a refusal, not a rejection: the Host answered and did not
        // accept, so reporting success here would show a saved page over a
        // document that still holds the old value.
        if (!landed) failure = this.translate('save.refused');
      } catch (error) {
        // The Host's own words, not a generic phrase: a rejected write is the one
        // place the reader needs to know WHAT the Host objected to.
        failure = error instanceof Error && error.message !== '' ? error.message : this.translate('save.invalid');
      }
    }
    this.state = {
      ...this.state,
      saving: '',
      saveFailed: failure === '' ? '' : section,
      saveError: failure,
      key: keyLanded === '' ? this.state.key : { ...this.state.key, text: '', landed: keyLanded },
    };
    if (failure === '') this.deriveCommitted();
    else this.notify();
  }

  /**
   * Write one judgement key through the credentials service.
   *
   * The service resolves with `{ ok: false }` rather than rejecting when it
   * refuses a write, so that result decides the outcome. The key value is handed
   * straight to the service and is never copied into the page state.
   *
   * @param value - the staged key text, already trimmed and known non-empty.
   * @returns whether the write landed, and the message when it did not.
   */
  private async writeKey(value: string): Promise<{ ok: boolean; error: string }> {
    const credentials = this.credentials;
    if (credentials === null) return { ok: false, error: this.translate('key.unavailable') };
    this.state = { ...this.state, key: { ...this.state.key, saving: true, failed: false, error: '' } };
    this.notify();
    try {
      const response = await credentials.set(JUDGE_API_KEY_REF, value);
      if (!response.ok) {
        const error = response.error.message || this.translate('key.saveFailed');
        this.state = { ...this.state, key: { ...this.state.key, saving: false, failed: true, error } };
        return { ok: false, error };
      }
      this.state = { ...this.state, key: { ...this.state.key, saving: false, failed: false, error: '', configured: true } };
      await this.refreshKeyStatus();
      return { ok: true, error: '' };
    } catch (error) {
      const message = error instanceof Error && error.message !== '' ? error.message : this.translate('key.saveFailed');
      this.state = { ...this.state, key: { ...this.state.key, saving: false, failed: true, error: message } };
      return { ok: false, error: message };
    }
  }

  /**
   * Remove the stored judgement key.
   *
   * A separate control rather than "save an empty field": the shared
   * configuration form's own rule is that a blank draft writes nothing, so an
   * emptied input cannot mean removal without contradicting it.
   *
   * @returns settlement after the credentials read-back.
   */
  async clearKey(): Promise<void> {
    const credentials = this.credentials;
    if (credentials === null) return;
    this.state = { ...this.state, key: { ...this.state.key, saving: true, failed: false, error: '' } };
    this.notify();
    try {
      const response = await credentials.unset(JUDGE_API_KEY_REF);
      if (!response.ok) {
        this.state = {
          ...this.state,
          key: {
            ...this.state.key,
            saving: false,
            failed: true,
            error: response.error.message || this.translate('key.clearFailed'),
          },
        };
      } else {
        this.state = {
          ...this.state,
          key: { ...this.state.key, saving: false, text: '', failed: false, error: '', landed: 'cleared', configured: false },
        };
        await this.refreshKeyStatus();
      }
    } catch (error) {
      this.state = {
        ...this.state,
        key: {
          ...this.state.key,
          saving: false,
          failed: true,
          error: error instanceof Error && error.message !== '' ? error.message : this.translate('key.clearFailed'),
        },
      };
    }
    this.notify();
  }

  /** Read the runtime log from the Host. */
  async refreshLog(): Promise<void> {
    if (this.remote === null) return;
    try {
      const entries = await this.remote.log();
      this.state = { ...this.state, log: entries, logLoaded: true, logFailed: false };
    } catch {
      this.state = { ...this.state, logLoaded: true, logFailed: true };
    }
    this.notify();
  }

  /** Read the exact prompt a judgement would send. */
  async preview(): Promise<string | null> {
    if (this.remote === null) return null;
    try {
      return await this.remote.preview();
    } catch {
      return null;
    }
  }

  /** Test the judge endpoint against the committed settings. */
  async probe(): Promise<{ ok: boolean; latencyMs: number; reason?: string }> {
    if (this.remote === null) return { ok: false, latencyMs: 0, reason: 'unreachable' };
    try {
      return await this.remote.probe();
    } catch {
      return { ok: false, latencyMs: 0, reason: 'unreachable' };
    }
  }

  /** The effort ids available for one row's currently selected model. */
  effortsFor(row: TypeRowDraft): string[] {
    return this.state.models.find(
      (candidate) => candidate.provider === row.provider && candidate.model === row.model,
    )?.efforts ?? [];
  }

  /** Whether one row will be offered to the judge (the server's own rule). */
  rowUsable(row: TypeRowDraft): boolean {
    return isSelectableRow(row);
  }

  private notify(): void {
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch {}
    }
  }
}

export const dispatchCardStore = new DispatchCardStore();
