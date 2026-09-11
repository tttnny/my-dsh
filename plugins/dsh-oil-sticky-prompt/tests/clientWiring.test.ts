import { afterEach, describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'

import { apply, inject as declaredInject, name } from '../src/client/index.tsx'
import { NS } from '../src/client/locales.ts'
import { READING_ITEM_SLOT, READING_PAGE_ID, READING_PAGE_ORDER } from '../src/client/reading-settings-page.tsx'
import { STICKY_PROMPT_SETTINGS_NS } from '../src/settings.ts'

/** One recorded `slots.register` call. */
interface Registration {
  options: {
    name: string
    id?: string
    order?: number
    locale?: string
    label?: () => string
    inject?: () => Record<string, unknown>
  }
  component: unknown
}

/**
 * DOM stand-in for the installer: node has no document, and the assertions
 * only need the subscription lifecycle the sticky installer owns, not layout.
 */
function createDom() {
  const added: string[] = []
  const removed: string[] = []
  const document = {
    documentElement: {},
    head: { appendChild: (): void => {} },
    addEventListener: (type: string): void => { added.push(`document:${type}`) },
    removeEventListener: (type: string): void => { removed.push(`document:${type}`) },
    querySelector: (): unknown => null,
    querySelectorAll: (): unknown[] => [],
    createElement: () => ({ dataset: {} as Record<string, string>, textContent: '', remove: (): void => {} }),
  }
  const window = {
    addEventListener: (type: string): void => { added.push(`window:${type}`) },
    removeEventListener: (type: string): void => { removed.push(`window:${type}`) },
  }
  class MutationObserver {
    observe(): void {}
    disconnect(): void { removed.push('observer') }
  }
  return { document, window, MutationObserver, added, removed }
}

type Dom = ReturnType<typeof createDom>

/** Settings mirror stand-in: the card's and the behaviour's single read path. */
function createScope() {
  const listeners = new Set<() => void>()
  const writes: Array<{ field: string; value: unknown }> = []
  let snapshot: Record<string, unknown> = { status: 'loading', writable: false, value: undefined }
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    set: async (field: string, value: unknown): Promise<void> => { writes.push({ field, value }) },
    /** Publish a new snapshot, as the real scope does after a commit. */
    emit: (next: Record<string, unknown>): void => {
      snapshot = { ...snapshot, ...next }
      for (const listener of listeners) listener()
    },
    writes,
    listenerCount: () => listeners.size,
  }
}

/**
 * Client context stand-in. The two framework behaviours this plugin relies on
 * are modelled exactly: `effect` runs its factory immediately and keeps the
 * returned disposer on the fiber, and `inject` runs its callback as soon as
 * the declared services are present.
 */
function createClientContext(dom: Dom, scope: ReturnType<typeof createScope>) {
  const slots = {} as { inject: unknown; register: unknown; entries: unknown }
  const effectLabels: string[] = []
  const disposers: Array<() => void> = []
  const registrations: Registration[] = []
  const dictionaries: Array<{ ns: string; dicts: unknown }> = []
  const injectionResults = new Map<string, unknown>()
  const injectedDeps: string[][] = []

  slots.entries = (): unknown[] => []
  slots.register = (options: Registration['options'], component: unknown): (() => void) => {
    registrations.push({ options, component })
    return () => {}
  }
  // Both slots are declared by the time this plugin activates — the shell
  // declares `settings.section`, and claiming the page declares its item slot —
  // so the real registry runs each callback synchronously here.
  slots.inject = (key: string, callback: () => (() => void) | Iterable<() => void>): (() => void) => {
    injectionResults.set(key, callback())
    return () => {}
  }

  const settingsCtx = {
    effect: (factory: () => void | (() => void), label: string): void => {
      effectLabels.push(label)
      const disposer = factory()
      if (typeof disposer === 'function') disposers.push(disposer)
    },
    locale: {
      bind: (ns: string) => (key: string) => `${ns}:${key}`,
      register: (ns: string, dicts: unknown): (() => void) => {
        dictionaries.push({ ns, dicts })
        return () => {}
      },
    },
    settingsScope: { bind: () => scope },
    slots,
  }

  const ctx = {
    effect: (factory: () => void | (() => void), label: string): void => {
      effectLabels.push(label)
      const disposer = factory()
      if (typeof disposer === 'function') disposers.push(disposer)
    },
    inject: (deps: string[], callback: (ctx: unknown) => void): void => {
      injectedDeps.push(deps)
      callback(settingsCtx)
    },
  }

  return {
    ctx,
    effectLabels,
    disposers,
    registrations,
    dictionaries,
    injectedDeps,
    injectionResults,
  }
}

function withDom(dom: Dom): void {
  const globals = globalThis as unknown as Record<string, unknown>
  globals.document = dom.document
  globals.window = dom.window
  globals.MutationObserver = dom.MutationObserver
  globals.HTMLStyleElement = class {}
}

function clearDom(): void {
  const globals = globalThis as unknown as Record<string, unknown>
  delete globals.document
  delete globals.window
  delete globals.MutationObserver
  delete globals.HTMLStyleElement
}

afterEach(clearDom)

describe('client half wiring', () => {
  it('declares no hard service dependency', () => {
    expect(name).toBe('dsh-oil-sticky-prompt')
    expect(declaredInject).toEqual([])
  })

  it('binds the namespace scope and contributes to the shared reading page', () => {
    const dom = createDom()
    withDom(dom)
    const scope = createScope()
    const client = createClientContext(dom, scope)

    apply(client.ctx as unknown as Context)

    expect(client.injectedDeps).toEqual([['slots', 'locale', 'settingsScope']])
    expect(client.dictionaries.map(entry => entry.ns)).toEqual([NS])

    // The card registers into the shared page's item slot under this plugin's
    // own namespace, after smooth-stream's order 10.
    const card = client.registrations.find(entry => entry.options.name === READING_ITEM_SLOT)
    expect(card?.options.id).toBe(STICKY_PROMPT_SETTINGS_NS)
    expect(card?.options.order).toBe(20)
    expect(card?.options.locale).toBe(NS)
    expect(card?.options.inject?.()).toEqual({ scope })

    // Whoever acts first claims the page; here nothing holds it yet, so the
    // claim returns the page registration's disposer (never void — that is
    // what `slots.inject` requires).
    const page = client.registrations.find(entry => entry.options.name === 'settings.section')
    expect(page?.options.id).toBe(READING_PAGE_ID)
    expect(page?.options.order).toBe(READING_PAGE_ORDER)
    expect(page?.options.label?.()).toBe(`${NS}:pageNav`)
    expect(client.injectionResults.get('settings.section')).toBeTypeOf('function')
    expect(client.injectionResults.get(READING_ITEM_SLOT)).toBeTypeOf('function')
  })

  it('installs the sticky behaviour on the schema default before the mirror resolves', () => {
    const dom = createDom()
    withDom(dom)
    const client = createClientContext(dom, createScope())

    apply(client.ctx as unknown as Context)

    expect(dom.added).toEqual(['document:scroll', 'window:resize'])
    expect(client.effectLabels).toContain('dsh-oil-sticky-prompt: stick')
  })

  it('tears the behaviour down when the preference is off and reinstalls it when it is on', () => {
    const dom = createDom()
    withDom(dom)
    const scope = createScope()
    const client = createClientContext(dom, scope)

    apply(client.ctx as unknown as Context)
    // A loading mirror keeps the default installation rather than reading
    // "not resolved yet" as "user turned it off".
    scope.emit({ status: 'loading' })
    expect(dom.added).toHaveLength(2)
    expect(dom.removed).toEqual([])

    scope.emit({ status: 'ready', writable: true, value: { enabled: true } })
    expect(dom.added).toHaveLength(2)

    scope.emit({ value: { enabled: false } })
    expect(dom.removed).toEqual(['document:scroll', 'window:resize', 'observer'])

    scope.emit({ value: { enabled: true } })
    expect(dom.added).toEqual([
      'document:scroll',
      'window:resize',
      'document:scroll',
      'window:resize',
    ])
  })

  it('releases the installation when the plugin unloads', () => {
    const dom = createDom()
    withDom(dom)
    const scope = createScope()
    const client = createClientContext(dom, scope)

    apply(client.ctx as unknown as Context)
    for (const dispose of client.disposers) dispose()

    expect(dom.removed).toContain('document:scroll')
    expect(dom.removed).toContain('window:resize')
    expect(scope.listenerCount()).toBe(0)
  })
})
