/** Host half of the private Antigravity bootstrap capability bundle. */
import type { Context } from '@deepseek-ai/cordis';
import { type AntigravityMasterSettings } from './capability-master.ts';
export declare const name = "antigravity-auth";
export declare const inject: string[];
/** Mount the Host-only OAuth service, its guarded account RPC channel, and the master switch. */
export declare function apply(ctx: Context, config?: AntigravityMasterSettings): void;
export * from './auth-service.ts';
export * from './credential-coordinator.ts';
export * from './rpc-contract.ts';
export * from './status.ts';
export * from './project-context.ts';
export * from './wire-identity.ts';
export * from './llm-adapter.ts';
export * from './private-transport.ts';
export * from './replay.ts';
export * from './quota.ts';
export * from './media-admission.ts';
export * from './model-catalog.ts';
export * from './capability-gates.ts';
export * from './capability-master.ts';
export * from './live-gates.ts';
//# sourceMappingURL=index.d.ts.map