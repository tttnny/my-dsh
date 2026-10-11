/** Value-free live-gate evidence used to keep capability registration honest. */

import { chmod, lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  CAPABILITY_GATE_OUTCOMES,
  CAPABILITY_ROW_IDS,
  LLM_FAMILY_IDS,
  type CapabilityGateEvidence,
  type CapabilityGateOutcome,
  type CapabilityGateResult,
  type CapabilityRowId,
  type LlmFamilyId,
} from './status.ts'
import { isBoundedSafeText } from './safe-text.ts'

const GATE_FILE_VERSION = 2
const MAX_GATE_FILE_BYTES = 64 * 1024
const PERSISTED_CAPABILITY_IDS = CAPABILITY_ROW_IDS.filter(id => id !== 'auth-llm')
type PersistedCapabilityId = Exclude<CapabilityRowId, 'auth-llm'>

export interface CapabilityGateRegistry {
  read(): Promise<CapabilityGateEvidence>
  recordGate0(subject: string, outcome: CapabilityGateOutcome): Promise<CapabilityGateEvidence>
  recordLlmFamily(subject: string, family: LlmFamilyId, outcome: CapabilityGateOutcome): Promise<CapabilityGateEvidence>
  recordCapability(subject: string, id: PersistedCapabilityId, outcome: CapabilityGateOutcome): Promise<CapabilityGateEvidence>
  clear(): Promise<void>
}

export interface FileCapabilityGateOptions {
  readonly now?: () => number
  /** Override process.platform only for deterministic cross-platform tests. */
  readonly platform?: NodeJS.Platform
}

/** Resolve a gate record next to the plugin-owned auth record without reading either. */
export function defaultCapabilityGatePath(authStorePath: string): string {
  return join(dirname(authStorePath), 'gates.json')
}

export function createMemoryCapabilityGates(
  initial: CapabilityGateEvidence = {},
  now: () => number = () => Date.now(),
): CapabilityGateRegistry {
  let current = cloneEvidence(initial)
  return {
    read: async () => cloneEvidence(current),
    recordGate0: async (subject, outcome) => {
      current = { subject: checkedSubject(subject), gate0: result(outcome, now) }
      return cloneEvidence(current)
    },
    recordLlmFamily: async (subject, family, outcome) => {
      current = evidenceForSubject(current, subject)
      current = { ...current, llmFamilies: { ...current.llmFamilies, [family]: result(outcome, now) } }
      return cloneEvidence(current)
    },
    recordCapability: async (subject, id, outcome) => {
      current = evidenceForSubject(current, subject)
      current = { ...current, capabilities: { ...current.capabilities, [id]: result(outcome, now) } }
      return cloneEvidence(current)
    },
    clear: async () => { current = {} },
  }
}

export function createFileCapabilityGates(
  path: string,
  options: FileCapabilityGateOptions = {},
): CapabilityGateRegistry {
  const now = options.now ?? (() => Date.now())
  const platform = options.platform ?? process.platform
  let mutation = Promise.resolve()
  const read = async (): Promise<CapabilityGateEvidence> => {
    let text: string
    try {
      const [file, directory] = await Promise.all([lstat(path), lstat(dirname(path))])
      const unsafePosixMode = platform !== 'win32'
        && ((file.mode & 0o077) !== 0 || (directory.mode & 0o077) !== 0)
      if (file.isSymbolicLink() || !file.isFile() || directory.isSymbolicLink() || !directory.isDirectory()
        || file.size > MAX_GATE_FILE_BYTES || unsafePosixMode) throw new Error('unsafe gate record')
      text = await readFile(path, 'utf8')
      if (text.length > MAX_GATE_FILE_BYTES) throw new Error('oversized gate record')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}
      throw new Error('The Antigravity capability gate record could not be read')
    }
    let value: unknown
    try { value = JSON.parse(text) as unknown } catch { throw new Error('The Antigravity capability gate record is malformed') }
    return parseFile(value)
  }
  const update = async (mutate: (current: CapabilityGateEvidence) => CapabilityGateEvidence): Promise<CapabilityGateEvidence> => {
    let output: CapabilityGateEvidence = {}
    const operation = mutation.then(async () => {
      output = mutate(await read())
      await writeEvidence(path, output)
    })
    mutation = operation.catch(() => {})
    await operation
    return cloneEvidence(output)
  }
  return {
    read,
    recordGate0: (subject, outcome) => update(() => ({ subject: checkedSubject(subject), gate0: result(outcome, now) })),
    recordLlmFamily: (subject, family, outcome) => update(current => {
      const owned = evidenceForSubject(current, subject)
      return { ...owned, llmFamilies: { ...owned.llmFamilies, [family]: result(outcome, now) } }
    }),
    recordCapability: (subject, id, outcome) => update(current => {
      const owned = evidenceForSubject(current, subject)
      return { ...owned, capabilities: { ...owned.capabilities, [id]: result(outcome, now) } }
    }),
    clear: async () => {
      const operation = mutation.then(async () => { await rm(path, { force: true }) })
      mutation = operation.catch(() => {})
      await operation
    },
  }
}

async function writeEvidence(path: string, evidence: CapabilityGateEvidence): Promise<void> {
  const directory = dirname(path)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  await chmod(directory, 0o700)
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`
  const encoded = `${JSON.stringify({ version: GATE_FILE_VERSION, ...evidence })}\n`
  try {
    await writeFile(temporary, encoded, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    await rename(temporary, path)
    await chmod(path, 0o600)
  } finally {
    await rm(temporary, { force: true }).catch(() => {})
  }
}

function parseFile(value: unknown): CapabilityGateEvidence {
  if (!isRecord(value) || value.version !== GATE_FILE_VERSION) throw new Error('The Antigravity capability gate record is malformed')
  if (Object.keys(value).some(key => !['version', 'subject', 'gate0', 'llmFamilies', 'capabilities'].includes(key))) {
    throw new Error('The Antigravity capability gate record is malformed')
  }
  if (typeof value.subject !== 'string' || !isBoundedSafeText(value.subject, 128)) {
    throw new Error('The Antigravity capability gate record is malformed')
  }
  const gate0 = value.gate0 === undefined ? undefined : parseResult(value.gate0)
  const llmFamilies = value.llmFamilies === undefined ? undefined : parseLlmFamilies(value.llmFamilies)
  const capabilities = value.capabilities === undefined ? undefined : parseCapabilities(value.capabilities)
  return {
    subject: value.subject,
    ...(gate0 === undefined ? {} : { gate0 }),
    ...(llmFamilies === undefined ? {} : { llmFamilies }),
    ...(capabilities === undefined ? {} : { capabilities }),
  }
}

function parseLlmFamilies(value: unknown): Readonly<Partial<Record<LlmFamilyId, CapabilityGateResult>>> {
  if (!isRecord(value) || Object.keys(value).some(key => !LLM_FAMILY_IDS.includes(key as LlmFamilyId))) {
    throw new Error('The Antigravity capability gate record is malformed')
  }
  const output: Partial<Record<LlmFamilyId, CapabilityGateResult>> = {}
  for (const family of LLM_FAMILY_IDS) {
    if (value[family] !== undefined) output[family] = parseResult(value[family])
  }
  return output
}

function parseCapabilities(value: unknown): Readonly<Partial<Record<PersistedCapabilityId, CapabilityGateResult>>> {
  if (!isRecord(value) || Object.keys(value).some(key => !PERSISTED_CAPABILITY_IDS.includes(key as PersistedCapabilityId))) {
    throw new Error('The Antigravity capability gate record is malformed')
  }
  const output: Partial<Record<PersistedCapabilityId, CapabilityGateResult>> = {}
  for (const id of PERSISTED_CAPABILITY_IDS) {
    if (value[id] !== undefined) output[id] = parseResult(value[id])
  }
  return output
}

function parseResult(value: unknown): CapabilityGateResult {
  if (!isRecord(value)
    || Object.keys(value).length !== 2
    || !Object.prototype.hasOwnProperty.call(value, 'outcome')
    || !Object.prototype.hasOwnProperty.call(value, 'checkedAt')
    || typeof value.outcome !== 'string'
    || !CAPABILITY_GATE_OUTCOMES.includes(value.outcome as CapabilityGateOutcome)
    || typeof value.checkedAt !== 'string'
    || value.checkedAt.length > 64
    || !Number.isFinite(Date.parse(value.checkedAt))) {
    throw new Error('The Antigravity capability gate record is malformed')
  }
  return { outcome: value.outcome as CapabilityGateOutcome, checkedAt: value.checkedAt }
}

function result(outcome: CapabilityGateOutcome, now: () => number): CapabilityGateResult {
  if (!CAPABILITY_GATE_OUTCOMES.includes(outcome)) throw new Error('The Antigravity capability gate outcome is invalid')
  const timestamp = now()
  if (!Number.isFinite(timestamp)) throw new Error('The Antigravity capability gate clock is invalid')
  return { outcome, checkedAt: new Date(timestamp).toISOString() }
}

function checkedSubject(subject: string): string {
  if (!isBoundedSafeText(subject, 128)) throw new Error('The Antigravity capability gate subject is invalid')
  return subject
}

function evidenceForSubject(current: CapabilityGateEvidence, subject: string): CapabilityGateEvidence {
  const checked = checkedSubject(subject)
  return current.subject === checked ? current : { subject: checked }
}

function cloneEvidence(value: CapabilityGateEvidence): CapabilityGateEvidence {
  return {
    ...(value.subject === undefined ? {} : { subject: value.subject }),
    ...(value.gate0 === undefined ? {} : { gate0: { ...value.gate0 } }),
    ...(value.llmFamilies === undefined
      ? {}
      : { llmFamilies: Object.fromEntries(Object.entries(value.llmFamilies).map(([id, entry]) => [id, entry === undefined ? undefined : { ...entry }])) }),
    ...(value.capabilities === undefined
      ? {}
      : { capabilities: Object.fromEntries(Object.entries(value.capabilities).map(([id, entry]) => [id, entry === undefined ? undefined : { ...entry }])) }),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
