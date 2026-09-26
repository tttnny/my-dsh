/**
 * Headless check for the plugin's node half — the archive-area routes only.
 *
 * v3.0.0 removed the workspace-list takeover AND the settings page, so the routes under
 * test are exactly the archive ones: unarchiveAll / delete / deleteAll / pruneStale /
 * tombstoneCheck. Every removed route (open-ide, picker/native, blank/deleteAll,
 * archive/guardCheck) must 404, and the schemastery/settings, IDE-launcher and
 * blank-deletion machinery must all be gone.
 *
 * `lib/index.js` is plain ESM over node builtins only, so it is imported directly.
 * The prefix handler is driven with fake request/response objects, exactly as the web
 * carrier would call it.
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

// The host half must have no dependency on the removed settings/IDE machinery.
const source = readFileSync(join(pluginDir, 'lib/index.js'), 'utf8')
check('host half drops the schemastery/settings dependency',
  !source.includes('schemastery') && !source.includes('CONFIG_SCHEMA') && !source.includes('settingsScope'))
check('host half drops the IDE launcher',
  !source.includes('handleOpenIde') && !source.includes('resolveExecutable') && !source.includes('osascript'))
check('host half drops the blank-session deletion machinery',
  !source.includes('collectBlankSessionIds') && !source.includes('handleDeleteAllBlank'))
check('host half drops the archive guard (archiving is the official RPC)',
  !source.includes('handleGuardCheck'))

const mod = await import(join(pluginDir, 'lib/index.js'))

const routes = []
const services = {}
const ctx = {
  get: (name) => services[name],
  // `getWorkspaceDomain` reads `ctx.storageDomain` directly (declared hard dependency).
  get storageDomain() { return services.storageDomain },
  effect: (fn) => { const dispose = fn(); return typeof dispose === 'function' ? dispose : () => {} },
  webServer: { register: (route) => { routes.push(route); return () => {} } },
}

mod.apply(ctx)
check('host half registers its prefix route', routes.length === 1 && routes[0].path === '/api/dsh-workspace-tree')

/** One request through the real prefix handler: returns the HTTP status plus the JSON body. */
const call = async (path, body, method = 'POST') => {
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
const api = (p) => `/api/dsh-workspace-tree${p}`

/**
 * Minimal `storageDomain` stand-in for the workspace domain: `mutateWorkspaceState`
 * falls back to `global`/`table` when no `workspaceRegistry` service is registered —
 * the shape these routes drive through `stripSessionIdsFromRegistry`. The live state is
 * exposed so a test can assert the archive set was mutated.
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
// Topology-scanning routes must look at a scratch home, never the real ~/.dsh/sessions.
const scratchHome = mkdtempSync(join(tmpdir(), 'dswt-home-'))
process.env.DSH_HOME = scratchHome

// ── removed routes must be gone ───────────────────────────────────────────────
const goneIde = await call(api('/open-ide'), { path: '/tmp' })
check('removed /open-ide route 404s', goneIde.httpStatus === 404)
const gonePicker = await call(api('/picker/native'), {}, 'GET')
check('removed /picker/native route 404s', gonePicker.httpStatus === 404)

// ── every removed route must 404 ──────────────────────────────────────────────
const goneGuard = await call(api('/archive/guardCheck'), { sessionId: 's-1' })
check('removed /archive/guardCheck route 404s (archiving is the official menu\'s job)', goneGuard.httpStatus === 404)
const goneBlank = await call(api('/blank/deleteAll'), { all: true })
check('removed /blank/deleteAll route 404s (its settings page is gone)', goneBlank.httpStatus === 404)

// ── tombstoneCheck ────────────────────────────────────────────────────────────
// An unreadable sessions root must fail open with ok:false — claiming every directory
// vanished would wrongly tombstone living sessions.
const tomb = await call(api('/archive/tombstoneCheck'), { ids: ['never-created'] })
check('tombstoneCheck fails open when the sessions root is unreadable',
  tomb.ok === false && typeof tomb.error === 'string')

// A real (empty) sessions root: scanning must succeed, and a session directory that is
// absent is an idempotent delete success rather than a failure.
mkdirSync(join(scratchHome, 'sessions', 'scope'), { recursive: true })

// ── archive-scoped mutations ──────────────────────────────────────────────────
const wd = makeWorkspaceDomain()
services.storageDomain = { get: (n) => (n === 'workspace' ? wd.domain : undefined) }

// Host session-list stand-in. deleteSessionCascade refuses to strip an archive entry
// while the host still returns the session: that is exactly what makes a deleted
// session reappear as an ordinary "Ungrouped" row. The list is deliberately non-empty,
// because an empty list is treated as untrusted and the route would fail safe instead.
const hostSessions = new Set(['session-baseline-0000'])
services.sessionController = { list: async () => [...hostSessions].map((sessionId) => ({ sessionId })) }

// Write a real session log so the topology scan can read its header id.
const writeSessionLog = (scope, dirName, id) => {
  const dir = join(scratchHome, 'sessions', scope, dirName)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'session.v3.jsonl'), JSON.stringify({ type: 'session', id, cwd: '/tmp', createdAt: 1 }) + String.fromCharCode(10))
  return dir
}

// delete refuses anything outside the archive set (the routes are unauthenticated, so the
// server itself must prove the target is archived).
const delNotArchived = await call(api('/archive/delete'), { sessionId: 's-1' })
check('delete refuses a session outside the archive set', delNotArchived.ok === false)

// A directory that is already gone counts as an idempotent delete success, and the
// archive entry must be stripped.
wd.state().archivedSessionIds = ['gone-1']
const delArchived = await call(api('/archive/delete'), { sessionId: 'gone-1' })
check('delete removes an archived session whose directory is already gone (idempotent)',
  delArchived.ok === true && Array.isArray(delArchived.deleted) && delArchived.deleted.includes('gone-1')
  && !wd.state().archivedSessionIds.includes('gone-1'))

// ── the "Ungrouped" regression ────────────────────────────────────────────────
// A session whose on-disk directory name is NOT encodeSegment(header.id) must still be
// physically deleted: the topology map keys on the real session id, so the directory is
// located by provenance instead of being reconstructed from the id.
const divergedDir = writeSessionLog('scope', 'renamed-dir-2222', 'session-real-1111')
wd.state().archivedSessionIds = ['session-real-1111']
const delDiverged = await call(api('/archive/delete'), { sessionId: 'session-real-1111' })
check('delete physically removes a directory whose name diverges from encodeSegment(id)',
  delDiverged.ok === true && !existsSync(divergedDir) && !wd.state().archivedSessionIds.includes('session-real-1111'))

// A session the host still lists must NOT have its archive entry stripped, even after its
// log is physically gone: the archive entry is the only thing hiding it from the official
// sidebar, so stripping it would make the row reappear as an ordinary "Ungrouped"
// session. The deletion itself still succeeds and is reported honestly; the entry is kept.
hostSessions.add('live-ghost-1')
wd.state().archivedSessionIds = ['live-ghost-1']
const delLiveGhost = await call(api('/archive/delete'), { sessionId: 'live-ghost-1' })
check('delete still succeeds when the host lists the session, reporting it as retained',
  delLiveGhost.ok === true && delLiveGhost.deleted.includes('live-ghost-1')
  && Array.isArray(delLiveGhost.retained) && delLiveGhost.retained.includes('live-ghost-1'))
check('a retained delete keeps the archive entry (so the row cannot fall into "Ungrouped")',
  wd.state().archivedSessionIds.includes('live-ghost-1'))

// ...and once the host no longer lists it, the same id deletes cleanly and the entry goes.
hostSessions.delete('live-ghost-1')
const delGhostAfter = await call(api('/archive/delete'), { sessionId: 'live-ghost-1' })
check('the same archived id drops its archive entry once the host no longer lists it',
  delGhostAfter.ok === true && Array.isArray(delGhostAfter.retained) && delGhostAfter.retained.length === 0
  && !wd.state().archivedSessionIds.includes('live-ghost-1'))

// deleteAll must carry the same retention semantics per item.
hostSessions.add('live-ghost-2')
wd.state().archivedSessionIds = ['live-ghost-2', 'gone-2']
const delAllRetained = await call(api('/archive/deleteAll'), { all: true })
check('deleteAll retains only the archive entry of a still-listed session',
  delAllRetained.ok === true && delAllRetained.retained.includes('live-ghost-2')
  && !delAllRetained.retained.includes('gone-2')
  && wd.state().archivedSessionIds.includes('live-ghost-2')
  && !wd.state().archivedSessionIds.includes('gone-2'))
hostSessions.delete('live-ghost-2')
// Reset the archive set so the following deleteAll checks start from a known state.
wd.state().archivedSessionIds = []

// deleteAll must demand an explicit scope.
const delAllUnscoped = await call(api('/archive/deleteAll'), {})
check('deleteAll refuses a request without all:true or workspaceId', delAllUnscoped.ok === false)
const delAllEmpty = await call(api('/archive/deleteAll'), { all: true })
check('deleteAll with all:true on an empty archive is a no-op success',
  delAllEmpty.ok === true && Array.isArray(delAllEmpty.deleted) && delAllEmpty.deleted.length === 0)

// unarchiveAll removes from the durable archive set.
wd.state().archivedSessionIds = ['a-1', 'a-2']
const unarchAll = await call(api('/archive/unarchiveAll'), {})
check('unarchiveAll restores every archived id',
  unarchAll.ok === true && unarchAll.restored.length === 2 && wd.state().archivedSessionIds.length === 0)

// pruneStale drops archived ids the host list no longer returns.
wd.state().archivedSessionIds = ['stale-1']
const pruned = await call(api('/archive/pruneStale'), { aliveIds: ['other-1'] })
check('pruneStale drops archived ids missing from the host list',
  pruned.ok === true && pruned.pruned.includes('stale-1') && !wd.state().archivedSessionIds.includes('stale-1'))


if (previousDshHome === undefined) delete process.env.DSH_HOME
else process.env.DSH_HOME = previousDshHome

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed`)
  process.exit(1)
}
console.log('\nhost smoke: all checks passed')
