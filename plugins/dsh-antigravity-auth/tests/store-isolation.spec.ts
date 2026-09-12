/**
 * Guard: the suite must never resolve a real Antigravity credential store.
 *
 * A test that drives the real Host row can execute `/antigravity-auth logout`,
 * which deletes the account file it resolves. That is only safe while every test
 * run is pointed at a throwaway data home, so the invariant is asserted here
 * instead of being trusted to each test.
 */

import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { defaultAuthStorePath } from '../src/auth-store.ts'
import { defaultCapabilityGatePath } from '../src/capability-gates.ts'

describe('test store isolation', () => {
  it('resolves the credential and gate stores inside the temporary data home', () => {
    const store = resolve(defaultAuthStorePath())
    const gates = resolve(defaultCapabilityGatePath(store))

    expect(process.env.XDG_DATA_HOME).toBeDefined()
    expect(store.startsWith(resolve(tmpdir()))).toBe(true)
    expect(gates.startsWith(resolve(tmpdir()))).toBe(true)
    // The developer's real account must stay out of reach.
    expect(store.startsWith(resolve(process.env.HOME ?? '/nonexistent', '.local', 'share'))).toBe(false)
  })
})
