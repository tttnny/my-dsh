/** Literal HTTP/1.1 dispatcher for the fixed Antigravity wire profile. */

import { Buffer } from 'node:buffer'
import * as net from 'node:net'
import { PassThrough, Readable, Transform } from 'node:stream'
import type { Duplex } from 'node:stream'
import * as tls from 'node:tls'
import { createGunzip } from 'node:zlib'
import { PrivateTransportError } from './private-transport-error.ts'
import { createWireIdentity } from './wire-identity.ts'

const DEFAULT_HTTPS_PORT = 443
const DEFAULT_PROXY_PORT = 8080
const MAX_RESPONSE_HEAD_BYTES = 64 * 1024

export interface RawPrivateRequest {
  readonly url: string
  readonly accessToken: string
  readonly body: string | Uint8Array
  readonly signal?: AbortSignal
  readonly responseHeaderTimeoutMs: number
}

interface ParsedResponseHead {
  readonly status: number
  readonly statusText: string
  readonly headers: Headers
  readonly chunked: boolean
  readonly gzip: boolean
  readonly contentLength?: number
}

/** Dispatch one request using the immutable plugin-owned Wire Identity. */
export function createRawPrivateDispatcher(): (input: RawPrivateRequest) => Promise<Response> {
  const wire = createWireIdentity()
  return async input => {
    if (input.signal?.aborted === true) throw cancelled(false)
    const url = new URL(input.url)
    const request = wire.serialize(input.url, {
      authorization: `Bearer ${input.accessToken}`,
      body: input.body,
    })
    const socket = await connectTls(url, input.responseHeaderTimeoutMs, input.signal)
    let dispatched = false
    /** Close the socket only; the active waiter owns the cancellation error. */
    const abort = (): void => { socket.destroy() }
    try {
      if (isAborted(input.signal)) throw cancelled(false)
      input.signal?.addEventListener('abort', abort, { once: true })
      socket.write(request)
      dispatched = true
      const { head, leftover } = await waitForHead(socket, input.responseHeaderTimeoutMs, dispatched, input.signal)
      const parsed = parseResponseHead(head)
      const body = buildResponseBody(socket, leftover, parsed, input.signal)
      return new Response(body, {
        status: parsed.status,
        statusText: parsed.statusText,
        headers: parsed.headers,
      })
    } catch (error) {
      socket.destroy()
      if (error instanceof PrivateTransportError) throw error
      throw new PrivateTransportError('offline', 'The private endpoint could not be reached', { accepted: dispatched })
    } finally {
      input.signal?.removeEventListener('abort', abort)
    }
  }
}

async function connectTls(url: URL, timeoutMs: number, signal: AbortSignal | undefined): Promise<tls.TLSSocket> {
  const proxy = httpsProxy(url)
  return proxy === undefined
    ? connectDirect(url, timeoutMs, signal)
    : connectThroughProxy(proxy, url, timeoutMs, signal)
}

async function connectDirect(url: URL, timeoutMs: number, signal: AbortSignal | undefined): Promise<tls.TLSSocket> {
  const socket = tls.connect({
    host: url.hostname,
    port: Number(url.port || DEFAULT_HTTPS_PORT),
    servername: url.hostname,
  })
  await waitForConnect(socket, 'secureConnect', timeoutMs, signal)
  return socket
}

async function connectThroughProxy(proxy: URL, target: URL, timeoutMs: number, signal: AbortSignal | undefined): Promise<tls.TLSSocket> {
  const proxyAuthorization = proxyAuthorizationHeader(proxy)
  const proxySocket = net.connect({
    host: proxy.hostname,
    port: Number(proxy.port || DEFAULT_PROXY_PORT),
  })
  await waitForConnect(proxySocket, 'connect', timeoutMs, signal)
  const targetPort = Number(target.port || DEFAULT_HTTPS_PORT)
  proxySocket.write(
    `CONNECT ${target.hostname}:${targetPort} HTTP/1.1\r\n`
    + `Host: ${target.hostname}:${targetPort}\r\n`
    + proxyAuthorization
    + '\r\n',
  )
  const { head, leftover } = await waitForHead(proxySocket, timeoutMs, false, signal)
  if (!/^HTTP\/1\.[01]\s+2\d\d(?:\s|$)/u.test(head.split('\r\n', 1)[0] ?? '')) {
    proxySocket.destroy()
    throw new PrivateTransportError('offline', 'The HTTPS proxy rejected the private connection', { accepted: false })
  }
  if (leftover.byteLength > 0) proxySocket.unshift(leftover)
  proxySocket.resume()
  const socket = tls.connect({ socket: proxySocket, servername: target.hostname })
  await waitForConnect(socket, 'secureConnect', timeoutMs, signal)
  return socket
}

async function waitForConnect(
  socket: Duplex,
  event: 'connect' | 'secureConnect',
  timeoutMs: number,
  signal: AbortSignal | undefined,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let settled = false
    const finish = (action: () => void): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.removeListener(event, onConnect)
      socket.removeListener('error', onError)
      signal?.removeEventListener('abort', onAbort)
      action()
    }
    const onConnect = (): void => finish(resolve)
    const onError = (): void => finish(() => reject(new PrivateTransportError('offline', 'The private endpoint could not be reached', { accepted: false })))
    const onAbort = (): void => finish(() => {
      socket.destroy()
      reject(cancelled(false))
    })
    const timer = setTimeout(() => finish(() => {
      socket.destroy()
      reject(new PrivateTransportError('timeout', 'The private endpoint connection timed out', { accepted: false }))
    }), timeoutMs)
    socket.once(event, onConnect)
    socket.once('error', onError)
    if (signal?.aborted === true) onAbort()
    else signal?.addEventListener('abort', onAbort, { once: true })
  })
}

async function waitForHead(
  socket: Duplex,
  timeoutMs: number,
  accepted: boolean,
  signal?: AbortSignal,
): Promise<{ head: string; leftover: Buffer }> {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0)
    let settled = false
    const finish = (action: () => void): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.removeListener('data', onData)
      socket.removeListener('error', onError)
      signal?.removeEventListener('abort', onAbort)
      action()
    }
    const onError = (error: unknown): void => finish(() => reject(
      error instanceof PrivateTransportError
        ? error
        : new PrivateTransportError('offline', 'The private endpoint closed before response headers', { accepted }),
    ))
    const onAbort = (): void => finish(() => {
      socket.destroy()
      reject(cancelled(accepted))
    })
    const onData = (chunk: Buffer): void => {
      buffer = Buffer.concat([buffer, chunk])
      const marker = buffer.indexOf('\r\n\r\n')
      if (marker < 0) {
        if (buffer.byteLength > MAX_RESPONSE_HEAD_BYTES) finish(() => reject(new PrivateTransportError('protocol-drift', 'The private response headers exceeded the limit', { accepted })))
        return
      }
      if (marker > MAX_RESPONSE_HEAD_BYTES) {
        finish(() => reject(new PrivateTransportError('protocol-drift', 'The private response headers exceeded the limit', { accepted })))
        return
      }
      socket.pause()
      const head = buffer.subarray(0, marker).toString('latin1')
      const leftover = buffer.subarray(marker + 4)
      finish(() => resolve({ head, leftover }))
    }
    const timer = setTimeout(() => finish(() => {
      socket.destroy()
      reject(new PrivateTransportError('timeout', 'The private request timed out before response headers', { accepted }))
    }), timeoutMs)
    socket.on('data', onData)
    socket.once('error', onError)
    if (signal?.aborted === true) onAbort()
    else signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function parseResponseHead(value: string): ParsedResponseHead {
  const lines = value.split('\r\n')
  const statusLine = lines.shift() ?? ''
  const match = /^HTTP\/1\.[01]\s+(\d{3})(?:\s+([^\r\n]*))?$/u.exec(statusLine)
  if (match === null) throw new PrivateTransportError('protocol-drift', 'The private response status line was malformed')
  const status = Number(match[1])
  if (status < 200 || status > 599 || hasInvalidHeaderValue(match[2] ?? '')) throw new PrivateTransportError('protocol-drift', 'The private response status was unsupported')
  const headers = new Headers()
  let chunked = false
  let gzip = false
  let contentLength: number | undefined
  for (const line of lines) {
    if (line.length === 0 || /^[ \t]/u.test(line)) throw new PrivateTransportError('protocol-drift', 'The private response headers were malformed')
    const separator = line.indexOf(':')
    if (separator <= 0) throw new PrivateTransportError('protocol-drift', 'The private response headers were malformed')
    const name = line.slice(0, separator)
    const raw = line.slice(separator + 1).trim()
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u.test(name) || hasInvalidHeaderValue(raw)) {
      throw new PrivateTransportError('protocol-drift', 'The private response headers were malformed')
    }
    const lowerName = name.toLowerCase()
    const lowerValue = raw.toLowerCase()
    if (lowerName === 'transfer-encoding') {
      if (chunked || lowerValue !== 'chunked') throw new PrivateTransportError('protocol-drift', 'The private response framing was unsupported')
      chunked = true
      continue
    }
    if (lowerName === 'content-encoding') {
      if (gzip || lowerValue !== 'gzip') throw new PrivateTransportError('protocol-drift', 'The private response encoding was unsupported')
      gzip = true
      continue
    }
    if (lowerName === 'content-length') {
      if (contentLength !== undefined || !/^\d+$/u.test(raw)) throw new PrivateTransportError('protocol-drift', 'The private response length was ambiguous')
      const parsed = Number(raw)
      if (!Number.isSafeInteger(parsed) || parsed < 0) throw new PrivateTransportError('protocol-drift', 'The private response length was malformed')
      contentLength = parsed
      continue
    }
    headers.append(name, raw)
  }
  if (chunked && contentLength !== undefined) throw new PrivateTransportError('protocol-drift', 'The private response framing was ambiguous')
  if (!gzip && contentLength !== undefined) headers.set('content-length', String(contentLength))
  return {
    status,
    statusText: match[2] ?? '',
    headers,
    chunked,
    gzip,
    ...(contentLength === undefined ? {} : { contentLength }),
  }
}

function buildResponseBody(
  socket: Duplex,
  leftover: Buffer,
  head: ParsedResponseHead,
  signal: AbortSignal | undefined,
): ReadableStream<Uint8Array> {
  const source = new PassThrough()
  let current: Readable = source
  if (head.chunked) current = pipeStage(current, new ChunkedDecoder())
  else if (head.contentLength !== undefined) current = pipeStage(current, new ContentLengthDecoder(head.contentLength))
  if (head.gzip) {
    const gunzip = createGunzip()
    current = pipeStage(current, gunzip)
    current = pipeStage(current, new PassThrough(), () => new PrivateTransportError('protocol-drift', 'The private gzip response was malformed'))
  }
  const abort = (): void => { socket.destroy(cancelled(true)) }
  const cleanup = (): void => {
    signal?.removeEventListener('abort', abort)
    socket.destroy()
  }
  socket.once('error', error => source.destroy(
    error instanceof PrivateTransportError
      ? error
      : new PrivateTransportError('offline', 'The private response stream failed'),
  ))
  if (leftover.byteLength > 0) source.write(leftover)
  socket.pipe(source)
  socket.resume()
  if (signal?.aborted === true) abort()
  else signal?.addEventListener('abort', abort, { once: true })
  current.once('end', cleanup)
  current.once('error', cleanup)
  current.once('close', cleanup)
  return toWebBody(current)
}

function toWebBody(stream: Readable): ReadableStream<Uint8Array> {
  const iterable: AsyncIterable<Uint8Array> = {
    [Symbol.asyncIterator]: () => {
      const iterator = stream[Symbol.asyncIterator]() as AsyncIterator<Uint8Array>
      return {
        next: () => iterator.next(),
        return: async () => {
          stream.destroy()
          return iterator.return === undefined
            ? { done: true, value: undefined }
            : await iterator.return()
        },
      }
    },
  }
  // Node supports ReadableStream.from() here, but TypeScript's DOM constructor type does not expose it yet.
  return (ReadableStream as typeof ReadableStream & {
    from<T>(source: AsyncIterable<T> | Iterable<T>): ReadableStream<T>
  }).from(iterable)
}

function pipeStage(source: Readable, target: Transform, mapError: (error: Error) => Error = error => error): Readable {
  source.once('error', error => target.destroy(mapError(error)))
  return source.pipe(target)
}

class ContentLengthDecoder extends Transform {
  private remaining: number

  constructor(contentLength: number) {
    super()
    this.remaining = contentLength
    if (contentLength === 0) this.push(null)
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    if (this.remaining <= 0 || chunk.byteLength > this.remaining) {
      callback(new PrivateTransportError('protocol-drift', 'The private response exceeded its declared length'))
      return
    }
    this.remaining -= chunk.byteLength
    this.push(chunk)
    if (this.remaining === 0) this.push(null)
    callback()
  }

  override _flush(callback: (error?: Error | null) => void): void {
    callback(this.remaining === 0 ? undefined : new PrivateTransportError('protocol-drift', 'The private response ended before its declared length'))
  }
}

class ChunkedDecoder extends Transform {
  private buffer = Buffer.alloc(0)
  private finished = false

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    if (this.finished && chunk.byteLength > 0) {
      callback(new PrivateTransportError('protocol-drift', 'The private chunked response contained trailing bytes'))
      return
    }
    this.buffer = Buffer.concat([this.buffer, chunk])
    try {
      this.flushChunks()
      callback()
    } catch (error) {
      callback(error instanceof Error ? error : new PrivateTransportError('protocol-drift', 'The private chunked response was malformed'))
    }
  }

  override _flush(callback: (error?: Error | null) => void): void {
    try {
      this.flushChunks()
      callback(this.finished ? undefined : new PrivateTransportError('protocol-drift', 'The private chunked response ended early'))
    } catch (error) {
      callback(error instanceof Error ? error : new PrivateTransportError('protocol-drift', 'The private chunked response was malformed'))
    }
  }

  private flushChunks(): void {
    while (!this.finished) {
      const lineEnd = this.buffer.indexOf('\r\n')
      if (lineEnd < 0) return
      const sizeText = this.buffer.subarray(0, lineEnd).toString('latin1').split(';', 1)[0]?.trim() ?? ''
      if (!/^[0-9A-Fa-f]+$/u.test(sizeText)) throw new PrivateTransportError('protocol-drift', 'The private chunk size was malformed')
      const size = Number.parseInt(sizeText, 16)
      if (!Number.isSafeInteger(size) || size < 0) throw new PrivateTransportError('protocol-drift', 'The private chunk size was malformed')
      const chunkStart = lineEnd + 2
      const chunkEnd = chunkStart + size
      const end = chunkEnd + 2
      if (!Number.isSafeInteger(end)) throw new PrivateTransportError('protocol-drift', 'The private chunk size was malformed')
      if (this.buffer.byteLength < end) return
      if (this.buffer[chunkEnd] !== 0x0d || this.buffer[chunkEnd + 1] !== 0x0a) throw new PrivateTransportError('protocol-drift', 'The private chunk terminator was malformed')
      const payload = this.buffer.subarray(chunkStart, chunkEnd)
      this.buffer = this.buffer.subarray(end)
      if (size === 0) {
        if (this.buffer.byteLength > 0) throw new PrivateTransportError('protocol-drift', 'The private chunked response contained trailing bytes')
        this.finished = true
        this.push(null)
        return
      }
      this.push(payload)
    }
  }
}

function proxyAuthorizationHeader(proxy: URL): string {
  if (proxy.username.length === 0) return ''
  let username: string
  let password: string
  try {
    username = decodeURIComponent(proxy.username)
    password = decodeURIComponent(proxy.password)
  } catch {
    throw new PrivateTransportError('offline', 'The configured HTTPS proxy credentials are invalid', { accepted: false })
  }
  if (username.length > 1024 || password.length > 1024 || username.includes(':')
    || hasInvalidHeaderValue(username) || hasInvalidHeaderValue(password)) {
    throw new PrivateTransportError('offline', 'The configured HTTPS proxy credentials are invalid', { accepted: false })
  }
  return `Proxy-Authorization: Basic ${Buffer.from(`${username}:${password}`).toString('base64')}\r\n`
}

function httpsProxy(url: URL): URL | undefined {
  const noProxy = process.env.NO_PROXY ?? process.env.no_proxy ?? ''
  if (matchesNoProxy(url.hostname, noProxy)) return undefined
  const raw = process.env.HTTPS_PROXY ?? process.env.https_proxy ?? process.env.ALL_PROXY ?? process.env.all_proxy
  if (raw === undefined || raw.length === 0) return undefined
  try {
    const proxy = new URL(raw)
    if (proxy.protocol !== 'http:') throw new PrivateTransportError('offline', 'The configured HTTPS proxy protocol is unsupported', { accepted: false })
    return proxy
  } catch (error) {
    if (error instanceof PrivateTransportError) throw error
    throw new PrivateTransportError('offline', 'The configured HTTPS proxy URL is invalid', { accepted: false })
  }
}

function matchesNoProxy(hostname: string, value: string): boolean {
  const host = hostname.toLowerCase()
  return value.split(',').map(item => item.trim().toLowerCase()).some(item => (
    item === '*'
    || (item.startsWith('.') ? host.endsWith(item) : item.length > 0 && (host === item || host.endsWith(`.${item}`)))
  ))
}

function hasInvalidHeaderValue(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if ((code < 0x20 && code !== 0x09) || code === 0x7f) return true
  }
  return false
}

function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true
}

function cancelled(accepted: boolean): PrivateTransportError {
  return new PrivateTransportError('cancelled', 'The private request was cancelled', { accepted })
}
