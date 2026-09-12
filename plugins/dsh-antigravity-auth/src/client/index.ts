/** Browser half of the private Antigravity bootstrap capability bundle. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { createAntigravityAuthRpcClient } from '../rpc-contract.ts'
import { AntigravityAuthSettings } from './AntigravityAuthSettings.tsx'
import { claimRelaySettingsPage, RELAY_ITEM_SLOT } from './relay-settings-page.js'
import { en, zh, type AntigravityAuthKey } from './locales.ts'
import type { AntigravityAuthSettingsProps } from './AntigravityAuthSettings.tsx'
import type { AntigravitySearchSettings } from '../search.ts'
import type { AntigravityImageSettings } from '../image.ts'
import type { AntigravityVideoSettings } from '../video.ts'

const NS = 'settings.antigravityAuth'

export { AntigravityAuthSettings } from './AntigravityAuthSettings.tsx'
export type { AntigravityAuthSettingsProps } from './AntigravityAuthSettings.tsx'
export { en, zh } from './locales.ts'
export type { AntigravityAuthKey } from './locales.ts'

/** Client services required by the settings section and its loopback RPC. */
export const inject = ['slots', 'locale', 'connection', 'settingsScope']

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Copy for the Antigravity bootstrap settings section. */
    'settings.antigravityAuth': AntigravityAuthKey
  }
}

/** Register one disposable settings section and no capability controls. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'antigravity-auth: copy dictionaries')

  const connection = (ctx as any).connection as ConnectionHandle
  const rpc = createAntigravityAuthRpcClient(connection.rpc)
  const t = ctx.locale.bind(NS) as AntigravityAuthSettingsProps['t']
  const settingsScope = (ctx as ClientContext & { settingsScope?: { bind<T>(spec: { namespace: string; decode?: (value: unknown) => T | undefined }): SettingsScope<T> } }).settingsScope
  const searchScope = settingsScope?.bind<AntigravitySearchSettings>({ namespace: 'antigravity-search', decode: decodeSearchSettings })
  const imageScope = settingsScope?.bind<AntigravityImageSettings>({ namespace: 'antigravity-image', decode: decodeImageSettings })
  const videoScope = settingsScope?.bind<AntigravityVideoSettings>({ namespace: 'antigravity-video', decode: decodeVideoSettings })
  const listeners = new Set<() => void>()
  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }
  const reset = (): void => {
    for (const listener of listeners) listener()
  }
  ctx.effect(() => ctx.on('connection/reset', reset), 'antigravity-auth: connection invalidation')

  ctx.slots.inject('settings.section', () => {
    return claimRelaySettingsPage(ctx, () => t('pageNav'))
  })

  ;(ctx.slots as any).inject(RELAY_ITEM_SLOT, () => (ctx.slots as any).register({
    name: RELAY_ITEM_SLOT,
    id: 'antigravity-auth',
    order: 30,
    label: () => t('tabNav'),
    inject: (): AntigravityAuthSettingsProps => ({ rpc, t, subscribe, searchScope, imageScope, videoScope }),
  }, AntigravityAuthSettings))
}

function decodeSearchSettings(value: unknown): AntigravitySearchSettings | undefined {
  if (!isRecord(value) || typeof value.enabled !== 'boolean' || typeof value.model !== 'string' || value.model.length === 0 || !positiveInteger(value.maxResults) || value.maxResults > 50) return undefined
  return { enabled: value.enabled, model: value.model, maxResults: value.maxResults }
}

function decodeImageSettings(value: unknown): AntigravityImageSettings | undefined {
  if (!isRecord(value) || typeof value.enabled !== 'boolean' || typeof value.model !== 'string' || value.model.length === 0 || !positiveInteger(value.n) || value.n > 4) return undefined
  return { enabled: value.enabled, model: value.model, n: value.n }
}

function decodeVideoSettings(value: unknown): AntigravityVideoSettings | undefined {
  if (!isRecord(value) || typeof value.enabled !== 'boolean' || typeof value.model !== 'string' || value.model.length === 0) return undefined
  if (value.maxBytes !== undefined && (!positiveInteger(value.maxBytes) || value.maxBytes > 128 * 1024 * 1024)) return undefined
  return { enabled: value.enabled, model: value.model, ...(typeof value.maxBytes === 'number' ? { maxBytes: value.maxBytes } : {}) }
}

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
