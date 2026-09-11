/**
 * Headless wiring check for the plugin's browser half.
 *
 * Loads the built `lib/client.js` the same way the Web shell does (through a
 * `window.__ModuleLoader__.load` stub), gives it fake cordis services, and
 * asserts every registration the 「API中转」 page and the sidebar card depend
 * on. Run with: node scripts/smoke-client.mjs
 *
 * The fake context models the kernel's inject guard, so reading a service the
 * bundle did not declare throws here instead of turning the whole loader entry
 * `failed` in the profile — the failure mode that makes a plugin disappear from
 * the page with nothing in the Host log.
 */

import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'))

/** Child slot both participants of the shared page register their card into. */
const ITEM_SLOT = 'relay.settings.item'

const failures = []
const check = (label, ok) => {
  if (ok) console.log(`  ok   ${label}`)
  else { console.log(`  FAIL ${label}`); failures.push(label) }
}

/**
 * The bundle touches `document` and `window` at module scope (its stylesheet
 * tag, the tooltip portal) and starts a warm-up timer, so the sandbox needs the
 * smallest DOM that survives those calls — nothing here asserts on the UI.
 */
const styleTags = []
const fakeElement = () => ({
  id: '',
  style: { cssText: '' },
  textContent: '',
  className: '',
  setAttribute() {},
  getAttribute() {
    return null
  },
  appendChild() {},
  remove() {},
  addEventListener() {},
  removeEventListener() {},
  querySelector() {
    return null
  },
})

globalThis.window = {
  __ModuleLoader__: {
    load: () => {},
  },
  addEventListener() {},
  removeEventListener() {},
  innerWidth: 1280,
  innerHeight: 800,
}

globalThis.document = {
  head: { append() {}, appendChild() {} },
  body: {
    appendChild() {},
    classList: { add() {}, remove() {} },
    contains() {
      return false
    },
  },
  getElementById() {
    return null
  },
  querySelector(selector) {
    styleTags.push(selector)
    // Only the stylesheet guard asks; reporting the tag as absent makes the
    // bundle take its inject path exactly once.
    return null
  },
  createElement: () => fakeElement(),
  addEventListener() {},
  removeEventListener() {},
  activeElement: null,
}

let loaded
globalThis.window.__ModuleLoader__.load = (row) => {
  loaded = row
}

/** Registrations the bundle made, plus the services and errors it hit. */
const registrations = []
const injects = []
const locales = []
const errors = []

const scope = {
  getSnapshot: () => ({ status: 'ready', value: undefined, base: undefined, user: undefined, revision: 1, writable: true, mode: 'host' }),
  subscribe: () => () => {},
  set: async () => {},
  unset: async () => {},
  mutate: async () => {},
}

/** Card registrations collected on the shared page's child slot. */
const cardEntries = []
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
      const record = {
        name: options.name,
        id: options.id,
        order: options.order,
        label: options.label,
        children: options.children === undefined ? undefined : Object.keys(options.children),
        inject: options.inject,
        component,
      }
      registrations.push(record)
      // StoredEntry shape: the shared page reads `entry.options.*`.
      if (options.name === ITEM_SLOT) cardEntries.push({ options: record })
      return () => {}
    },
    entries: (key) => {
      if (key === 'settings.section') return existingSections
      if (key === ITEM_SLOT) return cardEntries
      return []
    },
    // The shared page builds its tab roster from the child slot's registry face.
    getVersion: () => cardEntries.length + existingSections.length,
    subscribe: () => () => {},
  },
  locale: {
    register: (ns) => { locales.push(ns); return () => {} },
    bind: () => (key) => key,
    getSnapshot: () => ({ revision: 0 }),
    subscribe: () => () => {},
  },
  settingsScope: { bind: (spec) => { injects.push(`bind:${spec.namespace}`); return scope } },
})

/**
 * Cordis-faithful context: an undeclared service read throws
 * `cannot get property "x" without inject`, so a bundle that reads e.g.
 * `ctx.locale` without declaring it fails here instead of in the profile.
 *
 * @param {string} label - context label used in recorded diagnostics.
 * @param {string[]} declared - services the plugin declared through `inject`.
 * @returns {object} the guarded context.
 */
function makeCtx(label, declared = []) {
  const table = services()
  const base = {
    label,
    effect: (fn) => { fn(); return () => {} },
    on: () => () => {},
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

const source = (await import('node:fs')).readFileSync(join(root, 'lib/client.js'), 'utf8')
new Function('window', 'document', source)(globalThis.window, globalThis.document)

check('bundle registers under its package id', loaded?.id === '@lynn123411/dsh-a6api')
const exported = loaded?.factory((spec) => {
  if (spec === 'react') return require('react')
  if (spec === 'react/jsx-runtime') return require('react/jsx-runtime')
  throw new Error(`module table miss: ${spec}`)
})
check('apply/inject exported', typeof exported?.apply === 'function' && Array.isArray(exported?.inject))
check('declares slots and locale', JSON.stringify(exported?.inject) === '["slots","locale"]')

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
check('shared 「API中转」 page claimed', page?.id === 'relay')
check('shared page sits at the sidebar order it replaces', page?.order === 120)
check('shared page declares its card slot', JSON.stringify(page?.children) === `["${ITEM_SLOT}"]`)
check('page label resolves through the locale namespace', typeof page?.label === 'function' && page.label() === 'pageNav')

const card = cardEntries[0]?.options
check('a6api panel registered on the shared page slot', card !== undefined)
check('panel keyed by its own settings namespace', card?.id === 'dsh-a6api')
check('panel is the first tab', card?.order === 10)
check('panel carries its tab label', typeof card?.label === 'function' && card.label() === 'tabNav')

// The page turns those registrations into tabs.
const pageFace = typeof page?.inject === 'function' ? page.inject() : undefined
const tabs = pageFace?.relayTabs?.getSnapshot?.() ?? []
check('page exposes one tab per registered card', tabs.length === 1 && tabs[0]?.id === 'dsh-a6api')
check('tab label resolves through the registration label', tabs[0]?.label === 'tabNav')
check('tab roster is subscribable', typeof pageFace?.relayTabs?.subscribe === 'function')

check('shared page name registered in the locale namespace', locales.includes('settings.a6api'))
check('sidebar card still registered', registrations.some(r => r.name === 'sidebar.footer.action'))
check('no wiring error during apply', errors.length === 0)
for (const error of errors) console.log(`       ${error}`)

// Election case: another participant (dsh-llm-agentrouter) already holds the page.
registrations.length = 0
cardEntries.length = 0
errors.length = 0
existingSections = [{ options: { id: 'relay' } }]
try {
  exported.apply(makeCtx('second', exported.inject ?? []))
} catch (error) {
  check('apply() survives the inject guard (election)', false)
  console.log(`       ${error.message}`)
}
check('page is not claimed twice', registrations.every(r => r.name !== 'settings.section'))
check('panel still registers beside the other participant', registrations.some(r => r.name === ITEM_SLOT))
check('election path stays error-free', errors.length === 0)

console.log(failures.length === 0 ? '\nsmoke: PASS' : `\nsmoke: FAIL (${failures.length})`)
process.exit(failures.length === 0 ? 0 : 1)
