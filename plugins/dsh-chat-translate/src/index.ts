import type { HostConnectionHandle } from '@deepseek-ai/dsh-client-connection';
import z from '@deepseek-ai/schemastery';
import {
  ConfigManager,
  createLiveConfigSource,
  DEFAULT_CONFIG,
  AI_TIMEOUT_MIN,
  AI_TIMEOUT_MAX,
  type PluginConfigRefs,
} from './server/config.ts';
import { CredentialsReader, TRANSLATE_API_KEY_REF } from './server/credentials.ts';
import { LruDiskCache } from './server/cache.ts';
import { TranslationDispatcher } from './server/dispatcher.ts';
import { createFetchRoutes } from './server/router.ts';

/** Stable Cordis loader name. */
export const name = 'dsh-chat-translate';

/**
 * Hard dependencies: credentials is the DSH-owned secret surface this plugin
 * rides on, and settings carries the entry's automatic-page policy. The
 * plugin's own values arrive as its resolved Config. The translation routes
 * register through the connection service when a Web carrier composes it, so
 * apply takes that service through ctx.inject and the plugin still loads in
 * compositions without one.
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
  aiTimeoutMs: z
    .number()
    .min(AI_TIMEOUT_MIN)
    .max(AI_TIMEOUT_MAX)
    .default(DEFAULT_CONFIG.aiTimeoutMs)
    .volatile(),
  baseUrl: z.string().default(DEFAULT_CONFIG.baseUrl).volatile(),
  model: z.string().default(DEFAULT_CONFIG.model).volatile(),
});

interface HostContext {
  connection: HostConnectionHandle;
  fiber: unknown;
  settings: {
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
  const dispatcher = new TranslationDispatcher(configManager, cache, credentials);

  // The 阅读体验 card is this entry's settings surface, so DSH must not also
  // derive a Plugins-page form for the same fields.
  ctx.inject(['settings'], (child) => {
    child.effect(
      () => child.settings.configure({ auto: false }, child.fiber),
      'dsh-chat-translate: settings page policy'
    );
  });

  // Initialize async resources: the credential cache and the reply cache pool.
  const initPromise = Promise.all([credentials.init(), cache.init()]).catch((err) => {
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
