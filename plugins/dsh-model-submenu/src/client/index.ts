import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: `slots` and its LocaleNamespaceMap merge come from the renderer and
// the slot package; the model menu's options slot and the composer overlay from
// ui-conversation; the `modelDirectories` service and the seat's injected face
// from ui-model-selection's browser half; `configForms` from the settings
// provider, whose shared mirror answers the metadata line.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { ModelOptionsRow } from './ModelOptionsRow.tsx'
import { ModelPickerHost } from './ModelPickerHost.tsx'
import { createPickerStore } from './picker-state.ts'
import { createFactsSource, type DescribeFace } from './facts-source.ts'
import { NS, en, zh } from './locales.ts'

export { ModelOptionsRow } from './ModelOptionsRow.tsx'
export { ModelPickerHost } from './ModelPickerHost.tsx'
export { createPickerStore } from './picker-state.ts'

/**
 * Cordis services required by the browser half. `slots` is the contribution
 * registry, `sessions` tells whether a session may select a model,
 * `modelDirectories` owns the per-session catalog snapshot both entries render
 * from, and `configForms` carries the settings provider's shared describe
 * mirror, which answers each model's context window and accepted modalities.
 * `remote`, `remote.llm`, and `remote.session` are declared because a service
 * method runs on the calling context: `directoryFor` reads
 * `this.ctx.remote.session`, and the provider directory that names each
 * settings address is read through `this.ctx.remote.llm`.
 */
export const inject = [
  'configForms',
  'locale',
  'modelDirectories',
  'remote',
  'remote.llm',
  'remote.session',
  'sessions',
  'slots',
]

/**
 * Client plugin body: register this plugin's dictionaries, then contribute the
 * menu row that asks for the picker and the overlay that renders it.
 *
 * The two are separate entries because the Host unmounts the model menu the
 * moment a row is clicked; the overlay slot stays mounted, so the dialog
 * survives the menu's teardown.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-model-submenu: dictionaries')
  ctx.inject(['slots', 'modelDirectories', 'configForms', 'remote'], (scope) => {
    const models = scope.modelDirectories
    const sessions = scope.sessions
    const picker = createPickerStore()
    const facts = createFactsSource({
      describe: scope.configForms.describe() as DescribeFace,
      listProviders: () => scope.remote.llm.listConfigurableProviders(),
    })
    ctx.effect(() => facts.start(), 'dsh-model-submenu: model metadata')
    /**
     * Build one entry's business face for a session.
     * @param sessionId - the slot's session scope.
     * @returns the catalog face plus the session and store both entries need.
     */
    const faceOf = (sessionId: string) => {
      // The slot's inject parameter is typed as a bare string; the service
      // faces carry the branded SessionId of that same runtime value.
      const key = sessionId as Parameters<typeof models.directoryFor>[0]
      const directory = models.directoryFor(key)
      const available = sessions.subagentAddress(key) === undefined
      return {
        sessionId,
        picker,
        available,
        directory: directory.store,
        factsSource: facts.source,
        load: () => {
          if (available) directory.load().catch(() => {})
        },
        resolveText: (text: Parameters<typeof ctx.locale.resolveText>[0]) => ctx.locale.resolveText(text),
        select: (selection: Parameters<typeof directory.select>[0]) => available
          ? directory.select(selection)
          : Promise.resolve(undefined),
      }
    }
    scope.slots.inject('conversation.input.model.options', () => scope.slots.register({
      name: 'conversation.input.model.options',
      id: 'all-providers',
      order: 10,
      registrant: '@lynn123411/dsh-model-submenu',
      locale: NS,
      inject: faceOf,
    }, ModelOptionsRow))
    scope.slots.inject('conversation.input.overlay', () => scope.slots.register({
      name: 'conversation.input.overlay',
      id: 'model-picker',
      registrant: '@lynn123411/dsh-model-submenu',
      locale: NS,
      inject: faceOf,
    }, ModelPickerHost))
  })
}
