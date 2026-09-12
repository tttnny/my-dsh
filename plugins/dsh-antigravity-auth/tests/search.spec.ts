import { afterEach, describe, expect, it, vi } from 'vitest'
import { AntigravitySearchProvider, buildGroundedSearchPayload } from '../src/search.ts'

const auth = { credential: vi.fn(async () => ({ accessToken: 'secret', refreshToken: 'refresh', expiresAt: Date.parse('2030-01-01T00:00:00.000Z'), projectId: 'project-id' })) }

const REDIRECT_PREFIX = 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/'

/** One SSE body carrying `count` opaque grounding redirect sources. */
function groundedResponse(count: number): Response {
  const chunks = Array.from({ length: count }, (_value, index) => ({
    web: { uri: `${REDIRECT_PREFIX}token-${String(index)}`, title: `site-${String(index)}.example` },
  }))
  const payload = { response: { groundingMetadata: { groundingChunks: chunks } } }
  return new Response(`data: ${JSON.stringify(payload)}\n\ndata: [DONE]\n\n`)
}

/** A redirect probe answering `location` for every URL, or a transport failure. */
function stubProbe(location: (url: string) => string | undefined) {
  const probe = vi.fn(async (url: string) => {
    const target = location(url)
    if (target === undefined) throw new Error('probe failed')
    return new Response(null, { status: 302, headers: { location: target } })
  })
  vi.stubGlobal('fetch', probe)
  return probe
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('grounded Antigravity Search', () => {
  it('returns only validated HTTP grounding sources and bounded content', async () => {
    const transport = {
      request: vi.fn(async () => new Response('data: {"response":{"parts":[{"text":"answer"}],"groundingMetadata":{"groundingChunks":[{"web":{"uri":"https://example.com/a","title":"A","snippet":"snippet"}},{"web":{"uri":"file:///secret"}}]}}}\n\ndata: [DONE]\n\n')),
    }
    const provider = new AntigravitySearchProvider({ auth, transport })
    await expect(provider.search({ query: 'latest release', maxResults: 5 })).resolves.toEqual({
      content: 'answer',
      sources: [{ url: 'https://example.com/a', title: 'A', snippet: 'snippet' }],
      truncated: false,
    })
    expect(buildGroundedSearchPayload('query', { projectId: 'project-id' })).not.toHaveProperty('accessToken')
  })

  it('builds the captured outer envelope the endpoint needs to also generate an answer', () => {
    const payload = buildGroundedSearchPayload('gold price', { projectId: 'project-id' }, 'antigravity-gemini-3.7-flash', 1_700_000_000_000)
    const request = payload.request as Record<string, unknown>

    expect(payload.project).toBe('project-id')
    expect(payload.userAgent).toBe('antigravity')
    expect(payload.requestType).toBe('agent')
    expect(String(payload.requestId)).toMatch(/^agent\/[0-9a-f-]{36}\/1700000000000\/[0-9a-f-]{36}\/2$/u)
    expect(String(request.sessionId)).toMatch(/^search-[a-z0-9]+-\d+$/u)
    expect(request.generationConfig).toEqual({ temperature: 0, topP: 1 })
    expect(request.tools).toEqual([{ googleSearch: {} }])
    expect(request.contents).toEqual([{ role: 'user', parts: [{ text: 'gold price' }] }])
    const instruction = request.systemInstruction as { parts: readonly { text: string }[] }
    expect(instruction.parts[0]?.text).toContain('expert web search assistant')
    expect(typeof payload.model).toBe('string')
  })

  it('captures the answer text the captured response shape carries', async () => {
    const transport = {
      request: vi.fn(async () => new Response('data: {"response":{"candidates":[{"content":{"parts":[{"text":"今日金价 940 元/克。"}],"role":"model"},"groundingMetadata":{"groundingChunks":[{"web":{"uri":"https://www.sge.com.cn/","title":"sge.com.cn"}}]}}]}}\n\ndata: [DONE]\n\n')),
    }
    const provider = new AntigravitySearchProvider({ auth, transport })

    await expect(provider.search({ query: 'gold price' })).resolves.toMatchObject({
      content: '今日金价 940 元/克。',
      sources: [{ url: 'https://www.sge.com.cn/', title: 'sge.com.cn' }],
    })
  })

  it('fails closed when the provider returns no sources or the capability is disabled', async () => {
    const transport = { request: vi.fn(async () => new Response('{"response":{"parts":[{"text":"answer"}]}}')) }
    const empty = new AntigravitySearchProvider({ auth, transport })
    await expect(empty.search({ query: 'query' })).rejects.toMatchObject({ code: 'ANTIGRAVITY_SEARCH_NO_SOURCES' })
    const disabled = new AntigravitySearchProvider({ auth, enabled: () => false, transport })
    await expect(disabled.search({ query: 'query' })).rejects.toMatchObject({ code: 'ANTIGRAVITY_SEARCH_DISABLED' })
  })
})

describe('published source resolution', () => {
  it('replaces an opaque grounding redirect with the publisher URL without following it', async () => {
    const probe = stubProbe(() => 'https://www.sge.com.cn/')
    const transport = { request: vi.fn(async () => groundedResponse(1)) }
    const provider = new AntigravitySearchProvider({ auth, transport })

    const result = await provider.search({ query: 'gold price' })

    expect(result.sources).toEqual([{ url: 'https://www.sge.com.cn/', title: 'site-0.example' }])
    expect(probe).toHaveBeenCalledOnce()
    const [url, init] = probe.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${REDIRECT_PREFIX}token-0`)
    expect(init.method).toBe('HEAD')
    expect(init.redirect).toBe('manual')
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('keeps the opaque URI when the probe fails, returns no location, or hops to another token', async () => {
    const cases: Array<(url: string) => string | undefined> = [
      () => undefined,
      () => '',
      url => `${REDIRECT_PREFIX}second-${url.slice(-1)}`,
    ]
    for (const location of cases) {
      stubProbe(location)
      const transport = { request: vi.fn(async () => groundedResponse(1)) }
      const provider = new AntigravitySearchProvider({ auth, transport })
      const result = await provider.search({ query: 'gold price' })
      expect(result.sources).toEqual([{ url: `${REDIRECT_PREFIX}token-0`, title: 'site-0.example' }])
    }
  })

  it('never probes a source that is not an opaque grounding redirect', async () => {
    const probe = stubProbe(() => 'https://publisher.example/')
    const transport = {
      request: vi.fn(async () => new Response('data: {"response":{"groundingMetadata":{"groundingChunks":[{"web":{"uri":"https://www.sge.com.cn/","title":"sge"}}]}}}\n\ndata: [DONE]\n\n')),
    }
    const provider = new AntigravitySearchProvider({ auth, transport })

    await expect(provider.search({ query: 'gold price' })).resolves.toMatchObject({
      sources: [{ url: 'https://www.sge.com.cn/', title: 'sge' }],
    })
    expect(probe).not.toHaveBeenCalled()
  })

  it('drops sources that collapse onto the same publisher and caps how many it probes', async () => {
    const probe = stubProbe(url => url.endsWith('token-0') || url.endsWith('token-1')
      ? 'https://www.sge.com.cn/'
      : `https://publisher.example/${url.slice(url.lastIndexOf('-') + 1)}`)
    const transport = { request: vi.fn(async () => groundedResponse(14)) }
    const provider = new AntigravitySearchProvider({
      auth,
      transport,
      settings: () => ({ enabled: true, model: 'antigravity-gemini-3.7-flash', maxResults: 14 }),
    })

    const result = await provider.search({ query: 'gold price' })

    expect(result.sources).toHaveLength(13)
    expect(result.sources[0]?.url).toBe('https://www.sge.com.cn/')
    expect(result.sources.some(source => source.url.startsWith(REDIRECT_PREFIX))).toBe(true)
    expect(probe).toHaveBeenCalledTimes(10)
  })
})
