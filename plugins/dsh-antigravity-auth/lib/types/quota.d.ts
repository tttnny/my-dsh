/** Single-account Antigravity quota normalization and bounded Host service. */
import type { CredentialCoordinator, HostCredential } from './credential-coordinator.ts';
import { type PrivateTransport, type PrivateTransportOptions } from './private-transport.ts';
export declare const ANTIGRAVITY_QUOTA_ENDPOINT: `${string}/v1internal:retrieveUserQuotaSummary`;
export declare const QUOTA_REFRESH_MIN_INTERVAL_MS = 30000;
export type QuotaState = 'available' | 'unauthenticated' | 'forbidden' | 'rate-limited' | 'offline' | 'timeout' | 'protocol-drift';
export type QuotaWindowKind = '5h' | 'weekly';
export interface QuotaWindowView {
    readonly window: QuotaWindowKind;
    readonly remainingFraction: number;
    readonly resetTime: string;
}
export interface QuotaGroupView {
    readonly group: 'gemini' | 'non-gemini';
    readonly modelCount: number;
    readonly windows: readonly QuotaWindowView[];
}
export interface QuotaStatusView {
    readonly state: QuotaState;
    readonly checkedAt?: string;
    readonly groups?: readonly QuotaGroupView[];
}
export interface QuotaService {
    refresh(signal?: AbortSignal, force?: boolean): Promise<QuotaStatusView>;
    status(): QuotaStatusView;
    dispose(): Promise<void>;
}
export interface QuotaServiceOptions {
    readonly auth: Pick<CredentialCoordinator, 'credential'> | {
        credential(signal?: AbortSignal): Promise<HostCredential | undefined>;
    };
    readonly transport?: PrivateTransport;
    readonly transportOptions?: PrivateTransportOptions;
    readonly now?: () => number;
    readonly minIntervalMs?: number;
}
/** Normalize only validated, display-safe quota facts from a provider response. */
export declare function normalizeQuotaResponse(value: unknown, now?: number): QuotaStatusView;
export declare class QuotaNormalizationError extends Error {
    constructor(message: string);
}
export declare function createQuotaService(options: QuotaServiceOptions): QuotaService;
//# sourceMappingURL=quota.d.ts.map