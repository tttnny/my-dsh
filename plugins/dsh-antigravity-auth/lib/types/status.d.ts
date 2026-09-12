/** Value-free login and capability status shared by Host and browser code. */
import type { LoginActionResult, LoginCompletionResult, LoginErrorCode, LoginPhase, LoginStartResult, LoginStatusView } from './login-types.ts';
import type { CredentialStatusView, LogoutResult, RevokeActionResult, RevokeStatusView } from './credential-coordinator.ts';
import type { QuotaStatusView } from './quota.ts';
export declare const ANTIGRAVITY_PLUGIN_ID: "dsh-antigravity-auth";
export declare const CAPABILITY_ROW_IDS: readonly ["auth-llm", "search", "image", "video"];
export declare const LLM_FAMILY_IDS: readonly ["gemini", "claude", "gpt-oss"];
export type CapabilityRowId = (typeof CAPABILITY_ROW_IDS)[number];
export type LlmFamilyId = (typeof LLM_FAMILY_IDS)[number];
export type CapabilityGateState = 'available' | 'disabled' | 'poc-pending' | 'protocol-drift';
export type CapabilityGateReasonCode = 'gate-not-run' | 'project-unavailable' | 'capability-ready' | 'unauthenticated' | 'rate-limited' | 'cancelled' | 'gate-0-failed' | 'gate-failed' | 'unsupported-video' | 'protocol-drift';
export declare const CAPABILITY_GATE_OUTCOMES: readonly ["passed", "unauthenticated", "rate-limited", "cancelled", "attribution-rejected", "protocol-drift", "unsupported-video", "failed"];
export type CapabilityGateOutcome = (typeof CAPABILITY_GATE_OUTCOMES)[number];
export interface CapabilityGateResult {
    readonly outcome: CapabilityGateOutcome;
    readonly checkedAt: string;
}
export interface CapabilityGateEvidence {
    /** Credential-lineage fence; evidence from another account is ignored. */
    readonly subject?: string;
    readonly gate0?: CapabilityGateResult;
    readonly llmFamilies?: Readonly<Partial<Record<LlmFamilyId, CapabilityGateResult>>>;
    readonly capabilities?: Readonly<Partial<Record<CapabilityRowId, CapabilityGateResult>>>;
}
export type { LoginActionResult, LoginErrorCode, LoginPhase, LoginStartResult, LoginStatusView };
export interface CapabilityGateStatus {
    readonly id: CapabilityRowId;
    readonly state: CapabilityGateState;
    readonly reasonCode: CapabilityGateReasonCode;
}
export interface AntigravityStatusView {
    readonly pluginId: typeof ANTIGRAVITY_PLUGIN_ID;
    readonly phase: 'bootstrap';
    readonly privateSelfUse: true;
    readonly singleAccount: true;
    readonly riskAcknowledgementRequired: true;
    readonly riskAcknowledged: boolean;
    readonly login: LoginStatusView;
    /** Credential state is value-safe; tokens and grant errors never cross this boundary. */
    readonly credential?: CredentialStatusView;
    readonly revoke?: RevokeStatusView;
    readonly capabilities: readonly CapabilityGateStatus[];
}
export interface RiskAcknowledgementResult {
    readonly acknowledged: true;
}
export interface BootstrapStatusService {
    status(): Promise<AntigravityStatusView>;
    acknowledgeRisk(): Promise<RiskAcknowledgementResult>;
    startLogin(): Promise<LoginStartResult>;
    completeCallback(callbackUrl: string): Promise<LoginCompletionResult>;
    cancelLogin(): Promise<{
        readonly phase: LoginPhase;
        readonly errorCode?: LoginErrorCode;
    }>;
    logout(): Promise<LogoutResult>;
    revoke(confirmed: boolean, signal?: AbortSignal): Promise<RevokeActionResult>;
    usage?(signal?: AbortSignal, force?: boolean): Promise<QuotaStatusView>;
    dispose(): Promise<void>;
}
export declare function createStatusView(riskAcknowledged: boolean, login: LoginStatusView, credential?: CredentialStatusView, revoke?: RevokeStatusView, gates?: CapabilityGateEvidence): AntigravityStatusView;
//# sourceMappingURL=status.d.ts.map