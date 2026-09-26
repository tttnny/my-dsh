import type { HostConnectionHandle } from '@deepseek-ai/dsh-client-connection';
import z from '@deepseek-ai/schemastery';
import { dshHomePath } from '@deepseek-ai/dsh-home-paths';
import {
  ConfigManager,
  createLiveConfigSource,
  migrateLegacyConfigFile,
  DEFAULT_CONFIG,
  MAX_CONCURRENCY,
  AI_TIMEOUT_MIN,
  AI_TIMEOUT_MAX,
  THINK_TIMEOUT_MIN,
  THINK_TIMEOUT_MAX,
  THINK_CACHE_ENTRIES,
  type PluginConfigRefs,
  type SettingsMigrationTarget,
} from './server/config.ts';
import { CredentialsReader, TRANSLATE_API_KEY_REF } from './server/credentials.ts';
import { LruDiskCache } from './server/cache.ts';
import { TranslationDispatcher } from './server/dispatcher.ts';
import { createFetchRoutes } from './server/router.ts';

/** Stable Cordis loader name. */
export const name = 'dsh-chat-translate';

/**
 * Hard dependencies: settings and credentials are the DSH-owned config/secret
 * surfaces this plugin rides on. The plugin's own values arrive as its resolved
 * Config, so `settings` is only the provider-level write face the one-shot
 * legacy-file migration needs. The translation routes register through the
 * connection service when a Web carrier composes it, so apply takes that
 * service through ctx.inject and the plugin still loads in compositions
 * without one.
 */
export const inject = ['settings', 'credentials'];

/**
 * This plugin's live configuration: defaults plus bounds, resolved by DSH
 * itself. Every field is `volatile()` — the browser configuration form
 * derives its fields from this schema, and an accepted edit is committed into
 * these refs without remounting the plugin, so {@link apply} always reads the
 * current value instead of a snapshot taken at load.
 */
export const Config = z.object({
  enabled: z.boolean().default(DEFAULT_CONFIG.enabled).volatile(),
  concurrency: z.number().min(1).max(MAX_CONCURRENCY).default(DEFAULT_CONFIG.concurrency).volatile(),
  timeoutMs: z.number().min(500).max(10000).default(DEFAULT_CONFIG.timeoutMs).volatile(),
  aiTimeoutMs: z
    .number()
    .min(AI_TIMEOUT_MIN)
    .max(AI_TIMEOUT_MAX)
    .default(DEFAULT_CONFIG.aiTimeoutMs)
    .volatile(),
  thinkTimeoutMs: z
    .number()
    .min(THINK_TIMEOUT_MIN)
    .max(THINK_TIMEOUT_MAX)
    .default(DEFAULT_CONFIG.thinkTimeoutMs)
    .volatile(),
  aiEnabled: z.boolean().default(DEFAULT_CONFIG.aiEnabled).volatile(),
  bingEnabled: z.boolean().default(DEFAULT_CONFIG.bingEnabled).volatile(),
  thinkEnabled: z.boolean().default(DEFAULT_CONFIG.thinkEnabled).volatile(),
  baseUrl: z.string().default(DEFAULT_CONFIG.baseUrl).volatile(),
  model: z.string().default(DEFAULT_CONFIG.model).volatile(),
  targetLang: z.string().default(DEFAULT_CONFIG.targetLang).volatile(),
});

interface HostContext {
  connection: HostConnectionHandle;
  fiber: unknown;
  settings: SettingsMigrationTarget & {
    /** Register this entry's automatic-page policy; `auto: false` opts out. */
    configure(presentation: { auto?: boolean }, owner?: unknown): () => void;
  };
  credentials: {
    resolve(ref: string): Promise<{ value: string; source?: string } | undefined>;
    describe(ref: string): Promise<{ configured: boolean; source?: string; writable: boolean }>;
    set(ref: string, value: string): Promise<void>;
    unset(ref: string): Promise<void>;
  };
  on(event: string, listener: (...args: any[]) => void): () => void;
  effect(factory: () => void | (() => void), label?: string): unknown;
  /** Optional-service injection: the callback runs once connection is present. */
  inject(names: string[], callback: (ctx: HostContext) => void | (() => void)): void;
}

/**
 * Mount the host half; provides the translation proxy and rides this plugin's
 * live Config.
 * @param ctx - DSH Host context.
 * @param config - this plugin's runtime-resolved Config (every field a live ref).
 */
export function apply(ctx: HostContext, config: PluginConfigRefs): void {
  const credentials = new CredentialsReader(ctx.credentials);
  const configManager = new ConfigManager(
    // DSH commits an accepted live edit into the Config refs and notifies this
    // plugin's own fiber through `loader/volatile-update`.
    createLiveConfigSource((listener) => ctx.on('loader/volatile-update', listener), config),
    credentials
  );
  const cache = new LruDiskCache(1000);
  const thinkCache = new LruDiskCache(THINK_CACHE_ENTRIES, 'think-cache.json');
  const dispatcher = new TranslationDispatcher(configManager, cache, credentials, thinkCache);

  // The 阅读体验 card is this entry's settings surface, so DSH must not also
  // derive a Plugins-page form for the same fields.
  ctx.inject(['settings'], (child) => {
    child.effect(
      () => child.settings.configure({ auto: false }, child.fiber),
      'dsh-chat-translate: settings page policy'
    );
  });

  // Initialize async resources: credentials cache, both disk cache pools, and
  // the one-shot migration of the legacy dsh-chat-translate-config.json.
  const legacyConfigPath = dshHomePath('dsh-chat-translate-config.json');
  const initPromise = Promise.all([
    credentials.init(),
    cache.init(),
    thinkCache.init(),
    migrateLegacyConfigFile(ctx.settings, legacyConfigPath),
  ]).catch((err) => {
    console.warn('[dsh-chat-translate] Initialization error:', err);
  });

  // Keep the synchronous key cache warm: the credentials service fans this
  // event out after every committed write or external reload.
  ctx.on('credentials/reference-updated', (ref: unknown) => {
    if (ref === TRANSLATE_API_KEY_REF) {
      void credentials.refresh();
    }
  });

  // The routes ride Connection's authenticated /api transport, which a Web
  // carrier composes; a composition without one keeps the plugin loaded and
  // simply has no translation endpoint.
  ctx.inject(['connection'], (connectionCtx) => {
    const disposers = createFetchRoutes(dispatcher, initPromise).map((route) =>
      connectionCtx.connection.fetch.register(route)
    );
    return () => {
      void Promise.all(disposers.map((dispose) => dispose()))
        .then(() => Promise.all([cache.dispose(), thinkCache.dispose()]))
        .catch((err) => {
          console.warn('[dsh-chat-translate] Dispose translation routes error:', err);
        });
    };
  });
}
