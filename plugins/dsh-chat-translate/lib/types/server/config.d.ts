import type { PluginConfig } from './types.ts';
import type { CredentialsReader } from './credentials.ts';
/** Hard cap for the translation concurrency pool. */
export declare const MAX_CONCURRENCY = 100;
/** Bounds for the AI channel request timeout. */
export declare const AI_TIMEOUT_MIN = 500;
export declare const AI_TIMEOUT_MAX = 120000;
/**
 * The settings namespace this plugin owns. The user-editable layer lives in
 * the DSH-managed document (~/.dsh/settings.yaml) under this key; the
 * standalone ~/.dsh/dsh-chat-translate-config.json file is legacy (<=1.1).
 */
export declare const SETTINGS_NAMESPACE = "dsh-chat-translate";
export declare const DEFAULT_CONFIG: PluginConfig;
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
export declare class ConfigManager {
    private scope;
    private credentials;
    constructor(scope: SettingsScopeLike, credentials: CredentialsReader);
    getConfig(): PluginConfig;
    /** Whether the AI channel has every required piece: baseUrl, model and key. */
    isAiConfigured(): boolean;
    onConfigChange(listener: (config: PluginConfig) => void): () => void;
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
    updateConfig(partial: Partial<PluginConfig>): Promise<PluginConfig>;
}
/**
 * Coerce a raw record (legacy config file, HTTP-era partials) into a
 * validated partial config patch. Unknown fields are dropped, type-mismatched
 * values are skipped (the schema default wins), and numerics are clamped —
 * so one bad field never takes down a whole migration.
 */
export declare function sanitizePatch(input: Record<string, unknown>): Partial<PluginConfig>;
/**
 * One-shot migration from the pre-1.2 standalone config file. Runs only while
 * the settings namespace has no user layer yet, so values the user edited
 * after upgrading are never overwritten. The legacy file is removed whether
 * or not a migration happened.
 * @returns whether any legacy values were migrated.
 */
export declare function migrateLegacyConfigFile(settings: {
    describe(): Array<{
        ns: string;
        user?: unknown;
    }>;
    update(ns: string, patch: Record<string, unknown>): Promise<unknown>;
}, legacyPath: string): Promise<boolean>;
