/**
 * Headless wiring check for the plugin's browser half.
 *
 * Loads the built `lib/client.js` the same way the Web shell does (through a
 * `window.__ModuleLoader__.load` stub), gives it fake cordis services, and
 * asserts every registration the 「API中转」 page and the composer dock entry
 * depend on, plus one render of that entry. Run with: node scripts/smoke-client.mjs
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
// The settings panel renders ui-primitives controls the shell seeds at runtime;
// the module table supplies them as inert components so the composer-dock render
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
const TooltipStub = ({ children }) => children ?? null
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

const dock = registrations.find(r => r.name === 'conversation.composer.dock')
check('composer dock entry registered', dock !== undefined)
check('composer dock entry keeps its own id', dock?.id === 'dsh-a6api-current-model')
check('composer dock entry sits left of the official stats pills', dock?.order === -1)
check('the sidebar footer entry is gone', !registrations.some(r => r.name === 'sidebar.footer.action'))
check('no wiring error during apply', errors.length === 0)
for (const error of errors) console.log(`       ${error}`)

// 渲染自检:输入框下方那一行的组件渲染出「A6api」按钮,点击后贴按钮上沿展开浮层。
const React = require('react')
const { act, create } = require('react-test-renderer')
globalThis.IS_REACT_ACT_ENVIRONMENT = true
check('composer dock entry exposes a component', typeof dock?.component === 'function')

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

const buttonRect = { left: 600, top: 772, right: 660, bottom: 794, width: 60, height: 22 }
let tree
act(() => {
  tree = create(React.createElement(dock.component, { sessionId: 'session-1' }), {
    createNodeMock: () => ({ getBoundingClientRect: () => buttonRect, contains: () => false }),
  })
})
const button = tree.root.findByType('button')
check('dock button carries the A6api text', button.children.join('') === 'A6api')
check('dock button starts collapsed', button.props['aria-expanded'] === false)
// The anchor's own hover text is drawn before the popup exists, so count reads
// from before the click: the migration guard below only reports honestly if this
// tree really reached `Tooltip` instead of just carrying the popup's markup.
const dockReadsAt = primitiveReads.length
act(() => button.props.onClick())
const popups = tree.root.findAll(node => node.props.role === 'dialog')
check('dock button opens the model card popup', popups.length === 1)
check('popup height is capped to the space above the button', popups[0]?.props.style?.maxHeight === 772 - 2 * 8)
check(
  'the composer dock draws its hover text through the ui-primitives Tooltip',
  primitiveReads.slice(dockReadsAt).includes('Tooltip'),
)
unmountQuietly(tree)

// 设置页渲染自检：共享页上注册的卡片组件必须能 headless 渲染，「基础配置」页
// 渲染出三个输入框（API Key / 系统访问令牌 / 账号 ID）与保存按钮。T1 之前这份
// 断言不存在，面板只有 typecheck 级别的保护——渲染期抛错（例如 Tooltip 包了
// 条件渲染的 null）在浏览器里表现为整张卡片空白，只有真跑一次才拦得住。
const settingsComponent = card?.component
check('settings panel exposes a component', typeof settingsComponent === 'function')

const panelReadsAt = primitiveReads.length
let panelTree
let panelRenderFailed
try {
  act(() => {
    panelTree = create(React.createElement(settingsComponent, { t: (key) => key }))
  })
} catch (error) {
  panelRenderFailed = error
}
check('settings panel renders the models tab without throwing', panelRenderFailed === undefined)
if (panelRenderFailed) console.log(`       ${panelRenderFailed.message}`)

if (panelTree) {
  const panelText = textOf(panelTree.toJSON())
  check('settings panel renders its heading copy', panelText.includes('heading') && panelText.includes('subtitle'))

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

// The dock half is the second reader of `Tooltip`: its «A6api» anchor and the
// account pills inside the popup all carry hover text. The loop in front of it
// already read the module table; proving the whole half is free of the retired
// attribute needs the popup rendered.
const dockTreeReadsAt = primitiveReads.length
let dockTree
const dockTreeFailedWith = (() => {
  try {
    act(() => {
      dockTree = create(React.createElement(dock.component, { sessionId: 'session-2' }), {
        createNodeMock: () => ({ getBoundingClientRect: () => buttonRect, contains: () => false }),
      })
    })
    return undefined
  } catch (error) {
    return error
  }
})()
check('composer dock entry renders with its hover anchors', dockTreeFailedWith === undefined)
if (dockTreeFailedWith) console.log(`       ${dockTreeFailedWith.message}`)
if (dockTree) {
  const dockProps = hostPropNames(dockTree)
  const dockTooltipProps = [...dockProps].filter(name => name.startsWith('data-tooltip'))
  check('no data-tooltip prop survives in the composer dock', dockTooltipProps.length === 0)
  check(
    'the composer dock draws its hover text through the ui-primitives Tooltip',
    primitiveReads.slice(dockTreeReadsAt).includes('Tooltip'),
  )
  try {
    unmountQuietly(dockTree)
    check('composer dock test tree unmounts cleanly', true)
  } catch (error) {
    check('composer dock test tree unmounts cleanly', false)
    console.log(`       ${error.message}`)
  }
}

// The retired tooltip system must stay retired: no global mouseover portal is
// installed by `apply()`, and the bundle no longer reads the attribute anywhere.
const clientSource = (await import('node:fs')).readFileSync(join(root, 'src/client/index.ts'), 'utf8')
check('the hand-rolled global tooltip portal is gone', !clientSource.includes('setupGlobalTooltip'))
check('the bundle never reads data-tooltip', !source.includes('data-tooltip'))

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
