import { describe, expect, it, vi } from 'vitest'
import {
  PROJECT_DISCOVERY_ENDPOINT,
  ProjectDiscoveryError,
  createProjectDiscovery,
} from '../src/project-context.ts'
import { PrivateTransportError } from '../src/private-transport.ts'
import type { PrivateTransport, PrivateTransportRequest } from '../src/private-transport.ts'

function response(payload: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

function transportWith(
  dispatch: (input: PrivateTransportRequest) => Response | Promise<Response>,
): PrivateTransport & { request: ReturnType<typeof vi.fn> } {
  return { request: vi.fn(dispatch) } as unknown as PrivateTransport & { request: ReturnType<typeof vi.fn> }
}

describe('read-only Antigravity project discovery', () => {
  it('uses the fixed loadCodeAssist request and stores only a normalized project id', async () => {
    const transport = transportWith(async () => response({
      cloudaicompanionProject: { id: ' project-123 ' },
      currentTier: { id: 'private-tier' },
      rawProviderField: 'must-not-cross-the-boundary',
    }))
    const discovery = createProjectDiscovery({ transport })

    await expect(discovery.discover('access-secret')).resolves.toEqual({ projectId: 'project-123' })
    expect(transport.request).toHaveBeenCalledOnce()
    const request = transport.request.mock.calls[0]?.[0] as PrivateTransportRequest
    expect(request.url).toBe(PROJECT_DISCOVERY_ENDPOINT)
    expect(JSON.parse(String(request.body))).toEqual({ metadata: { ideType: 'ANTIGRAVITY' } })
    expect(String(request.body)).not.toContain('onboardUser')
    expect(String(request.body)).not.toContain('rising-fact-p41fc')
  })

  it('returns project-unavailable for an otherwise valid response without a project', async () => {
    const discovery = createProjectDiscovery({ transport: transportWith(async () => response({ currentTier: { id: 'free' } })) })
    await expect(discovery.discover('access-secret')).resolves.toBeUndefined()
  })

  it.each([
    [401, 'authentication'],
    [403, 'forbidden'],
    [429, 'rate-limited'],
    [500, 'offline'],
    [504, 'offline'],
    [404, 'protocol-drift'],
  ] as const)('maps HTTP %s to the safe project state %s', async (status, code) => {
    const transport = transportWith(async () => new Response('provider-secret-body', { status }))
    const discovery = createProjectDiscovery({ transport })

    await expect(discovery.discover('access-secret')).rejects.toMatchObject({ code })
    await expect(discovery.discover('access-secret')).rejects.not.toThrow(/provider-secret-body|access-secret/u)
  })

  it('distinguishes malformed JSON from protocol drift without exposing the response', async () => {
    const malformed = createProjectDiscovery({ transport: transportWith(async () => new Response('not-json')) })
    await expect(malformed.discover('access-secret')).rejects.toMatchObject({ code: 'malformed' })

    const drift = createProjectDiscovery({
      transport: transportWith(async () => response({ cloudaicompanionProject: { id: 42, secret: 'provider-secret' } })),
    })
    await expect(drift.discover('access-secret')).rejects.toMatchObject({ code: 'protocol-drift' })
    await expect(drift.discover('access-secret')).rejects.not.toThrow(/provider-secret|access-secret/u)
  })

  it('fails closed when the fixed raw identity is rejected', async () => {
    const transport = transportWith(async () => {
      throw new PrivateTransportError('attribution-rejected', 'rejected', { accepted: false })
    })
    const discovery = createProjectDiscovery({ transport })

    const operation = discovery.discover('access-secret')
    await expect(operation).rejects.toBeInstanceOf(ProjectDiscoveryError)
    await expect(operation).rejects.toMatchObject({ code: 'protocol-drift' })
    expect(transport.request).toHaveBeenCalledOnce()
  })
})
