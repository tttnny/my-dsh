/**
 * Headless wiring check for the plugin's browser half.
 *
 * Loads the built `lib/client.js` the way the Web shell does (through a
 * `window.__ModuleLoader__.load` stub), gives it fake cordis services behind a
 * *guarded* context (reading an undeclared service throws exactly like the
 * kernel proxy), then drives the sidebar component with a mini hook runtime to
 * assert the directory-picking behaviour this plugin owns:
 *
 *   - browse hosts (LAN / remote bind): `uiWorkspace.pickDirectory()` is refused
 *     by the Host (`directory-picker/unavailable`) — the plugin must open its own
 *     browser dialog built on the official browse primitives, NOT raise the
 *     "添加工作区失败" alert;
 *   - native hosts (loopback bind): the OS chooser path is used as-is;
 *   - macOS hosts (`/picker/native` reports support): the 「添加工作区」
 *     buttons short-circuit straight to the host-side Finder chooser;
 *   - the global entry and each workspace row's own entry share one flow, the
 *     row entry seeding the dialog at that workspace directory;
 *   - unattributed sessions render under 「未分组」 instead of being adopted.
 *
 * Run with: node scripts/smoke-client.mjs [plugin-dir]
 */

import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { readFileSync } from 'node:fs'

const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'))

const failures = []
const check = (label, ok) => {
  if (ok) console.log(`  ok   ${label}`)
  else { console.log(`  FAIL ${label}`); failures.push(label) }
}

// ────────────────────────────── environment stubs ──────────────────────────────

const storage = new Map()
globalThis.localStorage = {
  getItem: (key) => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => { storage.set(key, String(value)) },
  removeItem: (key) => { storage.delete(key) },
}

const listeners = { added: 0, removed: 0 }
/** Callable auto-stub: any property read is itself, any call returns itself. */
const autoStub = new Proxy(function stub() {}, {
  get: (target, prop) => {
    if (prop === 'then' || prop === Symbol.toPrimitive) return undefined
    if (prop === 'toString') return () => ''
    return autoStub
  },
  apply: () => autoStub,
  set: () => true,
})
globalThis.document = {
  body: autoStub,
  head: autoStub,
  createElement: () => autoStub,
  addEventListener: () => { listeners.added += 1 },
  removeEventListener: () => { listeners.removed += 1 },
  querySelector: () => null,
}
globalThis.window = {
  addEventListener: () => { listeners.added += 1 },
  removeEventListener: () => { listeners.removed += 1 },
}

/**
 * Host-route stub for the plugin's own `/api/plugins/dsh-workspace-tree/...` endpoints.
 * `guardAnswer` decides what `/archive/guardCheck` reports; a function receives the call log.
 */
let guardAnswer = { ok: true, status: 'idle', running: false }
let guardFailure = null
let guardCalls = []
/** Physical-existence probe knobs: ids the host still finds on disk, or a thrown failure. */
let tombstoneAlive = []
let tombstoneFailure = null
let tombstoneCalls = []
/** Archive action calls (`/archive/unarchiveAll` / `/archive/deleteAll`) — archive-view regression. */
let archiveCalls = []
/** Native (macOS Finder) picker knobs: support probe answer and the POST result.
 *  Default false = a host that cannot serve the Finder chooser; the macOS scenarios
 *  opt in explicitly (see the merged 「添加工作区」 cases at the end). */
let nativeSupported = false
let nativePickResult = { ok: true, path: null }
let nativeProbeFailure = null
let nativePickCalls = 0
/** POST /picker/native 的请求体（断言行内入口把 startPath 传下去）。 */
let nativePickBodies = []
globalThis.fetch = async (url, init) => {
  const path = String(url)
  if (path.endsWith('/archive/guardCheck')) {
    guardCalls.push(JSON.parse(init?.body ?? '{}'))
    if (guardFailure !== null) throw new Error(guardFailure)
    const body = typeof guardAnswer === 'function' ? guardAnswer(guardCalls) : guardAnswer
    return { json: async () => body }
  }
  if (path.endsWith('/archive/tombstoneCheck')) {
    tombstoneCalls.push(JSON.parse(init?.body ?? '{}'))
    if (tombstoneFailure !== null) throw new Error(tombstoneFailure)
    const body = typeof tombstoneAlive === 'function' ? tombstoneAlive(tombstoneCalls) : { ok: true, alive: tombstoneAlive }
    return { json: async () => body }
  }
  if (path.endsWith('/archive/pruneStale')) {
    return { json: async () => ({ ok: true, pruned: [] }) }
  }
  if (path.endsWith('/archive/unarchiveAll') || path.endsWith('/archive/deleteAll')) {
    archiveCalls.push({ path, body: JSON.parse(init?.body ?? '{}') })
    return { json: async () => ({ ok: true, restored: [], deleted: [], failed: [] }) }
  }
  if (path.endsWith('/picker/native')) {
    if (init?.method === 'GET') {
      if (nativeProbeFailure !== null) throw new Error(nativeProbeFailure)
      return { json: async () => (nativeSupported ? { ok: true, platform: 'darwin', supported: true } : { ok: true, platform: 'linux', supported: false }) }
    }
    nativePickCalls += 1
    nativePickBodies.push(JSON.parse(init?.body ?? '{}'))
    return { json: async () => nativePickResult }
  }
  throw new Error(`unexpected fetch: ${path}`)
}

// ─────────────────────────── mini React (hooks runtime) ───────────────────────────

/**
 * Just enough React to run the sidebar body for real: one hook slot array per
 * component function (so parent and child components cannot interleave cursors),
 * effects flushed in mount order, and `expand()` inlining function components so
 * the returned tree can be searched as plain data.
 */
const instances = new Map()
const sameDeps = (left, right) => Array.isArray(left) && Array.isArray(right)
  && left.length === right.length && left.every((value, i) => Object.is(value, right[i]))

let currentInstance = null
let scheduledEffects = []
let dirty = false

const instanceOf = (type) => {
  let instance = instances.get(type)
  if (instance === undefined) {
    instance = { slots: [], cursor: 0 }
    instances.set(type, instance)
  }
  return instance
}

const slotAt = () => {
  const instance = currentInstance
  return { instance, index: instance.cursor++ }
}

const React = {
  /** Class-component base: the bundle's ErrorBoundary extends it. */
  Component: class Component {
    constructor(props) { this.props = props ?? {} }
    setState(next) { this.state = { ...(this.state ?? {}), ...(typeof next === 'function' ? next(this.state) : next) } }
    render() { return null }
  },
  createElement(type, props, ...children) {
    const flat = children.length <= 1 ? children[0] : children
    return { type, props: { ...(props ?? {}), ...(children.length > 0 ? { children: flat } : {}) } }
  },
  useState(init) {
    const { instance, index } = slotAt()
    if (!(index in instance.slots)) instance.slots[index] = typeof init === 'function' ? init() : init
    return [instance.slots[index], (next) => {
      const value = typeof next === 'function' ? next(instance.slots[index]) : next
      if (!Object.is(value, instance.slots[index])) { instance.slots[index] = value; dirty = true }
    }]
  },
  useRef(init) {
    const { instance, index } = slotAt()
    if (!(index in instance.slots)) instance.slots[index] = { current: init }
    return instance.slots[index]
  },
  useMemo(fn, deps) {
    const { instance, index } = slotAt()
    const prev = instance.slots[index]
    if (prev === undefined || !sameDeps(prev.deps, deps)) instance.slots[index] = { deps, value: fn() }
    return instance.slots[index].value
  },
  useCallback(fn, deps) {
    const { instance, index } = slotAt()
    const prev = instance.slots[index]
    if (prev === undefined || !sameDeps(prev.deps, deps)) instance.slots[index] = { deps, value: fn }
    return instance.slots[index].value
  },
  useEffect(fn, deps) {
    const { instance, index } = slotAt()
    const prev = instance.slots[index]
    if (prev === undefined || !sameDeps(prev.deps, deps)) scheduledEffects.push({ instance, index, deps, fn })
  },
}

const runComponent = (type, props, depth = 0) => {
  if (depth > 60) throw new Error('mini-react: component recursion too deep')
  const previous = currentInstance
  currentInstance = instanceOf(type)
  currentInstance.cursor = 0
  try {
    return type(props)
  } finally {
    currentInstance = previous
  }
}

/** Inline every function component so the result is searchable plain data. */
const expand = (node, depth = 0) => {
  if (Array.isArray(node)) return node.map((child) => expand(child, depth))
  if (node === null || typeof node !== 'object') return node
  if (typeof node.type === 'function') return expand(runComponent(node.type, node.props, depth + 1), depth + 1)
  if (typeof node.type === 'string') {
    const props = { ...node.props }
    if (props.children !== undefined) props.children = expand(props.children, depth)
    return { type: node.type, props }
  }
  return node
}

/** Render one pass: expand the tree, then flush the effects the pass scheduled. */
function renderPass(component, props) {
  dirty = false
  scheduledEffects = []
  const tree = expand({ type: component, props })
  for (const effect of scheduledEffects.splice(0)) {
    effect.instance.slots[effect.index] = { deps: effect.deps }
    effect.fn()
  }
  return tree
}

/** Render until the tree settles (async handlers and effects have landed). */
async function settle(component, props, rounds = 8) {
  let tree = renderPass(component, props)
  for (let i = 0; i < rounds; i += 1) {
    await new Promise((resolveTurn) => setTimeout(resolveTurn, 0))
    const wasDirty = dirty
    tree = renderPass(component, props)
    if (!wasDirty && !dirty) break
  }
  return tree
}


const walk = (node, visit) => {
  if (Array.isArray(node)) { node.forEach((child) => walk(child, visit)); return }
  if (node === null || typeof node !== 'object') return
  visit(node)
  if (node.props && node.props.children !== undefined) walk(node.props.children, visit)
}
const findNode = (tree, predicate) => {
  let hit
  walk(tree, (node) => { if (hit === undefined && predicate(node)) hit = node })
  return hit
}
const hasClass = (node, cls) => typeof node?.props?.className === 'string'
  && node.props.className.split(' ').includes(cls)
/** Concatenated text of a subtree (walks element children, so it sees strings too). */
const textOf = (node) => {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (node !== null && typeof node === 'object' && node.props !== undefined) return textOf(node.props.children)
  return ''
}

// ───────────────────────────── guarded cordis context ─────────────────────────────

/** uiWorkspace stub: the official navigation + directory surfaces the plugin consumes. */
const makeUiWorkspace = (override = {}) => ({
  startSession: () => {},
  openSession: () => {},
  clearMain: () => {},
  pickDirectory: async () => null,
  listDirectory: async () => ({ path: '/home/tny', home: '/home/tny', crumbs: [], entries: [], truncated: false }),
  createDirectory: async (path, name) => `${path}/${name}`,
  ...override,
})

/** Service table read through `ctx.get(name)`; property reads need a declaration. */
const makeServices = (registrations, uiWorkspace, calls, state) => ({
  slots: {
    inject: (key, callback) => {
      calls.injects.push(key)
      try { callback() } catch (error) { calls.errors.push(`slots.inject(${key}) threw: ${error?.message}`) }
      return () => {}
    },
    register: (options, component) => {
      const record = { ...options, component }
      registrations.push(record)
      record.dispose = () => {}
      return () => {}
    },
    // 共享「侧边栏」页壳经这三个只读面查选举、订阅 tab 名单（内核真身同形）：
    // 先到先得当选靠 entries 查表，故此处必须返回真实注册表而不是空数组。
    entries: (key) => registrations.filter((row) => row.name === key).map((row) => ({ options: row })),
    getVersion: () => registrations.length,
    subscribe: () => () => {},
  },
  sessions: {
    // Live store: `liveSessionRow` in the plugin reads this, so the harness can move the
    // running bit between a render and a click (the render-snapshot staleness window).
    list: { getSnapshot: () => state.sessionSnapshot },
    create: async (input) => { calls.sessionCreate.push(input); return 'session-id' },
    // 0.1.6 rename contract: an explicit scope rental through `using`. The controller no
    // longer exposes `open` / `clear` / a materializing `binding`, so the harness omits
    // them on purpose — reverting to those calls fails here instead of only in the profile.
    using: async (sessionId, options, operation) => {
      calls.sessionUsing.push({ sessionId, source: options?.source })
      return await operation({
        binding: { session: { rename: async (title) => { calls.sessionRename.push({ sessionId, title }); return { ok: true } } } },
      })
    },
    refresh: () => {},
  },
  workspaces: {
    list: { getSnapshot: () => ({ items: [], archivedSessionIds: [], phase: 'ready' }) },
    create: async (input) => { calls.workspaceCreate.push(input); return { workspaceId: 'ws-' + calls.workspaceCreate.length, path: input.path } },
    delete: async () => {},
    rename: async () => {},
    archiveSession: async (sessionId) => { calls.archived.push(String(sessionId)); },
  },
  // The settings card registers its own dictionary and reads its tab label
  // through `t`; the bundle hard-injects `locale` for that seat.
  locale: {
    register: (ns) => { calls.injects.push(`locale:${ns}`); return () => {} },
    bind: (ns) => (key) => `${ns}:${key}`,
    getSnapshot: () => ({ revision: 0 }),
    subscribe: () => () => {},
  },
  uiWorkspace,
})

/**
 * Cordis-faithful context: an undeclared service read throws
 * `cannot get property "x" without inject`, so a bundle that reads e.g.
 * `ctx.uiWorkspace` without declaring it fails here instead of in the profile.
 */
function makeCtx(label, declared, services) {
  const base = {
    label,
    effect: (fn) => { const dispose = fn(); return typeof dispose === 'function' ? dispose : () => {} },
    on: () => () => {},
    get: (name) => services[name],
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

// ──────────────────────────────── bundle harness ────────────────────────────────

let harnessSeq = 0

/** Boot one fresh module instance of the browser half against a fake host.
 *  `hostFacts.native` = this host can serve the macOS Finder chooser (`/picker/native` → supported). */
/** Inert stand-in for the ui-primitives baseline module the settings card imports. */
const primitivesStub = new Proxy({}, { get: (_t, key) => (key === '__esModule' ? true : () => null) })

async function boot(makeOverrides = {}, hostFacts = {}) {
  const registrations = []
  const calls = { injects: [], errors: [], workspaceCreate: [], sessionCreate: [], sessionUsing: [], sessionRename: [], listDirectory: [], createDirectory: [], pickDirectory: 0, archived: [], guardChecks: [], navOpen: [], navClear: 0 }
  const moduleIds = []
  const state = { sessionSnapshot: { ids: [], byId: {}, phase: 'ready' } }
  const uiWorkspace = makeUiWorkspace(typeof makeOverrides === 'function' ? makeOverrides(calls) : makeOverrides)

  globalThis.window.__ModuleLoader__ = {
    load: ({ id, factory }) => {
      moduleIds.push(id)
      globalThis.__smokeExports = factory((spec) => {
        if (spec === 'react') return React
        if (spec === '@deepseek-ai/dsh-client-ui-primitives') return primitivesStub
        throw new Error(`module table miss: ${spec}`)
      })
    },
  }

  guardCalls = []
  guardFailure = null
  tombstoneCalls = []
  tombstoneFailure = null
  tombstoneAlive = []
  archiveCalls = []
  nativeSupported = hostFacts.native === true
  nativePickCalls = 0
  nativePickBodies = []
  nativeProbeFailure = null
  harnessSeq += 1
  await import(`${pathToFileURL(join(root, 'lib/client.js')).href}?smoke=${harnessSeq}`)
  const exported = globalThis.__smokeExports
  return { exported, registrations, calls, moduleIds, uiWorkspace, state }
}

/** Apply the plugin, then hand back the sidebar entry's inject face + component. */
function mount(harness) {
  const services = makeServices(harness.registrations, harness.uiWorkspace, harness.calls, harness.state)
  const ctx = makeCtx('root', harness.exported.inject ?? [], services)
  harness.exported.apply(ctx)
  const entry = harness.registrations.find((row) => row.name === 'sidebar.workspaces')
  // The registration wraps the browser in an error boundary; the inner component
  // is what the renderer actually invokes, so unwrap one level.
  const boundary = entry.component({})
  const browser = boundary.props.children
  instances.clear()   // one hook runtime per scenario (fresh component identities would too; be explicit)
  return { entry, face: entry.inject(), Browser: browser.type }
}

/** Sidebar props: the inject face plus the two snapshot-selector seats. */
const sidebarProps = (face, wide, state = { sessionSnapshot: { ids: [], byId: {}, phase: 'ready' } }) => ({
  ...face,
  wide,
  useSessions: (select) => select(state.sessionSnapshot),
  useWorkspaces: (select) => select({ items: [], archivedSessionIds: [], phase: 'ready' }),
  useSessionStatus: (select) => select(new Map()),
})

/** Sidebar props carrying one workspace with the given session rows (archive-gate audit). */
const sidebarPropsWith = (face, rows, state) => {
  const ids = rows.map((row) => row.id)
  // Publishing into the mutable store keeps `useSessions` and the plugin's `liveSessionRow`
  // reading one source, exactly like the shipped controller does.
  state.sessionSnapshot = {
    ids,
    byId: Object.fromEntries(rows.map((row) => [row.id, row])),
    phase: 'ready',
  }
  return {
    ...face,
    wide: true,
    // The kernel's session-status seat (Map<SessionId, { running, pendingInteraction,
    // completionUnread }>), exactly as the shipped `dsh-client-ui-session` contributes it
    // to every `sidebar.workspaces` entry.
    useSessionStatus: (select) => select(new Map(rows.map((row) => [row.id, {
      running: row.running === true,
      pendingInteraction: row.pending,
      completionUnread: row.completionUnread === true,
    }]))),
    useSessions: (select) => select(state.sessionSnapshot),
    useWorkspaces: (select) => select({
      items: [{ workspaceId: 'ws-1', path: '/home/tny/work', title: 'work', sessionIds: ids }],
      archivedSessionIds: [],
      phase: 'ready',
    }),
  }
}

/** Sidebar props with an explicit Workspace list (the tree projections need real items). */
const sidebarPropsWithWorkspaces = (face, rows, items, state) => {
  // Publishing into the mutable store keeps `useSessions` and the plugin's `liveSessionRow`
  // reading one source, exactly like the shipped controller does.
  state.sessionSnapshot = {
    ids: rows.map((row) => row.id),
    byId: Object.fromEntries(rows.map((row) => [row.id, row])),
    phase: 'ready',
  }
  return {
    ...face,
    wide: true,
    useSessionStatus: (select) => select(new Map()),
    useSessions: (select) => select(state.sessionSnapshot),
    useWorkspaces: (select) => select({ items, archivedSessionIds: [], phase: 'ready' }),
  }
}

/** Sidebar props in archive mode: explicit workspace list plus the registry-global archive set. */
const sidebarPropsWithArchive = (face, rows, items, archivedIds, state) => {
  state.sessionSnapshot = {
    ids: rows.map((row) => row.id),
    byId: Object.fromEntries(rows.map((row) => [row.id, row])),
    phase: 'ready',
  }
  return {
    ...face,
    wide: true,
    useSessionStatus: (select) => select(new Map()),
    useSessions: (select) => select(state.sessionSnapshot),
    useWorkspaces: (select) => select({ items, archivedSessionIds: archivedIds, phase: 'ready' }),
  }
}

/** The row's archive affordance: enabled rows read "移至归档", gated rows read the reason. */
const archiveButton = (tree) => findNode(tree, (node) => node?.props?.type === 'button'
  && /^(移至归档|会话运行中|其后代子代理正在运行|等待处理的交互)/.test(String(node?.props?.title ?? '')))

/** The single add-workspace entry point; its tooltip names the picker this host will open. */
const addWorkspaceButton = (tree) => findNode(tree, (node) => typeof node?.props?.title === 'string'
  && /^添加工作区/.test(node.props.title))
const finderTitle = (tree) => findNode(tree, (node) => typeof node?.props?.title === 'string'
  && node.props.title.indexOf('用 Finder 选择工作区') >= 0)
/** Every add-workspace affordance in the tree — the merge keeps this at exactly one. */
const addWorkspaceButtons = (tree) => {
  const hits = []
  walk(tree, (node) => {
    if (typeof node?.props?.title === 'string' && /^添加工作区/.test(node.props.title)) hits.push(node)
  })
  return hits
}
const pickerPanel = (tree) => findNode(tree, (node) => hasClass(node, 'dswt-pickerPanel'))

// ─────────────────────────── scenario 1: browse host ───────────────────────────

const BROWSE_REFUSAL = 'directory picker failed: directoryPicker.pick needs the native capability; the composed picker serves "browse"'
const listing = (path, entries, crumbs) => ({
  path,
  home: '/home/tny',
  crumbs: crumbs ?? [{ name: '/', path: '/', hidden: false }, { name: path.split('/').pop(), path, hidden: false }],
  entries,
  truncated: false,
})

{
  const harness = await boot((calls) => ({
    pickDirectory: async () => { calls.pickDirectory += 1; throw new Error(BROWSE_REFUSAL) },
    listDirectory: async (path) => {
      calls.listDirectory.push(path)
      if (path === undefined) return listing('/home/tny', [{ name: 'work', path: '/home/tny/work', hidden: false }, { name: '.config', path: '/home/tny/.config', hidden: true }])
      return listing(path, [{ name: 'my-dsh', path: `${path}/my-dsh`, hidden: false }])
    },
    createDirectory: async (path, name) => {
      calls.createDirectory.push({ path, name })
      return `${path}/${name}`
    },
  }))
  const { entry, face, Browser } = mount(harness)
  const props = sidebarProps(face, true, harness.state)

  check('bundle registers under its package id', harness.moduleIds[0] === '@lynn123411/dsh-workspace-tree')
  check('apply/inject exported', typeof harness.exported.apply === 'function' && Array.isArray(harness.exported.inject))
  check('sidebar entry keeps the shadowing priority', entry.priority === -1)
  check('sidebar entry declares no child slot', entry.children === undefined)
  check('other seats still registered', harness.registrations.some((r) => r.name === 'sidebar.settings.item')
    && harness.registrations.some((r) => r.name === 'conversation.composer'))
  // 设置「侧边栏」共享页：本插件与 dsh-mattpocock-skills-deck 共用一页，先激活者当选页面宿主
  // 并声明 sidebar.settings.item 子槽；卡片 id 取本插件的 Host 设置命名空间，页面按它分发面板。
  const settingsCards = harness.registrations.filter((r) => r.name === 'sidebar.settings.item')
  check('sidebar settings card registered once', settingsCards.length === 1)
  check('sidebar settings card id is the Host settings namespace', settingsCards[0].id === 'dsh-workspace-tree')
  check('sidebar settings card order/label', settingsCards[0].order === 10 && settingsCards[0].label() === 'settings.workspaceTree:title')
  check('plugin page tab is gone', !harness.registrations.some((r) => r.name === 'settings.plugins.tab'))
  const settingsPage = harness.registrations.find((r) => r.name === 'settings.section')
  check('shared settings page claimed as sidebar/130',
    settingsPage !== undefined && settingsPage.id === 'sidebar' && settingsPage.order === 130)
  check('shared settings page declares the item slot',
    settingsPage.children !== undefined && settingsPage.children['sidebar.settings.item'] !== undefined
    && settingsPage.children['sidebar.settings.item'].kind === 'list')
  check('shared settings page label is the sidebar nav label', settingsPage.label() === 'settings.workspaceTree:pageNav')
  check('shared settings page injects the tab roster', typeof settingsPage.inject().sidebarTabs.getSnapshot === 'function')
  check('inject face exposes native + browse directory surfaces',
    typeof face.pickDirectory === 'function' && typeof face.listDirectory === 'function' && typeof face.createDirectory === 'function')
  check('no wiring error during apply', harness.calls.errors.length === 0)

  // The guard must have teeth, or every case below is vacuous.
  try {
    makeCtx('teeth', [], makeServices([], makeUiWorkspace(), harness.calls, harness.state)).uiWorkspace
    check('guard rejects an undeclared service read', false)
  } catch (error) {
    check('guard rejects an undeclared service read', /cannot get property "uiWorkspace" without inject/.test(error.message))
  }

  let tree = await settle(Browser, props)
  check('sidebar renders without the picker open', pickerPanel(tree) === undefined)

  await addWorkspaceButton(tree).props.onClick()
  tree = await settle(Browser, props)

  check('browse host: native pick was attempted first', harness.calls.pickDirectory === 1)
  check('browse host: no "添加工作区失败" alert', !/添加工作区失败/.test(textOf(tree)))
  check('browse host: native refusal opens the built-in browser', pickerPanel(tree) !== undefined)
  check('browse host: listing starts at the host home', harness.calls.listDirectory.length === 1 && harness.calls.listDirectory[0] === undefined)
  check('browse host: the probe result becomes the dialog\'s first level',
    findNode(tree, (n) => hasClass(n, 'dswt-pickerPathInput')).props.value === '/home/tny')
  check('browse host: directory rows rendered', findNode(tree, (n) => n?.props?.title === '/home/tny/work') !== undefined)
  check('browse host: hidden rows keep their dimmed marker',
    hasClass(findNode(tree, (n) => n?.props?.title === '/home/tny/.config'), 'dswt-pickerRowHidden'))

  findNode(tree, (n) => n?.props?.title === '/home/tny/work').props.onClick()
  tree = await settle(Browser, props)
  check('row click navigates one level down', harness.calls.listDirectory[1] === '/home/tny/work')

  findNode(tree, (n) => hasClass(n, 'dswt-modalBtnPrimary') && /选择此文件夹/.test(textOf(n))).props.onClick()
  tree = await settle(Browser, props)
  check('commit adopts the current directory', harness.calls.workspaceCreate.length === 1 && harness.calls.workspaceCreate[0].path === '/home/tny/work')
  check('commit closes the browser dialog', pickerPanel(tree) === undefined)

  // New-folder branch: create under the current level, then enter it.
  await addWorkspaceButton(tree).props.onClick()
  tree = await settle(Browser, props)
  findNode(tree, (n) => /新建文件夹/.test(textOf(n)) && n?.props?.type === 'button').props.onClick()
  tree = await settle(Browser, props)
  const nameInput = findNode(tree, (n) => n?.props?.placeholder === '新文件夹名称')
  check('new-folder control turns into an input', nameInput !== undefined)
  nameInput.props.onChange({ target: { value: 'fresh' } })
  tree = await settle(Browser, props)
  findNode(tree, (n) => n?.props?.type === 'button' && /^创建$/.test(textOf(n))).props.onClick()
  tree = await settle(Browser, props)
  check('create calls the official browse primitive', harness.calls.createDirectory.length === 1
    && harness.calls.createDirectory[0].path === '/home/tny'
    && harness.calls.createDirectory[0].name === 'fresh')
  check('create enters the new directory', harness.calls.listDirectory[harness.calls.listDirectory.length - 1] === '/home/tny/fresh')

  findNode(tree, (n) => n?.props?.type === 'button' && /取消/.test(textOf(n)) && hasClass(n, 'dswt-modalBtn')).props.onClick()
  tree = await settle(Browser, props)
  check('cancel closes the browser dialog', pickerPanel(tree) === undefined)

  // Rail layout renders the same affordance.
  const railTree = await settle(Browser, sidebarProps(face, false, harness.state))
  check('rail layout keeps the add-workspace button', addWorkspaceButton(railTree) !== undefined)
}

// ─────────────────────────── scenario 2: native host ───────────────────────────

{
  const harness = await boot({ pickDirectory: async () => '/tmp/native-pick' })
  const { face, Browser } = mount(harness)
  const props = sidebarProps(face, true)
  let tree = await settle(Browser, props)

  await addWorkspaceButton(tree).props.onClick()
  tree = await settle(Browser, props)

  check('native host: the OS chooser path is adopted', harness.calls.workspaceCreate.length === 1
    && harness.calls.workspaceCreate[0].path === '/tmp/native-pick')
  check('native host: the built-in dialog stays shut', pickerPanel(tree) === undefined)
  check('native host: browse primitives untouched', harness.calls.listDirectory.length === 0)
}

// ─────────────────────── scenario 3: native host, cancelled ───────────────────────

{
  const harness = await boot({ pickDirectory: async () => null })
  const { face, Browser } = mount(harness)
  const props = sidebarProps(face, true)
  let tree = await settle(Browser, props)

  await addWorkspaceButton(tree).props.onClick()
  tree = await settle(Browser, props)

  check('operator cancel creates nothing', harness.calls.workspaceCreate.length === 0)
  check('operator cancel opens no dialog', pickerPanel(tree) === undefined)
}

// ─────────────── scenario 4: pre-browse DSH (no browse primitives) ───────────────

{
  const harness = await boot({
    pickDirectory: async () => { throw new Error(BROWSE_REFUSAL) },
    listDirectory: undefined,
    createDirectory: undefined,
  })
  const { face, Browser } = mount(harness)
  const props = sidebarProps(face, true)
  let tree = await settle(Browser, props)

  await addWorkspaceButton(tree).props.onClick()
  tree = await settle(Browser, props)

  check('legacy host: no dead-end dialog is opened', pickerPanel(tree) === undefined)
  check('legacy host: the actionable cause is reported instead',
    /添加工作区失败/.test(textOf(tree)) && /当前 DSH 版本不支持目录浏览/.test(textOf(tree)))
}

// ────────── scenario 5: native chooser broken on a native (loopback) host ──────────

{
  const harness = await boot({
    pickDirectory: async () => { throw new Error('directory picker failed: gateway/internal: chooser exited with code 1') },
    listDirectory: async () => { throw new Error('directory browse failed: directory-picker/unavailable: directoryPicker.list needs the "browse" capability; the composed picker serves "native"') },
  })
  const { face, Browser } = mount(harness)
  const props = sidebarProps(face, true)
  let tree = await settle(Browser, props)

  await addWorkspaceButton(tree).props.onClick()
  tree = await settle(Browser, props)

  check('broken native chooser: no dead-end dialog', pickerPanel(tree) === undefined)
  check('broken native chooser: the native failure is reported',
    /添加工作区失败/.test(textOf(tree)) && /chooser exited with code 1/.test(textOf(tree)))
}

// ───────── archive-gate audit: what the greyed criterion reads, and the host guard ─────────

{
  const harness = await boot({})
  const { face, Browser } = mount(harness)
  const row = (over = {}) => ({
    id: 'session-audit', displayTitle: 'audit row', cwd: '/home/tny/work',
    running: false, blank: false, updatedAt: Date.now(), ...over,
  })
  const archiveButtonOf = (tree) => archiveButton(tree)
  const propsWith = (rows) => sidebarPropsWith(face, rows, harness.state)

  let tree = await settle(Browser, propsWith([row({ running: true })]))
  let button = archiveButtonOf(tree)
  check('audit: a running row is greyed', button !== undefined && button.props.disabled === true)

  tree = await settle(Browser, propsWith([row({ running: false })]))
  button = archiveButtonOf(tree)
  check('audit: an idle row is archivable', button !== undefined && button.props.disabled === false)

  // Pending UI interactions arrive through the seat, never on the summary row.
  tree = await settle(Browser, propsWith([row({ running: false, pending: { kind: 'approval' } })]))
  button = archiveButtonOf(tree)
  check('audit: a session awaiting approval is greyed (real seat)',
    button !== undefined && button.props.disabled === true)
  check('audit: the warning status dot is driven by the real seat',
    findNode(tree, (n) => n?.props?.['data-state'] === 'warning') !== undefined)

  // Completion-unread rides the same seat: the summary row no longer carries `completed`.
  tree = await settle(Browser, propsWith([row({ running: false, completionUnread: true })]))
  check('audit: a completed-unread row shows the reminder dot',
    findNode(tree, (n) => n?.props?.['data-state'] === 'done-reminder') !== undefined)

  // The current session comes from retainedBy.mainView: the list snapshot has no `current`.
  tree = await settle(Browser, propsWith([row({ retainedBy: { mainView: 1 } })]))
  check('audit: the main-view holder renders as the selected row',
    findNode(tree, (n) => hasClass(n, 'dswt-selected')) !== undefined)
  tree = await settle(Browser, propsWith([row()]))
  check('audit: a row without main-view retention is not selected',
    findNode(tree, (n) => hasClass(n, 'dswt-selected')) === undefined)

  // A greyed row's own guard short-circuits the click; nothing may reach the official RPC.
  tree = await settle(Browser, propsWith([row({ running: false, pending: { kind: 'approval' } })]))
  await archiveButtonOf(tree).props.onClick()
  tree = await settle(Browser, propsWith([row({ running: false, pending: { kind: 'approval' } })]))
  check('audit: a greyed (awaiting-approval) row archives nothing',
    harness.calls.archived.length === 0)

  tree = await settle(Browser, propsWith([row({ running: true })]))
  await archiveButtonOf(tree).props.onClick()
  tree = await settle(Browser, propsWith([row({ running: true })]))
  check('audit: a greyed (running) row archives nothing', harness.calls.archived.length === 0)

  // Staleness window: the click handler captured while the row looked idle, then the store
  // flips to running before React re-renders. The action-side live re-read must catch it.
  tree = await settle(Browser, propsWith([row({ running: false })]))
  const staleClick = archiveButtonOf(tree).props.onClick
  harness.state.sessionSnapshot = {
    ...harness.state.sessionSnapshot,
    byId: { 'session-audit': row({ running: true }) },
  }
  await staleClick()
  tree = await settle(Browser, propsWith([row({ running: true })]))
  check('audit: a click straddling the running flip is refused by the live re-read',
    harness.calls.archived.length === 0 && /正在运行/.test(textOf(tree)))
  harness.state.sessionSnapshot = {
    ...harness.state.sessionSnapshot,
    byId: { 'session-audit': row({ running: false }) },
  }

  guardAnswer = { ok: true, status: 'running', running: true }
  tree = await settle(Browser, propsWith([row({ running: false })]))
  await archiveButtonOf(tree).props.onClick()
  tree = await settle(Browser, propsWith([row({ running: false })]))
  check('audit: a stale-false row is refused by the host guard',
    guardCalls.length === 1 && harness.calls.archived.length === 0 && /Host 实测状态/.test(textOf(tree)))

  guardAnswer = { ok: true, status: 'idle', running: false }
  tree = await settle(Browser, propsWith([row({ running: false })]))
  await archiveButtonOf(tree).props.onClick()
  tree = await settle(Browser, propsWith([row({ running: false })]))
  check('audit: an idle session archives after the guard passes',
    guardCalls.length === 2 && harness.calls.archived.length === 1 && harness.calls.archived[0] === 'session-audit')

  guardFailure = 'network down'
  tree = await settle(Browser, propsWith([row({ running: false })]))
  await archiveButtonOf(tree).props.onClick()
  tree = await settle(Browser, propsWith([row({ running: false })]))
  check('audit: an unreachable guard fails open (official RPC decides)',
    harness.calls.archived.length === 2)

  const source = readFileSync(join(root, 'lib/client.js'), 'utf8')
  check('audit: the session-status seat is consumed', source.includes('useSessionStatus'))
  check('audit: the dead row.pendingInteraction read is gone', !/if \(row\.pendingInteraction\)/.test(source))
  check('audit: the archive action re-checks running state',
    /onArchiveSession = useCallback[\s\S]{0,1600}?live\.running/.test(source))
  check('audit: the host guard route is wired', readFileSync(join(root, 'lib/index.js'), 'utf8').includes('guardCheck'))

  // 0.1.6 contract guards: the removed controller/row surfaces must not come back.
  check('audit: no removed sessions.open/clear call remains', !/ctx\.sessions\??\.(open|clear)\b/.test(source))
  check('audit: the pending-interaction seat name is not referenced', !source.includes('useSessionPendingInteraction'))
  check('audit: the list snapshot current field is not read', !/sessions\.current/.test(source))
  check('audit: the row completed field is not read', !/row\.completed/.test(source))
  check('audit: the current session is derived from retainedBy.mainView', source.includes('retainedBy.mainView'))
  check('audit: rename rents a session scope through sessions.using', source.includes('sessions.using('))
}

// ─────── navigation contract: open / new-session / rename ride the 0.1.6 surfaces ───────

{
  const harness = await boot((calls) => ({
    openSession: (sessionId) => { calls.navOpen.push(String(sessionId)) },
    clearMain: () => { calls.navClear += 1 },
  }))
  const { face, Browser } = mount(harness)
  const row = (over = {}) => ({
    id: 'session-nav', displayTitle: 'nav row', cwd: '/home/tny/work',
    running: false, blank: false, updatedAt: Date.now(), ...over,
  })
  const props = sidebarPropsWith(face, [row()], harness.state, harness.calls)
  let tree = await settle(Browser, props)

  // A session click opens through uiWorkspace (the controller no longer has open()).
  findNode(tree, (n) => hasClass(n, 'dswt-session')).props.onClick()
  check('nav: a session click opens through uiWorkspace.openSession',
    harness.calls.navOpen.length === 1 && harness.calls.navOpen[0] === 'session-nav')

  // 「新建会话」 clears the main view through uiWorkspace.clearMain (no clear() on the controller).
  const newSession = findNode(tree, (n) => n?.props?.type === 'button' && /^新建会话/.test(String(n?.props?.title ?? '')))
  await newSession.props.onClick()
  check('nav: the new-session button clears the main view through uiWorkspace',
    harness.calls.navClear === 1 && harness.calls.navOpen.length === 1)

  // Renaming rents a session scope through sessions.using and renames inside it.
  const renameButton = findNode(tree, (n) => n?.props?.type === 'button' && n?.props?.title === '重命名')
  renameButton.props.onClick()
  tree = await settle(Browser, props)
  findNode(tree, (n) => hasClass(n, 'dswt-modalInput')).props.onChange({ target: { value: 'renamed title' } })
  tree = await settle(Browser, props)
  findNode(tree, (n) => hasClass(n, 'dswt-modalBtnPrimary') && /确认/.test(textOf(n))).props.onClick()
  tree = await settle(Browser, props)
  check('nav: rename rents a session scope through sessions.using',
    harness.calls.sessionUsing.length === 1
    && harness.calls.sessionUsing[0].sessionId === 'session-nav'
    && harness.calls.sessionUsing[0].source === 'workspaceOperation')
  check('nav: the rename lands on the rented binding',
    harness.calls.sessionRename.length === 1 && harness.calls.sessionRename[0].title === 'renamed title')
  check('nav: apply stayed error-free', harness.calls.errors.length === 0)
}


// ─────────── 「添加工作区」单一入口：macOS 直达 Finder，其余环境走内置浏览 ───────────

{
  nativePickResult = { ok: true, path: '/Users/tny/Desktop/work/finder-pick' }
  const harness = await boot((calls) => ({ pickDirectory: async () => { calls.pickDirectory += 1; return '/tmp/should-not-be-used' } }), { native: true })
  const { face, Browser } = mount(harness)
  const props = sidebarProps(face, true, harness.state, harness.calls)
  let tree = await settle(Browser, props)
  check('merged: exactly one add entry point (no second Finder button)',
    addWorkspaceButtons(tree).length === 1 && finderTitle(tree) === undefined)
  check('merged: the single button says it will open Finder', /用 Finder 选择目录/.test(String(addWorkspaceButton(tree).props.title)))
  await addWorkspaceButton(tree).props.onClick()
  tree = await settle(Browser, props)
  check('merged: the macOS click goes straight to the host Finder chooser',
    nativePickCalls === 1 && harness.calls.workspaceCreate.length === 1
    && harness.calls.workspaceCreate[0].path === '/Users/tny/Desktop/work/finder-pick')
  check('merged: the official pick path is short-circuited', harness.calls.pickDirectory === 0)
  check('merged: no failure alert', !/Finder 选择失败/.test(textOf(tree)))
}

{
  nativePickResult = { ok: true, path: null }   // operator cancelled the native dialog
  const harness = await boot({}, { native: true })
  const { face, Browser } = mount(harness)
  const props = sidebarProps(face, true, harness.state, harness.calls)
  let tree = await settle(Browser, props)
  await addWorkspaceButton(tree).props.onClick()
  tree = await settle(Browser, props)
  check('merged: cancelling the Finder dialog creates nothing',
    harness.calls.workspaceCreate.length === 0 && !/Finder 选择失败/.test(textOf(tree)))
}

{
  nativePickResult = { ok: false, error: '仅在 macOS 可用' }
  const harness = await boot({}, { native: true })
  const { face, Browser } = mount(harness)
  const props = sidebarProps(face, true, harness.state, harness.calls)
  let tree = await settle(Browser, props)
  await addWorkspaceButton(tree).props.onClick()
  tree = await settle(Browser, props)
  check('merged: a host refusal is surfaced honestly',
    harness.calls.workspaceCreate.length === 0 && /Finder 选择失败/.test(textOf(tree)))
}

{
  const harness = await boot((calls) => ({
    pickDirectory: async () => { calls.pickDirectory += 1; throw new Error(BROWSE_REFUSAL) },
    listDirectory: async (path) => { calls.listDirectory.push(path); return listing(path ?? '/home/tny', []) },
  }))
  const { face, Browser } = mount(harness)
  const props = sidebarProps(face, true, harness.state, harness.calls)
  let tree = await settle(Browser, props)
  check('merged: a non-macOS host keeps the plain add-workspace tooltip',
    addWorkspaceButton(tree) !== undefined && addWorkspaceButton(tree).props.title === '添加工作区')
  await addWorkspaceButton(tree).props.onClick()
  tree = await settle(Browser, props)
  check('merged: that same button then falls through to the built-in browser',
    harness.calls.pickDirectory === 1 && pickerPanel(tree) !== undefined && nativePickCalls === 0)
}

{
  nativeProbeFailure = 'network down'   // e.g. an older host half without the route
  const harness = await boot({})
  const { face, Browser } = mount(harness)
  const props = sidebarProps(face, true, harness.state, harness.calls)
  const tree = await settle(Browser, props)
  check('merged: a failed support probe keeps the plain tooltip and the sidebar working',
    addWorkspaceButton(tree) !== undefined && addWorkspaceButton(tree).props.title === '添加工作区'
    && harness.calls.errors.length === 0)
}

// ── 后代子代理运行态：行状态点 / title / 聚合，且 fork 不向上冒泡（官方谱系判据） ──

{
  const harness = await boot({})
  const { face, Browser } = mount(harness)
  const base = { running: false, blank: false, updatedAt: Date.now(), cwd: '/home/tny/work' }
  const normal = (over = {}) => ({ id: 'session-parent', displayTitle: 'parent row', ...base, ...over })
  const subagent = (over = {}) => ({ id: 'sub-1', displayTitle: 'subagent row', origin: 'subagent', parentId: 'session-parent', running: true, blank: false, updatedAt: Date.now(), ...over })
  const items = (sessionIds = ['session-parent', 'session-fork']) => [{ workspaceId: 'ws-1', path: '/home/tny/work', title: 'work', sessionIds }]
  const propsWith = (subRunning, forkSubRunning = true) => sidebarPropsWithWorkspaces(face, [
    normal(),
    subagent({ running: subRunning }),
    normal({ id: 'session-fork', displayTitle: 'fork row', parentId: 'session-parent' }),
    subagent({ id: 'sub-2', parentId: 'session-fork', running: forkSubRunning }),
  ], items(), harness.state)
  const rowNode = (tree, text) => findNode(tree, (n) => hasClass(n, 'dswt-session') && textOf(n).includes(text))
  const isOngoing = (node) => findNode(node, (n) => hasClass(n, 'dswt-matrix')) !== undefined

  let tree = await settle(Browser, propsWith(true))
  check('lineage: an idle parent whose subagent runs shows the running dot', isOngoing(rowNode(tree, 'parent row')))
  check('lineage: the running count rides the row tooltip',
    /1 个子代理运行中/.test(String(rowNode(tree, 'parent row').props.title)))
  check('lineage: a fork child counts for itself but never bubbles to its parent',
    /1 个子代理运行中/.test(String(rowNode(tree, 'fork row').props.title))
    && !/2 个子代理运行中/.test(String(rowNode(tree, 'parent row').props.title)))
  check('lineage: subagent rows stay out of the tree', rowNode(tree, 'subagent row') === undefined)
  check('lineage: the workspace folder turns active', findNode(tree, (n) => hasClass(n, 'dswt-folderActive')) !== undefined)
  check('lineage: the workspace aggregate dot turns ongoing',
    isOngoing(findNode(tree, (n) => hasClass(n, 'dswt-aggSlot'))))

  tree = await settle(Browser, propsWith(false))
  check('lineage: with no running subagent the parent dot is idle again', !isOngoing(rowNode(tree, 'parent row')))
  check('lineage: the tooltip drops the subagent count',
    !/子代理运行中/.test(String(rowNode(tree, 'parent row').props.title)))
  check('lineage: the folder stays active through the fork child in the same subtree',
    findNode(tree, (n) => hasClass(n, 'dswt-folderActive')) !== undefined)

  tree = await settle(Browser, propsWith(false, false))
  check('lineage: with every descendant stopped the folder goes quiet again',
    findNode(tree, (n) => hasClass(n, 'dswt-folderActive')) === undefined)
}

// ── 归档门槛的后代层：置灰、动作侧、Host 权威计数 ──

{
  const harness = await boot({})
  const { face, Browser } = mount(harness)
  const parent = (over = {}) => ({ id: 'session-audit', displayTitle: 'audit row', cwd: '/home/tny/work', running: false, blank: false, updatedAt: Date.now(), ...over })
  const child = (over = {}) => ({ id: 'sub-audit', displayTitle: 'sub row', origin: 'subagent', parentId: 'session-audit', running: true, blank: false, updatedAt: Date.now(), ...over })
  const propsWith = (subRunning) => sidebarPropsWith(face, [parent(), child({ running: subRunning })], harness.state)

  let tree = await settle(Browser, propsWith(true))
  let button = archiveButton(tree)
  check('guard: a running descendant greys the archive button',
    button !== undefined && button.props.disabled === true && /后代子代理正在运行/.test(String(button.props.title)))
  await button.props.onClick()
  tree = await settle(Browser, propsWith(true))
  check('guard: a greyed descendant row archives nothing', harness.calls.archived.length === 0)

  // Host layer: the render snapshot says idle (button enabled) while the host reports a running descendant.
  guardAnswer = { ok: true, status: 'idle', running: false, runningDescendants: 1 }
  tree = await settle(Browser, propsWith(false))
  button = archiveButton(tree)
  check('guard: with no running descendant the button is archivable again',
    button !== undefined && button.props.disabled === false)
  await button.props.onClick()
  tree = await settle(Browser, propsWith(false))
  check('guard: the host descendant count refuses the archive',
    harness.calls.archived.length === 0 && /后代子代理正在运行（Host 实测 1 个）/.test(textOf(tree)))

  guardAnswer = { ok: true, status: 'idle', running: false, runningDescendants: 0 }
  tree = await settle(Browser, propsWith(false))
  await archiveButton(tree).props.onClick()
  tree = await settle(Browser, propsWith(false))
  check('guard: with no descendants anywhere the archive goes through',
    harness.calls.archived.length === 1 && harness.calls.archived[0] === 'session-audit')
}

// ── 未分组：插件不再替用户收编，无归属会话照官方语义落进「未分组」 ──

{
  const harness = await boot({})
  const { face, Browser } = mount(harness)
  const row = (over = {}) => ({
    id: 'session-loose', displayTitle: 'loose row', cwd: '/home/tny/loose',
    running: false, blank: false, updatedAt: Date.now(), ...over,
  })
  const ws = (id, path, sessionIds = []) => ({ workspaceId: id, path, title: path.split('/').pop(), sessionIds })
  const propsWith = (rows, items) => sidebarPropsWithWorkspaces(face, rows, items, harness.state)

  // 无归属会话：不注册工作区、不 attach，只作为「未分组」渲染出来。
  let tree = await settle(Browser, propsWith([row()], []))
  check('ungrouped: an unattributed session renders under 「未分组」',
    /未分组 · 1 条/.test(textOf(tree)) && textOf(tree).includes('loose row'))
  check('ungrouped: nothing is registered or attached on its behalf',
    harness.calls.workspaceCreate.length === 0 && harness.calls.sessionCreate.length === 0)

  // 已有归属的会话照旧落在它自己的工作区组里，不再有「未分组」。
  tree = await settle(Browser, propsWith([row({ id: 'session-owned' })], [ws('ws-1', '/home/tny/work', ['session-owned'])]))
  check('ungrouped: an attributed session stays inside its workspace group',
    !/未分组 /.test(textOf(tree)))
  check('ungrouped: the workspace header is still rendered', textOf(tree).includes('work'))
  check('ungrouped: apply stayed error-free', harness.calls.errors.length === 0)
}

// ── 工作区行的「添加工作区」：同一套交互，选择器从该工作区目录起 ──

{
  const harness = await boot((calls) => ({
    pickDirectory: async () => { calls.pickDirectory += 1; throw new Error(BROWSE_REFUSAL) },
    listDirectory: async (path) => { calls.listDirectory.push(path); return listing(path ?? '/home/tny', []) },
  }))
  const { face, Browser } = mount(harness)
  const props = sidebarPropsWithWorkspaces(face, [], [{ workspaceId: 'ws-1', path: '/home/tny/work', title: 'work', sessionIds: [] }], harness.state)
  const rowAddTitle = '添加工作区（从该工作区目录开始选择）'
  const rowAddButton = (tree) => findNode(tree, (node) => node?.props?.title === rowAddTitle)
  const globalAddCount = (tree) => {
    let n = 0
    walk(tree, (node) => { if (node?.props?.title === '添加工作区') n += 1 })
    return n
  }

  let tree = await settle(Browser, props)
  check('row-add: the workspace row carries its own add-workspace button', rowAddButton(tree) !== undefined)
  check('row-add: the sidebar keeps exactly one global entry', globalAddCount(tree) === 1)

  await rowAddButton(tree).props.onClick()
  tree = await settle(Browser, props)
  check('row-add: the dialog is seeded at that workspace directory',
    pickerPanel(tree) !== undefined && harness.calls.listDirectory[0] === '/home/tny/work')
  check('row-add: nothing is registered until a folder is picked', harness.calls.workspaceCreate.length === 0)

  findNode(tree, (n) => hasClass(n, 'dswt-modalBtnPrimary') && /选择此文件夹/.test(textOf(n))).props.onClick()
  tree = await settle(Browser, props)
  check('row-add: picking that folder registers it as a workspace',
    harness.calls.workspaceCreate.length === 1 && harness.calls.workspaceCreate[0].path === '/home/tny/work')
  check('row-add: the dialog closes after the pick', pickerPanel(tree) === undefined)
}

// ── macOS 上同一套入口：起点交给宿主 osascript 的 default location ──

{
  nativePickResult = { ok: true, path: '/Users/tny/Desktop/work/picked-sub' }
  const harness = await boot({}, { native: true })
  const { face, Browser } = mount(harness)
  const props = sidebarPropsWithWorkspaces(face, [], [{ workspaceId: 'ws-1', path: '/home/tny/work', title: 'work', sessionIds: [] }], harness.state)
  const rowAddButton = (tree) => findNode(tree, (node) => node?.props?.title === '添加工作区（从该工作区目录开始选择）')

  let tree = await settle(Browser, props)
  await rowAddButton(tree).props.onClick()
  check('row-add: the Finder chooser is asked to open at the workspace directory',
    nativePickBodies.length === 1 && nativePickBodies[0].startPath === '/home/tny/work')
  check('row-add: the picked directory registers as a workspace',
    harness.calls.workspaceCreate.length === 1 && harness.calls.workspaceCreate[0].path === '/Users/tny/Desktop/work/picked-sub')

  tree = await settle(Browser, props)
  await addWorkspaceButton(tree).props.onClick()
  check('row-add: the global entry asks for no start path',
    nativePickBodies.length === 2 && nativePickBodies[1].startPath === undefined)
}


// ── 归档区兜住「无归属」归档：归档集合是注册表全局的，无归属必须单独成组（回归） ──

{

  const harness = await boot({})
  const { face, Browser } = mount(harness)
  const row = (over = {}) => ({
    id: 'session-arch', displayTitle: 'arch row', cwd: '/home/tny/work',
    running: false, blank: false, updatedAt: Date.now(), ...over,
  })
  const items = [{ workspaceId: 'ws-1', path: '/home/tny/work', title: 'work', sessionIds: ['session-arch-ws'] }]
  const rows = [
    row({ id: 'session-arch-ws', displayTitle: 'attached row' }),
    row({ id: 'session-arch-ungrouped', displayTitle: 'ungrouped row', cwd: '/home/tny/other' }),
    row({ id: 'session-arch-blank', displayTitle: 'blank row', blank: true }),
    row({ id: 'session-live-ungrouped', displayTitle: 'live row' }),
  ]
  const archivedIds = ['session-arch-ws', 'session-arch-ungrouped', 'session-arch-blank']
  const props = sidebarPropsWithArchive(face, rows, items, archivedIds, harness.state, harness.calls)

  let tree = await settle(Browser, props)
  findNode(tree, (n) => n?.props?.type === 'button' && n?.props?.title === '归档区').props.onClick()
  tree = await settle(Browser, props)

  check('archive: workspace-attached archived session renders',
    findNode(tree, (n) => n?.props?.title === 'attached row') !== undefined)
  check('archive: ungrouped archived session renders under a 「未分组」 group',
    findNode(tree, (n) => n?.props?.title === 'ungrouped row') !== undefined
    && /未分组 · 1 条/.test(textOf(tree)))
  check('archive: the toolbar counts every visible archived session',
    /共 2 条有效归档/.test(textOf(tree)))
  check('archive: blank archived sessions stay hidden',
    findNode(tree, (n) => n?.props?.title === 'blank row') === undefined)
  check('archive: unarchived sessions stay out of the archive area',
    findNode(tree, (n) => n?.props?.title === 'live row') === undefined)

  // Group-level restore of the ungrouped bucket must post workspaceId null (official 「未分组」口径).
  findNode(tree, (n) => n?.props?.type === 'button' && n?.props?.title === '恢复未分组全部').props.onClick()
  tree = await settle(Browser, props)
  check('archive: the ungrouped group names its own restore confirm',
    /恢复未分组归档/.test(textOf(tree)))
  findNode(tree, (n) => hasClass(n, 'dswt-modalBtnPrimary') && /恢复全部/.test(textOf(n))).props.onClick()
  tree = await settle(Browser, props)
  check('archive: restoring the ungrouped group calls unarchiveAll with workspaceId null',
    archiveCalls.some((c) => c.path.endsWith('/archive/unarchiveAll') && c.body.workspaceId === null))
}

console.log(failures.length === 0 ? '\nsmoke: PASS' : `\nsmoke: FAIL (${failures.length})`)
if (failures.length > 0) process.exitCode = 1
