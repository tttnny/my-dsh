/** Host-side Antigravity risk gate, OAuth coordinator, and credential commit boundary. */

import type { AntigravityAuthRecord, AntigravityAuthStore } from './auth-store.ts'
import { createAuthStore, defaultAuthStorePath } from './auth-store.ts'
import { createCredentialCoordinator, type CredentialCoordinator, type CredentialCoordinatorOptions, type HostCredential } from './credential-coordinator.ts'
import { createOAuthFlow, OAuthFlowError } from './oauth-flow.ts'
import type {
  OAuthFlow,
  OAuthFlowCompletionResult,
  OAuthFlowOptions,
  OAuthToken,
  ProjectValidation,
} from './oauth-flow.ts'
import { createProjectDiscovery } from './project-context.ts'
import { isBoundedSafeText } from './safe-text.ts'
import type { ProjectDiscoveryOptions } from './project-context.ts'
import type {
  AntigravityStatusView,
  BootstrapStatusService,
  RiskAcknowledgementResult,
  LoginActionResult,
  LoginStartResult,
  LoginStatusView,
  CapabilityGateEvidence,
  LlmFamilyId,
} from './status.ts'
import { createStatusView } from './status.ts'
import { createQuotaService, type QuotaService, type QuotaServiceOptions } from './quota.ts'
import {
  createFileCapabilityGates,
  createMemoryCapabilityGates,
  defaultCapabilityGatePath,
  type CapabilityGateRegistry,
} from './capability-gates.ts'
import type { CapabilityGateOutcome, CapabilityRowId } from './status.ts'

export interface AntigravityAuthServiceOptions {
  readonly store?: AntigravityAuthStore
  readonly storePath?: string
  readonly flowOptions?: Omit<OAuthFlowOptions, 'commit' | 'validateProject'>
  /** Inject a complete private transport only for deterministic Host tests. */
  readonly projectOptions?: ProjectDiscoveryOptions
  readonly credentialOptions?: Omit<CredentialCoordinatorOptions, 'store'>
  readonly quotaOptions?: Omit<QuotaServiceOptions, 'auth'>
  readonly gates?: CapabilityGateRegistry
  readonly gatePath?: string
  readonly autoActivateGates?: boolean
}

export type { HostCredential } from './credential-coordinator.ts'

export class AntigravityAuthService implements BootstrapStatusService {
  private readonly store: AntigravityAuthStore
  private readonly credentials: CredentialCoordinator
  private readonly flow: OAuthFlow
  private readonly quota: QuotaService
  private readonly gates: CapabilityGateRegistry
  private readonly autoActivate: boolean
  private riskAcknowledged = false
  private activeFlowGeneration = 0
  private disposed = false
  private readonly statusListeners = new Set<() => void>()

  constructor(options: AntigravityAuthServiceOptions = {}) {
    this.autoActivate = options.autoActivateGates ?? false
    const storePath = options.storePath ?? defaultAuthStorePath()
    this.store = options.store ?? createAuthStore(storePath)
    this.gates = options.gates ?? (options.gatePath !== undefined
      ? createFileCapabilityGates(options.gatePath)
      : options.store === undefined
        ? createFileCapabilityGates(defaultCapabilityGatePath(storePath))
        : createMemoryCapabilityGates())
    this.credentials = createCredentialCoordinator({
      ...options.credentialOptions,
      store: this.store,
    })
    this.quota = createQuotaService({
      ...options.quotaOptions,
      auth: this.credentials,
    })
    const projectDiscovery = createProjectDiscovery(options.projectOptions)
    this.flow = createOAuthFlow({
      ...options.flowOptions,
      validateProject: (accessToken, signal) => projectDiscovery.discover(accessToken, signal),
      commit: (token, project, signal) => this.commitCredential(token, project, signal),
    })
  }

  async status(): Promise<AntigravityStatusView> {
    const record = await this.readRecord()
    const flowStatus = this.flow.status()
    const phase = flowStatus.phase === 'idle' && record !== undefined ? 'success' : flowStatus.phase
    const maskedEmail = maskEmail(record?.email)
    const credentialStatus = await this.credentials.status()
    const gateEvidence = await this.gateEvidenceFor(record)
    const login: LoginStatusView = {
      phase,
      configured: record !== undefined,
      projectAvailable: record?.projectId !== undefined,
      ...(flowStatus.authorizationUrl === undefined ? {} : { authorizationUrl: flowStatus.authorizationUrl }),
      ...(flowStatus.expiresAt === undefined ? {} : { expiresAt: flowStatus.expiresAt }),
      ...(maskedEmail === undefined ? {} : { maskedEmail }),
      ...(flowStatus.errorCode === undefined ? {} : { errorCode: flowStatus.errorCode }),
    }
    return createStatusView(this.riskAcknowledged, login, credentialStatus, this.credentials.revokeStatus(), gateEvidence)
  }

  async acknowledgeRisk(): Promise<RiskAcknowledgementResult> {
    this.riskAcknowledged = true
    this.notifyStatus()
    return { acknowledged: true }
  }

  /** Observe value-safe gate changes so capability rows can register without polling secrets. */
  watchStatus(listener: () => void): () => void {
    this.statusListeners.add(listener)
    return () => { this.statusListeners.delete(listener) }
  }

  async recordGate0(outcome: CapabilityGateOutcome): Promise<void> {
    const subject = gateSubject(await this.requireRecord())
    await this.gates.recordGate0(subject, outcome)
    this.notifyStatus()
  }

  async recordLlmFamilyGate(family: LlmFamilyId, outcome: CapabilityGateOutcome): Promise<void> {
    const record = await this.requireRecord()
    const subject = gateSubject(record)
    await this.gates.recordLlmFamily(subject, family, outcome)
    this.notifyStatus()
  }

  async recordCapabilityGate(id: CapabilityRowId, outcome: CapabilityGateOutcome): Promise<void> {
    const record = await this.requireRecord()
    const subject = gateSubject(record)
    if (id === 'auth-llm') {
      throw new OAuthFlowError('internal', 'Auth/LLM availability is derived from independent family evidence')
    }
    await this.gates.recordCapability(subject, id, outcome)
    this.notifyStatus()
  }

  async capabilityGateEvidence(): Promise<CapabilityGateEvidence> {
    return this.gateEvidenceFor(await this.readRecord())
  }

  async gate0Passed(): Promise<boolean> {
    return (await this.capabilityGateEvidence()).gate0?.outcome === 'passed'
  }

  async capabilityAvailable(id: CapabilityRowId): Promise<boolean> {
    const status = await this.status()
    return status.capabilities.some(capability => capability.id === id && capability.state === 'available')
  }

  async startLogin(): Promise<LoginStartResult> {
    if (this.disposed) throw new OAuthFlowError('internal', 'The Antigravity login is unavailable')
    if (!this.riskAcknowledged) {
      throw new OAuthFlowError('risk-acknowledgement-required', 'Risk acknowledgement is required before login')
    }
    const started = await this.flow.start()
    this.activeFlowGeneration = this.flow.generation()
    this.notifyStatus()
    return started
  }

  async completeCallback(callbackUrl: string): Promise<OAuthFlowCompletionResult> {
    if (this.disposed) throw new OAuthFlowError('internal', 'The Antigravity login is unavailable')
    try {
      return await this.flow.completeCallbackUrl(callbackUrl)
    } finally {
      this.notifyStatus()
    }
  }

  async cancelLogin(): Promise<LoginActionResult> {
    const status = await this.flow.cancel()
    if (status.phase !== 'success') this.activeFlowGeneration = 0
    this.notifyStatus()
    return {
      phase: status.phase,
      ...(status.errorCode === undefined ? {} : { errorCode: status.errorCode }),
    }
  }

  async credential(signal?: AbortSignal, options?: { readonly forceRefresh?: boolean }): Promise<HostCredential | undefined> {
    return await this.credentials.credential(signal, options)
  }

  async usage(signal?: AbortSignal, force = false): Promise<import('./quota.ts').QuotaStatusView> {
    return await this.quota.refresh(signal, force)
  }

  async logout(): Promise<import('./credential-coordinator.ts').LogoutResult> {
    if (this.disposed) throw new OAuthFlowError('internal', 'The Antigravity login is unavailable')
    this.activeFlowGeneration = 0
    await this.flow.cancel()
    try {
      const result = await this.credentials.logout()
      await this.gates.clear()
      this.notifyStatus()
      return result
    } catch {
      throw new OAuthFlowError('persistence-failed', 'The local Antigravity credential could not be cleared')
    }
  }

  async revoke(confirmed: boolean, signal?: AbortSignal): Promise<import('./credential-coordinator.ts').RevokeActionResult> {
    if (this.disposed) throw new OAuthFlowError('internal', 'The Antigravity login is unavailable')
    const result = await this.credentials.revoke(confirmed, signal)
    if (result.state === 'revoked' || result.state === 'logged-out' || result.state === 'superseded') await this.gates.clear()
    this.notifyStatus()
    return result
  }

  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    this.activeFlowGeneration = 0
    this.statusListeners.clear()
    await Promise.all([this.flow.dispose(), this.credentials.dispose(), this.quota.dispose()])
  }

  private async commitCredential(token: OAuthToken, project: ProjectValidation, signal: AbortSignal): Promise<void> {
    const flowGeneration = this.flow.generation()
    if (this.disposed || flowGeneration !== this.activeFlowGeneration || signal.aborted) {
      throw new OAuthFlowError('cancelled', 'The OAuth login was cancelled')
    }
    const current = await this.readRecord()
    if (this.disposed || flowGeneration !== this.activeFlowGeneration || signal.aborted) {
      throw new OAuthFlowError('cancelled', 'The OAuth login was cancelled')
    }
    const email = maskEmail(project.email ?? token.email)
    const draft = {
      refreshToken: token.refreshToken,
      projectId: project.projectId,
      ...(email === undefined ? {} : { email }),
    }
    const committed = await this.store.compareAndCommit(current?.revision ?? 0, draft, current?.lineage)
    if (committed === undefined) throw new OAuthFlowError('credential-conflict', 'The login changed while it was completing')
    if (this.autoActivate) {
      const subject = committed.lineage ?? 'legacy-account'
      await this.autoActivateGates(subject)
    } else {
      // The lineage fence makes prior evidence unusable atomically with this commit.
      // Physical cleanup is best-effort: a stale file cannot authorize the new lineage.
      await this.gates.clear().catch(() => {})
    }
    // The persistent compare-and-commit is the linearization point. A later abort
    // cannot turn a committed replacement into a reported failed login.
    this.credentials.replaceFromLogin({
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresAt: token.expiresAt,
      projectId: project.projectId,
    }, committed)
    // The browser redirect commits through the flow's loopback listener, which
    // never reaches the public completeCallback wrapper. Publish the committed
    // credential here so capability lifecycles register the LLM/search/image/
    // video routes without a Host restart.
    this.notifyStatus()
  }

  private notifyStatus(): void {
    for (const listener of this.statusListeners) {
      try { listener() } catch { /* observer failures cannot change auth state */ }
    }
  }

  private async gateEvidenceFor(record: AntigravityAuthRecord | undefined): Promise<CapabilityGateEvidence> {
    try {
      const evidence = await this.gates.read()
      if (record === undefined) return {}
      const subject = gateSubject(record)
      if (evidence.subject === subject) return evidence

      if (this.autoActivate && record.projectId !== undefined) {
        await this.autoActivateGates(subject)
        return await this.gates.read()
      }
      return {}
    } catch {
      return { gate0: { outcome: 'protocol-drift', checkedAt: new Date().toISOString() } }
    }
  }

  private async autoActivateGates(subject: string): Promise<void> {
    try {
      await this.gates.recordGate0(subject, 'passed')
      await this.gates.recordLlmFamily(subject, 'gemini', 'passed')
      await this.gates.recordLlmFamily(subject, 'claude', 'passed')
      await this.gates.recordLlmFamily(subject, 'gpt-oss', 'passed')
      await this.gates.recordCapability(subject, 'search', 'passed')
      await this.gates.recordCapability(subject, 'image', 'passed')
      await this.gates.recordCapability(subject, 'video', 'passed')
    } catch {
      // Best-effort auto-activation
    }
  }

  private async requireRecord(): Promise<AntigravityAuthRecord> {
    const record = await this.readRecord()
    if (record === undefined) throw new OAuthFlowError('internal', 'Antigravity login is required')
    return record
  }

  private async readRecord(): Promise<AntigravityAuthRecord | undefined> {
    try {
      return await this.store.read()
    } catch {
      throw new OAuthFlowError('persistence-failed', 'The Antigravity auth store could not be read')
    }
  }
}

function gateSubject(record: AntigravityAuthRecord): string {
  return record.lineage ?? 'legacy-account'
}

export function createAntigravityAuthService(options: AntigravityAuthServiceOptions = {}): AntigravityAuthService {
  return new AntigravityAuthService(options)
}

export function maskEmail(value: string | undefined): string | undefined {
  if (!isBoundedSafeText(value, 4096)) return undefined
  const at = value.indexOf('@')
  if (at <= 0 || at === value.length - 1) return undefined
  const local = value.slice(0, at)
  const domain = value.slice(at + 1)
  if (!/^[^\s@]+$/u.test(local) || !/^[^\s@]+$/u.test(domain)) return undefined
  return `${local.slice(0, 1)}***@${domain}`
}
