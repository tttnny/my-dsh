/** Closed failure classification and persistence shared by live gate dispatch. */
import type { AntigravityAuthService } from './auth-service.ts';
import type { LiveGateId } from './live-gates.ts';
import type { CapabilityGateOutcome, LlmFamilyId } from './status.ts';
export declare function recordGateFailure(auth: AntigravityAuthService, gate: LiveGateId, outcome: Exclude<CapabilityGateOutcome, 'passed'>, family?: LlmFamilyId): Promise<void>;
export declare function classifyGate0Outcome(error: unknown): Exclude<CapabilityGateOutcome, 'passed'>;
export declare function classifyOutcome(error: unknown): Exclude<CapabilityGateOutcome, 'passed'>;
//# sourceMappingURL=live-gate-outcome.d.ts.map