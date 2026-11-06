/**
 * The configuration card's own state: what the Host serves, what the reader has
 * staged, and what a commit would write.
 *
 * Three rules live here rather than in the component, because each is the kind
 * of thing a render pass must not be trusted with:
 *
 * - A row's sequence number is positional (`1..n`) and is never stored. Duplicate
 *   numbers are therefore impossible by construction rather than by validation.
 * - A control commits on its own terms: a text field when focus leaves it, a
 *   switch or a row action the moment it is used. There is no save button, so a
 *   half-typed endpoint reaches a delegation only if the reader leaves the field
 *   — the same moment they would have pressed save.
 * - A commit that did not land is reported in the section that attempted it, and
 *   the drafts stay for the next attempt. The shared configuration form answers
 *   `false` for a refusal, which is not a rejection: treating it as success would
 *   show a saved page over a document the Host never accepted.
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

/** Which of the two sections a commit writes. */
export type Section = 'judge' | 'rows';

/** What the page shows about the judgement key; never its value. */
export interface KeyState {
  /** Staged key text; blank until the reader types one. */
  text: string;
  /** Whether the Host reports a stored key under the reference. */
  configured: boolean;
  /**
   * Whether this page has no credentials channel at all — a non-loopback page
   * is served without the namespace, and a field that cannot be written should
   * say so before the reader types into it.
   */
  unavailable: boolean;
  writing: boolean;
  failed: boolean;
  /** The credentials service's own message for a refused write, or ''. */
  error: string;
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
  /** Which section a commit is crossing the wire for, or '' when none is. */
  writing: Section | '';
  /** Which section's last commit did not land, or '' when none failed. */
  writeFailed: Section | '';
  /** The Host's own message for the last refused write, or ''. */
  writeError: string;
  /** The judgement key's write-only state. */
  key: KeyState;
  /** Runtime log rows, newest first. */
  log: LogRow[];
  logLoaded: boolean;
  logFailed: boolean;
}

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
 * The model and effort of one log row as a single scanned value.
 *
 * The list shows one "choice" cell rather than three, because model and effort
 * are read together — "which route did this child run on". The two are joined
 * with the same middle dot the model menu uses, and a blank field is dropped
 * rather than left as a dangling separator on a fallback row that kept only a
 * partially known inherited route. The provider stays out of the cell: it is
 * the same for nearly every row and is only one hover away in
 * {@link describeChoice}.
 *
 * @param row - the model and effort to join.
 * @returns the joined text, or '' when both are blank.
 */
export function describeModel(row: Pick<LogRow, 'model' | 'effort'>): string {
  return joinRouteParts([row.model, row.effort]);
}

/**
 * The full route of one log row: provider, model and effort.
 *
 * This is what the choice cell's hover bubble carries, so the provider is still
 * one hover away from a reader who needs to know which adapter served the
 * child. Blank fields are dropped by the same rule as {@link describeModel}.
 *
 * @param row - the provider, model and effort to join.
 * @returns the joined text, or '' when all three are blank.
 */
export function describeChoice(row: Pick<LogRow, 'provider' | 'model' | 'effort'>): string {
  return joinRouteParts([row.provider, row.model, row.effort]);
}

/**
 * Join the parts of a route the way both cells above need it.
 *
 * One rule, two callers: a blank part is dropped rather than left as a dangling
 * separator, and the rest are joined with the middle dot the model menu uses.
 *
 * @param parts - the route fields, in display order.
 * @returns the joined text, or '' when every part is blank.
 */
function joinRouteParts(parts: readonly string[]): string {
  return parts
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

/** The three sentences a row can be flagged with. */
export type RowHintKey = 'rows.incomplete' | 'rows.hintNoDescription' | 'rows.hintDuplicateDescription';

/** The page's translator, narrowed to the sentences a row hint can be. */
export type RowHintKeyTranslator = (key: RowHintKey) => string;

/**
 * Everything wrong with one row, as sentences to show under its number.
 *
 * Three faults, one place. A row whose model route is incomplete is not offered
 * to the judge at all; a row with a blank or repeated description is offered
 * with a criterion the judge cannot tell apart from another. None of them blocks
 * a write — the reader may be halfway through typing — so they are reported
 * beside the row while the list is written as it stands.
 *
 * @param rows - every row on the page, in page order.
 * @param index - which row to describe.
 * @param t - the page's translator, so each sentence is localized.
 * @returns the sentences, empty when the row has nothing wrong.
 */
export function rowHints(rows: readonly TypeRowDraft[], index: number, t: RowHintKeyTranslator): string[] {
  const row = rows[index];
  if (row === undefined) return [];
  const hints: string[] = [];
  if (!isSelectableRow(row)) hints.push(t('rows.incomplete'));
  const description = row.description.trim();
  if (description === '') {
    hints.push(t('rows.hintNoDescription'));
  } else if (rows.some((other, at) => at !== index && other.description.trim() === description)) {
    hints.push(t('rows.hintDuplicateDescription'));
  }
  return hints;
}

/**
 * The task-type list as plain JSON text, for copying out.
 *
 * The shape is the stored one — an array of `{ description, provider, model,
 * effort }` — with the sequence numbers left out: they are positional, and
 * writing them would invite a reader to think they are part of the setting.
 *
 * @param rows - the rows as they stand on the page.
 * @returns indented JSON text.
 */
export function exportRowsJson(rows: readonly TypeRowDraft[]): string {
  return JSON.stringify(
    // 空白行（读者按了「加一行」还没填）不写进 JSON：它没有内容可带走，写出去
    // 还会让这份文本自己读不回来。
    rows.filter((row) => !isBlankRow(row)).map((row) => ({
      description: row.description,
      provider: row.provider,
      model: row.model,
      effort: row.effort,
    })),
    null,
    2,
  );
}

/**
 * Whether a row carries nothing at all.
 * @param row - the row to inspect.
 * @returns true when all four fields are empty or whitespace.
 */
function isBlankRow(row: TypeRowDraft): boolean {
  return [row.description, row.provider, row.model, row.effort]
    .every((field) => field.trim() === '');
}

/** What reading pasted JSON produced. */
export type RowsImport =
  | { ok: true; rows: TypeRowDraft[] }
  /** `error` names the fault; the page turns it into its own sentence. */
  | { ok: false; error: 'json' | 'shape' | 'empty' };

/**
 * Read a pasted task-type list.
 *
 * The text is checked before it can reach the page: it must be one JSON array,
 * every element must be an object, and the four fields must be strings. An
 * unknown field is ignored rather than refused, so a list copied from a newer
 * version still loads what it understands.
 *
 * @param text - what the reader pasted.
 * @returns the rows, or the fault that stopped it.
 */
export function parseRowsJson(text: string): RowsImport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'json' };
  }
  if (!Array.isArray(parsed)) return { ok: false, error: 'shape' };
  if (parsed.length === 0) return { ok: false, error: 'empty' };
  const rows: TypeRowDraft[] = [];
  for (const value of parsed) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return { ok: false, error: 'shape' };
    const record = value as Record<string, unknown>;
    // 字段存在但不是文字，是形状不对；缺字段当作空串，那是合法的残缺记录。
    const wrongType = ['description', 'provider', 'model', 'effort']
      .some((key) => record[key] !== undefined && typeof record[key] !== 'string');
    if (wrongType) return { ok: false, error: 'shape' };
    const field = (key: string): string => (typeof record[key] === 'string' ? (record[key] as string) : '');
    const row = {
      description: field('description'),
      provider: field('provider'),
      model: field('model'),
      effort: field('effort'),
    };
    // 空白行照收不误、直接跳过：导出会带来这种行，拒收会让这份 JSON 自己读不回来。
    if (isBlankRow(row)) continue;
    rows.push(row);
  }
  if (rows.length === 0) return { ok: false, error: 'empty' };
  return { ok: true, rows };
}

/** The judgement service's connection settings, as the page exports and imports them. */
export interface JudgeConfigDraft {
  endpointUrl: string;
  judgeModel: string;
}

/**
 * The judgement service's connection settings as plain JSON text, for copying out.
 *
 * The key is not part of it: it is write-only, and a copied document that
 * carried a secret would be a secret in a clipboard.
 *
 * @param state - the three settings as the page holds them.
 * @returns indented JSON text.
 */
export function exportJudgeJson(
  state: Pick<PageState, 'endpointUrl' | 'judgeModel'>,
): string {
  return JSON.stringify(
    {
      endpointUrl: state.endpointUrl,
      judgeModel: state.judgeModel,
    },
    null,
    2,
  );
}

/** What reading pasted judgement-service JSON produced. */
export type JudgeImport =
  | { ok: true; value: JudgeConfigDraft }
  /** `error` names the fault; the page turns it into its own sentence. */
  | { ok: false; error: 'json' | 'shape' | 'empty' };

/**
 * Read pasted judgement-service settings.
 *
 * The text is checked before it can reach the page: it must be one JSON object
 * and the two fields must be strings. An unknown field is ignored rather than
 * refused, so a document copied from a newer version still loads what it
 * understands.
 *
 * @param text - what the reader pasted.
 * @returns the settings, or the fault that stopped it.
 */
export function parseJudgeJson(text: string): JudgeImport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'json' };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: 'shape' };
  }
  const record = parsed as Record<string, unknown>;
  const wrongType = ['endpointUrl', 'judgeModel']
    .some((key) => record[key] !== undefined && typeof record[key] !== 'string');
  if (wrongType) return { ok: false, error: 'shape' };
  const value: JudgeConfigDraft = {
    endpointUrl: typeof record.endpointUrl === 'string' ? record.endpointUrl : '',
    judgeModel: typeof record.judgeModel === 'string' ? record.judgeModel : '',
  };
  if (value.endpointUrl.trim() === '' && value.judgeModel.trim() === '') {
    return { ok: false, error: 'empty' };
  }
  return { ok: true, value };
}

/** A key nothing is staged for and nothing is known about. */
function emptyKey(): KeyState {
  return {
    text: '', configured: false, unavailable: false,
    writing: false, failed: false, error: '',
  };
}

/**
 * The read/write face of the Host document plus the runtime reads.
 *
 * Every control stages into this store and commits on its own terms, so a
 * half-typed endpoint can never reach a delegation: a field writes when focus
 * leaves it, which is the moment the reader has finished with it. Commits are
 * serialized through one queue, so two controls left in quick succession cannot
 * race the Host's revision fence.
 */
export class DispatchCardStore {
  private state: PageState = {
    available: false,
    writable: false,
    enabled: true,
    logEnabled: true,
    endpointUrl: '',
    judgeModel: '',
    rows: [],
    models: [],
    catalogRead: false,
    committed: {
      enabled: true,
      logEnabled: true,
      endpointUrl: '',
      judgeModel: '',
      rows: [],
    },
    writing: '',
    writeFailed: '',
    writeError: '',
    key: emptyKey(),
    log: [],
    logLoaded: false,
    logFailed: false,
  };

  private listeners = new Set<() => void>();
  /** One commit at a time: a queued write reads the drafts as they stand when it runs. */
  private queue: Promise<void> = Promise.resolve();
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
        key: { ...this.state.key, configured: info?.configured === true },
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
      endpointUrl: typeof value.endpointUrl === 'string' ? value.endpointUrl : '',
      judgeModel: typeof value.judgeModel === 'string' ? value.judgeModel : '',
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
    this.notify();
  }

  /**
   * Stage one edit.
   *
   * A failure stays on screen until a write lands: the value it complains about
   * has not reached the document yet, so clearing it on the first keystroke would
   * say "fixed" while the drafts are still only on this page.
   *
   * @param patch - the state fields this edit changes.
   */
  private stage(patch: Partial<PageState>): void {
    this.state = { ...this.state, ...patch };
    this.notify();
  }

  /** Stage one top-level field; its control commits when focus leaves it. */
  field(key: 'endpointUrl' | 'judgeModel', value: string): void {
    this.stage(key === 'endpointUrl' ? { endpointUrl: value } : { judgeModel: value });
  }

  /** Flip one switch and write it: a switch is one complete decision. */
  toggle(key: 'enabled' | 'logEnabled', value: boolean): void {
    this.stage(key === 'enabled' ? { enabled: value } : { logEnabled: value });
    void this.commit('judge');
  }

  /** Stage the judgement key; its control commits when focus leaves it or on Enter. */
  key(text: string): void {
    this.stage({ key: { ...this.state.key, text, failed: false, error: '' } });
  }

  /** Stage one cell of one row; a text cell commits on blur, a menu choice at once. */
  cell(index: number, key: keyof TypeRowDraft, value: string): void {
    const rows = this.state.rows.map((row, at) => (at === index ? { ...row, [key]: value } : row));
    // Choosing a model drops an effort that model does not declare, so a write can
    // never carry an effort the selected route cannot run.
    this.stage({ rows: key === 'model' ? this.reconcileEffort(rows, index) : rows });
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

  /** Append an empty row and write it: a new row is a decision like any other. */
  addRow(): void {
    this.stage({ rows: [...this.state.rows, { description: '', provider: '', model: '', effort: '' }] });
    void this.commit('rows');
  }

  /**
   * Replace the list with an imported one and write it.
   *
   * The import dialog's own button is the confirmation, so the list it produces
   * is written at once rather than left as a draft the reader has to commit a
   * second time.
   *
   * @param rows - the rows read from the pasted JSON.
   */
  replaceRows(rows: readonly TypeRowDraft[]): void {
    this.stage({ rows: rows.map((row) => ({ ...row })) });
    void this.commit('rows');
  }

  /**
   * Replace the judgement service's connection settings with an imported set and
   * write them.
   *
   * The import dialog's own button is the confirmation, so the settings it
   * produces are written at once rather than left as a draft.
   *
   * @param draft - the settings read from the pasted JSON.
   */
  replaceJudgeConfig(draft: JudgeConfigDraft): void {
    this.stage({
      endpointUrl: draft.endpointUrl,
      judgeModel: draft.judgeModel,
    });
    void this.commit('judge');
  }

  /** Delete one row and write the rest; the remaining rows renumber themselves. */
  removeRow(index: number): void {
    this.stage({ rows: this.state.rows.filter((_row, at) => at !== index) });
    void this.commit('rows');
  }

  /**
   * Write one section's staged edits as one revision-fenced batch.
   *
   * Commits are queued rather than overlapped: the Host fences each write on a
   * revision, and two controls left in quick succession would otherwise have the
   * second write fenced against a revision the first one just replaced. The queue
   * also makes a write read the drafts as they stand when it runs, so a burst of
   * edits coalesces into the fewest writes that still land the latest value.
   *
   * The judgement section also writes a typed key, so leaving the key field and
   * leaving the endpoint field are one kind of gesture. The type rows are written
   * whole rather than diffed: the array is one value, and a positional number is
   * derived from it, so a partial write could momentarily renumber the list under
   * a reader mid-write.
   *
   * @param section - which section's drafts to write.
   * @returns settlement after the write, whether it landed or not.
   */
  commit(section: Section): Promise<void> {
    this.queue = this.queue.then(() => this.write(section)).catch(() => {});
    return this.queue;
  }

  /** Write whatever both sections still hold; used when the page is left. */
  flush(): Promise<void> {
    return this.commit('judge').then(() => this.commit('rows'));
  }

  /**
   * The write itself, run from the queue.
   * @param section - which section's drafts to write.
   */
  private async write(section: Section): Promise<void> {
    const form = this.form;
    if (form === null || !this.state.writable) return;

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

    const typedKey = section === 'judge' ? this.state.key.text.trim() : '';
    if (ops.length === 0 && typedKey === '') {
      // Nothing is left to write: the drafts match the document again, so a
      // failure about this section is no longer the current fact.
      if (this.state.writeFailed === section) {
        this.state = { ...this.state, writeFailed: '', writeError: '' };
        this.notify();
      }
      return;
    }

    this.state = { ...this.state, writing: section, writeFailed: '', writeError: '' };
    this.notify();

    // The key goes first: a document write the Host refuses leaves the key in
    // place, while a key that landed with a refused endpoint is still a landed
    // key. Either way the reader is told which part did not take.
    let failure = '';
    let keyFailed = false;
    if (typedKey !== '') {
      const result = await this.writeKey(typedKey);
      if (!result.ok) {
        failure = result.error;
        keyFailed = true;
      }
    }
    if (failure === '' && ops.length > 0) {
      try {
        const landed = await form.mutate(ops, form.getSnapshot().revision);
        // `false` is a refusal, not a rejection: the Host answered and did not
        // accept, so reporting success here would show a saved page over a
        // document that still holds the old value.
        if (!landed) failure = this.translate('write.refused');
      } catch (error) {
        // The Host's own words, not a generic phrase: a rejected write is the one
        // place the reader needs to know WHAT the Host objected to.
        failure = error instanceof Error && error.message !== '' ? error.message : this.translate('write.invalid');
      }
    }
    // A key failure is already on the key row; repeating it at the section's foot
    // would say the same sentence twice.
    this.state = {
      ...this.state,
      writing: '',
      writeFailed: failure === '' || keyFailed ? '' : section,
      writeError: keyFailed ? '' : failure,
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
    this.state = { ...this.state, key: { ...this.state.key, writing: true, failed: false, error: '' } };
    this.notify();
    try {
      const response = await credentials.set(JUDGE_API_KEY_REF, value);
      if (!response.ok) {
        const error = response.error.message || this.translate('key.writeFailed');
        this.state = { ...this.state, key: { ...this.state.key, writing: false, failed: true, error } };
        return { ok: false, error };
      }
      this.state = {
        ...this.state,
        key: { ...this.state.key, writing: false, failed: false, error: '', text: '', configured: true },
      };
      await this.refreshKeyStatus();
      return { ok: true, error: '' };
    } catch (error) {
      const message = error instanceof Error && error.message !== '' ? error.message : this.translate('key.writeFailed');
      this.state = { ...this.state, key: { ...this.state.key, writing: false, failed: true, error: message } };
      return { ok: false, error: message };
    }
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
