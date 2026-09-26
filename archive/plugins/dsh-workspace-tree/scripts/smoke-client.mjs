/**
 * Headless wiring check for the plugin's browser half.
 *
 * v3.0.0 hands the workspace list back to the official ui-workspace and keeps only an
 * archive area, so this test boots the built `lib/client.js` through a
 * `window.__ModuleLoader__.load` stub and asserts exactly that surface:
 *
 *   - the two registrations are `sidebar.panellist` (the sidebar icon) and `main` with a
 *     matching key — NOT `sidebar.workspaces` (which must stay the official occupant's);
 *   - the panel groups archived Sessions by Workspace, with unattributed ones under
 *     「未分组」, and hides subagent-origin / blank rows;
 *   - the group and panel actions hit the documented Host routes with the documented
 *     bodies, and a fail-loud partial failure is surfaced to the user;
 *   - the read-only composer takeover selects only an archived current Session and
 *     toggles the body attribute the CSS whitelist keys off.
 *
 * Run with: node scripts/smoke-client.mjs [plugin-dir]
 */

import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join, resolve } from 'node:path'

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

const bodyAttrs = new Map()
globalThis.document = {
  head: { appendChild: () => {} },
  createElement: () => ({ setAttribute: () => {}, set textContent(_v) {}, remove: () => {} }),
  body: {
    setAttribute: (k, v) => { bodyAttrs.set(k, String(v)) },
    removeAttribute: (k) => { bodyAttrs.delete(k) },
    getAttribute: (k) => (bodyAttrs.has(k) ? bodyAttrs.get(k) : null),
  },
}
globalThis.window = { addEventListener: () => {}, removeEventListener: () => {} }

/** Host-route stub. Records every call and answers from the knobs below. */
let httpCalls = []
let guardAnswer = { ok: true, status: 'idle', running: false }
let guardFailure = null
let tombstoneAlive = []
let tombstoneFailure = null
let deleteAllAnswer = { ok: true, restored: [], deleted: [], failed: [] }
let deleteOneAnswer = { ok: true, deleted: [] }
globalThis.fetch = async (url, init) => {
  const path = String(url)
  const body = init?.body ? JSON.parse(init.body) : {}
  httpCalls.push({ path, body })
  const json = (value) => ({ json: async () => value })
  if (path.endsWith('/archive/guardCheck')) {
    if (guardFailure !== null) throw new Error(guardFailure)
    return json(typeof guardAnswer === 'function' ? guardAnswer(body) : guardAnswer)
  }
  if (path.endsWith('/archive/tombstoneCheck')) {
    if (tombstoneFailure !== null) throw new Error(tombstoneFailure)
    return json(typeof tombstoneAlive === 'function' ? tombstoneAlive(body) : { ok: true, alive: tombstoneAlive })
  }
  if (path.endsWith('/archive/pruneStale')) return json({ ok: true, pruned: [] })
  if (path.endsWith('/archive/delete')) return json(deleteOneAnswer)
  if (path.endsWith('/archive/deleteAll') || path.endsWith('/archive/unarchiveAll')) return json(deleteAllAnswer)
  throw new Error(`unexpected fetch: ${path}`)
}

// ─────────────────────────── mini React (hooks runtime) ───────────────────────────

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

const slotAt = () => ({ instance: currentInstance, index: currentInstance.cursor++ })

const React = {
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
  try { return type(props) } finally { currentInstance = previous }
}

const isClassComponent = (type) => typeof type === 'function'
  && type.prototype !== undefined && typeof type.prototype.render === 'function'

const expand = (node, depth = 0) => {
  if (Array.isArray(node)) return node.map((child) => expand(child, depth))
  if (node === null || typeof node !== 'object') return node
  if (isClassComponent(node.type)) {
    // Class components (the bundle's ErrorBoundary): construct, propagate props, render.
    const instance = new node.type(node.props)
    instance.props = node.props
    if (instance.state === undefined) instance.state = {}
    return expand(instance.render(), depth + 1)
  }
  if (typeof node.type === 'function') return expand(runComponent(node.type, node.props, depth + 1), depth + 1)
  if (typeof node.type === 'string') {
    const props = { ...node.props }
    if (props.children !== undefined) props.children = expand(props.children, depth)
    return { type: node.type, props }
  }
  return node
}

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

async function settle(component, props, rounds = 8) {
  let tree = renderPass(component, props)
  for (let i = 0; i < rounds; i += 1) {
    await new Promise((r) => setTimeout(r, 0))
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
const textOf = (node) => {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (node !== null && typeof node === 'object' && node.props !== undefined) return textOf(node.props.children)
  return ''
}
const findButtonByText = (tree, text) => findNode(tree, (node) =>
  node?.type === 'button' && textOf(node).includes(text))

// ────────────────────────────── primitive stubs ──────────────────────────────

const primitiveStubs = new Map()
const stubComponent = (key) => {
  switch (key) {
    case 'Button':
      return (props) => React.createElement('button', {
        type: 'button',
        className: props.className,
        disabled: props.disabled,
        title: props.title,
        onClick: props.onClick,
        children: props.children,
      })
    case 'Modal':
      return (props) => (props.open === false ? null : React.createElement('div', {
        className: 'stub-modal',
        'data-title': props.title,
        children: [
          React.createElement('div', { className: 'stub-modalTitle' }, props.title),
          props.description ? React.createElement('div', { className: 'stub-modalBody' }, props.description) : null,
          props.footer,
        ],
      }))
    case 'StateDot':
      return (props) => React.createElement('span', { className: 'stub-statedot', 'data-state': props.state })
    case 'relativeTime':
      return (at, now) => {
        const minutes = Math.floor(Math.max(0, now - at) / 60000)
        if (minutes < 1) return { unit: 'now', n: 0 }
        if (minutes < 60) return { unit: 'minutes', n: minutes }
        const hours = Math.floor(minutes / 60)
        if (hours < 24) return { unit: 'hours', n: hours }
        return { unit: 'days', n: Math.floor(hours / 24) }
      }
    default:
      // Icon components and anything else: a null-rendering stand-in.
      return () => null
  }
}
const primitivesStub = new Proxy({}, {
  get: (_t, key) => {
    if (typeof key !== 'string') return undefined
    if (!primitiveStubs.has(key)) primitiveStubs.set(key, stubComponent(key))
    return primitiveStubs.get(key)
  },
})

// ──────────────────────────────── bundle harness ────────────────────────────────

let harnessSeq = 0
const registrations = []
const calls = { injects: [], errors: [], openSession: [], unarchive: [], refresh: 0, composerSelects: [] }
let composerEntry = null
let localeZh = {}

const services = {
  slots: {
    inject: (key, callback) => {
      calls.injects.push(key)
      try { callback() } catch (error) { calls.errors.push(`slots.inject(${key}) threw: ${error?.message}`) }
      return () => {}
    },
    register: (options, component) => {
      const record = { ...options, component }
      registrations.push(record)
      return () => {}
    },
    entries: (key) => registrations.filter((row) => row.name === key).map((row) => ({ options: row })),
    entriesOfSlot: (key) => registrations.filter((row) => row.name === key),
    getVersion: () => registrations.length,
    subscribe: () => () => {},
  },
  sessions: {
    list: { getSnapshot: () => state.sessionSnapshot },
    refresh: () => { calls.refresh += 1 },
  },
  workspaces: {
    list: { getSnapshot: () => state.workspaceSnapshot },
    unarchiveSession: async (sessionId) => { calls.unarchive.push(String(sessionId)) },
  },
  locale: {
    register: (ns, dict) => {
      if (dict && typeof dict === 'object' && dict.zh) localeZh = dict.zh
      return () => {}
    },
    bind: (ns) => (key, params) => {
      const raw = (typeof localeZh[key] === 'string') ? localeZh[key] : `${ns}:${key}`
      if (params === undefined) return raw
      return raw.replace(/\{(\w+)\}/g, (m, name) => (Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : m))
    },
    getSnapshot: () => ({ active: 'zh' }),
    subscribe: () => () => {},
  },
}

const state = {
  sessionSnapshot: { ids: [], byId: {}, phase: 'ready' },
  workspaceSnapshot: { items: [], archivedSessionIds: [], phase: 'ready' },
}

/** Cordis-faithful context: an undeclared service read throws. */
function makeCtx(declared) {
  const base = {
    effect: (fn) => { const dispose = fn(); return typeof dispose === 'function' ? dispose : () => {} },
    on: () => () => {},
    get: (name) => {
      if (name === 'uiWorkspace') {
        return {
          clearArchivedCurrent: () => false,
          openSession: (id) => { calls.openSession.push(String(id)) },
          unarchiveSession: async (id) => { calls.unarchive.push(String(id)) },
        }
      }
      return services[name]
    },
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

async function boot() {
  registrations.length = 0
  calls.injects.length = 0
  calls.errors.length = 0
  calls.openSession.length = 0
  calls.unarchive.length = 0
  calls.refresh = 0
  httpCalls = []
  guardAnswer = { ok: true, status: 'idle', running: false }
  guardFailure = null
  tombstoneAlive = []
  tombstoneFailure = null
  deleteAllAnswer = { ok: true, restored: [], deleted: [], failed: [] }
  deleteOneAnswer = { ok: true, deleted: [] }
  storage.clear()
  bodyAttrs.clear()
  state.sessionSnapshot = { ids: [], byId: {}, phase: 'ready' }
  state.workspaceSnapshot = { items: [], archivedSessionIds: [], phase: 'ready' }
  composerEntry = null

  globalThis.window.__ModuleLoader__ = {
    load: ({ id, factory }) => {
      globalThis.__smokeExports = factory((spec) => {
        if (spec === 'react') return React
        if (spec === '@deepseek-ai/dsh-client-ui-primitives') return primitivesStub
        throw new Error(`module table miss: ${spec}`)
      })
    },
  }
  harnessSeq += 1
  await import(`${pathToFileURL(join(root, 'lib/client.js')).href}?smoke=${harnessSeq}`)
  const exported = globalThis.__smokeExports
  const ctx = makeCtx(exported.inject ?? [])
  exported.apply(ctx)
  return { exported, ctx }
}

/** Locate the archive panel registration and the sidebar icon registration. */
const panelEntry = () => registrations.find((row) => row.name === 'main' && row.key === 'workspace-archive')
const iconEntry = () => registrations.find((row) => row.name === 'sidebar.panellist' && row.id === 'workspace-archive')

/** The bound translator the `locale: NS` declaration injects in the real renderer. */
const t = (key, params) => {
  const raw = (typeof localeZh[key] === 'string') ? localeZh[key] : key
  if (params === undefined) return raw
  return raw.replace(/\{(\w+)\}/g, (m, name) => (Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : m))
}

/** Panel props: the inject face plus the two snapshot-selector seats and the locale seat. */
const panelProps = () => {
  const entry = panelEntry()
  return {
    ...entry.inject(),
    t,
    useSessions: (select) => select(state.sessionSnapshot),
    useWorkspaces: (select) => select(state.workspaceSnapshot),
  }
}

const setRows = (rows) => {
  state.sessionSnapshot = {
    ids: rows.map((r) => r.id),
    byId: Object.fromEntries(rows.map((r) => [r.id, r])),
    phase: 'ready',
  }
}
const setWorkspaces = (items, archivedSessionIds) => {
  state.workspaceSnapshot = { items, archivedSessionIds, phase: 'ready' }
}

const row = (id, extra = {}) => ({
  id, displayTitle: 'Session ' + id, updatedAt: Date.now() - 60000, running: false, blank: false, ...extra,
})

// ══════════════════════════════ scenarios ══════════════════════════════

// ── 1. registration surface ───────────────────────────────────────────────────
{
  await boot()
  check('registers nothing into sidebar.workspaces (official occupant keeps it)',
    registrations.every((r) => r.name !== 'sidebar.workspaces'))
  check('registers the archive sidebar icon as sidebar.panellist',
    !!iconEntry() && iconEntry().label !== undefined)
  check('registers the archive panel as main with the matching key',
    !!panelEntry() && panelEntry().key === 'workspace-archive')
  check('declares its locale namespace on both registrations',
    iconEntry().locale === 'dsh-workspace-tree' && panelEntry().locale === 'dsh-workspace-tree')
  check('subscribes the read-only composer takeover',
    calls.injects.includes('conversation.composer'))
  check('no inject callback threw', calls.errors.length === 0)
  const mods = registrations.map((r) => r.name).sort()
  check('registers exactly panellist + main + composer', mods.join(',') === 'conversation.composer,main,sidebar.panellist')
}

// ── 2. grouping ───────────────────────────────────────────────────────────────
{
  await boot()
  setRows([
    row('a', { displayTitle: 'Alpha' }),
    row('b', { displayTitle: 'Beta' }),
    row('u', { displayTitle: 'Unowned' }),
    row('sub', { displayTitle: 'Child', origin: 'subagent' }),
    row('draft', { displayTitle: 'Draft', blank: true }),
    row('live', { displayTitle: 'Live' }),
  ])
  setWorkspaces(
    [{ workspaceId: 'ws-1', path: '/home/tny/work', title: 'work', sessionIds: ['a', 'b', 'sub', 'draft', 'live'] }],
    ['a', 'u', 'sub', 'draft'],
  )
  const tree = await settle(panelEntry().component, panelProps())
  const text = textOf(tree)
  check('groups an archived workspace Session under its Workspace',
    text.includes('work · 1 条') && text.includes('Alpha'))
  check('puts an unowned archived Session under 未分组', text.includes('未分组') && text.includes('Unowned'))
  check('hides subagent-origin archived Sessions', !text.includes('Child'))
  check('hides blank archived Sessions', !text.includes('Draft'))
  check('hides unarchived Sessions', !text.includes('Live'))
  check('shows the archive total', text.includes('共 2 条有效归档'))
}

// ── 3. empty state ────────────────────────────────────────────────────────────
{
  await boot()
  setRows([row('live')])
  setWorkspaces([], [])
  const tree = await settle(panelEntry().component, panelProps())
  check('renders the empty state with no archives', textOf(tree).includes('归档区为空'))
  check('offers no bulk actions when the archive is empty',
    findNode(tree, (n) => n?.type === 'button' && textOf(n).includes('一键恢复所有')) === undefined)
}

// ── 4. single restore / delete hit the official controller and the Host route ──
{
  await boot()
  setRows([row('a', { displayTitle: 'Alpha' })])
  setWorkspaces([{ workspaceId: 'ws-1', path: '/home/tny/work', title: 'work', sessionIds: ['a'] }], ['a'])
  let tree = await settle(panelEntry().component, panelProps())
  // Restore icon -> confirm modal -> confirm
  const restoreBtn = findNode(tree, (n) => n?.type === 'button' && n.props.title === '恢复')
  check('row exposes a restore control', !!restoreBtn)
  restoreBtn.props.onClick()
  tree = await settle(panelEntry().component, panelProps())
  const confirm = findNode(tree, (n) => n?.props?.className === 'stub-modal')
  check('restore asks for confirmation first', !!confirm)
  const confirmBtn = findButtonByText(tree, '确认')
  check('confirmation offers a confirm button', !!confirmBtn)
  confirmBtn.props.onClick()
  await settle(panelEntry().component, panelProps())
  check('restoring goes through the official unarchive command', calls.unarchive.includes('a'))
}

// ── 5. single delete posts to /archive/delete and tombstones ───────────────────
{
  await boot()
  setRows([row('a', { displayTitle: 'Alpha' })])
  setWorkspaces([{ workspaceId: 'ws-1', path: '/home/tny/work', title: 'work', sessionIds: ['a'] }], ['a'])
  let tree = await settle(panelEntry().component, panelProps())
  const deleteBtn = findNode(tree, (n) => n?.type === 'button' && n.props.title === '永久删除')
  deleteBtn.props.onClick()
  tree = await settle(panelEntry().component, panelProps())
  findButtonByText(tree, '永久删除').props.onClick()
  await settle(panelEntry().component, panelProps(), 12)
  const call = httpCalls.find((c) => c.path.endsWith('/archive/delete'))
  check('permanent delete posts the sessionId to /archive/delete',
    !!call && call.body.sessionId === 'a')
  check('a deleted Session is tombstoned locally',
    JSON.parse(storage.get('dswt-workspace-tree.deleted') ?? '[]').includes('a'))
}

// ── 5b. cancelling the delete confirmation must leave everything untouched ─────
{
  await boot()
  setRows([row('a', { displayTitle: 'Alpha' })])
  setWorkspaces([{ workspaceId: 'ws-1', path: '/home/tny/work', title: 'work', sessionIds: ['a'] }], ['a'])
  let tree = await settle(panelEntry().component, panelProps())
  check('the archived row is visible before the confirmation opens', textOf(tree).includes('Alpha'))
  findNode(tree, (n) => n?.type === 'button' && n.props.title === '永久删除').props.onClick()
  tree = await settle(panelEntry().component, panelProps())
  const cancel = findButtonByText(tree, '取消')
  check('the delete confirmation offers a cancel button', !!cancel)
  cancel.props.onClick()
  tree = await settle(panelEntry().component, panelProps(), 12)
  check('cancelling does not POST /archive/delete',
    !httpCalls.some((c) => c.path.endsWith('/archive/delete')))
  check('cancelling writes no local tombstone',
    (storage.get('dswt-workspace-tree.deleted') ?? '[]') === '[]')
  check('cancelling leaves the archived row visible', textOf(tree).includes('Alpha'))
}

// ── 6. bulk actions carry the right scope bodies ──────────────────────────────
{
  await boot()
  setRows([row('a'), row('u')])
  setWorkspaces([{ workspaceId: 'ws-1', path: '/home/tny/work', title: 'work', sessionIds: ['a'] }], ['a', 'u'])
  let tree = await settle(panelEntry().component, panelProps())
  findButtonByText(tree, '一键删除所有').props.onClick()
  tree = await settle(panelEntry().component, panelProps())
  findButtonByText(tree, '永久删除').props.onClick()
  await settle(panelEntry().component, panelProps(), 12)
  const all = httpCalls.find((c) => c.path.endsWith('/archive/deleteAll'))
  check('delete-all sends the explicit all:true scope (never an empty body)', !!all && all.body.all === true)
}

// ── 7. group delete scopes by workspace, and the ungrouped group by null ──────
{
  await boot()
  setRows([row('a'), row('u')])
  setWorkspaces([{ workspaceId: 'ws-1', path: '/home/tny/work', title: 'work', sessionIds: ['a'] }], ['a', 'u'])
  const tree = await settle(panelEntry().component, panelProps())
  const groupDelete = findNode(tree, (n) => n?.type === 'button' && n.props.title === '永久删除该工作区全部')
  const ungroupedDelete = findNode(tree, (n) => n?.type === 'button' && n.props.title === '永久删除未分组全部')
  check('a workspace group delete is scoped by workspaceId', !!groupDelete)
  check('the ungrouped group delete uses the null scope', !!ungroupedDelete)
  groupDelete.props.onClick()
  await settle(panelEntry().component, panelProps())
  findButtonByText(await settle(panelEntry().component, panelProps()), '永久删除').props.onClick()
  await settle(panelEntry().component, panelProps(), 12)
  const scoped = httpCalls.find((c) => c.path.endsWith('/archive/deleteAll'))
  check('group delete sends its workspaceId', !!scoped && scoped.body.workspaceId === 'ws-1')
}

// ── 8. fail-loud partial failure is surfaced per item ─────────────────────────
{
  await boot()
  deleteAllAnswer = { ok: true, restored: [], deleted: ['a'], failed: [{ sessionId: 'b', error: 'EPERM' }] }
  setRows([row('a'), row('b')])
  setWorkspaces([{ workspaceId: 'ws-1', path: '/home/tny/work', title: 'work', sessionIds: ['a', 'b'] }], ['a', 'b'])
  let tree = await settle(panelEntry().component, panelProps())
  findButtonByText(tree, '一键删除所有').props.onClick()
  tree = await settle(panelEntry().component, panelProps())
  findButtonByText(tree, '永久删除').props.onClick()
  tree = await settle(panelEntry().component, panelProps(), 12)
  const notice = findNode(tree, (n) => n?.props?.className === 'stub-modal')
  const noticeText = textOf(notice)
  check('a partial delete failure is reported with the failing id and reason',
    !!notice && noticeText.includes('部分会话删除失败') && noticeText.includes('b') && noticeText.includes('EPERM'))
  check('successful deletions are still tombstoned',
    JSON.parse(storage.get('dswt-workspace-tree.deleted') ?? '[]').includes('a'))
  check('failed deletions are NOT tombstoned',
    !JSON.parse(storage.get('dswt-workspace-tree.deleted') ?? '[]').includes('b'))
}

// ── 8b. a retained entry (host still holds the Session) stays put and is explained ─
{
  await boot()
  deleteOneAnswer = { ok: true, deleted: ['a'], retained: ['a'] }
  setRows([row('a', { displayTitle: 'Alpha' })])
  setWorkspaces([{ workspaceId: 'ws-1', path: '/home/tny/work', title: 'work', sessionIds: ['a'] }], ['a'])
  let tree = await settle(panelEntry().component, panelProps())
  findNode(tree, (n) => n?.type === 'button' && n.props.title === '永久删除').props.onClick()
  tree = await settle(panelEntry().component, panelProps())
  findButtonByText(tree, '永久删除').props.onClick()
  tree = await settle(panelEntry().component, panelProps(), 12)
  const notice = textOf(findNode(tree, (n) => n?.props?.className === 'stub-modal'))
  check('a retained delete explains why the entry stays',
    notice.includes('重启 DSH') && notice.includes('未分组'))
  check('a retained id is NOT tombstoned, so its archive row stays visible',
    (storage.get('dswt-workspace-tree.deleted') ?? '[]') === '[]')
}

// ── 8c. a mixed delete tombstones only the id the host actually dropped ─────────
{
  await boot()
  deleteOneAnswer = { ok: true, deleted: ['gone'], retained: [] }
  setRows([row('gone', { displayTitle: 'Gone' })])
  setWorkspaces([{ workspaceId: 'ws-1', path: '/home/tny/work', title: 'work', sessionIds: ['gone'] }], ['gone'])
  let tree = await settle(panelEntry().component, panelProps())
  findNode(tree, (n) => n?.type === 'button' && n.props.title === '永久删除').props.onClick()
  tree = await settle(panelEntry().component, panelProps())
  findButtonByText(tree, '永久删除').props.onClick()
  await settle(panelEntry().component, panelProps(), 12)
  check('an id the host dropped is tombstoned and hidden',
    JSON.parse(storage.get('dswt-workspace-tree.deleted') ?? '[]').includes('gone'))
}

// ── 9. tombstone self-healing uses the Host's physical-existence verdict ──────
{
  await boot()
  storage.set('dswt-workspace-tree.deleted', JSON.stringify(['alive-but-tombstoned']))
  tombstoneAlive = ['alive-but-tombstoned']
  setRows([row('alive-but-tombstoned', { displayTitle: 'Alive' })])
  setWorkspaces([{ workspaceId: 'ws-1', path: '/home/tny/work', title: 'work', sessionIds: ['alive-but-tombstoned'] }], ['alive-but-tombstoned'])
  const tree = await settle(panelEntry().component, panelProps(), 12)
  check('a tombstone whose directory still exists is revoked and the row returns',
    textOf(tree).includes('Alive'))
  check('the revoked tombstone is dropped from local storage',
    !JSON.parse(storage.get('dswt-workspace-tree.deleted') ?? '[]').includes('alive-but-tombstoned'))
}

// ── 9b. the manual tombstone reset clears the local record ────────────────────
{
  await boot()
  storage.set('dswt-workspace-tree.deleted', JSON.stringify(['ghost-1']))
  setRows([row('a')])
  setWorkspaces([{ workspaceId: 'ws-1', path: '/home/tny/work', title: 'work', sessionIds: ['a'] }], ['a'])
  let tree = await settle(panelEntry().component, panelProps(), 12)
  check('the panel reports the local delete-record count',
    textOf(tree).includes('1 条删除记录'))
  const reset = findButtonByText(tree, '清空删除记录')
  check('the panel offers a manual reset while records exist', !!reset)
  reset.props.onClick()
  tree = await settle(panelEntry().component, panelProps())
  findButtonByText(tree, '确认').props.onClick()
  await settle(panelEntry().component, panelProps(), 8)
  check('confirming the reset empties local storage',
    JSON.parse(storage.get('dswt-workspace-tree.deleted') ?? '[]').length === 0)
}

// ── 10. composer takeover only for an archived current Session ────────────────
{
  await boot()
  composerEntry = registrations.find((r) => r.name === 'conversation.composer')
  check('composer entry is a chain registration',
    !!composerEntry && typeof composerEntry.select === 'function')
  setWorkspaces([], ['archived-1'])
  const selected = composerEntry.select({ sessionId: 'archived-1' })
  check('composer selects an archived current Session', !!selected && selected.sessionId === 'archived-1')
  const notSelected = composerEntry.select({ sessionId: 'plain-1' })
  check('composer declines a normal current Session', notSelected === null)

  // Rendering the takeover banner must set the body attribute the CSS whitelist keys off.
  const banner = composerEntry.component({ sessionId: 'archived-1' })
  const bannerTree = await settle(() => banner, {}, 4)
  check('the read-only banner announces read-only mode',
    textOf(bannerTree).includes('当前会话已归档（只读模式）'))
  check('mounting the banner sets the documented body attribute',
    bodyAttrs.get('data-dswt-archived-session') === 'true')
  check('the banner offers a restore action',
    !!findNode(bannerTree, (n) => n?.type === 'button' && textOf(n).includes('恢复会话')))
}

// ─────────────────────────────────── verdict ───────────────────────────────────

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed`)
  process.exit(1)
}
console.log('\nclient smoke: all checks passed')
