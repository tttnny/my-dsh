/**
 * Headless wiring check for the plugin's browser half.
 *
 * Loads the built `lib/client.js` the same way the Web shell does (through a
 * `window.__ModuleLoader__.load` stub), gives it fake cordis services, and
 * asserts the two contributions the composer depends on: the menu row that asks
 * for the picker, and the overlay entry that renders it. Run with:
 * node scripts/smoke-client.mjs [plugin-dir]
 */

import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'))

const failures = []
const check = (label, ok) => {
  if (ok) console.log(`  ok   ${label}`)
  else { console.log(`  FAIL ${label}`); failures.push(label) }
}

const primitivesStub = new Proxy({}, { get: (_t, key) => (key === '__esModule' ? true : () => null) })

const requires = []
let exported
globalThis.window = {
  __ModuleLoader__: {
    load: ({ id, factory }) => {
      requires.push(id)
      exported = factory((spec) => {
        if (spec === 'react') return require('react')
        if (spec === 'react/jsx-runtime') return require('react/jsx-runtime')
        if (spec === 'react-dom') return require('react-dom')
        if (spec === '@deepseek-ai/dsh-client-ui-primitives') return primitivesStub
        throw new Error(`module table miss: ${spec}`)
      })
    },
  },
}

/** Per-session directory stub: records what the entries asked it to do. */
const directoryCalls = []
const directoryStore = {
  getSnapshot: () => ({ current: null, routable: null, groups: [], failures: [], status: 'idle', error: null }),
  subscribe: () => () => {},
}
const directory = {
  store: directoryStore,
  load: async () => { directoryCalls.push('load'); return directoryStore.getSnapshot() },
  select: async (selection) => { directoryCalls.push(`select:${selection.provider}/${selection.model}`); return { ok: true, value: undefined } },
}

/** The settings mirror face the metadata line reads; the answer stays empty here. */
const describeCalls = []
const describeFace = {
  getSnapshot: () => ({ status: 'idle', view: undefined, error: null }),
  subscribe: () => () => {},
  ensure: async () => {},
  acceptView: () => {},
}

/** The LLM provider directory that says which settings namespace holds each profile. */
const providerDirectoryCalls = []
const providerDirectory = {
  ok: true,
  value: [
    { provider: 'magpie', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'magpie'] },
    { provider: 'deepseek-official', settingsNs: 'llm-deepseek', settingsPath: [] },
  ],
}

const registrations = []
const injects = []
const locales = []
const errors = []

const services = () => ({
  slots: {
    inject: (key, callback) => {
      injects.push(`slot:${key}`)
      try { callback() } catch (error) { errors.push(`slots.inject(${key}) threw: ${error?.message}`) }
      return () => {}
    },
    register: (options, component) => {
      registrations.push({
        name: options.name,
        id: options.id,
        order: options.order,
        priority: options.priority,
        registrant: options.registrant,
        locale: options.locale,
        inject: options.inject,
        component,
      })
      return () => {}
    },
  },
  locale: {
    register: (ns, dictionaries) => { locales.push({ ns, dictionaries }); return () => {} },
    resolveText: (text) => (typeof text === 'string' ? text : text?.zh ?? text?.en ?? ''),
  },
  modelDirectories: { directoryFor: (sessionId) => { directoryCalls.push(`directoryFor:${sessionId}`); return directory } },
  sessions: { subagentAddress: (sessionId) => sessionId === 'subagent' ? { agent: 'a' } : undefined },
  configForms: {
    describe: () => {
      describeCalls.push('describe')
      return describeFace
    },
  },
  remote: {
    llm: {
      listConfigurableProviders: async () => {
        providerDirectoryCalls.push('listConfigurableProviders')
        return providerDirectory
      },
    },
  },
})

/**
 * Cordis-faithful context: an undeclared service read throws
 * `cannot get property "x" without inject`, so a bundle that reads e.g.
 * `ctx.locale` without declaring it fails here instead of in the profile.
 */
function makeCtx(label, declared = []) {
  const table = services()
  const base = {
    label,
    effect: (fn) => { fn(); return () => {} },
    on: () => () => {},
    inject: (names, callback) => {
      const list = Array.isArray(names) ? names : [names]
      injects.push(`${label}:${list.join(',')}`)
      try {
        const dispose = callback(makeCtx(`${label}/${list.join(',')}`, [...declared, ...list]))
        if (typeof dispose === 'function') dispose()
      } catch (error) {
        errors.push(`${label} inject[${list.join(',')}] threw: ${error?.message}`)
      }
      return () => {}
    },
    get: (name) => table[name],
  }
  return new Proxy(base, {
    get(target, prop) {
      if (typeof prop === 'symbol' || prop === 'then') return undefined
      if (prop in target) return target[prop]
      if (declared.includes(prop)) return table[prop]
      throw new Error(`cannot get property "${prop}" without inject`)
    },
  })
}

await import(`${join(root, 'lib/client.js')}?smoke=${Date.now()}`)

check('bundle registers under its package id', requires[0] === '@lynn123411/dsh-model-submenu')
check('apply/inject exported', typeof exported?.apply === 'function' && Array.isArray(exported?.inject))
check('declares exactly the services its halves read', JSON.stringify(exported?.inject) === '["configForms","locale","modelDirectories","remote","remote.llm","remote.session","sessions","slots"]')

// The dialog must stay on the primitives' Modal, and this plugin must not paint
// a floating fill of its own — the shared surfaces own the fill, blur and radius.
const clientBundle = await readFile(join(root, 'lib/client.js'), 'utf8')
check('the picker renders through the shared Modal', clientBundle.includes('Modal'))
check('the plugin paints no surface fill of its own', !clientBundle.includes('--dsw-specific-menu'))
check('the bundle no longer imports the removed anchoring primitive', !clientBundle.includes('useAnchoredPosition'))

// The guard must have teeth, or every case below is vacuous.
try {
  makeCtx('teeth').modelDirectories
  check('guard rejects an undeclared service read', false)
} catch (error) {
  check('guard rejects an undeclared service read', /cannot get property "modelDirectories" without inject/.test(error.message))
}

try {
  exported.apply(makeCtx('root', exported.inject ?? []))
  check('apply() survives the inject guard', true)
} catch (error) {
  check('apply() survives the inject guard', false)
  console.log(`       ${error.message}`)
}

check('the row is declared through the model menu\'s options slot', injects.includes('slot:conversation.input.model.options'))
check('the dialog is declared through the composer overlay slot', injects.includes('slot:conversation.input.overlay'))

const row = registrations.find((entry) => entry.name === 'conversation.input.model.options')
check('menu row registered', row !== undefined)
check('menu row carries a list id', row?.id === 'all-providers')
check('menu row names its registrant', row?.registrant === '@lynn123411/dsh-model-submenu')
check('menu row renders through its own dictionary namespace', row?.locale === 'modelSubmenu')
check('menu row exports a component', typeof row?.component === 'function')

const host = registrations.find((entry) => entry.name === 'conversation.input.overlay')
check('overlay dialog registered', host !== undefined)
check('overlay dialog carries a list id', host?.id === 'model-picker')
check('overlay dialog renders through its own dictionary namespace', host?.locale === 'modelSubmenu')
check('overlay dialog exports a component', typeof host?.component === 'function')

check('both entries share one picker store', row?.inject?.('s').picker === host?.inject?.('s').picker)

const dictionaries = locales.find((entry) => entry.ns === 'modelSubmenu')?.dictionaries
check('dictionaries registered on the plugin namespace', dictionaries !== undefined)
const zhKeys = Object.keys(dictionaries?.zh ?? {}).sort()
const enKeys = Object.keys(dictionaries?.en ?? {}).sort()
check('zh/en key sets match', zhKeys.length > 0 && JSON.stringify(zhKeys) === JSON.stringify(enKeys))
check('every string is non-empty', enKeys.every((key) => typeof dictionaries.en[key] === 'string' && dictionaries.en[key].length > 0))
check('the row label exists in both dictionaries', typeof dictionaries?.zh['options.row'] === 'string' && typeof dictionaries?.en['options.row'] === 'string')

// The entries' injected face is what the components read their catalog and
// their metadata from.
const face = typeof row?.inject === 'function' ? row.inject('session-1') : undefined
check('inject face carries the shared directory store', face?.directory === directoryStore)
check('inject face names its session', face?.sessionId === 'session-1')
check('inject face carries the live metadata source', typeof face?.factsSource?.getSnapshot === 'function')
check('the metadata source subscribes and rebuilds', typeof face?.factsSource?.subscribe === 'function')
check('the settings mirror is the metadata source', describeCalls.length > 0)
check('a plain session may select', face?.available === true)
face?.load()
check('load() reaches the shared directory', directoryCalls.includes('load'))
await face?.select({ provider: 'aliyun', model: 'deepseek-v4.1-flash' })
check('select() reaches the shared directory', directoryCalls.includes('select:aliyun/deepseek-v4.1-flash'))

const addressed = typeof row?.inject === 'function' ? row.inject('subagent') : undefined
check('an addressed subagent session is unavailable', addressed?.available === false)
directoryCalls.length = 0
addressed?.load()
check('an unavailable session does not load the catalog', directoryCalls.length === 0)
check('an unavailable session resolves no selection', await addressed?.select({ provider: 'aliyun', model: 'deepseek-v4.1-flash' }) === undefined)

// The metadata join must actually reach both host answers, or the picker's
// line silently shows nothing for every model.
await new Promise((resolve) => setTimeout(resolve, 0))
check('the provider directory is asked which settings namespace holds each profile', providerDirectoryCalls.length > 0)
const facts = face?.factsSource?.getSnapshot()
check('the metadata lookup answers per model', typeof facts === 'function')
check('an unanswered settings document answers unknown instead of guessing', JSON.stringify(facts?.('magpie', 'any')) === JSON.stringify({ contextWindow: undefined, images: 'unknown' }))

check('no wiring error during apply', errors.length === 0)
for (const error of errors) console.log(`       ${error}`)

// ── the picker store ────────────────────────────────────────────────────────
// The row and the dialog mount in different slots, so the store is the only
// thing carrying the request across the menu's teardown. Its contract is small
// but load-bearing: a closed store, one open target at a time, and no listener
// fired for a request that changes nothing.
const store = exported.createPickerStore()
check('the store starts closed', store.getSnapshot().sessionId === null)
let notified = 0
const unsubscribe = store.subscribe(() => { notified += 1 })
store.open('session-1')
check('open() publishes the target session', store.getSnapshot().sessionId === 'session-1')
check('open() notifies subscribers', notified === 1)
store.open('session-1')
check('re-opening the same session does not notify again', notified === 1)
store.open('session-2')
check('a second open replaces the target', store.getSnapshot().sessionId === 'session-2' && notified === 2)
store.close()
check('close() clears the target', store.getSnapshot().sessionId === null && notified === 3)
unsubscribe()
store.open('session-3')
check('an unsubscribed listener stops hearing changes', notified === 3)

console.log(failures.length === 0 ? '\nsmoke: PASS' : `\nsmoke: FAIL (${failures.length})`)
process.exit(failures.length === 0 ? 0 : 1)
