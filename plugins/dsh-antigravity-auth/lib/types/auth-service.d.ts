/** Host-side Antigravity risk gate, OAuth coordinator, and credential commit boundary. */
import type { AntigravityAuthStore } from './auth-store.ts';
import { type CredentialCoordinatorOptions, type HostCredential } from './credential-coordinator.ts';
import type { OAuthFlowCompletionResult, OAuthFlowOptions } from './oauth-flow.ts';
import type { ProjectDiscoveryOptions } from './project-context.ts';
import type { AntigravityStatusView, BootstrapStatusService, RiskAcknowledgementResult, LoginActionResult, LoginStartResult, CapabilityGateEvidence, LlmFamilyId } from './status.ts';
import { type QuotaServiceOptions } from './quota.ts';
import { type CapabilityGateRegistry } from './capability-gates.ts';
import type { CapabilityGateOutcome, CapabilityRowId } from './status.ts';
export interface AntigravityAuthServiceOptions {
    readonly store?: AntigravityAuthStore;
    readonly storePath?: string;
    readonly flowOptions?: Omit<OAuthFlowOptions, 'commit' | 'validateProject'>;
    /** Inject a complete private transport only for deterministic Host tests. */
    readonly projectOptions?: ProjectDiscoveryOptions;
    readonly credentialOptions?: Omit<CredentialCoordinatorOptions, 'store'>;
    readonly quotaOptions?: Omit<QuotaServiceOptions, 'auth'>;
    readonly gates?: CapabilityGateRegistry;
    readonly gatePath?: string;
    readonly autoActivateGates?: boolean;
}
export type { HostCredential } from './credential-coordinator.ts';
export declare class AntigravityAuthService implements BootstrapStatusService {
    private readonly store;
    private readonly credentials;
    private readonly flow;
    private readonly quota;
    private readonly gates;
    private readonly autoActivate;
    private riskAcknowledged;
    private activeFlowGeneration;
    private disposed;
    private readonly statusListeners;
    constructor(options?: AntigravityAuthServiceOptions);
    status(): Promise<AntigravityStatusView>;
    acknowledgeRisk(): Promise<RiskAcknowledgementResult>;
    /** Observe value-safe gate changes so capability rows can register without polling secrets. */
    watchStatus(listener: () => void): () => void;
    recordGate0(outcome: CapabilityGateOutcome): Promise<void>;
    recordLlmFamilyGate(family: LlmFamilyId, outcome: CapabilityGateOutcome): Promise<void>;
    recordCapabilityGate(id: CapabilityRowId, outcome: CapabilityGateOutcome): Promise<void>;
    capabilityGateEvidence(): Promise<CapabilityGateEvidence>;
    gate0Passed(): Promise<boolean>;
    capabilityAvailable(id: CapabilityRowId): Promise<boolean>;
    startLogin(): Promise<LoginStartResult>;
    completeCallback(callbackUrl: string): Promise<OAuthFlowCompletionResult>;
    cancelLogin(): Promise<LoginActionResult>;
    credential(signal?: AbortSignal, options?: {
        readonly forceRefresh?: boolean;
    }): Promise<HostCredential | undefined>;
    usage(signal?: AbortSignal, force?: boolean): Promise<import('./quota.ts').QuotaStatusView>;
    logout(): Promise<import('./credential-coordinator.ts').LogoutResult>;
    revoke(confirmed: boolean, signal?: AbortSignal): Promise<import('./credential-coordinator.ts').RevokeActionResult>;
    dispose(): Promise<void>;
    private commitCredential;
    private notifyStatus;
    private gateEvidenceFor;
    private autoActivateGates;
    private requireRecord;
    private readRecord;
}
export declare function createAntigravityAuthService(options?: AntigravityAuthServiceOptions): AntigravityAuthService;
export declare function maskEmail(value: string | undefined): string | undefined;
//# sourceMappingURL=auth-service.d.ts.map