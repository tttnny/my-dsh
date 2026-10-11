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

import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Isolate every path the module derives from DSH_HOME before importing it.
process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'dsh-a6api-sync-'))
const settingsYaml = join(process.env.DSH_HOME, 'settings.yaml')

const { createConfigAccess } = await import(new URL('../lib/index.js', import.meta.url).href)

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

// 1. Read path: the value arrives through describe(), not a file.
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
  await access.syncModels(['m-a'])
  check('the written route block uses the official address',
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
