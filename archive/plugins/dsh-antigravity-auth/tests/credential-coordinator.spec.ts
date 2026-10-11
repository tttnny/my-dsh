import { describe, expect, it, vi } from 'vitest'
import { createMemoryAuthStore } from '../src/auth-store.ts'
import { ANTIGRAVITY_REVOKE_ENDPOINT, CredentialOperationError, createCredentialCoordinator, createGoogleRefreshTransport, createGoogleRevokeTransport } from '../src/credential-coordinator.ts'
import type { RefreshAccessTokenResult } from '../src/credential-coordinator.ts'

describe('Antigravity credential coordinator', () => {
  it('reuses a fresh Host access token without refreshing', async () => {
    const store = createMemoryAuthStore()
    const record = await store.commit({ refreshToken: 'refresh-token', projectId: 'project-id' })
    const refresh = vi.fn(async () => ({
      accessToken: 'unexpected-refresh',
      expiresAt: 20_000,
    }))
    const coordinator = createCredentialCoordinator({
      store,
      refreshToken: refresh,
      now: () => 1_000,
    })

    coordinator.replaceFromLogin({
      accessToken: 'fresh-access',
      refreshToken: 'refresh-token',
      expiresAt: 100_000,
      projectId: 'project-id',
    }, record)

    await expect(coordinator.credential()).resolves.toEqual({
      accessToken: 'fresh-access',
      refreshToken: 'refresh-token',
      expiresAt: 100_000,
      projectId: 'project-id',
    })
    expect(refresh).not.toHaveBeenCalled()
    await coordinator.dispose()
  })

  it('refreshes when another process rotates the same lineage', async () => {
    const store = createMemoryAuthStore()
    const record = await store.commit({ refreshToken: 'original-refresh', projectId: 'project-id' })
    const refresh = vi.fn(async ({ refreshToken }: { refreshToken: string }) => ({
      accessToken: `access-for-${refreshToken}`,
      expiresAt: 100_000,
    }))
    const coordinator = createCredentialCoordinator({ store, refreshToken: refresh, now: () => 1_000 })
    coordinator.replaceFromLogin({
      accessToken: 'cached-access',
      refreshToken: 'original-refresh',
      expiresAt: 100_000,
      projectId: 'project-id',
    }, record)

    await store.compareAndCommit(record.revision, { refreshToken: 'rotated-refresh', projectId: 'project-id' }, record.lineage)
    await expect(coordinator.credential()).resolves.toMatchObject({
      accessToken: 'access-for-rotated-refresh',
      refreshToken: 'rotated-refresh',
    })
    expect(refresh).toHaveBeenCalledWith(expect.objectContaining({ refreshToken: 'rotated-refresh' }))
    await coordinator.dispose()
  })

  it('preserves an unrotated refresh token and atomically commits a rotated one', async () => {
    let timestamp = 1_000
    const store = createMemoryAuthStore()
    await store.commit({ refreshToken: 'refresh-token', projectId: 'project-id' })
    const refresh = vi.fn()
      .mockResolvedValueOnce({ accessToken: 'first-access', expiresAt: 2_000 })
      .mockResolvedValueOnce({ accessToken: 'second-access', refreshToken: 'rotated-refresh', expiresAt: 10_000 })
    const coordinator = createCredentialCoordinator({ store, refreshToken: refresh, now: () => timestamp, refreshLeadMs: 0 })

    await expect(coordinator.credential()).resolves.toMatchObject({ accessToken: 'first-access', refreshToken: 'refresh-token' })
    await expect(store.read()).resolves.toMatchObject({ refreshToken: 'refresh-token' })

    timestamp = 2_000
    await expect(coordinator.credential()).resolves.toMatchObject({ accessToken: 'second-access', refreshToken: 'rotated-refresh' })
    await expect(store.read()).resolves.toMatchObject({ refreshToken: 'rotated-refresh' })
    expect(refresh).toHaveBeenCalledTimes(2)
    await coordinator.dispose()
  })

  it('keeps the record and exposes re-login-required after invalid_grant', async () => {
    const store = createMemoryAuthStore()
    await store.commit({ refreshToken: 'refresh-token', projectId: 'project-id' })
    const refresh = vi.fn(async () => {
      throw new CredentialOperationError('invalid-grant')
    })
    const coordinator = createCredentialCoordinator({ store, refreshToken: refresh, now: () => 1_000 })

    await expect(coordinator.credential()).resolves.toBeUndefined()
    await expect(coordinator.status()).resolves.toMatchObject({ state: 're-login-required', configured: true, errorCode: 'invalid-grant' })
    await expect(store.read()).resolves.toMatchObject({ refreshToken: 'refresh-token', projectId: 'project-id' })
    expect(refresh).toHaveBeenCalledTimes(1)
    await expect(coordinator.credential()).resolves.toBeUndefined()
    expect(refresh).toHaveBeenCalledTimes(1)
    await coordinator.dispose()
  })

  it('does not overwrite a newer login lineage after a stale refresh returns', async () => {
    const store = createMemoryAuthStore()
    await store.commit({ refreshToken: 'old-refresh', projectId: 'old-project' })
    let releaseOld!: () => void
    const oldRefreshFinished = new Promise<void>(resolve => { releaseOld = resolve })
    const refresh = vi.fn(async ({ refreshToken }: { refreshToken: string }) => {
      if (refreshToken === 'old-refresh') {
        await oldRefreshFinished
        return { accessToken: 'stale-access', expiresAt: 100_000 }
      }
      return { accessToken: 'new-access', expiresAt: 100_000 }
    })
    const coordinator = createCredentialCoordinator({ store, refreshToken: refresh, now: () => 1_000 })

    const pending = coordinator.credential()
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledWith(expect.objectContaining({ refreshToken: 'old-refresh' })))
    await store.commit({ refreshToken: 'new-refresh', projectId: 'new-project' })
    releaseOld()

    await expect(pending).resolves.toMatchObject({ accessToken: 'new-access', refreshToken: 'new-refresh', projectId: 'new-project' })
    await expect(store.read()).resolves.toMatchObject({ refreshToken: 'new-refresh', projectId: 'new-project' })
    expect(refresh).toHaveBeenCalledTimes(2)
    await coordinator.dispose()
  })

  it('logs out locally and requires explicit confirmation before revocation', async () => {
    const store = createMemoryAuthStore()
    const record = await store.commit({ refreshToken: 'refresh-token', projectId: 'project-id' })
    const revoke = vi.fn(async () => {})
    const coordinator = createCredentialCoordinator({
      store,
      revokeGrant: revoke,
      now: () => 1_000,
    })
    coordinator.replaceFromLogin({ accessToken: 'access-token', refreshToken: 'refresh-token', expiresAt: 100_000, projectId: 'project-id' }, record)

    await expect(coordinator.revoke(false)).resolves.toEqual({ state: 'confirmation-required' })
    expect(revoke).not.toHaveBeenCalled()
    await expect(coordinator.logout()).resolves.toEqual({ state: 'logged-out' })
    await expect(store.read()).resolves.toBeUndefined()
    expect(revoke).not.toHaveBeenCalled()
    await expect(coordinator.revoke(true)).resolves.toEqual({ state: 'logged-out' })

    const replacement = await store.commit({ refreshToken: 'replacement-refresh', projectId: 'project-id' })
    coordinator.replaceFromLogin({ accessToken: 'replacement-access', refreshToken: 'replacement-refresh', expiresAt: 100_000, projectId: 'project-id' }, replacement)
    await expect(coordinator.revoke(true)).resolves.toEqual({ state: 'revoked' })
    expect(revoke).toHaveBeenCalledWith(expect.objectContaining({ token: 'replacement-refresh', signal: expect.any(AbortSignal) }))
    await expect(store.read()).resolves.toBeUndefined()
    await coordinator.dispose()
  })

  it('sends revocation tokens in a form body, never in the URL', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe(ANTIGRAVITY_REVOKE_ENDPOINT)
      expect(String(input)).not.toContain('secret-refresh-token')
      expect(init?.method).toBe('POST')
      expect(String(init?.body)).toContain('token=secret-refresh-token')
      return new Response(null, { status: 204 })
    })
    const revoke = createGoogleRevokeTransport(fetchImpl)

    await expect(revoke({ token: 'secret-refresh-token', signal: new AbortController().signal })).resolves.toBeUndefined()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('bounds ignored cancellation during refresh and records a safe timeout state', async () => {
    const store = createMemoryAuthStore()
    await store.commit({ refreshToken: 'refresh-token', projectId: 'project-id' })
    const refresh = vi.fn(async () => await new Promise<RefreshAccessTokenResult>(() => {}))
    const coordinator = createCredentialCoordinator({ store, refreshToken: refresh, operationTimeoutMs: 1, now: () => 1_000 })

    await expect(coordinator.credential()).resolves.toBeUndefined()
    await expect(coordinator.status()).resolves.toMatchObject({ state: 'refresh-failed', configured: true, errorCode: 'timeout' })
    await coordinator.dispose()
  })

  it('detaches refresh and revoke work when disposed even if transports ignore abort', async () => {
    const store = createMemoryAuthStore()
    const record = await store.commit({ refreshToken: 'refresh-token', projectId: 'project-id' })
    let releaseRefresh!: (value: RefreshAccessTokenResult) => void
    const refresh = vi.fn(async () => await new Promise<RefreshAccessTokenResult>(resolve => { releaseRefresh = resolve }))
    const revoke = vi.fn(async () => await new Promise<void>(() => {}))
    const coordinator = createCredentialCoordinator({ store, refreshToken: refresh, revokeGrant: revoke, now: () => 1_000 })

    const refreshPending = coordinator.credential()
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
    await coordinator.dispose()
    await expect(refreshPending).resolves.toBeUndefined()
    releaseRefresh({ accessToken: 'late-access', expiresAt: 100_000 })
    await expect(store.read()).resolves.toMatchObject({ refreshToken: 'refresh-token' })

    const second = createCredentialCoordinator({ store, refreshToken: async () => ({ accessToken: 'access', expiresAt: 100_000 }), revokeGrant: revoke, now: () => 1_000 })
    second.replaceFromLogin({ accessToken: 'access', refreshToken: 'refresh-token', expiresAt: 100_000, projectId: 'project-id' }, record)
    const revokePending = second.revoke(true)
    await vi.waitFor(() => expect(revoke).toHaveBeenCalledTimes(1))
    await second.dispose()
    await expect(revokePending).resolves.toEqual({ state: 'superseded' })
  })

  it('classifies invalid_grant, rate-limit, and server failures without echoing bodies', async () => {
    for (const [status, body, code] of [
      [400, { error: 'invalid_grant', diagnostic: 'secret-diagnostic' }, 'invalid-grant'],
      [429, { error: 'slow_down', diagnostic: 'secret-diagnostic' }, 'rate-limited'],
      [503, { error: 'unavailable', diagnostic: 'secret-diagnostic' }, 'server-error'],
    ] as const) {
      const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe('https://oauth2.googleapis.com/token')
        return new Response(JSON.stringify(body), { status })
      })
      const refresh = createGoogleRefreshTransport(fetchImpl, () => 1_000)
      await expect(refresh({ refreshToken: 'refresh-token', signal: new AbortController().signal }))
        .rejects.toMatchObject({ code })
      await expect(refresh({ refreshToken: 'refresh-token', signal: new AbortController().signal }))
        .rejects.not.toThrow('secret-diagnostic')
    }
  })

  it('shares one in-process refresh operation across concurrent callers', async () => {
    const store = createMemoryAuthStore()
    await store.commit({ refreshToken: 'refresh-token', projectId: 'project-id' })
    let release!: (value: RefreshAccessTokenResult) => void
    const refresh = vi.fn(async () => await new Promise<RefreshAccessTokenResult>(resolve => { release = resolve }))
    const coordinator = createCredentialCoordinator({ store, refreshToken: refresh, now: () => 1_000 })

    const first = coordinator.credential()
    await Promise.resolve()
    const second = coordinator.credential()
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))

    release({ accessToken: 'refreshed-access', expiresAt: 100_000 })
    await expect(Promise.all([first, second])).resolves.toEqual([
      { accessToken: 'refreshed-access', refreshToken: 'refresh-token', expiresAt: 100_000, projectId: 'project-id' },
      { accessToken: 'refreshed-access', refreshToken: 'refresh-token', expiresAt: 100_000, projectId: 'project-id' },
    ])
    await coordinator.dispose()
  })
})
