import { describe, expect, it } from 'vitest'
import {
  createPrivateTransport,
  iteratePrivateSse,
  privateStatusError,
  readPrivateBytes,
} from '../src/private-transport.ts'
import { ANTIGRAVITY_WIRE_ORIGIN } from '../src/wire-identity.ts'

const endpoint = `${ANTIGRAVITY_WIRE_ORIGIN}/v1internal:streamGenerateContent`

describe('bounded private transport', () => {
  it('parses SSE frames and plain JSON bodies without unbounded buffering', async () => {
    const sse: Array<{ data: string; event?: string }> = []
    for await (const event of iteratePrivateSse(new Response('event: chunk\ndata: {"a":1}\n\ndata: {"b":2}\n\n'))) sse.push(event)
    expect(sse).toEqual([{ event: 'chunk', data: '{"a":1}' }, { data: '{"b":2}' }])

    const plain: Array<{ data: string }> = []
    for await (const event of iteratePrivateSse(new Response('{\n  "ok": true\n}\n'))) plain.push(event)
    expect(plain).toEqual([{ data: '{\n  "ok": true\n}' }])
  })

  it('enforces SSE frame limits in UTF-8 bytes rather than code units', async () => {
    const collect = async (): Promise<void> => {
      for await (const _event of iteratePrivateSse(new Response('data: 😀\n\n'), { maxFrameBytes: 9 })) { /* consume */ }
    }
    await expect(collect()).rejects.toMatchObject({ code: 'frame-too-large' })
  })

  it('cancels oversized response reads and maps status without exposing bodies', async () => {
    await expect(readPrivateBytes(new Response('12345'), { maxBytes: 4 })).rejects.toMatchObject({ code: 'response-too-large' })
    expect(privateStatusError(401)).toMatchObject({ code: 'authentication', status: 401 })
    expect(privateStatusError(429)).toMatchObject({ code: 'rate-limited', status: 429 })
    expect(privateStatusError(200)).toBeUndefined()
  })

  it('rejects oversized or cancelled requests before raw dispatch', async () => {
    const transport = createPrivateTransport({ maxRequestBytes: 2 })
    await expect(transport.request({ url: endpoint, accessToken: 'access-secret', body: '123' })).rejects.toMatchObject({
      code: 'request-too-large',
      accepted: false,
    })

    const controller = new AbortController()
    controller.abort()
    await expect(transport.request({ url: endpoint, accessToken: 'token', body: '{}', signal: controller.signal })).rejects.toMatchObject({
      code: 'cancelled',
      accepted: false,
    })
  })
})
