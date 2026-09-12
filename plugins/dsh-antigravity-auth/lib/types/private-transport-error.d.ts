/** Shared redacted error vocabulary for private HTTP transport boundaries. */
export type PrivateTransportErrorCode = 'authentication' | 'forbidden' | 'rate-limited' | 'timeout' | 'offline' | 'cancelled' | 'response-too-large' | 'request-too-large' | 'frame-too-large' | 'invalid-response' | 'protocol-drift' | 'upstream' | 'attribution-rejected';
export declare class PrivateTransportError extends Error {
    readonly code: PrivateTransportErrorCode;
    readonly status?: number;
    /** Whether an upstream could have accepted the request before the failure. */
    readonly accepted: boolean;
    constructor(code: PrivateTransportErrorCode, message: string, options?: {
        readonly status?: number;
        readonly accepted?: boolean;
    });
}
//# sourceMappingURL=private-transport-error.d.ts.map