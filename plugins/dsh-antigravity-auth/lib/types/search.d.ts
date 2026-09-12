/** Dedicated grounded Web Search provider and independently mounted Search row. */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { WebSearchProvider, WebSearchRequest, WebSearchResult } from '@deepseek-ai/dsh-web';
import type { CredentialCoordinator, HostCredential } from './credential-coordinator.ts';
import { type PrivateTransport } from './private-transport.ts';
export declare const name = "antigravity-search";
export declare const inject: string[];
export declare const ANTIGRAVITY_SEARCH_PROVIDER_ID = "antigravity";
export declare const ANTIGRAVITY_SEARCH_ENDPOINT: `${string}/v1internal:generateContent`;
export declare const ANTIGRAVITY_SEARCH_MODEL = "antigravity-gemini-3.7-flash";
export declare const ANTIGRAVITY_SEARCH_SETTINGS_NAMESPACE = "antigravity-search";
export interface AntigravitySearchSettings {
    enabled: boolean;
    model: string;
    maxResults: number;
}
export interface Config extends AntigravitySearchSettings {
}
export declare const Config: z<Config>;
export interface AntigravitySearchProviderOptions {
    readonly auth: Pick<CredentialCoordinator, 'credential'> | {
        credential(signal?: AbortSignal): Promise<HostCredential | undefined>;
    };
    readonly enabled?: () => boolean;
    readonly settings?: () => AntigravitySearchSettings;
    readonly transport?: PrivateTransport;
    readonly maxResponseBytes?: number;
}
export declare class AntigravitySearchProvider implements WebSearchProvider {
    private readonly options;
    readonly id = "antigravity";
    private readonly enabled;
    private readonly transport;
    constructor(options: AntigravitySearchProviderOptions);
    available(): boolean;
    search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult>;
}
export declare function buildGroundedSearchPayload(query: string, credential: Pick<HostCredential, 'projectId'>, model?: string): Record<string, unknown>;
/** Mount only the public Web Search seam; no fetch provider is registered. */
export declare function apply(ctx?: Context, config?: Config): void;
//# sourceMappingURL=search.d.ts.map