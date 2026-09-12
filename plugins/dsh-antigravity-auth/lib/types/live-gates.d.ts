/** Explicit, one-gate-at-a-time CLI boundary for live private endpoint verification. */
import { type CapabilityGateOutcome, type LlmFamilyId } from './status.ts';
export declare const LIVE_ACKNOWLEDGEMENT: "I_ACKNOWLEDGE_UNOFFICIAL_ANTIGRAVITY_PRIVATE_ENDPOINT_RISK";
export declare const LIVE_GATE_IDS: readonly ["A", "0L", "S", "I", "V"];
export type LiveGateId = (typeof LIVE_GATE_IDS)[number];
export interface LiveGateRunOptions {
    readonly videoFile?: string;
    readonly llmFamily?: LlmFamilyId;
}
export interface LiveGateResult {
    readonly gate: LiveGateId;
    readonly outcome: CapabilityGateOutcome;
}
export interface LiveGateRunner {
    run(gate: LiveGateId, options: LiveGateRunOptions): Promise<LiveGateResult>;
    dispose(): Promise<void>;
}
export interface LiveGateCliDependencies {
    readonly createRunner?: () => LiveGateRunner | Promise<LiveGateRunner>;
    readonly output?: (line: string) => void;
    readonly error?: (line: string) => void;
}
/** Parse and enforce opt-in before constructing anything that can read credentials or use the network. */
export declare function runLiveGateCli(argv: readonly string[], env?: Readonly<Record<string, string | undefined>>, dependencies?: LiveGateCliDependencies): Promise<number>;
//# sourceMappingURL=live-gates.d.ts.map