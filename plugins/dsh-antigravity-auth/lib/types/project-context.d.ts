/** Host-only, read-only project discovery and safe project normalization. */
import type { ProjectValidation } from './oauth-flow.ts';
import { type PrivateTransport, type PrivateTransportOptions } from './private-transport.ts';
export declare const PROJECT_DISCOVERY_PATH: "/v1internal:loadCodeAssist";
export declare const PROJECT_DISCOVERY_ENDPOINT: `${string}/v1internal:loadCodeAssist`;
export type ProjectDiscoveryErrorCode = 'authentication' | 'forbidden' | 'rate-limited' | 'offline' | 'malformed' | 'protocol-drift' | 'cancelled';
export declare class ProjectDiscoveryError extends Error {
    readonly code: ProjectDiscoveryErrorCode;
    constructor(code: ProjectDiscoveryErrorCode, message?: string);
}
export interface ProjectDiscoveryOptions {
    /** Inject a complete deterministic transport for offline tests; identity is never injectable. */
    readonly transport?: PrivateTransport;
    readonly transportOptions?: PrivateTransportOptions;
    readonly operationTimeoutMs?: number;
}
export interface ProjectDiscovery {
    /** Discover only a project returned for the supplied access token. */
    discover(accessToken: string, signal?: AbortSignal): Promise<ProjectValidation | undefined>;
}
/** Project Context is the parent-spec name for the discovery seam. */
export type ProjectContext = ProjectDiscovery;
export type { ProjectValidation };
/** Create the fixed, read-only loadCodeAssist project probe. */
export declare function createProjectDiscovery(options?: ProjectDiscoveryOptions): ProjectDiscovery;
/** Compatibility name used by the parent capability design. */
export declare const createProjectContext: typeof createProjectDiscovery;
/** Normalize the only project field that may cross into the credential store. */
export declare function normalizeProjectId(value: unknown): string | undefined;
//# sourceMappingURL=project-context.d.ts.map