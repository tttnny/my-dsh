/**
 * The browser's live answer to "what does the settings document know about this
 * model?".
 *
 * Two host answers meet here: the shared settings mirror (which the settings
 * page already keeps warm) and the LLM provider directory that says which
 * settings namespace holds each provider's profile. Both can change while the
 * page is open — a saved profile, a reconnected host — so the join is rebuilt
 * whenever the mirror or the directory reports a change, and readers subscribe
 * to the lookup itself.
 */

import type { ModelFacts } from './model-facts.ts'
import {
  buildModelFacts,
  type ConfigurableProviderRow,
  type NamespaceRow,
} from './model-facts.ts'

/** One lookup answering both metadata fields for a provider and model. */
export type ModelFactsLookup = (provider: string, model: string) => ModelFacts

/** The mirror face this source reads; a subset of the settings provider's. */
export interface DescribeFace {
  getSnapshot(): { readonly view: { readonly namespaces: readonly NamespaceRow[] } | undefined }
  subscribe(listener: () => void): () => void
  ensure(): Promise<void>
}

/** One remote answer, as the gateway returns it. */
export interface DirectoryAnswer {
  readonly ok: boolean
  readonly value?: readonly ConfigurableProviderRow[]
}

/** A stable, subscribable lookup over the current settings answer. */
export interface FactsSource {
  /** @returns the lookup for the current answer; the identity changes on every rebuild. */
  getSnapshot(): ModelFactsLookup
  /** @param listener - called after each rebuild. @returns the disposer. */
  subscribe(listener: () => void): () => void
}

const EMPTY: ModelFactsLookup = () => ({ contextWindow: undefined, images: 'unknown' })

/**
 * Join the settings mirror with the provider directory.
 * @param deps.describe - the settings mirror's describe face.
 * @param deps.listProviders - reads the LLM provider directory once.
 * @returns the source, plus `start` which wires both reads and returns its disposer.
 */
export function createFactsSource(deps: {
  readonly describe: DescribeFace
  readonly listProviders: () => Promise<DirectoryAnswer>
}): { readonly source: FactsSource; readonly start: () => () => void } {
  const listeners = new Set<() => void>()
  let providers: readonly ConfigurableProviderRow[] = []
  let lookup: ModelFactsLookup = EMPTY

  const rebuild = () => {
    const namespaces = deps.describe.getSnapshot().view?.namespaces ?? []
    lookup = providers.length === 0 || namespaces.length === 0
      ? EMPTY
      : buildModelFacts(providers, namespaces)
    for (const listener of [...listeners]) listener()
  }

  return {
    source: {
      getSnapshot: () => lookup,
      subscribe: (listener) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
    },
    start: () => {
      const off = deps.describe.subscribe(rebuild)
      void deps.describe.ensure().catch(() => { /* a failed read leaves the empty lookup in place */ })
      void deps.listProviders().then(
        (answer) => {
          providers = answer.ok && answer.value !== undefined ? answer.value : []
          rebuild()
        },
        () => { /* the directory being unavailable leaves every model's facts unknown */ },
      )
      rebuild()
      return () => {
        off()
        listeners.clear()
      }
    },
  }
}
