/** Host-only PKCE, loopback callback, and token-exchange coordinator. */

import { createHash, randomBytes as nodeRandomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  ANTIGRAVITY_CLIENT_ID,
  ANTIGRAVITY_CLIENT_SECRET,
  ANTIGRAVITY_REDIRECT_URI,
  ANTIGRAVITY_SCOPES,
} from '@cortexkit/antigravity-auth-core'
import { ProjectDiscoveryError, normalizeProjectId } from './project-context.ts'
import type { ProjectDiscoveryErrorCode } from './project-context.ts'
import type { LoginCompletionResult, LoginErrorCode, LoginPhase, LoginStartResult } from './login-types.ts'
import { isBoundedSafeText } from './safe-text.ts'

export const ANTIGRAVITY_CALLBACK_PORT = 51121 as const
export const ANTIGRAVITY_CALLBACK_PATH = '/oauth-callback' as const
export const ANTIGRAVITY_CALLBACK_HOSTS = Object.freeze([
  `localhost:${String(ANTIGRAVITY_CALLBACK_PORT)}`,
  `127.0.0.1:${String(ANTIGRAVITY_CALLBACK_PORT)}`,
  `[::1]:${String(ANTIGRAVITY_CALLBACK_PORT)}`,
  'localhost',
  '127.0.0.1',
  '[::1]',
])
export const OAUTH_FLOW_TTL_MS = 5 * 60 * 1000

const AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const MAX_CALLBACK_VALUE_LENGTH = 4096
const MAX_TOKEN_RESPONSE_BYTES = 64 * 1024
const EMPTY_RESPONSE_HEADERS = Object.freeze({
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  'Content-Type': 'text/html; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
})

export type OAuthErrorCode = LoginErrorCode

export class OAuthFlowError extends Error {
  readonly code: OAuthErrorCode

  constructor(code: OAuthErrorCode, message: string) {
    super(message)
    this.name = 'OAuthFlowError'
    this.code = code
  }
}

export interface OAuthToken {
  readonly accessToken: string
  readonly refreshToken: string
  readonly expiresAt: number
  readonly email?: string
}

export interface ProjectValidation {
  readonly projectId: string
  readonly email?: string
}

export interface ExchangeCodeInput {
  readonly code: string
  readonly verifier: string
  readonly signal: AbortSignal
}

export type ExchangeCode = (input: ExchangeCodeInput) => Promise<OAuthToken>
export type ValidateProject = (accessToken: string, signal: AbortSignal) => Promise<ProjectValidation | undefined>
export type CommitCredential = (token: OAuthToken, project: ProjectValidation, signal: AbortSignal) => Promise<void>

export interface LoopbackCallbackRequest {
  readonly method: string
  readonly host?: string | undefined
  /** A relative callback path/query for the loopback listener, or a full URL for tests. */
  readonly url: string
}

export interface LoopbackCallbackResponse {
  readonly status: number
  readonly headers: Readonly<Record<string, string>>
  readonly body: string
}

export type LoopbackCallbackHandler = (request: LoopbackCallbackRequest) => Promise<LoopbackCallbackResponse>

export interface LoopbackListener {
  close(): Promise<void> | void
}

export interface LoopbackListenerFactory {
  listen(handler: LoopbackCallbackHandler): Promise<LoopbackListener>
}

export interface OAuthClock {
  now(): number
  setTimeout(handler: () => void, delayMs: number): ReturnType<typeof setTimeout>
  clearTimeout(handle: ReturnType<typeof setTimeout>): void
}

export interface OAuthFlowOptions {
  readonly randomBytes?: (size: number) => Uint8Array
  readonly clock?: OAuthClock
  readonly ttlMs?: number
  readonly listenerFactory?: LoopbackListenerFactory
  readonly exchangeCode?: ExchangeCode
  readonly validateProject?: ValidateProject
  readonly commit?: CommitCredential
  readonly fetchImpl?: typeof fetch
}

export interface OAuthFlowStatus {
  readonly phase: LoginPhase
  readonly authorizationUrl?: string
  readonly expiresAt?: string
  readonly errorCode?: OAuthErrorCode
}

export type OAuthFlowCompletionResult = LoginCompletionResult

export interface OAuthFlow {
  /** Current one-shot flow generation used to fence late commits. */
  generation(): number
  start(): Promise<LoginStartResult>
  status(): OAuthFlowStatus
  completeCallbackUrl(callbackUrl: string): Promise<OAuthFlowCompletionResult>
  cancel(): Promise<OAuthFlowStatus>
  dispose(): Promise<void>
}

interface PendingFlow {
  readonly authorizationUrl: string
  readonly expiresAt: number
  readonly state: string
  readonly verifier: string
  readonly controller: AbortController
  readonly generation: number
  readonly timeout: ReturnType<typeof setTimeout>
  active: boolean
  commitStarted: boolean
  listener?: LoopbackListener | undefined
}

/** Create one process-local, one-shot OAuth flow. */
export function createOAuthFlow(options: OAuthFlowOptions = {}): OAuthFlow {
  const clock = options.clock ?? systemClock()
  const random = options.randomBytes ?? ((size: number) => nodeRandomBytes(size))
  const listenerFactory = options.listenerFactory ?? createNodeLoopbackListenerFactory()
  const exchangeCode = options.exchangeCode ?? createGoogleTokenExchanger(options.fetchImpl ?? fetch, clock)
  const validateProject = options.validateProject ?? (async () => undefined)
  const commit = options.commit ?? (async () => {})
  const ttlMs = options.ttlMs ?? OAUTH_FLOW_TTL_MS

  let pending: PendingFlow | undefined
  let processing: PendingFlow | undefined
  let generation = 0
  let committingGeneration: number | undefined
  let currentStatus: OAuthFlowStatus = { phase: 'idle' }
  let disposed = false
  let listenerClosing: Promise<void> = Promise.resolve()

  const closeListener = (candidate: PendingFlow): Promise<void> => {
    const listener = candidate.listener
    candidate.listener = undefined
    if (listener === undefined) return listenerClosing
    listenerClosing = listenerClosing.then(
      () => Promise.resolve(listener.close()).catch(() => {}),
      () => Promise.resolve(listener.close()).catch(() => {}),
    )
    return listenerClosing
  }

  const flow: OAuthFlow = {
    generation: () => committingGeneration ?? generation,
    start: async () => {
      if (disposed) throw new OAuthFlowError('internal', 'The OAuth flow is unavailable')
      if (pending !== undefined) await cancelPending(pending, 'cancelled')
      if (processing !== undefined) {
        if (!processing.commitStarted) {
          processing.controller.abort(new OAuthFlowError('cancelled', 'The OAuth login was cancelled'))
        }
        processing = undefined
      }

      const verifier = encodeBase64Url(randomBytes(random, 32))
      const state = encodeBase64Url(randomBytes(random, 32))
      const authorizationUrl = buildAuthorizationUrl(state, verifier)
      const expiresAt = clock.now() + ttlMs
      const controller = new AbortController()
      const candidateGeneration = generation + 1
      generation = candidateGeneration
      const candidate: PendingFlow = {
        authorizationUrl,
        expiresAt,
        state,
        verifier,
        controller,
        generation: candidateGeneration,
        timeout: clock.setTimeout(() => {
          void expire(candidate)
        }, ttlMs),
        active: true,
        commitStarted: false,
      }
      pending = candidate
      currentStatus = {
        phase: 'pending',
        authorizationUrl,
        expiresAt: new Date(expiresAt).toISOString(),
      }

      try {
        await listenerClosing
        if (!candidate.active || pending !== candidate) {
          throw new OAuthFlowError('cancelled', 'The OAuth login was cancelled')
        }
        candidate.listener = await listenerFactory.listen(request => handleLoopbackRequest(request))
        if (!candidate.active || pending !== candidate) {
          await closeListener(candidate)
          throw new OAuthFlowError('cancelled', 'The OAuth login was cancelled')
        }
      } catch (error) {
        clock.clearTimeout(candidate.timeout)
        if (pending === candidate) pending = undefined
        candidate.active = false
        const safe = asListenerError(error)
        updateStatus(candidate, {
          phase: safe.code === 'port-conflict' ? 'port-conflict' : 'failed',
          errorCode: safe.code,
        })
        throw safe
      }

      return { started: true, phase: 'pending', authorizationUrl, expiresAt: new Date(expiresAt).toISOString() }
    },

    status: () => currentStatus,

    completeCallbackUrl: async (callbackUrl: string) => {
      if (typeof callbackUrl !== 'string' || callbackUrl.length === 0 || callbackUrl.length > MAX_CALLBACK_VALUE_LENGTH) {
        throw new OAuthFlowError('invalid-callback-url', 'The callback URL is invalid')
      }
      let parsed: URL
      try {
        parsed = new URL(callbackUrl)
      } catch {
        throw new OAuthFlowError('invalid-callback-url', 'The callback URL is invalid')
      }
      if (parsed.protocol !== 'http:' || parsed.username.length > 0 || parsed.password.length > 0 || parsed.hash.length > 0) {
        throw new OAuthFlowError('invalid-callback-url', 'The callback URL is invalid')
      }
      return completeCallback({
        method: 'GET',
        host: parsed.host,
        url: `${parsed.pathname}${parsed.search}`,
      })
    },

    cancel: async () => {
      if (pending !== undefined) await cancelPending(pending, 'cancelled')
      if (processing !== undefined) {
        const active = processing
        if (active.commitStarted) return currentStatus
        active.controller.abort(new OAuthFlowError('cancelled', 'The OAuth login was cancelled'))
        updateStatus(active, { phase: 'cancelled', errorCode: 'cancelled' })
        return currentStatus
      }
      return currentStatus
    },

    dispose: async () => {
      if (disposed) return
      disposed = true
      if (pending !== undefined) await cancelPending(pending, 'cancelled')
      if (processing !== undefined) {
        if (!processing.commitStarted) processing.controller.abort(new OAuthFlowError('cancelled', 'The OAuth login was cancelled'))
        processing = undefined
      }
      await listenerClosing
    },
  }

  async function completeCallback(request: LoopbackCallbackRequest): Promise<OAuthFlowCompletionResult> {
    if (disposed) throw new OAuthFlowError('internal', 'The OAuth flow is unavailable')
    const candidate = pending
    if (candidate === undefined || !candidate.active) throw noPendingError(currentStatus)
    assertCallbackRequest(request)
    const callback = parseCallback(request.url)
    if (callback.state !== candidate.state) {
      throw new OAuthFlowError('state-mismatch', 'The OAuth callback state was not accepted')
    }

    candidate.active = false
    pending = undefined
    processing = candidate
    clock.clearTimeout(candidate.timeout)
    void closeListener(candidate)

    if (callback.error !== undefined) {
      processing = undefined
      candidate.controller.abort(new OAuthFlowError('oauth-error', 'The OAuth provider rejected authorization'))
      updateStatus(candidate, { phase: 'failed', errorCode: 'oauth-error' })
      return { completed: false, phase: 'failed', errorCode: 'oauth-error' }
    }
    if (callback.code === undefined) {
      processing = undefined
      updateStatus(candidate, { phase: 'failed', errorCode: 'missing-code' })
      return { completed: false, phase: 'failed', errorCode: 'missing-code' }
    }

    const operation = combineSignals(candidate.controller.signal)
    try {
      const token = await exchangeCode({ code: callback.code, verifier: candidate.verifier, signal: operation.signal })
      if (operation.signal.aborted) throw new OAuthFlowError('cancelled', 'The OAuth login was cancelled')
      assertToken(token)

      let project: ProjectValidation | undefined
      try {
        project = await validateProject(token.accessToken, operation.signal)
      } catch (error) {
        if (operation.signal.aborted) throw new OAuthFlowError('cancelled', 'The OAuth login was cancelled')
        if (error instanceof ProjectDiscoveryError) {
          if (error.code === 'cancelled') throw new OAuthFlowError('cancelled', 'The OAuth login was cancelled')
          throw new OAuthFlowError(projectErrorCode(error.code), projectErrorMessage(error.code))
        }
        throw error instanceof OAuthFlowError ? error : new OAuthFlowError('project-validation-failed', 'Project validation failed')
      }
      if (operation.signal.aborted) throw new OAuthFlowError('cancelled', 'The OAuth login was cancelled')
      if (project === undefined) throw new OAuthFlowError('project-unavailable', 'No usable project is available for this account')
      project = normalizeProject(project)

      try {
        if (operation.signal.aborted) throw new OAuthFlowError('cancelled', 'The OAuth login was cancelled')
        candidate.commitStarted = true
        committingGeneration = candidate.generation
        try {
          await commit(token, project, operation.signal)
        } finally {
          committingGeneration = undefined
        }
      } catch (error) {
        if (operation.signal.aborted) throw new OAuthFlowError('cancelled', 'The OAuth login was cancelled')
        throw error instanceof OAuthFlowError ? error : new OAuthFlowError('persistence-failed', 'The login could not be saved')
      }
      updateStatus(candidate, { phase: 'success' })
      return { completed: true, phase: 'success' }
    } catch (error) {
      const safe = classifyCompletionError(error, candidate.controller.signal)
      if (safe.code === 'cancelled') {
        updateStatus(candidate, { phase: 'cancelled', errorCode: 'cancelled' })
        return { completed: false, phase: 'cancelled', errorCode: 'cancelled' }
      }
      updateStatus(candidate, { phase: 'failed', errorCode: safe.code })
      return { completed: false, phase: 'failed', errorCode: safe.code }
    } finally {
      operation.cleanup()
      if (processing === candidate) processing = undefined
    }
  }

  async function handleLoopbackRequest(request: LoopbackCallbackRequest): Promise<LoopbackCallbackResponse> {
    try {
      const result = await completeCallback(request)
      if (result.completed) return callbackResponse(200, 'success')
      return callbackResponse(result.phase === 'cancelled' ? 409 : 400, result.errorCode)
    } catch (error) {
      const safe = error instanceof OAuthFlowError ? error : new OAuthFlowError('internal', 'The callback could not be processed')
      return callbackResponse(callbackStatus(safe.code), safe.code)
    }
  }

  async function expire(candidate: PendingFlow): Promise<void> {
    if (pending !== candidate || !candidate.active) return
    await cancelPending(candidate, 'expired')
  }

  async function cancelPending(candidate: PendingFlow, phase: 'cancelled' | 'expired'): Promise<void> {
    if (!candidate.active && pending !== candidate) return
    candidate.active = false
    if (pending === candidate) pending = undefined
    clock.clearTimeout(candidate.timeout)
    candidate.controller.abort(new OAuthFlowError(phase, phase === 'expired' ? 'The OAuth login expired' : 'The OAuth login was cancelled'))
    await closeListener(candidate)
    updateStatus(candidate, {
      phase,
      errorCode: phase,
    })
  }

  function updateStatus(candidate: PendingFlow, status: OAuthFlowStatus): void {
    if (candidate.generation === generation) currentStatus = status
  }

  return flow
}

/** Create the production loopback listener; it never binds a non-loopback address. */
export function createNodeLoopbackListenerFactory(): LoopbackListenerFactory {
  return {
    listen: handler => new Promise<LoopbackListener>((resolve, reject) => {
      const server = createServer((request, response) => {
        void serveRequest(handler, request, response)
      })
      let settled = false
      const onError = (error: unknown): void => {
        if (!settled) {
          settled = true
          reject(error)
        }
      }
      server.once('error', onError)
      server.listen(ANTIGRAVITY_CALLBACK_PORT, '0.0.0.0', () => {
        settled = true
        server.removeListener('error', onError)
        resolve({
          close: () => new Promise<void>((resolveClose, rejectClose) => {
            if (!server.listening) {
              resolveClose()
              return
            }
            server.close(error => error === undefined ? resolveClose() : rejectClose(error))
          }),
        })
      })
    }),
  }
}

/** Build the authorization URL without ever putting the verifier in browser state. */
export function buildAuthorizationUrl(state: string, verifier: string): string {
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const url = new URL(AUTHORIZATION_ENDPOINT)
  url.searchParams.set('client_id', ANTIGRAVITY_CLIENT_ID)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', ANTIGRAVITY_REDIRECT_URI)
  url.searchParams.set('scope', ANTIGRAVITY_SCOPES.join(' '))
  url.searchParams.set('code_challenge', challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('state', state)
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')
  return url.toString()
}

/** Testable Google token exchange; response bodies are parsed only in Host memory. */
export function createGoogleTokenExchanger(fetchImpl: typeof fetch, clock: OAuthClock = systemClock()): ExchangeCode {
  return async ({ code, verifier, signal }) => {
    const response = await fetchImpl(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: '*/*',
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body: new URLSearchParams({
        client_id: ANTIGRAVITY_CLIENT_ID,
        client_secret: ANTIGRAVITY_CLIENT_SECRET,
        code,
        code_verifier: verifier,
        grant_type: 'authorization_code',
        redirect_uri: ANTIGRAVITY_REDIRECT_URI,
      }),
      signal,
    })
    if (!response.ok) {
      try { await response.body?.cancel() } catch { /* best effort */ }
      throw new OAuthFlowError('token-exchange-failed', 'The authorization code could not be exchanged')
    }
    const payload = await readJsonBounded(response, signal)
    if (!isRecord(payload)
      || typeof payload.access_token !== 'string'
      || payload.access_token.length === 0
      || typeof payload.refresh_token !== 'string'
      || payload.refresh_token.length === 0) {
      throw new OAuthFlowError('token-exchange-failed', 'The token response was not accepted')
    }
    const expiresIn = typeof payload.expires_in === 'number' && Number.isFinite(payload.expires_in) && payload.expires_in > 0
      ? payload.expires_in
      : 3_600
    return {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
      expiresAt: clock.now() + expiresIn * 1000,
      ...typeof payload.email === 'string' ? { email: payload.email } : {},
    }
  }
}

function assertCallbackRequest(request: LoopbackCallbackRequest): void {
  if (request.method !== 'GET') throw new OAuthFlowError('invalid-method', 'The OAuth callback method is not accepted')
  if (typeof request.host !== 'string' || !isAllowedCallbackHost(request.host)) {
    throw new OAuthFlowError('invalid-host', 'The OAuth callback host is not accepted')
  }
  let parsed: URL
  try {
    parsed = new URL(request.url, `http://${request.host}`)
  } catch {
    throw new OAuthFlowError('invalid-path', 'The OAuth callback URL is not accepted')
  }
  if (parsed.protocol !== 'http:'
    || !isAllowedCallbackHost(parsed.host)
    || parsed.username.length > 0
    || parsed.password.length > 0
    || parsed.pathname !== ANTIGRAVITY_CALLBACK_PATH
    || parsed.hash.length > 0) {
    throw new OAuthFlowError('invalid-path', 'The OAuth callback path is not accepted')
  }
}

function parseCallback(value: string): { state: string; code?: string; error?: string } {
  let parsed: URL
  try {
    parsed = new URL(value, `http://${ANTIGRAVITY_CALLBACK_HOSTS[0]}`)
  } catch {
    throw new OAuthFlowError('invalid-path', 'The OAuth callback URL is not accepted')
  }
  const seen = new Set<string>()
  for (const [key, paramValue] of parsed.searchParams) {
    if (seen.has(key)) throw new OAuthFlowError('duplicate-parameter', 'The OAuth callback contains duplicate parameters')
    if (!safeCallbackValue(key) || !safeCallbackValue(paramValue)) {
      throw new OAuthFlowError('invalid-parameters', 'The OAuth callback parameters are not accepted')
    }
    seen.add(key)
  }
  const state = parsed.searchParams.get('state')
  if (state === null || !safeCallbackValue(state)) throw new OAuthFlowError('missing-state', 'The OAuth callback state is missing')
  const code = parsed.searchParams.get('code')
  const error = parsed.searchParams.get('error')
  if (error !== null) {
    if (code !== null || !safeCallbackValue(error)) throw new OAuthFlowError('invalid-parameters', 'The OAuth callback parameters are not accepted')
    return { state, error }
  }
  if (parsed.searchParams.has('error_description') || parsed.searchParams.has('error_uri')) {
    throw new OAuthFlowError('invalid-parameters', 'The OAuth callback parameters are not accepted')
  }
  if (code === null || !safeCallbackValue(code)) throw new OAuthFlowError('missing-code', 'The OAuth callback code is missing')
  return { state, code }
}

function isAllowedCallbackHost(value: string): boolean {
  if (typeof value !== 'string' || value.length === 0 || value.length > 256) return false
  const normalized = value.toLowerCase()
  if (ANTIGRAVITY_CALLBACK_HOSTS.includes(normalized as (typeof ANTIGRAVITY_CALLBACK_HOSTS)[number])) {
    return true
  }
  if (normalized.endsWith(`:${String(ANTIGRAVITY_CALLBACK_PORT)}`)) {
    return true
  }
  return false
}

function safeCallbackValue(value: string): boolean {
  return isBoundedSafeText(value, MAX_CALLBACK_VALUE_LENGTH)
}

function randomBytes(random: (size: number) => Uint8Array, size: number): Uint8Array {
  const bytes = random(size)
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== size) {
    throw new OAuthFlowError('internal', 'The OAuth random source is unavailable')
  }
  return bytes
}

function encodeBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url')
}

function systemClock(): OAuthClock {
  return {
    now: () => Date.now(),
    setTimeout: (handler, delayMs) => setTimeout(handler, delayMs),
    clearTimeout: handle => clearTimeout(handle),
  }
}

function noPendingError(status: OAuthFlowStatus): OAuthFlowError {
  if (status.phase === 'expired') return new OAuthFlowError('expired', 'The OAuth login expired')
  if (status.phase === 'cancelled') return new OAuthFlowError('cancelled', 'The OAuth login was cancelled')
  return new OAuthFlowError('no-pending-flow', 'There is no pending OAuth login')
}

function asListenerError(error: unknown): OAuthFlowError {
  if (error instanceof OAuthFlowError) return error
  if (isRecord(error) && error.code === 'EADDRINUSE') {
    return new OAuthFlowError('port-conflict', 'The fixed OAuth callback port is already in use')
  }
  return new OAuthFlowError('internal', 'The OAuth callback listener could not start')
}

function classifyCompletionError(error: unknown, signal: AbortSignal): OAuthFlowError {
  if (signal.aborted || (error instanceof OAuthFlowError && error.code === 'cancelled')) {
    return new OAuthFlowError('cancelled', 'The OAuth login was cancelled')
  }
  if (error instanceof OAuthFlowError) return error
  return new OAuthFlowError('token-exchange-failed', 'The OAuth login could not be completed')
}

function assertToken(value: OAuthToken): asserts value is OAuthToken {
  if (!isRecord(value)
    || typeof value.accessToken !== 'string'
    || value.accessToken.length === 0
    || typeof value.refreshToken !== 'string'
    || value.refreshToken.length === 0
    || typeof value.expiresAt !== 'number'
    || !Number.isFinite(value.expiresAt)) {
    throw new OAuthFlowError('token-exchange-failed', 'The token response was not accepted')
  }
}

function normalizeProject(value: ProjectValidation): ProjectValidation {
  if (!isRecord(value)) throw new OAuthFlowError('project-validation-failed', 'Project validation failed')
  const projectId = normalizeProjectId(value.projectId)
  if (projectId === undefined) throw new OAuthFlowError('project-validation-failed', 'Project validation failed')
  return { projectId, ...(typeof value.email === 'string' ? { email: value.email } : {}) }
}

function projectErrorCode(code: ProjectDiscoveryErrorCode): Extract<LoginErrorCode,
  | 'project-authentication-failed'
  | 'project-forbidden'
  | 'project-rate-limited'
  | 'project-offline'
  | 'project-malformed'
  | 'project-protocol-drift'
> {
  if (code === 'authentication') return 'project-authentication-failed'
  if (code === 'forbidden') return 'project-forbidden'
  if (code === 'rate-limited') return 'project-rate-limited'
  if (code === 'offline') return 'project-offline'
  if (code === 'malformed') return 'project-malformed'
  return 'project-protocol-drift'
}

function projectErrorMessage(code: ProjectDiscoveryErrorCode): string {
  if (code === 'authentication') return 'The Antigravity project probe requires authentication'
  if (code === 'forbidden') return 'The Antigravity project probe was forbidden'
  if (code === 'rate-limited') return 'The Antigravity project probe is rate-limited'
  if (code === 'offline') return 'The Antigravity project probe is offline'
  if (code === 'malformed') return 'The Antigravity project response was malformed'
  if (code === 'protocol-drift') return 'The Antigravity project protocol changed'
  return 'The Antigravity project probe was cancelled'
}

function callbackResponse(status: number, outcome: string): LoopbackCallbackResponse {
  const body = outcome === 'success'
    ? '<!doctype html><meta charset="utf-8"><title>Authorization complete</title><p>Authorization complete. You may return to DeepSeek Harness.</p>'
    : '<!doctype html><meta charset="utf-8"><title>Authorization could not be completed</title><p>Authorization could not be completed. Return to DeepSeek Harness for details.</p>'
  return { status, headers: EMPTY_RESPONSE_HEADERS, body }
}

function callbackStatus(code: OAuthErrorCode): number {
  if (code === 'port-conflict') return 409
  if (code === 'internal') return 500
  return 400
}

async function serveRequest(
  handler: LoopbackCallbackHandler,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const host = typeof request.headers.host === 'string' ? request.headers.host : undefined
  const result = await handler({
    method: request.method ?? '',
    ...(host === undefined ? {} : { host }),
    url: request.url ?? '',
  })
  response.writeHead(result.status, result.headers)
  response.end(result.body)
}

async function readJsonBounded(response: Response, signal: AbortSignal): Promise<unknown> {
  if (response.body === null) {
    const text = await response.text()
    if (new TextEncoder().encode(text).byteLength > MAX_TOKEN_RESPONSE_BYTES) {
      throw new OAuthFlowError('token-exchange-failed', 'The token response was not accepted')
    }
    try {
      return JSON.parse(text) as unknown
    } catch {
      throw new OAuthFlowError('token-exchange-failed', 'The token response was not accepted')
    }
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      if (signal.aborted) throw new OAuthFlowError('cancelled', 'The OAuth login was cancelled')
      const next = await reader.read()
      if (next.done) break
      total += next.value.byteLength
      if (total > MAX_TOKEN_RESPONSE_BYTES) throw new OAuthFlowError('token-exchange-failed', 'The token response was not accepted')
      chunks.push(next.value)
    }
  } finally {
    try { reader.releaseLock() } catch { /* best effort */ }
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return JSON.parse(Buffer.from(bytes).toString('utf8')) as unknown
  } catch {
    throw new OAuthFlowError('token-exchange-failed', 'The token response was not accepted')
  }
}

function combineSignals(primary: AbortSignal): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController()
  const onAbort = (): void => { if (!controller.signal.aborted) controller.abort(primary.reason) }
  if (primary.aborted) controller.abort(primary.reason)
  else primary.addEventListener('abort', onAbort, { once: true })
  return {
    signal: controller.signal,
    cleanup: () => primary.removeEventListener('abort', onAbort),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
