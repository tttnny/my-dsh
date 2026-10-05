/** Browser half of the private Antigravity bootstrap capability bundle. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { createAntigravityAuthRpcClient } from '../rpc-contract.ts'
import { AntigravityAuthSettings } from './AntigravityAuthSettings.tsx'
import { ROW_CONFIG_KEY, ROW_CONFIG_SLOT, setupPluginPage } from './plugin-page.ts'
import { en, zh, type AntigravityAuthKey } from './locales.ts'
import type { AntigravityAuthSettingsFace, AntigravityAuthSettingsProps } from './AntigravityAuthSettings.tsx'
import type { AntigravityMasterSettings } from '../capability-master.ts'
import type { AntigravitySearchSettings } from '../search.ts'
import type { AntigravityImageSettings } from '../image.ts'
import type { AntigravityVideoSettings } from '../video.ts'

const NS = 'settings.antigravityAuth'

export { AntigravityAuthSettings } from './AntigravityAuthSettings.tsx'
export type { AntigravityAuthSettingsFace, AntigravityAuthSettingsProps } from './AntigravityAuthSettings.tsx'
export { en, zh } from './locales.ts'
export type { AntigravityAuthKey } from './locales.ts'

/** Client services required by the configuration page and its loopback RPC. */
export const inject = ['slots', 'locale', 'connection', 'configForms']

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Copy for the Antigravity bootstrap settings section. */
    'settings.antigravityAuth': AntigravityAuthKey
  }
}

/**
 * Mount the capability bundle's configuration page on the host's **Plugins**
 * page and no capability controls: the page draws the title, the icon and the
 * crumb, this bundle supplies the card.
 */
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

  // This bundle's configuration lives on the host's **Plugins** page, which
  // declares `plugins.row.config` only while its own entry is mounted; a
  // deployment without that page leaves no trace. The Settings page keeps only
  // read-only plugin lists, so this bundle registers there no more.
  //
  // `whileServed` additionally ties the contribution to the Host actually
  // serving this bundle's configuration entry: without it a profile that lacks
  // the Host half would still show a 配置 control over a form the page cannot
  // supply.
  //
  // The gate names THIS row's namespace only — the row our key points at.
  // `whileServed` fires on the FIRST served namespace (`namespaces.some`), so
  // listing the three capability rows as well would widen the gate rather than
  // tighten it; those three are optional reads the card already degrades to
  // read-only without, which is what a profile disabling them individually
  // should see.
  ctx.effect(
    () => ctx.configForms.whileServed(
      ['antigravity-auth'],
      () => setupPluginPage(ctx.slots, () => ctx.slots.register({
        name: ROW_CONFIG_SLOT,
        // `<bundle package name>#<row id>`: the key the Plugins page dispatches
        // this entry by, and the one whose presence gives the row its 配置
        // control. The three capability rows register no page of their own.
        key: ROW_CONFIG_KEY,
        locale: NS,
        inject: (): AntigravityAuthSettingsFace => ({ rpc, t, subscribe, masterScope, searchScope, imageScope, videoScope }),
      }, AntigravityAuthSettings)),
    ),
    'antigravity-auth: plugins page config',
  )
}
