import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
// Type-only: brings the `settings` service augmentation onto Context.
import type {} from '@deepseek-ai/dsh-settings'
import type { ConnectionRpcHandler } from '@deepseek-ai/dsh-client-connection'
import Schema from '@deepseek-ai/schemastery'
import { DEFAULT_STREAM_CONFIG, STREAM_BOOT_GLOBAL, type StreamConfig } from './config.ts'
import { STREAM_PACKAGE_NAME, STREAM_PACKAGE_VERSION } from './package-meta.ts'
import { inspectProfileInstallation, updateNpmProfilePackage } from './profile-installation.ts'
import {
  STREAM_RPC,
  STREAM_RPC_PATH,
  type StreamPluginInfoView,
} from './settings-api.ts'
import {
  DEFAULT_STREAM_SETTINGS,
  STREAM_SETTINGS_NS,
  type StreamSettings,
} from './settings.ts'

/** Narrow an unknown JSON value to a plain record. */
function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

/** Display name shown by the Host loader while the plugin is mounted. */
export const name = '@lynn123411/dsh-smooth-stream'

/**
 * Plugin configuration accepted from the overlay's `config` section. Cordis
 * validates the value against this schema at load and fills omitted fields
 * from the shared defaults, so an invalid value fails the load loudly.
 */
export interface Config extends StreamConfig {}

export const Config: Schema<Config> = Schema.object({
  mode: Schema.union(['typewriter', 'teleprompter'] as const).default(DEFAULT_STREAM_CONFIG.mode),
  preset: Schema.union(['realtime', 'balanced', 'silky'] as const).default(DEFAULT_STREAM_CONFIG.preset),
  revealCharsPerSec: Schema.number()
    .min(5)
    .max(200)
    .default(DEFAULT_STREAM_CONFIG.revealCharsPerSec),
  scrollSpeedPxPerSec: Schema.number()
    .min(1)
    .max(200)
    .default(DEFAULT_STREAM_CONFIG.scrollSpeedPxPerSec),
  maxScrollSpeedPxPerSec: Schema.number()
    .min(1)
    .max(2000)
    .default(DEFAULT_STREAM_CONFIG.maxScrollSpeedPxPerSec),
})

/**
 * Schema of the user-owned settings section. The Host keeps it in the durable
 * settings provider; the browser reads and edits it through the native
 * `settingsScope` service bound to this same namespace.
 */
export const StreamSettingsSchema: Schema<StreamSettings> = Schema.object({
  enabled: Schema.boolean().default(DEFAULT_STREAM_SETTINGS.enabled),
  controlScroll: Schema.boolean().default(DEFAULT_STREAM_SETTINGS.controlScroll),
  motionPreference: Schema.union([
    Schema.const('auto'),
    Schema.const('force-smooth'),
    Schema.const('force-reduced'),
  ] as const).default(DEFAULT_STREAM_SETTINGS.motionPreference),
  thinkAutoExpand: Schema.boolean().default(DEFAULT_STREAM_SETTINGS.thinkAutoExpand),
  logarithmicFade: Schema.boolean().default(DEFAULT_STREAM_SETTINGS.logarithmicFade),
  debugEnabled: Schema.boolean().default(DEFAULT_STREAM_SETTINGS.debugEnabled),
  debugTuning: Schema.object({
    revealScale: Schema.number().min(0.25).max(2).default(DEFAULT_STREAM_SETTINGS.debugTuning.revealScale),
    queuePressure: Schema.number().min(0).max(2).default(DEFAULT_STREAM_SETTINGS.debugTuning.queuePressure),
    maxRevealCps: Schema.number().min(120).max(1000).default(DEFAULT_STREAM_SETTINGS.debugTuning.maxRevealCps),
    springStiffness: Schema.number().min(40).max(320).default(DEFAULT_STREAM_SETTINGS.debugTuning.springStiffness),
    springDamping: Schema.number().min(8).max(80).default(DEFAULT_STREAM_SETTINGS.debugTuning.springDamping),
    springMass: Schema.number().min(0.5).max(3).default(DEFAULT_STREAM_SETTINGS.debugTuning.springMass),
    runwayPx: Schema.number().min(0).max(120).default(DEFAULT_STREAM_SETTINGS.debugTuning.runwayPx),
    reserveResponseMs: Schema.number().min(60).max(600).default(DEFAULT_STREAM_SETTINGS.debugTuning.reserveResponseMs),
    backpressureMinScale: Schema.number().min(0.25).max(1).default(DEFAULT_STREAM_SETTINGS.debugTuning.backpressureMinScale),
  }),
})

/**
 * Host half: log the resolved configuration, bridge it to the browser half,
 * register the settings namespace, and expose the package's version line plus
 * the one-click profile update.
 *
 * The web boot graph carries no per-entry config, so the validated value is
 * injected into every served index response as a boot global the client entry
 * reads at apply time. Preferences take the opposite route: the namespace is
 * registered here and the browser binds it through `settingsScope`.
 * @param ctx - Host context carrying the web server service when composed.
 * @param config - Schema-validated configuration with defaults filled.
 */
export function apply(ctx: Context, config: Config): void {
  console.log(
    `[${STREAM_PACKAGE_NAME}] plugin loaded! mode=${config.mode} preset=${config.preset} `
    + `seed=${config.revealCharsPerSec}cps scroll=${config.scrollSpeedPxPerSec}px/s `
    + `maxScroll=${config.maxScrollSpeedPxPerSec}px/s`,
  )
  ctx.inject(['webServer'], (httpCtx) => {
    // The webServer emits this event on every index render; the listener
    // lifecycle rides the webServer injection fiber, so no extra effect is
    // needed. The global row is rendered into <head> ahead of the entry module.
    httpCtx.on('webserver/index-inject', (table) => {
      table.push({ kind: 'global', name: STREAM_BOOT_GLOBAL, value: config })
    })
  })
  ctx.inject(['settings'], (settingsCtx) => {
    // The namespace is a compile-time constant matching the kernel's
    // /^[a-z][a-z0-9-]*$/ pattern; the kernel accepts the literal directly and
    // ships no namespace brand helper.
    settingsCtx.settings.register(STREAM_SETTINGS_NS, StreamSettingsSchema, { applies: 'live' })
    settingsCtx.inject(['connection'], (connectionCtx) => {
      let upgrade: Promise<void> | undefined

      const info = (): StreamPluginInfoView => {
        const installation = inspectProfileInstallation(connectionCtx.baseUrl, STREAM_PACKAGE_NAME)
        return {
          version: STREAM_PACKAGE_VERSION,
          installation: installation.kind,
          canUpgrade: installation.kind === 'npm',
        }
      }

      const handle: ConnectionRpcHandler = async (endpoint) => {
        if (endpoint === STREAM_RPC.info) return { ok: true, value: info() }
        if (endpoint === STREAM_RPC.upgrade) {
          const installation = inspectProfileInstallation(connectionCtx.baseUrl, STREAM_PACKAGE_NAME)
          if (installation.kind !== 'npm') {
            return { ok: false, error: { code: 'internal', message: 'smooth-stream is not an npm profile dependency', details: {} } }
          }
          if (upgrade !== undefined) {
            return { ok: false, error: { code: 'internal', message: 'smooth-stream update is already running', details: {} } }
          }
          upgrade = updateNpmProfilePackage(installation.profileDir, STREAM_PACKAGE_NAME)
          try {
            await upgrade
          } catch {
            return { ok: false, error: { code: 'internal', message: 'smooth-stream update failed', details: {} } }
          } finally {
            upgrade = undefined
          }
          return { ok: true, value: { restartRequired: true } }
        }
        return { ok: false, error: { code: 'internal', message: `unknown smooth-stream endpoint ${JSON.stringify(endpoint)}`, details: {} } }
      }
      // The exact /api route accepts POST only; the request body names the
      // endpoint and carries its payload. Connection's /api carrier already
      // applies its trust fence and browser authentication. The update command
      // runs on the Host's own machine, so the card offers it only for a
      // loopback page.
      connectionCtx.effect(
        () => connectionCtx.connection.fetch.register({
          path: STREAM_RPC_PATH,
          methods: ['POST'],
          requestBody: 'buffered',
          fetch: async (request) => {
            let body: unknown
            try {
              body = await request.json()
            } catch {
              return Response.json(
                { ok: false, error: { code: 'bad-request', message: 'invalid request body: body is not JSON', details: {} } },
                { status: 400 },
              )
            }
            const endpoint = record(body)?.endpoint
            if (typeof endpoint !== 'string' || endpoint.length === 0) {
              return Response.json(
                { ok: false, error: { code: 'bad-request', message: 'invalid request body: missing endpoint', details: {} } },
                { status: 400 },
              )
            }
            return Response.json(await handle(endpoint, record(body)?.payload, request.signal))
          },
        }),
        'dsh-smooth-stream: plugin info route',
      )
    })
  })
}
