/**
 * The only identity seam for Antigravity private requests.
 *
 * The community transport snapshot owns the audited provider framing. This
 * module owns the provider headers that identify that framing and carries the
 * truthful DSH application identity in a plugin-owned secondary header. No
 * caller may supply, suppress, rename, or replace either identity.
 */
export declare const DSH_ATTRIBUTION_HEADER: "X-DeepSeek-Harness-Attribution";
export declare const AGY_PROVIDER_USER_AGENT: string;
export declare const ANTIGRAVITY_WIRE_ORIGIN: string;
export declare const ANTIGRAVITY_WIRE_ORIGINS: readonly string[];
export declare const ANTIGRAVITY_WIRE_PATHS: readonly string[];
export type WireHeaderPair = readonly [name: string, value: string];
export interface WireIdentityHeaders {
    readonly 'User-Agent': string;
    readonly [DSH_ATTRIBUTION_HEADER]: string;
}
export interface WireRequest {
    /** Host-only OAuth access token; it is never included in an error message. */
    readonly authorization: string;
    /** JSON request bytes. The community framing decides length vs chunked encoding. */
    readonly body: string | Uint8Array;
}
export declare class WireIdentityError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
/** Build the fixed provider identity plus the one required DSH carrier. */
export declare function buildWireIdentityHeaders(): WireIdentityHeaders;
export interface WireIdentity {
    /** The immutable provider and secondary attribution headers. */
    headers(): WireIdentityHeaders;
    /**
     * Build the exact header sequence used by the audited HTTP/1.1 framing.
     * The caller supplies only the endpoint, bearer value, and body; arbitrary
     * header injection is intentionally not part of this interface.
     */
    headerPairs(url: string, request: WireRequest): readonly WireHeaderPair[];
    /** Serialize the provider-fixed request as literal HTTP/1.1 bytes. */
    serialize(url: string, request: WireRequest): Uint8Array;
}
/** Create one immutable identity policy for all private operation callers. */
export declare function createWireIdentity(): WireIdentity;
/** Validate one complete, provider-fixed Wire Identity header set. */
export declare function assertWireIdentityInvariant(value: unknown): asserts value is WireIdentityHeaders;
//# sourceMappingURL=wire-identity.d.ts.map