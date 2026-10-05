/**
 * Headless wiring check for the Antigravity plugin's browser half.
 *
 * Loads the built `lib/client.cjs` the same way the Web shell does (through a
 * `window.__ModuleLoader__.load` stub), gives it fake cordis services, and
 * asserts every registration the settings card and shared relay page depend
 * on. Run with: node scripts/smoke-client.mjs
 */

import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const failures = []
const check = (label, ok) => {
  if (ok) console.log(`  ok   ${label}`)
  else { console.log(`  FAIL ${label}`); failures.push(label) }
}

const requires = []
/** Inert stand-in for the ui-primitives baseline the settings card imports. */
const primitivesStub = new Proxy({}, { get: (_t, key) => (key === '__esModule' ? true : () => null) })
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

const cards = []

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
        key: options.key,
        id: options.id,
        order: options.order,
        priority: options.priority,
        locale: options.locale,
        label: options.label,
        children: options.children === undefined ? undefined : Object.keys(options.children),
        inject: options.inject,
        component,
      }
      registrations.push(record)
      if (options.name === 'plugins.bundle.config') cards.push({ options: record })
      return () => {}
    },
    entries: () => [],
    getVersion: () => cards.length,
    subscribe: () => () => {},
  },
  locale: {
    register: (ns) => { locales.push(ns); return () => {} },
    bind: () => (key) => key,
    getSnapshot: () => ({ revision: 0 }),
    subscribe: () => () => {},
  },
  configForms: {
    get: (entryId) => { injects.push(`get:${entryId}`); return scope },
    // The page contribution is gated on the Host serving this bundle's
    // namespaces; the fake answers as served so the registration path runs as
    // in production.
    whileServed: (namespaces, register) => register(new Set(namespaces)),
  },
  connection: { isLoopback: false, rpc: { call: async () => ({ ok: true, value: {} }) } },
})

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

// Load built client
require(`${join(root, 'lib/client.cjs')}`)

check('bundle registers under its package id', requires[0] === '@lynn123411/dsh-antigravity-auth')
check('apply/inject exported', typeof exported?.apply === 'function' && Array.isArray(exported?.inject))
check("declares expected client dependencies", JSON.stringify(exported?.inject) === '["slots","locale","connection","configForms"]')

// Guard teeth test
try {
  void makeCtx('teeth').unknownService
  check('guard rejects an undeclared service read', false)
} catch (error) {
  check('guard rejects an undeclared service read', /cannot get property "unknownService" without inject/.test(error.message))
}

try {
  exported.apply(makeCtx('root', exported.inject ?? []))
  check('apply() survives the inject guard', true)
} catch (error) {
  check('apply() survives the inject guard', false)
  console.log(`       ${error.message}`)
}

// The configuration form lives on the host's Plugins page, keyed by the bundle's
// package name: the page renders it on this bundle's own page, above its rows.
const card = registrations.find(r => r.name === 'plugins.bundle.config')
check('configuration page registered on the Plugins page bundle slot', card !== undefined)
check('config key is the bundle package name',
  card?.key === '@lynn123411/dsh-antigravity-auth')
check('configuration page uses this bundle locale namespace', card?.locale === 'settings.antigravityAuth')
check('configuration page exposes a component', typeof card?.component === 'function')
check('no settings-page section is registered any more',
  registrations.every(r => r.name !== 'settings.section'))

const face = typeof card?.inject === 'function' ? card.inject() : undefined
check('card inject face carries the RPC client', face?.rpc !== undefined)
check('card inject face carries all four config scopes',
  ['masterScope', 'searchScope', 'imageScope', 'videoScope'].every(name => face?.[name] !== undefined))

check('locale dictionaries registered', locales.includes('settings.antigravityAuth'))
check('reads the master switch form', injects.includes('get:antigravity-auth'))
check('reads every capability form', ['antigravity-search', 'antigravity-image', 'antigravity-video']
  .every(entry => injects.includes(`get:${entry}`)))
check('no wiring error during apply', errors.length === 0)
for (const error of errors) console.log(`       ${error}`)

// The page is this bundle's own: it registers whether or not any other bundle
// contributes one, and re-applying registers it exactly once more.
registrations.length = 0
cards.length = 0
errors.length = 0
try {
  exported.apply(makeCtx('second', exported.inject ?? []))
} catch (error) {
  check('apply() survives the inject guard (second mount)', false)
  console.log(`       ${error.message}`)
}
check('bundle config registers on every mount',
  registrations.filter(r => r.name === 'plugins.bundle.config').length === 1)
check('second mount stays error-free', errors.length === 0)

console.log(failures.length === 0 ? '\nsmoke: PASS' : `\nsmoke: FAIL (${failures.length})`)
process.exit(failures.length === 0 ? 0 : 1)
