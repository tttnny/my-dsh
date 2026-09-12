/** Shared race-safe registration lifecycle for one independently gated capability row. */
import type { Context } from '@deepseek-ai/cordis';
import type { AntigravityStatusView, CapabilityRowId } from './status.ts';
export interface CapabilityStatusSource {
    status(): Promise<AntigravityStatusView>;
    watchStatus?(listener: () => void): () => void;
    dispose?(): Promise<void>;
}
export interface CapabilityLifecycleOptions {
    readonly ctx: Context;
    readonly auth: CapabilityStatusSource;
    readonly id: CapabilityRowId;
    readonly enabled: () => boolean;
    readonly register: () => (() => void) | undefined;
    readonly ownsAuth?: boolean;
    readonly cleanup?: () => void | Promise<void>;
    readonly label: string;
}
export interface CapabilityLifecycle {
    sync(): void;
    refresh(): Promise<void>;
}
/** Register a capability set atomically and dispose every owned member best-effort. */
export declare function registerCapabilitySet<T>(values: readonly T[], register: (value: T) => () => void): () => void;
export declare function mountCapabilityLifecycle(options: CapabilityLifecycleOptions): CapabilityLifecycle;
//# sourceMappingURL=capability-lifecycle.d.ts.map