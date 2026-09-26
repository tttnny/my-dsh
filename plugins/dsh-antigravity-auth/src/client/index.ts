/** Browser half of the private Antigravity bootstrap capability bundle. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { createAntigravityAuthRpcClient } from '../rpc-contract.ts'
import { AntigravityAuthSettings } from './AntigravityAuthSettings.tsx'
import { claimRelaySettingsPage, RELAY_ITEM_SLOT } from './relay-settings-page.js'
import { en, zh, type AntigravityAuthKey } from './locales.ts'
import type { AntigravityAuthSettingsProps } from './AntigravityAuthSettings.tsx'
import type { AntigravityMasterSettings } from '../capability-master.ts'
import type { AntigravitySearchSettings } from '../search.ts'
import type { AntigravityImageSettings } from '../image.ts'
import type { AntigravityVideoSettings } from '../video.ts'

const NS = 'settings.antigravityAuth'

export { AntigravityAuthSettings } from './AntigravityAuthSettings.tsx'
export type { AntigravityAuthSettingsProps } from './AntigravityAuthSettings.tsx'
export { en, zh } from './locales.ts'
export type { AntigravityAuthKey } from './locales.ts'

/** Client services required by the settings section and its loopback RPC. */
export const inject = ['slots', 'locale', 'connection', 'configForms']

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
  // A settings form is keyed by the owning Host plugin entry id, which is the
  // one thing that cannot be shared by value with the Host half without pulling
  // its modules into this bundle; tests assert each literal against its Host
  // constant.
  const masterScope = ctx.configForms.get<AntigravityMasterSettings>('antigravity-auth')
  const searchScope = ctx.configForms.get<AntigravitySearchSettings>('antigravity-search')
  const imageScope = ctx.configForms.get<AntigravityImageSettings>('antigravity-image')
  const videoScope = ctx.configForms.get<AntigravityVideoSettings>('antigravity-video')
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
    inject: (): AntigravityAuthSettingsProps => ({ rpc, t, subscribe, masterScope, searchScope, imageScope, videoScope }),
  }, AntigravityAuthSettings))
}
