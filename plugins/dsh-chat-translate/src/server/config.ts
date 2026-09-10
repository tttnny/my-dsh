import * as fs from 'node:fs/promises';
import type { PluginConfig } from './types.ts';
import type { CredentialsReader } from './credentials.ts';

/** Hard cap for the translation concurrency pool. */
export const MAX_CONCURRENCY = 100;

/** Bounds for the AI channel request timeout. */
export const AI_TIMEOUT_MIN = 500;
export const AI_TIMEOUT_MAX = 120000;

/**
 * The settings namespace this plugin owns. The user-editable layer lives in
 * the DSH-managed document (~/.dsh/settings.yaml) under this key; the
 * standalone ~/.dsh/dsh-chat-translate-config.json file is legacy (<=1.1).
 */
export const SETTINGS_NAMESPACE = 'dsh-chat-translate';

export const DEFAULT_CONFIG: PluginConfig = {
  enabled: true,
  concurrency: 3,
  timeoutMs: 2000,
  aiTimeoutMs: 30000,
  aiEnabled: true,
  bingEnabled: true,
  baseUrl: '',
  model: '',
  targetLang: 'zh-Hans',
};

/**
 * Minimal shape of the owner scope returned by `ctx.settings.register()`.
 * Keeping this structural (instead of importing the DSH package) lets tests
 * inject an in-memory fake and keeps the bundle free of host-service code.
 */
export interface SettingsScopeLike {
  /** Resolved value: schema defaults, then composition base, then user layer. */
  get(): PluginConfig;
  /** Observe resolved-value changes; returns the disposer. */
  watch(listener: (config: PluginConfig) => void): () => void;
  /** Merge a patch into the user layer and persist through the provider. */
  update(patch: Partial<PluginConfig>): Promise<unknown>;
}

/**
 * Config facade over the DSH `ctx.settings` service. No file I/O lives here
 * anymore: persistence, atomic writes, external-edit hot reload and the
 * browser-facing describe/mutate API are all owned by DSH itself.
 */
export class ConfigManager {
  private scope: SettingsScopeLike;
  private credentials: CredentialsReader;

  constructor(scope: SettingsScopeLike, credentials: CredentialsReader) {
    this.scope = scope;
    this.credentials = credentials;
  }

  getConfig(): PluginConfig {
    return this.scope.get();
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
    return this.scope.watch(listener);
  }

  /**
   * Merge a partial update into the settings namespace. Values are sanitized
   * here (bounds, trimming) so the schema's own constraints act as a second
   * line of defence rather than the only one.
   *
   * @internal Test-only. No production path calls this: the host writes the
   * settings namespace from the browser through the DSH settings service, and
   * this facade is only driven by `scripts/test-*.mjs` (regression suite).
   * Kept (with this marker) so those tests keep exercising the sanitizer.
   */
  async updateConfig(partial: Partial<PluginConfig>): Promise<PluginConfig> {
    await this.scope.update(sanitizePatch({ ...partial }));
    return this.getConfig();
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
  settings: {
    describe(): Array<{ ns: string; user?: unknown }>;
    update(ns: string, patch: Record<string, unknown>): Promise<unknown>;
  },
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
  if (Object.keys(patch).length === 0) {
    // Nothing migratable — retire the file and keep schema defaults.
    await fs.unlink(legacyPath).catch(() => {});
    return false;
  }

  try {
    await settings.update(SETTINGS_NAMESPACE, patch);
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
