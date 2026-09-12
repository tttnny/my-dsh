/** One closed classifier shared by every capability's public error vocabulary. */
import type { CapabilityGateOutcome } from './status.ts';
export type PrivateFailureKind = 'authentication' | 'forbidden' | 'rate-limited' | 'cancelled' | 'timeout' | 'attribution-rejected' | 'protocol-drift' | 'response-limit' | 'request-limit' | 'upstream' | 'network' | 'failed';
export declare function classifyPrivateFailure(error: unknown): PrivateFailureKind;
export declare function capabilityOutcomeForError(error: unknown): Exclude<CapabilityGateOutcome, 'passed'>;
//# sourceMappingURL=private-failure.d.ts.map