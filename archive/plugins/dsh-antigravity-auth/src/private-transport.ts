/** Bounded Host-only transport primitives for the private Antigravity endpoints. */

import { createRawPrivateDispatcher } from './raw-http.ts'
import { PrivateTransportError } from './private-transport-error.ts'
import { ANTIGRAVITY_WIRE_ORIGIN } from './wire-identity.ts'
export { PrivateTransportError } from './private-transport-error.ts'
export type { PrivateTransportErrorCode } from './private-transport-error.ts'

export const DEFAULT_PRIVATE_RESPONSE_HEADER_TIMEOUT_MS = 180_000
export const DEFAULT_PRIVATE_IDLE_TIMEOUT_MS = 60_000
export const DEFAULT_PRIVATE_TOTAL_TIMEOUT_MS = 300_000
export const DEFAULT_PRIVATE_RESPONSE_BYTES = 8 * 1024 * 1024
export const DEFAULT_PRIVATE_REQUEST_BYTES = 16 * 1024 * 1024
export const MAX_PRIVATE_REQUEST_BYTES = 64 * 1024 * 1024
export const DEFAULT_PRIVATE_FRAME_BYTES = 512 * 1024

export interface PrivateTransportRequest {
  readonly url: string
  readonly accessToken: string
  readonly body: string | Uint8Array
  readonly signal?: AbortSignal
  readonly responseHeaderTimeoutMs?: number
}

export interface PrivateTransportOptions {
  readonly responseHeaderTimeoutMs?: number
  readonly maxRequestBytes?: number
}

export interface PrivateTransport {
  request(input: PrivateTransportRequest): Promise<Response>
}

/** Build one fixed raw private transport. Callers cannot supply headers, identity, or origins. */
export function createPrivateTransport(options: PrivateTransportOptions = {}): PrivateTransport {
  let dispatch: ReturnType<typeof createRawPrivateDispatcher> | undefined
  const headerTimeoutMs = boundedTimeout(options.responseHeaderTimeoutMs, DEFAULT_PRIVATE_RESPONSE_HEADER_TIMEOUT_MS)
  const maxRequestBytes = boundedRequestBytes(options.maxRequestBytes)

  return {
    request: async input => {
      if (isAborted(input.signal)) throw cancelledError(false)
      const requestBytes = typeof input.body === 'string' ? new TextEncoder().encode(input.body).byteLength : input.body.byteLength
      if (requestBytes > maxRequestBytes) throw new PrivateTransportError('request-too-large', 'The private request exceeded the byte limit', { accepted: false })
      if (dispatch === undefined) {
        try { dispatch = createRawPrivateDispatcher() } catch {
          throw new PrivateTransportError('attribution-rejected', 'The private request identity could not be constructed', { accepted: false })
        }
      }
      const response = await dispatch({
        url: input.url,
        accessToken: input.accessToken,
        body: input.body,
        ...(input.signal === undefined ? {} : { signal: input.signal }),
        responseHeaderTimeoutMs: boundedTimeout(input.responseHeaderTimeoutMs, headerTimeoutMs),
      })
      if (!(response instanceof Response)) throw new PrivateTransportError('invalid-response', 'The private endpoint returned no response')
      return response
    },
  }
}

/** Convert a bounded response status to a safe provider error without exposing its body. */
export function privateStatusError(status: number): PrivateTransportError | undefined {
  if (status >= 200 && status < 300) return undefined
  if (status === 401) return new PrivateTransportError('authentication', 'The private endpoint requires authentication', { status })
  if (status === 403) return new PrivateTransportError('forbidden', 'The private endpoint forbade this account', { status })
  if (status === 429) return new PrivateTransportError('rate-limited', 'The private endpoint is rate-limited', { status })
  if (status >= 500) return new PrivateTransportError('upstream', 'The private endpoint is unavailable', { status })
  return new PrivateTransportError('protocol-drift', 'The private endpoint returned an unexpected status', { status })
}

export interface BoundedReadOptions {
  readonly signal?: AbortSignal
  readonly idleTimeoutMs?: number
  readonly totalTimeoutMs?: number
  readonly maxBytes?: number
}

/** Read a response body with byte, idle, total, and cancellation bounds. */
export async function readPrivateBytes(response: Response, options: BoundedReadOptions = {}): Promise<Uint8Array> {
  const maxBytes = boundedBytes(options.maxBytes, DEFAULT_PRIVATE_RESPONSE_BYTES)
  if (response.body === null) {
    try {
      const data = new Uint8Array(await response.arrayBuffer())
      if (data.byteLength > maxBytes) throw new PrivateTransportError('response-too-large', 'The private response exceeded the byte limit')
      return data
    } catch (error) {
      if (error instanceof PrivateTransportError) throw error
      if (isAborted(options.signal)) throw cancelledError()
      throw new PrivateTransportError('offline', 'The private response body could not be read')
    }
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  const startedAt = Date.now()
  try {
    for (;;) {
      const chunk = await readChunk(reader, options, startedAt)
      if (chunk.done) break
      const value = chunk.value
      total += value.byteLength
      if (total > maxBytes) {
        await cancelReader(reader)
        throw new PrivateTransportError('response-too-large', 'The private response exceeded the byte limit')
      }
      chunks.push(value)
    }
  } catch (error) {
    if (error instanceof PrivateTransportError) throw error
    if (isAborted(options.signal)) throw cancelledError()
    throw new PrivateTransportError('offline', 'The private response body could not be read')
  } finally {
    reader.releaseLock()
  }
  const output = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.byteLength
  }
  return output
}

export async function readPrivateText(response: Response, options: BoundedReadOptions = {}): Promise<string> {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(await readPrivateBytes(response, options))
  } catch (error) {
    if (error instanceof PrivateTransportError) throw error
    throw new PrivateTransportError('invalid-response', 'The private response was not valid UTF-8')
  }
}

export interface PrivateSseEvent {
  readonly data: string
  readonly event?: string
}

/** Parse SSE/JSON responses without retaining unbounded provider frames. */
export async function* iteratePrivateSse(
  response: Response,
  options: BoundedReadOptions & { readonly maxFrameBytes?: number } = {},
): AsyncGenerator<PrivateSseEvent> {
  const maxBytes = boundedBytes(options.maxBytes, DEFAULT_PRIVATE_RESPONSE_BYTES)
  const maxFrameBytes = boundedBytes(options.maxFrameBytes, DEFAULT_PRIVATE_FRAME_BYTES)
  if (response.body === null) {
    const text = await readPrivateText(response, options)
    if (text.trim().length > 0) yield { data: text.trim() }
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let buffer = ''
  let eventName: string | undefined
  let dataLines: string[] = []
  let bytes = 0
  let frameBytes = 0
  let sawSseFrame = false
  let plainText = ''
  const startedAt = Date.now()
  const flush = (): PrivateSseEvent | undefined => {
    if (dataLines.length === 0) {
      eventName = undefined
      frameBytes = 0
      return undefined
    }
    const data = dataLines.join('\n')
    const event = eventName
    dataLines = []
    eventName = undefined
    frameBytes = 0
    sawSseFrame = true
    return event === undefined ? { data } : { data, event }
  }

  try {
    for (;;) {
      const chunk = await readChunk(reader, options, startedAt)
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > maxBytes) throw new PrivateTransportError('response-too-large', 'The private response exceeded the byte limit')
      let decoded: string
      try { decoded = decoder.decode(chunk.value, { stream: true }) } catch { throw new PrivateTransportError('invalid-response', 'The private response was not valid UTF-8') }
      plainText += decoded
      buffer += decoded
      for (;;) {
        const newline = buffer.indexOf('\n')
        if (newline < 0) break
        let line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        if (line.endsWith('\r')) line = line.slice(0, -1)
        if (utf8Bytes(line) > maxFrameBytes) throw new PrivateTransportError('frame-too-large', 'The private response frame exceeded the byte limit')
        if (line.length === 0) {
          const event = flush()
          if (event !== undefined) yield event
          continue
        }
        if (line.startsWith(':')) continue
        frameBytes += utf8Bytes(line) + 1
        if (frameBytes > maxFrameBytes) throw new PrivateTransportError('frame-too-large', 'The private response frame exceeded the byte limit')
        if (line.startsWith('event:')) {
          eventName = line.slice('event:'.length).trim() || undefined
        } else if (line.startsWith('data:')) {
          const value = line.slice('data:'.length).replace(/^ /u, '')
          dataLines.push(value)
        }
      }
    }
    let tail: string
    try { tail = decoder.decode() } catch { throw new PrivateTransportError('invalid-response', 'The private response was not valid UTF-8') }
    plainText += tail
    buffer += tail
    if (buffer.length > 0) {
      frameBytes += utf8Bytes(buffer)
      if (frameBytes > maxFrameBytes) throw new PrivateTransportError('frame-too-large', 'The private response frame exceeded the byte limit')
      if (buffer.startsWith('data:')) dataLines.push(buffer.slice(5).replace(/^ /u, ''))
    }
    const event = flush()
    if (event !== undefined) yield event
    if (!sawSseFrame && plainText.trim().length > 0) yield { data: plainText.trim() }
  } catch (error) {
    if (error instanceof PrivateTransportError) throw error
    if (isAborted(options.signal)) throw cancelledError()
    throw new PrivateTransportError('offline', 'The private response stream could not be read')
  } finally {
    await cancelReader(reader)
    reader.releaseLock()
  }
}

export function assertPrivateEndpoint(url: string): void {
  let parsed: URL
  try { parsed = new URL(url) } catch { throw new PrivateTransportError('protocol-drift', 'The private endpoint URL is invalid') }
  if (parsed.origin !== ANTIGRAVITY_WIRE_ORIGIN || parsed.protocol !== 'https:' || parsed.search || parsed.hash) {
    throw new PrivateTransportError('protocol-drift', 'The private endpoint URL is not allowlisted')
  }
}

async function readChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  options: BoundedReadOptions,
  startedAt: number,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (isAborted(options.signal)) {
    await cancelReader(reader)
    throw cancelledError()
  }
  const totalTimeout = boundedTimeout(options.totalTimeoutMs, DEFAULT_PRIVATE_TOTAL_TIMEOUT_MS)
  const elapsed = Date.now() - startedAt
  if (elapsed >= totalTimeout) {
    await cancelReader(reader)
    throw new PrivateTransportError('timeout', 'The private response exceeded the total timeout')
  }
  const idleTimeout = boundedTimeout(options.idleTimeoutMs, DEFAULT_PRIVATE_IDLE_TIMEOUT_MS)
  let timer: ReturnType<typeof setTimeout> | undefined
  let removeAbort: (() => void) | undefined
  const abort = new Promise<never>((_, reject) => {
    const onAbort = (): void => reject(cancelledError())
    removeAbort = () => options.signal?.removeEventListener('abort', onAbort)
    if (options.signal === undefined) return
    if (options.signal.aborted) onAbort()
    else options.signal.addEventListener('abort', onAbort, { once: true })
  })
  const idle = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new PrivateTransportError('timeout', 'The private response stream stalled')), idleTimeout)
  })
  let totalHandle: ReturnType<typeof setTimeout> | undefined
  const remaining = totalTimeout - elapsed
  const total = new Promise<never>((_, reject) => {
    totalHandle = setTimeout(() => reject(new PrivateTransportError('timeout', 'The private response exceeded the total timeout')), remaining)
  })
  try {
    return await Promise.race([reader.read(), abort, idle, total])
  } catch (error) {
    await cancelReader(reader)
    throw error
  } finally {
    if (timer !== undefined) clearTimeout(timer)
    if (totalHandle !== undefined) clearTimeout(totalHandle)
    removeAbort?.()
  }
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function isAborted(signal: AbortSignal | undefined): boolean {
  return signal !== undefined && signal.aborted
}

async function cancelReader(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
  try { await reader.cancel() } catch { /* best effort */ }
}

function cancelledError(accepted = true): PrivateTransportError {
  return new PrivateTransportError('cancelled', 'The private request was cancelled', { accepted })
}

function boundedTimeout(value: number | undefined, fallback: number): number {
  return value === undefined || !Number.isFinite(value) || value <= 0 ? fallback : Math.min(Math.floor(value), 10 * 60 * 1000)
}

function boundedRequestBytes(value: number | undefined): number {
  return value === undefined || !Number.isFinite(value) || value <= 0
    ? DEFAULT_PRIVATE_REQUEST_BYTES
    : Math.min(Math.floor(value), MAX_PRIVATE_REQUEST_BYTES)
}

function boundedBytes(value: number | undefined, fallback: number): number {
  return value === undefined || !Number.isFinite(value) || value <= 0 ? fallback : Math.min(Math.floor(value), fallback)
}
