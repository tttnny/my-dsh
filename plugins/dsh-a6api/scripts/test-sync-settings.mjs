/**
 * Host-half check for the settings seam (server/sync.ts).
 *
 * 0.1.7-rc.2 moved plugin settings into the Profile entry config and deleted the
 * `settings.yaml` file seam: `ctx.settings` is a SettingsForms whose `describe()`
 * reads an entry's live value and whose `update()`/`mutate()` write it. There is no
 * replacement file to fall back to, so this check pins both directions:
 *   - the read really goes through `describe()` (not a silent empty default);
 *   - a failing `update()`/`mutate()`, or a missing `ctx.settings`, REJECTS the
 *     caller and writes no `settings.yaml` (the old fallback silently no-op'ed).
 *
 * Run with: node scripts/test-sync-settings.mjs (requires a prior `pnpm build`).
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Isolate every path the module derives from DSH_HOME before importing it.
process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'dsh-a6api-sync-'))
const settingsYaml = join(process.env.DSH_HOME, 'settings.yaml')
const catalogJson = join(process.env.DSH_HOME, 'dsh-a6api', 'catalog.json')

const { createConfigAccess, apply } = await import(new URL('../lib/index.js', import.meta.url).href)

const failures = []
const check = (label, ok) => {
  if (ok) console.log(`  ok   ${label}`)
  else { console.log(`  FAIL ${label}`); failures.push(label) }
}

const OFFICIAL_BASE_URL = 'https://api.a6api.com'

const descriptor = (models, baseURL = `${OFFICIAL_BASE_URL}/v1`) => ({
  ns: 'llm-pi-ai',
  value: { providers: { a6api: { baseURL, models: models.map((id) => ({ id })) } } },
})

/** A fake ctx whose settings service implements only what 0.1.7 exposes. */
const ctxWith = (settings) => ({ get: (name) => (name === 'settings' ? settings : undefined) })

// 1. Protocol memory. The route config only exists while at least one model is
// enabled, so the choice itself lives in the plugin's own data file; a route that
// does exist is the truth, and an upgraded v1 file (no field) means the default.
{
  // Written before the first catalog read so the v1 shape is what gets loaded.
  mkdirSync(join(process.env.DSH_HOME, 'dsh-a6api'), { recursive: true })
  writeFileSync(catalogJson, JSON.stringify({ version: 1, entries: [{ id: 'm-a' }] }))
  const access = createConfigAccess(ctxWith({ describe: () => [] }))
  check('a v1 catalog file (no protocol field) reads as the default protocol',
    (await access.readConfig()).protocol === 'openai-completions')

  await access.setProtocol('anthropic-messages')
  check('a chosen protocol survives with no model enabled',
    (await access.readConfig()).protocol === 'anthropic-messages')
  const file = JSON.parse(readFileSync(catalogJson, 'utf8'))
  check('the catalog file is raised to version 2', file.version === 2)
  check('the catalog file records the chosen protocol', file.protocol === 'anthropic-messages')
  check('raising the file version keeps the entries', file.entries.length === 1)

  const access2 = createConfigAccess(ctxWith({
    describe: () => [{
      ns: 'llm-pi-ai',
      value: { providers: { a6api: {
        api: 'openai-responses',
        baseURL: `${OFFICIAL_BASE_URL}/v1`,
        models: [{ id: 'm-a' }],
      } } },
    }],
  }))
  check('a route api outranks the stored protocol (never show A while B runs)',
    (await access2.readConfig()).protocol === 'openai-responses')

  // A sync that does not name a protocol (an older caller, a model toggle) must
  // keep the remembered one rather than silently reverting the route to default.
  let carried
  const carrier = createConfigAccess(ctxWith({
    describe: () => [],
    update: async (_ns, value) => { carried = value },
    mutate: async () => {},
  }))
  await carrier.syncModels(['m-a'])
  check('a sync without an explicit protocol keeps the remembered one',
    carried?.providers?.a6api?.api === 'anthropic-messages')
}

// 2. Read path: the value arrives through describe(), not a file.
{
  const access = createConfigAccess(ctxWith({ describe: () => [descriptor(['m-a', 'm-b'])] }))
  const cfg = await access.readConfig()
  check('describe() value is read back', cfg.activeModels.join(',') === 'm-a,m-b')
  check('readConfig always reports the official address', cfg.baseURL === OFFICIAL_BASE_URL)
  check('getDshConfiguredModels goes through describe()', (await access.getDshConfiguredModels()).join(',') === 'm-a,m-b')
}

// 1b. The address is plugin-owned: whatever a route config still carries, the
// read-back is the official one (an old custom/CDN node silently becomes official
// the next time the plugin writes the route block).
{
  for (const stored of ['https://a6.a6api.com/v1', 'https://my-gateway.example.com/v1', 'https://my-gateway.example.com']) {
    const access = createConfigAccess(ctxWith({ describe: () => [descriptor(['m-a'], stored)] }))
    const cfg = await access.readConfig()
    check(`non-official stored address ${stored} reads back as the official one`, cfg.baseURL === OFFICIAL_BASE_URL)
  }
}

// 2. Negative control: a throwing update() must escape and must not write a file.
{
  const boom = new Error('update exploded')
  const access = createConfigAccess(ctxWith({
    describe: () => [descriptor(['m-a'])],
    update: async () => { throw boom },
    mutate: async () => {},
  }))
  let caught
  try { await access.syncModels(['m-a']) } catch (error) { caught = error }
  check('update() failure propagates to the caller', caught === boom)
  check('update() failure writes no settings.yaml', !existsSync(settingsYaml))
}

// 3. Negative control: a throwing mutate() (empty model list) must escape too.
{
  const boom = new Error('mutate exploded')
  const access = createConfigAccess(ctxWith({
    describe: () => [],
    update: async () => {},
    mutate: async () => { throw boom },
  }))
  let caught
  try { await access.syncModels([]) } catch (error) { caught = error }
  check('mutate() failure propagates to the caller', caught === boom)
  check('mutate() failure writes no settings.yaml', !existsSync(settingsYaml))
}

// 3b. The write path pins the official address: an old non-official address in
// the stored block cannot survive a model sync (it is silently rewritten).
{
  let written
  const access = createConfigAccess(ctxWith({
    describe: () => [descriptor(['m-a'], 'https://my-gateway.example.com/v1')],
    update: async (_ns, value) => { written = value },
    mutate: async () => {},
  }))
  await access.syncModels(['m-a'], 'openai-completions')
  check('the written route block uses the official address',
    written?.providers?.a6api?.baseURL === `${OFFICIAL_BASE_URL}/v1`)
}

// 3c. The chosen protocol decides the whole route block in one place: the api
// identifier, the address ending and the developer-role switch are one decision.
// OpenAI Chat / OpenAI Response end in /v1 and declare that the endpoint does not
// take the `developer` role (a reasoning model's system prompt otherwise reaches
// upstream as an unusable role); Messages has neither — its requests append
// `/v1/messages` to the configured address, so a trailing /v1 would double the
// segment, and the switch does not exist on that protocol at all, so writing it
// makes llm-pi-ai refuse the whole route.
const ROUTE_CASES = [
  {
    protocol: 'openai-completions',
    baseURL: `${OFFICIAL_BASE_URL}/v1`,
    compat: false,
  },
  {
    protocol: 'openai-responses',
    baseURL: `${OFFICIAL_BASE_URL}/v1`,
    compat: false,
  },
  {
    protocol: 'anthropic-messages',
    baseURL: OFFICIAL_BASE_URL,
    compat: true,
  },
]
for (const route of ROUTE_CASES) {
  const written = {}
  const access = createConfigAccess(ctxWith({
    describe: () => [],
    update: async (_ns, value) => { written.value = value },
    mutate: async () => {},
  }))
  await access.syncModels(['m-a'], route.protocol)
  const block = written.value?.providers?.a6api
  check(`${route.protocol} writes its own api identifier`, block?.api === route.protocol)
  check(`${route.protocol} writes the ${route.compat ? 'bare' : '/v1'} address`,
    block?.baseURL === route.baseURL)
  check(`${route.protocol} ${route.compat ? 'omits' : 'writes'} the developer-role switch`,
    route.compat
      ? block !== undefined && !('compat' in block)
      : block?.compat?.supportsDeveloperRole === false)
}

// 3d. The /config endpoint is the only way the page can hand a protocol over.
// An illegal value must be refused before anything is written: a 400, no
// credential write and no route rewrite (the whole point of validating).
{
  let writeFetch
  let routeWrites = 0
  const before = readFileSync(catalogJson, 'utf8')
  const settings = {
    describe: () => [],
    update: async () => { routeWrites += 1 },
    mutate: async () => { routeWrites += 1 },
  }
  const ctx = {
    get: (name) => (name === 'settings' ? settings : undefined),
    effect: (fn) => { fn(); return () => {} },
    webServer: { register: () => () => {} },
    connection: { fetch: { register: ({ fetch }) => { writeFetch = fetch; return () => {} } } },
  }
  apply(ctx)

  const call = async (payload) => {
    // The page never reaches /config directly: writes ride the connection
    // channel as an { endpoint, payload } envelope and are dispatched back into
    // the same handler, so the check goes through that real seam.
    const request = new Request('http://localhost/api/dsh-a6api/write', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint: 'config', payload }),
    })
    const response = await writeFetch(request)
    const text = await response.text()
    return { status: response.status, body: text ? JSON.parse(text) : null }
  }

  const rejected = await call({ protocol: 'openai', activeModels: ['m-a'] })
  check('an illegal protocol is refused with 400', rejected.status === 400)
  check('an illegal protocol is not written anywhere', rejected.body?.ok === false)
  check('an illegal protocol rewrites no route config', routeWrites === 0)
  check('an illegal protocol rewrites no plugin data file',
    readFileSync(catalogJson, 'utf8') === before)

  // Positive control: the chosen protocol reaches the DSH route block it was
  // meant for — the api identifier and the address ending move together.
  let written
  settings.update = async (_ns, value) => { written = value }
  const saved = await call({ protocol: 'openai-responses', activeModels: ['m-a'] })
  check('a legal protocol is accepted', saved.status === 200 && saved.body?.ok === true)
  check('saving writes the chosen protocol into the route block',
    written?.providers?.a6api?.api === 'openai-responses')
  check('saving writes the address ending that protocol needs',
    written?.providers?.a6api?.baseURL === `${OFFICIAL_BASE_URL}/v1`)
}

// 4. Negative control: without ctx.settings the write refuses instead of faking one.
{
  const access = createConfigAccess({ get: () => undefined })
  let caught
  try { await access.syncModels(['m-a']) } catch (error) { caught = error }
  check('missing ctx.settings refuses the write', caught instanceof Error && /SettingsForms/.test(caught.message))
  check('missing ctx.settings writes no settings.yaml', !existsSync(settingsYaml))
}

console.log(failures.length === 0 ? '\nsync-settings: PASS' : `\nsync-settings: FAIL (${failures.length})`)
process.exit(failures.length === 0 ? 0 : 1)
