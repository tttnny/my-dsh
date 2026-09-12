import type { HostConnectionHandle, ConnectionRpcHandler } from '@deepseek-ai/dsh-client-connection';
/** Register exact routes without creating a separate physical RPC carrier. */
export declare function registerAccountRoutes(connection: HostConnectionHandle, namespace: string, endpoints: readonly string[], handler: ConnectionRpcHandler): () => Promise<void>;
//# sourceMappingURL=account-routes.d.ts.map