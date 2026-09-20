/**
 * Headless check for the plugin's node half — today the `/archive/guardCheck` route that
 * gates archiving on the live `agents` status (the official RPC has no server-side guard,
 * so this route is the only authoritative answer the browser half can ask for).
 *
 * `lib/index.js` imports `@deepseek-ai/schemastery`, which is installed in the profile but
 * not in this repo copy, so the module is loaded with that single import stubbed — the
 * route under test uses no schema. The prefix handler is then driven with fake
 * request/response objects, exactly as the web carrier would call it.
 *
 * Run with: node scripts/smoke-host.mjs [plugin-dir]
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const pluginDir = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'))
const failures = []
const check = (label, ok) => {
  if (ok) console.log(`  ok   ${label}`)
  else { console.log(`  FAIL ${label}`); failures.push(label) }
}

const source = readFileSync(join(pluginDir, 'lib/index.js'), 'utf8')
if (!source.includes('import z from "@deepseek-ai/schemastery";')) throw new Error('schemastery import not found — harness needs updating')
const scratch = join(mkdtempSync(join(tmpdir(), 'dswt-host-')), 'index.mjs')
writeFileSync(scratch, source.replace(
  'import z from "@deepseek-ai/schemastery";',
  'const z = new Proxy({}, { get: () => () => z });',
))
const mod = await import(scratch)

const routes = []
const services = {}
const ctx = {
  get: (name) => services[name],
  // `getWorkspaceDomain` reads `ctx.storageDomain` directly (it is a hard dependency of
  // the plugin, so it is a declared service rather than an optional `ctx.get` lookup):
  // expose it as a live accessor so a test can install one per scenario.
  get storageDomain() { return services.storageDomain },
  effect: (fn) => { const dispose = fn(); return typeof dispose === 'function' ? dispose : () => {} },
  settings: { register: () => { throw new Error('settings unavailable in this harness') } },
  webServer: { register: (route) => { routes.push(route); return () => {} } },
}

mod.apply(ctx)
check('host half registers its prefix route', routes.length === 1 && routes[0].path === '/api/dsh-workspace-tree')

/**
 * Sentinel for `call`'s third argument: passing it leaves `services.agents` exactly as
 * the test set it, for cases that configure several services up front. Passing plain
 * `undefined` keeps the original meaning ("no agents service registered").
 */
const keepServices = Symbol('keep services as configured')

/** One request through the real prefix handler: returns the HTTP status plus the JSON body. */
const call = async (path, body, agents, method = 'POST') => {
  if (agents !== keepServices) {
    if (agents === undefined) delete services.agents
    else services.agents = agents
  }
  const res = {
    httpStatus: null,
    payload: null,
    writeHead(status) { this.httpStatus = status },
    end(text) { this.payload = JSON.parse(text) },
  }
  const req = {
    method,
    url: path,
    on(event, handler) {
      if (event === 'data') handler(Buffer.from(JSON.stringify(body)))
      if (event === 'end') handler()
      return this
    },
  }
  await routes[0].handler(req, res)
  return { httpStatus: res.httpStatus, ...(res.payload ?? {}) }
}

/**
 * Minimal `storageDomain` stand-in for the workspace domain: `mutateWorkspaceState`
 * falls back to `global`/`table` when no `workspaceRegistry` service is registered,
 * which is the shape the blank-delete route drives through `stripSessionIdsFromRegistry`.
 * The table implements the record store surface the route actually uses (get / entries /
 * update), and the live state is exposed so a test can assert the registry was stripped.
 */
const makeWorkspaceDomain = () => {
  const records = new Map()
  let state = { archivedSessionIds: [] }
  const table = {
    get: (id) => records.get(id),
    entries: () => records.entries(),
    set: (id, rec) => { records.set(id, rec) },
    update: async (id, mutator) => {
      const next = mutator(records.get(id))
      records.set(id, next)
      return next
    },
  }
  const domain = {
    global: {
      get: () => state,
      set: async (next) => { state = next },
    },
    table: (name) => {
      if (name !== 'workspaces') throw new Error(`unexpected table ${name}`)
      return table
    },
  }
  return { domain, table, records, state: () => state }
}

const previousDshHome = process.env.DSH_HOME
const restoreDshHome = () => {
  if (previousDshHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousDshHome
}
// Every guardCheck case scans the durable session topology, so point that scan at an
// empty scratch home instead of the operator's real ~/.dsh/sessions.
process.env.DSH_HOME = join(mkdtempSync(join(tmpdir(), 'dswt-guard-home-')), 'no-such-home')

const guard = '/api/dsh-workspace-tree/archive/guardCheck'

const runningCase = await call(guard, { sessionId: 's-1' }, { get: (id) => (id === 's-1' ? { id, status: 'running' } : undefined) })
check('running agent → { ok, status: "running", running: true }',
  runningCase.httpStatus === 200 && runningCase.ok === true && runningCase.running === true && runningCase.status === 'running')

const idleCase = await call(guard, { sessionId: 's-1' }, { get: () => ({ id: 's-1', status: 'idle' }) })
check('idle agent → running: false', idleCase.ok === true && idleCase.running === false && idleCase.status === 'idle')

const coldCase = await call(guard, { sessionId: 's-2' }, { get: () => undefined })
check('no live agent → status inactive, running false', coldCase.ok === true && coldCase.running === false && coldCase.status === 'inactive')

const noServiceCase = await call(guard, { sessionId: 's-3' }, undefined)
check('agents service absent → status unknown, running false (client fails open)',
  noServiceCase.ok === true && noServiceCase.running === false && noServiceCase.status === 'unknown')

const throwingCase = await call(guard, { sessionId: 's-4' }, { get: () => { throw new Error('registry disposed') } })
check('agents read failure → status unknown, still ok', throwingCase.ok === true && throwingCase.status === 'unknown')

const noIdCase = await call(guard, {}, { get: () => undefined })
check('missing sessionId is refused', noIdCase.ok === false && /sessionId/.test(String(noIdCase.error)))

const notFoundCase = await call('/api/dsh-workspace-tree/archive/doesNotExist', {}, undefined)
check('unknown sub-route still answers 404 JSON', notFoundCase.ok === false && /not found/.test(String(notFoundCase.error)))

// ─────── guardCheck: running subagent descendants from the durable topology ───────

const topoHome = mkdtempSync(join(tmpdir(), 'dswt-topo-'))
const writeSession = (id, header) => {
  const dir = join(topoHome, 'sessions', '--scope--', id)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'session.v1.jsonl'), JSON.stringify({ type: 'session', id, ...header }) + '\n')
}
writeSession('s-root', {})
writeSession('s-sub', { origin: 'subagent', parentSession: 's-root', delegationDepth: 1 })
writeSession('s-sub2', { origin: 'subagent', parentSession: 's-sub', delegationDepth: 2 })
writeSession('s-fork', { parentSession: 's-root' })
writeSession('s-fork-sub', { origin: 'subagent', parentSession: 's-fork', delegationDepth: 1 })
process.env.DSH_HOME = topoHome

/** agents stub: exactly the listed ids are live and running. */
const runningOnly = (...ids) => ({ get: (id) => (ids.includes(id) ? { id, status: 'running' } : undefined) })

const rootWithSub = await call(guard, { sessionId: 's-root' }, runningOnly('s-sub'))
check('guardCheck: a running subagent descendant is counted',
  rootWithSub.ok === true && rootWithSub.running === false && rootWithSub.runningDescendants === 1)

const rootWithGrandchild = await call(guard, { sessionId: 's-root' }, runningOnly('s-sub2'))
check('guardCheck: an uninterrupted grandchild counts for the root',
  rootWithGrandchild.runningDescendants === 1)

const forkCase = await call(guard, { sessionId: 's-root' }, runningOnly('s-fork-sub'))
check('guardCheck: a subagent under a plain fork never bubbles to the root',
  forkCase.runningDescendants === 0)
const forkOwnCase = await call(guard, { sessionId: 's-fork' }, runningOnly('s-fork-sub'))
check('guardCheck: …it still counts for the fork session itself',
  forkOwnCase.runningDescendants === 1)

const idleDescendants = await call(guard, { sessionId: 's-root' }, { get: () => ({ status: 'idle' }) })
check('guardCheck: idle descendants are not counted', idleDescendants.runningDescendants === 0)

const withoutAgents = await call(guard, { sessionId: 's-root' }, undefined)
check('guardCheck: without the agents service the descendant count stays 0 (fail open)',
  withoutAgents.ok === true && withoutAgents.runningDescendants === 0)

// ─────── physical-existence probe (auto-adopt gate + tombstone self-heal) ───────

const probe = '/api/dsh-workspace-tree/archive/tombstoneCheck'

process.env.DSH_HOME = join(mkdtempSync(join(tmpdir(), 'dswt-home-missing-')), 'no-such-home')
const unreadableRoot = await call(probe, { ids: ['session-x'] }, undefined)
check('tombstoneCheck: an unreadable sessions root answers ok:false, never "all dead"',
  unreadableRoot.httpStatus === 200 && unreadableRoot.ok === false && !Array.isArray(unreadableRoot.alive))

const scratchHome = mkdtempSync(join(tmpdir(), 'dswt-home-'))
mkdirSync(join(scratchHome, 'sessions'), { recursive: true })
process.env.DSH_HOME = scratchHome
const emptyRoot = await call(probe, { ids: ['session-x'] }, undefined)
check('tombstoneCheck: an enumerable root reports a missing id as not alive',
  emptyRoot.ok === true && Array.isArray(emptyRoot.alive) && emptyRoot.alive.length === 0)

mkdirSync(join(scratchHome, 'sessions', '--scope--', 'session-y'), { recursive: true })
const foundRoot = await call(probe, { ids: ['session-y'] }, undefined)
check('tombstoneCheck: an existing session directory is reported alive',
  foundRoot.ok === true && JSON.stringify(foundRoot.alive) === JSON.stringify(['session-y']))
restoreDshHome()

// ─────────────── POST /blank/deleteAll (delete every blank session) ───────────────
//
// The predicate is the official list projection's `blank`, so `sessionController.list()`
// is the sole authority and every exclusion (running / attached / subagent) is asserted
// by the ids that survive. Deletion reuses the archive cascade, so the assertions cover
// the real filesystem effect plus the registry strip, not just the response body.

const blankRoute = '/api/dsh-workspace-tree/blank/deleteAll'

/** A scratch home whose sessions root holds one directory per given id. */
const blankHome = (ids) => {
  const home = mkdtempSync(join(tmpdir(), 'dswt-blank-'))
  for (const id of ids) mkdirSync(join(home, 'sessions', '--scope--', id), { recursive: true })
  return home
}
/** `sessionController` stub whose list() reports exactly these summaries. */
const blankList = (items) => ({ list: async () => items })
const blankDirs = (home, id) => existsSync(join(home, 'sessions', '--scope--', id))

// Guard: the destructive route must demand the same explicit opt-in as /archive/deleteAll.
process.env.DSH_HOME = blankHome([])
services.sessionController = blankList([])
const noConfirm = await call(blankRoute, {}, keepServices)
check('blank/deleteAll: an unconfirmed call is refused (no implicit "delete everything")',
  noConfirm.ok === false && /all: true/.test(String(noConfirm.error)))

const badConfirm = await call(blankRoute, { all: 'yes' }, keepServices)
check('blank/deleteAll: a truthy-but-not-true flag is refused', badConfirm.ok === false)

// Without the authority there is no safe predicate — refuse rather than guess.
delete services.sessionController
const noAuthority = await call(blankRoute, { all: true }, undefined)
check('blank/deleteAll: without sessionController the route refuses instead of guessing blanks',
  noAuthority.ok === false && /sessionController/.test(String(noAuthority.error)))

services.sessionController = { list: async () => ({ nope: true }) }
const badShape = await call(blankRoute, { all: true }, keepServices)
check('blank/deleteAll: an unrecognized list shape is refused', badShape.ok === false)

// The real deletion: three blanks, three protected sessions, four non-blank survivors.
{
  const keep = ['s-talked', 's-archived-talked']
  const blanks = ['s-blank-1', 's-blank-2', 's-blank-3']
  const protectedIds = ['s-running', 's-attached', 's-subagent']
  const home = blankHome([...keep, ...blanks, ...protectedIds])
  process.env.DSH_HOME = home
  services.sessionController = blankList([
    ...blanks.map((id) => ({ sessionId: id, blank: true, running: false })),
    ...keep.map((id) => ({ sessionId: id, blank: false })),
    { sessionId: 's-running', blank: true, running: false },
    { sessionId: 's-attached', blank: true, running: false },
    { sessionId: 's-subagent', blank: true, origin: 'subagent' },
  ])
  services.agents = { get: (id) => (id === 's-running' ? { id, status: 'running' } : undefined) }
  services.sessions = { get: (id) => (id === 's-attached' ? { id } : undefined) }
  const ws = makeWorkspaceDomain()
  services.storageDomain = {
    get: (name) => (name === 'workspace' ? ws.domain : undefined),
  }
  ws.records.set('ws-1', { path: '/tmp/ws', title: 'ws', sessionIds: ['s-blank-1', 's-talked'], createdAt: '', updatedAt: '' })

  const wiped = await call(blankRoute, { all: true }, keepServices)
  check('blank/deleteAll: every blank session is deleted',
    wiped.ok === true && blanks.every((id) => wiped.deleted.includes(id)))
  check('blank/deleteAll: their directories are gone from disk',
    blanks.every((id) => !blankDirs(home, id)))
  check('blank/deleteAll: a session with conversation is never touched',
    wiped.deleted.includes('s-talked') === false && blankDirs(home, 's-talked'))
  check('blank/deleteAll: a running blank is skipped, not deleted',
    wiped.skipped.running.includes('s-running') && blankDirs(home, 's-running'))
  check('blank/deleteAll: an attached (currently open) blank is skipped',
    wiped.skipped.live.includes('s-attached') && blankDirs(home, 's-attached'))
  check('blank/deleteAll: a subagent session is left to its parent\'s cascade',
    wiped.skipped.subagent.includes('s-subagent') && blankDirs(home, 's-subagent'))
  check('blank/deleteAll: the workspace registry drops the deleted session but keeps the rest',
    JSON.stringify(ws.records.get('ws-1').sessionIds) === JSON.stringify(['s-talked']))
  check('blank/deleteAll: reports the blank population it inspected', wiped.totalBlank === 6)
}

// Nothing to do is a success, not an error (idempotent re-run).
{
  const home = blankHome([])
  process.env.DSH_HOME = home
  services.sessionController = blankList([])
  delete services.agents
  delete services.sessions
  delete services.storageDomain
  const empty = await call(blankRoute, { all: true }, keepServices)
  check('blank/deleteAll: an empty blank set answers ok with nothing deleted',
    empty.ok === true && Array.isArray(empty.deleted) && empty.deleted.length === 0)
}

// A running agent that the list still reports as idle is still protected: the list
// `running` bit is a forwarded fact with a window, so the Host re-asks the live registry.
{
  const home = blankHome(['s-race'])
  process.env.DSH_HOME = home
  services.sessionController = blankList([{ sessionId: 's-race', blank: true, running: false }])
  services.agents = { get: () => ({ status: 'running' }) }
  const race = await call(blankRoute, { all: true }, keepServices)
  check('blank/deleteAll: a stale list `running: false` cannot delete a genuinely running session',
    race.ok === true && race.deleted.length === 0 && race.skipped.running.includes('s-race') && blankDirs(home, 's-race'))
  delete services.agents
}

process.env.DSH_HOME = join(mkdtempSync(join(tmpdir(), 'dswt-restore-')), 'no-such-home')
delete services.sessionController
delete services.sessions
delete services.storageDomain

// ───────────────────── native Finder picker (macOS `choose folder`) ─────────────────────

const internals = mod.__test
check('native picker internals are exported for tests', internals !== undefined && typeof internals.pickNativeDirectory === 'function')
// Safety net: if a route ever reaches the real runner, fail loudly instead of popping a
// macOS folder dialog on the operator's screen.
internals.setNativeRunner(async () => { throw new Error('the real osascript runner must never run in tests') })

const okRun = async () => ({ stdout: '/Users/tny/Desktop/work/my-dsh\n' })
check('darwin: stdout path is trimmed and returned',
  (await internals.pickNativeDirectory('darwin', okRun)) === '/Users/tny/Desktop/work/my-dsh')

const emptyRun = async () => ({ stdout: '\n' })
check('darwin: blank stdout means cancel', (await internals.pickNativeDirectory('darwin', emptyRun)) === null)

const cancelRun = async () => { const error = new Error('cmd failed'); error.code = 1; error.stderr = 'execution error: User canceled. (-128)'; throw error }
check('darwin: exit 1 + "User canceled" means cancel', (await internals.pickNativeDirectory('darwin', cancelRun)) === null)

const failRun = async () => { const error = new Error('boom'); error.code = 2; error.stderr = 'something else'; throw error }
let failOutcome = 'no throw'
try { await internals.pickNativeDirectory('darwin', failRun) } catch (error) { failOutcome = String(error.message) }
check('darwin: a real failure propagates', failOutcome === 'boom')

const missingRun = async () => { const error = new Error('spawn osascript ENOENT'); error.code = 'ENOENT'; throw error }
let missingOutcome = 'no throw'
try { await internals.pickNativeDirectory('darwin', missingRun) } catch (error) { missingOutcome = String(error.message) }
check('darwin: missing osascript is reported clearly', /osascript/.test(missingOutcome))

let unsupportedOutcome = 'no throw'
try { await internals.pickNativeDirectory('linux', okRun) } catch (error) { unsupportedOutcome = String(error.message) }
check('non-darwin platforms are refused with a clear message', /仅在 macOS 可用/.test(unsupportedOutcome))

const status = await call('/api/dsh-workspace-tree/picker/native', undefined, undefined, 'GET')
check('GET /picker/native reports platform + support',
  status.ok === true && status.platform === process.platform && status.supported === (process.platform === 'darwin'))

internals.setNativeRunner(async () => ({ stdout: '/Users/tny/Desktop/work/tmp\n' }))
const picked = await call('/api/dsh-workspace-tree/picker/native', {}, undefined)
check('POST /picker/native returns the chosen directory', picked.ok === true && picked.path === '/Users/tny/Desktop/work/tmp')

internals.setNativeRunner(async () => { const error = new Error('cmd failed'); error.code = 1; error.stderr = 'User canceled. (-128)'; throw error })
const cancelled = await call('/api/dsh-workspace-tree/picker/native', {}, undefined)
check('POST /picker/native normalizes cancel to path: null', cancelled.ok === true && cancelled.path === null)

internals.setNativeRunner(async () => { const error = new Error('dialog exploded'); throw error })
const broken = await call('/api/dsh-workspace-tree/picker/native', {}, undefined)
check('POST /picker/native reports failures without throwing', broken.ok === false && /dialog exploded/.test(String(broken.error)))
// The row-level 「添加工作区」 entry hands its start directory to osascript's default location.
let capturedArgs = null
const captureRun = async (command, args) => { capturedArgs = args; return { stdout: '/Users/tny/Desktop/work/picked\n' } }
const startDir = mkdtempSync(join(tmpdir(), 'dswt-start-'))
const seeded = await internals.pickNativeDirectory('darwin', captureRun, startDir)
check('darwin: an explicit start directory rides the osascript argv',
  seeded === '/Users/tny/Desktop/work/picked'
  && capturedArgs.includes('on run argv')
  && capturedArgs.some((arg) => arg.includes('default location (POSIX file (item 1 of argv))'))
  && capturedArgs.includes('--')
  && capturedArgs[capturedArgs.length - 1] === startDir)
await internals.pickNativeDirectory('darwin', captureRun)
check('darwin: without a start directory the chooser keeps the system default',
  !capturedArgs.includes('--') && !capturedArgs.some((arg) => arg.includes('default location')))

internals.setNativeRunner(captureRun)
const seededRoute = await call('/api/dsh-workspace-tree/picker/native', { startPath: startDir }, undefined)
check('POST /picker/native forwards a valid start path', seededRoute.ok === true && capturedArgs[capturedArgs.length - 1] === startDir)

capturedArgs = null
internals.setNativeRunner(captureRun)
const missingStart = await call('/api/dsh-workspace-tree/picker/native', { startPath: join(startDir, 'no-such-dir') }, undefined)
check('POST /picker/native refuses a missing start path without opening the chooser',
  missingStart.ok === false && /startPath/.test(String(missingStart.error)) && capturedArgs === null)

internals.setNativeRunner(captureRun)
const relativeStart = await call('/api/dsh-workspace-tree/picker/native', { startPath: 'relative/dir' }, undefined)
check('POST /picker/native refuses a relative start path',
  relativeStart.ok === false && /绝对路径/.test(String(relativeStart.error)))

const filePath = join(startDir, 'a-file.txt')
writeFileSync(filePath, 'x')
internals.setNativeRunner(captureRun)
const fileStart = await call('/api/dsh-workspace-tree/picker/native', { startPath: filePath }, undefined)
check('POST /picker/native refuses a start path that is not a directory',
  fileStart.ok === false && /不是目录/.test(String(fileStart.error)))

internals.setNativeRunner(null)

console.log(failures.length === 0 ? '\nhost-smoke: PASS' : `\nhost-smoke: FAIL (${failures.length})`)
if (failures.length > 0) process.exitCode = 1
