import { Buffer } from 'node:buffer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const socketState = vi.hoisted(() => ({
  request: '',
  response: new Uint8Array(),
  proxyRequest: '',
  proxyResponse: new Uint8Array(),
  holdProxyResponse: false,
  streamBody: false,
  socketClosed: false,
}))

vi.mock('node:net', async () => {
  const { Duplex } = await vi.importActual<typeof import('node:stream')>('node:stream')
  class FakeProxySocket extends Duplex {
    private replied = false

    override _read(): void {}

    override _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
      socketState.proxyRequest += chunk.toString('latin1')
      callback()
      if (!this.replied && !socketState.holdProxyResponse) {
        this.replied = true
        queueMicrotask(() => { this.push(socketState.proxyResponse) })
      }
    }
  }
  return {
    connect: vi.fn(() => {
      const socket = new FakeProxySocket()
      queueMicrotask(() => { socket.emit('connect') })
      return socket
    }),
  }
})

vi.mock('node:tls', async () => {
  const { Duplex } = await vi.importActual<typeof import('node:stream')>('node:stream')
  class FakeTlsSocket extends Duplex {
    private replied = false
    private streaming = false

    override _read(): void {
      if (this.streaming && !this.destroyed) this.push(Buffer.alloc(1024))
    }

    override _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
      socketState.request += chunk.toString('latin1')
      callback()
      if (!this.replied) {
        this.replied = true
        queueMicrotask(() => {
          this.push(socketState.response)
          if (socketState.streamBody) {
            this.streaming = true
            this.push(Buffer.alloc(1024))
          } else {
            this.push(null)
          }
        })
      }
    }
  }
  return {
    connect: vi.fn(() => {
      const socket = new FakeTlsSocket()
      socket.once('close', () => { socketState.socketClosed = true })
      queueMicrotask(() => { socket.emit('secureConnect') })
      return socket
    }),
  }
})

import { createPrivateTransport, readPrivateText } from '../src/private-transport.ts'
import { ANTIGRAVITY_GENERATE_ENDPOINT } from '../src/llm-adapter.ts'

const proxyEnvironmentKeys = ['NO_PROXY', 'no_proxy', 'HTTPS_PROXY', 'https_proxy', 'ALL_PROXY', 'all_proxy'] as const
const originalProxyEnvironment = Object.fromEntries(proxyEnvironmentKeys.map(key => [key, process.env[key]]))

beforeEach(() => {
  socketState.request = ''
  socketState.proxyRequest = ''
  socketState.holdProxyResponse = false
  socketState.streamBody = false
  socketState.socketClosed = false
  socketState.proxyResponse = Buffer.from('HTTP/1.1 200 Connection established\r\n\r\n', 'latin1')
  socketState.response = Buffer.from(
    'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n'
    + '5\r\nhello\r\n0\r\n\r\n',
    'latin1',
  )
  process.env.NO_PROXY = 'daily-cloudcode-pa.googleapis.com'
  delete process.env.no_proxy
  for (const key of ['HTTPS_PROXY', 'https_proxy', 'ALL_PROXY', 'all_proxy'] as const) delete process.env[key]
})

afterEach(() => {
  for (const key of proxyEnvironmentKeys) {
    const value = originalProxyEnvironment[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe('fixed private raw transport', () => {
  it('dispatches literal audited framing and decodes a chunked response through the public seam', async () => {
    const transport = createPrivateTransport()

    const response = await transport.request({
      url: ANTIGRAVITY_GENERATE_ENDPOINT,
      accessToken: 'access-secret',
      body: '{"request":"minimal"}',
    })

    await expect(readPrivateText(response)).resolves.toBe('hello')
    expect(socketState.request).toMatch(/^POST \/v1internal:generateContent HTTP\/1\.1\r\nHost: (?:daily-)?cloudcode-pa\.googleapis\.com\r\nUser-Agent:/u)
    expect(socketState.request).toContain('X-DeepSeek-Harness-Attribution: deepseek-harness/')
    expect(socketState.request).toContain('Authorization: Bearer access-secret\r\n')
    expect(socketState.request).toContain('Content-Length: 21\r\n')
    expect(socketState.request).not.toContain('Transfer-Encoding')
    expect(socketState.request).toMatch(/\r\n\r\n\{"request":"minimal"\}$/u)
  })

  it('confines proxy credentials to CONNECT and private credentials to the TLS request', async () => {
    delete process.env.NO_PROXY
    process.env.HTTPS_PROXY = 'http://proxy-user-fixture:proxy-pass-fixture@proxy.invalid:8080'
    const response = await createPrivateTransport().request({
      url: ANTIGRAVITY_GENERATE_ENDPOINT,
      accessToken: 'private-access-fixture',
      body: '{"request":"proxy"}',
    })

    await expect(readPrivateText(response)).resolves.toBe('hello')
    const basic = Buffer.from('proxy-user-fixture:proxy-pass-fixture').toString('base64')
    expect(socketState.proxyRequest).toContain(`Proxy-Authorization: Basic ${basic}\r\n`)
    expect(socketState.proxyRequest).not.toContain('private-access-fixture')
    expect(socketState.proxyRequest).not.toContain('{"request":"proxy"}')
    expect(socketState.request).toContain('Authorization: Bearer private-access-fixture\r\n')
    expect(socketState.request).not.toContain('Proxy-Authorization')
    expect(socketState.request).not.toContain('proxy-user-fixture')
    expect(socketState.request).not.toContain('proxy-pass-fixture')
  })

  it('redacts proxy credentials when CONNECT is rejected', async () => {
    delete process.env.NO_PROXY
    process.env.HTTPS_PROXY = 'http://proxy-user-fixture:proxy-pass-fixture@proxy.invalid:8080'
    socketState.proxyResponse = Buffer.from('HTTP/1.1 407 Proxy Authentication Required\r\n\r\n', 'latin1')

    const error = await createPrivateTransport().request({
      url: ANTIGRAVITY_GENERATE_ENDPOINT,
      accessToken: 'private-access-fixture',
      body: '{}',
    }).catch((value: unknown) => value)

    expect(error).toMatchObject({ code: 'offline', accepted: false })
    expect(String(error)).not.toMatch(/proxy-user-fixture|proxy-pass-fixture|private-access-fixture/u)
    expect(socketState.request).toBe('')
  })

  it('rejects unsafe proxy credential framing before any handshake', async () => {
    delete process.env.NO_PROXY
    process.env.HTTPS_PROXY = 'http://proxy-user%0d%0aInjected:proxy-pass@proxy.invalid:8080'

    const error = await createPrivateTransport().request({
      url: ANTIGRAVITY_GENERATE_ENDPOINT,
      accessToken: 'private-access-fixture',
      body: '{}',
    }).catch((value: unknown) => value)

    expect(error).toMatchObject({ code: 'offline', accepted: false })
    expect(String(error)).not.toMatch(/Injected|proxy-pass|private-access-fixture/u)
    expect(socketState.proxyRequest).toBe('')
    expect(socketState.request).toBe('')
  })

  it('aborts a pending authenticated CONNECT without dispatching upstream', async () => {
    delete process.env.NO_PROXY
    process.env.HTTPS_PROXY = 'http://proxy-user-fixture:proxy-pass-fixture@proxy.invalid:8080'
    socketState.holdProxyResponse = true
    const controller = new AbortController()
    const pending = createPrivateTransport().request({
      url: ANTIGRAVITY_GENERATE_ENDPOINT,
      accessToken: 'private-access-fixture',
      body: '{}',
      signal: controller.signal,
    })
    await new Promise<void>(resolve => queueMicrotask(resolve))
    controller.abort()

    await expect(pending).rejects.toMatchObject({ code: 'cancelled', accepted: false })
    expect(socketState.proxyRequest).not.toContain('private-access-fixture')
    expect(socketState.request).toBe('')
  })

  it('closes an active fixed-length body when cancelled before its first read', async () => {
    socketState.streamBody = true
    socketState.response = Buffer.from(
      'HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: 1073741824\r\n\r\n',
      'latin1',
    )
    const response = await createPrivateTransport().request({
      url: ANTIGRAVITY_GENERATE_ENDPOINT,
      accessToken: 'access-secret',
      body: '{}',
    })
    if (response.body === null) throw new Error('Expected an active response body')

    await expect(response.body.cancel()).resolves.toBeUndefined()
    await new Promise<void>(resolve => { setImmediate(resolve) })
    expect(socketState.socketClosed).toBe(true)
  })

  it('cancels an active fixed-length body without enqueueing into a closed Web controller', async () => {
    socketState.streamBody = true
    socketState.response = Buffer.from(
      'HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: 1073741824\r\n\r\n',
      'latin1',
    )
    const response = await createPrivateTransport().request({
      url: ANTIGRAVITY_GENERATE_ENDPOINT,
      accessToken: 'access-secret',
      body: '{}',
    })
    if (response.body === null) throw new Error('Expected an active response body')
    const reader = response.body.getReader()
    await reader.read()
    await reader.read()

    await expect(reader.cancel()).resolves.toBeUndefined()
    reader.releaseLock()
    await new Promise<void>(resolve => { setImmediate(resolve) })
    expect(socketState.socketClosed).toBe(true)
  })

  it('maps malformed gzip bodies to protocol drift without exposing bytes', async () => {
    socketState.response = Buffer.from(
      'HTTP/1.1 200 OK\r\nContent-Encoding: gzip\r\nContent-Length: 3\r\n\r\nbad',
      'latin1',
    )
    const response = await createPrivateTransport().request({
      url: ANTIGRAVITY_GENERATE_ENDPOINT,
      accessToken: 'access-secret',
      body: '{}',
    })

    await expect(readPrivateText(response)).rejects.toMatchObject({ code: 'protocol-drift' })
  })

  it('does not count a large first body packet as response header bytes', async () => {
    const body = 'a'.repeat(70 * 1024)
    socketState.response = Buffer.from(
      `HTTP/1.1 200 OK\r\nContent-Length: ${body.length}\r\n\r\n${body}`,
      'latin1',
    )
    const response = await createPrivateTransport().request({
      url: ANTIGRAVITY_GENERATE_ENDPOINT,
      accessToken: 'access-secret',
      body: '{}',
    })

    await expect(readPrivateText(response, { maxBytes: 80 * 1024 })).resolves.toHaveLength(body.length)
  })
})
