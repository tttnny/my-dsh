import type { Volatile } from '@deepseek-ai/cordis';
import type { PluginConfig } from './types.ts';
import type { CredentialsReader } from './credentials.ts';

/**
 * Bounds for the AI channel request timeout. One request carries a packed run
 * of whole reply blocks, and a local model can take minutes on that much
 * prose, so the budget is sized for long-form output.
 */
export const AI_TIMEOUT_MIN = 500;
export const AI_TIMEOUT_MAX = 900000;

/**
 * The settings namespace this plugin owns. A namespace IS the Profile entry
 * id, so the user-editable layer is the `config` row of `dsh-chat-translate`
 * in the active profile's patch (`~/.dsh/profiles/<profile>/cordis.patch.yml`).
 */
export const SETTINGS_NAMESPACE = 'dsh-chat-translate';

export const DEFAULT_CONFIG: PluginConfig = {
  enabled: true,
  aiTimeoutMs: 600000,
  baseUrl: '',
  model: '',
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
  readonly aiTimeoutMs: Volatile<number>;
  readonly baseUrl: Volatile<string>;
  readonly model: Volatile<string>;
}

/**
 * Read the current committed value of every Config field.
 * @param refs - the runtime-resolved Config object.
 * @returns A detached plain config value.
 */
export function readPluginConfig(refs: PluginConfigRefs): PluginConfig {
  return {
    enabled: refs.enabled.get(),
    aiTimeoutMs: refs.aiTimeoutMs.get(),
    baseUrl: refs.baseUrl.get(),
    model: refs.model.get(),
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
 * Config facade over this plugin's own live Config. This module does no file
 * I/O: persistence, atomic writes, external-edit hot reload and the
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
