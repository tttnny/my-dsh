import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: `slots` and its LocaleNamespaceMap merge come from the renderer and
// the slot package; the composer seat's SlotMap entry and owner props from
// ui-conversation; the `modelDirectories` service and the seat's injected face
// from ui-model-selection's browser half.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client'
import { ModelSubmenu } from './ModelSubmenu.tsx'
import { NS, en, zh } from './locales.ts'

export { ModelSubmenu } from './ModelSubmenu.tsx'

/**
 * Cordis services required by the browser half. `slots` is the contribution
 * registry, `sessions` tells whether a session may select a model, and
 * `modelDirectories` owns the per-session catalog snapshot this seat renders
 * from. `remote` / `remote.session` are declared because a service method runs
 * on the calling context: `directoryFor` reads `this.ctx.remote.session` while
 * building the directory, so the seat must carry that service too.
 */
export const inject = ['locale', 'modelDirectories', 'remote', 'remote.session', 'sessions', 'slots']

/**
 * Client plugin body: register this plugin's dictionaries, then take over the
 * composer model seat below the built-in occupant's priority so this menu
 * renders in its place.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-model-submenu: dictionaries')
  ctx.inject(['slots', 'modelDirectories'], (scope) => {
    const models = scope.modelDirectories
    const sessions = scope.sessions
    scope.slots.inject('conversation.input.model', () => scope.slots.register({
      name: 'conversation.input.model',
      priority: -100,
      registrant: '@lynn123411/dsh-model-submenu',
      locale: NS,
      inject: (sessionId) => {
        // The seat's inject parameter is typed as a bare string; the service
        // faces carry the branded SessionId of that same runtime value.
        const key = sessionId as Parameters<typeof models.directoryFor>[0]
        const directory = models.directoryFor(key)
        const available = sessions.subagentAddress(key) === undefined
        return {
          available,
          directory: directory.store,
          load: () => {
            if (available) directory.load().catch(() => {})
          },
          select: (selection) => available ? directory.select(selection) : Promise.resolve(undefined),
        }
      },
    }, ModelSubmenu))
  })
}