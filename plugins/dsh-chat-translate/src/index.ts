import type { HostConnectionHandle } from '@deepseek-ai/dsh-client-connection';
import z from '@deepseek-ai/schemastery';
import { dshHomePath } from '@deepseek-ai/dsh-home-paths';
import {
  ConfigManager,
  migrateLegacyConfigFile,
  SETTINGS_NAMESPACE,
  DEFAULT_CONFIG,
  MAX_CONCURRENCY,
  AI_TIMEOUT_MIN,
  AI_TIMEOUT_MAX,
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
 * surfaces this plugin rides on (no standalone config file since 1.2). The
 * translation routes register through the connection service when a Web
 * carrier composes it, so apply takes that service through ctx.inject and the
 * plugin still loads in compositions without one.
 */
export const inject = ['settings', 'credentials'];

/** Settings namespace schema: defaults + bounds, resolved by DSH itself. */
const CONFIG_SCHEMA = z.object({
  enabled: z.boolean().default(DEFAULT_CONFIG.enabled),
  concurrency: z.number().min(1).max(MAX_CONCURRENCY).default(DEFAULT_CONFIG.concurrency),
  timeoutMs: z.number().min(500).max(10000).default(DEFAULT_CONFIG.timeoutMs),
  aiTimeoutMs: z.number().min(AI_TIMEOUT_MIN).max(AI_TIMEOUT_MAX).default(DEFAULT_CONFIG.aiTimeoutMs),
  aiEnabled: z.boolean().default(DEFAULT_CONFIG.aiEnabled),
  bingEnabled: z.boolean().default(DEFAULT_CONFIG.bingEnabled),
  baseUrl: z.string().default(DEFAULT_CONFIG.baseUrl),
  model: z.string().default(DEFAULT_CONFIG.model),
  targetLang: z.string().default(DEFAULT_CONFIG.targetLang),
});

interface HostContext {
  connection: HostConnectionHandle;
  settings: SettingsMigrationTarget & {
    register(ns: string, schema: unknown): {
      get(): any;
      watch(listener: (config: any) => void): () => void;
      update(patch: Record<string, unknown>): Promise<unknown>;
    };
  };
  credentials: {
    resolve(ref: string): Promise<{ value: string; source?: string } | undefined>;
    describe(ref: string): Promise<{ configured: boolean; source?: string; writable: boolean }>;
    set(ref: string, value: string): Promise<void>;
    unset(ref: string): Promise<void>;
  };
  on(event: string, listener: (...args: any[]) => void): () => void;
  /** Optional-service injection: the callback runs once connection is present. */
  inject(names: string[], callback: (ctx: HostContext) => void | (() => void)): void;
}

/** Mount the host half; provides the translation proxy and rides DSH config. */
export function apply(ctx: HostContext): void {
  const credentials = new CredentialsReader(ctx.credentials);
  const configManager = new ConfigManager(ctx.settings.register(SETTINGS_NAMESPACE, CONFIG_SCHEMA), credentials);
  const cache = new LruDiskCache(1000);
  const dispatcher = new TranslationDispatcher(configManager, cache, credentials);

  // Initialize async resources: credentials cache, disk cache relocation, and
  // the one-shot migration of the legacy dsh-chat-translate-config.json.
  const legacyConfigPath = dshHomePath('dsh-chat-translate-config.json');
  const initPromise = Promise.all([
    credentials.init(),
    cache.init(),
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
        .then(() => cache.dispose())
        .catch((err) => {
          console.warn('[dsh-chat-translate] Dispose translation routes error:', err);
        });
    };
  });
}
