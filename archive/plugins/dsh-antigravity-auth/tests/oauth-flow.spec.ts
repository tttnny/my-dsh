import { describe, expect, it, vi } from 'vitest'
import { ANTIGRAVITY_CLIENT_ID } from '@cortexkit/antigravity-auth-core'
import { createGoogleTokenExchanger, createOAuthFlow } from '../src/oauth-flow.ts'
import type { LoopbackCallbackHandler } from '../src/oauth-flow.ts'
import { ProjectDiscoveryError } from '../src/project-context.ts'

function deterministicRandomBytes(size: number): Uint8Array {
  return Uint8Array.from({ length: size }, (_, index) => (index + 1) & 0xff)
}

describe('Antigravity OAuth flow', () => {
  it('starts a PKCE S256 browser flow with an opaque 256-bit state and no verifier in the URL', async () => {
    let handler: ((request: unknown) => Promise<unknown>) | undefined
    const listener = { close: vi.fn(async () => {}) }
    const flow = createOAuthFlow({
      randomBytes: deterministicRandomBytes,
      clock: { now: () => 1_000, setTimeout, clearTimeout },
      listenerFactory: {
        listen: vi.fn(async candidate => {
          handler = candidate as typeof handler
          return listener
        }),
      },
      exchangeCode: vi.fn(),
      validateProject: vi.fn(),
      commit: vi.fn(),
    })

    const result = await flow.start()
    const url = new URL(result.authorizationUrl)

    expect(result.phase).toBe('pending')
    expect(url.origin).toBe('https://accounts.google.com')
    expect(url.searchParams.get('client_id')).toBe(ANTIGRAVITY_CLIENT_ID)
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('state')).toMatch(/^[A-Za-z0-9_-]{43}$/u)
    expect(url.searchParams.get('code_verifier')).toBeNull()
    expect(url.toString()).not.toContain('verifier')
    expect(handler).toBeTypeOf('function')
    await flow.cancel()
  })

  it('closes the prior listener and keeps only the newest pending flow', async () => {
    const handlers: Array<(request: unknown) => Promise<unknown>> = []
    const listeners = [{ close: vi.fn(async () => {}) }, { close: vi.fn(async () => {}) }]
    let call = 0
    const bytes = [
      Uint8Array.from({ length: 32 }, (_, index) => index + 1),
      Uint8Array.from({ length: 32 }, (_, index) => index + 33),
      Uint8Array.from({ length: 32 }, (_, index) => index + 65),
      Uint8Array.from({ length: 32 }, (_, index) => index + 97),
    ]
    const flow = createOAuthFlow({
      randomBytes: () => bytes[call++] ?? bytes[0]!,
      listenerFactory: {
        listen: vi.fn(async candidate => {
          handlers.push(candidate as typeof handlers[number])
          return listeners[handlers.length - 1]!
        }),
      },
      exchangeCode: vi.fn(),
      validateProject: vi.fn(),
      commit: vi.fn(),
    })

    const first = await flow.start()
    const second = await flow.start()

    expect(first.authorizationUrl).not.toBe(second.authorizationUrl)
    expect(listeners[0]?.close).toHaveBeenCalledOnce()
    expect(flow.status()).toMatchObject({ phase: 'pending', authorizationUrl: second.authorizationUrl })
    await flow.cancel()
    expect(listeners[1]?.close).toHaveBeenCalledOnce()
  })

  it('validates a remote callback, exchanges the matching verifier, validates the project, and commits only after both succeed', async () => {
    let handler: ((request: unknown) => Promise<unknown>) | undefined
    const listener = { close: vi.fn(async () => {}) }
    const exchangeCode = vi.fn(async ({ code, verifier }: { code: string; verifier: string }) => ({
      accessToken: `access-for-${code}`,
      refreshToken: 'refresh-secret',
      expiresAt: 9_000,
      email: 'alice@example.com',
      verifier,
    }))
    const validateProject = vi.fn(async (accessToken: string) => ({ projectId: `project-for-${accessToken}` }))
    const commit = vi.fn(async () => {})
    const flow = createOAuthFlow({
      randomBytes: deterministicRandomBytes,
      listenerFactory: {
        listen: vi.fn(async candidate => {
          handler = candidate as typeof handler
          return listener
        }),
      },
      exchangeCode: exchangeCode as never,
      validateProject,
      commit,
    })

    const started = await flow.start()
    const state = new URL(started.authorizationUrl).searchParams.get('state')
    const result = await flow.completeCallbackUrl(`http://localhost:51121/oauth-callback?state=${state}&code=auth-code`)

    expect(result).toEqual({ completed: true, phase: 'success' })
    expect(exchangeCode).toHaveBeenCalledWith(expect.objectContaining({ code: 'auth-code', verifier: expect.any(String), signal: expect.any(AbortSignal) }))
    expect(validateProject).toHaveBeenCalledWith('access-for-auth-code', expect.any(AbortSignal))
    expect(commit).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: 'access-for-auth-code', refreshToken: 'refresh-secret' }),
      { projectId: 'project-for-access-for-auth-code' },
      expect.any(AbortSignal),
    )
    expect(listener.close).toHaveBeenCalledOnce()
    expect(handler).toBeTypeOf('function')
  })

  it('accepts real-world Google OAuth redirect parameters (scope, authuser, prompt, IPv6 host)', async () => {
    let handler: ((request: unknown) => Promise<unknown>) | undefined
    const listener = { close: vi.fn(async () => {}) }
    const exchangeCode = vi.fn(async () => ({
      accessToken: 'access-google',
      refreshToken: 'refresh-google',
      expiresAt: 9_000,
    }))
    const validateProject = vi.fn(async () => ({ projectId: 'google-project' }))
    const commit = vi.fn(async () => {})
    const flow = createOAuthFlow({
      randomBytes: deterministicRandomBytes,
      listenerFactory: {
        listen: vi.fn(async candidate => {
          handler = candidate as typeof handler
          return listener
        }),
      },
      exchangeCode: exchangeCode as never,
      validateProject,
      commit,
    })

    const started = await flow.start()
    const state = new URL(started.authorizationUrl).searchParams.get('state')
    const callbackUrl = `http://localhost:51121/oauth-callback?state=${state}&code=4/0Aeo...&scope=email+profile+https://www.googleapis.com/auth/cloud-platform&authuser=0&prompt=consent`
    const result = await flow.completeCallbackUrl(callbackUrl)

    expect(result).toEqual({ completed: true, phase: 'success' })
    expect(exchangeCode).toHaveBeenCalledWith(expect.objectContaining({ code: '4/0Aeo...' }))
    expect(commit).toHaveBeenCalled()
    expect(handler).toBeTypeOf('function')
  })

  it('rejects unsafe project identifiers before commit', async () => {
    const commit = vi.fn(async () => {})
    const flow = createOAuthFlow({
      randomBytes: deterministicRandomBytes,
      listenerFactory: { listen: vi.fn(async () => ({ close: vi.fn(async () => {}) })) },
      exchangeCode: vi.fn(async () => ({ accessToken: 'access', refreshToken: 'refresh', expiresAt: 9_000 })),
      validateProject: vi.fn(async () => ({ projectId: `project${String.fromCharCode(0)}id` })),
      commit,
    })
    const started = await flow.start()
    const state = new URL(started.authorizationUrl).searchParams.get('state')
    await expect(flow.completeCallbackUrl(`http://localhost:51121/oauth-callback?state=${state}&code=code`))
      .resolves.toEqual({ completed: false, phase: 'failed', errorCode: 'project-validation-failed' })
    expect(commit).not.toHaveBeenCalled()
  })

  it('rejects malformed callbacks without consuming the pending flow', async () => {
    const listener = { close: vi.fn(async () => {}) }
    const flow = createOAuthFlow({
      randomBytes: deterministicRandomBytes,
      listenerFactory: { listen: vi.fn(async () => listener) },
      exchangeCode: vi.fn(),
      validateProject: vi.fn(),
      commit: vi.fn(),
    })
    const started = await flow.start()
    const state = new URL(started.authorizationUrl).searchParams.get('state')

    await expect(flow.completeCallbackUrl(`http://localhost:51121/oauth-callback?state=${state}&state=${state}&code=code`)).rejects.toMatchObject({ code: 'duplicate-parameter' })
    expect(flow.status()).toMatchObject({ phase: 'pending' })
    await expect(flow.completeCallbackUrl(`http://example.test/oauth-callback?state=${state}&code=code`)).rejects.toMatchObject({ code: 'invalid-host' })
    expect(flow.status()).toMatchObject({ phase: 'pending' })
    await flow.cancel()
  })

  it('cancels an in-flight exchange and prevents project validation or commit after the callback is consumed', async () => {
    let resolveExchange: ((value: { accessToken: string; refreshToken: string; expiresAt: number }) => void) | undefined
    const validateProject = vi.fn(async () => ({ projectId: 'project' }))
    const commit = vi.fn(async () => {})
    const flow = createOAuthFlow({
      randomBytes: deterministicRandomBytes,
      listenerFactory: { listen: vi.fn(async () => ({ close: vi.fn(async () => {}) })) },
      exchangeCode: vi.fn(() => new Promise(resolve => { resolveExchange = resolve })) as never,
      validateProject,
      commit,
    })
    const started = await flow.start()
    const state = new URL(started.authorizationUrl).searchParams.get('state')
    const completion = flow.completeCallbackUrl(`http://localhost:51121/oauth-callback?state=${state}&code=code`)
    await vi.waitFor(() => expect(resolveExchange).toBeTypeOf('function'))

    await flow.cancel()
    expect(flow.status()).toMatchObject({ phase: 'cancelled', errorCode: 'cancelled' })
    resolveExchange?.({ accessToken: 'access', refreshToken: 'refresh', expiresAt: 9_000 })
    await expect(completion).resolves.toEqual({ completed: false, phase: 'cancelled', errorCode: 'cancelled' })
    expect(validateProject).not.toHaveBeenCalled()
    expect(commit).not.toHaveBeenCalled()
  })

  it('returns distinct safe HTTP errors for wrong method, path, and Host without echoing callback values', async () => {
    let handler: LoopbackCallbackHandler | undefined
    const flow = createOAuthFlow({
      randomBytes: deterministicRandomBytes,
      listenerFactory: {
        listen: vi.fn(async candidate => {
          handler = candidate
          return { close: vi.fn(async () => {}) }
        }),
      },
      exchangeCode: vi.fn(),
      validateProject: vi.fn(),
      commit: vi.fn(),
    })
    const started = await flow.start()
    const state = new URL(started.authorizationUrl).searchParams.get('state')
    const callback = `/oauth-callback?state=${state}&code=private-code`

    const wrongMethod = await handler?.({ method: 'POST', host: 'localhost:51121', url: callback })
    const wrongPath = await handler?.({ method: 'GET', host: 'localhost:51121', url: `/wrong?state=${state}&code=private-code` })
    const wrongHost = await handler?.({ method: 'GET', host: 'example.test', url: callback })

    expect(wrongMethod).toMatchObject({ status: 400 })
    expect(wrongPath).toMatchObject({ status: 400 })
    expect(wrongHost).toMatchObject({ status: 400 })
    expect(`${wrongMethod?.body}${wrongPath?.body}${wrongHost?.body}`).not.toContain('private-code')
    expect(flow.status()).toMatchObject({ phase: 'pending' })
    await flow.cancel()
  })

  it('returns distinct safe states for OAuth denial, cancellation, expiry, and port conflict', async () => {
    const listener = { close: vi.fn(async () => {}) }
    const flow = createOAuthFlow({
      randomBytes: deterministicRandomBytes,
      listenerFactory: { listen: vi.fn(async () => listener) },
      exchangeCode: vi.fn(),
      validateProject: vi.fn(),
      commit: vi.fn(),
    })
    const started = await flow.start()
    const state = new URL(started.authorizationUrl).searchParams.get('state')
    await expect(flow.completeCallbackUrl(`http://localhost:51121/oauth-callback?state=${state}&error=access_denied`)).resolves.toEqual({
      completed: false,
      phase: 'failed',
      errorCode: 'oauth-error',
    })

    await flow.start()
    await flow.cancel()
    expect(flow.status()).toMatchObject({ phase: 'cancelled', errorCode: 'cancelled' })

    vi.useFakeTimers()
    try {
      await flow.start()
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
      expect(flow.status()).toMatchObject({ phase: 'expired', errorCode: 'expired' })
    } finally {
      vi.useRealTimers()
    }

    const conflict = createOAuthFlow({
      listenerFactory: { listen: vi.fn(async () => { throw Object.assign(new Error('busy'), { code: 'EADDRINUSE' }) }) },
      exchangeCode: vi.fn(),
      validateProject: vi.fn(),
      commit: vi.fn(),
    })
    await expect(conflict.start()).rejects.toMatchObject({ code: 'port-conflict' })
    expect(conflict.status()).toMatchObject({ phase: 'port-conflict', errorCode: 'port-conflict' })
  })

  it.each([
    ['authentication', 'project-authentication-failed'],
    ['forbidden', 'project-forbidden'],
    ['rate-limited', 'project-rate-limited'],
    ['offline', 'project-offline'],
    ['malformed', 'project-malformed'],
    ['protocol-drift', 'project-protocol-drift'],
  ] as const)('keeps project discovery failure %s distinct', async (discoveryCode, loginCode) => {
    const flow = createOAuthFlow({
      randomBytes: deterministicRandomBytes,
      listenerFactory: { listen: vi.fn(async () => ({ close: vi.fn(async () => {}) })) },
      exchangeCode: vi.fn(async () => ({ accessToken: 'access', refreshToken: 'refresh', expiresAt: 9_000 })),
      validateProject: vi.fn(async () => { throw new ProjectDiscoveryError(discoveryCode) }),
      commit: vi.fn(),
    })
    const started = await flow.start()
    const state = new URL(started.authorizationUrl).searchParams.get('state')

    await expect(flow.completeCallbackUrl(`http://localhost:51121/oauth-callback?state=${state}&code=code`)).resolves.toEqual({
      completed: false,
      phase: 'failed',
      errorCode: loginCode,
    })
  })

  it('sends the matching PKCE verifier to the fake token endpoint and never echoes a failed response body', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = new URLSearchParams(String(init?.body))
      expect(body.get('code')).toBe('authorization-code')
      expect(body.get('code_verifier')).toBe('pkce-verifier')
      return new Response(JSON.stringify({ access_token: 'access-secret', refresh_token: 'refresh-secret', expires_in: 60 }))
    })
    const exchange = createGoogleTokenExchanger(fetchImpl as typeof fetch, {
      now: () => 1_000,
      setTimeout,
      clearTimeout,
    })
    await expect(exchange({ code: 'authorization-code', verifier: 'pkce-verifier', signal: new AbortController().signal })).resolves.toMatchObject({
      accessToken: 'access-secret',
      refreshToken: 'refresh-secret',
      expiresAt: 61_000,
    })

    const failed = createGoogleTokenExchanger(
      vi.fn(async () => new Response('private-token-response', { status: 400 })) as typeof fetch,
    )
    try {
      await failed({ code: 'authorization-code', verifier: 'pkce-verifier', signal: new AbortController().signal })
      expect.fail('expected token exchange failure')
    } catch (error) {
      expect(error).toMatchObject({ code: 'token-exchange-failed' })
      expect(String(error)).not.toContain('private-token-response')
    }
  })
})
