/**
 * Host browser handoff for the terminal login command.
 */

import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import {
  isAntigravityAuthorizationUrl,
  openAuthorizationUrl,
  openerSpec,
  type OpenSpawnFn,
} from '../src/open-authorization-url.ts'

/** A realistic authorization URL: many `&`-separated parameters and percent-encoded values. */
const AUTHORIZATION_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
  + '?client_id=1234567890-abcdef.apps.googleusercontent.com'
  + '&redirect_uri=http%3A%2F%2F127.0.0.1%3A51121%2Foauth2callback'
  + '&response_type=code'
  + '&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcloud-platform%20https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fuserinfo.email'
  + '&code_challenge=8Jk2Yr4t1sB_9pQ-abcXYZ'
  + '&code_challenge_method=S256'
  + '&state=af0ifjsldkj-state-value'
  + '&access_type=offline'
  + '&prompt=consent'

/** Narrow the spawn double to the face openAuthorizationUrl consumes. */
function asSpawn(fn: (...args: never[]) => unknown): OpenSpawnFn {
  return fn as unknown as OpenSpawnFn
}

interface FakeChild extends EventEmitter {
  unref: ReturnType<typeof vi.fn>
}

function fakeChild(): FakeChild {
  return Object.assign(new EventEmitter(), { unref: vi.fn() })
}

/** Spawn double whose opener process reports a successful start. */
function spawningChild(): { child: FakeChild; spawnFn: OpenSpawnFn } {
  const child = fakeChild()
  const spawnFn = asSpawn(vi.fn(() => {
    queueMicrotask(() => child.emit('spawn'))
    return child
  }))
  return { child, spawnFn }
}

describe('openerSpec', () => {
  it('uses open, start, or xdg-open', () => {
    expect(openerSpec('darwin', 'https://a')).toEqual({
      command: 'open',
      args: ['https://a'],
      verbatimArguments: false,
    })
    expect(openerSpec('win32', 'https://a')).toEqual({
      command: 'cmd',
      args: ['/c', 'start', '""', '"https://a"'],
      verbatimArguments: true,
    })
    expect(openerSpec('linux', 'https://a')).toEqual({
      command: 'xdg-open',
      args: ['https://a'],
      verbatimArguments: false,
    })
  })

  it('quotes every query parameter of a realistic OAuth URL for the Windows opener', () => {
    const spec = openerSpec('win32', AUTHORIZATION_URL)

    expect(spec.args).toEqual(['/c', 'start', '""', `"${AUTHORIZATION_URL}"`])
    expect(spec.verbatimArguments).toBe(true)
    // cmd would split the unquoted URL at its first `&`; the quoted token keeps
    // the redirect URI, state handle, and PKCE challenge.
    expect(spec.args.at(-1)).toContain('&redirect_uri=')
    expect(spec.args.at(-1)).toContain('&state=')
    expect(spec.args.at(-1)).toContain('&code_challenge=')
    expect(spec.args.at(-1)?.slice(1, -1)).toBe(AUTHORIZATION_URL)
  })
})

describe('isAntigravityAuthorizationUrl', () => {
  it('accepts only the https Google authorization endpoint', () => {
    expect(isAntigravityAuthorizationUrl(AUTHORIZATION_URL)).toBe(true)
    expect(isAntigravityAuthorizationUrl('http://accounts.google.com/o/oauth2/v2/auth?x=1')).toBe(false)
    expect(isAntigravityAuthorizationUrl('https://evil.example/o/oauth2/v2/auth')).toBe(false)
    expect(isAntigravityAuthorizationUrl('https://accounts.google.com/not-oauth')).toBe(false)
    expect(isAntigravityAuthorizationUrl('javascript:alert(1)')).toBe(false)
    expect(isAntigravityAuthorizationUrl('not a url')).toBe(false)
  })
})

describe('openAuthorizationUrl', () => {
  it('spawns the Windows opener with the quoted URL verbatim', async () => {
    const { spawnFn } = spawningChild()

    await expect(openAuthorizationUrl(AUTHORIZATION_URL, spawnFn, 'win32')).resolves.toBe(true)

    expect(spawnFn).toHaveBeenCalledWith(
      'cmd',
      ['/c', 'start', '""', `"${AUTHORIZATION_URL}"`],
      { detached: true, stdio: 'ignore', windowsVerbatimArguments: true },
    )
  })

  it('spawns the POSIX opener detached and unrefs after the spawn event', async () => {
    const { child, spawnFn } = spawningChild()

    await expect(openAuthorizationUrl(AUTHORIZATION_URL, spawnFn, 'linux')).resolves.toBe(true)

    expect(spawnFn).toHaveBeenCalledWith(
      'xdg-open',
      [AUTHORIZATION_URL],
      { detached: true, stdio: 'ignore', windowsVerbatimArguments: false },
    )
    expect(child.unref).toHaveBeenCalledTimes(1)
  })

  it.each([
    'http://accounts.google.com/o/oauth2/v2/auth?x=1',
    'https://evil.example/o/oauth2/v2/auth',
    'https://accounts.google.com/not-oauth',
    'javascript:alert(1)',
    'not a url',
  ])('never spawns for %s', async (url) => {
    const spawnFn = asSpawn(vi.fn())

    await expect(openAuthorizationUrl(url, spawnFn, 'linux')).resolves.toBe(false)
    expect(spawnFn).not.toHaveBeenCalled()
  })

  it('reports no launch when the opener process cannot start', async () => {
    const child = fakeChild()
    const spawnFn = asSpawn(vi.fn(() => {
      queueMicrotask(() => child.emit('error', new Error('spawn xdg-open ENOENT')))
      return child
    }))

    await expect(openAuthorizationUrl(AUTHORIZATION_URL, spawnFn, 'linux')).resolves.toBe(false)
    expect(child.unref).not.toHaveBeenCalled()
  })

  it('reports no launch when spawn throws synchronously', async () => {
    const spawnFn = asSpawn(vi.fn(() => {
      throw new Error('invalid argv')
    }))

    await expect(openAuthorizationUrl(AUTHORIZATION_URL, spawnFn, 'linux')).resolves.toBe(false)
  })
})
