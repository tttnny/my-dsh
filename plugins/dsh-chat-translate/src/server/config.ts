import * as fs from 'node:fs/promises';
import type { Volatile } from '@deepseek-ai/cordis';
import type { PluginConfig } from './types.ts';
import type { CredentialsReader } from './credentials.ts';

/** Hard cap for the translation concurrency pool. */
export const MAX_CONCURRENCY = 100;

/** Bounds for the AI channel request timeout. */
export const AI_TIMEOUT_MIN = 500;
export const AI_TIMEOUT_MAX = 120000;

/**
 * Bounds for the think-chain request timeout. A full reasoning block can take
 * minutes on a local model, so this budget is far larger than the short-text
 * AI timeout and is bounded separately.
 */
export const THINK_TIMEOUT_MIN = 500;
export const THINK_TIMEOUT_MAX = 900000;

/** Entries kept in the think-chain cache pool, separate from the title pool. */
export const THINK_CACHE_ENTRIES = 300;

/**
 * The settings namespace this plugin owns. Since 0.1.7 a namespace IS the
 * Profile entry id, so the user-editable layer is the `config` row of
 * `dsh-chat-translate` in the active profile's patch
 * (`~/.dsh/profiles/<profile>/cordis.patch.yml`). The standalone
 * ~/.dsh/dsh-chat-translate-config.json file is legacy (<=1.1) and is migrated
 * once at boot.
 */
export const SETTINGS_NAMESPACE = 'dsh-chat-translate';

export const DEFAULT_CONFIG: PluginConfig = {
  enabled: true,
  concurrency: 3,
  timeoutMs: 2000,
  aiTimeoutMs: 30000,
  thinkTimeoutMs: 600000,
  aiEnabled: true,
  bingEnabled: true,
  thinkEnabled: true,
  baseUrl: '',
  model: '',
  targetLang: 'zh-Hans',
};

/**
 * Live read face of this plugin's own Config, as `ConfigManager` consumes it.
 *
 * Keeping this structural (instead of importing the DSH packages) lets tests
 * inject an in-memory fake and keeps the host bundle free of service code. The
 * plugin has no write face of its own: an accepted edit is written by the
 * browser configuration form into the profile patch, and DSH commits the new
 * value into the `Volatile` refs this source reads.
 */
export interface ConfigSourceLike {
  /** Resolved value: schema defaults, then composition base, then user layer. */
  get(): PluginConfig;
  /** Observe committed live edits; returns the disposer. */
  watch(listener: (config: PluginConfig) => void): () => void;
}

/**
 * Fields of this plugin's Config as the runtime resolved them. Every field is
 * declared `volatile()`, so each one is a stable ref DSH commits a live edit
 * into rather than a snapshot taken at apply time.
 */
export interface PluginConfigRefs {
  readonly enabled: Volatile<boolean>;
  readonly concurrency: Volatile<number>;
  readonly timeoutMs: Volatile<number>;
  readonly aiTimeoutMs: Volatile<number>;
  readonly thinkTimeoutMs: Volatile<number>;
  readonly aiEnabled: Volatile<boolean>;
  readonly bingEnabled: Volatile<boolean>;
  readonly thinkEnabled: Volatile<boolean>;
  readonly baseUrl: Volatile<string>;
  readonly model: Volatile<string>;
  readonly targetLang: Volatile<string>;
}

/**
 * Read the current committed value of every Config field.
 * @param refs - the runtime-resolved Config object.
 * @returns A detached plain config value.
 */
export function readPluginConfig(refs: PluginConfigRefs): PluginConfig {
  return {
    enabled: refs.enabled.get(),
    concurrency: refs.concurrency.get(),
    timeoutMs: refs.timeoutMs.get(),
    aiTimeoutMs: refs.aiTimeoutMs.get(),
    thinkTimeoutMs: refs.thinkTimeoutMs.get(),
    aiEnabled: refs.aiEnabled.get(),
    bingEnabled: refs.bingEnabled.get(),
    thinkEnabled: refs.thinkEnabled.get(),
    baseUrl: refs.baseUrl.get(),
    model: refs.model.get(),
    targetLang: refs.targetLang.get(),
  };
}

/**
 * Adapt this plugin's runtime-resolved Config into the live source
 * {@link ConfigManager} consumes.
 *
 * DSH commits an accepted live edit into the `Volatile` refs in place, then
 * emits `loader/volatile-update` on the owning fiber — the listener is scoped
 * to this plugin's own entry, so one subscription covers every field.
 *
 * @param onVolatileUpdate - subscribes to this plugin's volatile-commit event.
 * @param refs - the runtime-resolved Config object.
 * @returns The live read/watch source.
 */
export function createLiveConfigSource(
  onVolatileUpdate: (listener: () => void) => () => void,
  refs: PluginConfigRefs
): ConfigSourceLike {
  return {
    get: () => readPluginConfig(refs),
    watch: (listener) => onVolatileUpdate(() => listener(readPluginConfig(refs))),
  };
}

/**
 * One path-addressed edit to a settings namespace's user section, matching
 * DSH's `SettingsPathOp` wire shape.
 */
export type SettingsPathOpLike =
  | { op: 'set'; path: string[]; value: unknown }
  | { op: 'unset'; path: string[] };

/**
 * Provider-level write face the legacy migration needs: DSH's `ctx.settings`
 * service itself, whose `mutate` applies path ops under one revision fence.
 */
export interface SettingsMigrationTarget {
  describe(): Array<{ ns: string; user?: unknown; revision?: number }>;
  mutate(ns: string, ops: readonly SettingsPathOpLike[], expectedRevision?: number): Promise<unknown>;
}

/**
 * Config facade over this plugin's own live Config. No file I/O lives here
 * anymore: persistence, atomic writes, external-edit hot reload and the
 * browser-facing edit API are all owned by DSH itself.
 */
export class ConfigManager {
  private source: ConfigSourceLike;
  private credentials: CredentialsReader;

  constructor(source: ConfigSourceLike, credentials: CredentialsReader) {
    this.source = source;
    this.credentials = credentials;
  }

  getConfig(): PluginConfig {
    return this.source.get();
  }

  /** Whether the AI channel has every required piece: baseUrl, model and key. */
  isAiConfigured(): boolean {
    const config = this.getConfig();
    return Boolean(
      config.baseUrl.trim() &&
        config.model.trim() &&
        this.credentials.getApiKey()
    );
  }

  onConfigChange(listener: (config: PluginConfig) => void): () => void {
    return this.source.watch(listener);
  }
}

/**
 * Coerce a raw record (legacy config file, HTTP-era partials) into a
 * validated partial config patch. Unknown fields are dropped, type-mismatched
 * values are skipped (the schema default wins), and numerics are clamped —
 * so one bad field never takes down a whole migration.
 */
export function sanitizePatch(input: Record<string, unknown>): Partial<PluginConfig> {
  const next: Partial<PluginConfig> = {};
  if (typeof input.enabled === 'boolean') next.enabled = input.enabled;
  if (typeof input.aiEnabled === 'boolean') next.aiEnabled = input.aiEnabled;
  if (typeof input.bingEnabled === 'boolean') next.bingEnabled = input.bingEnabled;
  if (typeof input.thinkEnabled === 'boolean') next.thinkEnabled = input.thinkEnabled;

  if (typeof input.concurrency === 'number' && Number.isFinite(input.concurrency)) {
    next.concurrency = Math.min(Math.max(Math.round(input.concurrency), 1), MAX_CONCURRENCY);
  }
  if (typeof input.timeoutMs === 'number' && Number.isFinite(input.timeoutMs)) {
    next.timeoutMs = Math.min(Math.max(Math.round(input.timeoutMs), 500), 10000);
  }
  if (typeof input.aiTimeoutMs === 'number' && Number.isFinite(input.aiTimeoutMs)) {
    next.aiTimeoutMs = Math.min(
      Math.max(Math.round(input.aiTimeoutMs), AI_TIMEOUT_MIN),
      AI_TIMEOUT_MAX
    );
  }
  if (typeof input.thinkTimeoutMs === 'number' && Number.isFinite(input.thinkTimeoutMs)) {
    next.thinkTimeoutMs = Math.min(
      Math.max(Math.round(input.thinkTimeoutMs), THINK_TIMEOUT_MIN),
      THINK_TIMEOUT_MAX
    );
  }
  if (typeof input.baseUrl === 'string') next.baseUrl = input.baseUrl.trim();
  if (typeof input.model === 'string') next.model = input.model.trim();
  if (typeof input.targetLang === 'string' && input.targetLang.trim()) {
    next.targetLang = input.targetLang.trim();
  }
  return next;
}

/**
 * One-shot migration from the pre-1.2 standalone config file. Runs only while
 * the settings namespace has no user layer yet, so values the user edited
 * after upgrading are never overwritten. The legacy file is removed whether
 * or not a migration happened.
 * @returns whether any legacy values were migrated.
 */
export async function migrateLegacyConfigFile(
  settings: SettingsMigrationTarget,
  legacyPath: string
): Promise<boolean> {
  let raw: string;
  try {
    raw = await fs.readFile(legacyPath, 'utf-8');
  } catch {
    return false; // no legacy file — nothing to do
  }

  let legacy: unknown;
  try {
    legacy = JSON.parse(raw);
  } catch {
    // Corrupt legacy file — drop it and keep schema defaults.
    await fs.unlink(legacyPath).catch(() => {});
    return false;
  }
  if (typeof legacy !== 'object' || legacy === null || Array.isArray(legacy)) {
    await fs.unlink(legacyPath).catch(() => {});
    return false;
  }
  const record = legacy as Record<string, unknown>;

  // Never overwrite a user layer the user already has (e.g. edited through
  // the settings UI after upgrading). The legacy file is still retired.
  const descriptor = settings.describe().find((d) => d.ns === SETTINGS_NAMESPACE);
  if (descriptor?.user !== undefined) {
    await fs.unlink(legacyPath).catch(() => {});
    return false;
  }

  // Per-field sanitize: known fields only (retired keys like pre-1.1
  // `channels` drop by construction), type-mismatched values skipped, numeric
  // bounds clamped — one bad field never blocks the rest of the migration.
  const patch = sanitizePatch(record);
  const ops: SettingsPathOpLike[] = Object.entries(patch).map(([field, value]) => ({
    op: 'set',
    path: [field],
    value,
  }));
  if (ops.length === 0) {
    // Nothing migratable — retire the file and keep schema defaults.
    await fs.unlink(legacyPath).catch(() => {});
    return false;
  }

  try {
    // Revision-fenced path write: a concurrent user edit between the describe
    // above and this commit is refused instead of overwritten.
    await settings.mutate(SETTINGS_NAMESPACE, ops, descriptor?.revision);
  } catch (err) {
    // The patch is already sanitized, so a rejection here is a provider-level
    // failure (read-only document, disk trouble). Keep the file so the next
    // boot retries — destroying the only copy would lose the user's values.
    console.warn('[dsh-chat-translate] Legacy config migration failed; will retry on next boot:', err);
    return false;
  }

  await fs.unlink(legacyPath).catch((err) => {
    console.warn('[dsh-chat-translate] Failed to remove legacy config file:', err);
  });
  return true;
}
