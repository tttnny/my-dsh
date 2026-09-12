/** Value-free live-gate evidence used to keep capability registration honest. */
import { type CapabilityGateEvidence, type CapabilityGateOutcome, type CapabilityRowId, type LlmFamilyId } from './status.ts';
type PersistedCapabilityId = Exclude<CapabilityRowId, 'auth-llm'>;
export interface CapabilityGateRegistry {
    read(): Promise<CapabilityGateEvidence>;
    recordGate0(subject: string, outcome: CapabilityGateOutcome): Promise<CapabilityGateEvidence>;
    recordLlmFamily(subject: string, family: LlmFamilyId, outcome: CapabilityGateOutcome): Promise<CapabilityGateEvidence>;
    recordCapability(subject: string, id: PersistedCapabilityId, outcome: CapabilityGateOutcome): Promise<CapabilityGateEvidence>;
    clear(): Promise<void>;
}
export interface FileCapabilityGateOptions {
    readonly now?: () => number;
    /** Override process.platform only for deterministic cross-platform tests. */
    readonly platform?: NodeJS.Platform;
}
/** Resolve a gate record next to the plugin-owned auth record without reading either. */
export declare function defaultCapabilityGatePath(authStorePath: string): string;
export declare function createMemoryCapabilityGates(initial?: CapabilityGateEvidence, now?: () => number): CapabilityGateRegistry;
export declare function createFileCapabilityGates(path: string, options?: FileCapabilityGateOptions): CapabilityGateRegistry;
export {};
//# sourceMappingURL=capability-gates.d.ts.map