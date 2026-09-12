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
let exported
globalThis.window = {
  __ModuleLoader__: {
    load: ({ id, factory }) => {
      requires.push(id)
      exported = factory((spec) => {
        if (spec === 'react') return require('react')
        if (spec === 'react/jsx-runtime') return require('react/jsx-runtime')
        if (spec === 'react-dom') return require('react-dom')
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

let existingSections = []
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
      if (options.name === 'relay.settings.item') cards.push({ options: record })
      return () => {}
    },
    entries: (key) => {
      if (key === 'settings.section') return existingSections
      if (key === 'relay.settings.item') return cards
      return []
    },
    getVersion: () => cards.length + existingSections.length,
    subscribe: () => () => {},
  },
  locale: {
    register: (ns) => { locales.push(ns); return () => {} },
    bind: () => (key) => key === 'tabNav' ? 'Antigravity' : key,
    getSnapshot: () => ({ revision: 0 }),
    subscribe: () => () => {},
  },
  settingsScope: { bind: (spec) => { injects.push(`bind:${spec.namespace}`); return scope } },
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
check("declares expected client dependencies", JSON.stringify(exported?.inject) === '["slots","locale","connection","settingsScope"]')

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

const page = registrations.find(r => r.name === 'settings.section')
check('shared relay page claimed', page?.id === 'relay')
check('shared page sits at order 120', page?.order === 120)
check('shared page declares its child slot', JSON.stringify(page?.children) === '["relay.settings.item"]')

const card = registrations.find(r => r.name === 'relay.settings.item')
check('antigravity card registered on relay.settings.item', card !== undefined)
check('card id is antigravity-auth', card?.id === 'antigravity-auth')
check('card order is 30', card?.order === 30)
check('card carries tab label thunk', typeof card?.label === 'function' && card.label() === 'Antigravity')

const pageFace = typeof page?.inject === 'function' ? page.inject() : undefined
const tabs = pageFace?.relayTabs?.getSnapshot?.() ?? []
check('page exposes one tab per registered card', tabs.length === 1 && tabs[0]?.id === 'antigravity-auth')
check('tab label resolves to Antigravity', tabs[0]?.label === 'Antigravity')

check('locale dictionaries registered', locales.includes('settings.antigravityAuth'))
check('no wiring error during apply', errors.length === 0)
for (const error of errors) console.log(`       ${error}`)

// Election case: another participant (e.g. a6api) already claimed the page
registrations.length = 0
cards.length = 0
errors.length = 0
existingSections = [{ options: { id: 'relay' } }]
try {
  exported.apply(makeCtx('second', exported.inject ?? []))
} catch (error) {
  check('apply() survives the inject guard (election)', false)
  console.log(`       ${error.message}`)
}
check('page is not claimed twice', registrations.every(r => r.name !== 'settings.section'))
check('card still registers into relay.settings.item', registrations.some(r => r.name === 'relay.settings.item' && r.id === 'antigravity-auth'))
check('election path stays error-free', errors.length === 0)

console.log(failures.length === 0 ? '\nsmoke: PASS' : `\nsmoke: FAIL (${failures.length})`)
process.exit(failures.length === 0 ? 0 : 1)
