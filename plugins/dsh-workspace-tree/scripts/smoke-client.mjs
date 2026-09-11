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
 *   - macOS hosts (`/picker/native` reports support): the single 「添加工作区」
 *     button short-circuits straight to the host-side Finder chooser;
 *   - the sidebar entry still must NOT declare `sidebar.workspaces.directoryFlow`
 *     (the kernel declaration ledger allows one declaring entry, and the shadowed
 *     WorkspaceBrowser still holds it) — a regression guard for that decision.
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
/** Native (macOS Finder) picker knobs: support probe answer and the POST result.
 *  Default false = a host that cannot serve the Finder chooser; the macOS scenarios
 *  opt in explicitly (see the merged 「添加工作区」 cases at the end). */
let nativeSupported = false
let nativePickResult = { ok: true, path: null }
let nativeProbeFailure = null
let nativePickCalls = 0
globalThis.fetch = async (url, init) => {
  const path = String(url)
  if (path.endsWith('/archive/guardCheck')) {
    guardCalls.push(JSON.parse(init?.body ?? '{}'))
    if (guardFailure !== null) throw new Error(guardFailure)
    const body = typeof guardAnswer === 'function' ? guardAnswer(guardCalls) : guardAnswer
    return { json: async () => body }
  }
  if (path.endsWith('/picker/native')) {
    if (init?.method === 'GET') {
      if (nativeProbeFailure !== null) throw new Error(nativeProbeFailure)
      return { json: async () => (nativeSupported ? { ok: true, platform: 'darwin', supported: true } : { ok: true, platform: 'linux', supported: false }) }
    }
    nativePickCalls += 1
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


/**
 * Faithful miniature of the kernel's SlotCore ledger: `register` refuses to declare a
 * child key that already has a spec (the exact error the real kernel throws), and
 * `releaseEntry` clears every declared child's spec AND cascades into its occupants.
 * Without emulating the refusal, the dual-track patch assertions would be vacuous.
 */
const makeLedgerCore = (hole, occupant) => {
  const records = new Map()
  const record = (key, init = {}) => {
    const rec = { spec: undefined, declaredBy: undefined, parent: undefined, declarationEpoch: 0, entries: [], declared: 0, ...init }
    records.set(key, rec)
    return rec
  }
  record('sidebar.workspaces', { spec: { kind: 'single', scope: 'root' }, declaredBy: '(the shell)', declarationEpoch: 1, entries: [] })
  record(hole, {
    spec: { kind: 'single', scope: 'root' },
    declaredBy: 'an entry in "sidebar.workspaces" (kernel WorkspaceBrowser)',
    parent: 'sidebar.workspaces',
    declarationEpoch: 1,
    entries: occupant === undefined ? [] : [occupant],
  })
  let notifyCount = 0
  const core = {
    records,
    get notifyCount() { return notifyCount },
    notifyDeclaration: () => { notifyCount += 1 },
    register(options, component) {
      // Only the child-declaration refusal is part of the model under test; unrelated
      // slots (settings.plugins.tab, conversation.composer, …) are auto-declared so the
      // harness does not fabricate failures the real kernel would not produce.
      let rec = records.get(options.name)
      if (rec === undefined || rec.spec === undefined) rec = record(options.name, { spec: { kind: 'list', scope: 'root' }, declarationEpoch: 1, entries: [] })
      if (options.children) {
        for (const key of Object.keys(options.children)) {
          const child = records.get(key)
          if (child !== undefined && child.spec !== undefined) {
            throw new Error(`slot "${key}" is already declared (by ${child.declaredBy ?? 'an unknown entry'})`)
          }
        }
      }
      const entry = { options, component, children: options.children }
      rec.entries = rec.entries.concat([entry])
      if (options.children) {
        for (const [key, spec] of Object.entries(options.children)) {
          const child = records.get(key) ?? record(key)
          child.spec = spec
          child.declaredBy = `an entry in "${options.name}"`
          child.parent = options.name
          child.declarationEpoch += 1
          child.declared += 1
          core.notifyDeclaration(child)
        }
      }
      return () => {
        rec.entries = rec.entries.filter((item) => item !== entry)
        core.releaseEntry(entry)
      }
    },
    releaseEntry(entry) {
      if (!entry.children) return
      for (const key of Object.keys(entry.children)) {
        const child = records.get(key)
        if (child === undefined) continue
        const dropped = child.entries
        child.spec = undefined
        child.declaredBy = undefined
        child.parent = undefined
        child.declarationEpoch += 1
        child.entries = []
        for (const item of dropped) core.releaseEntry(item)
      }
    },
  }
  return core
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

/** uiWorkspace stub: the official surfaces the plugin consumes (native + browse). */
const makeUiWorkspace = (override = {}) => ({
  pickDirectory: async () => null,
  listDirectory: async () => ({ path: '/home/tny', home: '/home/tny', crumbs: [], entries: [], truncated: false }),
  createDirectory: async (path, name) => `${path}/${name}`,
  ...override,
})

/** Service table read through `ctx.get(name)`; property reads need a declaration. */
const makeServices = (registrations, uiWorkspace, calls, state) => ({
  slots: {
    // `_core` only exists when the harness installed a ledger (the dual-track probe).
    _core: state.core,
    inject: (key, callback) => {
      calls.injects.push(key)
      try { callback() } catch (error) { calls.errors.push(`slots.inject(${key}) threw: ${error?.message}`) }
      return () => {}
    },
    register: (options, component) => {
      registrations.push({ ...options, component })
      // Delegate into the ledger so the patch (and its failure modes) really runs.
      const dispose = state.core === undefined ? () => {} : state.core.register(options, component)
      return () => dispose()
    },
    entries: (key) => (state.core === undefined ? [] : (state.core.records.get(key)?.entries ?? [])),
    subscribe: () => () => {},
  },
  sessions: {
    // Live store: `liveSessionRow` in the plugin reads this, so the harness can move the
    // running bit between a render and a click (the render-snapshot staleness window).
    list: { getSnapshot: () => state.sessionSnapshot },
    create: async (input) => { calls.sessionCreate.push(input); return 'session-id' },
    open: () => {},
    clear: () => {},
    refresh: () => {},
  },
  workspaces: {
    list: { getSnapshot: () => ({ items: [], archivedSessionIds: [], phase: 'ready' }) },
    create: async (input) => { calls.workspaceCreate.push(input); return { workspaceId: 'ws-' + calls.workspaceCreate.length, path: input.path } },
    delete: async () => {},
    rename: async () => {},
    archiveSession: async (sessionId) => { calls.archived.push(String(sessionId)); },
  },
  connection: { isLoopback: true, rpc: { call: async () => ({ ok: true, value: {} }) } },
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
async function boot(makeOverrides = {}, ledgerOption, hostFacts = {}) {
  const registrations = []
  const calls = { injects: [], errors: [], workspaceCreate: [], sessionCreate: [], listDirectory: [], createDirectory: [], pickDirectory: 0, archived: [], guardChecks: [], renderSlot: [] }
  const moduleIds = []
  const state = { sessionSnapshot: { ids: [], byId: {}, current: undefined, phase: 'ready' }, core: ledgerOption }
  const uiWorkspace = makeUiWorkspace(typeof makeOverrides === 'function' ? makeOverrides(calls) : makeOverrides)

  globalThis.window.__ModuleLoader__ = {
    load: ({ id, factory }) => {
      moduleIds.push(id)
      globalThis.__smokeExports = factory((spec) => {
        if (spec === 'react') return React
        throw new Error(`module table miss: ${spec}`)
      })
    },
  }

  guardCalls = []
  guardFailure = null
  nativeSupported = hostFacts.native === true
  nativePickCalls = 0
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
const renderSlotStub = (calls) => (key, owner) => {
  calls.renderSlot.push({ key, owner })
  return { type: 'official-flow-marker', props: { key, owner } }
}

const sidebarProps = (face, wide, state = { sessionSnapshot: { ids: [], byId: {}, current: undefined, phase: 'ready' } }, calls) => ({
  ...face,
  wide,
  ...(calls === undefined ? {} : { renderSlot: renderSlotStub(calls) }),
  useSessions: (select) => select(state.sessionSnapshot),
  useWorkspaces: (select) => select({ items: [], archivedSessionIds: [], phase: 'ready' }),
})

/** Sidebar props carrying one workspace with the given session rows (archive-gate audit). */
const sidebarPropsWith = (face, rows, current, state, calls) => {
  const ids = rows.map((row) => row.id)
  // Publishing into the mutable store keeps `useSessions` and the plugin's `liveSessionRow`
  // reading one source, exactly like the shipped controller does.
  state.sessionSnapshot = {
    ids,
    byId: Object.fromEntries(rows.map((row) => [row.id, row])),
    current,
    phase: 'ready',
  }
  return {
    ...face,
    wide: true,
    ...(calls === undefined ? {} : { renderSlot: renderSlotStub(calls) }),
    // The kernel's pending-interaction seat (Map<SessionId, {kind}>), exactly as the
    // shipped `dsh-client-ui-session` contributes it to every `sidebar.workspaces` entry.
    useSessionPendingInteraction: (select) => select(new Map(rows.filter((row) => row.pending !== undefined).map((row) => [row.id, row.pending]))),
    useSessions: (select) => select(state.sessionSnapshot),
    useWorkspaces: (select) => select({
      items: [{ workspaceId: 'ws-1', path: '/home/tny/work', title: 'work', sessionIds: ids }],
      archivedSessionIds: [],
      phase: 'ready',
    }),
  }
}

/** The row's archive affordance: enabled rows read "移至归档", gated rows read the reason. */
const archiveButton = (tree) => findNode(tree, (node) => node?.props?.type === 'button'
  && /^(移至归档|会话运行中)/.test(String(node?.props?.title ?? '')))

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
  check('sidebar entry declares no child slot (kernel ledger holds directoryFlow)', entry.children === undefined)
  check('other seats still registered', harness.registrations.some((r) => r.name === 'settings.plugins.tab')
    && harness.registrations.some((r) => r.name === 'conversation.composer'))
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
  const propsWith = (rows) => sidebarPropsWith(face, rows, undefined, harness.state)

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
  check('audit: the pending-interaction seat is consumed', source.includes('useSessionPendingInteraction'))
  check('audit: the dead row.pendingInteraction read is gone', !/if \(row\.pendingInteraction\)/.test(source))
  check('audit: the archive action re-checks running state',
    /onArchiveSession = useCallback[\s\S]{0,1600}?live\.running/.test(source))
  check('audit: the host guard route is wired', readFileSync(join(root, 'lib/index.js'), 'utf8').includes('guardCheck'))
}


// ───────── dual-track: official directory flow first, self-held dialog as fallback ─────────

{
  const occupant = { options: { priority: 0, id: 'official-browse-surface' }, component: () => null }
  const core = makeLedgerCore('sidebar.workspaces.directoryFlow', occupant)
  const harness = await boot({}, core)
  const mounted = mount(harness)
  const { entry, face, Browser } = mounted
  const hole = 'sidebar.workspaces.directoryFlow'

  const before = core.records.get(hole)
  check('dual-track: sidebar entry declares the directory-flow hole', JSON.stringify(Object.keys(entry.children ?? {})) === JSON.stringify([hole]))
  check('dual-track: the kernel ledger still owns the declaration',
    before.declaredBy === 'an entry in "sidebar.workspaces" (kernel WorkspaceBrowser)' && before.declarationEpoch === 1)
  check('dual-track: the official occupant was not disturbed',
    before.entries.length === 1 && before.entries[0] === occupant)
  check('dual-track: no synthetic declaration notification fired', core.notifyCount === 0)
  check('dual-track: apply stayed error-free', harness.calls.errors.length === 0)

  // The component must render the official occupant's hole and drive it through owner props.
  const props = sidebarPropsWith(face, [], undefined, harness.state, harness.calls)
  const tree = await settle(Browser, props)
  const marker = findNode(tree, (n) => n?.type === 'official-flow-marker')
  check('dual-track: the official flow is rendered into the sidebar', marker !== undefined)
  check('dual-track: the owner contract is handed to the occupant',
    marker !== undefined && marker.props.owner !== undefined
    && marker.props.owner.open === false && marker.props.owner.busy === false
    && typeof marker.props.owner.onPicked === 'function'
    && typeof marker.props.owner.onCancel === 'function'
    && typeof marker.props.owner.onError === 'function')

  const button = findNode(tree, (n) => n?.props?.title === '添加工作区')
  await button.props.onClick()
  const after = await settle(Browser, props)
  const openedMarker = findNode(after, (n) => n?.type === 'official-flow-marker')
  check('dual-track: add-workspace opens the official flow instead of the self-held dialog',
    openedMarker !== undefined && openedMarker.props.owner.open === true
    && pickerPanel(after) === undefined && harness.calls.pickDirectory === 0)

  // Releasing our entry must not cascade the official occupant away.
  for (const dispose of harness.registrations.disposers ?? []) dispose()
  const afterRelease = core.records.get(hole)
  check('dual-track: releasing our entry keeps the declaration and the occupant',
    afterRelease.spec !== undefined
    && afterRelease.declaredBy === 'an entry in "sidebar.workspaces" (kernel WorkspaceBrowser)'
    && afterRelease.entries.length === 1 && afterRelease.entries[0] === occupant)
}

{
  // No ledger internals: the plugin must fall back to the self-held dialog, unchanged.
  const harness = await boot({})
  const { entry, face } = mount(harness)
  check('fallback: no child slot is declared without the bridge', entry.children === undefined)
  const props = sidebarPropsWith(face, [], undefined, harness.state, harness.calls)
  const tree = await settle(mount(harness).Browser, props)
  check('fallback: no official flow marker is rendered', findNode(tree, (n) => n?.type === 'official-flow-marker') === undefined)
  check('fallback: apply stayed error-free', harness.calls.errors.length === 0)
}


// ─────────── 「添加工作区」单一入口：macOS 直达 Finder，其余环境走内置浏览 ───────────

{
  nativePickResult = { ok: true, path: '/Users/tny/Desktop/work/finder-pick' }
  const harness = await boot((calls) => ({ pickDirectory: async () => { calls.pickDirectory += 1; return '/tmp/should-not-be-used' } }), undefined, { native: true })
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
  const harness = await boot({}, undefined, { native: true })
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
  const harness = await boot({}, undefined, { native: true })
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

console.log(failures.length === 0 ? '\nsmoke: PASS' : `\nsmoke: FAIL (${failures.length})`)
if (failures.length > 0) process.exitCode = 1
