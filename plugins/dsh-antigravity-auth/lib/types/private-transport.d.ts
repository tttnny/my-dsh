/** Bounded Host-only transport primitives for the private Antigravity endpoints. */
import { PrivateTransportError } from './private-transport-error.ts';
export { PrivateTransportError } from './private-transport-error.ts';
export type { PrivateTransportErrorCode } from './private-transport-error.ts';
export declare const DEFAULT_PRIVATE_RESPONSE_HEADER_TIMEOUT_MS = 180000;
export declare const DEFAULT_PRIVATE_IDLE_TIMEOUT_MS = 60000;
export declare const DEFAULT_PRIVATE_TOTAL_TIMEOUT_MS = 300000;
export declare const DEFAULT_PRIVATE_RESPONSE_BYTES: number;
export declare const DEFAULT_PRIVATE_REQUEST_BYTES: number;
export declare const MAX_PRIVATE_REQUEST_BYTES: number;
export declare const DEFAULT_PRIVATE_FRAME_BYTES: number;
export interface PrivateTransportRequest {
    readonly url: string;
    readonly accessToken: string;
    readonly body: string | Uint8Array;
    readonly signal?: AbortSignal;
    readonly responseHeaderTimeoutMs?: number;
}
export interface PrivateTransportOptions {
    readonly responseHeaderTimeoutMs?: number;
    readonly maxRequestBytes?: number;
}
export interface PrivateTransport {
    request(input: PrivateTransportRequest): Promise<Response>;
}
/** Build one fixed raw private transport. Callers cannot supply headers, identity, or origins. */
export declare function createPrivateTransport(options?: PrivateTransportOptions): PrivateTransport;
/** Convert a bounded response status to a safe provider error without exposing its body. */
export declare function privateStatusError(status: number): PrivateTransportError | undefined;
export interface BoundedReadOptions {
    readonly signal?: AbortSignal;
    readonly idleTimeoutMs?: number;
    readonly totalTimeoutMs?: number;
    readonly maxBytes?: number;
}
/** Read a response body with byte, idle, total, and cancellation bounds. */
export declare function readPrivateBytes(response: Response, options?: BoundedReadOptions): Promise<Uint8Array>;
export declare function readPrivateText(response: Response, options?: BoundedReadOptions): Promise<string>;
export interface PrivateSseEvent {
    readonly data: string;
    readonly event?: string;
}
/** Parse SSE/JSON responses without retaining unbounded provider frames. */
export declare function iteratePrivateSse(response: Response, options?: BoundedReadOptions & {
    readonly maxFrameBytes?: number;
}): AsyncGenerator<PrivateSseEvent>;
export declare function assertPrivateEndpoint(url: string): void;
//# sourceMappingURL=private-transport.d.ts.map