/** Browser-safe, value-free RPC contract for the Antigravity login flow. */
import type { ConnectionRpcResult as RpcResult } from '@deepseek-ai/dsh-client-connection/client';
import type { AntigravityStatusView, LoginActionResult, LoginStartResult, RiskAcknowledgementResult } from './status.ts';
import { type LoginCompletionResult } from './login-types.ts';
import type { RevokeActionResult } from './credential-coordinator.ts';
import type { QuotaStatusView } from './quota.ts';
import { type AntigravityModelCatalogView } from './model-catalog.ts';
export declare const ANTIGRAVITY_AUTH_RPC_CHANNEL = "/api";
export declare const ANTIGRAVITY_AUTH_RPC_NAMESPACE: "antigravity-auth";
export interface AntigravityAuthRpcClient {
    status(signal?: AbortSignal): Promise<RpcResult<{
        status: AntigravityStatusView;
    }>>;
    acknowledgeRisk(signal?: AbortSignal): Promise<RpcResult<RiskAcknowledgementResult>>;
    login(signal?: AbortSignal): Promise<RpcResult<LoginStartResult>>;
    completeCallback?(callbackUrl: string, signal?: AbortSignal): Promise<RpcResult<LoginCompletionResult>>;
    cancelLogin(signal?: AbortSignal): Promise<RpcResult<LoginActionResult>>;
    logout(signal?: AbortSignal): Promise<RpcResult<{
        state: 'logged-out';
    }>>;
    revoke(signal?: AbortSignal): Promise<RpcResult<RevokeActionResult>>;
    models(signal?: AbortSignal, force?: boolean): Promise<RpcResult<AntigravityModelCatalogView>>;
    usage?(signal?: AbortSignal, force?: boolean): Promise<RpcResult<QuotaStatusView>>;
}
export interface AntigravityAuthConnectionRpc {
    call(channel: string, endpoint: string, payload: unknown, signal?: AbortSignal): Promise<RpcResult<unknown>>;
}
/** Build the browser face over the plugin-owned guarded account channel. */
export declare function createAntigravityAuthRpcClient(rpc: AntigravityAuthConnectionRpc): AntigravityAuthRpcClient;
/** Parse a closed, value-safe advisory model catalog received by the browser. */
export declare function parseModelCatalogResult(value: unknown): AntigravityModelCatalogView | undefined;
/** Parse a value-safe, normalized quota envelope received by the browser. */
export declare function parseUsageResult(value: unknown): QuotaStatusView | undefined;
/** Parse the closed status envelope received by the browser. */
export declare function parseStatusResult(value: unknown): AntigravityStatusView | undefined;
//# sourceMappingURL=rpc-contract.d.ts.map