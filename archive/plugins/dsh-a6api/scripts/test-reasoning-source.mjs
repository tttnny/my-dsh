/**
 * Host-half check for the reasoning-level source (server/catalog.ts + the
 * /catalog/* endpoints in src/index.ts).
 *
 * Upstream truth (OpenRouter HTTP API, measured 2026-10-11): a model's allowlist
 * lives in the top-level `reasoning.supported_efforts` array — there is no
 * `supported_reasoning_efforts` field, and "off" is the literal string `"none"`.
 * Levels are declarative: DSH only filters the options it is told about and never
 * trims them to what upstream accepts, so a wrong declaration surfaces as an
 * upstream parameter error at request time. This check pins the shapes the
 * catalog can end up in, driven through the real write channel and fake upstream
 * responses (no network):
 *   1. an old entry with no source field reads as unconfirmed;
 *   2. "fetch market models" still writes the default 7 levels, unconfirmed
 *      (a new model must not degrade into a non-reasoning one);
 *   3. an upstream allowlist narrows the levels, records "from N to M", and marks
 *      the entry confirmed;
 *   4. a reasoning flag with no allowlist keeps 7 levels and stays unconfirmed;
 *   5. no reasoning marker at all becomes a non-reasoning model, confirmed;
 *   6. a hand-edited entry is not overwritten by a later query and stays confirmed;
 *   7. an allowlist that only offers "none" becomes a non-reasoning model (upstream
 *      has said there is no level to pick, so the default 7 must not be written);
 *   8. a save that leaves the levels alone (a rename) is not a hand edit and stays
 *      queryable, while a real level change is.
 * It also pins the boundary: the internal source / change fields never reach the
 * DSH route configuration, and a failing upstream query only fails that action.
 *
 * Run with: node scripts/test-reasoning-source.mjs (requires a prior `pnpm build`).
 */

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Isolate every path the module derives from DSH_HOME before importing it.
process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'dsh-a6api-reasoning-'))
const catalogJson = join(process.env.DSH_HOME, 'dsh-a6api', 'catalog.json')

const DEFAULT_7 = { off: null, minimal: 'minimal', low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' }

/**
 * The forged OpenRouter payload. Field names are the real ones (snake_case in the
 * HTTP response; the SDK docs spell them camelCase).
 */
const OR_MODELS = [
  // (3) allowlist without "none", currently 3 levels upstream
  { id: 'stepfun/step-5-preview', reasoning: { mandatory: true, supported_efforts: ['high', 'medium', 'low'], default_effort: 'medium' } },
  // (3) allowlist whose "none" maps to DSH `off: null`
  { id: 'openai/gpt-5.2', reasoning: { mandatory: false, supported_efforts: ['xhigh', 'high', 'medium', 'low', 'none'], default_effort: 'medium' } },
  // (4) reasoning flag but no allowlist
  { id: 'inclusionai/ling-3.1-flash', reasoning: { mandatory: false, default_enabled: true } },
  // (5) no reasoning marker at all → non-reasoning
  { id: 'plain/chat-only', supported_parameters: ['temperature', 'max_tokens'] },
  // (6) a different allowlist that a hand-edited entry must not pick up
  { id: 'hand/edited-model', reasoning: { mandatory: false, supported_efforts: ['max', 'minimal'] } },
  // (7) an allowlist that only ever offers "none" → upstream declares no level
  { id: 'none-only-model', reasoning: { mandatory: false, supported_efforts: ['none'] } },
  // (8) an entry whose name is edited without touching the levels
  { id: 'name-only-model', reasoning: { mandatory: false, supported_efforts: ['high', 'low', 'none'] } },
]

const MARKET_ITEMS = [
  { model_name: 'brand-new-a', brand: 'openai' },
  { model_name: 'brand-new-b', brand: 'anthropic' },
  { model_name: 'stepfun/step-5-preview', brand: 'stepfun' },
]

// The fake upstream. Swapped to a 500 first so the failure path runs before the
// module's in-process OpenRouter cache (1h TTL) is populated.
let orFails = false
globalThis.fetch = async (url) => {
  const u = String(url)
  if (u.startsWith('https://openrouter.ai/api/v1/models')) {
    if (orFails) return new Response('upstream boom', { status: 500 })
    return Response.json({ data: OR_MODELS })
  }
  if (u.startsWith('https://a6api.com/api/marketplace/channels/search')) {
    return Response.json({ data: { total: MARKET_ITEMS.length, items: MARKET_ITEMS } })
  }
  throw new Error(`unexpected fetch in check: ${u}`)
}

// Seed a v1-shaped file: no source field anywhere (the upgrade state), and four
// entries that all start as the default 7 levels.
mkdirSync(join(process.env.DSH_HOME, 'dsh-a6api'), { recursive: true })
writeFileSync(catalogJson, JSON.stringify({
  version: 1,
  entries: [
    { id: 'legacy-7', brand: 'Other', reasoningEfforts: { ...DEFAULT_7 } },
    { id: 'stepfun/step-5-preview', brand: 'Other', reasoningEfforts: { ...DEFAULT_7 } },
    { id: 'openai/gpt-5.2', brand: 'OpenAI', reasoningEfforts: { ...DEFAULT_7 } },
    { id: 'inclusionai/ling-3.1-flash', brand: 'Other', reasoningEfforts: { ...DEFAULT_7 } },
    { id: 'plain/chat-only', brand: 'Other', reasoningEfforts: { ...DEFAULT_7 } },
    { id: 'hand/edited-model', brand: 'Other', reasoningEfforts: { ...DEFAULT_7 } },
    { id: 'none-only-model', brand: 'Other', reasoningEfforts: { ...DEFAULT_7 } },
    { id: 'name-only-model', brand: 'Other', reasoningEfforts: { ...DEFAULT_7 } },
  ],
}))

const { apply, getCatalogEntry, resolveModelMeta } = await import(new URL('../lib/index.js', import.meta.url).href)

const failures = []
const check = (label, ok) => {
  if (ok) console.log(`  ok   ${label}`)
  else { console.log(`  FAIL ${label}`); failures.push(label) }
}

// ===== fake ctx: read handlers + the real write channel, settings captured =====
const readHandlers = new Map()
const routeWrites = []
const settings = {
  describe: () => [{
    ns: 'llm-pi-ai',
    value: { providers: { a6api: {
      api: 'openai-completions',
      baseURL: 'https://api.a6api.com/v1',
      models: [{ id: 'stepfun/step-5-preview' }],
    } } },
  }],
  update: async (_ns, value) => { routeWrites.push(value) },
  mutate: async () => {},
}
const creds = {
  resolve: async (ref) => ({
    value: ref === 'A6API_API_KEY' ? 'sk-test'
      : ref === 'A6API_ACCESS_TOKEN' ? 'test-access-token'
        : ref === 'A6API_USER_ID' ? '1' : '',
  }),
  set: async () => {},
  unset: async () => {},
}
let writeFetch
const ctx = {
  get: (name) => (name === 'settings' ? settings : name === 'credentials' ? creds : undefined),
  effect: (fn) => { fn(); return () => {} },
  webServer: { register: ({ path, handler }) => { readHandlers.set(path, handler); return () => {} } },
  connection: { fetch: { register: ({ fetch }) => { writeFetch = fetch; return () => {} } } },
}
apply(ctx)

const callRead = async (endpoint) => {
  const handler = readHandlers.get(`/api/dsh-a6api/${endpoint}`)
  if (!handler) throw new Error(`no read handler for ${endpoint}`)
  let body = ''
  const res = {
    writeHead: () => res,
    end: (chunk) => { if (chunk !== undefined && chunk !== null) body += String(chunk) },
  }
  await handler({ url: `/api/dsh-a6api/${endpoint}`, method: 'GET', headers: {} }, res)
  return JSON.parse(body)
}

const callWrite = async (endpoint, payload = {}) => {
  // The page goes through the connection channel as an { endpoint, payload }
  // envelope, dispatched back into the same handler — the real seam, not a shortcut.
  const request = new Request('http://localhost/api/dsh-a6api/write', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint, payload }),
  })
  const response = await writeFetch(request)
  const text = await response.text()
  return { status: response.status, body: text ? JSON.parse(text) : null }
}

const levelsOf = (entry) =>
  entry?.reasoningEfforts && typeof entry.reasoningEfforts === 'object'
    ? Object.keys(entry.reasoningEfforts).length
    : 0

// 0. A failing upstream only fails its own action.
{
  orFails = true
  // The endpoint logs the failure to stderr by design; swallow it so the expected
  // 500 does not look like a broken check.
  const realError = console.error
  console.error = () => {}
  const failed = await callWrite('catalog/query-openrouter', { modelIds: ['stepfun/step-5-preview'] })
  console.error = realError
  check('a failing upstream query fails the action with 500', failed.status === 500 && failed.body?.ok === false)
  orFails = false
  const still = await callRead('catalog')
  check('the failure leaves the rest of the feature working (catalog still readable)',
    still.ok === true && still.catalog.length === 8)
}

// 1. An entry without a source field reads as unconfirmed.
{
  const read = await callRead('catalog')
  const old = read.catalog.find((e) => e.id === 'legacy-7')
  check('an old entry (file version 1, no source field) keeps its 7 levels', levelsOf(old) === 7)
  check('an old entry carries no source field on disk', old?.reasoningSource === undefined)
  check('the /state card path reports an old entry as unconfirmed (source default)',
    resolveModelMeta('legacy-7').reasoningSource === 'default')
}

// 2. "Fetch market models" only pulls the list: 7 default levels, unconfirmed.
{
  const fetched = await callWrite('catalog/fetch-models')
  check('fetch-models succeeds through the real write channel', fetched.status === 200 && fetched.body?.ok === true)
  const entry = getCatalogEntry('brand-new-a')
  check('a newly fetched market model declares all 7 levels', levelsOf(entry) === 7)
  check('a newly fetched market model is unconfirmed (source default)', entry?.reasoningSource === 'default')
  check('a newly fetched market model is not a non-reasoning model', entry?.reasoningEfforts !== false)
}

// 3. An allowlist narrows the levels, records the count change, and confirms.
{
  const result = await callWrite('catalog/query-openrouter', {
    modelIds: ['stepfun/step-5-preview', 'openai/gpt-5.2'],
  })
  check('querying an allowlist model reports it as updated', result.body?.updated === 2)

  const stepfun = getCatalogEntry('stepfun/step-5-preview')
  check('the allowlist narrows the levels to exactly what upstream lists',
    JSON.stringify(stepfun?.reasoningEfforts) === JSON.stringify({ low: 'low', medium: 'medium', high: 'high' }))
  check('a queried entry is confirmed (source queried)', stepfun?.reasoningSource === 'queried')
  check('a narrowed entry records the count change from 7 to 3',
    stepfun?.reasoningChange?.from === 7 && stepfun?.reasoningChange?.to === 3 && typeof stepfun?.reasoningChange?.at === 'number')

  const gpt = getCatalogEntry('openai/gpt-5.2')
  check('the upstream "none" token maps to DSH off with no wire value',
    gpt?.reasoningEfforts?.off === null && Object.keys(gpt.reasoningEfforts).length === 5)
  check('the other level names keep their own spelling on the wire',
    gpt?.reasoningEfforts?.xhigh === 'xhigh' && gpt?.reasoningEfforts?.low === 'low')
  check('an entry whose count changed 7 to 5 records that change',
    gpt?.reasoningChange?.from === 7 && gpt?.reasoningChange?.to === 5)
}

// 4. A reasoning flag with no allowlist: keep 7 levels, still unconfirmed.
{
  await callWrite('catalog/query-openrouter', { modelIds: ['inclusionai/ling-3.1-flash'] })
  const entry = getCatalogEntry('inclusionai/ling-3.1-flash')
  check('a flag-only model keeps all 7 levels', levelsOf(entry) === 7)
  check('a flag-only model stays unconfirmed', entry?.reasoningSource === 'default')
  check('a flag-only model records no count change', entry?.reasoningChange === undefined)
}

// 5. No reasoning marker at all: a non-reasoning model, confirmed.
{
  await callWrite('catalog/query-openrouter', { modelIds: ['plain/chat-only'] })
  const entry = getCatalogEntry('plain/chat-only')
  check('a model with no reasoning marker becomes a non-reasoning model', entry?.reasoningEfforts === false)
  check('a non-reasoning model is confirmed (source queried)', entry?.reasoningSource === 'queried')
}

// 5b. An allowlist that only lists "none" is upstream declaring there is no
// level to choose. It must become a non-reasoning model — falling back to the
// default 7 would declare levels upstream has already said it does not take,
// which is exactly the error this ticket exists to prevent.
{
  const queried = await callWrite('catalog/query-openrouter', { modelIds: ['none-only-model'] })
  check('a none-only allowlist is queried successfully', queried.status === 200 && queried.body?.ok === true)
  const entry = getCatalogEntry('none-only-model')
  check('an allowlist that only offers "none" becomes a non-reasoning model', entry?.reasoningEfforts === false)
  check('a none-only allowlist is confirmed (source queried)', entry?.reasoningSource === 'queried')
}

// 5c. Editing only the model's name must not count as hand-editing its levels.
// The catalog page always posts the whole draft — name AND the level text —
// so a rename arrives with `reasoningEfforts` present and value-identical to
// what the entry already holds. Treating that as a hand edit would freeze the
// entry out of every later query (source manual skips it forever).
{
  await callWrite('catalog/query-openrouter', { modelIds: ['name-only-model'] })
  const queried = getCatalogEntry('name-only-model')
  check('precondition: the name-only model was narrowed by the query', levelsOf(queried) === 3)
  check('precondition: the name-only model is confirmed by the query', queried?.reasoningSource === 'queried')
  // The page round-trips the entry's own levels back into the draft text; rebuild
  // exactly that payload so the check exercises the real client shape.
  const draftLevels = Object.fromEntries(Object.entries(queried.reasoningEfforts))

  const saved = await callWrite('catalog/update', {
    id: 'name-only-model',
    name: 'Renamed only',
    reasoningEfforts: draftLevels,
  })
  check('a name-only save is accepted', saved.status === 200 && saved.body?.ok === true)
  const renamed = getCatalogEntry('name-only-model')
  check('a name-only save keeps the queried levels', levelsOf(renamed) === 3)
  check('a name-only save does not mark the entry hand-edited', renamed?.reasoningSource === 'queried')

  // And the proof that it is still queryable: the forged allowlist is ["high",
  // "low", "none"], so a query that still applies re-narrows it to 3 levels.
  const requery = await callWrite('catalog/query-openrouter', { modelIds: ['name-only-model'] })
  check('a name-only save stays queryable (not skipped)',
    Array.isArray(requery.body?.skipped) && !requery.body.skipped.includes('name-only-model'))

  // Negative control: a real level change on the same model does mark it manual.
  const edited = await callWrite('catalog/update', {
    id: 'name-only-model',
    reasoningEfforts: { off: null, high: 'high' },
  })
  check('a real level change on the same model is accepted', edited.status === 200 && edited.body?.ok === true)
  const manual = getCatalogEntry('name-only-model')
  check('a real level change is marked hand-edited', manual?.reasoningSource === 'manual')
  check('a real level change is skipped by a later query',
    (await callWrite('catalog/query-openrouter', { modelIds: ['name-only-model'] })).body?.skipped?.includes('name-only-model') === true)
}

// 6. Hand-edited entries are confirmed and survive later queries.
{
  const saved = await callWrite('catalog/update', {
    id: 'hand/edited-model',
    reasoningEfforts: { off: null, low: 'low', high: 'high' },
  })
  check('a hand edit is saved', saved.status === 200 && saved.body?.ok === true)
  const edited = getCatalogEntry('hand/edited-model')
  check('a hand-edited entry is confirmed (source manual)', edited?.reasoningSource === 'manual')
  check('a hand-edited entry keeps exactly the levels the user wrote', levelsOf(edited) === 3)

  // The forged upstream allowlist for this model is ["max", "minimal"] — if the
  // query overwrote it, the levels would turn into 2.
  const requery = await callWrite('catalog/query-openrouter', { modelIds: ['hand/edited-model'] })
  check('a later query reports the hand-edited entry as skipped',
    Array.isArray(requery.body?.skipped) && requery.body.skipped.includes('hand/edited-model'))
  const after = getCatalogEntry('hand/edited-model')
  check('a later query does not overwrite hand-edited levels', levelsOf(after) === 3 && after?.reasoningEfforts?.high === 'high')
  check('a hand-edited entry stays confirmed after a query', after?.reasoningSource === 'manual')
  check('a hand-edited entry records no fresh count change', after?.reasoningChange === undefined)

  // The same rule applies to the single-row query button: one id, and the reply
  // must report it as skipped rather than not-found, so the page can say why
  // nothing changed.
  const single = await callWrite('catalog/query-openrouter', { modelIds: ['hand/edited-model'] })
  check('a single-row query of a hand-edited entry reports it as skipped, not not-found',
    single.body?.notFound?.length === 0 && single.body?.skipped?.includes('hand/edited-model'))

  // Negative control: an entry that was only ever queried (never hand-edited) is
  // not skipped, so the skip rule really keys off the manual source and not just
  // off "the model already exists".
  const controlQuery = await callWrite('catalog/query-openrouter', { modelIds: ['plain/chat-only'] })
  check('control: an entry that was never hand-edited is not skipped',
    Array.isArray(controlQuery.body?.skipped) && controlQuery.body.skipped.length === 0)
}

// 7. A later "fetch market models" must not reset what an earlier query or a hand
// edit established. The market refresh runs on a plain model list, so a naive
// merge would write the default 7 levels back over a narrowed model — the exact
// regression this ticket exists to prevent. Brand, however, is market-owned and
// should follow the latest list.
{
  const before = getCatalogEntry('stepfun/step-5-preview')
  check('precondition: the narrowed model still has its queried levels', levelsOf(before) === 3)

  const refetch = await callWrite('catalog/fetch-models')
  check('fetch-models succeeds again', refetch.body?.ok === true)
  const after = getCatalogEntry('stepfun/step-5-preview')
  check('fetch-models preserves a queried model\'s narrowed levels', levelsOf(after) === 3)
  check('fetch-models preserves a queried model\'s confirmed source', after?.reasoningSource === 'queried')
  const edited = getCatalogEntry('hand/edited-model')
  check('fetch-models preserves hand-edited levels', levelsOf(edited) === 3 && edited?.reasoningSource === 'manual')
  check('fetch-models still refreshes the market-owned brand', getCatalogEntry('stepfun/step-5-preview')?.brand === 'stepfun')
}

// 8. The internal fields never reach the DSH route configuration. "Fetch market
// models" syncs no route (only the query/update paths do), so this asks for the
// write the query path issues for an enabled model.
{
  routeWrites.length = 0
  await callWrite('catalog/query-openrouter', { modelIds: ['stepfun/step-5-preview'] })
  const written = routeWrites.find((v) => v?.providers?.a6api?.models?.length > 0)
  const model = written?.providers?.a6api?.models?.find((m) => m.id === 'stepfun/step-5-preview')
  check('an enabled model\'s level change is synced into the DSH route config', model?.reasoningEfforts !== undefined)
  check('the route config carries only llm-pi-ai native fields',
    model !== undefined && !('reasoningSource' in model) && !('reasoningChange' in model) && !('brand' in model))
}

// 9. Persistence: the source and the change record survive a reread of the file.
// gpt-5.2 was narrowed 7 -> 5 and queried only once, so its record is intact;
// stepfun was queried a second time with an unchanged count, which must drop the
// now-irrelevant record rather than keep showing a change that is not this one.
{
  const file = JSON.parse(readFileSync(catalogJson, 'utf8'))
  check('the catalog file version is still raised to 2', file.version === 2)
  const gpt = file.entries.find((e) => e.id === 'openai/gpt-5.2')
  check('the source is persisted on disk', gpt?.reasoningSource === 'queried')
  check('the count change is persisted on disk', gpt?.reasoningChange?.from === 7 && gpt?.reasoningChange?.to === 5)
  const stepfun = file.entries.find((e) => e.id === 'stepfun/step-5-preview')
  check('a repeat query with an unchanged count drops the stale change record', stepfun?.reasoningChange === undefined)
}

console.log(failures.length === 0 ? '\nreasoning-source: PASS' : `\nreasoning-source: FAIL (${failures.length})`)
process.exit(failures.length === 0 ? 0 : 1)
