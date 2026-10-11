/**
 * Headless wiring check for the plugin's browser half.
 *
 * Loads the built `lib/client.js` the same way the Web shell does (through a
 * `window.__ModuleLoader__.load` stub), gives it fake cordis services, and
 * asserts every registration this plugin's **Plugins** page form and the
 * composer dock entry depend on, plus one render of each. Run with:
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

  // The model-protocol section: one choice for the whole route, three options,
  // OpenAI Chat first (the default that keeps existing setups unchanged). The
  // stub primitives render nothing of their own, so the segments are read off
  // the props the page handed SegmentedControl.
  const protocolControl = configPage === undefined ? undefined : configPage.findAll(
    (node) => node.props?.id === 'dsh-a6-protocol',
  )[0]
  check('config page renders the model-protocol choice', protocolControl !== undefined)
  const protocolValues = (protocolControl?.props.options ?? []).map(option => option.value)
  check(
    'config page offers exactly the three host protocols',
    protocolValues.join(',') === 'openai-completions,openai-responses,anthropic-messages',
  )
  check(
    'config page defaults the protocol choice to OpenAI Chat',
    protocolControl?.props.value === 'openai-completions',
  )
  // Position is asserted by tree order, not by text: the credentials fields sit
  // above the protocol choice, which sits above the integration overview. The
  // integration title is an h3, so it is a host node even with stub primitives;
  // `t` is an identity stub, so its text is the locale key.
  const orderedNodes = configPage === undefined ? [] : configPage.findAll(() => true)
  const indexOfFirst = (predicate) => orderedNodes.findIndex(predicate)
  const credentialIndex = indexOfFirst(
    (node) => node.props?.type === 'password',
  )
  const protocolIndex = indexOfFirst((node) => node.props?.id === 'dsh-a6-protocol')
  const integrationIndex = indexOfFirst(
    (node) => elementText(node.props?.children) === 'integrationTitle',
  )
  check(
    'the protocol section sits after the credentials and before the integration overview',
    credentialIndex >= 0 && protocolIndex > credentialIndex && integrationIndex > protocolIndex,
  )

  // The integration overview describes the route the plugin actually writes, so
  // its provider-value row must name the selected protocol instead of a fixed
  // "OpenAI-compatible" claim that a Messages route would contradict.
  check(
    'the integration overview names the protocol actually in use',
    elementText(configPage.findAll(
      (node) => node.props?.className === 'dsh-a6-field-value',
    )[0]?.props?.children).includes('protocolChat'),
  )

  // Switching must say which protocol is now in effect, and the switch must be
  // the one-way channel it claims to be: no hidden second state.
  check(
    'the protocol section states which protocol is in effect',
    configPageText.includes('protocolCurrent'),
  )
  act(() => protocolControl?.props.onChange('anthropic-messages'))
  const switchedPage = panelTree.root.findAll(
    (node) => node.props?.className === 'dsh-a6-config-page',
  )[0]
  const switchedControl = switchedPage?.findAll(
    (node) => node.props?.id === 'dsh-a6-protocol',
  )[0]
  const switchedText = switchedPage === undefined ? '' : textOf(switchedPage)
  check('switching selects the clicked protocol', switchedControl?.props.value === 'anthropic-messages')
  check(
    'switching replaces the description with the new protocol’s',
    switchedText.includes('protocolMessagesHint') && !switchedText.includes('protocolChatHint'),
  )
  check('the in-effect line follows the switch', switchedText.includes('protocolCurrent'))
  check(
    'the integration overview follows the switch',
    elementText(switchedPage?.findAll(
      (node) => node.props?.className === 'dsh-a6-field-value',
    )[0]?.props?.children).includes('protocolMessages'),
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
check('the composer dock registers independently of the bundle config',
  registrations.some(r => r.name === 'conversation.composer.dock'))
check('no settings-page section is registered on the independent path',
  registrations.every(r => r.name !== 'settings.section'))
check('independent path stays error-free', errors.length === 0)

console.log(failures.length === 0 ? '\nsmoke: PASS' : `\nsmoke: FAIL (${failures.length})`)
process.exit(failures.length === 0 ? 0 : 1)
