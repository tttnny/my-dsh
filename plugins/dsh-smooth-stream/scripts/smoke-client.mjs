/**
 * Headless wiring check for the plugin's browser half.
 *
 * Loads the built `lib/client.js` the same way the Web shell does (through a
 * `window.__ModuleLoader__.load` stub), gives it fake cordis services, and
 * asserts every registration the settings card and the chat takeover depend
 * on. Run with: node scripts/smoke-client.mjs [plugin-dir]
 */

import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'))

const failures = []
const check = (label, ok) => {
  if (ok) console.log(`  ok   ${label}`)
  else { console.log(`  FAIL ${label}`); failures.push(label) }
}

/** Minimal snapshot store, matching the seed package's shape. */
const storeStub = {
  createSnapshotStore: (init) => {
    let state = init
    const listeners = new Set()
    return {
      getSnapshot: () => state,
      subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener) } },
      update: (mutator) => { const draft = { ...state }; mutator(draft); state = draft; for (const l of [...listeners]) l() },
      set: (next) => { state = next; for (const l of [...listeners]) l() },
    }
  },
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
        if (spec === '@deepseek-ai/dsh-client-store') return storeStub
        if (spec === '@deepseek-ai/dsh-client-ui-primitives') return primitivesStub
        throw new Error(`module table miss: ${spec}`)
      })
    },
  },
}

const scope = {
  getSnapshot: () => ({ status: 'ready', value: undefined, base: undefined, user: undefined, revision: 1, writable: true, mode: 'host' }),
  subscribe: () => () => {},
  set: async () => {},
  unset: async () => {},
  mutate: async () => {},
}

const registrations = []
const injects = []
const locales = []
const errors = []

/** Set by the election case: a pre-existing occupant of the shared page. */
let existingSections = []

/**
 * Service table. `ctx.get(name)` reads from here (cordis' reflect.get never
 * throws for an unknown name); property access only resolves what the plugin
 * declared in `inject`, exactly like the kernel guard.
 */
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
        key: options.key,
        id: options.id,
        order: options.order,
        priority: options.priority,
        locale: options.locale,
        children: options.children === undefined ? undefined : Object.keys(options.children),
        component,
      })
      return () => {}
    },
    entries: (key) => (key === 'settings.section' ? existingSections : []),
  },
  locale: {
    register: (ns) => { locales.push(ns); return () => {} },
    bind: () => (key) => key,
  },
  settingsScope: { bind: (spec) => { injects.push(`bind:${spec.namespace}`); return scope } },
  settings: { register: () => scope, writable: true },
  connection: { isLoopback: true, rpc: { call: async () => ({ ok: true, value: {} }) } },
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

check('bundle registers under its package id', requires[0] === '@lynn123411/dsh-smooth-stream')
check('apply/inject exported', typeof exported?.apply === 'function' && Array.isArray(exported?.inject))
check("declares only the hard 'slots' dependency", JSON.stringify(exported?.inject) === '["slots"]')

// The guard must have teeth, or every case below is vacuous.
try {
  makeCtx('teeth').locale
  check('guard rejects an undeclared service read', false)
} catch (error) {
  check('guard rejects an undeclared service read', /cannot get property "locale" without inject/.test(error.message))
}

try {
  exported.apply(makeCtx('root', exported.inject ?? []))
  check('apply() survives the inject guard', true)
} catch (error) {
  check('apply() survives the inject guard', false)
  console.log(`       ${error.message}`)
}

const page = registrations.find(r => r.name === 'settings.section')
check('shared reading page claimed', page?.id === 'reading')
check('shared page sits at the reading order', page?.order === 110)
check('shared page declares its card slot', JSON.stringify(page?.children) === '["reading.settings.item"]')

const card = registrations.find(r => r.name === 'reading.settings.item')
check('smooth-stream card registered on the shared page slot', card !== undefined)
check('card keyed by its Host settings namespace', card?.id === 'lynn-smooth-stream')
check('settings scope bound to the same namespace', injects.some(i => i === 'bind:lynn-smooth-stream'))

const debugPanel = registrations.find(r => r.name === 'conversation.session.header.utilities')
check('diagnostics panel registered', debugPanel !== undefined)

const chatNode = registrations.find(r => r.name === 'conversation.chat.node')
check('assistant chat row shadowed at priority -100', chatNode?.key === 'assistant-step' && chatNode?.priority === -100)
check('chat row uses the chat locale namespace', chatNode?.locale === 'chat')

check('locale dictionaries registered', locales.includes('settings.smoothStream'))
check('no wiring error during apply', errors.length === 0)
for (const error of errors) console.log(`       ${error}`)

// Election case: another participant already holds the page.
registrations.length = 0
errors.length = 0
existingSections = [{ options: { id: 'reading' } }]
try {
  exported.apply(makeCtx('second', exported.inject ?? []))
} catch (error) {
  check('apply() survives the inject guard (election)', false)
  console.log(`       ${error.message}`)
}
check('page is not claimed twice', registrations.every(r => r.name !== 'settings.section'))
check('card still registers beside the other participant', registrations.some(r => r.name === 'reading.settings.item'))
check('election path stays error-free', errors.length === 0)

console.log(failures.length === 0 ? '\nsmoke: PASS' : `\nsmoke: FAIL (${failures.length})`)
process.exit(failures.length === 0 ? 0 : 1)
