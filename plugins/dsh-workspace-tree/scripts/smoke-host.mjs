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

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
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
  effect: (fn) => { const dispose = fn(); return typeof dispose === 'function' ? dispose : () => {} },
  settings: { register: () => { throw new Error('settings unavailable in this harness') } },
  webServer: { register: (route) => { routes.push(route); return () => {} } },
}

mod.apply(ctx)
check('host half registers its prefix route', routes.length === 1 && routes[0].path === '/api/dsh-workspace-tree')

/** One request through the real prefix handler: returns the HTTP status plus the JSON body. */
const call = async (path, body, agents, method = 'POST') => {
  if (agents === undefined) delete services.agents
  else services.agents = agents
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
internals.setNativeRunner(null)

console.log(failures.length === 0 ? '\nhost-smoke: PASS' : `\nhost-smoke: FAIL (${failures.length})`)
if (failures.length > 0) process.exitCode = 1
