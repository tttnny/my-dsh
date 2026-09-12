/** Dedicated grounded Web Search provider and independently mounted Search row. */

import type { Context } from '@deepseek-ai/cordis'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { SEARCH_SYSTEM_INSTRUCTION, resolveModelWithTier } from '@cortexkit/antigravity-auth-core'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-settings'
import { WebError } from '@deepseek-ai/dsh-web'
import type { WebSearchProvider, WebSearchRequest, WebSearchResult, WebSearchSource } from '@deepseek-ai/dsh-web'
import { createAntigravityAuthService } from './auth-service.ts'
import type { AntigravityAuthService } from './auth-service.ts'
import type { CredentialCoordinator, HostCredential } from './credential-coordinator.ts'
import {
  DEFAULT_PRIVATE_FRAME_BYTES,
  DEFAULT_PRIVATE_IDLE_TIMEOUT_MS,
  DEFAULT_PRIVATE_RESPONSE_BYTES,
  DEFAULT_PRIVATE_TOTAL_TIMEOUT_MS,
  PrivateTransportError,
  createPrivateTransport,
  iteratePrivateSse,
  privateStatusError,
  type PrivateTransport,
} from './private-transport.ts'
import { ANTIGRAVITY_WIRE_ORIGIN } from './wire-identity.ts'
import { classifyPrivateFailure, type PrivateFailureKind } from './private-failure.ts'
import { mountCapabilityLifecycle, type CapabilityLifecycle } from './capability-lifecycle.ts'

export const name = 'antigravity-search'
export const inject = ['web', 'antigravityAuth']
export const ANTIGRAVITY_SEARCH_PROVIDER_ID = 'antigravity'
export const ANTIGRAVITY_SEARCH_ENDPOINT = `${ANTIGRAVITY_WIRE_ORIGIN}/v1internal:generateContent` as const
export const ANTIGRAVITY_SEARCH_MODEL = 'antigravity-gemini-3.7-flash'
export const ANTIGRAVITY_SEARCH_SETTINGS_NAMESPACE = 'antigravity-search'

export interface AntigravitySearchSettings {
  enabled: boolean
  model: string
  maxResults: number
}

export interface Config extends AntigravitySearchSettings {}

export const Config: z<Config> = z.object({
  enabled: z.boolean().default(true),
  model: z.string().default(ANTIGRAVITY_SEARCH_MODEL),
  maxResults: z.number().step(1).min(1).max(50).default(10),
})

export interface AntigravitySearchProviderOptions {
  readonly auth: Pick<CredentialCoordinator, 'credential'> | { credential(signal?: AbortSignal): Promise<HostCredential | undefined> }
  readonly enabled?: () => boolean
  readonly settings?: () => AntigravitySearchSettings
  readonly transport?: PrivateTransport
  readonly maxResponseBytes?: number
}

export class AntigravitySearchProvider implements WebSearchProvider {
  readonly id = ANTIGRAVITY_SEARCH_PROVIDER_ID
  private readonly enabled: () => boolean
  private readonly transport: PrivateTransport

  constructor(private readonly options: AntigravitySearchProviderOptions) {
    this.enabled = options.enabled ?? (() => options.settings?.().enabled ?? true)
    this.transport = options.transport ?? createPrivateTransport()
  }

  available(): boolean {
    return this.enabled()
  }

  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    if (!this.enabled()) throw new WebError('Antigravity Web Search is disabled by its capability gate', 'ANTIGRAVITY_SEARCH_DISABLED')
    if (signal?.aborted === true) throw new WebError('Antigravity Web Search was cancelled', 'ANTIGRAVITY_SEARCH_CANCELLED')
    if (typeof request.query !== 'string' || request.query.trim().length === 0 || request.query.length > 16_384) {
      throw new WebError('Antigravity Web Search requires a bounded query', 'ANTIGRAVITY_SEARCH_INVALID_QUERY')
    }
    const settings = this.options.settings?.() ?? { enabled: true, model: ANTIGRAVITY_SEARCH_MODEL, maxResults: 10 }
    const configuredMax = boundedInteger(settings.maxResults, 1, 50)
    const requestedMax = request.maxResults === undefined ? configuredMax : boundedInteger(request.maxResults, 1, 50)
    const maxResults = Math.min(configuredMax, requestedMax)
    const credential = await this.options.auth.credential(signal)
    if (credential === undefined) throw new WebError('Antigravity Web Search requires a logged-in account', 'ANTIGRAVITY_SEARCH_AUTH_REQUIRED')
    const response = await this.transport.request({
      url: ANTIGRAVITY_SEARCH_ENDPOINT,
      accessToken: credential.accessToken,
      body: JSON.stringify(buildGroundedSearchPayload(request.query.trim(), credential, settings.model)),
      ...(signal === undefined ? {} : { signal }),
    }).catch(error => { throw toWebError(error) })
    const statusError = privateStatusError(response.status)
    if (statusError !== undefined) {
      await response.body?.cancel().catch(() => {})
      throw toWebError(statusError)
    }
    const sources: WebSearchSource[] = []
    const seen = new Set<string>()
    const content: string[] = []
    let truncated = false
    try {
      for await (const event of iteratePrivateSse(response, {
        ...(signal === undefined ? {} : { signal }),
        idleTimeoutMs: DEFAULT_PRIVATE_IDLE_TIMEOUT_MS,
        totalTimeoutMs: DEFAULT_PRIVATE_TOTAL_TIMEOUT_MS,
        maxBytes: this.options.maxResponseBytes ?? DEFAULT_PRIVATE_RESPONSE_BYTES,
        maxFrameBytes: DEFAULT_PRIVATE_FRAME_BYTES,
      })) {
        if (event.data.trim() === '[DONE]') continue
        const value = parseJson(event.data)
        truncated ||= collectSearchFacts(value, content, sources, seen, maxResults)
      }
    } catch (error) {
      throw toWebError(error)
    }
    if (sources.length === 0) throw new WebError('Antigravity Search returned no validated grounding sources', 'ANTIGRAVITY_SEARCH_NO_SOURCES')
    return {
      ...(content.length === 0 ? {} : { content: content.join('').slice(0, 64 * 1024) }),
      sources: await resolvePublishedSources(sources, signal),
      truncated,
    }
  }
}

/**
 * Hostname serving Google's opaque grounding redirects. A grounded response
 * carries only these token URLs, so the publisher is invisible in a citation
 * until the redirect is read.
 */
const GROUNDING_REDIRECT_HOSTNAME = 'vertexaisearch.cloud.google.com'
const GROUNDING_REDIRECT_PATH = '/grounding-api-redirect/'
/** Upper bound on resolutions per search; the remainder keep their opaque URI. */
const MAX_SOURCE_RESOLUTIONS = 10
/** Cooperative budget for one redirect read. */
const SOURCE_RESOLUTION_TIMEOUT_MS = 2_500
/** Upper bound on publisher pages read for a title; the rest keep their label. */
const MAX_TITLE_FETCHES = 8
/** Bytes read from one publisher page before giving up on its `<title>`. */
const MAX_TITLE_BYTES = 64 * 1024
/** Cooperative budget for one publisher page read. */
const TITLE_FETCH_TIMEOUT_MS = 3_000
/** Longest page title accepted as a source label. */
const MAX_TITLE_LENGTH = 300
/** A label made only of host labels is a host name, not a page title. */
const HOSTNAME_LABEL = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/u

/** Whether one grounding URI hides its publisher behind a redirect token. */
function isOpaqueGroundingRedirect(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
      && url.hostname === GROUNDING_REDIRECT_HOSTNAME
      && url.pathname.startsWith(GROUNDING_REDIRECT_PATH)
  } catch {
    return false
  }
}

/** Whether a source is still labelled by its host name instead of a page title. */
function isHostnameLabel(label: string | undefined): boolean {
  if (label === undefined) return true
  const trimmed = label.trim()
  return trimmed.length === 0 || HOSTNAME_LABEL.test(trimmed.toLowerCase())
}

/** The public probe used by every enrichment step; absence simply skips it. */
function publicProbe(): typeof globalThis.fetch | undefined {
  return typeof globalThis.fetch === 'function' ? globalThis.fetch : undefined
}

/** Combine the caller's cancellation with one step's own time budget. */
function scopedSignal(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const budget = AbortSignal.timeout(timeoutMs)
  return signal === undefined ? budget : AbortSignal.any([signal, budget])
}

/**
 * Read the publisher URL behind one opaque grounding redirect.
 *
 * `redirect: 'manual'` exposes the `Location` header without following it, so
 * this contacts only the redirect service and never the publisher. Every failure
 * — timeout, cancellation, transport error, a missing or still-opaque target —
 * keeps the original token, so an unreachable redirect service can only cost the
 * readability of one citation and never the search itself.
 */
async function resolvePublishedUrl(value: string, signal: AbortSignal | undefined): Promise<string> {
  const probe = publicProbe()
  if (probe === undefined) return value
  try {
    const response = await probe(value, { method: 'HEAD', redirect: 'manual', signal: scopedSignal(signal, SOURCE_RESOLUTION_TIMEOUT_MS) })
    await response.body?.cancel().catch(() => {})
    const location = response.headers.get('location')
    if (location === null || location.length === 0 || location.length > 8192) return value
    const target = new URL(location, value).toString()
    // A second opaque hop would be no more readable than the first.
    return isHttpUrl(target) && !isOpaqueGroundingRedirect(target) ? target : value
  } catch {
    return value
  }
}

/** Read at most `maxBytes` of a page, stopping early once its title closed. */
async function readTitleBytes(body: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  // The title markers are ASCII in every HTML encoding, so the early-stop check
  // reads a latin1 view while the bytes stay undecoded for charset sniffing.
  let ascii = ''
  let bytes = 0
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done === true) break
      chunks.push(chunk.value)
      bytes += chunk.value.byteLength
      ascii += Buffer.from(chunk.value).toString('latin1')
      if (bytes >= MAX_TITLE_BYTES || /<\/title[\s>]/iu.test(ascii)) break
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
  return Buffer.concat(chunks, bytes)
}

/**
 * Decode a page prefix with the charset it declares.
 *
 * Chinese finance pages still ship GBK/GB2312, so decoding every page as UTF-8
 * turns their titles into replacement characters. The declaration is ASCII in
 * every encoding, so it is read from a latin1 view and the bytes are then decoded
 * with that label; an unknown label falls back to UTF-8.
 */
function decodePagePrefix(bytes: Uint8Array): string {
  const declaration = /<meta[^>]+charset\s*=\s*["']?\s*([a-z0-9_:.-]+)/iu
    .exec(Buffer.from(bytes.subarray(0, 4096)).toString('latin1'))
  for (const label of [declaration?.[1], 'utf-8']) {
    if (label === undefined) continue
    try {
      return new TextDecoder(label, { fatal: false }).decode(bytes)
    } catch {
      // An unusable label only costs this attempt; UTF-8 remains.
    }
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
}

/** Extract one usable `<title>` from a page prefix. */
function extractPageTitle(bytes: Uint8Array): string | undefined {
  const match = /<title[^>]*>([\s\S]*?)<\/title\s*>/iu.exec(decodePagePrefix(bytes))
  if (match === null) return undefined
  const decoded = (match[1] ?? '')
    .replace(/<[^>]*>/gu, ' ')
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>')
    .replace(/&quot;/giu, '"')
    .replace(/&#0*39;|&apos;/giu, "'")
    .replace(/&nbsp;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/\s+/gu, ' ')
    .trim()
  return decoded.length === 0 || decoded.length > MAX_TITLE_LENGTH || hasControl(decoded) ? undefined : decoded
}

/**
 * Read one publisher page's title, so a source reads like a search result
 * rather than a bare host name.
 *
 * Grounding returns the host name in `web.title`, which is the one visible
 * difference from a stock search result. Only the page head is read, the request
 * carries no credentials, and every failure returns `undefined` so the caller
 * keeps the host-name label.
 */
async function fetchPageTitle(url: string, signal: AbortSignal | undefined): Promise<string | undefined> {
  const probe = publicProbe()
  if (probe === undefined) return undefined
  try {
    const response = await probe(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { accept: 'text/html,application/xhtml+xml' },
      signal: scopedSignal(signal, TITLE_FETCH_TIMEOUT_MS),
    })
    if (response.body === null) return undefined
    return extractPageTitle(await readTitleBytes(response.body))
  } catch {
    return undefined
  }
}

/** Replace host-name labels with the publisher page titles, concurrently and bounded. */
async function enrichSourceTitles(
  sources: readonly WebSearchSource[],
  signal: AbortSignal | undefined,
): Promise<WebSearchSource[]> {
  const targets = sources
    .filter(source => !isOpaqueGroundingRedirect(source.url) && isHostnameLabel(source.title) && isHttpUrl(source.url))
    .slice(0, MAX_TITLE_FETCHES)
  if (targets.length === 0) return [...sources]
  const titles = new Map(await Promise.all(targets.map(async source => (
    [source.url, await fetchPageTitle(source.url, signal)] as const
  ))))
  return sources.map(source => {
    const title = titles.get(source.url)
    return title === undefined ? source : { ...source, title }
  })
}

/**
 * Turn grounding output into a stock-looking result list: every opaque redirect
 * becomes the publisher URL it points at, sources collapsing onto the same
 * publisher are dropped, and host-name labels are replaced by page titles.
 *
 * Sources are enriched concurrently and every step is best-effort: an unresolved
 * redirect or an unreadable page only costs that one citation's readability.
 */
async function resolvePublishedSources(
  sources: readonly WebSearchSource[],
  signal: AbortSignal | undefined,
): Promise<WebSearchSource[]> {
  const resolutions = await Promise.all(sources
    .filter(source => isOpaqueGroundingRedirect(source.url))
    .slice(0, MAX_SOURCE_RESOLUTIONS)
    .map(async source => [source.url, await resolvePublishedUrl(source.url, signal)] as const))
  const resolved = new Map(resolutions)
  const published: WebSearchSource[] = []
  const seen = new Set<string>()
  for (const source of sources) {
    const url = resolved.get(source.url) ?? source.url
    if (seen.has(url)) continue
    seen.add(url)
    published.push(url === source.url ? source : { ...source, url })
  }
  return await enrichSourceTitles(published, signal)
}

/**
 * Outer-envelope identity the private endpoint requires before it will generate
 * an answer instead of grounding alone. Captured from the audited community
 * implementation (`packages/opencode/src/plugin/search.ts`): without `requestId`,
 * `userAgent`, `requestType`, and a request `sessionId`, the same call returns
 * grounding chunks with no `candidates[].content.parts[].text`.
 */
const SEARCH_REQUEST_ID_PREFIX = 'agent'
const SEARCH_REQUEST_ID_SUFFIX = '2'
const SEARCH_USER_AGENT = 'antigravity'
const SEARCH_REQUEST_TYPE = 'agent'
const SEARCH_SESSION_PREFIX = `search-${Date.now().toString(36)}`
let searchSessionCounter = 0

/** One search call's session id, in the captured `search-<base36>-<n>` shape. */
function nextSearchSessionId(): string {
  searchSessionCounter += 1
  return `${SEARCH_SESSION_PREFIX}-${String(searchSessionCounter)}`
}

/** Captured `agent/<uuid>/<epoch ms>/<uuid>/2` request-id shape. */
function buildSearchRequestId(now: number): string {
  return `${SEARCH_REQUEST_ID_PREFIX}/${randomUUID()}/${String(now)}/${randomUUID()}/${SEARCH_REQUEST_ID_SUFFIX}`
}

/**
 * Build the dedicated grounded request.
 *
 * Field order, envelope identity, and the system instruction mirror the audited
 * community capture, because that shape is the one observed to return an answer
 * alongside `groundingMetadata`. `generationConfig` pins temperature 0 so repeats
 * of one query stay stable.
 */
export function buildGroundedSearchPayload(
  query: string,
  credential: Pick<HostCredential, 'projectId'>,
  model = ANTIGRAVITY_SEARCH_MODEL,
  now = Date.now(),
): Record<string, unknown> {
  return {
    project: credential.projectId,
    requestId: buildSearchRequestId(now),
    request: {
      systemInstruction: { parts: [{ text: SEARCH_SYSTEM_INSTRUCTION }] },
      contents: [{ role: 'user', parts: [{ text: query }] }],
      tools: [{ googleSearch: {} }],
      generationConfig: { temperature: 0, topP: 1 },
      sessionId: nextSearchSessionId(),
    },
    model: resolveModelWithTier(model, { cli_first: false }).actualModel,
    userAgent: SEARCH_USER_AGENT,
    requestType: SEARCH_REQUEST_TYPE,
  }
}

/** Mount only the public Web Search seam; no fetch provider is registered. */
export function apply(ctx?: Context, config: Config = { enabled: true, model: ANTIGRAVITY_SEARCH_MODEL, maxResults: 10 }): void {
  if (ctx === undefined) return
  const candidate = ctx as unknown as { web?: { registerSearchProvider: (value: WebSearchProvider) => () => void }; get?: (name: string) => unknown }
  if (candidate.web === undefined) return
  let current = (): AntigravitySearchSettings => config
  let lifecycle: CapabilityLifecycle | undefined
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.installSection(ctx, ANTIGRAVITY_SEARCH_SETTINGS_NAMESPACE, Config, config, {
      setSource: source => { current = source; lifecycle?.sync() },
      onChange: () => { lifecycle?.sync() },
    })
  })
  const provided = candidate.get?.('antigravityAuth')
  const auth = isAuthService(provided) ? provided : createAntigravityAuthService()
  lifecycle = mountCapabilityLifecycle({
    ctx,
    auth,
    id: 'search',
    enabled: () => current().enabled,
    register: () => {
      const web = candidate.web as unknown as {
        registerSearchProvider: (value: WebSearchProvider) => () => void
        searchProviderId: string | undefined
      }
      const previousProviderId = web.searchProviderId
      web.searchProviderId = ANTIGRAVITY_SEARCH_PROVIDER_ID
      const unregister = web.registerSearchProvider(new AntigravitySearchProvider({ auth, settings: () => current() }))
      return () => {
        if (web.searchProviderId === ANTIGRAVITY_SEARCH_PROVIDER_ID) {
          web.searchProviderId = previousProviderId
        }
        unregister()
      }
    },
    ownsAuth: auth !== provided,
    label: 'antigravity-search: provider lifecycle',
  })
}

function collectSearchFacts(
  value: unknown,
  content: string[],
  sources: WebSearchSource[],
  seen: Set<string>,
  maxResults: number,
): boolean {
  if (!isRecord(value)) return false
  const root = isRecord(value.response) ? value.response : value
  const texts = [findText(root)]
  const metadataValues: unknown[] = [root.groundingMetadata, root.grounding_metadata, value.groundingMetadata]
  if (Array.isArray(root.candidates)) {
    if (root.candidates.length > 512) throw new WebError('Antigravity Search returned too many candidates', 'ANTIGRAVITY_SEARCH_PROTOCOL_DRIFT')
    for (const candidate of root.candidates) {
      if (!isRecord(candidate)) continue
      // `findText` also reads `content.parts`, so probing the candidate itself is
      // limited to a candidate-local `parts` array; otherwise the answer is
      // appended twice for the captured `candidates[].content.parts[]` shape.
      if (Array.isArray(candidate.parts)) texts.push(findText(candidate))
      if (isRecord(candidate.content)) texts.push(findText(candidate.content))
      metadataValues.push(candidate.groundingMetadata, candidate.grounding_metadata)
    }
  }
  for (const text of texts) appendBounded(content, text)
  let truncated = false
  for (const rawMetadata of metadataValues) {
    if (!isRecord(rawMetadata)) continue
    const chunks = rawMetadata.groundingChunks ?? rawMetadata.grounding_chunks
    if (!Array.isArray(chunks)) continue
    if (chunks.length > 4096) throw new WebError('Antigravity Search returned too many grounding sources', 'ANTIGRAVITY_SEARCH_PROTOCOL_DRIFT')
    for (const chunk of chunks) {
      if (!isRecord(chunk)) continue
      const web = isRecord(chunk.web) ? chunk.web : isRecord(chunk.webSource) ? chunk.webSource : undefined
      if (web === undefined || typeof web.uri !== 'string' || !isHttpUrl(web.uri)) continue
      const url = web.uri
      if (seen.has(url)) continue
      if (sources.length >= maxResults) {
        truncated = true
        break
      }
      seen.add(url)
      const title = safeSourceText(web.title, 1024)
      const snippet = safeSourceText(web.snippet, 4096)
      sources.push({ url, ...(title === undefined ? {} : { title }), ...(snippet === undefined ? {} : { snippet }) })
    }
  }
  return truncated
}

function appendBounded(output: string[], value: string | undefined): void {
  if (value === undefined || value.length === 0) return
  const used = output.reduce((total, item) => total + item.length, 0)
  if (used < 64 * 1024) output.push(value.slice(0, 64 * 1024 - used))
}

function findText(value: Record<string, unknown>): string | undefined {
  const parts = Array.isArray(value.parts) ? value.parts : isRecord(value.content) && Array.isArray(value.content.parts) ? value.content.parts : []
  const output: string[] = []
  let length = 0
  for (const part of parts) {
    // A reasoning part is not the grounded answer; the default search model is a
    // thinking model, so its thoughts must never become the answer text.
    if (!isRecord(part) || isReasoningPart(part) || typeof part.text !== 'string' || hasControl(part.text)) continue
    const text = part.text.slice(0, 64 * 1024 - length)
    output.push(text)
    length += text.length
    if (length >= 64 * 1024) break
  }
  return output.length === 0 ? undefined : output.join('')
}

function safeSourceText(value: unknown, max: number): string | undefined {
  return typeof value === 'string' && value.length > 0 && value.length <= max && !hasControl(value) ? value : undefined
}

/** Whether one response part carries reasoning rather than the grounded answer. */
function isReasoningPart(part: Record<string, unknown>): boolean {
  return part.thought === true || part.thinking === true || part.reasoning === true
}

function hasControl(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0)
    if (code < 32 || code === 127) return true
  }
  return false
}

function parseJson(value: string): unknown {
  const normalized = value.trim().replace(/^\)\]\}'(?:\r?\n)?/u, '')
  try { return JSON.parse(normalized) as unknown } catch { throw new WebError('Antigravity Search returned malformed provider data', 'ANTIGRAVITY_SEARCH_PROTOCOL_DRIFT') }
}

const SEARCH_FAILURE_CODES: Readonly<Record<PrivateFailureKind, string>> = {
  authentication: 'ANTIGRAVITY_SEARCH_AUTH_REQUIRED',
  forbidden: 'ANTIGRAVITY_SEARCH_FORBIDDEN',
  'rate-limited': 'ANTIGRAVITY_SEARCH_RATE_LIMITED',
  cancelled: 'ANTIGRAVITY_SEARCH_CANCELLED',
  timeout: 'ANTIGRAVITY_SEARCH_TIMEOUT',
  'attribution-rejected': 'ANTIGRAVITY_SEARCH_PROTOCOL_DRIFT',
  'protocol-drift': 'ANTIGRAVITY_SEARCH_PROTOCOL_DRIFT',
  'response-limit': 'ANTIGRAVITY_SEARCH_PROTOCOL_DRIFT',
  'request-limit': 'ANTIGRAVITY_SEARCH_PROTOCOL_DRIFT',
  upstream: 'ANTIGRAVITY_SEARCH_FAILED',
  network: 'ANTIGRAVITY_SEARCH_FAILED',
  failed: 'ANTIGRAVITY_SEARCH_FAILED',
}

function toWebError(error: unknown): WebError {
  if (error instanceof WebError) return error
  if (error instanceof PrivateTransportError) {
    return new WebError('The Antigravity Search request failed safely', SEARCH_FAILURE_CODES[classifyPrivateFailure(error)])
  }
  return new WebError('The Antigravity Search request failed safely', 'ANTIGRAVITY_SEARCH_FAILED')
}

function isAuthService(value: unknown): value is AntigravityAuthService {
  return isRecord(value) && typeof value.credential === 'function' && typeof value.status === 'function'
}

function isHttpUrl(value: string): boolean {
  if (value.length === 0 || value.length > 8192 || value.trim() !== value || hasControl(value)) return false
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.username.length === 0 && url.password.length === 0
  } catch { return false }
}

function boundedInteger(value: number, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new WebError('Antigravity Search result limit is invalid', 'ANTIGRAVITY_SEARCH_INVALID_QUERY')
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
