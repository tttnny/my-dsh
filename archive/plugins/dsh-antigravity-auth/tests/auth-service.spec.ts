import { describe, expect, it, vi } from 'vitest'
import { createMemoryAuthStore } from '../src/auth-store.ts'
import { createAntigravityAuthService } from '../src/auth-service.ts'
import type { PrivateTransport, PrivateTransportRequest } from '../src/private-transport.ts'
import type { LoopbackCallbackRequest } from '../src/oauth-flow.ts'
import { createMemoryCapabilityGates, type CapabilityGateRegistry } from '../src/capability-gates.ts'

function projectTransport(payload: unknown): PrivateTransport {
  return { request: vi.fn(async () => new Response(JSON.stringify(payload))) }
}

async function passAllLlmFamilies(gates: CapabilityGateRegistry, subject: string): Promise<void> {
  await gates.recordLlmFamily(subject, 'gemini', 'passed')
  await gates.recordLlmFamily(subject, 'claude', 'passed')
  await gates.recordLlmFamily(subject, 'gpt-oss', 'passed')
}

function listenerFixture() {
  const listeners: Array<{ close: ReturnType<typeof vi.fn> }> = []
  const handlers: Array<(request: LoopbackCallbackRequest) => Promise<unknown>> = []
  return {
    listeners,
    handlers,
    listenerFactory: {
      listen: vi.fn(async (handler: (request: LoopbackCallbackRequest) => Promise<unknown>) => {
        const listener = { close: vi.fn(async () => {}) }
        listeners.push(listener)
        handlers.push(handler)
        return listener
      }),
    },
  }
}

describe('Antigravity auth service', () => {
  it('requires risk acknowledgement, persists only after project validation, and keeps access tokens in Host memory', async () => {
    const store = createMemoryAuthStore(undefined, { now: () => 2_000 })
    const gates = createMemoryCapabilityGates()
    await gates.recordGate0('stale-lineage', 'passed')
    await passAllLlmFamilies(gates, 'stale-lineage')
    const fixture = listenerFixture()
    const service = createAntigravityAuthService({
      store,
      gates,
      projectOptions: {
        transport: projectTransport({ cloudaicompanionProject: { id: 'project-secret' } }),
      },
      flowOptions: {
        randomBytes: size => Uint8Array.from({ length: size }, (_, index) => index + 1),
        listenerFactory: fixture.listenerFactory,
        exchangeCode: vi.fn(async () => ({
          accessToken: 'access-secret',
          refreshToken: 'refresh-secret',
          expiresAt: 9_000,
          email: 'alice@example.com',
        })),
      },
    })

    await expect(service.startLogin()).rejects.toMatchObject({ code: 'risk-acknowledgement-required' })
    await service.acknowledgeRisk()
    const started = await service.startLogin()
    const state = new URL(started.authorizationUrl).searchParams.get('state')
    await expect(service.completeCallback(`http://localhost:51121/oauth-callback?state=${state}&code=code`)).resolves.toMatchObject({
      completed: true,
      phase: 'success',
    })

    const record = await store.read()
    expect(record).toMatchObject({ refreshToken: 'refresh-secret', projectId: 'project-secret', email: 'a***@example.com' })
    expect(JSON.stringify(record)).not.toContain('access-secret')
    expect(JSON.stringify(record)).not.toContain('alice@example.com')
    expect(JSON.stringify(await service.status())).not.toContain('project-secret')
    expect(await service.status()).toMatchObject({
      riskAcknowledged: true,
      login: { phase: 'success', configured: true, projectAvailable: true, maskedEmail: 'a***@example.com' },
      capabilities: [
        { id: 'auth-llm', state: 'poc-pending', reasonCode: 'gate-not-run' },
        { id: 'search', state: 'poc-pending', reasonCode: 'gate-not-run' },
        { id: 'image', state: 'poc-pending', reasonCode: 'gate-not-run' },
        { id: 'video', state: 'poc-pending', reasonCode: 'gate-not-run' },
      ],
    })
    await service.dispose()
  })

  it('auto-activates capability gates upon successful login when autoActivateGates is enabled', async () => {
    const store = createMemoryAuthStore(undefined, { now: () => 2_000 })
    const gates = createMemoryCapabilityGates()
    const fixture = listenerFixture()
    const service = createAntigravityAuthService({
      store,
      gates,
      autoActivateGates: true,
      projectOptions: {
        transport: projectTransport({ cloudaicompanionProject: { id: 'project-secret' } }),
      },
      flowOptions: {
        randomBytes: size => Uint8Array.from({ length: size }, (_, index) => index + 1),
        listenerFactory: fixture.listenerFactory,
        exchangeCode: vi.fn(async () => ({
          accessToken: 'access-secret',
          refreshToken: 'refresh-secret',
          expiresAt: 9_000,
          email: 'alice@example.com',
        })),
      },
    })

    await service.acknowledgeRisk()
    const started = await service.startLogin()
    const state = new URL(started.authorizationUrl).searchParams.get('state')
    await expect(service.completeCallback(`http://localhost:51121/oauth-callback?state=${state}&code=code`)).resolves.toMatchObject({
      completed: true,
      phase: 'success',
    })

    expect(await service.status()).toMatchObject({
      capabilities: [
        { id: 'auth-llm', state: 'available', reasonCode: 'capability-ready' },
        { id: 'search', state: 'available', reasonCode: 'capability-ready' },
        { id: 'image', state: 'available', reasonCode: 'capability-ready' },
        { id: 'video', state: 'available', reasonCode: 'capability-ready' },
      ],
    })
    await service.dispose()
  })

  it('notifies status listeners when the loopback callback commits a credential', async () => {
    const store = createMemoryAuthStore(undefined, { now: () => 2_000 })
    const gates = createMemoryCapabilityGates()
    const fixture = listenerFixture()
    const service = createAntigravityAuthService({
      store,
      gates,
      autoActivateGates: true,
      projectOptions: {
        transport: projectTransport({ cloudaicompanionProject: { id: 'project-secret' } }),
      },
      flowOptions: {
        randomBytes: size => Uint8Array.from({ length: size }, (_, index) => index + 1),
        listenerFactory: fixture.listenerFactory,
        exchangeCode: vi.fn(async () => ({
          accessToken: 'access-secret',
          refreshToken: 'refresh-secret',
          expiresAt: 9_000,
        })),
      },
    })

    const observed = vi.fn()
    const unwatch = service.watchStatus(observed)
    await service.acknowledgeRisk()
    const started = await service.startLogin()
    const state = new URL(started.authorizationUrl).searchParams.get('state')
    // The browser redirect is served by the loopback listener, which never
    // passes through the public completeCallback wrapper.
    observed.mockClear()
    const handler = fixture.handlers[0]
    if (handler === undefined) throw new Error('the loopback listener was not created')
    await handler({ method: 'GET', host: 'localhost:51121', url: `/oauth-callback?state=${state}&code=code` })

    await vi.waitFor(() => { expect(observed).toHaveBeenCalled() })
    unwatch()
    await service.dispose()
  })

  it('uses the default read-only project probe before replacing a credential', async () => {
    const store = createMemoryAuthStore(undefined, { now: () => 4_000 })
    const fixture = listenerFixture()
    const request = vi.fn(async (input: PrivateTransportRequest) => {
      expect(String(input.body)).not.toContain('onboardUser')
      return new Response(JSON.stringify({ cloudaicompanionProject: { id: 'discovered-project' } }))
    })
    const service = createAntigravityAuthService({
      store,
      projectOptions: { transport: { request } },
      flowOptions: {
        randomBytes: size => Uint8Array.from({ length: size }, (_, index) => index + 1),
        listenerFactory: fixture.listenerFactory,
        exchangeCode: vi.fn(async () => ({
          accessToken: 'access-secret',
          refreshToken: 'refresh-secret',
          expiresAt: 9_000,
        })),
      },
    })
    await service.acknowledgeRisk()
    const started = await service.startLogin()
    const state = new URL(started.authorizationUrl).searchParams.get('state')

    await expect(service.completeCallback(`http://localhost:51121/oauth-callback?state=${state}&code=code`)).resolves.toMatchObject({
      completed: true,
      phase: 'success',
    })
    expect(request).toHaveBeenCalledOnce()
    await expect(store.read()).resolves.toMatchObject({ projectId: 'discovered-project', refreshToken: 'refresh-secret' })
    await service.dispose()
  })

  it('projects persisted live gate evidence without inferring unrun capabilities', async () => {
    const store = createMemoryAuthStore()
    const record = await store.commit({ refreshToken: 'refresh', projectId: 'project-id' })
    const subject = record.lineage!
    const gates = createMemoryCapabilityGates()
    await gates.recordGate0(subject, 'passed')
    await passAllLlmFamilies(gates, subject)
    await gates.recordCapability(subject, 'search', 'rate-limited')
    const service = createAntigravityAuthService({ store, gates })

    await expect(service.status()).resolves.toMatchObject({
      capabilities: [
        { id: 'auth-llm', state: 'available', reasonCode: 'capability-ready' },
        { id: 'search', state: 'disabled', reasonCode: 'rate-limited' },
        { id: 'image', state: 'poc-pending', reasonCode: 'gate-not-run' },
        { id: 'video', state: 'poc-pending', reasonCode: 'gate-not-run' },
      ],
    })
    await service.dispose()
  })

  it('keeps LLM family compatibility independent until all three family gates pass', async () => {
    const store = createMemoryAuthStore()
    await store.commit({ refreshToken: 'refresh', projectId: 'project-id' })
    const gates = createMemoryCapabilityGates()
    const service = createAntigravityAuthService({ store, gates })

    await service.recordGate0('passed')
    await service.recordLlmFamilyGate('gemini', 'passed')
    expect(await service.capabilityAvailable('auth-llm')).toBe(false)
    await expect(service.recordCapabilityGate('auth-llm', 'passed')).rejects.toMatchObject({ code: 'internal' })
    await service.recordLlmFamilyGate('claude', 'passed')
    expect(await service.capabilityAvailable('auth-llm')).toBe(false)
    await service.recordLlmFamilyGate('gpt-oss', 'passed')
    expect(await service.capabilityAvailable('auth-llm')).toBe(true)
    const aggregateWrite = vi.spyOn(gates, 'recordCapability').mockRejectedValue(new Error('aggregate writes are forbidden'))
    await expect(service.recordLlmFamilyGate('claude', 'protocol-drift')).resolves.toBeUndefined()
    expect(aggregateWrite).not.toHaveBeenCalled()
    expect(await service.capabilityAvailable('auth-llm')).toBe(false)
    await service.dispose()
  })

  it('preserves existing gate evidence when a replacement login is superseded', async () => {
    const store = createMemoryAuthStore(undefined, { now: () => 3_000 })
    const oldRecord = await store.commit({ refreshToken: 'old-refresh', projectId: 'old-project' })
    const subject = oldRecord.lineage!
    const gates = createMemoryCapabilityGates()
    await gates.recordGate0(subject, 'passed')
    await passAllLlmFamilies(gates, subject)
    const fixture = listenerFixture()
    const service = createAntigravityAuthService({
      store,
      gates,
      projectOptions: { transport: projectTransport({ cloudaicompanionProject: { id: 'new-project' } }) },
      flowOptions: {
        listenerFactory: fixture.listenerFactory,
        exchangeCode: vi.fn(async () => ({ accessToken: 'new-access', refreshToken: 'new-refresh', expiresAt: 9_000 })),
      },
    })
    await service.acknowledgeRisk()
    const started = await service.startLogin()
    const state = new URL(started.authorizationUrl).searchParams.get('state')
    vi.spyOn(store, 'compareAndCommit').mockResolvedValueOnce(undefined)

    await expect(service.completeCallback(`http://localhost:51121/oauth-callback?state=${state}&code=code`)).resolves.toMatchObject({
      completed: false,
      phase: 'failed',
      errorCode: 'credential-conflict',
    })
    const status = await service.status()
    expect(status.capabilities.find(capability => capability.id === 'auth-llm')).toMatchObject({
      state: 'available',
      reasonCode: 'capability-ready',
    })
    await service.dispose()
  })

  it('fences prior evidence atomically when physical gate cleanup fails', async () => {
    const store = createMemoryAuthStore(undefined, { now: () => 3_000 })
    const oldRecord = await store.commit({ refreshToken: 'old-refresh', projectId: 'old-project' })
    const subject = oldRecord.lineage!
    const gates = createMemoryCapabilityGates()
    await gates.recordGate0(subject, 'passed')
    await passAllLlmFamilies(gates, subject)
    vi.spyOn(gates, 'clear').mockRejectedValueOnce(new Error('gate storage unavailable'))
    const fixture = listenerFixture()
    const service = createAntigravityAuthService({
      store,
      gates,
      projectOptions: { transport: projectTransport({ cloudaicompanionProject: { id: 'new-project' } }) },
      flowOptions: {
        listenerFactory: fixture.listenerFactory,
        exchangeCode: vi.fn(async () => ({ accessToken: 'new-access', refreshToken: 'new-refresh', expiresAt: 9_000 })),
      },
    })
    await service.acknowledgeRisk()
    const started = await service.startLogin()
    const state = new URL(started.authorizationUrl).searchParams.get('state')

    await expect(service.completeCallback(`http://localhost:51121/oauth-callback?state=${state}&code=code`)).resolves.toMatchObject({
      completed: true,
      phase: 'success',
    })
    await expect(store.read()).resolves.toMatchObject({
      refreshToken: 'new-refresh',
      projectId: 'new-project',
    })
    await expect(gates.read()).resolves.toMatchObject({ subject, gate0: { outcome: 'passed' } })
    expect((await service.status()).capabilities.find(capability => capability.id === 'auth-llm')).toMatchObject({
      state: 'poc-pending',
      reasonCode: 'gate-not-run',
    })
    await service.dispose()
  })

  it('preserves the existing single-account record when project validation fails', async () => {
    const store = createMemoryAuthStore(undefined, { now: () => 3_000 })
    await store.commit({ refreshToken: 'old-refresh', projectId: 'old-project', email: 'o***@example.com' })
    const fixture = listenerFixture()
    const service = createAntigravityAuthService({
      store,
      projectOptions: {
        transport: projectTransport({ currentTier: { id: 'free' } }),
      },
      credentialOptions: {
        refreshToken: vi.fn(async () => ({ accessToken: 'old-access', expiresAt: 9_000 })),
      },
      flowOptions: {
        listenerFactory: fixture.listenerFactory,
        exchangeCode: vi.fn(async () => ({ accessToken: 'new-access', refreshToken: 'new-refresh', expiresAt: 9_000 })),
      },
    })
    await service.acknowledgeRisk()
    const started = await service.startLogin()
    const state = new URL(started.authorizationUrl).searchParams.get('state')

    await expect(service.completeCallback(`http://localhost:51121/oauth-callback?state=${state}&code=code`)).resolves.toEqual({
      completed: false,
      phase: 'failed',
      errorCode: 'project-unavailable',
    })
    expect(await store.read()).toMatchObject({ refreshToken: 'old-refresh', projectId: 'old-project' })
    await expect(service.credential()).resolves.toMatchObject({ accessToken: 'old-access', projectId: 'old-project' })
    await expect(service.status()).resolves.toMatchObject({ login: { configured: true, projectAvailable: true } })
    await service.dispose()
  })
})
