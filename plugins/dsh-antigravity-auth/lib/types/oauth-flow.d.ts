/** Host-only PKCE, loopback callback, and token-exchange coordinator. */
import type { LoginCompletionResult, LoginErrorCode, LoginPhase, LoginStartResult } from './login-types.ts';
export declare const ANTIGRAVITY_CALLBACK_PORT: 51121;
export declare const ANTIGRAVITY_CALLBACK_PATH: "/oauth-callback";
export declare const ANTIGRAVITY_CALLBACK_HOSTS: readonly string[];
export declare const OAUTH_FLOW_TTL_MS: number;
export type OAuthErrorCode = LoginErrorCode;
export declare class OAuthFlowError extends Error {
    readonly code: OAuthErrorCode;
    constructor(code: OAuthErrorCode, message: string);
}
export interface OAuthToken {
    readonly accessToken: string;
    readonly refreshToken: string;
    readonly expiresAt: number;
    readonly email?: string;
}
export interface ProjectValidation {
    readonly projectId: string;
    readonly email?: string;
}
export interface ExchangeCodeInput {
    readonly code: string;
    readonly verifier: string;
    readonly signal: AbortSignal;
}
export type ExchangeCode = (input: ExchangeCodeInput) => Promise<OAuthToken>;
export type ValidateProject = (accessToken: string, signal: AbortSignal) => Promise<ProjectValidation | undefined>;
export type CommitCredential = (token: OAuthToken, project: ProjectValidation, signal: AbortSignal) => Promise<void>;
export interface LoopbackCallbackRequest {
    readonly method: string;
    readonly host?: string | undefined;
    /** A relative callback path/query for the loopback listener, or a full URL for tests. */
    readonly url: string;
}
export interface LoopbackCallbackResponse {
    readonly status: number;
    readonly headers: Readonly<Record<string, string>>;
    readonly body: string;
}
export type LoopbackCallbackHandler = (request: LoopbackCallbackRequest) => Promise<LoopbackCallbackResponse>;
export interface LoopbackListener {
    close(): Promise<void> | void;
}
export interface LoopbackListenerFactory {
    listen(handler: LoopbackCallbackHandler): Promise<LoopbackListener>;
}
export interface OAuthClock {
    now(): number;
    setTimeout(handler: () => void, delayMs: number): ReturnType<typeof setTimeout>;
    clearTimeout(handle: ReturnType<typeof setTimeout>): void;
}
export interface OAuthFlowOptions {
    readonly randomBytes?: (size: number) => Uint8Array;
    readonly clock?: OAuthClock;
    readonly ttlMs?: number;
    readonly listenerFactory?: LoopbackListenerFactory;
    readonly exchangeCode?: ExchangeCode;
    readonly validateProject?: ValidateProject;
    readonly commit?: CommitCredential;
    readonly fetchImpl?: typeof fetch;
}
export interface OAuthFlowStatus {
    readonly phase: LoginPhase;
    readonly authorizationUrl?: string;
    readonly expiresAt?: string;
    readonly errorCode?: OAuthErrorCode;
}
export type OAuthFlowCompletionResult = LoginCompletionResult;
export interface OAuthFlow {
    /** Current one-shot flow generation used to fence late commits. */
    generation(): number;
    start(): Promise<LoginStartResult>;
    status(): OAuthFlowStatus;
    completeCallbackUrl(callbackUrl: string): Promise<OAuthFlowCompletionResult>;
    cancel(): Promise<OAuthFlowStatus>;
    dispose(): Promise<void>;
}
/** Create one process-local, one-shot OAuth flow. */
export declare function createOAuthFlow(options?: OAuthFlowOptions): OAuthFlow;
/** Create the production loopback listener; it never binds a non-loopback address. */
export declare function createNodeLoopbackListenerFactory(): LoopbackListenerFactory;
/** Build the authorization URL without ever putting the verifier in browser state. */
export declare function buildAuthorizationUrl(state: string, verifier: string): string;
/** Testable Google token exchange; response bodies are parsed only in Host memory. */
export declare function createGoogleTokenExchanger(fetchImpl: typeof fetch, clock?: OAuthClock): ExchangeCode;
//# sourceMappingURL=oauth-flow.d.ts.map