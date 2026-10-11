/** Owner-only, versioned, single-account refresh-token persistence. */

import { randomUUID } from 'node:crypto'
import { chmod, mkdir, open, readFile, rename, lstat, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { isBoundedSafeText } from './safe-text.ts'

export const AUTH_RECORD_VERSION = 1 as const

const AUTH_STORE_LOCK_NAME = '.auth.lock'
const AUTH_STORE_LOCK_TIMEOUT_MS = 10_000
const AUTH_STORE_LOCK_STALE_MS = 30_000
const AUTH_STORE_LOCK_RETRY_MS = 10

export interface AuthRecordDraft {
  readonly refreshToken: string
  readonly projectId: string
  readonly email?: string
  /** Keep the same lineage for a refresh; a new login omits it to fence older work. */
  readonly lineage?: string
}

export interface AntigravityAuthRecord {
  readonly version: typeof AUTH_RECORD_VERSION
  readonly refreshToken: string
  readonly projectId: string
  readonly email?: string
  readonly revision: number
  readonly updatedAt: string
  /** A per-login lineage fence; absent only on records written by older versions. */
  readonly lineage?: string
}

export interface AuthStoreOptions {
  readonly now?: () => number
  /** Override process.platform only for deterministic cross-platform tests. */
  readonly platform?: NodeJS.Platform
}

export interface AntigravityAuthStore {
  read(): Promise<AntigravityAuthRecord | undefined>
  commit(draft: AuthRecordDraft): Promise<AntigravityAuthRecord>
  compareAndCommit(
    expectedRevision: number,
    draft: AuthRecordDraft,
    expectedLineage?: string,
  ): Promise<AntigravityAuthRecord | undefined>
  /** Clear only when the observed record is still the same account lineage. */
  clearIfCurrent(expectedRevision: number, expectedLineage?: string): Promise<boolean>
  clear(): Promise<void>
}

export type AuthStoreErrorCode =
  | 'AUTH_STORE_CORRUPT'
  | 'AUTH_STORE_UNSUPPORTED_VERSION'
  | 'AUTH_STORE_UNSAFE_PERMISSIONS'
  | 'AUTH_STORE_CONFLICT'
  | 'AUTH_STORE_IO'

export class AuthStoreError extends Error {
  readonly code: AuthStoreErrorCode

  constructor(code: AuthStoreErrorCode, message: string) {
    super(message)
    this.name = 'AuthStoreError'
    this.code = code
  }
}

/** Resolve the plugin-owned default path without reading it. */
export function defaultAuthStorePath(
  env: NodeJS.ProcessEnv = process.env,
  home = env.HOME,
  platform: NodeJS.Platform = process.platform,
): string {
  if (platform === 'win32') {
    const windowsDataHome = env.LOCALAPPDATA ?? env.APPDATA
    const base = typeof windowsDataHome === 'string' && windowsDataHome.length > 0
      ? windowsDataHome
      : env.USERPROFILE ?? home ?? ''
    return join(base, 'dsh-antigravity-auth', 'auth.json')
  }
  const dataHome = env.XDG_DATA_HOME
  const base = typeof dataHome === 'string' && dataHome.length > 0
    ? dataHome
    : join(home ?? '', '.local', 'share')
  return join(base, 'dsh-antigravity-auth', 'auth.json')
}

/** Create one store whose public API never exposes an access token field. */
export function createAuthStore(path: string, options: AuthStoreOptions = {}): AntigravityAuthStore {
  const now = options.now ?? (() => Date.now())
  const platform = options.platform ?? process.platform
  const enqueue = createMutationQueue()
  const read = () => readAuthRecordForPlatform(path, platform)

  return {
    read,
    commit: draft => enqueue(() => withStoreLock(path, async () => {
      const current = await read()
      const record = makeRecord(draft, (current?.revision ?? 0) + 1, now())
      await writeAuthRecord(path, record)
      return record
    })),
    compareAndCommit: (expectedRevision, draft, expectedLineage) => enqueue(() => withStoreLock(path, async () => {
      const current = await read()
      if ((current?.revision ?? 0) !== expectedRevision) return undefined
      const lineage = expectedLineage ?? draft.lineage
      if (lineage === undefined ? current?.lineage !== undefined : current?.lineage !== lineage) return undefined
      const record = makeRecord(draft, expectedRevision + 1, now())
      await writeAuthRecord(path, record)
      return record
    })),
    clearIfCurrent: (expectedRevision, expectedLineage) => enqueue(() => withStoreLock(path, async () => {
      const current = await read()
      if ((current?.revision ?? 0) !== expectedRevision) return false
      if (expectedLineage === undefined ? current?.lineage !== undefined : current?.lineage !== expectedLineage) return false
      try {
        await unlink(path)
      } catch (error) {
        if (!isNotFound(error)) throw storeIoError()
      }
      await syncDirectory(dirname(path))
      return true
    })),
    clear: () => enqueue(() => withStoreLock(path, async () => {
      try {
        await unlink(path)
      } catch (error) {
        if (!isNotFound(error)) throw storeIoError()
      }
      await syncDirectory(dirname(path))
    })),
  }
}

/** An offline store useful for tests and process-local bootstrap fixtures. */
export function createMemoryAuthStore(initial?: AntigravityAuthRecord, options: AuthStoreOptions = {}): AntigravityAuthStore {
  const now = options.now ?? (() => Date.now())
  let current = initial === undefined ? undefined : cloneRecord(initial)
  const enqueue = createMutationQueue()
  return {
    read: async () => current === undefined ? undefined : cloneRecord(current),
    commit: draft => enqueue(async () => {
      current = makeRecord(draft, (current?.revision ?? 0) + 1, now())
      return cloneRecord(current)
    }),
    compareAndCommit: (expectedRevision, draft, expectedLineage) => enqueue(async () => {
      if ((current?.revision ?? 0) !== expectedRevision) return undefined
      const lineage = expectedLineage ?? draft.lineage
      if (lineage === undefined ? current?.lineage !== undefined : current?.lineage !== lineage) return undefined
      current = makeRecord(draft, expectedRevision + 1, now())
      return cloneRecord(current)
    }),
    clearIfCurrent: (expectedRevision, expectedLineage) => enqueue(async () => {
      if ((current?.revision ?? 0) !== expectedRevision) return false
      if (expectedLineage === undefined ? current?.lineage !== undefined : current?.lineage !== expectedLineage) return false
      current = undefined
      return true
    }),
    clear: () => enqueue(async () => { current = undefined }),
  }
}

function createMutationQueue() {
  let mutation: Promise<void> = Promise.resolve()
  return function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = mutation.then(operation, operation)
    mutation = next.then(() => {}, () => {})
    return next
  }
}

async function withStoreLock<T>(path: string, operation: () => Promise<T>): Promise<T> {
  const parent = dirname(path)
  await prepareParent(parent)
  const lockPath = join(parent, AUTH_STORE_LOCK_NAME)
  const deadline = Date.now() + AUTH_STORE_LOCK_TIMEOUT_MS

  while (true) {
    try {
      const handle = await open(lockPath, 'wx', 0o600)
      try {
        await handle.writeFile(`${process.pid}\n`, 'utf8')
        await handle.sync()
        return await operation()
      } finally {
        await handle.close().catch(() => {})
        await unlink(lockPath).catch(() => {})
      }
    } catch (error) {
      if (error instanceof AuthStoreError) throw error
      if (!isAlreadyExists(error)) throw storeIoError()
      await removeStaleLock(lockPath)
      if (Date.now() >= deadline) throw conflictError()
      await new Promise<void>(resolve => setTimeout(resolve, AUTH_STORE_LOCK_RETRY_MS))
    }
  }
}

async function prepareParent(parent: string): Promise<void> {
  try {
    const parentInfo = await lstat(parent)
    if (parentInfo.isSymbolicLink() || !parentInfo.isDirectory()) throw unsafePermissionsError()
  } catch (error) {
    if (!isNotFound(error)) throw error
  }
  try {
    await mkdir(parent, { recursive: true, mode: 0o700 })
    await chmod(parent, 0o700)
  } catch (error) {
    if (error instanceof AuthStoreError) throw error
    throw storeIoError()
  }
}

async function syncDirectory(path: string): Promise<void> {
  if (process.platform === 'win32') return
  const handle = await open(path, 'r')
  try {
    await handle.sync()
  } finally {
    await handle.close().catch(() => {})
  }
}

async function removeStaleLock(path: string): Promise<void> {
  try {
    const info = await lstat(path)
    if (Date.now() - info.mtimeMs > AUTH_STORE_LOCK_STALE_MS) await unlink(path).catch(() => {})
  } catch (error) {
    if (!isNotFound(error)) return
  }
}

export async function readAuthRecord(path: string): Promise<AntigravityAuthRecord | undefined> {
  return readAuthRecordForPlatform(path, process.platform)
}

async function readAuthRecordForPlatform(
  path: string,
  platform: NodeJS.Platform,
): Promise<AntigravityAuthRecord | undefined> {
  let fileInfo
  try {
    fileInfo = await lstat(path)
  } catch (error) {
    if (isNotFound(error)) return undefined
    throw storeIoError()
  }
  if (fileInfo.isSymbolicLink() || !fileInfo.isFile()) throw unsafePermissionsError()
  await assertOwnerOnly(path, platform)

  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch {
    throw storeIoError()
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch {
    throw corruptError()
  }
  return parseRecord(parsed)
}

export async function writeAuthRecord(path: string, record: AntigravityAuthRecord): Promise<void> {
  const validated = parseRecord(record)
  const parent = dirname(path)
  try {
    await prepareParent(parent)
    const temporary = join(parent, `.${randomUUID()}.tmp`)
    try {
      const handle = await open(temporary, 'wx', 0o600)
      try {
        await handle.writeFile(`${JSON.stringify(validated)}\n`, 'utf8')
        await handle.sync()
      } finally {
        await handle.close().catch(() => {})
      }
      await chmod(temporary, 0o600)
      await rename(temporary, path)
      await chmod(path, 0o600)
      await syncDirectory(parent)
    } catch {
      await unlink(temporary).catch(() => {})
      throw storeIoError()
    }
  } catch (error) {
    if (error instanceof AuthStoreError) throw error
    throw storeIoError()
  }
}

export function makeAuthRecord(draft: AuthRecordDraft, revision: number, now = Date.now()): AntigravityAuthRecord {
  return makeRecord(draft, revision, now)
}

function makeRecord(draft: AuthRecordDraft, revision: number, now: number): AntigravityAuthRecord {
  if (!isRecord(draft)
    || !isBoundedSafeText(draft.refreshToken, 4096)
    || !isBoundedSafeText(draft.projectId, 4096)
    || (draft.lineage !== undefined && !isBoundedSafeText(draft.lineage, 4096))
    || !Number.isSafeInteger(revision)
    || revision < 1
    || !Number.isFinite(now)) {
    throw corruptError()
  }
  const record: AntigravityAuthRecord = {
    version: AUTH_RECORD_VERSION,
    refreshToken: draft.refreshToken,
    projectId: draft.projectId,
    revision,
    updatedAt: new Date(now).toISOString(),
    lineage: draft.lineage ?? randomUUID(),
    ...(draft.email === undefined ? {} : { email: validateEmail(draft.email) }),
  }
  return record
}

function parseRecord(value: unknown): AntigravityAuthRecord {
  if (!isRecord(value)) throw corruptError()
  if (value.version !== AUTH_RECORD_VERSION) throw unsupportedVersionError()
  const keys = Object.keys(value).sort()
  const required = ['projectId', 'refreshToken', 'revision', 'updatedAt', 'version']
  const withEmail = [...required, 'email'].sort()
  const withLineage = [...required, 'lineage'].sort()
  const withEmailAndLineage = [...required, 'email', 'lineage'].sort()
  const expected = keys.length === required.length
    ? required
    : keys.includes('lineage')
      ? (keys.includes('email') ? withEmailAndLineage : withLineage)
      : withEmail
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) throw corruptError()
  const refreshToken = value.refreshToken
  const projectId = value.projectId
  const revision = value.revision
  const updatedAt = value.updatedAt
  const lineage = value.lineage
  if (!isBoundedSafeText(refreshToken, 4096)
    || !isBoundedSafeText(projectId, 4096)
    || typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 1
    || typeof updatedAt !== 'string' || !Number.isFinite(Date.parse(updatedAt))
    || (lineage !== undefined && !isBoundedSafeText(lineage, 4096))) {
    throw corruptError()
  }
  const email = value.email
  if (email !== undefined && !isBoundedSafeText(email, 4096)) throw corruptError()
  return {
    version: AUTH_RECORD_VERSION,
    refreshToken,
    projectId,
    revision,
    updatedAt,
    ...(email === undefined ? {} : { email }),
    ...(lineage === undefined ? {} : { lineage }),
  }
}

async function assertOwnerOnly(path: string, platform: NodeJS.Platform): Promise<void> {
  try {
    const file = await lstat(path)
    const parent = await lstat(dirname(path))
    const unsafePosixMode = platform !== 'win32'
      && ((file.mode & 0o077) !== 0 || (parent.mode & 0o077) !== 0)
    if (file.isSymbolicLink() || parent.isSymbolicLink() || !parent.isDirectory() || unsafePosixMode) {
      throw unsafePermissionsError()
    }
  } catch (error) {
    if (error instanceof AuthStoreError) throw error
    throw storeIoError()
  }
}

function validateEmail(value: string): string {
  if (!isBoundedSafeText(value, 4096) || !value.includes('@')) throw corruptError()
  return value
}

function cloneRecord(record: AntigravityAuthRecord): AntigravityAuthRecord {
  return { ...record }
}

function corruptError(): AuthStoreError {
  return new AuthStoreError('AUTH_STORE_CORRUPT', 'The Antigravity auth store is not valid')
}

function unsupportedVersionError(): AuthStoreError {
  return new AuthStoreError('AUTH_STORE_UNSUPPORTED_VERSION', 'The Antigravity auth store version is unsupported')
}

function unsafePermissionsError(): AuthStoreError {
  return new AuthStoreError('AUTH_STORE_UNSAFE_PERMISSIONS', 'The Antigravity auth store permissions are unsafe')
}

function storeIoError(): AuthStoreError {
  return new AuthStoreError('AUTH_STORE_IO', 'The Antigravity auth store could not be accessed')
}

function conflictError(): AuthStoreError {
  return new AuthStoreError('AUTH_STORE_CONFLICT', 'The Antigravity auth store is busy')
}

function isAlreadyExists(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'EEXIST'
}

function isNotFound(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
