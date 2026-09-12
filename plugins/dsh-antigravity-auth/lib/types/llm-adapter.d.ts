/** Public DSH LLM adapter for the single Antigravity provider route. */
import { LlmAdapter, resolveRetryPolicy } from '@deepseek-ai/dsh-llm';
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment';
import type { GenerateOptions, LlmModelInfo, LlmProviderInfo, LlmResolvedModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm';
import type { CredentialCoordinator, HostCredential } from './credential-coordinator.ts';
import { type PrivateTransport } from './private-transport.ts';
import type { AntigravityModelCatalogView } from './model-catalog.ts';
export declare const ANTIGRAVITY_PROVIDER: "google-antigravity";
export declare const ANTIGRAVITY_STREAM_ENDPOINT: `${string}/v1internal:streamGenerateContent?alt=sse`;
export declare const ANTIGRAVITY_GENERATE_ENDPOINT: `${string}/v1internal:generateContent`;
export declare const ANTIGRAVITY_AVAILABLE_MODELS_ENDPOINT: `${string}/v1internal:fetchAvailableModels`;
export declare const ANTIGRAVITY_LLM_ROUTE: "google-antigravity";
export interface AntigravityAuthCredentialSource {
    credential(signal?: AbortSignal, options?: {
        readonly forceRefresh?: boolean;
    }): Promise<HostCredential | undefined>;
}
export interface AntigravityAdapterOptions {
    readonly auth: Pick<CredentialCoordinator, 'credential'> | AntigravityAuthCredentialSource;
    /** Whole-transport injection is the only private-request test seam. */
    readonly transport?: PrivateTransport;
    readonly responseHeaderTimeoutMs?: number;
    readonly idleTimeoutMs?: number;
    readonly totalTimeoutMs?: number;
    readonly maxResponseBytes?: number;
    readonly maxFrameBytes?: number;
    readonly attachments?: Pick<AttachmentStore, 'readImage'>;
}
export interface AntigravityRequestMetadata {
    readonly requestId: string;
    readonly sessionId: string;
    readonly labels: Record<string, string>;
    readonly lastStepIndex: number;
}
/** Adapter that owns exactly one provider route and no fallback route. */
export declare class AntigravityAdapter extends LlmAdapter {
    private readonly adapterOptions;
    private readonly transport;
    private readonly sessions;
    private readonly options;
    private readonly definitions;
    private catalogProjectId;
    private catalogExpiresAt;
    private catalogModelIds;
    private catalogFailureCode;
    private catalogView;
    constructor(adapterOptions: AntigravityAdapterOptions);
    providerInfo(provider: string): LlmProviderInfo;
    providerRetryPolicy(): ReturnType<typeof resolveRetryPolicy>;
    /** Forget account-bound availability when Gate 0 or the credential is replaced. */
    invalidateModelCatalog(): void;
    /** Return the pinned catalog without performing credential or network work. */
    catalogSnapshot(): AntigravityModelCatalogView;
    /** Refresh the advisory catalog and collapse failures into browser-safe state. */
    modelCatalog(signal?: AbortSignal, forceRefresh?: boolean): Promise<AntigravityModelCatalogView>;
    listModels(provider: string, signal?: AbortSignal): Promise<readonly LlmModelInfo[]>;
    private pinnedTextModelInfos;
    resolveModel(provider: string, model: string, _signal?: AbortSignal): Promise<LlmResolvedModelInfo>;
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
    private streamResponse;
    private readLiveModelIds;
    private rememberCatalogFailure;
    private readCredential;
}
export declare function buildAntigravityGeneratePayload(options: GenerateOptions, credential: HostCredential): Record<string, unknown>;
//# sourceMappingURL=llm-adapter.d.ts.map