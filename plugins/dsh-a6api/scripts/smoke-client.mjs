/**
 * Headless wiring check for the plugin's browser half.
 *
 * Loads the built `lib/client.js` the same way the Web shell does (through a
 * `window.__ModuleLoader__.load` stub), gives it fake cordis services, and
 * asserts every registration this plugin's **Plugins** page form and the
 * sidebar footer entry depend on, plus one render of each. Run with:
 * node scripts/smoke-client.mjs
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

/**
 * The Plugins page slot a bundle's own configuration registers into. The key is
 * the bundle's package name; the Host renders the entry ON the bundle's own
 * page, under its description and above its rows, and that page owns the title,
 * icon and crumb.
 */
const BUNDLE_CONFIG_SLOT = 'plugins.bundle.config'
/** This plugin's own config key: its bundle package name. */
const BUNDLE_CONFIG_KEY = '@lynn123411/dsh-a6api'
/** Locale namespace this plugin's card and dictionaries are registered under. */
const NS = 'settings.a6api'

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
  addEventListener: (type, listener) => { documentListeners.push({ type, listener }) },
  removeEventListener: (type, listener) => {
    const at = documentListeners.findIndex(entry => entry.type === type && entry.listener === listener)
    if (at >= 0) documentListeners.splice(at, 1)
  },
  activeElement: null,
}

/**
 * Document-level listeners the bundle installed. The escape/outside-click
 * dismissal is a document listener pair, so the cases below can fire the real
 * handlers instead of poking component state.
 */
const documentListeners = []

let loaded
globalThis.window.__ModuleLoader__.load = (row) => {
  loaded = row
}

/** Registrations the bundle made, plus the services and errors it hit. */
const registrations = []
const injects = []
const locales = []
const errors = []

/**
 * Optional `pluginNavigation` implementation. The Host's plugin-manager page
 * provides this service only while it is mounted, so the fake context exposes
 * it as a settable slot: tests flip it between "available" and "absent" to prove
 * the 「配置」 pill follows the service instead of being frozen at load time.
 */
let pluginNavigationImpl

/**
 * Fake `modelDirectories`. The entry resolves the current session's model
 * selection through it, the same service the composer's own model picker reads,
 * so a fake directory with a live subscription is how the cases below observe
 * "the card follows the session's model".
 */
let modelDirectoriesImpl

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
        // Keyed registrations carry their key; list registrations their id.
        key: options.key,
        id: options.id,
        order: options.order,
        label: options.label,
        locale: options.locale,
        children: options.children === undefined ? undefined : Object.keys(options.children),
        inject: options.inject,
        component,
      }
      registrations.push(record)
      return () => {}
    },
    entries: () => [],
    getVersion: () => registrations.length,
    subscribe: () => () => {},
  },
  locale: {
    register: (ns) => { locales.push(ns); return () => {} },
    bind: () => (key) => key,
    getSnapshot: () => ({ revision: 0 }),
    subscribe: () => () => {},
  },
})

/**
 * Cordis-faithful context: an undeclared service read throws
 * `cannot get property "x" without inject`, so a bundle that reads e.g.
 * `ctx.locale` without declaring it fails here instead of in the profile.
 *
 * `ctx.on` is recorded so the bundle's optional-service subscription can be
 * observed; `internal/service` listeners are what a real Host emits when
 * `pluginNavigation` is provided or retracted.
 *
 * @param {string} label - context label used in recorded diagnostics.
 * @param {string[]} declared - services the plugin declared through `inject`.
 * @returns {object} the guarded context.
 */
function makeCtx(label, declared = []) {
  const table = services()
  const serviceListeners = []
  const base = {
    label,
    effect: (fn) => { fn(); return () => {} },
    on: (name, listener) => { serviceListeners.push({ name, listener }); return () => {} },
    get: (name) => (name === 'pluginNavigation'
      ? pluginNavigationImpl
      : name === 'modelDirectories' ? modelDirectoriesImpl : table[name]),
    emitService: (name) => { for (const entry of serviceListeners) if (entry.name === 'internal/service') entry.listener(name) },
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
// The settings panel renders ui-primitives controls the shell seeds at runtime;
// the module table supplies them as inert components so the sidebar-entry render
// self-check below still exercises the hand-drawn popup it owns.
//
// Two things matter about this table:
//   * every read is recorded, so a case can prove the bundle actually reached
//     for `Tooltip` instead of hand-rolling a bubble;
//   * `Tooltip` renders its anchor child, because the real primitive clones the
//     anchor and only the region around it becomes a bubble — a stub that
//     returned null would hide every anchor from the tree under test (and would
//     not model the primitive at all).
const primitiveReads = []
/**
 * Every `Tooltip` label rendered, in order. The stub renders its anchor child
 * and records nothing else, so this is how a case can prove the entry's hover
 * text actually says what the icon means instead of only that some Tooltip
 * exists somewhere in the tree.
 */
const tooltipLabels = []
const TooltipStub = ({ children, label }) => {
  tooltipLabels.push(label)
  return children ?? null
}
const primitivesStub = new Proxy({}, {
  get: (_t, key) => {
    if (typeof key === 'symbol') return undefined
    if (key === '__esModule') return true
    primitiveReads.push(String(key))
    if (key === 'Tooltip') return TooltipStub
    return () => null
  },
})

const exported = loaded?.factory((spec) => {
  if (spec === 'react') return require('react')
  if (spec === 'react/jsx-runtime') return require('react/jsx-runtime')
  if (spec === '@deepseek-ai/dsh-client-ui-primitives') return primitivesStub
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

/**
 * The context the bundle's production wiring closed over. Keeping it lets a
 * case replay the Host's `internal/service` notification, which is how the
 * optional `pluginNavigation` change is observed by the mounted entry.
 */
let currentCtx
try {
  currentCtx = makeCtx('root', exported.inject ?? [])
  exported.apply(currentCtx)
  check('apply() survives the inject guard', true)
} catch (error) {
  check('apply() survives the inject guard', false)
  console.log(`       ${error.message}`)
}

// The configuration form lives on the Host's **Plugins** page, keyed by the
// bundle's package name; registering that key is what renders it on the bundle's
// own page. The page itself draws title/icon/crumb.
const rowConfig = registrations.find(r => r.name === BUNDLE_CONFIG_SLOT)
check('configuration page registered on the Plugins page bundle slot', rowConfig !== undefined)
check('config key is the bundle package name', rowConfig?.key === BUNDLE_CONFIG_KEY)
check('configuration page uses this plugin locale namespace', rowConfig?.locale === NS)
check('configuration page exposes a component', typeof rowConfig?.component === 'function')
check('configuration page contributed through slots.inject', injects.includes(`slot:${BUNDLE_CONFIG_SLOT}`))
check('no settings-page section is registered any more',
  registrations.every(r => r.name !== 'settings.section'))

check('locale dictionaries registered in this plugin namespace', locales.includes(NS))

// The model-card trigger left the composer row for the sidebar foot, where the
// shell stacks footer actions directly ABOVE Settings. What the sidebar reads
// from this registration is its metadata (fresh id, stable order, own label)
// plus the component; a second registration for the same entry is a duplicate.
const entry = registrations.find(r => r.name === 'sidebar.footer.action')
check('sidebar footer entry registered', entry !== undefined)
check('sidebar footer entry carries its own id', entry?.id === 'dsh-a6-sidebar-entry')
check('sidebar footer entry is the only one on this slot',
  registrations.filter(r => r.name === 'sidebar.footer.action').length === 1)
check('sidebar footer entry sorts above the optional Cordis panel', entry?.order === -1)
check('sidebar footer entry declares its label', entry?.label === 'A6api')
check('sidebar footer entry uses this plugin locale namespace', entry?.locale === NS)
check('the composer dock entry is gone for good',
  !registrations.some(r => r.name === 'conversation.composer.dock'))
check('no wiring error during apply', errors.length === 0)
for (const error of errors) console.log(`       ${error}`)

// 渲染自检:侧边栏底部的组件渲染出「A6api」入口按钮,点击后从按钮右侧展开卡片浮层。
const React = require('react')
const { act, create } = require('react-test-renderer')
globalThis.IS_REACT_ACT_ENVIRONMENT = true
check('sidebar footer entry exposes a component', typeof entry?.component === 'function')

/**
 * Collects the text inside a test-renderer node (the stub primitives render no
 * host markup of their own, so tab labels live on component nodes, not on
 * `<button>` elements).
 *
 * @param {object} node - a react-test-renderer instance.
 * @returns {string} the concatenated text of its subtree.
 */
const textOf = (node) => {
  const out = []
  const walk = (n) => {
    if (n === null || n === undefined || n === false || n === true) return
    if (typeof n === 'string' || typeof n === 'number') { out.push(String(n)); return }
    if (Array.isArray(n)) { n.forEach(walk); return }
    if (typeof n === 'object' && n.children) n.children.forEach(walk)
  }
  walk(node)
  return out.join('')
}

/**
 * Collects the text a React element would render, without mounting it. The tab
 * strip hands the stub primitives element children (the stub renders nothing
 * itself), so the labels only exist on the element tree and `textOf` cannot see
 * them.
 *
 * @param {unknown} node - a React element, an array, or a plain value.
 * @returns {string} the concatenated text of the element tree.
 */
const elementText = (node) => {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(elementText).join('')
  if (typeof node === 'object' && node.props) return elementText(node.props.children)
  return ''
}

/** Every prop name a host node in this tree carries. */
const hostPropNames = (tree) => {
  const names = new Set()
  for (const node of tree.root.findAll(() => true)) {
    for (const key of Object.keys(node.props ?? {})) names.add(key)
  }
  return names
}

/**
 * Tear a rendered tree down without tripping React 18's act warnings: timers
 * that fire after the test must not schedule state updates, so the global
 * clocks are frozen and restored around the unmount.
 *
 * @param {object} renderer - the renderer returned by `create`.
 * @returns {void}
 * @throws {Error} while the unmount runs; the caller records the failure.
 */
function unmountQuietly(renderer) {
  const realSetTimeout = globalThis.setTimeout
  const realSetInterval = globalThis.setInterval
  const realClearInterval = globalThis.clearInterval
  const live = new Set()
  globalThis.setTimeout = () => 0
  globalThis.setInterval = (fn) => { live.add(fn); return live.size }
  globalThis.clearInterval = () => {}
  try {
    act(() => renderer.unmount())
  } finally {
    globalThis.setTimeout = realSetTimeout
    globalThis.setInterval = realSetInterval
    globalThis.clearInterval = realClearInterval
    live.clear()
  }
}

/**
 * The model card's anchor geometry in the fake sidebar: a rail-sized button
 * parked at the left edge of a 1280x800 viewport, near the bottom where the
 * sidebar foot sits. The popup must open to its RIGHT and hug the button's
 * band, so every expected offset below is derived from these numbers.
 */
const buttonRect = { left: 8, top: 700, right: 44, bottom: 736, width: 36, height: 36 }
/** The popup's own measurements, taken by the component after it mounts. */
const popupRect = { left: 52, top: 300, right: 552, bottom: 728, width: 500, height: 428 }
/**
 * Pointer targets for the outside-click cases. `contains` must answer honestly
 * per node or the dismissal case is vacuous: a press INSIDE the popup is the
 * negative control that proves a press outside is what closes it.
 */
const insidePopupTarget = { nodeName: 'MARK' }
const outsideTarget = { nodeName: 'OUTSIDE' }
/** The trigger button's own node mock answers for exactly this target. */
const buttonTarget = { nodeName: 'BUTTON' }

/**
 * Render the sidebar entry with the standard props the shell composes for a
 * `root` list entry: the owner's `wide`, the locale seat's `t`, and the global
 * `useSessions` hook. The entry's own optional readers arrive through the
 * registered component itself (the production wiring), NOT through these props:
 * a stub `useSessions` returning the main-view session is what lets the same
 * render exercise the "current session" path without the real session service.
 */
function renderEntry({ wide = true } = {}) {
  return create(React.createElement(entry.component, {
    wide,
    t: (key) => key,
    useSessions: (selector) => selector({ byId: { 'session-1': { id: 'session-1', retainedBy: { mainView: 1 } } } }),
  }), {
    createNodeMock: (element) => (element.type === 'div' && element.props?.className === 'dsh-a6-sidebar-popup'
      ? { getBoundingClientRect: () => popupRect, contains: (node) => node === insidePopupTarget }
      : { getBoundingClientRect: () => buttonRect, contains: (node) => node === buttonTarget }),
  })
}

let tree
act(() => { tree = renderEntry({ wide: true }) })
const button = tree.root.findByType('button')
check('sidebar entry button carries the A6api text when the sidebar is wide',
  textOf(button) === 'A6api')
check('sidebar entry button starts collapsed', button.props['aria-expanded'] === false)
// The anchor's own hover text is drawn before the popup exists, so count reads
// from before the click: the migration guard below only reports honestly if this
// tree really reached `Tooltip` instead of just carrying the popup's markup.
const entryReadsAt = primitiveReads.length
act(() => button.props.onClick())
const popups = tree.root.findAll(node => node.props.role === 'dialog')
check('sidebar entry button opens the model card popup', popups.length === 1)
// The popup hugs the button's right edge + gap, and its bottom sits a gap above
// the button's top edge (viewport height - top + gap). maxHeight is the free
// space above the button.
check('popup opens to the right of the button', popups[0]?.props.style?.left === 44 + 8)
check('popup bottom hugs the button band', popups[0]?.props.style?.bottom === 800 - 700 + 8)
check('popup height is capped to the space above the button', popups[0]?.props.style?.maxHeight === 700 - 2 * 8)
// Width: the 500px cap wins here because 1280 - 52 - 8 leaves plenty of room.
// The viewport-respecting branch is exercised by the narrow-window case below,
// so this pair together pins the whole formula rather than just its literal.
check('popup width takes the 500px cap when the viewport allows',
  popups[0]?.props.style?.width === 500)
check(
  'the sidebar entry draws its hover text through the ui-primitives Tooltip',
  primitiveReads.slice(entryReadsAt).includes('Tooltip'),
)
// The hover text must say what the entry IS (its own copy), not be an empty or
// borrowed bubble: with no session on an A6api model yet, the anchor explains
// that state — the identity copy arrives with the A6api case further down.
check('the entry anchor carries this plugin’s own hover copy',
  tooltipLabels.includes('sidebarTipNoModel'))

// Dismissal: Escape and an outside pointer press both close the popup. These
// are the document listeners the component installs while open, so firing them
// is the same path the browser takes.
const popupOpen = () => tree.root.findAll(node => node.props.role === 'dialog').length === 1
check('popup is open before the dismissal cases', popupOpen())
const escape = documentListeners.filter(entry => entry.type === 'keydown')
check('the open popup installs its dismissal listeners', escape.length >= 1)
act(() => { for (const entry of escape) entry.listener({ key: 'Escape' }) })
check('Escape closes the popup', !popupOpen())

act(() => button.props.onClick())
check('popup reopens after Escape', popupOpen())
const outsidePress = documentListeners.filter(entry => entry.type === 'pointerdown')
check('the open popup installs its pointer dismissal listener', outsidePress.length >= 1)
// Negative control first: a press inside the popup (and one on the trigger) must
// NOT close it — without this, a handler that closes on every pointer event
// would still pass the outside case below.
act(() => { for (const entry of outsidePress) entry.listener({ target: insidePopupTarget }) })
check('a pointer press inside the popup leaves it open', popupOpen())
act(() => { for (const entry of outsidePress) entry.listener({ target: buttonTarget }) })
check('a pointer press on the trigger leaves the popup open (the click toggles it)', popupOpen())
act(() => { for (const entry of outsidePress) entry.listener({ target: outsideTarget }) })
check('an outside pointer press closes the popup', !popupOpen())

// A window too narrow for a 500px card must not grow it past the viewport: the
// popup takes the remaining space to the right of the button instead.
const realInnerWidth = globalThis.window.innerWidth
globalThis.window.innerWidth = 320
let narrowTree
act(() => { narrowTree = renderEntry({ wide: true }) })
act(() => { narrowTree.root.findByType('button').props.onClick() })
const narrowPopup = narrowTree.root.findAll(node => node.props.role === 'dialog')[0]
check('popup width shrinks to the space right of the button in a narrow window',
  narrowPopup?.props.style?.width === 320 - (44 + 8) - 8)
check('popup keeps its left edge anchored to the button in a narrow window',
  narrowPopup?.props.style?.left === 44 + 8)
act(() => { narrowTree.unmount() })
globalThis.window.innerWidth = realInnerWidth

act(() => tree.unmount())

// Narrow (rail) form: the icon alone, no visible label text.
let railTree
act(() => { railTree = renderEntry({ wide: false }) })
const railButton = railTree.root.findByType('button')
check('sidebar entry drops its text label when the sidebar is a rail',
  textOf(railButton) === '')
check('sidebar entry keeps an accessible name for the rail icon',
  railButton.props['aria-label'] === 'A6api')
act(() => railTree.unmount())

// The 「配置」 pill reaches the plugin's own configuration page through the
// host's pluginNavigation service. It is an OPTIONAL dependency: when the
// service is absent the pill hides and the entry itself still renders, because
// a missing pill must never take the whole plugin off the page. The service is
// provided by the plugin-manager page and retracted when that page unmounts, so
// the cases below also cover the retraction path, not just the load-time probe.
const openBundleCalls = []
pluginNavigationImpl = { openBundle: (name) => { openBundleCalls.push(name) } }
let configTree
const configRenderFailedWith = (() => {
  try {
    act(() => { configTree = renderEntry() })
    act(() => { configTree.root.findByType('button').props.onClick() })
    return undefined
  } catch (error) {
    return error
  }
})()
check('the sidebar entry renders when pluginNavigation is available', configRenderFailedWith === undefined)
if (configRenderFailedWith) console.log(`       ${configRenderFailedWith.message}`)
if (configTree) {
  const configPill = configTree.root.findAll(node => node.props?.className === 'dsh-a6-config-pill')
  check('the card renders a 「配置」 pill when pluginNavigation is available', configPill.length === 1)
  const pillClickFailedWith = (() => {
    try { act(() => { configPill[0]?.props.onClick() }); return undefined } catch (error) { return error }
  })()
  check('the 「配置」 pill opens this bundle through pluginNavigation',
    pillClickFailedWith === undefined
    && openBundleCalls.length === 1 && openBundleCalls[0] === '@lynn123411/dsh-a6api')
  if (pillClickFailedWith) console.log(`       ${pillClickFailedWith.message}`)

  // Retraction: the Host page unmounted and withdrew the service. A live pill
  // for a page that is gone would be a dead control, so it must disappear —
  // without taking the entry down with it.
  pluginNavigationImpl = undefined
  const retractedWith = (() => {
    try {
      act(() => { currentCtx?.emitService('pluginNavigation') })
      return undefined
    } catch (error) {
      return error
    }
  })()
  check('withdrawing pluginNavigation does not throw', retractedWith === undefined)
  if (retractedWith) console.log(`       ${retractedWith.message}`)
  check('the 「配置」 pill hides once pluginNavigation is withdrawn',
    configTree.root.findAll(node => node.props?.className === 'dsh-a6-config-pill').length === 0)
  check('the entry itself survives the withdrawal',
    configTree.root.findAll(node => node.type === 'button').length >= 1)
  act(() => { configTree.unmount() })
}

// Absent from the start: a deployment without the plugin-manager page still
// gets the model card, just without the config pill.
let noNavTree
let noNavFailedWith
try {
  act(() => { noNavTree = renderEntry() })
  act(() => { noNavTree.root.findByType('button').props.onClick() })
} catch (error) {
  noNavFailedWith = error
}
check('the sidebar entry survives a deployment without pluginNavigation',
  noNavFailedWith === undefined)
check('the 「配置」 pill hides when pluginNavigation is unavailable',
  noNavFailedWith === undefined
  && noNavTree.root.findAll(node => node.props?.className === 'dsh-a6-config-pill').length === 0)
if (noNavFailedWith) console.log(`       ${noNavFailedWith.message}`)
if (noNavTree) act(() => { noNavTree.unmount() })

// Late arrival: the plugin-manager page usually mounts AFTER this bundle, so
// the pill must appear when the service lands — a load-time-only probe would
// leave the pill permanently missing on the common path (and the retraction
// case above already covers the mirror-image withdrawal).
{
  pluginNavigationImpl = undefined
  const lateCalls = []
  let lateTree
  const lateFailedWith = (() => {
    try {
      act(() => { lateTree = renderEntry() })
      act(() => { lateTree.root.findByType('button').props.onClick() })
      return undefined
    } catch (error) {
      return error
    }
  })()
  check('the entry renders before pluginNavigation arrives', lateFailedWith === undefined)
  check('no 「配置」 pill before pluginNavigation arrives',
    lateFailedWith === undefined
    && lateTree.root.findAll(node => node.props?.className === 'dsh-a6-config-pill').length === 0)
  if (lateFailedWith) console.log(`       ${lateFailedWith.message}`)
  if (lateTree) {
    // The Host provides the service, then notifies every dependent fiber.
    pluginNavigationImpl = { openBundle: (name) => { lateCalls.push(name) } }
    const arrivalFailedWith = (() => {
      try { act(() => { currentCtx?.emitService('pluginNavigation') }); return undefined } catch (error) { return error }
    })()
    check('the pluginNavigation arrival notification does not throw', arrivalFailedWith === undefined)
    if (arrivalFailedWith) console.log(`       ${arrivalFailedWith.message}`)
    const latePill = lateTree.root.findAll(node => node.props?.className === 'dsh-a6-config-pill')
    check('the 「配置」 pill appears once pluginNavigation arrives', latePill.length === 1)
    act(() => { latePill[0]?.props.onClick() })
    check('the late-arriving 「配置」 pill still opens this bundle',
      lateCalls.length === 1 && lateCalls[0] === '@lynn123411/dsh-a6api')
    act(() => { lateTree.unmount() })
  }
  pluginNavigationImpl = undefined
}

/**
 * A fake `ModelDirectory` with a live store, mirroring the real one's contract:
 * `store.getSnapshot()` carries the session's current selection and
 * `store.subscribe()` fires on every switch. Returning it per session is what
 * lets the cases below drive the card through a model switch.
 *
 * @param {{provider?: string, model?: string}|null} initial - starting selection.
 * @returns {{directory: object, set: (next: object|null) => void, asked: string[]}} the fake.
 */
function fakeDirectory(initial) {
  let snapshot = { current: initial, groups: [], failures: [] }
  const listeners = new Set()
  const asked = []
  return {
    asked,
    directory: {
      store: {
        getSnapshot: () => snapshot,
        subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener) } },
      },
    },
    set: (next) => {
      snapshot = { current: next, groups: [], failures: [] }
      for (const listener of listeners) listener()
    },
  }
}

// The card's two halves are observable from the outside: the account-overview
// pill row is present in every state, and the model area dims exactly when the
// current session is not on an A6api model. `useSessions` is the only source of
// the session identity here, so seeing the fake directory asked for its id is
// also what proves the root entry resolved the current session correctly.
{
  const fake = fakeDirectory({ provider: 'a6api', model: 'a6api/gpt-4o' })
  modelDirectoriesImpl = { directoryFor: (sessionId) => { fake.asked.push(sessionId); return fake.directory } }
  let cardTree
  act(() => { cardTree = renderEntry() })
  act(() => { cardTree.root.findByType('button').props.onClick() })
  check('the entry resolves the model directory for the main-view session',
    fake.asked.length >= 1 && fake.asked.every(id => id === 'session-1'))
  // With an A6api model in use, the anchor's hover text is the identity copy —
  // the same sentence the user reads to confirm what the icon is.
  check('the entry anchor names itself when an A6api model is in use',
    tooltipLabels.includes('sidebarTip'))
  check('the popup keeps the account-overview pill row',
    cardTree.root.findAll(node => node.props?.className === 'dsh-a6-sidebar-pills').length === 1)
  check('an A6api session shows the model area undimmed',
    cardTree.root.findAll(node => node.props?.className === 'dsh-a6-sidebar-card-dimmed').length === 0)

  // Switching the session's model must follow live, without remounting.
  fake.set({ provider: 'deepseek-account', model: 'deepseek-account/deepseek-chat' })
  check('switching to a non-A6api model dims the model area live',
    cardTree.root.findAll(node => node.props?.className === 'dsh-a6-sidebar-card-dimmed').length === 1)
  check('the account-overview pill row survives the dimming',
    cardTree.root.findAll(node => node.props?.className === 'dsh-a6-sidebar-pills').length === 1)
  fake.set({ provider: 'a6api', model: 'a6api/claude-sonnet' })
  check('switching back to an A6api model un-dims the model area live',
    cardTree.root.findAll(node => node.props?.className === 'dsh-a6-sidebar-card-dimmed').length === 0)
  act(() => { cardTree.unmount() })
  modelDirectoriesImpl = undefined
}

// Re-mounting the entry (the page refresh / hot-reload path) must not leave work
// behind: the only timers this half arms are the 500ms service retry and the
// warm-up timer, and both must be cancelled on unmount. A leaked retry would
// re-register work on every HMR pass, which is exactly the "duplicate entry"
// class of bug the registration case above guards on the other end.
{
  const realSetTimeout = globalThis.setTimeout
  const realClearTimeout = globalThis.clearTimeout
  const armed = new Map()
  let nextTimerId = 1
  globalThis.setTimeout = () => {
    const id = nextTimerId++
    armed.set(id, true)
    return id
  }
  globalThis.clearTimeout = (id) => { armed.delete(id) }
  try {
    // No modelDirectories yet: the entry arms its 500ms retry, then unmounts
    // before the service arrives — the classic leak this case pins.
    modelDirectoriesImpl = undefined
    let retryTree
    act(() => { retryTree = renderEntry() })
    act(() => { retryTree.root.findByType('button').props.onClick() })
    check('a late modelDirectories service arms a retry timer', armed.size >= 1)
    act(() => { retryTree.unmount() })
    check('unmounting the entry cancels its pending service-retry timer', armed.size === 0)
  } finally {
    globalThis.setTimeout = realSetTimeout
    globalThis.clearTimeout = realClearTimeout
  }
}

// 插件页 bundle 配置的渲染自检：注册在 `plugins.bundle.config` 上的卡片组件必须能 headless
// 渲染，「基础配置」页渲染出三个输入框（API Key / 系统访问令牌 / 账号 ID）与保存
// 按钮。这份断言的存在理由：渲染期抛错（例如 Tooltip 包了条件渲染的 null）在浏览器
// 里表现为整张卡片空白，只有真跑一次才拦得住。
const settingsComponent = rowConfig?.component
check('settings panel exposes a component', typeof settingsComponent === 'function')

const panelReadsAt = primitiveReads.length
let panelTree
let panelRenderFailed
try {
  act(() => {
    panelTree = create(React.createElement(settingsComponent, { view: 'page', t: (key) => key }))
  })
} catch (error) {
  panelRenderFailed = error
}
check('settings panel renders the models tab without throwing', panelRenderFailed === undefined)
if (panelRenderFailed) console.log(`       ${panelRenderFailed.message}`)

if (panelTree) {
  const panelText = textOf(panelTree.toJSON())
  // 卡片不再重画页面标题（宿主插件页负责）——只保留副标题与右侧三枚胶囊。
  // 断言一：副标题在。断言二：整棵渲染树里没有任何 h1/h2/h3 标题节点——
  // 「卡片自己又画一遍标题」正是这条要拦的回归，而按文案 key 比对会漏掉
  // 用别的 key 画的标题。宿主页面负责画标题这件事因此才由本自检守住。
  const panel = panelTree.toJSON()
  const headingNodes = []
  const collectHeadings = (n) => {
    if (n === null || n === undefined || typeof n !== 'object') return
    if (Array.isArray(n)) { n.forEach(collectHeadings); return }
    if (typeof n.type === 'string' && /^h[1-6]$/.test(n.type)) headingNodes.push(n.type)
    if (n.children) n.children.forEach(collectHeadings)
  }
  collectHeadings(panel)
  // 反例先跑：把一个人造标题喂给同一个采集器，断言它抓得到。没有这条，
  // 采集器写坏（例如只认 children 里的字符串）时上面那条断言会永远为真。
  const probe = { type: 'div', children: [{ type: 'h2', children: ['x'] }] }
  const probeHits = []
  const collectProbe = (n) => {
    if (n === null || n === undefined || typeof n !== 'object') return
    if (Array.isArray(n)) { n.forEach(collectProbe); return }
    if (typeof n.type === 'string' && /^h[1-6]$/.test(n.type)) probeHits.push(n.type)
    if (n.children) n.children.forEach(collectProbe)
  }
  collectProbe(probe)
  check('the heading collector really detects a heading (negative control)',
    probeHits.length === 1)
  check('settings panel renders its subtitle copy', panelText.includes('subtitle'))
  check('settings panel draws no heading of its own (the page owns the title)',
    headingNodes.length === 0)

  // The inner tab strip: the stub primitives do not render their children, so the
  // labels are read off the elements the panel handed them.
  const tabStrip = panelTree.root.findAll(node => node.props?.className === 'dsh-a6-nav-tabs')[0]
  const tabPills = tabStrip === undefined
    ? []
    : tabStrip.findAll(node => typeof node.type === 'function' && node.props?.onClick !== undefined)
  const tabLabels = tabPills.map(pill => elementText(pill.props.children))
  check(
    'settings panel renders one tab per inner page',
    tabLabels.length === 4 && ['tabModels', 'tabCatalog', 'tabAccount', 'tabConfig'].every(label => tabLabels.some(text => text.includes(label))),
  )

  const configTab = tabPills[tabLabels.findIndex(text => text.includes('tabConfig'))]
  check('「基础配置」 tab is reachable', configTab !== undefined)

  const configTabFailedWith = (() => {
    try {
      act(() => configTab?.props.onClick())
      return undefined
    } catch (error) {
      return error
    }
  })()
  check('switching to the config tab does not throw', configTabFailedWith === undefined)
  if (configTabFailedWith) console.log(`       ${configTabFailedWith.message}`)

  // The stub primitives render nothing of their own, so the config page shows up
  // as the three controls' props rather than as host <input> elements. Asserting
  // on the props keeps the case honest: the count is what ConfigPanel composes,
  // and the primary action inside the save bar is the one it draws.
  const configPage = panelTree.root.findAll(
    (node) => node.props?.className === 'dsh-a6-config-page',
  )[0]
  check('config tab mounts the ConfigPanel page', configPage !== undefined)
  const configInputs = configPage === undefined ? [] : configPage.findAll(
    (node) => node.props?.placeholder !== undefined && node.props?.value !== undefined && node.props?.onChange !== undefined,
  )
  check('config page renders the three credential fields', configInputs.length === 3)
  check(
    'config page keeps the secret fields masked and the account id plain',
    configInputs.map(node => node.props.type).join(',') === 'password,password,text',
  )
  const saveBar = configPage === undefined ? undefined : configPage.findAll(
    (node) => node.props?.className === 'dsh-a6-save-bar',
  )[0]
  const saveButton = saveBar === undefined ? undefined : saveBar.findAll(
    (node) => typeof node.type === 'function' && node.props?.variant === 'primary' && elementText(node.props.children) === 'save',
  )[0]
  check('config page renders its save button', saveButton !== undefined)

  // The gateway-node section is gone for good: the config page owns no node
  // control, and none of its copy survives in the rendered output. The address
  // is plugin-owned from here on, so a re-appearing control is a regression.
  // Text must come from the config page subtree: `t` is an identity stub, so a
  // surviving node string would show up verbatim as its locale key.
  const configPageText = configPage === undefined ? '' : textOf(configPage)
  const nodeControls = configPage === undefined ? [] : configPage.findAll(
    (node) => node.props?.id === 'dsh-a6-node' ||
      node.props?.className === 'dsh-a6-node-url' ||
      node.props?.className === 'dsh-a6-node-custom',
  )
  check('config page renders no gateway-node control', nodeControls.length === 0)
  check(
    'config page renders no gateway-node copy',
    !['nodeTitle', 'nodeDesc', 'nodeCdn', 'nodeDirect', 'nodeCustom', 'customNodePlaceholder']
      .some(key => configPageText.includes(key)),
  )

  // Migration guard: the custom `[data-tooltip]` attribute must be gone from the
  // rendered tree, and the bundle must have asked ui-primitives for `Tooltip`.
  const allProps = hostPropNames(panelTree)
  const tooltipProps = [...allProps].filter(name => name.startsWith('data-tooltip'))
  check('no data-tooltip prop survives in the rendered web half', tooltipProps.length === 0)
  if (tooltipProps.length > 0) console.log(`       found: ${tooltipProps.join(', ')}`)
  check(
    'the settings panel draws its hover text through the ui-primitives Tooltip',
    primitiveReads.slice(panelReadsAt).includes('Tooltip'),
  )

  try {
    unmountQuietly(panelTree)
    check('settings panel unmounts cleanly', true)
  } catch (error) {
    check('settings panel unmounts cleanly', false)
    console.log(`       ${error.message}`)
  }
}

// The sidebar entry is the second reader of `Tooltip`: its «A6api» anchor and
// the account pills inside the popup all carry hover text. The loop in front of
// it already read the module table; proving the whole half is free of the
// retired attribute needs the popup rendered.
const entryTreeReadsAt = primitiveReads.length
let entryTree
const entryTreeFailedWith = (() => {
  try {
    act(() => { entryTree = renderEntry({ wide: true }) })
    act(() => { entryTree.root.findByType('button').props.onClick() })
    return undefined
  } catch (error) {
    return error
  }
})()
check('sidebar entry renders with its hover anchors and popup', entryTreeFailedWith === undefined)
if (entryTreeFailedWith) console.log(`       ${entryTreeFailedWith.message}`)
if (entryTree) {
  const entryProps = hostPropNames(entryTree)
  const entryTooltipProps = [...entryProps].filter(name => name.startsWith('data-tooltip'))
  check('no data-tooltip prop survives in the sidebar entry', entryTooltipProps.length === 0)
  check(
    'the sidebar entry draws its hover text through the ui-primitives Tooltip',
    primitiveReads.slice(entryTreeReadsAt).includes('Tooltip'),
  )
  try {
    unmountQuietly(entryTree)
    check('sidebar entry test tree unmounts cleanly', true)
  } catch (error) {
    check('sidebar entry test tree unmounts cleanly', false)
    console.log(`       ${error.message}`)
  }
}

// The retired tooltip system must stay retired: no global mouseover portal is
// installed by `apply()`, and the bundle no longer reads the attribute anywhere.
const clientSource = (await import('node:fs')).readFileSync(join(root, 'src/client/index.ts'), 'utf8')
check('the hand-rolled global tooltip portal is gone', !clientSource.includes('setupGlobalTooltip'))
check('the bundle never reads data-tooltip', !source.includes('data-tooltip'))

// Independence case: this plugin always registers its own bundle configuration —
// it is not a participant in any shared page and contends with nobody. Re-applying
// (a re-declaration of the slot, the way the loader replays a bundle) must still
// produce exactly this plugin's own config key, and nothing on the Settings page.
registrations.length = 0
errors.length = 0
try {
  exported.apply(makeCtx('second', exported.inject ?? []))
} catch (error) {
  check('apply() survives the inject guard (re-registration)', false)
  console.log(`       ${error.message}`)
}
const rowConfigs = registrations.filter(r => r.name === BUNDLE_CONFIG_SLOT)
check('the bundle config registers on every apply, independent of other plugins',
  rowConfigs.length === 1 && rowConfigs[0]?.key === BUNDLE_CONFIG_KEY)
check('the sidebar footer entry registers independently of the bundle config',
  registrations.some(r => r.name === 'sidebar.footer.action'))
check('re-applying registers the sidebar entry exactly once',
  registrations.filter(r => r.name === 'sidebar.footer.action').length === 1)
check('no settings-page section is registered on the independent path',
  registrations.every(r => r.name !== 'settings.section'))
check('independent path stays error-free', errors.length === 0)

console.log(failures.length === 0 ? '\nsmoke: PASS' : `\nsmoke: FAIL (${failures.length})`)
process.exit(failures.length === 0 ? 0 : 1)
