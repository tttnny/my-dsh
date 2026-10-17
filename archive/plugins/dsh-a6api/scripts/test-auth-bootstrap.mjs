/**
 * Host-half check for the account-ID bootstrap (server/a6api-client.ts + server/sync.ts).
 *
 * The platform's account/merchant APIs (`/api/user/self`, `/api/token/`,
 * `/api/marketplace/*`) reject every request that lacks the `New-Api-User`
 * header — measured on 0.1.7-rc.2 against the live upstream:
 *
 *   Unauthorized, New-Api-User header not provided
 *
 * The id used to be discoverable only FROM those very endpoints (`data.id`), so
 * "no id -> cannot fetch an id" was a bootstrap deadlock: balance sync and
 * merchant pinning both failed with a message that blamed the access token.
 * This check pins the two ways out and keeps the negative control honest:
 *   - a JWT access token carries the id in its payload -> derived automatically;
 *   - a non-JWT token cannot -> the id stays empty, so the card must ask for it.
 *
 * Run with: node scripts/test-auth-bootstrap.mjs (requires a prior `pnpm build`).
 */

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Isolate every path the module derives from DSH_HOME before importing it.
process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'dsh-a6api-auth-'))

const { createConfigAccess, deriveUserIdFromToken } = await import(new URL('../lib/index.js', import.meta.url).href)

const failures = []
const check = (label, ok) => {
  if (ok) console.log(`  ok   ${label}`)
  else { console.log(`  FAIL ${label}`); failures.push(label) }
}

/** Build a JWT-shaped token whose payload is `payload` (signature is irrelevant here). */
const jwt = (payload) => {
  const b64 = (obj) => Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url')
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.signature-not-verified`
}

// 1. Derivation: the id comes from whichever claim the platform uses.
check('derives id from "id"', deriveUserIdFromToken(jwt({ id: 12345 })) === '12345')
check('derives id from "uid"', deriveUserIdFromToken(jwt({ uid: '777' })) === '777')
check('derives id from "user_id"', deriveUserIdFromToken(jwt({ user_id: 42 })) === '42')
check('derives id from "userId"', deriveUserIdFromToken(jwt({ userId: 9 })) === '9')

// 2. Negative controls: nothing is invented for values that are not a numeric id.
check('rejects non-numeric sub', deriveUserIdFromToken(jwt({ sub: 'abc' })) === undefined)
check('rejects numeric-looking strings with junk', deriveUserIdFromToken(jwt({ id: '12a' })) === undefined)
check('rejects a non-JWT token', deriveUserIdFromToken('Ab3+/xQ9wEr7Ty1uIo2pAs3dFg5hJk8l') === undefined)
check('rejects a 3-part token with an unparsable payload', deriveUserIdFromToken('a.!!!.c') === undefined)
check('rejects empty input', deriveUserIdFromToken('') === undefined)

// 3. Bootstrap through readConfig: a stored JWT supplies the missing userId, and
//    the derived value is written back once so later requests stop depending on it.
{
  const writes = []
  const refs = {
    A6API_API_KEY: 'sk-test-key',
    A6API_ACCESS_TOKEN: jwt({ id: 555 }),
  }
  const creds = {
    resolve: async (ref) => (refs[ref] === undefined ? { value: '' } : { value: refs[ref] }),
    set: async (ref, value) => { writes.push([ref, value]); refs[ref] = value },
    unset: async (ref) => { writes.push([ref, '']); delete refs[ref] },
  }
  let settingsCalls = 0
  const ctx = { get: (name) => (name === 'settings'
    ? { describe: () => { settingsCalls += 1; return [] } }
    : name === 'credentials' ? creds : undefined) }

  const access = createConfigAccess(ctx)
  const first = await access.readConfig()
  check('readConfig fills userId from a JWT access token', first.userId === '555')

  await new Promise((resolve) => setTimeout(resolve, 10))
  check('derived userId is written back to credentials', writes.some(([ref, v]) => ref === 'A6API_USER_ID' && v === '555'))

  const second = await access.readConfig()
  check('stored userId wins on the next read', second.userId === '555')
  check('write-back happens once, not per read', writes.filter(([ref]) => ref === 'A6API_USER_ID').length === 1)
  check('the settings seam is still the read path', settingsCalls > 0)
}

// 4. Negative control: without a JWT there is nothing to derive, so the id stays
//    empty — that is exactly the state the card's 账号 ID field exists for.
{
  const refs = {
    A6API_API_KEY: 'sk-test-key',
    A6API_ACCESS_TOKEN: 'Ab3+/xQ9wEr7Ty1uIo2pAs3dFg5hJk8l',
  }
  const creds = {
    resolve: async (ref) => (refs[ref] === undefined ? { value: '' } : { value: refs[ref] }),
    set: async (ref, value) => { refs[ref] = value },
    unset: async (ref) => { delete refs[ref] },
  }
  const ctx = { get: (name) => (name === 'settings' ? { describe: () => [] } : name === 'credentials' ? creds : undefined) }
  const cfg = await createConfigAccess(ctx).readConfig()
  check('a non-JWT token leaves userId empty (card must ask)', !cfg.userId)
  check('credentials are still read for a non-JWT token', cfg.apiKey === 'sk-test-key')
}

console.log(failures.length === 0 ? '\nauth-bootstrap: PASS' : `\nauth-bootstrap: FAIL (${failures.length})`)
process.exit(failures.length === 0 ? 0 : 1)
