/**
 * Headless wiring check for the plugin's browser half.
 *
 * Loads the built `lib/client.js` the same way the Web shell does (through a
 * `window.__ModuleLoader__.load` stub), gives it fake cordis services, and
 * asserts the seat takeover the composer depends on. Run with:
 * node scripts/smoke-client.mjs [plugin-dir]
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

/** Per-session directory stub: records what the seat asked it to do. */
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
    bind: () => (key) => key,
  },
  modelDirectories: { directoryFor: (sessionId) => { directoryCalls.push(`directoryFor:${sessionId}`); return directory } },
  sessions: { subagentAddress: (sessionId) => sessionId === 'subagent' ? { agent: 'a' } : undefined },
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
check('declares exactly the services its halves read', JSON.stringify(exported?.inject) === '["locale","modelDirectories","remote","remote.session","sessions","slots"]')

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

check('seat declared through the seat\'s own inject key', injects.includes('slot:conversation.input.model'))

const seat = registrations.find((r) => r.name === 'conversation.input.model')
check('composer model seat taken over', seat !== undefined)
check('shadows the built-in occupant below its priority', seat?.priority === -100)
check('names its registrant', seat?.registrant === '@lynn123411/dsh-model-submenu')
check('renders through its own dictionary namespace', seat?.locale === 'modelSubmenu')
check('exports a component', typeof seat?.component === 'function')

const dictionaries = locales.find((entry) => entry.ns === 'modelSubmenu')?.dictionaries
check('dictionaries registered on the seat namespace', dictionaries !== undefined)
const zhKeys = Object.keys(dictionaries?.zh ?? {}).sort()
const enKeys = Object.keys(dictionaries?.en ?? {}).sort()
check('zh/en key sets match', zhKeys.length > 0 && JSON.stringify(zhKeys) === JSON.stringify(enKeys))
check('every string is non-empty', enKeys.every((key) => typeof dictionaries.en[key] === 'string' && dictionaries.en[key].length > 0))

// The seat's injected face is what the component reads its catalog from.
const face = typeof seat?.inject === 'function' ? seat.inject('session-1') : undefined
check('inject face carries the shared directory store', face?.directory === directoryStore)
check('a plain session may select', face?.available === true)
face?.load()
check('load() reaches the shared directory', directoryCalls.includes('load'))
await face?.select({ provider: 'aliyun', model: 'deepseek-v4.1-flash' })
check('select() reaches the shared directory', directoryCalls.includes('select:aliyun/deepseek-v4.1-flash'))

const addressed = typeof seat?.inject === 'function' ? seat.inject('subagent') : undefined
check('an addressed subagent session is unavailable', addressed?.available === false)
directoryCalls.length = 0
addressed?.load()
check('an unavailable session does not load the catalog', directoryCalls.length === 0)
check('an unavailable session resolves no selection', await addressed?.select({ provider: 'aliyun', model: 'deepseek-v4.1-flash' }) === undefined)

check('no wiring error during apply', errors.length === 0)
for (const error of errors) console.log(`       ${error}`)

console.log(failures.length === 0 ? '\nsmoke: PASS' : `\nsmoke: FAIL (${failures.length})`)
process.exit(failures.length === 0 ? 0 : 1)