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

/** A public probe answering both enrichment steps; records each by method. */
function stubProbe(handlers: {
  redirect?: (url: string) => string | undefined
  title?: (url: string) => string | undefined
  /** Raw page bytes, when a case needs a non-UTF-8 encoding. */
  page?: (url: string) => Uint8Array | undefined
}) {
  const head: string[] = []
  const get: string[] = []
  const probe = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'HEAD') {
      head.push(url)
      const target = handlers.redirect?.(url)
      if (target === undefined) throw new Error('redirect probe failed')
      return new Response(null, { status: 302, headers: { location: target } })
    }
    get.push(url)
    const raw = handlers.page?.(url)
    // A raw page is served as bytes so a case can pin a non-UTF-8 encoding.
    if (raw !== undefined) return new Response(raw as unknown as BodyInit, { status: 200, headers: { 'content-type': 'text/html' } })
    const title = handlers.title?.(url)
    if (title === 'throw') throw new Error('page fetch failed')
    return new Response(
      title === undefined ? '<html><head><meta charset="utf-8"></head><body>no title</body></html>' : `<html><head><title>${title}</title></head><body>x</body></html>`,
      { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
    )
  })
  vi.stubGlobal('fetch', probe)
  return { probe, head, get }
}

/** One grounded response carrying a single already-resolved source. */
function groundedSource(url: string, title: string): Response {
  const payload = { response: { groundingMetadata: { groundingChunks: [{ web: { uri: url, title } }] } } }
  return new Response(`data: ${JSON.stringify(payload)}\n\ndata: [DONE]\n\n`)
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
    // No page title is served, so the host-name label survives untouched.
    stubProbe({ title: () => undefined })
    const transport = {
      request: vi.fn(async () => new Response('data: {"response":{"candidates":[{"content":{"parts":[{"text":"今日金价 940 元/克。"}],"role":"model"},"groundingMetadata":{"groundingChunks":[{"web":{"uri":"https://www.sge.com.cn/","title":"sge.com.cn"}}]}}]}}\n\ndata: [DONE]\n\n')),
    }
    const provider = new AntigravitySearchProvider({ auth, transport })

    await expect(provider.search({ query: 'gold price' })).resolves.toMatchObject({
      content: '今日金价 940 元/克。',
      sources: [{ url: 'https://www.sge.com.cn/', title: 'sge.com.cn' }],
    })
  })

  it('keeps reasoning parts out of the grounded answer text', async () => {
    stubProbe({ title: () => undefined })
    const parts = '[{"text":"先想一下该查什么。","thought":true},{"text":"今日金价 940 元/克。"}]'
    const transport = {
      request: vi.fn(async () => new Response(`data: {"response":{"candidates":[{"content":{"parts":${parts},"role":"model"},"groundingMetadata":{"groundingChunks":[{"web":{"uri":"https://www.sge.com.cn/","title":"sge.com.cn"}}]}}]}}\n\ndata: [DONE]\n\n`)),
    }
    const provider = new AntigravitySearchProvider({ auth, transport })

    await expect(provider.search({ query: 'gold price' })).resolves.toMatchObject({
      content: '今日金价 940 元/克。',
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
    const probe = stubProbe({ redirect: () => 'https://www.sge.com.cn/', title: () => '上海黄金交易所' })
    const transport = { request: vi.fn(async () => groundedResponse(1)) }
    const provider = new AntigravitySearchProvider({ auth, transport })

    const result = await provider.search({ query: 'gold price' })

    expect(result.sources).toEqual([{ url: 'https://www.sge.com.cn/', title: '上海黄金交易所' }])
    expect(probe.head).toEqual([`${REDIRECT_PREFIX}token-0`])
    expect(probe.get).toEqual(['https://www.sge.com.cn/'])
    const [url, init] = probe.probe.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${REDIRECT_PREFIX}token-0`)
    expect(init.method).toBe('HEAD')
    expect(init.redirect).toBe('manual')
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('reads the page title behind a host-name label, so a source lists like a search result', async () => {
    const probe = stubProbe({ title: () => '9月12日主要金店黄金报价：周大福为1312元/克' })
    const transport = {
      request: vi.fn(async () => new Response('data: {"response":{"groundingMetadata":{"groundingChunks":[{"web":{"uri":"https://finance.jrj.com.cn/a.shtml","title":"jrj.com.cn"}}]}}}\n\ndata: [DONE]\n\n')),
    }
    const provider = new AntigravitySearchProvider({ auth, transport })

    await expect(provider.search({ query: 'gold price' })).resolves.toMatchObject({
      sources: [{ url: 'https://finance.jrj.com.cn/a.shtml', title: '9月12日主要金店黄金报价：周大福为1312元/克' }],
    })
    expect(probe.head).toHaveLength(0)
    expect(probe.get).toEqual(['https://finance.jrj.com.cn/a.shtml'])
  })

  it('honours the charset a page declares instead of forcing UTF-8', async () => {
    // Latin-1 bytes: 0xE9 is 'é' in windows-1252 and an invalid UTF-8 byte.
    const bytes = Buffer.from('<html><head><meta charset="windows-1252"><title>Caf\xE9 Prix</title></head></html>', 'latin1')
    const probe = stubProbe({ page: () => bytes })
    const transport = { request: vi.fn(async () => groundedSource('https://prix.example/a', 'prix.example')) }
    const provider = new AntigravitySearchProvider({ auth, transport })

    await expect(provider.search({ query: 'gold price' })).resolves.toMatchObject({
      sources: [{ url: 'https://prix.example/a', title: 'Café Prix' }],
    })
    expect(probe.get).toEqual(['https://prix.example/a'])
  })

  it('supports the charset labels Chinese finance pages declare', () => {
    for (const label of ['gbk', 'gb2312', 'gb18030', 'big5']) {
      expect(() => new TextDecoder(label)).not.toThrow()
    }
  })

  it('keeps the host-name label when the page has no title, the fetch fails, or the label is already a title', async () => {
    const cases: Array<{ title: (url: string) => string | undefined; expected: string }> = [
      { title: () => undefined, expected: 'jrj.com.cn' },
      { title: () => 'throw', expected: 'jrj.com.cn' },
      { title: () => '   ', expected: 'jrj.com.cn' },
      { title: () => 'x'.repeat(400), expected: 'jrj.com.cn' },
    ]
    for (const item of cases) {
      const probe = stubProbe({ title: item.title })
      const transport = {
        request: vi.fn(async () => new Response('data: {"response":{"groundingMetadata":{"groundingChunks":[{"web":{"uri":"https://jrj.com.cn/a.shtml","title":"jrj.com.cn"}}]}}}\n\ndata: [DONE]\n\n')),
      }
      const provider = new AntigravitySearchProvider({ auth, transport })
      const result = await provider.search({ query: 'gold price' })
      expect(result.sources).toEqual([{ url: 'https://jrj.com.cn/a.shtml', title: item.expected }])
      expect(probe.get).toHaveLength(1)
    }

    const titled = stubProbe({ title: () => '不该被取用' })
    const transport = {
      request: vi.fn(async () => new Response('data: {"response":{"groundingMetadata":{"groundingChunks":[{"web":{"uri":"https://jrj.com.cn/a.shtml","title":"已经是一篇文章标题了"}}]}}}\n\ndata: [DONE]\n\n')),
    }
    const provider = new AntigravitySearchProvider({ auth, transport })
    await expect(provider.search({ query: 'gold price' })).resolves.toMatchObject({
      sources: [{ url: 'https://jrj.com.cn/a.shtml', title: '已经是一篇文章标题了' }],
    })
    expect(titled.probe).not.toHaveBeenCalled()
  })

  it('keeps the opaque URI when the redirect probe fails, returns no location, or hops to another token', async () => {
    const cases: Array<(url: string) => string | undefined> = [
      () => undefined,
      () => '',
      url => `${REDIRECT_PREFIX}second-${url.slice(-1)}`,
    ]
    for (const redirect of cases) {
      const probe = stubProbe({ redirect })
      const transport = { request: vi.fn(async () => groundedResponse(1)) }
      const provider = new AntigravitySearchProvider({ auth, transport })
      const result = await provider.search({ query: 'gold price' })
      expect(result.sources).toEqual([{ url: `${REDIRECT_PREFIX}token-0`, title: 'site-0.example' }])
      // An unresolved token is never read as a page.
      expect(probe.get).toHaveLength(0)
    }
  })

  it('never probes a source that is not an opaque grounding redirect', async () => {
    const probe = stubProbe({ redirect: () => 'https://publisher.example/' })
    const transport = {
      request: vi.fn(async () => new Response('data: {"response":{"groundingMetadata":{"groundingChunks":[{"web":{"uri":"https://www.sge.com.cn/","title":"sge"}}]}}}\n\ndata: [DONE]\n\n')),
    }
    const provider = new AntigravitySearchProvider({ auth, transport })

    await expect(provider.search({ query: 'gold price' })).resolves.toMatchObject({
      sources: [{ url: 'https://www.sge.com.cn/', title: 'sge' }],
    })
    expect(probe.probe).not.toHaveBeenCalled()
  })

  it('drops sources that collapse onto the same publisher and caps how many it probes', async () => {
    const probe = stubProbe({
      redirect: url => url.endsWith('token-0') || url.endsWith('token-1')
        ? 'https://www.sge.com.cn/'
        : `https://publisher.example/${url.slice(url.lastIndexOf('-') + 1)}`,
    })
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
    expect(probe.head).toHaveLength(10)
    // Title reads are capped independently, and never target an unresolved token.
    expect(probe.get).toHaveLength(8)
    expect(probe.get.every(url => !url.startsWith(REDIRECT_PREFIX))).toBe(true)
  })
})
