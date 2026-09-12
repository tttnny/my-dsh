/** Host-only access-token cache, refresh single-flight, logout, and grant revocation. */

import type { AntigravityAuthRecord, AntigravityAuthStore } from './auth-store.ts'
import { ANTIGRAVITY_CLIENT_ID, ANTIGRAVITY_CLIENT_SECRET } from '@cortexkit/antigravity-auth-core'
import { isBoundedSafeText } from './safe-text.ts'

export const ANTIGRAVITY_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token' as const
export const ANTIGRAVITY_REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke' as const

const DEFAULT_REFRESH_LEAD_MS = 30_000
const DEFAULT_OPERATION_TIMEOUT_MS = 10_000
const MAX_REFRESH_ATTEMPTS = 2
const MAX_RESPONSE_BYTES = 64 * 1024
const MAX_EXPIRES_IN_SECONDS = 31_536_000

export type CredentialState =
  | 'logged-out'
  | 'logged-in'
  | 'refreshing'
  | 'refresh-failed'
  | 're-login-required'

export type CredentialErrorCode =
  | 'invalid-grant'
  | 'network'
  | 'timeout'
  | 'rate-limited'
  | 'server-error'
  | 'http-error'
  | 'invalid-response'
  | 'conflict'
  | 'storage'
  | 'cancelled'

export interface HostCredential {
  readonly accessToken: string
  readonly refreshToken: string
  readonly expiresAt: number
  readonly projectId: string
}

export interface RefreshAccessTokenResult {
  readonly accessToken: string
  readonly refreshToken?: string
  readonly expiresAt: number
}

export interface RefreshAccessTokenInput {
  readonly refreshToken: string
  readonly signal: AbortSignal
}

export type RefreshAccessToken = (
  input: RefreshAccessTokenInput,
) => Promise<RefreshAccessTokenResult>

export interface RevokeGrantInput {
  readonly token: string
  readonly signal: AbortSignal
}

export type RevokeGrant = (input: RevokeGrantInput) => Promise<void>

export interface CredentialStatusView {
  readonly state: CredentialState
  readonly configured: boolean
  readonly expiresAt?: string
  readonly lastRefreshAt?: string
  readonly errorCode?: CredentialErrorCode
}

export type RevokeState =
  | 'idle'
  | 'pending'
  | 'confirmation-required'
  | 'revoked'
  | 'logged-out'
  | 'failed'
  | 'superseded'

export type RevokeErrorCode = Exclude<CredentialErrorCode, 'invalid-grant' | 'conflict' | 'cancelled'>

export interface RevokeStatusView {
  readonly state: RevokeState
  readonly errorCode?: RevokeErrorCode
}

export type RevokeActionResult =
  | { readonly state: 'confirmation-required' }
  | { readonly state: 'revoked' }
  | { readonly state: 'logged-out' }
  | { readonly state: 'failed'; readonly errorCode: RevokeErrorCode }
  | { readonly state: 'superseded' }

export interface LogoutResult {
  readonly state: 'logged-out'
}

export interface CredentialCoordinatorOptions {
  readonly store: AntigravityAuthStore
  readonly now?: () => number
  readonly refreshLeadMs?: number
  readonly operationTimeoutMs?: number
  readonly refreshToken?: RefreshAccessToken
  readonly revokeGrant?: RevokeGrant
  readonly fetchImpl?: typeof fetch
}

export interface CredentialCoordinator {
  credential(signal?: AbortSignal, options?: { readonly forceRefresh?: boolean }): Promise<HostCredential | undefined>
  replaceFromLogin(credential: HostCredential, record: AntigravityAuthRecord): void
  status(): Promise<CredentialStatusView>
  revokeStatus(): RevokeStatusView
  logout(): Promise<LogoutResult>
  revoke(confirmed: boolean, signal?: AbortSignal): Promise<RevokeActionResult>
  dispose(): Promise<void>
}

export class CredentialOperationError extends Error {
  readonly code: CredentialErrorCode

  constructor(code: CredentialErrorCode, message = credentialErrorMessage(code) ?? 'The Antigravity credential operation failed') {
    super(message)
    this.name = 'CredentialOperationError'
    this.code = code
  }
}

interface CachedCredential {
  readonly value: HostCredential
  readonly revision: number
  readonly lineage?: string
}

export function createCredentialCoordinator(options: CredentialCoordinatorOptions): CredentialCoordinator {
  const now = options.now ?? (() => Date.now())
  const refreshAccessToken = options.refreshToken ?? createGoogleRefreshTransport(options.fetchImpl, now)
  const revokeGrant = options.revokeGrant ?? createGoogleRevokeTransport(options.fetchImpl)
  const refreshLeadMs = Math.max(0, options.refreshLeadMs ?? DEFAULT_REFRESH_LEAD_MS)
  const operationTimeoutMs = Math.max(1, options.operationTimeoutMs ?? DEFAULT_OPERATION_TIMEOUT_MS)

  let cached: CachedCredential | undefined
  let observedRevision = 0
  let observedLineage: string | undefined
  let state: CredentialState = 'logged-out'
  let errorCode: CredentialErrorCode | undefined
  let lastRefreshAt: number | undefined
  let refreshFlight: Promise<HostCredential | undefined> | undefined
  let revokeFlight: Promise<RevokeActionResult> | undefined
  let revokeStatus: RevokeStatusView = { state: 'idle' }
  let generation = 0
  let disposed = false
  const lifecycleAbort = new AbortController()
  const operations = new Set<AbortController>()

  const coordinator: CredentialCoordinator = {
    credential: async (signal, credentialOptions) => {
      ensureNotDisposed()
      if (signal?.aborted === true) throw new CredentialOperationError('cancelled')
      const record = await options.store.read()
      if (record === undefined) {
        clearObservedCredential()
        return undefined
      }
      observe(record)
      if (state === 're-login-required') return undefined
      if (credentialOptions?.forceRefresh !== true && cached !== undefined && sameRecord(cached, record) && isFresh(cached.value, now(), refreshLeadMs)) {
        state = 'logged-in'
        errorCode = undefined
        return await waitForCaller(Promise.resolve(cached.value), signal)
      }
      if (refreshFlight === undefined) {
        const flight = refreshCredential(generation)
        refreshFlight = flight
        void flight.then(
          () => clearRefreshFlight(flight),
          () => clearRefreshFlight(flight),
        )
      }
      return await waitForCaller(refreshFlight, signal)
    },

    replaceFromLogin: (credential, record) => {
      if (disposed) return
      generation += 1
      abortOperations()
      cached = { value: { ...credential }, revision: record.revision, ...(record.lineage === undefined ? {} : { lineage: record.lineage }) }
      observedRevision = record.revision
      observedLineage = record.lineage
      state = 'logged-in'
      errorCode = undefined
      lastRefreshAt = undefined
      revokeStatus = { state: 'idle' }
      refreshFlight = undefined
      revokeFlight = undefined
    },

    status: async () => {
      ensureNotDisposed()
      const record = await options.store.read()
      if (record === undefined) {
        clearObservedCredential()
      } else {
        observe(record)
      }
      return makeCredentialStatus(record)
    },

    revokeStatus: () => ({ ...revokeStatus }),

    logout: async () => {
      ensureNotDisposed()
      generation += 1
      const logoutGeneration = generation
      abortOperations()
      refreshFlight = undefined
      revokeFlight = undefined
      cached = undefined
      observedRevision = 0
      observedLineage = undefined
      const record = await options.store.read()
      if (!isActive(logoutGeneration)) return { state: 'logged-out' }
      let cleared = true
      if (record !== undefined) {
        cleared = await options.store.clearIfCurrent(record.revision, record.lineage)
      }
      if (!isActive(logoutGeneration)) return { state: 'logged-out' }
      if (!cleared) {
        const latest = await options.store.read()
        if (!isActive(logoutGeneration)) return { state: 'logged-out' }
        if (latest === undefined) {
          clearObservedCredential()
          revokeStatus = { state: 'logged-out' }
        } else {
          observe(latest)
        }
        return { state: 'logged-out' }
      }
      state = 'logged-out'
      errorCode = undefined
      lastRefreshAt = undefined
      revokeStatus = { state: 'logged-out' }
      return { state: 'logged-out' }
    },

    revoke: async (confirmed, signal) => {
      ensureNotDisposed()
      if (!confirmed) {
        revokeStatus = { state: 'confirmation-required' }
        return { state: 'confirmation-required' }
      }
      if (signal?.aborted === true) throw new CredentialOperationError('cancelled')
      if (revokeFlight !== undefined) return await waitForCaller(revokeFlight, signal)

      generation += 1
      abortOperations()
      refreshFlight = undefined
      const revokeGeneration = generation
      const record = await options.store.read()
      if (!isActive(revokeGeneration)) return { state: 'superseded' }
      if (record === undefined) {
        clearObservedCredential()
        revokeStatus = { state: 'logged-out' }
        return { state: 'logged-out' }
      }
      revokeStatus = { state: 'pending' }
      const flight = revokeCredential(record, revokeGeneration)
      revokeFlight = flight
      void flight.then(
        () => clearRevokeFlight(flight),
        () => clearRevokeFlight(flight),
      )
      return await waitForCaller(flight, signal)
    },

    dispose: async () => {
      if (disposed) return
      disposed = true
      generation += 1
      lifecycleAbort.abort(new CredentialOperationError('cancelled', 'The Antigravity credential service was disposed'))
      abortOperations()
      refreshFlight = undefined
      revokeFlight = undefined
      cached = undefined
      operations.clear()
    },
  }

  function ensureNotDisposed(): void {
    if (disposed) throw new CredentialOperationError('cancelled', 'The Antigravity credential service is unavailable')
  }

  function beginOperation(): AbortController {
    const controller = new AbortController()
    operations.add(controller)
    if (lifecycleAbort.signal.aborted) controller.abort(lifecycleAbort.signal.reason)
    return controller
  }

  function endOperation(controller: AbortController): void {
    operations.delete(controller)
  }

  function abortOperations(): void {
    for (const controller of operations) controller.abort(new CredentialOperationError('cancelled'))
    operations.clear()
  }

  function clearRefreshFlight(flight: Promise<HostCredential | undefined>): void {
    if (refreshFlight === flight) refreshFlight = undefined
  }

  function clearRevokeFlight(flight: Promise<RevokeActionResult>): void {
    if (revokeFlight === flight) revokeFlight = undefined
  }

  function clearObservedCredential(): void {
    cached = undefined
    observedRevision = 0
    observedLineage = undefined
    if (!disposed) {
      state = 'logged-out'
      errorCode = undefined
      lastRefreshAt = undefined
    }
  }

  function observe(record: AntigravityAuthRecord): void {
    const lineageChanged = observedRevision !== 0 && observedLineage !== record.lineage
    const recordChanged = observedRevision !== 0
      && (observedRevision !== record.revision || lineageChanged)
    if (recordChanged) {
      cached = undefined
      state = 'logged-in'
      errorCode = undefined
      lastRefreshAt = undefined
    }
    observedRevision = record.revision
    observedLineage = record.lineage
    if (state === 'logged-out') state = 'logged-in'
  }

  function isFresh(credential: HostCredential, timestamp: number, lead: number): boolean {
    return Number.isFinite(credential.expiresAt) && credential.expiresAt - timestamp > lead
  }

  function sameRecord(value: CachedCredential, record: AntigravityAuthRecord): boolean {
    return value.revision === record.revision && value.lineage === record.lineage
  }

  function makeCredentialStatus(record: AntigravityAuthRecord | undefined): CredentialStatusView {
    const configured = record !== undefined
    const expiresAt = cached === undefined ? undefined : new Date(cached.value.expiresAt).toISOString()
    return {
      state: configured ? state : 'logged-out',
      configured,
      ...(expiresAt === undefined ? {} : { expiresAt }),
      ...(lastRefreshAt === undefined ? {} : { lastRefreshAt: new Date(lastRefreshAt).toISOString() }),
      ...(errorCode === undefined ? {} : { errorCode }),
    }
  }

  async function refreshCredential(startGeneration: number): Promise<HostCredential | undefined> {
    if (disposed || startGeneration !== generation) return undefined
    let record = await options.store.read()
    if (!isActive(startGeneration)) return undefined
    if (record === undefined) {
      clearObservedCredential()
      return undefined
    }
    observe(record)
    if (state === 're-login-required') return undefined

    for (let attempt = 0; attempt < MAX_REFRESH_ATTEMPTS; attempt += 1) {
      if (!isActive(startGeneration)) return undefined
      state = 'refreshing'
      errorCode = undefined
      const operation = beginOperation()
      let result: RefreshAccessTokenResult
      try {
        result = await runBounded(
          signal => refreshAccessToken({ refreshToken: record!.refreshToken, signal }),
          operation,
          operationTimeoutMs,
        )
        validateRefreshResult(result)
      } catch (error) {
        endOperation(operation)
        if (!isActive(startGeneration) || isCancelled(error)) return undefined
        setRefreshFailure(error)
        return undefined
      }
      endOperation(operation)
      if (!isActive(startGeneration)) return undefined

      const current = await options.store.read()
      if (!isActive(startGeneration)) return undefined
      const responseRefreshToken = result.refreshToken ?? record.refreshToken
      if (current === undefined) {
        clearObservedCredential()
        return undefined
      }
      if (sameLineage(current, record) && current.revision !== record.revision) {
        if (current.refreshToken === responseRefreshToken) {
          return adoptRefreshedCredential(result, current, startGeneration)
        }
        record = current
        observe(record)
        continue
      }
      if (!sameLineage(current, record)) {
        record = current
        observe(record)
        continue
      }

      const committed = await options.store.compareAndCommit(
        record.revision,
        {
          refreshToken: responseRefreshToken,
          projectId: record.projectId,
          ...(record.email === undefined ? {} : { email: record.email }),
          ...(record.lineage === undefined ? {} : { lineage: record.lineage }),
        },
        record.lineage,
      )
      if (committed !== undefined) return adoptRefreshedCredential(result, committed, startGeneration)

      const latest = await options.store.read()
      if (!isActive(startGeneration)) return undefined
      if (latest === undefined) {
        clearObservedCredential()
        return undefined
      }
      if (latest.refreshToken === responseRefreshToken && sameLineage(latest, record)) {
        return adoptRefreshedCredential(result, latest, startGeneration)
      }
      record = latest
      observe(record)
    }

    if (isActive(startGeneration)) {
      state = 'refresh-failed'
      errorCode = 'conflict'
    }
    return undefined
  }

  async function adoptRefreshedCredential(
    result: RefreshAccessTokenResult,
    record: AntigravityAuthRecord,
    startGeneration: number,
  ): Promise<HostCredential | undefined> {
    if (!isActive(startGeneration)) return undefined
    const credential: HostCredential = {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken ?? record.refreshToken,
      expiresAt: result.expiresAt,
      projectId: record.projectId,
    }
    cached = { value: credential, revision: record.revision, ...(record.lineage === undefined ? {} : { lineage: record.lineage }) }
    observedRevision = record.revision
    observedLineage = record.lineage
    state = 'logged-in'
    errorCode = undefined
    lastRefreshAt = now()
    return { ...credential }
  }

  async function revokeCredential(record: AntigravityAuthRecord, revokeGeneration: number): Promise<RevokeActionResult> {
    const operation = beginOperation()
    try {
      await runBounded(
        signal => revokeGrant({ token: record.refreshToken, signal }),
        operation,
        operationTimeoutMs,
      )
    } catch (error) {
      endOperation(operation)
      if (!isActive(revokeGeneration) || isCancelled(error)) return { state: 'superseded' }
      const code = toRevokeErrorCode(error)
      revokeStatus = { state: 'failed', errorCode: code }
      return { state: 'failed', errorCode: code }
    }
    endOperation(operation)
    if (!isActive(revokeGeneration)) return { state: 'superseded' }

    let cleared: boolean
    try {
      cleared = await options.store.clearIfCurrent(record.revision, record.lineage)
    } catch {
      if (!isActive(revokeGeneration)) return { state: 'superseded' }
      revokeStatus = { state: 'failed', errorCode: 'storage' }
      return { state: 'failed', errorCode: 'storage' }
    }
    if (!isActive(revokeGeneration)) return { state: 'superseded' }
    if (!cleared) {
      revokeStatus = { state: 'superseded' }
      return { state: 'superseded' }
    }
    cached = undefined
    observedRevision = 0
    observedLineage = undefined
    state = 'logged-out'
    errorCode = undefined
    lastRefreshAt = undefined
    revokeStatus = { state: 'revoked' }
    return { state: 'revoked' }
  }


  function isActive(expectedGeneration: number): boolean {
    return !disposed && expectedGeneration === generation
  }

  function setRefreshFailure(error: unknown): void {
    const code = error instanceof CredentialOperationError ? error.code : 'network'
    state = code === 'invalid-grant' ? 're-login-required' : 'refresh-failed'
    errorCode = code
    cached = undefined
  }

  function sameLineage(left: AntigravityAuthRecord, right: AntigravityAuthRecord): boolean {
    if (left.lineage !== undefined || right.lineage !== undefined) return left.lineage === right.lineage
    return left.revision === right.revision
  }

  function toRevokeErrorCode(error: unknown): RevokeErrorCode {
    const code = error instanceof CredentialOperationError ? error.code : 'network'
    if (code === 'invalid-grant' || code === 'conflict' || code === 'cancelled') return 'http-error'
    return code
  }

  return coordinator
}

export function createGoogleRefreshTransport(
  fetchImpl: typeof fetch = globalThis.fetch,
  now: () => number = () => Date.now(),
): RefreshAccessToken {
  return async ({ refreshToken, signal }) => {
    let response: Response
    try {
      response = await fetchImpl(ANTIGRAVITY_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({
          client_id: ANTIGRAVITY_CLIENT_ID,
          client_secret: ANTIGRAVITY_CLIENT_SECRET,
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
        signal,
      })
    } catch (error) {
      if (isAbortError(error)) throw new CredentialOperationError('cancelled')
      throw new CredentialOperationError('network')
    }
    if (!response.ok && (response.status === 429 || response.status >= 500)) {
      throw responseError(response.status)
    }
    const body = await readJsonBody(response)
    if (!response.ok) throw responseError(response.status, body)
    if (!isRecord(body) || typeof body.access_token !== 'string' || !isBoundedSafeText(body.access_token, 4096)) {
      throw new CredentialOperationError('invalid-response')
    }
    const expiresIn = body.expires_in
    if (typeof expiresIn !== 'number' || !Number.isFinite(expiresIn) || expiresIn <= 0 || expiresIn > MAX_EXPIRES_IN_SECONDS) {
      throw new CredentialOperationError('invalid-response')
    }
    const nextRefreshToken = body.refresh_token
    if (nextRefreshToken !== undefined && (typeof nextRefreshToken !== 'string' || !isBoundedSafeText(nextRefreshToken, 4096))) {
      throw new CredentialOperationError('invalid-response')
    }
    return {
      accessToken: body.access_token,
      expiresAt: now() + expiresIn * 1000,
      ...(nextRefreshToken === undefined ? {} : { refreshToken: nextRefreshToken }),
    }
  }
}

export function createGoogleRevokeTransport(fetchImpl: typeof fetch = globalThis.fetch): RevokeGrant {
  return async ({ token, signal }) => {
    let response: Response
    try {
      response = await fetchImpl(ANTIGRAVITY_REVOKE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: '*/*' },
        body: new URLSearchParams({ token }),
        signal,
      })
    } catch (error) {
      if (isAbortError(error)) throw new CredentialOperationError('cancelled')
      throw new CredentialOperationError('network')
    }
    if (!response.ok) throw responseError(response.status)
  }
}

async function runBounded<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  parent: AbortController,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  let removeParentAbort: (() => void) | undefined
  const operationPromise = Promise.resolve().then(() => operation(controller.signal))
  operationPromise.catch(() => {})
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort(new CredentialOperationError('timeout'))
      reject(new CredentialOperationError('timeout'))
    }, timeoutMs)
  })
  const abortPromise = new Promise<never>((_, reject) => {
    const abort = () => {
      controller.abort(parent.signal.reason)
      reject(new CredentialOperationError('cancelled'))
    }
    removeParentAbort = () => parent.signal.removeEventListener('abort', abort)
    if (parent.signal.aborted) abort()
    else parent.signal.addEventListener('abort', abort, { once: true })
  })
  try {
    return await Promise.race([operationPromise, timeoutPromise, abortPromise])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
    removeParentAbort?.()
    controller.abort()
  }
}

async function waitForCaller<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (signal === undefined) return await promise
  if (signal.aborted) throw new CredentialOperationError('cancelled')
  return await new Promise<T>((resolve, reject) => {
    let settled = false
    const abort = () => {
      if (settled) return
      settled = true
      reject(new CredentialOperationError('cancelled'))
    }
    signal.addEventListener('abort', abort, { once: true })
    promise.then(
      value => {
        if (settled) return
        settled = true
        signal.removeEventListener('abort', abort)
        resolve(value)
      },
      error => {
        if (settled) return
        settled = true
        signal.removeEventListener('abort', abort)
        reject(error)
      },
    )
  })
}

async function readJsonBody(response: Response): Promise<unknown> {
  const length = response.headers.get('content-length')
  if (length !== null && Number.isFinite(Number(length)) && Number(length) > MAX_RESPONSE_BYTES) {
    throw new CredentialOperationError('invalid-response')
  }
  let text: string
  try {
    text = await response.text()
  } catch {
    throw new CredentialOperationError('invalid-response')
  }
  if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) throw new CredentialOperationError('invalid-response')
  if (text.length === 0) return {}
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new CredentialOperationError('invalid-response')
  }
}

function responseError(status: number, body?: unknown): CredentialOperationError {
  if (status === 400 && isRecord(body) && body.error === 'invalid_grant') return new CredentialOperationError('invalid-grant')
  if (status === 408 || status === 504) return new CredentialOperationError('timeout')
  if (status === 429) return new CredentialOperationError('rate-limited')
  if (status >= 500 && status <= 599) return new CredentialOperationError('server-error')
  return new CredentialOperationError('http-error')
}

function validateRefreshResult(value: RefreshAccessTokenResult): void {
  if (!isRecord(value) || typeof value.accessToken !== 'string' || !isBoundedSafeText(value.accessToken, 4096)
    || typeof value.expiresAt !== 'number' || !Number.isFinite(value.expiresAt)) {
    throw new CredentialOperationError('invalid-response')
  }
  if (value.refreshToken !== undefined && (typeof value.refreshToken !== 'string' || !isBoundedSafeText(value.refreshToken, 4096))) {
    throw new CredentialOperationError('invalid-response')
  }
}

function isCancelled(error: unknown): boolean {
  return error instanceof CredentialOperationError && error.code === 'cancelled'
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

export function credentialErrorMessage(code: string): string | undefined {
  switch (code) {
    case 'invalid-grant': return 'The Antigravity grant requires login again'
    case 'timeout': return 'The Antigravity authentication request timed out'
    case 'rate-limited': return 'The Antigravity authentication service is rate-limited'
    case 'server-error': return 'The Antigravity authentication service is unavailable'
    case 'network': return 'The Antigravity authentication request failed'
    case 'invalid-response': return 'The Antigravity authentication response was invalid'
    case 'conflict': return 'The Antigravity credential changed while it was refreshing'
    case 'storage': return 'The Antigravity credential store failed'
    case 'cancelled': return 'The Antigravity authentication request was cancelled'
    case 'http-error': return 'The Antigravity authentication service rejected the request'
    default: return undefined
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
