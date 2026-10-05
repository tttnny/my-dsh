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
 * apply threw and the plugin never reached its configuration page. A fake
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

// --- DOM surface: apply registers the row takeover; styles inject once ---

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
  // Real timers kept off the event loop.
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

// --- Module table: the bundle externalises react and the primitives baseline ---

const tolerant = new Proxy({}, {
  get: (_t, key) => (key === 'then' || typeof key === 'symbol' ? undefined : () => tolerant),
})

let exported
globalThis.window.__ModuleLoader__ = {
  load: ({ id, factory }) => {
    exported = factory((spec) => {
      if (spec === 'react' || spec === 'react/jsx-runtime' || spec === 'react-dom') return tolerant
      if (spec === '@deepseek-ai/dsh-client-ui-primitives') return tolerant
      throw new Error(`module table miss: ${spec}`)
    })
    exported.__loadedId = id
  },
}

// --- Cordis-faithful context ---

const registrations = []
const injects = []
const locales = []
/** Namespaces the plugin asked the shared configuration forms for. */
const formLookups = []
/** Namespaces the plugin gated its page on (`configForms.whileServed`). */
const servedWatches = []
const errors = []

/** Client shape of `ConfigForm<T>`: the per-entry read/write face of the config. */
let formSubscribes = 0
const form = {
  getSnapshot: () => ({ status: 'ready', value: { enabled: true }, writable: true, revision: 1, mode: 'host' }),
  subscribe: () => { formSubscribes++; return () => {} },
  set: async () => true,
  unset: async () => true,
  mutate: async () => true,
}

const services = {
  slots: {
    inject: (key, callback) => {
      injects.push(`slot:${key}`)
      const before = registrations.length
      try { callback() } catch (error) { errors.push(`slots.inject(${key}) threw: ${error?.message}`) }
      // The real kernel tears down this contribution's registrations when the
      // declaration collapses; the fake records them so a disposer check can
      // observe the same teardown.
      const created = registrations.slice(before)
      return () => { for (const rec of created) rec.dispose() }
    },
    register: (options, component) => {
      const rec = {
        name: options.name,
        id: options.id,
        key: options.key,
        order: options.order,
        priority: options.priority,
        locale: options.locale,
        entryInject: options.inject,
        children: options.children === undefined ? undefined : Object.keys(options.children),
        component,
        disposed: false,
      }
      rec.dispose = () => { rec.disposed = true }
      registrations.push(rec)
      return rec.dispose
    },
    entries: () => [],
  },
  locale: { register: ns => { locales.push(ns); return () => {} }, bind: ns => key => `${ns}:${key}` },
  // `whileServed` runs its registration once one of the namespaces is in the
  // describe mirror; the fake answers immediately so the page/card paths below
  // exercise the same code production runs.
  configForms: {
    get: ns => { formLookups.push(ns); return form },
    whileServed: (namespaces, register) => {
      servedWatches.push([...namespaces])
      return register(new Set(namespaces))
    },
  },
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

// The configuration form lives on the host's Plugins page, keyed by the bundle's
// package name: the page renders it on the bundle's own page, above its rows.
const rowConfig = registrations.find(r => r.name === 'plugins.bundle.config')
check('configuration page registered on the Plugins page bundle slot', rowConfig !== undefined)
check('config key is the bundle package name',
  rowConfig?.key === '@lynn123411/dsh-chat-translate')
check('bundle config still binds the Host settings namespace form', formLookups.includes('dsh-chat-translate'))
check('configuration page uses this plugin locale namespace', rowConfig?.locale === 'settings.chatTranslate')
check('configuration page exposes a component', typeof rowConfig?.component === 'function')
check('configuration page contributed through slots.inject',
  injects.includes('slot:plugins.bundle.config'))
check('no settings-page section is registered any more',
  registrations.every(r => r.name !== 'settings.section'))

check('locale dictionaries registered', locales.includes('settings.chatTranslate'))
check('page gated on the Host serving this plugin entry', JSON.stringify(servedWatches[0]) === '["dsh-chat-translate"]')
check('store bound to the shared configuration form', formSubscribes > 0)

// 输入框下方那一行的翻译开关：经 slots.inject 注册进 ui-conversation 声明的
// conversation.composer.dock，order -2 排在 dsh-a6api 胶囊（-1）的左侧。
const dock = registrations.find(r => r.name === 'conversation.composer.dock')
check('composer dock toggle registered', dock !== undefined)
check('dock entry keyed by its own id', dock?.id === 'dsh-chat-translate-toggle')
check('dock entry sits left of the a6api pill', dock?.order === -2)
check('dock entry uses this plugin locale namespace', dock?.locale === 'settings.chatTranslate')
check('dock entry exposes a component', typeof dock?.component === 'function')
check('dock contributed through slots.inject', injects.includes('slot:conversation.composer.dock'))

// 接管助手行：conversation.chat.node 的 keyed seat，key assistant-step，
// priority -1 排在宿主默认注册之前；presentation hook 由注册项的 inject 供给。
const takeover = registrations.find(r => r.name === 'conversation.chat.node')
check('assistant-step takeover registered', takeover !== undefined)
check('takeover keyed to assistant-step', takeover?.key === 'assistant-step')
check('takeover shadows the host renderer (priority -1)', takeover?.priority === -1)
check('takeover reuses the host chat locale', takeover?.locale === 'chat')
// memo() 的产物是对象而非函数（本桩件的 react 把一切折叠为代理对象），
// 接线层只断言注册携带了渲染载体。
check('takeover entry exposes a component', takeover?.component != null)
check('takeover contributed through slots.inject', injects.includes('slot:conversation.chat.node'))
const injected = takeover?.entryInject?.()
check('takeover injects the live presentation hook',
  typeof injected?.hooks?.presentation?.getSnapshot === 'function' &&
  typeof injected?.hooks?.presentation?.subscribe === 'function')
check('presentation defaults to standard policy', injected?.hooks?.presentation?.getSnapshot().mode === 'standard')

// 「工作细节」模式跟随宿主：apply 读 ui-chat 的配置面。
check('chat presentation reads the ui-chat config form', formLookups.includes('ui-chat'))

// The configuration page is the plugin's own: it registers whether or not any
// other plugin contributes one, and its registration is independent of the
// assistant-row takeover and the composer dock.
registrations.length = 0
errors.length = 0
formLookups.length = 0
exported.apply(makeCtx(exported.inject ?? []))
check('bundle config registers', registrations.some(r => r.name === 'plugins.bundle.config'))
check('dock registers independently of the bundle config', registrations.some(r => r.name === 'conversation.composer.dock'))
check('takeover registers independently of the bundle config', registrations.some(r => r.name === 'conversation.chat.node'))
check('independent path stays error-free', errors.length === 0)

// Disposal: the dock contribution carries a disposer that tears its registration down.
registrations.length = 0
const dockSetupCtx = makeCtx(exported.inject ?? [])
const dockOff = exported.setupComposerToggle(dockSetupCtx)
check('dock setup returns a disposer', typeof dockOff === 'function')
const dockRec = registrations.find(r => r.name === 'conversation.composer.dock')
check('dock setup registers once', registrations.filter(r => r.name === 'conversation.composer.dock').length === 1)
if (typeof dockOff === 'function') dockOff()
check('disposer tears down the dock registration', dockRec?.disposed === true)

console.log(failures.length === 0 ? '\nwiring: PASS' : `\nwiring: FAIL (${failures.length})`)
process.exit(failures.length === 0 ? 0 : 1)
