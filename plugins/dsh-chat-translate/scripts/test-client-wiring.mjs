/**
 * Headless wiring check for the plugin's browser half.
 *
 * Loads the built `lib/client.js` the way the Web shell does (through a
 * `window.__ModuleLoader__.load` stub) and applies it against a context that
 * enforces the kernel's inject guard: reading a service the plugin did not
 * declare throws `cannot get property "x" without inject`, exactly like
 * `@deepseek-ai/cordis` (src/reflect.ts). `ctx.get(name)` stays non-throwing.
 *
 * 1.3.0 read `ctx.locale` without declaring `inject: ['locale']`, so the client
 * apply threw and the plugin never reached the shared settings page. A fake
 * context that carries every service as a plain property cannot see that bug,
 * which is why the guard is modelled here instead of stubbed away.
 *
 * Run with: node scripts/test-client-wiring.mjs [plugin-dir]
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

// --- DOM surface: the observer starts at apply time, the card only registers ---

const stubElement = {
  addEventListener() {}, removeEventListener() {}, appendChild() {}, remove() {},
  setAttribute() {}, removeAttribute() {}, getAttribute: () => null,
  hasAttribute: () => false, classList: { add() {}, remove() {}, toggle() {} },
  style: {}, dataset: {}, children: [], firstElementChild: null, nextElementSibling: null,
  parentElement: null, closest: () => null, querySelector: () => null, querySelectorAll: () => [],
  getClientRects: () => [], getBoundingClientRect: () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }),
}
globalThis.window = {
  document: stubElement, location: { href: 'http://127.0.0.1/' }, addEventListener() {}, removeEventListener() {},
  // Real timers (the observer arms a re-probe interval) kept off the event loop.
  setInterval: (fn, ms) => { const t = setInterval(fn, ms); t?.unref?.(); return t },
  clearInterval: t => clearInterval(t),
  setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); t?.unref?.(); return t },
  clearTimeout: t => clearTimeout(t),
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
}
globalThis.document = {
  documentElement: stubElement, body: stubElement, head: stubElement,
  createElement: () => ({ ...stubElement }), createTextNode: () => ({}),
  querySelector: () => null, querySelectorAll: () => [],
  addEventListener() {}, removeEventListener() {}, getElementById: () => null,
}
globalThis.MutationObserver = class { observe() {} disconnect() {} takeRecords() { return [] } }
globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} }
globalThis.requestAnimationFrame = () => 0
globalThis.cancelAnimationFrame = () => {}
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' })
globalThis.HTMLElement = class HTMLElement {}
globalThis.Element = class Element {}
globalThis.Node = class Node {}
globalThis.Event = class Event {}
globalThis.CustomEvent = class CustomEvent {}

// --- Module table: the bundle externalises react only ---

const tolerant = new Proxy({}, {
  get: (_t, key) => (key === 'then' || typeof key === 'symbol' ? undefined : () => tolerant),
})

let exported
globalThis.window.__ModuleLoader__ = {
  load: ({ id, factory }) => {
    exported = factory((spec) => {
      if (spec === 'react' || spec === 'react/jsx-runtime' || spec === 'react-dom') return tolerant
      throw new Error(`module table miss: ${spec}`)
    })
    exported.__loadedId = id
  },
}

// --- Cordis-faithful context ---

const registrations = []
const injects = []
const locales = []
const scopeBinds = []
const errors = []

/** Set by the election case: another participant already holds the shared page. */
let existingSections = []

const scope = {
  getSnapshot: () => ({ status: 'ready', value: undefined, writable: true, revision: 1, mode: 'host' }),
  subscribe: () => () => {},
  set: async () => {},
  unset: async () => {},
  mutate: async () => {},
}

const services = {
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
        locale: options.locale,
        children: options.children === undefined ? undefined : Object.keys(options.children),
        component,
      })
      return () => {}
    },
    entries: key => (key === 'settings.section' ? existingSections : []),
  },
  locale: { register: ns => { locales.push(ns); return () => {} }, bind: ns => key => `${ns}:${key}` },
  settingsScope: { bind: spec => { scopeBinds.push(spec.namespace); return scope } },
  remote: tolerant,
  'remote.credentials': tolerant,
}

/**
 * Context proxy with the kernel's guard: declared services resolve as
 * properties, everything else throws, `get()` returns undefined.
 */
function makeCtx(declared = []) {
  const base = {
    on: () => () => {},
    effect: (fn) => { fn(); return () => {} },
    inject: (names, callback) => {
      const list = Array.isArray(names) ? names : [names]
      try {
        const dispose = callback(makeCtx([...declared, ...list]))
        if (typeof dispose === 'function') dispose()
      } catch (error) {
        errors.push(`inject[${list.join(',')}] threw: ${error?.message}`)
      }
      return () => {}
    },
    get: name => services[name],
  }
  return new Proxy(base, {
    get(target, prop) {
      if (typeof prop === 'symbol' || prop === 'then') return undefined
      if (prop in target) return target[prop]
      if (declared.includes(prop)) return services[prop]
      throw new Error(`cannot get property "${prop}" without inject`)
    },
  })
}

await import(`${join(root, 'lib/client.js')}?wiring=${Date.now()}`)

check('bundle registers under its package id', exported?.__loadedId === '@lynn123411/dsh-chat-translate')
check('apply/inject exported', typeof exported?.apply === 'function' && Array.isArray(exported?.inject))

// The guard must have teeth, or every case below is vacuous.
try {
  makeCtx().locale
  check('guard rejects an undeclared service read', false)
} catch (error) {
  check('guard rejects an undeclared service read', /cannot get property "locale" without inject/.test(error.message))
}
check('ctx.get stays non-throwing for unknown services', makeCtx().get('nope') === undefined)

try {
  exported.apply(makeCtx(exported.inject ?? []))
  check('apply() survives the inject guard', true)
} catch (error) {
  check('apply() survives the inject guard', false)
  console.log(`       ${error.message}`)
}

check('no wiring error during apply', errors.length === 0)
for (const error of errors) console.log(`       ${error}`)

const page = registrations.find(r => r.name === 'settings.section')
check('shared reading page claimed', page?.id === 'reading')
check('shared page sits at the reading order', page?.order === 110)
check('shared page declares its card slot', JSON.stringify(page?.children) === '["reading.settings.item"]')

const card = registrations.find(r => r.name === 'reading.settings.item')
check('card registered on the shared page slot', card !== undefined)
check('card keyed by the Host settings namespace', card?.id === 'dsh-chat-translate')
check('card ordered after the other participants', card?.order === 30)
check('card uses this plugin locale namespace', card?.locale === 'settings.chatTranslate')

check('locale dictionaries registered', locales.includes('settings.chatTranslate'))
check('settings scope bound to the Host namespace', scopeBinds.includes('dsh-chat-translate'))

// Election case: another participant already holds the page.
registrations.length = 0
errors.length = 0
existingSections = [{ options: { id: 'reading' } }]
exported.apply(makeCtx(exported.inject ?? []))
check('page is not claimed twice', registrations.every(r => r.name !== 'settings.section'))
check('card still registers beside the other participant', registrations.some(r => r.name === 'reading.settings.item'))
check('election path stays error-free', errors.length === 0)

console.log(failures.length === 0 ? '\nwiring: PASS' : `\nwiring: FAIL (${failures.length})`)
process.exit(failures.length === 0 ? 0 : 1)
