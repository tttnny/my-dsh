/** Host dispatcher protected by the Antigravity account RPC activation guard. */
import type { ConnectionRpcResult as RpcResult } from '@deepseek-ai/dsh-client-connection';
import type { BootstrapStatusService } from './status.ts';
import type { QuotaStatusView } from './quota.ts';
import type { AntigravityModelCatalogService } from './model-catalog.ts';
export { ANTIGRAVITY_AUTH_RPC_CHANNEL, ANTIGRAVITY_AUTH_RPC_NAMESPACE } from './rpc-contract.ts';
/** Dispatch closed, value-safe requests; callback URLs are never echoed. */
export declare function handleAntigravityAuthRpc(service: Pick<BootstrapStatusService, 'status' | 'acknowledgeRisk' | 'startLogin' | 'cancelLogin' | 'completeCallback' | 'logout' | 'revoke'> & {
    usage?: (signal?: AbortSignal, force?: boolean) => Promise<QuotaStatusView>;
}, endpoint: string, payload: unknown, signal?: AbortSignal, modelCatalog?: AntigravityModelCatalogService): Promise<RpcResult<unknown>>;
//# sourceMappingURL=rpc.d.ts.map